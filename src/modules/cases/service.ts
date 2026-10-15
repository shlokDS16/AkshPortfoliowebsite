import { addDays, PUBLICATION_LAG_DAYS } from "@/lib/dates";
import { ItemNotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { isRecord } from "@/lib/records";
import { isLedgerCase, parseCaseRecord, type CaseRecordV1 } from "@/modules/casefile/client";
import { addRevision, getItemWithHistory, isItemId, updateItemMeta, type Revision } from "@/modules/research";
import { CaseError, type CaseErrorCode } from "./errors";
import { jsonEqual } from "./json-equal";
import type { CaseDeps, CaseState, CaseSwitches, LedgerStatus } from "./types";

// Drafting and refreshing a case study from a closed idea. The record is the database's: this file asks for it, checks that it
// reads, and copies it into a revision untouched. It never builds, edits or completes a record, and it never writes a word of the
// idea (his words stay in the ledger's sealed entries and in the revision body he writes himself). No LLM, no service client.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const TITLE_MAX = 200;
const COMPANY_IN_TITLE_MAX = 120;

const monthYear = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** "{company}: a closed idea, {Mon YYYY} to {Mon YYYY}" (spec s33.8, Task 2). */
function titleOf(record: CaseRecordV1): string {
  const company = record.company.length > COMPANY_IN_TITLE_MAX ? `${record.company.slice(0, COMPANY_IN_TITLE_MAX - 1).trimEnd()}…` : record.company;
  const title = `${company}: a closed idea, ${monthYear(record.entry_date)} to ${monthYear(record.exit_date)}`;
  return title.slice(0, TITLE_MAX);
}

/** Asks the database for the record and checks that it reads. Returns the value as the database sent it, and its parsed view. */
async function buildChecked(deps: CaseDeps, ideaId: string): Promise<{ raw: unknown; record: CaseRecordV1 }> {
  if (!isUuid(ideaId)) throw new CaseError("case-not-found");
  const raw = await deps.cases.buildRecord(ideaId);
  const record = parseCaseRecord(raw);
  if (!record) throw new CaseError("case-record-unreadable");
  return { raw, record };
}

/** The idea a revision's record names, or null when the structured data holds no readable record key. */
function ideaOf(structured: Record<string, unknown>): string | null {
  const ledger = structured.ledger;
  return isRecord(ledger) && typeof ledger.idea === "string" ? ledger.idea : null;
}

/** The newest revision of an item, which must carry a ledger record; the item must exist. */
async function latestLedgerRevision(deps: CaseDeps, itemId: string) {
  const history = isItemId(itemId) ? await getItemWithHistory(deps.research, itemId) : null;
  if (!history) throw new ItemNotFoundError(itemId);
  const latest: Revision | undefined = history.revisions[0];
  if (!latest || !isLedgerCase(latest.structured)) throw new CaseError("case-not-ledger");
  const idea = ideaOf(latest.structured);
  if (idea === null) throw new CaseError("case-record-unreadable");
  return { item: history.item, latest, idea };
}

/**
 * Makes the private case study item for a closed idea, or returns the one that exists (a second tap makes nothing). The item is
 * a private draft: the learning objective and the Holds position are left empty for him (the gate requires them), and the body
 * is empty (his "Looking back" words are optional, spec s33.5). Figures to is the record's own date. The item is filed under the company the sealed one has become.
 */
export async function draftCaseStudy(deps: CaseDeps, ideaId: string): Promise<{ itemId: string; created: boolean }> {
  if (!isUuid(ideaId)) throw new CaseError("case-not-found");
  const existing = await deps.cases.findItemForIdea(ideaId);
  if (existing) return { itemId: existing, created: false };
  const { raw, record } = await buildChecked(deps, ideaId);
  const companyId = await deps.cases.resolveCompany(record.company_id);
  const item = await deps.research.insertItem({ kind: "case_study", title: titleOf(record), companyId, themeId: null, learningObjective: null });
  const revision = await deps.research.insertRevision({
    itemId: item.id, bodyMd: "", structured: { ledger: raw }, changeReason: "Drafted from the ledger", author: "aksh",
  });
  await deps.research.updateItem(item.id, { currentRevisionId: revision.id, dataAsOf: record.figures_to });
  return { itemId: item.id, created: true };
}

/** True when the ledger would now build a different record from the one in the item's newest revision. */
export async function recordDiffers(deps: CaseDeps, itemId: string): Promise<boolean> {
  const { latest, idea } = await latestLedgerRevision(deps, itemId);
  const { raw } = await buildChecked(deps, idea);
  return !jsonEqual(latest.structured.ledger, raw);
}

/**
 * A new revision with the rebuilt record and his body carried over, and Figures to moved to the new date. Nothing to do (and no new
 * revision) when the record already matches. On a public item the revision waits for the gate and Figures to stays: the item's details
 * are frozen while it is public (D10), so a new date means unpublishing first, which the gate's message says.
 */
export async function refreshCaseStudy(deps: CaseDeps, itemId: string): Promise<{ changed: boolean; pendingGate: boolean }> {
  const { item, latest, idea } = await latestLedgerRevision(deps, itemId);
  const { raw, record } = await buildChecked(deps, idea);
  const isPublic = item.visibility === "public";
  if (jsonEqual(latest.structured.ledger, raw)) {
    // A refresh whose date step failed earlier: the record is current, Figures to is not.
    if (!isPublic && item.dataAsOf !== record.figures_to) {
      await updateItemMeta(deps.research, itemId, { dataAsOf: record.figures_to });
      return { changed: true, pendingGate: false };
    }
    return { changed: false, pendingGate: false };
  }
  const saved = await addRevision(deps.research, {
    itemId, bodyMd: latest.bodyMd, structured: { ledger: raw }, changeReason: "Refreshed from the ledger", author: "aksh",
  });
  if (!isPublic) await updateItemMeta(deps.research, itemId, { dataAsOf: record.figures_to });
  return { changed: true, pendingGate: saved.pendingGate };
}

/**
 * What the item page says about the ledger: whether the record in the newest revision still equals a fresh build, which date the
 * ledger now wants as Figures to, and whether the item's own date is behind it. While the item is public its date is frozen, so a
 * moved date cannot be fixed by a refresh alone: it needs Unpublish, Refresh, Publish (the gate says case_figures_to otherwise).
 * Null when the ledger cannot be read now: the screen then says nothing it cannot back.
 */
export async function ledgerStatus(deps: CaseDeps, itemId: string): Promise<LedgerStatus | null> {
  try {
    const { item, latest, idea } = await latestLedgerRevision(deps, itemId);
    const { raw, record } = await buildChecked(deps, idea);
    const dateOut = item.dataAsOf !== record.figures_to;
    return { differs: !jsonEqual(latest.structured.ledger, raw), figuresTo: record.figures_to, dateOut, frozen: dateOut && item.visibility === "public" };
  } catch (error) {
    if (error instanceof CaseError) return null;
    throw error;
  }
}

const NOT_READY: Partial<Record<CaseErrorCode, "not_closed" | "void" | "no_lesson" | "exit_pending">> = {
  "case-not-closed": "not_closed",
  "case-void": "void",
  "case-no-lesson": "no_lesson",
  "case-exit-pending": "exit_pending",
};

/** What the idea page says about a case study: an item (draft or public), or why one cannot be drafted yet, or that it can. */
export async function caseStateForIdea(deps: CaseDeps, ideaId: string): Promise<CaseState> {
  if (!isUuid(ideaId)) throw new CaseError("case-not-found");
  const itemId = await deps.cases.findItemForIdea(ideaId);
  if (itemId) {
    const item = await deps.research.getItem(itemId);
    return { state: item?.visibility === "public" ? "public" : "draft", itemId };
  }
  try {
    const { record } = await buildChecked(deps, ideaId);
    return { state: "ready", figuresTo: record.figures_to, earliest: addDays(record.figures_to, PUBLICATION_LAG_DAYS) };
  } catch (error) {
    const reason = error instanceof CaseError ? NOT_READY[error.code] : undefined;
    if (reason) return { state: reason };
    throw error;
  }
}

/** The two owner switches, as the database reads them (the desk says why a case study cannot be published). */
export async function caseSwitches(deps: CaseDeps): Promise<CaseSwitches> {
  return deps.cases.switches();
}

/** What the idea page's "Case study" block needs. Advisory: a failure to read either part gives null for that part, never a guess (a switch that could not be read is not "off"). */
export async function caseBlockFor(deps: CaseDeps, ideaId: string): Promise<{ state: CaseState | null; reveal: boolean | null }> {
  const [state, switches] = await Promise.all([
    caseStateForIdea(deps, ideaId).catch(() => null),
    caseSwitches(deps).catch(() => null),
  ]);
  return { state, reveal: switches ? switches.reveal === true : null };
}
