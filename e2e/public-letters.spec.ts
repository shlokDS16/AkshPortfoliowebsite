import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { requireStack } from "./support/auth";
import { adminDb } from "./support/desk";
import { setSignup } from "./support/letters-signup";
import { installOutboundGuard } from "./support/outbound";

installOutboundGuard(); // nothing leaves the machine

// Plan 5c Task 14: the public side of the letters, signed out, at 375 and 1280 (the public-* projects), on the LOCAL stack. Nothing is sent: the
// confirmation emails and the letters are Aksh's press (Task 15 presses them against the fixture); this spec only asks to subscribe and leaves.
//  1. The deploy state: sign-ups closed and no letter public, so /letters and every letter page are a 404 and nothing links to them. The leave
//     and confirm pages do not depend on the switch.
//  2. Sign-ups open (pressed through the desk, as Aksh does): the form passes axe, a trapped or forged post keeps nothing, a real post is kept
//     as waiting, and leaving deletes it. The answer is the same sentence every time. No address ever appears in a URL.
// The letters pages with a letter public are checked in desk-letters.spec.ts, where a letter is made and published through the real gate.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ASKED = "Thanks. Aksh sends confirmation emails by hand, usually within a day. Open the link in it to start receiving letters.";
const LEFT = "Done. If a letter was already on its way, it may still arrive.";
const EXPIRED = "This link has expired. Ask again on the letters page.";
const ADDRESS = `reader-${Date.now().toString(36)}@example.com`;

test.describe.configure({ mode: "serial" });

let db: Db;
test.beforeAll(async () => {
  requireStack();
  db = await adminDb();
});
// Whatever a failure leaves behind, the door is shut and the test address is gone.
test.afterAll(async ({ browser }) => {
  await setSignup(browser, false);
  await db.rpc("letters_leave", { p_email: ADDRESS });
});

async function clean(page: Page) {
  // A dynamic page streams its <title> after the first paint; scan only once it is in the document (it is missing for a moment under load).
  await expect(page).toHaveTitle(/\S/);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

const kept = async (email: string) => {
  const { data, error } = await db.from("subscribers").select("status, adult").eq("email", email);
  if (error) throw error;
  return data;
};

test("deploy state: /letters, a letter page and its card are a 404, and no page of the site links to them", async ({ page, request }) => {
  await setSignup(page.context().browser()!, false);
  expect((await page.goto("/letters"))?.status()).toBe(404);
  expect((await page.goto("/letters/anything-at-all"))?.status()).toBe(404);
  expect((await request.get("/letters/anything-at-all/opengraph-image")).status()).toBe(404);
  for (const path of ["/", "/companies", "/about"]) {
    await page.goto(path);
    await expect(page.locator("a[href='/letters']"), path).toHaveCount(0);
  }
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/letters");
  expect(await (await request.get("/feed.xml")).text()).not.toContain("/letters");
});

test("leave is there whatever the switch says: one field, the same sentence for an address nobody gave, and no address in the address bar", async ({ page }) => {
  expect((await page.goto("/letters/leave"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Stop my letters" })).toBeVisible();
  await clean(page);
  await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
  await page.getByLabel("Email").fill("nobody-gave-this@example.com");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page).toHaveURL(/\/letters\/leave\?r=left$/);
  await expect(page.getByText(LEFT)).toBeVisible();
  expect(page.url()).not.toContain("@");
  await clean(page);
});

test("confirm: a GET shows the button and changes nothing; a stale link says it has expired; neither puts the token anywhere but the form", async ({ page }) => {
  const token = "e2e-token-that-was-never-issued";
  expect((await page.goto(`/letters/confirm?t=${token}`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Confirm your subscription" })).toBeVisible();
  await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
  await expect(page.locator("meta[name='referrer']")).toHaveAttribute("content", "no-referrer");
  await expect(page.getByRole("button", { name: "Yes, send me the letters" })).toBeVisible();
  await clean(page);
  await page.getByRole("button", { name: "Yes, send me the letters" }).click();
  await expect(page).toHaveURL(/\/letters\/confirm\?r=expired$/);
  expect(page.url()).not.toContain(token);
  await expect(page.getByText(EXPIRED)).toBeVisible();
  await clean(page);
  // No link, no token: the same sentence and no button.
  await page.goto("/letters/confirm");
  await expect(page.getByText(EXPIRED)).toBeVisible();
  await expect(page.locator("main").getByRole("button")).toHaveCount(0);
});

test("sign-ups open: the page names the notice before the field, passes axe, and the trap field cannot be reached by a person", async ({ page }) => {
  await setSignup(page.context().browser()!, true);
  expect((await page.goto("/letters"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Letters" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Get the letters by email" })).toBeVisible();
  await expect(page.getByText("No letters yet.")).toBeVisible();
  const notice = page.locator("#signup-notice");
  await expect(notice).toContainText("You must be 18 or older.");
  const order = await page.evaluate(() => {
    const at = (selector: string) => document.querySelector(selector)!.compareDocumentPosition(document.querySelector("#signup-email")!);
    return at("#signup-notice") & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(order, "the notice comes before the email field").toBeTruthy();
  await expect(page.getByLabel("I am 18 or older")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Ask to subscribe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stop my letters" })).toHaveAttribute("href", "/letters/leave");
  await expect(page.locator("#signup-website")).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#signup-website").locator("xpath=ancestor::div[@aria-hidden='true']")).toHaveCount(1);
  await clean(page);
  // Tab through the page: the trap is never focused.
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe("signup-website");
  }
});

test("a trapped or forged post keeps nothing and is answered like any other; a real one waits three seconds and is kept as waiting; leaving deletes it", async ({ page }) => {
  // The trap filled: the answer is the same, the database holds nothing.
  await page.goto("/letters");
  await page.getByLabel("Email", { exact: true }).fill(ADDRESS);
  await page.getByLabel("I am 18 or older").check();
  await page.locator("#signup-website").evaluate((el: HTMLInputElement) => (el.value = "http://spam.example"));
  await page.getByRole("button", { name: "Ask to subscribe" }).click();
  await expect(page.getByText(ASKED)).toBeVisible();
  expect(await kept(ADDRESS)).toEqual([]);

  // A forged ticket: the same.
  await page.goto("/letters");
  await page.getByLabel("Email", { exact: true }).fill(ADDRESS);
  await page.getByLabel("I am 18 or older").check();
  await page.locator("input[name='ticket']").evaluate((el: HTMLInputElement) => (el.value = "1700000000000.not-a-genuine-ticket"));
  await page.getByRole("button", { name: "Ask to subscribe" }).click();
  await expect(page.getByText(ASKED)).toBeVisible();
  expect(await kept(ADDRESS)).toEqual([]);

  // A person: waits (the form is three seconds old at least), ticks, and is kept as waiting. The address bar never holds the address.
  await page.goto("/letters");
  await page.waitForTimeout(3300);
  await page.getByLabel("Email", { exact: true }).fill(ADDRESS);
  await page.getByLabel("I am 18 or older").check();
  await page.getByRole("button", { name: "Ask to subscribe" }).click();
  await expect(page).toHaveURL(/\/letters\?asked=1#subscribe$/);
  expect(page.url()).not.toContain("@");
  await expect(page.getByText(ASKED)).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await clean(page);
  expect(await kept(ADDRESS)).toEqual([{ status: "waiting", adult: true }]);

  // Asking again with the same address is answered the same and adds nothing.
  await page.goto("/letters");
  await page.waitForTimeout(3300);
  await page.getByLabel("Email", { exact: true }).fill(ADDRESS.toUpperCase());
  await page.getByLabel("I am 18 or older").check();
  await page.getByRole("button", { name: "Ask to subscribe" }).click();
  await expect(page.getByText(ASKED)).toBeVisible();
  expect(await kept(ADDRESS)).toHaveLength(1);

  // Leaving deletes it at once, from a page with no sign-in.
  await page.goto("/letters/leave");
  await page.getByLabel("Email").fill(ADDRESS);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText(LEFT)).toBeVisible();
  expect(await kept(ADDRESS)).toEqual([]);
});

test("closed again: /letters is a 404 once more, at once", async ({ page }) => {
  await setSignup(page.context().browser()!, false);
  expect((await page.goto("/letters"))?.status()).toBe(404);
  expect((await page.goto("/letters/leave"))?.status()).toBe(200);
});
