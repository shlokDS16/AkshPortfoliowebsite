# Plan 3b Task 5 report: the full loop end to end, the switch runbook, the guide

Branch `phase-3b-case-studies`, local only, not pushed. Written 2026-10-15 by desk-backend. No production code and no SQL migration changed: this task is the fixture, the e2e project, two documents and two guide edits.

## Built
- `e2e/support/aged-case.sql` (local stack only, D43): an invented company ("Tamarind Ridge Textiles Ltd", symbol `ZTR<run id>`, made-up ISIN) and one closed idea written as the admin through the real functions (`open_idea`, a revise to 6 months, a note, the close with reason `thesis_broken`, a review with process `flawed` and tag `timing`). The owner then moves the five events back (140, 120, 100, 60, 50 India days; weekday 10:30), re-seals the whole chain and the projection, deletes and rebuilds `ledger_anchors` (guards taken off by name, put back `ENABLE ALWAYS`, asserted `tgenabled = 'A'`, then `seal_ledger_days()`), stores smooth `nse_fetch` closes and open `market_days` for every weekday of the span, runs `score_ideas()` and asserts the idea is final with no flag. A second mode (`review`) adds a second lesson dated 35 days back, to move the ledger's figures-to date under a public case. Both modes are one DO block, one transaction. The switches are not touched by it.
- `e2e/support/cases.ts`: `seedAgedCase`, `addAgedReview`, `setSwitch`, `switchesOff`. Every call starts with `requireStack()` (refuses a non-local API URL), and the SQL goes through `pnpm exec supabase db query --local -f`. A run id in the symbol means a second run on a used database makes a second company.
- `e2e/support/case-pages.ts`: what a signed-out visitor sees (new browser context, no cookies) at 375 and 1280: the case page, `/cases`, `/mistakes`, `/process`, axe WCAG 2.2 A/AA, one h1, no sideways scroll, the in-browser check on every entry, what must be absent.
- `e2e/cases.spec.ts` (7 tests, serial, project `cases`): (1) both switches off, "Draft a case study" from a real aged idea, a second look finds the draft and makes no second item, record panel shown and no facts editor, details saved, "Make ... public", the gate refuses with the `case_off` sentence (rule 10); (2) reveal on: a body without the heading is refused with "Add a 'What would prove me wrong' section as a Markdown heading." and not with `case_off`, then a body with the heading passes through `publishCheckedAction` and `publish_revision()`, the item is public with no file number; (3, 4) signed out at 375 and 1280: three sections, his sealed words, a 64-hex fingerprint, "Matches" on all four entries, no "Listed in the public file", no chart, no `%` or rupee sign, the note's text in neither page nor page data, the disclosure and "A past case, not a view on the share today.", `/cases`, `/mistakes` (flawed, timing), `/process`; (5) chart on: "The ledger has changed since this revision ...", "Refresh from the ledger", publish, the chart and its caption; (6) a second lesson moves the date: the frozen-date sentence, no Refresh button, Unpublish, Refresh, Publish, two reviews on the page, "timing, sizing" on Mistakes; (7) both switches off: a new revision is refused with `case_off`, the item stays public.
- `playwright.config.ts`: project `cases` (depends on every `public-*` project, `reduced-motion`, `desk-mobile`, `desk-desktop`), projects `cases-public-375` and `cases-public-1280` (run `public-cases.spec.ts` after the loop, while the case is public), and `signout` also waits for `cases`.
- `.github/workflows/ci.yml`: the e2e job's timeout 25 to 35 minutes (see concerns), comment updated.
- `docs/runbooks/case-study-switches.md`; `docs/guide/using-the-desk.md` (new 4.9 "Case studies"; 4.7, section 7 "What is switched off", section 8 and item 10 of section 9 brought up to date); `docs/guide/aksh-quick-guide.md` (one how-to, one "not in this version" line).

## The four things T1-T4 left
1. **Published-state tests now run in CI.** The loop publishes a real ledger case through the real gate, and leaves it public with both switches off. `public-cases.spec.ts` is also run by `cases-public-375` and `cases-public-1280` after it; its published-state tests pass there (axe on four pages, the check says "Matches"). No CI seeding step is needed: the spec seeds itself through the CLI, which the e2e job already has (`clocks.spec.ts` uses it).
2. **Draft, Refresh, and the frozen date** are covered on a real aged idea (tests 1, 5, 6).
3. **`publishCheckedAction` with a record-carrying case:** it ran for real. A body without the heading is refused with the plain sentence (recorded by the gate, shown in the decision panel); with it the case passes.
4. **Runbook** says: older passed revisions stay readable until Unpublish (with the query that lists them); turning a switch off stops new publishes and does not take pages down (with the list query); before `ledger_reveal` goes on in hosted, the SQL that finds a revision that passed under policy v1 and carries a `ledger` key; 0017 to 0019 and the merge land together because every publish is refused in between (D38), with the dry run to run first. The SQL in the runbook was run on the local database (zero rows for the v1 check and the switch check; the list queries returned the cases the reruns had made).

## Evidence
- `pnpm supabase db reset` then `pnpm supabase test db`: 29 files, 2175 tests, PASS.
- `rtk pnpm test`: 344 files, 4992 tests pass. `rtk pnpm typecheck` clean. `rtk pnpm lint` clean. `rtk pnpm build` clean (CI placeholder env). `pnpm check:bundles` passes.
- Full `pnpm e2e` after a reset (every project, including both sizes of `public-cases`, `desk-ledger`, `public-a11y`, `desk-a11y`, the 7 new tests and `cases-public-*`): 312 passed, 19 skipped, 0 failed, 14.7 minutes including the build. The skips are by design: the published half of `public-cases` inside the `public-*` projects (nothing is public yet when they run), the deploy-state test inside `cases-public-*` (the case is public), the existing phone-only and performance tests at other sizes.
- The new spec also passed on a database already used by an earlier run (three cases coexisting), so a rerun without a reset works.
- TDD, stated honestly: no production code changed. The spec was written first and run against the real app; it failed four times on locators and one count (his words appear both as quote and in the sealed text, the chart's `figure` clashes with the entry `figure`, rerun cases share a title, the checklist is shown only when there is a revision to publish), each fixed in the test, none in the app.

## New strings pending Shlok's approval
No UI string was added. The wording added is in documents: the guide section 4.9 and the quick-guide how-to (plain words, quoting the code's own sentences), and the runbook. The test-only sealed words (the invented company's idea) are checked clean by the wording lint and appear only on the local stack. None of the added text uses a banned word.

## Concerns
1. **CI time.** The whole suite took 14.7 minutes locally with a warm machine. CI is slower, and the old limit was 25, so I raised the e2e job to 35. Revert if you prefer to see it fail first.
2. **The loop rewrites the local chain's fingerprints** (D43). A rerun works, but run `pnpm supabase db reset` before the next full run, as the plan says. The SQL must never go near the hosted project; the TypeScript refuses without the local stack, the SQL file itself does not know where it runs.
3. **`defenso guard_code` was not run** (no such tool in this session). The files touch a database and spawn a process, but only for the local stack; the Task 6 review stands in.
4. **The checklist's switch line shows only when a revision is waiting to be published**, so a public case with nothing pending shows no "Case studies from the ledger" line. The runbook and guide say "the publish checklist" and the idea page "(now on|off)", which is accurate; say if you want the line always shown.
5. **Existing wording, not mine:** the Mistakes empty state ("When one of Aksh's tests proves him wrong ...") contains the banned word "proves". It predates 3b and I left it.

## Fix wave (final review, 2026-10-15)

Input: `.superpowers/sdd/2026-10-15-phase-3b-ledger/final-review.md`. Branch `phase-3b-case-studies`, from 944e4ad. Nothing pushed. SQL migrations untouched (only the e2e fixture SQL changed), so no pgTAP run; `db reset` was run before each e2e pass.

| Finding | Result | Commit |
|---|---|---|
| F1 High, rule 10.7 | Done. New `"10"` rule; `LEDGER_FIGURE` pattern plus the existing price pattern, tested on every sentence of a ledger case whatever the lag, never allowanceable; the hint (`words.ts`) uses the same two patterns. Tests: "down 18% since I opened it", "trades at Rs 450", "₹450", "up 3x", "a 40% gain" fail; "Revenue grew 20% last year", "Rs 500 crore" and others pass; no change for a non-ledger case study; an allowance does not clear it. | 3ccd07f |
| F2 Medium, heading | Done as ruled: structure rule skipped for a ledger case only; `CASE_STUDY_BODY_TEMPLATE` removed, the draft body is empty, editor help changed, e2e test 2 now publishes a plain paragraph and the page shows no "What would prove me wrong"; headings-only body still hidden (safety net); guide and quick guide updated. | 3ccd07f, 25a3b9f, 82ddca6, f869f34 |
| F3 Medium, fixture guard | Done: both guards are the first statements; vitest `src/test/e2e-fixture-guard.test.ts` and an e2e step that runs the raw file and expects "placeholders not filled" (the helper now also reads the CLI's stdout, where it reports the error: f1ef77d). Runbook paragraph added. | 82ddca6, f1ef77d, f869f34 |
| F4 Medium, "proves" | Done: new empty state (`mistakes-empty.tsx`), shape "Case / His call / His words", added to the BANNED scan as a fifth page, pages test, guide quote, `e2e/public-site.spec.ts` assertion. | b0fc816, f869f34, 02e2119 |
| F5 Low, Figures to | Done: read-only in the form with the sentence; the Save details action keeps the stored date (`updateItemDetails`; Refresh from the ledger still moves it through `updateItemMeta`). My first version put the guard in `updateItemMeta` and broke Refresh (caught by the cases tests); fixed in 532914d. | 3ae98f6, 532914d |
| F6 Low, isolation | Done: test fails on `case-record.ts` first (seen), comment reworded; no other file in the reach names a ledger table. | 3560b99 |
| F7 Low, D37 | Done: spec s34.1 note; runbook line and the "After the merge" list; dead `SiteCounts.mistakes` removed. The optional `notFound()` on an unavailable snapshot is not taken (debt). | f869f34, 7863463, 3c1ee8b |
| F8 Low, alias hops | Done: `MAX_ALIAS_HOPS = 1`; repo test with an A to B to C chain files under B (seen failing). | 7863463 |
| F9 Low, unreadable record | Done: `fileProblems` says the one sentence for a ledger case whose record does not parse. | d9b3e42 |
| F10 Low, "(now off)" | Done: `reveal: boolean or null`; null reads "(could not be read just now)". | 0ca342e, 3c1ee8b |
| F11 Low, parity | Done: `words.parity.test.ts`, 27 sentences, hint and gate agree for rules 1, 2 and 10, one at a time and together. | 3ccd07f |
| F12 Low, ordering | Done: `cases` depends on `anon`; `playwright test --list --project cases` shows 0 anon tests before and 35 after. | 6590249 |
| F13 Low, line endings | Done: `.gitattributes` has `*.tsx`, `*.json`, `*.mjs`, `*.css` as LF; the nine tsx files renormalised (nothing else touched). `*.md` was left out on purpose (see concerns). | 621283e |
| F14 | Debt, as ruled (no index now). | f869f34 |
| F15 | Debt, string pending Shlok. | f869f34 |

Debt added: a new "2026-10-15 (Plan 3b fix wave ...)" section in `docs/specs/technical-debt.md` (append only): F14, F15, the F13 remainder, the F7 optional `notFound()`, a note on how widely the rule 10.7 patterns over-match, and the T1 review's deferred M3, M4, M5, M6.

New strings, pending Shlok's approval:
- F1: "A case study from the ledger prints no price or return (publishing rule 10.7)." and the two patterns in `lexicon.ts` (`LEDGER_FIGURE`).
- F2: editor help "Your words, shown under "Looking back" on the page. The entries from the ledger are not edited here."; guide step 5 (the body is optional; no price or return in it).
- F4: empty state "Closed cases in which Aksh judged his own process flawed, or named a kind of mistake, are listed here with his own words and a link to the case." with shape "Case", "His call", "His words".
- F5: "Set from the ledger. Refresh from the ledger moves it."
- F9: "The ledger record in this revision cannot be read. Refresh it from the ledger."
- F10: "(could not be read just now)".
- Spec s34 (new) and the runbook wording for the Mistakes rail and page.

Evidence (local stack, `db reset` first):
- `rtk pnpm test`: 348 files, 5014 tests passed. `rtk pnpm typecheck` and `rtk pnpm lint`: clean. `pnpm build` (with the local-stack env) and `pnpm check:bundles`: passed.
- `pnpm e2e`, full: 300 passed, 17 skipped; in that run the new fixture-refusal step failed, which stopped `cases`, `cases-public-*` and `signout` from starting. After the fix (f1ef77d): `cases` 8 of 8 passed, then `cases-public-375`, `cases-public-1280` and `signout` 5 passed (2 skipped: the "nothing public yet" test, by design), run with `--no-deps` on the same database. `public-a11y`, `public-cases`, `desk-ledger` and `desk-a11y` passed at both sizes in the full run.
- Two earlier full runs each had one failure, both mine or a flake: the old Mistakes text in `public-site.spec.ts` (fixed in 02e2119), and `public-site.spec.ts:20` (Files search) once at 1280 px, a fill-before-hydration race in a test this wave did not touch; it passed on the rerun.

Concerns:
1. `*.md` is not under `eol=lf`: about 22 markdown files (the guides, the debt file, the runbooks) are CRLF in the index, and adding the rule would rewrite them whole on their next edit. Left for a between-plans commit (debt line). Seven older `.tsx` files stay CRLF in the index for the same reason.
2. The rule 10.7 patterns over-match on purpose ("revenue is up 20%" is refused in a ledger case, with no allowance). Aksh may meet it; the debt file says how to narrow it.
3. `defenso guard_code` was not run (no such tool in this session). The research action change only drops a field from a request.
4. The local Supabase stack is shared by the worktrees; `db reset` and the e2e run need the stack to themselves.
