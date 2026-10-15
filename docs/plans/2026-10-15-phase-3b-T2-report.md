# Plan 3b Task 2 report: the ledger record in the app (parser, lint, carry-over, `cases` module)

Branch `phase-3b-case-studies`, local only, not pushed. Written 2026-10-15 by desk-backend. No SQL changed, so no pgTAP run.

## Built
- `src/modules/casefile/case-record.ts`: `CaseRecordV1` type, strict `parseCaseRecord` (exact key sets at every level; `v` not 1, unknown/missing key, hash not 64 lowercase hex, non-ISO or impossible date, sealed time not UTC, more than 200 entries, first entry not `open`, `seq` not rising, more than 600 points, non-finite chart number all give null), `isLedgerCase` (the key is present, as the gate asks), public labels (`CASE_CLOSE_REASON_LABEL`, `CASE_PROCESS_LABEL`, `CASE_MISTAKE_TAG_LABEL`), `horizonPhrase`, `expectationSentence`, `mistakeTagsSentence`, `PUBLIC_FINGERPRINT_FILE = null`. Exported through `casefile/client.ts` (and so `index.ts`). Key order is not asserted: jsonb does not keep the builder's order, so the parser accepts any order.
- Lint (binding note 1, D42): `src/modules/compliance/lint.ts` now pulls `ledger` out of `structured` and lints only `ledger.events[].words`, once each, as field `structured`. `canonical`, `hash`, `prev_hash`, `at`, `stance`, dates, chart points, company, symbol are never read. Other `structured` keys next to the record are still linted as before. An unreadable record cannot throw. Sentence allowances for rule 1 apply to his words as to any text.
- Carry-over (binding note 2, D41): `saveCaseFileRevisionAction` reads the newest revision first; if it carries `ledger`, the saved `structured` is `{ ledger: <previous ledger> }` and nothing else, whatever the form sent (facts sheet, `ledger`, `structured` fields ignored; no facts or readings are filed). A file without a record can never gain one through this path.
- `src/modules/cases/` (`index.ts`, `actions.ts`, `service.ts`, `repo.ts`, `errors.ts`, `types.ts`, `json-equal.ts`): `draftCaseStudy` (idempotent; private `case_study` item, title "{company}: a closed idea, {Mon YYYY} to {Mon YYYY}" capped at 200 characters, company resolved through `company_aliases`, `data_as_of = figures_to`, empty body and learning objective, first revision "Drafted from the ledger", record stored as the database sent it), `refreshCaseStudy` (new revision with the rebuilt record and his body, "Refreshed from the ledger", `data_as_of` moved; no revision when nothing differs; on a public item the revision waits for the gate and the frozen date is left), `recordDiffers` (key-order-free deep equality against a fresh build), `caseStateForIdea` (no_lesson / exit_pending / not_closed / void / ready with `earliest = figures_to + 30 days` / draft / public), `caseSwitches`, `draftCaseStudyAction` and `refreshCaseStudyAction` (admin first, fixed codes in the redirect). The repo uses the admin's cookie client and the two doors `case_study_record` and `case_study_switches` only; the PostgREST filter `structured->ledger->>idea` was checked against the local stack (200).
- `src/lib/messages.ts` and `message-codes.ts`: seven `case-*` error codes and three notices.
- Fixture `src/test/fixtures/case-record.ts`: a record with real hashes, `sha256(prev + "\n" + canonical)` through `node:crypto`.

## Evidence
- Parser, lint and carry-over tests were run red first (module missing; 5 of 8 lint tests; 2 of 6 carry-over tests), then green. The `cases` service/actions/graph tests were written before the code but their first run was after it was written (green at once); I did not run them red.
- Final: `rtk pnpm test` 331 files, 4848 tests pass; `rtk pnpm typecheck` clean; `rtk pnpm lint` clean (0 warnings).
- `cases.graph.test.ts`: no provider port, no service client or secret, no ledger table named, only `case_study_record` and `case_study_switches` called, public code never imports `@/modules/cases`.
- Ledger test `src/modules/ledger/case-labels.test.ts`: the ledger's close reasons, process calls and mistake tags equal the label keys.
- defenso `guard_code`: not callable in this session (no tool exposed to this agent; the skill loaded but the MCP tools are not present). Hand review instead: cookie client only, `requireAdmin()` first in both actions, ids checked with `isUuid`/`isItemId` before use, no dynamic SQL, no secret read, no `process.env`. Per the local skill notes `guard_code` is a supplement in any case.

## Commits
57c1653 parser/labels/lint; fab2684 carry-over; then the `cases` module and this report.

## New strings pending Shlok's approval
Errors (also in `src/modules/cases/errors.ts`):
- case-not-found: "This idea could not be found."
- case-not-closed: "This idea is still open. A case study can be drafted once it is closed."
- case-void: "This idea was withdrawn, so it cannot be shown as a case study."
- case-no-lesson: "A case study shows what you learned. Write the lesson first." (spec s33.8)
- case-exit-pending: "The exit price is not fixed yet. A case study can be drafted once it is." (spec s33.8)
- case-record-unreadable: "The ledger record could not be read. Run the integrity check on the Ledger page."
- case-not-ledger: "This item does not carry a ledger record."
Notices:
- case-drafted: "Drafted from the ledger. Add the learning objective and what you took from it, then run the gate."
- case-refreshed: "Refreshed from the ledger. Run the publishing gate again."
- case-unchanged: "This case study already matches the ledger."
Other: revision change reasons "Drafted from the ledger", "Refreshed from the ledger" (spec); item title pattern above; public labels "played out", "thesis broken", "period reached", "a better use for the money", "other"; "sound", "flawed"; the eight tag words; `horizonPhrase` outputs ("6 months", "1 year", "N years", "N days"); `expectationSentence` and `mistakeTagsSentence` (spec s33.5 wording, "He named no mistake."). None uses a banned word.

## Concerns for the controller
1. **Structure rule vs an empty body.** `lint.ts` still requires a "What would prove me wrong" heading in the body of every `case_study` (rule "structure"). A ledger case drafted with an empty body can never pass the app's lint until he writes that heading, which is odd for a closed case ("Looking back, if any"). I left it alone (conservative, not in the Task 2 list). Decide: exempt ledger cases from that one structural check, or accept the heading.
2. **Public item refresh.** The item's details, including `data_as_of`, are frozen while public (D10). Refreshing a public case whose `figures_to` moved stores the revision but cannot move the date, so the gate will say `case_figures_to`; the way out is Unpublish, refresh, publish. Task 4's screen should say so.
3. **Draft idempotence is sequential.** Two truly concurrent taps could each find no item and make two. Preventing that needs a unique index on `structured->'ledger'->>'idea'` (a data-model change, not made); the gate's `case_duplicate` stops two being published.
4. **Authors.** Revisions are written as `aksh`: the database refuses `system` authors (migration 0006, ADR-004 s4.2).
5. **Key order.** The Task 2 brief says the parser accepts "the exact key order the SQL builder emits"; jsonb reorders keys on storage, so the parser is order-free instead (tested with a reversed record).
