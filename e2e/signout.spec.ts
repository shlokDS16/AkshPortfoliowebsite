import { expect, test } from "@playwright/test";
import { ensureUser, requireStack, tokenHashFor } from "./support/auth";
import { E2E_ADMIN_EMAIL } from "./support/stack";

// Runs last (see playwright.config.ts): GoTrue's default sign-out scope revokes every session of the admin.
test("signing out ends the session: /desk sends the visitor back to /login", async ({ page }) => {
  const stack = requireStack();
  await ensureUser(stack, E2E_ADMIN_EMAIL);
  await page.goto(`/auth/confirm?token_hash=${await tokenHashFor(stack, E2E_ADMIN_EMAIL)}&type=magiclink&next=/desk`);
  await expect(page).toHaveURL(/\/desk$/);
  await expect(page.getByRole("textbox", { name: "Capture" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/login$/);
});
