import { istDate } from "@/lib/dates";
import { jobDbError } from "@/lib/supabase/errors";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Db } from "@/lib/supabase/types";
import type { PublicSnapshot } from "@/modules/showcase";
import { createSupabaseShowcaseRepo, loadSnapshot } from "@/modules/showcase/client";
import { countCandidates, letterCandidates } from "./candidates";
import { isMondayInIndia, mondayLine } from "./monday";
import { createSupabaseLettersReads } from "./repo";
import { isPlaceholderSubject } from "./subject";
import type { LetterListRow } from "./status";
import type { Candidate, LettersReads } from "./types";

// What the letters screens read, through Aksh's own session. Read only. A fresh snapshot, not the hour's cache: "what changed since the last
// letter" must not lag behind a publish he made a minute ago.

export type CandidateRead = { candidates: Candidate[]; total: number; today: string };
export type CandidateDeps = { reads: LettersReads; snapshot: () => Promise<PublicSnapshot>; today: string };

export async function readCandidates(deps: CandidateDeps): Promise<CandidateRead> {
  const snapshot = await deps.snapshot();
  const passes = await deps.reads.passTimes(snapshot.items.map((i) => i.revisionId));
  const last = await deps.reads.lastSentAt();
  return {
    candidates: letterCandidates(snapshot, passes, last, deps.today),
    total: countCandidates(snapshot, passes, last, deps.today),
    today: deps.today,
  };
}

/** The same read wired to the database: his session for the passes and the last send, the anonymous client for the public snapshot. */
export function readCandidatesNow(db: Db, now: Date = new Date()): Promise<CandidateRead> {
  const today = istDate(now);
  return readCandidates({
    reads: createSupabaseLettersReads(db, () => now),
    snapshot: () => loadSnapshot(createSupabaseShowcaseRepo(createSupabasePublicClient()), today),
    today,
  });
}

/** The desk home's Monday prompt: reads nothing on any other day. The count is of every change, not only the twenty a letter can hold. */
export async function mondayLetterLine(db: Db, now: Date = new Date(), read: typeof readCandidatesNow = readCandidatesNow): Promise<string | null> {
  if (!isMondayInIndia(now)) return null;
  return mondayLine(now, (await read(db, now)).total);
}

/** The revision ids the public site shows now (an entry must be one of them); null when the public site cannot be read, so the row is left to the gate. */
export async function publicRevisionIds(snapshot: () => Promise<PublicSnapshot>): Promise<ReadonlySet<string> | null> {
  try {
    return new Set((await snapshot()).items.map((i) => i.revisionId));
  } catch (error) {
    console.error("letters: could not read the public site", error instanceof Error ? error.name : typeof error); // the name only
    return null;
  }
}

/** The same, read now. */
export const publicRevisionIdsNow = (now: Date = new Date()) =>
  publicRevisionIds(() => loadSnapshot(createSupabaseShowcaseRepo(createSupabasePublicClient()), istDate(now)));

export type LetterRow = LetterListRow & { subjectIsLabel: boolean };

/** Every letter, newest first, with its sends (a few dozen at most): two reads however many there are. */
export async function listLetterRows(db: Db, reads: LettersReads = createSupabaseLettersReads(db), limit = 100): Promise<LetterRow[]> {
  const { data, error } = await db.from("items").select("id, title, visibility, created_at").eq("kind", "letter").order("created_at", { ascending: false }).limit(limit);
  if (error) throw jobDbError("letters.listItems", error);
  const items = data ?? [];
  const sends = await reads.sendsForItems(items.map((i) => i.id));
  return items.map((i) => ({
    itemId: i.id, title: i.title, visibility: i.visibility, createdAt: i.created_at, subjectIsLabel: isPlaceholderSubject(i.title),
    sends: sends.filter((s) => s.itemId === i.id),
  }));
}
