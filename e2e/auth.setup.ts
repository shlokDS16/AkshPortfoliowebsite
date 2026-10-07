import { expect, test as setup } from "@playwright/test";
import { ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { ADMIN_STATE, E2E_ADMIN_EMAIL } from "./support/stack";

// Signs in once through the real /auth/confirm route with a server-generated token hash (no email
// is sent) and keeps the cookies for the desk projects. Signups are closed to the public; the
// admin API creates the one account, and the database trigger gives it the admin role.
setup("sign in as the admin and keep the session", async ({ page }) => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL);
  const hash = await tokenHashFor(stack, E2E_ADMIN_EMAIL);
  await page.goto(`/auth/confirm?token_hash=${hash}&type=magiclink&next=/desk`);
  await expect(page).toHaveURL(/\/desk$/);
  await expect(page.getByRole("textbox", { name: "Capture" })).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});
