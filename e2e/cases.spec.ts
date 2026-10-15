import { expect, test, type Page } from "@playwright/test";
import { formatDate } from "@/lib/format";
import { requireStack } from "./support/auth";
import { addAgedReview, runRawFixture, seedAgedCase, setSwitch, switchesOff, type AgedCase } from "./support/cases";
import { expectPublicCase, expectStillPublic } from "./support/case-pages";
import { adminDb, expectNoViolationsInBothThemes, hydrated } from "./support/desk";
import type { Db } from "@/lib/supabase/types";

// Plan 3b Task 5 (D43): the whole loop on the LOCAL stack. An invented company and one closed idea are written through the real ledger
// functions and moved 140 to 50 days back (e2e/support/aged-case.sql); the desk drafts the case study, the owner turns the switches on
// as the runbook says (docs/runbooks/case-study-switches.md), the case passes the real gate (publish_revision) and a signed-out
// visitor reads it. This is the only place where a ledger case is published, so it is also what gives public-cases.spec.ts a public
// case to check (the cases-public-* projects run after it). It rewrites the local chain's fingerprints; `supabase db reset` before the next run.

const LOOKING_BACK =
  "I wrote that two quarters of a falling order book would show I was wrong. It fell for two quarters, so the thesis was wrong.";
const CASE_OFF = "Case studies from the ledger are switched off by the site owner.";

test.describe.configure({ mode: "serial" });

let db: Db;
let aged: AgedCase;
let itemId = "";
let slug = "";
let title = "";

const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const gate = (page: Page) => page.locator("#gate");

test.beforeAll(async () => {
  requireStack(); // the fixture refuses to run without the local stack, whatever ran before
  switchesOff();
  db = await adminDb();
  aged = await seedAgedCase(db);
});

test.afterAll(() => {
  switchesOff(); // the loop ends with both switches off, and so does a loop that failed half way
});

async function openItem(page: Page) {
  await page.goto(`/desk/items/${itemId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await hydrated(page);
}

async function saveBody(page: Page, body: string, reason: string) {
  await page.getByLabel("Body (Markdown)").fill(body);
  await page.getByLabel("Change reason").fill(reason);
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(status(page, /Revision saved/)).toBeVisible();
}

/** Runs the real gate on the newest revision. Returns its number; the decision must be the one made on that revision. */
async function runGate(page: Page): Promise<number> {
  const tick = page.getByRole("checkbox", { name: /I have not changed my stance on/ });
  if (await tick.isVisible()) await tick.check();
  const button = page.getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ });
  const rev = Number(/#(\d+)$/.exec((await button.textContent()) ?? "")?.[1]);
  await button.click();
  await expect(gate(page).getByTestId("gate-decision")).toContainText(`revision #${rev}`);
  return rev;
}

test("the fixture file refuses to run with its placeholders unfilled", () => {
  expect(runRawFixture()).toContain("placeholders not filled");
});

test("with both switches off, a drafted case study is refused with the plain sentence", async ({ page }) => {
  await page.goto(`/desk/ledger/${aged.ideaId}`);
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 2, name: "Case study" })).toBeVisible();
  await expect(page.getByText(/It can be published from .* at the earliest, and only while the site owner has case studies switched on \(now off\)\./)).toBeVisible();
  await expectNoViolationsInBothThemes(page);
  await page.getByRole("button", { name: "Draft a case study" }).click();
  await expect(page).toHaveURL(/\/desk\/items\/[0-9a-f-]{36}/);
  itemId = /\/desk\/items\/([0-9a-f-]{36})/.exec(page.url())![1];
  await expect(status(page, /^Drafted from the ledger\./)).toBeVisible();
  title = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  expect(title).toMatch(/^Tamarind Ridge Textiles Ltd: a closed idea, \w{3} \d{4} to \w{3} \d{4}$/);

  // A second draft finds this one (the idea page now says so) and makes no second item.
  await page.goto(`/desk/ledger/${aged.ideaId}`);
  await expect(page.getByText("Case study: draft.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft a case study" })).toHaveCount(0);
  const drafts = await db.from("item_revisions").select("item_id").eq("structured->ledger->>idea", aged.ideaId);
  expect([...new Set(drafts.data?.map((r) => r.item_id))]).toEqual([itemId]);

  await openItem(page);
  await expect(page.getByRole("heading", { level: 2, name: "From the ledger (sealed; cannot be edited)" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Text sheet" })).toHaveCount(0); // no facts editor for a ledger case
  await page.getByLabel("Learning objective").fill("How a thesis that rested on one large order can break, and what the first sign looked like.");
  await page.getByLabel("Holds position").selectOption("not_disclosed");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(status(page, "Details saved.")).toBeVisible();
  await expect(gate(page)).toContainText("Case studies from the ledger");
  await expect(gate(page)).toContainText("Off (site owner). Chart: off.");
  const make = page.getByRole("button", { name: `Make ${aged.company} public` });
  if (await make.isVisible()) {
    await make.click();
    await expect(status(page, "Company made public")).toBeVisible();
  }
  await runGate(page);
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  await expect(gate(page).getByTestId("gate-failure").filter({ hasText: CASE_OFF })).toHaveAttribute("data-rule", "10");
  await expectNoViolationsInBothThemes(page);
  const row = await db.from("items").select("visibility, status, slug").eq("id", itemId).single();
  expect(row.data).toMatchObject({ visibility: "private", status: "draft" });
});

test("reveal on: a plain Looking back paragraph passes the gate, and the page shows no kill-criterion heading", async ({ page }) => {
  setSwitch("ledger_reveal", true);
  await openItem(page);
  await expect(gate(page)).toContainText("On (site owner). Chart: off.");

  await saveBody(page, LOOKING_BACK, "Looking back");
  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  const row = await db.from("items").select("visibility, status, slug, file_no").eq("id", itemId).single();
  expect(row.data).toMatchObject({ visibility: "public", status: "published", file_no: null }); // a ledger case takes no file number
  slug = row.data!.slug!;
  expect(slug).toBeTruthy();
});

for (const size of [375, 1280] as const) {
  test(`a signed-out visitor at ${size} px reads the case, /cases, Mistakes and the record-keeping section`, async ({ browser }) => {
    await expectPublicCase(browser, size, { slug, title, company: aged.company, reviews: 1, chart: false, mistakes: "timing" });
  });
}

test("chart on: the item page says the ledger has changed; refreshed and published, the chart and its caption show", async ({ page, browser }) => {
  setSwitch("ledger_chart", true);
  await openItem(page);
  await expect(page.getByText("The ledger has changed since this revision (a new lesson, or a day listed in the public file).")).toBeVisible();
  await page.getByRole("button", { name: "Refresh from the ledger" }).click();
  await expect(status(page, /waiting for the publishing gate/)).toBeVisible();
  await expect(gate(page)).toContainText("On (site owner). Chart: on.");
  await expect(page.getByText("Chart: included (")).toBeVisible();
  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(page.getByText("The ledger has changed since this revision")).toHaveCount(0);
  for (const size of [375, 1280] as const) {
    await expectPublicCase(browser, size, { slug, title, company: aged.company, reviews: 1, chart: true, mistakes: "timing" });
  }
});

test("a new lesson moves the date: Unpublish, Refresh, Publish; the frozen-date sentence says so", async ({ page, browser }) => {
  addAgedReview(aged);
  const record = await db.rpc("case_study_record", { p_idea_id: aged.ideaId });
  const figuresTo = String((record.data as { figures_to?: string } | null)?.figures_to);
  expect(figuresTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await openItem(page);
  // Public, and the ledger's date is no longer the item's: the way out is in words, and no Refresh button is offered that the gate would refuse.
  await expect(page.getByText(`Figures to is fixed while a case study is public. To use the ledger's date, ${formatDate(figuresTo)}: Unpublish it, then Refresh from the ledger, then Publish.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh from the ledger" })).toHaveCount(0);
  await expectNoViolationsInBothThemes(page);

  await gate(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(status(page, /private again/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh from the ledger" }).click();
  await expect(status(page, /^Refreshed from the ledger\./)).toBeVisible();
  await expect(page.locator("#ledger-record").getByText(`Figures to ${formatDate(figuresTo)}`)).toBeVisible();
  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  for (const size of [375, 1280] as const) {
    await expectPublicCase(browser, size, { slug, title, company: aged.company, reviews: 2, chart: true, mistakes: "timing, sizing" });
  }
});

test("both switches off again: a new revision is refused, and the page already public stays up", async ({ page, browser }) => {
  switchesOff();
  await openItem(page);
  await saveBody(page, `${LOOKING_BACK}\n\nA line added after the switches were turned off.`, "After the switches went off");
  await expect(gate(page)).toContainText("Off (site owner). Chart: off.");
  await runGate(page);
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  await expect(gate(page).getByTestId("gate-failure").filter({ hasText: CASE_OFF })).toBeVisible();
  const row = await db.from("items").select("visibility, status").eq("id", itemId).single();
  expect(row.data).toMatchObject({ visibility: "public", status: "published" }); // off stops new publishes; it does not take pages down
  await expectStillPublic(browser, slug, aged.company);
});
