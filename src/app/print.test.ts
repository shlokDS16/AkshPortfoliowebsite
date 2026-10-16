import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRINT_BANNER_TEXT } from "@/components/desk/private/print-banner";

// Plan 5a Task 3, spec s5. The print stylesheet is plain CSS next to globals.css; what it must hold is checked here, and what it does in
// a real printer is checked by e2e/public-distribution.spec.ts (page.pdf) and by eye.
const print = readFileSync(new URL("./print.css", import.meta.url), "utf8");
const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

/** The text of the first block that follows `marker`, braces balanced. */
function blockAfter(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing ${marker}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unclosed ${marker}`);
}

const media = blockAfter(print, "@media print");

describe("print.css", () => {
  it("is loaded by the root layout, after globals.css", () => {
    expect(layout.indexOf('import "./print.css"')).toBeGreaterThan(layout.indexOf('import "./globals.css"'));
  });

  it("sets an A4 page with margins, in the print media only", () => {
    expect(print.match(/@media print/g)).toHaveLength(1);
    expect(blockAfter(media, "@page")).toMatch(/size:\s*A4;/);
    expect(blockAfter(media, "@page")).toMatch(/margin:\s*18mm 16mm;/);
  });

  it("hides every button except a citation chip, and the interactive-only pieces", () => {
    expect(media).toMatch(/button:not\(\[data-chip\]\)[^{]*\{[^}]*display:\s*none\s*!important;/);
    expect(media).toMatch(/\[data-strip-drawer\]/);
    expect(media).toMatch(/\.progress-hairline/);
  });

  it("keeps a table row, an exhibit and the disclosure whole, and a heading with what follows it", () => {
    expect(media).toMatch(/figure[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(media).toMatch(/tr[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(media).toMatch(/\[data-print-disclosure\][^{]*\{[^}]*break-inside:\s*avoid/);
    expect(media).toMatch(/section > header[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(media).toMatch(/h1,\s*h2,\s*h3,\s*section > header[^{]*\{[^}]*break-after:\s*avoid/);
  });

  it("prints a source link's address after its text, and nothing else gains one", () => {
    expect(media).toMatch(/\[aria-labelledby="sources"\] a\[href\^="http"\]::after\s*\{[^}]*content:\s*" \("\s*attr\(href\)\s*"\)"/);
    expect(media.match(/attr\(href\)/g)).toHaveLength(1);
  });

  it("prints colours and fills as they are (a label's light text needs its fill), and only the open part of a closed disclosure", () => {
    expect(media).toMatch(/\*\s*\{[^}]*print-color-adjust:\s*exact/);
    expect(media).toMatch(/details:not\(\[open\]\) > :not\(summary\)\s*\{[^}]*display:\s*none/);
  });

  it("is always the light theme: the dark colours apply to the screen only", () => {
    expect(globals).toMatch(/@media screen and \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\) \{/);
    expect(globals).not.toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\)/);
  });

  it("carries the desk banner on page 1 as a block and on every later page in the top margin, in the same words", () => {
    expect(media).toMatch(/\[data-desk-print\]\s*\{\s*page:\s*desk;/);
    expect(blockAfter(print, "@page desk {")).toContain(`content: "${PRINT_BANNER_TEXT}";`);
    expect(blockAfter(print, "@page desk:first")).toMatch(/@top-center\s*\{\s*content:\s*none;/);
  });
});
