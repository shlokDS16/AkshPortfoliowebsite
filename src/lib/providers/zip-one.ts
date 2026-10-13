import { crc32, inflateRawSync } from "node:zlib";

// A reader for a zip archive that holds exactly one file, on node:zlib (no dependency). The bytes come from the network, so
// the reader assumes a hostile file: the sizes are bounded before anything is inflated and again while inflating, and the
// entry's name is never read as a path (it is not read at all). Anything the reader does not fully understand is refused
// with a code, never guessed at: more than one entry, encryption, zip64, a method other than stored or deflated, a short file.

export type ZipErrorCode = "not_zip" | "truncated" | "multi_entry" | "encrypted" | "unsupported" | "too_large" | "corrupt";

export class ZipError extends Error {
  constructor(readonly code: ZipErrorCode, message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const CENTRAL_FIXED = 46;
const LOCAL_FIXED = 30;
/** The end record can be followed by a comment of at most 65,535 bytes. */
const MAX_COMMENT = 0xffff;
const ENCRYPTED = 0x0001;
const STRONG_ENCRYPTION = 0x0040;

/** The end-of-central-directory record: the last place its signature appears with a comment length that reaches the end. */
function findEnd(view: DataView, length: number): number {
  const lowest = Math.max(0, length - EOCD_MIN - MAX_COMMENT);
  for (let at = length - EOCD_MIN; at >= lowest; at--) {
    if (view.getUint32(at, true) === EOCD_SIG && at + EOCD_MIN + view.getUint16(at + 20, true) === length) return at;
  }
  return -1;
}

/** One deflated (method 8) or stored (method 0) entry; anything else throws ZipError. maxBytes bounds the output. */
export function unzipSingle(zip: Uint8Array, maxBytes: number): Uint8Array {
  if (zip.byteLength < EOCD_MIN) throw new ZipError(zip.byteLength === 0 ? "not_zip" : "truncated", "too short to be a zip file");
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = findEnd(view, zip.byteLength);
  if (end < 0) {
    // A real zip that lost its tail still starts with a local header; anything else is not a zip.
    throw new ZipError(view.getUint32(0, true) === LOCAL_SIG ? "truncated" : "not_zip", "no end-of-directory record");
  }
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIG) throw new ZipError("unsupported", "zip64 archives are not read");

  const disk = view.getUint16(end + 4, true);
  const cdDisk = view.getUint16(end + 6, true);
  const onThisDisk = view.getUint16(end + 8, true);
  const total = view.getUint16(end + 10, true);
  const cdSize = view.getUint32(end + 12, true);
  const cdOffset = view.getUint32(end + 16, true);
  if (disk !== 0 || cdDisk !== 0 || onThisDisk !== total) throw new ZipError("unsupported", "split archives are not read");
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("unsupported", "zip64 archives are not read");
  if (total !== 1) throw new ZipError("multi_entry", "the archive must hold exactly one file");
  if (cdOffset + cdSize > end) throw new ZipError("truncated", "the directory lies outside the file");
  if (cdSize < CENTRAL_FIXED || view.getUint32(cdOffset, true) !== CENTRAL_SIG) throw new ZipError("corrupt", "bad directory entry");

  const flags = view.getUint16(cdOffset + 8, true);
  const method = view.getUint16(cdOffset + 10, true);
  const crc = view.getUint32(cdOffset + 16, true);
  const compressedSize = view.getUint32(cdOffset + 20, true);
  const declaredSize = view.getUint32(cdOffset + 24, true);
  const nameLength = view.getUint16(cdOffset + 28, true);
  const extraLength = view.getUint16(cdOffset + 30, true);
  const commentLength = view.getUint16(cdOffset + 32, true);
  const localOffset = view.getUint32(cdOffset + 42, true);

  // The directory must be exactly this one entry: bytes that belong to no entry could be a second one we did not count.
  if (CENTRAL_FIXED + nameLength + extraLength + commentLength !== cdSize) throw new ZipError("multi_entry", "the directory holds more than one entry");
  if ((flags & (ENCRYPTED | STRONG_ENCRYPTION)) !== 0) throw new ZipError("encrypted", "encrypted archives are not read");
  if (method !== 0 && method !== 8) throw new ZipError("unsupported", `compression method ${method} is not read`);
  if (compressedSize === 0xffffffff || declaredSize === 0xffffffff || localOffset === 0xffffffff) throw new ZipError("unsupported", "zip64 archives are not read");
  // The declared size is a claim, not a fact; it is checked here against the cap and again against what inflation produces.
  if (declaredSize > maxBytes) throw new ZipError("too_large", "the file inside is larger than the allowed size");

  if (localOffset + LOCAL_FIXED > cdOffset || view.getUint32(localOffset, true) !== LOCAL_SIG) throw new ZipError("truncated", "the file entry is missing");
  const start = localOffset + LOCAL_FIXED + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
  if (start + compressedSize > cdOffset) throw new ZipError("truncated", "the file entry is cut short");
  const data = zip.subarray(start, start + compressedSize);

  let out: Uint8Array;
  if (method === 0) {
    if (compressedSize !== declaredSize) throw new ZipError("corrupt", "a stored entry whose sizes disagree");
    out = data;
  } else {
    try {
      // maxOutputLength is the declared size: a stream that has more to give than it promised is cut off there.
      out = inflateRawSync(data, { maxOutputLength: Math.max(declaredSize, 1) });
    } catch {
      throw new ZipError("corrupt", "the compressed data could not be read, or inflates past its declared size");
    }
  }
  if (out.byteLength !== declaredSize) throw new ZipError("corrupt", "the file is not the size it declares");
  if (crc32(out) !== crc) throw new ZipError("corrupt", "the file fails its checksum");
  return out;
}
