import { expect, test } from "@playwright/test";
import { requireStack } from "./support/auth";
import { clearHeartbeats, resetToFreshHeartbeats, seedHeartbeats } from "./support/heartbeats";
import { E2E_CRON_SECRET as CRON_SECRET } from "./support/stack";

// The red strip on the signed-in desk (storage state from the `setup` project). It seeds its own
// heartbeat states, so the clocks are left healthy for the specs that follow.
test.afterAll(async () => {
  await resetToFreshHeartbeats(requireStack());
});

test.describe("desk red strip", () => {
  test("is absent while both clocks are fresh", async ({ page }) => {
    await resetToFreshHeartbeats(requireStack());
    await page.goto("/desk");
    await expect(page.getByRole("link", { name: "Capture", exact: true })).toBeVisible();
    await expect(page.getByTestId("health-strip")).toHaveCount(0);
  });

  test("names a fresh failed run instead of calling the clock late", async ({ page }) => {
    clearHeartbeats();
    await seedHeartbeats(requireStack(), [
      { job: "heartbeat:pump", minutesAgo: 5, ok: false },
      { job: "heartbeat:daily", minutesAgo: 60 },
    ]);
    await page.goto("/desk");
    await expect(page.getByTestId("health-strip")).toContainText("the 15-minute pump's last run failed 5 min ago");
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
