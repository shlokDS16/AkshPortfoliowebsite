import { ZodError } from "zod";
import { describe, expect, it } from "vitest";
import { errorCode } from "@/lib/messages";
import { LedgerError } from "./errors";
import { createFakeLedgerRepo } from "./fake-repo";
import { addIdeaEvent, checkLedger, linkIdeaToItem, loadIdea, loadLedger, openIdea, rescoreLedger } from "./service";
import { change, closedIdea, event, finalScore, idea, score } from "./test-fixtures";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const IDEA = "33333333-3333-4333-8333-333333333333";
const ITEM = "22222222-2222-4222-8222-222222222222";
const good = { companyId: COMPANY, expects: "underperform", horizonDays: 365, held: true, bodyMd: "Debt is rising faster than profit." };

describe("openIdea: validate, then call the repo", () => {
  it("passes the parsed idea to the repo and returns the new id", async () => {
    const repo = createFakeLedgerRepo();
    expect(await openIdea(repo, good)).toBe("idea-new");
    expect(repo.calls).toEqual([{ method: "openIdea", args: [{ ...good, itemId: null }] }]);
  });

  it.each([
    ["a 10,001-character body", { ...good, bodyMd: "a".repeat(10_001) }],
    ["a horizon of 29 days", { ...good, horizonDays: 29 }],
    ["blank words", { ...good, bodyMd: "  \n " }],
    ["an unknown direction", { ...good, expects: "buy" }],
    ["no company", { ...good, companyId: undefined }],
    ["a stray price", { ...good, entryPrice: 10 }],
    ["not an object", null],
  ])("refuses %s before any database call", async (_name, input) => {
    const repo = createFakeLedgerRepo();
    await expect(openIdea(repo, input)).rejects.toBeInstanceOf(ZodError);
    expect(repo.calls).toEqual([]);
  });

  it("lets the database's own refusal through as a typed error", async () => {
    const repo = createFakeLedgerRepo({ failWith: new LedgerError("ledger-no-symbol") });
    const error = await openIdea(repo, good).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LedgerError);
    expect(errorCode(error)).toBe("ledger-no-symbol");
  });
});

describe("addIdeaEvent: one shape per kind", () => {
  it("sends the kind, his words as typed, and the stance the database expects", async () => {
    const repo = createFakeLedgerRepo();
    await addIdeaEvent(repo, IDEA, { kind: "close", bodyMd: " Done.\n", reason: "thesis_broken" });
    expect(repo.calls).toEqual([{ method: "addEvent", args: [{ ideaId: IDEA, kind: "close", bodyMd: " Done.\n", stance: { reason: "thesis_broken" } }] }]);
  });

  it("sends a review with its call and tags", async () => {
    const repo = createFakeLedgerRepo();
    await addIdeaEvent(repo, IDEA, { kind: "review", bodyMd: "Sized too big.", process: "flawed", tags: ["sizing"] });
    expect(repo.calls[0]!.args[0]).toMatchObject({ kind: "review", stance: { process: "flawed", tags: ["sizing"] } });
  });

  it("refuses an unknown tag, a 10,001-character body and a bad idea id before any database call", async () => {
    const repo = createFakeLedgerRepo();
    await expect(addIdeaEvent(repo, IDEA, { kind: "review", bodyMd: "x", process: "sound", tags: ["luckk"] })).rejects.toBeInstanceOf(ZodError);
    await expect(addIdeaEvent(repo, IDEA, { kind: "note", bodyMd: "a".repeat(10_001) })).rejects.toBeInstanceOf(ZodError);
    const bad = await addIdeaEvent(repo, "not-a-uuid", { kind: "note", bodyMd: "x" }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(LedgerError);
    expect(errorCode(bad)).toBe("ledger-bad-input");
    expect(repo.calls).toEqual([]);
  });

  it("will not open an idea through this door", async () => {
    const repo = createFakeLedgerRepo();
    await expect(addIdeaEvent(repo, IDEA, { kind: "open", bodyMd: "x" })).rejects.toBeInstanceOf(ZodError);
    expect(repo.calls).toEqual([]);
  });
});

describe("loadLedger: what the Ledger page needs, in one call", () => {
  it("returns the ideas, scores, restatements and the summary computed from them", async () => {
    const repo = createFakeLedgerRepo({
      ideas: [closedIdea({ id: "c" }), idea({ id: "o" }), idea({ id: "v", status: "void" })],
      scores: [finalScore({ ideaId: "c", excess: 0.1 }), score({ ideaId: "o", excess: -0.1 })],
      changes: [change({ ideaId: "c" })],
    });
    const ledger = await loadLedger(repo, "2026-10-13");
    expect(ledger.ideas).toHaveLength(3);
    expect(ledger.scores).toHaveLength(2);
    expect(ledger.changes).toHaveLength(1);
    expect(ledger.summary.closed).toMatchObject({ asExpected: 1, total: 1 });
    expect(ledger.summary.all).toEqual({ asExpected: 1, total: 2 });
    expect(ledger.summary.withdrawn).toBe(1);
    expect(ledger.summary.restated).toEqual(["c"]);
  });

  it("an empty ledger loads", async () => {
    const ledger = await loadLedger(createFakeLedgerRepo(), "2026-10-13");
    expect(ledger.summary.all.total).toBe(0);
  });

  it("a database failure is thrown, not shown as an empty ledger", async () => {
    await expect(loadLedger(createFakeLedgerRepo({ failWith: new Error("down") }), "2026-10-13")).rejects.toThrow("down");
  });
});

describe("loadIdea", () => {
  it("returns the idea, its entries in order, its score and its restatements", async () => {
    const repo = createFakeLedgerRepo({
      ideas: [idea({ id: IDEA })],
      events: [event({ id: "e2", ideaId: IDEA, seq: 5 }), event({ id: "e1", ideaId: IDEA, seq: 2 }), event({ id: "x", ideaId: "other", seq: 3 })],
      scores: [score({ ideaId: IDEA }), score({ ideaId: "other" })],
      changes: [change({ ideaId: IDEA }), change({ id: 2, ideaId: "other" })],
    });
    const detail = await loadIdea(repo, IDEA);
    expect(detail?.idea.id).toBe(IDEA);
    expect(detail?.events.map((e) => e.seq)).toEqual([2, 5]);
    expect(detail?.score?.ideaId).toBe(IDEA);
    expect(detail?.changes).toHaveLength(1);
  });

  it("is null for an idea that is not there, and for an id that is not an id (no database call)", async () => {
    const repo = createFakeLedgerRepo();
    expect(await loadIdea(repo, IDEA)).toBeNull();
    const before = repo.calls.length;
    expect(await loadIdea(repo, "../../etc")).toBeNull();
    expect(repo.calls.length).toBe(before);
  });
});

describe("checkLedger: both checks", () => {
  it("passes only when the chain and the sealed-day comparison both pass", async () => {
    const ok = await checkLedger(createFakeLedgerRepo({ chain: { ok: true, events: 3, firstBadSeq: null, badIdea: null }, anchors: { ok: true, days: 2, firstBadDate: null, reason: null } }));
    expect(ok).toMatchObject({ ok: true, events: 3, sealedDays: 2 });
  });

  it("a problem from the sealed days alone fails it", async () => {
    const status = await checkLedger(createFakeLedgerRepo({ anchors: { ok: false, days: 2, firstBadDate: "2026-10-04", reason: "head" } }));
    expect(status.ok).toBe(false);
    expect(status.problems[0]).toMatchObject({ source: "anchors", firstBadDate: "2026-10-04" });
  });

  it("a problem from the chain alone fails it", async () => {
    const status = await checkLedger(createFakeLedgerRepo({ chain: { ok: false, events: 3, firstBadSeq: 2, badIdea: null } }));
    expect(status.ok).toBe(false);
    expect(status.problems[0]).toMatchObject({ source: "chain", firstBadSeq: 2 });
  });

  it("a check that could not run is thrown, never reported as ok", async () => {
    await expect(checkLedger(createFakeLedgerRepo({ failWith: new Error("down") }))).rejects.toThrow("down");
  });
});

describe("rescoreLedger and linkIdeaToItem", () => {
  it("rescore asks the database to recompute", async () => {
    const repo = createFakeLedgerRepo({ scores: [score({ ideaId: "a" })] });
    expect(await rescoreLedger(repo)).toBe(1);
    expect(repo.calls.map((c) => c.method)).toEqual(["rescore"]);
  });

  it("links an idea to a company file, or removes the link", async () => {
    const repo = createFakeLedgerRepo();
    await linkIdeaToItem(repo, IDEA, ITEM);
    await linkIdeaToItem(repo, IDEA, null);
    expect(repo.calls.map((c) => c.args)).toEqual([[IDEA, ITEM], [IDEA, null]]);
  });

  it("refuses ids that are not ids before any database call", async () => {
    const repo = createFakeLedgerRepo();
    await expect(linkIdeaToItem(repo, "x", ITEM)).rejects.toBeInstanceOf(LedgerError);
    await expect(linkIdeaToItem(repo, IDEA, "x")).rejects.toBeInstanceOf(LedgerError);
    expect(repo.calls).toEqual([]);
  });
});
