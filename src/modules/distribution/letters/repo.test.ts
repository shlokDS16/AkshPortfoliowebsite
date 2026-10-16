import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createPublicLetterSource, createSupabaseLettersReads } from "./repo";
import { letterStructured } from "./structured";
import type { LetterEntry } from "./types";

// A recording stand-in for the query builder: every call is kept in order, and awaiting the chain gives the rows set for that table.
type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };
function fakeDb(tables: Record<string, Result | Result[]>) {
  const log: { table: string; ops: [string, ...unknown[]][] }[] = [];
  const used: Record<string, number> = {};
  const from = (table: string) => {
    const entry = { table, ops: [] as [string, ...unknown[]][] };
    log.push(entry);
    const answer = (): Result => {
      const set = tables[table];
      const result = Array.isArray(set) ? set[Math.min(used[table] ?? 0, set.length - 1)] : set;
      used[table] = (used[table] ?? 0) + 1;
      return { data: null, error: null, ...result };
    };
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "gte", "order", "limit", "is"]) chain[op] = (...args: unknown[]) => (entry.ops.push([op, ...args]), chain);
    chain.maybeSingle = () => (entry.ops.push(["maybeSingle"]), Promise.resolve(answer()).then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })));
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject);
    return chain;
  };
  return { db: { from } as unknown as Db, log };
}
const RID = "30000000-0000-4000-8000-000000000001";
const entry: LetterEntry = {
  revisionId: RID, kind: "learning", path: "/notes/x", revNo: 1, detail: "Learning note · R1", title: "T", learningObjective: "O", changeReason: null, holdsPosition: null, companyName: null,
};

describe("the admin session's reads", () => {
  it("passTimes: the latest pass of each revision, asked in chunks of 100 ids", async () => {
    const many = Array.from({ length: 230 }, (_, n) => `r${n}`);
    const { db, log } = fakeDb({
      gate_decisions: [
        { data: [{ revision_id: "r1", decided_at: "2026-10-01T05:00:00+00:00" }, { revision_id: "r1", decided_at: "2026-10-03T05:00:00+00:00" }, { revision_id: "r2", decided_at: "2026-10-02T05:00:00+00:00" }] },
        { data: [] }, { data: [{ revision_id: "r201", decided_at: "2026-09-02T05:00:00+00:00" }] },
      ],
    });
    const out = await createSupabaseLettersReads(db).passTimes(many);
    expect(log).toHaveLength(3);
    expect(log[0]!.ops).toContainEqual(["eq", "verdict", "pass"]);
    expect(log[0]!.ops.find((o) => o[0] === "in")![2]).toHaveLength(100);
    expect(log[2]!.ops.find((o) => o[0] === "in")![2]).toHaveLength(30);
    expect([...out]).toEqual([["r1", "2026-10-03T05:00:00+00:00"], ["r2", "2026-10-02T05:00:00+00:00"], ["r201", "2026-09-02T05:00:00+00:00"]]);
  });

  it("passTimes with no ids asks nothing", async () => {
    const { db, log } = fakeDb({});
    expect((await createSupabaseLettersReads(db).passTimes([])).size).toBe(0);
    expect(log).toEqual([]);
  });

  it("lastSentAt: the newest send to subscribers that finished, or null", async () => {
    const some = fakeDb({ letter_sends: { data: [{ sent_at: "2026-10-10T05:00:00+00:00" }] } });
    expect(await createSupabaseLettersReads(some.db).lastSentAt()).toBe("2026-10-10T05:00:00+00:00");
    expect(some.log[0]!.ops).toEqual(expect.arrayContaining([["eq", "kind", "subscribers"], ["eq", "status", "sent"], ["order", "sent_at", { ascending: false }]]));
    expect(await createSupabaseLettersReads(fakeDb({ letter_sends: { data: [] } }).db).lastSentAt()).toBeNull();
  });

  it("counts confirmed readers, and finds a reader by address in lower case", async () => {
    const { db, log } = fakeDb({ subscribers: [{ count: 7 }, { data: [{ id: "reader-1" }] }] });
    const reads = createSupabaseLettersReads(db);
    expect(await reads.confirmedCount()).toBe(7);
    expect(await reads.readerIdByEmail("  A@Example.COM ")).toBe("reader-1");
    expect(log[1]!.ops).toContainEqual(["eq", "email", "a@example.com"]);
  });

  it("lists a letter's sends newest first in the module's shape", async () => {
    const row = {
      id: "s1", item_id: "i", revision_id: "r", kind: "subscribers", status: "sent", approved_at: "2026-10-10T04:00:00+00:00", claimed_at: "2026-10-10T04:01:00+00:00",
      broadcast_id: "bc", recipients_at_approval: 4, recipients_sent: 4, sent_at: "2026-10-10T04:02:00+00:00", problem: null,
    };
    const { db, log } = fakeDb({ letter_sends: { data: [row] } });
    expect(await createSupabaseLettersReads(db).sendsOf("i")).toEqual([
      { id: "s1", itemId: "i", revisionId: "r", kind: "subscribers", status: "sent", approvedAt: row.approved_at, claimedAt: row.claimed_at, broadcastId: "bc", recipientsAtApproval: 4, recipientsSent: 4, sentAt: row.sent_at, problem: null },
    ]);
    expect(log[0]!.ops).toContainEqual(["order", "approved_at", { ascending: false }]);
  });

  it("readerCounts: waiting, asked to confirm and confirmed, by count only; no address or other column is read", async () => {
    const { db, log } = fakeDb({ subscribers: [{ count: 3 }, { count: 2 }, { count: 41 }] });
    expect(await createSupabaseLettersReads(db).readerCounts()).toEqual({ waiting: 3, asked: 2, confirmed: 41 });
    expect(log).toHaveLength(3);
    expect(log.map((l) => l.ops.find((o) => o[0] === "eq")?.[2])).toEqual(["waiting", "sent", "confirmed"]);
    for (const entry of log) expect(entry.ops[0]).toEqual(["select", "id", { count: "exact", head: true }]);
  });

  it("sendsForItems: the sends of the given letters in one read, newest first, and nothing is asked for no letters", async () => {
    const row = {
      id: "s2", item_id: "i2", revision_id: "r", kind: "self_test", status: "approved", approved_at: "2026-10-11T04:00:00+00:00", claimed_at: null,
      broadcast_id: null, recipients_at_approval: 0, recipients_sent: null, sent_at: null, problem: null,
    };
    const { db, log } = fakeDb({ letter_sends: { data: [row] } });
    const reads = createSupabaseLettersReads(db);
    expect(await reads.sendsForItems([])).toEqual([]);
    expect(log).toHaveLength(0);
    expect(await reads.sendsForItems(["i2", "i3"])).toMatchObject([{ id: "s2", itemId: "i2", kind: "self_test", status: "approved" }]);
    expect(log[0]!.ops).toContainEqual(["in", "item_id", ["i2", "i3"]]);
    expect(log[0]!.ops).toContainEqual(["order", "approved_at", { ascending: false }]);
  });

  it("lists the waiting requests oldest first", async () => {
    const { db, log } = fakeDb({ subscribers: { data: [{ id: "w1", email: "a@b.example", requested_at: "2026-10-14T05:00:00+00:00" }] } });
    expect(await createSupabaseLettersReads(db).waiting()).toEqual([{ id: "w1", email: "a@b.example", requestedAt: "2026-10-14T05:00:00+00:00" }]);
    expect(log[0]!.ops).toEqual(expect.arrayContaining([["eq", "status", "waiting"], ["order", "requested_at", { ascending: true }]]));
  });

  it("confirmationsLeftToday: 50 less the confirmation emails issued since midnight India time, never below zero", async () => {
    const reads = (count: number) => createSupabaseLettersReads(fakeDb({ subscriber_events: { count } }).db, () => new Date("2026-10-16T20:00:00Z"));
    expect(await reads(0).confirmationsLeftToday()).toBe(50);
    expect(await reads(12).confirmationsLeftToday()).toBe(38);
    expect(await reads(80).confirmationsLeftToday()).toBe(0);
    const { db, log } = fakeDb({ subscriber_events: { count: 1 } });
    await createSupabaseLettersReads(db, () => new Date("2026-10-16T20:00:00Z")).confirmationsLeftToday();
    // 20:00 UTC on 16 Oct is 01:30 IST on 17 Oct: the day began at 18:30 UTC on 16 Oct.
    expect(log[0]!.ops).toContainEqual(["gte", "at", "2026-10-16T18:30:00.000Z"]);
    expect(log[0]!.ops).toContainEqual(["eq", "event", "sent"]);
  });

  it("signupOn: the last switch event decides, and none means off", async () => {
    expect(await createSupabaseLettersReads(fakeDb({ letters_signup_events: { data: [{ signup_on: true }] } }).db).signupOn()).toBe(true);
    expect(await createSupabaseLettersReads(fakeDb({ letters_signup_events: { data: [{ signup_on: false }] } }).db).signupOn()).toBe(false);
    expect(await createSupabaseLettersReads(fakeDb({ letters_signup_events: { data: [] } }).db).signupOn()).toBe(false);
  });

  it("a failed read throws an error that names the operation and holds no row text", async () => {
    const { db } = fakeDb({ subscribers: { error: { message: 'value "a@b.example"', code: "XX000" } } });
    const error = await createSupabaseLettersReads(db).waiting().catch((e: unknown) => e as Error);
    expect(String((error as Error).message)).not.toContain("a@b.example");
  });
});

describe("the public source of a letter (what the gate passed, read as the public reads it)", () => {
  const publicRow = (patch: Record<string, unknown> = {}) => ({
    id: "item-1", kind: "letter", title: "What changed", learning_objective: "Two things.", revision_id: "rev-1", body_md: "A note.", structured: letterStructured([entry]), ...patch,
  });

  it("returns the letter when this revision is its current public one", async () => {
    const { db, log } = fakeDb({ public_items: { data: [publicRow()] } });
    expect(await createPublicLetterSource(db).load("item-1", "rev-1")).toEqual({
      itemId: "item-1", revisionId: "rev-1", subject: "What changed", objective: "Two things.", note: "A note.", entries: [entry],
    });
    expect(log[0]!.ops).toContainEqual(["eq", "id", "item-1"]);
    expect(String(log[0]!.ops.find((o) => o[0] === "select")![1])).not.toContain("*");
  });

  it("returns nothing when it is not public, is a newer revision now, is not a letter, or its record is damaged", async () => {
    const load = (row: unknown) => createPublicLetterSource(fakeDb({ public_items: { data: row === null ? [] : [row] } }).db).load("item-1", "rev-1");
    expect(await load(null)).toBeNull();
    expect(await load(publicRow({ revision_id: "rev-2" }))).toBeNull();
    expect(await load(publicRow({ kind: "learning" }))).toBeNull();
    expect(await load(publicRow({ structured: { schema: "letter/1", entries: [] } }))).toBeNull();
  });

  it("reads a missing objective as empty, never as made-up words", async () => {
    const out = await createPublicLetterSource(fakeDb({ public_items: { data: [publicRow({ learning_objective: null })] } }).db).load("item-1", "rev-1");
    expect(out?.objective).toBe("");
  });

  it("a failed read throws, so the send waits rather than failing on a blip", async () => {
    const { db } = fakeDb({ public_items: { error: { message: "paused", code: "08006" } } });
    await expect(createPublicLetterSource(db).load("item-1", "rev-1")).rejects.toThrow();
  });
});

