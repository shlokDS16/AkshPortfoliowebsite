import { defineConfig } from "@playwright/test";
import { ADMIN_STATE, appEnv, E2E_PORT, E2E_SITE_URL, readLocalStack } from "./e2e/support/stack";

// Everything except smoke.spec.ts needs the LOCAL Supabase stack (`supabase start`). With the stack
// up, the app is rebuilt and started with explicit local env (NEXT_PUBLIC_* are inlined at build
// time), so .env.local, which holds the hosted project's keys, never applies.
const stack = readLocalStack();
if (process.env.CI && !stack) {
  throw new Error("The local Supabase stack was not found (supabase status -o env); the e2e job must run `supabase start` first.");
}

// Anchored on the file name: a bare /clocks\.spec\.ts/ would also match desk-clocks.spec.ts.
const spec = (names: string) => new RegExp(`[\\\\/](?:${names})\\.spec\\.ts$`);

const desk = {
  testMatch: spec("desk-[a-z0-9-]+"),
  dependencies: ["setup"],
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flake must show up as a failure, locally and in CI
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E_SITE_URL, trace: "retain-on-failure" },
  projects: [
    // Signed-out checks: the public page, the sign-in flow, every guard, the job routes and health.
    { name: "anon", testMatch: spec("smoke|auth|guard|clocks") },
    { name: "setup", testMatch: /[\\/]auth\.setup\.ts$/ },
    {
      name: "desk-mobile",
      ...desk,
      testIgnore: spec("desk-capture"), // database-level checks, no viewport: run once, in desk-desktop
      use: { storageState: ADMIN_STATE, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: "desk-desktop",
      ...desk,
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // Signing out revokes every session of the admin (GoTrue's default scope), including the stored
    // one the desk projects share, so this runs last and only after both desk projects have finished.
    { name: "signout", testMatch: spec("signout"), dependencies: ["desk-mobile", "desk-desktop"] },
  ],
  webServer: {
    command: stack ? `pnpm build && pnpm start -p ${E2E_PORT}` : `pnpm start -p ${E2E_PORT}`,
    url: E2E_SITE_URL,
    env: stack ? appEnv(stack) : undefined,
    reuseExistingServer: !process.env.CI && !stack,
    timeout: stack ? 300_000 : 120_000,
  },
});
