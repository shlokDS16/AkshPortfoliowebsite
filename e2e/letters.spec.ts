import { expect, test, type Page } from "@playwright/test";
import type { Db } from "@/lib/supabase/types";
import { DISCLOSURE_LINE } from "../src/modules/distribution/letters/copy";
import { requireStack } from "./support/auth";
import { adminDb, hydrated } from "./support/desk";
import {
  askToSubscribe, confirmationLinkFor, confirmFromEmail, emptyOutbox, expectLetterGone, expectLetterPublic, leave, outbox,
} from "./support/letters-loop";
import { setSignup } from "./support/letters-signup";
import { installOutboundGuard } from "./support/outbound";
import { ADMIN_STATE, E2E_CRON_SECRET, E2E_SITE_URL } from "./support/stack";

installOutboundGuard(); // nothing leaves the machine

// Plan 5c Task 15: a letter from sign-up to an approved send, on the LOCAL stack, through the screens a reader and Aksh use. NOTHING IS SENT: the web
// server runs with DISTRIBUTION_ADAPTER=fixture (support/stack.ts), so the "email service" is a JSON file that the fixture port appends to and this
// process reads (support/letters-loop.ts). No key is set and no request leaves this machine (the outbound guard fails a test that reaches one).
//  1. Reader A asks on /letters: no email goes. Aksh presses "Send confirmation emails": exactly one confirmation, with a token link. A opens it
//     (a GET changes nothing) and confirms. Reader B asks too and is left waiting.
//  2. Letter 1 and letter 2 are made from "what changed". Letter 1 shows "Untitled letter" and cannot be sent until the subject is his. It passes
//     the real gate; the outbox still holds no broadcast. He presses Send: the dialog names the exact count, the approval row is recorded, the outbox
//     holds one broadcast to exactly A (B, still waiting, gets nothing). A second press (a stale tab, then the pump twice) sends nothing again.
//  3. B is sent a confirmation and confirms. A leaves. Letter 2 is sent: its broadcast goes to B only. Letter 1 is unpublished and is gone from
//     every public surface; letter 2 stays public (letters-public-*), sign-ups are shut, and `pnpm supabase db reset` clears it for the next run.
const tag = Date.now().toString(36);
const A = `reader-a-${tag}@example.com`;
const B = `reader-b-${tag}@example.com`;
const SUBJECT_1 = `What changed, first letter ${tag}`;
const SUBJECT_2 = `What changed, second letter ${tag}`;
const OBJECTIVE = "Which public pages changed since the last letter.";
const LABEL_WHY = "The subject is still a label. Replace it with your own subject, save, and run the gate again.";

test.describe.configure({ mode: "serial" });

let db: Db;
type Made = { id: string; path: string; slug: string; card: string; firstEntry: string };
const one: Made = { id: "", path: "", slug: "", card: "", firstEntry: "" };
const two: Made = { id: "", path: "", slug: "", card: "", firstEntry: "" };
let finished = false;

const gate = (page: Page) => page.locator("#gate");
const status = async (email: string) => (await db.from("subscribers").select("status").eq("email", email).maybeSingle()).data?.status;
const sends = async (itemId: string) => (await db.from("letter_sends").select("*").eq("item_id", itemId)).data ?? [];

test.beforeAll(async () => {
  requireStack();
  db = await adminDb();
  emptyOutbox();
});

// Whatever a failure leaves behind, the door is shut and no letter is left public (a finished run leaves the second letter public on purpose).
test.afterAll(async ({ browser }) => {
  await setSignup(browser, false);
  await db.rpc("letters_leave", { p_email: A });
  await db.rpc("letters_leave", { p_email: B });
  if (finished) return;
  const context = await browser.newContext({ storageState: ADMIN_STATE, baseURL: E2E_SITE_URL });
  for (const made of [one, two]) {
    if (!made.id) continue;
    const { data } = await db.from("items").select("visibility").eq("id", made.id).single();
    if (data?.visibility !== "public") continue;
    const page = await context.newPage();
    await page.goto(made.path);
    await gate(page).getByRole("button", { name: "Unpublish" }).click();
  }
  await context.close();
});

async function makeLetter(page: Page, into: Made): Promise<void> {
  await page.goto("/desk/letters/new");
  await expect(page.getByRole("heading", { level: 1, name: "What changed" })).toBeVisible();
  await page.getByRole("button", { name: "Make this letter" }).click();
  await expect(page).toHaveURL(/\/desk\/letters\/[0-9a-f-]{36}\?notice=letter-made/);
  into.path = new URL(page.url()).pathname;
  into.id = into.path.split("/").pop() ?? "";
  await hydrated(page);
}

async function save(page: Page, fields: { subject?: string; objective?: string }): Promise<void> {
  if (fields.subject) await page.getByLabel("Subject").fill(fields.subject);
  if (fields.objective) await page.getByLabel("One sentence: what a reader learns").fill(fields.objective);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Letter saved\./)).toBeVisible();
}

async function runGate(page: Page): Promise<void> {
  await gate(page).getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
  const decision = gate(page).getByTestId("gate-decision");
  await expect(decision).toBeVisible();
  expect(await decision.getAttribute("data-verdict"), await gate(page).innerText()).toBe("pass");
  await expect(page.getByTestId("visibility")).toHaveText("Public");
}

async function unpublish(page: Page): Promise<void> {
  await gate(page).getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
}

/** Opens the Send dialog and ticks the preview, leaving Send itself to the caller. */
async function openDialog(page: Page, count: string) {
  await gate(page).getByRole("button", { name: `Send to ${count}` }).click();
  const dialog = page.getByRole("dialog", { name: "Send this letter" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const slugOf = async (id: string) => (await db.from("items").select("slug").eq("id", id).single()).data?.slug ?? "";
const press = (dialog: ReturnType<Page["getByRole"]>) => dialog.getByRole("button", { name: "Send", exact: true });

test("a reader asks to subscribe: nothing is emailed until Aksh presses, then exactly one confirmation goes, and opening its link changes nothing", async ({ page, browser }) => {
  await setSignup(browser, true);
  await askToSubscribe(browser, A);
  expect(await status(A)).toBe("waiting");
  expect(outbox().emails, "no email without the press").toEqual([]);

  await page.goto("/desk/letters/readers");
  await expect(page.getByText("Waiting: 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send confirmation emails (1)" }).click();
  await expect(page.getByText("Confirmation emails sent.")).toBeVisible();

  const sent = outbox().emails;
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe(A);
  expect(sent[0].text).toContain(`${E2E_SITE_URL}/letters/confirm?t=`);
  expect(await status(A)).toBe("sent");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Send confirmation emails/ })).toHaveCount(0);

  await confirmFromEmail(browser, A, () => status(A));
  await page.reload();
  await expect(page.getByText("1 reader", { exact: true })).toBeVisible();
  expect(outbox().broadcasts, "no letter yet").toEqual([]);

  // B asks as well and is left waiting: not confirmed, so not a recipient of the first letter.
  await askToSubscribe(browser, B);
  expect(await status(B)).toBe("waiting");
  expect(confirmationLinkFor(B)).toBeNull();
  expect(outbox().emails).toHaveLength(1);
});

test("the letters desk offers what changed; the first letter is a label until he writes the subject, and cannot be sent until then", async ({ page }) => {
  await page.goto("/desk/letters");
  await expect(page.getByRole("heading", { level: 1, name: "Letters" })).toBeVisible();
  await makeLetter(page, one);
  await makeLetter(page, two);

  await page.goto(one.path);
  await expect(page.getByRole("heading", { level: 1, name: /^Untitled letter, / })).toBeVisible();
  await expect(page.getByText("Run the publishing gate first.")).toBeVisible();
  await save(page, { objective: OBJECTIVE });
  await runGate(page);
  await expect(gate(page).getByRole("button", { name: "Send to 1 subscriber" })).toBeDisabled();
  await expect(page.getByText(LABEL_WHY).first()).toBeVisible();
  await unpublish(page);

  await save(page, { subject: SUBJECT_1 });
  await runGate(page);
  await expect(gate(page).getByRole("button", { name: "Send to 1 subscriber" })).toBeEnabled();
  expect(outbox().broadcasts, "published is not sent").toEqual([]);
  expect(await sends(one.id)).toEqual([]);
  one.slug = await slugOf(one.id);
});

test("Send: the dialog names the exact count, the approval is recorded, exactly the confirmed reader is emailed, and a second press sends nothing", async ({ page, context }) => {
  // A second tab, opened before the first press, with the dialog ready: the stale second press.
  const stale = await context.newPage();
  await stale.goto(one.path);
  const staleDialog = await openDialog(stale, "1 subscriber");
  await staleDialog.getByLabel("I have read the preview").check();

  await page.goto(one.path);
  const dialog = await openDialog(page, "1 subscriber");
  await expect(dialog.getByText(SUBJECT_1)).toBeVisible();
  await expect(dialog.getByText("This emails 1 person. An email cannot be called back.")).toBeVisible();
  await expect(press(dialog)).toBeDisabled();
  await dialog.getByLabel("I have read the preview").check();
  await press(dialog).click();
  await expect(page.getByText("Approved. The letter goes out within 15 minutes.")).toBeVisible();

  // The approval row (the audit trail), then the step the press kicked off.
  const [approval] = await sends(one.id);
  expect(approval).toMatchObject({ kind: "subscribers", recipients_at_approval: 1, item_id: one.id });
  expect(approval.approved_by).toBeTruthy();
  expect(approval.gate_decision_id).toBeTruthy();
  await expect.poll(async () => (await sends(one.id))[0]?.status, { timeout: 30_000 }).toBe("sent");
  expect((await sends(one.id))[0].recipients_sent).toBe(1);

  const { broadcasts, contacts } = outbox();
  expect(broadcasts).toHaveLength(1);
  expect(broadcasts[0]).toMatchObject({ subject: SUBJECT_1, status: "sent", recipients: [A] });
  expect(contacts.map((c) => c.email)).toEqual([A]);
  expect(broadcasts[0].text).toContain(OBJECTIVE);
  expect(broadcasts[0].text).toContain(DISCLOSURE_LINE);
  expect(broadcasts[0].html).toContain(SUBJECT_1);

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: /^Sent to 1 on / })).toBeVisible();
  await expect(gate(page).getByRole("button", { name: /^Send to / })).toHaveCount(0);

  // The stale tab presses Send now: refused in words, and still only one approval and one broadcast.
  await press(staleDialog).click();
  await expect(stale.getByRole("dialog")).toHaveCount(0);
  await expect(stale).toHaveURL(/\?error=letter-already-sent$/);
  await expect(stale.getByText("This letter has already been sent to subscribers, or its send is waiting.")).toBeVisible();
  expect(await sends(one.id)).toHaveLength(1);
  // The pump twice more (the 15-minute job): it claims nothing, because nothing is approved.
  for (let n = 0; n < 2; n += 1) {
    expect((await page.request.post("/api/jobs/run", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).status()).toBe(200);
  }
  expect(outbox().broadcasts).toHaveLength(1);
  expect(await sends(one.id)).toHaveLength(1);
  await stale.close();
});

test("the sent letter is on every public surface, with his words and the entries he was offered", async ({ browser }) => {
  const shown = await expectLetterPublic(browser, { slug: one.slug, subject: SUBJECT_1, objective: OBJECTIVE });
  one.card = shown.card;
  one.firstEntry = shown.firstEntry;
  expect(outbox().broadcasts[0].text).toContain(shown.firstEntry);
});

test("the second reader is confirmed, the first leaves, and the next letter goes to the second only", async ({ page, browser }) => {
  await page.goto("/desk/letters/readers");
  await expect(page.getByText("Waiting: 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send confirmation emails (1)" }).click();
  await expect(page.getByText("Confirmation emails sent.")).toBeVisible();
  expect(outbox().emails.map((e) => e.to)).toEqual([A, B]);
  await confirmFromEmail(browser, B, () => status(B));

  await leave(browser, A);
  expect(await status(A)).toBeUndefined();

  await page.goto(two.path);
  await save(page, { subject: SUBJECT_2, objective: OBJECTIVE });
  await runGate(page);
  const dialog = await openDialog(page, "1 subscriber");
  await dialog.getByLabel("I have read the preview").check();
  await press(dialog).click();
  await expect(page.getByText("Approved. The letter goes out within 15 minutes.")).toBeVisible();
  await expect.poll(async () => (await sends(two.id))[0]?.status, { timeout: 30_000 }).toBe("sent");

  const { broadcasts, contacts } = outbox();
  expect(broadcasts).toHaveLength(2);
  expect(broadcasts[0].recipients, "the first letter's list is history").toEqual([A]);
  expect(broadcasts[1]).toMatchObject({ subject: SUBJECT_2, status: "sent", recipients: [B] });
  expect(contacts.map((c) => c.email)).toEqual([B]);
  two.slug = await slugOf(two.id);
});

test("unpublishing the first letter takes it off every public surface; the second stays, and the sign-ups are shut", async ({ page, browser }) => {
  const shown = await expectLetterPublic(browser, { slug: two.slug, subject: SUBJECT_2, objective: OBJECTIVE });
  two.card = shown.card;
  await page.goto(one.path);
  await unpublish(page);
  await expectLetterGone(browser, one.slug, one.card);
  await expectLetterPublic(browser, { slug: two.slug, subject: SUBJECT_2, objective: OBJECTIVE });

  await setSignup(browser, false);
  await page.goto("/desk/letters/readers");
  await expect(page.getByText("Sign-ups closed", { exact: true })).toBeVisible();
  await expect(page.getByText("1 reader", { exact: true })).toBeVisible();
  finished = true;
});
