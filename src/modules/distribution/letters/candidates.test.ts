import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicItemRow, PublicRevisionRow, PublicSnapshot } from "@/modules/showcase";
import { buildRichSnapshot, withVideo } from "@/test/fakes/showcase-snapshot";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { countCandidates, letterCandidates, toEntry } from "./candidates";

// Spec s8.3: "what changed since your last letter". Pure: a public snapshot, the pass times and the last sent time in; entries out.
const TODAY = "2026-10-06";
const snapshot = (): PublicSnapshot => {
  const base = buildRichSnapshot();
  // The ledger case names its company here (the shared fixture leaves it out), so the entry carries a position.
  const withCompany = { ...base, items: base.items.map((i) => (i.kind === "case_study" ? { ...i, companyId: "c1" } : i)) };
  return withVideo(withCompany);
};
const ALL_PASSED = (s: PublicSnapshot, at = "2026-10-01T05:00:00Z") => new Map(s.items.map((i) => [i.revisionId, at] as const));

describe("letterCandidates: which public changes are not yet in a sent letter", () => {
  it("lists files by number, then cases, notes, process notes, videos, each once", () => {
    const s = snapshot();
    const found = letterCandidates(s, ALL_PASSED(s), "2026-09-30T05:00:00Z", TODAY);
    expect(found.map((c) => c.kind)).toEqual(["file", "file", "case", "learning", "learning", "process", "video"]);
    expect(found.slice(0, 2).map((c) => c.itemId)).toEqual(["i1", "i2"]);
    expect(new Set(found.map((c) => c.revisionId)).size).toBe(found.length);
  });

  it("only counts what became visible after the last sent letter, and with none the last 14 days", () => {
    const s = snapshot();
    expect(letterCandidates(s, ALL_PASSED(s, "2026-10-01T05:00:00Z"), "2026-10-02T05:00:00Z", TODAY)).toEqual([]);
    expect(letterCandidates(s, ALL_PASSED(s, "2026-09-25T05:00:00Z"), null, TODAY)).toHaveLength(7);
    expect(letterCandidates(s, ALL_PASSED(s, "2026-09-10T05:00:00Z"), null, TODAY)).toEqual([]);
  });

  it("is visible from the later of its pass time and the IST day its 30-day lag ends", () => {
    const s = snapshot();
    // File 1 (Figures to 22 Aug) passed on 20 Aug; the lag ends on the IST day 21 Sep. Every other item passed long ago.
    const passes = ALL_PASSED(s, "2026-08-01T05:00:00Z");
    passes.set("r1b", "2026-08-20T05:00:00Z");
    expect(letterCandidates(s, passes, "2026-09-10T05:00:00Z", TODAY).map((c) => c.itemId)).toContain("i1");
    expect(letterCandidates(s, passes, "2026-09-20T18:29:00Z", TODAY).map((c) => c.itemId)).toContain("i1"); // 23:59 IST on 20 Sep
    expect(letterCandidates(s, passes, "2026-09-20T18:31:00Z", TODAY).map((c) => c.itemId)).not.toContain("i1"); // after 00:00 IST on 21 Sep
  });

  it("leaves out a revision whose pass time is unknown, and every letter", () => {
    const s = snapshot();
    const passes = ALL_PASSED(s);
    passes.delete("rn0");
    const letter: PublicItemRow = { ...s.items[2]!, id: "L1", kind: "letter", revisionId: "L1-rev", slug: "a-letter", title: "A letter" };
    const withLetter = { ...s, items: [...s.items, letter] };
    passes.set("L1-rev", "2026-10-01T05:00:00Z");
    const found = letterCandidates(withLetter, passes, "2026-09-30T05:00:00Z", TODAY);
    expect(found.map((c) => c.itemId)).not.toContain("n0");
    expect(found.map((c) => c.itemId)).not.toContain("L1");
  });

  it("copies his title, objective and change reason byte for byte, and the position only for a page that names a company", () => {
    const s = snapshot();
    const odd = " Receivable  days  & \"care\" <b>\n";
    const items = s.items.map((i) => (i.id === "n0" ? { ...i, title: odd, learningObjective: `${odd}.`, holdsPosition: "yes" as const } : i));
    const revisions: PublicRevisionRow[] = s.revisions.map((r) => (r.id === "rn0" ? { ...r, changeReason: `${odd}reason` } : r));
    const edited = { ...s, items, revisions };
    const found = letterCandidates(edited, ALL_PASSED(edited), "2026-09-30T05:00:00Z", TODAY);
    const note = found.find((c) => c.itemId === "n0")!;
    expect(note.title).toBe(odd);
    expect(note.learningObjective).toBe(`${odd}.`);
    expect(note.changeReason).toBe(`${odd}reason`);
    expect(note.holdsPosition).toBeNull();
    expect(note.companyName).toBeNull();
    const file = found.find((c) => c.itemId === "i1")!;
    const source = s.items.find((i) => i.id === "i1")!;
    expect(file.title).toBe(source.title);
    expect(file.learningObjective).toBe(source.learningObjective);
    expect(file.holdsPosition).toBe("no");
    expect(file.companyName).toBe(s.companies.find((c) => c.id === "c1")!.name);
    expect(found.find((c) => c.kind === "case")!.companyName).not.toBeNull();
  });

  it("adds the machine's kind, page, revision number and line, and keeps the revision id for the gate", () => {
    const s = snapshot();
    const [first] = letterCandidates(s, ALL_PASSED(s), "2026-09-30T05:00:00Z", TODAY);
    expect(first).toMatchObject({ kind: "file", path: "/companies/kavpump", revNo: 2, revisionId: "r1b" });
    expect(first!.detail).toMatch(/^Revision R2 · \d+ sentences changed · figures to 22 Aug 2026$/);
    const entry = toEntry(first!);
    expect(Object.keys(entry).sort()).toEqual(["changeReason", "companyName", "detail", "holdsPosition", "kind", "learningObjective", "path", "revNo", "revisionId", "title"]);
    const paths = letterCandidates(s, ALL_PASSED(s), "2026-09-30T05:00:00Z", TODAY).map((c) => c.path);
    expect(paths).toEqual(expect.arrayContaining(["/cases/lc1-a-closed-idea", "/videos/v1-reading-the-ageing-table", "/process/how-i-keep-a-case-file"]));
    for (const path of paths) expect(path).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/);
  });

  it("is one entry per company page, never a second file of the same company", () => {
    const s = snapshot();
    const twin: PublicItemRow = { ...s.items[0]!, id: "i1b", kind: "case_study", slug: "kaveri-case", revisionId: "r1b2", fileNo: 3 };
    const extended = { ...s, items: [...s.items, twin], revisions: [...s.revisions, { ...s.revisions[1]!, id: "r1b2", itemId: "i1b" }] };
    const found = letterCandidates(extended, ALL_PASSED(extended), "2026-09-30T05:00:00Z", TODAY);
    expect(found.filter((c) => c.path === "/companies/kavpump")).toHaveLength(1);
  });

  it("keeps at most 20, and the count says how many there really are", () => {
    const s = snapshot();
    const many: PublicItemRow[] = Array.from({ length: 25 }, (_, n) => ({ ...s.items.find((i) => i.id === "n0")!, id: `m${n}`, slug: `m-${n}`, revisionId: `mr${n}` }));
    const revisions: PublicRevisionRow[] = many.map((i, n) => ({ ...s.revisions.find((r) => r.id === "rn0")!, id: `mr${n}`, itemId: i.id }));
    const big = { ...s, items: [...s.items, ...many], revisions: [...s.revisions, ...revisions] };
    const passes = ALL_PASSED(big);
    expect(letterCandidates(big, passes, "2026-09-30T05:00:00Z", TODAY)).toHaveLength(20);
    expect(countCandidates(big, passes, "2026-09-30T05:00:00Z", TODAY)).toBe(32);
  });

  it("a ledger case that does not hold together as a case is not offered", () => {
    const s = buildRichSnapshot();
    const broken = { ...s, items: s.items.map((i) => (i.kind === "case_study" ? { ...i, structured: { ledger: caseRecordFixture({ events: [] }) } } : i)) };
    expect(letterCandidates(broken, ALL_PASSED(broken), null, TODAY).some((c) => c.kind === "case")).toBe(false);
  });
});

describe("the module changes none of his words (D85)", () => {
  it("has no function that shortens, summarises or asks a model", () => {
    const text = readFileSync(resolve(__dirname, "candidates.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(text).not.toMatch(/\.slice\(|\.substring\(|\.substr\(|truncate|cutWords|ellipsis|…|summar|\bllm\b|groq|\.trim\(|toLowerCase|toUpperCase/i);
  });
});
