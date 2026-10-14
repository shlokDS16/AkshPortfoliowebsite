# ADR-005: Ledger integrity (hash chain, public anchor) and the price-data source of truth

Status: Accepted (controller, on Shlok's delegation; 2026-10-13)
Amends: ADR-001 s3 (ledger integrity row), s4 (daily cron list), s8.8 (commit now, reveal later), s9.2 (NSE bhavcopy). Adds one provider port (`AnchorPort`) to the list in ADR-001 s3.
Inputs: `docs/specs/2026-10-13-phase-3-track-record-design.md`; `docs/compliance/publishing-rules.md`; `docs/research/2026-10-04-tooling-landscape.md` s4-s6; `docs/research/2026-10-04-pitfalls.md` s1; vendor checks listed in s2.
Implemented by: `docs/plans/2026-10-13-phase-3a-ledger.md` (migrations 0010-0013, `src/modules/ledger/`, `src/lib/providers/market-data.ts`, `src/lib/providers/anchor.ts`).

## 1. Problem
ADR-001 chose "append-only `idea_events`, hash chain, daily anchor to a public Gist" and "NSE bhavcopy only" in one line each. Building them needs five decisions that those lines leave open, and each one is easy to get subtly wrong in a way that only shows when an allocator asks a hard question:
1. What exactly is hashed, and can a reader verify one entry without seeing the others?
2. What does the public anchor contain, who can alter it, and what may we honestly claim about it?
3. When is an idea's entry and exit price fixed, so that no entry can use a price that was already known?
4. Which price wins when the official file, a file Aksh dropped by hand and a number he typed disagree?
5. Who is allowed to write the numbers (returns, hit or miss), given "the AI organises, Aksh thinks"?

## 2. Current state (facts, checked 2026-10-13 unless a file is cited)
- No ledger table exists. `publish_revision()` (latest body in `supabase/migrations/20261007000005_casefile.sql`) carries the comment "Rule '4' ... is reserved: it needs the Phase 3 ledger".
- **NSE equity file.** `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip` answered 200 (`application/zip`, about 207 KB) for 2026-10-09 and 2026-10-12. The pattern in `.env.example` and tooling-landscape s4 (`..._F.csv.zip`, no `_0000`) answered **404** for both dates: the template in the repo is wrong and Plan 3a Task 6 corrects it. The zip holds one deflated entry (method 8, flag bits 0, about 639 KB, 3,714 lines); the entry's timestamp was 16:31 on the trade date. Header: `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,...,ClsPric,...`. A request with no `User-Agent` got no answer; a browser-like one got 200. Checked from a home connection in India; **not checked from Vercel's addresses** (ADR-001 s9.2 already names that risk).
- **NSE index file.** `https://nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv` answered 200 (`text/csv`, about 17.5 KB) for the same dates. Header: `Index Name,Index Date,...,Closing Index Value,...`; the row is `Nifty 50`, the date is `DD-MM-YYYY`. It is the price index, not the total-return index.
- **GitHub Gist API** (https://docs.github.com/en/rest/gists/gists): `GET /gists/{gist_id}`, `PATCH /gists/{gist_id}` with `files: { "<name>": { content } }`; the API returns up to 1 MB of content per file and sets `truncated` beyond that; `GET /gists/{gist_id}/{sha}` reads a revision. A fine-grained token needs the user permission "Gists: write" (https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens). Limits (https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): 5,000 requests an hour with a token; at most 80 content-creating requests a minute and 500 an hour.
- **Not verified:** the names of the fields inside the gist response's `history` array (`version`, `committed_at`); whether a gist's owner can rewrite its revision history by pushing to it as a git repository. Both are treated as unknown: the adapter reads the version as optional, and s6 assumes the owner **can** rewrite or delete the gist.
- **Vercel Hobby** (https://vercel.com/docs/cron-jobs/usage-and-pricing, https://vercel.com/docs/functions/limitations): cron once a day, fired within the hour (plus or minus 59 min), no retry (pitfalls s1); functions 300 s default and maximum; request body 4.5 MB.
- The daily cron is `30 0 * * *` UTC (`vercel.json`), so it fires between 06:00 and 06:59 IST, after the previous trading day's files exist. Its route already spends up to 200 s on `ingestion:sweep` (`DRAIN_MS.daily` in `src/modules/ingestion/caps.ts`).

## 3. Options considered

### 3.1 What is hashed
1. **Hash the row's columns, re-serialised by the verifier.** Rejected: the verifier (a browser, a reader's Python) would have to reproduce Postgres's JSON text byte for byte; one whitespace difference and an honest record fails.
2. **Store the exact sealed text and hash that (chosen).** A `BEFORE INSERT` trigger builds one `canonical` text per event (a JSON object holding the sequence number, ids, kind, UTC time, the company's symbol, ISIN and name as they stood, Aksh's structured choices and his words, and a random nonce), stores it, and sets `hash = sha256(prev_hash || E'\n' || canonical)`. The verifier never serialises anything: it hashes the text it is shown.
3. **Two-level scheme (content hash per event, chain over content hashes) with a daily head only.** Hides how many entries a day had. Rejected for now: the verifier needs a loop and a list of sibling hashes at reveal time; the gain is hiding a count that names no security. Kept as anchor format v2 (s7).

### 3.2 One chain or one per idea
1. Per-idea chains: deleting a whole idea leaves every other chain intact. Rejected: "he removed the losers" is the exact attack.
2. **One global chain ordered by a gapless `seq` (chosen).** The sequence and the hash are assigned under one advisory lock, with `clock_timestamp()` taken inside the lock so time and sequence never disagree.

### 3.3 What the anchor publishes and where
1. **Daily head hash only.** A reader cannot check one entry without the contents of every later entry of that day. Rejected.
2. **One line per IST day listing every event hash of that day, plus the head (chosen).** Checking an entry is one SHA-256: `sha256(previous hash in the file + "\n" + sealed text) = its hash in the file`. Days with no entry still get a line (`count: 0`), which commits "nothing was recorded that day" and shows the cadence. Cost: the number of ledger entries per day is public the next morning. It names no security and no direction.
3. **A commit to the project's own public repository from GitHub Actions.** Same trust root as a gist (the owner's GitHub account), more moving parts (a workflow with write permission to the repo, bot commits in the history). Rejected.
4. **A third-party timestamp (OpenTimestamps, an Internet Archive snapshot) instead of the gist.** Stronger: the owner cannot rewrite it. Rejected as the first anchor (a proof format to implement, or an unverified rate limit); kept as the second witness behind the same port (s7).

Chosen shape: `AnchorPort { read(file), write(file, text) }` with a GitHub Gist adapter and a fixture adapter. One file per IST calendar year, `ledger-YYYY.jsonl`, so the 1 MB API limit is not reachable in normal use (about 100 bytes plus 67 per entry per day). The step reads the file, checks that every line it already published is still there unchanged, appends the new lines, and records the version it got back. A difference stops the step and turns the health check red: that is how a database restored from an old backup, or a hand-edited gist, is noticed.

### 3.4 When a price is fixed, and which price wins
1. Let Aksh type the entry price or pick the date. Rejected: backdating is the cheapest way to fake a record, and an allocator assumes it unless it is impossible.
2. **Entry and exit are the first NSE close after the moment of recording (chosen):** the first trading date `d` whose closing window starts after the event, `(d + 15:00) Asia/Kolkata > recorded_at`, and for which both the company and the Nifty 50 have a stored close. 15:00 and not 15:30 because the closing price is formed over the last half hour. No event carries a date Aksh can set.
3. **Source ladder (chosen):** `nse_fetch` (the desk downloaded the official file) beats `nse_upload` (Aksh dropped the official file by hand) beats `manual` (he typed a number). A higher source replaces a lower one for the same company and date; a lower one never replaces a higher one. Raw closes are stored unadjusted; splits and bonuses are separate hand-entered `corporate_actions` rows with a factor; dividends are ignored on both sides (the Nifty 50 file is the price index).
4. Store the whole daily file. Rejected: about 2,700 equity rows a day is roughly 50 MB a year against a 500 MB database (pitfalls s3), and NSE's terms forbid redistributing the raw file (tooling s4). Only tracked companies and the Nifty 50 are stored.

### 3.5 Who writes the numbers
1. Compute scores in TypeScript and upsert them. Then some API role must hold write access to `idea_scores`, and a stolen admin session (or a curious owner in the browser console) can write a return that no price supports.
2. **One SQL function is the only writer (chosen):** `private.score_ideas_now()`, reached through `public.score_ideas()` (the job, `service_role` only) and `public.rescore_ideas()` (the admin, checked). No API role holds INSERT, UPDATE or DELETE on `idea_scores`; the function recomputes every non-void idea from `idea_events`, `prices_daily` and `corporate_actions` on each call, so a score is always a pure function of stored facts and re-running it is harmless.
3. Event writes: service-role confinement with a verified actor, as ADR-003 does for the gate. Not needed here: ADR-003 exists because the gate trusts a caller-supplied lint result. The ledger functions trust nothing from the caller (time, sequence, hashes and the idea's state are all computed in SQL), and a stolen session could call the server action just as easily as the function. So `open_idea()` and `add_idea_event()` are SECURITY DEFINER, check `private.is_admin()`, and are granted to `authenticated`; no role may INSERT into `idea_events` directly.

## 4. Decision
- **Events:** `idea_events` is append-only (`private.reject_mutation()` on update, delete and truncate), written only by `public.open_idea()` and `public.add_idea_event()`. Each row stores `seq`, `recorded_at`, `canonical`, `prev_hash`, `hash`. Aksh's words live in `body_md`, his structured choices in `stance`; no price or return is ever stored in an event.
- **No backdating, no deletion.** An idea can be withdrawn (`void`) only within 24 hours of being opened; the void is itself an event and the idea stays in the chain.
- **Anchor:** `ledger_anchors` holds one sealed line per IST day (`public.seal_ledger_days()`); the daily step `ledger:anchor` publishes unpublished lines through `AnchorPort`. With no token or gist id the lines are sealed and wait; nothing leaves the database.
- **Prices:** `MarketDataPort` (NSE adapter, fixture adapter) fetches the two official files for dates not yet decided in `market_days`; `public.store_fetched_closes()` keeps only tracked companies and the Nifty 50, applying the source ladder. Manual entry and a hand-dropped file go through `public.enter_closes()`.
- **Scores:** the scoring function only (s3.5). Return is price return: `mark_close * product(factors) / entry_close - 1`; excess is in percentage points against the Nifty 50, signed by what Aksh expected.
- **Cron:** three steps, `ledger:prices`, `ledger:score`, `ledger:anchor`, each its own heartbeat, together bounded to 45 s, placed before `ingestion:sweep` in `SERVER_DAILY_STEPS`. There is no "30-day release" step: the lag is evaluated at read time by `private.is_public_item()` and at publish time by `publish_revision()`, as today.
- **Gate:** migration 0013 replaces `publish_revision()` to enforce rule 4 from the ledger and to refuse a "no position" disclosure that the ledger contradicts.

## 5. Tradeoffs
- The entry price is a day late for ideas written after 15:00. Accepted: it cannot be gamed and is one sentence to explain.
- Price return, not total return. Both sides exclude dividends, so the comparison is fair but both numbers are understated.
- The count of ledger entries per day is public. Accepted (s3.3).
- A second, smaller bonus issue (for example 1:4) is not detected automatically; only a one-day fall of more than 30% or a changed ISIN raises a flag. Aksh enters the factor by hand.
- Scoring in SQL is harder to read than TypeScript. Accepted for the "no writer but the function" property; pgTAP covers it with seeded prices.
- The admin session can append events directly through the functions. It cannot change or remove any, and cannot set a time.

## 6. Risks
- **The gist is not an independent witness.** It lives in an account the owner controls; treat it as rewritable and deletable (s2, not verified either way). What we may say publicly: "fingerprints are published daily in a public file whose changes GitHub dates". What we may not say: "cannot be altered". Mitigations now: the step refuses to write when published lines differ, and any reader who saved or archived a line holds proof. Mitigation later: a second witness (s7).
- **NSE refuses Vercel's addresses or renames the file again.** Detected by `ledger:prices` (three weekdays with no close fails the step and the health check). Fallback built in Plan 3a: Aksh downloads the day's zip in his browser and drops it on the Closes page; the same parser reads it.
- **A split scored as a 50% loss.** Detected by the `jump` and `isin_changed` flags; a flagged idea shows "needs a check" instead of a result and is left out of the summary until resolved.
- **Database restored from a backup taken before some events.** The chain is shorter than what was published; `ledger:anchor` reports the mismatch and writes nothing. Recovery is manual and recorded in the timeline.
- **Supabase's `sha256(bytea)` or `json_build_object` text output changes between Postgres versions.** The stored `canonical` is what is hashed, so old rows stay valid; `verify_ledger_chain()` only re-hashes stored text.
- **A token with "Gists: write" leaks.** It can edit only the owner's gists; it is read through `src/lib/env.server.ts` only and never logged.

## 7. Future evolution
- Second witness behind `AnchorPort`: an Internet Archive snapshot of the gist's raw file, or an OpenTimestamps proof of each day's head (Plan 3b heading).
- Anchor format v2: daily head only, with the sibling hashes shown at reveal time, if the entry count should stop being public. Old lines stay valid.
- Total return (dividends) and a second benchmark, as new columns of `idea_scores`.
- If the server stops being trusted (client logins, Q1), move the event functions to the ADR-003 pattern.

## Why this impresses an allocator
A track record is only worth reading if the bad calls could not have been removed and the good ones could not have been written afterwards. Here each entry is fingerprinted the moment it is written, the next morning's public file lists that fingerprint, the entry price is the first official close after the fingerprint, and no person or program other than one database function can write a return. When a case study appears months later, the reader can check the original words against a line that was public before the outcome existed. That is the same control an institutional desk gets from a compliance-stamped trade blotter, built from free parts and visible to the reader.
