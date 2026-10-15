# Database-driven pump clock (2026-10-14)

Status: building. Migration `20261014000016_pump_clock.sql`.

## Why

The ingestion queue needs a 15-minute clock. GitHub's scheduled `pump.yml` (cron 7,22,37,52) has not fired for hours; only manual runs work. The Vercel cron is once a day (Hobby). Shlok cannot be asked to create accounts, so the clock lives where the project already is: hosted Supabase (free plan includes `pg_cron` and `pg_net`).

## Shape

```
pg_cron (4,19,34,49 * * * *)  ->  private.pump_tick()
   -> insert private.pump_tickets (token uuid)
   -> net.http_post(<site>/api/jobs/tick, header x-pump-ticket: <token>)      (pg_net sends after commit)
POST /api/jobs/tick  -> public.redeem_pump_ticket(token)  (secret-key client)
   -> false: 401      -> true: 202 at once, SERVER_PUMP_STEPS run inside after()
```

There is no shared secret anywhere in the database or the migration. A ticket is a one-use random UUID that only the database can mint and only the secret-key client can redeem, valid for 2 minutes. Anyone who guesses nothing gets 401 without a database call (non-UUID) or with one cheap RPC (UUID).

The target (the site's own origin) is not in the migration: the first production pump run calls `public.register_clock_target(NEXT_PUBLIC_SITE_URL)` through the step `clock:register`, which is first in `SERVER_PUMP_STEPS` and `SERVER_DAILY_STEPS`. Preview and local runs return "not production" and register nothing, so a preview deploy can never hijack the clock.

## Verified platform facts (Supabase docs, 2026-10-14)

- `pg_cron`: `create extension if not exists pg_cron with schema pg_catalog;` (Supabase Cron install page). Creates the `cron` schema. Jobs are recorded in `cron.job`, runs in `cron.job_run_details`. Supabase recommends at most 8 concurrent jobs, each under 10 minutes.
- `pg_net`: `create extension if not exists pg_net with schema extensions;` Functions live in the `net` schema. Signature: `net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{"Content-Type": "application/json"}', timeout_milliseconds int default 2000) returns bigint` (request id). The request is sent after the surrounding transaction commits. Responses go to `net._http_response`, kept 6 hours.
- The local CLI stack uses the same Postgres image, so the same migration applies; if `pg_cron` or `pg_net` is missing there, `supabase db reset` fails loudly (see Decisions 9).

## Decisions

Each with the cost if it turns out wrong.

1. **One-use ticket, no shared secret.** Cost if wrong: a leaked ticket token lets one caller run a pump once within 2 minutes. A pump run is idempotent and budgeted, so the worst case is a wasted drain.
2. **Ticket window 2 minutes, pruned after 1 day.** pg_net may deliver late under load. If wrong: a late request gets 401 and the next tick (15 min) covers it.
3. **Target registered by the app, https origin only (http for localhost / 127.0.0.1 with a port, local dev and CI).** No path, query, userinfo or fragment. If wrong: a rejected URL leaves the clock without a target (tick no-op); `clock:register` shows the failure in its heartbeat.
4. **Registration only when `VERCEL_ENV === 'production'`.** If wrong (a custom host that is not production): the clock stays silent until registered; the step says "not production" in its heartbeat.
5. **`clock:register` first in both server step lists, not in `HEALTH_RULES`.** If it fails, later steps still run (each step is independent). Not alerting on it: the pump heartbeat going stale already raises the alert.
6. **Schedule `4,19,34,49 * * * *`** (off the :00/:15/:30/:45 peaks). The two other clocks still run; GitHub `pump.yml` is unchanged. Three clocks can overlap; the drain claims jobs with `FOR UPDATE SKIP LOCKED` and leases, so an overlap is safe, only wasteful.
7. **Respond 202 at once, run inside `after()`, `maxDuration` 300.** pg_net's 10 s timeout then never cancels the work (the request may time out on the database side while the function keeps running; this is expected and harmless). If wrong: Vercel could cut the function when the response closes; `after()` is supported on Vercel with `waitUntil`, and `maxDuration` bounds it.
8. **Private schema, no policies, all privileges revoked from API roles; functions are SECURITY DEFINER with an empty `search_path` and executable by `service_role` only.** `pump_tick` is owned by the migration owner and run by pg_cron; it is not granted to anyone. anon's executable set in `public` stays exactly `queue_age`, `heartbeat_ages`, `capture_days`, `public_fact_checks`.
9. **Local stack: tests must not depend on the HTTP call completing.** pgTAP counts rows in `net.http_request_queue`, never responses. If the local image lacks an extension, the migration fails on reset (conservative: no silent skip).
10. **A single-row target table (`id boolean primary key default true check (id)`).** If the site moves, the next production pump run updates the row; the clock keeps the old target until then.

## Out of scope

Removing `pump.yml`, alerting on the clock, a UI for the clock. `docs/progress.md` is not edited here.
