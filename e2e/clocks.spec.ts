import { expect, test } from "@playwright/test";
import { requireStack } from "./support/auth";
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
      ["queue", true, "job,ageSeconds,ok"],
    ]);
    // Seeded and aged by the same (database) clock, so the age is the seed offset plus the few
    // seconds this test took; no skew allowance is needed.
    expect(body.checks[0].ageSeconds).toBeGreaterThanOrEqual(300);
    expect(body.checks[0].ageSeconds).toBeLessThan(360);
    expect(body.checks[1].ageSeconds).toBeGreaterThanOrEqual(10_800);
    expect(body.checks[1].ageSeconds).toBeLessThan(10_860);
    expect(JSON.stringify(body)).not.toContain("e2e seed");
  });

  test("is 500 when the pump's latest run failed, even though it is fresh", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5, ok: false },
      { job: "heartbeat:daily", minutesAgo: 60 },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    expect(((await response.json()) as { checks: { ok: boolean }[] }).checks.map((c) => c.ok)).toEqual([false, true, true]);
  });

  test("is 500 when the pump has been silent for more than 2 hours", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 130 },
      { job: "heartbeat:daily", minutesAgo: 60 },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    expect(((await response.json()) as { checks: { ok: boolean }[] }).checks.map((c) => c.ok)).toEqual([false, true, true]);
  });
});
