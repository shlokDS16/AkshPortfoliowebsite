import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_CASEFILE, type CaseFile, type CfFact } from "@/modules/casefile/client";
import { createTableDb, type TableDb } from "@/test/fakes/table-db";
import { machine } from "@/test/fakes/review-repo";
import { factDiffers, parseStaging, provenanceForItem, recordFiledFacts } from "./provenance";

const ITEM = "11111111-2222-4333-8444-555555555555";
const OTHER_ITEM = "99999999-2222-4333-8444-555555555555";
const REV = "aaaaaaaa-2222-4333-8444-555555555555";
const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const P1 = "00000001-0000-4000-8000-000000000001";
const P2 = "00000002-0000-4000-8000-000000000002";
const P3 = "00000003-0000-4000-8000-000000000003";
const P4 = "00000004-0000-4000-8000-000000000004";

const m = machine();
const fact = (over: Partial<CfFact> = {}): CfFact => ({
  id: "F1", label: m.label, value: m.value, unit: "₹ cr", period: "FY26", asOf: "2026-03-31", sourceId: "S1", locator: "p. 4",
  prior: { label: "FY25", value: 1102 }, topic: "P&L", ...over,
});
const caseFile = (facts: CfFact[], quote: Record<string, string> = {}): CaseFile => ({
  ...EMPTY_CASEFILE,
  sources: [{ id: "S1", doc: "AR 2025-26", type: "Annual report", filedOn: "2026-05-20", url: null, quote }],
  facts,
});

describe("factDiffers", () => {
  const quote = m.quote;
  it("is false when every field matches, whatever the whitespace in the quote", () => {
    expect(factDiffers(fact(), quote, m)).toBe(false);
    expect(factDiffers(fact(), `  ${quote.replace(/ /g, "  ")}\n`, m)).toBe(false);
  });
  it.each([
    ["value", fact({ value: 1285 }), quote],
    ["unit", fact({ unit: "₹ lakh" }), quote],
    ["period", fact({ period: "FY25" }), quote],
    ["as-of", fact({ asOf: "2026-03-30" }), quote],
    ["locator", fact({ locator: "p. 5" }), quote],
    ["prior value", fact({ prior: { label: "FY25", value: 1100 } }), quote],
    ["a dropped prior", fact({ prior: null }), quote],
    ["quote", fact(), "Revenue 1,284.00"],
    ["a dropped quote", fact(), null],
  ])("is true when the %s differs", (_name, f, q) => {
    expect(factDiffers(f, q, m)).toBe(true);
  });
});

describe("parseStaging", () => {
  const good = { staged: [P1], provenance: [{ factId: "F1", proposalId: P1 }] };
  it("reads the editor's field", () => {
    expect(parseStaging(JSON.stringify(good))).toEqual(good);
  });
  it.each([
    ["nothing", null],
    ["not JSON", "{nope"],
    ["a bad fact id", JSON.stringify({ staged: [], provenance: [{ factId: "X1", proposalId: P1 }] })],
    ["a bad proposal id", JSON.stringify({ staged: [], provenance: [{ factId: "F1", proposalId: "x" }] })],
    ["81 pairs", JSON.stringify({ staged: [], provenance: Array.from({ length: 81 }, (_, i) => ({ factId: `F${i + 1}`, proposalId: P1 })) })],
    ["an extra key", JSON.stringify({ ...good, extra: 1 })],
    ["a bare array", JSON.stringify(good.provenance)],
  ])("ignores %s", (_name, raw) => {
    expect(parseStaging(raw)).toEqual({ staged: [], provenance: [] });
  });
});

describe("recordFiledFacts", () => {
  let t: TableDb;
  const proposal = (id: string, over: Record<string, unknown> = {}) => ({
    id, document_id: DOC, item_id: ITEM, status: "accepted", revision_id: null, machine_value: m, page_no: 4, ...over,
  });
  beforeEach(() => {
    t = createTableDb({
      proposals: [proposal(P1), proposal(P2), proposal(P3, { status: "edited" }), proposal(P4)],
      fact_provenance: [],
    });
  });
  const record = (input: Partial<Parameters<typeof recordFiledFacts>[1]> & { structured: CaseFile }) =>
    recordFiledFacts(t.db, { itemId: ITEM, revisionId: REV, provenance: [], ...input });

  it("records a row per fact with `edited` worked out here, and files the proposals under the revision", async () => {
    const structured = caseFile([fact({ id: "F1" }), fact({ id: "F2", value: 1300 }), fact({ id: "F3" })], { F1: m.quote, F3: m.quote });
    const result = await record({
      structured,
      provenance: [{ factId: "F1", proposalId: P1 }, { factId: "F2", proposalId: P2 }, { factId: "F3", proposalId: P3 }],
    });
    expect(result).toEqual({ filed: 3 });
    expect(t.tables.fact_provenance).toEqual([
      { revision_id: REV, fact_id: "F1", proposal_id: P1, edited: false },
      { revision_id: REV, fact_id: "F2", proposal_id: P2, edited: true }, // value changed (and quote dropped)
      { revision_id: REV, fact_id: "F3", proposal_id: P3, edited: true }, // matches, but Aksh typed it (status edited, R28)
    ]);
    expect(t.tables.proposals.filter((p) => p.status === "filed").map((p) => [p.id, p.revision_id])).toEqual([[P1, REV], [P2, REV], [P3, REV]]);
    expect(t.tables.proposals.find((p) => p.id === P4)).toMatchObject({ status: "accepted", revision_id: null });
  });

  it("ignores pairs whose proposal belongs to another item, is not accepted or edited, or whose fact is missing", async () => {
    t.tables.proposals.push(proposal("00000005-0000-4000-8000-000000000005", { item_id: OTHER_ITEM }), proposal("00000006-0000-4000-8000-000000000006", { status: "rejected" }));
    const result = await record({
      structured: caseFile([fact({ id: "F1" })], { F1: m.quote }),
      provenance: [
        { factId: "F1", proposalId: "00000005-0000-4000-8000-000000000005" },
        { factId: "F1", proposalId: "00000006-0000-4000-8000-000000000006" },
        { factId: "F9", proposalId: P1 }, // no such fact in this revision
        { factId: "F1", proposalId: "00000007-0000-4000-8000-000000000007" }, // no such proposal
      ],
    });
    expect(result).toEqual({ filed: 0 });
    expect(t.tables.fact_provenance).toEqual([]);
    expect(t.tables.proposals.every((p) => p.status !== "filed")).toBe(true);
  });

  it("files a proposal once, and a fact once", async () => {
    const result = await record({
      structured: caseFile([fact({ id: "F1" }), fact({ id: "F2" })], { F1: m.quote, F2: m.quote }),
      provenance: [{ factId: "F1", proposalId: P1 }, { factId: "F2", proposalId: P1 }, { factId: "F1", proposalId: P2 }],
    });
    expect(result).toEqual({ filed: 1 });
    expect(t.tables.fact_provenance).toHaveLength(1);
  });

  it("sends a staged figure Aksh deleted back to the review list (R5): item cleared, status kept", async () => {
    const result = await record({
      structured: caseFile([fact({ id: "F1" })], { F1: m.quote }),
      provenance: [{ factId: "F1", proposalId: P1 }],
      staged: [P1, P2, P3],
    });
    expect(result).toEqual({ filed: 1 });
    const byId = (id: string) => t.tables.proposals.find((p) => p.id === id);
    expect(byId(P1)).toMatchObject({ status: "filed", item_id: ITEM });
    expect(byId(P2)).toMatchObject({ status: "accepted", item_id: null, revision_id: null });
    expect(byId(P3)).toMatchObject({ status: "edited", item_id: null });
    expect(byId(P4)).toMatchObject({ status: "accepted", item_id: ITEM }); // never staged in this editor: left alone
  });

  it("sends every staged figure back when none became a fact", async () => {
    await record({ structured: caseFile([]), provenance: [], staged: [P1, P2] });
    expect(t.tables.proposals.filter((p) => p.item_id === null).map((p) => p.id)).toEqual([P1, P2]);
  });

  it("drops a deleted staged figure of a done or skipped document (rejected, item cleared) and sends the open document's back", async () => {
    const CLOSED = "cccccccc-7a42-4c55-9e1d-2f6a8b3c4d5e";
    t.tables.documents = [{ id: DOC, status: "active" }, { id: CLOSED, status: "done" }];
    t.tables.proposals.push(proposal("00000005-0000-4000-8000-000000000005", { document_id: CLOSED }), proposal("00000006-0000-4000-8000-000000000006", { document_id: CLOSED, status: "edited" }));
    await record({ structured: caseFile([]), staged: [P1, "00000005-0000-4000-8000-000000000005", "00000006-0000-4000-8000-000000000006"] });
    const byId = (id: string) => t.tables.proposals.find((p) => p.id === id);
    expect(byId(P1)).toMatchObject({ status: "accepted", item_id: null });
    expect(byId("00000005-0000-4000-8000-000000000005")).toMatchObject({ status: "rejected", item_id: null, accepted_value: null });
    expect(byId("00000006-0000-4000-8000-000000000006")).toMatchObject({ status: "rejected", item_id: null });
  });

  it("throws a plain coded error when fewer proposals filed than were recorded (a second tab unstaged one in between)", async () => {
    const from = t.db.from.bind(t.db) as (table: string) => unknown;
    (t.db as unknown as { from: (table: string) => unknown }).from = (table: string) => {
      if (table === "fact_provenance") t.tables.proposals.find((p) => p.id === P1)!.item_id = OTHER_ITEM;
      return from(table);
    };
    await expect(record({ structured: caseFile([fact({ id: "F1" }), fact({ id: "F2" })], { F1: m.quote, F2: m.quote }), provenance: [{ factId: "F1", proposalId: P1 }, { factId: "F2", proposalId: P2 }] })).rejects.toThrow("provenance.file (count-mismatch)");
  });

  it("does not clear a staged figure of another item", async () => {
    t.tables.proposals.push(proposal("00000005-0000-4000-8000-000000000005", { item_id: OTHER_ITEM }));
    await record({ structured: caseFile([]), staged: ["00000005-0000-4000-8000-000000000005"] });
    expect(t.tables.proposals.find((p) => p.id === "00000005-0000-4000-8000-000000000005")?.item_id).toBe(OTHER_ITEM);
  });

  it("does nothing, and reads nothing, when there is nothing to record", async () => {
    expect(await record({ structured: caseFile([]) })).toEqual({ filed: 0 });
    expect(t.log).toEqual([]);
  });

  it("throws only on a database failure, and files nothing when the provenance insert fails", async () => {
    t.failOn.set("fact_provenance", "boom");
    await expect(record({ structured: caseFile([fact()], { F1: m.quote }), provenance: [{ factId: "F1", proposalId: P1 }], staged: [P1] })).rejects.toThrow("provenance.insert");
    expect(t.tables.proposals.every((p) => p.status !== "filed")).toBe(true);
  });
});

describe("provenanceForItem", () => {
  it("returns the newest filing of each fact with the document title and the machine's reading", async () => {
    const t = createTableDb({
      proposals: [
        { id: P1, document_id: DOC, item_id: ITEM, status: "filed", machine_value: m },
        { id: P2, document_id: DOC, item_id: ITEM, status: "filed", machine_value: machine({ value: 1290, valueText: "1,290.00" }) },
        { id: P3, document_id: DOC, item_id: ITEM, status: "accepted", machine_value: m },
      ],
      fact_provenance: [
        { id: "a", fact_id: "F1", proposal_id: P1, edited: false, created_at: "2026-10-01T10:00:00Z" },
        { id: "b", fact_id: "F1", proposal_id: P2, edited: true, created_at: "2026-10-02T10:00:00Z" },
        { id: "c", fact_id: "F2", proposal_id: P3, edited: false, created_at: "2026-10-02T10:00:00Z" },
      ],
      documents: [{ id: DOC, title: "AR 2025-26" }],
    });
    const out = await provenanceForItem(t.db, ITEM);
    expect(Object.keys(out)).toEqual(["F1"]);
    expect(out.F1).toMatchObject({ proposalId: P2, documentTitle: "AR 2025-26", page: 4, edited: true, filedAt: "2026-10-02T10:00:00Z" });
    expect(out.F1.machine.valueText).toBe("1,290.00");
  });

  it("is empty for an item with nothing filed, without asking for more", async () => {
    const t = createTableDb({ proposals: [] });
    expect(await provenanceForItem(t.db, ITEM)).toEqual({});
    expect(t.log).toHaveLength(1);
  });
});
