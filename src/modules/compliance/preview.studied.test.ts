import { describe, expect, it } from "vitest";
import { previewGate } from "./preview";
import type { PublishContext } from "./repo";
import type { OutsideSource } from "./rules";

// Phase 5d, rule 14: the checklist before a run says whether the outside sources match what he chose and whether their titles and links pass the
// wording check. The rows exist only for a revision that lists outside sources. Advisory: the database gate decides.
const LINK = "11111111-1111-4111-8111-111111111111";
const SHA = "a".repeat(64);
const entry = (patch: Record<string, unknown> = {}) => ({ link: LINK, show: true, metaSha: SHA, note: "Why it matters.", ...patch });
const source = (patch: Partial<OutsideSource> = {}): OutsideSource => ({ url: "https://www.example.com/talks/moats", show: true, metaSha: SHA, read: true, title: "A talk on moats", siteName: "Some Channel", ...patch });
const ctx = (outside: OutsideSource[], studied: unknown[] | undefined = outside.map(() => entry())): PublishContext => ({
  item: { id: "i1", kind: "thesis", title: "Kaveri file", slug: null, learningObjective: "Learn X.", companyId: "c1", holdsPosition: "no", dataAsOf: "2026-08-22", visibility: "private" },
  revision: { id: "r1", bodyMd: "Margins held.\n\n## What would prove me wrong\n- T1: Margins fall.", structured: studied ? { studied } : {}, changeReason: null },
  companyName: "Kaveri Pumps (fictional)", companyOneLiner: null, themeName: null, conceptNames: [], conceptSlugs: [], transcript: null, outside, allowances: [],
});
const run = (c: PublishContext) => previewGate({ ctx: c, today: "2026-10-16", companyPublic: true, structureProblems: [] });
const row = (c: PublishContext, id: string) => run(c).items.find((i) => i.id === id);

describe("the rule 14 rows of the publish checklist", () => {
  it("are absent for a revision that lists no outside source", () => {
    const items = run(ctx([], undefined)).items.map((i) => i.id);
    expect(items.filter((id) => id.startsWith("rule-14"))).toEqual([]);
  });

  it("both pass for a clean source whose shown title is the one the desk read", () => {
    expect(row(ctx([source()]), "rule-14")).toMatchObject({ state: "pass", name: "Outside sources match what you chose (rule 14)." });
    expect(row(ctx([source()]), "rule-14-words")).toMatchObject({ state: "pass", name: "Outside titles and links pass the wording check." });
  });

  it("the first fails, in the gate's sentence, when the title changed since he chose it", () => {
    const changed = ctx([source({ read: false, title: null, siteName: null })]);
    expect(row(changed, "rule-14")).toMatchObject({ state: "fail", detail: "YouTube or the page changed since you chose it. Save the sources again." });
  });

  it("a source that shows no title needs no match", () => {
    const linkOnly = ctx([source({ show: false, metaSha: null, read: false, title: null, siteName: null })], [entry({ show: false, metaSha: null })]);
    expect(row(linkOnly, "rule-14")?.state).toBe("pass");
  });

  it("the first fails when an entry's source could not be found", () => {
    const missing = ctx([], [entry()]);
    expect(row(missing, "rule-14")).toMatchObject({ state: "fail", detail: "An outside source on this revision is missing. Save the sources again." });
  });

  it("the second fails with the lint's own sentence for a title with a price, and for one with a wording the rules refuse", () => {
    const priced = ctx([source({ title: "Why I sold at Rs 450" })]);
    expect(row(priced, "rule-14-words")).toMatchObject({ state: "fail" });
    expect(row(priced, "rule-14-words")?.detail).toMatch(/Untick 'Show its title and picture'/);
    const advice = ctx([source({ title: "Five stocks to buy now" })]);
    expect(row(advice, "rule-14-words")?.state).toBe("fail");
    expect(row(advice, "rule-1")?.state).toBe("fail");
  });

  it("a wording problem in his own body does not fail the outside-sources row", () => {
    const c = ctx([source()]);
    c.revision.bodyMd = "You should buy the leader now.\n\n## What would prove me wrong\n- T1: Margins fall.";
    expect(row(c, "rule-1")?.state).toBe("fail");
    expect(row(c, "rule-14-words")?.state).toBe("pass");
  });
});
