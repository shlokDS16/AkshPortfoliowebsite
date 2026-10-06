import { expect, test } from "@playwright/test";
import { ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

const OUTSIDER = "guard-outsider@desk.test";
const AUTH_COOKIE = /^sb-.*-auth-token/;
const RUN = Date.now().toString(36);

test.beforeAll(async () => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL);
  await ensureUser(stack, OUTSIDER); // trigger assigns role 'client'
});

test.describe("signed out", () => {
  for (const path of ["/desk", "/desk/items", "/desk/items/00000000-0000-4000-8000-000000000000"]) {
    test(`${path} sends the visitor to the sign-in page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }
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
