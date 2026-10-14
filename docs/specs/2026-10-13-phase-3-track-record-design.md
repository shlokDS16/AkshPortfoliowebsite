# Phase 3 spec: Two-tier track record

Status: ACCEPTED for build (desk-architect and controller, on Shlok's delegation; 2026-10-13). Depends on ADR-001 (binding), ADR-003, ADR-005 (written with this spec) and `docs/compliance/publishing-rules.md` v1. Built by `docs/plans/2026-10-13-phase-3a-ledger.md` (12 tasks: the private ledger) and then a Plan 3b (public case studies; headings only for now). Progress items 3.1-3.5. Item 3.6 (client logins, Q1) is out of the build (s14).

Exit criterion (3a): Aksh records an idea in one screen and one submit; the next morning it shows an entry price he did not type and a running result against the Nifty 50; he closes an idea, writes what he learned, and the private ledger shows hit count, excess return, holding period and a mistakes journal; `verify_ledger_chain()` reports the chain intact; one sealed line per day exists in `ledger_anchors` (published to the gist once the owner switches it on); a file about a company with a ledger entry in the last 30 days cannot be published. Rubric rows R1 2, 4, 6, 7 and R3 1-7 score at least 4.

Exit criterion (3b): one closed idea, at least 30 days after its close, is published as a case study through `publish_revision()`, showing what he expected, what happened and what he learned, with the original entry and a fingerprint a reader can check against the public file.

## 1. Purpose
Turn "I think this company will do well" into a dated, sealed commitment that is scored by a rule Aksh cannot bend, privately every day and publicly only as history. The private side is a tool for learning from his own decisions. The public side is evidence that the learning is real: an entry that was fingerprinted before the outcome existed.

## 2. Users and surfaces
- **Aksh (admin), phone and desktop:** a fifth desk tab, **Ledger** (`/desk/ledger`): summary, open and closed ideas, what needs him. `/desk/ledger/new` (one form). `/desk/ledger/[ideaId]` (the entries of one idea, and the actions on it). `/desk/ledger/closes` (closing prices: how current, enter one by hand, drop the day's NSE file, record a split or bonus). `/desk/ledger/journal` (what he learned, and the process-against-outcome grid).
- **Public reader:** nothing new in 3a. In 3b: a case-study page per closed idea, a "how this record is kept" section on `/process`, and the Mistakes page filled from published lessons.
- **Shlok:** two optional environment variables for the public anchor, the hosted migration push, and the answers to Q26-Q28.

## 3. The rules this phase protects
1. **The AI organises, Aksh thinks.** There is no LLM call anywhere in the ledger. Aksh's words (`idea_events.body_md`) and his choices (`idea_events.stance`) never share a column with a price or a return. Every number is in `prices_daily` or `idea_scores`, and `idea_scores` has exactly one writer, the SQL function `score_ideas()` (ADR-005 s3.5).
2. **Nothing is backdated and nothing is removed.** No event carries a date Aksh can set; `idea_events` refuses update, delete and truncate; each event's hash covers the one before it.
3. **Performance is private.** Hit rate, excess return and every other figure about how his ideas did stay on the private desk for as long as he is unregistered (publishing rule 2). s11 lists exactly what may ever be public.
4. **The only publish path is `publish_revision()`.** No ledger table has an anon grant, a public view or an anon-callable function. What becomes public is copied into a case-study revision by Aksh and passes the gate like any other text.

## 4. What Aksh does, day to day
| Moment | What he does | Actions |
|---|---|---|
| He forms a view | Ledger, "New idea": pick the company, choose "do better" or "do worse" than the Nifty 50, a horizon (6 months, 1 year, 3 years, or a number of days), whether he holds it, and write why and what would prove him wrong. Submit. | one form, one submit |
| Next morning | Nothing. The idea shows "Entry: close of 14 Oct" and, from the day after, how the share and the Nifty 50 have moved since. | none |
| Something changes | Open the idea: add a note, revise the thesis text or horizon, or record that he bought more or sold some. Each is one text box and one button. | one submit |
| He is done with it | "Close this idea": a reason (played out, thesis broken, horizon reached, better use of the money, other) and a sentence. The exit is the next close. | one submit |
| After closing | "What I learned": the lesson in his words, whether the process was sound or flawed, and tags for the kind of mistake. | one submit |
| Weekly | The Ledger tab: counts, the grid, and the "Needs you" list (ideas past their horizon, closed ideas with no lesson, prices that need a check). | reading |

Recording an idea is deliberately a form and not the quick-capture box: it is a commitment, not a passing thought. Quick capture is unchanged.

## 5. Data model
Migrations (Plan 3a; numbers are the next free ones at the time of writing, renumber in the pre-flight if migration 0010 for Q22 lands first): `20261013000010_ledger.sql`, `20261013000011_market_scores.sql`, `20261013000012_ledger_anchors.sql`, `20261013000013_ledger_gate.sql`. Same conventions as 0001-0009: `search_path = ''` on every function, RLS on every table, everything revoked first and then granted by name, helpers in `private`, append-only tables guarded by `private.reject_mutation()`.

### 5.1 `public.ideas` (one row per idea; identity plus the current state)
| Column | Type | Written by |
|---|---|---|
| `id` | uuid pk | `open_idea()` |
| `company_id` | uuid not null, fk `companies` on delete restrict | `open_idea()`, never changes |
| `item_id` | uuid null, fk `items` on delete set null (the company file it belongs with; a private convenience link, not sealed) | Aksh (the one column `authenticated` may update) |
| `expects` | text, `outperform` or `underperform` | `open_idea()`, never changes |
| `horizon_days` | int, 30 to 3650 | `open_idea()`, `revise` events |
| `held` | boolean | `open_idea()`, `upsize`, `downsize`, `close` (false) |
| `status` | text, `open`, `closed` or `void` | event functions only |
| `opened_at`, `closed_at` | timestamptz | event functions only |
| `close_reason` | text null, `played_out`, `thesis_broken`, `horizon_reached`, `better_use`, `other` | `close` event |
| `process_call` | text null, `sound` or `flawed` (from the latest `review`) | `review` event |
| `created_at` | timestamptz | default |

The state columns are a projection of the events, kept so lists are one query. `open_idea()` refuses a company with no `nse_symbol` ("This company has no NSE symbol yet. Add it under Names first.").

### 5.2 `public.idea_events` (append-only, hash-chained)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `seq` | bigint unique | gapless, global, assigned by the seal trigger under an advisory lock |
| `idea_id` | uuid fk `ideas` on delete restrict | |
| `kind` | text | `open`, `note`, `revise`, `upsize`, `downsize`, `close`, `review`, `void` |
| `recorded_at` | timestamptz | `clock_timestamp()` taken inside the lock; the caller cannot set it |
| `stance` | jsonb | Aksh's structured choices for this event, strict keys per kind (below) |
| `body_md` | text, 1 to 10,000 characters after trim | Aksh's words. Nothing else is ever written here |
| `nonce` | uuid | random; makes the hash unguessable from the public file |
| `canonical` | text | the exact sealed text (ADR-005 s3.1) |
| `prev_hash`, `hash` | text, 64 hex | `hash = sha256(prev_hash || E'\n' || canonical)`; the first `prev_hash` is 64 zeros |

`stance` keys: `open` `{expects, horizon_days, held, benchmark: "NIFTY 50"}`; `revise` `{horizon_days?}`; `upsize` `{}` (held becomes true); `downsize` `{held}` (whether any is left); `close` `{reason}`; `review` `{process, tags[]}` with tags from `thesis`, `valuation`, `timing`, `sizing`, `process`, `behaviour`, `luck`, `none`; `note` and `void` `{}`. An unknown key is refused.

State rules, enforced in SQL: an open idea takes `note`, `revise`, `upsize`, `downsize`, `close`, and `void` within 24 hours of `opened_at`; a closed idea takes `note` and `review`; a void idea takes nothing. A closed idea is never reopened: a new idea is opened instead. The direction (`expects`) cannot be revised.

Canonical text, version 1: a JSON object with `v`, `seq`, `id`, `idea`, `kind`, `at` (UTC, microseconds), `symbol`, `isin`, `company` (as they stood in `companies` at that moment), `stance`, `words`, `nonce`. It holds no price and no machine-derived number.

### 5.3 Functions on the ledger (migration 0010)
| Function | Runs as | Granted to | Does |
|---|---|---|---|
| `public.open_idea(p_company_id, p_expects, p_horizon_days, p_held, p_body_md, p_item_id default null) returns uuid` | definer, `private.is_admin()` | `authenticated` | inserts the idea and its `open` event in one transaction |
| `public.add_idea_event(p_idea_id, p_kind, p_body_md, p_stance default '{}') returns uuid` | definer, `private.is_admin()` | `authenticated` | checks the state rules and the stance keys, inserts the event, updates the projection |
| `private.seal_idea_event()` | trigger, before insert | none | lock, `seq`, `recorded_at`, `canonical`, `prev_hash`, `hash` |
| `public.verify_ledger_chain() returns table (ok boolean, events bigint, first_bad_seq bigint)` | definer | `service_role` | re-hashes every stored `canonical` in order (the work is in `private.ledger_chain_check()`) |
| `public.check_ledger_chain()`, same result | definer, `private.is_admin()` | `authenticated` | the admin's door to the same check |
| `public.tracked_symbols() returns setof text` (created in 0011: it reads `idea_scores`) | definer | `service_role` | NSE symbols of companies with an open idea or a closed idea whose exit is not fixed |

Where a function serves both the job and the admin, there is one private implementation and two thin public wrappers, one per role: the job's has no caller check and is granted to `service_role` only, the admin's checks `private.is_admin()` and is granted to `authenticated` only. No function reads the role out of the request.

No role holds INSERT, UPDATE or DELETE on `idea_events`. `authenticated` holds SELECT on both tables (RLS: admin only) and UPDATE on `ideas (item_id)` only. `anon` holds nothing. `service_role` holds nothing on these two tables.

### 5.4 Prices and the trading calendar (migration 0011)
- `public.prices_daily`: `id` bigint identity; `company_id` uuid null fk; `benchmark` text null (`NIFTY50`); exactly one of the two is set; `trade_date` date; `close` numeric(14,4) > 0; `source` text (`nse_fetch`, `nse_upload`, `manual`); `symbol`, `series`, `isin` text null (as printed that day); `created_at`. Unique per company and date, and per benchmark and date (two partial unique indexes).
- `public.market_days`: `trade_date` date pk; `status` text (`open`, `shut`); `source` text; `decided_at`. A date becomes `open` when its closes and the Nifty 50 close are stored, and `shut` when its file was missing and a later date is `open`. A date older than the 7-day fetch window that was never decided stays undecided and is ignored.
- `public.corporate_actions`: `id`; `company_id` fk; `ex_date` date; `factor` numeric(12,6) > 0 and not 1 (new shares per old share: 5 for a 1:5 split, 2 for a 1:1 bonus); `kind` text (`split`, `bonus`, `other`); `note` text; `created_at`. Unique on company, date and kind. The admin may insert and delete (a correction of a market fact); it is never public.
- `public.idea_scores`: `idea_id` pk fk; `entry_date`, `entry_close`, `entry_index`; `mark_date`, `mark_close`, `mark_index`; `factor`; `idea_return`, `index_return`, `excess` numeric(10,6) as fractions; `holding_days` int; `is_final` boolean; `entry_source`, `mark_source` text; `flags` text[] (`entry_pending`, `exit_pending`, `jump`, `isin_changed`, `stale`); `computed_at`.

| Function | Granted to | Does |
|---|---|---|
| `public.store_fetched_closes(p_trade_date date, p_rows jsonb, p_index_close numeric) returns integer` | `service_role` | stores `nse_fetch` closes for tracked companies (matched on `companies.nse_symbol`) and the Nifty 50, marks the date `open` |
| `public.mark_market_day_shut(p_trade_date date)` | `service_role` | records a missing file as a shut day under the rule above |
| `public.enter_closes(p_trade_date date, p_rows jsonb, p_index_close numeric, p_source text) returns integer` | `authenticated` (admin check inside; `p_source` is `nse_upload` or `manual`) | the hand paths |
| `private.put_close(...)` | none | the one place the source ladder lives: a higher source replaces a lower one, never the reverse |
| `public.score_ideas() returns integer` | `service_role` | recomputes every non-void idea (s6) through `private.score_ideas_now()`, the only code that writes `idea_scores` |
| `public.rescore_ideas() returns integer` | `authenticated` (admin check inside) | the same recompute after the admin enters a close or a corporate action |

Grants: `authenticated` SELECT on all four tables (RLS: admin only), INSERT and DELETE on `corporate_actions`; no direct write on `prices_daily`, `market_days` or `idea_scores` for any API role; `service_role` SELECT on `market_days`; `anon` nothing.

### 5.5 Anchors (migration 0012)
`public.ledger_anchors`: `anchor_date` date pk (IST); `event_count` int; `first_seq`, `last_seq` bigint null; `head_hash` text; `line` text (the exact JSON line: `{"v":1,"date":...,"count":...,"first_seq":...,"last_seq":...,"hashes":[...],"head":...}`); `published_at` timestamptz null; `anchor_version` text null; `created_at`. A row never changes except that `published_at` and `anchor_version` may be set once.
- `public.seal_ledger_days() returns integer` (`service_role`): verifies the chain, then writes one row for every IST date from the day after the last sealed date (or the date of the first event) through yesterday. Days with no event get `count: 0` and the previous head.
- `service_role`: SELECT, and UPDATE on `(published_at, anchor_version)`. `authenticated`: SELECT (admin). `anon`: nothing; the public copy is the gist.

### 5.6 The gate (migration 0013)
`public.publish_revision()` is replaced (same signature, same `c_policy`, same service-role-only grant, the 0005 body plus two checks):
- **Rule 4:** fails when the item has a `company_id` and a non-void idea on that company has an `open`, `close`, `upsize` or `downsize` event whose IST date is within the last 30 days. Message: "The ledger has an entry on this company from the last 30 days. This can be published from DD Mon YYYY." Applied to every revision of every item kind (publishing rule 7), never liftable by a sentence allowance.
- **Rule 5, consistency:** fails when `holds_position = 'no'` and an open idea on that company has `held = true`. Message: "The ledger shows a position in this company; the disclosure cannot say no." `yes` and `not_disclosed` always pass this check (the ledger may be incomplete; a "no" must not be false).

## 6. Scoring (the rule Aksh cannot bend)
For each non-void idea, `score_ideas()` computes:
- **Entry:** the first `market_days.open` date `d` with `(d + 15:00) at Asia/Kolkata > recorded_at` of the `open` event, on which both the company and the Nifty 50 have a close. Until it exists the idea is `entry_pending` and shows "Entry will be set at the next close".
- **Exit** (closed ideas): the same rule from the `close` event. Until it exists the idea is `exit_pending` and is marked to the latest close, `is_final = false`.
- **Mark:** the exit date, or for an open idea the latest date on which both closes exist.
- `factor` = product of `corporate_actions.factor` with `entry_date < ex_date <= mark_date`. `idea_return = mark_close * factor / entry_close - 1`. `index_return = mark_index / entry_index - 1`. `excess = idea_return - index_return` for `outperform`, the negative of that for `underperform`. `holding_days` = calendar days from entry to mark.
- **Flags:** `jump` when two consecutive stored closes inside the window fall by more than 30% with no corporate action on that date; `isin_changed` when the ISIN printed on the latest row differs from the entry row's; `stale` when an open idea's mark is three or more weekdays old.

Price return only: dividends are left out on both sides (the NSE index file is the price index). The private screens say so.

Summary figures (private only, pure TypeScript over `idea_scores`, `src/modules/ledger/summary.ts`): closed ideas that ended ahead, as "4 of 7" (a percentage is shown only from 5 closed ideas up); all ideas including open ones marked to the latest close, as "6 of 12", shown beside it so that not closing losers cannot flatter the first number; median excess in percentage points (closed, and all); median and range of holding days; ideas past their horizon; closed ideas with no lesson. Void ideas are counted separately ("2 withdrawn") and flagged ideas are listed as "needs a check" and left out until resolved. Nothing is annualised.

Journal grid (`src/modules/ledger/journal.ts`): closed, reviewed ideas in four cells, Aksh's `process_call` (sound, flawed) against the machine's outcome (ahead, behind): sound and ahead "earned", flawed and ahead "lucky", sound and behind "unlucky", flawed and behind "deserved". The process call is his; the outcome is the function's; they meet only on the screen.

## 7. Market data
`src/lib/providers/market-data.ts` (types only), in the style of `ocr.ts`:

```ts
export type Close = { symbol: string; series: string; isin: string | null; close: number };
type Miss =
  | { kind: "no_file" }                           // 404: weekend, holiday or not published yet
  | { kind: "blocked"; message: string }          // 401, 403, 429, or an HTML page where a file was expected
  | { kind: "provider_error"; message: string };  // timeout, 5xx, a zip or CSV we could not read
export type EquityDay = { kind: "ok"; tradeDate: string; closes: Close[] } | Miss;
export type IndexDay = { kind: "ok"; tradeDate: string; close: number } | Miss;
export interface MarketDataPort {
  readonly name: "nse" | "fixture";
  /** Only the asked-for symbols are returned; the rest of the file is dropped in memory. */
  equityCloses(tradeDate: string, symbols: readonly string[], opts?: { timeoutMs?: number }): Promise<EquityDay>;
  indexClose(tradeDate: string, opts?: { timeoutMs?: number }): Promise<IndexDay>;
}
```

- **NSE adapter** (`nse-bhavcopy.ts`): the two URLs in ADR-005 s2, built from `NSE_BHAVCOPY_URL_TEMPLATE` and `NSE_INDEX_URL_TEMPLATE`; host fixed to `nsearchives.nseindia.com` in code whatever the template says; https only; `redirect: "error"`; a browser-like `User-Agent`; 8 s timeout; 4 MB cap on the answer and 16 MB on the unzipped file. The zip is read by a single-entry reader on `node:zlib` (`zip-one.ts`, no new dependency): one deflated or stored entry, no encryption, no zip64, anything else is `provider_error`. Per symbol the row is chosen by series in the order `EQ`, `BE`, `BZ`, `SM`, `ST`; other series are ignored. The parsers (`parseBhavcopyCsv`, `parseIndexCsv`) are exported pure functions so the hand-drop path uses the same code.
- **Fixture adapter** (`fixture-market-data.ts`): deterministic closes from the symbol and date, weekends `no_file`, symbol `BLOCKED` is `blocked`. Chosen by `LLM_ADAPTER=fixture`, refused on a Vercel deployment, exactly as `createOcrPort` does (ruling R27).
- **Manual entry:** one close for one company or the Nifty 50 and a date (`manual`), or the day's NSE zip or index CSV dropped on the Closes page (`nse_upload`). The drop goes to a route handler (the admin's session, at most 4 MB against Vercel's 4.5 MB body limit) that parses it with the same functions and calls `enter_closes()`.
- **Never committed:** a real NSE file. Tests build synthetic files with the real header row and invented symbols and prices.

## 8. The daily cron
`/api/cron/daily` runs `SERVER_DAILY_STEPS` (`src/modules/ops/drain.ts`). Three steps are added before `ingestion:sweep`, each its own heartbeat, each harmless to run twice (pitfalls s1: the cron may duplicate and never retries):

| Step | Does | Budget | Fails (heartbeat `ok = false`) when |
|---|---|---|---|
| `ledger:prices` | no tracked symbol: "nothing to fetch". Otherwise, for the oldest undecided weekdays of the last 7 days up to yesterday (IST): fetch both files, `store_fetched_closes()`, or `mark_market_day_shut()` for a missing file that a later open day follows. Stops when its time is spent; the next run continues. | 25 s, at most 2 dates | three or more weekdays have passed with no stored close |
| `ledger:score` | `score_ideas()` | 5 s | the function raises |
| `ledger:anchor` | `seal_ledger_days()`; then, when the gist is configured: read the year's file, check every published line is unchanged, append the new lines, record the version | 15 s | the chain does not verify; a published line differs or is missing; GitHub refuses or times out twice |

Worst case 45 s, then the sweep's 200 s, inside Hobby's 300 s (https://vercel.com/docs/functions/limitations). GitHub: one read and one write a day against 5,000 an hour. NSE: two small files per trading day. No Groq, no OCR.

`/api/health` gains two checks, `ledger:prices` and `ledger:anchor`, that are healthy until they have run once and unhealthy when their latest run failed, so the existing uptime monitor emails Shlok and Aksh once per incident (ADR-001 s8.2). A "Fetch closes now" button on the Closes page runs the same three steps for the admin (the precedent is `kickReadingAction` in `src/app/desk/inbox/pump-actions.ts`).

## 9. The public anchor
`src/lib/providers/anchor.ts`:

```ts
export type AnchorResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "refused"; reason: "auth" | "missing" | "too_large"; message: string }
  | { kind: "provider_error"; message: string };
export interface AnchorPort {
  readonly name: "github-gist" | "fixture";
  /** Where a reader can see the file. */
  readonly publicUrl: string;
  read(file: string, opts?: { timeoutMs?: number }): Promise<AnchorResult<{ text: string | null }>>;
  write(file: string, text: string, opts?: { timeoutMs?: number }): Promise<AnchorResult<{ version: string | null }>>;
}
```

- **Gist adapter** (`github-gist.ts`): `GET` and `PATCH https://api.github.com/gists/{id}`, host fixed in code, `Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`, 7 s timeout. A `truncated` file is `refused: too_large`. The version is `history[0].version` when present.
- **Off by default.** With `GITHUB_GIST_TOKEN` or `LEDGER_ANCHOR_GIST_ID` unset the port is null: days are still sealed in `ledger_anchors`, nothing leaves the database, and the Ledger page says "Public proof is not switched on. N days are sealed and waiting." When the owner switches it on, the waiting lines are published together and GitHub's date for them is that day; the page says so.
- **What we claim** (ADR-005 s6): fingerprints are published daily in a public file whose changes GitHub dates. Not "cannot be altered".

## 10. Private ledger UI (3a: the minimum that meets the exit criterion)
Built from what exists: the desk shell and tabs (`desk-tabs.tsx` gains "Ledger" between Items and Names), `stat-tile.tsx`, `ledger-table.tsx` (the segment-3 table with the sticky phone key row), `needs-you-card.tsx`, `as-of.tsx`, `empty-state.tsx`, `pending-button.tsx`, `wording-guide.tsx`. New components live in `src/components/desk/private/ledger/`. 375 px first; every number in tabular figures with its as-of date; no colour-only meaning.

- **`/desk/ledger`:** a status line ("Closes to 12 Oct. Chain intact, 42 entries. Public proof to 12 Oct."); tiles (closed ahead "4 of 7", all ideas ahead "6 of 12", median excess, median days held); "Needs you" cards; open ideas (company, expects, entry date, days held, share and Nifty 50 moves, excess, flags); closed ideas (the same with the reason and whether a lesson is written). Empty state: "No ideas yet. Write the first one when you have a view you would stand behind."
- **`/desk/ledger/new`:** the form in s4. The wording guide is shown beside the text box. After submit: the idea page with "Sealed 13 Oct 2026, 14:02. Entry will be set at the next close."
- **`/desk/ledger/[ideaId]`:** the score block (machine), then the entries in order (his words), each with its date, kind and the first 8 characters of its hash; one action form at a time (note, revise, bought more, sold some, close, lesson, withdraw while allowed); a link to the company file when `item_id` is set.
- **`/desk/ledger/closes`:** how current the closes are, "Fetch closes now", enter a close, drop the NSE file, the list of hand-entered closes, corporate actions (add, remove).
- **`/desk/ledger/journal`:** lessons newest first with their tags, and the grid of s6.

Copy uses plain words and none of the gate's lexicon: "expects to do better than the Nifty 50", never "buy"; "ended ahead", never "hit". Strings added to `src/lib/messages.ts` where a server action reports back.

## 11. Compliance treatment
Performance is the most sensitive thing this site can show. The reading that governs: SEBI's January 2025 circular keeps "solely investor education" outside the ban provided there is no recommendation and **no performance claim**; the May 2026 circular adds the 30-day lag and forbids naming a security from the preceding 30 days in a way that indicates future price direction (tooling-landscape s5). Publishing rules 2, 3, 3a, 4, 7 and 8 are the engineering form.

| Thing | Private desk | Public, ever? | Condition |
|---|---|---|---|
| Hit count or rate, "N of M ahead" | yes | **never** while unregistered | rule 2; no aggregate over ideas is computed for, stored for or rendered on a public page |
| Mean or median excess return, any average | yes | **never** | rule 2 |
| A list or table of ideas with their results, or sortable by result | yes | **never** | a league table is a performance claim without the words |
| An idea's return or excess as a printed number ("+32%", "8 points ahead") | yes | **never** | rule 2; the lint already refuses the phrasing in his prose |
| Rupee entry, exit or current prices | yes | **never** in 3b | not needed to teach; avoids a price table (NSE terms) |
| Position size, quantities, money | not stored at all | never | s14 |
| An open idea, in any form | yes | **never** | a live directional view on a named security |
| That an idea exists, before its close is 30 days old | yes | **never** | ADR-001 s8.8 |
| The grid (earned, lucky, unlucky, deserved) as counts | yes | **never** | an aggregate of outcomes |
| A closed idea's original entry (words, date, expectation, horizon), its fingerprint and the anchor link | yes | 3b, through the gate | every revealed event at least 30 days old; the words pass the lint; rule 4 clear; owner switch on (Q27) |
| A rebased chart (share and Nifty 50, both 100 at entry, weekly points, all at least 30 days old, source and "figures to" printed) | yes (daily) | 3b, through the gate | no `jump` or `isin_changed` flag; rule 3a; a second owner switch, off by default (Q27) |
| What happened and what he learned, in his words; the close reason; his process call for that one idea | yes | 3b, through the gate | lint rules 1 and 2 |
| Days from entry to exit, and the dates | yes | 3b | they are the dates of the lagged events |
| The daily fingerprint file (dates, counts, hashes) | yes | yes, when the owner switches it on (Q26) | names no security, no direction, no result |

Disclaimers on a public case study (3b): the standard disclosure block with `holds_position` and the review date (rule 5); the standfirst from `learning_objective` (rule 6); under the chart "Closing prices, NSE. Rebased to 100 on {entry date}. Figures to {date}. Price only, dividends not included. A past case, not a view on the share today."; under the entry "Written on {date}. Fingerprint {hash}. Listed in the public file on {date}."

Lags: 30 days from the latest revealed event and the latest chart point (rule 3a, counted from `data_as_of`); 30 days from the latest stance-changing ledger entry on the company (rule 4, built in 3a); both evaluated on every revision (rule 7).

What 3a changes for existing public files: from migration 0013 a file about a company cannot be published or revised for 30 days after Aksh opens, closes or resizes an idea on it. The revision already public stays up. The disclosure on a public file is dated ("Last reviewed") and is not changed when the ledger changes, because changing it at once would reveal an unlagged entry; the private desk shows a reminder card instead (Q28).

No change to `docs/compliance/publishing-rules.md` or `POLICY_VERSION` in 3a: rule 4 is already written there as "enforced in code from Phase 3". Plan 3b starts with a rules addendum (v1.1) for case-study outcome figures and bumps the policy version with it.

## 12. Degradation and failure modes
| Failure | What happens | Detected by | What Aksh sees |
|---|---|---|---|
| NSE has no file (holiday) | date marked `shut` once a later date is open | `market_days` | nothing |
| NSE blocks Vercel or renames the file | no closes stored; scores stay at the last mark with `stale` | `ledger:prices` fails after 3 weekdays; health check; email | strip: "No closing prices since Fri 9 Oct. Drop the day's NSE file on the Closes page, or enter closes by hand." |
| The cron does not fire | nothing new that day | `heartbeat:daily` rule (existing, 36 h) | the existing late-clock strip |
| The cron fires twice | steps find nothing to do | idempotent functions; unique indexes | nothing |
| The steps run out of time | remaining dates wait a day | heartbeat detail "1 date left" | nothing unless 3 weekdays pass |
| Split or bonus not entered | return is wrong by the factor | `jump` (fall over 30% in a day), `isin_changed` | "Needs a check: the price fell 50% on 3 Mar. Was there a split or bonus?"; the idea is left out of the summary |
| A typed close is wrong | score uses it until the official file arrives | `entry_source` or `mark_source` is `manual` | "includes a hand-entered close" on the idea |
| Company has no NSE symbol, or it changed | idea cannot be opened; or no new closes | `open_idea()` refuses; `stale` | "Add the NSE symbol under Names" |
| GitHub down, token expired, gist deleted | lines stay sealed and unpublished | `ledger:anchor` fails; health check; email | "Public proof is 2 days behind: GitHub refused the key." |
| A published line differs (gist edited, or database restored from an old backup) | the step writes nothing | prefix check in `ledger:anchor`; health check | "The public file and the ledger disagree from 4 Oct. Nothing was changed. Tell Shlok." |
| A row of `idea_events` altered by a superuser | chain no longer verifies | the chain check before every seal, and on the Ledger page | "The ledger chain is broken at entry 17." |
| Supabase paused or over 500 MB | writes fail | existing pump heartbeat every 15 min; the ledger adds about 1 MB a year (our arithmetic: some 30 companies by 250 days) | existing strips |
| Aksh opens an idea by mistake | `void` within 24 hours; stays in the chain | state rule | "Withdrawn" with his reason; counted apart |
| A stolen admin session | can append ideas and events; cannot change, remove or backdate any; cannot write a score | grants and triggers (pgTAP) | junk entries are visible and voidable for a day |
| A real NSE file committed to the public repo | terms breach | plan constraint; fixtures are built in tests | n/a |
| Free quota of Groq or OCR hit | no effect: the ledger uses neither | n/a | n/a |

## 13. Testing
- **pgTAP, one file per migration** (`supabase/tests/0010_ledger.test.sql` to `0013_ledger_gate.test.sql`): append-only; state rules; strict stance keys; chain links and `verify_ledger_chain()` after a simulated tamper (as the table owner); `anon` and `service_role` hold nothing they should not; an admin session cannot insert into `idea_events`, update `ideas.status` or write `idea_scores`; the source ladder; entry and exit dates around 15:00 IST, weekends and shut days; factors; flags; sealing with empty days; rule 4 and rule 5 pass and fail cases, and that 0013 keeps `c_policy` and the service-role-only grant. The function allowlist in `0002_function_privileges.test.sql` is extended.
- **Unit (Vitest):** zip reader and both parsers on synthetic files and on hostile ones (two entries, oversize, wrong method); adapters against recorded response shapes with an injected `fetch`; date planning; summary and journal arithmetic; the anchor algorithm (append, already there, mismatch, truncated); `ledger.graph.test.ts` (no LLM port, no secret-key client in the module).
- **e2e (Playwright, fixture adapters, 375 and 1280):** open an idea, run the daily route, see the entry and a result; note, close, lesson; the closes page (manual close, file drop); the gate refusing a file under rule 4; axe on every new page.

## 14. Out of scope (what was cut, and why)
- **3.6 client logins (Q1).** Needs legal input on whether showing the private tier to identified people is advice. Nothing is built: no accounts, no `clients` read path, no invitation flow. The `clients` visibility value stays in the schema only, as ADR-001 s8.7 says. It is not a task in Plan 3a or 3b.
- **Backdated or imported past ideas.** Would need a class of entries that the chain cannot vouch for. Aksh records what he holds as of today and says so in his words.
- **Money:** quantities, rupee P&L, portfolio weights, an equity curve. The ledger scores ideas, not a portfolio.
- **Total return, dividends, a second benchmark, annualised figures.**
- **A holiday calendar.** The calendar is learned from which files exist.
- **Automatic corporate actions.** Hand-entered factors and two flags.
- **Intraday or same-day pricing; BSE-only companies; anything outside NSE-listed equities (Q3).**
- **A second witness for the anchor** (ADR-005 s7): Plan 3b heading.
- **A lint hint while writing an idea** (so the original entry can later be revealed): Plan 3b; 3a shows the standing wording guide.
- **Automatic publishing when the 30 days pass.** Publishing stays Aksh's act through the gate; the desk only shows the date from which it will pass.
- **Opening an idea from quick capture; prefilling `holds_position` from the ledger; a ledger panel on the item page.**

## 15. Decisions made on Shlok's behalf
| # | Decision | Alternative | Cost if wrong |
|---|---|---|---|
| D1 | An idea is "do better or worse than the Nifty 50 over a horizon"; no price targets | target prices and ranges | He cannot record a target; it can be written in his words. Adding a field later is a new canonical version |
| D2 | Entry and exit are the first NSE close after the event (15:00 IST cut-off); no date field | let him pick the date or type the price | Ideas written after 15:00 lose a day; past ideas cannot be imported |
| D3 | No backdated import of earlier ideas | an "imported, unverified" class shown apart | His earlier calls are missing from the record; can be added later as a flagged class |
| D4 | No quantities or money; `held` is yes or no | full position ledger | No portfolio-weighted figure; would need new stance keys |
| D5 | Withdraw (`void`) only within 24 hours | never, or any time | A one-day loser could be withdrawn; it stays visible and counted apart |
| D6 | One global hash chain; the sealed text is stored and hashed | per-idea chains; re-serialise to verify | None expected; changing it later means a new chain version |
| D7 | The anchor lists every event hash per day | daily head only | The number of entries per day is public; format v2 fixes it without breaking old lines |
| D8 | The anchor is off until the owner sets a token and gist id; days are sealed meanwhile | block the build on the account, or create a gist ourselves | GitHub's date for the first batch is the switch-on day, not each day |
| D9 | Scores are written only by `score_ideas()` in SQL | TypeScript scoring with a write grant | Harder to read; slower to change the formula (a migration each time) |
| D10 | Ledger functions are granted to `authenticated` with an admin check, not confined to `service_role` | the ADR-003 pattern | A stolen session can append junk through the function directly rather than only through the action; same outcome |
| D11 | Source ladder: fetched file, then dropped file, then typed number | last write wins | A wrong official row cannot be corrected by hand; would need an override source |
| D12 | Price return against the Nifty 50 price index; arithmetic excess in percentage points | total return, geometric excess | Both sides understate by dividends; long holds of high-yield shares look slightly worse than they were |
| D13 | Closed-only count is always shown beside the all-ideas count; no percentage under 5 closed ideas | hit rate alone | More to read; none otherwise |
| D14 | Only tracked companies are stored from the NSE file | store the whole file | A chart cannot start before the idea did; by design |
| D15 | Health alarm after three weekdays without a close (ADR-001 s9.2 said two missed days) | two days, or a holiday calendar | The email comes a day later; two consecutive holidays do not raise a false alarm |
| D16 | Ledger steps run inside the one daily cron, before the ingestion sweep, capped at 45 s | on the 15-minute pump; a second cron entry | One attempt a day at NSE; the manual button and file drop cover a bad day |
| D17 | A single-entry zip reader on `node:zlib`, no new dependency | add `fflate` | If NSE changes the zip's shape the reader refuses it and the file-drop path fails the same way; swap in a library then |
| D18 | Rule 4 is read strictly: every revision of any item kind about the company, 30 IST days from any open, close or resize | first publish only | A public file cannot be revised for 30 days after he acts on that company; the existing revision stays up (Q28) |
| D19 | The gate refuses "no position" when the ledger shows one; it does not touch a file already public | auto-update or auto-unpublish | A dated "no" can go stale on a public file; the desk reminds him (Q28) |
| D20 | Public case studies only for closed ideas, 30 days after the close; no public numbers of his results at all | lagged open ideas; printed returns | The public side is empty for months; the thesis files remain the public content |
| D21 | No automatic publish at day 30 | a cron release step (ADR-001 s4 listed one) | One more click for Aksh; he decides what goes out |
| D22 | A fifth desk tab, "Ledger", between Items and Names | a section inside Items | Five tabs on a phone bar; desk-ui may regroup without changing routes |
| D23 | Idea is recorded on a form, not through quick capture | an `i:` capture prefix | Slower than a capture; an idea is a commitment |
| D24 | Four migrations (ledger, market and scores, anchors, gate), each reviewed on opus | one large migration | More files; each is under 300 lines and reviewable |
| D25 | 3.6 is cut from the build, not deferred to a task | a read-only client view behind a flag | None until Q1 is answered |

## 16. Open for Shlok (each has a safe default the build proceeds on)
- **Q26 (public, account):** which GitHub account owns the public fingerprint gist (Aksh's reads best), and its token. Default: off; days are sealed and wait.
- **Q27 (legal):** may a case study of a closed idea, 30 days after the close, show the original directional expectation and a rebased chart drawn from NSE closes? Default: 3b is built with both behind owner switches in `private.settings`, off.
- **Q28 (legal):** rule 4 read strictly (built) or for the first publish only; and whether a public "no position" disclosure must change when he later opens one. Default: strict; the disclosure stays dated and the desk reminds him.
- **Q1 (legal, existing):** client logins. Default: not built.
- Not for Shlok, recorded as Q29: whether NSE answers Vercel's addresses can only be learned from the first week of hosted heartbeats; the file-drop path is the fallback.

## Why this impresses an allocator
Most personal track records are a spreadsheet that could have been written yesterday. This one cannot have been: every entry is sealed when written, priced at a close that had not happened yet, scored by a function nobody can overwrite, and listed in a public file the next morning. The private screen shows the uncomfortable numbers together (closed ideas beside all ideas, lucky beside earned), which is how a risk committee reads a manager. And the public side shows restraint: no figure about his results at all, only single, closed, month-old cases with the original words and a fingerprint, which is what a compliance officer would have asked for.

## 17. Amendments (Plan 3a Task 1 fix round 1, 2026-10-13; append-only, these override the text above where they differ)
- **s12 correction (row "A row of `idea_events` altered by a superuser").** The chain check proves the stored events are consistent with themselves; it does NOT prove they are unaltered. An owner who rewrites an event and recomputes its hash and every later hash, or who drops the last events, passes it. Only a comparison against days already sealed in `ledger_anchors` and published to the gist can catch that; that comparison is built in `seal_ledger_days()` (Plan 3a Task 3), not in migration 0010. UI copy must say "consistent with itself" or "matches the published fingerprints", never "unaltered", until the comparison exists.
- **s5.2 canonical text, version 1 (never hosted, so the version stays 1).** Adds `company_id` (the company's uuid) to the sealed keys, so an idea re-pointed at another company is detectable. Exact key set: `v, seq, id, idea, kind, at, company_id, symbol, isin, company, stance, words, nonce`, in that order. The check refuses a sealed text with any other key set.
- **s5.3 chain check result.** `verify_ledger_chain()` and `check_ledger_chain()` return `(ok, events, first_bad_seq, bad_idea)`. After the hash walk they replay every idea's events and report the first idea whose row (status, `opened_at`, `closed_at`, direction, horizon, held, close reason, process call, company) disagrees with its sealed events; `first_bad_seq` is then that idea's first seq and `bad_idea` its id. The chain check also asserts that `recorded_at` never decreases with `seq`.
- **s5.2 words.** `body_md` must contain at least one character that is not whitespace (any ASCII whitespace, no-break space, zero-width space or byte-order mark) and is at most 10,000 characters as typed, padding included.
- **s5.2 state rules and D5 (void window).** An idea can be withdrawn only until the EARLIER of 24 hours after opening and the next 15:00 IST after opening (the entry-close cut-off of s6; 15:00:00 sharp already belongs to the next day's close). It can never be withdrawn once its entry price is known. The rule does not read the trading calendar: the next 15:00 IST is never later than the real entry close, so it errs on the safe side (an idea opened on a Saturday morning has only until Saturday 15:00 IST). Error code `void_too_late` is unchanged.
- **s5.2 one direction per company.** `open_idea()` refuses a company while an open idea with the opposite direction exists on it (error `ledger:opposite_open`). A closed or void idea does not block. Purpose: opening a pair and withdrawing the loser.
- **s5.2 stance on the table.** The per-kind stance shape (including the four `open` keys, with benchmark "NIFTY 50") is enforced by the seal trigger, so it holds for any writer, not only `add_idea_event()`.
- **s5.2 time.** The seal never dates an event earlier than the event before it, even if the server clock steps back.
- **Restores.** `idea_events` must be restored with triggers off (`session_replication_role = replica`), never with the seal trigger firing: a normal INSERT or COPY re-seals every event with today's time and a new nonce. See `docs/runbooks/backup-and-restore.md`, "Restoring the ledger".
- **Readers of the ledger (Plan 3a Task 2 fix round, decided by the controller).** The scorer and the publish gate take direction, entry time, exit time and void from the sealed events, not from the `ideas` projection.

## 18. Amendments (Plan 3a Task 2 fix round 1, 2026-10-13; append-only, these override the text above where they differ)
- **s5.3 / s12 the source of a price is never a caller's word.** `enter_closes(p_trade_date, p_rows, p_index_close)` has no source parameter and always writes `manual`. A new `service_role`-only door `store_uploaded_closes(p_trade_date, p_rows, p_index_close)` writes `nse_upload` (the official file Aksh dropped, parsed by a trusted server component; the Closes-page route handler of s7 must reach it that way, or its drop is only `manual`). Only `store_fetched_closes` writes `nse_fetch`.
- **s7 / s8 "decided" dates (Task 7 interface).** A date counts as decided only when `market_days.source = 'nse_fetch'` (open or shut). A date opened by a typed or uploaded index close keeps its weaker source and the daily fetch still asks for it inside the 7-day window. `mark_market_day_shut` ignores manual-only closes and may shut a date a typed close opened; a typed or uploaded index close never reopens a `shut` day (the calendar follows the ladder).
- **s6 / s12 hand entries.** No close is accepted for a date before 15:30 IST of that date (error `future_date`), and a typed close is refused on a Saturday or Sunday (error `weekend`; the trusted upload door accepts a special Saturday session). A closed idea stays in `tracked_symbols()` until its score is final on `nse_fetch` closes at both ends, so an official row still lands after a typed close made it final. A new score flag `hand_price` marks any score whose entry or mark rests on a close that is not `nse_fetch`; the summary and the 3b gate treat it as "not for a public figure".
- **s5.4 / s6 scorer facts.** `score_ideas()` takes direction, void, close, open time and company from the sealed events, raises `ledger:projection_mismatch` when `ideas` disagrees, and raises `ledger:chain_broken` (detail: `first_bad_seq`, `bad_idea`) when `check_ledger_chain()` is not ok. It writes nothing in either case; existing scores stay as they were.
- **s6 identity.** The symbol and ISIN sealed with the idea are compared with every price row used (each identifier followed on its own, so a typed row with no ISIN cannot hide a change). A change with no action of any kind dated in the step raises `isin_changed`.
- **s5.4 corporate actions.** `factor` is bounded to 0.001 to 1000. Actions are append-only: a correction is a new row with `supersedes` naming the old one (same company; a row can be superseded once); no API role can update or delete. New kind `none` (factor 1) records "I looked, the move is real" and clears `jump` and `isin_changed` for its step. `jump` is raised for a fall below 70%, for a rise above 1/0.7 of the previous close, and for a factor that makes the step bigger, each tested on the adjusted series.
- **s6 open point (a).** The entry or exit still slides to the first day with both closes; `idea_scores.entry_skipped_days` and `exit_skipped_days` record the open days passed over (machine facts, never in an event).
- **s6 open point (b).** Every change to a fixed entry (date or prices) or to a final score is written to the append-only `idea_score_changes` (idea, time, names of the changed fields, old and new row); only the scorer writes it. The score is still a recomputation.
- **s6 open point (c).** One block per idea. A return of 1000 (100,000%) or more, or a factor outside 0.000001 to 1e12, stores no returns and the flag `implausible`; a numeric overflow does the same. The stored `excess` is the difference of the stored (rounded) returns. Score flags are now: `entry_pending, exit_pending, hand_price, jump, isin_changed, implausible, stale`; `stale` also applies to a closed idea waiting for its exit.
- **Rows.** Only equity series (`EQ, BE, BZ, SM, ST`) are stored; of two rows of one symbol and series the lower close is stored.

## 19. Copy added by Plan 3a Task 4 (2026-10-13; append-only; every string is pending Shlok's approval)
Plain words, none of the publish gate's lexicon. Error texts are in `src/lib/messages.ts` (and equal `LEDGER_ERROR_TEXT` in `src/modules/ledger/errors.ts`); labels and integrity-check wording are in `src/lib/messages-ledger.ts`.
- `ledger-no-symbol`: "This company has no NSE symbol yet. Add it under Names first." (the sentence of s5.1)
- `ledger-not-open`: "This idea is not open, so that entry cannot be added."
- `ledger-not-closed`: "This idea is still open. Close it before writing what you learned."
- `ledger-void-too-late`: "This idea can no longer be withdrawn, because its entry price is about to be fixed. Close it instead."
- `ledger-words-required`: "Write your own words first. An entry cannot be empty."
- `ledger-body-too-long`: "That is over 10,000 characters. Shorten it."
- `ledger-bad-horizon`: "Choose a horizon from 30 days to 10 years."
- `ledger-bad-input`: "Check this idea's fields and try again."
- `ledger-is-void`: "This idea was withdrawn, so nothing more can be added to it."
- `ledger-opposite-open`: "An open idea on this company expects the opposite. Close or withdraw it first."
- `ledger-not-found`: "This idea or company could not be found."
- Integrity check, passing: "Consistent with itself: N entries, M sealed days." with the standing note "This checks that the entries and the sealed days agree with each other. It does not show that nothing could have been changed." (s17: never "unaltered", "cannot be altered" or "tamper-proof".)
- Integrity check, failing: "The ledger chain is broken at entry N." (the chain check); "The sealed days and the entries disagree from D (reason). Nothing was changed. Tell Shlok." (the sealed-day comparison; reasons: an entry is dated before the first sealed day / a sealed day is missing / the number of entries differs / the entry numbers differ / the fingerprint differs / the stored line differs).
- Labels: "Expects to do better than the Nifty 50" / "Expects to do worse than the Nifty 50"; entry kinds "Idea recorded, Note, Revised, Bought more, Sold some, Closed, What I learned, Withdrawn"; close reasons "Played out, Thesis broken, Horizon reached, Better use of the money, Other"; "Process was sound" / "Process was flawed"; mistake tags "Thesis, Valuation, Timing, Sizing, Process, Behaviour, Luck, No mistake"; grid cells "Earned (sound process, ended ahead), Lucky (flawed, ahead), Unlucky (sound, behind), Deserved (flawed, behind)".
- Score flag lines: "Entry will be set at the next close." / "Exit will be set at the next close." / "Includes a close that was entered by hand." / "The latest close is three or more weekdays old." / "Needs a check: the price moved sharply. Was there a split or bonus?" / "Needs a check: the share's identity code changed." / "Needs a check: the return is too large to be believed." / "Needs a check." (a flag this build does not know).

Summary rules fixed by Task 4 where s6 is silent (`src/modules/ledger/summary.ts`): an excess of exactly zero is not "ahead"; the holding-period figure is over the closed ideas counted in "closed"; a closed idea whose exit is not yet fixed counts in "all" only; a score flag other than entry_pending, exit_pending, hand_price and stale (including an unknown one) sends the idea to "needs a check"; hand-entered and stale marks are counted and named; ideas with a restated score are listed.

## 20. Amendments (Plan 3a fix round 2, 2026-10-13; append-only, these override the text above where they differ)
Migrations 0010 to 0013 were amended in place (none has left the local stack). Review files: `.superpowers/sdd/2026-10-13-phase-3a-ledger/tasks-1-2-rereview.md` (N-1 to N-10) and `task-3-review.md`.
- **N-1, s18 `none` and the new flag `attested`.** A `none` action still clears `jump` and `isin_changed` for its step, but never silently: any live `none` with an ex-date from the day of opening to the mark date (inclusive) sets the flag `attested` on the score. `attested` is treated exactly like `hand_price` everywhere (a figure resting on a hand entry: counted and named, never for a public figure). Score flags are now: `entry_pending, exit_pending, hand_price, attested, jump, isin_changed, implausible, stale`.
- **N-2, s17 void window.** The void deadline is enforced inside the seal trigger from the SEALED time of the idea's open event and the time the void event is sealed (under the chain lock); `ideas.opened_at` is not read. The chain replay asserts it: a void sealed after `least(open + 24 h, next 15:00 IST)` is reported as that idea's `bad_idea`. Moving `ideas.opened_at` therefore opens no window.
- **N-3, s18 scans.** The `jump` and identity scans read only rows on open trading days. `hand_price` is also raised when any close on an open day inside the scored span (not only the entry and the mark) is not `nse_fetch`.
- **N-4, s18 "factor makes the step bigger".** Kept strict, now documented: a small legitimate factor that moves the step the wrong way (factor 1.02, a +5% day becomes +7.1%) is flagged `jump` until Aksh records a `none` beside it, and the score then carries `attested`. (Conservative reading; recorded as Q31.)
- **N-5, s18 scorer.** The chain check runs before the projection check, so no sealed text is parsed before it has been verified; a direction, status or company mismatch is reported as `ledger:chain_broken` (the replay covers them), and `ledger:projection_mismatch` stays as the second line.
- **N-7, tests.** The two clock-dependent tests no longer read the real hour: `private.put_hand_closes` takes a clock argument `p_now` (default `clock_timestamp()`; private, executable by no API role, left out by both public callers), and the 15:00 IST void fixture is built from the sealed open time. A scorer fixture reaches the per-idea exception branch (a narrowed column inside a rolled-back block).
- **N-8, limits.** `corporate_actions.note` is at most 500 characters. A typed or fetched ISIN is stored only when it matches `^[A-Z0-9]{12}$`; anything else is stored as none.
- **N-9, corporate actions.** The duplicate check and the insert run under a per-company advisory lock (`corporate_actions:<company_id>`), so a double submit cannot create two live actions.
- **N-10, docs.** The "Restoring the ledger" runbook section now covers `corporate_actions`, `idea_score_changes` and `ledger_anchors`, the post-restore checks (`verify_ledger_chain()` then `verify_ledger_anchors()`), the trigger-mode check, and what to do after `ledger:anchor_mismatch`, `ledger:chain_broken` and `ledger:projection_mismatch`. The comment on `mark_day_open` now says "strongest source".
- **Task 3, s17 / s5.5 always-on guards.** `ledger_anchors_guard` and `ledger_anchors_no_truncate` are `ENABLE ALWAYS` triggers: `session_replication_role = replica` (the restore setting) no longer switches them off. An owner restoring over rows disables them by name, then re-enables them `always` and checks `pg_trigger.tgenabled = 'A'` (runbook).
- **Task 3, clamp.** `private.seal_ledger_days_to(p_today)` uses `least(p_today, real IST date)`, so no caller can seal the day in progress.
- **Task 3, known limit (supersedes the reading of s17 "never unaltered until the comparison exists").** The comparison proves "matches the days sealed in this same database". An owner who deletes the NEWEST anchor rows, rewrites the events and re-hashes them gets well-formed rows on the next seal, and while the public gist is off (default, D8) nothing outside the database disagrees. UI copy (Tasks 10 and 11) says "consistent with itself and with the days sealed here" with the gist off, and "matches the published fingerprints" only when the Task 9 comparison with the file passed on that run. The migration header and the 0013 pgTAP file ("KNOWN LIMIT") say the same.
- **Task 3, anchor line versioning.** The builder is `private.anchor_line_v1` and is never replaced; a format v2 adds `anchor_line_v2` and one branch in the comparison, which picks the builder by `line::jsonb ->> 'v'` (an unknown version is a mismatch).
- **Copy (pending Shlok), score flag line for `attested`.** "Includes a price move or code change that you marked as needing no action."

## 21. Corrections and copy from the Plan 3a Task 4 fix round (2026-10-13; append-only; these override s19 and s6/s7 wording where they differ; every new string is pending Shlok's approval)
Review file: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-4-review.md`.
- **Correction to s19, failing integrity check.** The closing line of the sealed-day comparison is "This check changed nothing. Tell Shlok." (it replaces "Nothing was changed. Tell Shlok.", which read as a statement about the ledger and so as the reassurance the standing note forbids). The full line is now "The sealed days and the entries disagree from D (reason). This check changed nothing. Tell Shlok."
- **Correction to s19, passing check.** A pass is one structure (`chainReport`) holding the "Consistent with itself: N entries, M sealed days." line together with the standing note, so a screen cannot show the one without the other. A check that could not run throws; the screen says "could not check", never "intact".
- **New error text, `ledger-integrity`** (database codes `chain_broken`, `projection_mismatch`, `anchor_mismatch`): "The ledger failed its own check. Nothing was saved. Run the integrity check on the Ledger page."
- **Direction.** For an idea that expects to do worse than the Nifty 50 the database flips the sign of the excess, so a positive figure means the call was right, not that the share beat the index. The summary and the journal grid therefore speak of the call ending "as expected" or "not as expected" for both directions, never "ahead" or "behind". New copy: grid cells "Earned (sound process, ended as expected)", "Lucky (flawed process, ended as expected)", "Unlucky (sound process, did not end as expected)", "Deserved (flawed process, did not end as expected)"; beside the closed and all-ideas figures "ended as expected" (e.g. "4 of 7 ended as expected"). The summary carries `byDirection` (counted ideas by what they expected) so a screen can say when the figures mix both directions. The wording in s6 ("ended ahead", "outcome (ahead, behind)") and s10 (tiles "closed ahead", "all ideas ahead"; "ended ahead") reads as "ended as expected" / "did not end as expected" from now on.
- **Closed ideas left out of the headline.** `summary.closed.notCounted` counts closed ideas that need a check, are waiting for a close, or have their exit not fixed. The Ledger tile shows it beside "N of M": "N closed ideas not counted yet (needs a check, waiting for a close, or exit not fixed)." (Task 10).
- **Open idea entered today.** An open idea counts in the "all" figure only once it has been held for a day (holding days above 0); until then it is listed as waiting.
- **Paging.** `listScores`, `listLessons` and `listScoreChanges` now page through every row (the response cap is 1000 rows).

## 22. Amendments and copy from Plan 3a Task 5, migration 0014 (2026-10-13; append-only; these override s5.6 where they differ; every new string is pending Shlok's approval)
Review file: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-5-report.md`.
- **s5.6 where the facts come from.** Rule 4 and the position check read the SEALED events only (the company id sealed inside each event, the sealed `recorded_at` as an India date, a sealed `void` event for a withdrawn idea), never the `ideas` projection. Before reading, the gate runs the ledger check (`private.ledger_chain_check`) and the sealed-day comparison (`private.ledger_anchor_check`); if either fails, every item that names a company is refused under rule 4 with the code `ledger_check_failed` (the gate does not guess). A tampered projection can therefore only turn a decision towards a refusal.
- **s5.6 rule 4 line.** Refused when the latest open, close, upsize or downsize entry on a non-withdrawn idea on the company has an India date greater than today minus 30; the entry date plus 30 days is the day it can be published from (an entry 30 days ago passes). Applies to every item that names a company, every revision, including files first published before the idea existed (rule 7). Notes, revisions and lessons do not count. A withdrawn idea counts for nothing (s5.6: "a non-void idea"); Q32 records this reading. Nothing already public is unpublished or hidden.
- **s5.6 position line.** A "no" is refused when a non-withdrawn, not-closed idea on the company is held according to its latest sealed holding entry (open and downsize carry `held`; upsize means held; a close means not held). `yes`, `not_disclosed` and an unset disclosure are never contradicted. Spec s5.6 says `held = true` on an open idea; an open idea that is only watched (`held = false`) does not contradict "no".
- **Recorded reasons.** Each ledger refusal is a gate failure `{rule, code, message}` in `gate_decisions.reasons` (admin read only): `ledger_recent_entry` (rule 4, plus `clear_from`, an ISO day), `ledger_check_failed` (rule 4), `ledger_position` (rule 5). The screens show the words below from the code; the stored sentence is the fallback. No UI override and no sentence allowance applies to them.
- **Copy.** `ledger_recent_entry`: "The ledger has an entry on this company from the last 30 days. This can be published from {d Mon yyyy}." `ledger_position`: "The ledger shows a position in this company; the disclosure cannot say no." `ledger_check_failed`: "The ledger failed its own check, so nothing about this company can be published until it is looked at. Run the integrity check on the Ledger page." Checklist: rule 4 row "Rule 4: clear from {d Mon yyyy}" (or "Nothing in the ledger from the last 30 days. Tick the hand check below."); position row "Position matches the ledger" with "The ledger shows no open position in this company." / "The disclosure does not say no, so the ledger cannot contradict it."
- **Hand check stays.** The rule 4 tick in the publish panel remains (the ledger may be incomplete: a trade never recorded); the ledger adds the automatic refusal beside it.
- **The admin door.** `public.ledger_gate_facts(p_company_id)` (authenticated, `private.is_admin()`) returns `(ledger_ok, clear_from, holds_position)` from the same private function the gate uses, so the checklist cannot disagree with the gate. `anon` and `service_role` cannot call it.
- **Policy version.** Not bumped (s11): `c_policy` and `POLICY_VERSION` stay `sebi-unreg-2026-07`.

## 23. Amendments from Plan 3a fix round 3 (2026-10-13; append-only; these override earlier text where they differ; the label and the one new message are pending Shlok's approval)
Review files: `fix-round-2-rereview.md` (I-1, M-1 to M-4) and `task-5-review.md` (I1, I2, M1 to M8) in `.superpowers/sdd/2026-10-13-phase-3a-ledger/`. Migrations 0010 to 0014 were amended in place (still local).
- **s18/s20 `attested` is set for ANY live action.** A live corporate action of any kind (split, bonus, other, none) with an ex-date from the day of opening to the mark date (inclusive) sets `attested` on the score; every action is typed by hand, so a score that depends on one always says so. `attested` stays "counted but marked", like `hand_price`. The label now reads "Includes a split, bonus or note about a price move that you entered by hand." (pending Shlok). Q31 stands, except that the mark no longer needs a `none`; an idea that spans a real split carries the mark.
- **s20 wording.** Every "closes the residual" is "lets a reader who kept an earlier copy detect it": the owner controls the gist too, so a published copy detects a rewrite, it does not prevent one (migration 0013 header, the 0013 test).
- **s5.3 stance values are replayed.** `ledger_chain_check` part one runs `validate_idea_stance` on every event inside its exception block, so a stance no writer could have sealed (held a string, horizon not a number), re-hashed to agree, is `chain_broken` at its seq from `verify_ledger_chain()` and the scorer, not a cast error.
- **s5.2/s20 boundaries tested.** The void deadline is tested at equality (accepted) and one microsecond later (refused) in both the seal trigger and the replay; the double-submit lock is pinned to come before the duplicate check; the scorer's `projection_mismatch` branch is kept as the second line and is now tested (with the replay replaced by a stub that says ok). The two wall-clock voids in the 0010 tests wait out the minute before 15:00 IST.
- **s5.6 a catalog merge no longer blinds the gate.** The ledger facts for a company include the sealed events of every company row aliased into it (`company_aliases`), in rule 4, the position check and the admin door. `open_idea` refuses a company that is `needs_review` or archived with the new code `company_not_ready` ("This company is still waiting for review, or has been merged into another. Settle it under Names, then record the idea on the company it became." Pending Shlok). A residual: two live, screened rows for one security (the ISIN is not unique) are not unified; matching the sealed ISIN was not added (Q33).
- **s5.6 the ledger half of the gate.** It lives in `private.ledger_gate_item_failures`, which takes the chain's advisory lock first (the lock the event seal takes; `publish_revision` holds only the item row before it and nothing after, so there is no lock cycle), catches any error and records `ledger_check_failed` instead of aborting with no decision, and covers the item's own company plus the company of every idea linked to it through `ideas.item_id` (the disclosure check applies to the item's own company only). An item with no company and no linked idea is outside rules 4 and 5 in the database. Every decision records `reasons.ledger.checked`.
- **s5.6 the hand tick.** The checklist honours and shows the tick only while the rule 4 row is `manual`; when the ledger refuses, the row stays a failure, the tick is not offered, and `publishCheckedAction` neither requires it nor records it as true (`handChecks.rule4 = false`). A ledger that cannot be read leaves the row manual and the tick required.
- **Not changed.** `POLICY_VERSION` stays `sebi-unreg-2026-07`. The admin checklist reads the facts of the item's own company only; a refusal that comes from a linked idea on another company shows after the gate is run, from the recorded decision.

## 24. Amendments from Plan 3a Task 7, the daily closes and score steps (2026-10-13; append-only; these override s8 and s12 where they differ; the two clock labels and the strip wording are pending Shlok's approval)
Report: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-7-report.md`.
- **Where the code lives.** The ledger module cannot name a provider (its graph test), so `fetchCloses` and `scoreIdeas` are job code in `src/modules/ops/ledger-prices.ts` and are wired in `ops/ledger-steps.ts`. The ledger module keeps only the pure calendar arithmetic (`trading-days.ts`: `datesToFetch`, `weekdaysBehind`, `lastOpenDate`), safe for the browser.
- **s8 which dates.** Every weekday from today minus 7 up to yesterday (India dates) that `market_days` does not hold with `source = 'nse_fetch'`, oldest first, at most two per run. It is NOT limited to days after the newest open day: a holiday can be confirmed only once a later day is open, so an earlier undecided weekday must still be asked for. A date opened only by a typed or uploaded close is not decided.
- **s12 a holiday.** A day is marked shut only when the equity file AND the index file both answer `no_file`, and then only after a canary: the equity address of the newest open day that an official file opened (`nse_fetch` or `nse_upload`; never a typed close) is asked again with no symbols. The canary is skipped when that very day was fetched in the same run. If the canary answers `ok`, `mark_market_day_shut` is called for each missing day (the database still requires a later open day). If it answers `no_file`, the address has moved: nothing is marked and the step fails ("the equity file address may have changed"). If it is `blocked`, a provider error, out of time, or there is no such open day, nothing is marked, the days stay undecided, and the detail says "could not confirm". One file missing beside the other present is never a holiday ("the two NSE files disagree"). The shut marks are made at the end of the run, so a holiday and the open day after it can settle in one run.
- **s8 outcomes.** `blocked` stops the run (NSE is refusing us). A provider error (a timeout, an unreadable or over-size file, a wrong date) on one date does not stop the next date; the date stays undecided and is asked again. Only a database failure while storing, or a configuration error from the port factory, fails the step at once (the factory error is a plain sentence, with no address; it never crashes the rest of the cron run).
- **s8 when the step fails.** The step fails (heartbeat `ok = false`) when the stored closes are three or more weekdays behind AND the run had a problem or stored nothing. A run that is storing closes while catching up (a first run, or a week-long outage) is behind but healthy. It also fails at once when the canary says the address moved. "Behind" counts the weekdays after the newest open day, before today, that are not shut; with no open day on record it counts the weekdays of the 7-day window.
- **s8 order and time.** `heartbeat:daily`, `ledger:prices` (25 s), `ledger:score` (5 s), then `ingestion:sweep` (200 s). `ledger:anchor` (15 s) joins after `ledger:score` in Task 9. Each NSE call gets `min(8 s, time left)`; the two files of a date are asked together.
- **s8 heartbeat details** (counts and dates of closes only, never an address, a file value or database text): "nothing to fetch", "up to date", "stored 2 dates, 4 closes, 3 dates left", "1 date marked shut", "NSE refused; closes to 2026-10-09", "the two NSE files disagree for 1 date", "could not confirm 1 possible holiday (no open day to check against)", "scored 3 ideas". A refusal of `score_ideas()` is "the ledger failed its own check (chain_broken); nothing was scored" (also `anchor_mismatch`, `projection_mismatch`); the database's detail (entry numbers, idea ids) is not copied.
- **s8 health.** `HEALTH_RULES` gains `ledger:prices` ("the closing prices") and `ledger:anchor` ("the public proof"), both 36 h and `optional`: never run is healthy; a failed or older-than-36-h latest run is not. `/api/health` returns, in order, `heartbeat:pump`, `heartbeat:daily`, `ledger:prices`, `ledger:anchor`, `queue`, each exactly `{ job, ageSeconds, ok }` (`ageSeconds` is null for a job that has never run). The desk strip reads "the closing prices' last run failed 10 min ago" (a label ending in "s" takes a bare apostrophe).
- **Known gap carried to Task 11 (review finding N-6).** A day the job has shut (source `nse_fetch`) is decided and is not asked for again, and `store_uploaded_closes` (rank `nse_upload`) cannot reopen it. See the Task 7 report for the smallest database change.

## 25. Amendments from the Plan 3a Task 7 fix round 1 (2026-10-13; append-only; these override s24 and the Task 7 text where they differ; the day-shut message, the label "the scores" and the two strip sentences are pending Shlok's approval)
Report: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-7-fix1-report.md`.
- **I-1 the cap counts stored dates.** `ledger:prices` walks every undecided weekday of the window (at most five) and stops after TWO dates have been STORED, or when the 25 s budget is spent. A date with no file, an unreadable file, or files that disagree does not use a slot, so two dates that cannot settle never starve later days. While a possible holiday is on the list one second of the budget stays back for the canary.
- **I-2 no silent hole.** After the run, a weekday inside the window that is older than the newest open day, is neither open (any source, a typed close included) nor shut, and has waited three weekdays (the weekdays from that date up to, not including, today) fails the step: "1 weekday in the last week still has no close (2026-10-13)". A real holiday never trips it (it is shut as soon as a later day opens). `unsettledWeekdays` in `ledger/trading-days.ts` is the pure rule.
- **I-3 shut only behind a later open day.** A date is marked shut only if it is EARLIER than the canary day (the newest official open day before today, or a day fetched in the same run), in addition to both files answering `no_file` and the canary answering `ok`. A date that is not earlier stays undecided and the detail says "N dates waiting for a later open day" (not a failure). Today's file never counts as the canary.
- **I-4 (N-6) migration 0011, amended in place.** `private.mark_day_open`: an official uploaded file (`nse_upload`) can reopen a day the job shut; the day then carries `nse_upload`, so the daily fetch still asks for it and upgrades it. A typed close never reopens one. `private.put_hand_closes`: on a shut date a typed (`manual`) close, and an upload without the Nifty 50 close (which cannot reopen the day), raise `ledger:day_shut` before anything is stored, so nothing appears to succeed. `ledgerErrorFromDb` maps `day_shut` to `ledger-day-shut`. New message (pending Shlok): "NSE had no trading on that date, so a closing price cannot be typed for it. If NSE did trade that day, upload NSE's official file for it instead."
- **I-5 a failed `ledger:score` is seen.** `HEALTH_RULES` gains `ledger:score` ("the scores"), 36 h, optional, so `/api/health` returns, in order, `heartbeat:pump`, `heartbeat:daily`, `ledger:prices`, `ledger:score`, `ledger:anchor`, `queue`, each exactly `{ job, ageSeconds, ok }`; never run is `ageSeconds: null, ok: true`. The private desk strip appends the heartbeat's own plain reason for a failed ledger step (`ledger:prices`, `ledger:score`, `ledger:anchor`), for example "the scores' last run failed 10 min ago: the ledger failed its own check (chain_broken); nothing was scored". The reason is read from `heartbeats.detail` through the admin's session (RLS); the public path never selects it. Nothing else is added to the public response.
- **M-1 the step checks the date.** A file whose trade date is not the date asked for is a provider error in the step ("a file was for another date than the one asked for"), whatever the adapter did.
- **M-3 time.** The canary is not started with under one second of the budget left (nothing is shut; "could not confirm N possible holidays (out of time)"). `ledger:score` has an enforced 5 s budget: an `AbortSignal.timeout` on the request, like the provider calls; a call that does not return fails the step ("scoring did not finish within its time limit").
- **M-6 a company with no row.** A tracked symbol that is absent from an otherwise good file is counted in the step result ("1 of 3 companies had no row") and shown on the private desk strip as a quiet, non-alert line: "The latest closing-prices run found no row for 1 of 3 companies in NSE's file." Counts only, never a symbol. It is not a public fact and not a failure (pending Shlok).
- **Not changed.** Anon can still read job booleans through `public.heartbeat_ages()` (existing contract). `store_fetched_closes`, `mark_market_day_shut` and the ladder are untouched.
- **Interpretation to confirm (conservative).** "An upload that stores nothing must not report success" is built as: on a day currently shut, an upload that carries no Nifty 50 close is refused with `day_shut`. An upload with no company rows but with the index close still succeeds (the special-session case in the tests). See `docs/project-memory/unanswered-questions.md`.

## 26. Amendments from Plan 3a Task 8 and its fix round 1, the anchor port (2026-10-13; append-only; this overrides s9's interface and its "port is null" rule where they differ)
- **The port is never null.** `createAnchorPort(env)` returns an adapter named `github-gist`, `fixture` or `off`. With the token or the gist id unset the adapter is `off` and every call answers `{ kind: "not_configured" }`: the day is sealed in the database and not published. That is the default and is not an error. The fixture is created only with `LLM_ADAPTER=fixture` and a loopback database URL; anywhere else asking for it throws a configuration error.
- **Interface** (`src/lib/providers/anchor.ts`): `read(file, { timeoutMs? })` answers `ok { text, version }` (the whole file), or a miss. `write(file, text, { expected, timeoutMs? })` replaces the file only if it still equals `expected` (`null`: it must not exist yet).
- **Read misses:** `not_configured`, `absent { what: gist | file }`, `unauthorized`, `rate_limited { retryAfterSeconds }`, `too_large` (the answer does not say `truncated: false`, or passes the 8 MB cap), `provider_error { message }`, `invalid_request { message }`.
- **Append-only.** A write whose text does not begin with `expected` is `invalid_request` and nothing is sent; the port never removes or alters a published byte. A text equal to `expected` is `nothing_to_add`.
- **Write outcomes:** `ok { version, continuity: unbroken | unknown }`; `interrupted { version }` (written, but another commit was seen between the check and the write); `unconfirmed { message }` (the update was sent and the result is unknown: read before doing anything else); `changed { found, version }` (nothing written); `nothing_to_add`; `cannot_write` (GitHub answered "not found" to the update just after a good read: most likely the token lacks "Gists: write"); plus the read misses. A `provider_error` from `write` always means nothing was written.
- **Not atomic.** GitHub offers no conditional update for gists, so the write is a re-read, a comparison, then one PATCH. The window is normally under a second and is bounded by the call's time budget (15 s by default, 60 s at most). Nothing here proves the gist's owner cannot rewrite its history.

## 27. Amendments from Plan 3a Task 9, the `ledger:anchor` step (2026-10-13; append-only; this overrides s8 and the Task 9 text of the plan where they differ; every result and reason string below is pending Shlok's approval)
Report: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-9-report.md`.
- **Where it lives.** `src/modules/ops/ledger-anchor.ts` (`publishAnchors`, 15 s) and the pure comparison `ledger-anchor-compare.ts`, wired as the third entry of `ledgerDailySteps()`. The ledger module is untouched (it cannot name a provider).
- **Order.** `seal_ledger_days()`; then the port is built; then, for every India year the ledger holds lines for (oldest first), the year's public file is read and compared with ALL of that year's sealed lines, position by position; only when every year agrees is anything written; at most one write a run, for the oldest year with a missing tail, with `expected` = the exact text read and the new lines appended; then publication is recorded for exactly the lines the comparison saw in the file plus, only after an `ok` write, the lines just written.
- **The comparison.** The file must equal the database's lines at the same positions; the database may hold more lines at the end, never fewer, never different. A different line, an extra line, a duplicated or out-of-order date, a shorter or empty or missing file where lines were published, a last line without its line break: the step fails, appends nothing, records nothing, and names the first position and the ledger's date. The file's own text is never quoted.
- **Outcomes.** Only `ok` records the tail as published. `unconfirmed` and `interrupted` record nothing at all (not even lines the comparison saw), fail the step, and are settled by the next run's fresh read. `changed`, `cannot_write` and every read or write miss fail with a fixed reason and record nothing. `nothing_to_add` is a success. `not_configured` (the default) seals, succeeds and makes no request.
- **Result strings (success).** "sealed 2 days; the public copy is off, 3 days waiting"; "sealed 0 days; no finished day to publish yet"; "sealed 1 day; added 1 day to the public copy (2026-10-12)"; "sealed 0 days; added 3 days to the public copy (2026-10-10 to 2026-10-12)"; "sealed 0 days; recorded 1 day already in the public copy"; "sealed 0 days; the public copy is up to date"; "sealed 0 days; the public copy was already up to date"; "...; 2 days waiting for the next run" (a second year waits for the next run).
- **Reasons (failure).** "the ledger failed its own check (chain_broken); nothing was sealed or published" (also anchor_mismatch); "the public file ledger-2026.jsonl differs from the ledger at line 2 (2026-10-02); nothing was published"; "... has a line 4 that the ledger does not have; ..."; "... is missing line 2 (2026-10-02), which was published; ..."; "... does not end with a line break after line 2; ..."; "GitHub refused the key; nothing was published"; "GitHub is limiting requests; the next daily run will try again; nothing was published"; "the public file is too large to be read whole; it will not clear by itself; nothing was published"; "the public file could not be reached just now; nothing was published"; "the gist was not found, check the gist id; nothing was published"; "the token cannot write to the gist; nothing was published"; "the public file changed while it was being updated; nothing was written or recorded, and the next run will check it again"; "the update to the public file was sent and its result is not known; nothing was recorded, and the next run will read the file first"; "another change to the public file was seen while it was being updated; nothing was recorded, and the next run will check the file again"; "the public copy is not set up correctly: <setting name>"; "ran out of time reading the public file; nothing was published". They stay in the private heartbeat detail; `/api/health` keeps `{ job, ageSeconds, ok }`.
- **Heartbeat.** The step writes one heartbeat on every run, success or failure, because it is a step of `runSteps`; a run that never wrote one would hide a failure or turn the optional 36-hour check red for no reason.

## 28. Amendments and copy from Plan 3a Task 10, the Ledger screens (2026-10-14; append-only; these override s10 where they differ; every string below is pending Shlok's approval)
Report: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-10-report.md`. Design picks: `docs/design/decisions.md` ("Task 10").
- **s10 `/desk/ledger/closes` and `/journal` are Task 11.** Task 10 builds `/desk/ledger`, `/desk/ledger/new`, `/desk/ledger/[ideaId]`. There is no company-file link form on the idea page yet (an idea gets its file link from `/desk/ledger/new?item=<id>`); `linkIdeaItemAction` of the plan is not built.
- **Wording kept from s19 and s21, not reinvented.** Direction, entry kinds, close reasons, process calls, tags, flag lines, the integrity check's passing and failing text (with its standing limit, always together), the error texts and `closedNotCountedText`. The tiles say "ended as expected" for closed ideas.
- **New: the all-ideas tile.** Open ideas have not ended, so beside "6 of 12" it says "as expected so far". The counted ideas are listed by direction ("N ideas expecting to do better than the Nifty 50, M expecting to do worse."), and when both directions are present: "Each idea is judged in the direction of its own call: an idea that expected to do worse than the Nifty 50 counts as expected when it did."
- **New: figure notes.** "Fewer than 5 closed ideas: no percentage is shown." / "Price return only: dividends are left out on both sides." / "N ideas withdrawn, not counted." Result word beside a result in points: "as expected" / "not as expected" (level counts as not as expected, as in the summary).
- **New: marks.** "Entry taken N trading days late: the share had no close on the days before it." / "Exit taken N trading days late: ..." (from `entry_skipped_days` / `exit_skipped_days`); "Restated on 10 Oct 2026." followed by "Entry close: was 100.00, now 101.50." lines (fields: entry date and close, the index at entry, the date and close marked to, the factor, share move, Nifty 50 move, result, days held); "The idea was withdrawn, so its score was removed."; "No result yet: waiting for a close."; "Entry: close of 14 Oct 2026. The first result appears after the next close." (an open idea not yet held a day, which the summary also leaves out).
- **New: status lines.** "Closes to 12 Oct 2026." (+ "N days rest on closes entered or dropped by hand.") / "No closing prices yet." / "Public copy of the fingerprints to 12 Oct 2026." (+ "N sealed days not yet published.") / "Nothing in the public copy yet; N sealed days waiting (the public copy may be switched off)." / "Could not read how current the closes are." / "Could not read the public copy's state." The words "proof" and "proves" are not used on any Ledger screen. A check that threw: "Could not check: the integrity check did not run just now. This says nothing about the ledger either way. Reload to try again." Labels for a failure: "Entry chain check" / "Sealed-day check".
- **New: forms.** Chooser: "Add a note" / "Revise the thesis or the horizon" / "Record that I bought more" / "Record that I sold some" / "Close this idea" / "Write what I learned" / "Withdraw this idea"; buttons: "Add the note", "Save the revision", "Record the purchase", "Record the sale", "Close the idea", "Save what I learned", "Withdraw the idea", "Record the idea"; the warning under every text box: "Once saved, an entry cannot be edited or deleted, and the desk sets its date. Write it the way you would stand behind it."; "The exit is set at the next close. A closed idea cannot be reopened."; "You can withdraw this idea until 13 Oct 2026, 15:00. After that its entry price is fixed and you can only close it." (the window is the earlier of 24 hours and 15:00 India, mirrored from `private.idea_void_deadline`; the database stays the judge).
- **New: notices.** "Idea recorded and sealed." / "Entry added and sealed." Sealed line on the idea page: "Sealed 13 Oct 2026, 14:02."
- **Line breaks.** A browser sends a text box's line breaks as CRLF in a form submission; the form reading puts them back as typed (CRLF to LF). Nothing else is done to his words: no trimming, no other change.

## 29. Amendments from the Plan 3a Task 9 fix round 1 (2026-10-14; append-only; these override s8, s9, s26 and s27 where they differ; the new reasons and the label are pending Shlok's approval)
Report: `.superpowers/sdd/2026-10-13-phase-3a-ledger/task-9-fix1-report.md`. Review: `task-9-review.md`.
- **I-1, always compare.** When the public copy is on, the whole gist is read and compared on every run, including when the database holds no sealed line. Years run from a fixed first year (`FIRST_ANCHOR_YEAR = 2026`, never raised; the database's first year if it is older) to the current India year (or the database's last year), plus every year the gist has a `ledger-YYYY.jsonl` for. A gist that holds lines beside a database that has none, or fewer, or none for that year, is a refusal ("the public file ledger-2026.jsonl has a line 1 that the ledger does not have; nothing was published"), never green. "sealed 0 days; no finished day to publish yet" now means: the gist was read and holds nothing either.
- **I-2, off after on is red.** `not_configured` is a green run ("the public copy is off, N days waiting") only while no anchor row has `published_at`. Once any line has been published, a missing token or gist id is red: "the public copy is switched off, but lines were published before; the public file was not checked (N days waiting)". This narrows the s27 rule that `not_configured` is not an error.
- **M-4, one request.** The port gains `readAll()` (every file of the gist, whole, from the one GET the adapter already makes; any file or the file list not whole is `too_large`). The step makes one read of the gist per run instead of one per year, plus one check read after a write.
- **M-5, bounded database calls.** The step's reads and counts carry an abort signal of the time left ("ran out of time reading the ledger; nothing was published"); each recording update has its own 5 s limit and is still attempted after the budget is spent.
- **M-1, a check after the write.** After an `ok` write the step reads the gist again and records publication only if every file it is about to mark still begins with the text this run compared and wrote; otherwise "the public file no longer matches what this run wrote and compared; nothing was recorded, and the next run will check it again" (or, if the check read fails or no time is left, "the public file was updated but could not be checked afterwards; nothing was recorded, and the next run will check the file and record it"). This narrows the two-overlapping-runs window and does not close it; the durable fix is a single-flight lease in the database (open question Q35).
- **M-2, a twin run.** A `changed` answer whose `found` text equals the exact text this run was about to send is a success ("the public copy was already updated by another run; it will be recorded on the next run") and records nothing; any other `changed` stays a failure.
- **M-6, the time published is recorded at** is the later of the function's clock and the newest `created_at` of the rows being marked, so a database clock slightly ahead cannot make the guard refuse a line that is in the file.
- **M-7, label.** The `ledger:anchor` health label is "the public copy" (was "the public proof"): the desk strip reads "the public copy's last run failed 10 min ago: ...". Nothing says or implies proof.
- **Test double.** The fixture gist (local stack only) is kept in a directory named from the local database's address, so a restarted server still sees what the database remembers as published; the e2e global setup empties it when the ledger is empty (a reset database is a new world). The fake port used by the unit tests runs `anchorWriteGate` first, as both real adapters do.
- **Carried to later tasks (not built here).** The desk strip shows the last FAILED anchor run of the past 30 days (the heartbeat log is insert-only; only the latest row is read today). "Fetch closes now" never runs `ledger:anchor`.
