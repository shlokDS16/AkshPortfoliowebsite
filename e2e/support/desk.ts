import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { requireStack, tokenHashFor } from "./auth";
import { E2E_ADMIN_EMAIL } from "./stack";

// Helpers the desk specs share: a client signed in as the admin (RLS applies), lookups that do not depend on the
// recent-items list, the retire step that leaves the shared local inbox clean, and the axe scan.

/** The capture dock marks its button once the page's client code is attached; typing before then can be reset. */
export const hydrated = (page: Page) => expect(page.getByRole("button", { name: "Capture", exact: true })).toHaveAttribute("data-shortcuts", "ready");

/** A client signed in as the e2e admin on the LOCAL stack (requireStack refuses any other API URL). */
export async function adminDb(): Promise<Db> {
  const stack = requireStack();
  const db = createClient<Database>(stack.apiUrl, stack.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.auth.verifyOtp({ token_hash: await tokenHashFor(stack, E2E_ADMIN_EMAIL), type: "magiclink" });
  if (error) throw error;
  return db;
}

export async function documentIdOf(db: Db, title: string): Promise<string> {
  const { data, error } = await db.from("documents").select("id").eq("title", title).single();
  if (error) throw error;
  return data.id;
}

/** The oldest item with this title, or null. /desk/items lists only the 100 most recent, so a seeded item can scroll off it. */
export async function itemIdOf(db: Db, title: string): Promise<string | null> {
  const { data, error } = await db.from("items").select("id").eq("title", title).order("created_at").limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Opens an item by its title without relying on the recent-items list. */
export async function openItem(page: Page, db: Db, title: string): Promise<void> {
  const id = await itemIdOf(db, title);
  if (!id) throw new Error(`no item titled "${title}"`);
  await page.goto(`/desk/items/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** Leaves nothing behind in the shared local inbox: the job is cancelled and the document skipped (the admin's own rights). */
export async function retire(db: Db, documentId: string): Promise<void> {
  await db.from("jobs").update({ cancelled_at: new Date().toISOString() }).eq("document_id", documentId).is("cancelled_at", null);
  await db.from("documents").update({ status: "skipped" }).eq("id", documentId);
}

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/**
 * Waits until no animation on a rendered element is still going, for at most 5 s, and then throws naming what is still going (a scan taken
 * mid-fade reads the wrong colours, and a silent cap would hide an animation that never ends). An element that is not rendered (inside a
 * closed <details>, say) is skipped: its animation can stay "running" for ever, and axe does not look at it either.
 */
async function settleVisibleAnimations(page: Page): Promise<void> {
  const stuck = await page.evaluate(async () => {
    const going = () =>
      document.getAnimations().flatMap((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        if (!(target instanceof Element) || !target.checkVisibility()) return [];
        if (a.playState !== "running") return [];
        return [`${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}${typeof target.className === "string" && target.className ? `.${target.className.trim().split(/\s+/).join(".")}` : ""}`];
      });
    const deadline = Date.now() + 5_000;
    while (going().length > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    return going();
  });
  if (stuck.length > 0) throw new Error(`animations still running on: ${stuck.join(", ")}`);
}

/** WCAG 2.2 A/AA in light, then in dark (the desk follows the OS); leaves the page in light. Motion is reduced for the scan, so transitions end at once. */
export async function expectNoViolationsInBothThemes(page: Page): Promise<void> {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await settleVisibleAnimations(page);
    await expectNoViolations(page);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
}
