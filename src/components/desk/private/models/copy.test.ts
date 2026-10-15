import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Report } from "@/modules/valuation/client";
import { confirmLabel, reasonText, reportChip, reportSentence, versionLine } from "./copy";

// Spec s7.3: the words that would read as advice never appear in the model page's own copy: not in copy.ts, not in a string or a line of
// JSX text in this folder, and not in the module's strings (valuation.graph.test.ts). His own labels are shown as he typed them.
const BANNED = [/\btarget\b/i, /\bfair value\b/i, /\bintrinsic value\b/i, /\bupside\b/i, /\bprice target\b/i, /\bbuy\b/i, /\bsell\b/i];
const DIR = __dirname;
const sources = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("the model page's copy", () => {
  it("covers every file of the folder", () => {
    expect(sources).toEqual(expect.arrayContaining(["copy.ts", "calculator.tsx", "confirm-cells.tsx", "results-panel.tsx", "sensitivity-grid.tsx"]));
  });

  it.each(sources)("%s has none of the banned words in a string or in JSX text", (file) => {
    const text = readFileSync(join(DIR, file), "utf8");
    const literals = text.match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g) ?? [];
    const jsxText = [...text.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1]);
    for (const piece of [...literals, ...jsxText]) for (const word of BANNED) expect(word.test(piece), `${file}: ${piece.slice(0, 60)}`).toBe(false);
  });
});

const report = (over: Partial<Report["counts"]> = {}, tainted = 0): Report => ({
  counts: { match: 10, differs: 0, unsupported: 0, cycle: 0, no_cache: 0, random: 0, dated: 0, ...over },
  listed: [],
  unimplemented: [],
  tainted,
  dynamic: 0,
});

describe("the report's sentences (spec s7.2)", () => {
  it("all formulas agree", () => {
    expect(reportSentence(report(), 1204)).toBe("All 1,204 formulas give Excel's answers.");
    expect(reportChip(report())).toBe("All formulas match Excel");
  });

  it("some differ, and some results depend on them", () => {
    expect(reportSentence(report({ differs: 10, unsupported: 2 }, 3), 1204)).toBe("12 formulas give a different answer from Excel; 3 results depend on them and cannot be chosen.");
    expect(reportSentence(report({ cycle: 1 }, 1), 5)).toBe("1 formula gives a different answer from Excel; 1 result depends on it and cannot be chosen.");
    expect(reportSentence(report({ dated: 1 }), 5)).toBe("1 formula gives a different answer from Excel.");
    expect(reportChip(report({ differs: 2 }))).toBe("2 formulas differ from Excel");
  });

  it("names the reason in plain words", () => {
    expect(reasonText({ cls: "unsupported", fn: "CUBEVALUE" })).toBe("uses a function the desk cannot compute yet: CUBEVALUE");
    expect(reasonText({ cls: "cycle", fn: null })).toBe("part of a loop Excel solves by repeating: the desk cannot");
  });

  it("the header line and the confirm button", () => {
    expect(versionLine(3, "2026-10-14T06:00:00Z", "Kaveri DCF")).toBe("Model version 3, read 14 Oct 2026 from Kaveri DCF");
    expect(confirmLabel(4, 2)).toBe("Use 4 inputs and 2 results");
    expect(confirmLabel(1, 1)).toBe("Use 1 input and 1 result");
  });
});
