import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { QUEUE_STALE_SECONDS } from "@/modules/ingestion/client";
import type { LatestRun } from "./heartbeat";
import { describeNotes, describeQueue, describeStale, evaluateHealth, evaluatePublicHealth, getPublicHealth, readQueueAge } from "./health";

const NOW = new Date("2026-10-04T12:00:00Z");
const PUMP = "heartbeat:pump";
const DAILY = "heartbeat:daily";
const PRICES = "ledger:prices";
const SCORE = "ledger:score";
const ANCHOR = "ledger:anchor";
const secondsAgo = (s: number, ok = true, detail?: string): LatestRun => ({ ranAt: new Date(NOW.getTime() - s * 1000).toISOString(), ok, ...(detail === undefined ? {} : { detail }) });
const minutesAgo = (m: number, ok = true, detail?: string) => secondsAgo(m * 60, ok, detail);

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
    expect(report.checks.map((c) => c.ageSeconds)).toEqual([1200, 108_000, null, null, null]);
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
    expect(strip.checks.map((c) => [c.job, c.ok, c.ageSeconds])).toEqual(monitor.checks.slice(0, 5).map((c) => [c.job, c.ok, c.ageSeconds]));
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
        { job: PRICES, ageSeconds: null, ok: true },
        { job: SCORE, ageSeconds: null, ok: true },
        { job: ANCHOR, ageSeconds: null, ok: true },
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
        { job: PRICES, ageSeconds: null, ok: true },
        { job: SCORE, ageSeconds: null, ok: true },
        { job: ANCHOR, ageSeconds: null, ok: true },
        { job: "queue", ageSeconds: null, ok: true },
      ],
    });
  });

  it("exposes only the clocks and the queue, and only job, ageSeconds and ok (no detail, no other jobs)", () => {
    const withDetail = { ...row(PUMP, 5), detail: "secret failure text" };
    const report = evaluatePublicHealth([withDetail, row(DAILY, 5), row("heartbeat:other", 5), row("ledger:other", 5)], 10);
    expect(report.checks.map((c) => c.job)).toEqual([PUMP, DAILY, PRICES, SCORE, ANCHOR, "queue"]);
    expect(report.checks.map((c) => Object.keys(c))).toEqual(Array(6).fill(["job", "ageSeconds", "ok"]));
    expect(JSON.stringify(report)).not.toMatch(/secret|other|detail/);
  });

  it("clamps clock skew to zero and tolerates a numeric string from Postgres", () => {
    const report = evaluatePublicHealth(
      [
        { job: PUMP, age_seconds: -3, ok: true },
        { job: DAILY, age_seconds: "90.7", ok: true },
      ],
      -2,
    );
    expect(report.checks.map((c) => c.ageSeconds)).toEqual([0, 90, null, null, null, 0]);
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
    expect(monitor.checks[5]).toEqual({ job: "queue", ageSeconds: age, ok: healthy });
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
    expect(report.checks[5]).toEqual({ job: "queue", ageSeconds: 30, ok: true });
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

describe("the ledger's three optional clocks (Plan 3a Task 7)", () => {
  const row = (job: string, seconds: number, ok = true) => ({ job, age_seconds: seconds, ok });
  const base = [row(PUMP, 60), row(DAILY, 60)];
  const HOURS = 3600;

  it("a job that has never run is healthy, on the strip and on the monitor", () => {
    const strip = evaluateHealth({ [PUMP]: minutesAgo(5), [DAILY]: minutesAgo(60) }, NOW, null);
    expect(strip.ok).toBe(true);
    expect(strip.checks.map((c) => [c.job, c.ok, c.ageSeconds])).toEqual([
      [PUMP, true, 300],
      [DAILY, true, 3600],
      [PRICES, true, null],
      [SCORE, true, null],
      [ANCHOR, true, null],
    ]);
    expect(describeStale(strip)).toEqual([]);
    expect(evaluatePublicHealth(base, null).ok).toBe(true);
  });

  it("a failed latest run is unhealthy, even though it is fresh, on both paths", () => {
    const strip = evaluateHealth({ [PUMP]: minutesAgo(5), [DAILY]: minutesAgo(60), [PRICES]: minutesAgo(10, false) }, NOW, null);
    expect(strip.ok).toBe(false);
    expect(describeStale(strip)).toEqual(["the closing prices' last run failed 10 min ago"]);
    const monitor = evaluatePublicHealth([...base, row(PRICES, 600, false)], null);
    expect(monitor.ok).toBe(false);
    expect(monitor.checks.find((c) => c.job === PRICES)).toEqual({ job: PRICES, ageSeconds: 600, ok: false });
  });

  it.each([
    ["exactly 36 h", 36 * HOURS, true],
    ["36 h + 1 s", 36 * HOURS + 1, false],
  ])("a run %s old is %s on both paths", (_label, seconds, healthy) => {
    const strip = evaluateHealth({ [PUMP]: minutesAgo(5), [DAILY]: minutesAgo(60), [ANCHOR]: secondsAgo(seconds) }, NOW, null);
    expect(strip.ok).toBe(healthy);
    expect(evaluatePublicHealth([...base, row(ANCHOR, seconds)], null).ok).toBe(healthy);
  });

  it("a healthy run in the window is ok and reports only its age", () => {
    const monitor = evaluatePublicHealth([...base, row(PRICES, 5 * HOURS), row(SCORE, 5 * HOURS), row(ANCHOR, 5 * HOURS)], null);
    expect(monitor.checks.slice(2, 5)).toEqual([
      { job: PRICES, ageSeconds: 18_000, ok: true },
      { job: SCORE, ageSeconds: 18_000, ok: true },
      { job: ANCHOR, ageSeconds: 18_000, ok: true },
    ]);
    expect(monitor.ok).toBe(true);
  });

  it("the optional clocks and a missing core clock still make the report red", () => {
    expect(evaluatePublicHealth([row(PUMP, 60), row(PRICES, 60), row(ANCHOR, 60)], null).ok).toBe(false);
  });
});

describe("a failed ledger:score run is seen (review I-5)", () => {
  const row = (job: string, seconds: number, ok = true) => ({ job, age_seconds: seconds, ok });
  const base = [row(PUMP, 60), row(DAILY, 60)];
  const fresh = { [PUMP]: minutesAgo(5), [DAILY]: minutesAgo(60) };

  it("turns /api/health red with exactly the same shape as the other optional checks", () => {
    const monitor = evaluatePublicHealth([...base, row(SCORE, 600, false)], null);
    expect(monitor.ok).toBe(false);
    expect(monitor.checks.find((c) => c.job === SCORE)).toEqual({ job: SCORE, ageSeconds: 600, ok: false });
    expect(Object.keys(monitor.checks.find((c) => c.job === SCORE) ?? {})).toEqual(["job", "ageSeconds", "ok"]);
  });

  it("is stale after 36 h, and never run is green", () => {
    expect(evaluatePublicHealth([...base, row(SCORE, 36 * 3600 + 1)], null).ok).toBe(false);
    expect(evaluatePublicHealth(base, null).checks.find((c) => c.job === SCORE)).toEqual({ job: SCORE, ageSeconds: null, ok: true });
  });

  it("shows the plain reason on the desk strip for a failed ledger step, from the heartbeat's own detail", () => {
    const strip = evaluateHealth({ ...fresh, [SCORE]: minutesAgo(10, false, "the ledger failed its own check (chain_broken); nothing was scored") }, NOW, null);
    expect(describeStale(strip)).toEqual(["the scores' last run failed 10 min ago: the ledger failed its own check (chain_broken); nothing was scored"]);
  });

  it("shows the reason for a failed closing-prices run, and none for a core clock (their text stays out of the strip)", () => {
    const strip = evaluateHealth(
      { [PUMP]: minutesAgo(5, false, "ingestion.claim (57014)"), [DAILY]: minutesAgo(60), [PRICES]: minutesAgo(10, false, "NSE refused; closes to 2026-10-09, 3 weekdays behind") },
      NOW,
      null,
    );
    expect(describeStale(strip)).toEqual([
      "the 15-minute pump's last run failed 5 min ago",
      "the closing prices' last run failed 10 min ago: NSE refused; closes to 2026-10-09, 3 weekdays behind",
    ]);
  });

  it("says nothing extra when a failed ledger run has no detail", () => {
    const strip = evaluateHealth({ ...fresh, [SCORE]: minutesAgo(10, false) }, NOW, null);
    expect(describeStale(strip)).toEqual(["the scores' last run failed 10 min ago"]);
  });

  it("notes a tracked company with no row in the last good closing-prices run, without turning anything red", () => {
    const strip = evaluateHealth({ ...fresh, [PRICES]: minutesAgo(60, true, "stored 1 date, 1 close, 1 of 3 companies had no row") }, NOW, null);
    expect(strip.ok).toBe(true);
    expect(describeNotes(strip)).toEqual(["The latest closing-prices run found no row for 1 of 3 companies in NSE's file."]);
    expect(describeNotes(evaluateHealth({ ...fresh, [PRICES]: minutesAgo(60, true, "stored 1 date, 3 closes") }, NOW, null))).toEqual([]);
  });

  it("a note is not shown for a failed run (the red sentence already carries the reason)", () => {
    const failed = evaluateHealth({ ...fresh, [PRICES]: minutesAgo(60, false, "1 of 3 companies had no row; x") }, NOW, null);
    expect(describeNotes(failed)).toEqual([]);
  });

  it("the public monitor never carries the note or the reason", () => {
    const monitor = evaluatePublicHealth([...base, { ...row(PRICES, 60), detail: "1 of 3 companies had no row" } as never], null);
    expect(JSON.stringify(monitor)).not.toMatch(/company|companies|row/);
  });
});
