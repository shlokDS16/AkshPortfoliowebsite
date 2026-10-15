import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip, type ZipEntrySpec } from "@/test/zip-builder";
import { XlsxRefusal, type RefusalCode } from "./refusal";
import { scanXlsxZip } from "./zip-scan";

// Parser differentials: the scan must read the archive the way the parsers after it do, or a file can show the scan one thing and
// SheetJS another. SheetJS 0.20.3 (cfb parse_zip) takes the LAST end-of-directory signature in the file, trusts the LOCAL header's
// method, flags and sizes ("trust local file header instead of CD entry"), reads zip64 sizes from the extra fields, and finds the
// worksheet parts through the workbook's relationships (any part name). Review of Plan 2.7 Task 1, 2026-10-15.

const text = (s: string) => new TextEncoder().encode(s);
const clean = (): ZipEntrySpec[] => [
  { name: "[Content_Types].xml", data: text('<Types xmlns="x"></Types>') },
  { name: "xl/workbook.xml", data: text("<workbook/>") },
];

function refused(fn: () => unknown): RefusalCode {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(XlsxRefusal);
    return (error as XlsxRefusal).code;
  }
  throw new Error("expected a refusal");
}

/** A zip64 extended-information extra field (id 0x0001) claiming the given sizes. */
const zip64Extra = (size: number) => {
  const b = Buffer.alloc(20);
  b.writeUInt16LE(0x0001, 0);
  b.writeUInt16LE(16, 2);
  b.writeUInt32LE(size, 4);
  b.writeUInt32LE(size, 12);
  return new Uint8Array(b);
};

describe("scanXlsxZip: the local header must agree with the central directory", () => {
  // The stored bytes are a deflate stream of 4 MB of zeros. Stored, they pass size and checksum; a reader that trusts a local header
  // saying "deflated, size 0" inflates them without a bound (SheetJS does: a 200 KB file of this shape became 200 MB in memory).
  const bomb = deflateRawSync(Buffer.alloc(4 * 1024 * 1024));
  const sheet = (local: ZipEntrySpec["local"]): ZipEntrySpec => ({ name: "xl/worksheets/sheet1.xml", data: bomb, method: 0, local });

  it("a stored entry whose local header says deflated is refused (a zip bomb past the size rules)", () => {
    expect(scanXlsxZip(buildZip([...clean(), sheet(undefined)])).entries).toBe(3);
    expect(refused(() => scanXlsxZip(buildZip([...clean(), sheet({ method: 8, size: 0 })]))) ).toBe("zip_damaged");
    expect(refused(() => scanXlsxZip(buildZip([...clean(), sheet({ method: 8 })]))) ).toBe("zip_damaged");
  });

  it("local sizes or checksum that differ from the directory's are refused", () => {
    const entry = { name: "xl/worksheets/sheet1.xml", data: text("<worksheet/>") };
    expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, local: { size: 9_999_999 } }])))).toBe("zip_damaged");
    expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, local: { compressed: 3 } }])))).toBe("zip_damaged");
    expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, local: { crc: 1 } }])))).toBe("zip_damaged");
  });

  it("encryption bits in the local header alone are refused", () => {
    const entry = { name: "xl/worksheets/sheet1.xml", data: text("<worksheet/>") };
    for (const flags of [0x0001, 0x0040, 0x2000]) expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, local: { flags } }])))).not.toBe(undefined);
    expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, flags: 0x2000 }])))).toBe("password_or_xls");
  });

  it("a deflated entry with a data descriptor and zero local sizes (as some writers save) still passes", () => {
    const entry = { name: "xl/worksheets/sheet1.xml", data: text("<worksheet/>"), flags: 0x0008, local: { crc: 0, compressed: 0, size: 0 } };
    expect(scanXlsxZip(buildZip([...clean(), entry])).entries).toBe(3);
  });

  it("a zip64 size field in either header is refused, whatever the 32-bit sizes say", () => {
    const entry = { name: "xl/worksheets/sheet1.xml", data: text("<worksheet/>") };
    expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, centralExtra: zip64Extra(1 << 30) }])))).toBe("zip_damaged");
    expect(refused(() => scanXlsxZip(buildZip([...clean(), { ...entry, localExtra: zip64Extra(1 << 30) }])))).toBe("zip_damaged");
    const harmless = new Uint8Array([0x55, 0x54, 0x05, 0x00, 0x01, 0, 0, 0, 0]); // a timestamp field
    expect(scanXlsxZip(buildZip([...clean(), { ...entry, centralExtra: harmless, localExtra: harmless }])).entries).toBe(3);
  });
});

describe("scanXlsxZip: one end record only", () => {
  it("an end-of-directory signature inside the archive comment is refused (SheetJS would read the directory it points to)", () => {
    expect(scanXlsxZip(buildZip(clean(), { comment: "made by a writer" })).entries).toBe(2);
    const fake = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array<number>(30).fill(0)]);
    expect(refused(() => scanXlsxZip(buildZip(clean(), { comment: fake })))).toBe("zip_damaged");
    expect(refused(() => scanXlsxZip(buildZip(clean(), { comment: new Uint8Array([1, 2, 0x50, 0x4b, 0x05, 0x06]) })))).toBe("zip_damaged");
  });
});

describe("scanXlsxZip: sheet shapes are counted in every part, not only under xl/worksheets/", () => {
  // The workbook's relationships may point a sheet at any part name, and SheetJS follows them.
  it("a row past 20,000 in a part with another name", () => {
    const part = { name: "xl/data/s1.xml", data: text('<worksheet><sheetData><row r="20001"><c r="A20001"/></row></sheetData></worksheet>') };
    expect(refused(() => scanXlsxZip(buildZip([...clean(), part])))).toBe("too_many_rows");
  });

  it("more than 500,000 cell tags in a part with another name", () => {
    const part = { name: "xl/custom.bin", data: text(`<worksheet><sheetData><row r="1">${"<c/>".repeat(500_001)}</row></sheetData></worksheet>`) };
    expect(refused(() => scanXlsxZip(buildZip([...clean(), part])))).toBe("too_many_cells");
  });
});

describe("scanXlsxZip: refused relationships, whatever the part is called", () => {
  const rels = (type: string) => ({
    name: "xl/_rels/workbook.xml.rels",
    data: text(`<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="other/x.xml"/></Relationships>`),
  });

  it("an external link and a data connection named by type", () => {
    expect(refused(() => scanXlsxZip(buildZip([...clean(), rels("externalLink")])))).toBe("external_links");
    expect(refused(() => scanXlsxZip(buildZip([...clean(), rels("connections")])))).toBe("data_connections");
    expect(scanXlsxZip(buildZip([...clean(), rels("worksheet")])).entries).toBe(3);
  });
});
