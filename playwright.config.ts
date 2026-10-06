import { defineConfig } from "@playwright/test";
import { ADMIN_STATE, appEnv, E2E_PORT, E2E_SITE_URL, readLocalStack } from "./e2e/support/stack";

// Everything except smoke.spec.ts needs the LOCAL Supabase stack (`supabase start`). With the stack
// up, the app is rebuilt and started with explicit local env (NEXT_PUBLIC_* are inlined at build
// time), so .env.local, which holds the hosted project's keys, never applies.
const stack = readLocalStack();

// Anchored on the file name: a bare /clocks\.spec\.ts/ would also match desk-clocks.spec.ts.
const spec = (names: string) => new RegExp(`[\\\\/](?:${names})\\.spec\\.ts$`);

const desk = {
  testMatch: spec("desk-[a-z-]+"),
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
    // Signed-out checks: the public page, the sign-in flow, the guards, the job routes and health.
    // auth.spec.ts signs the admin out, and the GoTrue default scope revokes every session of that
    // user, so this project must finish before `setup` creates the session the desk projects reuse.
    { name: "anon", testMatch: spec("smoke|auth|guard|clocks") },
    { name: "setup", testMatch: /[\\/]auth\.setup\.ts$/, dependencies: ["anon"] },
    {
      name: "desk-mobile",
      ...desk,
      use: { storageState: ADMIN_STATE, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: "desk-desktop",
      ...desk,
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: stack ? `pnpm build && pnpm start -p ${E2E_PORT}` : `pnpm start -p ${E2E_PORT}`,
    url: E2E_SITE_URL,
    env: stack ? appEnv(stack) : undefined,
    reuseExistingServer: !process.env.CI && !stack,
    timeout: stack ? 300_000 : 120_000,
  },
});
