import { expect, test, type Page } from "@playwright/test";
import { requireStack } from "./support/auth";
import { publishCurrentRevisionAsAdmin } from "./support/items";
import { E2E_ADMIN_EMAIL } from "./support/stack";

// Runs signed in as the admin (storage state from the `setup` project).
// The local database is not reset between runs, so titles carry a run suffix.
const RUN = Date.now().toString(36);
const ITEM_URL = /\/desk\/items\/([0-9a-f-]{36})$/;

async function createItem(page: Page, title: string, kind = "learning"): Promise<string> {
  await page.getByLabel("Kind").selectOption(kind);
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(ITEM_URL);
  return ITEM_URL.exec(page.url())![1];
}

async function saveRevision(page: Page, body: string, reason: string) {
  await page.getByLabel("Body (Markdown)").fill(body);
  await page.getByLabel("Change reason").fill(reason);
  await page.getByRole("button", { name: "Save revision" }).click();
}

test("create an item, save details and revisions, and read the diff", async ({ page }) => {
  await page.goto("/desk/items");
  const title = `How capex cycles turn ${RUN}`;
  await createItem(page, title);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
  await expect(page.getByTestId("slug")).toContainText("set automatically on first publish");

  await page.getByLabel("Learning objective").fill("Recognise a capex peak.");
  await page.getByLabel("Holds position").selectOption("no");
  await page.getByLabel("Data as of").fill("2026-08-01");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Details saved." })).toHaveText("Details saved.");
  await page.reload();
  await expect(page.getByLabel("Learning objective")).toHaveValue("Recognise a capex peak.");
  await expect(page.getByLabel("Holds position")).toHaveValue("no");
  await expect(page.getByLabel("Data as of")).toHaveValue("2026-08-01");

  await saveRevision(page, "line a\nline b", "first draft");
  await expect(page.getByRole("status").filter({ hasText: "Revision saved." })).toHaveText("Revision saved.");
  await saveRevision(page, "line a\nline c", "swap b for c");
  await expect(page.getByText("current revision #3")).toBeVisible();

  const history = page.locator("section", { has: page.getByRole("heading", { name: "Revision history" }) });
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await history.getByRole("listitem").filter({ hasText: "#3" }).getByRole("link", { name: "diff" }).click();
  const diff = page.getByTestId("diff");
  await expect(diff.locator('[data-op="remove"]')).toHaveText("- line b");
  await expect(diff.locator('[data-op="add"]')).toHaveText("+ line c");
  await expect(diff.locator('[data-op="equal"]')).toHaveText("  line a");

  await page.goto("/desk/items");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("an empty title and an unknown item give plain messages", async ({ page }) => {
  await page.goto("/desk/items");
  await page.getByLabel("Title").evaluate((input: HTMLInputElement) => (input.required = false));
  await page.getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Title is required");

  const response = await page.goto("/desk/items/not-a-uuid");
  expect(response?.status()).toBe(404);
  const missing = await page.goto("/desk/items/00000000-0000-4000-8000-000000000000");
  expect(missing?.status()).toBe(404);
});

test("a revision on a public item waits for the gate and its details stay locked", async ({ page }) => {
  const stack = requireStack();
  await page.goto("/desk/items");
  const title = `Working capital discipline ${RUN}`;
  const itemId = await createItem(page, title);
  await page.getByLabel("Learning objective").fill("Read a cash conversion cycle.");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Details saved." })).toHaveText("Details saved.");
  await saveRevision(page, "published text", "ready");
  await expect(page.getByText("current revision #2")).toBeVisible();

  // Publish revision #2 through the real SQL gate, as the admin's own session.
  await publishCurrentRevisionAsAdmin(stack, E2E_ADMIN_EMAIL, itemId);

  await page.reload();
  await expect(page.getByTestId("visibility")).toHaveText("Public");
  await expect(page.getByTestId("slug")).not.toContainText("automatically");
  await expect(page.getByLabel("Title")).toBeDisabled();
  await expect(page.getByText("This item is public. Unpublish it to change these details")).toBeVisible();

  await saveRevision(page, "published text, amended", "update after results");
  await expect(page.getByRole("status").filter({ hasText: "waiting for the publishing gate" })).toContainText("waiting for the publishing gate");
  await expect(page.getByTestId("pending-gate")).toContainText("1 revision is waiting for the publishing gate");
  await expect(page.getByTestId("pending-gate")).toContainText("revision #2");
  await expect(page.getByText("current revision #2")).toBeVisible();
  const row3 = page.getByRole("listitem").filter({ hasText: "#3" });
  await expect(row3).toContainText("waiting for the gate");
  await expect(row3).not.toContainText("current");

  // Even with the lock lifted in the browser, the server and the database refuse, in plain words.
  await page.evaluate(() => document.querySelector("fieldset")?.removeAttribute("disabled"));
  await page.getByLabel("Title").fill("Renamed while public");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("This item is public. Unpublish it before changing its details.");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

// Under mobile emulation Chrome widens the layout viewport to fit overflowing content, which keeps
// scrollWidth equal to clientWidth, so the layout width itself must also still be the phone's 375.
async function expectNoSidewaysScroll(page: Page) {
  const { client, scroll } = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(client).toBe(375);
  expect(scroll).toBeLessThanOrEqual(client);
}

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // Regression: an unbreakable diff line used to widen the whole desk (the layout wrapper shrink-wrapped
  // its content inside the flex body), pushing buttons off screen. The diff now scrolls on its own.
  test("a long revision line scrolls inside the diff and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/desk/items");
    await createItem(page, `Narrow screen ${RUN}`);
    await saveRevision(page, "A".repeat(10) + " " + "unbreakable-".repeat(30), "long line");
    await expect(page.getByRole("status").filter({ hasText: "Revision saved." })).toHaveText("Revision saved.");
    await expectNoSidewaysScroll(page);
    await page.getByRole("link", { name: "diff" }).first().click();
    await expect(page.getByTestId("diff")).toBeVisible();
    await expectNoSidewaysScroll(page);
  });
});
