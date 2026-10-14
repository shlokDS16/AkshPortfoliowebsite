import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip } from "@/test/zip-builder";
import { crc32Fallback, unzipSingle, ZipError } from "./zip-one";

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("utf8");
const csv = new TextEncoder().encode("a,b\n1,2\n".repeat(200));

function refusal(fn: () => unknown): ZipError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ZipError);
    return error as ZipError;
  }
  throw new Error("expected a ZipError");
}

describe("unzipSingle: a good archive", () => {
  it("reads one deflated entry", () => {
    expect(text(unzipSingle(buildZip([{ data: csv }]), 1_000_000))).toBe(text(csv));
  });

  it("reads one stored entry", () => {
    expect(text(unzipSingle(buildZip([{ data: csv, method: 0 }]), 1_000_000))).toBe(text(csv));
  });

  it("reads an archive that carries a comment, and an empty entry", () => {
    expect(text(unzipSingle(buildZip([{ data: csv }], { comment: "made by a test" }), 1_000_000))).toBe(text(csv));
    expect(unzipSingle(buildZip([{ data: new Uint8Array(0) }]), 10).byteLength).toBe(0);
  });

  it("never uses the entry name: a hostile name changes nothing", () => {
    const out = unzipSingle(buildZip([{ name: "../../etc/passwd", data: csv }]), 1_000_000);
    expect(text(out)).toBe(text(csv));
  });
});

describe("unzipSingle: refusals, each with its own code", () => {
  it("two entries", () => {
    const zip = buildZip([{ data: csv }, { data: csv }]);
    expect(refusal(() => unzipSingle(zip, 1_000_000)).code).toBe("multi_entry");
  });

  it("no entry", () => {
    expect(refusal(() => unzipSingle(buildZip([]), 1_000_000)).code).toBe("multi_entry");
  });

  it("the encryption bit", () => {
    expect(refusal(() => unzipSingle(buildZip([{ data: csv, flags: 0x0001 }]), 1_000_000)).code).toBe("encrypted");
    expect(refusal(() => unzipSingle(buildZip([{ data: csv, flags: 0x0040 }]), 1_000_000)).code).toBe("encrypted");
  });

  it("a method other than stored or deflated", () => {
    expect(refusal(() => unzipSingle(buildZip([{ data: csv, method: 12 }]), 1_000_000)).code).toBe("unsupported");
  });

  it("a zip64 archive", () => {
    expect(refusal(() => unzipSingle(buildZip([{ data: csv }], { zip64Locator: true }), 1_000_000)).code).toBe("unsupported");
  });

  it("a declared size over the cap, before anything is inflated (a zip bomb)", () => {
    const bomb = buildZip([{ data: new Uint8Array(20_000_000) }]);
    expect(bomb.byteLength).toBeLessThan(100_000);
    expect(refusal(() => unzipSingle(bomb, 1_000_000)).code).toBe("too_large");
  });

  it("a stream that inflates past what it declared (a lying bomb), cut while inflating", () => {
    const zip = buildZip([{ data: new Uint8Array(20_000_000), declaredSize: 100 }]);
    expect(refusal(() => unzipSingle(zip, 1_000_000)).code).toBe("corrupt");
  });

  it("a stream that inflates to less than it declared", () => {
    const zip = buildZip([{ data: csv, declaredSize: csv.length + 5 }]);
    expect(refusal(() => unzipSingle(zip, 1_000_000)).code).toBe("corrupt");
  });

  it("stored data larger than the cap", () => {
    expect(refusal(() => unzipSingle(buildZip([{ data: csv, method: 0 }]), 100)).code).toBe("too_large");
  });

  it("data whose checksum does not match", () => {
    const flipped = new Uint8Array(csv);
    flipped[3] ^= 0xff;
    const zip = buildZip([{ data: csv, rawCompressed: deflateRawSync(flipped) }]);
    expect(refusal(() => unzipSingle(zip, 1_000_000)).code).toBe("corrupt");
  });

  it("a truncated archive (the end record is gone)", () => {
    const zip = buildZip([{ data: csv }]);
    expect(refusal(() => unzipSingle(zip.subarray(0, zip.length - 10), 1_000_000)).code).toBe("truncated");
    expect(refusal(() => unzipSingle(zip.subarray(0, 30), 1_000_000)).code).toBe("truncated");
  });

  it("an archive with bytes missing from the middle, so its directory points past the data", () => {
    const zip = buildZip([{ data: csv, method: 0 }]);
    const cut = Buffer.concat([zip.subarray(0, 60), zip.subarray(100)]);
    expect(refusal(() => unzipSingle(new Uint8Array(cut), 1_000_000)).code).toMatch(/truncated|corrupt/);
  });

  it("not a zip at all, empty input, and an HTML page", () => {
    expect(refusal(() => unzipSingle(new Uint8Array(0), 1_000_000)).code).toBe("not_zip");
    expect(refusal(() => unzipSingle(new TextEncoder().encode("<html>Access Denied</html>".repeat(5)), 1_000_000)).code).toBe("not_zip");
  });

  it("a deflate stream that is garbage", () => {
    const zip = buildZip([{ data: csv, rawCompressed: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]) }]);
    expect(refusal(() => unzipSingle(zip, 1_000_000)).code).toBe("corrupt");
  });

  it("a directory with bytes that belong to no entry", () => {
    expect(refusal(() => unzipSingle(buildZip([{ data: csv }], { extraCentralBytes: 8 }), 1_000_000)).code).toBe("multi_entry");
  });
});

/** Offsets in an archive built with one entry and no comment: the end record is the last 22 bytes. */
function edit(zip: Uint8Array, fn: (view: DataView, at: { eocd: number; cd: number }) => void): Uint8Array {
  const copy = new Uint8Array(zip);
  const view = new DataView(copy.buffer);
  const eocd = copy.length - 22;
  fn(view, { eocd, cd: view.getUint32(eocd + 16, true) });
  return copy;
}

describe("unzipSingle: more hostile shapes (review)", () => {
  const good = () => buildZip([{ data: csv }]);

  it("all-ones zip64 fields in the end record and in the directory entry", () => {
    for (const change of [
      (v: DataView, a: { eocd: number }) => v.setUint16(a.eocd + 10, 0xffff, true),
      (v: DataView, a: { eocd: number }) => v.setUint32(a.eocd + 12, 0xffffffff, true),
      (v: DataView, a: { eocd: number }) => v.setUint32(a.eocd + 16, 0xffffffff, true),
      (v: DataView, a: { cd: number }) => v.setUint32(a.cd + 20, 0xffffffff, true),
      (v: DataView, a: { cd: number }) => v.setUint32(a.cd + 24, 0xffffffff, true),
      (v: DataView, a: { cd: number }) => v.setUint32(a.cd + 42, 0xffffffff, true),
    ]) {
      expect(refusal(() => unzipSingle(edit(good(), change), 1_000_000)).code).toMatch(/unsupported|multi_entry/);
    }
  });

  it("a non-zero disk number and a split archive", () => {
    expect(refusal(() => unzipSingle(edit(good(), (v, a) => v.setUint16(a.eocd + 4, 1, true)), 1_000_000)).code).toBe("unsupported");
    expect(refusal(() => unzipSingle(edit(good(), (v, a) => v.setUint16(a.eocd + 6, 2, true)), 1_000_000)).code).toBe("unsupported");
  });

  it("a directory or an entry offset that points outside the file", () => {
    expect(refusal(() => unzipSingle(edit(good(), (v, a) => v.setUint32(a.eocd + 16, 10_000_000, true)), 1_000_000)).code).toBe("truncated");
    expect(refusal(() => unzipSingle(edit(good(), (v, a) => v.setUint32(a.cd + 42, 10_000_000, true)), 1_000_000)).code).toBe("truncated");
    expect(refusal(() => unzipSingle(edit(good(), (v, a) => v.setUint32(a.cd + 20, 10_000_000, true)), 1_000_000)).code).toBe("truncated");
  });

  it("a local name length that lies", () => {
    const lying = edit(good(), (v) => v.setUint16(26, 60_000, true));
    expect(refusal(() => unzipSingle(lying, 1_000_000)).code).toMatch(/truncated|corrupt/);
  });

  it("reads an archive that uses a data descriptor (bit 3) with a zeroed local header", () => {
    const zip = edit(buildZip([{ data: csv, flags: 0x0008 }]), (v) => {
      v.setUint32(14, 0, true);
      v.setUint32(18, 0, true);
      v.setUint32(22, 0, true);
    });
    expect(text(unzipSingle(zip, 1_000_000))).toBe(text(csv));
  });

  it("reads an input that is a view into a larger buffer at a non-zero offset", () => {
    const zip = good();
    const big = new Uint8Array(zip.length + 100).fill(0x41);
    big.set(zip, 37);
    expect(text(unzipSingle(big.subarray(37, 37 + zip.length), 1_000_000))).toBe(text(csv));
  });

  it("bytes before the archive or after its end record are a typed refusal, not a read", () => {
    const zip = good();
    const trailing = new Uint8Array([...zip, 1, 2, 3]);
    expect(refusal(() => unzipSingle(trailing, 1_000_000)).code).toMatch(/not_zip|truncated/);
    const prefixed = new Uint8Array([9, 9, 9, ...zip]);
    expect(() => unzipSingle(prefixed, 1_000_000)).toThrow(ZipError);
  });

  it("a fake end record inside the comment is skipped unless it ends the file exactly", () => {
    const fake = buildZip([{ data: new Uint8Array(4) }, { data: new Uint8Array(4) }]);
    const comment = (extra: string) => Buffer.from([...fake]).toString("latin1") + extra;
    expect(text(unzipSingle(buildZip([{ data: csv }], { comment: comment("xx") }), 1_000_000))).toBe(text(csv));
    // Aligned with the end of the file it IS the last end record, as in every zip reader: here it describes two entries.
    expect(refusal(() => unzipSingle(buildZip([{ data: csv }], { comment: comment("") }), 1_000_000)).code).toBe("multi_entry");
  });

  it("every throw on mutated archives is a ZipError, and nothing exceeds the cap", () => {
    const base = good();
    let seed = 12345;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
    for (let n = 0; n < 4000; n++) {
      const copy = new Uint8Array(base);
      for (let k = 0; k < 1 + (next() % 4); k++) copy[next() % copy.length] = next() & 0xff;
      const cut = next() % 5 === 0 ? copy.subarray(0, next() % copy.length) : copy;
      try {
        expect(unzipSingle(cut, 100_000).byteLength).toBeLessThanOrEqual(100_000);
      } catch (error) {
        expect(error).toBeInstanceOf(ZipError);
      }
    }
  });
});

describe("crc32Fallback (for a Node without zlib.crc32)", () => {
  it("equals the built-in on empty, short, text and random inputs", () => {
    const random = new Uint8Array(5000).map((_, i) => (i * 7919 + (i >> 3)) & 0xff);
    for (const input of [new Uint8Array(0), new TextEncoder().encode("123456789"), csv, random]) {
      expect(crc32Fallback(input)).toBe(crc32(input));
    }
    expect(crc32Fallback(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
