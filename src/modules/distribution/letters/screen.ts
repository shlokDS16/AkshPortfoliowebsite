import { letterChecks, type LetterCheck } from "./checks";
import { sendState, testCopyLine, type SendFacts, type SendState } from "./status";
import { entriesOf } from "./structured";
import { isPlaceholderSubject } from "./subject";
import type { LetterEntry, SendRow } from "./types";

// Everything the letter page decides from the rows it read (spec s8.1, s8.6): whether the letter is published, which fields are frozen, which
// send controls exist and why one is switched off. Pure and advisory; the database decides every approval again.

export type ScreenInput = {
  title: string;
  visibility: string;
  /** The current (public) revision, or null while the letter is private. */
  currentId: string | null;
  /** The newest revision, or null for a letter with none. */
  latest: { id: string; bodyMd: string; structured: unknown } | null;
  /** This letter's sends, newest first. */
  sends: SendRow[];
  confirmed: number;
  /** Letters are set up. */
  on: boolean;
  /** Revision ids the public site shows now; null when it could not be read. */
  currentRevisionIds: ReadonlySet<string> | null;
};

export type LetterScreen = {
  entries: LetterEntry[];
  subjectIsLabel: boolean;
  /** The newest revision is the public one: the gate passed it and the archive shows it. */
  published: boolean;
  mode: "open" | "public" | "sent";
  state: SendState;
  /** The revision an approval is for: the current one, and only while published. */
  approveRevisionId: string | null;
  canTestCopy: boolean;
  testLine: string | null;
  checks: LetterCheck[];
};

export function letterScreen(i: ScreenInput): LetterScreen {
  const entries = entriesOf(i.latest?.structured) ?? [];
  const subjectIsLabel = isPlaceholderSubject(i.title);
  const published = i.visibility === "public" && i.currentId !== null && i.latest !== null && i.latest.id === i.currentId;
  const facts: SendFacts = { on: i.on, subjectIsLabel, published, confirmed: i.confirmed, sends: i.sends };
  const state = sendState(facts);
  const frozen = state.code === "sending" || state.code === "sent";
  return {
    entries,
    subjectIsLabel,
    published,
    mode: frozen ? "sent" : i.visibility === "public" ? "public" : "open",
    state,
    approveRevisionId: published ? i.currentId : null,
    canTestCopy: i.on && published && !frozen,
    testLine: testCopyLine(i.sends),
    checks: letterChecks({ subject: i.title, note: i.latest?.bodyMd ?? "", entries, currentRevisionIds: i.currentRevisionIds, sends: i.sends }),
  };
}
