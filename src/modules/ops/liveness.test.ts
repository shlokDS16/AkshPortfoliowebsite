import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { evaluateHealth } from "./health";
import { getLiveness, livenessFromReport } from "./liveness";

const NOW = new Date("2026-10-06T08:35:00Z");
const ago = (minutes: number, ok = true) => ({ ranAt: new Date(NOW.getTime() - minutes * 60_000).toISOString(), ok });
const report = (latest: Parameters<typeof evaluateHealth>[0], queueAge: number | null = null) => evaluateHealth(latest, NOW, queueAge);

describe("liveness for the red strip (spec s8)", () => {
  it("is ok while both clocks are fresh", () => {
    expect(livenessFromReport(report({ "heartbeat:pump": ago(10), "heartbeat:daily": ago(600) }))).toEqual({ status: "ok" });
  });

  it("names the late clocks in plain words", () => {
    expect(livenessFromReport(report({ "heartbeat:pump": ago(300), "heartbeat:daily": null }))).toEqual({
      status: "late",
      problems: ["the 15-minute pump last ran 5 h ago", "the daily job has never run"],
    });
  });

  it("names a fresh failed run instead of calling the clock late", () => {
    expect(livenessFromReport(report({ "heartbeat:pump": ago(5, false), "heartbeat:daily": ago(600) }))).toEqual({
      status: "late",
      problems: ["the 15-minute pump's last run failed 5 min ago"],
    });
  });

  it("gives a stuck queue its own clause, even when both clocks are fresh", () => {
    expect(livenessFromReport(report({ "heartbeat:pump": ago(10), "heartbeat:daily": ago(600) }, 7 * 3600))).toEqual({
      status: "late",
      problems: [],
      queue: "Documents have not moved for 7 h; your uploads are safe",
    });
  });

  it("keeps the late clocks and the stuck queue as separate clauses", () => {
    expect(livenessFromReport(report({ "heartbeat:pump": ago(300), "heartbeat:daily": ago(600) }, 7 * 3600))).toEqual({
      status: "late",
      problems: ["the 15-minute pump last ran 5 h ago"],
      queue: "Documents have not moved for 7 h; your uploads are safe",
    });
  });

  it("is ok while documents are moving", () => {
    expect(livenessFromReport(report({ "heartbeat:pump": ago(10), "heartbeat:daily": ago(600) }, 5 * 3600))).toEqual({ status: "ok" });
  });

  it("names a failed ledger step with its own plain reason", () => {
    const failed = { ranAt: ago(10).ranAt, ok: false, detail: "the ledger failed its own check (chain_broken); nothing was scored" };
    expect(livenessFromReport(report({ "heartbeat:pump": ago(10), "heartbeat:daily": ago(600), "ledger:score": failed }))).toEqual({
      status: "late",
      problems: ["the scores' last run failed 10 min ago: the ledger failed its own check (chain_broken); nothing was scored"],
    });
  });

  it("passes on a note about a good closing-prices run (a company with no row) without calling anything late", () => {
    const good = { ranAt: ago(60).ranAt, ok: true, detail: "stored 1 date, 1 close, 1 of 3 companies had no row" };
    expect(livenessFromReport(report({ "heartbeat:pump": ago(10), "heartbeat:daily": ago(600), "ledger:prices": good }))).toEqual({
      status: "ok",
      notes: ["The latest closing-prices run found no row for 1 of 3 companies in NSE's file."],
    });
  });

  it("keeps a note beside a late clock", () => {
    const good = { ranAt: ago(60).ranAt, ok: true, detail: "1 of 2 companies had no row" };
    expect(livenessFromReport(report({ "heartbeat:pump": ago(300), "heartbeat:daily": ago(600), "ledger:prices": good }))).toEqual({
      status: "late",
      problems: ["the 15-minute pump last ran 5 h ago"],
      notes: ["The latest closing-prices run found no row for 1 of 2 companies in NSE's file."],
    });
  });

  it("reports the database as unreachable instead of throwing", async () => {
    const down = {
      from: () => {
        throw new Error("connection refused: password=hunter2");
      },
    } as unknown as Db;
    expect(await getLiveness(down, NOW)).toEqual({ status: "unreachable" });
  });

  it("reads the heartbeats through the session client it was given", async () => {
    const from = vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
      chain.maybeSingle = async () => ({ data: { ran_at: ago(10).ranAt, ok: true }, error: null });
      return chain;
    });
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    expect(await getLiveness({ from, rpc } as unknown as Db, NOW)).toEqual({ status: "ok" });
    expect(from).toHaveBeenCalledWith("heartbeats");
    expect(rpc).toHaveBeenCalledWith("queue_age");
  });
});
