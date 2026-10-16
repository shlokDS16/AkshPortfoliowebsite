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
