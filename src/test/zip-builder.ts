import { crc32, deflateRawSync } from "node:zlib";

// Builds zip archives in memory for tests of the single-entry reader (src/lib/providers/zip-one.ts). Never a real NSE
// file: the repo is public and NSE forbids redistribution. Each knob exists to make one kind of hostile file.

export type ZipEntrySpec = {
  name?: string;
  data: Uint8Array;
  /** 0 stored, 8 deflated (the default). Any other number is written as given, with the data stored. */
  method?: number;
  /** General-purpose flag bits (bit 0 is encryption). */
  flags?: number;
  /** What the headers claim the uncompressed size is, when it should differ from the truth. */
  declaredSize?: number;
  /** Bytes to write as the compressed data instead of the real compression (a truncated or lying stream). */
  rawCompressed?: Uint8Array;
};

export type ZipOptions = { comment?: string; zip64Locator?: boolean; extraCentralBytes?: number };

const u16 = (n: number) => Buffer.from([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) => Buffer.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

export function buildZip(entries: ZipEntrySpec[], opts: ZipOptions = {}): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [index, e] of entries.entries()) {
    const name = Buffer.from(e.name ?? `entry-${index}.csv`);
    const method = e.method ?? 8;
    const data = Buffer.from(e.data);
    const body = e.rawCompressed ? Buffer.from(e.rawCompressed) : method === 8 ? deflateRawSync(data) : data;
    const flags = e.flags ?? 0;
    const crc = crc32(data);
    const size = e.declaredSize ?? data.length;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size),
      u16(name.length), u16(0), name, body,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat([...centrals, Buffer.alloc(opts.extraCentralBytes ?? 0)]);
  const comment = Buffer.from(opts.comment ?? "");
  const locator = opts.zip64Locator ? Buffer.concat([u32(0x07064b50), u32(0), u32(0), u32(0), u32(1)]) : Buffer.alloc(0);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cd.length), u32(offset), u16(comment.length), comment,
  ]);
  return new Uint8Array(Buffer.concat([...locals, cd, locator, eocd]));
}
