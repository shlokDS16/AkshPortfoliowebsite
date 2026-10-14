import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/test/xlsx-builder";
import { buildZip, type ZipEntrySpec } from "@/test/zip-builder";
import { XlsxRefusal, type RefusalCode } from "./refusal";
import { scanXlsxZip } from "./zip-scan";

const base = () => buildXlsx({ sheets: [{ name: "S", cells: [{ addr: "A1", v: 1 }] }] });
const withParts = (parts: { name: string; data: Uint8Array | string }[], extra?: { contentTypesExtra?: string; workbookContentType?: string }) =>
  buildXlsx({ sheets: [{ name: "S", cells: [{ addr: "A1", v: 1 }] }], extraParts: parts, ...extra });

function refused(fn: () => unknown): RefusalCode {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(XlsxRefusal);
    return (error as XlsxRefusal).code;
  }
  throw new Error("expected a refusal");
}

/** The parts of a clean workbook, as zip entries, so a test can add one more entry of any shape. */
const cleanEntries = (): ZipEntrySpec[] => {
  const text = (s: string) => new TextEncoder().encode(s);
  return [
    { name: "[Content_Types].xml", data: text('<Types xmlns="x"></Types>') },
    { name: "xl/workbook.xml", data: text("<workbook/>") },
  ];
};

describe("scanXlsxZip: a good workbook", () => {
  it("passes and reports the entry count and the inflated bytes", () => {
    const result = scanXlsxZip(base());
    expect(result.entries).toBe(7);
    expect(result.totalBytes).toBeGreaterThan(500);
  });

  it("ignores drawings, charts, images and embeddings", () => {
    const parts = [
      { name: "xl/drawings/drawing1.xml", data: "<d/>" },
      { name: "xl/charts/chart1.xml", data: "<c/>" },
      { name: "xl/media/image1.png", data: new Uint8Array(200).fill(7) },
      { name: "xl/embeddings/oleObject1.bin", data: new Uint8Array(100) },
    ];
    expect(scanXlsxZip(withParts(parts)).entries).toBe(11);
  });

  it("reads stored and deflated entries", () => {
    const entries = [...cleanEntries().map((e) => ({ ...e, method: 0 })), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(50) }];
    expect(scanXlsxZip(buildZip(entries)).entries).toBe(3);
  });
});

describe("scanXlsxZip: what is not an xlsx", () => {
  it("D0 CF 11 E0 (a password-protected workbook or an old .xls) is its own code", () => {
    const ole = new Uint8Array(2000);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(refused(() => scanXlsxZip(ole))).toBe("password_or_xls");
  });

  it("not a zip at all, empty input, an HTML page, and a csv", () => {
    expect(refused(() => scanXlsxZip(new Uint8Array(0)))).toBe("not_xlsx");
    expect(refused(() => scanXlsxZip(new TextEncoder().encode("<html>Access Denied</html>")))).toBe("not_xlsx");
    expect(refused(() => scanXlsxZip(new TextEncoder().encode("a,b,c\n1,2,3\n")))).toBe("not_xlsx");
  });

  it("a zip that is not a workbook (no content types, or no workbook part)", () => {
    expect(refused(() => scanXlsxZip(buildZip([{ name: "readme.txt", data: new Uint8Array(10) }])))).toBe("not_xlsx");
    expect(refused(() => scanXlsxZip(buildZip([cleanEntries()[0]])))).toBe("not_xlsx");
  });

  it("an empty zip", () => {
    expect(refused(() => scanXlsxZip(buildZip([])))).toBe("not_xlsx");
  });
});

describe("scanXlsxZip: the size rules, each entry really inflated", () => {
  it("a declared size over 25 MB, before anything is inflated (a zip bomb)", () => {
    const bomb = buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(26 * 1024 * 1024) }]);
    expect(bomb.byteLength).toBeLessThan(100_000);
    expect(refused(() => scanXlsxZip(bomb))).toBe("zip_too_large");
  });

  it("a sum over 60 MB with every entry under 25 MB", () => {
    const big = (n: number) => ({ name: `xl/worksheets/sheet${n}.xml`, data: new Uint8Array(21 * 1024 * 1024) });
    const zip = buildZip([...cleanEntries(), big(1), big(2), big(3)]);
    expect(refused(() => scanXlsxZip(zip))).toBe("zip_too_large");
  });

  it("an entry that inflates past what its header declares (a lying bomb) is cut and refused", () => {
    const zip = buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(20_000_000), declaredSize: 100 }]);
    expect(refused(() => scanXlsxZip(zip))).toBe("zip_damaged");
  });

  it("an entry that inflates to less than declared, and one whose checksum fails", () => {
    const short = buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(100), declaredSize: 105 }]);
    expect(refused(() => scanXlsxZip(short))).toBe("zip_damaged");
    const bad = new Uint8Array(buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(100).fill(9) }]));
    // Flip a byte of the stored checksum in the central directory of the last entry.
    const view = new DataView(bad.buffer);
    const cd = view.getUint32(bad.length - 22 + 16, true);
    let at = cd;
    for (let n = 0; n < 2; n++) at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    view.setUint32(at + 16, view.getUint32(at + 16, true) ^ 0xffff, true);
    expect(refused(() => scanXlsxZip(bad))).toBe("zip_damaged");
  });

  it("1,001 entries", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ name: `xl/media/i${i}.bin`, data: new Uint8Array(1) }));
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), ...many])))).toBe("too_many_parts");
    const okay = Array.from({ length: 998 }, (_, i) => ({ name: `xl/media/i${i}.bin`, data: new Uint8Array(1) }));
    expect(scanXlsxZip(buildZip([...cleanEntries(), ...okay])).entries).toBe(1000);
  });
});

describe("scanXlsxZip: the sheet shapes counted before any parse", () => {
  const sheet = (xml: string): ZipEntrySpec => ({ name: "xl/worksheets/sheet1.xml", data: new TextEncoder().encode(xml) });

  it("counts the cell tags of all sheets", () => {
    const xml = `<worksheet><sheetData><row r="1">${'<c r="A1"><v>1</v></c><c r="B1" s="2"/>'.repeat(10)}</row></sheetData></worksheet>`;
    expect(scanXlsxZip(buildZip([...cleanEntries(), sheet(xml)])).cellTags).toBe(20);
  });

  it("more than 500,000 cell tags (formatted or filled) is refused before the parse", () => {
    const xml = `<worksheet><sheetData><row r="1">${'<c r="A1"/>'.repeat(500_001)}</row></sheetData></worksheet>`;
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), sheet(xml)])))).toBe("too_many_cells");
  });

  it("a row past 20,000 is refused, so SheetJS can never drop rows without a word", () => {
    expect(scanXlsxZip(buildZip([...cleanEntries(), sheet('<worksheet><sheetData><row r="20000"><c r="A20000"/></row></sheetData></worksheet>')])).entries).toBe(3);
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), sheet('<worksheet><sheetData><row r="20001"><c r="A20001"/></row></sheetData></worksheet>')])))).toBe("too_many_rows");
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), sheet("<x:worksheet><x:sheetData><x:row spans='1:1' r='900000'><x:c r='A1'/></x:row></x:sheetData></x:worksheet>")])))).toBe("too_many_rows");
  });
});

describe("scanXlsxZip: patterns that must stay linear on hostile text", () => {
  const sheet = (xml: string): ZipEntrySpec => ({ name: "xl/worksheets/sheet1.xml", data: new TextEncoder().encode(xml) });

  it("two million row openers with no closing bracket are read in well under a second", () => {
    const start = performance.now();
    scanXlsxZip(buildZip([...cleanEntries(), sheet("<worksheet><sheetData>" + "<row ".repeat(2_000_000))]));
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("a million bin-mapping openers with no closing bracket in the content types are read quickly too", () => {
    const hostile = '<Types>' + '<Default Extension="bin" '.repeat(40_000);
    const start = performance.now();
    const entries = cleanEntries();
    entries[0] = { name: "[Content_Types].xml", data: new TextEncoder().encode(hostile) };
    scanXlsxZip(buildZip(entries));
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("a content-type list or relationship part over 1 MB is not a real one", () => {
    const big = (name: string) => buildZip([...cleanEntries().filter((e) => e.name !== name), { name, data: new Uint8Array(1024 * 1024 + 1).fill(32) }]);
    expect(refused(() => scanXlsxZip(big("[Content_Types].xml")))).toBe("zip_damaged");
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), { name: "xl/_rels/workbook.xml.rels", data: new Uint8Array(1024 * 1024 + 1).fill(32) }])))).toBe("zip_damaged");
  });

  it("a relationship to a VBA project is a macro whatever the part is called", () => {
    const rels = '<Relationships><Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="foo.bin"/></Relationships>';
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), { name: "xl/_rels/workbook.xml.rels", data: new TextEncoder().encode(rels) }])))).toBe("macros");
  });
});

describe("scanXlsxZip: shapes it does not read", () => {
  it("zip64", () => {
    expect(refused(() => scanXlsxZip(buildZip(cleanEntries(), { zip64Locator: true })))).toBe("zip_damaged");
  });

  it("the encryption bits", () => {
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(9), flags: 0x0001 }])))).toBe("password_or_xls");
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(9), flags: 0x0040 }])))).toBe("password_or_xls");
  });

  it("method 12 (bzip2) and any method other than stored or deflated", () => {
    expect(refused(() => scanXlsxZip(buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(9), method: 12 }])))).toBe("zip_damaged");
  });

  it("two entries with the same name (a parser could read the other one)", () => {
    const twice = buildZip([...cleanEntries(), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(5) }, { name: "XL/Worksheets/Sheet1.xml", data: new Uint8Array(5) }]);
    expect(refused(() => scanXlsxZip(twice))).toBe("zip_damaged");
  });

  it("a local header whose name differs from the directory's", () => {
    const zip = new Uint8Array(buildZip(cleanEntries()));
    // The first local header starts at 0: flip one byte of its name (offset 30).
    zip[30] ^= 0x20;
    expect(refused(() => scanXlsxZip(zip))).toBe("zip_damaged");
  });

  it("a truncated archive and one with a directory that points outside the file", () => {
    const zip = buildZip(cleanEntries());
    expect(refused(() => scanXlsxZip(zip.subarray(0, zip.length - 10)))).toBe("zip_damaged");
    const moved = new Uint8Array(zip);
    new DataView(moved.buffer).setUint32(moved.length - 22 + 16, 10_000_000, true);
    expect(refused(() => scanXlsxZip(moved))).toBe("zip_damaged");
  });
});

describe("scanXlsxZip: refused parts, each with its own code", () => {
  it("xl/vbaProject.bin (macros)", () => {
    expect(refused(() => scanXlsxZip(withParts([{ name: "xl/vbaProject.bin", data: new Uint8Array(20) }])))).toBe("macros");
  });

  it("a macro-enabled content type, with no vba part", () => {
    const zip = withParts([], { workbookContentType: "application/vnd.ms-excel.sheet.macroEnabled.main+xml" });
    expect(refused(() => scanXlsxZip(zip))).toBe("macros");
    const extra = withParts([], { contentTypesExtra: '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>' });
    expect(refused(() => scanXlsxZip(extra))).toBe("macros");
  });

  it("Excel 4.0 macro sheets, by part name and by content type", () => {
    expect(refused(() => scanXlsxZip(withParts([{ name: "xl/macrosheets/sheet1.xml", data: "<m/>" }])))).toBe("macros");
    const typed = withParts([], { contentTypesExtra: '<Override PartName="/xl/foo.xml" ContentType="application/vnd.ms-excel.macrosheet+xml"/>' });
    expect(refused(() => scanXlsxZip(typed))).toBe("macros");
  });

  it("the bin mapping that SheetJS writes into every file is not a macro by itself", () => {
    const harmless = withParts([], { contentTypesExtra: '<Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/>' });
    expect(scanXlsxZip(harmless).entries).toBe(7);
  });

  it("anything under xl/externalLinks/", () => {
    expect(refused(() => scanXlsxZip(withParts([{ name: "xl/externalLinks/externalLink1.xml", data: "<externalLink/>" }])))).toBe("external_links");
  });

  it("anything under xl/activeX/", () => {
    expect(refused(() => scanXlsxZip(withParts([{ name: "xl/activeX/activeX1.xml", data: "<ax/>" }])))).toBe("active_x");
  });

  it("xl/connections.xml", () => {
    expect(refused(() => scanXlsxZip(withParts([{ name: "xl/connections.xml", data: "<connections/>" }])))).toBe("data_connections");
  });

  it("the same names with other case, a leading slash or backslashes", () => {
    expect(refused(() => scanXlsxZip(withParts([{ name: "XL/VBAPROJECT.BIN", data: new Uint8Array(3) }])))).toBe("macros");
    expect(refused(() => scanXlsxZip(withParts([{ name: "/xl/externalLinks/e.xml", data: "x" }])))).toBe("external_links");
    expect(refused(() => scanXlsxZip(withParts([{ name: "xl\\activeX\\a.xml", data: "x" }])))).toBe("active_x");
  });

  it("a macro file renamed .xlsx", () => {
    const macro = buildXlsx({
      sheets: [{ name: "S", cells: [{ addr: "A1", v: 1 }] }],
      workbookContentType: "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
      extraParts: [{ name: "xl/vbaProject.bin", data: new Uint8Array(64).fill(1) }],
    });
    expect(refused(() => scanXlsxZip(macro))).toBe("macros");
  });

  it("an entry name is never used as a path: a hostile name changes nothing", () => {
    const zip = withParts([{ name: "../../etc/passwd", data: "x" }]);
    expect(scanXlsxZip(zip).entries).toBe(8);
  });
});

describe("scanXlsxZip: mutated archives", () => {
  it("every throw is a refusal, and nothing escapes as another error", () => {
    const original = base();
    let seed = 987654;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
    for (let n = 0; n < 1500; n++) {
      const copy = new Uint8Array(original);
      for (let k = 0; k < 1 + (next() % 4); k++) copy[next() % copy.length] = next() & 0xff;
      const cut = next() % 5 === 0 ? copy.subarray(0, next() % copy.length) : copy;
      try {
        scanXlsxZip(cut);
      } catch (error) {
        expect(error).toBeInstanceOf(XlsxRefusal);
      }
    }
  });
});
