import { describe, expect, it } from "vitest";
import { errorCode } from "@/lib/messages";
import { DbError } from "@/lib/supabase/errors";
import { createFakeDb } from "./fake-db";
import { LedgerError } from "./errors";
import { createSupabaseLedgerRepo } from "./repo";

const ideaRow = {
  id: "i1", company_id: "c1", item_id: null, expects: "outperform", horizon_days: 365, held: true, status: "open",
  opened_at: "2026-10-13T08:00:00+00:00", closed_at: null, close_reason: null, process_call: null, created_at: "2026-10-13T08:00:00+00:00",
};

describe("openIdea and addEvent: the two doors, nothing else", () => {
  it("openIdea calls open_idea with his choices and leaves the link out when there is none", async () => {
    const { db, calls } = createFakeDb([{ data: "idea-9" }]);
    const id = await createSupabaseLedgerRepo(db).openIdea({ companyId: "c1", expects: "underperform", horizonDays: 730, held: false, bodyMd: "Words", itemId: null });
    expect(id).toBe("idea-9");
    expect(calls).toEqual([
      { target: "rpc:open_idea", ops: [["args", { p_company_id: "c1", p_expects: "underperform", p_horizon_days: 730, p_held: false, p_body_md: "Words" }]] },
    ]);
  });

  it("openIdea passes the company file link when there is one", async () => {
    const { db, calls } = createFakeDb([{ data: "idea-9" }]);
    await createSupabaseLedgerRepo(db).openIdea({ companyId: "c1", expects: "outperform", horizonDays: 365, held: true, bodyMd: "W", itemId: "it1" });
    expect(calls[0]!.ops[0]![1]).toMatchObject({ p_item_id: "it1" });
  });

  it("addEvent calls add_idea_event with the kind, the words and the stance", async () => {
    const { db, calls } = createFakeDb([{ data: "ev-1" }]);
    const id = await createSupabaseLedgerRepo(db).addEvent({ ideaId: "i1", kind: "close", bodyMd: "Done", stance: { reason: "played_out" } });
    expect(id).toBe("ev-1");
    expect(calls[0]).toEqual({
      target: "rpc:add_idea_event",
      ops: [["args", { p_idea_id: "i1", p_kind: "close", p_body_md: "Done", p_stance: { reason: "played_out" } }]],
    });
  });

  it("a database refusal comes back as a typed ledger error, not the raw message", async () => {
    const { db } = createFakeDb([{ error: { message: "ledger:no_symbol", code: "P0001" } }]);
    const error = await createSupabaseLedgerRepo(db).openIdea({ companyId: "c1", expects: "outperform", horizonDays: 365, held: true, bodyMd: "W", itemId: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LedgerError);
    expect(errorCode(error)).toBe("ledger-no-symbol");
  });

  it("a call that returns no id is an error, not a silent success", async () => {
    const { db } = createFakeDb([{ data: null }]);
    await expect(createSupabaseLedgerRepo(db).addEvent({ ideaId: "i1", kind: "note", bodyMd: "W", stance: {} })).rejects.toBeInstanceOf(DbError);
  });
});

describe("reads: named columns, camelCase, the company name from its own table", () => {
  it("listIdeas reads ideas, then the companies they name", async () => {
    const { db, calls } = createFakeDb([{ data: [ideaRow] }, { data: [{ id: "c1", name: "Acme Ltd", nse_symbol: "ACME" }] }]);
    const ideas = await createSupabaseLedgerRepo(db).listIdeas();
    expect(ideas).toEqual([
      {
        id: "i1", companyId: "c1", companyName: "Acme Ltd", symbol: "ACME", itemId: null, expects: "outperform", horizonDays: 365, held: true,
        status: "open", openedAt: "2026-10-13T08:00:00+00:00", closedAt: null, closeReason: null, processCall: null, createdAt: "2026-10-13T08:00:00+00:00",
      },
    ]);
    expect(calls[0]!.target).toBe("ideas");
    expect(JSON.stringify(calls[0]!.ops)).not.toContain('"*"');
    expect(calls[0]!.ops).toContainEqual(["order", "opened_at", { ascending: false }]);
    expect(calls[1]).toMatchObject({ target: "companies", ops: [["select", "id, name, nse_symbol"], ["in", "id", ["c1"]]] });
  });

  it("listIdeas makes no company query for an empty ledger", async () => {
    const { db, calls } = createFakeDb([{ data: [] }]);
    expect(await createSupabaseLedgerRepo(db).listIdeas()).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("getIdea is null when there is no row", async () => {
    const { db } = createFakeDb([{ data: null }]);
    expect(await createSupabaseLedgerRepo(db).getIdea("i1")).toBeNull();
  });

  it("listEvents never selects the sealed text or the nonce, and orders by seq", async () => {
    const { db, calls } = createFakeDb([
      { data: [{ id: "e1", seq: 4, idea_id: "i1", kind: "open", recorded_at: "2026-10-13T08:00:00+00:00", stance: { held: true }, body_md: "W", hash: "h", prev_hash: "p" }] },
    ]);
    const events = await createSupabaseLedgerRepo(db).listEvents("i1");
    expect(events).toEqual([{ id: "e1", seq: 4, ideaId: "i1", kind: "open", recordedAt: "2026-10-13T08:00:00+00:00", stance: { held: true }, bodyMd: "W", hash: "h", prevHash: "p" }]);
    const select = String(calls[0]!.ops[0]![1]);
    expect(select).not.toMatch(/canonical|nonce|\*/);
    expect(calls[0]!.ops).toContainEqual(["order", "seq", { ascending: true }]);
  });

  it("listLessons asks for review entries, newest first", async () => {
    const { db, calls } = createFakeDb([{ data: [] }]);
    await createSupabaseLedgerRepo(db).listLessons();
    expect(calls[0]!.ops).toContainEqual(["eq", "kind", "review"]);
    expect(calls[0]!.ops).toContainEqual(["order", "seq", { ascending: false }]);
  });

  it("listScores maps every column and keeps numbers as numbers and flags as given", async () => {
    const row = {
      idea_id: "i1", entry_date: "2026-10-14", entry_close: 100, entry_index: 20000, entry_skipped_days: 0, entry_source: "nse_fetch",
      mark_date: "2026-10-20", mark_close: 110, mark_index: 20500, exit_skipped_days: null, mark_source: "manual", factor: 1,
      idea_return: 0.1, index_return: 0.025, excess: 0.075, holding_days: 6, is_final: false, flags: ["hand_price", "stale"], computed_at: "2026-10-20T00:30:00+00:00",
    };
    const { db } = createFakeDb([{ data: [row] }]);
    const [s] = await createSupabaseLedgerRepo(db).listScores();
    expect(s).toEqual({
      ideaId: "i1", entryDate: "2026-10-14", entryClose: 100, entryIndex: 20000, entrySkippedDays: 0, entrySource: "nse_fetch",
      markDate: "2026-10-20", markClose: 110, markIndex: 20500, exitSkippedDays: null, markSource: "manual", factor: 1,
      ideaReturn: 0.1, indexReturn: 0.025, excess: 0.075, holdingDays: 6, isFinal: false, flags: ["hand_price", "stale"], computedAt: "2026-10-20T00:30:00+00:00",
    });
  });

  it("listScoreChanges reads the restatement log, for one idea or all", async () => {
    const row = { id: 7, idea_id: "i1", changed_at: "2026-10-10T00:30:00+00:00", changed: ["mark_close"], was: { mark_close: 1 }, became: { mark_close: 2 } };
    const one = createFakeDb([{ data: [row] }]);
    const [c] = await createSupabaseLedgerRepo(one.db).listScoreChanges("i1");
    expect(c).toEqual({ id: 7, ideaId: "i1", changedAt: "2026-10-10T00:30:00+00:00", changed: ["mark_close"], was: { mark_close: 1 }, became: { mark_close: 2 } });
    expect(one.calls[0]).toMatchObject({ target: "idea_score_changes" });
    expect(one.calls[0]!.ops).toContainEqual(["eq", "idea_id", "i1"]);
    const all = createFakeDb([{ data: [] }]);
    await createSupabaseLedgerRepo(all.db).listScoreChanges();
    expect(JSON.stringify(all.calls[0]!.ops)).not.toContain("idea_id\",");
  });

  it("a read error is thrown as a database error", async () => {
    const { db } = createFakeDb([{ error: { message: "x", code: "08006" } }]);
    await expect(createSupabaseLedgerRepo(db).listScores()).rejects.toBeInstanceOf(DbError);
  });
});

describe("checkChain calls both checks", () => {
  const chainRow = { ok: true, events: 42, first_bad_seq: null, bad_idea: null };
  const anchorRow = { ok: true, days: 12, first_bad_date: null, reason: null };

  it("calls check_ledger_chain and check_ledger_anchors and maps both rows", async () => {
    const { db, calls } = createFakeDb([{ data: [chainRow] }, { data: [anchorRow] }]);
    const rows = await createSupabaseLedgerRepo(db).checkChain();
    expect(calls.map((c) => c.target).sort()).toEqual(["rpc:check_ledger_anchors", "rpc:check_ledger_chain"]);
    expect(rows).toEqual({
      chain: { ok: true, events: 42, firstBadSeq: null, badIdea: null },
      anchors: { ok: true, days: 12, firstBadDate: null, reason: null },
    });
  });

  it("maps a problem row from each", async () => {
    const { db } = createFakeDb([
      { data: [{ ok: false, events: 42, first_bad_seq: 17, bad_idea: "i1" }] },
      { data: [{ ok: false, days: 12, first_bad_date: "2026-10-04", reason: "head" }] },
    ]);
    const rows = await createSupabaseLedgerRepo(db).checkChain();
    expect(rows.chain).toEqual({ ok: false, events: 42, firstBadSeq: 17, badIdea: "i1" });
    expect(rows.anchors).toEqual({ ok: false, days: 12, firstBadDate: "2026-10-04", reason: "head" });
  });

  it("fails closed: an empty answer, or an ok that is not exactly true, is not ok / is an error", async () => {
    const empty = createFakeDb([{ data: [] }, { data: [anchorRow] }]);
    await expect(createSupabaseLedgerRepo(empty.db).checkChain()).rejects.toBeInstanceOf(DbError);
    const emptyAnchors = createFakeDb([{ data: [chainRow] }, { data: [] }]);
    await expect(createSupabaseLedgerRepo(emptyAnchors.db).checkChain()).rejects.toBeInstanceOf(DbError);
    const nullOk = createFakeDb([{ data: [{ ...chainRow, ok: null }] }, { data: [{ ...anchorRow, ok: null }] }]);
    const rows = await createSupabaseLedgerRepo(nullOk.db).checkChain();
    expect(rows.chain.ok).toBe(false);
    expect(rows.anchors.ok).toBe(false);
  });

  it("an error from either check is thrown", async () => {
    const a = createFakeDb([{ error: { message: "ledger: not allowed", code: "42501" } }, { data: [anchorRow] }]);
    await expect(createSupabaseLedgerRepo(a.db).checkChain()).rejects.toThrow();
    const b = createFakeDb([{ data: [chainRow] }, { error: { message: "down", code: "08006" } }]);
    await expect(createSupabaseLedgerRepo(b.db).checkChain()).rejects.toBeInstanceOf(DbError);
  });
});

describe("rescore, links and status", () => {
  it("rescore calls rescore_ideas and returns the count", async () => {
    const { db, calls } = createFakeDb([{ data: 5 }]);
    expect(await createSupabaseLedgerRepo(db).rescore()).toBe(5);
    expect(calls[0]!.target).toBe("rpc:rescore_ideas");
  });

  it("setItemLink updates only item_id, the one column the admin may change", async () => {
    const { db, calls } = createFakeDb([{ error: null }]);
    await createSupabaseLedgerRepo(db).setItemLink("i1", "it1");
    expect(calls[0]).toEqual({ target: "ideas", ops: [["update", { item_id: "it1" }], ["eq", "id", "i1"]] });
  });

  it("closesStatus reads the trading calendar", async () => {
    const { db } = createFakeDb([{ data: [{ trade_date: "2026-10-12" }] }, { data: [{ trade_date: "2026-10-09" }] }, { count: 3, data: null }]);
    expect(await createSupabaseLedgerRepo(db).closesStatus()).toEqual({ latestOpenDay: "2026-10-12", latestOfficialDay: "2026-10-09", handEnteredDays: 3 });
  });

  it("closesStatus on a database with no trading days yet", async () => {
    const { db } = createFakeDb([{ data: [] }, { data: [] }, { count: 0, data: null }]);
    expect(await createSupabaseLedgerRepo(db).closesStatus()).toEqual({ latestOpenDay: null, latestOfficialDay: null, handEnteredDays: 0 });
  });

  it("anchorStatus counts sealed, published and waiting days", async () => {
    const { db } = createFakeDb([
      { count: 12, data: null }, { count: 10, data: null }, { data: [{ anchor_date: "2026-10-12" }] }, { data: [{ anchor_date: "2026-10-10" }] },
    ]);
    expect(await createSupabaseLedgerRepo(db).anchorStatus()).toEqual({
      sealedDays: 12, publishedDays: 10, waitingDays: 2, latestSealedDate: "2026-10-12", latestPublishedDate: "2026-10-10",
    });
  });
});
