// Writes e2e/fixtures/annual-report.pdf: a six-page, text-only PDF for the ingestion tests. Run: node scripts/make-fixture-pdf.mjs
// The e2e specs import makeFixturePdf(nonce) for a copy with a "Run <nonce>" line on page 1, so every run has its own hash
// (documents.sha256 is unique and the local database is not reset). Without a nonce the bytes are the committed file's.
// makeFixturePdf(nonce, { scan: true }) is a one-page scanned report: an image and the "Run <nonce>" line, under 50 characters
// of text, so the page is a scan (document_pages.is_scan) and goes to the scan reader (Plan 2b Task 2).
import { mkdirSync, writeFileSync } from "node:fs";

const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** @param {string} [nonce] @param {{ scan?: boolean }} [opts] @returns {Buffer} */
export function makeFixturePdf(nonce, opts = {}) {
  const pages = opts.scan ? [[...(nonce ? [`Run ${nonce}`] : [])]] : [
    ["Kaveri Fixtures Limited", "Annual Report 2025-26", ...(nonce ? [`Run ${nonce}`] : [])],
    ["Directors' Report", "The Board presents its report for the year."],
    ["Management Discussion and Analysis", "Demand improved in the second half of the year."],
    ["Consolidated Statement of Profit and Loss for the year ended March 31, 2026", "(Rs. in crore)",
      "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
      "Revenue from operations 1,284.00 1,102.00", "Finance costs 41.20 38.90", "Profit for the year 152.60 118.30"],
    ["Consolidated Balance Sheet as at March 31, 2026", "(Rs. in crore)", "Particulars As at March 31, 2026 As at March 31, 2025",
      "Trade receivables 210.40 188.10", "Inventories 305.00 251.70"],
    ["Notice of Annual General Meeting", "Notice is hereby given that the meeting will be held."],
  ];
  const objs = [];
  const reserve = () => objs.push(null); // returns the new object number
  const set = (n, body) => { objs[n - 1] = body; };
  const catalog = reserve();
  const pagesNode = reserve();
  const font = reserve();
  set(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  // A scanned page is a picture: a 2x2 grey image scaled over the page (the fixture OCR adapter never looks at it).
  let image = 0;
  if (opts.scan) {
    image = reserve();
    set(image, "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\u0000\u00ff\u00ff\u0000\nendstream");
  }
  const kids = pages.map((lines) => {
    const picture = opts.scan ? ["q 515 0 0 700 40 80 cm /Im1 Do Q"] : [];
    const content = [...picture, "BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
    const stream = reserve();
    set(stream, `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const page = reserve();
    set(page, `<< /Type /Page /Parent ${pagesNode} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >>${opts.scan ? ` /XObject << /Im1 ${image} 0 R >>` : ""} >> /Contents ${stream} 0 R >>`);
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
  return Buffer.from(out, "latin1");
}

// No import.meta here: Playwright loads this file through its CommonJS loader. Only `node scripts/make-fixture-pdf.mjs` writes the file.
if (/make-fixture-pdf\.mjs$/.test(process.argv[1] ?? "")) {
  mkdirSync("e2e/fixtures", { recursive: true });
  writeFileSync("e2e/fixtures/annual-report.pdf", makeFixturePdf());
}
