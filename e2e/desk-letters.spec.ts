import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { requireStack } from "./support/auth";
import { adminDb, hydrated, settleVisibleAnimations } from "./support/desk";
import { installOutboundGuard } from "./support/outbound";
import { ADMIN_STATE, E2E_SITE_URL } from "./support/stack";

installOutboundGuard();

// Plan 5c Task 13: the desk letters screens on the LOCAL stack, in both desk projects (375 and 1280), through the screens Aksh uses. Nothing is
// sent and nothing is approved: the web server runs with DISTRIBUTION_ADAPTER=fixture, and this spec never presses Send, the test copy or
// "Send confirmation emails". It makes one letter from what is public, runs the gate with its label as a subject (the gate refuses it, rule 13.1, so
// there is no Send), replaces the subject and publishes, then unpublishes, so the public site is left as it was found.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SUBJECT = `What changed, e2e ${Date.now().toString(36)}`;
const LABEL_NOTE = /only a label the desk gave/;
const LABEL_WHY = "The subject is still a label. Replace it with your own subject, save, and run the gate again.";

test.describe.configure({ mode: "serial" });

let db: Db;
let letterPath = "";
let letterId = "";
let letterSlug = "";
let letterCard = "";

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
    // Motion is reduced and running transitions are waited out, so axe never reads a colour mid-fade (a button changing theme).
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await settleVisibleAnimations(page);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude(EMAIL_FRAME).analyze();
    expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
}

async function runGate(page: Page) {
  await gate(page).getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
  const decision = gate(page).getByTestId("gate-decision");
  // An earlier refusal of the same revision stays on the page until the new press replaces it, so wait for the pass (retrying) rather than read the first verdict.
  await expect(decision).toHaveAttribute("data-verdict", "pass");
  await expect(page.getByTestId("visibility")).toHaveText("Public");
}

const SENTENCE = "Which public pages changed since the last letter.";

/**
 * Plan 5c Task 14: what a signed-out reader gets once the letter has passed the gate. The pages are read here with the desk's cookies, which the public
 * pages never look at. The archive and the letter page pass axe and do not scroll sideways; the letter page holds his words, his copied entries and no
 * unsubscribe link; the share card, the feed and the sitemap carry it.
 */
async function expectOnThePublicSite(page: Page) {
  const { data, error } = await db.from("items").select("slug").eq("id", letterId).single();
  if (error) throw error;
  letterSlug = data.slug ?? "";

  expect((await page.goto("/letters"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Letters" })).toBeVisible();
  await expect(page.getByRole("link", { name: SUBJECT })).toHaveAttribute("href", `/letters/${letterSlug}`);
  await expect(page.getByText(SENTENCE)).toBeVisible();
  await expect(page.getByRole("link", { name: "Stop my letters" })).toBeVisible();
  await noSideways(page);
  await clean(page);

  expect((await page.goto(`/letters/${letterSlug}`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: SUBJECT })).toBeVisible();
  await expect(page.getByText(SENTENCE)).toBeVisible();
  const entries = page.getByRole("region", { name: "What changed" });
  expect(await entries.getByRole("listitem").count()).toBeGreaterThan(0);
  await expect(entries.getByRole("link").first()).toHaveAttribute("href", /^\/(companies|notes|process|cases|videos)\/[a-z0-9-]+$/);
  await expect(page.getByText(/unsubscribe/i)).toHaveCount(0);
  await expect(page.getByText(/\{\{\{/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /save as pdf/i })).toBeVisible();
  await noSideways(page);
  await clean(page);

  // The card has a hashed address that the page names itself (og:image); a reader's link preview follows that.
  letterCard = (await page.locator("meta[property='og:image']").getAttribute("content")) ?? "";
  expect(letterCard).toContain(`/letters/${letterSlug}/opengraph-image`);
  const card = await page.request.get(letterCard);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(await (await page.request.get("/feed.xml")).text()).toContain(`/letters/${letterSlug}#r`);
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain(`/letters/${letterSlug}`);
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

test("the gate refuses the label as a subject (rule 13.1): nothing is published and there is no Send", async ({ page }) => {
  await page.goto(letterPath);
  // The gate wants the one sentence (rule 6) whatever the subject is; the subject is left as the label on purpose.
  await page.getByLabel("One sentence: what a reader learns").fill("Which public pages changed since the last letter.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Letter saved\./)).toBeVisible();
  await expect(page.getByText(LABEL_NOTE)).toBeVisible();
  await gate(page).getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  await expect(gate(page).getByTestId("gate-failure").filter({ hasText: "Replace the label with your own subject." })).toHaveAttribute("data-rule", "13");
  await expect(page.getByTestId("visibility")).toHaveText("Private");
  await expect(page.getByText(LABEL_WHY).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Send to|Approve again)/ })).toHaveCount(0);
  await noSideways(page);
  await clean(page);
});

test("replacing the label: the note goes, the subject is his, and with nobody confirmed Send still says why", async ({ page }) => {
  await page.goto(letterPath);
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
  await expectOnThePublicSite(page);
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
  // Unpublishing takes it off every public surface at once: the page, its card, the feed and the sitemap. With sign-ups closed the archive is a 404 again.
  expect((await page.request.get(`/letters/${letterSlug}`)).status()).toBe(404);
  expect((await page.request.get(letterCard)).status()).toBe(404);
  expect(await (await page.request.get("/feed.xml")).text()).not.toContain(`/letters/${letterSlug}`);
  expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain("/letters");
  expect((await page.request.get("/letters")).status()).toBe(404);
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
