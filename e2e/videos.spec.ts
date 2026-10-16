import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { FIXTURE_DESCRIPTION } from "../src/lib/providers/fixture-video-meta";
import { requireStack } from "./support/auth";
import { adminDb, hydrated, itemIdOf } from "./support/desk";
import { expectPublicVideo, expectVideoGone, expectVideoSurfaces, type VideoShown } from "./support/video-pages";

// Plan 5b Task 9: the whole video loop on the LOCAL stack, through the screens Aksh uses. YouTube is faked at the port (the web server runs with
// DISTRIBUTION_ADAPTER=fixture, support/stack.ts), so no request leaves this machine and no key is set. A `v:` capture, "Fetch again", the
// caption file dropped as Aksh drops it, his chapters from the description, the gate's refusal of a spoken "buy" (rule 1, on the transcript),
// the allowance that clears it only with a reason, a pass, a signed-out visitor, every derived surface, Unpublish (all of it gone) and a
// last Publish. The video stays public (like the case and the concepts) so the videos-public-* projects check the published half of the
// derived surfaces once more; `supabase db reset` before the next full run. The YouTube id is new each run, so a rerun does not collide.

const run = Date.now().toString(36).slice(-8).padStart(8, "0");
const YT = `e2e${run}`; // eleven characters; the fixture reads "unlisted, your channel" for an id that starts with none of its case words
const TITLE = `Fixture video ${YT}`;
const OBJECTIVE = "Learn how to read a balance sheet.";
const CHAPTERS = FIXTURE_DESCRIPTION.split("\n")
  .filter((line) => /^\d+:\d{2} /.test(line))
  .map((line) => ({ clock: line.slice(0, line.indexOf(" ")), title: line.slice(line.indexOf(" ") + 1) }));
const SPOKEN = "reading a balance sheet";

const vtt = (...cues: [string, string, string][]) => ["WEBVTT", "", ...cues.map(([from, to, text]) => `${from} --> ${to}\n${text}\n`)].join("\n");
const WITH_BUY = vtt(
  ["00:00:00.000", "00:00:06.000", "Welcome to a short lesson on reading a balance sheet."],
  ["00:00:06.000", "00:00:14.000", "You should buy this one before the results come out."],
  ["00:00:35.000", "00:00:42.000", "A balance sheet lists what a business owns and what it owes."],
);
const CLEAN = vtt(
  ["00:00:00.000", "00:00:06.000", "Welcome to a short lesson on reading a balance sheet."],
  ["00:00:06.000", "00:00:14.000", "First we look at what the business owns."],
  ["00:00:35.000", "00:00:42.000", "Then we look at what it owes to others."],
);

test.describe.configure({ mode: "serial" });

let db: Db;
let itemId = "";
let slug = "";

const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const gate = (page: Page) => page.locator("#gate");
const shown = (): VideoShown => ({ slug, title: TITLE, objective: OBJECTIVE, youtubeId: YT, chapters: CHAPTERS, spoken: SPOKEN });

test.beforeAll(async () => {
  requireStack();
  db = await adminDb();
});

async function openVideo(page: Page) {
  await page.goto(`/desk/videos/${itemId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await hydrated(page);
}

async function storeCaptions(page: Page, text: string) {
  await page.getByLabel(/^Drop the caption file from YouTube Studio/).setInputFiles({ name: "captions.vtt", mimeType: "text/vtt", buffer: Buffer.from(text) });
  await page.getByRole("button", { name: "Store transcript" }).click();
  await expect(status(page, /^Transcript stored\./)).toBeVisible();
  await page.getByRole("button", { name: "Use this transcript" }).click();
  await expect(status(page, /^Transcript added to a new revision\./)).toBeVisible();
}

async function runGate(page: Page) {
  const button = gate(page).getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ });
  const rev = Number(/#(\d+)$/.exec((await button.textContent()) ?? "")?.[1]);
  await button.click();
  await expect(gate(page).getByTestId("gate-decision")).toContainText(`revision #${rev}`);
}

async function unpublish(page: Page) {
  await gate(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(status(page, /private again/)).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
}

/** True when some other video is listed in this database (a rerun without a reset), so /videos is not expected to be a 404 once this one is gone. */
async function othersListed(): Promise<boolean> {
  const { data, error } = await db.from("items").select("id").eq("kind", "video").eq("visibility", "public").neq("id", itemId);
  if (error) throw error;
  return (data ?? []).length > 0;
}

test("v: and a YouTube link files a private video; Fetch again reads the faked YouTube; Use this title copies its title", async ({ page }) => {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`v: https://youtu.be/${YT}`);
  await box.press("Enter");
  await expect(page.getByText(/^Saved \d{2}:\d{2} · /)).toBeVisible();
  itemId = (await itemIdOf(db, `Video ${YT}`)) ?? "";
  expect(itemId).not.toBe("");
  const stored = await db.from("items").select("kind, visibility").eq("id", itemId).single();
  expect(stored.data).toMatchObject({ kind: "video", visibility: "private" });

  await openVideo(page);
  await expect(page.getByRole("heading", { level: 2, name: "Video", exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for YouTube").first()).toBeVisible();
  await page.getByRole("button", { name: "Fetch again" }).click();
  await expect(status(page, /^YouTube was asked again\./)).toBeVisible();
  const youtube = page.locator("dl").filter({ hasText: "Channel" });
  await expect(youtube).toContainText(TITLE);
  await expect(youtube).toContainText("Your channel");
  await expect(youtube).toContainText("Unlisted");
  await expect(page.getByText(/^From YouTube, fetched /)).toBeVisible();

  await page.getByRole("button", { name: "Use this title" }).click();
  await expect(status(page, /^Title set from YouTube\./)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
});

test("a caption file with a spoken buy is stored as spoken; the gate refuses it under rule 1 on the transcript, and an empty reason does not clear it", async ({ page }) => {
  await openVideo(page);
  await storeCaptions(page, WITH_BUY);
  // His words are never edited here: the transcript has no field to type in.
  await expect(page.getByRole("textbox", { name: /transcript/i })).toHaveCount(0);

  await openVideo(page);
  await page.getByRole("button", { name: "Use chapters from the description" }).click();
  await expect(status(page, /^Chapters set from the/)).toBeVisible();
  await page.getByLabel("Learning objective").fill(OBJECTIVE);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(status(page, "Details saved.")).toBeVisible();

  await runGate(page);
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  const failure = gate(page).getByTestId("gate-failure");
  await expect(failure.first()).toHaveAttribute("data-rule", "1");
  await expect(gate(page).getByText("Rule 1: no actionable language")).toBeVisible();
  await expect(gate(page).getByText("In: Transcript")).toBeVisible();
  await expect(gate(page).getByTestId("flagged-sentence").locator("mark")).toHaveText("buy");
  await expect(page.getByTestId("visibility")).toHaveText("Private");

  // The reason field is required: pressing the button with it empty stores nothing, and the next run is refused again.
  await gate(page).getByRole("button", { name: "Allow sentence" }).click();
  await expect(status(page, "Sentence allowed")).toHaveCount(0);
  await runGate(page);
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  const none = await db.from("lint_allowances").select("sentence_hash").eq("item_id", itemId);
  expect(none.data ?? []).toHaveLength(0);
});

test("an allowance with a reason clears that one sentence; the video passes, then Unpublish takes it away again", async ({ page }) => {
  await openVideo(page);
  await gate(page).getByLabel("Reason for allowing this sentence").fill("A line from a lesson on what not to say.");
  await gate(page).getByRole("button", { name: "Allow sentence" }).click();
  await expect(status(page, "Sentence allowed")).toBeVisible();
  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  await expect(page.getByTestId("visibility")).toHaveText("Public");
  slug = (await page.getByTestId("slug").innerText()).trim();
  expect(slug).toMatch(/^[a-z0-9-]+-[0-9a-f]{6}$/);
  expect((await page.request.get(`/videos/${slug}`)).status()).toBe(200);

  await unpublish(page);
  await expectVideoGone(page.request, shown(), { indexToo: !(await othersListed()) });
});

test("the clean caption file replaces the transcript; the gate passes it with no allowance", async ({ page }) => {
  await openVideo(page);
  await storeCaptions(page, CLEAN);
  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  await expect(gate(page).getByText(/Allowed as educational usage/)).toHaveCount(0);
  const row = await db.from("items").select("visibility, status, slug").eq("id", itemId).single();
  expect(row.data).toMatchObject({ visibility: "public", status: "published", slug });
});

for (const size of [375, 1280] as const) {
  test(`a signed-out visitor at ${size} px reads /videos and the video page: chapters, transcript, no YouTube until the press, one request after`, async ({ browser }) => {
    await expectPublicVideo(browser, size, shown());
  });
}

test("the structured data, the share card, the feed and the sitemap list the video and hold nothing private", async ({ page }) => {
  await expectVideoSurfaces(page, page.request, shown());
});

test("Unpublish removes the video from the page, the card, the feed and the sitemap; Publish lists it again", async ({ page }) => {
  await openVideo(page);
  await unpublish(page);
  await expectVideoGone(page.request, shown(), { indexToo: !(await othersListed()) });

  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  expect((await page.request.get(`/videos/${slug}`)).status()).toBe(200);
  await expectVideoSurfaces(page, page.request, shown());
});
