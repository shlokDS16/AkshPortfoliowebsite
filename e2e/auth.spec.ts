import { expect, test } from "@playwright/test";
import { clearMailbox, ensureUser, latestEmailLink, mailCountFor, requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

const OUTSIDER = "outsider@desk.test";
const STRANGER = "stranger@desk.test";

test.beforeAll(async () => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL); // GoTrue insert -> trigger assigns role 'admin'
  await ensureUser(stack, OUTSIDER); // trigger assigns role 'client'
  await clearMailbox(stack);
});

test("magic link: the form answers alike for everyone, and only the admin gets a working link", async ({ page }) => {
  const stack = requireStack();
  const submit = async (email: string) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send sign-in link" }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("If this address is allowed");
    return status.innerText();
  };

  const strangerMessage = await submit(STRANGER);
  const adminMessage = await submit(E2E_ADMIN_EMAIL);
  expect(adminMessage).toBe(strangerMessage);
  expect(await mailCountFor(stack, STRANGER)).toBe(0);

  await page.goto(await latestEmailLink(stack, E2E_ADMIN_EMAIL));
  await expect(page).toHaveURL(/\/desk$/);
  await expect(page.getByRole("textbox", { name: "Capture" })).toBeVisible();
});

test("confirm route: an admin token hash signs in, and next= cannot leave the desk", async ({ page, baseURL }) => {
  const hash = await tokenHashFor(requireStack(), E2E_ADMIN_EMAIL);
  await page.goto(`/auth/confirm?token_hash=${hash}&type=magiclink&next=//evil.example/x`);
  await expect(page).toHaveURL(`${baseURL}/desk`);
  await expect(page.getByRole("textbox", { name: "Capture" })).toBeVisible();
});

test("a signed-in non-admin is signed straight back out", async ({ page }) => {
  const hash = await tokenHashFor(requireStack(), OUTSIDER);
  await page.goto(`/auth/confirm?token_hash=${hash}&type=magiclink&next=/desk`);
  await expect(page).toHaveURL(/\/login\?error=not-allowed$/);
  await expect(page.locator("main [role=alert]")).toContainText("not allowed");
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/login$/);
});

test("bad or missing link parameters land on /login with a plain message", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=nope&type=magiclink");
  await expect(page).toHaveURL(/\/login\?error=link-expired$/);
  await expect(page.locator("main [role=alert]")).toContainText("did not work");
  await page.goto("/auth/confirm?type=recovery&token_hash=x");
  await expect(page).toHaveURL(/\/login\?error=bad-link$/);
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?error=missing-code$/);
});
