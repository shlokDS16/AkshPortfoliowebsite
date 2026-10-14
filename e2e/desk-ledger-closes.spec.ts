import { expect, test, type Page } from "@playwright/test";
import { istDate } from "@/lib/dates";
import { requireStack } from "./support/auth";
import { adminDb, expectNoViolationsInBothThemes, hydrated } from "./support/desk";
import { resetToFreshHeartbeats, seedHeartbeats } from "./support/heartbeats";
import {
  clearRecentCloses, createLedgerCompany, entryIsToday, seedTypedTodayCloses, syntheticOfficialFiles, typedCloseForTodayAllowed, weekdayBack,
} from "./support/ledger";

// The Closes page, the official-file drop, corporate actions and the journal, through the real local stack (Plan 3a Task 11).
// Runs in the 375 px and the 1280 px desk projects. Files are SYNTHETIC (the real header rows, invented symbols and prices).
// Parts that depend on the clock (an idea opened now takes today's close as its entry only on a weekday before ~14:30 India)
// are asserted in the branch that applies; the other branch asserts what that branch can show.

test.afterAll(async () => {
  await resetToFreshHeartbeats(requireStack());
});

async function send(page: Page, button: string): Promise<void> {
  const target = page.getByRole("button", { name: button });
  await expect(target).toBeEnabled(); // enabled once the page's code is attached
  await target.click();
}

async function openIdeaOn(companyId: string, words: string): Promise<string> {
  const db = await adminDb();
  const idea = await db.rpc("open_idea", { p_company_id: companyId, p_expects: "outperform", p_horizon_days: 365, p_held: false, p_body_md: words });
  if (idea.error) throw idea.error;
  return idea.data;
}

test("official file, typed close, corporate action and a lesson, from the owner's screens", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const db = await adminDb();
  const tag = testInfo.project.name.endsWith("mobile") ? "M" : "D";
  const company = await createLedgerCompany(db, `C${tag}`);
  const ideaId = await openIdeaOn(company.id, "Orders are growing faster than the street expects.");
  clearRecentCloses(); // the week starts undecided, so a second run of the suite finds what the first did
  const uploadDay = weekdayBack(1);
  const typedDay = weekdayBack(2);
  const today = istDate(new Date());
  const entryToday = entryIsToday(); // decided once: the idea's entry is either today's close or a later one

  await page.goto("/desk/ledger");
  await page.getByRole("link", { name: "Closes and corporate actions" }).click();
  await expect(page).toHaveURL(/\/desk\/ledger\/closes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Closes" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Recent days", "Fetch closes now", "Drop NSE's official file", "Type a close", "Closes you typed or dropped", "Files you uploaded", "Scores restated lately", "Splits, bonuses and other actions",
  ]);
  await hydrated(page);

  // The recent days: the upload day is not decided yet, in words.
  const day = (date: string) => page.locator(`[data-day="${date}"]`);
  await expect(day(uploadDay)).toContainText("Not decided yet");

  // A file for another date than the one chosen is refused in words and nothing is stored.
  const files = syntheticOfficialFiles(uploadDay, [{ symbol: company.symbol, close: "123.45" }]);
  const zipInput = page.getByLabel(/Equity file/);
  await page.getByLabel("Trading date of the files").fill(typedDay);
  await zipInput.setInputFiles({ name: "BhavCopy_NSE_CM_0_0_0_20261012_F_0000.csv.zip", mimeType: "application/zip", buffer: files.zip });
  await send(page, "Store the official closes");
  await expect(page.getByTestId("drop-result")).toContainText("The equity file is for");
  await expect(page.getByTestId("drop-result")).toContainText("not the date you chose. Nothing was stored.");
  await expect(page.getByTestId("drop-result")).toHaveAttribute("role", "alert");
  await expect(day(typedDay)).toContainText("Not decided yet");

  // A file that is not a zip, whatever it is called, is refused in words.
  await page.getByLabel("Trading date of the files").fill(uploadDay);
  await zipInput.setInputFiles({ name: "BhavCopy.csv.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip at all") });
  await send(page, "Store the official closes");
  await expect(page.getByTestId("drop-result")).toContainText("not a zip file");
  await expect(page.getByTestId("drop-result")).toContainText("Nothing was stored.");

  // The right files: the day opens, with its source in words, and the close is listed as dropped by hand.
  await zipInput.setInputFiles({ name: "BhavCopy_NSE_CM_0_0_0_20261012_F_0000.csv.zip", mimeType: "application/zip", buffer: files.zip });
  await page.getByLabel(/Index file/).setInputFiles({ name: "ind_close_all_12102026.csv", mimeType: "text/csv", buffer: files.index });
  await send(page, "Store the official closes");
  await expect(page.getByTestId("drop-result")).toContainText("from a file you uploaded as NSE's official file.");
  await expect(page.getByTestId("drop-result")).toContainText("The Nifty 50 close is stored, so the day is open.");
  await expect(page.getByTestId("drop-result")).toHaveAttribute("role", "status");
  await expect(day(uploadDay)).toContainText("Open: a file you uploaded as NSE's official file");
  await expect(day(uploadDay).getByTestId("missing")).not.toContainText(company.name);
  const hand = page.locator("[data-hand]", { hasText: company.name });
  await expect(hand).toContainText("Close 123.45, a file you uploaded as NSE's official file");
  // The upload left a record on the page: the trading date, a 12-character fingerprint, and what it did.
  const record = page.locator("[data-upload]", { hasText: "stored 1, kept 0" }).first();
  await expect(record).toContainText(/file [0-9a-f]{12},/);
  await expect(page.getByTestId("closes-line")).toContainText("rest on closes entered or dropped by hand");

  // Type a close by hand for the day before: stored as typed, listed with its source, and the day opens as typed.
  await page.locator("#close-company").selectOption({ label: `${company.name} (${company.symbol})` });
  await page.getByLabel("Trading date", { exact: true }).fill(typedDay);
  await page.getByLabel("Closing price of the company").fill("234.50");
  await page.getByLabel(/Nifty 50 close for the same day/).fill("22111.25");
  await send(page, "Store the close");
  await expect(page.getByText("Close stored as typed. It is marked on every score that uses it.")).toBeVisible();
  await expect(page.locator("[data-hand]", { hasText: "234.50" })).toContainText("a close you typed");
  await expect(day(typedDay)).toContainText("Open: a close you typed");

  // A bad number is refused in words, tied to its field, and what was typed stays.
  await hydrated(page);
  await page.locator("#close-company").selectOption({ label: `${company.name} (${company.symbol})` });
  await page.getByLabel("Trading date", { exact: true }).fill(typedDay);
  await page.getByLabel("Closing price of the company").fill("12,5");
  await send(page, "Store the close");
  const alert = page.getByRole("alert").filter({ hasText: "Type the close as a plain number" });
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(page.getByLabel("Closing price of the company")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Closing price of the company")).toHaveValue("12,5");

  // Today's close cannot be typed before the market has closed, or on a weekend: said in words (not asserted after 15:35 on a weekday).
  if (!typedCloseForTodayAllowed()) {
    await page.getByLabel("Trading date", { exact: true }).fill(today);
    await page.getByLabel("Closing price of the company").fill("99.00");
    await send(page, "Store the close");
    await expect(page.getByRole("alert").filter({ hasText: /has not closed yet for that date|no session on a Saturday or Sunday/ })).toBeVisible();
  }

  // The idea's score. When the entry is today, a close he typed for today is what the score rests on, and the page says so.
  await page.goto("/desk/ledger/closes");
  await hydrated(page);
  if (entryToday) seedTypedTodayCloses(company.symbol);

  // Fetch closes now: the two steps in their own words; the public copy is not among them.
  await send(page, "Fetch closes now");
  const fetched = page.getByTestId("fetch-result");
  await expect(fetched).toContainText("Closing prices:");
  await expect(fetched).toContainText("Scores:");
  await expect(fetched).not.toContainText(/public copy/i);
  await expect(fetched.locator("[data-job]")).toHaveCount(2);

  // A corporate action: refused in words when the factor is 1; entered with its note; corrected, never edited.
  await page.locator("#action-company").selectOption({ label: `${company.name} (${company.symbol})` });
  await page.getByLabel("Split", { exact: true }).check();
  await page.getByLabel("Ex-date").fill(today);
  await page.getByLabel(/Factor/).fill("1");
  await send(page, "Enter the action");
  await expect(page.getByRole("alert").filter({ hasText: "The factor must be a number from 0.001 to 1000" })).toBeVisible();
  await page.getByLabel(/Factor/).fill("5");
  await page.getByLabel(/Note, optional/).fill("1:5 split (fictional)  <b>not bold</b>");
  await send(page, "Enter the action");
  await expect(page.getByText("Action entered. It is marked on every score whose period it falls in.")).toBeVisible();
  const mine = page.locator("section[data-company]", { hasText: company.name }); // other specs' companies are on this page too
  await expect(mine.locator("[data-action]").filter({ hasText: "factor 5" })).toHaveCount(1);
  await expect(page.locator("[data-words] b")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /edit|delete|remove/i })).toHaveCount(0);

  await mine.getByRole("link", { name: "Correct this entry" }).click();
  await expect(page).toHaveURL(/closes\?correct=[0-9a-f-]{36}/);
  await hydrated(page);
  await expect(page.getByTestId("correcting")).toBeVisible();
  await expect(page.getByLabel(/Factor/)).toHaveValue("5");
  await page.getByLabel(/Factor/).fill("4");
  await send(page, "Enter the correction");
  await expect(page.getByText("Action entered.")).toBeVisible();
  await expect(mine.locator('[data-live="yes"]').filter({ hasText: "factor 4" })).toContainText("corrects an earlier entry");
  await expect(mine.locator('[data-live="no"]').filter({ hasText: "factor 5" })).toContainText("Replaced by a later entry.");
  await expect(mine.locator('[data-live="no"]').getByRole("link", { name: "Correct this entry" })).toHaveCount(0);

  // The idea's page carries the marks the entered closes and actions put on its score.
  await page.goto(`/desk/ledger/${ideaId}`);
  if (entryToday) {
    await expect(page.getByText("Includes a close that was entered by hand.").first()).toBeVisible();
    await expect(page.getByText("Includes a split, bonus or note about a price move that you entered by hand.").first()).toBeVisible();
    await expect(page.getByText("close 100.00, Nifty 50 20,000.00").first()).toBeVisible();
  } else {
    await expect(page.getByText("Entry will be set at the next close.").first()).toBeVisible();
  }

  await page.goto("/desk/ledger/closes");
  await expectNoViolationsInBothThemes(page);
});

test("the journal lists the lessons newest first, with his words exactly as typed", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const db = await adminDb();
  const tag = testInfo.project.name.endsWith("mobile") ? "M" : "D";
  const first = await createLedgerCompany(db, `J${tag}A`);
  const second = await createLedgerCompany(db, `J${tag}B`);
  const lessons = [
    { company: first, words: "  First lesson: sized too big.\n  <b>not bold</b>  ", process: "flawed", tags: ["sizing", "luck"] },
    { company: second, words: "Second lesson: the thesis held.", process: "sound", tags: ["none"] },
  ];
  const ids: string[] = [];
  for (const l of lessons) {
    const id = await openIdeaOn(l.company.id, `Thesis for ${l.company.name}.`);
    ids.push(id);
    const closed = await db.rpc("add_idea_event", { p_idea_id: id, p_kind: "close", p_body_md: "Done.", p_stance: { reason: "played_out" } });
    if (closed.error) throw closed.error;
    const review = await db.rpc("add_idea_event", { p_idea_id: id, p_kind: "review", p_body_md: l.words, p_stance: { process: l.process, tags: l.tags } });
    if (review.error) throw review.error;
  }

  await page.goto("/desk/ledger");
  await page.getByRole("link", { name: "What I learned" }).click();
  await expect(page).toHaveURL(/\/desk\/ledger\/journal$/);
  await expect(page.getByRole("heading", { level: 1, name: "What I learned" })).toBeVisible();

  const items = page.locator("[data-lesson]");
  // Other runs' lessons are in the list too: the two of this run are found by their company names and must stand in this order.
  const all = await items.evaluateAll((els) => els.map((e) => e.querySelector("a")?.textContent ?? ""));
  expect(all.filter((n) => n === first.name || n === second.name)).toEqual([second.name, first.name]); // newest first
  const firstWords = await items.filter({ hasText: first.name }).locator("[data-words]").textContent();
  expect(firstWords).toBe(lessons[0]!.words);
  await expect(page.locator("[data-words] b")).toHaveCount(0);
  await expect(items.filter({ hasText: first.name })).toContainText("Process was flawed");
  await expect(items.filter({ hasText: first.name })).toContainText("Tags: Sizing, Luck");
  await items.filter({ hasText: second.name }).getByRole("link", { name: second.name }).click();
  await expect(page).toHaveURL(new RegExp(`/desk/ledger/${ids[1]}`));

  await page.goto("/desk/ledger/journal");
  await expectNoViolationsInBothThemes(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("the desk strip keeps the public copy's last failed run for 30 days, quietly, after a green run", async ({ page }) => {
  const stack = requireStack();
  await resetToFreshHeartbeats(stack);
  await seedHeartbeats(stack, [
    { job: "ledger:anchor", minutesAgo: 3 * 24 * 60, ok: false },
    { job: "ledger:anchor", minutesAgo: 60 },
  ]);
  await page.goto("/desk");
  await expect(page.getByTestId("health-note").filter({ hasText: "the public copy's last failed run was 3 days ago" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "the public copy" })).toHaveCount(0);
});

for (const path of ["/desk/ledger/closes", "/desk/ledger/journal"]) {
  test(`${path} is usable at this width without sideways scrolling`, async ({ page }) => {
    await page.goto(path);
    await hydrated(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
