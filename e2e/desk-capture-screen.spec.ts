import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

// The capture screen against the LOCAL stack, signed in through the `setup` project's storage state.
// The local database is not reset between runs, so every symbol and text carries a run suffix.
// `db` reads back as the signed-in admin (RLS applies).
const RUN = Date.now().toString(36).toUpperCase();
const QUEUE_KEY = "desk.captureQueue.v1";
const REJECTED_KEY = "desk.captureRejected.v1";
const CORRUPT_KEY = "desk.captureCorrupt.v1";

/** One localStorage key per capture: how many keys start with this prefix. */
const storedCount = (page: Page, prefix: string) =>
  page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(`${p}:`)).length, prefix);

let db: Db;

test.beforeAll(async () => {
  const stack = requireStack();
  db = createClient<Database>(stack.apiUrl, stack.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.auth.verifyOtp({ token_hash: await tokenHashFor(stack, E2E_ADMIN_EMAIL), type: "magiclink" });
  if (error) throw error;
});

const box = (page: Page) => page.getByRole("textbox", { name: "Capture" });

async function captureCount(rawText: string): Promise<number> {
  const { count, error } = await db.from("captures").select("id", { count: "exact", head: true }).eq("raw_text", rawText);
  if (error) throw error;
  return count ?? 0;
}

test("the box is focused, Enter saves and clears, Shift+Enter adds a line", async ({ page }) => {
  await page.goto("/desk");
  await expect(box(page)).toBeFocused();

  await box(page).pressSequentially(`first line ${RUN}`);
  await box(page).press("Shift+Enter");
  await box(page).pressSequentially("second line");
  await expect(box(page)).toHaveValue(`first line ${RUN}\nsecond line`);

  await box(page).press("Enter");
  await expect(box(page)).toHaveValue("");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(box(page)).toBeFocused();
  await expect(page.getByRole("region", { name: "Today" })).toContainText(`first line ${RUN}`);
  await expect(page.getByText(/Logged research on \d+ of the last 30 days\./)).toBeVisible();
  expect(await captureCount(`first line ${RUN}\nsecond line`)).toBe(1);
});

test("a t: capture shows under its company and creates the thesis item", async ({ page }) => {
  await page.goto("/desk");
  const symbol = `E2E${RUN}T`;
  await box(page).fill(`t: $${symbol} deal wins slowing`);
  await box(page).press("Enter");
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByRole("heading", { name: symbol })).toBeVisible();
  await expect(today).toContainText(`$${symbol} deal wins slowing`);

  await page.goto("/desk/items");
  await expect(page.getByText(`${symbol} thesis`).first()).toBeVisible();
});

test("offline: saved on this device, then synced exactly once when back online", async ({ page, context }) => {
  await page.goto("/desk");
  const text = `offline thought ${RUN}`;
  await context.setOffline(true);
  await box(page).fill(text);
  await box(page).press("Enter");
  await expect(page.getByText(/saved on this device, will sync \(1 waiting\)/i)).toBeVisible();
  await expect(box(page)).toHaveValue("");
  expect(await storedCount(page, QUEUE_KEY)).toBe(1);
  expect(await captureCount(text)).toBe(0);

  await context.setOffline(false);
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Today" })).toContainText(text);
  expect(await storedCount(page, QUEUE_KEY)).toBe(0);
  expect(await captureCount(text)).toBe(1);

  // A reload must not send it again.
  await page.reload();
  await expect(box(page)).toBeFocused();
  expect(await captureCount(text)).toBe(1);
});

test("two offline t: captures for one new company sync in order into one thesis with two revisions", async ({ page, context }) => {
  await page.goto("/desk");
  const symbol = `E2E${RUN}Q`;
  await context.setOffline(true);
  await box(page).fill(`t: $${symbol} first view`);
  await box(page).press("Enter");
  await box(page).fill(`t: $${symbol} second view`);
  await box(page).press("Enter");
  await expect(page.getByText(/will sync \(2 waiting\)/i)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 20_000 });
  const { data: items } = await db.from("items").select("id").eq("title", `${symbol} thesis`);
  expect(items).toHaveLength(1);
  const { data: revisions } = await db.from("item_revisions").select("rev_no").eq("item_id", items?.[0].id ?? "").order("rev_no");
  expect(revisions?.map((r) => r.rev_no)).toEqual([1, 2]);
});

test("a capture the server permanently refuses is kept with its text until dismissed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/desk");
  const tooLong = `${"x".repeat(20_001)} ${RUN}`;
  await box(page).fill(tooLong);
  await box(page).press("Enter");

  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention).toBeVisible();
  await expect(attention).toContainText("too long to capture");
  await expect(attention.getByTestId("attention-text")).toHaveText(tooLong);
  expect(await storedCount(page, QUEUE_KEY)).toBe(0);
  expect(await storedCount(page, REJECTED_KEY)).toBe(1);

  await attention.getByRole("button", { name: "Copy text" }).click();
  await expect(attention.getByText("Copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tooLong);

  await page.reload();
  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  expect(await storedCount(page, REJECTED_KEY)).toBe(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
});

test("blocked browser storage shows a notice, and capturing still works online", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await page.goto("/desk");
  await expect(page.getByRole("alert").filter({ hasText: "Offline saving is unavailable on this device" })).toBeVisible();
  const text = `blocked storage ${RUN}`;
  await box(page).fill(text);
  await box(page).press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await captureCount(text)).toBe(1);
});

test("an unreadable stored capture is kept raw under Needs attention, with Copy and Dismiss, and the box still works", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/desk");
  await page.evaluate((key) => localStorage.setItem(`${key}:broken`, "{not json but my thought"), QUEUE_KEY);
  await page.reload();
  await expect(box(page)).toBeFocused();

  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention.getByTestId("attention-text")).toHaveText("{not json but my thought");
  expect(await storedCount(page, QUEUE_KEY)).toBe(0);
  expect(await storedCount(page, CORRUPT_KEY)).toBe(1);
  await attention.getByRole("button", { name: "Copy text" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("{not json but my thought");

  const text = `after corruption ${RUN}`;
  await box(page).fill(text);
  await box(page).press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect(await captureCount(text)).toBe(1);

  await attention.getByRole("button", { name: "Dismiss" }).click();
  await expect(attention).toHaveCount(0);
  expect(await storedCount(page, CORRUPT_KEY)).toBe(0);
});

test("changes made in another tab show up here through the storage event", async ({ page, context }) => {
  await page.goto("/desk");
  const other = await context.newPage();
  await other.goto("/desk");
  await expect(other.getByRole("textbox", { name: "Capture" })).toBeFocused();

  const clientId = randomUUID();
  const rejectedId = randomUUID();
  await other.evaluate(
    ([queueKey, rejectedKey, id, rid, run]) => {
      const base = { source: "web", queuedAt: new Date().toISOString() };
      localStorage.setItem(`${queueKey}:${id}`, JSON.stringify({ ...base, clientId: id, rawText: `from another tab ${run}` }));
      localStorage.setItem(
        `${rejectedKey}:${rid}`,
        JSON.stringify({ ...base, clientId: rid, rawText: `refused elsewhere ${run}`, reason: "too-long", rejectedAt: new Date().toISOString() }),
      );
    },
    [QUEUE_KEY, REJECTED_KEY, clientId, rejectedId, RUN],
  );
  await expect(page.getByText(/will sync \(1 waiting\)/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" }).getByTestId("attention-text")).toHaveText(`refused elsewhere ${RUN}`);

  await other.evaluate(
    ([queueKey, rejectedKey, id, rid]) => {
      localStorage.removeItem(`${queueKey}:${id}`);
      localStorage.removeItem(`${rejectedKey}:${rid}`);
    },
    [QUEUE_KEY, REJECTED_KEY, clientId, rejectedId],
  );
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await expect(page.getByText(/will sync/i)).toHaveCount(0);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("the box is focused and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/desk");
    await expect(box(page)).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signed-out visitors are sent to login", async ({ page }) => {
    await page.goto("/desk");
    await expect(page).toHaveURL(/\/login$/);
  });
});
