import { defineConfig } from "@playwright/test";
import { appEnv, E2E_PORT, E2E_SITE_URL, readLocalStack } from "./e2e/support/stack";

// The desk project needs the LOCAL Supabase stack (`supabase start`); the anon project does not.
// With the stack up, the app is rebuilt and started with explicit local env (NEXT_PUBLIC_* are
// inlined at build time), so .env.local, which holds the hosted project's keys, never applies.
const stack = readLocalStack();

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E_SITE_URL, trace: "on-first-retry" },
  projects: [
    { name: "anon", testMatch: /smoke\.spec\.ts/ },
    { name: "desk", testMatch: /desk-.*\.spec\.ts/ },
  ],
  webServer: {
    command: stack ? `pnpm build && pnpm start -p ${E2E_PORT}` : `pnpm start -p ${E2E_PORT}`,
    url: E2E_SITE_URL,
    env: stack ? appEnv(stack) : undefined,
    reuseExistingServer: !process.env.CI && !stack,
    timeout: stack ? 300_000 : 120_000,
  },
});
