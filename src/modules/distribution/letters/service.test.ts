import { beforeEach, describe, expect, it } from "vitest";
import { PublicItemLockedError } from "@/lib/errors";
import { buildRichSnapshot } from "@/test/fakes/showcase-snapshot";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { addRevision } from "@/modules/research";
import { LetterError, type LetterErrorCode } from "./errors";
import { approveSend, binRequests, cancelSend, eraseReader, makeLetter, saveLetter, setSignup, type LetterDeps } from "./service";
import { ADMIN, createFakeRpc, fakeReads, type FakeReads, type FakeRpc } from "@/test/fakes/letters-kit";
import { entriesOf } from "./structured";

const TODAY = "2026-10-06";
const ITEM = "10000000-0000-4000-8000-000000000001";
const REV = "20000000-0000-4000-8000-000000000001";
let research: MemoryResearchRepo;
let rpc: FakeRpc;
let reads: FakeReads;
let deps: LetterDeps;

async function refusal(run: () => Promise<unknown>): Promise<LetterErrorCode> {
  try {
    await run();
  } catch (error) {
    if (error instanceof LetterError) return error.code;
    throw error;
  }
  throw new Error("expected a LetterError");
}

// The fixture's revision ids are short words; a letter's record needs real ids, so each is mapped to a stable uuid.
const uuids = new Map<string, string>();
const uid = (id: string): string => uuids.get(id) ?? (uuids.set(id, `00000000-0000-4000-8000-${String(uuids.size + 1).padStart(12, "0")}`), uuids.get(id) as string);
function snapshotWithUuids() {
  const s = buildRichSnapshot();
  return { ...s, items: s.items.map((i) => ({ ...i, revisionId: uid(i.revisionId) })), revisions: s.revisions.map((r) => ({ ...r, id: uid(r.id) })) };
}

beforeEach(() => {
  research = createMemoryResearchRepo();
  rpc = createFakeRpc();
  reads = fakeReads(rpc);
  const snapshot = snapshotWithUuids();
  for (const item of snapshot.items) reads.passes.set(item.revisionId, "2026-10-01T05:00:00Z");
  reads.last = "2026-09-30T05:00:00Z";
  deps = { research, reads, rpc, on: true, snapshot: async () => snapshot, today: () => TODAY };
});

describe("makeLetter: the ticked changes become a private letter, copied verbatim", () => {
  it("creates one private item of kind letter whose record holds exactly the ticked entries, in the order of the letter", async () => {
    const { itemId } = await makeLetter(deps, [uid("rn0"), uid("r2a"), uid("r1b")]);
    const item = research.items.get(itemId)!;
    expect(item).toMatchObject({ kind: "letter", visibility: "private", companyId: null, themeId: null, dataAsOf: null, learningObjective: null });
    expect(item.title).toBe("Untitled letter, 6 Oct 2026");
    const [revision] = research.revisions.filter((r) => r.itemId === itemId);
    expect(revision!.bodyMd).toBe("");
    const entries = entriesOf(revision!.structured)!;
    expect(entries.map((e) => e.revisionId)).toEqual([uid("r1b"), uid("r2a"), uid("rn0")]);
    expect(entries.map((e) => e.kind)).toEqual(["file", "file", "learning"]);
    const source = snapshotWithUuids().items.find((i) => i.id === "n0")!;
    expect(entries[2]).toMatchObject({ title: source.title, learningObjective: source.learningObjective });
  });

  it("refuses an empty choice", async () => {
    expect(await refusal(() => makeLetter(deps, []))).toBe("letter-nothing-ticked");
    expect(research.items.size).toBe(0);
  });

  it("refuses a change that is not on the list (already sent, not public, or invented), and creates nothing", async () => {
    reads.last = "2026-10-02T05:00:00Z"; // everything was in the last letter
    expect(await refusal(() => makeLetter(deps, [uid("rn0")]))).toBe("letter-entry-stale");
    reads.last = "2026-09-30T05:00:00Z";
    expect(await refusal(() => makeLetter(deps, [uid("rn0"), "a-forged-id"]))).toBe("letter-entry-stale");
    expect(research.items.size).toBe(0);
  });
});

describe("saveLetter: his subject, one sentence and note", () => {
  let itemId: string;
  beforeEach(async () => {
    itemId = (await makeLetter(deps, [uid("rn0"), uid("r1b")])).itemId;
  });
  const input = { subject: "What changed this month", objective: "Two things moved.", note: "A short note.\n\nSecond paragraph." };

  it("sets the subject and objective on the item and the note on a new revision that keeps the entries as they were", async () => {
    const before = research.revisions.filter((r) => r.itemId === itemId)[0]!;
    expect(await saveLetter(deps, itemId, input)).toEqual({ changed: true, pendingGate: false });
    const item = research.items.get(itemId)!;
    expect(item).toMatchObject({ title: input.subject, learningObjective: input.objective });
    const revisions = research.revisions.filter((r) => r.itemId === itemId);
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({ bodyMd: input.note, author: "aksh" });
    expect(revisions[1]!.structured).toEqual(before.structured);
    expect(item.currentRevisionId).toBe(revisions[1]!.id);
  });

  it("stores his words exactly as typed, spacing and all", async () => {
    const note = "  Indented first line.  \n\n\n   Second, after two blank lines.  ";
    await saveLetter(deps, itemId, { ...input, note });
    expect(research.revisions.at(-1)!.bodyMd).toBe(note);
  });

  it("changes nothing, and adds no revision, when it says what it already says", async () => {
    await saveLetter(deps, itemId, input);
    expect(await saveLetter(deps, itemId, input)).toEqual({ changed: false, pendingGate: false });
    expect(research.revisions.filter((r) => r.itemId === itemId)).toHaveLength(2);
  });

  it("refuses an over-long subject, one sentence or note, or an empty subject, and writes nothing", async () => {
    const before = research.revisions.length;
    expect(await refusal(() => saveLetter(deps, itemId, { ...input, subject: "" }))).toBe("letter-subject-length");
    expect(await refusal(() => saveLetter(deps, itemId, { ...input, subject: "x".repeat(121) }))).toBe("letter-subject-length");
    expect(await refusal(() => saveLetter(deps, itemId, { ...input, objective: "x".repeat(301) }))).toBe("letter-objective-length");
    expect(await refusal(() => saveLetter(deps, itemId, { ...input, note: "x".repeat(4001) }))).toBe("letter-note-length");
    expect(research.revisions).toHaveLength(before);
    expect(research.items.get(itemId)!.title).toBe("Untitled letter, 6 Oct 2026");
  });

  it("takes the longest allowed values", async () => {
    await saveLetter(deps, itemId, { subject: "s".repeat(120), objective: "o".repeat(300), note: "n".repeat(4000) });
    expect(research.items.get(itemId)!.title).toHaveLength(120);
  });

  it("an empty objective is none yet (the gate asks for it), not an error", async () => {
    await saveLetter(deps, itemId, { ...input, objective: "" });
    expect(research.items.get(itemId)!.learningObjective).toBeNull();
  });

  it("is not a way to edit any other item", async () => {
    const note = await research.insertItem({ kind: "learning", title: "A note", companyId: null, themeId: null, learningObjective: null });
    expect(await refusal(() => saveLetter(deps, note.id, input))).toBe("letter-not-found");
    expect(await refusal(() => saveLetter(deps, "not-an-id", input))).toBe("letter-not-found");
  });

  it("on a public letter the subject is frozen (unpublish first), and a new note waits for the gate", async () => {
    research.setVisibility(itemId, "public");
    await expect(saveLetter(deps, itemId, input)).rejects.toThrow(PublicItemLockedError);
    const changedNote = await saveLetter(deps, itemId, { subject: research.items.get(itemId)!.title, objective: "", note: "Only the note." });
    expect(changedNote).toEqual({ changed: true, pendingGate: true });
  });

  it("keeps working from the newest revision's entries after a change by another path", async () => {
    await addRevision(research, { itemId, bodyMd: "x", structured: research.revisions.filter((r) => r.itemId === itemId)[0]!.structured, changeReason: null });
    await saveLetter(deps, itemId, input);
    expect(entriesOf(research.revisions.at(-1)!.structured)).not.toBeNull();
  });
});

describe("approveSend: the press that writes the audit row", () => {
  it("with letters off it refuses and asks the database for nothing", async () => {
    expect(await refusal(() => approveSend({ ...deps, on: false }, ADMIN, ITEM, REV, "subscribers", true))).toBe("letters-off");
    expect(await refusal(() => approveSend({ ...deps, on: false }, ADMIN, ITEM, REV, "self_test", true))).toBe("letters-off");
    expect(rpc.calls).toEqual([]);
  });

  it("a send to readers needs the 'I have read the preview' tick, and a reader to send to", async () => {
    rpc.addReader("a@example.com");
    expect(await refusal(() => approveSend(deps, ADMIN, ITEM, REV, "subscribers", false))).toBe("letter-read-required");
    rpc.readers.length = 0;
    expect(await refusal(() => approveSend(deps, ADMIN, ITEM, REV, "subscribers", true))).toBe("letter-no-readers");
    expect(rpc.calls).toEqual([]);
  });

  it("records one approval for exactly that letter and revision", async () => {
    rpc.addReader("a@example.com");
    const row = await approveSend(deps, ADMIN, ITEM, REV, "subscribers", true);
    expect(row).toMatchObject({ itemId: ITEM, revisionId: REV, kind: "subscribers", status: "approved", recipientsAtApproval: 1 });
    expect(rpc.calls).toEqual(["approve"]);
  });

  it("a send to readers is refused while the subject is still the label the desk gave, and records nothing", async () => {
    rpc.addReader("a@example.com");
    const { itemId } = await makeLetter(deps, [uid("rn0")]);
    expect(await refusal(() => approveSend(deps, ADMIN, itemId, REV, "subscribers", true))).toBe("letter-subject-label");
    expect(rpc.calls).toEqual([]);
    // A test copy is how he reads it before choosing a subject, so it is allowed.
    expect(await approveSend(deps, ADMIN, itemId, REV, "self_test", false)).toMatchObject({ kind: "self_test" });
    // Once the subject is his own, the same press goes to the database.
    await saveLetter(deps, itemId, { subject: "What changed in October", objective: "", note: "" });
    expect(await approveSend(deps, ADMIN, itemId, REV, "subscribers", true)).toMatchObject({ kind: "subscribers", status: "approved" });
  });

  it("a test copy needs neither the tick nor a reader", async () => {
    expect(await approveSend(deps, ADMIN, ITEM, REV, "self_test", false)).toMatchObject({ kind: "self_test", status: "approved" });
  });

  it("a request that is not shaped like ids never reaches the database", async () => {
    expect(await refusal(() => approveSend(deps, ADMIN, "x", REV, "self_test", true))).toBe("letter-not-found");
    expect(await refusal(() => approveSend(deps, ADMIN, ITEM, "y", "self_test", true))).toBe("letter-not-found");
    expect(rpc.calls).toEqual([]);
  });
});

describe("the other desk writes", () => {
  it("cancels a send that is still waiting, and only that", async () => {
    rpc.addReader("a@example.com");
    const row = await approveSend(deps, ADMIN, ITEM, REV, "subscribers", true);
    expect((await cancelSend(deps, ADMIN, row.id)).status).toBe("cancelled");
    expect(await refusal(() => cancelSend(deps, ADMIN, row.id))).toBe("letter-cannot-cancel");
    expect(await refusal(() => cancelSend(deps, ADMIN, "nope"))).toBe("letter-send-not-found");
  });

  it("switches sign-up on only while letters are on, and off at any time", async () => {
    expect(await refusal(() => setSignup({ ...deps, on: false }, ADMIN, true))).toBe("letters-off");
    expect(await setSignup({ ...deps, on: false }, ADMIN, false)).toBe(false);
    expect(await setSignup(deps, ADMIN, true)).toBe(true);
    expect(rpc.signup).toBe(true);
  });

  it("bins only waiting requests and erases a reader by address, the same answer if there is none", async () => {
    const waiting = rpc.addReader("w@example.com", "waiting");
    rpc.addReader("c@example.com");
    expect(await binRequests(deps, ADMIN, [waiting.id, "not-an-id"])).toBe(1);
    expect(await eraseReader(deps, ADMIN, " C@Example.com ")).toBe(1);
    expect(await eraseReader(deps, ADMIN, "nobody@example.com")).toBe(0);
    expect(rpc.readers).toEqual([]);
  });
});
