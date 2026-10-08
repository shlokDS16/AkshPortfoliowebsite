import { z } from "zod";
import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import type { DocumentsRepo } from "@/modules/documents";
import { buildFact, decide, type Decided } from "./decide";
import { ReviewError } from "./errors";
import type { MachineFact } from "./proposed-fact";
import type { ProposalRecord, ReviewRepo } from "./review-repo";
import type { ProposalView, ReviewCounts } from "./review-types";
import { filableReadingIds } from "./review-readings";
import { filableIds } from "./review-values";
import { currentFact, machineOf, toView } from "./review-view";

// What Aksh's clicks on the review screen do (spec s6.5). Each takes the repos it needs, so tests run on fakes and
// the actions run on the admin's cookie session. The machine's reading is never changed: only a status and Aksh's
// own value are recorded beside it.

export type ReviewPorts = { docs: DocumentsRepo; review: ReviewRepo };

// Strict at the boundary (R24): the browser's claim is checked here, never trusted.
const text = z.string().max(60);
const editFields = z.strictObject({
  valueText: text,
  unit: z.string().max(12).optional(),
  period: z.string().max(10).optional(),
  asOf: z.string().max(10).optional(),
  priorValueText: text.optional(),
  priorPeriod: z.string().max(10).optional(),
});
export const resolveInput = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("edit"), fields: editFields }), z.strictObject({ kind: z.literal("reject") })]);
export const valueDecisions = z.array(z.strictObject({ id: z.guid(), keep: z.boolean(), edit: editFields.optional() })).max(200);
export const fileUnderInput = z.strictObject({
  itemId: z.guid(),
  title: z.string().trim().min(1).max(160),
  sourceType: z.enum(["Annual report", "Presentation", "Filing", "Transcript", "Other"]),
  filedOn: z.string(),
  sourceUrl: z.url({ protocol: /^https?$/ }).regex(/^https?:\/\//).max(2000).nullable(),
});

type Row = { rec: ProposalRecord; machine: MachineFact };

async function rowsOf(ports: ReviewPorts, documentId: string): Promise<Map<string, Row>> {
  const doc = isUuid(documentId) ? await ports.docs.get(documentId) : null;
  if (!doc) throw new InvalidInputError();
  // Done and skipped are Aksh's: pending figures stay hidden and cannot be decided or filed afterwards.
  if (doc.status === "done" || doc.status === "skipped") throw new ReviewError("document-closed");
  const rows = new Map<string, Row>();
  for (const rec of await ports.review.list(documentId)) {
    const machine = machineOf(rec);
    if (machine) rows.set(rec.id, { rec, machine });
  }
  return rows;
}

const countsOf = (rows: Map<string, Row>): ReviewCounts => {
  const counts: ReviewCounts = { pending: 0, accepted: 0, edited: 0, rejected: 0, filed: 0 };
  for (const { rec } of rows.values()) counts[rec.status as keyof ReviewCounts] += 1;
  return counts;
};

/** The base an edit starts from. A flagged line whose quote is not on the page loses that quote: it is not Aksh's to file. */
function baseOf({ rec, machine }: Row): MachineFact {
  const base = currentFact(rec, machine);
  return rec.flags.includes("quote_not_on_page") ? { ...base, quote: "" } : base;
}

/** Resolves one flagged figure: Aksh types the value from the page (stored as `edited`, R28) or drops it. */
export async function resolveFlag(ports: ReviewPorts, documentId: string, proposalId: string, input: unknown): Promise<ProposalView> {
  const parsed = resolveInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();
  const row = (await rowsOf(ports, documentId)).get(proposalId);
  if (!row || row.rec.flags.length === 0) throw new InvalidInputError();
  const { rec, machine } = row;
  const decision = parsed.data.kind === "reject" ? ({ kind: "reject" } as const) : ({ kind: "edit", value: buildFact(baseOf(row), parsed.data.fields) } as const);
  const decided = decide({ status: rec.status, flags: rec.flags, machine }, decision);
  await ports.review.record(documentId, rec.id, decided);
  const view = toView({ ...rec, accepted: decided.acceptedValue, status: decided.status });
  if (!view) throw new InvalidInputError();
  return view;
}

/**
 * Saves the values list: a ticked figure is accepted as read (or as Aksh typed it), an unticked one is dropped.
 * Every decision is checked before any is written, so a refusal leaves the document as it was.
 */
export async function saveValues(ports: ReviewPorts, documentId: string, input: unknown): Promise<ReviewCounts> {
  const parsed = valueDecisions.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();
  const rows = await rowsOf(ports, documentId);
  const readings = new Map((await ports.review.listReadings(documentId)).map((r) => [r.id, r]));
  const plan: { id: string; decided: Decided }[] = [];
  const readingPlan: { id: string; status: "accepted" | "rejected" }[] = [];
  for (const d of parsed.data) {
    const row = rows.get(d.id);
    if (!row) {
      // A test reading: ticked is accepted, unticked rejected. Aksh changes a reading in the Facts form, so an edit is refused here.
      const rec = readings.get(d.id);
      if (!rec || d.edit || rec.status === "filed") throw new InvalidInputError();
      if (d.keep ? rec.status !== "accepted" : rec.status !== "rejected") readingPlan.push({ id: d.id, status: d.keep ? "accepted" : "rejected" });
      continue;
    }
    const { rec, machine } = row;
    const { flags } = rec;
    if (!d.keep) plan.push({ id: d.id, decided: decide({ status: rec.status, flags, machine }, { kind: "reject" }) });
    else if (d.edit) plan.push({ id: d.id, decided: decide({ status: rec.status, flags, machine }, { kind: "edit", value: buildFact(baseOf(row), d.edit) }) });
    // Already accepted or typed by Aksh: ticking it again must not put the machine's reading back.
    else if (rec.status === "accepted" || rec.status === "edited") continue;
    else plan.push({ id: d.id, decided: decide({ status: rec.status, flags, machine }, { kind: "accept" }) });
  }
  for (const { id, decided } of plan) {
    await ports.review.record(documentId, id, decided);
    const row = rows.get(id)!;
    row.rec = { ...row.rec, status: decided.status, accepted: decided.acceptedValue };
  }
  for (const { id, status } of readingPlan) await ports.review.recordReading(documentId, id, status);
  return countsOf(rows);
}

/** Puts the document's listed accepted and edited figures (the ones the values list shows) under the company's file and records where the document came from. */
export async function fileUnder(ports: ReviewPorts, documentId: string, input: unknown): Promise<{ itemId: string; count: number }> {
  const parsed = fileUnderInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();
  const { itemId, title, sourceType, filedOn, sourceUrl } = parsed.data;
  if (!z.iso.date().safeParse(filedOn).success) throw new ReviewError("filed-on-required");
  const rows = await rowsOf(ports, documentId);
  const doc = await ports.docs.get(documentId);
  if (!doc?.companyId) throw new ReviewError("no-company");
  const file = await ports.review.fileOf(doc.companyId);
  if (!file || file.itemId !== itemId) throw new ReviewError("not-this-file");
  const all = [...rows.values()].map((r) => r.rec);
  if (all.some((r) => r.flags.length > 0 && r.status === "pending")) throw new ReviewError("checks-left");
  // The screen's own rule decides what is filed, so the count Aksh sees is what the editor then shows.
  const ids = filableIds(all.flatMap((rec) => toView(rec) ?? []), doc.basis);
  const readingIds = filableReadingIds(await ports.review.listReadings(documentId));
  if (ids.length === 0 && readingIds.length === 0) throw new ReviewError("nothing-to-file");

  await ports.docs.update(documentId, { title, sourceType, filedOn, sourceUrl });
  const count = (await ports.review.assignItem(documentId, itemId, ids)) + (await ports.review.assignReadings(documentId, itemId, readingIds));
  return { itemId, count };
}

/**
 * Send back to review: the document's figures staged under the item leave its editor and return to this screen's list.
 * Only unfiled accepted or edited ones move. A done or skipped document has no review screen to go back to, so its
 * staged figures are dropped instead: rejected, and out of the item (Aksh's own drop).
 */
export async function unstage(ports: ReviewPorts, documentId: string, itemId: unknown): Promise<number> {
  const doc = isUuid(documentId) && isUuid(itemId) ? await ports.docs.get(documentId) : null;
  if (!doc || !isUuid(itemId)) throw new InvalidInputError();
  const closed = doc.status === "done" || doc.status === "skipped";
  const figures = closed ? await ports.review.dropStaged(documentId, itemId) : await ports.review.unassignItem(documentId, itemId);
  const readings = closed ? await ports.review.dropStagedReadings(documentId, itemId) : await ports.review.unassignReadings(documentId, itemId);
  return figures + readings;
}

/**
 * Links a document to an existing company, so its figures have a file to go under. A document that already has a
 * company can be moved (a misclick in the drop bar) only while none of its figures is filed or staged under that
 * company's file: once any is, the company is part of what was filed.
 */
export async function setCompany(ports: ReviewPorts, documentId: string, companyId: unknown): Promise<void> {
  if (!isUuid(documentId) || !isUuid(companyId)) throw new InvalidInputError();
  const doc = await ports.docs.get(documentId);
  if (!doc) throw new InvalidInputError();
  if ((await ports.review.companyName(companyId)) === null) throw new InvalidInputError();
  if (doc.companyId !== null && doc.companyId !== companyId) {
    if ((await ports.review.list(documentId)).some((r) => r.itemId !== null || r.status === "filed")) throw new ReviewError("company-locked");
  }
  await ports.docs.update(documentId, { companyId });
}
