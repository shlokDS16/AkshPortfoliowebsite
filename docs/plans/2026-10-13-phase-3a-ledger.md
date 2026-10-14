# Phase 3A Ledger (ideas, sealed events, closes, scoring, daily anchor, rule 4, private ledger screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** written 2026-10-13 against branch `claude/aksh-research-desk-2b-3fb39e` (= `phase-2a`, HEAD 713fb3f). **Run the pre-flight ("Before Task 1") first:** Phase 2 is not merged and migrations 0006-0009 are local only, so file paths and the next migration number may move. Code is given where a decision is load-bearing; everything else names the interface, the tests and the commands.

**Goal:** Aksh records an idea (company, better or worse than the Nifty 50, horizon, why) in one form; the entry is sealed in an append-only, hash-chained table; the daily cron fetches the official NSE closes for the companies he tracks, scores every idea against the Nifty 50 in SQL, and seals one fingerprint line per day (published to a public gist once the owner switches it on); the private Ledger tab shows the counts, excess return, holding period and a mistakes journal; and the publish gate enforces rule 4 from the ledger.

**Architecture:** A new module `src/modules/ledger/` (ADR-001 s4). Four migrations: sealed events, prices and scores, anchors, the gate. All writes go through SQL functions: `open_idea()` and `add_idea_event()` for Aksh's entries, `store_fetched_closes()` and `enter_closes()` for prices, `score_ideas()` as the only writer of `idea_scores`, `seal_ledger_days()` for anchor lines. Two new provider ports in `src/lib/providers/` (`MarketDataPort`, `AnchorPort`), each with one real and one fixture adapter chosen by `LLM_ADAPTER=fixture` as the OCR port is. Three steps join `SERVER_DAILY_STEPS` before the ingestion sweep. No LLM is called anywhere.

**Spec:** `docs/specs/2026-10-13-phase-3-track-record-design.md` (s5 data model, s6 scoring, s7-s9 ports and cron, s10 screens, s11 compliance, s12 failure modes). **ADR:** `docs/architecture/ADR-005-ledger-integrity-and-price-source.md` (s2 verified facts, s4 decision). Binding: `docs/compliance/publishing-rules.md`, ADR-001, ADR-003.

**Scope:** progress 3.1, 3.2, 3.3, 3.4 and the rule 4 half of 3.5. Out: public case studies and charts (Plan 3b, headings at the end), client logins (3.6, cut: spec s14), everything else in spec s14.

## Global Constraints
- **No machine words, no human numbers.** `idea_events.body_md` and `stance` hold only what Aksh typed or chose. No price or return is stored in an event. No API role may INSERT, UPDATE or DELETE `idea_events`, or write `idea_scores`, `prices_daily`, `market_days` or `ledger_anchors` except through the functions and the two column grants named in the spec. Each migration's pgTAP proves it.
- **No LLM in the ledger.** `src/modules/ledger/**` never imports `LlmPort`, `OcrPort` or `TranscriberPort`; `ledger.graph.test.ts` proves it, and that the module never reaches `@/lib/supabase/service` (only `src/modules/ops` may, ESLint `NO_SECRET_CLIENT`).
- **Nothing public.** `anon` gets no grant, policy, view or function from this plan. `/api/health` gains two checks that expose a job name, an age and a boolean only (the existing `heartbeat_ages()` contract).
- **No date Aksh can set** on an event; no path that updates or deletes an event; no path that re-opens a closed idea.
- **Outbound calls:** two fixed hosts in code, `nsearchives.nseindia.com` and `api.github.com`; https only; `redirect: "error"`; a byte cap read from the stream, not from `Content-Length`; a timeout on every call; never a URL built from user input. The env templates change the path only.
- **Never commit a real NSE file** (the repo is public and NSE forbids redistribution). Tests build synthetic files with the real header row.
- **No new runtime dependency.** The zip is read with `node:zlib`.
- **Time:** the three ledger steps together stay under 45 s and run before `ingestion:sweep`; IST dates come from `istDate()` in `src/lib/dates.ts` in TypeScript and `(now() at time zone 'Asia/Kolkata')::date` in SQL.
- **Quotas are facts:** ADR-005 s2 lists every limit this plan relies on with its source and date. Re-verify before changing a number.
- Migrations are local only; never edit a migration after it reaches hosted; regenerate types with `pnpm db:types` after each one. Files stay under 300 lines. Modules are imported through `index`, `actions` or `client` only. Plain words in every string; none of the gate's lexicon in UI copy ("expects to do better than the Nifty 50", "ended ahead").
- TDD: the failing test is written and seen to fail before the code. Never run two implementers in parallel (CLAUDE.md).
- `defenso guard_code` on Tasks 1-3, 5-9 and the Task 11 route if its server answers again; while it is broken (as through Plan 2b) the opus review named on the task stands in.

## Before Task 1 (controller)
- Branch `phase-3a` from `main` if PR #2 has merged, otherwise from `phase-2a`. Run `graph-memory brief`.
- Pre-flight the conflict table at the end against the code as it stands.
- Migration numbers: this plan uses 0010-0013 with the prefix `20261013`. If the Q22 migration (discarded transcript text) has taken 0010, shift all four by one and rename the test files to match.
- Re-check the two NSE URLs by hand (ADR-005 s2 gives the exact patterns; `curl -A "<browser UA>" -o /dev/null -w "%{http_code}"` for yesterday's trading date). If either has moved, stop and amend ADR-005 before Task 6.
- Confirm `e2e/support/stack.ts` `appEnv()` sets `LLM_ADAPTER=fixture` (the fixture market data and anchor adapters hang on it).

## New environment variables
| Task | Variable | Where | Value |
|---|---|---|---|
| 6 | `NSE_BHAVCOPY_URL_TEMPLATE` | optional; `.env.example` (correct the value), `env.server.ts` | default `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{YYYYMMDD}_F_0000.csv.zip`. **The value now in `.env.example` (`..._F.csv.zip`) returns 404.** Do not set it on Vercel; if an old value is already there, the controller removes it at go-live |
| 6 | `NSE_INDEX_URL_TEMPLATE` | optional, new | default `https://nsearchives.nseindia.com/content/indices/ind_close_all_{DDMMYYYY}.csv` |
| 8 | `GITHUB_GIST_TOKEN` [SECRET] | optional, new; owner only (Q26) | fine-grained token, user permission "Gists: write". Unset means the anchor is sealed locally and not published |
| 8 | `LEDGER_ANCHOR_GIST_ID` | optional, new; owner only (Q26) | the id of a public gist the owner creates by hand |

---

### Task 1: Migration 0010: `ideas`, sealed `idea_events`, the event functions, chain verification

Build: `desk-backend` (sonnet). Review: **opus** (grants, definer functions, the integrity core). Sizing: about 250k tokens (build 180k, review 70k).

**Files:** Create `supabase/migrations/20261013000010_ledger.sql`, `supabase/tests/0010_ledger.test.sql`. Modify `supabase/tests/0002_function_privileges.test.sql` (allowlist: `open_idea`, `add_idea_event`, `check_ledger_chain` for `authenticated`; `verify_ledger_chain` for `service_role`) and any test that lists every public table's grants (`grep -n "role_table_grants\|has_table_privilege" supabase/tests`). Regenerate `src/lib/supabase/database.types.ts`.

**Changes:** spec s5.1-s5.3 exactly (columns, checks, state rules, stance keys, grants). Conventions from `20261005000001_core.sql` and `20261007000004_hardening.sql`: `security definer set search_path = ''`, `private.reject_mutation()` for update, delete and truncate on `idea_events`, `private.is_admin()` inside each function, revoke everything then grant by name, `(select private.is_admin())` in policies.

The seal trigger is load-bearing (ADR-005 s3.1, s3.2):

```sql
create function private.seal_idea_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_co record;
begin
  perform pg_advisory_xact_lock(hashtext('idea_events:chain'));
  new.seq := coalesce((select max(e.seq) from public.idea_events e), 0) + 1;
  new.prev_hash := coalesce((select e.hash from public.idea_events e where e.seq = new.seq - 1), repeat('0', 64));
  new.recorded_at := clock_timestamp();   -- inside the lock, so time and seq agree
  new.nonce := gen_random_uuid();
  select c.nse_symbol, c.isin, c.name into v_co
    from public.ideas i join public.companies c on c.id = i.company_id where i.id = new.idea_id;
  new.canonical := json_build_object(
    'v', 1, 'seq', new.seq, 'id', new.id, 'idea', new.idea_id, 'kind', new.kind,
    'at', to_char(new.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'symbol', v_co.nse_symbol, 'isin', v_co.isin, 'company', v_co.name,
    'stance', new.stance, 'words', new.body_md, 'nonce', new.nonce)::text;
  new.hash := encode(sha256(convert_to(new.prev_hash || E'\n' || new.canonical, 'UTF8')), 'hex');
  return new;
end;
$$;
```

- `open_idea()` and `add_idea_event()` raise `using errcode = 'P0001', message = 'ledger:<code>'` with codes `no_symbol`, `not_open`, `not_closed`, `is_void`, `void_too_late`, `bad_kind`, `bad_stance`, `words_required`, `bad_horizon`; an unknown idea or company is `P0002`; a non-admin caller is `42501`.
- `add_idea_event()` takes `select ... for update` on the idea row first, then validates, inserts, then updates the projection (`held`, `horizon_days`, `status`, `closed_at`, `close_reason`, `process_call`).
- `private.ledger_chain_check()` walks `idea_events` by `seq` and returns the first `seq` whose `prev_hash` or re-hash of the stored `canonical` does not match, or a gap in `seq`. Two thin wrappers: `public.verify_ledger_chain()` (no caller check, `service_role` only) and `public.check_ledger_chain()` (`private.is_admin()`, `authenticated` only). This is the pattern for every function both the job and the admin need (spec s5.3): never read the role out of the request.
- `tracked_symbols()` is NOT in this migration (it reads `idea_scores`; Task 2).

**Tests first (pgTAP):** an admin session opens an idea and gets seq 1 with 64 zeros before it; two events chain; `recorded_at` cannot be supplied; update, delete and truncate of `idea_events` are refused for the admin and for `service_role`; a direct INSERT into `idea_events` is refused for `authenticated`; `ideas.status` cannot be updated directly but `item_id` can; each state rule (close then note passes, close then close fails, review on an open idea fails, void after 24 h fails by moving `opened_at` as the owner, any event on a void idea fails); each stance shape accepted and one unknown key refused per kind; a company with no `nse_symbol` is refused; `verify_ledger_chain()` is ok on a clean chain and names the right `seq` after the table owner disables the trigger and alters one `canonical`; `anon` and `service_role` hold nothing on either table; `anon` cannot execute any of the three functions.

**Acceptance:** `pnpm db:reset && pnpm db:test` green with the new file; the allowlist tests still pass; no existing test changed except the allowlists.

- [ ] Steps: failing pgTAP, then migration, then `pnpm db:reset && pnpm db:test`, then `pnpm db:types`, then commit `feat(db): ideas and sealed, hash-chained idea events (migration 0010)`.

---

### Task 2: Migration 0011: closes, trading days, corporate actions, `score_ideas()`

Build: `desk-backend` (sonnet). Review: **opus** (grants; the scoring rule is the thing an allocator will test). Sizing: about 320k tokens (build 230k, review 90k).

**Files:** Create `supabase/migrations/20261013000011_market_scores.sql`, `supabase/tests/0011_market_scores.test.sql`. Modify the function allowlist test. Regenerate types.

**Changes:** spec s5.4 and s6 exactly. Notes that are load-bearing:
- Entry (and exit, from the `close` event) is

```sql
select min(d.trade_date)
  from public.market_days d
 where d.status = 'open'
   and (d.trade_date + time '15:00') at time zone 'Asia/Kolkata' > v_event.recorded_at
   and exists (select 1 from public.prices_daily p where p.company_id = v_idea.company_id and p.trade_date = d.trade_date)
   and exists (select 1 from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = d.trade_date);
```

- `private.put_close()` ranks sources `nse_fetch` 3, `nse_upload` 2, `manual` 1: insert when absent; replace when the new rank is higher; when the rank is equal replace only for `manual` (he corrects his own typing); otherwise do nothing. It is the only code that writes `prices_daily`.
- `store_fetched_closes(p_trade_date, p_rows, p_index_close)`: `p_rows` is `[{symbol, series, isin, close}]`; rows whose symbol is not a tracked company's `nse_symbol` are dropped; the date is marked `open` in `market_days` only when the Nifty 50 close for it is stored; `p_index_close` may be null (the equity file arrived, the index file did not: the date stays undecided and is fetched again).
- `mark_market_day_shut(p_trade_date)` writes `shut` only when a later date is `open`; otherwise it does nothing. Dates older than the 7-day fetch window are never marked (they stay undecided and are ignored).
- `enter_closes(p_trade_date, p_rows, p_index_close, p_source)` refuses a future date, a non-admin caller and any source but `nse_upload` or `manual`; it keeps only rows for companies that have a non-void idea (the rest of a dropped file is discarded, as in the fetched path) and marks the date `open` under the same rule.
- `private.score_ideas_now()` upserts one row per non-void idea and removes the row of an idea that became void. All arithmetic in `numeric`. Flags per spec s6. Wrappers: `public.score_ideas()` (`service_role` only) and `public.rescore_ideas()` (`private.is_admin()`, `authenticated` only).
- `tracked_symbols()`: `service_role` only.

**Tests first (pgTAP, with seeded ideas whose `recorded_at` is set by the table owner):** entry is the same day for an event at 14:59 IST and the next open day at 15:00 IST; a Friday-evening event enters on Monday; a `shut` day is skipped; entry waits when the company has a close but the index does not; the three-way source ladder in both directions; a manual close corrected by a second manual close; an admin cannot INSERT into `prices_daily` or `idea_scores` directly, and `service_role` cannot either; `authenticated` cannot execute `score_ideas()` and `service_role` cannot execute `rescore_ideas()`; a 1:5 split with `factor = 5` leaves the return unchanged, and without it raises `jump`; `isin_changed`; `stale`; `underperform` flips the sign of `excess`; a closed idea is `exit_pending` until the next close and then `is_final`; a void idea has no score row; calling `score_ideas()` twice changes nothing but `computed_at`; `tracked_symbols()` lists open ideas and closed ones without a final exit, not final or void ones; `anon` holds nothing.

**Acceptance:** `pnpm db:reset && pnpm db:test` green; the migration is under 300 lines or is split into `..._market.sql` and `..._scores.sql` (then renumber the later ones).

- [ ] Steps: failing pgTAP, migration, reset and test, `pnpm db:types`, commit `feat(db): closing prices with a source ladder, and scoring against the Nifty 50 in SQL (migration 0011)`.

---

### Task 3: Migration 0012: `ledger_anchors` and `seal_ledger_days()`

Build: `desk-backend` (sonnet). Review: **opus** (short). Sizing: about 150k tokens (build 100k, review 50k).

**Files:** Create `supabase/migrations/20261013000012_ledger_anchors.sql`, `supabase/tests/0012_ledger_anchors.test.sql`. Modify the allowlist test. Regenerate types.

**Changes:** spec s5.5. `seal_ledger_days()` raises `ledger:chain_broken` when `private.ledger_chain_check()` is not ok; returns 0 when there is no event yet; otherwise writes one row per IST date from the day after the last sealed date (or the IST date of the first event) through yesterday. `line` is built with `json_build_object(...)::text` and stored; `hashes` is the day's event hashes in `seq` order. A guard trigger allows an UPDATE only when nothing but `published_at` and `anchor_version` changes and `old.published_at is null`; delete and truncate go to `private.reject_mutation()`.

**Tests first (pgTAP):** three days with 2, 0 and 1 events seal to three lines whose heads chain and whose empty day repeats the previous head; today's events are not sealed; a second call seals nothing; a tampered chain raises and seals nothing; `service_role` may set `published_at` once and not twice, and may change no other column; the admin may only read; `anon` holds nothing.

- [ ] Steps: failing pgTAP, migration, reset and test, `pnpm db:types`, commit `feat(db): one sealed fingerprint line per day for the public anchor (migration 0012)`.

---

### Task 4: The `ledger` module: types, inputs, repo, service, summary and journal arithmetic

Build: `desk-backend` (sonnet). Review: sonnet (haiku is enough for the pure-function files). Sizing: about 230k tokens (build 190k, review 40k).

**Files:** Create in `src/modules/ledger/`: `types.ts`, `schema.ts` (zod: `openIdeaInput`, one `eventInput` per kind as a discriminated union, mirroring the SQL stance keys), `errors.ts` (maps `ledger:<code>` to a `DeskError` subclass and a `messages.ts` key), `repo.ts` (`createSupabaseLedgerRepo(db)`: `openIdea`, `addEvent`, `listIdeas`, `getIdea`, `listEvents`, `listScores`, `closesStatus`, `anchorStatus`, `checkChain` (calls `check_ledger_chain()`), `rescore` (calls `rescore_ideas()`), `setItemLink`), `service.ts` (`openIdea`, `addIdeaEvent`: validate, call the repo, map errors), `summary.ts` (`summarise(ideas, scores)`: spec s6 figures), `journal.ts` (`journalGrid(ideas, scores)`), `gate.ts` (`stanceClearDate(db, companyId)`: the IST date from which rule 4 passes, or null; `holdsOpenPosition(db, companyId)`), `client.ts` (types and constants safe for a client component), `index.ts`, and the tests `schema.test.ts`, `service.test.ts`, `summary.test.ts`, `journal.test.ts`, `gate.test.ts`, `ledger.graph.test.ts`. Modify `src/lib/messages.ts` (the `ERRORS` keys `ledger-no-symbol`, `ledger-not-open`, `ledger-not-closed`, `ledger-void-too-late`, `ledger-words-required`, `ledger-bad-input`).

**Interfaces:**

```ts
export type Expects = "outperform" | "underperform";
export type IdeaEventKind = "open" | "note" | "revise" | "upsize" | "downsize" | "close" | "review" | "void";
export type Summary = {
  closed: { ahead: number; total: number; showPercent: boolean };   // showPercent only from 5 closed ideas
  all: { ahead: number; total: number };                            // open ideas marked to the latest close
  medianExcessClosed: number | null; medianExcessAll: number | null; // fractions
  holdingDays: { median: number; min: number; max: number } | null;
  pastHorizon: string[]; noLesson: string[]; needsCheck: string[]; withdrawn: number;
};
export function summarise(ideas: readonly Idea[], scores: readonly IdeaScore[], today: string): Summary;
export type GridCell = "earned" | "lucky" | "unlucky" | "deserved";
export function journalGrid(ideas: readonly Idea[], scores: readonly IdeaScore[]): Record<GridCell, string[]>;
```

All reads use the admin's cookie client (RLS); the repo follows `src/modules/research/repo.ts` and reports failures with `dbError()`.

**Tests first:** every input shape (a 10,001-character body, a horizon of 29 days, an unknown tag are refused before any database call); each SQL code maps to its message key; `summarise` on fixtures: flagged and void ideas are left out and counted, medians with even and odd counts, no percentage under 5 closed, an idea past its horizon, a closed idea with no lesson; the four grid cells and that an unreviewed idea is in none; the graph test (no `@/lib/providers`, no `supabase/service`, no `LlmPort`).

- [ ] Steps: failing tests, implement, `pnpm test`, `pnpm lint`, `pnpm typecheck`, commit `feat(ledger): module service layer, summary and journal arithmetic`.

---

### Task 5: Migration 0013: rule 4 and the position check in `publish_revision()`

Build: `desk-backend` (sonnet). Review: **opus** (the publish gate). Sizing: about 260k tokens (build 180k, review 80k).

**Files:** Create `supabase/migrations/20261013000013_ledger_gate.sql`, `supabase/tests/0013_ledger_gate.test.sql`. Modify `src/modules/compliance/policy.ts` (`RULE_TITLES["4"] = "Rule 4: named-security recency"`), the checklist the publish panel shows (find its input with `grep -rn "previewGate" src`; add two optional inputs, `stanceClearDate` and `holdsOpenPosition`, read through `@/modules/ledger`, and one checklist line each), `e2e/desk-gate.spec.ts`. Do not change `POLICY_VERSION` or `c_policy`.

**Changes:** `create or replace function public.publish_revision(p_actor, p_item_id, p_revision_id, p_policy_version, p_lint_result)` starting from the complete body in `20261007000005_casefile.sql` (copy it whole; the comment "Rule '4' ... is reserved" marks the place; declare `v_last_stance date`), plus:

```sql
-- Rule 4 (publishing rules 4 and 7): no stance-changing ledger entry on this company in the last 30 IST days.
select max((e.recorded_at at time zone 'Asia/Kolkata')::date) into v_last_stance
  from public.idea_events e join public.ideas i on i.id = e.idea_id
 where i.company_id = v_item.company_id and i.status <> 'void'
   and e.kind in ('open', 'close', 'upsize', 'downsize');
if v_last_stance is not null and v_last_stance > (now() at time zone 'Asia/Kolkata')::date - 30 then
  v_failures := v_failures || jsonb_build_array(jsonb_build_object('rule', '4', 'message',
    format('The ledger has an entry on this company from the last 30 days. This can be published from %s.',
           to_char(v_last_stance + 30, 'DD Mon YYYY'))));
end if;
-- Rule 5, consistency: a "no" the ledger contradicts.
if v_item.holds_position = 'no' and exists (
     select 1 from public.ideas i where i.company_id = v_item.company_id and i.status = 'open' and i.held) then
  v_failures := v_failures || jsonb_build_array(jsonb_build_object('rule', '5', 'message',
    'The ledger shows a position in this company; the disclosure cannot say no.'));
end if;
```

Restate the revoke and the service-role-only grant so the file reads alone (ADR-003). The failure is recorded, never raised, like every other gate failure.

**Tests first:** pgTAP: an item with no company is untouched; an `open` 29 days ago fails rule 4 and 30 days ago passes (IST boundary, set as the owner); `note`, `revise` and `review` events do not count; a void idea does not count; a new revision of an already public item fails rule 4 and the old revision stays current; "no" with a held open idea fails rule 5 and "not_disclosed" passes; the function is still executable by `service_role` only; `src/modules/compliance/policy.test.ts` still finds `c_policy` in the newest migration. Unit: the checklist shows "Rule 4: clear from 12 Nov 2026" and the position line. e2e: publish is refused with the rule 4 sentence after an idea is opened on the file's company.

**Acceptance:** every existing gate test (pgTAP 0002-0005, `desk-gate.spec.ts`, `public-file.spec.ts`) passes unchanged.

- [ ] Steps: failing tests, migration, reset and test, `pnpm db:types`, TypeScript, `pnpm test`, e2e for the gate, commit `feat(gate): rule 4 from the ledger, and a position disclosure the ledger cannot contradict (migration 0013)`.

---

### Task 6: `MarketDataPort`, the single-entry zip reader, the NSE adapter and its fixture

Build: `desk-backend` (sonnet). Review: **opus** (outbound fetch, parsing bytes from the network). Sizing: about 280k tokens (build 200k, review 80k). **Env: `NSE_BHAVCOPY_URL_TEMPLATE` (corrected), `NSE_INDEX_URL_TEMPLATE`.**

**Files:** Create in `src/lib/providers/`: `market-data.ts` (the types in spec s7, verbatim), `zip-one.ts`, `nse-bhavcopy.ts`, `fixture-market-data.ts`, and `zip-one.test.ts`, `nse-bhavcopy.test.ts`, `fixture-market-data.test.ts`. Modify `src/lib/providers/index.ts` (`createMarketDataPort(env)`, `MarketDataEnv`), `index.test.ts`, `src/lib/env.server.ts` (the two templates with defaults, each must be https on `nsearchives.nseindia.com` and contain its placeholder), `env.server.test.ts`, `.env.example`.

**Interfaces:**

```ts
/** One deflated (method 8) or stored (method 0) entry; anything else throws ZipError. maxBytes bounds the output. */
export function unzipSingle(zip: Uint8Array, maxBytes: number): Uint8Array;
/** Rows for the asked symbols only; series preference EQ, BE, BZ, SM, ST; a bad header throws CsvError. */
export function parseBhavcopyCsv(csv: string, symbols: readonly string[]): { tradeDate: string; closes: Close[] };
export function parseIndexCsv(csv: string): { tradeDate: string; close: number };   // the "Nifty 50" row
export function createNseMarketData(opts: { bhavcopyTemplate: string; indexTemplate: string; fetch?: typeof fetch; timeoutMs?: number }): MarketDataPort;
export function createMarketDataPort(env: MarketDataEnv): MarketDataPort;   // fixture when LLM_ADAPTER=fixture off Vercel; else NSE
```

- `zip-one.ts`: find the end-of-central-directory record, require exactly one entry, no encryption bit, no zip64 sizes; read the compressed size from the central directory; `inflateRawSync(data, { maxOutputLength: maxBytes })` from `node:zlib`.
- `nse-bhavcopy.ts`: the fixed host check in code; `redirect: "error"`; `User-Agent` browser-like and `Accept: */*`; `AbortSignal.timeout(8000)`; read the body through a counting reader that stops at 4 MB; unzip cap 16 MB; 404 is `no_file`; 401, 403 and 429, or a `text/html` answer, is `blocked`; a timeout, 5xx, `ZipError` or `CsvError` is `provider_error`. A file whose `TradDt` or `Index Date` is not the asked date is `provider_error`. Never log a URL with a query or the body. Follow `ocrspace.ts` for the shape of the result mapping and the injected `fetch`.
- `createMarketDataPort`: the fixture is refused on a Vercel preview or production deployment exactly as `createOcrPort` does (ruling R27); there the NSE adapter is used.

**Tests first:** the zip reader on a file the test builds (deflated, stored), and refusals: two entries, the encryption bit, a declared size over the cap, an output that inflates past the cap, a truncated file. The parsers on synthetic CSV with the real header rows (ADR-005 s2): series preference, a symbol absent, a symbol in `BE` only, a quoted name with a comma, a blank close, the wrong date. The adapter with an injected `fetch`: 200, 404, 403, HTML where a zip was expected, a slow body cut by the cap, a redirect refused, a template that points at another host refused at start-up. The factory: fixture off Vercel, refused on Vercel.

**Acceptance:** no file from NSE is in the repo (`git status` shows only source and tests); `pnpm test`, lint and typecheck green.

- [ ] Steps: failing tests, implement, `pnpm test`, `pnpm lint`, `pnpm typecheck`, commit `feat(providers): MarketDataPort with the NSE bhavcopy adapter and a fixture`.

---

### Task 7: The `ledger:prices` and `ledger:score` steps, and the health checks

Build: `desk-backend` (sonnet). Review: **opus** (the secret-key client on a new path, and `/api/health` is anon-reachable). Sizing: about 260k tokens (build 190k, review 70k).

**Files:** Create `src/modules/ledger/trading-days.ts`, `prices.ts`, `steps.ts` and their tests; `src/modules/ops/ledger-steps.ts` (+ test). Modify `src/modules/ledger/index.ts`, `src/modules/ops/drain.ts` (`SERVER_DAILY_STEPS = [...DAILY_STEPS, ...LEDGER_DAILY_STEPS, { job: "ingestion:sweep", run: sweep }]`), `src/modules/ops/jobs.ts` (export `runLedgerNow`), `src/modules/ops/health.ts` and `health.test.ts`, `src/app/api/cron/daily/route.ts` (the comment only: the budget), `e2e/clocks.spec.ts`.

**Interfaces:**

```ts
/** Weekdays (IST) after the last open day and before `today`, oldest first, not older than 7 days, not yet decided. */
export function datesToFetch(days: readonly { tradeDate: string; status: "open" | "shut" }[], today: string): string[];
/** Weekdays since the last open day with no decision: the "closes are N days behind" number. */
export function weekdaysBehind(days: readonly { tradeDate: string; status: "open" | "shut" }[], today: string): number;
export type LedgerJobDeps = { db: Db; market: MarketDataPort; today: () => string; clock: () => number };   // Task 9 adds `anchor: AnchorPort | null`
export function ledgerDailySteps(deps: LedgerJobDeps): Step[];   // two steps here; Task 9 adds the third
```

- `prices.ts` `fetchCloses(deps, budgetMs = 25_000)`: `tracked_symbols()`; none means return "nothing to fetch". For at most 2 dates from `datesToFetch`: both port calls with `timeoutMs = min(8000, time left)`; both ok means `store_fetched_closes`; equity `no_file` means `mark_market_day_shut`; `blocked` or `provider_error` stops the loop. Returns a detail of counts only ("stored 2 dates, 14 closes"; "NSE refused; closes to 2026-10-09"). Throws (heartbeat `ok = false`) only when `weekdaysBehind >= 3` after the attempt.
- `ledger:score` calls `score_ideas()` and returns "scored N ideas".
- `ops/ledger-steps.ts` builds the deps with `createSupabaseServiceClient()`, `createMarketDataPort(serverEnv())` (Task 9 adds `createAnchorPort(serverEnv())`); `runLedgerNow()` runs the same steps with the job heartbeat repo.
- `health.ts`: `HEALTH_RULES` gains `{ job: "ledger:prices", maxAgeSeconds: 36 * 60 * 60, label: "the closing prices", optional: true }` and the same for `ledger:anchor` ("the public proof"). `optional` means a job that has never run is healthy; a failed or stale latest run is not. `/api/health` returns two more `{ job, ageSeconds, ok }` entries and nothing else.

**Tests first:** `datesToFetch` and `weekdaysBehind` over a weekend, a holiday then an open day, a week-long outage, and "today" excluded; `fetchCloses` with a fake port and a fake repo: nothing tracked, two dates stored, a holiday marked, blocked on the first date, the budget spent after one date, the throw at three weekdays; the step list order (`ledger:prices`, `ledger:score`, then the sweep); health: never run is healthy for an optional rule and unhealthy for the two clocks, a failed ledger run is unhealthy; `ops.graph.test.ts` still passes (`/api/health` cannot reach the secret-key client). e2e (`clocks.spec.ts`, fixture adapter): after an idea is seeded, `GET /api/cron/daily` with the bearer returns the new jobs as ok and a score row exists.

**Acceptance:** the daily route's worst case is written in its comment (45 s ledger, 200 s sweep); a second call to the route changes nothing.

- [ ] Steps: failing tests, implement, `pnpm test`, e2e clocks, commit `feat(ledger): daily closes and scoring steps, with health checks`.

---

### Task 8: `AnchorPort`, the GitHub Gist adapter and its fixture

Build: `desk-backend` (sonnet). Review: **opus** (outbound call carrying a secret). Sizing: about 180k tokens (build 120k, review 60k). **Env: `GITHUB_GIST_TOKEN`, `LEDGER_ANCHOR_GIST_ID`.**

**Files:** Create `src/lib/providers/anchor.ts` (spec s9, verbatim), `github-gist.ts`, `fixture-anchor.ts` and tests. Modify `src/lib/providers/index.ts` (`createAnchorPort(env): AnchorPort | null`), `index.test.ts`, `src/lib/env.server.ts` (both optional; the id must match `^[0-9a-f]{20,40}$`), `env.server.test.ts`, `.env.example` (labelled `[OPTIONAL][SECRET]`, with one line on what switching it on publishes).

- `github-gist.ts`: `GET` and `PATCH https://api.github.com/gists/{id}`; headers `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: aksh-research-desk`; 7 s timeout; `redirect: "error"`; response cap 2 MB. `read`: the named file's `content`, `null` when the gist has no such file, `refused: too_large` when `truncated` is true. `write`: body `{ files: { [file]: { content } } }`; `version` is `history[0].version` when it is a string, else null. 401 and 403 are `refused: auth`; 404 is `refused: missing`; 5xx, 429 and a timeout are `provider_error`. The token never appears in a message or a log.
- `createAnchorPort`: null when either variable is unset; the fixture (an in-process map, `version` = `fixture-<n>`) when `LLM_ADAPTER=fixture` off Vercel; refused on Vercel like the others.

**Tests first:** each status mapping with an injected `fetch`; a truncated file; a missing file reads as null; the PATCH body holds only the one file; the token is absent from every returned message; the factory's four cases.

- [ ] Steps: failing tests, implement, `pnpm test`, lint, typecheck, commit `feat(providers): AnchorPort with a GitHub Gist adapter and a fixture`.

---

### Task 9: The `ledger:anchor` step: seal, compare, append, record

Build: `desk-backend` (sonnet). Review: **opus** (integrity). Sizing: about 240k tokens (build 170k, review 70k).

**Files:** Create `src/modules/ledger/anchor.ts`, `anchor.test.ts`. Modify `src/modules/ledger/steps.ts` (third step), `src/modules/ledger/repo.ts` or a job-side repo file (read unpublished and published lines by year, mark published), `src/modules/ops/ledger-steps.ts`, `e2e/clocks.spec.ts`.

**Algorithm (`publishAnchors(deps, budgetMs = 15_000)`):**
1. `seal_ledger_days()`. A raise is the step's failure ("the ledger chain is broken").
2. Port null: return "sealed N; public proof is off, M days waiting". Not a failure.
3. For each year with an unpublished line, oldest first: `read("ledger-<year>.jsonl")`. Split into lines. Every line the database holds as published for that year must equal the file's line at the same position; a difference or a shorter file throws `AnchorMismatchError` naming the first date (nothing is written).
4. Lines not yet published that are already at the tail of the file (a crash after the write and before the mark) are only marked. The rest are appended, each ending in a newline, and written once.
5. Mark each line published with the returned version. One retry after 2 s on `provider_error`; a second failure throws.

**Tests first (fake port, fake repo):** first publish creates the file; an ordinary next day appends one line; a year boundary writes two files; lines already at the tail are marked without a write; an edited published line, a deleted line and an empty file where lines were published each throw and write nothing; `too_large` and `auth` throw with a plain sentence; the port is null; the budget. e2e: with the fixture anchor, the daily route leaves `ledger_anchors.published_at` set for yesterday's line.

**Acceptance:** running the route twice publishes each line once; the heartbeat detail holds dates and counts only.

- [ ] Steps: failing tests, implement, `pnpm test`, e2e clocks, commit `feat(ledger): daily public anchor step with a tamper check`.

---

### Task 10: Private screens A: the Ledger tab, a new idea, one idea and its entries

Build: `desk-ui` (sonnet is enough: the layout is fixed by spec s10 and the decided segments 3 and 4). Review: sonnet for the code, haiku for a copy pass against the wording rules. Sizing: about 430k tokens (build 370k, review 60k).

**Files:** Create `src/app/desk/ledger/page.tsx`, `src/app/desk/ledger/new/page.tsx`, `src/app/desk/ledger/[ideaId]/page.tsx`; `src/modules/ledger/queries.ts` (`getLedgerHome(db, today)`, `getIdeaPage(db, id)`: view models only), `src/modules/ledger/actions.ts` (`openIdeaAction`, `addIdeaEventAction`, `linkIdeaItemAction`; each `requireAdmin()` first, zod, `failTo`/`doneTo` like `src/modules/catalog/actions.ts`), `actions.test.ts`; in `src/components/desk/private/ledger/`: `ledger-status.tsx`, `ledger-tiles.tsx`, `idea-table.tsx`, `idea-form.tsx`, `idea-score.tsx`, `idea-timeline.tsx`, `event-form.tsx` and a `ledger.test.tsx`; `e2e/desk-ledger.spec.ts`, `e2e/support/ledger.ts` (seed closes through `store_fetched_closes` with the local secret key, as `e2e/support/heartbeats.ts` does). Modify `src/components/desk/private/desk-tabs.tsx` (a fifth tab "Ledger" between Items and Names), `src/lib/messages.ts`, `e2e/desk-a11y.spec.ts`, `docs/design/decisions.md` (record the tab and the screens; delegated 2026-10-13, Shlok may overturn).

- Step 0: read `docs/design/decisions.md` segments 3 and 4 and reuse `stat-tile.tsx`, `ledger-table.tsx`, `needs-you-card.tsx`, `as-of.tsx`, `empty-state.tsx`, `pending-button.tsx`, `wording-guide.tsx`. The existing `ledger-table.tsx` is a data-display table, not the idea ledger: do not rename it; new files are `idea-*`.
- The score block and Aksh's entries are separate blocks with separate headings ("Scored by the desk", "What you wrote"). No component renders a number inside his text or his text inside a number cell.
- A flagged idea shows the flag's sentence in place of its result. A percentage is in percentage points with one decimal and its as-of date. Company picker: companies that have an `nse_symbol`; the others are listed disabled with "no NSE symbol yet".
- The status line reads the latest `ledger:*` heartbeats (the admin may read `heartbeats`) and `checkChain()`.

**Tests first:** actions: non-admin refused, each bad input maps to its message code, a good input calls the service once. Components: the two blocks never share a cell; the tile shows "4 of 7" with no percentage under 5 closed; the empty state. e2e at 375 and 1280: open an idea in one submit and land on its page with the sealed line; run the daily route (fixture) and see an entry date and a result; add a note; close; write a lesson; the withdraw button is present for a new idea; keyboard only for the whole flow; axe clean on the three pages.

- [ ] Steps: Step 0, failing tests, implement, `pnpm test`, e2e, record the design note, commit `feat(desk): the Ledger tab: record an idea, see it scored, close it, write the lesson`.

---

### Task 11: Private screens B: closes, the NSE file drop, corporate actions, the journal

Build: `desk-ui` with `desk-backend` for the route (sonnet). Review: **opus for the upload route only** (it parses a file a browser sent); sonnet for the rest. Sizing: about 400k tokens (build 330k, review 70k).

**Files:** Create `src/app/desk/ledger/closes/page.tsx`, `src/app/desk/ledger/closes/upload/route.ts`, `src/app/desk/ledger/closes/actions.ts` (`fetchClosesNowAction`: `requireAdmin()` then `runLedgerNow()` from `@/modules/ops/jobs`, the `kickReadingAction` precedent), `src/app/desk/ledger/journal/page.tsx`; `src/modules/ledger/upload.ts` (+ test: bytes in, `{ tradeDate, rows, indexClose }` out, using `unzipSingle`, `parseBhavcopyCsv`, `parseIndexCsv` and the tracked symbols, which the route reads with the admin's own client from `ideas`, `companies` and `idea_scores`; `tracked_symbols()` is the job's); add to `src/modules/ledger/actions.ts`: `enterCloseAction`, `addCorporateActionAction`, `removeCorporateActionAction` (each ends by calling `rescore_ideas()` so the screen is current); components `closes-status.tsx`, `close-form.tsx`, `nse-drop.tsx`, `corporate-actions.tsx`, `journal-list.tsx`, `journal-grid.tsx`; `e2e/desk-ledger-closes.spec.ts`. Modify `src/lib/messages.ts`, `e2e/desk-a11y.spec.ts`.

- The upload route: `POST`, admin session checked first (`getAdminForRequest` or the pattern in `src/app/desk/inbox/pump/handler.ts`), `Content-Length` and the read both capped at 4 MB (Vercel's body limit is 4.5 MB), the file detected by content (zip magic or the index header row), parsed in memory, `enter_closes(..., 'nse_upload')`, then `rescore_ideas()`. It stores nothing but the tracked closes; the file is not kept. A date in the future, a file with no tracked symbol, or an unreadable file returns a fixed message code.
- The closes page says, in order: how current the closes are and why ("NSE refused the desk on 12 Oct"), the button, the two hand paths, hand-entered closes with their source, corporate actions with the factor explained in one line ("5 for a 1:5 split: one old share became five").
- The journal: lessons newest first (his words, his tags, the idea, the date), then the grid with the idea names in each cell and one line of explanation.

**Tests first:** `upload.ts` on synthetic files (zip, index CSV, neither, oversize, no tracked symbol); the route refuses a signed-out request and an oversize body before reading it; actions refuse a non-admin and bad numbers (zero, negative, a future date, a factor of 1). e2e: type a close and see "includes a hand-entered close" on the idea; drop a synthetic zip and see the source change; enter a split and see the flag clear; the journal shows a lesson in the right cell; axe clean.

- [ ] Steps: failing tests, implement, `pnpm test`, e2e, commit `feat(desk): closing prices by hand or by NSE file, corporate actions, and the mistakes journal`.

---

### Task 12: Close-out and the whole-branch review

Build: controller, with `desk-backend` for fixes. Review: **opus**, whole branch. Sizing: about 300k tokens (review 150k, one fix wave 110k, docs 40k).

- Whole-branch review against the spec, ADR-005, the Global Constraints, rubrics R1 2, 4, 6, 7 and R3 1-7 (scores recorded in `docs/progress.md`). One fix wave; a re-review of the fixes on haiku or sonnet.
- Full local verification: `pnpm db:reset && pnpm db:test`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm e2e` twice.
- Docs (append-only): `docs/progress.md` (tick 3.1-3.4, note 3.5's rule 4 half), `docs/project-memory/timeline.md`, ADR-005 amendments for anything the build decided, `docs/specs/technical-debt.md`, a dated correction line under `docs/research/2026-10-04-tooling-landscape.md` s4 (the bhavcopy file name), spec s16 amendments section if the build changed anything.
- Hand the controller the hosted checklist (not done by any task; each step needs Shlok's go-ahead): fresh backup; `supabase db push` of 0010-0013 after 0006-0009 are on hosted; remove any old `NSE_BHAVCOPY_URL_TEMPLATE` from Vercel; deploy; read the first three mornings' `ledger:prices` heartbeats (answers Q29); Q26 before any gist token is set.

- [ ] Steps: review, fix wave, re-review, verification, docs, commit `docs: Plan 3a close-out (ledger live locally; hosted steps listed)`.

---

## Sizing
| Task | Build | Review | Subagent tokens (rough) |
|---|---|---|---|
| 1 Migration 0010 | sonnet | opus | 250k |
| 2 Migration 0011 | sonnet | opus | 320k |
| 3 Migration 0012 | sonnet | opus | 150k |
| 4 Module service layer | sonnet | sonnet or haiku | 230k |
| 5 Migration 0013, the gate | sonnet | opus | 260k |
| 6 MarketDataPort, NSE adapter | sonnet | opus | 280k |
| 7 Prices and scoring steps, health | sonnet | opus | 260k |
| 8 AnchorPort, gist adapter | sonnet | opus | 180k |
| 9 Anchor step | sonnet | opus | 240k |
| 10 Screens A | sonnet | sonnet, haiku | 430k |
| 11 Screens B | sonnet | opus (route), sonnet | 400k |
| 12 Close-out | controller | opus | 300k |
| **Total** | | | **about 3.3M** |

Pacing: Tasks 1-9 (about 2.17M) leave a working, tested back end with the cron live and no screens; Tasks 10-12 (about 1.13M) add the screens and close out. Either half fits a week on its own. Estimates are scaled from Plan 2b's measured sessions (about 2.2M for one task, two reviews and a fix batch on 2026-10-12/13) and assume one review round per task; a second round adds about a third.

## Pre-flight conflict table (starting point; redo against the code as it stands)
| Tasks | Shared file / interface | Risk | Resolution |
|---|---|---|---|
| 1-3, 5 | migration numbers 0010-0013 | Q22's migration takes 0010 first | renumber all four and their test files in the pre-flight |
| 1-3, 5 | `supabase/tests/0002_function_privileges.test.sql` and table-grant allowlists | a new function or table fails an "everything else is closed" test | each migration task extends the allowlist in the same commit |
| 1-3, 5 | `src/lib/supabase/database.types.ts` | stale types break Task 4 onward | `pnpm db:types` at the end of each migration task |
| 5 | `publish_revision()` (latest body in `20261007000005_casefile.sql`), `c_policy`, `policy.test.ts` | a partial copy drops the figures-to rule or the file number; the policy test reads the newest migration | copy the 0005 body whole; keep `c_policy`; the existing gate pgTAP must pass unchanged |
| 5 | `RULE_TITLES`, `SQL_RULE_FIELD` (`src/modules/compliance/decision.ts`), the publish checklist | rule 4 has no lint finding to explain it | add the title only; leave `SQL_RULE_FIELD` alone so the SQL message is shown as written |
| 5 | Phase 2 e2e that publish a file (`desk-gate`, `public-file`, `desk-full-loop`) | a seeded idea on the same company blocks an unrelated test | ledger e2e seeds its own company; `e2e/support/ledger.ts` cleans nothing shared |
| 6, 8 | `src/lib/providers/index.ts`, `env.server.ts`, `.env.example` | two tasks add factories and variables to the same files | sequential; each adds one block |
| 6 | `.env.example` `NSE_BHAVCOPY_URL_TEMPLATE` | the committed value returns 404; a copy may be on Vercel | corrected in Task 6; removal on Vercel is a hosted-checklist step |
| 7, 9 | `src/modules/ops/drain.ts`, `SERVER_DAILY_STEPS`, the 300 s route | ledger steps starve or are starved by the sweep | ledger first, 45 s cap, sweep keeps its 200 s; the route comment states the sum |
| 7 | `HEALTH_RULES`, `/api/health` JSON, `e2e/clocks.spec.ts`, `desk-clocks.spec.ts`, the uptime monitor | a never-run ledger job turns production red on deploy | `optional: true`; tests for never-run; the contract only grows |
| 7, 9, 11 | `src/modules/ops/jobs.ts`, `ops.graph.test.ts` | the public health route reaches job code | new exports go through `ops/jobs` only; the graph test must stay green |
| 4, 7 | `@/modules/ledger` index versus `client` | a client component pulls server-only provider code | client components import `@/modules/ledger/client` only |
| 10 | `desk-tabs.tsx` (D18: four tabs), `shell.test.tsx` | a fifth tab crowds the phone bar; tests count tabs | desk-ui checks 375 px; update the test; record in `docs/design/decisions.md` |
| 10, 11 | `src/lib/messages.ts` `ERRORS` | two tasks add keys | sequential; keys prefixed `ledger-` |
| 10 | `src/components/desk/ledger-table.tsx` | name clash with the idea ledger | reuse it as a table; new components are `idea-*` under `private/ledger/` |
| 11 | upload route body size | a zip over the limit | cap at 4 MB (the real file is about 207 KB zipped, 639 KB unzipped: ADR-005 s2) |

## Plan 3b (public case studies): headings only
1. Rules addendum v1.1 for case-study outcome figures, and the policy version bump (architect; needs Q27 and Q28)
2. The owner switches in `private.settings` (`ledger_reveal`, `ledger_chart`), off by default
3. The `ledgerProof` block in a case-study revision: attach a closed idea's sealed entries
4. Migration: the gate's case-study checks (every revealed event 30 days old, closed ideas only, no flagged idea, chart points within "Figures to")
5. The snapshot chart series: rebased, weekly, lagged, frozen into the revision
6. The public case-study page: what I expected, what happened, what I learned
7. The proof panel: check the fingerprint in the browser, link to the public file
8. "How this record is kept" on `/process`
9. The public Mistakes page from published lessons
10. A lint hint while writing an idea, so the original entry can be revealed later
11. A second witness for the anchor
12. Close-out and whole-branch review
