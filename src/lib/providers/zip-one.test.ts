import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip } from "@/test/zip-builder";
import { unzipSingle, ZipError } from "./zip-one";

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
