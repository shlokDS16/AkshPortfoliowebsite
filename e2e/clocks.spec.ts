import { expect, test } from "@playwright/test";
import { createFixtureAnchor, fixtureAnchorDirectory } from "../src/lib/providers/fixture-anchor";
import { requireStack } from "./support/auth";
import { seedEmptyFinishedDays } from "./support/anchors";
import { adminDb } from "./support/desk";
import { clearHeartbeats, resetToFreshHeartbeats, seedHeartbeats, seedHeartbeatsDbTime } from "./support/heartbeats";
import { E2E_CRON_SECRET as CRON_SECRET } from "./support/stack";

// Anonymous checks of the two job routes and /api/health. They mutate the shared heartbeats table,
// so the clocks are left healthy for the specs that follow.
test.afterAll(async () => {
  await resetToFreshHeartbeats(requireStack());
});

test.describe("job routes", () => {
  test("both refuse a call without the bearer secret, uncached, and write nothing", async ({ request }) => {
    clearHeartbeats();
    const daily = await request.get("/api/cron/daily");
    const pump = await request.post("/api/jobs/run");
    for (const response of [daily, pump]) {
      expect(response.status()).toBe(401);
      expect(response.headers()["cache-control"]).toBe("no-store");
    }
    const wrong = await request.post("/api/jobs/run", { headers: { authorization: `Bearer ${"x".repeat(40)}` } });
    expect(wrong.status()).toBe(401);
    // Nothing was written, so the monitor still sees a clock that never ran.
    const health = await request.get("/api/health");
    expect(health.status()).toBe(500);
  });

  test("with the bearer secret each writes its own heartbeat, which turns /api/health green", async ({ request }) => {
    clearHeartbeats();
    const headers = { authorization: `Bearer ${CRON_SECRET}` };
    const daily = await request.get("/api/cron/daily", { headers });
    expect(daily.status()).toBe(200);
    expect(await daily.json()).toEqual({
      ok: true,
      results: [
        { job: "heartbeat:daily", ok: true },
        { job: "ledger:prices", ok: true },
        { job: "ledger:score", ok: true },
        { job: "ledger:anchor", ok: true },
        { job: "ingestion:sweep", ok: true },
      ],
    });
    const pump = await request.post("/api/jobs/run", { headers });
    expect(pump.status()).toBe(200);
    expect(await pump.json()).toEqual({
      ok: true,
      results: [
        { job: "heartbeat:pump", ok: true },
        { job: "ingestion:drain", ok: true },
      ],
    });

    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
  });
});

test.describe("/api/health", () => {
  test("is 200 with ages only when both clocks are fresh and the queue is moving", async ({ request }) => {
    clearHeartbeats();
    seedHeartbeatsDbTime([
      { job: "heartbeat:pump", minutesAgo: 5 },
      { job: "heartbeat:daily", minutesAgo: 180 },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = (await response.json()) as { ok: boolean; checks: { job: string; ageSeconds: number | null; ok: boolean }[] };
    expect(body.ok).toBe(true);
    expect(body.checks.map((c) => [c.job, c.ok, Object.keys(c).join()])).toEqual([
      ["heartbeat:pump", true, "job,ageSeconds,ok"],
      ["heartbeat:daily", true, "job,ageSeconds,ok"],
      // the ledger's clocks are optional: never run is healthy, and still reports only a job, an age and a boolean
      ["ledger:prices", true, "job,ageSeconds,ok"],
      ["ledger:score", true, "job,ageSeconds,ok"],
      ["ledger:anchor", true, "job,ageSeconds,ok"],
      ["queue", true, "job,ageSeconds,ok"],
    ]);
    // Seeded and aged by the same (database) clock, so the age is the seed offset plus the few
    // seconds this test took; no skew allowance is needed.
    expect(body.checks[0].ageSeconds).toBeGreaterThanOrEqual(300);
    expect(body.checks[0].ageSeconds).toBeLessThan(360);
    expect(body.checks[1].ageSeconds).toBeGreaterThanOrEqual(10_800);
    expect(body.checks[1].ageSeconds).toBeLessThan(10_860);
    expect(JSON.stringify(body)).not.toContain("e2e seed");
    expect(body.checks[2].ageSeconds).toBeNull();
    expect(body.checks[3].ageSeconds).toBeNull();
    expect(body.checks[4].ageSeconds).toBeNull();
  });

  test("is 500 when the pump's latest run failed, even though it is fresh", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5, ok: false },
      { job: "heartbeat:daily", minutesAgo: 60 },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    expect(((await response.json()) as { checks: { ok: boolean }[] }).checks.map((c) => c.ok)).toEqual([false, true, true, true, true, true]);
  });

  test("is 500 when the pump has been silent for more than 2 hours", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 130 },
      { job: "heartbeat:daily", minutesAgo: 60 },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    expect(((await response.json()) as { checks: { ok: boolean }[] }).checks.map((c) => c.ok)).toEqual([false, true, true, true, true, true]);
  });
});

test.describe("/api/health and the ledger's clocks (Plan 3a Task 7)", () => {
  type Check = { job: string; ageSeconds: number | null; ok: boolean };

  test("a failed ledger:prices run turns the monitor red, and says nothing but a job, an age and a boolean", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5 },
      { job: "heartbeat:daily", minutesAgo: 60 },
      { job: "ledger:prices", minutesAgo: 10, ok: false },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    const body = (await response.json()) as { ok: boolean; checks: Check[] };
    expect(body.checks.map((c) => [c.job, c.ok, Object.keys(c).join()])).toEqual([
      ["heartbeat:pump", true, "job,ageSeconds,ok"],
      ["heartbeat:daily", true, "job,ageSeconds,ok"],
      ["ledger:prices", false, "job,ageSeconds,ok"],
      ["ledger:score", true, "job,ageSeconds,ok"],
      ["ledger:anchor", true, "job,ageSeconds,ok"],
      ["queue", true, "job,ageSeconds,ok"],
    ]);
    expect(JSON.stringify(body)).not.toContain("e2e seed");
  });

  test("a failed ledger:score run turns the monitor red too, with the same three keys", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5 },
      { job: "heartbeat:daily", minutesAgo: 60 },
      { job: "ledger:score", minutesAgo: 10, ok: false },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    const body = (await response.json()) as { ok: boolean; checks: Check[] };
    expect(body.checks.map((c) => [c.job, c.ok, Object.keys(c).join()])).toContainEqual(["ledger:score", false, "job,ageSeconds,ok"]);
    expect(JSON.stringify(body)).not.toContain("e2e seed");
  });

  test("a ledger:anchor run older than 36 hours turns it red; a fresh good one is green", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5 },
      { job: "heartbeat:daily", minutesAgo: 60 },
      { job: "ledger:anchor", minutesAgo: 37 * 60 },
    ]);
    const stale = await request.get("/api/health");
    expect(stale.status()).toBe(500);
    expect(((await stale.json()) as { checks: Check[] }).checks.map((c) => c.ok)).toEqual([true, true, true, true, false, true]);

    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5 },
      { job: "heartbeat:daily", minutesAgo: 60 },
      { job: "ledger:prices", minutesAgo: 120 },
      { job: "ledger:score", minutesAgo: 120 },
      { job: "ledger:anchor", minutesAgo: 120 },
    ]);
    const fresh = await request.get("/api/health");
    expect(fresh.status()).toBe(200);
    const checks = ((await fresh.json()) as { checks: Check[] }).checks;
    expect(checks.map((c) => c.ok)).toEqual([true, true, true, true, true, true]);
    expect(checks[2].ageSeconds).toBeGreaterThanOrEqual(7200);
  });
});

test.describe("the daily run with an idea on file (fixture market data)", () => {
  test("stores the closes and a score row, marks both ledger steps ok, and a settled repeat changes nothing", async ({ request }) => {
    test.setTimeout(180_000);
    const db = await adminDb();
    const symbol = `LGR${Date.now().toString(36).toUpperCase()}`;
    const company = await db.from("companies").insert({ slug: symbol.toLowerCase(), name: `${symbol} Ltd`, nse_symbol: symbol }).select("id").single();
    if (company.error) throw company.error;
    const idea = await db.rpc("open_idea", {
      p_company_id: company.data.id,
      p_expects: "outperform",
      p_horizon_days: 365,
      p_held: false,
      p_body_md: "The order book is growing faster than the street expects.",
    });
    if (idea.error) throw idea.error;
    const ideaId = idea.data;

    clearHeartbeats();
    const headers = { authorization: `Bearer ${CRON_SECRET}` };
    const first = await request.get("/api/cron/daily", { headers });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({
      ok: true,
      results: [
        { job: "heartbeat:daily", ok: true },
        { job: "ledger:prices", ok: true },
        { job: "ledger:score", ok: true },
        { job: "ledger:anchor", ok: true },
        { job: "ingestion:sweep", ok: true },
      ],
    });

    // Two dates a run: a week's weekdays settle within three runs.
    const latestDetail = async () => {
      const { data, error } = await db.from("heartbeats").select("detail").eq("job", "ledger:prices").order("ran_at", { ascending: false }).limit(1).single();
      if (error) throw error;
      return data.detail;
    };
    for (let i = 0; i < 4 && (await latestDetail()) !== "up to date"; i++) {
      expect((await request.get("/api/cron/daily", { headers })).status()).toBe(200);
    }
    expect(await latestDetail()).toBe("up to date");

    const counts = async () => {
      const prices = await db.from("prices_daily").select("id", { count: "exact", head: true });
      const days = await db.from("market_days").select("trade_date", { count: "exact", head: true });
      const scores = await db.from("idea_scores").select("idea_id", { count: "exact", head: true });
      if (prices.error || days.error || scores.error) throw prices.error ?? days.error ?? scores.error;
      return [prices.count, days.count, scores.count];
    };
    const priced = await db.from("prices_daily").select("trade_date, source").eq("company_id", company.data.id);
    if (priced.error) throw priced.error;
    expect(priced.data.length).toBeGreaterThanOrEqual(1);
    expect(priced.data.every((p) => p.source === "nse_fetch")).toBe(true);
    const score = await db.from("idea_scores").select("idea_id, flags").eq("idea_id", ideaId);
    if (score.error) throw score.error;
    expect(score.data).toHaveLength(1);

    const before = await counts();
    const repeat = await request.get("/api/cron/daily", { headers });
    expect(repeat.status()).toBe(200);
    expect(await counts()).toEqual(before);
    expect(await latestDetail()).toBe("up to date");
  });
});

test.describe("ledger:anchor with the fixture anchor (Plan 3a Task 9)", () => {
  test("publishes each finished day's line once, and a repeat of the run changes nothing", async ({ request }) => {
    test.setTimeout(120_000);
    const db = await adminDb();
    seedEmptyFinishedDays();
    const headers = { authorization: `Bearer ${CRON_SECRET}` };
    const lastDetail = async () => {
      const { data, error } = await db.from("heartbeats").select("ok, detail").eq("job", "ledger:anchor").order("ran_at", { ascending: false }).limit(1).single();
      if (error) throw error;
      return data;
    };
    const rows = async () => {
      const { data, error } = await db.from("ledger_anchors").select("anchor_date, line, published_at, anchor_version").order("anchor_date");
      if (error) throw error;
      return data;
    };
    const gist = async () => {
      const out = await createFixtureAnchor({ directory: fixtureAnchorDirectory(requireStack().apiUrl) }).readAll();
      if (out.kind !== "ok") throw new Error(`the fixture gist could not be read (${out.kind})`);
      return out.files;
    };

    const first = await request.get("/api/cron/daily", { headers });
    expect(first.status()).toBe(200);
    expect((await first.json()).results).toContainEqual({ job: "ledger:anchor", ok: true });
    const run = await lastDetail();
    expect(run.ok).toBe(true);
    // A fresh database adds the days; a repeat run (no reset) finds them already published. Either way both agree afterwards.
    expect(run.detail).toMatch(
      /^sealed \d+ days?; (added \d+ days? to the public copy \(\d{4}-\d{2}-\d{2}( to \d{4}-\d{2}-\d{2})?\)(; recorded \d+ days? already in the public copy)?|recorded \d+ days? already in the public copy|the public copy is up to date)$/,
    );
    const published = await rows();
    expect(published.length).toBeGreaterThanOrEqual(2);
    expect(published.every((r) => r.published_at !== null && /^fixture-\d+$/.test(r.anchor_version ?? ""))).toBe(true);

    // The gist holds exactly the database's lines, year by year, each with its line break.
    const files = await gist();
    for (const year of new Set(published.map((r) => r.anchor_date.slice(0, 4)))) {
      const expected = published.filter((r) => r.anchor_date.startsWith(year)).map((r) => `${r.line}\n`).join("");
      expect(files.get(`ledger-${year}.jsonl`)).toBe(expected);
    }

    expect((await request.get("/api/cron/daily", { headers })).status()).toBe(200);
    expect(await lastDetail()).toEqual({ ok: true, detail: "sealed 0 days; the public copy is up to date" });
    expect(await rows()).toEqual(published);
  });
});
