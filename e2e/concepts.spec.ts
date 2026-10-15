import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { POLICY_VERSION } from "@/modules/compliance/client";
import { requireStack } from "./support/auth";
import { expectPublicConcepts, type Concept } from "./support/concept-pages";
import { adminDb, hydrated, itemIdOf } from "./support/desk";

// Plan 4 Task 6: the whole learning-graph loop on the LOCAL stack, through the screens Aksh uses. A capture with two #names, the two
// concepts screened on Names, the concept page, his link between them, a read logged with r:, the gate's refusal (one line per concept),
// "Make public" on both, a pass, and a signed-out visitor at 375 and 1280 reading /concepts, a concept page and the note's own Concepts
// line. It then changes the concepts of the public note: refused while a revision waits, and the reason it writes names only public
// concepts. The note stays public (like the case in cases.spec.ts) so the concepts-public-* projects can check the published half of
// public-concepts.spec.ts; `supabase db reset` before the next run.

const run = Date.now().toString(36);
const MOATS: Concept = { slug: "e2e-moats", name: "E2E moats" };
const CYCLES: Concept = { slug: "e2e-cycles", name: "E2E cycles" };
const NOTE = `What moats do for a business ${run} #${MOATS.slug} #${CYCLES.slug}`;
const READ = `Notes on a memo about cycles ${run} #${MOATS.slug}`;
const OBJECTIVE = "Learn what a moat is and how a cycle tests it.";
const PENDING = "A newer version of this note is waiting to be published. Publish it before changing the concepts.";

test.describe.configure({ mode: "serial" });

let db: Db;
let noteId = "";
let readId = "";
let notePath = "";

const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const gate = (page: Page) => page.locator("#gate");

test.beforeAll(async () => {
  requireStack();
  db = await adminDb();
  const taken = await db.from("themes").select("slug").in("slug", [MOATS.slug, CYCLES.slug]);
  if ((taken.data ?? []).length > 0) throw new Error("The e2e concepts already exist in this database. Run `pnpm supabase db reset` before the full suite.");
});

async function capture(page: Page, text: string) {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByText(/^Saved \d{2}:\d{2} · /)).toBeVisible();
}

async function openItem(page: Page, id: string, title: string) {
  await page.goto(`/desk/items/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await hydrated(page);
}

async function runGate(page: Page) {
  const button = page.getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ });
  const rev = Number(/#(\d+)$/.exec((await button.textContent()) ?? "")?.[1]);
  await button.click();
  await expect(gate(page).getByTestId("gate-decision")).toContainText(`revision #${rev}`);
}

async function conceptStatuses(slugs: string[]) {
  const { data } = await db.from("themes").select("slug, needs_review, visibility").in("slug", slugs).order("slug");
  return data ?? [];
}

test("a capture with two #names: both wait on Names, are screened there, and the note shows both as chips", async ({ page }) => {
  await capture(page, `l: ${NOTE}`);
  noteId = (await itemIdOf(db, NOTE)) ?? "";
  expect(noteId).not.toBe("");

  await page.goto("/desk/names");
  await hydrated(page);
  for (const c of [MOATS, CYCLES]) {
    const card = page.getByRole("article").filter({ has: page.getByText(`#${c.slug}`, { exact: true }) });
    await expect(card.getByText(/^concept · first seen /)).toBeVisible();
    await card.getByRole("button", { name: "New concept" }).click();
    await card.getByLabel("Name").fill(c.name);
    await card.getByRole("button", { name: "Yes, add it" }).click();
    await expect(status(page, "Saved. The name is screened.")).toBeVisible();
    await expect(page.getByRole("article").filter({ has: page.getByText(`#${c.slug}`, { exact: true }) })).toHaveCount(0);
  }

  await openItem(page, noteId, NOTE);
  const row = page.getByRole("region", { name: "Concepts", exact: true });
  await expect(row.getByRole("link")).toHaveText([MOATS.name, CYCLES.name]);
});

test("the concept page lists the note under Learnings; Link relates two concepts, and a double tap makes one link", async ({ page }) => {
  await page.goto(`/desk/concepts/${MOATS.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: MOATS.name })).toBeVisible();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  const learnings = page.getByRole("heading", { level: 2, name: "Learnings" }).locator("xpath=ancestor::section[1]");
  await expect(learnings.getByRole("link", { name: NOTE })).toBeVisible();
  await hydrated(page);

  await page.getByLabel("Link a concept").selectOption({ label: CYCLES.name });
  await page.getByRole("button", { name: "Link", exact: true }).dblclick();
  await expect(status(page, "Linked.")).toBeVisible();
  const related = page.getByRole("heading", { level: 2, name: "Related concepts" }).locator("xpath=ancestor::section[1]");
  await expect(related.getByRole("link", { name: CYCLES.name })).toBeVisible();
  await expect(related.getByRole("button", { name: `Remove link to ${CYCLES.name}` })).toHaveCount(1);
  const ids = await db.from("themes").select("id").in("slug", [MOATS.slug, CYCLES.slug]);
  const edges = await db.from("concept_edges").select("concept_a").in("concept_a", ids.data!.map((t) => t.id)).in("concept_b", ids.data!.map((t) => t.id));
  expect(edges.data).toHaveLength(1);
});

test("r: logs a read: it shows under Reads and on the month page, has no publish panel, and the gate refuses it in SQL", async ({ page }) => {
  await capture(page, `r: ${READ}`);
  readId = (await itemIdOf(db, READ)) ?? "";
  expect(readId).not.toBe("");
  const stored = await db.from("items").select("kind, visibility").eq("id", readId).single();
  expect(stored.data).toMatchObject({ kind: "reading_note", visibility: "private" });

  await page.goto(`/desk/concepts/${MOATS.slug}`);
  const reads = page.getByRole("heading", { level: 2, name: "Reads" }).locator("xpath=ancestor::section[1]");
  await expect(reads.getByRole("link", { name: READ })).toBeVisible();

  await page.goto("/desk/learned");
  await expect(page.getByRole("heading", { level: 1, name: /^What I learned in / })).toBeVisible();
  const monthReads = page.getByRole("heading", { level: 2, name: /^Reads \(\d+\)$/ }).locator("xpath=ancestor::section[1]");
  await expect(monthReads.getByRole("link", { name: READ })).toBeVisible(); // his title, word for word
  const learnt = page.getByRole("heading", { level: 2, name: /^Learnings \(\d+\)$/ }).locator("xpath=ancestor::section[1]");
  await expect(learnt.getByRole("link", { name: NOTE })).toBeVisible();

  await openItem(page, readId, READ);
  await expect(page.getByText("A read stays private. It is not published.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Run the publishing gate/ })).toHaveCount(0);

  // The desk never offers it, so the refusal is asked for directly, as the gate's only caller does (service key, the local stack).
  const stack = requireStack();
  const service = createClient<Database>(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const actor = (await db.auth.getUser()).data.user!.id;
  const revision = await db.from("item_revisions").select("id").eq("item_id", readId).order("rev_no", { ascending: false }).limit(1).single();
  const decision = await service.rpc("publish_revision", {
    p_actor: actor,
    p_item_id: readId,
    p_revision_id: revision.data!.id,
    p_policy_version: POLICY_VERSION,
    p_lint_result: { passed: true, revisionId: revision.data!.id, policyVersion: POLICY_VERSION },
  });
  expect(decision.error).toBeNull();
  expect(decision.data).toMatchObject({ verdict: "fail" });
  const rules = await db.from("gate_decisions").select("reasons").eq("revision_id", revision.data!.id).single();
  expect(JSON.stringify(rules.data?.reasons)).toContain("reading_note");
  const after = await db.from("items").select("visibility, status").eq("id", readId).single();
  expect(after.data).toMatchObject({ visibility: "private" });
});

test("the gate refuses the note with one line per concept; Make public on both lets it pass", async ({ page }) => {
  await openItem(page, noteId, NOTE);
  await page.getByLabel("Learning objective").fill(OBJECTIVE);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(status(page, "Details saved.")).toBeVisible();
  for (const c of [MOATS, CYCLES]) await expect(page.getByText(`Concept "${c.name}" is not public yet.`)).toBeVisible();

  await runGate(page);
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "fail");
  const failures = gate(page).getByTestId("gate-failure");
  await expect(failures).toHaveCount(2);
  await expect(failures.filter({ hasText: "The linked concept is not public." })).toHaveAttribute("data-rule", "theme"); // the first concept is the note's theme
  await expect(failures.filter({ hasText: `The linked concept "${CYCLES.name}" is not public.` })).toHaveAttribute("data-rule", "concept");

  for (const c of [MOATS, CYCLES]) {
    await page.getByRole("button", { name: `Make ${c.name} public` }).click();
    await expect(page.getByRole("button", { name: `Make ${c.name} public` })).toHaveCount(0); // the line is gone once the page is refreshed
  }
  await expect(status(page, "Concept made public")).toBeVisible();
  expect((await conceptStatuses([MOATS.slug, CYCLES.slug])).map((c) => c.visibility)).toEqual(["public", "public"]);
  await hydrated(page);
  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await expect(gate(page).getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
  const row = await db.from("items").select("visibility, status, slug").eq("id", noteId).single();
  expect(row.data).toMatchObject({ visibility: "public", status: "published" });
  notePath = `/notes/${row.data!.slug}`;
});

for (const size of [375, 1280] as const) {
  test(`a signed-out visitor at ${size} px reads /concepts, a concept page and the note's Concepts line`, async ({ browser }) => {
    await expectPublicConcepts(browser, size, { concepts: [MOATS, CYCLES], notePath, noteTitle: NOTE, absent: [READ] });
  });
}

test("a revision is waiting: the picker is refused with a plain sentence; once it is published, a concept change names only public concepts", async ({ page }) => {
  const margins: Concept = { slug: "e2e-margins", name: "E2E margins" };
  const hidden = [`E2E private one ${run}`, `E2E private two ${run}`];
  const rows = [margins.name, ...hidden].map((name, i) => ({ slug: i === 0 ? margins.slug : `e2e-private-${i}-${run}`, name, needs_review: false }));
  expect((await db.from("themes").insert(rows)).error).toBeNull();

  await openItem(page, noteId, NOTE);
  await page.getByLabel("Body (Markdown)").fill(`A moat is what lets a business keep its returns.\n\nA cycle shows how long it can.`);
  await page.getByLabel("Change reason").fill("Second version");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(status(page, /waiting for the publishing gate/)).toBeVisible();
  const region = page.getByRole("region", { name: "Concepts", exact: true });
  await region.getByRole("button", { name: "Change" }).click();
  await expect(page.getByText(PENDING)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save concepts" })).toBeDisabled();

  await runGate(page);
  await expect(status(page, /^Published\.$/)).toBeVisible();
  await page.goto(`/desk/concepts/${margins.slug}`);
  await page.getByRole("button", { name: "Make public" }).click();
  await expect(status(page, "Concept made public")).toBeVisible();

  await openItem(page, noteId, NOTE);
  await page.getByRole("region", { name: "Concepts", exact: true }).getByRole("button", { name: "Change" }).click();
  await expect(page.getByText(PENDING)).toHaveCount(0);
  for (const name of [margins.name, ...hidden]) {
    const box = page.getByRole("combobox", { name: "Find a concept" });
    await box.fill(name);
    await box.press("ArrowDown");
    await box.press("Enter");
  }
  await expect(page.getByText("5 of 8 chosen")).toBeVisible();
  await page.getByRole("button", { name: "Save concepts" }).click();
  await expect(status(page, /waiting for the publishing gate/)).toBeVisible();

  // The reason publishes with the revision, so it counts the private concepts instead of naming them.
  const reasons = await db.from("item_revisions").select("change_reason").eq("item_id", noteId);
  const all = (reasons.data ?? []).map((r) => r.change_reason ?? "");
  expect(all).toContain(`Concepts: added ${margins.name} and 2 private concepts.`);
  for (const name of hidden) expect(all.join("\n")).not.toContain(name);
  await expect(page.getByText(`Concepts: added ${margins.name} and 2 private concepts.`)).toBeVisible();
});

for (const size of [375, 1280] as const) {
  test(`at ${size} px the public pages still show only the two public concepts of the version that passed the gate`, async ({ browser }) => {
    await expectPublicConcepts(browser, size, { concepts: [MOATS, CYCLES], notePath, noteTitle: NOTE, absent: ["E2E private", "e2e-private", "E2E margins", "e2e-margins"] });
  });
}
