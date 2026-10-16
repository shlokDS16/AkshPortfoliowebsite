# Phase 5b Task 9a report: video loop end to end, and the guide

Finished 2026-10-16 by desk-backend on branch `phase-5b-videos`, from checkpoint `3fa7555` (a laptop restart cut the first pass off). Local only: nothing pushed, no real
YouTube call (the e2e server runs `DISTRIBUTION_ADAPTER=fixture`; no key is set). The review and fix wave (9b) are not done here.

## What I did
- Merged `phase-5-distribution` (squash helpers, whitespace-free `public-print.spec.ts`, phone-overflow fix). No conflict.
- Checked the checkpoint: its work was complete and unverified. I changed one thing: the video block of `e2e/public-print.spec.ts` compared raw PDF text, which is the exact
  failure `e2e/support/squash.ts` exists for (Linux fonts put a space inside a word). It now uses `containsSquashed` for "Transcript", the machine label, "Chapters" and the two
  strings that must not print ("Play video", "loads YouTube").
- `createItemAction` refusing `kind=video` (checkpoint code and test): seen failing first. I removed the guard line, the new test failed on the redirect assertion, I restored it,
  15 of 15 pass.

## Checkpoint content now verified (paths under the worktree)
- `e2e/videos.spec.ts` (project `videos`), `e2e/support/video-pages.ts`, `e2e/public-videos.spec.ts`, `e2e/support/derived.ts` (`videosPublic`, `pages.videos`),
  `e2e/support/stack.ts` (`DISTRIBUTION_ADAPTER=fixture`), `e2e/public-distribution.spec.ts`, `e2e/public-print.spec.ts`, `e2e/clocks.spec.ts` (the `videos:check` / `videos:fetch` steps),
  `playwright.config.ts` (`videos`, `videos-public-375`, `videos-public-1280`, `signout` waits for `videos`), `.github/workflows/ci.yml` (comment only).
- Guide: `docs/guide/using-the-desk.md` section 4.12 (steps, what the gate checks, what it refuses and why, messages, key unset until Shlok sets it, open item 12) and
  `docs/guide/aksh-quick-guide.md` "Add a video".
- The loop: a `v:` capture, the faked YouTube, a caption file dropped as Aksh drops it, chapters from the description, a spoken "buy" refused under rule 1 on the transcript (an empty
  reason stores nothing), cleared only by an allowance with a reason, a clean caption file passes with no allowance, signed-out visitor at 375 and 1280 (axe, one h1, no sideways scroll,
  no request to `youtube-nocookie.com` before the press and exactly one after, `i.ytimg.com` aborted), JSON-LD `VideoObject` with `Clip` parts, the share card (PNG, 404 for an unknown slug),
  `/feed.xml`, `/sitemap.xml`, then Unpublish removes the page, card, feed entry and sitemap line, and Publish lists it again. The video stays public so `videos-public-*` check the
  published half. File numbers are asserted by pattern (`File \d{2,}`), never by value; the YouTube id is new each run.

## Evidence (after `pnpm supabase db reset`)
- `pnpm supabase test db`: 32 files, 2430 tests, PASS.
- `rtk pnpm test`: 432 files, 5897 tests, all passed (58 s); no file needed a rerun.
- `pnpm typecheck`: no errors. `rtk pnpm lint`: clean.
- `pnpm build` (with the CI placeholder env; this worktree has no `.env.local`, so a bare build stops on the env check, as it does in CI without those lines) and `pnpm check:bundles`: passed, 55 routes.
- Full `pnpm e2e` after a reset: 511 tests, 459 passed, 52 skipped (the deploy-state and listed-state halves that skip by project, as designed), 0 failed, 16.9 minutes (about 17 min
  of the CI e2e job's 35-minute limit, with install, Supabase start and the build still to add; I did not raise it). The 8 `videos` tests and both `videos-public-*` projects passed,
  including the PDF of a video page.

## New strings (pending Shlok's approval)
None added in code. Guide text only: in section 4.12 and the quick guide, the quoted refused phrase "you should buy this" (it quotes what the desk refuses; the word "buy" appears nowhere else).
Guide headings: "4.12 Videos", "Add a video".

## Notes
- The e2e `$TEMP`-style log from an earlier run can sit in the same temp name; I read the log only after my own run's `done` line.
- Studio menu names in the guide are still unconfirmed against real Studio (guide open item 12).

## Fix wave (review of Part 5b, 2026-10-16)
Source: `.superpowers/sdd/2026-10-16-phase-5b-ledger/review.md`. Every FIX-NOW finding applied in severity order, proving test first.

| Finding | Fix | Commit |
|---|---|---|
| 1 MEDIUM e2e reached i.ytimg.com | `e2e/support/outbound.ts` (`guardOutbound`, `installOutboundGuard`): every context of the nine `public-*` specs and `videos.spec.ts` records and answers any host outside the machine; `afterEach` fails on anything but the youtube-nocookie frame; `video-pages.ts` and `public-videos.spec.ts` assert an empty list before the press and exactly one frame request after. A test in `public-site.spec.ts` proves the guard bites. | ab321be |
| 2 MEDIUM quadratic caption regexes | `SRT_START` has no leading `\s*` (caller tests `trimStart().slice(0, 256)`), `TAG` uses `[^<>]*`; 1 MB of spaces refused, 1 MB of `<a` parsed, each under 500 ms | f04c267 |
| 3 MEDIUM Q51 30-day retention | 0022 edited in place: `purge_stale_video_data()` (service_role only), gone video clears every YouTube column; `FetchStore.purgeStale`, `checkVideos` purges first (also while off), heartbeat "purged n"; gate 12.1 (0023) no longer adds "not from your channel" to a gone video (its channel is now null). pgTAP 0022 (70 tests, +5) and 0002 | ef33768 |
| 4 LOW Q49 docs | v1.2 addendum "Reading of 12.2", spec amendment (s), Q49 answer appended (rule 1 only) | da1328e |
| 5 LOW Q48 cooldown | `SourceRef.fetchedAt`, `fetchVideoNow` returns `FETCHED_RECENTLY` inside 60 s, action maps it to notice `video-fetch-recent` | 4f5b255 |
| 6 LOW Q50 cap | `RESPONSE_CAP_BYTES` 1 MB; 600 KB body of 50 reads, 1.1 MB refused | 7b48d2a |
| 7 LOW status order | `videoStatus` checks listed/gone before off | 3dd31d9 |
| 8 LOW surrogate cut | `pieces` steps back one unit before a high surrogate | f04c267 |
| 9 LOW anon grants doc | spec amendment (t) | da1328e |
| 11 (was DEBT) thumbnail, Shlok's ruling | no img, no request to Google or YouTube before the press: local placeholder (title, length, Play); the frame loads on the press only; `thumbnail` dropped from `VideoView`; spec amendment (u); guide lines updated | ab321be, final docs commit |
| 10 DEBT `v:` two writes | line appended to `docs/specs/technical-debt.md`, new "2026-10-16 (Phase 5b fix wave)" section | da1328e |

Also appended: Q48, Q50, Q51 answers and Q49 in `docs/project-memory/unanswered-questions.md`; spec amendment (v) for the purge, cooldown and cap.

### New strings (pending Shlok's approval)
- `fetch_problem` after a purge: "YouTube data older than 30 days was deleted. It is read again when YouTube answers."
- Heartbeat word: "purged {n}" (and "videos off, purged {n}").
- Notice `video-fetch-recent`: "YouTube was asked less than a minute ago. The data below is its answer."
- Heartbeat detail `fetched less than a minute ago` (shown nowhere; the action turns it into the notice).
- The video placeholder shows the page's own title and length; no new copy.
No banned word added.

### Debt
- `v:` capture two writes (finding 10), in `docs/specs/technical-debt.md`.
- `public-perf.spec.ts` now runs behind the context route; it passed, but a timing budget there would see the route's small overhead.

### Evidence (after `pnpm supabase db reset`)
- `pnpm supabase test db`: 32 files, 2435 tests, PASS.
- `rtk pnpm test`: 432 files, 5911 tests, all passed; no file needed a rerun.
- `pnpm typecheck`, `rtk pnpm lint`: clean. `pnpm build` (CI placeholder env) and `pnpm check:bundles`: passed, 55 routes.
- Full `pnpm e2e` after a reset: 515 tests, 463 passed, 52 skipped (the deploy-state and listed-state halves, by project), 0 failed, 17.4 min.
- `defenso guard_code` was not available as a tool in this run; the changed SQL is definer-hygiene-identical to `record_video_fetch` (empty search_path, revoked from every API role, service_role only, pinned in 0002).
- Early in the run I ended every `node.exe` on the machine once by mistake while stopping a hung vitest; if another session lost a dev server then, that was me.
