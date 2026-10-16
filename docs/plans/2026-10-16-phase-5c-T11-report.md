# Phase 5c Task 11 report: Resend letters adapter, fixtures, env, no-send guards

Built by desk-backend (opus), 2026-10-16. Branch `phase-5c-letters`, code commit `fe6dfa4` on `ca89680`. Not pushed. Local
Supabase only. No test, script or run here sent an email or called Resend with a key. One incident is set out below: during the
build, unauthenticated GETs reached Resend and Google.

## Built
- `src/lib/providers/letters.ts` (86 lines): the ports, as types only.
  - `LetterTransport` is the raw adapter.
  - `LetterSender` and `ContactMirror` are what callers get.
  - `ApprovalCheck` is the database question.
  - `LetterResult<T>` with the failure kinds `not_approved | invalid | rate_limited | quota | not_found | refused | unavailable`.
  - `LETTERS_OFF_LINE`.
- `src/lib/providers/resend-letters.ts` (198): the Resend transport. It is the only non-test file, apart from the alert
  mailer, that names `api.resend.com`. Its header records the reference pages read on 2026-10-16 and the request and response
  shapes:
  - `emails/send-email`, `dashboard/emails/idempotency-keys`;
  - `broadcasts/create-broadcast`, `get-broadcast`, `send-broadcast`, `dashboard/broadcasts/manage-broadcasts`;
  - `contacts/list-contacts`, `create-contact`, `add-contact-to-segment`, `delete-contact`, `update-contact` (read, but not used);
  - `api-reference/rate-limit`, `errors`, `pagination`.
- `src/lib/providers/resend-http.ts` (95): the one HTTP call both Resend adapters make.
  - The bearer header carries the key, and nothing else does.
  - `redirect: "error"`, `no-store`, and a timeout on every call.
  - Capped reads: 8 KB for an error body, 256 KB for a success body.
  - From an error it keeps only `name`, the cleaned `message` and `retry-after`.
  - It has no host of its own. Only GET, POST and DELETE are typed, so there is no update verb.
- `src/lib/providers/resend-mailer.ts`: now calls `resend-http.ts`. Its messages are byte-identical, and
  `resend-mailer.test.ts` is unchanged and green.
- `src/lib/providers/letters-guard.ts` (81): `guardLetterTransport(transport, { approvals, adminEmail })`. It is the only
  holder of a transport (see Guards).
- `src/lib/providers/fixture-letters.ts` (147): the fixture.
  - It keeps its store in memory (`globalThis`), or in a directory when the database is local. A directory store lets the
    Playwright runner read what the dev server "sent".
  - Helpers: `peekFixtureLetters()`, `resetFixtureLetters()`, `unsubscribeFixtureContact()`, `fixtureLettersDirectory()`.
  - It behaves like Resend in these ways:
    - a repeat idempotency key is dropped;
    - a draft stays a draft until it is sent;
    - a sent broadcast goes only to the segment's subscribed contacts;
    - sending twice is refused;
    - an upsert keeps `unsubscribed`.
- `src/lib/providers/index.ts` (286):
  - `lettersMode(env)` is pure and returns `resend | fixture | off` with a reason (`not_set_up`, `not_production`,
    `test_or_ci`, `fixture_refused`, `bad_setting`).
  - `createLetterPorts(env, { approvals, fetch? })` returns `LetterPorts | null`. It never throws. A malformed setting is off,
    and is logged by the setting's name only.
- `src/lib/env.server.ts`: new optional `RESEND_LETTERS_KEY`, `LETTERS_FROM`, `LETTERS_SEGMENT_ID`, plus `CI`, `NODE_ENV`,
  `VITEST` (so letters can refuse a test or CI run). The three letters settings are trimmed only. Their shape is checked where
  letters are built, as for the alert key, so a typo turns letters off and does not stop the app.
- `supabase/migrations/20261018000025_letters_gate.sql` (appended; not on hosted): two read-only definer functions, service_role
  only, with `search_path = ''`:
  - `letters_send_live(p_id uuid, p_kind text, p_broadcast_id text) returns boolean`
  - `letters_confirmation_live(p_id uuid, p_email text, p_sent_at timestamptz) returns boolean`
- `src/test/no-outbound.ts`: the unit fetch guard now blocks `googleapis.com`, `resend.com` and every subdomain of either
  (`youtube.googleapis.com`, `eu.api.resend.com`). It matches on the parsed host name, after removing a trailing dot.
- `.env.example`:
  - A Letters block with `RESEND_LETTERS_KEY`, `LETTERS_FROM`, `LETTERS_SEGMENT_ID`, all `[OPTIONAL-P5]` and unset. It says
    the key must be full access and kept separate from the sending-only alert key.
  - `RESEND_AUDIENCE_ID` is relabelled `[UNUSED]`, since Segments replaced Audiences.
  - The `DISTRIBUTION_ADAPTER` note now covers letters.
  - No committed `.env` was touched (only `.env.example` is tracked).

## Guards, and how each is proved
1. **The letters env is set.** `createLetterPorts` is null unless all three settings are set. `LETTERS_FROM` must be one
   address, or `Name <address>`, on a domain that is not `resend.dev` (see Q52). The key must be shaped `re_...`, and the
   segment must be a uuid.
   - `letters-factory.test.ts`: all 8 setting subsets x 5 `VERCEL_ENV` values; only the full set on `production` is on
     (39 off cases). A bad shape is `bad_setting`: null, logged without the value.
   - `resend-letters.test.ts` "refuses ...": each setting is named, its value never.
2. **Production only, never a preview, CI or a test.** `VERCEL_ENV` must be exactly `production`, and `CI` (unless `0` or
   `false`), `VITEST` and `NODE_ENV=test` each turn letters off. Vercel sets `CI` at build time only (Vercel's
   system-environment-variables page, read 2026-10-16), so production at run time is not blocked.
   - Proved by `letters-factory.test.ts`.
3. **A recorded approval for exactly that send.** service_role cannot read `letter_sends` or `subscribers` (0024 grants), so
   the guard asks SQL through the injected `ApprovalCheck`. It calls nothing unless the answer is exactly `true`. A throw is a
   no, and an id that is not a uuid is refused before the database is asked.
   - `sendSelfTest` needs `letters_send_live(id, 'self_test', null)`. Its recipient is fixed to `ADMIN_EMAIL` and its key is
     `self-test-{id}`.
   - `sendConfirmation` needs `letters_confirmation_live(id, email, sent_at)`. The confirmation must have been issued by
     `letters_issue_confirmations` (admin actor) in the last hour, to that address, at that time, and still be unused and
     unexpired. Its key is `confirm-{id}-{sent_at}` (spec s8.5).
   - `createBroadcast` needs `letters_send_live(id, 'subscribers', null)`: a claimed send under a live lease of 10 minutes
     (the claim's own re-lease window) with no broadcast recorded yet. The draft is named `letter-{id}` and goes to the
     configured segment.
   - `sendBroadcast` needs `letters_send_live(id, 'subscribers', broadcast_id)`: that exact broadcast id recorded. Then it
     reads the broadcast, and sends it only if it is a `draft` named `letter-{id}` in our segment:
     - `scheduled`, `queued` or `sent` returns `already_sent` and sends nothing. Broadcasts take no idempotency key (verified
       on the reference page), so this is what stops a crash from sending twice.
     - Any other name, segment or status is refused.
   - Proved by:
     - `letters-guard.test.ts`: answers `false` and throw, every method; the derived recipient and keys; each broadcast state.
     - `letters-factory.test.ts`: the real adapter behind the guard calls the stub fetch zero times without an approval.
     - `supabase/tests/0025_letters_send_live.test.sql` (24 tests): approved but not claimed; claimed; wrong kind; a broadcast
       id not recorded, recorded, or another; an old lease; sent; self tests; unknown ids and nulls. Also each confirmation
       case: the address case, the time cut to milliseconds, another time, another address, over an hour old, waiting,
       confirmed. And the grants.
4. **Off is plain.** Null ports mean the desk shows `LETTERS_OFF_LINE`, and the sign-up is not rendered (Task 13/14).
   `lettersMode(env)` gives the reason for a log line.
5. **No network in tests.** Adapters take an injected fetch only.
   - `resend-letters.test.ts`: an adapter built without a fetch meets the setup guard and returns `could not reach Resend`.
   - `no-outbound.test.ts`: the subdomain, upper-case and trailing-dot cases, and a test that a host which merely ends in the
     same letters is not blocked.
   - The fixture never calls fetch (spy).
6. **Nothing else names the endpoints.**
   - `grep -rln api.resend.com src` lists, outside tests and `src/test/`, only `resend-letters.ts` and `resend-mailer.ts`.
   - A test pins this.
   - A test also pins that `resend-letters.ts` contains no `PATCH`, so nothing here can undo a reader's unsubscribe.

Other adapter behaviour, all tested with stubs:
- Each endpoint's method, URL, headers, idempotency header (only on `/emails`) and body.
- Contacts pagination (`limit=100`, `after=<last id>`, at most 20 pages). An unreadable, empty-but-more or endless list is
  `unavailable`, never a partial list.
- `upsertContact` is add-to-segment by address. A 404 makes it create the contact in the segment, without `unsubscribed`.
- `deleteContact`: a 404 counts as success.
- How Resend's answers are typed:
  - a 429 is `rate_limited` with `retryAfterSeconds`; `daily_quota_exceeded` and `monthly_quota_exceeded` are `quota`;
  - a 5xx, a timeout or a network error is `unavailable`;
  - a 404 is `not_found`, and any other 4xx is `refused`.
- Messages have the key and any email address removed, control characters flattened, and a 160-character cut.
- 10 s default timeout.
- Pacing: at least 120 ms between calls, under Resend's 10 requests a second per team, which the alert email shares.

## Env names
- `RESEND_LETTERS_KEY`, `LETTERS_FROM`, `LETTERS_SEGMENT_ID`: optional, unset, and only Shlok sets them, on Production.
- `CI`, `NODE_ENV`, `VITEST`: read so that letters refuse to send there.
- `DISTRIBUTION_ADAPTER=fixture`: as before.

Push nothing to Vercel now. Letters stay off until the release steps in the plan (domain, tracking off, segment, Q41/Q45).

## Evidence (final, at fe6dfa4)
- `rtk pnpm test`: **436 files, 5983 tests passed**. The new files are `resend-letters` (28 tests), `letters-guard`,
  `fixture-letters`, `letters-factory` (13), the env tests (+3) and the guard tests (+4).
- `pnpm typecheck`: no errors. `rtk pnpm lint`: clean.
- `pnpm supabase db reset`, then `pnpm supabase test db`: **35 files, 2637 tests passed**.
- `pnpm db:types`: +8 lines, additions only.
- `rtk pnpm build` with the CI placeholder env (and `CI=1`): built. `pnpm check:bundles`: passed, 55 routes.
- TDD:
  - Each new test file was run before its module existed and failed.
  - The pgTAP file failed with "planned 24, ran 0" before the functions existed.
  - The widened guard test failed (two cases) before the guard changed. See the incident below.

## Incident: unauthenticated GETs left the machine while the test guard was being changed
- At 08:30:50 the new guard test ran its first, failing run, before the guard was widened. That run's fetches to
  `https://youtube.googleapis.com/youtube/v3/videos` and `https://eu.api.resend.com/emails` went out for real, three times each.
  The second one failed at "fetch failed".
- At 08:31:10 and 08:31:20 I had broken the guard: a shell edit turned the escaped dot `\.$` into the bare `.$`. Its regex then
  cut the last letter off every host name, so the guard blocked nothing. Every URL in `no-outbound.test.ts` was fetched for
  real, three times each: `www.googleapis.com`, `api.resend.com/broadcasts`, `/contacts`, `/emails`,
  `youtube.googleapis.com`, `eu.api.resend.com`, `api.resend.com.`.
- Every one of these was a plain GET with no Authorization header, no key and no body. No address was sent, nothing could be
  sent, and no account was touched.
- Fix: corrected through the Edit tool, then checked offline with `node -e` on every case before the next test run. Since then
  every run has been blocked as intended.
- Lesson: check a change to a network guard offline before running the tests it protects.

## Deviations (each the conservative reading)
1. **Two SQL functions appended to 0025** (not on hosted), plus a new pgTAP file, and the privileges inventory updated: the
   service_role list grows by 2, and the letters count goes from 15 to 17.
   - Why: the brief requires a recorded approval row for exactly that send, and the adapter layer cannot read one. service_role
     has no select on `letter_sends`.
   - They live in 0025 so that the release still lists exactly 0024 and 0025.
2. **`createLetterPorts(env, { approvals, fetch? })`** instead of `createLetterPorts(env)`. The guard needs the database
   check, and `fetch` lets a test inject a stub.
3. **The guarded sender has `sendSelfTest` and `sendConfirmation`** instead of `sendOne(to, ...)`. The recipient and key come
   from the approval, so a caller cannot choose them. The raw `sendOne` exists only on the transport, and no caller can reach
   the transport.
4. **`sendBroadcast` reads the broadcast before sending**, inside the guard, and answers `sent_now` or `already_sent`. Task 12's
   read-before-retry still applies; this is the floor under it.
5. **The alert adapter was changed** (the plan said not to; the brief said not to duplicate its HTTP code): it now calls the
   shared `resend-http.ts`. Its behaviour and messages are unchanged, and its tests are untouched and green.
6. **`upsertContact` never updates a contact.** That is the safer path for a reader who unsubscribed at Resend. "A contact
   Resend does not have answers 404 to add-to-segment" is not stated on the page. It is the reading I chose; if it is wrong, a
   new reader's upsert fails as `refused` and nothing is sent to them.
7. **The fixture uses a directory store against a loopback database**, as `fixture-anchor.ts` does, so that the e2e (another
   process) can read the store. Otherwise it is in memory.
8. **`.env.example`: `RESEND_AUDIENCE_ID` relabelled `[UNUSED]`.** It is still in the template; Q52 records the domain reading.
9. **defenso `guard_code` could not be run.** ToolSearch is not among this agent's tools, as in Task 10. In its place I did a
   manual pass over these points:
   - path injection: ids `[A-Za-z0-9-]{1,100}`; addresses strict, encoded, with `/?#` excluded; the segment a uuid;
   - header injection: no control characters in from or subject; printable idempotency keys;
   - the key only in the header;
   - addresses redacted from messages;
   - the approval check fails closed;
   - capped reads and pages;
   - the SQL functions: definer, empty search_path, boolean only, service_role only.

   The Task 16 opus review should take the guard and the two SQL functions as one security row.

## New strings (pending Shlok's approval)
- Shown on the desk (stored as a send's problem):
  - "No approved send matches this."
  - "Resend answered {status}: {Resend's words}" (the pattern exists in 2.9)
  - "Resend did not answer in time" and "could not reach Resend" (both exist)
  - "Resend's answer had no readable broadcast id" (also "... broadcast", "... contact list", "... contact list (too many pages)")
- Shown for a refused input (code paths; Task 12 decides whether any reaches the screen):
  - "not an email address"
  - "the subject must be 1 to 200 characters on one line"
  - "the email body is empty or too long"
  - "the broadcast name is not valid"
  - "not a broadcast id"
  - "the idempotency key is not valid" (exists)
- Settings, in a log line only:
  - "RESEND_LETTERS_KEY does not have the shape of a Resend key (re_...)"
  - "LETTERS_FROM must be an address, or Name <address>, on one line"
  - "LETTERS_FROM must be on your own verified domain, not resend.dev"
  - "LETTERS_SEGMENT_ID must be a Resend segment id"
  - "letters: off, {that problem}"
  - "letters: DISTRIBUTION_ADAPTER=fixture is refused on a Vercel deployment; letters are off until it is removed"
- Fixture only: "Resend answered 422: the broadcast is not a draft", "Resend answered 404".
- The off line "Email is not set up yet. Letters still publish to the archive." is spec s8.8, now the constant
  `LETTERS_OFF_LINE`.
- The `.env.example` Letters block text.

## Notes for Task 12
- Wire `ApprovalCheck` in `send-rpc.ts`:
  - `sendIsLive` calls the rpc `letters_send_live(p_id, p_kind, p_broadcast_id)`;
  - `confirmationIsLive` calls `letters_confirmation_live(p_id, p_email, p_sent_at)`;
  - return `data === true`; on an error, return false.
- `deliverLetter` order:
  1. `claim_letter_send()`
  2. reconcile
  3. `sender.createBroadcast({ sendId }, content)`. This needs no broadcast recorded yet.
  4. `finish_letter_send(id, 'sending', broadcastId)`
  5. `sender.sendBroadcast({ sendId }, broadcastId)`
  6. `finish_letter_send(id, 'sent', ...)`, on either `sent_now` or `already_sent`.

  A claim that hands back a `sending` row that already has a broadcast id skips step 3.
- Pass `sent_at` from `letters_issue_confirmations` as the string PostgREST returns. The SQL accepts it cut to milliseconds,
  and the idempotency key uses the same string.
- A confirmation must be sent within an hour of being issued, or the check says no. Then call `letters_confirmation_failed`
  and issue it again.
- `rate_limited`: defer the step (honour `retryAfterSeconds`). `quota`: stop the batch for today. `not_approved`: record
  `failed` with its message.
- The desk off state: `createLetterPorts(...) === null`. Use `lettersMode(serverEnv())` for the reason in a heartbeat.
