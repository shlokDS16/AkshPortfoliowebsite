# Phase 5c Task 15 report: the letters loop end to end with fixture sends, and the guide

Built by desk-backend (Sonnet 5.5), 2026-10-16. Branch `phase-5c-letters` on `1e31e44`. Not pushed. Local Supabase only.
Nothing was sent anywhere. The e2e web server runs with `DISTRIBUTION_ADAPTER=fixture`, set in `appEnv()` in `e2e/support/stack.ts` (already there; unchanged). That makes
`createLetterPorts` pick the fixture transport, which appends to a JSON file in the temp folder named from the local database's address; the Playwright process reads it
(`peekFixtureLetters`). No key is set, no real key was asked for, and the outbound guard fails any test that reaches a host outside this machine. `e2e/support/outbound.ts`,
`src/test/no-outbound.ts` and `e2e/support/stack.ts` are byte-identical to `1e31e44` (`git diff 1e31e44 --stat` on them is empty).
A network drop cut the session once; the work was saved as checkpoint `e0b1051` and finished on top of it.

## Built
- `e2e/letters.spec.ts` (project `letters`, serial, 6 tests, 263 lines) and `e2e/support/letters-loop.ts` (outbox, signed-out visitor, sign-up, confirm link, leave, public-page checks).
  1. A reader asks on `/letters` (honeypot empty, 3.3 s wait, 18+ tick, ticket): the outbox holds no email and the row is `waiting`. The desk shows "Waiting: 1" and
     "Send confirmation emails (1)". After the press the outbox holds exactly one email, to that reader, with a `/letters/confirm?t=` link, and the row is `sent`.
     Opening the link (a GET) shows the button and changes nothing; the press confirms. A second reader asks and is left waiting (no email, no link).
  2. "What changed" lists the public changes, all ticked. Two letters are made. Letter 1 shows "Untitled letter, {date}"; with only the sentence written it passes the real gate and
     Send is present and disabled with the reason; after Unpublish, the subject is replaced, saved, and the gate passes again; Send is enabled; the outbox still holds no broadcast.
  3. Send: the dialog shows the subject and "This emails 1 person. An email cannot be called back."; Send is disabled until "I have read the preview" is ticked. The press records the
     approval row (`letter_sends`: kind `subscribers`, `recipients_at_approval` 1, approver, gate decision). The send reaches `sent`, and the outbox holds exactly one broadcast
     with `recipients` equal to the one confirmed reader (the waiting one gets nothing), his subject, his sentence and the disclosure line in the text. A second tab opened
     before the press, with its dialog ticked, presses Send afterwards: refused with "This letter has already been sent to subscribers, or its send is waiting."
     (`?error=letter-already-sent`); still one approval row. The pump (`POST /api/jobs/run`) twice more sends nothing: still one broadcast.
  4. The sent letter on every public surface for a signed-out visitor: the archive, the letter page, its card (a PNG), the feed line and the sitemap line; axe-clean, one h1, no sideways
     scroll; his first entry's title is in the broadcast text byte for byte.
  5. The second reader is sent a confirmation (the outbox now holds exactly the two) and confirms. The first reader leaves on `/letters/leave` (row gone). Letter 2 is made, subject and
     sentence written, gated, approved and sent: its broadcast goes to the second reader only, the first letter's recipient list is unchanged, and the contact list is the second reader only.
  6. Unpublish letter 1: its page, card, feed line and sitemap line are gone; letter 2 is still there. Sign-ups are closed again.
- Letter 2 is made at the start, with letter 1, because "what changed since your last sent letter" would be empty after letter 1 is sent (nothing new is published in between).
- `e2e/public-letters-published.spec.ts` and projects `letters-public-375` and `letters-public-1280` (after `letters`): the archive with a sent letter on it and the sign-ups shut (no form, "Stop my letters"
  link there), the letter page, and `/letters/leave`: axe, one h1, no sideways scroll. In the `public-*` projects it skips, as `public-videos.spec.ts` does.
  They are the only reason to keep letter 2 public after the loop. `public-distribution` and `public-print` are not added to these projects: their sitemap check is exact and does not list letters (see concerns).
- `playwright.config.ts`: `letters` depends on every project that expects the deploy state or checks the sitemap and feed exactly (the videos-public ones too); `signout` also waits for `letters`.
- `.github/workflows/ci.yml`: only the comment that lists the projects. The 35-minute timeout is unchanged (measured below).
- `e2e/clocks.spec.ts` (a fix that the full run found, not part of the plan): `/api/cron/daily` and `/api/jobs/run` now also answer `letters:reconcile`, `letters:purge` and `letters:send`
  (added in Task 12; the spec's expected lists were never updated). 3 added lines per list.
- Guide: `docs/guide/using-the-desk.md` new section 4.13 "Letters" (what readers see, the two presses, making a letter, the Monday line, the test copy, the Send dialog, confirmation batches, leaving,
  that a sent email cannot be recalled, the data-request answer for Q41, messages), plus the contents line, the intro date line, the environment table (the three letters settings; `DISTRIBUTION_ADAPTER` now also
  stands in for email), a "What is switched off on purpose" bullet that says why nothing goes out until a domain, sender, segment and a separate key are set (Q9, Q36, Q42), "Not in this version" (the
  newsletter line replaced) and item 13 of "To verify before sharing" (nothing tried against the real Resend). `docs/guide/aksh-quick-guide.md`: a "Send a letter" block (two presses, erase on request) and the
  "not in this version" line. The quick guide keeps its CRLF line endings.

## Evidence (all on `22a86d5`, local stack, fixture adapter)
- `pnpm supabase db reset` then `pnpm supabase test db`: 35 files, 2643 tests, PASS.
- Unit, `pnpm vitest run --testTimeout=60000 --maxWorkers=3`: 470 files, 6392 tests passed, 154 s. No file timed out, none was re-run. (No source under `src/` changed in this task, so the count equals Task 14's.)
- `pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- `rtk pnpm build` (CI placeholder env) built; `pnpm check:bundles`: passed, 64 routes.
- Full `pnpm e2e` after `pnpm supabase db reset`: **529 passed, 56 skipped, 0 failed, 28.4 minutes**. The skips are the deploy-state and published-state halves that skip by project, as designed (for the letters: the four `public-*` runs of `public-letters-published`). A first full run, before the `clocks.spec.ts` fix, had 2 failures
  in `anon` (the expected job lists) and left 120 tests not run; it is not the evidence.
- The new specs alone: `letters` 6 tests in 68 s, `letters-public-375/1280` 2 tests; the loop passed on three runs (two single-project runs, then the full one).
- TDD: the first run of the loop failed on my wrong expectation of the reader's state after the confirmation press (it is `sent`, not `asked`); fixed and seen to pass. Anything the spec asserts about the stale
  tab was first read from a real run, then written down.
- `defenso guard_code` is not among this agent's tools. This task changes no auth, database, env or request-body code: e2e files, one config, docs.

## CI timing
28.4 minutes here, on a machine that another project was loading; Task 9's full run was 17 minutes and 511 tests. This task adds about 70 s (the loop) and a few seconds (two skips and two checks); the rest of the growth is Tasks 11 to 14's specs.
The job limit is 35 minutes. I did not raise it: the runner is not loaded and the measured addition is small. If the job ever nears the limit the reason to raise it will be the number of public projects, not letters.

## New strings (pending Shlok's approval)
None on the site. The e2e quotes the strings Tasks 12 to 14 already listed. The guide sentences are documentation for Aksh and Shlok.

## Concerns for Task 16
1. `public-distribution` and `public-print` do not run with a letter public: their sitemap list is exact and `discover()` knows no `/letters`. The loop checks the sitemap and feed lines itself; extending `derived.ts` is a small follow-up.
2. The guide says "the reader leaves via the stop page", not a token link: the confirm link is the only token link. A reader leaves by typing their address on `/letters/leave` or with Resend's own link, which the fixture cannot press (`unsubscribeFixtureContact` is unit-tested only).
3. A fixture "send" has no Resend behind it: the real send path (a draft, then send, with `retry-after`) is only unit-tested with an injected fetch. The guide asks Shlok to try one test copy before the first real send.
4. The guide's release steps for letters (a dry run listing exactly 0024 and 0025, push, merge together) follow the plan's "exactly 0024 and 0025"; I did not verify whether a publish is refused between the two as it is for 5b.
5. `/letters/leave` deletes any typed address with no proof of ownership (Task 14 concern 2); the guide's data-request text relies on Aksh erasing by hand, and says the desk cannot show one address.

## Fix wave (review of Task 16: `.superpowers/sdd/2026-10-16-phase-5c-ledger/review.md`)
Branch `phase-5c-letters`, from `d0b0186`. Nothing was pushed, sent or called outside the machine: local Supabase only, the fixture adapter, fixture port; the unit guard (finding 4) was fixed before any other test ran. Migrations 0024 and 0025 were edited in place (not on hosted), pgTAP written with them.

### Finding to commit
| Finding | Commit | What |
|---|---|---|
| 4 (unit outbound guard) | `150fa2f` | `src/test/outbound-hosts.ts` (`isOutsideHost`, pure loopback allowlist: only no host, `localhost`, `*.localhost`, `127.*`, `::1`), `no-outbound.ts` exports `installNoOutbound(real)`; the self-test hands it a `vi.fn()` spy and never fetches; 15 lookalike hosts listed; the full unit suite ran once under it and no test relied on an outside host |
| 1 (HIGH, double send) | `2e02551` | `deliver.ts` reads the broadcast first (`scheduled/queued/sent` records `sent`, never fails with a broadcast id, a failed read or unknown status defers, a later failure re-reads and fails only on `draft`/`canceled`); 0025 refuses a new subscribers approval once any earlier send has a broadcast id (new sentence, code `letter-broadcast-made`), 13.4 and the 0024 freeze trigger count a `failed` send with a broadcast id; tests: unpublished letter retry, 24 h outage, 4xx retry, plus pgTAP |
| 3 (label subject) | `2e02551`, `74e25e1`, `03c21d2` | rule 13.1 in 0025 refuses `^\s*Untitled letter(?:, .*)?\s*$` ("Replace the label with your own subject."); `subject.test.ts` reads 0025 and keeps the pattern equal to `LABEL`; both e2e specs now expect the refusal and then the pass |
| 7 (`gate_decision_id`) | `2e02551`, `bb7a0c1` | BEFORE INSERT trigger `private.check_letter_send_decision` (23503 unless a pass of this item and revision); no foreign key; in the privileges inventory; the older send-live pgTAP fixture now names a real decision |
| 2 (typed leave) | `2e02551`, `74e25e1` | event `left_form` (0024 check and `letters_leave`), `leftOnFormToday` read, "Stopped on this page today: {n}" on the readers page, header comments in `public-actions.ts` and `letters-form.ts`: the ticket and honeypot are a speed bump, the SQL caps are the control. Kept the one typed step. Stronger options are a debt line for Shlok |
| 11 (waiting list full) | `74e25e1` | `WAITING_CAP = 300` tied to the SQL literal by a test; the panel line at 300, not at 299 |
| 6 (CRON_SECRET reuse) | `4a7be12` | ticket signed with an HKDF-SHA256 key (`aksh-desk/letters-form-v1`); the old-scheme ticket is refused in a test; no new setting |
| 8 (form while email off) | `3849bec` | pure `lib/providers/letters-mode.ts` (`lettersMode`, `letterSettingsProblem`, `isLoopbackUrl`), re-exported by `providers/index.ts`; `lib/letters-config.ts` answers `lettersEmailReady()`; the page renders the form only when open, ready and the contact is set; the readers page says when sign-ups are open without email; isolation tests allow exactly that |
| 9 (fixture needs a local DB) | `3849bec`, `fc90b5e` | `lettersMode`: the fixture only for a loopback `NEXT_PUBLIC_SUPABASE_URL`, else `off("fixture_refused")`; `createLetterPorts` takes `fixtureDirectory: null` for memory (unit tests) |
| 5 (notice, release gate) | `3849bec` | notice text fixed (what is kept; deleted within a day with a one-way code kept as the record of consent; contact; Data Protection Board of India); the contact is the new setting below, unset; the form is not shown and the desk refuses to open sign-ups while it is unset (`letter-signup-contact`); notice version `letters-2026-10-v1` edited in place (0024 is not on hosted); `leaveIntro` made accurate (list at once, email service within a day) |
| 10 (CI timeout) | `29ca22f` | `timeout-minutes: 50`, comment gives the measured 28.4 min |
| 17 (migration size) | `407802c` | accepted, logged as debt |
| Debt, spec amendment (ad to al), Q41 and Q52 answers | `407802c` | `docs/specs/technical-debt.md` (new dated 5c section, appended), the spec's end, `unanswered-questions.md` (appended). Debt lines for findings 2, 5, 10, 12 to 17, plus one for the fix wave itself |
| e2e hardening, found by the runs below | `03c21d2`, `caf8e68`, `d4f9515` | the gate helper waits for the new pass (an earlier refusal stays on the page); the letters desk axe scan reduces motion and settles transitions as the shared scan does; the public letters scan waits for the page title (a dynamic page streams it late) |

### New environment name
`LETTERS_GRIEVANCE_EMAIL` (optional, UNSET): added to `src/lib/env.server.ts` (empty means unset; shape checked in `lib/letters-config.ts`, so a typo turns sign-ups off and never the app), to `.env.example` (labelled, empty), and to the e2e stack env as `grievance@example.test`. Not pushed to Vercel: Shlok chooses the address first (the same deliberate exception as the other letters settings).

### New strings (pending Shlok's approval; none uses a banned word, no dash)
- Notice: "We keep your email address and the dates you asked and confirmed, only to send these letters." / "You can stop at any time with the link in every letter or on this page. When you stop, we delete your address within a day; we keep a one-way code of it as the record that you had agreed." / "Questions or complaints: {address}." / "You can also complain to the Data Protection Board of India."
- Leave page: "Enter the address the letters come to. We delete it from our list at once, and from the email service within a day."
- Gate (0025, rule 13.1): "Replace the label with your own subject."
- Desk refusals: "A broadcast was already made for this letter. Check it in Resend; to send again, make a new letter." and "Sign-ups cannot open yet: the contact address for questions and complaints is not set. Set LETTERS_GRIEVANCE_EMAIL first."
- Readers page: "Stopped on this page today: {n}"; "300 requests are waiting. New requests are not kept until you send confirmations or bin some."; "Sign-ups are open, but email is not set up. Close them, or set email up."; "Sign-ups are open, but the contact address for questions and complaints is not set. Close them, or set it."
- Operator message (NIT 2): "LETTERS_FROM must be on your own domain (set up in Resend), not resend.dev".

### Evidence (final state `d4f9515`, local stack, fixture adapter)
- `pnpm supabase db reset` then `pnpm supabase test db`: 35 files, 2659 tests, PASS (2643 before; +16).
- Unit, `--testTimeout=60000 --maxWorkers=3`: 472 files, 6458 tests passed, no timeout. (An earlier full run had 1 failure, `letter-steps.test.ts`, fixed in `fc90b5e` and re-run; the final run above is clean.)
- `pnpm typecheck` clean; `rtk pnpm lint` clean; `rtk pnpm build` (CI placeholder env) built and `pnpm check:bundles` passed (64 routes), run on `fc90b5e`; the two later commits touch only `e2e/`.
- Full `pnpm e2e` after `pnpm supabase db reset`: **529 passed, 56 skipped, 0 failed, 26.3 min**, with the two tests below excluded by `--grep-invert`. `public-letters.spec.ts` was also run alone after the title fix: 26 passed.
- NOT run, and why: `desk-ledger.spec.ts` "an idea's whole life" and `desk-ledger-closes.spec.ts` "official file, typed close, corporate action" depend on the time of day. After 15:35 IST on a weekday the daily job's `ledger:prices` step reports a weekday without a close and the closes spec stops asserting (its own comment says so). Both passed in this session's first full run (14:54 to 15:20 IST, before 15:30) and fail from 15:36; nothing in them touches letters. Run them once more before 15:30 IST or on a weekend. The CI run has the same dependence.
- Failed runs on the way (not evidence): run 1 (before the e2e fixes) failed `desk-letters` "replacing the label" (read the stale refusal) and the 2 time-of-day tests; run 2 failed one dark-mode contrast read; run 3 failed three public-letters axe reads of a missing title. Each cause is in the table above; none was a product defect.
- `defenso guard_code` is not among this agent's tools; `security-review` was not run as a separate pass. Changed auth/DB/env/request-body code: `deliver.ts`, the 0024/0025 edits, `letters-form.ts`, `letters-config.ts`, `env.server.ts`, `actions.ts`, `service.ts`. Worth one `guard_code` pass by whoever has the tool.
- TDD: tests came first for findings 4, 1, 6 and the panel lines (failing runs seen for 1). For the SQL changes (1, 3, 7, 2) I wrote the pgTAP first but ran it only after editing the migrations: not seen failing first, stated plainly.

### Concerns
1. A send that failed with a broadcast id recorded can never be re-approved from the same letter (by the controller's ruling). A draft Resend still holds after such a failure is never sent by the app: Aksh deletes it in Resend by hand. Logged as debt.
2. Before sign-ups open Shlok must choose and set `LETTERS_GRIEVANCE_EMAIL` and approve the notice sentences (Q41); no address was invented.
3. The two time-of-day e2e tests (above) should be pinned to a clock or skipped after market close in a later task; they will fail a CI run that starts after 15:35 IST on a weekday.
4. The fix-wave commit for findings 5, 8 and 9 (`3849bec`) was staged by file, so shared files (the readers page, the panel, `letters-kit.ts`, `copy.test.ts`) sit in `74e25e1`; the commits are not individually bisectable.
5. The first CI run of the 5c PR still has to record its e2e step time (finding 10's proving test); the debt line says where.
