import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { requireStack } from "./support/auth";
import { adminDb, hydrated } from "./support/desk";
import { installOutboundGuard } from "./support/outbound";
import { ADMIN_STATE, E2E_SITE_URL } from "./support/stack";

installOutboundGuard();

// Plan 5c Task 13: the desk letters screens on the LOCAL stack, in both desk projects (375 and 1280), through the screens Aksh uses. Nothing is
// sent and nothing is approved: the web server runs with DISTRIBUTION_ADAPTER=fixture, and this spec never presses Send, the test copy or
// "Send confirmation emails". It makes one letter from what is public, publishes it with its label as a subject (Send must stay off), unpublishes
// it, replaces the subject and publishes again, then unpublishes, so the public site is left as it was found.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SUBJECT = `What changed, e2e ${Date.now().toString(36)}`;
const LABEL_NOTE = /only a label the desk gave/;
const LABEL_WHY = "The subject is still a label. Replace it with your own subject, save, and run the gate again.";

test.describe.configure({ mode: "serial" });

let db: Db;
let letterPath = "";
let letterId = "";

test.beforeAll(async () => {
  requireStack();
  db = await adminDb();
});

// Whatever a failure leaves behind, the letter does not stay on the public site.
test.afterAll(async ({ browser }) => {
  if (!letterId) return;
  const { data } = await db.from("items").select("visibility").eq("id", letterId).single();
  if (data?.visibility !== "public") return;
  const context = await browser.newContext({ storageState: ADMIN_STATE, baseURL: E2E_SITE_URL });
  const page = await context.newPage();
  await page.goto(letterPath);
  await page.locator("#gate").getByRole("button", { name: "Unpublish" }).click();
  await context.close();
});

const gate = (page: Page) => page.locator("#gate");
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

// The email frame is sandboxed with no permissions (nothing in it can run), so axe cannot inject into it; it is the email's own HTML, not the
// desk's, and the frame element's name is asserted by hand where it appears. Everything else on the page is scanned.
const EMAIL_FRAME = "iframe[title='The email, as it will arrive']";

async function clean(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude(EMAIL_FRAME).analyze();
    expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function runGate(page: Page) {
  await gate(page).getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
  const decision = gate(page).getByTestId("gate-decision");
  await expect(decision).toBeVisible();
  // A refusal names its rules; show them rather than a bare timeout.
  expect(await decision.getAttribute("data-verdict"), await gate(page).innerText()).toBe("pass");
  await expect(page.getByTestId("visibility")).toHaveText("Public");
}

async function unpublish(page: Page) {
  await gate(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
}

test("what changed lists the public changes, each ticked, and the pages are axe clean with no sideways scroll", async ({ page }) => {
  await page.goto("/desk/letters/new");
  await expect(page.getByRole("heading", { level: 1, name: "What changed" })).toBeVisible();
  const boxes = page.getByRole("checkbox");
  expect(await boxes.count()).toBeGreaterThan(0);
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await expect(page.getByRole("button", { name: "Make this letter" })).toBeVisible();
  await noSideways(page);
  await clean(page);
});

test("Make this letter: a new letter's subject is plainly a label, and with nothing published there is no Send", async ({ page }) => {
  await page.goto("/desk/letters/new");
  await page.getByRole("button", { name: "Make this letter" }).click();
  await expect(page).toHaveURL(/\/desk\/letters\/[0-9a-f-]{36}\?notice=letter-made/);
  letterPath = new URL(page.url()).pathname;
  letterId = letterPath.split("/").pop() ?? "";
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1, name: /^Untitled letter, \d{1,2} \w{3} \d{4}$/ })).toBeVisible();
  await expect(page.getByText(LABEL_NOTE)).toBeVisible();
  await expect(page.getByLabel("Subject")).toHaveAccessibleDescription(/only a label the desk gave/);
  await expect(page.getByText("Run the publishing gate first.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Send to|Approve again)/ })).toHaveCount(0);
  await expect(page.getByText(/^Letter made\./)).toBeVisible();
  // The preview is a sandboxed frame with no permissions, and shows the email's subject and its fixed footer.
  await expect(page.locator(EMAIL_FRAME)).toHaveAttribute("sandbox", "");
  await expect(page.frameLocator(EMAIL_FRAME).getByText("Unsubscribe")).toBeVisible();
  await noSideways(page);
  await clean(page);
});

test("published with the label as its subject: Send is there, switched off, and says why", async ({ page }) => {
  await page.goto(letterPath);
  // The gate wants the one sentence (rule 6) whatever the subject is; the subject is left as the label on purpose.
  await page.getByLabel("One sentence: what a reader learns").fill("Which public pages changed since the last letter.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Letter saved\./)).toBeVisible();
  await expect(page.getByText(LABEL_NOTE)).toBeVisible();
  await runGate(page);
  await expect(gate(page).getByRole("button", { name: /^Send to \d+ subscribers?$/ })).toBeDisabled();
  await expect(page.getByText(LABEL_WHY).first()).toBeVisible();
  await expect(page.getByLabel("Subject")).toHaveAttribute("readonly", "");
  await expect(page.getByText("This letter is on the archive. Unpublish it to change the subject or the sentence.")).toBeVisible();
  // A test copy is offered (that is how he reads it first) and is not pressed here.
  await expect(page.getByRole("button", { name: "Send me a test copy" })).toBeEnabled();
  await noSideways(page);
  await clean(page);
});

test("replacing the label: the note goes, the subject is his, and with nobody confirmed Send still says why", async ({ page }) => {
  await page.goto(letterPath);
  await unpublish(page);
  await page.getByLabel("Subject").fill(SUBJECT);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Letter saved\./)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: SUBJECT })).toBeVisible();
  await expect(page.getByText(LABEL_NOTE)).toHaveCount(0);
  await runGate(page);
  const send = gate(page).getByRole("button", { name: "Send to 0 subscribers" });
  await expect(send).toBeDisabled();
  await expect(page.getByText("There are no confirmed readers yet, so there is nobody to send this to.")).toBeVisible();
  await expect(page.getByText(LABEL_WHY)).toHaveCount(0);
  await noSideways(page);
  await clean(page);
});

test("the letter shows in the list with its line, then comes off the archive", async ({ page }) => {
  await page.goto("/desk/letters");
  await expect(page.getByRole("heading", { level: 1, name: "Letters" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: SUBJECT }) });
  await expect(row).toContainText("On the archive. Not sent.");
  await noSideways(page);
  await clean(page);
  await page.goto(letterPath);
  await unpublish(page);
  await page.goto("/desk/letters");
  await expect(row).toContainText("Private. Not on the archive yet.");
});

test("readers: counts and a waiting list with no export, the switch, and confirmation emails as their own press", async ({ page }) => {
  await page.goto("/desk/letters/readers");
  await expect(page.getByRole("heading", { level: 1, name: "Readers" })).toBeVisible();
  await expect(page.getByText(/^\d+ readers?$/)).toBeVisible();
  await expect(page.getByText(/^Waiting: \d+$/)).toBeVisible();
  await expect(page.getByText(/^Asked to confirm: \d+$/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Erase an address" })).toBeVisible();
  await expect(page.getByLabel("Email address to erase")).toBeVisible();
  await expect(page.getByRole("link", { name: /export|download|csv/i })).toHaveCount(0);
  // The switch exists in the fixture mode; it is read here and not pressed (a sign-up form on the public site is Task 14's).
  await expect(page.getByText(/^Sign-ups (open|closed)$/)).toBeVisible();
  await noSideways(page);
  await clean(page);
});

test("the desk tabs keep Items current on every letters screen (no sixth tab)", async ({ page }) => {
  for (const path of ["/desk/letters", "/desk/letters/new", "/desk/letters/readers", letterPath]) {
    await page.goto(path);
    // Role queries leave out the bar that is hidden at this width, so this is the one nav the reader sees.
    const tabs = page.getByRole("navigation", { name: "Desk sections" });
    await expect(tabs.getByRole("link", { name: "Items" })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("link")).toHaveCount(5);
  }
});
