import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { QUEUE_STALE_SECONDS } from "@/modules/ingestion/client";
import type { LatestRun } from "./heartbeat";
import { describeQueue, describeStale, evaluateHealth, evaluatePublicHealth, getPublicHealth, readQueueAge } from "./health";

const NOW = new Date("2026-10-04T12:00:00Z");
const PUMP = "heartbeat:pump";
const DAILY = "heartbeat:daily";
const secondsAgo = (s: number, ok = true): LatestRun => ({ ranAt: new Date(NOW.getTime() - s * 1000).toISOString(), ok });
const minutesAgo = (m: number, ok = true) => secondsAgo(m * 60, ok);

/** The desk strip and the public monitor must reach the same verdict from the same facts (spec s8). */
function bothVerdicts(pump: LatestRun | null, daily: LatestRun | null, queueAge: number | null = null) {
  const strip = evaluateHealth({ [PUMP]: pump, [DAILY]: daily }, NOW, queueAge);
  const row = (job: string, run: LatestRun | null) =>
    run ? [{ job, age_seconds: Math.floor((NOW.getTime() - new Date(run.ranAt).getTime()) / 1000), ok: run.ok }] : [];
  const monitor = evaluatePublicHealth([...row(PUMP, pump), ...row(DAILY, daily)], queueAge);
  return { strip, monitor };
}

describe("evaluateHealth (desk strip)", () => {
  it("is ok when the pump is under 2 h and the daily job under 36 h old", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(20), [DAILY]: minutesAgo(30 * 60) }, NOW, null);
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.ageSeconds)).toEqual([1200, 108_000]);
    expect(report.queue).toEqual({ ageSeconds: null, ok: true });
  });

  it("explains stale clocks in plain English for the desk strip", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(300), [DAILY]: null }, NOW, null);
    expect(describeStale(report)).toEqual(["the 15-minute pump last ran 5 h ago", "the daily job has never run"]);
  });

  it("says when the last run failed, instead of calling the clock late", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(5, false), [DAILY]: minutesAgo(60) }, NOW, null);
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
    expect(strip.checks.map((c) => [c.job, c.ok, c.ageSeconds])).toEqual(monitor.checks.slice(0, 2).map((c) => [c.job, c.ok, c.ageSeconds]));
  });
});

describe("evaluatePublicHealth (rows from public.heartbeat_ages())", () => {
  const row = (job: string, minutes: number, ok = true) => ({ job, age_seconds: minutes * 60, ok });

  it("is ok when both latest runs succeeded inside their windows", () => {
    expect(evaluatePublicHealth([row(PUMP, 20), row(DAILY, 30 * 60)], 90)).toEqual({
      ok: true,
      checks: [
        { job: PUMP, ageSeconds: 1200, ok: true },
        { job: DAILY, ageSeconds: 108_000, ok: true },
        { job: "queue", ageSeconds: 90, ok: true },
      ],
    });
  });

  it("reports a clock that has never run with a null age", () => {
    expect(evaluatePublicHealth([row(PUMP, 5)], null)).toEqual({
      ok: false,
      checks: [
        { job: PUMP, ageSeconds: 300, ok: true },
        { job: DAILY, ageSeconds: null, ok: false },
        { job: "queue", ageSeconds: null, ok: true },
      ],
    });
  });

  it("exposes only the two clocks and the queue, and only job, ageSeconds and ok (no detail, no other jobs)", () => {
    const withDetail = { ...row(PUMP, 5), detail: "secret failure text" };
    const report = evaluatePublicHealth([withDetail, row(DAILY, 5), row("heartbeat:prices", 5)], 10);
    expect(report.checks.map((c) => Object.keys(c))).toEqual([
      ["job", "ageSeconds", "ok"],
      ["job", "ageSeconds", "ok"],
      ["job", "ageSeconds", "ok"],
    ]);
    expect(JSON.stringify(report)).not.toMatch(/secret|prices|detail/);
  });

  it("clamps clock skew to zero and tolerates a numeric string from Postgres", () => {
    const report = evaluatePublicHealth(
      [
        { job: PUMP, age_seconds: -3, ok: true },
        { job: DAILY, age_seconds: "90.7", ok: true },
      ],
      -2,
    );
    expect(report.checks.map((c) => c.ageSeconds)).toEqual([0, 90, 0]);
  });
});

describe("the queue check (plan E7, ruling R11)", () => {
  it.each([
    ["nothing runnable (null)", null, true],
    ["a step waiting 6 h exactly", QUEUE_STALE_SECONDS, true],
    ["a step waiting 6 h + 1 s", QUEUE_STALE_SECONDS + 1, false],
  ])("%s gives the same verdict on both paths", (_label, age, healthy) => {
    const { strip, monitor } = bothVerdicts(minutesAgo(5), minutesAgo(60), age);
    expect(strip.queue.ok).toBe(healthy);
    expect(strip.ok).toBe(healthy);
    expect(monitor.ok).toBe(healthy);
    expect(monitor.checks[2]).toEqual({ job: "queue", ageSeconds: age, ok: healthy });
    expect(strip.queue).toEqual({ ageSeconds: age, ok: healthy });
  });

  it("names a stuck queue in its own sentence, and leaves the clock list to the clocks", () => {
    const report = evaluateHealth({ [PUMP]: minutesAgo(5), [DAILY]: minutesAgo(60) }, NOW, 7 * 3600 + 120);
    expect(describeQueue(report)).toBe("Documents have not moved for 7 h; your uploads are safe");
    expect(describeStale(report)).toEqual([]);
    expect(describeQueue(evaluateHealth({ [PUMP]: minutesAgo(5), [DAILY]: minutesAgo(60) }, NOW, 60))).toBeNull();
  });
});

describe("getPublicHealth", () => {
  const dbWith = (results: Record<string, { data: unknown; error: unknown }>) => {
    const calls: string[] = [];
    const db = {
      rpc: async (name: string) => {
        calls.push(name);
        return results[name];
      },
    } as unknown as Db;
    return { db, calls };
  };
  const QUEUE_EMPTY = { data: null, error: null };

  it("calls public.heartbeat_ages() and public.queue_age() and evaluates both", async () => {
    const { db, calls } = dbWith({ heartbeat_ages: { data: [{ job: PUMP, age_seconds: 60, ok: true }], error: null }, queue_age: { data: 30, error: null } });
    const report = await getPublicHealth(db);
    expect(calls.sort()).toEqual(["heartbeat_ages", "queue_age"]);
    expect(report.checks[0]).toEqual({ job: PUMP, ageSeconds: 60, ok: true });
    expect(report.checks[2]).toEqual({ job: "queue", ageSeconds: 30, ok: true });
  });

  it("throws when the database call fails", async () => {
    const { db } = dbWith({ heartbeat_ages: { data: null, error: { message: "paused", code: "08006" } }, queue_age: QUEUE_EMPTY });
    await expect(getPublicHealth(db)).rejects.toThrow(/ops.heartbeatAges/);
    const queueDown = dbWith({ heartbeat_ages: { data: [], error: null }, queue_age: { data: null, error: { message: "x", code: "08006" } } });
    await expect(getPublicHealth(queueDown.db)).rejects.toThrow(/ops.queueAge/);
  });

  it("readQueueAge reads null as an empty queue", async () => {
    expect(await readQueueAge(dbWith({ queue_age: QUEUE_EMPTY }).db)).toBeNull();
    expect(await readQueueAge(dbWith({ queue_age: { data: "42", error: null } }).db)).toBe(42);
  });
});
