import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRpc, fakeReads, type FakeReads, type FakeRpc } from "@/test/fakes/letters-kit";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { buildRichSnapshot } from "@/test/fakes/showcase-snapshot";
import type { ConfirmationBatch } from "./letters/readers";

// The desk's letter actions (Phase 5c Task 12). Every one starts with requireAdmin(); the id comes from the bound argument; a refusal is
// a fixed code in the redirect. With letters off none records an approval, issues a link or sends. The sends themselves are tested in
// letters/deliver.test.ts; here the ops facade is a spy.
const state = vi.hoisted(() => ({
  admin: true,
  on: true,
  research: null as unknown,
  reads: null as unknown,
  rpc: null as unknown,
  snapshot: null as unknown,
  kicks: 0,
  batch: null as unknown as { requested: number; issued: number; sent: number; failed: number; capped: boolean },
  confirmCall: null as null | { actor: string; ids: string[] },
  afterTasks: [] as (() => unknown)[],
}));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const revalidatePath = vi.hoisted(() => vi.fn());
const updateTag = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", async (original) => ({ ...(await original<typeof import("next/cache")>()), revalidatePath, updateTag }));
vi.mock("next/server", () => ({ after: (task: () => unknown) => void state.afterTasks.push(task) }));
vi.mock("@/modules/identity", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("NEXT_REDIRECT:/login");
    return { userId: "00000000-0000-4000-8000-0000000000aa", email: "aksh@example.com" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => ({}) }));
vi.mock("@/modules/research", async (original) => ({ ...(await original<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.research }));
vi.mock("@/modules/showcase/client", async (original) => ({
  ...(await original<typeof import("@/modules/showcase/client")>()),
  createSupabaseShowcaseRepo: () => ({}),
  loadSnapshot: async () => state.snapshot,
}));
vi.mock("./letters/repo", async (original) => ({ ...(await original<typeof import("./letters/repo")>()), createSupabaseLettersReads: () => state.reads }));
vi.mock("./send-rpc", () => ({ createSendRpc: () => state.rpc }));
vi.mock("@/modules/ops/jobs", () => ({
  runVideoFetchNow: async () => null,
  lettersOn: () => state.on,
  runLetterSendNow: async () => void (state.kicks += 1),
  sendConfirmationsNow: async (actor: string, ids: string[]) => {
    state.confirmCall = { actor, ids };
    if (!state.on) {
      const { LetterError } = await import("./letters/errors");
      throw new LetterError("letters-off");
    }
    return state.batch;
  },
}));

import {
  approveSendAction, binRequestsAction, cancelSendAction, eraseReaderAction, makeLetterAction, saveLetterAction, sendConfirmationsAction, sendTestCopyAction,
  setSignupAction,
} from "./actions";

const ITEM = "10000000-0000-4000-8000-000000000001";
const REV = "20000000-0000-4000-8000-000000000001";
const NOTE_REV = "70000000-0000-4000-8000-000000000001";
const param = (to: string, name: string) => new URL(to, "http://x").searchParams.get(name);
async function target(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1] as string;
    throw error;
  }
  throw new Error("expected a redirect");
}
const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  return data;
};

let research: MemoryResearchRepo;
let rpc: FakeRpc;
let reads: FakeReads;
beforeEach(() => {
  research = createMemoryResearchRepo();
  rpc = createFakeRpc();
  reads = fakeReads(rpc);
  Object.assign(state, { admin: true, on: true, research, reads, rpc, kicks: 0, confirmCall: null, afterTasks: [], batch: { requested: 1, issued: 1, sent: 1, failed: 0, capped: false } });
  const snapshot = buildRichSnapshot();
  const real = (id: string) => (id === "rn0" ? NOTE_REV : id);
  state.snapshot = {
    ...snapshot,
    items: snapshot.items.map((i) => ({ ...i, revisionId: real(i.revisionId) })),
    revisions: snapshot.revisions.map((r) => ({ ...r, id: real(r.id) })),
  };
  reads.passes.set(NOTE_REV, "2026-10-01T05:00:00Z");
  reads.last = "2026-09-30T05:00:00Z";
  redirect.mockClear();
  revalidatePath.mockClear();
});

describe("every letters action starts with requireAdmin()", () => {
  it("a visitor who is not the admin is sent to sign in and nothing is written", async () => {
    state.admin = false;
    const runs: (() => Promise<void>)[] = [
      () => makeLetterAction(form({ revision: "x" })), () => saveLetterAction(ITEM, form({ subject: "s" })), () => approveSendAction(ITEM, REV, form({ read: "on" })),
      () => cancelSendAction("s", ITEM), () => sendTestCopyAction(ITEM, REV), () => sendConfirmationsAction(form({})), () => binRequestsAction(form({ all: "1" })),
      () => eraseReaderAction(form({ email: "a@b.example" })), () => setSignupAction(true),
    ];
    for (const run of runs) expect(await target(run)).toBe("/login");
    expect(rpc.calls).toEqual([]);
    expect(research.items.size).toBe(0);
    expect(state.kicks).toBe(0);
    expect(state.confirmCall).toBeNull();
  });
});

describe("making and saving a letter", () => {
  it("makeLetterAction creates the private letter and goes to its page", async () => {
    const to = await target(() => makeLetterAction(form({ revision: NOTE_REV })));
    const [item] = [...research.items.values()];
    expect(item).toMatchObject({ kind: "letter", visibility: "private" });
    expect(to).toBe(`/desk/letters/${item!.id}?notice=letter-made`);
  });

  it("an empty or stale choice comes back to the list with a fixed code, and creates nothing", async () => {
    const empty = await target(() => makeLetterAction(form({})));
    expect(param(empty, "error")).toBe("letter-nothing-ticked");
    expect(empty.startsWith("/desk/letters/new")).toBe(true);
    const stale = await target(() => makeLetterAction(form({ revision: randomUUID() })));
    expect(param(stale, "error")).toBe("letter-entry-stale");
    expect(research.items.size).toBe(0);
  });

  it("saveLetterAction stores the subject, the sentence and the note and says so; saving again says nothing changed", async () => {
    const made = await target(() => makeLetterAction(form({ revision: NOTE_REV })));
    const id = made.split("?")[0]!.split("/").pop()!;
    const body = form({ subject: "What changed", objective: "One note moved.", note: "A short note." });
    expect(param(await target(() => saveLetterAction(id, body)), "notice")).toBe("letter-saved");
    expect(research.items.get(id)).toMatchObject({ title: "What changed", learningObjective: "One note moved." });
    expect(param(await target(() => saveLetterAction(id, body)), "notice")).toBe("letter-unchanged");
  });

  it("an over-long subject is refused with a fixed code", async () => {
    const made = await target(() => makeLetterAction(form({ revision: NOTE_REV })));
    const id = made.split("?")[0]!.split("/").pop()!;
    expect(param(await target(() => saveLetterAction(id, form({ subject: "x".repeat(121) }))), "error")).toBe("letter-subject-length");
  });
});

describe("approving a send: the audit row, then the step at once", () => {
  it("records one approval for readers, then asks the send step to run after the response", async () => {
    rpc.addReader("a@example.com");
    const to = await target(() => approveSendAction(ITEM, REV, form({ read: "on" })));
    expect(to).toBe(`/desk/letters/${ITEM}?notice=send-approved`);
    expect(rpc.sends).toHaveLength(1);
    expect(rpc.sends[0]).toMatchObject({ kind: "subscribers", itemId: ITEM, revisionId: REV });
    expect(state.afterTasks).toHaveLength(1);
    await state.afterTasks[0]!();
    expect(state.kicks).toBe(1);
  });

  it("without the 'I have read the preview' tick, or with nobody to send to, it records nothing and runs nothing", async () => {
    rpc.addReader("a@example.com");
    expect(param(await target(() => approveSendAction(ITEM, REV, form({}))), "error")).toBe("letter-read-required");
    rpc.readers.length = 0;
    expect(param(await target(() => approveSendAction(ITEM, REV, form({ read: "on" }))), "error")).toBe("letter-no-readers");
    expect(rpc.sends).toEqual([]);
    expect(state.afterTasks).toEqual([]);
  });

  it("with letters off it records nothing, issues nothing and runs nothing (each action's off path)", async () => {
    state.on = false;
    rpc.addReader("a@example.com");
    const w = rpc.addReader("w@example.com", "waiting");
    const results = [
      await target(() => approveSendAction(ITEM, REV, form({ read: "on" }))),
      await target(() => sendTestCopyAction(ITEM, REV)),
      await target(() => sendConfirmationsAction(form({ id: w.id }))),
      await target(() => setSignupAction(true)),
    ];
    for (const to of results) expect(param(to, "error")).toBe("letters-off");
    expect(rpc.sends).toEqual([]);
    expect(rpc.signup).toBe(false);
    expect(rpc.calls).toEqual([]);
    expect(state.afterTasks).toEqual([]);
    expect(state.kicks).toBe(0);
  });

  it("a database refusal comes back as its fixed code", async () => {
    rpc.addReader("a@example.com");
    await target(() => approveSendAction(ITEM, REV, form({ read: "on" })));
    expect(param(await target(() => approveSendAction(ITEM, REV, form({ read: "on" }))), "error")).toBe("letter-already-sent");
  });

  it("a test copy needs no tick and no reader, and goes to the step the same way", async () => {
    const to = await target(() => sendTestCopyAction(ITEM, REV));
    expect(param(to, "notice")).toBe("test-copy-approved");
    expect(rpc.sends[0]).toMatchObject({ kind: "self_test" });
    await state.afterTasks[0]!();
    expect(state.kicks).toBe(1);
  });

  it("cancel withdraws a waiting approval, and a send that is under way cannot be cancelled", async () => {
    rpc.addReader("a@example.com");
    await target(() => approveSendAction(ITEM, REV, form({ read: "on" })));
    const id = rpc.sends[0]!.id;
    expect(param(await target(() => cancelSendAction(id, ITEM)), "notice")).toBe("send-cancelled");
    expect(rpc.sends[0]!.status).toBe("cancelled");
    expect(param(await target(() => cancelSendAction(id, ITEM)), "error")).toBe("letter-cannot-cancel");
  });
});

describe("readers", () => {
  it("sends confirmation emails to the chosen readers, or to everyone waiting when none is chosen, and says what happened", async () => {
    const a = rpc.addReader("a@example.com", "waiting");
    rpc.addReader("b@example.com", "waiting");
    expect(param(await target(() => sendConfirmationsAction(form({ id: a.id }))), "notice")).toBe("confirmations-sent");
    expect(state.confirmCall).toEqual({ actor: "00000000-0000-4000-8000-0000000000aa", ids: [a.id] });
    await target(() => sendConfirmationsAction(form({})));
    expect(state.confirmCall!.ids).toHaveLength(2);
  });

  it.each([
    [{ requested: 60, issued: 50, sent: 50, failed: 0, capped: true }, "confirmations-capped"],
    [{ requested: 3, issued: 3, sent: 2, failed: 1, capped: false }, "confirmations-partial"],
    [{ requested: 0, issued: 0, sent: 0, failed: 0, capped: false }, "confirmations-none"],
  ] as [ConfirmationBatch, string][])("%j shows as %s", async (batch, notice) => {
    state.batch = batch;
    rpc.addReader("a@example.com", "waiting");
    expect(param(await target(() => sendConfirmationsAction(form({}))), "notice")).toBe(notice);
  });

  it("bins the chosen waiting requests, or all of them, and erases an address with the same answer whether or not it was there", async () => {
    const a = rpc.addReader("a@example.com", "waiting");
    rpc.addReader("b@example.com", "waiting");
    rpc.addReader("c@example.com");
    expect(param(await target(() => binRequestsAction(form({ id: a.id }))), "notice")).toBe("requests-binned");
    expect(rpc.readers.map((r) => r.email)).toEqual(["b@example.com", "c@example.com"]);
    await target(() => binRequestsAction(form({ all: "1" })));
    expect(rpc.readers.map((r) => r.email)).toEqual(["c@example.com"]);
    expect(param(await target(() => eraseReaderAction(form({ email: "C@example.com" }))), "notice")).toBe("reader-erased");
    expect(param(await target(() => eraseReaderAction(form({ email: "nobody@example.com" }))), "notice")).toBe("reader-erased");
    expect(rpc.readers).toEqual([]);
  });

  it("opens and closes sign-ups with the admin as the actor", async () => {
    expect(param(await target(() => setSignupAction(true)), "notice")).toBe("signup-opened");
    expect(rpc.signup).toBe(true);
    expect(param(await target(() => setSignupAction(false)), "notice")).toBe("signup-closed");
    expect(rpc.signup).toBe(false);
  });

  it("refreshes the public side at once: the cached switch the sign-up page reads (the snapshot's tag) and the page itself", async () => {
    updateTag.mockClear();
    revalidatePath.mockClear();
    await target(() => setSignupAction(true));
    expect(updateTag).toHaveBeenCalledWith("public-items");
    expect(revalidatePath).toHaveBeenCalledWith("/letters");
  });
});

