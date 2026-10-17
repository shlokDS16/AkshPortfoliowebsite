import { createHash } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { fixtureJpeg } from "@/modules/documents/fixture-sources";

// Steps the sources loop (e2e/sources.spec.ts) shares: the capture box, the wait for the server's read, the panel row of one source, the
// revision save and the gate run. Test setup only; the LOCAL stack is required by adminDb()/requireStack() in the spec.

/** The three fixture videos (src/modules/documents/fixture-sources.ts): an id picks what the made-up YouTube says about it. */
export const BUY = { id: "fxBuyTitle1", title: "Five stocks to buy now" };
export const PRICE = { id: "fxPriceTtl1", title: "Why it was trading at Rs 450 a share" };
export const CLEAN = { id: "fxCleanVid1", title: "Fixture video fxCleanVid1: how to read a balance sheet" };
export const CHANNEL = "Fixture Channel";
export type Fixture = typeof BUY;

/** The sha-256 the desk stores for a fixture video's picture (the same bytes the fixture picture server answers). */
export const thumbShaOf = (id: string): string => createHash("sha256").update(fixtureJpeg(id)).digest("hex");

export const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

/** Types a line into the capture box on the desk home and waits for the receipt. */
export async function capture(page: Page, line: string): Promise<void> {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(line);
  await box.press("Enter");
  await expect(page.getByText(/^Saved \d{2}:\d{2} · /)).toBeVisible();
}

type Stored = { title: string | null; note: string; thumb: string | null };

/** The link's row, as the admin's own rights see it, or null before the capture has stored it. */
export async function storedSource(db: Db, id: string): Promise<Stored | null> {
  const { data, error } = await db.from("source_links").select("title, note, thumb_sha256").eq("url_key", `yt:${id}`).maybeSingle();
  if (error) throw error;
  return data ? { title: data.title, note: data.note, thumb: data.thumb_sha256 } : null;
}

/** Waits for the read the capture starts after its answer (the fixture YouTube answers at once); the title is the sign that it happened. */
export async function waitForRead(db: Db, video: Fixture): Promise<Stored> {
  await expect.poll(async () => (await storedSource(db, video.id))?.title ?? null, { message: `the desk read ${video.id}`, timeout: 30_000 }).toBe(video.title);
  return (await storedSource(db, video.id))!;
}

/** One source's row in the file page's "Outside sources" panel, found by the title the machine read. */
export function panelRow(page: Page, video: Fixture): Locator {
  return page
    .getByRole("region", { name: "Outside sources" })
    .locator("li")
    .filter({ has: page.locator("input[name=link]") })
    .filter({ hasText: video.title });
}

/** Ticks "Show on the public file" and leaves "Show its title and picture" as asked. */
export async function listIt(row: Locator, withTitle: boolean): Promise<void> {
  await row.getByRole("checkbox", { name: "Show on the public file" }).check();
  const title = row.getByRole("checkbox", { name: "Show its title and picture" });
  await (withTitle ? title.check() : title.uncheck());
}

/** "Save as a new revision" on the panel; waits for the desk to say so. */
export async function saveRevision(page: Page, reason: string): Promise<void> {
  const panel = page.getByRole("region", { name: "Outside sources" });
  await panel.getByRole("textbox", { name: /Change reason/ }).fill(reason);
  await panel.getByRole("button", { name: "Save as a new revision" }).click();
  await expect(status(page, /^Revision saved\.$|waiting for the publishing gate/)).toBeVisible();
}

/** Runs the publishing gate on the newest revision (the stance tick is part of the press) and checks the verdict it records. */
export async function runGate(page: Page, verdict: "pass" | "fail"): Promise<void> {
  await page.getByRole("checkbox", { name: /I have not changed my stance on/ }).check();
  const button = page.getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ });
  const rev = /#(\d+)$/.exec((await button.textContent()) ?? "")?.[1];
  await button.click();
  const decision = page.locator("#gate").getByTestId("gate-decision");
  await expect(decision).toHaveAttribute("data-verdict", verdict);
  await expect(decision).toContainText(`revision #${rev}`);
  if (verdict === "pass") await expect(status(page, /^Published\.$/)).toBeVisible();
}
