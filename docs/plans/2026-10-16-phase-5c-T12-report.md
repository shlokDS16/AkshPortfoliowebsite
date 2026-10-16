# Phase 5c Task 12 report: `distribution/letters` (candidates, render, services, send door, ops steps)

Built by desk-backend (sonnet), 2026-10-16. Branch `phase-5c-letters`, code commit `51004a0` on `c631c08`. Not pushed. Local Supabase only.
Nothing was sent and nothing left the machine: every test used the fixture transport behind the real approval guard, or a fake. The unit
fetch guard (`src/test/no-outbound.ts`) was checked before the first test run and was not edited:
- offline first, with a recorder in place of the real `fetch` (the incident lesson from Task 11): `api.resend.com`, `eu.api.resend.com`,
  `youtube.googleapis.com`, `www.googleapis.com`, a trailing dot and upper case were all blocked and never reached the recorder;
  `example.com` and `notresend.com` passed through;
- then a scratch vitest test, which saw both hosts rejected with "no outbound call in a test". The scratch test was deleted.
`git diff` of the guard and `vitest.config.ts` is empty at the end.

## Built
**Module `src/modules/distribution/letters/`** (all files under 300 lines)
- `types.ts`: the entry, the candidate, the view, `SendRow`, and the two ports `LettersRpc` (the service_role doors, extends
  `ApprovalCheck`) and `LettersReads` (the admin session). Also `LetterSource`.
- `candidates.ts`: `letterCandidates(snapshot, passTimes, lastSentAt, today, limit = 20)`, `countCandidates` (uncapped, for the Monday line),
  `toEntry`.
  - An entry is a public item (not a letter) whose current revision became visible after the last sent letter, or in the last 14 days if
    none. Visible-from is the later of its latest pass decision and 00:00 IST of the day its 30-day lag ends.
  - One entry per page; the order is files by number, cases, notes, process notes, videos, then by visible-from.
  - It copies title, objective and change reason exactly, with no trim, cut or case change (a test scans the source for any such call).
  - Position and company name are copied only for a page that names a company.
  - The machine adds kind, page, revision number and its line.
- `structured.ts`: `letterStructured`, strict `entriesOf` (the same shape the 0025 gate reads; unknown keys dropped, a damaged entry
  makes the whole record unreadable).
- `render.ts`: `renderLetter(view, siteUrl, { unsubscribeUrl? })` returns `{ subject, html, text }`; `renderConfirmation(siteUrl, token)`.
  - The placeholder `{{{RESEND_UNSUBSCRIBE_URL}}}` is in both parts, or the site's own `/letters/leave` for a test copy.
  - No image, pixel, script or tracking link. Single column of inline styles, no `%` anywhere, under 30 KB at the longest his own limits allow.
  - Everything of his is HTML-escaped in the HTML part and byte-for-byte in the text part. A damaged page path is shown unlinked.
- `readers.ts`: `reconcileContacts` and `sendConfirmations`.
  - Reconcile: erase here every confirmed reader Resend reports unsubscribed, delete every contact not confirmed here, add the missing.
    It has a time budget and says when it is not complete. It returns counts only.
  - Confirmations: issue first, then send each through the guard. A failed reader goes back to waiting. A quota or rate limit stops the
    batch. Ids that are not uuids are dropped.
- `deliver.ts`: `deliverLetter(send, deps)` and `runLetterSends(deps)`.
  - Order: load the letter as the public sees it, reconcile, create the draft, **record the id**, send (the port reads the broadcast
    first), record `sent`. A test copy is one email to `ADMIN_EMAIL`.
  - A failure that may pass (rate limit, Resend slow) leaves the row `sending` for the database to re-lease; after 24 hours it fails.
    Everything else fails the row with Resend's cleaned words.
  - With letters off it claims nothing.
- `service.ts`: `makeLetter`, `saveLetter`, `approveSend`, `cancelSend`, `setSignup`, `binRequests`, `eraseReader`.
- `repo.ts`: `createSupabaseLettersReads(db)` (Aksh's session) and `createPublicLetterSource(anonDb)`. `rpc.ts`: `createLettersRpc(db)`.
- `signup.ts`: the reader's three doors as plain functions. `errors.ts`, `copy.ts`.
- `test-kit` is `src/test/fakes/letters-kit.ts`: a fake database that keeps the SQL rules (one claim at a time, 10-minute lease,
  forward-only status, 50 confirmations a day, the live-approval answers), and fixture ports behind the real guard.

**Elsewhere**
- `distribution/send-rpc.ts`: `createSendRpc()`, `import "server-only"`, the only distribution file that imports the secret-key client;
  only `actions.ts` imports it. ESLint allowance by exact path (`eslint.config.mjs`).
- `distribution/actions.ts`: `makeLetterAction`, `saveLetterAction`, `approveSendAction`, `cancelSendAction`, `sendTestCopyAction`,
  `sendConfirmationsAction`, `binRequestsAction`, `eraseReaderAction`, `setSignupAction`. Each calls `requireAdmin()` first and passes the
  admin's id as the actor. Approve and test copy kick the send step through `after()`.
- `distribution/public-actions.ts`: `askToSubscribeAction`, `confirmAction`, `leaveAction` (see Deviation 1).
- `lib/letters-form.ts`: `issueFormTicket()` for the page, `checkFormTicket()` for the action (see Deviation 4).
- `ops/letter-steps.ts`: `letters:send` (pump), `letters:reconcile` and `letters:purge` (daily), all just before `alerts:email`; plus
  `lettersOn()`, `runLetterSendNow()`, `sendConfirmationsNow()` through `ops/jobs.ts`. None is in `HEALTH_RULES`.
- `research/schema.ts`: `letter` kind. `research/actions.ts` and `desk/items/page.tsx`: a bare letter cannot be created from the Create
  list or a crafted post.
- `compliance/lint.ts`: a letter's lint covers title, objective, body and the words copied into each entry. The machine keys
  (`schema`, `revisionId`, `kind`, `path`, `revNo`, `detail`, `holdsPosition`) are not prose and are not linted; an unknown key is.
  `compliance/policy.ts`: label "Rule 13: letters".
- `lib/messages-letters.ts`: the desk's letter errors and notices, spread into `messages.ts` and `message-codes.ts`.
- `distribution/public.ts`: the reader-facing strings (`LETTERS_COPY`, `LETTERS_NOTICE`, `LETTERS_NOTICE_VERSION`).
- `showcase/client.ts`: a new cache-free entry (Deviation 3).
- Migration `20261018000025_letters_gate.sql` (unreleased): `cancel_letter_send(p_actor, p_id)` (Deviation 2).

## Evidence (at `51004a0`)
- `rtk pnpm test`: **451 files, 6173 tests passed**. The first full run had 3 failing files; the causes are in Deviation 3 and in the
  `gate.graph.test.ts` expectation (now two files hold the secret-key client outside ops). No file needed a re-run for load.
- `pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- `pnpm supabase db reset` then `pnpm supabase test db`: **35 files, 2643 tests passed** (+6 for cancel).
- `pnpm db:types`: +25 lines, additions only.
- `rtk pnpm build` with the CI placeholder env and `CI=1`: built. `pnpm check:bundles`: passed, 55 routes (no public page changed).
- Local PostgREST with the secret key, no data: `claim_letter_send` returns a row of nulls (handled as "nothing to send"),
  `letters_purge` returns a number, `letters_send_live` returns false, `cancel_letter_send` with a non-admin actor returns 42501.
- TDD, honestly:
  - The test file failed first (module missing) for candidates, render, readers, deliver, service, rpc, repo, `lint.letter` (two cases)
    and the research "letter" refusal.
  - The test and the module were written in the same step, then run together, for structured, signup, public-actions, letters-form,
    letter-steps, actions.letters, the copy test and the graph test additions.
  - The pgTAP cancel tests were written after the function.

## Tests, by the spec s12 "5c unit" list
- Candidates: visible-from with the lag (to the minute around 00:00 IST), byte-identical copies, the 20 cap and the uncapped count, order,
  one entry per company page, an unknown pass time not offered, letters never offered.
- Render: contains exactly the gated text and the fixed copy; no UUID or `%` (`derivedProblems`); placeholder present, or replaced for a
  test copy; escaping; deterministic.
- Reconcile: erase unsubscribed, delete strays, add missing, case-blind, nothing changed when the list cannot be read, a refusal stops the
  run, a time budget, counts only.
- Steps: off when the env is unset and the database is not touched; nothing is sent without a claimed row; a sent letter is not sent again.
- Sends:
  - exactly once when the step runs twice at the same moment;
  - exactly once after a crash between create and record, and between send and record;
  - the draft is recorded before it is sent;
  - a reader who left at Resend is not sent the letter.
- A batch of 60 sends 50 and says so. The signed-time check refuses a submit under 3 s and a forged time.
- Each action's off path records nothing, issues nothing and sends nothing.
- Graph: a broadcast, a test copy, a confirmation and the contact calls each have one caller in the app; the letters ports are built only
  by the factory and job code; `send-rpc.ts` is imported only by `actions.ts`; `public-actions.ts` reaches no admin session, no job code
  and no secret-key client.

## Security pass (defenso `guard_code` could not be run)
The tool is not among this agent's tools (as in Tasks 10 and 11). A manual pass instead; the Task 16 opus review should take these as one row.
- **No-send:** the only transport holder is the guard. The actions never build ports. With ports null, approve, test copy, confirmations
  and "open sign-ups" refuse with a fixed code before any database call (tested). The step claims nothing when off.
- **Authorisation:** every admin action starts with `requireAdmin()`; the service_role doors re-check the actor against `profiles`.
  `cancelSendAction` and the others take ids from bound arguments, validated as uuids before the database is asked.
- **Public doors:** anon client only; honeypot and ticket are checked before the database; one answer for every outcome. A database
  outage is thrown (not swallowed), so a withdrawal never looks done when it was not.
- **Ticket:** HMAC-SHA256 with a domain prefix, hex shape checked, constant-time compare, equal-length buffers, 3 s minimum, 2 h maximum.
- **No address, token or key in logs:** results are counts; `rpc.ts` errors carry the operation and code only (a test feeds a row text and
  checks it is absent); the one `console.error` prints an error name.
- **Injection:** every word in the HTML is escaped; `href` is the site address plus a path matching `^/[a-z0-9-]+(/[a-z0-9-]+)*$`
  (checked again at render); the confirm token is `encodeURIComponent`-ed.
- **Content comes from what the public can read:** the email is built from the anon views for the current revision, so it can only hold
  text that passed the gate and is public now; service_role could not read `body_md` or the objective anyway.

## Deviations (each the conservative reading)
1. **The reader's actions are in `distribution/public-actions.ts`, not `actions.ts`.** `actions.ts` imports `requireAdmin`, the ops job
   entry and `send-rpc.ts`; a public page that imported it would reach the secret-key client and the isolation test would fail in Task 14.
   The new file reaches only the anon client and `lib/letters-form.ts`.
2. **`cancel_letter_send(p_actor, p_id)` added to 0025 (not on hosted).** `cancelSendAction` is in the brief, and no door could cancel: the
   status trigger allows `approved -> cancelled` but no API role can update the table. It takes the sends lock, refuses a non-admin
   (42501), an unknown send (P0002) and any send not `approved` (55000). pgTAP +6 (0025 test 78 to 84); `0002_function_privileges`
   (send doors 3 to 4, letters functions 17 to 18). The release still lists exactly 0024 and 0025.
3. **`showcase/client.ts`, a new cache-free entry.** Importing the showcase index from the distribution index built `unstable_cache` at
   import and broke two other modules' tests that mock `next/cache`. The new entry exports the pure builders and `loadSnapshot` /
   `createSupabaseShowcaseRepo` (the caller passes the client). The showcase index is unchanged.
4. **The form ticket is signed with `CRON_SECRET`.** The clock ticket uses no shared secret (the database makes it), so no existing secret
   was "the one used for the clock ticket". `CRON_SECRET` is the required server secret (32 characters or more) and never reaches a
   browser; the HMAC has its own prefix. This avoids a new env var, so nothing new to push to Vercel.
5. **The email is read from the public views, not the desk tables.** service_role holds no grant on `body_md` or `learning_objective`.
   `LetterSource.load` returns the letter only if the send's revision is the current public one.
6. **Pass time is the LATEST pass decision of a revision.** A republished revision then counts as new again; an unknown pass time is not
   offered. The first letter looks back 14 days from 00:00 IST today.
7. **A new letter's subject starts as "Untitled letter, {date}".** The title column cannot be empty, and the gate (13.1) would pass it.
   The desk screen (Task 13) should make clear it is a label to replace.
8. **Reconcile erases here only confirmed readers that Resend reports unsubscribed**, then deletes the contact there. A newer request
   from the same address is not undone by an older withdrawal.
9. **A reconcile that runs out of time defers the send** (the row stays `sending` and is re-leased); it never sends on a half-made list.
   A crash between "create" and "record" can leave one unsent orphan draft at Resend; it is never sent.
10. **`letters:purge` runs even when letters are off** (a retention duty).
11. **The messages live in `lib/messages-letters.ts`**, spread into `messages.ts` (which is 269 lines), with tests that keep the codes,
    the texts and the database's refusal sentences equal.
12. **Commit trailer** is `Co-Authored-By: Claude Sonnet 5.5` (the attribution this session was given), not Opus 5.5 as the brief said.
13. **Migration size:** 0025 is now 440 lines. Migrations were already over 300 (Task 10, deviation 2).

## New strings (pending Shlok's approval)
- Desk errors (`lib/messages-letters.ts`):
  - "Email is not set up yet. Letters still publish to the archive." (equal to `LETTERS_OFF_LINE`, tested)
  - "This letter could not be found."
  - "Tick at least one change to make a letter."
  - "One of the ticked changes is no longer new. Reload the list and try again."
  - "The subject must be 1 to 120 characters."
  - "The one sentence must be at most 300 characters."
  - "The note must be at most 4,000 characters."
  - "Tick that you have read the preview first."
  - "There are no confirmed readers yet, so there is nobody to send this to."
  - "The database would not approve this send. Publish the letter again, then try once more."
  - "Only a send that is still waiting can be cancelled."
  - "This send could not be found."
  - The database's own approval refusals, now with codes (Task 10's wording, tested equal to the SQL): "This is not a letter.", "Approve the
    letter's current public revision.", "The letter is not public.", "The letter's last gate decision is not a pass under the current
    policy. Publish it again.", "This letter has already been sent to subscribers, or its send is waiting.", "Another letter is being sent.
    Wait until it has gone.", "5 test copies sent today. The next can go tomorrow."
- Desk notices:
  - "Letter made. Write the subject and the one sentence, then run the publishing gate."
  - "Letter saved. Run the publishing gate to put it on the archive."
  - "Nothing changed: the letter already says that."
  - "Approved. The letter goes out within 15 minutes."
  - "Approved. The test copy goes to you within 15 minutes."
  - "Cancelled. Nothing was sent."
  - "Confirmation emails sent."
  - "Some confirmation emails could not be sent. Those readers are waiting again."
  - "50 confirmation emails sent today. The rest can go tomorrow."
  - "There is no one waiting to be sent a confirmation email."
  - "Binned."
  - "Erased."
  - "Sign-ups open."
  - "Sign-ups closed."
- Stored on a send: "The letter changed after you approved it." (also written by the database); "There are no confirmed readers to send to."
- The new subject label: "Untitled letter, {date}".
- The email: kind labels "File", "Closed case", "Learning note", "Process note", "Video"; "Position: Yes | No | Not disclosed"; the footer
  (the disclosure's first two sentences plus "Each page states the position in the company it discusses."; "You get this because you asked on
  {host} and confirmed by email."; "Unsubscribe"; "The archive: {site}/letters"); the case's machine line "Closed case · R{n}".
- The confirmation email: subject "Confirm your letters from Aksh Agrawal"; body as spec s15.
- Reader-facing (`distribution/public.ts`): the notice `letters-2026-10-v1` and the field, button and answer strings of spec s15.
- Heartbeat details: "letters off", "nothing to send", "sent n, failed n, waiting n", "erased n, removed n, added n, readers n[, not finished]",
  "purged n", "nothing to purge".
- The wording scan (proof, verified, buy, sell, weekly; emoji; dashes used as pauses) is a test over every string above.

## Notes for Tasks 13, 14, 15
- **Desk loaders:** `createSupabaseLettersReads(await createSupabaseServerClient())` gives `passTimes`, `lastSentAt`, `confirmedCount`,
  `sendsOf(itemId)`, `waiting()`, `confirmationsLeftToday()`, `signupOn()`. Candidates: `letterCandidates(snapshot, passes, last, today)`
  from `@/modules/distribution`. Use a fresh snapshot (`loadSnapshot` from `@/modules/showcase/client`), not the hour's cache.
- **Preview before it is public:** build a `LetterView` from the item and its newest revision
  (`subject` = title, `objective` = learningObjective or "", `note` = bodyMd, `entries` = `entriesOf(revision.structured)`) and call
  `renderLetter(view, siteUrl)`. `createPublicLetterSource` works only once the letter is public.
- **Off state:** `lettersOn()` from `@/modules/ops/jobs`; the line is `LETTERS_OFF_LINE`. Do not render the sign-up form unless
  `letters_open()` is true (through the anon client) and letters are on.
- **Public sign-up (Task 14):**
  - Fields: `email`, `adult` ("on"), `ticket` (hidden, `issueFormTicket()` from `@/lib/letters-form`, set at render), `website` (the honeypot,
    hidden from people).
  - Actions from `@/modules/distribution/public-actions` through `useActionState`; the states are `{status:"idle"|"asked"}`,
    `{"confirmed"|"expired"}`, `{"left"}`.
  - The confirm page posts a hidden `token` field; a GET must confirm nothing.
  - Strings come from `LETTERS_COPY` and `LETTERS_NOTICE` in `@/modules/distribution/public`.
  - The isolation test needs to allow `public-actions.ts` for the public side. Its closure holds the anon client and `lib/letters-form.ts`
    (which reads the server env for the key), and nothing else.
- **E2e (Task 15):** with `DISTRIBUTION_ADAPTER=fixture` the ports keep what was "sent" in a directory store; `peekFixtureLetters()` reads
  it. The approve action's `after()` and the pump both run the same step, and a repeat sends nothing twice.
- **Release:** nothing new to set on Vercel. `CRON_SECRET` already exists. Letters stay off until Shlok sets the three Resend settings on
  Production.
