import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { createCaptureDeps, listCapturesSince, refileCapture, saveCapture } from "@/modules/capture";
import { createSupabaseCatalogRepo, ensureCompany } from "@/modules/catalog";
import { requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

// Runs the capture module's real Supabase repos against the LOCAL stack as the signed-in admin, so RLS,
// the unique constraints and the raw_text trigger are exercised for real.
// The local database is not reset between runs, so symbols and text carry a run suffix.
const RUN = Date.now().toString(36).toUpperCase();
const entry = (rawText: string, clientId: string = randomUUID()) => ({ rawText, source: "web" as const, clientId });

let db: Db;

test.beforeAll(async () => {
  const stack = requireStack();
  db = createClient<Database>(stack.apiUrl, stack.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.auth.verifyOtp({ token_hash: await tokenHashFor(stack, E2E_ADMIN_EMAIL), type: "magiclink" });
  if (error) throw error;
});

test("stores the text verbatim, files a private note and a stub company flagged for review", async () => {
  const symbol = `E2E${RUN}A`;
  const raw = `  $${symbol.toLowerCase()} capex plan #capital-cycle-${RUN.toLowerCase()}  `;
  const result = await saveCapture(createCaptureDeps(db), entry(raw));
  expect(result).toMatchObject({ duplicate: false, parseError: null, kind: "note" });

  const { data: capture } = await db.from("captures").select("raw_text, item_id, company_id, theme_id, parsed").eq("id", result.captureId).single();
  expect(capture?.raw_text).toBe(raw);
  expect(capture?.item_id).toBe(result.itemId);
  expect(capture?.parsed).toMatchObject({ kind: "note", symbols: [symbol] });

  const { data: company } = await db.from("companies").select("nse_symbol, visibility, needs_review").eq("id", capture?.company_id ?? "").single();
  expect(company).toEqual({ nse_symbol: symbol, visibility: "private", needs_review: true });
  const { data: theme } = await db.from("themes").select("visibility, needs_review").eq("id", capture?.theme_id ?? "").single();
  expect(theme).toEqual({ visibility: "private", needs_review: true });
  const { data: item } = await db.from("items").select("kind, visibility, company_id").eq("id", result.itemId ?? "").single();
  expect(item).toMatchObject({ kind: "note", visibility: "private", company_id: capture?.company_id });

  const recent = await listCapturesSince(db, new Date(Date.now() - 60_000).toISOString());
  expect(recent.find((c) => c.id === result.captureId)).toMatchObject({ companySymbol: symbol, parseError: null, rawText: raw });
});

test("a repeated or concurrent clientId creates one capture and one item", async () => {
  const once = entry(`double tap ${RUN}`);
  const deps = createCaptureDeps(db);
  const results = await Promise.all([saveCapture(deps, once), saveCapture(deps, once)]);
  expect(new Set(results.map((r) => r.captureId)).size).toBe(1);
  const again = await saveCapture(deps, once);
  expect(again).toMatchObject({ duplicate: true, captureId: results[0].captureId });

  const { count: captures } = await db.from("captures").select("id", { count: "exact", head: true }).eq("client_id", once.clientId);
  expect(captures).toBe(1);
  const { data: capture } = await db.from("captures").select("item_id").eq("client_id", once.clientId).single();
  const { count: items } = await db.from("items").select("id", { count: "exact", head: true }).eq("title", `double tap ${RUN}`);
  expect(capture?.item_id).not.toBeNull();
  expect(items).toBe(1);
});

test("two simultaneous captures of a new symbol share one stub company", async () => {
  const symbol = `E2E${RUN}B`;
  await Promise.all([
    saveCapture(createCaptureDeps(db), entry(`$${symbol} first`)),
    saveCapture(createCaptureDeps(db), entry(`$${symbol} second`)),
  ]);
  const { count } = await db.from("companies").select("id", { count: "exact", head: true }).eq("nse_symbol", symbol);
  expect(count).toBe(1);
  const { data: captures } = await db.from("captures").select("company_id, parsed").like("raw_text", `$${symbol} %`);
  expect(captures).toHaveLength(2);
  for (const capture of captures ?? []) expect(capture.company_id).not.toBeNull();
  expect(new Set(captures?.map((c) => c.company_id)).size).toBe(1);
});

test("ensureCompany returns the existing row when the symbol already exists", async () => {
  const repo = createSupabaseCatalogRepo(db);
  const first = await ensureCompany(repo, `e2e${RUN}c`);
  expect(await ensureCompany(repo, `E2E${RUN}C`)).toEqual(first);
});

test("a later t: capture appends a revision to the same thesis", async () => {
  const symbol = `E2E${RUN}D`;
  const deps = createCaptureDeps(db);
  const first = await saveCapture(deps, entry(`t: $${symbol} deal wins slowing`));
  const second = await saveCapture(deps, entry(`t: $${symbol} margins holding`));
  expect(second.itemId).toBe(first.itemId);
  const { data: revisions } = await db.from("item_revisions").select("rev_no, body_md").eq("item_id", first.itemId ?? "").order("rev_no");
  expect(revisions?.map((r) => r.rev_no)).toEqual([1, 2]);
  expect(revisions?.[1].body_md).toBe(`$${symbol} deal wins slowing\n\n$${symbol} margins holding`);
});

test("when filing fails the capture row stays, unlinked, with a fixed error code", async () => {
  const deps = createCaptureDeps(db);
  const broken = { ...deps, research: { ...deps.research, insertItem: () => Promise.reject(new Error("simulated outage")) } };
  const raw = `kept despite outage ${RUN}`;
  const result = await saveCapture(broken, entry(raw));
  expect(result).toMatchObject({ itemId: null, parseError: "filing-failed" });

  const { data: capture } = await db.from("captures").select("raw_text, item_id, parsed").eq("id", result.captureId).single();
  expect(capture).toMatchObject({ raw_text: raw, item_id: null, parsed: { error: "filing-failed" } });
  expect(JSON.stringify(capture?.parsed)).not.toContain("simulated outage");
});

test("the database still refuses to rewrite or delete a stored capture", async () => {
  const { captureId } = await saveCapture(createCaptureDeps(db), entry(`immutable ${RUN}`));
  const rewrite = await db.from("captures").update({ raw_text: "changed" }).eq("id", captureId);
  expect(rewrite.error).not.toBeNull();
  const removal = await db.from("captures").delete().eq("id", captureId);
  expect(removal.error?.message ?? "").toMatch(/never deleted|permission denied|denied/i);
  const { data } = await db.from("captures").select("raw_text").eq("id", captureId).single();
  expect(data?.raw_text).toBe(`immutable ${RUN}`);
});

test("refile files a failed capture, and links an item whose capture link was lost", async () => {
  const deps = createCaptureDeps(db);

  const outage = { ...deps, research: { ...deps.research, insertItem: () => Promise.reject(new Error("simulated outage")) } };
  const failedText = `refile after outage ${RUN}`;
  const failed = await saveCapture(outage, entry(failedText));
  expect(failed).toMatchObject({ itemId: null, parseError: "filing-failed" });
  const refiled = await refileCapture(deps, failed.captureId, new Date());
  const { data: filedRow } = await db.from("captures").select("item_id, parsed").eq("id", failed.captureId).single();
  expect(filedRow?.item_id).toBe(refiled.itemId);
  expect(filedRow?.parsed).not.toHaveProperty("error");

  // The item is written but the capture row is never linked to it (a killed function): no parse is recorded.
  const lostText = `refile after lost link ${RUN}`;
  const unlinked = { ...deps, captures: { ...deps.captures, attach: () => Promise.reject(new Error("simulated blip")) } };
  const lost = await saveCapture(unlinked, entry(lostText));
  expect(lost).toMatchObject({ parseError: "link-failed" });
  const linked = await refileCapture(deps, lost.captureId, new Date(Date.now() + 11 * 60_000));
  expect(linked.itemId).toBe(lost.itemId);
  const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("title", lostText);
  expect(count).toBe(1);
  const { data: lostRow } = await db.from("captures").select("item_id").eq("id", lost.captureId).single();
  expect(lostRow?.item_id).toBe(lost.itemId);
});

test("c opens the capture sheet from any desk screen; the receipt says where it goes; Esc closes it", async ({ page }) => {
  await page.goto("/desk/items");
  const dialog = page.getByRole("dialog", { name: "Capture" });
  // The key handler attaches on hydration, which `goto` does not wait for: press again until the sheet opens.
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByRole("textbox", { name: "Capture" }).fill("l: $NEWNAME dealer credit");
  await expect(dialog.getByText("$NEWNAME → New names")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
