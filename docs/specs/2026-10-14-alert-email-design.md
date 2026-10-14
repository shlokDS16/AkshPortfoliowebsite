# 2.9 Alert email: one plain-English email per incident

Status: approved by delegation 2026-10-14 (Shlok asked for 2.9 by name; decisions below made on his behalf, see "Decisions").
Parents: ADR-001 row "Owner alerting" (red strip + one plain-English email per incident) and s8.2 (three clocks);
Phase 2 spec s10 (paused and quota states); progress.md 2.9.

## 1. Problem
The desk strip shows trouble only to someone who opens the desk. The external uptime monitor (ADR-001 s8.2) only says
"/api/health is down", in technical words, and whether it exists is unconfirmed. A non-technical owner needs one email that says,
in words he understands, what is wrong and what to do, and later one email that says it is fixed.

## 2. Behaviour
- A new step `alerts:email` runs LAST in both clocks: `SERVER_PUMP_STEPS` (every 15 min) and `SERVER_DAILY_STEPS` (once a day).
  Last, so the steps before it have written their heartbeats. Each clock therefore alerts on the other's silence: a dead pump is
  caught by the daily run, a dead daily job by the pump. The uptime monitor stays the third clock.
- The step reads the PRIVATE health report (`getHealthReport` + `readQueueAge`, `src/modules/ops/health.ts`). The red set is
  the `job` of every check with `ok = false`, plus `"queue"` when `queue.ok = false`.
- Incident rules (one open incident at most; all decisions in one database function under a lock):
  - Red set non-empty, no open incident: open one (keys = red set, `last_red_at = now`). Email "open".
  - Red set non-empty, open incident: add the new keys, `last_red_at = now`. No new email (one per incident).
  - Red set empty, open incident, `now - last_red_at >= 30 min`: close it. Email "closed" only if its "open" email was sent.
    The 30-minute hold stops a check that flaps around its limit from sending pairs of emails.
  - An "open" or "closed" email that was decided but not marked sent (the send failed) is returned again by the next run, so a
    failed send is retried by the next clock tick. The provider's idempotency key (`incident-<id>-open|closed`) makes a retry
    after an unrecorded success harmless.
- Email "open". Subject: `Aksh Research Desk: something needs a look`. Body (plain text): one line per red item, from
  `describeStale` and `describeQueue` (already plain English, already used on the desk strip); then "Nothing you saved is lost.";
  then what to do: "Open the desk to see the details: <origin>/desk. If it is still red tomorrow, tell Shlok." No heartbeat
  `detail` beyond what `describeStale` already shows; never a secret, URL with a token, or stack trace.
- Email "closed". Subject: `Aksh Research Desk: all clear again`. Body: "Everything is running again (it was first noticed
  <IST date and time>)." plus the desk link.
- The step's own result text (its heartbeat detail) says what it did: `no incident`, `opened incident 3, emailed`,
  `incident 3 still open`, `closed incident 3, emailed`, `email off: RESEND_API_KEY or ALERT_EMAIL is not set`, or the send error
  (status code and provider message, at most 160 chars, never the key). A send failure fails the step (heartbeat `ok = false`) but
  never stops or fails the steps before it. `alerts:email` is NOT added to `HEALTH_RULES` (an alerting failure must not
  itself become an incident loop); it is visible in the heartbeat log.

## 3. Sending
- Provider: Resend REST, `POST https://api.resend.com/emails`, JSON `{from, to, subject, text}`, bearer `RESEND_API_KEY`,
  header `Idempotency-Key`. Plain `fetch` with a 10 s timeout, no SDK dependency. Verify the request shape and the
  idempotency header against Resend's current docs before coding; do not rely on memory.
- A port `AlertMailer` (`send(message): Promise<{ ok: true } | { ok: false; message: string }>`, never throws), a Resend adapter in
  `src/lib/providers/`, and a fake for tests, the same pattern as the other providers there.
- Env (server only, through `src/lib/env.server.ts`, all optional; the feature is off unless the first two are set):
  - `RESEND_API_KEY` (already in `.env.example`, Phase 5 label; now also used here).
  - `ALERT_EMAIL`: one address or a comma-separated list. Defaults to `ADMIN_EMAIL` when empty.
  - `RESEND_FROM`: defaults to `Aksh Research Desk <onboarding@resend.dev>`.
- Without a verified domain, Resend delivers `onboarding@resend.dev` mail only to the Resend account owner's own address. Until a
  domain is verified (Q9), `ALERT_EMAIL` must be that address (Shlok's), and Aksh is not emailed. Recorded as Q36.

## 4. Data (migration 0015)
- `private.alert_incidents`: `id bigint identity`, `keys text[] not null`, `opened_at`, `last_red_at`, `closed_at` (null = open),
  `open_sent_at`, `closed_sent_at` (timestamptz). A partial unique index allows one row with `closed_at is null`.
  RLS on, no policies (service role only through the functions below).
- `public.alert_step(p_red text[]) returns table(incident_id bigint, kind text, keys text[], opened_at timestamptz)`: takes
  `pg_advisory_xact_lock`, applies section 2's rules with `now()`, and returns at most one email to send (`kind` in
  `open`, `closed`) or no row. Security definer, `search_path = ''`.
- `public.alert_sent(p_id bigint, p_kind text)`: stamps `open_sent_at` or `closed_sent_at` (only if null).
- Grants: execute on both to `service_role` only; revoked from `public`, `anon`, `authenticated` (anon's executable set stays
  exactly the four functions it has today).

## 5. Tests
- pgTAP (`supabase/tests/0015_alerts.test.sql`): open, add keys without a second email, 30-min hold, close with and without a
  sent open email, retry of an unsent open and an unsent close, one open incident under the index, grants (anon and
  authenticated cannot execute; anon's executable list unchanged).
- Unit: the step (fake repo, fake mailer, fake db calls): off when unset, open/still-open/closed texts, send failure fails the
  step and does not mark sent, the email body has no heartbeat detail beyond `describeStale`; the Resend adapter (stubbed fetch):
  request shape, idempotency header, non-2xx and timeout become `{ ok: false }` without the key in the message; env parsing of
  the list and the defaults.
- Step order: `alerts:email` is the last entry of both server step lists.

## 6. Out of scope
The desk strip wording ("The uptime monitor has emailed Shlok and Aksh") stays as accepted (Q14). Quota and paused states
(spec s10) are not separate alerts; they show on the desk. No SMS, no digest, no per-check mute.

## Decisions (made on delegation; cost if wrong)
- D1 Resend over Gmail SMTP: already the stack's email provider and in `.env.example`; cost: Aksh is not emailed until a domain is
  verified (Q36). Switching later is one adapter.
- D2 A close email as well as the open email: a non-technical owner otherwise never learns it is fixed; cost: one extra email.
- D3 30-minute hold before closing: cost: the all-clear arrives up to 30 min (one or two pump ticks) late.
- D4 Alerting is not itself a health rule: cost: a broken mailer is visible only in the heartbeat log.
