// Generates the valuation test workbooks. Run with Node 22.18+ / 24 (it strips types itself, no build step):
//
//   node scripts/fixtures/make-models.ts                  writes e2e/fixtures/model-small.xlsx (committed, a few KB)
//   node scripts/fixtures/make-models.ts --hostile <dir>  also writes hostile files into <dir> (never committed): a zip bomb, a sheet
//                                                         past the cell cap, a workbook with an external link, a macro file named .xlsx
//
// model-small.xlsx is a tiny made-up DCF, never a real broker file. It is written with SheetJS (as Excel-style cells with formula text,
// a saved value and a number format), and it has, on purpose:
//   - a deliberately stale saved value (Checks!B3), so the desk disagrees with the file;
//   - CUBEVALUE (Checks!B4), a function IronCalc does not compute (checked below against the installed engine, so the fixture cannot rot);
//   - TODAY() (Checks!B5), which differs by design; a two-cell loop (Checks!B6:B7); an INDIRECT (Checks!B8);
//   - a cell that agrees with Excel only because it reads the stale one (Checks!B9), to show taint.
// The saved values are computed here in plain arithmetic, independently of both engines.

import { deflateRawSync, crc32 } from "node:zlib";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as XLSX from "xlsx";

// Run from the repository root (`pnpm fixtures:models`). No import.meta here: the e2e specs import smallModel through Playwright's
// CommonJS loader, which cannot parse it.
const root = process.cwd();

type Cell = { t: "n" | "s" | "b"; v: number | string | boolean; f?: string; z?: string };
type Sheet = Record<string, Cell>;

const num = (v: number, z?: string, f?: string): Cell => ({ t: "n", v, ...(f ? { f } : {}), ...(z ? { z } : {}) });
const text = (v: string): Cell => ({ t: "s", v });

function toWorksheet(cells: Sheet): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxRow = 1;
  let maxCol = 0;
  for (const [addr, cell] of Object.entries(cells)) {
    ws[addr] = cell;
    const m = /^([A-Z]+)(\d+)$/.exec(addr)!;
    maxRow = Math.max(maxRow, Number(m[2]));
    maxCol = Math.max(maxCol, XLSX.utils.decode_col(m[1]));
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow - 1, c: maxCol } });
  return ws;
}

/** The fixture's assumptions (Assumptions!B1:B8). */
const SMALL = { r: 0.115, g: 0.04, margin: 0.2, tax: 0.25, growth: 0.08, netDebt: 120, shares: 10, base: 1000 };

/** The fixture's DCF in plain arithmetic, at a cost of equity `r` and a terminal growth `g`: the saved values come from here. */
function smallDcf(r: number, g: number) {
  const { margin, tax, growth, netDebt, shares, base } = SMALL;
  let revenue = base;
  const years: { revenue: number; ebit: number; flow: number; factor: number }[] = [];
  for (let year = 1; year <= 5; year++) {
    revenue *= 1 + growth;
    const ebit = revenue * margin;
    const flow = ebit * (1 - tax);
    years.push({ revenue, ebit, flow, factor: 1 / (1 + r) ** year });
  }
  const sumPv = years.map((y) => y.flow * y.factor).reduce((a, b) => a + b, 0);
  const terminal = (years[4].flow * (1 + g)) / (r - g);
  const pvTerminal = terminal * years[4].factor;
  const ev = sumPv + pvTerminal;
  const equity = ev - netDebt;
  return { years, sumPv, terminal, pvTerminal, ev, equity, perShare: equity / shares };
}

/** DCF!B13 ("Per-share result") of the fixture at these assumptions: what the desk's calculator must show (Task 3 e2e). */
export const smallPerShare = (r = SMALL.r, g = SMALL.g): number => smallDcf(r, g).perShare;

/** The fixture workbook. `tag` adds one unread text cell (Checks!A20), so an e2e run can upload bytes the desk has not seen. */
export function smallModel(tag?: string): Uint8Array {
  const { r, g, margin, tax, growth, netDebt, shares, base } = SMALL;
  const A: Sheet = {
    A1: text("Cost of equity"), B1: num(r, "0.0%"),
    A2: text("Terminal growth"), B2: num(g, "0.0%"),
    A3: text("EBIT margin"), B3: num(margin, "0.0%"),
    A4: text("Tax rate"), B4: num(tax, "0.0%"),
    A5: text("Revenue growth"), B5: num(growth, "0.0%"),
    A6: text("Net debt"), B6: num(netDebt, "#,##0"),
    A7: text("Shares (m)"), B7: num(shares, "0.0"),
    A8: text("Base revenue"), B8: num(base, "#,##0"),
  };

  // DCF: years 1..5 in B..F
  const cols = ["B", "C", "D", "E", "F"];
  const D: Sheet = { A1: text("Year"), A2: text("Revenue"), A3: text("EBIT"), A4: text("Free cash flow"), A5: text("Discount factor"), A6: text("PV of FCF") };
  const { years, sumPv, terminal, pvTerminal, ev, equity, perShare } = smallDcf(r, g);
  const fcf = years.map((y) => y.flow);
  cols.forEach((c, i) => {
    const { revenue, ebit, flow, factor } = years[i];
    D[`${c}1`] = num(i + 1);
    D[`${c}2`] = num(revenue, "#,##0.0", i === 0 ? "Assumptions!B8*(1+Assumptions!B5)" : `${cols[i - 1]}2*(1+Assumptions!B5)`);
    D[`${c}3`] = num(ebit, "#,##0.0", `${c}2*Assumptions!B3`);
    D[`${c}4`] = num(flow, "#,##0.0", `${c}3*(1-Assumptions!B4)`);
    D[`${c}5`] = num(factor, "0.0000", `1/(1+Assumptions!B1)^${c}1`);
    D[`${c}6`] = num(flow * factor, "#,##0.0", `${c}4*${c}5`);
  });
  D.A8 = text("Sum of PV"); D.B8 = num(sumPv, "#,##0.0", "SUM(B6:F6)");
  D.A9 = text("Terminal value"); D.B9 = num(terminal, "#,##0.0", "F4*(1+Assumptions!B2)/(Assumptions!B1-Assumptions!B2)");
  D.A10 = text("PV of terminal value"); D.B10 = num(pvTerminal, "#,##0.0", "B9*F5");
  D.A11 = text("Enterprise value"); D.B11 = num(ev, "#,##0.0", "B8+B10");
  D.A12 = text("Equity value"); D.B12 = num(equity, "#,##0.0", "B11-Assumptions!B6");
  D.A13 = text("Per-share result"); D.B13 = num(perShare, "#,##0.00", "B12/Assumptions!B7");

  // Checks: one of each thing the desk must handle
  const C: Sheet = {
    A1: text("NPV cross-check"), B1: num(sumPv, "#,##0.0", "NPV(Assumptions!B1,DCF!B4:F4)"),
    A2: text("Lookup, year 3 FCF"), B2: num(fcf[2], "#,##0.0", "INDEX(DCF!B4:F4,MATCH(3,DCF!B1:F1,0))"),
    A3: text("Stale on purpose"), B3: num(sumPv + 5, "#,##0.0", "DCF!B8*1"),
    A4: text("Not computed by the desk"), B4: num(42, undefined, 'CUBEVALUE("ThisWorkbookDataModel","x")'),
    A5: text("Today"), B5: num(46000, "0", "TODAY()"),
    A6: text("Loop"), B6: num(1, undefined, "B7+1"), B7: num(1, undefined, "B6+1"),
    A8: text("Indirect"), B8: num(sumPv, "#,##0.0", 'INDIRECT("B1")'),
    A9: text("Reads the stale cell"), B9: num(1, undefined, "IF(B3>0,1,0)"),
  };

  if (tag) C.A20 = text(`e2e copy ${tag}`);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, toWorksheet(A), "Assumptions");
  XLSX.utils.book_append_sheet(wb, toWorksheet(D), "DCF");
  XLSX.utils.book_append_sheet(wb, toWorksheet(C), "Checks");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer);
}

/** The installed IronCalc must not compute CUBEVALUE, or "unsupported" stops being tested; and the loop must be seen as a loop. */
function checkAgainstEngine(path: string): void {
  const { Model } = createRequire(join(root, "package.json"))("@ironcalc/nodejs") as typeof import("@ironcalc/nodejs");
  const m = Model.fromXlsx(path, "en", "Asia/Kolkata", "en");
  m.evaluate();
  const names = m.getWorksheetsProperties().map((p) => p.name);
  const at = names.indexOf("Checks");
  const unsupported = String(m.getCellValue(at, 4, 2));
  if (!/^#(NAME\?|N\/IMPL!?)$/.test(unsupported)) throw new Error("CUBEVALUE is now computed by IronCalc: pick another function for the fixture");
  if (String(m.getCellValue(at, 6, 2)) !== "#CIRC!") throw new Error("the loop is no longer reported as #CIRC!");
}

// ---- hostile files: minimal OOXML written by hand, with a small zip writer ------------------------------------------------------

type Part = { name: string; data: Uint8Array; method?: 0 | 8; declared?: number };

function zip(parts: Part[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const u16 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255]);
  const u32 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  for (const p of parts) {
    const name = Buffer.from(p.name);
    const method = p.method ?? 8;
    const data = Buffer.from(p.data);
    const body = method === 8 ? deflateRawSync(data) : data;
    const size = p.declared ?? data.length;
    const crc = crc32(data);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size), u16(name.length), u16(0), name, body]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(parts.length), u16(parts.length), u32(cd.length), u32(offset), u16(0)]);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const enc = (s: string) => new TextEncoder().encode(s);
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function minimal(sheetXml: string, opts: { workbookType?: string; extra?: Part[]; typesExtra?: string } = {}): Part[] {
  return [
    {
      name: "[Content_Types].xml",
      data: enc(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${opts.workbookType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${opts.typesExtra ?? ""}</Types>`,
      ),
    },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheetXml) },
    ...(opts.extra ?? []),
  ];
}

const sheet = (rows: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`;

export function hostile(): Record<string, Uint8Array> {
  const ok = sheet('<row r="1"><c r="A1"><v>1</v></c></row>');
  // 100,001 numeric cells over 1,001 rows.
  let rows = "";
  for (let r = 1; r <= 1001; r++) {
    let cells = "";
    for (let c = 1; c <= 100 && (r - 1) * 100 + c <= 100_001; c++) cells += `<c r="${XLSX.utils.encode_col(c - 1)}${r}"><v>${r}</v></c>`;
    rows += `<row r="${r}">${cells}</row>`;
  }
  return {
    // A sheet that inflates to 26 MB (over the 25 MB per-entry cap) and deflates to about 26 KB.
    "zip-bomb.xlsx": zip(minimal(ok, { extra: [{ name: "xl/worksheets/sheet2.xml", data: new Uint8Array(26 * 1024 * 1024) }] })),
    "too-many-cells.xlsx": zip(minimal(sheet(rows))),
    "external-link.xlsx": zip(minimal(ok, { extra: [{ name: "xl/externalLinks/externalLink1.xml", data: enc(`<externalLink xmlns="${NS}"/>`) }] })),
    "macro-renamed.xlsx": zip(
      minimal(ok, {
        workbookType: "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
        extra: [{ name: "xl/vbaProject.bin", data: new Uint8Array(64).fill(1) }],
        typesExtra: '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>',
      }),
    ),
  };
}

function main(): void {
  const out = join(root, "e2e", "fixtures", "model-small.xlsx");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, smallModel());
  checkAgainstEngine(out);
  console.log(`wrote ${out}`);
  const at = process.argv.indexOf("--hostile");
  if (at >= 0) {
    const dir = resolve(process.argv[at + 1] ?? "");
    if (!process.argv[at + 1]) throw new Error("--hostile needs a directory");
    mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of Object.entries(hostile())) {
      writeFileSync(join(dir, name), bytes);
      console.log(`wrote ${join(dir, name)} (${bytes.length} bytes)`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]).split("\\").join("/").endsWith("scripts/fixtures/make-models.ts")) main();
