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

// After the seed (which runs after setup): desk-facts-form edits the seeded Kaveri file.
const desk = {
  testMatch: spec("desk-[a-z0-9-]+"),
  dependencies: ["seed"],
};

const PUBLIC_PROJECTS = ["375", "1280"].flatMap((w) => [`public-${w}`, `public-${w}-dark`]);

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
    // Publishes two fictional files and three notes through the desk UI (LOCAL stack only; never the hosted project).
    {
      name: "seed",
      testMatch: /[\\/]seed[\\/]seed\.setup\.ts$/,
      dependencies: ["setup"],
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    ...(["375", "1280"] as const).flatMap((w) =>
      (["light", "dark"] as const).map((scheme) => ({
        name: `public-${w}${scheme === "dark" ? "-dark" : ""}`,
        testMatch: spec("public-[a-z0-9-]+"),
        dependencies: ["seed"],
        use: {
          viewport: w === "375" ? { width: 375, height: 812 } : { width: 1280, height: 800 },
          isMobile: w === "375",
          hasTouch: w === "375",
          colorScheme: scheme,
        },
      })),
    ),
    // The phone file page and register under prefers-reduced-motion: reduce.
    {
      name: "reduced-motion",
      testMatch: spec("motion"),
      dependencies: ["seed"],
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" },
    },
    {
      name: "desk-mobile",
      ...desk,
      testIgnore: spec("desk-capture|desk-ingestion"), // database-level checks, no viewport: run once, in desk-desktop
      use: { storageState: ADMIN_STATE, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: "desk-desktop",
      ...desk,
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // Plan 3b Task 5 (D43): a case study end to end on a seeded idea that the owner has moved back in time. It re-seals the whole
    // local chain and the sealed days, so it runs after every other ledger, public and desk project, and never against a hosted
    // project (e2e/support/cases.ts refuses to run without the local stack). It publishes one real case through the real gate and
    // leaves it public, with both owner switches off again.
    {
      name: "cases",
      testMatch: spec("cases"),
      dependencies: ["anon", ...PUBLIC_PROJECTS, "reduced-motion", "desk-mobile", "desk-desktop"], // anon writes sealed days and clears closes (clocks.spec.ts): it must finish first
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // The public case pages again, now that the loop above has left one case public: the published half of public-cases.spec.ts
    // (axe, one h1, no sideways scroll, the in-browser fingerprint check) runs here. In the public-* projects, which run first, that
    // half skips because nothing is public yet (the deploy state, which those projects check instead). Plan 5a Task 4: the derived
    // surfaces (public-distribution, public-print) run here too: sitemap, feed, metadata, cards and print with a case public.
    ...(["375", "1280"] as const).map((w) => ({
      name: `cases-public-${w}`,
      testMatch: spec("public-cases|public-distribution|public-print"),
      dependencies: ["cases"],
      use: { viewport: w === "375" ? { width: 375, height: 812 } : { width: 1280, height: 800 }, isMobile: w === "375", hasTouch: w === "375" },
    })),
    // Plan 4 Task 6: the learning-graph loop end to end (a capture with two #names, Names, the gate's refusal, "Make public" on both, a pass,
    // a signed-out visitor). It publishes one note that links two public concepts through the real gate and leaves it public, so it runs
    // after every public, desk and case project, which all expect the deploy state (no public concept).
    {
      name: "concepts",
      testMatch: spec("concepts"),
      dependencies: ["anon", ...PUBLIC_PROJECTS, "reduced-motion", "desk-mobile", "desk-desktop", "cases"],
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // The public concept pages again, now that the loop above has left two concepts public: the published half of public-concepts.spec.ts
    // (axe, one h1, no sideways scroll, the 44 px targets on the phone) runs here; in the public-* projects it skips. The derived surfaces
    // (public-distribution, public-print) run here once more, with concepts public.
    ...(["375", "1280"] as const).map((w) => ({
      name: `concepts-public-${w}`,
      testMatch: spec("public-concepts|public-distribution|public-print"),
      dependencies: ["concepts"],
      use: { viewport: w === "375" ? { width: 375, height: 812 } : { width: 1280, height: 800 }, isMobile: w === "375", hasTouch: w === "375" },
    })),
    // Plan 5b Task 9: the video loop end to end (a `v:` capture, the faked YouTube, a caption file, the gate's refusal of a spoken "buy", an
    // allowance, a pass, a signed-out visitor, every derived surface, Unpublish and Publish). YouTube is faked at the port
    // (DISTRIBUTION_ADAPTER=fixture in the web server's env, e2e/support/stack.ts), so nothing leaves the machine. It lists one video, so it
    // runs after every project that expects the deploy state, the cases-public and concepts-public ones included, and leaves the video public.
    {
      name: "videos",
      testMatch: spec("videos"),
      dependencies: ["anon", ...PUBLIC_PROJECTS, "reduced-motion", "desk-mobile", "desk-desktop", "cases", "concepts", "cases-public-375", "cases-public-1280", "concepts-public-375", "concepts-public-1280"],
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // The public video pages and the derived surfaces once more, now that the loop above has left one video listed: the listed half of
    // public-videos.spec.ts (axe, one h1, no sideways scroll, 44 px targets on the phone, nothing asked of YouTube before the press) runs here
    // and skips in the public-* projects. public-distribution and public-print run with a video in the sitemap, the feed, the cards and print.
    ...(["375", "1280"] as const).map((w) => ({
      name: `videos-public-${w}`,
      testMatch: spec("public-videos|public-distribution|public-print"),
      dependencies: ["videos"],
      use: { viewport: w === "375" ? { width: 375, height: 812 } : { width: 1280, height: 800 }, isMobile: w === "375", hasTouch: w === "375" },
    })),
    // Plan 5c Task 15: the letters loop end to end (sign-up, the held confirmation press, a token link, two letters through the real gate, the
    // Send dialog and its recorded approval, a stale second press, a reader who leaves). The ports are the fixture ones (DISTRIBUTION_ADAPTER=fixture
    // in the web server's env, e2e/support/stack.ts), so nothing is emailed; the fixture's outbox is a file this process reads. It publishes two
    // letters through the real gate, unpublishes the first and leaves the second (a sent letter) public with the sign-ups shut, so it runs after
    // every project that expects the deploy state or checks the sitemap and the feed exactly (the videos-public ones included).
    {
      name: "letters",
      testMatch: spec("letters"),
      dependencies: ["anon", ...PUBLIC_PROJECTS, "reduced-motion", "desk-mobile", "desk-desktop", "cases", "concepts", "videos", "cases-public-375", "cases-public-1280", "concepts-public-375", "concepts-public-1280", "videos-public-375", "videos-public-1280"],
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // The public letters pages once more, now that the loop above has left one sent letter on the archive: the published half of
    // public-letters-published.spec.ts runs here and skips in the public-* projects.
    ...(["375", "1280"] as const).map((w) => ({
      name: `letters-public-${w}`,
      testMatch: spec("public-letters-published"),
      dependencies: ["letters"],
      use: { viewport: w === "375" ? { width: 375, height: 812 } : { width: 1280, height: 800 }, isMobile: w === "375", hasTouch: w === "375" },
    })),
    // Phase 5d Task 4: the sources screens (the desk list, the file page's Outside sources panel, the public block and its picture from our own
    // route). It saves a source on the seeded Kaveri file, publishes a revision that lists it through the real gate, checks the public file at
    // both sizes, then takes the source off again (another revision), so it runs after every project that reads the seeded file as it was
    // seeded (the letters-public ones last) and before the sign-out. It leaves the Kaveri file public with no outside source.
    {
      name: "sources-screens",
      testMatch: spec("sources-screens"),
      dependencies: ["anon", ...PUBLIC_PROJECTS, "reduced-motion", "desk-mobile", "desk-desktop", "cases", "concepts", "videos", "letters", "cases-public-375", "cases-public-1280", "concepts-public-375", "concepts-public-1280", "videos-public-375", "videos-public-1280", "letters-public-375", "letters-public-1280"],
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
    // Signing out revokes every session of the admin (GoTrue's default scope), including the stored
    // one the desk projects share, so this runs last and only after the desk, case, concept, video and letters projects have finished.
    { name: "signout", testMatch: spec("signout"), dependencies: ["desk-mobile", "desk-desktop", "cases", "concepts", "videos", "letters", "sources-screens"] },
  ],
  webServer: {
    command: stack ? `pnpm build && pnpm start -p ${E2E_PORT}` : `pnpm start -p ${E2E_PORT}`,
    url: E2E_SITE_URL,
    env: stack ? appEnv(stack) : undefined,
    reuseExistingServer: !process.env.CI && !stack,
    timeout: stack ? 300_000 : 120_000,
  },
});
