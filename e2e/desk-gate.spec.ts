import { expect, test, type Page } from "@playwright/test";
import { clearMailbox, ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

// The local database is not reset between runs, so titles carry a run suffix.
const RUN = Date.now().toString(36);
const ITEM_URL = /\/desk\/items\/([0-9a-f-]{36})$/;

test.beforeAll(async () => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL);
  await clearMailbox(stack);
});

async function signIn(page: Page) {
  const hash = await tokenHashFor(requireStack(), E2E_ADMIN_EMAIL);
  await page.goto(`/auth/confirm?token_hash=${hash}&type=magiclink&next=/desk/items`);
  await expect(page).toHaveURL(/\/desk\/items$/);
}

async function createItem(page: Page, title: string): Promise<string> {
  await page.getByLabel("Kind").selectOption("learning");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(ITEM_URL);
  return ITEM_URL.exec(page.url())![1];
}

async function saveRevision(page: Page, body: string, reason: string) {
  await page.getByLabel("Body (Markdown)").fill(body);
  await page.getByLabel("Change reason").fill(reason);
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByRole("status")).toContainText("Revision saved");
}

const gate = (page: Page) => page.locator("#gate");

test("a blocked publish names the rule and highlights the sentence; an allowance then lets it through; unpublish retracts", async ({ page }) => {
  await signIn(page);
  await createItem(page, `Reading a capex cycle ${RUN}`);
  await page.getByLabel("Learning objective").fill("Recognise the late stage of a capex cycle.");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toHaveText("Details saved.");

  // Blocked: rule 1, exact sentence, the matched word highlighted.
  await saveRevision(page, "Utilisation peaked in 2024. You should buy the leader now.", "first draft");
  await gate(page).getByRole("button", { name: /^Publish revision #2$/ }).click();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  await expect(gate(page).getByText("Blocked by the gate, revision #2")).toBeVisible();
  await expect(gate(page).getByText("Rule 1: no actionable language")).toBeVisible();
  await expect(gate(page).getByTestId("flagged-sentence")).toHaveText("You should buy the leader now.");
  await expect(gate(page).getByTestId("flagged-sentence").locator("mark")).toHaveText("buy");
  await expect(gate(page).getByText("In: Body")).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
  // Not a banner about the gate for a private item.
  await expect(page.getByTestId("pending-gate")).toHaveCount(0);

  // An educational phrase: blocked first, then allowed with a reason, then published.
  await saveRevision(page, "Why I avoid target prices.", "reframed");
  await gate(page).getByRole("button", { name: /^Publish revision #3$/ }).click();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  await expect(gate(page).getByTestId("flagged-sentence")).toHaveText("Why I avoid target prices.");
  await gate(page).getByLabel("Reason for allowing this sentence").fill("Educational use of the phrase.");
  await gate(page).getByRole("button", { name: "Allow sentence" }).click();
  await expect(page.getByRole("status")).toContainText("Sentence allowed");

  await gate(page).getByRole("button", { name: /^Publish revision #3$/ }).click();
  await expect(page.getByRole("status")).toHaveText("Published.");
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  await expect(gate(page).getByText(/Allowed as educational usage: "Why I avoid target prices."/)).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Public");
  await expect(page.getByTestId("slug")).toHaveText(/^reading-a-capex-cycle-[a-z0-9]+-[0-9a-f]{6}$/);
  await expect(gate(page).getByText("Live: revision #3")).toBeVisible();

  // A newer revision waits for the gate and can be published from the panel.
  await expect(page.getByLabel("Title")).toBeDisabled();
  await saveRevision(page, "Why I avoid target prices. Margins matter more.", "added a line");
  await expect(page.getByTestId("pending-gate")).toContainText("1 revision is waiting for the publishing gate");
  await expect(gate(page).getByRole("button", { name: /^Publish revision #4$/ })).toBeVisible();

  // Retraction: private again, editable again.
  await gate(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByRole("status")).toContainText("private again");
  await expect(page.getByTestId("visibility")).toHaveText("Private");
  await expect(page.getByLabel("Title")).toBeEnabled();
  await expect(page.getByTestId("pending-gate")).toHaveCount(0);
  await expect(gate(page).getByRole("button", { name: "Unpublish" })).toHaveCount(0);
});

test("a failed attempt stays on the record and survives a reload", async ({ page }) => {
  await signIn(page);
  await createItem(page, `Recorded failure ${RUN}`);
  await page.getByLabel("Learning objective").fill("See how a failure is recorded.");
  await page.getByRole("button", { name: "Save details" }).click();
  await saveRevision(page, "Accumulate on dips.", "draft");
  await gate(page).getByRole("button", { name: /^Publish revision #2$/ }).click();
  await expect(gate(page).getByTestId("gate-failure").first()).toHaveAttribute("data-rule", "1");
  await page.goto(page.url().split("?")[0].split("#")[0]);
  await expect(gate(page).getByText("Blocked by the gate, revision #2")).toBeVisible();
  await expect(gate(page).getByTestId("flagged-sentence")).toHaveText("Accumulate on dips.");
  // Times are India time, not UTC.
  await expect(gate(page).getByTestId("gate-decision").locator("p").first()).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} IST/);
  await expect(gate(page).getByRole("button", { name: "Allow sentence" })).toBeVisible();
  await expect(page.getByTestId("stale-decision")).toHaveCount(0);

  // A newer revision makes the decision history: it stays readable, but no sentence can be allowed from it.
  await saveRevision(page, "Accumulate on dips, patiently.", "second draft");
  await expect(gate(page).getByTestId("stale-decision")).toContainText("This decision was made on revision #2");
  await expect(gate(page).getByTestId("flagged-sentence")).toHaveText("Accumulate on dips.");
  await expect(gate(page).getByRole("button", { name: "Allow sentence" })).toHaveCount(0);
  await expect(gate(page).getByRole("button", { name: /^Publish revision #3$/ })).toBeVisible();
});

test("an item without a learning objective is blocked by rule 6 in plain English", async ({ page }) => {
  await signIn(page);
  await createItem(page, `No objective ${RUN}`);
  await saveRevision(page, "A neutral sentence.", "draft");
  await gate(page).getByRole("button", { name: /^Publish revision #2$/ }).click();
  await expect(gate(page).getByText("Rule 6: educational framing")).toBeVisible();
  await expect(gate(page).getByText(/one-sentence learning objective/)).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
});

test("error text is never taken from the URL; only fixed codes show", async ({ page }) => {
  await signIn(page);
  await page.goto("/desk/items?error=Your%20account%20is%20compromised");
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.goto("/desk/items?error=title-required");
  await expect(page.locator("p[role=alert]")).toHaveText("Title is required");

  await page.goto("/desk/items");
  const itemId = await createItem(page, `Fixed codes ${RUN}`);
  await page.goto(`/desk/items/${itemId}?error=Wire%20money%20now`);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.goto(`/desk/items/${itemId}?error=public-item-locked`);
  await expect(page.locator("p[role=alert]")).toHaveText("This item is public. Unpublish it before changing its details.");
});
