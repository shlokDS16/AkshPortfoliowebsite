// Writes e2e/fixtures/annual-report.pdf: a six-page, text-only PDF for the ingestion tests. Run: node scripts/make-fixture-pdf.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const pages = [
  ["Kaveri Fixtures Limited", "Annual Report 2025-26"],
  ["Directors' Report", "The Board presents its report for the year."],
  ["Management Discussion and Analysis", "Demand improved in the second half of the year."],
  ["Consolidated Statement of Profit and Loss for the year ended March 31, 2026", "(Rs. in crore)",
    "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
    "Revenue from operations 1,284.00 1,102.00", "Finance costs 41.20 38.90", "Profit for the year 152.60 118.30"],
  ["Consolidated Balance Sheet as at March 31, 2026", "(Rs. in crore)", "Particulars As at March 31, 2026 As at March 31, 2025",
    "Trade receivables 210.40 188.10", "Inventories 305.00 251.70"],
  ["Notice of Annual General Meeting", "Notice is hereby given that the meeting will be held."],
];
const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const objs = [];
const reserve = () => objs.push(null); // returns the new object number
const set = (n, body) => { objs[n - 1] = body; };
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
const offsets = [];
objs.forEach((body, i) => {
  offsets.push(Buffer.byteLength(out, "latin1"));
  out += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(out, "latin1");
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
mkdirSync("e2e/fixtures", { recursive: true });
writeFileSync("e2e/fixtures/annual-report.pdf", Buffer.from(out, "latin1"));
