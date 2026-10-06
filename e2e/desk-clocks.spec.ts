import { expect, test } from "@playwright/test";
import { clearMailbox, ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { clearHeartbeats, resetToFreshHeartbeats, seedHeartbeats } from "./support/heartbeats";
import { E2E_ADMIN_EMAIL, E2E_CRON_SECRET as CRON_SECRET } from "./support/stack";

test.beforeAll(async () => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL);
  await clearMailbox(stack);
});

// The next spec files expect healthy clocks, so leave them that way.
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
    expect(await daily.json()).toMatchObject({ ok: true, results: [{ job: "heartbeat:daily", ok: true }] });
    const pump = await request.post("/api/jobs/run", { headers });
    expect(pump.status()).toBe(200);
    expect(await pump.json()).toMatchObject({ ok: true, results: [{ job: "heartbeat:pump", ok: true }] });

    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
  });
});

test.describe("/api/health", () => {
  test("is 200 with ages only when both clocks are fresh", async ({ request }) => {
    await resetToFreshHeartbeats(requireStack());
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = (await response.json()) as { ok: boolean; checks: { job: string; ageSeconds: number; ok: boolean }[] };
    expect(body.ok).toBe(true);
    expect(body.checks.map((c) => [c.job, c.ok, Object.keys(c).join()])).toEqual([
      ["heartbeat:pump", true, "job,ageSeconds,ok"],
      ["heartbeat:daily", true, "job,ageSeconds,ok"],
    ]);
    expect(body.checks[0].ageSeconds).toBeGreaterThanOrEqual(300);
    expect(body.checks[0].ageSeconds).toBeLessThan(600);
    expect(JSON.stringify(body)).not.toContain("e2e seed");
  });

  test("is 500 when the pump has been silent for more than 2 hours", async ({ request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 130 },
      { job: "heartbeat:daily", minutesAgo: 60 },
    ]);
    const response = await request.get("/api/health");
    expect(response.status()).toBe(500);
    expect(((await response.json()) as { checks: { ok: boolean }[] }).checks.map((c) => c.ok)).toEqual([false, true]);
  });
});

test.describe("desk red strip", () => {
  test.beforeEach(async ({ page }) => {
    const hash = await tokenHashFor(requireStack(), E2E_ADMIN_EMAIL);
    await page.goto(`/auth/confirm?token_hash=${hash}&type=magiclink&next=/desk`);
    await expect(page).toHaveURL(/\/desk$/);
  });

  test("is absent while both clocks are fresh", async ({ page }) => {
    await resetToFreshHeartbeats(requireStack());
    await page.goto("/desk");
    await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
    await expect(page.getByTestId("health-strip")).toHaveCount(0);
  });

  test("appears in plain English when the clocks are stale, and clears once they run again", async ({ page, request }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [{ job: "heartbeat:pump", minutesAgo: 300 }]);
    await page.goto("/desk");
    const strip = page.getByTestId("health-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("role", "alert");
    await expect(strip).toContainText("the 15-minute pump last ran 5 h ago");
    await expect(strip).toContainText("the daily job has never run");

    // The same strip sits above every desk page.
    await page.goto("/desk/items");
    await expect(page.getByTestId("health-strip")).toBeVisible();

    const headers = { authorization: `Bearer ${CRON_SECRET}` };
    expect((await request.post("/api/jobs/run", { headers })).status()).toBe(200);
    expect((await request.get("/api/cron/daily", { headers })).status()).toBe(200);
    await page.goto("/desk");
    await expect(page.getByTestId("health-strip")).toHaveCount(0);
  });
});
