import { isUuid } from "@/lib/ids";
import type { PublicSnapshot } from "@/modules/showcase";
import { addRevision, createItem, getItemWithHistory, updateItemMeta, type ResearchRepo } from "@/modules/research";
import { letterCandidates, toEntry } from "./candidates";
import { LetterError } from "./errors";
import { entriesOf, letterStructured } from "./structured";
import { isPlaceholderSubject, placeholderSubject } from "./subject";
import { MAX_NOTE, MAX_OBJECTIVE, MAX_SUBJECT, type LettersReads, type LettersRpc, type SendKind, type SendRow } from "./types";

// The desk's letter writes (spec s8.1). Each caller has already run requireAdmin(); the actor id is passed on to the database, which
// checks it against the admin's profile again. `on` is whether letters are set up (createLetterPorts is not null): off, nothing that
// could lead to an email is recorded. No function here drafts, shortens or re-words anything of his.

export type LetterDeps = {
  research: ResearchRepo;
  reads: LettersReads;
  rpc: LettersRpc;
  /** Letters are set up (all three settings, production or the local fixture). */
  on: boolean;
  /** The reader-facing contact for questions and complaints (LETTERS_GRIEVANCE_EMAIL); sign-ups cannot open without one. Unset means no. */
  contact?: string | null;
  /** The public site as it is now (a fresh read, not the hour's cache). */
  snapshot: () => Promise<PublicSnapshot>;
  today: () => string;
};

/** "Make this letter": the ticked changes, copied as they are on the site, in a private item. The subject is a label for him to replace. */
export async function makeLetter(deps: LetterDeps, revisionIds: readonly string[]): Promise<{ itemId: string }> {
  const wanted = [...new Set(revisionIds)];
  if (wanted.length === 0) throw new LetterError("letter-nothing-ticked");
  const snapshot = await deps.snapshot();
  const passes = await deps.reads.passTimes(snapshot.items.map((i) => i.revisionId));
  const offered = letterCandidates(snapshot, passes, await deps.reads.lastSentAt(), deps.today());
  // In the order of the letter, not of the ticks; a tick that is not on the list (sent already, not public now, invented) refuses all.
  const chosen = offered.filter((c) => wanted.includes(c.revisionId));
  if (chosen.length !== wanted.length) throw new LetterError("letter-entry-stale");
  const { item } = await createItem(deps.research, {
    kind: "letter",
    title: placeholderSubject(deps.today()),
    bodyMd: "",
    structured: { ...letterStructured(chosen.map(toEntry)) },
    learningObjective: null,
  });
  return { itemId: item.id };
}

export type LetterInput = { subject: string; objective: string; note: string };

/**
 * "Save": the subject (the item's title), the one sentence (its objective) and the note (the body of a new revision that carries the
 * entries as they were). Stored as typed. A public letter's subject and sentence are frozen (unpublish it first); a new note then waits
 * for the gate like any other revision. Nothing is written when anything is out of bounds.
 */
export async function saveLetter(deps: LetterDeps, itemId: string, input: LetterInput): Promise<{ changed: boolean; pendingGate: boolean }> {
  const subject = input.subject.trim();
  if (subject.length < 1 || subject.length > MAX_SUBJECT) throw new LetterError("letter-subject-length");
  const objective = input.objective.trim();
  if (objective.length > MAX_OBJECTIVE) throw new LetterError("letter-objective-length");
  if (input.note.length > MAX_NOTE) throw new LetterError("letter-note-length");

  const history = isUuid(itemId) ? await getItemWithHistory(deps.research, itemId) : null;
  const latest = history?.revisions[0];
  if (!history || history.item.kind !== "letter" || !latest || !entriesOf(latest.structured)) throw new LetterError("letter-not-found");

  const wantedObjective = objective === "" ? null : objective;
  const metaChanged = history.item.title !== subject || history.item.learningObjective !== wantedObjective;
  const noteChanged = latest.bodyMd !== input.note;
  if (!metaChanged && !noteChanged) return { changed: false, pendingGate: history.item.currentRevisionId !== latest.id };
  if (metaChanged) await updateItemMeta(deps.research, itemId, { title: subject, learningObjective: wantedObjective });
  if (!noteChanged) return { changed: true, pendingGate: history.item.currentRevisionId !== latest.id };
  const revision = await addRevision(deps.research, { itemId, bodyMd: input.note, structured: latest.structured, changeReason: null, author: "aksh" });
  return { changed: true, pendingGate: revision.pendingGate };
}

const requireOn = (deps: LetterDeps) => {
  if (!deps.on) throw new LetterError("letters-off");
};

/**
 * "Send to {n} subscribers" / "Send me a test copy": records the approval (the audit row). Off, nothing is recorded. A send to readers
 * needs the "I have read the preview" tick and at least one confirmed reader; the database then re-checks the letter, the gate decision
 * and every entry before it writes the row, and again when the step claims it.
 */
export async function approveSend(deps: LetterDeps, actor: string, itemId: string, revisionId: string, kind: SendKind, readTick: boolean): Promise<SendRow> {
  requireOn(deps);
  if (!isUuid(itemId) || !isUuid(revisionId)) throw new LetterError("letter-not-found");
  if (kind === "subscribers") {
    if (!readTick) throw new LetterError("letter-read-required");
    if ((await deps.reads.confirmedCount()) === 0) throw new LetterError("letter-no-readers");
    // The screen keeps Send off while the subject is the label; this keeps a crafted press from emailing it. A missing item is the database's to refuse.
    const found = await getItemWithHistory(deps.research, itemId);
    if (found && found.item.kind === "letter" && isPlaceholderSubject(found.item.title)) throw new LetterError("letter-subject-label");
  }
  return deps.rpc.approve(actor, itemId, revisionId, kind);
}

export async function cancelSend(deps: LetterDeps, actor: string, sendId: string): Promise<SendRow> {
  if (!isUuid(sendId)) throw new LetterError("letter-send-not-found");
  return deps.rpc.cancel(actor, sendId);
}

/** Turning sign-ups on needs letters set up and the contact for complaints set (the notice names it); turning them off is always allowed. */
export async function setSignup(deps: LetterDeps, actor: string, on: boolean): Promise<boolean> {
  if (on) {
    requireOn(deps);
    if (!deps.contact) throw new LetterError("letter-signup-contact");
  }
  return deps.rpc.setSignup(actor, on);
}

export async function binRequests(deps: LetterDeps, actor: string, ids: readonly string[]): Promise<number> {
  const valid = [...new Set(ids.filter(isUuid))];
  return valid.length === 0 ? 0 : deps.rpc.bin(actor, valid);
}

/** "Erase an address" (a request received by email): the same answer whether or not the address was known. */
export async function eraseReader(deps: LetterDeps, actor: string, email: string): Promise<number> {
  const id = await deps.reads.readerIdByEmail(email);
  return id === null ? 0 : deps.rpc.erase(actor, id);
}
