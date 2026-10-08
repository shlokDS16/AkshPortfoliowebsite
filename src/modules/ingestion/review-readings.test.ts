import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryReviewRepo, machine, reading, record, type MemoryReviewRepo } from "@/test/fakes/review-repo";
import { ReviewError } from "./errors";
import { buildReview, fileUnder, saveValues, unstage, type ReviewPorts } from "./review";
import { currentReadings, filableReadingIds, readingViews } from "./review-readings";
import { currentRecords } from "./review-view";

// Test readings on the review screen (Plan 2b Task 8, ruling R4): a separate list with its own ticks, filed under the file beside the
// figures, never parsed as a figure and never carrying a status.

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COMPANY = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const ITEM = "11111111-2222-4333-8444-555555555555";
const P1 = "00000001-0000-4000-8000-000000000001";
const R1 = "00000011-0000-4000-8000-000000000011";
const R2 = "00000012-0000-4000-8000-000000000012";
const R3 = "00000013-0000-4000-8000-000000000013";
const input = { itemId: ITEM, title: "AR 2025-26", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: null };

let docs: MemoryDocumentsRepo;
let review: MemoryReviewRepo;
let ports: ReviewPorts;

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  review = createMemoryReviewRepo();
  ports = { docs, review };
  await docs.insertUploading({ id: DOC, title: "AR 2025-26", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "b".repeat(64), bytes: 10, companyId: COMPANY, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active" });
  review.file = { itemId: ITEM, title: "Kaveri file" };
  review.name = "Kaveri Fixtures";
});

describe("the review screen's reading list", () => {
  it("lists a document's readings apart from its figures, with what Aksh needs to check them", async () => {
    review.records.push(record(P1));
    review.readings.push(reading(R1));
    const data = await buildReview(ports, DOC);
    expect(data!.rows).toHaveLength(1);
    expect(data!.readings).toEqual([
      { id: R1, page: 7, testId: "T1", label: "Receivable days", valueText: "142", unit: "days", period: "FY26", asOf: "2026-03-31", prior: 131, quote: "Receivable days 142 131", status: "pending", basis: "consolidated" },
    ]);
    expect(data!.counts.pending).toBe(1); // the figure only: a reading is never counted as a figure
  });

  it("leaves out a filed reading, and a reading whose stored value is not a reading", async () => {
    review.readings.push(reading(R1, { status: "filed" }), { ...reading(R2), machine: { label: "Revenue" } });
    expect((await buildReview(ports, DOC))!.readings).toEqual([]);
  });

  it("leaves out what the re-read replaced, and keeps what Aksh dropped himself (his drop beats the later pass)", async () => {
    review.records.push(
      record(P1, { status: "rejected", pass: 1, superseded: true }),
      record("00000002-0000-4000-8000-000000000002", { pass: 2, baseKey: "x" }),
      record("00000003-0000-4000-8000-000000000003", { status: "rejected", fact: { label: "Profit for the year" } }),
      record("00000004-0000-4000-8000-000000000004", { pass: 2, fact: { label: "Profit for the year" } }),
    );
    review.readings.push(
      reading(R1, { status: "rejected", pass: 1, superseded: true }),
      reading(R2, { pass: 2 }),
      reading(R3, { testId: "T2", status: "rejected", pass: 1 }),
      reading("00000014-0000-4000-8000-000000000014", { testId: "T2", pass: 2 }),
    );
    const data = await buildReview(ports, DOC);
    expect(data!.rows.map((r) => r.id)).toEqual(["00000002-0000-4000-8000-000000000002", "00000003-0000-4000-8000-000000000003"]);
    expect(data!.readings.map((r) => r.id)).toEqual([R2, R3]);
  });

  it("lists a standalone reading only when no reading of the preferred basis has the same test and period", async () => {
    review.readings.push(
      reading(R1, { machine: { basis: "consolidated" } }),
      reading(R2, { machine: { basis: "standalone", page: 9, current: 150, valueText: "150" } }),
      reading(R3, { testId: "T2", machine: { basis: "standalone", label: "Gross margin", unit: "%" } }),
    );
    expect((await buildReview(ports, DOC))!.readings.map((r) => [r.id, r.basis])).toEqual([[R1, "consolidated"], [R3, "standalone"]]);
  });

  it("orders readings by page then test", () => {
    const recs = [reading("a", { testId: "T10", machine: { page: 3 } }), reading("b", { testId: "T2", machine: { page: 3 } }), reading("c", { testId: "T1", machine: { page: 9 } })];
    expect(readingViews(recs, "consolidated").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("currentRecords and currentReadings", () => {
  it("drop a superseded row and a later pass's repeat of a line Aksh dropped; accepted, edited and filed rows stay", () => {
    const recs = [
      record("a", { status: "rejected", superseded: true }), record("b", { status: "accepted" }), record("c", { status: "edited", fact: { label: "Profit for the year" } }),
      record("d", { pass: 2 }), record("e", { status: "rejected", fact: { label: "Finance costs" } }), record("f", { pass: 2, fact: { label: "Finance costs" } }),
    ];
    expect(currentRecords(recs).map((r) => r.id)).toEqual(["b", "c", "d", "e"]);
    expect(currentReadings([reading("x", { status: "rejected", superseded: true }), reading("y", { pass: 2 }), reading("z", { status: "filed" })]).map((r) => r.id)).toEqual(["y"]);
  });
});

describe("saving the ticks", () => {
  it("accepts a ticked reading and rejects an unticked one, leaving the figures' counts alone", async () => {
    review.records.push(record(P1));
    review.readings.push(reading(R1), reading(R2, { testId: "T2" }));
    const counts = await saveValues(ports, DOC, [{ id: P1, keep: true }, { id: R1, keep: true }, { id: R2, keep: false }]);
    expect(counts).toMatchObject({ pending: 0, accepted: 1, rejected: 0 });
    expect(review.readings.map((r) => [r.id, r.status])).toEqual([[R1, "accepted"], [R2, "rejected"]]);
  });

  it("does not write again for a reading already accepted and ticked", async () => {
    review.readings.push(reading(R1, { status: "accepted" }));
    await saveValues(ports, DOC, [{ id: R1, keep: true }]);
    expect(review.recorded).toEqual([]);
  });

  it("refuses an edit of a reading (Aksh changes a reading in the Facts form) and an id that is in neither list", async () => {
    review.readings.push(reading(R1));
    await expect(saveValues(ports, DOC, [{ id: R1, keep: true, edit: { valueText: "150" } }])).rejects.toBeInstanceOf(InvalidInputError);
    await expect(saveValues(ports, DOC, [{ id: "99999999-9999-4999-8999-999999999999", keep: true }])).rejects.toBeInstanceOf(InvalidInputError);
    expect(review.readings[0]!.status).toBe("pending");
  });

  it("writes nothing when any decision is refused", async () => {
    review.records.push(record(P1));
    review.readings.push(reading(R1));
    await expect(saveValues(ports, DOC, [{ id: R1, keep: true }, { id: "99999999-9999-4999-8999-999999999999", keep: true }])).rejects.toBeInstanceOf(InvalidInputError);
    expect(review.recorded).toEqual([]);
  });

  it("never changes a test's status: the only fields the repo is asked to write are the reading's own status", async () => {
    review.readings.push(reading(R1));
    await saveValues(ports, DOC, [{ id: R1, keep: true }]);
    expect(review.recorded).toEqual([{ id: R1, status: "accepted" }]);
  });
});

describe("filing under the company's file", () => {
  it("files the accepted readings beside the figures and counts both", async () => {
    review.records.push(record(P1, { status: "accepted" }));
    review.readings.push(reading(R1, { status: "accepted" }), reading(R2, { testId: "T2", status: "rejected" }), reading(R3, { testId: "T3" }));
    expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 2 });
    expect(review.readings.map((r) => [r.id, r.itemId])).toEqual([[R1, ITEM], [R2, null], [R3, null]]);
  });

  it("can file readings alone", async () => {
    review.readings.push(reading(R1, { status: "accepted" }));
    expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 1 });
  });

  it("still says there is nothing to file when neither a figure nor a reading is accepted", async () => {
    review.readings.push(reading(R1));
    const error = await fileUnder(ports, DOC, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReviewError);
    expect((error as ReviewError).code).toBe("nothing-to-file");
  });

  it("files an accepted reading of any pass: only a row the re-read replaced is gone", () => {
    expect(filableReadingIds([reading("old", { status: "accepted", pass: 1 }), reading("new", { status: "accepted", pass: 2 })], "consolidated")).toEqual(["old", "new"]);
  });
});

describe("filing ignores what the screen hides (a later pass's repeat of a line Aksh dropped himself)", () => {
  const FIN = { label: "Finance costs" };
  const P2 = "00000002-0000-4000-8000-000000000002";
  const P3 = "00000003-0000-4000-8000-000000000003";

  it("a hidden flagged pending row of pass 2 does not block filing with checks-left", async () => {
    review.records.push(
      record(P1, { status: "accepted" }),
      record(P2, { fact: FIN, status: "rejected", flags: ["value_not_on_page"] }),
      record(P3, { fact: FIN, pass: 2, flags: ["value_not_on_page"] }),
    );
    expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 1 });
    expect((await buildReview(ports, DOC))!.flags.map((f) => f.id)).toEqual([P2]); // the screen lists only his drop
  });

  it("a hidden accepted row of pass 2 is neither filed nor counted", async () => {
    review.records.push(
      record(P1, { status: "accepted" }),
      record(P2, { fact: FIN, status: "rejected" }),
      record(P3, { fact: FIN, pass: 2, status: "accepted", accepted: machine({ label: "Finance costs" }) }),
    );
    expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 1 });
    expect(review.records.map((r) => [r.id, r.itemId])).toEqual([[P1, ITEM], [P2, null], [P3, null]]);
  });

  it("a decision on a hidden row is refused, as for any id the screen never listed", async () => {
    review.records.push(record(P2, { fact: FIN, status: "rejected" }), record(P3, { fact: FIN, pass: 2 }));
    await expect(saveValues(ports, DOC, [{ id: P3, keep: true }])).rejects.toBeInstanceOf(InvalidInputError);
    expect(review.recorded).toEqual([]);
  });
});

describe("sending back", () => {
  it("returns the staged readings to the list with the figures, and drops them when the document is closed", async () => {
    review.records.push(record(P1, { status: "accepted", itemId: ITEM }));
    review.readings.push(reading(R1, { status: "accepted", itemId: ITEM }));
    expect(await unstage(ports, DOC, ITEM)).toBe(2);
    expect(review.readings[0]).toMatchObject({ status: "accepted", itemId: null });

    review.readings[0]!.itemId = ITEM;
    await docs.update(DOC, { status: "done" });
    await unstage(ports, DOC, ITEM);
    expect(review.readings[0]).toMatchObject({ status: "rejected", itemId: null });
  });
});
