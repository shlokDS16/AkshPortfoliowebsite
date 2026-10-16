import { addDays, istDayStartUtc, PUBLICATION_LAG_DAYS } from "@/lib/dates";
import type { PublicItemRow, PublicSnapshot } from "@/modules/showcase";
import { caseHref, describeRevision, ledgerCases, listedVideos, publicFiles, publicOrdinal, servedFiles } from "@/modules/showcase/client";
import { MAX_ENTRIES, type Candidate, type EntryKind, type LetterEntry } from "./types";

// Spec s8.3 (D83-D85): "what changed since your last letter", computed on read from the public snapshot. There is no stored draft and
// nothing is written here. An entry copies his title, objective and change reason EXACTLY as the public site holds them (no trimming, no
// case change, no cut: an entry too long for the email is shown whole), plus the machine's own line. No sentence diff, no figure, no chart.

const DAY_MS = 86_400_000;
const FIRST_LETTER_DAYS = 14;
const GROUP: Record<EntryKind, number> = { file: 0, case: 1, learning: 2, process: 3, video: 4 };

/**
 * The instant an item became readable by the public: its pass time, or the start of the IST day its 30-day lag ends, whichever is later.
 * (The database applies the same lag to `public_items`; this only dates it.)
 */
function visibleFromMs(passedAt: string, dataAsOf: string | null): number {
  const lag = dataAsOf ? Date.parse(istDayStartUtc(addDays(dataAsOf, PUBLICATION_LAG_DAYS))) : 0;
  return Math.max(Date.parse(passedAt), lag);
}

/** Every public item that has a page, as [kind, item], one per page. Only what the snapshot holds can be offered. */
function pages(s: PublicSnapshot): [EntryKind, PublicItemRow][] {
  return [
    ...servedFiles(s).map((f): [EntryKind, PublicItemRow] => ["file", f.item]),
    ...ledgerCases(s).map((c): [EntryKind, PublicItemRow] => ["case", c.item]),
    ...s.items.filter((i) => i.kind === "learning").map((i): [EntryKind, PublicItemRow] => ["learning", i]),
    ...s.items.filter((i) => i.kind === "process").map((i): [EntryKind, PublicItemRow] => ["process", i]),
    ...listedVideos(s).map((v): [EntryKind, PublicItemRow] => ["video", v.item]),
  ];
}

function describe(s: PublicSnapshot, all: ReturnType<typeof publicFiles>, kind: EntryKind, item: PublicItemRow): { path: string; revNo: number; detail: string; changeReason: string | null } | null {
  const rev = s.revisions.find((r) => r.id === item.revisionId);
  if (!rev) return null;
  if (kind === "case") {
    const revNo = publicOrdinal(s, item).revNo;
    return { path: caseHref(item.slug), revNo, detail: `Closed case · R${revNo}`, changeReason: rev.changeReason };
  }
  const described = describeRevision(s, all, rev);
  return described ? { path: described.path, revNo: described.n, detail: described.entry.detail, changeReason: rev.changeReason } : null;
}

function allCandidates(s: PublicSnapshot, passTimes: ReadonlyMap<string, string>, lastSentAt: string | null, today: string): Candidate[] {
  const baseline = lastSentAt !== null ? Date.parse(lastSentAt) : Date.parse(istDayStartUtc(today)) - FIRST_LETTER_DAYS * DAY_MS;
  if (Number.isNaN(baseline)) return [];
  const all = publicFiles(s);
  const found: (Candidate & { at: number })[] = [];
  for (const [kind, item] of pages(s)) {
    const passedAt = passTimes.get(item.revisionId);
    if (passedAt === undefined || Number.isNaN(Date.parse(passedAt))) continue;
    const at = visibleFromMs(passedAt, item.dataAsOf);
    if (at <= baseline) continue;
    const company = item.companyId === null ? null : s.companies.find((c) => c.id === item.companyId) ?? undefined;
    if (company === undefined) continue; // names a company the public cannot read: the gate would refuse the copy, so it is not offered
    const line = describe(s, all, kind, item);
    if (!line) continue;
    found.push({
      itemId: item.id, revisionId: item.revisionId, kind, path: line.path, revNo: line.revNo, detail: line.detail,
      title: item.title, learningObjective: item.learningObjective, changeReason: line.changeReason,
      holdsPosition: company ? item.holdsPosition : null, companyName: company ? company.name : null,
      visibleFrom: new Date(at).toISOString(), at,
    });
  }
  // Files keep their number order (the snapshot lists them that way); the rest go by when they became visible, then by page.
  return found
    .map((c, order) => ({ c, order }))
    .sort((a, b) => GROUP[a.c.kind] - GROUP[b.c.kind] || (a.c.kind === "file" ? a.order - b.order : a.c.at - b.c.at || a.c.path.localeCompare(b.c.path)))
    .map(({ c }) => ({ ...c, at: undefined }) as Candidate);
}

/** The offered entries: at most 20, in the order of the letter. `lastSentAt` null means the last 14 days. */
export function letterCandidates(s: PublicSnapshot, passTimes: ReadonlyMap<string, string>, lastSentAt: string | null, today: string, limit: number = MAX_ENTRIES): Candidate[] {
  return allCandidates(s, passTimes, lastSentAt, today).filter((_, n) => n < limit);
}

/** How many changes there really are (the desk home line "Letter: {n} changes since your last letter"), before the 20 cut. */
export function countCandidates(s: PublicSnapshot, passTimes: ReadonlyMap<string, string>, lastSentAt: string | null, today: string): number {
  return allCandidates(s, passTimes, lastSentAt, today).length;
}

/** What is stored in `structured.entries`: the entry without the desk-only fields. */
export function toEntry(c: Candidate): LetterEntry {
  return {
    revisionId: c.revisionId, kind: c.kind, path: c.path, revNo: c.revNo, detail: c.detail, title: c.title, learningObjective: c.learningObjective,
    changeReason: c.changeReason, holdsPosition: c.holdsPosition, companyName: c.companyName,
  };
}
