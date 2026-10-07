import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import type { LatestRun } from "./heartbeat";
import { describeStale, evaluateHealth, evaluatePublicHealth, getPublicHealth } from "./health";

const NOW = new Date("2026-10-04T12:00:00Z");
const PUMP = "heartbeat:pump";
const DAILY = "heartbeat:daily";
const secondsAgo = (s: number, ok = true): LatestRun => ({ ranAt: new Date(NOW.getTime() - s * 1000).toISOString(), ok });
const minutesAgo = (m: number, ok = true) => secondsAgo(m * 60, ok);

/** The desk strip and the public monitor must reach the same verdict from the same facts (spec s8). */
function bothVerdicts(pump: LatestRun | null, daily: LatestRun | null) {
  const strip = evaluateHealth({ [PUMP]: pump, [DAILY]: daily }, NOW);
  const row = (job: string, run: LatestRun | null) =>
    run ? [{ job, age_seconds: Math.floor((NOW.getTime() - new Date(run.ranAt).getTime()) / 1000), ok: run.ok }] : [];
  const monitor = evaluatePublicHealth([...row(PUMP, pump), ...row(DAILY, daily)]);
  return { strip, monitor };
}

describe("evaluateHealth (desk strip)", () => {
  it("is ok when the pump is under 2 h and the daily job under 36 h old", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(20), [DAILY]: minutesAgo(30 * 60) }, NOW);
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.ageSeconds)).toEqual([1200, 108_000]);
  });

  it("explains stale clocks in plain English for the desk strip", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(300), [DAILY]: null }, NOW);
    expect(describeStale(report)).toEqual(["the 15-minute pump last ran 5 h ago", "the daily job has never run"]);
  });

  it("says when the last run failed, instead of calling the clock late", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(5, false), [DAILY]: minutesAgo(60) }, NOW);
    expect(report.ok).toBe(false);
    expect(describeStale(report)).toEqual(["the 15-minute pump's last run failed 5 min ago"]);
  });
});

describe("one rule behind the strip and the monitor", () => {
  it.each([
    ["pump at exactly 7200 s", secondsAgo(7200), minutesAgo(10), true],
    ["pump at 7201 s", secondsAgo(7201), minutesAgo(10), false],
    ["daily at exactly 36 h", minutesAgo(10), secondsAgo(36 * 3600), true],
    ["daily at 36 h + 1 s", minutesAgo(10), secondsAgo(36 * 3600 + 1), false],
    ["a fresh failing pump run", minutesAgo(1, false), minutesAgo(10), false],
    ["a fresh failing daily run", minutesAgo(1), minutesAgo(10, false), false],
    ["a pump that never ran", null, minutesAgo(10), false],
    ["a daily job that never ran", minutesAgo(1), null, false],
  ])("%s gives the same verdict on both paths", (_label, pump, daily, healthy) => {
    const { strip, monitor } = bothVerdicts(pump, daily);
    expect(strip.ok).toBe(healthy);
    expect(monitor.ok).toBe(healthy);
    expect(strip.checks.map((c) => [c.job, c.ok, c.ageSeconds])).toEqual(monitor.checks.map((c) => [c.job, c.ok, c.ageSeconds]));
  });
});

describe("evaluatePublicHealth (rows from public.heartbeat_ages())", () => {
  const row = (job: string, minutes: number, ok = true) => ({ job, age_seconds: minutes * 60, ok });

  it("is ok when both latest runs succeeded inside their windows", () => {
    expect(evaluatePublicHealth([row(PUMP, 20), row(DAILY, 30 * 60)])).toEqual({
      ok: true,
      checks: [
        { job: PUMP, ageSeconds: 1200, ok: true },
        { job: DAILY, ageSeconds: 108_000, ok: true },
      ],
    });
  });

  it("reports a clock that has never run with a null age", () => {
    expect(evaluatePublicHealth([row(PUMP, 5)])).toEqual({
      ok: false,
      checks: [
        { job: PUMP, ageSeconds: 300, ok: true },
        { job: DAILY, ageSeconds: null, ok: false },
      ],
    });
  });

  it("exposes only the two clocks and only job, ageSeconds and ok (no detail, no other jobs)", () => {
    const withDetail = { ...row(PUMP, 5), detail: "secret failure text" };
    const report = evaluatePublicHealth([withDetail, row(DAILY, 5), row("heartbeat:prices", 5)]);
    expect(report.checks.map((c) => Object.keys(c))).toEqual([
      ["job", "ageSeconds", "ok"],
      ["job", "ageSeconds", "ok"],
    ]);
    expect(JSON.stringify(report)).not.toMatch(/secret|prices|detail/);
  });

  it("clamps clock skew to zero and tolerates a numeric string from Postgres", () => {
    const report = evaluatePublicHealth([
      { job: PUMP, age_seconds: -3, ok: true },
      { job: DAILY, age_seconds: "90.7", ok: true },
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
    const { db, calls } = dbWith({ data: [{ job: PUMP, age_seconds: 60, ok: true }], error: null });
    const report = await getPublicHealth(db);
    expect(calls).toEqual(["heartbeat_ages"]);
    expect(report.checks[0]).toEqual({ job: PUMP, ageSeconds: 60, ok: true });
  });

  it("throws when the database call fails", async () => {
    const { db } = dbWith({ data: null, error: { message: "paused", code: "08006" } });
    await expect(getPublicHealth(db)).rejects.toThrow(/ops.heartbeatAges/);
  });
});
