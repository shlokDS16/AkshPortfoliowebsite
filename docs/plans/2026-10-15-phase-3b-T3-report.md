# Plan 3b Task 3 report: the public pages (case study, /cases, Mistakes, "How this record is kept")

Branch `phase-3b-case-studies`, local only, not pushed. Written 2026-10-15 by desk-ui. No SQL, no desk (private) file changed.

## Built
- `src/modules/showcase/case-study.ts`: `ledgerCases`, `buildCaseStudyView`, `listCaseSummaries`, `buildMistakes`, `hasLedgerCases`, `caseHref`; types in `types.ts`; exported from `index.ts`. Reads the item's CURRENT revision only (`item.structured.ledger`; the `revisions` list is never used for content). Other `structured` keys are ignored. An item shows only if: kind `case_study`, record parses whole (`parseCaseRecord`), one open, a close and a review exist, `dataAsOf` equals `figures_to`, and `figures_to` is 30 days old (re-checked in code). Otherwise it is not shown (no partial page).
- `site.ts`: `files()` excludes any item carrying a ledger record, so `servedFiles`, the register, the home counts and the chrome do not change.
- `src/components/desk/case/`: `case-page.tsx`, `case-entry.tsx` (his words / machine lines), `rebased-chart.tsx` + `chart-geometry.ts`, `how-to-check.tsx`, `fingerprint-check.tsx` (the only `"use client"` file), `record-keeping.tsx`, `case-list.tsx`, `mistakes-list.tsx`.
- Routes: `/cases` (404 while none public), `/cases/[slug]` (`revalidate = 3600`, `generateStaticParams` returns `[]`, metadata from title and standfirst), `/mistakes` filled (empty state kept until one qualifies), `/process` gets the section only while a ledger case is public.
- Frame: `PublicFrame` takes `back`; `RailCurrent` gains `"cases"` (no rail item or tab highlighted); the rail shows no number beside Mistakes.
- Design pick recorded in `docs/design/decisions.md` ("delegated by Shlok 2026-10-15").

## Evidence
- `rtk pnpm test`: 336 files, 4921 tests pass. `rtk pnpm typecheck` clean. `rtk pnpm lint` clean. `rtk pnpm build` clean (CI placeholder env); `/cases` and `/cases/[slug]` in the route table.
- New tests: view builder (19), components (30: structure, no-result scan, token-only, no motion, check button with Web Crypto present, missing and throwing), chart geometry, frame, page-level (`/cases` 404 while empty, `/process` section absent, Mistakes selection), isolation (own files name no ledger table or admin function; nothing reachable is `ledger`, `cases`, `valuation` or a private component; the only client file is the check button; both mutations were seen to fail).
- E2E `e2e/public-cases.spec.ts` (public-375, public-1280): with a fixture ledger case public in the local database, `/cases`, the case page, `/process` and `/mistakes` pass axe WCAG 2.2 A/AA, one h1, no horizontal scroll, and the in-browser check says "Matches" (public-375 and public-1280, plus public-a11y on 375 and 1280-dark: 25 passed). With the fixture removed (the deploy state), `/cases` and any `/cases/x` return 404, `/process` has no record section, Mistakes shows its empty state (4 passed). Checked also at 375 dark and 1280 with a screenshot pass.
- The fixture was inserted as owner SQL on the LOCAL stack (guard trigger disabled for the insert, gate row added) and removed again; the local database holds no case study now. The published-state tests skip when nothing is public, so the committed spec only exercises that half once Task 5 publishes a real case through the gate. I did not add a cache bust for it: the snapshot is cached for an hour and only the gate's publish busts it.

## New strings pending Shlok's approval
Spec s33.5-s33.7 strings are used exactly. Added by me:
- `/cases` heading "Closed cases"; intro "Ideas Aksh has closed and written up. Each shows what he expected, what happened and what he learned, in the words he sealed at the time."; metadata description "Ideas Aksh has closed and written up: what he expected, what happened and what he learned."
- Tag "CLOSED CASE · R{n}"; "What this teaches" (as on files); list meta "Closed {Mon YYYY}".
- Entry labels in How to check: "Opening entry", "Change of period", "Closing entry", "Review".
- Chart key: "{company}", "Nifty 50"; baseline label "100".
- Mistakes: intro "Closed cases in which Aksh judged his own process flawed, or named a kind of mistake. His judgement lists a case here, not how the share did."; metadata description "Cases in which Aksh judged his own process flawed, or named a kind of mistake."; the Mistakes page keeps the old empty-state text.
- `/process` link "Read the closed cases"; heading "How this record is kept" (spec).
- Fallback lead "Revised on {date}." when a revise entry has no readable period.
- Fixed "Looking back" heading; "Fingerprint before it", "Sealed text", "Its fingerprint" labels in the check block; the button status line is the spec's.
None uses a banned word.

## Concerns for the controller
1. **Structure lint vs "Looking back".** Carried from T2: the lint still wants a "What would prove me wrong" heading in a case study's body; a ledger case with a plain "Looking back" body fails the app lint (not the gate). Exempt ledger cases from that check or he must write the heading.
2. **Rail number removed.** The Mistakes rail count is gone (and `chrome.test.tsx` changed to match); `SiteCounts.mistakes` still exists at 0. Overturn if you want the number.
3. **No phone section index on the case page** (it would be a second client component). The page is one long read with anchors only through the browser.
4. **Published-state e2e is skip-aware**, so Task 5's real-gate case must be published before `public-cases` proves anything in CI.
5. **"Last reviewed" on the disclosure** is the current revision's date (like notes); a refresh moves it.
