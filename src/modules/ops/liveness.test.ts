import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { evaluateHealth } from "./health";
import { getLiveness, livenessFromReport } from "./liveness";

const NOW = new Date("2026-10-06T08:35:00Z");
const ago = (minutes: number, ok = true) => ({ ranAt: new Date(NOW.getTime() - minutes * 60_000).toISOString(), ok });
const report = (latest: Parameters<typeof evaluateHealth>[0]) => evaluateHealth(latest, NOW);

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
    expect(await getLiveness({ from } as unknown as Db, NOW)).toEqual({ status: "ok" });
    expect(from).toHaveBeenCalledWith("heartbeats");
  });
});
