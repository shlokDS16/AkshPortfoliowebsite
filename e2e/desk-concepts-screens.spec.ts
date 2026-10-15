import { expect, test } from "@playwright/test";
import { adminDb } from "./support/desk";
import { seedConceptWorld } from "./support/concept-world";

// Phase 4 Task 4, against the real app: the server actions behind the concept screens work through the forms (bound actions handed to
// client components). The whole capture-to-public loop is Task 6's. Runs in desk-mobile and desk-desktop.

test("a concept page: Link from a suggestion, Remove, and his words saved and kept", async ({ page }, testInfo) => {
  const world = await seedConceptWorld(await adminDb(), `s-${testInfo.project.name.endsWith("mobile") ? "m" : "d"}`);
  await page.goto(`/desk/concepts/${world.slug}`);
  const seen = page.getByRole("heading", { level: 2, name: "Seen together in your notes" }).locator("xpath=ancestor::section[1]");
  await seen.getByRole("button", { name: `Link ${world.partnerName}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Linked." })).toBeVisible();
  const related = page.getByRole("heading", { level: 2, name: "Related concepts" }).locator("xpath=ancestor::section[1]");
  await expect(related.getByRole("link", { name: world.partnerName })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Seen together in your notes" })).toHaveCount(0);
  await related.getByRole("button", { name: `Remove link to ${world.partnerName}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link removed." })).toBeVisible();
  await expect(related.getByRole("link", { name: world.partnerName })).toHaveCount(0);

  const words = "  Capital goes where returns were high.  \n\nSecond line.";
  await page.getByLabel(`What you mean by ${world.name}`).fill(words);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved. Only you see this." })).toBeVisible();
  expect(await page.getByLabel(`What you mean by ${world.name}`).inputValue()).toBe(words.trim());
});

test("the picker on an item: add a concept by tapping, Save concepts makes one version, and the row shows the order", async ({ page }, testInfo) => {
  const world = await seedConceptWorld(await adminDb(), `p-${testInfo.project.name.endsWith("mobile") ? "m" : "d"}`);
  await page.goto(`/desk/concepts/${world.slug}`);
  await page.getByRole("link", { name: world.learning }).click();
  const row = page.getByRole("region", { name: "Concepts", exact: true });
  await expect(row.getByRole("link", { name: world.name })).toBeVisible();
  await row.getByRole("button", { name: "Change" }).click();
  const box = page.getByRole("combobox", { name: "Find a concept" });
  await box.fill(world.linkedName);
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page.getByText("3 of 8 chosen")).toBeVisible();
  await page.getByRole("button", { name: "Save concepts" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Concepts saved." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Concepts", exact: true }).getByRole("link")).toHaveText([world.name, world.partnerName, world.linkedName]);
  await expect(page.getByText("Concepts: added")).toBeVisible();
});
