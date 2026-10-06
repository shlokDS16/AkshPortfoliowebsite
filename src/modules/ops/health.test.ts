import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { describeStale, evaluateHealth, evaluatePublicHealth, getPublicHealth } from "./health";

const NOW = new Date("2026-10-04T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("evaluateHealth (spec s8 thresholds)", () => {
  it("is ok when the pump is under 2 h and the daily job under 36 h old", () => {
    const report = evaluateHealth({ "heartbeat:pump": minutesAgo(20), "heartbeat:daily": minutesAgo(30 * 60) }, NOW);
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.ageMinutes)).toEqual([20, 1800]);
  });

  it("fails when the pump is older than 2 h", () => {
    expect(evaluateHealth({ "heartbeat:pump": minutesAgo(121), "heartbeat:daily": minutesAgo(60) }, NOW).ok).toBe(false);
  });

  it("fails when the daily job is older than 36 h or has never run", () => {
    expect(evaluateHealth({ "heartbeat:pump": minutesAgo(5), "heartbeat:daily": minutesAgo(36 * 60 + 1) }, NOW).ok).toBe(false);
    expect(evaluateHealth({ "heartbeat:pump": minutesAgo(5), "heartbeat:daily": null }, NOW).ok).toBe(false);
  });

  it("explains stale clocks in plain English for the desk strip", () => {
    const report = evaluateHealth({ "heartbeat:pump": minutesAgo(300), "heartbeat:daily": null }, NOW);
    expect(describeStale(report)).toEqual(["the 15-minute pump last ran 5 h ago", "the daily job has never run"]);
  });
});

describe("evaluatePublicHealth (rows from public.heartbeat_ages())", () => {
  const row = (job: string, minutes: number, ok = true) => ({ job, age_seconds: minutes * 60, ok });

  it("is ok when both latest runs succeeded inside their windows", () => {
    expect(evaluatePublicHealth([row("heartbeat:pump", 20), row("heartbeat:daily", 30 * 60)])).toEqual({
      ok: true,
      checks: [
        { job: "heartbeat:pump", ageSeconds: 1200, ok: true },
        { job: "heartbeat:daily", ageSeconds: 108_000, ok: true },
      ],
    });
  });

  it("flags a pump older than 2 h and a daily job older than 36 h", () => {
    const pump = evaluatePublicHealth([row("heartbeat:pump", 121), row("heartbeat:daily", 60)]);
    expect(pump.ok).toBe(false);
    expect(pump.checks.map((c) => c.ok)).toEqual([false, true]);
    const daily = evaluatePublicHealth([row("heartbeat:pump", 5), row("heartbeat:daily", 36 * 60 + 1)]);
    expect(daily.checks.map((c) => c.ok)).toEqual([true, false]);
  });

  it("counts a fresh latest run that failed as unhealthy", () => {
    expect(evaluatePublicHealth([row("heartbeat:pump", 5, false), row("heartbeat:daily", 5)]).ok).toBe(false);
  });

  it("reports a clock that has never run with a null age", () => {
    expect(evaluatePublicHealth([row("heartbeat:pump", 5)])).toEqual({
      ok: false,
      checks: [
        { job: "heartbeat:pump", ageSeconds: 5 * 60, ok: true },
        { job: "heartbeat:daily", ageSeconds: null, ok: false },
      ],
    });
  });

  it("exposes only the two clocks and only job, ageSeconds and ok (no detail, no other jobs)", () => {
    const withDetail = { ...row("heartbeat:pump", 5), detail: "secret failure text" };
    const report = evaluatePublicHealth([
      withDetail,
      row("heartbeat:daily", 5),
      row("heartbeat:prices", 5),
    ]);
    expect(report.checks.map((c) => Object.keys(c))).toEqual([
      ["job", "ageSeconds", "ok"],
      ["job", "ageSeconds", "ok"],
    ]);
    expect(JSON.stringify(report)).not.toMatch(/secret|prices|detail/);
  });

  it("clamps clock skew to zero and tolerates a numeric string from Postgres", () => {
    const report = evaluatePublicHealth([
      { job: "heartbeat:pump", age_seconds: -3, ok: true },
      { job: "heartbeat:daily", age_seconds: "90.7", ok: true },
    ]);
    expect(report.checks.map((c) => c.ageSeconds)).toEqual([0, 90]);
  });
});

describe("getPublicHealth", () => {
  const dbWith = (result: { data: unknown; error: unknown }) => {
    const calls: string[] = [];
    const db = {
      rpc: async (name: string) => {
        calls.push(name);
        return result;
      },
    } as unknown as Db;
    return { db, calls };
  };

  it("calls public.heartbeat_ages() and evaluates the rows", async () => {
    const { db, calls } = dbWith({ data: [{ job: "heartbeat:pump", age_seconds: 60, ok: true }], error: null });
    const report = await getPublicHealth(db);
    expect(calls).toEqual(["heartbeat_ages"]);
    expect(report.checks[0]).toEqual({ job: "heartbeat:pump", ageSeconds: 60, ok: true });
  });

  it("throws when the database call fails", async () => {
    const { db } = dbWith({ data: null, error: { message: "paused", code: "08006" } });
    await expect(getPublicHealth(db)).rejects.toThrow(/ops.heartbeatAges/);
  });
});
