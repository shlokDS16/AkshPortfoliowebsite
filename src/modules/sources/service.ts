import { istDate } from "@/lib/dates";
import { isUniqueViolation } from "@/lib/supabase/errors";
import { noteDateLine, repeatAnswer, SAVED_ANSWER } from "./copy";
import { SourceError } from "./errors";
import type { SourcesRepo } from "./repo";
import { MAX_SOURCE_COMPANIES, MAX_SOURCE_CONCEPTS, NOTE_MAX, type SourceFilter, type SourceRecord } from "./types";
import { cleanSourceUrl, urlKey } from "./url-key";

// Saving, changing and archiving a link (spec s6.2). Pure over a SourcesRepo. His note is his: this file only ever stores what he typed,
// or appends what he typed under a dated line; nothing here reads the machine's columns or words them.

export type SaveSourceInput = { url: string; note: string; companyIds: readonly string[]; themeIds: readonly string[] };
export type SaveSourceResult = {
  id: string;
  /** The link was already saved. */
  duplicate: boolean;
  /** When it was first saved (India date), for a repeat. */
  savedOn: string | null;
  noteAdded: boolean;
  restored: boolean;
  /** What the desk says (a fixed sentence, spec s6.1 and s6.2). */
  answer: string;
};

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/** Appends what he typed under a line with the date. The same words already in the note are not added a second time (a retried filing). */
export function appendDatedNote(old: string, added: string, isoDate: string): string {
  const line = `${noteDateLine(isoDate)}\n${added}`;
  return old.trim() === "" ? line : `${old}\n\n${line}`;
}

function checkLists(companyIds: readonly string[], themeIds: readonly string[]): void {
  if (companyIds.length > MAX_SOURCE_COMPANIES) throw new SourceError("source-too-many-companies");
  if (themeIds.length > MAX_SOURCE_CONCEPTS) throw new SourceError("source-too-many-concepts");
}

async function mergeInto(repo: SourcesRepo, existing: SourceRecord, note: string, companyIds: string[], themeIds: string[], now: Date): Promise<SaveSourceResult> {
  const noteAdded = note !== "" && !existing.note.includes(note);
  const merged = noteAdded ? appendDatedNote(existing.note, note, istDate(now)) : existing.note;
  if (merged.length > NOTE_MAX) throw new SourceError("source-note-full");
  const restored = existing.archivedAt !== null;
  if (restored) await repo.setArchived(existing.id, null);
  // As many as fit: the database holds a link to 5 companies and 8 concepts; a repeat never fails for want of room.
  for (const id of companyIds.filter((c) => !existing.companyIds.includes(c)).slice(0, MAX_SOURCE_COMPANIES - existing.companyIds.length)) await repo.addCompany(existing.id, id);
  for (const id of themeIds.filter((t) => !existing.themeIds.includes(t)).slice(0, MAX_SOURCE_CONCEPTS - existing.themeIds.length)) await repo.addConcept(existing.id, id);
  if (noteAdded) await repo.setNote(existing.id, merged);
  const savedOn = istDate(existing.createdAt);
  return { id: existing.id, duplicate: true, savedOn, noteAdded, restored, answer: repeatAnswer(savedOn, noteAdded, restored) };
}

/** Saves a link with his note, or, when it is already saved, adds his note and the new companies and concepts to it. */
export async function saveSource(repo: SourcesRepo, input: SaveSourceInput, now: Date = new Date()): Promise<SaveSourceResult> {
  const url = cleanSourceUrl(input.url);
  const key = urlKey(input.url);
  if (url === null || key === null) throw new SourceError("source-no-link");
  const note = input.note.trim();
  const companyIds = unique(input.companyIds);
  const themeIds = unique(input.themeIds);
  if (note.length > NOTE_MAX) throw new SourceError("source-note-full");
  checkLists(companyIds, themeIds);

  let existing = await repo.findByKey(key.key);
  if (!existing) {
    try {
      const created = await repo.insert({ url, urlKey: key.key, kind: key.kind, youtubeId: key.youtubeId, note });
      for (const id of companyIds) await repo.addCompany(created.id, id);
      for (const id of themeIds) await repo.addConcept(created.id, id);
      return { id: created.id, duplicate: false, savedOn: null, noteAdded: false, restored: false, answer: SAVED_ANSWER };
    } catch (error) {
      // Saved by someone else between the look and the insert (a double press): it is a repeat.
      if (!isUniqueViolation(error)) throw error;
      existing = await repo.findByKey(key.key);
      if (!existing) throw error;
    }
  }
  return mergeInto(repo, existing, note, companyIds, themeIds, now);
}

export type UpdateSourceInput = { note?: string; companyIds?: readonly string[]; themeIds?: readonly string[] };

/** Sets a link's note, companies and concepts to what was sent (a field left out is left as it is). */
export async function updateSource(repo: SourcesRepo, id: string, input: UpdateSourceInput): Promise<void> {
  const current = await repo.get(id);
  if (!current) throw new SourceError("source-not-found");
  const note = input.note === undefined ? undefined : input.note.trim();
  if (note !== undefined && note.length > NOTE_MAX) throw new SourceError("source-note-full");
  const companyIds = input.companyIds === undefined ? undefined : unique(input.companyIds);
  const themeIds = input.themeIds === undefined ? undefined : unique(input.themeIds);
  checkLists(companyIds ?? [], themeIds ?? []);
  // Removals first: a company a public file shows is refused here, before anything else is written.
  for (const c of companyIds === undefined ? [] : current.companyIds.filter((x) => !companyIds.includes(x))) await repo.removeCompany(id, c);
  for (const t of themeIds === undefined ? [] : current.themeIds.filter((x) => !themeIds.includes(x))) await repo.removeConcept(id, t);
  for (const c of (companyIds ?? []).filter((x) => !current.companyIds.includes(x))) await repo.addCompany(id, c);
  for (const t of (themeIds ?? []).filter((x) => !current.themeIds.includes(x))) await repo.addConcept(id, t);
  if (note !== undefined && note !== current.note) await repo.setNote(id, note);
}

/** Puts a link away. Refused (SourceError) while the current public revision of a file shows it. */
export async function archiveSource(repo: SourcesRepo, id: string, now: Date = new Date()): Promise<void> {
  if (!(await repo.get(id))) throw new SourceError("source-not-found");
  await repo.setArchived(id, now.toISOString());
}

export async function restoreSource(repo: SourcesRepo, id: string): Promise<void> {
  if (!(await repo.get(id))) throw new SourceError("source-not-found");
  await repo.setArchived(id, null);
}

/** Newest first. */
export const listSources = (repo: SourcesRepo, filter?: SourceFilter): Promise<SourceRecord[]> => repo.list(filter);
export const getSource = (repo: SourcesRepo, id: string): Promise<SourceRecord | null> => repo.get(id);
