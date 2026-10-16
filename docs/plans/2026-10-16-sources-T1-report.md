# Task 1 report: switch off letters and own-channel videos (Phase 5d)

Built by desk-backend on branch `phase-5d-sources` (from 44d72b6). Not pushed. No migration, no schema change, nothing deleted.

## Result
Feature switch `src/lib/features.ts`: `FEATURES = { ownVideos: false, letters: false }`. `featureOn(name)` is true only when the constant is true, or when `FEATURES_ON` (comma list, exact names) is set and `VERCEL_ENV` is neither `preview` nor `production`. Turning a feature back on is a one-line PR (flip its constant). `FEATURES_ON` is a test and local override only; vitest runs with `ownVideos,letters` (vitest.config.mts) and the e2e web server too (e2e/support/stack.ts), so the hidden videos and letters suites run unchanged.

## Entry points (every one covered by a test; `git grep -n featureOn` lists them)
| Entry point | Off behaviour | Where |
|---|---|---|
| Desk Items nav (Videos, Letters links) | not rendered; nav label drops the words | `src/app/desk/items/items-subnav.tsx` (new, used by `items/page.tsx`) |
| Desk Items list rows of kind video or letter | not listed (they have no page) | `src/app/desk/items/visible-items.ts` |
| Items tab match list | claims `/desk/videos` and `/desk/letters` only when on | `desk-tabs.tsx`, `desk-shell.tsx`, `app/desk/layout.tsx` |
| `/desk/videos/**`, `/desk/letters/**` | 404 (layout `notFound()`) | `app/desk/{videos,letters}/layout.tsx` |
| `/videos/**`, `/letters/**` (index, sign-up, confirm, leave, every page) | 404 (layout) | `app/(public)/{videos,letters}/layout.tsx` |
| Share cards `/videos/[slug]/opengraph-image`, `/letters/[slug]/opengraph-image` | 404 before any read (route handlers sit outside layouts) | the two `opengraph-image.tsx` |
| Item page `/desk/items/[id]` for a video or letter | 404 (was a redirect to the hidden page) | `item-view.tsx` |
| Public letter doors (ask, confirm, leave) | same one-sentence answer as always, no database call, no ticket check | `distribution/public-actions.ts` |
| Public snapshot (every public page, feed, sitemap, rail counts, cards, JSON-LD and print are built from it; the tests assert the feed, sitemap and rail counts directly, and the smoke below checks the rendered pages) | video and letter items, their revisions, video rows and concept links removed after the cached read | `showcase/hide-kinds.ts`, `showcase/queries.ts` |
| Capture `v:` key and placeholder hint | not offered (`GrammarKeyRow` six keys) | `grammar-key-row.tsx`, `capture-bar.tsx`, `capture-sheet.tsx`, `capture-dock.tsx`, desk layout and home |
| Desk home Monday letter prompt | not rendered and its database read skipped | `app/desk/page.tsx` |
| `videos:fetch`, `videos:check`, "Fetch again" | no YouTube port whatever the settings: "videos off", no outbound, no table read (the stored-data purge on `videos:check` still runs, exactly as when the YouTube settings are unset) | `ops/video-steps.ts` |
| `letters:send`, `letters:reconcile`, confirmation emails | no Resend ports: "letters off", no outbound, no claim | `ops/letter-steps.ts` |
| `letters:purge` | still runs (retention duty for reader data already stored; database only) | unchanged |
| `lettersOn()`, `videoListingOn()` | false | same two files |

## Deviations from the written plan (read these)
1. **`featureEnv()` is in `src/lib/env.ts`, not `env.server.ts`.** The brief said "through env.server.ts". The public pages call the snapshot, and `isolation.test.ts` pins that nothing reachable from `@/modules/showcase` imports `env.server`. Reading two plain, non-secret strings (`FEATURES_ON`, `VERCEL_ENV`) in `env.ts` keeps all four isolation tests unedited. `features.ts` is `server-only`, and the values are not `NEXT_PUBLIC_*`, so a browser bundle sees nothing; client components get the answer as a prop.
2. **Capture service untouched** (plan line 133: Task 3 maps `v:`). Task 1 only hides the `v:` key and hint. A typed `v:` line still files a (now invisible) video item until Task 3 lands; the video steps do nothing with it.
3. **No Playwright spec for the off state in this task.** The shared e2e server runs with the override on (the videos and letters projects need it), so the off state is proven by unit and integration tests plus a smoke against a separate production build (below). The spec s10 e2e "hidden letters and videos 404" belongs to Task 5, which needs a second server on a separate build directory.

## Tests
New: `src/lib/features.test.ts`, `src/app/features-off.test.tsx` (four layouts, two cards), `src/modules/showcase/hide-kinds.test.ts`, `queries.features.test.ts` (the real `getSnapshot` wiring), `src/app/desk/items/{items-subnav,visible-items}.test.ts(x)`, `capture-bar.features.test.tsx`, `desk-tabs.features.test.tsx`; added cases in `public-actions.test.ts`, `video-steps.test.ts`, `video-listing-on.test.ts`, `letter-steps.test.ts`, `page.letter.test.tsx`, `desk-home.test.ts`, `capture.test.tsx`. Changed existing: `desk-tabs.concepts.test.tsx` now renders with both features on (it tests those pages).

## New strings (pending Shlok's approval; none is advice language)
Only accessible names of the Items nav, built from the words that remain: "Concepts and the month" (both off), "Concepts, the month and videos", "Concepts, the month and letters", and the original "Concepts, the month, videos and letters" (both on). No other visible text was added.

## Evidence (HEAD f91e77f, machine saturated by unrelated python jobs throughout)
- Unit: the first full run (`pnpm vitest run --testTimeout=60000 --maxWorkers=3`) was 479 files, 6529 tests, all passed, no timeout, nothing re-run. It started before the Items-list filter (`visible-items`) was added, so after the commit I re-ran every directory the task touches (`src/app`, `src/components/desk/private`, `src/lib`, `src/modules/showcase`, `ops`, `distribution`) on HEAD: 223 files, 2659 tests, all passed.
- On HEAD f91e77f: `pnpm tsc --noEmit` (after `next typegen`) exit 0 and `pnpm lint` exit 0 (`rtk pnpm typecheck` printed false `PageProps` errors on a worktree with no generated route types, so both ran through `pnpm` directly).
- `pnpm build` with the CI placeholder env (no `.env.local`): exit 0; `pnpm check:bundles`: "Bundle check passed: 64 routes".
- Full e2e after `pnpm supabase db reset` (local stack), final run: **528 passed, 56 skipped (the designed deploy-state skips), 1 flaky, exit 0**. It ran with a throw-away copy of the config (deleted; `playwright.config.ts` is untouched) that sets `timeout: 120000` and `expect.timeout: 20000`, plus `--retries=1`, because the machine was saturated. The one flaky test, `clocks.spec.ts:279` (ledger:anchor with the fixture anchor), failed once and passed on its retry. The videos, videos-public, letters, letters-public, cases, concepts and signout projects all ran and passed with the override on.
- Three earlier full runs with the stock config (5 s expects, no retries or two retries) each failed on load-dependent tests unrelated to this task and, because Playwright skips projects whose dependencies fail, left 120 tests not run: `public-site.spec.ts:57` (a 404 page whose heading is client-rendered; fails about 1 in 30 isolated repeats on this machine too: 29 of 30 passed in a 30-repeat run at HEAD), `desk-gate.spec.ts` twice (a stale gate panel for 5 s; a Create item that took over 30 s), `desk-a11y` concepts light, `desk-digest`, `desk-models`, `public-perf` LCP, and the first seed attempt. All were timeouts of 5 s or 30 s on a CPU-saturated machine (six 1.1 GB python processes at 12-13k CPU seconds each, unrelated to this repo). I did not verify them against a baseline build; none touches a file this task changed.
- Off-state smoke (not committed): after the e2e run left a public video and a public letter in the local database, I built the same code without `FEATURES_ON` and ran `pnpm start -p 3201` against that database. `/videos`, `/letters`, `/letters/confirm`, `/letters/leave`, the public letter and video pages and both share cards: 404. `/sitemap.xml` (19 locations) and `/feed.xml` (13 items): none names `/letters` or `/videos`. `/`, `/companies`, `/notes`, `/process`, `/about`, `/mistakes`: 200, no link to `/letters` or `/videos`, no sign-up wording. `/desk/videos` and `/desk/letters` answer the sign-in redirect to a signed-out visitor; their 404 for the admin is the layout test.
- With the override on the same code lists them: the e2e videos, videos-public, letters and letters-public projects passed in the final run.

## Concerns
1. Typed `v:` lines still file an invisible video item until Task 3 maps them to sources (plan line 133).
2. `letters:purge` and the daily stored-video purge still run while off. Both are database-only retention duties for data already stored; say if you want them silent too.
3. The Today list on the desk home can still show an already-filed video item as a plain row (its link now 404s); no such item exists in a fresh database.
4. `FEATURES_ON` must never be set on Vercel. It is ignored on preview and production, but Vercel's "development" environment is not covered; `.env.example` says so.
5. The e2e off-state spec (needs a second server on a separate build dir) is left to Task 5.
