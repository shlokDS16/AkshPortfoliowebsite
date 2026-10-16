import { istDate } from "@/lib/dates";
import { isRecord } from "@/lib/records";
import { isLagged } from "@/modules/casefile";
import { LETTER_KIND_LABEL, LETTER_POSITION_WORD } from "@/modules/distribution/public";
import type { PublicItemRow, PublicSnapshot } from "./types";
import { listedVideos } from "./video-list";

// Plan 5c (spec s8.4, s8.9). A letter is listed only when ALL of these hold, each re-checked here though the gate (migration 0025) insists on
// them (defence in depth, as `listedVideos` does): the item is of kind letter with no company, theme or data_as_of; its title is 1 to 120
// characters, its sentence is present and its note at most 4,000; its record is `letter/1` with 1 to 20 whole entries. Each entry is shown only
// while the page it came from is still public in this snapshot (revision present, a video still listed, a dated page past the 30-day lag):
// a page that was unpublished after the letter is not repeated in the archive. If none is left the letter is not listed at all.
// This module reads the snapshot and nothing else, so no reader, address or send can appear in what it returns.

const LETTER_SCHEMA = "letter/1";
const MAX_ENTRIES = 20;
/** A page of this site, as the gate allows it: never another address. Restates letters/structured.ts (the public side may not import it). */
const PAGE_PATH = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const KINDS = Object.keys(LETTER_KIND_LABEL) as (keyof typeof LETTER_KIND_LABEL)[];
const POSITIONS = Object.keys(LETTER_POSITION_WORD) as (keyof typeof LETTER_POSITION_WORD)[];

export type LetterEntry = {
  revisionId: string; kind: keyof typeof LETTER_KIND_LABEL; path: string; revNo: number; detail: string; title: string;
  changeReason: string | null; holdsPosition: keyof typeof LETTER_POSITION_WORD | null; companyName: string | null;
};
export type ListedLetter = { item: PublicItemRow; entries: LetterEntry[] };

export const letterHref = (slug: string) => `/letters/${slug}`;

const nullableString = (v: unknown): v is string | null => v === null || typeof v === "string";

function entryOf(value: unknown): LetterEntry | null {
  if (!isRecord(value)) return null;
  const { revisionId, kind, path, revNo, detail, title, learningObjective, changeReason, holdsPosition, companyName } = value;
  if (typeof revisionId !== "string" || revisionId === "" || revisionId.length > 64) return null;
  if (typeof kind !== "string" || !(KINDS as string[]).includes(kind)) return null;
  if (typeof path !== "string" || !PAGE_PATH.test(path)) return null;
  if (typeof revNo !== "number" || !Number.isInteger(revNo) || revNo < 1) return null;
  if (typeof detail !== "string" || typeof title !== "string" || title === "") return null;
  if (!nullableString(learningObjective) || !nullableString(changeReason) || !nullableString(companyName)) return null;
  if (holdsPosition !== null && !(typeof holdsPosition === "string" && (POSITIONS as string[]).includes(holdsPosition))) return null;
  return { revisionId, kind: kind as LetterEntry["kind"], path, revNo, detail, title, changeReason, holdsPosition: holdsPosition as LetterEntry["holdsPosition"], companyName };
}

function entriesOf(structured: unknown): LetterEntry[] | null {
  if (!isRecord(structured) || structured.schema !== LETTER_SCHEMA || !Array.isArray(structured.entries)) return null;
  const raw: unknown[] = structured.entries;
  if (raw.length < 1 || raw.length > MAX_ENTRIES) return null;
  const out: LetterEntry[] = [];
  for (const one of raw) {
    const entry = entryOf(one);
    if (!entry) return null;
    out.push(entry);
  }
  return out;
}

/** The page an entry came from is still public here: its revision is in the snapshot, it is not a letter, a video is still listed, a dated page is past the lag. */
function stillPublic(s: PublicSnapshot, listedVideoIds: Set<string>, entry: LetterEntry): boolean {
  const revision = s.revisions.find((r) => r.id === entry.revisionId);
  const item = revision ? s.items.find((i) => i.id === revision.itemId) : undefined;
  if (!item || item.kind === "letter") return false;
  if (item.kind === "video" && !listedVideoIds.has(item.id)) return false;
  return item.dataAsOf === null || isLagged(item.dataAsOf, s.today);
}

const wellFormed = (item: PublicItemRow): boolean =>
  item.kind === "letter" && item.companyId === null && item.themeId === null && item.dataAsOf === null &&
  Array.from(item.title).length >= 1 && Array.from(item.title).length <= 120 &&
  (item.learningObjective ?? "").trim() !== "" && Array.from(item.bodyMd).length <= 4000;

/** Every letter the public can open, newest first. */
export function listedLetters(s: PublicSnapshot): ListedLetter[] {
  const videoIds = new Set(listedVideos(s).map((v) => v.item.id));
  return s.items
    .flatMap((item): ListedLetter[] => {
      if (!wellFormed(item)) return [];
      const all = entriesOf(item.structured);
      const entries = all?.filter((e) => stillPublic(s, videoIds, e)) ?? [];
      return entries.length > 0 ? [{ item, entries }] : [];
    })
    .sort((a, b) => firstOn(s, b.item).localeCompare(firstOn(s, a.item)) || b.item.revisedAt.localeCompare(a.item.revisedAt));
}

export const hasLetters = (s: PublicSnapshot) => listedLetters(s).length > 0;

/** The day the letter first passed the gate: the date of its first public revision (the earliest `created_at` among its gated revisions). */
export function firstOn(s: PublicSnapshot, item: PublicItemRow): string {
  const first = s.revisions.filter((r) => r.itemId === item.id).map((r) => r.createdAt).sort()[0];
  return istDate(first ?? item.publishedAt);
}

