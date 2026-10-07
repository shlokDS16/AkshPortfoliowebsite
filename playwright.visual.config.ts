import { defineConfig } from "@playwright/test";

// Screenshots of the /dev/preview gallery (fixture data, fixed dates) under next dev. Baselines are
// platform-specific, so they are generated and compared on Shlok's machine; CI does not run this config.
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /visual\.spec\.ts/,
  workers: 1,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: (["375", "1280"] as const).flatMap((w) =>
    (["light", "dark"] as const).map((scheme) => ({
      name: `visual-${w}-${scheme}`,
      use: { viewport: w === "375" ? { width: 375, height: 812 } : { width: 1280, height: 800 }, colorScheme: scheme },
    })),
  ),
  // The gallery renders fixtures only, but the root layout validates the public env (src/lib/env.ts). These are
  // placeholder public values, never secrets, so baselines need neither .env.local nor a running Supabase stack.
  webServer: {
    command: `pnpm dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/dev/preview`,
    env: {
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_visual-baselines-only",
    },
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
