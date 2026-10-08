import { describe, expect, it } from "vitest";
import { EMPTY_CASEFILE, type CaseFile, type CfTest } from "@/modules/casefile/client";
import { createTableDb } from "@/test/fakes/table-db";
import { machineReading } from "@/test/fakes/review-repo";
import { parseStaging } from "./provenance";
import { recordFiledReadings } from "./readings-filing";
import { listStagedReadingsForItem } from "./staging";

// Staged readings (Plan 2b Task 8, ruling R4): listed for the item's editor, filed under the revision by their own step, never through
// the fact path; one that did not reach the saved file goes back to review (or is dropped when its document is closed).

const ITEM = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const REV = "aaaaaaaa-2222-4333-8444-555555555555";
const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const R1 = "00000011-0000-4000-8000-000000000011";
const R2 = "00000012-0000-4000-8000-000000000012";
const R3 = "00000013-0000-4000-8000-000000000013";

const test = (id: string): CfTest => ({
  id, current: 142, unit: "days", readingAsOf: "2026-03-31", lastChecked: "2026-10-08", status: "watching", min: 60, max: 200, threshold: 150, direction: "above", prior: 131, metric: "Receivable days",
});
const file = (...tests: CfTest[]): CaseFile => ({ ...EMPTY_CASEFILE, tests });
const row = (id: string, testId: string, over: Record<string, unknown> = {}) => ({
  id, document_id: DOC, page_no: 7, test_id: testId, item_id: ITEM, status: "accepted", revision_id: null, created_at: id, machine_value: machineReading(), ...over,
});
const documents = [{ id: DOC, title: "AR 2025-26", source_type: "Annual report", filed_on: "2026-05-20", source_url: null, status: "active" }];

describe("listStagedReadingsForItem", () => {
  it("lists the item's accepted readings that no revision holds, with their document, in page order", async () => {
    const t = createTableDb({
      reading_proposals: [
        row(R2, "T2"), row(R1, "T1"),
        row("f", "T1", { status: "filed", revision_id: REV }), row("p", "T1", { status: "pending" }), row("o", "T1", { item_id: OTHER }), row("r", "T1", { status: "rejected" }),
      ],
      documents,
    });
    const staged = await listStagedReadingsForItem(t.db, ITEM);
    expect(staged.map((s) => [s.proposalId, s.testId])).toEqual([[R1, "T1"], [R2, "T2"]]);
    expect(staged[0]!.value).toMatchObject({ current: 142, readingAsOf: "2026-03-31", prior: 131, unit: "days" });
    expect(staged[0]!.document).toEqual({ id: DOC, title: "AR 2025-26", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: null, status: "active" });
  });

  it("skips a row whose value is not a reading, and asks for nothing more when nothing is staged", async () => {
    const t = createTableDb({ reading_proposals: [row(R1, "T1", { machine_value: { label: "x" } })], documents });
    expect(await listStagedReadingsForItem(t.db, ITEM)).toEqual([]);
    const empty = createTableDb({ reading_proposals: [] });
    expect(await listStagedReadingsForItem(empty.db, ITEM)).toEqual([]);
    expect(empty.log).toHaveLength(1);
  });
});

describe("recordFiledReadings", () => {
  const db = (rows: Record<string, unknown>[], status = "active") =>
    createTableDb({ reading_proposals: rows, documents: [{ id: DOC, status }] });
  const states = (t: ReturnType<typeof db>) => t.tables.reading_proposals!.map((r) => [r.id, r.status, r.item_id, r.revision_id]);

  it("marks a reading filed under the revision when its test is in the saved file, and nothing else about the file", async () => {
    const t = db([row(R1, "T1")]);
    expect(await recordFiledReadings(t.db, { itemId: ITEM, revisionId: REV, structured: file(test("T1")), pairs: [{ testId: "T1", proposalId: R1 }] })).toEqual({ filed: 1, back: 0 });
    expect(states(t)).toEqual([[R1, "filed", ITEM, REV]]);
    expect(t.tables.reading_proposals![0]).not.toHaveProperty("fact_id");
  });

  it("sends a reading back to review when Aksh removed its test, and drops it when the document is closed", async () => {
    const open = db([row(R1, "T1"), row(R2, "T2")]);
    expect(await recordFiledReadings(open.db, { itemId: ITEM, revisionId: REV, structured: file(test("T1")), pairs: [{ testId: "T1", proposalId: R1 }, { testId: "T2", proposalId: R2 }] })).toEqual({ filed: 1, back: 1 });
    expect(states(open)).toEqual([[R1, "filed", ITEM, REV], [R2, "accepted", null, null]]);

    const closed = db([row(R2, "T2")], "done");
    await recordFiledReadings(closed.db, { itemId: ITEM, revisionId: REV, structured: file(test("T1")), pairs: [{ testId: "T2", proposalId: R2 }] });
    expect(states(closed)).toEqual([[R2, "rejected", null, null]]);
  });

  it("ignores a pair that does not check out: another item's reading, one not accepted, one for another test, or a repeat", async () => {
    const t = db([row(R1, "T1", { item_id: OTHER }), row(R2, "T1", { status: "pending" }), row(R3, "T3")]);
    const out = await recordFiledReadings(t.db, {
      itemId: ITEM, revisionId: REV, structured: file(test("T1"), test("T3")),
      pairs: [{ testId: "T1", proposalId: R1 }, { testId: "T1", proposalId: R2 }, { testId: "T1", proposalId: R3 }, { testId: "T3", proposalId: R3 }, { testId: "T3", proposalId: R3 }],
    });
    expect(out).toEqual({ filed: 1, back: 0 });
    expect(states(t)).toEqual([[R1, "accepted", OTHER, null], [R2, "pending", ITEM, null], [R3, "filed", ITEM, REV]]);
  });

  it("does nothing, and reads nothing, when no reading was staged", async () => {
    const t = db([]);
    expect(await recordFiledReadings(t.db, { itemId: ITEM, revisionId: REV, structured: file(test("T1")), pairs: [] })).toEqual({ filed: 0, back: 0 });
    expect(t.log).toEqual([]);
  });

  it("throws on a database failure so the save can say the record could not be written", async () => {
    const t = db([row(R1, "T1")]);
    t.failOn.set("reading_proposals", "boom");
    await expect(recordFiledReadings(t.db, { itemId: ITEM, revisionId: REV, structured: file(test("T1")), pairs: [{ testId: "T1", proposalId: R1 }] })).rejects.toThrow("readings.file");
  });
});

describe("parseStaging with staged readings", () => {
  it("reads the pairs, defaults to none, and ignores a field with a bad pair", () => {
    const good = { staged: [], provenance: [], stagedReadings: [{ testId: "T1", proposalId: R1 }] };
    expect(parseStaging(JSON.stringify(good))).toEqual(good);
    expect(parseStaging(JSON.stringify({ staged: [], provenance: [] }))).toEqual({ staged: [], provenance: [], stagedReadings: [] });
    expect(parseStaging(JSON.stringify({ ...good, stagedReadings: [{ testId: "F1", proposalId: R1 }] }))).toEqual({ staged: [], provenance: [], stagedReadings: [] });
    expect(parseStaging(JSON.stringify({ ...good, stagedReadings: Array.from({ length: 13 }, (_, i) => ({ testId: `T${i + 1}`, proposalId: R1 })) }))).toEqual({ staged: [], provenance: [], stagedReadings: [] });
  });
});
