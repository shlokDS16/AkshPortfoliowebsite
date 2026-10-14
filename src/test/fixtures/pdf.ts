import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The six-page annual report written by scripts/make-fixture-pdf.mjs: p. 4 a consolidated P&L, p. 5 a balance sheet. */
export const FIXTURE_PDF = resolve(__dirname, "../../../e2e/fixtures/annual-report.pdf");

/** A fresh copy each call: pdf.js takes ownership of the buffer it is given. */
export function fixturePdfBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PDF));
}

/** A text-only PDF with one page per entry (each entry its lines), built the way the fixture script builds it. */
export function makePdf(pages: string[][]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objs: string[] = [];
  const reserve = () => objs.push("");
  const set = (n: number, body: string) => void (objs[n - 1] = body);
  const catalog = reserve();
  const pagesNode = reserve();
  const font = reserve();
  set(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = pages.map((lines) => {
    const content = ["BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
    const stream = reserve();
    set(stream, `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const page = reserve();
    set(page, `<< /Type /Page /Parent ${pagesNode} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
    return page;
  });
  set(pagesNode, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  set(catalog, `<< /Type /Catalog /Pages ${pagesNode} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/**
 * The fixture with p. 2's page object replaced by a number, padded so every byte offset holds. pdf.js then reports two
 * pages and throws on reading p. 2: a page that cannot be read.
 */
export function fixtureWithBrokenPage2(): Uint8Array {
  const text = Buffer.from(fixturePdfBytes()).toString("latin1");
  const page2 = /7 0 obj\n(<< \/Type \/Page [^\n]*>>)\nendobj/.exec(text)?.[1];
  if (!page2) throw new Error("fixtureWithBrokenPage2: the fixture's p. 2 object was not found");
  return new Uint8Array(Buffer.from(text.replace(page2, "42".padEnd(page2.length, " ")), "latin1"));
}
