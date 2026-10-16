# Phase 5c Task 10 report: migrations 0024 (letters, readers, sends) and 0025 (letter gate), pgTAP

Built by desk-backend (opus), 2026-10-16. Branch `phase-5c-letters`, stacked on `phase-5b-videos`. Code commit `4fcc8ad`. Not pushed.
Local Supabase only. Nothing is sent anywhere: no migration or test calls Resend or sends an email. A "confirmation" is a row and a
token. A "send" is a row whose status changes.

## Confirmations run first ("Before Task 10")
- `private.distribution_gate_failures` is defined only in `20261017000023_distribution_gate.sql`, and that body is the one
  0025 replaces. `c_policy` is `sebi-unreg-2026-07-v1.2`. 0023 was the last migration, so 0024 and 0025 were free.
- Q9/Q36 (verified domain): still open. The build does not need a domain. Q41 and Q45 defaults stand (confirmation emails go
  only when Aksh presses; no postal address).

## Built
**0024 `20261018000024_letters.sql`** (spec s8.2, s8.5)
- `items_kind_check` now includes `'letter'`, and every earlier kind is kept. Trigger `items_guard_letter`: a letter has no
  `company_id`, `theme_id` or `data_as_of`, and an item cannot change into or out of `letter` (23514).
- `letters_pepper` is written to `private.settings` with `encode(extensions.gen_random_bytes(32), 'hex')` and
  `on conflict do nothing`. `letters_signup` is not written, so sign-up starts off.
- `subscribers`: the spec's columns only, with no IP, name or user agent. The email check is as specced, lower case. A unique
  partial index on `confirm_token_hash`.
- `subscriber_events`: append-only (`private.reject_mutation`). Each row is an HMAC-SHA256 of the address with the pepper
  (32 bytes), plus the notice version and the time. No row holds an address (tested).
- `letter_sends`: the spec's columns. A partial unique index allows one live subscribers send per letter. A second index
  allows at most one subscribers send in flight across all letters. A forward-only status trigger allows only
  approved -> sending|expired|cancelled and sending -> sent|failed. The same trigger stops any change to what was approved,
  and stops delete. Truncate is blocked.
- `letters_signup_events` (new, see deviations): who opened or closed sign-ups, and when.
- `item_revisions_freeze_sent_letter`: a letter whose subscribers send is `sending` or `sent` takes no new revision (D87).
- Four anon doors and eight service_role reader functions. Their grants are listed below.

**0025 `20261018000025_letters_gate.sql`** (spec s8.4, s8.6)
- `private.letter_gate_failures(item, revision, struct)` checks 13.1 to 13.4 and never raises:
  - 13.1: the subject is 1 to 120 characters and the note at most 4,000.
  - 13.2: the record is `letter/1` with 1 to 20 entries. Each entry names, by `revisionId`, the current passed revision of a
    public item that is not a letter. No entry may repeat. Each entry copies `title`, `learningObjective` and `changeReason`
    exactly.
  - 13.3: for each entry, `private.ledger_gate_item_failures(entry item, company, holds, IST today)`. Each failure is
    recorded as `{rule '4', code '13.3', entry n, ledgerCode, message 'Entry n: ...'}`.
  - 13.4: a letter that was sent cannot publish another revision.
  - Entry items are held `for share` until the decision commits.
- `private.distribution_gate_failures` is replaced with the same signature. The video branch is kept verbatim, and letters
  are dispatched to the new function.
- `private.gate_policy()` reads `c_policy` from the current body of `publish_revision`.
- The send doors: `approve_letter_send`, `claim_letter_send`, `finish_letter_send`, plus the helpers `expire_letter_sends`
  and `letter_send_check`.

## Files
- Created: `supabase/migrations/20261018000024_letters.sql` (408 lines), `supabase/migrations/20261018000025_letters_gate.sql`
  (381), `supabase/tests/0024_letters.test.sql` (252, 93 tests), `supabase/tests/0025_letters_gate.test.sql` (269, 78 tests).
- Modified: `supabase/tests/0002_function_privileges.test.sql` (plan 29 -> 36: the authenticated and service_role
  inventories, six new letters assertions, anon refused `approve_letter_send`), `supabase/tests/0015_alerts.test.sql` and
  `supabase/tests/0016_pump_clock.test.sql` (the anon allowlist +4; the 0015 exact count 4 -> 8),
  `src/lib/supabase/database.types.ts` (`pnpm db:types`, +321 lines, additions only).

## Evidence
- `pnpm supabase db reset`: clean. `pnpm supabase test db`: **34 files, 2613 tests, all pass** (0024: 93, 0025: 78).
- TDD: both new files were run before their migration existed and failed ("planned N, ran 0"). The 13.2 path check below
  was seen failing (`have: pass`) before it was added.
- `rtk pnpm test`: **432 files, 5911 tests pass**. The first run of the session reported a failure. The two runs after it
  (plain `vitest run` and `rtk pnpm test`) were both green, so the first was a flake; its name was not captured.
- `pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- Every existing gate test passes unchanged. The only edited existing tests are the three privilege inventories.

## Gate diff summary
- `publish_revision()` is **not restated**. 0023's body still holds: v1.2, the knowledge checks, the ledger and case checks,
  the `for share` themes lock and the distribution call. 0023's structure test still passes.
- `private.distribution_gate_failures`, 0023 against 0025 (checked by `diff` over the extracted blocks): exactly two changes.
  `create` became `create or replace`, and three lines were added before the video test:
  `if p_kind = 'letter' then return private.letter_gate_failures(p_item_id, p_revision_id, p_struct); end if;`.
  The 12.1-12.4 code and its comment and revoke are byte-identical.

## The anon surface (exact)
- **anon and authenticated execute exactly these four** (all `security definer`, `search_path = ''`). None of them raises
  for a refused input. Each raises 22023 only for an over-long argument.
  - `public.letters_open() returns boolean`: true when the switch is `on` and fewer than 950 readers are confirmed.
  - `public.letters_request(p_email text, p_notice_version text, p_adult boolean) returns void`:
    - The address is trimmed and lower-cased. Over 320 characters raises 22023, and so does a notice version over 64.
    - It stores nothing, silently, when: sign-up is closed; the address is malformed; `p_adult` is not true; the notice is
      not `letters-2026-10-v1`; the address is already waiting, confirmed, or `sent` with a live link; 100 requests were
      stored this IST day (counted from `requested` events since IST midnight); or 300 are waiting.
    - It serialises on an advisory lock, so the caps hold under concurrency.
  - `public.letters_confirm(p_token text) returns boolean`: the token's sha256 must match, the row must be `sent` and not
    expired. Success sets `confirmed` and clears the hash. A token is shaped `^[A-Za-z0-9_-]{43}$`; over 128 characters
    raises 22023.
  - `public.letters_leave(p_email text) returns void`: deletes any row for the address and logs `left` only if one existed.
    The caller gets the same answer either way.
- anon has **no grant on any letters table** (`subscribers`, `subscriber_events`, `letter_sends`, `letters_signup_events`):
  a select raises 42501 (tested). No new view.
- **service_role only:**
  - `letters_issue_confirmations(p_actor, p_ids) returns table(id, email, token, sent_at)`
  - `letters_confirmation_failed(p_id)`
  - `letters_bin(p_actor, p_ids) returns integer`
  - `letters_erase(p_actor, p_id) returns integer`
  - `letters_purge() returns integer`
  - `letters_mark_left(p_emails) returns integer`
  - `confirmed_subscribers() returns table(email)`
  - `set_letters_signup(p_actor, p_on) returns boolean`
  - `approve_letter_send(p_actor, p_item_id, p_revision_id, p_kind) returns letter_sends`
  - `claim_letter_send() returns letter_sends`
  - `finish_letter_send(p_id, p_status, p_broadcast_id, p_recipients, p_problem) returns letter_sends`

  Every function above that takes `p_actor` refuses a non-admin with 42501 (checked against `profiles.role`).
- **authenticated** (the admin session): SELECT on the four tables, with RLS gated on `private.is_admin()`. A non-admin
  session reads zero rows (tested). No API role has INSERT, UPDATE or DELETE on them (tested for the admin session and for
  service_role).
- **No API role** executes the twelve private helpers and trigger functions (tested).

## Refusal codes of the send doors (for Task 12)
- `approve_letter_send` raises:
  - 42501 for a non-admin actor.
  - 22023 for an unknown kind.
  - 55000, with a plain message, for every state refusal: not a letter; not its current revision; not public; latest
    decision not a pass under the current policy; a rule 13 failure (its first message); already sent or waiting; another
    letter in flight; 5 test copies today.
- `claim_letter_send` returns a row of nulls when nothing is left to send.
- `finish_letter_send` raises:
  - 22023 for bad arguments.
  - P0002 for an unknown id.
  - 55000 if the send is not in `sending`, or if a different broadcast id is already recorded.

## Deviations (each is the conservative reading, with the reason)
1. **The send doors live in 0025, not 0024.** They re-run the letter gate, and 0025 holds the gate. 0024 keeps the tables,
   the triggers and the reader functions.
2. **Migration files are 408 and 381 lines.** The plan's limit is 300. The plan names exactly two files, and the release step
   says "exactly 0024 and 0025". SQL migrations here already exceed 300 (0010 has 526 lines, 0011 has 437, 0001 has 429).
   The test files are under 300.
3. **`letter_sends.gate_decision_id` has no foreign key.** With one, the existing core test (TRUNCATE `gate_decisions`
   answers with its own append-only error) failed with a foreign-key error instead. `gate_decisions` is never deleted.
   The id is written only by `approve_letter_send`, from the decision it read. `item_id` and `revision_id` keep their keys.
4. **`set_letters_signup` logs to a new append-only table, `letters_signup_events`** (`signup_on`, `actor`, `at`; admin
   select only). The spec says "records an event" without naming a table. The `subscriber_events` check is fixed by the
   spec and is consent-only, so I did not widen it.
5. **`letters_issue_confirmations` also returns `sent_at`.** The spec's idempotency key `confirm-{id}-{sent_at}` needs it.
6. **"Current c_policy" is read from `publish_revision`'s own body** (`private.gate_policy()`), not from a second constant.
   A later policy bump moves both at once, and pgTAP pins the value at v1.2.
7. **"A pass decision under the current policy" means the revision's latest decision.** On a tie the failure wins. A
   re-run of the gate that failed after the pass (letter 50) therefore blocks a send, and so does a later pass under v1.1.
8. **13.2 checks more than three fields.** For a page that names a company, `holdsPosition` and `companyName` must equal the
   live values, because the email prints "Position: ...". A page that names no company must carry neither.
   - `path`, the one link the machine adds, must match `^/[a-z0-9-]+(/[a-z0-9-]+)*$`, so a forged entry cannot put an
     outside address in an email.
   - Also checked: no entry repeats, and types are strict (a JSON number is not a title). All of these fail under 13.2 with
     the spec's message.
9. **13.4 is in the gate as well as the trigger.** The trigger stops new revisions of a sent letter. The gate stops
   publishing a revision written before the send.
10. **A `sent` row whose link expired goes back to `waiting` on a new request**, so Aksh can send a fresh link. With a live
    link, or once confirmed, a new request changes nothing.
11. **`claim_letter_send` also re-leases a send whose worker stopped:** one still `sending`, claimed more than 10 minutes ago.
    - With a broadcast id it is handed back as it is: the step must read the broadcast first (spec s8.6).
    - Without one it is re-checked like a new approval.
    - A refused approval moves approved -> sending -> failed in one transaction, which the forward-only trigger allows.
    - Claims serialise on an advisory lock as well as `for update skip locked`.
12. **The rule 13 checks also run at approval**, so a stale letter is refused when Aksh presses, not only at claim. A self
    test records `recipients_at_approval = 1`.
13. **`sends_used`** counts the confirmation emails issued to a row. The spec lists the column without saying what it counts.
14. **`letters_request` also closes at 950 confirmed readers** (it calls `letters_open()`). The spec lists only "the switch
    is off".

## New strings (pending Shlok's approval; not in s15 unless marked)
Shown to Aksh as gate reasons:
- "A letter's subject must be 1 to 120 characters."
- "A letter's note must be at most 4,000 characters."
- "A letter needs 1 to 20 entries. Make the letter again."
- "This letter was sent to subscribers and cannot change."
- "Entry {n}: {the ledger's rule 4 or position message}"
- "Entry {n} changed or is no longer public. Make the letter again." (spec s8.4)

Approval refusals:
- "This is not a letter."
- "Approve the letter's current public revision."
- "The letter is not public."
- "The letter's last gate decision is not a pass under the current policy. Publish it again."
- "This letter has already been sent to subscribers, or its send is waiting."
- "Another letter is being sent. Wait until it has gone."
- "5 test copies sent today. The next can go tomorrow."
- "The letter changed after you approved it." (s15)

Raised to code only (not for the screen):
- "items: a letter names no company, concept or figures-to date"
- "items: a letter stays a letter, and no other item becomes one"
- "letters: a letter sent to subscribers cannot get a new revision"
- "letter_sends: what was approved cannot change"
- "letter_sends: status cannot go from % to %"
- the "...: admin only" and "...: argument too long" messages

## defenso
I could not run `guard_code`. ToolSearch, which loads it, is not among this agent's tools, so the tool cannot be reached.
In its place I did a manual pass over the anon doors:
- input bounds and silent refusals;
- the same answer whether an address exists or not;
- only token hashes stored, 256-bit tokens;
- definer functions with `search_path = ''`;
- no table grants to anon;
- advisory locks on the caps;
- no address in the consent log;
- the email `path` link check (deviation 8).

The Task 16 opus review should treat the anon doors as its first security row.

## Notes for Task 12
- The notice version `letters-2026-10-v1` is pinned in `private.letters_notice_version()`. The app's constant must equal it;
  add a vitest that reads the migration, as `policy.test.ts` does.
- Build email links from `siteUrl + entry.path`. The gate already refuses any path that is not on this site.
- `claim_letter_send` can hand back a `sending` row that already has a broadcast id. `deliverLetter` must read the broadcast
  and send it only if it is still a draft.
- `ITEM_KINDS` in TypeScript does not include `letter` yet. That is out of scope for this task.
