# Phase 3B Public case studies (closed ideas, sealed words, fingerprints, behind two owner switches) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** written 2026-10-15 by desk-architect on Shlok's delegation (he reviews and merges this evening). Branch `phase-3b-case-studies`, stacked on `phase-2.7-valuation` (PR #8, not merged; its migration is 0017), worktree `.claude/worktrees/aksh-research-desk-3b`. Not pushed. **Run "Before Task 1" first.** Code is given only where a decision is load-bearing; everything else names the interface, the tests and the commands.

**Goal:** a closed idea from the private ledger, at least 30 days after the latest entry it shows, can be published as a case study through `publish_revision()`: what Aksh expected, what happened and what he learned, in his sealed words, each entry with its fingerprint and a check a reader can run in the browser; plus "How this record is kept" on `/process` and a Mistakes page filled from published lessons. Everything public sits behind two owner switches in `private.settings` (`ledger_reveal`, `ledger_chart`), both OFF by default, so merging this changes nothing a visitor can see.

**Architecture:** one SQL builder (`private.case_study_record`) turns a closed idea's sealed events, its final score and the sealed-day table into a versioned JSON "ledger record"; the desk copies it verbatim into a `case_study` revision (`structured.ledger`); the gate (publishing rule 10) rebuilds it at decision time and refuses anything but an exact match, so neither the app nor a stolen session can add, drop or edit a word or a number. The public side reads only the cached public snapshot: a pure view builder in `src/modules/showcase/case-study.ts`, server-rendered pages under `/cases`, an SVG chart with no library, and one small client component that recomputes a SHA-256 with Web Crypto. A small private module `src/modules/cases/` drafts and refreshes case studies. No LLM, no OCR, no new dependency, no new cron work.

**Spec:** `docs/specs/2026-10-13-phase-3-track-record-design.md` s11 and **s33** (the design this plan builds; s33 overrides s2, s11 and the 3b exit criterion). **Rules:** `docs/compliance/publishing-rules-v1.1-addendum.md` (publishing rule 10). **ADR:** ADR-005 and its 2026-10-14 addendum (what may be said about fingerprints); ADR-003 (gate confinement). No ADR changes (D26).

**Scope:** progress item 3.5 (the public half). Out: the public fingerprint copy's switch-on (Q26, Q35; already built in 3a), a second witness (ADR-005 s7), client logins (3.6), anything that prints a result.

## Decisions taken on Shlok's behalf (cost if wrong)
| # | Decision | Rejected | Cost if wrong |
|---|---|---|---|
| D26 | **Public copy OFF:** 3b shows each entry's fingerprint and an in-browser recompute from the sealed text; "Listed in the public file on {date}" renders only for entries whose sealed day the gate confirms was published, so it appears by itself once Shlok switches the copy on. 3b builds nothing for the gist (already built behind its env switch) and no second witness | (a) build or switch on the gist in 3b; (b) hide fingerprints until the copy is on | If Shlok wants outside dating on day one, he answers Q26 and Q35 and sets two env vars; entries before that day can only ever be dated to it (true already, ADR-005 addendum) |
| D27 | **Switch location:** `private.settings` rows `ledger_reveal`, `ledger_chart`, on only for the exact value `on`; read only inside SQL; flipped by the database owner in the SQL editor (runbook) | an env var passed by the app (a caller's word to the gate); a desk toggle (Aksh would flip a legal switch) | Shlok needs the SQL editor to flip them: two lines in the runbook |
| D28 | **Off stops publishing, does not hide.** A switch turned off refuses every new publish and revision of a ledger case study; pages already public come down only through the existing Unpublish (runbook lists them) | a read-side kill switch (changes `private.is_public_item` and every public view, or adds an anon function over ledger state, which spec s3.4 forbids) | Withdrawing many cases takes one click each; with both switches off from day one there is nothing to withdraw |
| D29 | **The record is SQL's; the gate requires an exact match** (jsonb equality with a fresh build) | the gate checks each event's hash only (lets the app choose which entries to show); a TypeScript builder | Any ledger change (a new lesson, a day published, a switch flipped) forces "Refresh from the ledger" before the next publish |
| D30 | **Fixed revealed set:** open, every revise, close, every review; never note, upsize, downsize | Aksh picks entries | His mid-course notes cannot be shown; a choice later is record version 2 |
| D31 | **No case while any idea on the company is open** (rule 10.2), beyond rule 4's 30 days | rule 4 alone | A past case waits while he holds a current view on the same company |
| D32 | **Chart only from closes the desk fetched itself,** no flag at all (`hand_price`, `attested`, `jump`, `isin_changed`, pending, stale), so the factor is always 1 | uploaded or typed closes; hand-entered splits | If NSE refuses Vercel (Q29) and every close is uploaded, no chart is ever possible; an idea that spans a split never gets one |
| D33 | **Chart values are never printed** (labelled 100 baseline only; text alternative describes the drawing, not the result); the addendum says the values are in the page data | an accessible data table (prints the return); no chart at all | An accessibility reviewer may mark R2 row 7 down for that one figure; if legal reads the chart itself as a performance claim, `ledger_chart` simply stays off |
| D34 | **No machine verdict in public** ("ended ahead/behind", grid labels) | a verdict line | The reader infers the outcome from the chart (if on) and his words |
| D35 | **Mistakes = his own review** (process flawed, or a mistake tag other than `luck`/`none`); no counts | the machine's outcome; every case | A case he judged sound that went badly is on `/cases` but not on Mistakes |
| D36 | **Routes `/cases`, `/cases/[slug]`;** ledger cases are not "files": excluded from the register and home counts, no file number | under `/companies/[slug]` (one served file per company); rows in the register | Less discoverable (no nav tab; linked from `/process` and `/mistakes`); file numbers stay contiguous |
| D37 | **Zero public change at deploy:** `/cases` 404s and the `/process` section is absent until one ledger case is public | always show the process section | The process explanation waits for the first case |
| D38 | **Policy version `sebi-unreg-2026-07-v1.1`, bumped in Task 1 together with the checks it names** (migration 0019), never before them | a separate earlier bump-only migration (the version would claim checks that do not run) | Between Shlok's `db push` and the merge, the live app sends the old version and every publish is refused ("This database accepts only policy version ...", fail closed); push and merge back to back |
| D39 | **Public file URL is a code constant** (`PUBLIC_FINGERPRINT_FILE = null`), set in a one-line PR with Q26 | a `NEXT_PUBLIC_` env var | Switching the copy on needs that PR too |
| D40 | **New private module `src/modules/cases/`** for draft and refresh; the record's type, parser and public labels in `src/modules/casefile/case-record.ts` (public-safe) | put drafting in `ledger` | One more module (small, with its graph test) |
| D41 | **A ledger case is body + record only;** the facts editor is hidden for it | facts and exhibits on case pages | No filed facts on a case page |
| D42 | **Lint walks `ledger.events[].words`,** skips `canonical`, `hash`, `prev_hash` and the record's fixed keys | lint everything (each sealed sentence found twice; an allowance keyed to the words would not match the JSON-escaped copy) | Identifiers inside the sealed text (company, symbol, ISIN) are not linted as prose; they are catalog data shown elsewhere |
| D43 | **E2E time travel on the local stack only:** a seeded idea through the real functions, then the owner shifts its times and re-seals the whole chain and the sealed days, in a Playwright project that runs after every other ledger and public project; never hosted | a test clock in SQL (a settings row could move "today" on hosted and lift the 30-day lag) | The local chain's fingerprints are all rewritten at the end of an e2e run (harmless; a reset follows next run) |
| D44 | **A lint hint while writing** ledger words (non-blocking, spec s14) | none (spec s14 deferred it to 3b) | None; the first thing to cut if the week is tight |

## Global constraints
- **Nothing public unless both the switch and the gate say so.** `anon` gets no new grant, policy, view or function. No change to `private.is_public_item`, the public views, RLS, `/api/health` or the grants on `private.settings`. The only publish path stays `publish_revision()` (service role, ADR-003).
- **His words and the machine never share a field.** The record's `words` are his, copied from the sealed text; dates, days, hashes and chart points are the machine's and are rendered in a visibly different face. No LLM anywhere.
- **No result in public:** no return, excess, rupee price, rebased value as text, verdict, count, rate or average (rule 10.7). A test renders every public case view model to text and asserts it (Task 3).
- **Rule-9 boundary:** `src/app/(public)/**`, `src/modules/showcase/**` and `src/components/desk/case/**` never import `@/modules/ledger`, `@/modules/cases`, `@/modules/valuation` or `src/components/desk/private/**`, and never name `idea_events`, `idea_scores`, `prices_daily`, `market_days`, `ledger_anchors`, `corporate_actions`, `ledger_uploads`, `case_study_record` or `case_study_switches` (`isolation.test.ts`, Task 3).
- **Wording:** never "proof", "proves", "verified", "cannot be altered", "tamper-proof", "buy", "sell", "hit"; plain words; every new string pending Shlok's approval and listed in the task report.
- Migrations local only; never edit one after it reaches hosted; `pnpm db:types` after Task 1. Supabase CLI via `pnpm supabase`. Files under 300 lines. TDD: the failing test is seen to fail first. Never two implementers at once. `defenso guard_code` on Tasks 1 and 2 if its server answers; otherwise the opus reviews stand in, as in 3a and 2.7.
- No new runtime or dev dependency (the chart is hand-written SVG; SHA-256 is Web Crypto in the browser and `node:crypto` in tests).

## Before Task 1 (controller)
- `graph-memory brief` in the worktree. If PR #8 has merged, rebase `phase-3b-case-studies` onto `main`; otherwise stay stacked and rebase after it merges (no 3b migration may reach hosted before 0017).
- `ls supabase/migrations`: 0017 is the last; 0018 and 0019 are free. If not, renumber (files, test file, every mention here and in spec s33).
- Confirm two facts this plan relies on (both checked 2026-10-15): `private.apply_admin_email()` acts only on `key = 'admin_email'` (`20261005000001_core.sql` line 99), so new settings keys are inert; 12 pgTAP files pin the literal `'sebi-unreg-2026-07'` (`grep -rln "sebi-unreg-2026-07" supabase/tests`), all of which Task 1 updates.
- Hand each implementer: this plan's task, spec s33, the addendum, and the files named in its task. Nothing else.

## Model assignment and sizing
| Task | Agent (model) | Review | Tokens (rough) |
|---|---|---|---|
| 1 Policy v1.1 in the database (0018, 0019, bump) | desk-backend (sonnet) | **opus** (grants, definer functions, the gate) | 420k build + 150k review = 570k |
| 2 Record parser, lint, carry-over, `cases` module | desk-backend (sonnet) | folded into Task 6 | 300k |
| 3 Public pages and components | desk-ui (model: sonnet) | folded into Task 6 | 420k |
| 4 Desk screens and the writing hint | desk-ui (model: sonnet) | folded into Task 6 | 320k |
| 5 E2E full loop, runbook, guide | desk-backend (sonnet) | folded into Task 6 | 280k |
| 6 Whole-branch review, one fix wave, close-out | **opus** review; desk-backend (sonnet) fix wave | - | 220k + 300k = 520k |
| **Total** | | | **2.41M; with a 20% margin about 2.9M** |

Pacing: Tasks 1-2 (about 0.87M) leave a gated, tested back end and change nothing visible; Tasks 3-6 add the pages and close out. If the week is tight: cut D44 (the hint, about 40k) and the `/cases` index (about 40k), in that order; never cut the Task 1 opus review or Task 6.

---

### Task 1: Policy v1.1 in the database: the ledger record, the switches, rule 10 in the gate (migrations 0018, 0019)

Build: `desk-backend` (sonnet). Review: **opus**. Size: 570k.

The version bump comes with the checks it names (D38); the addendum is already committed.

**Files:** Create `supabase/migrations/20261015000018_case_record.sql` (switch helper, builder, the two admin doors, `private.case_gate_failures`), `supabase/migrations/20261015000019_case_gate.sql` (`publish_revision` restated whole from `20261013000014_ledger_gate.sql`, plus one call and the file-number change), `supabase/tests/0018_case_studies.test.sql`. Modify `src/modules/compliance/policy.ts` (`POLICY_VERSION = "sebi-unreg-2026-07-v1.1"`), `src/modules/compliance/rules.ts` (`RULE_TITLES["10"] = "Rule 10: case studies from the ledger"`), `supabase/tests/0002_function_privileges.test.sql` (allowlist `case_study_record`, `case_study_switches` for `authenticated`), the 12 pgTAP files that pin the old version string (replace the literal; keep any assertion that an OTHER version is refused), `src/lib/supabase/database.types.ts` (`pnpm db:types`).

**Changes:** spec s33.2 and s33.3 exactly. Load-bearing points:
- `private.case_switch(p_key)` is `select coalesce((select s.value = 'on' from private.settings s where s.key = p_key), false)`. Nothing else reads the two keys.
- The builder reads the sealed events (as the 0014 gate does: company, direction and void from the sealed text, never from `ideas`), `idea_scores` for `entry_date`, `mark_date` as `exit_date`, `holding_days`, `is_final`, `flags`, `entry_source`, `mark_source`; `prices_daily` rows with `source = 'nse_fetch'` only for chart points; `ledger_anchors` for `listed_on` (`published_at is not null` and the stored `line`'s `hashes` array contains the entry's hash). Rounding `round(x, 2)` on numeric; keys and order exactly as s33.2 (`jsonb_build_object`). It raises `case:not_closed`, `case:void`, `case:no_review`, `case:exit_pending` (SQLSTATE `P0001`, message = the code).
- `private.case_gate_failures(p_item_id uuid, p_kind text, p_company_id uuid, p_data_as_of date, p_structured jsonb) returns jsonb` returns `'[]'` when `p_structured` has no `ledger` key; otherwise the rule-10 failures of s33.3 in this order: `case_kind`, `case_off`, then (inside its own `begin ... exception` block) builder errors mapped to `case_not_ready` (codes `case:*`) or `ledger_check_failed` (anything else), `case_record`, `case_company` (the item's company equals the record's `company_id` or is the target of its alias, the rule-4 alias logic of 0014), `case_figures_to`, `case_open_idea` (sealed events: any idea on the company or its aliased stubs with an `open` and no `close` or `void`), `case_duplicate` (another item whose current revision's `structured->'ledger'->>'idea'` is the same and whose status is `published`).
- In 0019, inside the existing ledger block (after the chain lock and the ledger check, so a failed check already refuses):

```sql
-- Rule 10 (publishing rules v1.1 addendum): a ledger record must be exactly what the ledger builds now.
v_failures := v_failures || private.case_gate_failures(v_item.id, v_item.kind, v_item.company_id, v_item.data_as_of, v_rev.structured);
```
  and the file number is assigned only `when v_item.kind = 'thesis' or (v_item.kind = 'case_study' and not (v_rev.structured ? 'ledger'))`. Use the variable names of the 0014 body; restate the revoke and the service-role-only grant. `c_policy := 'sebi-unreg-2026-07-v1.1'`.
- Admin doors: `public.case_study_record(p_idea_id)` and `public.case_study_switches()`, `security definer set search_path = ''`, `private.is_admin()` check first (error `forbidden`), revoke from `public, anon, service_role`, grant execute to `authenticated` only.
- If 0018 passes 300 lines, split the chart into `private.case_chart(p_idea_id)` in the same file and say so; 0019 is the restated body and may reach about 340 lines like 0014.

**Tests first (pgTAP, `0018_case_studies.test.sql`; reuse 0014's `pg_temp.back` and `pg_temp.reseal` helpers by copying them):**
- Switches: no row, `'ON'`, `'yes'` are off; `'on'` is on; inserting the keys leaves `admin_email` behaviour unchanged; `anon`, `authenticated`, `service_role` cannot select `private.settings`.
- Builder: an idea with open, revise, note, upsize, close and two reviews yields exactly open, revise, close, review, review in `seq` order, each `canonical`, `hash`, `prev_hash`, `words`, `stance` equal to the stored row; `process` and `tags` from the later review; raises for an open idea, a void idea, a closed idea with no review, a score not final. Chart: null with `ledger_chart` off; with it on: first point `(entry_date, 100.00, 100.00)`, last point the exit date, one point per ISO week, a week whose only close is `manual` or `nse_upload` contributes no point, each flag in D32 makes it null, 600-point cap. `figures_to` is the later of the last revealed entry and the last point. `listed_on` null until the anchor row is published, then the India date of `published_at`; null when the line does not list the hash.
- Doors: `authenticated` non-admin refused; `anon` and `service_role` have no execute.
- Gate: a `case_study` without `ledger` and every existing gate test behave as before (file number still assigned); `ledger` on a `thesis` gives `case_kind`; reveal off gives `case_off`; reveal on with the exact record, `data_as_of = figures_to` 30 India days back, lint clean and a learning objective passes, sets no file number, and the item appears in `public_items`; `figures_to` 29 days back fails rule 3; one changed character in a word, a dropped entry, or a chart present after `ledger_chart` was turned off gives `case_record`; a different `data_as_of` gives `case_figures_to`; an open idea on the company (also through an alias stub) gives `case_open_idea`; a second item for the same idea gives `case_duplicate`; a tampered chain gives `ledger_check_failed`; rule 4 still refuses a stance entry 29 days old; the old policy string is refused; `publish_revision` is executable by `service_role` only.

**Acceptance:** `pnpm supabase db reset` then the full pgTAP suite green; `src/modules/compliance/policy.test.ts` finds the new `c_policy` in 0019; `pnpm test`, typecheck and lint green; no `anon` privilege added (the grants tests prove it).

- [ ] Steps: failing pgTAP, 0018, 0019, reset and test, version bump and pins, `pnpm db:types`, `pnpm test`, commit `feat(gate): publishing rule 10, ledger case studies behind two owner switches; policy v1.1 (migrations 0018, 0019)`.

---

### Task 2: The ledger record in the app: parser and labels, lint, carry-over, the `cases` module

Build: `desk-backend` (sonnet). Review: folded into Task 6. Size: 300k.

**Files:** Create `src/modules/casefile/case-record.ts` (+ `.test.ts`): `CaseRecordV1` type, `parseCaseRecord(value: unknown): CaseRecordV1 | null` (strict: unknown or missing key, a hash not 64 lowercase hex, a date not ISO, more than 600 points, `v` not 1 all give null), `isLedgerCase(structured)`, the public labels (close reasons, tags, horizon phrase, the expectation sentence of s33.5) and `PUBLIC_FINGERPRINT_FILE: { url: string; since: string } | null = null`; export through `src/modules/casefile/index.ts` and `client.ts`. Create `src/test/fixtures/case-record.ts` (a record whose hashes are real, computed with `node:crypto` exactly as the seal trigger does: `sha256(prev + "\n" + canonical)` in UTF-8). Create `src/modules/cases/` (`index.ts`, `actions.ts`, `service.ts`, `repo.ts`, `types.ts`, `service.test.ts`, `cases.graph.test.ts`). Modify the revision save in `src/modules/casefile/actions.ts` (carry `structured.ledger` forward), the structured walker in `src/modules/compliance/lint.ts` (D42), `src/lib/messages.ts` (keys prefixed `case-`), and add one test in `src/modules/ledger` that its close-reason and tag lists equal the label keys in `case-record.ts`.

**Changes:**
- `cases` service (server only, the admin's cookie client; never the service client): `draftCaseStudy(ideaId)` calls `case_study_record`, returns the existing item if one already carries this idea (idempotent; a double tap makes one item), else creates a `case_study` item through the research service (company: the record's `company_id` resolved through `company_aliases` to the live company; title "{company}: a closed idea, {Mon YYYY} to {Mon YYYY}"; `data_as_of = figures_to`; `learning_objective` and `holds_position` empty, required at the gate) and its first revision (`structured = { ledger: record }`, `body_md = ""`, change reason "Drafted from the ledger"). `refreshCaseStudy(itemId)`: a new revision with the rebuilt record, the body and change reason "Refreshed from the ledger", and `data_as_of` set to the new `figures_to`. `caseStateForIdea(ideaId)`, `recordDiffers(itemId)` (deep-equal against a fresh build), `switches()`. Builder errors map to the s33.8 sentences.
- Carry-over: a file save of a ledger case keeps `structured.ledger` deep-equal to the previous revision's whatever the form sends; any `ledger` key in form input is ignored. Only `cases` writes it.
- Lint (D42): findings in a sealed entry's words point at `structured` with the sentence, as today; nothing is reported from `canonical`, `hash`, `prev_hash`, dates or chart points.

**Tests first:** the parser accepts the fixture and the exact key order the SQL builder emits, and refuses each malformed case above; carry-over (facts-sheet save, note-style save, a form posting a forged `ledger`); lint (a sealed "buy" in words is one rule-1 finding, the same text inside `canonical` adds none, an allowance on that sentence applies); draft idempotence, item fields, alias resolution, refresh; error mapping; `cases.graph.test.ts` (no LLM, OCR or transcriber port; no `@/lib/supabase/service`; `@/modules/showcase` never reaches `@/modules/cases`).

**Acceptance:** unit, typecheck and lint green; no public file changed.

- [ ] Steps: failing tests, parser and labels, lint walker, carry-over, `cases` module, commit `feat(cases): the ledger record in the app; drafting and refreshing a case study from a closed idea`.

---

### Task 3: Public pages: the case study, `/cases`, Mistakes, "How this record is kept"

Build: `desk-ui` (model override: sonnet). Review: folded into Task 6. Size: 420k.

desk-ui proposes one layout for the case page from the existing segment-1 file page (type scale, rail, disclosure block), records the pick in `docs/design/decisions.md` as "delegated by Shlok 2026-10-15", and builds it; no Mobbin round (the page reuses the decided file-page system).

**Files:** Create `src/modules/showcase/case-study.ts` (+ `.test.ts`): `ledgerCases(snapshot)`, `buildCaseStudyView(snapshot, slug)`, `listCaseSummaries(snapshot)`, `buildMistakes(snapshot)`, `hasLedgerCases(snapshot)`; types in `types.ts`; exports in `index.ts`. Modify `src/modules/showcase/site.ts` (`files()` excludes ledger cases; any href builder sends them to `/cases/[slug]`; `grep -n "/companies/" src/modules/showcase` to find them). Create `src/components/desk/case/` (`case-page.tsx`, `case-entry.tsx`, `rebased-chart.tsx`, `how-to-check.tsx`, `fingerprint-check.tsx` with `"use client"`, `record-keeping.tsx`). Create `src/app/(public)/cases/page.tsx` and `src/app/(public)/cases/[slug]/page.tsx` (`revalidate = 3600`, `generateStaticParams` returns `[]`, the snapshot only, `notFound()` when absent or empty). Modify `src/app/(public)/mistakes/page.tsx` and `src/app/(public)/process/page.tsx`. Extend `src/modules/showcase/isolation.test.ts` (the boundary in Global constraints).

**Changes:** spec s33.4 to s33.7, exactly the strings there. The chart is a server-rendered SVG: two polylines, a labelled 100 baseline, unlabelled gridlines, the two series told apart by line style and a legend, not colour alone; no tooltip, no value labels; `role="img"` with the s33.5 text alternative and the s11 caption as a visible `figcaption`. The check button computes `crypto.subtle.digest("SHA-256", new TextEncoder().encode(prev + "\n" + canonical))` and compares hex; no network. Snapshot items are parsed with `parseCaseRecord`; an item whose record does not parse is not shown (no partial page).

**Tests first:** view order and labels for the fixture; the "no result" test (render every case view model and the Mistakes model to text; assert no `%`, no `₹`, no `Rs`, no "ahead", "behind", "hit", "proof", "verified", and no decimal number other than inside a hash or the sealed text); chart omitted when the record's chart is null; the "Listed in the public file" line only with `listed_on`; Mistakes selection (D35) and order; `/cases` 404 while empty; the `/process` section only with a ledger case; `files()`, `servedFiles()` and the home counts unchanged by adding a ledger case to a snapshot; the check component says "Matches" for the fixture, "Does not match" after one character changes, and "This browser cannot run the check." without `crypto.subtle`; the isolation tests.

**Acceptance:** 375 px first, no horizontal scroll; dates and days in tabular figures; reduced motion honoured; the only client JavaScript on the page is the check button; unit, typecheck, lint and `pnpm build` green; axe runs in Task 5.

- [ ] Steps: failing tests, view builder, components, routes, Mistakes and Process, isolation test, commit `feat(public): case studies from the ledger, Mistakes from published lessons, how this record is kept`.

---

### Task 4: Desk screens: the case block on an idea, the record panel, the checklist line, the writing hint

Build: `desk-ui` (model override: sonnet). Review: folded into Task 6. Size: 320k.

**Files:** Create `src/components/desk/private/ledger/idea-case-block.tsx` and `src/components/desk/private/case/ledger-record-panel.tsx` (the record read-only, reusing `components/desk/case/case-entry.tsx`). Modify `src/app/desk/ledger/[ideaId]/page.tsx`, `src/app/desk/items/[id]/load.ts` and the item page (hide the facts editor for a ledger case; the panel; "Refresh from the ledger" only when `recordDiffers`), `src/modules/compliance/preview.ts` (a ledger case previews through `buildCaseStudyView`'s components, not the file view; the checklist line of s33.8), the four ledger forms (new idea, revise, close, lesson) for the hint. For the hint, run `graph-memory impact src/modules/compliance/lint.ts`: if the lint core is pure, export a `lintWords(text)` from `src/modules/compliance/client.ts`; if it is not, a server action returns the findings. The hint never blocks a submit.

**Tests first:** each state of the idea block (open: none; closed without lesson; exit pending; ready with switches off and on; drafted; public), the double-submit of "Draft a case study" makes one item, the panel and the hidden facts editor, refresh shown only when the record differs, the checklist line for both switch states, the hint for "I will buy more below 500" and none for a clean sentence.

**Acceptance:** unit, typecheck, lint, build green; the desk a11y e2e (`e2e/desk-a11y.spec.ts`) extended to the two new blocks passes; every new string listed in the report.

- [ ] Steps: failing tests, block, panel, preview and checklist, hint, commit `feat(desk): draft, refresh and check a case study from a closed idea; a hint while writing sealed words`.

---

### Task 5: The full loop end to end, the switch runbook, the guide

Build: `desk-backend` (sonnet). Review: folded into Task 6. Size: 280k.

**Files:** Create `e2e/support/aged-case.sql`, `e2e/support/cases.ts`, `e2e/cases.spec.ts`, `docs/runbooks/case-study-switches.md`. Modify `playwright.config.ts` (project `cases`: dependencies every `public-*` project, `reduced-motion`, `desk-mobile`, `desk-desktop`; `signout` also depends on `cases`), `docs/guide/using-the-desk.md` (a section "Case studies"), `docs/guide/aksh-quick-guide.md` (two lines).

**The fixture (local only; D43).** `cases.ts` runs `aged-case.sql` through `pnpm exec supabase db query --local` as `e2e/support/anchors.ts` does, after `requireStack()`. The SQL: (1) an invented company (name, symbol and ISIN made up; never a real NSE row); (2) as the admin, through the real functions (one transaction; `set local role authenticated` and `request.jwt.claims` with the admin's `sub` from `auth.users`, as `supabase/tests/0010_ledger.test.sql` lines 105-106 do): `open_idea`, `add_idea_event` for a revise, a note, the close and a review with process `flawed` and tag `timing`; (3) as the owner: shift those events' `recorded_at` back (open 140 days, revise 120, note 100, close 60, review 50; weekday mornings, India time) with user triggers disabled, re-seal the whole chain and the projection (the `pg_temp.reseal` body of `supabase/tests/0014_ledger_gate.test.sql`), delete and rebuild `ledger_anchors` (disable `ledger_anchors_guard` and `ledger_anchors_no_truncate` by name, delete, re-enable them `ENABLE ALWAYS`, assert `tgenabled = 'A'`, then `seal_ledger_days()`); insert smooth `nse_fetch` closes for the company and the Nifty 50 and `open` `market_days` (source `nse_fetch`) for every weekday of the span; `score_ideas()`. Switches are set by the spec, not the fixture.

**The spec (admin session, then a signed-out context at 375 and 1280):** both switches off: draft from the idea page, add a learning objective and "not disclosed", publish: refused with the `case_off` sentence. Owner sets `ledger_reveal` on: publish passes; signed out, `/cases/<slug>` shows the three sections, his words, a fingerprint, "Check in this browser" says "Matches", no "Listed in the public file" line, no chart, the disclosure and "A past case, not a view on the share today."; `/cases` lists it; `/mistakes` lists it (flawed, timing); `/process` shows "How this record is kept"; axe clean on all four. Owner sets `ledger_chart` on: the item page says the ledger has changed; refresh; publish; the chart and its caption render. Finally both switches off again and the spec asserts a new revision is refused.

**Runbook:** what each switch does (rule 10.1, D28); the exact SQL to turn each on and off (`insert into private.settings (key, value) values ('ledger_reveal', 'on') on conflict (key) do update set value = excluded.value;` and `delete from private.settings where key = 'ledger_reveal';`); that turning off does not unpublish; the query listing every published ledger case study (`public_items` where `structured ? 'ledger'`); that the hosted switches stay off until Q27 is answered.

**Acceptance:** the full e2e suite passes with the new project (no other spec changed except `playwright.config.ts`); the guide section read aloud is plain words; the fixture refuses to run without the local stack.

- [ ] Steps: fixture, spec, config, runbook, guide, full e2e, commit `test(e2e): a case study end to end on a seeded 140-day-old idea; switch runbook and guide`.

---

### Task 6: Whole-branch review, one fix wave, close-out

Review: **opus** over the branch diff (R1 rows 1, 2, 3, 4, 6; R2 rows 2, 3, 5, 7; R3 all; the addendum's rule 10 line by line against 0018 and 0019; the no-result and isolation tests; every new string against the banned words). This is also the review of Tasks 2-5. Fix wave: `desk-backend` (sonnet). Size: 520k.

**Files:** whatever the review names; `docs/specs/technical-debt.md` for deferrals; a spec s34 amendment for anything built differently; the timeline entry; `graph-memory sync`. `docs/progress.md` is the controller's.

**Acceptance:** every finding fixed or logged with a reason; pgTAP, unit, typecheck, lint, build, `check:bundles` and e2e green; CI green on the PR; the report lists every new string for Shlok's approval.

**Release for Shlok (after his review this evening; none of it makes anything public):** (1) PR #8 merged first; (2) hosted dry run lists exactly 0018 and 0019, push them, then merge this PR at once (D38: in between, publishing is refused, fail closed); (3) confirm on hosted that `private.settings` has no `ledger_reveal` or `ledger_chart` row; (4) nothing else until Q27 is answered: turning a switch on is the runbook's two lines.

## Conflict watch
| Tasks | Shared file / interface | Risk | Resolution |
|---|---|---|---|
| 1 | migration numbers 0018, 0019 | PR #8 or another branch takes 0018 | renumber files, test file, plan and spec s33 before Task 1 |
| 1 | `publish_revision` (latest body in `20261013000014_ledger_gate.sql`), `c_policy`, `policy.test.ts` | a partial copy drops rule 4, the figures-to rule or the file number | copy the 0014 body whole; every existing gate pgTAP passes with only the version literal changed |
| 1 | 12 pgTAP files pinning `'sebi-unreg-2026-07'` | the bump fails them all | replace the literal in the same commit; keep the "other version refused" assertions |
| 1 | `0002_function_privileges.test.sql` | two new `authenticated` functions fail the allowlist | extend it in Task 1 |
| 1, 2 | `src/lib/supabase/database.types.ts` | stale types | `pnpm db:types` at the end of Task 1 |
| 2 | `src/modules/casefile/actions.ts` save path | a facts save silently drops `structured.ledger` | the carry-over test; Task 6 checks it first |
| 2 | `src/modules/compliance/lint.ts` structured walker | lint finds each sealed sentence twice, or none | D42 tests |
| 2, 3 | `src/modules/casefile` index and `client.ts` | showcase and lint import casefile client-side | `case-record.ts` is pure; no server import |
| 3 | `files()`, `servedFiles()`, home counts, href builders in `site.ts`, `file.ts` | a ledger case served as a company file or counted as a file | the unchanged-snapshot tests in Task 3 |
| 3 | `isolation.test.ts` | a public file reaches `cases` or `ledger` | extended in Task 3 and run in every later task |
| 3, 4 | `src/components/desk/case/*` used by the desk preview | a private import creeps into a public component | components take a view model only; the isolation test covers the folder |
| 4 | `preview.ts` `isFile` branch | a ledger case previews as a file | branch on `isLedgerCase` first |
| 5 | `playwright.config.ts` project order; `signout` | the re-seal runs before a ledger or public spec and breaks its assertions | `cases` depends on all of them; `signout` depends on `cases` |
| 5 | local chain rewrite | the fixture SQL reaches hosted | `--local` only and `requireStack()`; the review checks both |
| all | `src/lib/messages.ts` | keys collide | prefix `case-`; sequential tasks |
