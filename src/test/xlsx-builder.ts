import { buildZip, type ZipEntrySpec } from "./zip-builder";

// Builds .xlsx files from plain data, in memory, for the tests and fixtures of the valuation module. It writes the OOXML by hand
// (not through a spreadsheet library) so a test can make shapes a library would refuse to write: a formula with no saved value, a
// shared formula, an array formula, a 1904 workbook, an external link, a macro part, an external defined name. Never a real
// broker file: the repo is public.

export type CellSpec = {
  /** A1-style address. */
  addr: string;
  /** The saved value: a number, a string, a boolean, or an error text such as "#DIV/0!" when `t` is "e". Omit it for a formula with no saved value. */
  v?: number | string | boolean;
  /** Formula text without the leading "=". */
  f?: string;
  /** Value type; inferred from `v` when omitted. */
  t?: "n" | "s" | "b" | "e";
  /** Number format code, for example "0.0%". */
  fmt?: string;
  /** Shared formula: the first cell of the group carries `f` and `ref`; the others carry only `si`. */
  shared?: { si: number; ref?: string };
  /** Array formula over this range (the anchor cell carries `f`). */
  array?: string;
  /** An Excel data table (What-If Analysis): the attributes of the `<f t="dataTable" .../>` element, for example 'ref="B2:C3" dt2D="1" dtr="1" r1="A1" r2="A2"'. */
  dataTable?: string;
};

export type SheetSpec = { name: string; cells: CellSpec[] };
export type DefinedNameSpec = { name: string; ref: string; localSheetId?: number };
export type XlsxSpec = {
  sheets: SheetSpec[];
  definedNames?: DefinedNameSpec[];
  date1904?: boolean;
  /** Extra zip parts (name, bytes or text), for hostile shapes: xl/vbaProject.bin, xl/externalLinks/externalLink1.xml, ... */
  extraParts?: { name: string; data: Uint8Array | string }[];
  /** Extra <Override> / <Default> entries for [Content_Types].xml. */
  contentTypesExtra?: string;
  /** Replaces the workbook part's content type (a macro-enabled one). */
  workbookContentType?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bytes = (s: string) => new TextEncoder().encode(s);

export function colLetters(n: number): string {
  let out = "";
  for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) out = String.fromCharCode(65 + ((c - 1) % 26)) + out;
  return out;
}

function splitAddr(addr: string): { col: number; row: number } {
  const m = /^([A-Z]+)([0-9]+)$/.exec(addr);
  if (!m) throw new Error(`bad address ${addr}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}

export function buildXlsx(spec: XlsxSpec): Uint8Array {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const sst = (s: string) => {
    let i = stringIndex.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      stringIndex.set(s, i);
    }
    return i;
  };
  const formats: string[] = [];
  const xfFor = (fmt: string | undefined) => {
    if (!fmt || fmt === "General") return 0;
    let i = formats.indexOf(fmt);
    if (i < 0) i = formats.push(fmt) - 1;
    return i + 1;
  };

  const sheetXml = spec.sheets.map((sheet) => {
    const rows = new Map<number, { col: number; xml: string }[]>();
    for (const cell of sheet.cells) {
      const { col, row } = splitAddr(cell.addr);
      const type = cell.t ?? (typeof cell.v === "string" ? "s" : typeof cell.v === "boolean" ? "b" : "n");
      const s = xfFor(cell.fmt);
      let attrs = `r="${cell.addr}"${s ? ` s="${s}"` : ""}`;
      let inner = "";
      if (cell.dataTable) {
        inner += `<f t="dataTable" ${cell.dataTable}/>`;
        if (cell.v !== undefined) inner += `<v>${esc(String(cell.v))}</v>`;
      } else if (cell.f !== undefined || cell.shared || cell.array) {
        const shared = cell.shared ? ` t="shared" si="${cell.shared.si}"${cell.shared.ref ? ` ref="${cell.shared.ref}"` : ""}` : "";
        const array = cell.array ? ` t="array" ref="${cell.array}"` : "";
        inner += cell.f !== undefined || !cell.shared ? `<f${shared}${array}>${esc(cell.f ?? "")}</f>` : `<f${shared}/>`;
        if (cell.v !== undefined) {
          if (type === "s") attrs += ` t="str"`;
          else if (type === "b") attrs += ` t="b"`;
          else if (type === "e") attrs += ` t="e"`;
          inner += `<v>${esc(type === "b" ? (cell.v ? "1" : "0") : String(cell.v))}</v>`;
        }
      } else if (cell.v !== undefined) {
        if (type === "s") {
          attrs += ` t="s"`;
          inner = `<v>${sst(String(cell.v))}</v>`;
        } else if (type === "b") {
          attrs += ` t="b"`;
          inner = `<v>${cell.v ? 1 : 0}</v>`;
        } else if (type === "e") {
          attrs += ` t="e"`;
          inner = `<v>${esc(String(cell.v))}</v>`;
        } else inner = `<v>${cell.v}</v>`;
      }
      const list = rows.get(row) ?? [];
      list.push({ col, xml: `<c ${attrs}>${inner}</c>` });
      rows.set(row, list);
    }
    const body = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, cells]) => `<row r="${r}">${cells.sort((a, b) => a.col - b.col).map((c) => c.xml).join("")}</row>`)
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  });

  const names = (spec.definedNames ?? [])
    .map((n) => `<definedName name="${esc(n.name)}"${n.localSheetId !== undefined ? ` localSheetId="${n.localSheetId}"` : ""}>${esc(n.ref)}</definedName>`)
    .join("");
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<workbookPr${spec.date1904 ? ` date1904="1"` : ""}/><sheets>` +
    spec.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets>${names ? `<definedNames>${names}</definedNames>` : ""}</workbook>`;
  const n = spec.sheets.length;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    spec.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (formats.length ? `<numFmts count="${formats.length}">${formats.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>` : "") +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${formats.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    formats.map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("") +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const sharedStrings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("") +
    `</sst>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${spec.workbookContentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"}"/>` +
    spec.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    (spec.contentTypesExtra ?? "") +
    `</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const entries: ZipEntrySpec[] = [
    { name: "[Content_Types].xml", data: bytes(contentTypes) },
    { name: "_rels/.rels", data: bytes(rootRels) },
    { name: "xl/workbook.xml", data: bytes(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: bytes(rels) },
    { name: "xl/styles.xml", data: bytes(styles) },
    { name: "xl/sharedStrings.xml", data: bytes(sharedStrings) },
    ...sheetXml.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: bytes(xml) })),
    ...(spec.extraParts ?? []).map((p) => ({ name: p.name, data: typeof p.data === "string" ? bytes(p.data) : p.data })),
  ];
  return buildZip(entries);
}
