import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { errorCode, errorText } from "@/lib/messages";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryReviewRepo, machine, record, type MemoryReviewRepo } from "@/test/fakes/review-repo";
import { REVIEW_ERROR_TEXT, ReviewError, type ReviewErrorCode } from "./errors";
import { buildFact, buildReview, decide, fileUnder, resolveFlag, saveValues, unstage, type ReviewPorts } from "./review";
import type { EditFields } from "./review-types";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COMPANY = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const ITEM = "11111111-2222-4333-8444-555555555555";
const P1 = "00000001-0000-4000-8000-000000000001";
const P2 = "00000002-0000-4000-8000-000000000002";
const P3 = "00000003-0000-4000-8000-000000000003";
const P4 = "00000004-0000-4000-8000-000000000004";
const SHA = "b".repeat(64);

let docs: MemoryDocumentsRepo;
let review: MemoryReviewRepo;
let ports: ReviewPorts;

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  review = createMemoryReviewRepo();
  ports = { docs, review };
  await docs.insertUploading({ id: DOC, title: "AR 2025-26", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: SHA, bytes: 10, companyId: COMPANY, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active" });
  review.file = { itemId: ITEM, title: "Kaveri file" };
  review.name = "Kaveri Fixtures";
});

const code = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ReviewError);
  return (error as ReviewError).code;
};
const finance = (id = P1) =>
  record(id, {
    fact: { label: "Finance costs", value: 41.7, valueText: "41.70", page: 4, locator: "p. 4", quote: "Finance costs 41.70 38.10", prior: { label: "FY25", value: 38.1, valueText: "38.10" } },
    flags: ["value_not_on_page"],
  });

describe("decide", () => {
  const clean = { status: "pending", flags: [], machine: machine() };
  const flagged = { status: "pending", flags: ["value_not_on_page" as const], machine: machine() };
  const typed = buildFact(machine(), { valueText: "1,284.00" });

  it("accepts a clean figure as the machine read it", () => {
    expect(decide(clean, { kind: "accept" })).toMatchObject({ status: "accepted", acceptedValue: { valueText: "1,284.00", period: "FY26" } });
  });
  it("refuses to accept while any flag stands", () => {
    expect(() => decide(flagged, { kind: "accept" })).toThrow("Type the value from the page first.");
  });
  it("refuses to accept a reading the page left without a unit", () => {
    expect(() => decide({ ...clean, machine: machine({ unit: null }) }, { kind: "accept" })).toThrow(ReviewError);
  });
  it("stores an unchanged edit of a clean figure as accepted, and a changed one as edited", () => {
    expect(decide(clean, { kind: "edit", value: typed }).status).toBe("accepted");
    expect(decide(clean, { kind: "edit", value: buildFact(machine(), { valueText: "1,248.00" }) })).toMatchObject({ status: "edited", acceptedValue: { value: 1248 } });
  });
  it("stores any resolution of a flagged figure as edited, even a value equal to the machine's (R28)", () => {
    expect(decide(flagged, { kind: "edit", value: typed }).status).toBe("edited");
  });
  it("needs a period, an as-of date and a unit on an edit", () => {
    expect(() => decide(flagged, { kind: "edit", value: { ...typed, unit: "" } })).toThrow(ReviewError);
    expect(() => decide(flagged, { kind: "edit", value: { ...typed, period: "next year" } })).toThrow(ReviewError);
    expect(() => decide(flagged, { kind: "edit", value: { ...typed, asOf: "" } })).toThrow(ReviewError);
  });
  it("lets a reject through whatever the flags, and refuses every decision on a filed figure", () => {
    expect(decide(flagged, { kind: "reject" })).toEqual({ status: "rejected", acceptedValue: null });
    for (const d of [{ kind: "accept" }, { kind: "reject" }, { kind: "edit", value: typed }] as const) {
      expect(() => decide({ ...clean, status: "filed" }, d)).toThrow("already filed");
    }
  });
});

describe("buildFact", () => {
  it("fills a period, unit and date the page left empty, and follows a changed period", () => {
    const base = machine({ period: null, asOf: null, unit: null });
    expect(buildFact(base, { valueText: "41.20", unit: "₹ cr", period: "fy26" })).toMatchObject({ value: 41.2, valueText: "41.20", unit: "₹ cr", period: "FY26", asOf: "2026-03-31" });
    expect(buildFact(machine(), { valueText: "9", period: "FY25" }).asOf).toBe("2025-03-31");
  });
  it("names the prior year from the period when the page did not, and keeps the typed prior figure", () => {
    const base = machine({ period: null, asOf: null, prior: { label: null, value: 1102, valueText: "1,102.00" } });
    expect(buildFact(base, { valueText: "1,284", period: "FY26", unit: "₹ cr", priorValueText: "1,100" }).prior).toEqual({ label: "FY25", value: 1100, valueText: "1,100" });
  });
  it("refuses text that is not a figure", () => {
    expect(() => buildFact(machine(), { valueText: "about forty" })).toThrow("Type the figure as printed");
  });
});

describe("buildReview", () => {
  it("returns null for a document that is not there", async () => {
    expect(await buildReview(ports, "00000000-0000-4000-8000-0000000000aa")).toBeNull();
  });
  it("gives the flags, the values, the target and only the pages that carry them", async () => {
    review.records.push(finance(P1), record(P2), record(P3, { fact: { page: 9, label: "Total income" } }));
    review.texts.set(4, "Finance costs 41.20 38.10");
    review.texts.set(9, "Total income 1,300.00 1,120.00");
    review.texts.set(30, "an unrelated page");
    const data = (await buildReview(ports, DOC))!;
    expect(data.document).toMatchObject({ id: DOC, companyId: COMPANY, companyName: "Kaveri Fixtures", sourceType: "Annual report" });
    expect(data.flags.map((f) => f.label)).toEqual(["Finance costs"]);
    expect(data.flags[0]).toMatchObject({ valueText: "41.70", machineText: "41.70", why: ["The figure 41.70 is not on p. 4."], status: "pending" });
    expect(data.values.flatMap((g) => g.rows.map((r) => r.id))).toEqual([P2, P3]);
    expect(data.target).toEqual({ itemId: ITEM, title: "Kaveri file" });
    expect(Object.keys(data.pageTexts)).toEqual(["4", "9"]);
    expect(data.counts).toEqual({ pending: 3, accepted: 0, edited: 0, rejected: 0, filed: 0 });
  });
  it("shows Aksh's own value once he has decided, with the machine's reading beside it", async () => {
    review.records.push(finance(P1));
    await resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "41.20" } });
    const data = (await buildReview(ports, DOC))!;
    expect(data.flags[0]).toMatchObject({ valueText: "41.20", machineText: "41.70", status: "edited" });
  });
  it("has no target and no company name for a document with no company", async () => {
    await docs.update(DOC, { companyId: null });
    const data = (await buildReview(ports, DOC))!;
    expect(data.target).toBeNull();
    expect(data.document.companyName).toBeNull();
  });
});

describe("resolveFlag", () => {
  it("records the typed value as edited, leaving the machine's reading in place", async () => {
    review.records.push(finance());
    const view = await resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "41.20" } });
    expect(view).toMatchObject({ status: "edited", valueText: "41.20", machineText: "41.70" });
    expect(review.records[0].machine).toMatchObject({ valueText: "41.70" });
    expect(review.records[0].accepted).toMatchObject({ value: 41.2, period: "FY26", asOf: "2026-03-31", unit: "₹ cr" });
  });
  it("drops the quoted line when the page does not have it", async () => {
    review.records.push(record(P1, { flags: ["quote_not_on_page"] }));
    await resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "1,284.00" } });
    expect(review.records[0].accepted).toMatchObject({ quote: "" });
  });
  it("asks for the period and unit the page did not give", async () => {
    review.records.push(record(P1, { fact: { period: null, asOf: null, unit: null }, flags: ["period_unknown", "unit_unknown"] }));
    expect(await code(resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "1,284.00" } }))).toBe("figure-incomplete");
    expect(review.recorded).toEqual([]);
    await resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "1,284.00", period: "FY26", unit: "₹ cr" } });
    expect(review.records[0]).toMatchObject({ status: "edited", accepted: { period: "FY26", asOf: "2026-03-31", unit: "₹ cr" } });
  });
  it("drops a figure on request, and lets Aksh type a value for a dropped one later", async () => {
    review.records.push(finance());
    expect((await resolveFlag(ports, DOC, P1, { kind: "reject" })).status).toBe("rejected");
    expect((await resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "41.20" } })).status).toBe("edited");
  });
  it("refuses a crafted request: a clean figure, an unknown id, extra keys, an unknown document", async () => {
    review.records.push(finance(), record(P2));
    const cases = [
      [P2, { kind: "reject" }],
      ["00000009-0000-4000-8000-000000000009", { kind: "reject" }],
      [P1, { kind: "reject", sneaky: 1 }],
      [P1, { kind: "edit", fields: { valueText: "1", status: "filed" } }],
    ] as const;
    for (const [id, input] of cases) await expect(resolveFlag(ports, DOC, id, input)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(resolveFlag(ports, "00000000-0000-4000-8000-0000000000aa", P1, { kind: "reject" })).rejects.toBeInstanceOf(InvalidInputError);
    expect(review.recorded).toEqual([]);
  });
  it("refuses a figure that is already filed", async () => {
    review.records.push({ ...finance(), status: "filed" });
    expect(await code(resolveFlag(ports, DOC, P1, { kind: "reject" }))).toBe("figure-filed");
  });
});

describe("saveValues", () => {
  const edit = (valueText: string): EditFields => ({ valueText });
  it("accepts the ticked, drops the unticked, and counts the document", async () => {
    review.records.push(record(P1), record(P2, { fact: { label: "Total income" } }), record(P3, { fact: { label: "Profit for the year" } }));
    const counts = await saveValues(ports, DOC, [{ id: P1, keep: true }, { id: P2, keep: true }, { id: P3, keep: false }]);
    expect(counts).toEqual({ pending: 0, accepted: 2, edited: 0, rejected: 1, filed: 0 });
    expect(review.records.map((r) => r.status)).toEqual(["accepted", "accepted", "rejected"]);
  });
  it("stores a changed value as edited and an unchanged one as accepted", async () => {
    review.records.push(record(P1), record(P2, { fact: { label: "Total income" } }));
    await saveValues(ports, DOC, [{ id: P1, keep: true, edit: edit("1,248.00") }, { id: P2, keep: true, edit: edit("1,284.00") }]);
    expect(review.records.map((r) => r.status)).toEqual(["edited", "accepted"]);
    expect(review.records[0].accepted).toMatchObject({ value: 1248 });
  });
  it("keeps Aksh's typed value when a resolved figure is ticked again", async () => {
    review.records.push(finance());
    await resolveFlag(ports, DOC, P1, { kind: "edit", fields: { valueText: "41.20" } });
    await saveValues(ports, DOC, [{ id: P1, keep: true }]);
    expect(review.records[0]).toMatchObject({ status: "edited", accepted: { value: 41.2 } });
  });
  it("puts a figure back after an untick", async () => {
    review.records.push(record(P1));
    await saveValues(ports, DOC, [{ id: P1, keep: false }]);
    await saveValues(ports, DOC, [{ id: P1, keep: true }]);
    expect(review.records[0].status).toBe("accepted");
  });
  it("writes nothing when one decision is refused", async () => {
    review.records.push(record(P1), finance(P2));
    expect(await code(saveValues(ports, DOC, [{ id: P1, keep: true }, { id: P2, keep: true }]))).toBe("type-value-first");
    expect(review.recorded).toEqual([]);
    expect(review.records.map((r) => r.status)).toEqual(["pending", "pending"]);
  });
});

describe("fileUnder", () => {
  const input = { itemId: ITEM, title: "Annual report 2025-26", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: null };
  beforeEach(() => {
    review.records.push(
      record(P1, { status: "accepted", accepted: machine() }),
      record(P2, { fact: { label: "Total income" }, status: "rejected" }),
      record(P3, { fact: { label: "Total equity" } }),
    );
  });

  it("writes the document's source fields and puts its accepted and edited figures under the file", async () => {
    expect(await fileUnder(ports, DOC, { ...input, sourceUrl: "https://example.com/ar.pdf" })).toEqual({ itemId: ITEM, count: 1 });
    expect(await docs.get(DOC)).toMatchObject({ title: "Annual report 2025-26", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: "https://example.com/ar.pdf" });
    expect(review.records.map((r) => r.itemId)).toEqual([ITEM, null, null]);
  });
  it("needs a filed-on date", async () => {
    expect(await code(fileUnder(ports, DOC, { ...input, filedOn: "" }))).toBe("filed-on-required");
    expect(await code(fileUnder(ports, DOC, { ...input, filedOn: "20 May 2026" }))).toBe("filed-on-required");
    expect((await docs.get(DOC))?.filedOn).toBeNull();
  });
  it("is only for the document company's own file", async () => {
    expect(await code(fileUnder(ports, DOC, { ...input, itemId: "99999999-9999-4999-8999-999999999999" }))).toBe("not-this-file");
    review.file = null;
    expect(await code(fileUnder(ports, DOC, input))).toBe("not-this-file");
  });
  it("refuses a document with no company", async () => {
    await docs.update(DOC, { companyId: null });
    expect(await code(fileUnder(ports, DOC, input))).toBe("no-company");
  });
  it("refuses while a flagged figure waits for a check, and when nothing is ticked", async () => {
    review.records.push(finance(P4));
    expect(await code(fileUnder(ports, DOC, input))).toBe("checks-left");
    review.records.splice(3, 1);
    review.records[0].status = "rejected";
    expect(await code(fileUnder(ports, DOC, input))).toBe("nothing-to-file");
  });
  describe("files exactly the figures the review screen lists (no standalone repeat of a consolidated line)", () => {
    const standalone = (id: string, over: Parameters<typeof record>[1] = {}) => record(id, { ...over, fact: { basis: "standalone", ...over.fact } });
    beforeEach(() => {
      review.records.length = 0;
    });

    it("leaves out an accepted standalone repeat, and the count equals what is filed", async () => {
      review.records.push(record(P1, { status: "accepted", accepted: machine() }), standalone(P2, { status: "accepted", accepted: machine({ basis: "standalone" }) }));
      expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 1 });
      expect(review.records.map((r) => r.itemId)).toEqual([ITEM, null]);
    });
    it("leaves out a standalone line Aksh ticked before the consolidated page had been read", async () => {
      review.records.push(standalone(P1, { status: "accepted", accepted: machine({ basis: "standalone" }) }), record(P2, { status: "pending" }));
      expect(await code(fileUnder(ports, DOC, input))).toBe("nothing-to-file");
      expect(review.records.map((r) => r.itemId)).toEqual([null, null]);
      await saveValues(ports, DOC, [{ id: P2, keep: true }]);
      expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 1 });
      expect(review.records.map((r) => r.itemId)).toEqual([null, ITEM]);
    });
    it("leaves out a resolved flagged standalone repeat, as the values list does, but files one with no consolidated twin", async () => {
      review.records.push(record(P1, { status: "accepted", accepted: machine() }), standalone(P2, { flags: ["value_not_on_page"], status: "edited", accepted: machine({ basis: "standalone", valueText: "1,280.00", value: 1280 }) }));
      review.records.push(standalone(P3, { fact: { label: "Total equity" }, flags: ["value_not_on_page"], status: "edited", accepted: machine({ basis: "standalone", label: "Total equity" }) }));
      expect(await fileUnder(ports, DOC, input)).toEqual({ itemId: ITEM, count: 2 });
      expect(review.records.map((r) => r.itemId)).toEqual([ITEM, null, ITEM]);
    });
  });

  it("refuses a crafted claim: a source type or link outside the allowed set, or an extra key", async () => {
    await expect(fileUnder(ports, DOC, { ...input, sourceType: "Notes" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(fileUnder(ports, DOC, { ...input, sourceUrl: "javascript:alert(1)" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(fileUnder(ports, DOC, { ...input, path: "x" })).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("a document marked done or skipped", () => {
  it.each(["done", "skipped"] as const)("can no longer be reviewed or filed once %s", async (status) => {
    review.records.push(finance(P1), record(P2));
    await docs.update(DOC, { status });
    const input = { itemId: ITEM, title: "AR", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: null };
    expect(await code(resolveFlag(ports, DOC, P1, { kind: "reject" }))).toBe("document-closed");
    expect(await code(saveValues(ports, DOC, [{ id: P2, keep: true }]))).toBe("document-closed");
    expect(await code(fileUnder(ports, DOC, input))).toBe("document-closed");
    expect(review.recorded).toEqual([]);
    expect(review.records.map((r) => [r.status, r.itemId])).toEqual([["pending", null], ["pending", null]]);
    expect(errorText("document-closed")).toMatch(/^You marked this document done or skipped/);
  });
});

describe("unstage (Send back to review)", () => {
  it("takes the document's unfiled figures out of the item and keeps their decisions", async () => {
    review.records.push(
      record(P1, { status: "accepted", accepted: machine(), itemId: ITEM }),
      record(P2, { status: "edited", accepted: machine(), itemId: ITEM }),
      record(P3, { status: "filed", accepted: machine(), itemId: ITEM }),
      record(P4, { status: "accepted", accepted: machine(), itemId: "99999999-9999-4999-8999-999999999999" }),
    );
    expect(await unstage(ports, DOC, ITEM)).toBe(2);
    expect(review.records.map((r) => [r.status, r.itemId])).toEqual([["accepted", null], ["edited", null], ["filed", ITEM], ["accepted", "99999999-9999-4999-8999-999999999999"]]);
  });
  it.each(["done", "skipped"] as const)("drops the staged figures of a %s document instead (Aksh's own drop): rejected, out of the item, filed ones untouched", async (status) => {
    review.records.push(
      record(P1, { status: "accepted", accepted: machine(), itemId: ITEM }),
      record(P2, { status: "edited", accepted: machine(), itemId: ITEM }),
      record(P3, { status: "filed", accepted: machine(), itemId: ITEM }),
    );
    await docs.update(DOC, { status });
    expect(await unstage(ports, DOC, ITEM)).toBe(2);
    expect(review.records.map((r) => [r.status, r.itemId, r.accepted === null])).toEqual([["rejected", null, true], ["rejected", null, true], ["filed", ITEM, false]]);
  });
  it("refuses a malformed id or a document that is not there", async () => {
    await expect(unstage(ports, DOC, "nope")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(unstage(ports, "00000000-0000-4000-8000-0000000000aa", ITEM)).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("review messages", () => {
  it("every ReviewError code is a desk message code whose text equals the error's message", () => {
    for (const c of Object.keys(REVIEW_ERROR_TEXT) as ReviewErrorCode[]) {
      expect(errorCode(new ReviewError(c))).toBe(c);
      expect(errorText(c)).toBe(new ReviewError(c).message);
    }
  });
});
