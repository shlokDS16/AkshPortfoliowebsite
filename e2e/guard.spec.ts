import { expect, test } from "@playwright/test";
import { ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { adminDb, hydrated } from "./support/desk";
import { createLedgerCompany, syntheticOfficialFiles, weekdayBack } from "./support/ledger";
import { captureAction, replayWithoutSession, sentToLogin } from "./support/replay";
import { E2E_ADMIN_EMAIL } from "./support/stack";

const OUTSIDER = "guard-outsider@desk.test";
const AUTH_COOKIE = /^sb-.*-auth-token/;
const RUN = Date.now().toString(36);

test.beforeAll(async () => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL);
  await ensureUser(stack, OUTSIDER); // trigger assigns role 'client'
});

// Every signed-out redirect check lives here, so it runs once (in `anon`) and not once per desk viewport.
test.describe("signed out", () => {
  for (const path of [
    "/desk",
    "/desk/items",
    "/desk/items/00000000-0000-4000-8000-000000000000",
    "/desk/names",
    "/desk/companies",
    // The Ledger (Plan 3a Task 10): the list, the new-idea form, and an idea page.
    "/desk/ledger",
    "/desk/ledger/new",
    "/desk/ledger/00000000-0000-4000-8000-000000000000",
    // Closes, corporate actions and the journal (Plan 3a Task 11).
    "/desk/ledger/closes",
    "/desk/ledger/closes?correct=00000000-0000-4000-8000-000000000000",
    "/desk/ledger/journal",
  ]) {
    test(`${path} sends the visitor to the sign-in page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }
});

// Nothing about the ledger is reachable from a public address: the sitemap and the public pages name no Ledger address, and
// the private pages answer a signed-out visitor with the sign-in page and not with a word of the ledger.
test.describe("the ledger is not public", () => {
  test("a signed-out visitor to a Ledger page sees the sign-in page and nothing of the ledger", async ({ page }) => {
    await page.goto("/desk/ledger");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/ledger|consistent with itself|sealed day/i);
  });

  test("the public pages and the sitemap name no Ledger address", async ({ request }) => {
    for (const path of ["/", "/sitemap.xml", "/robots.txt"]) {
      const response = await request.get(path);
      if (response.status() !== 200) continue; // an address the site does not serve names nothing
      expect(await response.text(), path).not.toMatch(/\/desk\/ledger|\/ledger/i);
    }
  });

  test("the health route exposes a job, an age and a boolean and no ledger content", async ({ request }) => {
    const body = JSON.stringify(await (await request.get("/api/health")).json());
    expect(body).not.toMatch(/idea|entry|entries|sealed|fingerprint/i);
  });
});

test("a server action called with no session is refused and changes nothing", async ({ browser, baseURL, request }) => {
  const stack = requireStack();

  // The admin's own browser only reads the form's action id off the page, and proves the request
  // shape works when a session is present (so the refusal below is about the session, not the shape).
  const adminContext = await browser.newContext({ baseURL });
  try {
    const page = await adminContext.newPage();
    const hash = await tokenHashFor(stack, E2E_ADMIN_EMAIL);
    await page.goto(`/auth/confirm?token_hash=${hash}&type=magiclink&next=/desk/items`);
    await expect(page).toHaveURL(/\/desk\/items$/);
    const actionField = await page.locator('form:has(#title) input[type=hidden][name^="$ACTION_ID_"]').getAttribute("name");
    expect(actionField).toMatch(/^\$ACTION_ID_[0-9a-f]+$/);
    const submit = (title: string) => ({ [actionField!]: "", kind: "note", title });

    const allowedTitle = `guard control ${RUN}`;
    const allowed = await adminContext.request.post("/desk/items", { multipart: submit(allowedTitle), headers: { origin: baseURL! }, maxRedirects: 0 });
    expect(allowed.status()).toBe(303);
    expect(allowed.headers().location).toMatch(/\/desk\/items\/[0-9a-f-]{36}$/);

    const refusedTitle = `guard refused ${RUN}`;
    const refused = await request.post("/desk/items", { multipart: submit(refusedTitle), headers: { origin: baseURL! }, maxRedirects: 0 });
    expect(refused.status()).toBe(303);
    expect(refused.headers().location).toMatch(/\/login$/);

    await page.goto("/desk/items");
    await expect(page.getByRole("link", { name: allowedTitle })).toBeVisible();
    await expect(page.getByText(refusedTitle)).toHaveCount(0);
  } finally {
    await adminContext.close();
  }
});

// The two ledger writes are server actions sent by script (no hidden action id in the page). The admin's browser sends each
// once and the request is kept; the same request sent with no cookie must be turned away at the sign-in page and write nothing.
test("the ledger's server actions called with no session are refused and write nothing (Task 10 review I1)", async ({ browser, baseURL, request }) => {
  test.setTimeout(120_000);
  const stack = requireStack();
  const db = await adminDb();
  const company = await createLedgerCompany(db, "G");
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
  try {
    const page = await adminContext.newPage();
    await page.goto(`/auth/confirm?token_hash=${await tokenHashFor(stack, E2E_ADMIN_EMAIL)}&type=magiclink&next=/desk/ledger/new`);
    await expect(page).toHaveURL(/\/desk\/ledger\/new$/);
    await hydrated(page);

    // openIdeaAction: the control is the admin's own request; the probe is the same request with a different marker and no cookie.
    await page.getByLabel("Company").selectOption({ label: `${company.name} (${company.symbol})` });
    await page.getByLabel("Expects to do better than the Nifty 50").check();
    await page.getByLabel("1 year").check();
    await page.getByLabel("No, I do not hold it").check();
    await page.getByLabel("Why do you think so, and what would change your mind?").fill(`admin-control ${RUN}`);
    const open = await captureAction(page, () => page.getByRole("button", { name: "Record the idea" }).click());
    await expect(page).toHaveURL(/\/desk\/ledger\/[0-9a-f-]{36}\?notice=idea-recorded/);
    const ideaUrl = page.url().split("?")[0] as string;
    const refusedOpen = await replayWithoutSession(request, open, baseURL!, (b) => b.replace(`admin-control ${RUN}`, `anon-probe-1 ${RUN}`));
    expect(sentToLogin(refusedOpen), `status ${refusedOpen.status()} ${JSON.stringify(refusedOpen.headers())}`).toBe(true);
    const ideas = await db.from("ideas").select("id").eq("company_id", company.id);
    if (ideas.error) throw ideas.error;
    expect(ideas.data).toHaveLength(1);

    // addIdeaEventAction, on that idea.
    await hydrated(page);
    await page.getByLabel("Your note").fill(`admin-note ${RUN}`);
    const note = await captureAction(page, () => page.getByRole("button", { name: "Add the note" }).click());
    await expect(page.getByText("Entry added and sealed.")).toBeVisible();
    const refusedNote = await replayWithoutSession(request, note, baseURL!, (b) => b.replace(`admin-note ${RUN}`, `anon-probe-2 ${RUN}`));
    expect(sentToLogin(refusedNote), `status ${refusedNote.status()}`).toBe(true);
    const events = await db.from("idea_events").select("body_md").eq("idea_id", ideas.data[0]!.id);
    if (events.error) throw events.error;
    expect(events.data.map((e) => e.body_md).sort()).toEqual([`admin-control ${RUN}`, `admin-note ${RUN}`]);
    await page.goto(ideaUrl);
    await expect(page.getByText(`anon-probe-1 ${RUN}`)).toHaveCount(0);
    await expect(page.getByText(`anon-probe-2 ${RUN}`)).toHaveCount(0);
  } finally {
    await adminContext.close();
  }
});

// Task 11's writes: the official-file route (a plain POST that reads a file), and the three server actions of the Closes page.
test("the Closes page's route and actions called with no session are refused and store nothing", async ({ browser, baseURL, request }) => {
  test.setTimeout(180_000);
  const stack = requireStack();
  const db = await adminDb();
  const company = await createLedgerCompany(db, "H");
  const open = await db.rpc("open_idea", { p_company_id: company.id, p_expects: "outperform", p_horizon_days: 365, p_held: false, p_body_md: `guard idea ${RUN}` });
  if (open.error) throw open.error;
  const day = weekdayBack(1);

  // The upload route: no cookie is a 401 whatever the body, and a real-looking drop stores nothing.
  const files = syntheticOfficialFiles(day, [{ symbol: company.symbol, close: "55.55" }]);
  const refusedUpload = await request.post("/desk/ledger/closes/upload", {
    multipart: { date: day, bhavcopy: { name: "BhavCopy.csv.zip", mimeType: "application/zip", buffer: files.zip }, index: { name: "ind.csv", mimeType: "text/csv", buffer: files.index } },
    headers: { origin: baseURL! },
    maxRedirects: 0,
  });
  expect(refusedUpload.status()).toBe(401);
  expect(await refusedUpload.json()).toEqual({ ok: false, error: "not-signed-in" });
  const stored = await db.from("prices_daily").select("trade_date, source").eq("company_id", company.id);
  if (stored.error) throw stored.error;
  expect(stored.data).toEqual([]);
  // Another site's page cannot use the owner's cookie either: a request with a foreign Origin is turned away by the route itself.
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
  try {
    const page = await adminContext.newPage();
    await page.goto(`/auth/confirm?token_hash=${await tokenHashFor(stack, E2E_ADMIN_EMAIL)}&type=magiclink&next=/desk/ledger/closes`);
    await expect(page).toHaveURL(/\/desk\/ledger\/closes$/);
    await hydrated(page);
    const foreign = await adminContext.request.post("/desk/ledger/closes/upload", {
      multipart: { date: day, bhavcopy: { name: "x.zip", mimeType: "application/zip", buffer: files.zip } },
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(foreign.status()).toBe(403);
    // Over the size limit: refused before the files are read, with the limit stated by the route's code.
    const huge = await adminContext.request.post("/desk/ledger/closes/upload", {
      multipart: { date: day, bhavcopy: { name: "x.zip", mimeType: "application/zip", buffer: Buffer.alloc(2_700_000) } },
      headers: { origin: baseURL! },
      maxRedirects: 0,
    });
    expect(huge.status()).toBe(413);
    expect(await huge.json()).toEqual({ ok: false, code: "too_large" });

    // The three actions: the admin's browser sends each once (kept), and the same request with no cookie is sent to the sign-in page.
    const hand = weekdayBack(2);
    await page.locator("#close-company").selectOption({ label: `${company.name} (${company.symbol})` });
    await page.getByLabel("Trading date", { exact: true }).fill(hand);
    await page.getByLabel("Closing price of the company").fill("66.66");
    const close = await captureAction(page, () => page.getByRole("button", { name: "Store the close" }).click());
    await expect(page.getByText("Close stored as typed.")).toBeVisible();
    const refusedClose = await replayWithoutSession(request, close, baseURL!, (b) => b.replace("66.66", "77.77"));
    expect(sentToLogin(refusedClose), `status ${refusedClose.status()}`).toBe(true);

    await hydrated(page);
    await page.locator("#action-company").selectOption({ label: `${company.name} (${company.symbol})` });
    await page.getByLabel("Split", { exact: true }).check();
    await page.getByLabel("Ex-date").fill(hand);
    await page.getByLabel(/Factor/).fill("5");
    await page.getByLabel(/Note, optional/).fill(`admin-action ${RUN}`);
    const action = await captureAction(page, () => page.getByRole("button", { name: "Enter the action" }).click());
    await expect(page.getByText("Action entered.")).toBeVisible();
    const refusedAction = await replayWithoutSession(request, action, baseURL!, (b) => b.replace(`admin-action ${RUN}`, `anon-action ${RUN}`));
    expect(sentToLogin(refusedAction), `status ${refusedAction.status()}`).toBe(true);

    await hydrated(page);
    const fetchNow = await captureAction(page, () => page.getByRole("button", { name: "Fetch closes now" }).click());
    await expect(page.getByTestId("fetch-result")).toBeVisible();
    const beforeBeats = await db.from("heartbeats").select("id", { count: "exact", head: true }).eq("job", "ledger:prices");
    const refusedFetch = await replayWithoutSession(request, fetchNow, baseURL!);
    expect(sentToLogin(refusedFetch), `status ${refusedFetch.status()}`).toBe(true);
    const afterBeats = await db.from("heartbeats").select("id", { count: "exact", head: true }).eq("job", "ledger:prices");
    expect(afterBeats.count).toBe(beforeBeats.count); // the refused request ran no step

    // Only the admin's own writes are on the books.
    const closes = await db.from("prices_daily").select("close, source").eq("company_id", company.id);
    if (closes.error) throw closes.error;
    expect(closes.data.map((c) => [Number(c.close), c.source])).toContainEqual([66.66, "manual"]);
    expect(closes.data.some((c) => Number(c.close) === 77.77)).toBe(false);
    const actions = await db.from("corporate_actions").select("note").eq("company_id", company.id);
    if (actions.error) throw actions.error;
    expect(actions.data.map((a) => a.note)).toEqual([`admin-action ${RUN}`]);
  } finally {
    await adminContext.close();
  }
});

test("a non-admin who completes a sign-in link is left holding no auth cookie", async ({ page, context }) => {
  const stack = requireStack();
  const authCookies = async () => (await context.cookies()).map((c) => c.name).filter((name) => AUTH_COOKIE.test(name));

  const outsiderHash = await tokenHashFor(stack, OUTSIDER);
  await page.goto(`/auth/confirm?token_hash=${outsiderHash}&type=magiclink&next=/desk`);
  await expect(page).toHaveURL(/\/login\?error=not-allowed$/);
  expect(await authCookies()).toEqual([]);

  // Control: the same check does see the cookie when the admin signs in, so it is not vacuous.
  const adminHash = await tokenHashFor(stack, E2E_ADMIN_EMAIL);
  await page.goto(`/auth/confirm?token_hash=${adminHash}&type=magiclink&next=/desk`);
  await expect(page).toHaveURL(/\/desk$/);
  expect((await authCookies()).length).toBeGreaterThan(0);
});
