import { isRecord } from "@/lib/records";
import { HOLDS_POSITIONS } from "@/modules/research";
import { LETTER_SCHEMA, MAX_ENTRIES, type EntryKind, type LetterEntry, type LetterStructured } from "./types";

// The letter's record (`structured`): `letter/1` and its entries. The database gate (migration 0025, 13.2) reads the same shape; this
// side refuses to build an email from a record that does not have it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A page of this site, as the gate allows it: never another address. */
export const PAGE_PATH = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const KINDS: readonly string[] = ["file", "case", "learning", "process", "video"] satisfies EntryKind[];
const nullableString = (v: unknown): v is string | null => v === null || typeof v === "string";

export function letterStructured(entries: readonly LetterEntry[]): LetterStructured {
  return { schema: LETTER_SCHEMA, entries: [...entries] };
}

function entryOf(value: unknown): LetterEntry | null {
  if (!isRecord(value)) return null;
  const v = value;
  const { revisionId, kind, path, revNo, detail, title, learningObjective, changeReason, holdsPosition, companyName } = v;
  if (typeof revisionId !== "string" || !UUID.test(revisionId)) return null;
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (typeof path !== "string" || !PAGE_PATH.test(path)) return null;
  if (typeof revNo !== "number" || !Number.isInteger(revNo) || revNo < 1) return null;
  if (typeof detail !== "string" || typeof title !== "string") return null;
  if (!nullableString(learningObjective) || !nullableString(changeReason) || !nullableString(companyName)) return null;
  if (holdsPosition !== null && !(typeof holdsPosition === "string" && (HOLDS_POSITIONS as readonly string[]).includes(holdsPosition))) return null;
  return { revisionId, kind: kind as EntryKind, path, revNo, detail, title, learningObjective, changeReason, holdsPosition: holdsPosition as LetterEntry["holdsPosition"], companyName };
}

/** The entries of a `letter/1` record, each with only the fields this module knows; null when the record, or any entry, is not whole. */
export function entriesOf(structured: unknown): LetterEntry[] | null {
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
