import { describe, expect, it } from "vitest";
import { parseFactsSheet } from "@/modules/casefile/client";
import { proposedFactSchema, type StagedRow } from "@/modules/ingestion/client";
import { machine } from "@/test/fakes/review-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { toDraft } from "./draft";
import { mergeStaged } from "./staged";

const base = toDraft(parseFactsSheet(KAVERI.revisions[1].sheet).caseFile);
const lastId = (prefix: string, ids: string[]) => Math.max(...ids.filter((i) => i.startsWith(prefix)).map((i) => Number(i.slice(1))));
const doc = { id: "d1", title: "Annual report 2025-26", sourceType: "Annual report" as const, filedOn: "2026-05-20", sourceUrl: "https://example.com/ar.pdf" };
const staged = (id: string, over = {}, status: StagedRow["status"] = "accepted", d = doc): StagedRow => ({
  proposalId: id, status, document: d, value: proposedFactSchema.parse(machine(over)),
});
const TWO = [
  staged("p1", { label: "Total borrowings", value: 310, valueText: "310.00", quote: "Total borrowings 310.00 280.00", topic: "Balance sheet" }),
  staged("p2", { label: "Finance costs", value: 41.2, valueText: "41.20", topic: "P&L" }, "edited"),
];

describe("mergeStaged", () => {
  const nF = lastId("F", base.facts.map((f) => f.id));
  const nS = lastId("S", base.sources.map((s) => s.id));

  it("adds one S row for the document and an F row per staged figure, with ids past the high-water mark", () => {
    const out = mergeStaged(base, TWO, []);
    expect(out.draft.sources).toHaveLength(base.sources.length + 1);
    expect(out.draft.sources.at(-1)).toEqual({ id: `S${nS + 1}`, doc: doc.title, type: "Annual report", filedOn: "2026-05-20", url: doc.sourceUrl });
    expect(out.draft.facts.slice(base.facts.length).map((f) => f.id)).toEqual([`F${nF + 1}`, `F${nF + 2}`]);
    expect(out.draft.facts.slice(0, base.facts.length)).toEqual(base.facts);
    expect(out.provenance).toEqual([{ factId: `F${nF + 1}`, proposalId: "p1" }, { factId: `F${nF + 2}`, proposalId: "p2" }]);
    expect(out.skipped).toBe(0);
  });

  it("puts the quote, the topic, the prior and the source on the fact draft", () => {
    const out = mergeStaged(base, TWO, []);
    expect(out.draft.facts[base.facts.length]).toMatchObject({
      label: "Total borrowings", value: "310", unit: "₹ cr", period: "FY26", asOf: "2026-03-31", locator: "p. 4", sourceId: `S${nS + 1}`,
      quote: "Total borrowings 310.00 280.00", topic: "Balance sheet", priorLabel: "FY25", priorValue: "1102",
    });
  });

  it("starts past ids the form loaded and the body cites, even ones no longer in the draft", () => {
    const out = mergeStaged(base, TWO, ["F40", "S12"]);
    expect(out.provenance.map((p) => p.factId)).toEqual(["F41", "F42"]);
    expect(out.draft.sources.at(-1)?.id).toBe("S13");
  });

  it("reuses the S row of a document whose title (any case) and filed-on date match", () => {
    const existing = base.sources[0];
    const same = { ...doc, title: existing.doc.toUpperCase(), filedOn: existing.filedOn };
    const out = mergeStaged(base, [staged("p1", { label: "Total borrowings" }, "accepted", same)], []);
    expect(out.draft.sources).toHaveLength(base.sources.length);
    expect(out.draft.facts.at(-1)?.sourceId).toBe(existing.id);
    // A different filed-on date is a different document row.
    expect(mergeStaged(base, [staged("p1", { label: "Total borrowings" }, "accepted", { ...same, filedOn: "2026-06-01" })], []).draft.sources).toHaveLength(base.sources.length + 1);
  });

  it("skips and counts a staged row equal to an existing fact (label, period, value)", () => {
    const f1 = base.facts[0];
    const dup = staged("pd", { label: f1.label.toLowerCase(), period: f1.period, value: Number(f1.value), valueText: f1.value });
    const out = mergeStaged(base, [dup, ...TWO], []);
    expect(out.skipped).toBe(1);
    expect(out.provenance.map((p) => p.proposalId)).toEqual(["p1", "p2"]);
    expect(out.draft.facts).toHaveLength(base.facts.length + 2);
  });

  it("skips a second staged row that repeats one it has just added", () => {
    const out = mergeStaged(base, [TWO[0], { ...TWO[0], proposalId: "p9" }], []);
    expect(out.skipped).toBe(1);
    expect(out.provenance).toHaveLength(1);
  });

  it("leaves what does not fit under the file's fact limit staged, and says so", () => {
    const full = { ...base, facts: Array.from({ length: 80 }, (_, i) => ({ ...base.facts[0], id: `F${i + 1}`, label: `Line ${i}` })) };
    const out = mergeStaged(full, TWO, []);
    expect(out.overflow).toBe(2);
    expect(out.draft.facts).toHaveLength(80);
    expect(out.provenance).toEqual([]);
  });

  it("does not change the draft it was given", () => {
    const before = JSON.stringify(base);
    mergeStaged(base, TWO, []);
    expect(JSON.stringify(base)).toBe(before);
  });
});
