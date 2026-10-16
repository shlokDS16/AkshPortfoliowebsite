import { LETTER_ERROR_TEXT } from "@/lib/messages-letters";
import { isPlaceholderSubject } from "./subject";
import { MAX_NOTE, MAX_SUBJECT, type LetterEntry, type SendRow } from "./types";

// The rule 13 rows of the publish checklist (spec s8.4, s15). Advisory and pure: the database gate (migration 0025) decides and records, and
// these rows read the same as its refusals. They are added to the rows the gate preview already gives, as the video page adds rule 12.

export type LetterFacts = {
  subject: string;
  note: string;
  entries: LetterEntry[];
  /** The revision ids the public site shows now; null when the public site could not be read. */
  currentRevisionIds: ReadonlySet<string> | null;
  /** This letter's sends, any kind. */
  sends: SendRow[];
};
export type LetterCheck = { id: string; name: string; state: "pass" | "fail" | "manual"; detail: string };

const check = (id: string, name: string, state: LetterCheck["state"], detail: string): LetterCheck => ({ id, name, state, detail });

function subjectAndNote(f: LetterFacts): LetterCheck {
  const name = "Subject and note";
  if (isPlaceholderSubject(f.subject)) return check("rule-13-1", name, "fail", LETTER_ERROR_TEXT["letter-subject-label"]);
  if (f.subject.trim().length < 1 || f.subject.length > MAX_SUBJECT) return check("rule-13-1", name, "fail", LETTER_ERROR_TEXT["letter-subject-length"]);
  if (f.note.length > MAX_NOTE) return check("rule-13-1", name, "fail", LETTER_ERROR_TEXT["letter-note-length"]);
  return check("rule-13-1", name, "pass", "The subject is your own and the note is within its limit.");
}

function entriesCurrent(f: LetterFacts): LetterCheck {
  const name = "Entries are current";
  const total = f.entries.length;
  if (total === 0) return check("rule-13-2", name, "fail", "A letter needs at least one entry.");
  if (f.currentRevisionIds === null) return check("rule-13-2", name, "manual", "The public site could not be read just now. The gate decides.");
  const stale = f.entries.filter((e) => !f.currentRevisionIds?.has(e.revisionId)).length;
  if (stale === 0) return check("rule-13-2", name, "pass", `${total === 1 ? "The entry is" : `All ${total} entries are`} the current public version of ${total === 1 ? "its page" : "their pages"}.`);
  if (total === 1) return check("rule-13-2", name, "fail", "The entry is no longer the current public version of its page.");
  const verb = stale === 1 ? "is no longer the current public version of its page" : "are no longer the current public version of their pages";
  return check("rule-13-2", name, "fail", `${stale} of ${total} entries ${verb}.`);
}

function companies(f: LetterFacts): LetterCheck {
  const name = "Companies named";
  const named = [...new Set(f.entries.flatMap((e) => (e.companyName === null ? [] : [e.companyName])))];
  if (named.length === 0) return check("rule-13-3", name, "pass", "No entry names a company.");
  return check("rule-13-3", name, "manual", `Entries name ${named.join(", ")}. The gate checks the ledger for each company before it passes.`);
}

function notSentYet(f: LetterFacts): LetterCheck {
  const name = "Not sent before";
  const gone = f.sends.some((s) => s.kind === "subscribers" && ["approved", "sending", "sent"].includes(s.status));
  return gone
    ? check("rule-13-4", name, "fail", "This letter was already sent. A sent letter cannot be published again.")
    : check("rule-13-4", name, "pass", "No send to readers has been approved.");
}

export function letterChecks(f: LetterFacts): LetterCheck[] {
  return [subjectAndNote(f), entriesCurrent(f), companies(f), notSentYet(f)];
}
