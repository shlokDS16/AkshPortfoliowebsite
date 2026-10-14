import "server-only";
import zlib, { inflateRawSync } from "node:zlib";
import { crc32Fallback } from "@/lib/providers/zip-one";
import { MAX_CELL_TAGS, MAX_SHEET_ROWS, ZIP_MAX_ENTRIES, ZIP_MAX_ENTRY_BYTES, ZIP_MAX_TOTAL_BYTES } from "./limits";
import { XlsxRefusal } from "./refusal";

// The multi-entry zip scanner that runs BEFORE any spreadsheet parser sees a byte (spec s4.3-s4.4). It applies the rules of
// src/lib/providers/zip-one.ts to every entry of the archive: sizes are bounded from the headers first and then again while
// inflating, so a lying header cannot get a bomb through; zip64, split archives, encryption and odd methods are refused; bytes that
// belong to no entry are refused. Entry names are only ever compared with fixed strings, never used as a path, and nothing read
// from the file reaches a message: a refusal carries a code and a fixed sentence.

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const CENTRAL_FIXED = 46;
const LOCAL_FIXED = 30;
const MAX_COMMENT = 0xffff;
const ENCRYPTED = 0x0001;
const STRONG_ENCRYPTION = 0x0040;

const builtinCrc32 = (zlib as unknown as { crc32?: (data: Uint8Array) => number }).crc32;
const checksum = (bytes: Uint8Array): number => (builtinCrc32 ? builtinCrc32(bytes) : crc32Fallback(bytes));

export type ZipScanResult = { entries: number; totalBytes: number; cellTags: number };

type Entry = { name: string; nameBytes: Uint8Array; method: number; crc: number; compressed: number; declared: number; start: number };

/** The first four bytes decide: a zip (PK 03 04), the old compound file that holds .xls and password-protected workbooks, or neither. */
function checkMagic(zip: Uint8Array): void {
  if (zip.byteLength < 4) throw new XlsxRefusal("not_xlsx");
  if (zip[0] === 0xd0 && zip[1] === 0xcf && zip[2] === 0x11 && zip[3] === 0xe0) throw new XlsxRefusal("password_or_xls");
  if (zip[0] !== 0x50 || zip[1] !== 0x4b || zip[2] !== 0x03 || zip[3] !== 0x04) throw new XlsxRefusal("not_xlsx");
}

function findEnd(view: DataView, length: number): number {
  const lowest = Math.max(0, length - EOCD_MIN - MAX_COMMENT);
  for (let at = length - EOCD_MIN; at >= lowest; at--) {
    if (view.getUint32(at, true) === EOCD_SIG && at + EOCD_MIN + view.getUint16(at + 20, true) === length) return at;
  }
  return -1;
}

const normalise = (name: string) => name.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();

const same = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);

function readEntries(zip: Uint8Array): Entry[] {
  const damaged = () => new XlsxRefusal("zip_damaged");
  if (zip.byteLength < EOCD_MIN) throw damaged();
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = findEnd(view, zip.byteLength);
  if (end < 0) throw damaged();
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIG) throw damaged();

  const disk = view.getUint16(end + 4, true);
  const cdDisk = view.getUint16(end + 6, true);
  const onThisDisk = view.getUint16(end + 8, true);
  const total = view.getUint16(end + 10, true);
  const cdSize = view.getUint32(end + 12, true);
  const cdOffset = view.getUint32(end + 16, true);
  if (disk !== 0 || cdDisk !== 0 || onThisDisk !== total) throw damaged();
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw damaged();
  if (total === 0) throw new XlsxRefusal("not_xlsx");
  if (total > ZIP_MAX_ENTRIES) throw new XlsxRefusal("too_many_parts");
  // The directory must end exactly where the end record starts: no bytes that belong to no entry.
  if (cdOffset + cdSize !== end) throw damaged();

  const entries: Entry[] = [];
  let at = cdOffset;
  let declaredSum = 0;
  for (let i = 0; i < total; i++) {
    if (at + CENTRAL_FIXED > end || view.getUint32(at, true) !== CENTRAL_SIG) throw damaged();
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const declared = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const next = at + CENTRAL_FIXED + nameLength + extraLength + commentLength;
    if (next > end) throw damaged();
    if ((flags & (ENCRYPTED | STRONG_ENCRYPTION)) !== 0) throw new XlsxRefusal("password_or_xls");
    if (method !== 0 && method !== 8) throw damaged();
    if (compressed === 0xffffffff || declared === 0xffffffff || localOffset === 0xffffffff) throw damaged();
    if (declared > ZIP_MAX_ENTRY_BYTES) throw new XlsxRefusal("zip_too_large");
    declaredSum += declared;
    if (declaredSum > ZIP_MAX_TOTAL_BYTES) throw new XlsxRefusal("zip_too_large");

    const nameBytes = zip.subarray(at + CENTRAL_FIXED, at + CENTRAL_FIXED + nameLength);
    if (localOffset + LOCAL_FIXED > cdOffset || view.getUint32(localOffset, true) !== LOCAL_SIG) throw damaged();
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = zip.subarray(localOffset + LOCAL_FIXED, localOffset + LOCAL_FIXED + localNameLength);
    if (!same(localName, nameBytes)) throw damaged();
    const start = localOffset + LOCAL_FIXED + localNameLength + localExtraLength;
    if (start + compressed > cdOffset) throw damaged();
    entries.push({ name: normalise(Buffer.from(nameBytes).toString("latin1")), nameBytes, method, crc, compressed, declared, start });
    at = next;
  }
  if (at !== end) throw damaged();

  // Two entries may not share data, and no name may appear twice (a parser could read the other one).
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].start + sorted[i - 1].compressed > sorted[i].start) throw damaged();
  if (new Set(entries.map((e) => e.name)).size !== entries.length) throw damaged();
  return entries;
}

/** Inflates one entry within its declared size and checks size and checksum; returns the bytes. */
function inflate(zip: Uint8Array, entry: Entry): Uint8Array {
  const data = zip.subarray(entry.start, entry.start + entry.compressed);
  let out: Uint8Array;
  if (entry.method === 0) {
    if (entry.compressed !== entry.declared) throw new XlsxRefusal("zip_damaged");
    out = data;
  } else {
    try {
      out = inflateRawSync(data, { maxOutputLength: Math.max(entry.declared, 1) });
    } catch {
      throw new XlsxRefusal("zip_damaged");
    }
  }
  if (out.byteLength !== entry.declared || checksum(out) !== entry.crc) throw new XlsxRefusal("zip_damaged");
  return out;
}

const CELL_TAG = /<(?:[A-Za-z0-9]+:)?c[ >/]/g;
const ROW_TAG = /<(?:[A-Za-z0-9]+:)?row\b[^>]*?\sr=["'](\d+)["']/g;

/**
 * A cheap look at one worksheet part before SheetJS parses it: how many cell tags it holds and whether any row lies past the row cap.
 * It bounds the parse (SheetJS drops rows past its own cap without saying so, and a sheet of two million empty cells is slow to parse
 * whatever the cell cap says) so that the later checks on the parsed result are checks, not the only defence.
 */
function countSheetShapes(bytes: Uint8Array, budget: number): number {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  let cells = 0;
  CELL_TAG.lastIndex = 0;
  while (CELL_TAG.exec(text) !== null) if (++cells > budget) break;
  ROW_TAG.lastIndex = 0;
  for (let m = ROW_TAG.exec(text); m !== null; m = ROW_TAG.exec(text)) if (Number(m[1]) > MAX_SHEET_ROWS) throw new XlsxRefusal("too_many_rows");
  return cells;
}

/** Throws XlsxRefusal unless the bytes are a plain xlsx archive of bounded size with none of the refused parts (s4.4). */
export function scanXlsxZip(zip: Uint8Array): ZipScanResult {
  checkMagic(zip);
  const entries = readEntries(zip);

  for (const { name } of entries) {
    if (name === "xl/vbaproject.bin") throw new XlsxRefusal("macros");
    if (name.startsWith("xl/activex/")) throw new XlsxRefusal("active_x");
    if (name.startsWith("xl/externallinks/")) throw new XlsxRefusal("external_links");
    if (name === "xl/connections.xml") throw new XlsxRefusal("data_connections");
  }
  const contentTypes = entries.find((e) => e.name === "[content_types].xml");
  if (!contentTypes || !entries.some((e) => e.name === "xl/workbook.xml")) throw new XlsxRefusal("not_xlsx");

  let totalBytes = 0;
  let cellTags = 0;
  for (const entry of entries) {
    const bytes = inflate(zip, entry);
    totalBytes += bytes.byteLength;
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)) {
      cellTags += countSheetShapes(bytes, MAX_CELL_TAGS);
      if (cellTags > MAX_CELL_TAGS) throw new XlsxRefusal("too_many_cells");
    }
    if (entry === contentTypes) {
      const types = Buffer.from(bytes).toString("latin1").toLowerCase();
      if (types.includes("macroenabled") || types.includes("vbaproject")) throw new XlsxRefusal("macros");
    }
  }
  return { entries: entries.length, totalBytes, cellTags };
}
