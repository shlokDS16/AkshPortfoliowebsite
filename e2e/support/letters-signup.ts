import { expect, type Browser } from "@playwright/test";
import { guardOutbound } from "./outbound";
import { ADMIN_STATE, E2E_SITE_URL } from "./stack";

// Aksh's own switch for sign-ups (/desk/letters/readers), pressed through the desk the way he does it, from a spec that is otherwise signed out.
// Going through the desk matters: the press refreshes the public cache that the sign-up page reads, which a direct write to the table would not.
// LOCAL stack only (the spec's own requireStack guards the run). Nothing is sent by this switch.

/** Opens or closes the sign-ups. Already in that state: nothing is pressed. */
export async function setSignup(browser: Browser, on: boolean): Promise<void> {
  const context = await browser.newContext({ storageState: ADMIN_STATE, baseURL: E2E_SITE_URL });
  try {
    await guardOutbound(context);
    const page = await context.newPage();
    await page.goto("/desk/letters/readers");
    await expect(page.getByRole("heading", { level: 1, name: "Readers" })).toBeVisible();
    const press = page.getByRole("button", { name: on ? "Open sign-ups" : "Close sign-ups" });
    if ((await press.count()) === 0) return;
    await press.click();
    await expect(page.getByText(on ? "Sign-ups open." : "Sign-ups closed.", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
}
