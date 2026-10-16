# Phase 5 Distribution (5a print and search, 5b videos, 5c letters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** written 2026-10-15 by desk-architect on Shlok's delegation (he reviews and merges this evening). Branch `phase-5-distribution`, stacked on `phase-4-learning-graph` (PR #10, on #9, on #8; last migration 0021), worktree `.claude/worktrees/aksh-research-desk-5`. Not pushed. **Three parts, three PRs, built in order: 5a (Tasks 1-5), 5b (Tasks 6-9), 5c (Tasks 10-16).** Each part ends with its own opus review and fix wave and can ship alone. Run "Before Task 1" first, and "Before Task 6" / "Before Task 10" at the start of each later part. Code is given only where a decision is load-bearing; everything else names the interface, the tests and the commands.

**Goal:** a reader can print any public page as a dated PDF that carries its disclosure; search engines, feed readers and social previews get typed, gate-derived data; Aksh can list his own YouTube videos with transcript and chapters after the same gate as his files; and he can publish a letter of what changed and send it to confirmed readers, only when he presses Send. Nothing is sent, posted or published to the outside world by this build at deploy or by a test.

**Architecture:** 5a is pure functions over the cached public snapshot (`src/modules/showcase/seo.ts`, `feed.ts`) plus Next route conventions (`sitemap.ts`, `robots.ts`, `feed.xml/route.ts`, `opengraph-image.tsx`) and print CSS; no migration, no env, no dependency. 5b and 5c add item kinds `video` and `letter`, published only by `publish_revision()`, with machine data in side tables referenced by id and SQL-computed hash; a new module `src/modules/distribution/` (`videos/`, `letters/`); new ports in `src/lib/providers/` (`VideoMetaPort` GET-only, `LetterSender` + `ContactMirror`); ops steps for fetch, check, send, reconcile, purge. The gate gains one helper call (`private.distribution_gate_failures`) and policy `sebi-unreg-2026-07-v1.2`.

**Spec:** `docs/specs/2026-10-15-phase-5-distribution-design.md` (s1-s16; decisions D63-D97 in s14, copy in s15). **Rules:** `docs/compliance/publishing-rules.md`, the v1.1 addendum, and the new `docs/compliance/publishing-rules-v1.2-addendum.md` (rules 11-13). **ADR:** `docs/architecture/ADR-001-addendum-2026-10-15-distribution.md`.

**Scope:** progress items 5.1-5.4. Out: spec s13 (Whisper for videos is 5d; no write to YouTube; no automatic sends; no CSP).

## Decisions taken on Shlok's behalf
The full table with the cost of each is spec s14 (D63-D97). The ones that shape the build:
| # | Decision | Cost if wrong |
|---|---|---|
| D63 | 5a, then 5b videos, then 5c letters; three PRs in rising order of risk | Letters wait about two build days (they also wait for a domain, Q9/Q36) |
| D64/D66 | Every derived surface from the public snapshot only; no Review/Rating/Offer/price in JSON-LD | None |
| D69 | PDF = print stylesheet + "Save as PDF" | PDFs differ slightly by browser |
| D73/D75/D76 | Videos read from YouTube by API key only; transcript = his Studio caption file, machine text, never edited; Whisper deferred | One manual step in YouTube Studio; poor auto-captions wait for 5d |
| D83/D89/D91 | No machine-drafted letter; confirmations and sends only after his press, recorded in SQL | A subscriber waits up to a day for confirmation |
| D81 | Policy `sebi-unreg-2026-07-v1.2` from 0023 | One constant and one migration line |

## Global constraints
- **Nothing outbound at deploy or in a test.** Adapters are tested only with an injected `fetch` stub; the e2e runs with `DISTRIBUTION_ADAPTER=fixture` (refused on preview and production). No task sets or asks for a real key. Never call Resend or YouTube from a dev machine during the build. Spec s9 is binding line by line.
- **Every public change goes through `publish_revision()`.** No change to `private.is_public_item`, the 30-day lag, `public_items`, `public_item_revisions`, item and revision policies, `/api/health` or `HEALTH_RULES`. Anon gains exactly: in 5b `public_videos` and `public_video_transcripts` (select); in 5c the functions `letters_open`, `letters_request`, `letters_confirm`, `letters_leave` (execute). Nothing else.
- **His words and the machine never share a field.** His: titles, objectives, bodies, change reasons, chapter titles (copied from his own YouTube description on his press), the subject and note of a letter. The machine's: YouTube metadata (`video_sources`), transcripts (`video_transcripts`), dates, labels, counts, the "what changed" line. Nothing re-words, shortens or summarises his text. No LLM, OCR or transcriber port in Phase 5 (graph tests).
- **Public boundary:** `src/app/(public)/**`, `src/app/feed.xml/**`, `src/app/sitemap.ts`, `src/app/robots.ts`, every `opengraph-image.tsx` and `src/modules/showcase/**` never import a desk module, `@/modules/distribution` except its `public` entry (5b/5c: pure renderers only), `@/lib/supabase/service` or the cookie client (extend `isolation.test.ts`). No UUID, `%`, `₹`, `Rs <digit>` or rule 10.7 word in any derived output (one shared test helper).
- Wording: plain words; never "proof", "verified", "buy", "sell", "weekly"; every new string pending Shlok's approval and listed in the task report (spec s15 is the starting list).
- Migrations local only; never edit one after it reaches hosted; `pnpm db:types` after each migration task. Supabase CLI via `pnpm supabase`. Files under 300 lines (a restated `publish_revision` may reach about 210). TDD: the failing test is seen to fail first. Never two implementers at once. `defenso guard_code` on Tasks 6, 7, 10, 11, 12 if its server answers; otherwise the opus reviews stand in.
- No new runtime or dev dependency in any part (XML, JSON-LD, caption parsing, email HTML are hand-written and small).

## Before Task 1 (controller)
- `graph-memory brief` in the worktree (if "no graph here", `graph-memory init` once). If #8, #9 and #10 have merged, rebase onto `main`; otherwise stay stacked.
- `git status` clean except the plan documents; restore any line-ending-only changes (`git diff --ignore-cr-at-eol --stat` empty) before an implementer starts.
- Confirm facts this plan relies on (checked 2026-10-15): `src/app/layout.tsx` sets `metadataBase` from `NEXT_PUBLIC_SITE_URL`; only `src/app/opengraph-image.tsx` and `src/app/(public)/companies/[slug]/opengraph-image.tsx` exist; no `robots`, `sitemap`, feed or `@media print` exists (`grep -rn "@media print\|sitemap\|robots" src`); `VERCEL_ENV` is parsed in `src/lib/env.server.ts` line 79; the e2e `seed` project publishes the Kaveri file; `unpdf` 1.8.1 is a dependency.
- Hand each implementer: this plan's task, the spec sections named in it, and the files named in it. Nothing else.

## Model assignment and sizing
| Part | Task | Agent (model) | Review | Tokens (rough) |
|---|---|---|---|---|
| 5a | 1 SEO core: `seo.ts`, `feed.ts`, sitemap, robots, feed route, JSON-LD | desk-backend (sonnet) | Task 5 | 300k |
| 5a | 2 Metadata, JSON-LD and share cards on every public route | desk-ui (sonnet) | Task 5 | 260k |
| 5a | 3 Print layout, "Save as PDF", desk print banner | desk-ui (sonnet) | Task 5 | 280k |
| 5a | 4 E2E (feed, sitemap, robots, JSON-LD, PDF text) and guide | desk-backend (sonnet) | Task 5 | 220k |
| 5a | 5 **opus** review of 5a + sonnet fix wave + close-out | opus / sonnet | - | 150k + 180k |
| | **5a total** | | | **1.39M; with 20% margin about 1.65M** |
| 5b | 6 Migrations 0022, 0023 and pgTAP | desk-backend (**opus**) | Task 9 | 450k |
| 5b | 7 YouTube adapter, `distribution/videos`, parsers, steps, lint input, `v:` capture | desk-backend (sonnet) | Task 9 | 380k |
| 5b | 8 Desk and public video screens; feed, sitemap, JSON-LD, card, print | desk-ui (sonnet) | Task 9 | 380k |
| 5b | 9 E2E, guide, **opus** review of 5b + sonnet fix wave | sonnet / opus / sonnet | - | 200k + 150k + 200k |
| | **5b total** | | | **1.76M; with margin about 2.1M** |
| 5c | 10 Migrations 0024, 0025 and pgTAP | desk-backend (**opus**) | Task 16 | 550k |
| 5c | 11 Resend letters adapter (sender + contact mirror), fixtures, env, no-send guards | desk-backend (**opus**) | Task 16 | 350k |
| 5c | 12 `distribution/letters`: candidates, render, services, send-rpc, ops steps | desk-backend (sonnet) | Task 16 | 450k |
| 5c | 13 Desk letters and readers screens | desk-ui (sonnet) | Task 16 | 380k |
| 5c | 14 Public letters pages; feed, sitemap, JSON-LD, card, print | desk-ui (sonnet) | Task 16 | 300k |
| 5c | 15 E2E (fixture sends) and guide | desk-backend (sonnet) | Task 16 | 250k |
| 5c | 16 **opus** review of 5c + sonnet fix wave + close-out | opus / sonnet | - | 200k + 250k |
| | **5c total** | | | **2.73M; with margin about 3.3M** |

Today's budget (about 2.5M) fits **5a only** (about 1.65M with margin). 5b is the next session, 5c the one after (and its sends need Q9/Q36 resolved anyway). Pacing inside a part, if the week is tight, cut in this order: 5a the concept share card (about 25k) and `@page` page numbers (about 10k); 5b the `/videos` index (the detail pages stay reachable from the feed and "What changed"; about 40k); 5c "Send me a test copy" (about 50k). Never cut a migration task, an adapter's no-send tests, or a part's opus review.

---

## Part 5a: print, search and feeds (no migration, no outbound, no dependency)

### Task 1: SEO core in `showcase`

Build: `desk-backend` (sonnet). Review: folded into Task 5. Size: 300k.

**Files:** Create `src/modules/showcase/seo.ts` (+ `.test.ts`), `src/modules/showcase/feed.ts` (+ `.test.ts`), `src/modules/showcase/derived-scan.ts` (the shared test helper: `derivedProblems(text): string[]` for UUID, `%`, `₹`, `Rs\s?\d`, "ended ahead", "ended behind"; used only on outputs built from fixture snapshots whose own text holds no figure, so a hit is something a builder added; spec s4.1), `src/components/desk/json-ld.tsx` (server component rendering one script from a value, through `serializeJsonLd`), `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/feed.xml/route.ts`. Modify `src/modules/showcase/index.ts` (exports), `src/app/layout.tsx` (`alternates.types`), `src/modules/showcase/isolation.test.ts` (the new files and routes are in the public closure).

**Interfaces (all pure, snapshot in, plain data out):**
- `seo.ts`: `pageMetadata(route, s, slug?): Metadata` for `home | files | file | notes | note | process | processNote | cases | case | mistakes | concepts | concept | about` (spec s4.2); `jsonLdFor(route, s, slug?, siteUrl): object[]` (spec s4.3); `serializeJsonLd(value): string` (escapes `<`, `>`, `&`, U+2028, U+2029); `sitemapEntries(s | null, siteUrl): MetadataRoute.Sitemap` (spec s4.6); `robotsFor(vercelEnv, siteUrl): MetadataRoute.Robots`; the card builders come in Task 2.
- `feed.ts`: `feedEntries(s, limit = 50)` (reuses the `whatChangedEntry` rules from `site.ts`; export what it needs from there rather than copying; add ledger case entries) and `renderRss(entries, siteUrl): string` (spec s4.5; `escapeXml` strips C0 controls except tab and newline).
- Route `feed.xml`: `export const revalidate = 3600`; `getSnapshot()`; unavailable gives `new Response(null, { status: 503, headers: { "retry-after": "3600" } })`; else `content-type: application/rss+xml; charset=utf-8`.
- `robots.ts` reads `serverEnv().VERCEL_ENV` (the only env read; through `env.server.ts`).

**Tests first:** each route's metadata (title, description = his objective byte-identical, canonical path, OG times = IST dates of first and current gated revisions, `type`); JSON-LD per route and the forbidden-type scan (`Review|Rating|Offer|FinancialProduct|InvestmentOrDeposit|"price"`); `serializeJsonLd` on a title containing `</script><script>` and U+2028; `feedEntries` order, cap, guid `{path}#r{n}`, pubDate format `Mon, 05 Oct 2026 00:00:00 +0530`, a ledger case entry with the chart on prints no figure (`derivedProblems` empty), a note and a file entry; the same snapshot renders byte-identical XML twice and `lastBuildDate` equals the newest entry; escaping of `&<>"'` and a control character; sitemap for the deploy state (static only), with cases, with concepts, unavailable; robots for `production`, `preview` and unset; `derivedProblems` run over every output of a rich snapshot returns `[]`.

**Acceptance:** unit, typecheck, lint, `pnpm build` green; `curl` of `/feed.xml`, `/sitemap.xml`, `/robots.txt` on `pnpm dev` with the local seed looks right (paste in the report).

- [ ] Steps: failing tests, `seo.ts`, `feed.ts`, routes, layout, isolation, commit `feat(public): typed metadata, structured data, a feed, a sitemap and robots, all built from the gated snapshot`.

---

### Task 2: Metadata, JSON-LD and share cards on every public route

Build: `desk-ui` (model override: sonnet). Review: folded into Task 5. Size: 260k.

**Files:** Modify every `src/app/(public)/**/page.tsx` (`generateMetadata` or `metadata` from `pageMetadata`; one `<JsonLd>` per page from `jsonLdFor`, placed at the end of `main`). Create `opengraph-image.tsx` under `notes/[slug]`, `process/[slug]`, `cases/[slug]`, `concepts/[slug]` (copy the company card's shape: `revalidate`, empty `generateStaticParams`, unavailable gives `HOME_CARD`, unknown slug `notFound()`). Modify `src/modules/showcase/seo.ts` (`noteCard`, `processCard`, `caseCard`, `conceptCard` returning `ShareCardContent`, spec s4.4), `src/components/desk/share-card.tsx` only if a tag or sub-line slot is missing (keep it under 80 lines), `src/components/desk/share-card.test.tsx`.

**Behaviour:** spec s4.2-s4.4 and the s15 5a strings. Text over a card slot's budget is cut on a word boundary with "…" by one helper (`cutWords`), never re-worded. The case card never carries a figure or the chart. No page gains client JavaScript.

**Tests first:** each card builder (fields from the snapshot only; long-title cut; case card passes `derivedProblems`); a page test per route asserting one parseable JSON-LD script and the canonical link; the deploy-state snapshot (nothing public) still renders every existing page unchanged and the new card routes 404 where the page does.

**Acceptance:** unit, typecheck, lint, `pnpm build`, `pnpm check:bundles` green; desk-ui records the card layout pick in `docs/design/decisions.md` as "delegated by Shlok 2026-10-15".

- [ ] Steps: failing tests, card builders, OG routes, page metadata and JSON-LD, commit `feat(public): share cards for notes, process notes, cases and concepts; metadata and structured data on every public page`.

---

### Task 3: Print layout and "Save as PDF"

Build: `desk-ui` (model override: sonnet). Review: folded into Task 5. Size: 280k.

**Files:** Create `src/components/desk/print-masthead.tsx`, `src/components/desk/print-disclosure.tsx`, `src/components/desk/print-button.tsx` (client; `window.print()`; about 15 lines), `src/components/desk/private/print-banner.tsx`, tests beside them. Modify `src/app/globals.css` (one `@media print` block and `@page`; keep the file's existing order; if it passes 450 lines, move the print block to `src/app/print.css` imported by the root layout), `src/components/desk/public-frame.tsx` (hide chrome in print via `print:hidden`), the four printable pages (masthead, button beside the dateline, disclosure at the end), `src/app/desk/layout.tsx` (the banner), `src/components/desk/revision-diff.tsx` (`print:hidden`), `src/components/desk/revision-log.tsx` (prints).

**Behaviour:** spec s5 exactly, strings from s15. The masthead and disclosure are `hidden print:block`; the button is `print:hidden`; the masthead's revision line comes from the page's view model (no client clock). The full disclosure text comes from `STANDARD_DISCLOSURE` (no new copy of the sentence).

**Tests first:** component tests for the masthead (with and without figures-to), the disclosure (each `holds_position`), the button (calls `window.print`), the banner; a CSS test (like `globals.test.ts`) asserting the print block hides `[data-tab-bar]`, the rail and buttons and sets `@page`.

**Acceptance:** unit, typecheck, lint, build green; screenshots of Chrome's print preview for a file, a note and a desk page attached to the report (desk-ui records the print decisions in `docs/design/decisions.md`).

- [ ] Steps: failing tests, components, CSS, pages, desk banner, commit `feat(public): every public page prints as a dated document with its disclosure; desk prints carry a private-copy banner`.

---

### Task 4: End to end and the guide

Build: `desk-backend` (sonnet). Review: folded into Task 5. Size: 220k.

**Files:** Create `e2e/public-distribution.spec.ts` (runs in the `public-*` projects after `seed`). Modify `docs/guide/using-the-desk.md` (section "Sharing your work: PDFs, links and the feed": how to save a PDF, what a shared link shows, that the feed and cards update within an hour, that copies already taken cannot be recalled), `docs/guide/aksh-quick-guide.md` (one line on "Save as PDF").

**The spec:** `/feed.xml` parsed with `DOMParser` in the page (`page.evaluate`), channel title right, the seeded file is an item, no item text fails `derivedProblems`; `/sitemap.xml` lists `/companies/<seeded slug>` and not `/cases` (deploy state); `/robots.txt` disallows `/desk` (local env is not production: assert `Disallow: /` instead, and keep the production case to the unit test); each public detail page has one JSON-LD script that `JSON.parse`s; the file page `og:image` URL answers 200 with `image/png`; `page.pdf()` of the seeded file at A4 (Chromium only), read with `unpdf` `extractText`: contains the full standard disclosure, "Figures to", the canonical URL and "R1", and not the tab labels; `page.emulateMedia({ media: "print" })` on `/desk` shows the banner.

**Acceptance:** the full e2e suite passes; the guide section is plain words (read aloud).

- [ ] Steps: spec, guide, full e2e, commit `test(e2e): feed, sitemap, robots, structured data and a printed PDF of a public file; guide`.

---

### Task 5: 5a review, fix wave, close-out

Review: **opus** over the 5a diff (R1 rows 2, 3, 6, 7; R2 rows 2, 3, 5, 7; R3 rows 3-7; spec s4-s6 line by line; rule 11 of the v1.2 addendum; the isolation test; every new string against s15). Fix wave: `desk-backend` (sonnet). Size: 330k.

**Files:** whatever the review names; `docs/specs/technical-debt.md` (deferrals); a spec amendment section for anything built differently; the timeline entry; `graph-memory sync`. `docs/progress.md` is the controller's.

**Acceptance:** every finding fixed or logged with a reason; unit, typecheck, lint, build, `check:bundles`, e2e green; CI green on the PR.

**Release for Shlok (5a; nothing becomes public that is not public now):** (1) merge #8, #9, #10 first, in order; retarget the 5a PR to `main`. (2) No migration, no env. (3) After the merge: open `/feed.xml`, `/sitemap.xml` and `/robots.txt` on production (robots must show the production rules), paste a file URL into a chat app to see the card, and print one file to PDF. (4) Approve the 5a strings (s15) and D63-D72.

---

## Part 5b: videos (migrations 0022-0023; reads YouTube, never writes)

### Before Task 6 (controller)
- 5a merged; rebase onto `main`. `ls supabase/migrations`: the last is 0021 (or whatever reached main); 0022 and 0023 are free (`20261017000022_videos.sql`, `20261017000023_distribution_gate.sql`); if not, renumber files, tests and every mention here and in the spec.
- Confirm: the latest `publish_revision()` body is `20261016000021_knowledge_gate.sql` (the `knowledge_gate_failures` line is the last check before the slug block); `items_kind_check` was last restated in 0020; `private.ledger_gate_item_failures(p_item, p_company, p_holds, p_today)` exists with that signature.
- Q43 answered or defaulted (videos on Aksh's channel exist; Studio offers caption download for them).

### Task 6: Migrations 0022 (videos) and 0023 (distribution gate), pgTAP

Build: `desk-backend` (model override: **opus**). Review: folded into Task 9. Size: 450k.

**Files:** Create `supabase/migrations/20261017000022_videos.sql`, `supabase/migrations/20261017000023_distribution_gate.sql`, `supabase/tests/0022_videos.test.sql`. Modify the anon grant inventory test (exactly `public_videos`, `public_video_transcripts`), `supabase/tests/0002_function_privileges.test.sql` (new functions: `record_video_fetch` service_role only; `private.distribution_gate_failures` and the transcript hash trigger function no API role), `src/modules/compliance/policy.ts` (`POLICY_VERSION = "sebi-unreg-2026-07-v1.2"`), `src/lib/supabase/database.types.ts` (`pnpm db:types`).

**0022, spec s7.2 exactly.** Load-bearing points: `items_kind_check` restated with `'video'` added (keep every existing kind); `video_sources` with the machine-column guard trigger (refuses `authenticated` changes to any machine column and any change of `youtube_id`; `record_video_fetch(p_source_id, p_found, p_channel_id, p_own_channel, p_title, p_description, p_duration, p_privacy, p_published_at, p_problem)` the only writer, service_role only, sets `fetched_at = now()`); `video_transcripts` append-only (reuse `private.reject_mutation`), a BEFORE INSERT trigger computing `text_sha256 = encode(sha256(convert_to(string_agg(seg->>'t', E'\n' order by ord), 'UTF8')), 'hex')` and `words`, validating the segment shape and limits (raise `23514`), ignoring any client-sent hash; the two public views (security_invoker, column-level grants to `anon, authenticated`); RLS policies `to authenticated` gated on `private.is_admin()`.

**0023:** `publish_revision` restated whole from 0021 (copy, do not retype) with only: `c_policy` = `'sebi-unreg-2026-07-v1.2'`; after the knowledge line, the call in spec s7.3. `private.distribution_gate_failures(p_item_id, p_kind, p_company_id, p_data_as_of, p_revision_id, p_struct, p_lint jsonb) returns jsonb` with the video branch 12.1-12.4 (messages from spec s15; codes `12.1`-`12.4`), `'[]'` for every other kind. Restate the revoke and the service-role-only grant on `publish_revision`.

**Tests first:** kinds (`video` accepted; unknown refused); sources (id regex; machine columns refused to the admin session and written by `record_video_fetch`; `youtube_id` frozen; delete refused while public); transcripts (append-only; hash computed by SQL whatever the client sends; 5,001 segments and a 501-char segment refused); views (only the current public revision's transcript; a private, failed, pending or lagged item never; no machine column but the listed ones); gate (each of 12.1-12.4 alone fails with its code; stale fetch; other channel; private on YouTube; transcript hash mismatch; lint without `transcriptSha`; company without an old enough figures-to; chapters starting at 5 s; all good passes and appears in `public_items` and `public_videos`); every existing gate test passes unchanged except the policy string; `policy.test.ts` agrees with 0023.

**Acceptance:** `pnpm supabase db reset`, the full pgTAP suite green; unit, typecheck, lint green; the inventory test lists exactly the two additions.

- [ ] Steps: failing pgTAP, 0022, 0023, reset and test, grants tests, policy constant, `pnpm db:types`, commit `feat(videos): video sources and transcripts; the gate lints every spoken word and lists only his own videos (migrations 0022, 0023; policy v1.2)`.

---

### Task 7: YouTube adapter, `distribution/videos`, parsers, steps, lint input, `v:`

Build: `desk-backend` (sonnet). Review: folded into Task 9. Size: 380k.

**Files:** Create `src/lib/providers/video-meta.ts` (port), `youtube.ts`, `fixture-video-meta.ts` (+ tests); modify `src/lib/providers/index.ts` (`createVideoMetaPort(env)`: null unless both env set; fixture when `DISTRIBUTION_ADAPTER=fixture`, refused on preview/production), `src/lib/env.server.ts` and `.env.example` (`YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` with the s7.4 shapes, `DISTRIBUTION_ADAPTER` `fixture` only; labelled `[OPTIONAL-P5]`). Create `src/modules/distribution/` (`index.ts`, `actions.ts`, `public.ts` (pure renderers the public side may import), `videos/captions.ts`, `videos/chapters.ts`, `videos/youtube-url.ts`, `videos/service.ts`, `videos/repo.ts`, `videos/types.ts`, tests, `distribution.graph.test.ts`). Create `src/modules/ops/video-steps.ts` (`videos:fetch` in `SERVER_PUMP_STEPS` before `alerts:email`; `videos:check` in `SERVER_DAILY_STEPS` before `alerts:email`). Modify `src/modules/capture/parse.ts` (`v:` prefix, kind `video`; `PREFIX_RE` `[tlprv]`), `capture/service.ts` (files a `video` item and inserts the `video_sources` row; an unparseable link refuses the capture with "That is not a YouTube link."), `src/modules/research/schema.ts` (`ITEM_KINDS` gains `video`), `src/modules/compliance/` (`rules.ts` `LintInput.transcript: string | null`; `lint-input.ts` and `repo.ts` load the referenced transcript for a `video` revision through `@/modules/distribution`; the lint result carries `transcriptSha`; `policy.ts` rule labels "12.1" ... "Video").

**Interfaces:** `VideoMetaPort.fetch(ids: string[]): Promise<{ kind: "ok"; videos: Map<string, VideoMeta | "missing"> } | { kind: "quota" } | { kind: "refused"; reason: string } | { kind: "unavailable" }>` (spec s7.4: GET only, batches of 50, `readCapped` 64 KB, `redirect: "error"`, 10 s, key never in a message). `parseYoutubeUrl(text): string | null` (the four URL shapes; no other host). `parseCaptions`, `parseChapters` (spec s7.5). Services: `addTranscriptAction(itemId, file)` (admin; ≤ 1 MB; parse; insert), `useTranscriptAction`, `useTitleAction`, `useChaptersAction` (each makes one revision with body and structured carried, change reason from a fixed template), `fetchAgainAction`. Steps call `record_video_fetch` with the service client inside `src/modules/ops`.

**Before coding:** read the YouTube API Services Developer Policies section on stored data and `videos.list` reference; record both URLs and your reading in the adapter header and the report.

**Tests first:** URL parser (four shapes, ids with `-` and `_`, other hosts and lookalikes refused); captions (automatic-caption VTT with duplicate lines and timing tags, SRT, BOM, CRLF, 1 MB cap, binary and HTML refused, 30-second merge); chapters (valid, 2 entries refused, not starting at 0, not rising); adapter with a stubbed fetch (URL and params, 51 ids make two calls, `quotaExceeded` gives `quota`, a 400 gives the reason only, 5xx and timeout give `unavailable`, a missing id gives `missing`, the key never appears in any result); factory (null when unset, fixture refused on preview); steps (off text when unset, deferral on quota, `gone` marking, the warning state); capture `v:`; lint covers the transcript and returns its sha; `distribution.graph.test.ts` (no LLM/OCR/transcriber port, `googleapis.com` only in `youtube.ts`, no `method: "POST"` there, no `@/modules/ledger`, `@/modules/valuation`).

**Acceptance:** unit, typecheck, lint green; no public file changed.

- [ ] Steps: failing tests, port and adapter, parsers, module, steps, capture, lint, commit `feat(videos): read his videos from YouTube by key, parse Studio caption files and his chapters, lint every transcript`.

---

### Task 8: Video screens (desk and public) and their derived surfaces

Build: `desk-ui` (model override: sonnet). Review: folded into Task 9. Size: 380k.

**Files:** Create `src/app/desk/videos/page.tsx`, `src/app/desk/videos/[id]/page.tsx`, `src/components/desk/private/videos/` (list, YouTube data block, caption drop, transcript preview, chapters preview, tests), `src/app/(public)/videos/page.tsx`, `src/app/(public)/videos/[slug]/page.tsx`, `src/app/(public)/videos/[slug]/opengraph-image.tsx`, `src/components/desk/video-player.tsx` (client facade), `src/components/desk/video-transcript.tsx`, `src/modules/showcase/videos.ts` (+ test; snapshot gains optional `videos` and `videoTranscripts` loads like `concepts`, D60 pattern). Modify `src/modules/showcase/{types,repo,loader}.ts`, `seo.ts` and `feed.ts` (video entries, `VideoObject`, sitemap, card), the publish checklist (rule 12 lines), `grammar-key-row.tsx` and `capture-bar.tsx` (`v:`), the desk nav entry for Videos (desk-ui picks the spot; no sixth tab).

**Behaviour:** spec s7.6, s7.7 and the s15 5b strings. The player loads nothing from YouTube until the press (no iframe, no script; the thumbnail is a plain `img` with width and height); chapter links seek once loaded (postMessage is not needed: reload the iframe with `start=`). The transcript is rendered as escaped text in segments with their times. Machine data in the machine face, labelled.

**Tests first:** desk states (off, waiting for YouTube, fetched, no transcript, ready, listed, public-on-YouTube warning, gone); public view model from a snapshot (current transcript only; deploy state: `/videos` 404); `VideoObject` fields; card; feed entry passes `derivedProblems`; the player renders no iframe before the press.

**Acceptance:** 375 px first; unit, typecheck, lint, build, `check:bundles` green; `e2e/desk-a11y.spec.ts` extended to `/desk/videos`.

- [ ] Steps: failing tests, snapshot, desk, public, derived surfaces, commit `feat(videos): desk video pages and a public listing with transcript and chapters, behind the gate`.

---

### Task 9: 5b end to end, guide, review, fix wave

Build: `desk-backend` (sonnet) for the e2e and guide; **opus** review; `desk-backend` (sonnet) fix wave. Size: 550k.

**Files:** Create `e2e/videos.spec.ts` (project `videos`, after `concepts`, before `signout`; `DISTRIBUTION_ADAPTER=fixture` in the e2e web server env). Modify `playwright.config.ts`, `docs/guide/using-the-desk.md` (section "Videos": upload as Unlisted, `v:` the link, download captions in Studio, drop them, what the gate checks, make it Public on YouTube only after the desk lists it, that a spoken line cannot be edited away), `docs/guide/aksh-quick-guide.md` (one line).

**The spec:** capture `v: https://youtu.be/<fixture id>`; the fixture answers; drop a fixture VTT containing "you should buy this" in one cue; publish refused with rule 1 on the transcript; drop a clean VTT; "Use this transcript"; "Use chapters from the description"; objective; publish passes; signed out at 375 and 1280: `/videos/<slug>` axe-clean (route-block `i.ytimg.com` so the test never reaches Google), no request to `youtube-nocookie.com` before the press and one after it (route-fulfilled with an empty page), transcript and chapters shown, feed and sitemap list it; cleanup unpublishes in `afterAll`.

**Review:** opus over the 5b diff (spec s7, s9, s10 line by line; 0022/0023 grants and the hash trigger; rule 12; the anon inventory; the graph and isolation tests; strings against s15). Then the fix wave, technical-debt lines, the timeline entry, `graph-memory sync`.

**Release for Shlok (5b):** (1) hosted dry run lists exactly 0022 and 0023; push them and merge the 5b PR back to back (between the two, every publish is refused under the policy check: the app sends v1.1 until the merge, the database wants v1.2; same as D38 in 3b). (2) Then, only if Aksh will list videos: create a Google Cloud API key restricted to "YouTube Data API v3", set `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` on Vercel Production. Until then videos are off and nothing calls YouTube. (3) Approve the 5b strings and D73-D81.

- [ ] Steps: e2e, config, guide, full e2e, review, fix wave, close-out commit.

---

## Part 5c: letters (migrations 0024-0025; the only part that can send, and only on his press)

### Before Task 10 (controller)
- 5b merged; rebase onto `main`. 0024 and 0025 free (`20261018000024_letters.sql`, `20261018000025_letters_gate.sql`); renumber if not.
- Q9/Q36 status noted (a verified domain is needed before any real send; the build does not need it). Q41, Q45 defaults stand unless Shlok has answered.
- Confirm `private.distribution_gate_failures` is the 0023 body and `c_policy` is v1.2.

### Task 10: Migrations 0024 (letters, readers, sends) and 0025 (letter gate), pgTAP

Build: `desk-backend` (model override: **opus**). Review: folded into Task 16. Size: 550k.

**Files:** Create `supabase/migrations/20261018000024_letters.sql`, `supabase/migrations/20261018000025_letters_gate.sql`, `supabase/tests/0024_letters.test.sql`. Modify the anon executable-function inventory (exactly +4) and `0002_function_privileges.test.sql` (every new function's grants), `database.types.ts`.

**0024, spec s8.2 exactly.** Load-bearing points: `letters_pepper` inserted into `private.settings` with `encode(gen_random_bytes(32), 'hex')` only if absent (`on conflict do nothing`); `letters_signup` NOT inserted (absent = off); every function `security definer`, `search_path = ''`, revoked from `public` then granted exactly as s8.2 says; the anon functions never raise for a refused input (they return nothing or false, so a caller learns nothing), but do raise `22023` for a non-text or over-long argument; IST day counters computed with `(now() at time zone 'Asia/Kolkata')::date`; the token is `encode(gen_random_bytes(32), 'base64')` made URL-safe in SQL and only its `sha256` stored; `letters_confirm` compares hashes and clears the hash on success; `letter_sends` forward-only status trigger (`approved -> sending | expired | cancelled`, `sending -> sent | failed`); the frozen-letter trigger on `item_revisions`; the letter-item check trigger (no company, theme or figures-to).

**0025:** `create or replace function private.distribution_gate_failures` keeping the 0023 video branch verbatim and adding the letter branch 13.1-13.3 (spec s8.4; rule 4 per entry through `private.ledger_gate_item_failures`, recorded with rule `4` and the entry number). `publish_revision` is NOT restated.

**Tests first:** spec s12 "5c pgTAP" list, plus: `letters_request` called by `anon` with the switch absent stores nothing; the 101st request of an IST day stores nothing; `authenticated` non-admin cannot read `subscribers`, `subscriber_events` or `letter_sends`; no API role can insert or update them directly; `approve_letter_send` refuses a non-admin actor (42501), a non-letter, a non-current revision, a failed or old-policy decision, a second subscribers send, a send while another is approved; `claim_letter_send` expires a 25-hour-old approval and fails one whose item was unpublished; the letter gate refuses an entry whose source title changed, an entry of a private item, an entry naming a company with a stance change 10 IST days ago (rule `4`), and passes a clean letter; every existing gate test unchanged.

**Acceptance:** db reset, full pgTAP green; unit, typecheck, lint green; inventory +4 exactly.

- [ ] Steps: failing pgTAP, 0024, 0025, reset and test, grants tests, `pnpm db:types`, commit `feat(letters): readers with double opt-in and a consent log, approved sends, and a gate that re-checks every entry (migrations 0024, 0025)`.

---

### Task 11: Resend letters adapter, fixtures, env, no-send guards

Build: `desk-backend` (model override: **opus**). Review: folded into Task 16. Size: 350k.

**Files:** Create `src/lib/providers/letters.ts` (ports `LetterSender`, `ContactMirror`), `resend-letters.ts`, `fixture-letters.ts` (in-memory store with `peekFixtureLetters()` / `resetFixtureLetters()` for e2e, like `fixture-anchor.ts`), tests. Modify `src/lib/providers/index.ts` (`createLetterPorts(env)`: null unless `RESEND_LETTERS_KEY`, `LETTERS_FROM`, `LETTERS_SEGMENT_ID` are all set AND `VERCEL_ENV === "production"`; the fixture only with `DISTRIBUTION_ADAPTER=fixture` and no `VERCEL_ENV` of preview or production), `src/lib/env.server.ts`, `.env.example` (`[OPTIONAL-P5]`, with the note that the key must be full access and the alert key stays separate), `src/test/setup` (or the existing vitest setup file: a global `fetch` guard that throws for `api.resend.com` and `googleapis.com` unless a test injected its own fetch).

**Before coding:** read the current Resend reference pages for send email, create/send/get broadcast, create/list/update/delete contact and segment membership; record the URLs and the request and response shapes in the adapter header (spec s8.8). Do not rely on memory or on this plan for field names beyond what s8.8 states as verified.

**Interfaces:** spec s8.8. Every method returns a typed result and never throws; messages are a status number plus Resend's own message cleaned (control characters, the key removed, at most 160 chars), as in `resend-mailer.ts` (reuse its `readCapped` and cleaning; do not modify the alert adapter). `sendBroadcast` is only reachable through `deliverLetter(send, deps)` in Task 12.

**Tests first:** each endpoint's request (method, URL, headers, idempotency key, body) against a stub; pagination of contacts; 429 and 5xx and timeout become typed results; the key never appears in any result or thrown error; factory: null in every combination short of all three keys plus production; the fixture refused on preview; the global fetch guard catches an accidental real call.

**Acceptance:** unit, typecheck, lint green; `grep -rn "api.resend.com" src` lists only `resend-mailer.ts` and `resend-letters.ts`.

- [ ] Steps: failing tests, ports, adapter, fixture, factory, env, guard, commit `feat(providers): a Resend letters adapter that can only send behind an approved row, production only; fixtures for tests`.

---

### Task 12: `distribution/letters`: candidates, render, services, ops steps

Build: `desk-backend` (sonnet). Review: folded into Task 16. Size: 450k.

**Files:** Create `src/modules/distribution/letters/` (`candidates.ts`, `render.ts`, `service.ts`, `repo.ts`, `readers.ts`, `types.ts`, tests), `src/modules/distribution/send-rpc.ts` (`import "server-only"`; the only distribution file importing `@/lib/supabase/service`; ESLint allowance by exact path, as `gate-rpc.ts`), `src/modules/ops/letter-steps.ts` (`letters:send` in `SERVER_PUMP_STEPS`, `letters:reconcile` and `letters:purge` in `SERVER_DAILY_STEPS`, all before `alerts:email`). Modify `src/modules/distribution/actions.ts` (`makeLetterAction`, `saveLetterAction`, `approveSendAction`, `cancelSendAction`, `sendTestCopyAction`, `sendConfirmationsAction`, `binRequestsAction`, `eraseReaderAction`, `setSignupAction`, public `askToSubscribeAction`, `confirmAction`, `leaveAction`), `src/modules/research/schema.ts` (`letter` kind), `src/modules/compliance/` (letter lint input; rule labels "13.x" "Letter"), `distribution.graph.test.ts` (send-rpc imported only by `actions.ts`; `sendBroadcast` called only from `deliverLetter`), `eslint.config.mjs` (the allowance).

**Interfaces:** `letterCandidates(snapshot, passTimes, lastSentAt, today)` (spec s8.3); `renderLetter(letterView, siteUrl)` (spec s8.7; returns `{ subject, html, text }`; the placeholder `{{{RESEND_UNSUBSCRIBE_URL}}}` in both parts for a subscribers send, replaced by the `/letters/leave` URL for a self test); `deliverLetter(send, deps)` (spec s8.6: reconcile, create draft, record id, send, record; read-before-retry); `reconcileContacts(deps)` (erase unsubscribed, delete strays, add missing); `askToSubscribeAction` checks the honeypot and the signed render time (HMAC with the server secret already used for the clock ticket, or a new `LETTERS_FORM_SECRET`; the implementer picks the existing secret if one fits and says so) before calling `letters_request`; every admin action calls `requireAdmin()` first.

**Tests first:** spec s12 "5c unit" list, plus: an action never sends when `createLetterPorts` is null (each action's off path); `approveSendAction` then the step with a fake port sends exactly once even when the step runs twice concurrently (the claim) and once more after a simulated crash between "create" and "record"; a confirmation batch of 60 sends 50 and says so; the signed-time check refuses a submit under 3 s and a forged time; `renderLetter` output passes `derivedProblems` and contains every entry's title byte-identical.

**Acceptance:** unit, typecheck, lint green; no public page changed yet.

- [ ] Steps: failing tests, candidates, render, readers, service, send-rpc, actions, steps, lint, commit `feat(letters): letters assembled from what is already public, sent only from an approved row; readers confirm by email after Aksh releases it`.

---

### Task 13: Desk letters and readers screens

Build: `desk-ui` (model override: sonnet). Review: folded into Task 16. Size: 380k.

**Files:** Create `src/app/desk/letters/page.tsx` (list with send status), `new/page.tsx` (candidates with ticks, "Make this letter"), `[id]/page.tsx` (fields, email preview in an iframe with `srcdoc` and `sandbox=""`, publish panel, send block and dialog), `readers/page.tsx` (waiting list, "Send confirmation emails", "Bin", counts, "Erase an address", the sign-up switch), components under `src/components/desk/private/letters/` with tests. Modify `src/app/desk/page.tsx` (the Monday line), the desk nav (Letters entry; no sixth tab), the publish checklist (rule 13 lines).

**Behaviour:** spec s8.1, s8.5, s8.6 and the s15 5c strings. The Send dialog needs the tick before "Send" enables; a double press makes one approval (pending button; the SQL refuses a second anyway). Off state: every send control replaced by the off line; the letter still publishes. Status always read from `letter_sends`.

**Tests first:** every state of the send block (off, not published, ready, approved, sending, sent, failed, expired); the dialog (count, tick gating); the readers page (empty, waiting with daily allowance left, the 950 note, switch states); the Monday line only on Mondays IST with at least one candidate.

**Acceptance:** 375 px first; unit, typecheck, lint, build green; `e2e/desk-a11y.spec.ts` extended to the four routes.

- [ ] Steps: failing tests, components, routes, home line, commit `feat(desk): make, publish and send a letter with a recorded approval; release confirmation emails by hand`.

---

### Task 14: Public letters pages and derived surfaces

Build: `desk-ui` (model override: sonnet). Review: folded into Task 16. Size: 300k.

**Files:** Create `src/app/(public)/letters/page.tsx`, `[slug]/page.tsx`, `[slug]/opengraph-image.tsx`, `confirm/page.tsx`, `leave/page.tsx`, `src/components/desk/letter-article.tsx`, `signup-form.tsx` (a plain form posting to a server action; no client JavaScript beyond what the honeypot needs: none), tests; `src/modules/showcase/letters.ts` (+ test). Modify `seo.ts`, `feed.ts` (letter entries, `Article`, sitemap, card), print (the letter page prints), `isolation.test.ts`.

**Behaviour:** spec s8.9 and s15. `/letters` 404s unless sign-up is open (`letters_open()`, read through the public client; cache it with the snapshot's tag and a 5-minute revalidate) or a letter is public. Confirm and leave pages are `noindex` and never cached. The confirm page POSTs; a GET only renders the button. The answer to every sign-up and leave submit is the same sentence whatever happened.

**Tests first:** deploy state 404; archive order; the letter page shows no unsubscribe placeholder; confirm GET does not call `letters_confirm`; feed and card pass `derivedProblems`.

**Acceptance:** unit, typecheck, lint, build, `check:bundles` green.

- [ ] Steps: failing tests, view model, pages, derived surfaces, commit `feat(public): the letters archive, sign-up with a plain notice, confirmation and a one-step way to stop`.

---

### Task 15: 5c end to end and the guide

Build: `desk-backend` (sonnet). Review: folded into Task 16. Size: 250k.

**Files:** Create `e2e/letters.spec.ts` (project `letters`, after `videos`, before `signout`; fixture adapters). Modify `playwright.config.ts`, `docs/guide/using-the-desk.md` (section "Letters": the Monday line, making, publishing, the test copy, the Send dialog, confirmation batches, what happens on Leave, that a sent email cannot be recalled), `docs/guide/aksh-quick-guide.md` (two lines).

**The spec:** reset the fixture store; switch sign-ups on through the desk; signed out, ask to subscribe (honeypot empty, wait 3 s); the fixture store holds nothing; signed in, the readers page shows 1 waiting; "Send confirmation emails (1)"; the fixture store holds one confirmation; open its link: GET shows the button, POST confirms; make a letter from the seeded file entry, publish, assert the fixture store still holds no broadcast; approve; run the pump step; the fixture store holds exactly one broadcast whose text contains the file's title byte-identical and the disclosure footer; the archive page axe-clean at 375 and 1280; leave; reconcile removes the contact; cleanup: unpublish the letter (allowed), switch sign-ups off.

**Acceptance:** the full e2e suite passes.

- [ ] Steps: spec, config, guide, full e2e, commit `test(e2e): a letter from sign-up to an approved send, all through fixtures; guide`.

---

### Task 16: 5c review, fix wave, close-out

Review: **opus** over the 5c diff (R1 rows 2, 3, 6, 7; R3 all; spec s8, s9 and s11 line by line against 0024/0025, the adapter and the steps; rule 13; the anon inventory; DPDP defaults in s8.5; every new string against s15 and the banned words). Fix wave: `desk-backend` (sonnet). Size: 450k.

**Files:** as Task 5.

**Release for Shlok (5c; nothing is sent by the release):** (1) hosted dry run lists exactly 0024 and 0025; push, then merge. (2) Letters stay off: do not set `RESEND_LETTERS_KEY`, `LETTERS_FROM` or `LETTERS_SEGMENT_ID` until a domain is verified in Resend (Q9/Q36), open and click tracking are off on that domain, a segment exists, and Q41/Q45 are answered or the defaults accepted. (3) After setting them: Aksh presses "Send me a test copy" once and reads it on his phone before opening sign-ups. (4) Approve the 5c strings, the notice text and D82-D97.

## Conflict watch
| Tasks | Shared file / interface | Risk | Resolution |
|---|---|---|---|
| 1, 2, 8, 14 | `seo.ts`, `feed.ts` | each part adds a kind; a builder misses the scan | every part runs `derivedProblems` over its new outputs |
| 1 | `site.ts` `whatChangedEntry` | copying it drifts | export and reuse; Task 1 adds ledger cases in one place |
| 2, 3 | every public `page.tsx` | two tasks edit the same pages | sequential; Task 3 rebases on Task 2 |
| 3 | `globals.css` (430 lines) | passes the size rule | move the print block to `print.css` if over 450 |
| 6, 10 | migration numbers | another branch takes them | renumber before the task |
| 6 | `publish_revision` (latest body 0021) | a partial copy drops a rule | copy the 0021 body whole; every existing gate pgTAP passes with only the policy string changed |
| 6, 10 | anon inventories, `0002_function_privileges` | new grants fail them | extend with exactly the listed additions |
| 6, 10 | `items_kind_check` | a restatement drops a kind | assert every existing kind in pgTAP |
| 7, 12 | `ITEM_KINDS`, compliance lint input | a kind switch without a branch | typecheck; showcase `PUBLIC_KINDS` gains the kind only in Tasks 8 and 14 |
| 7, 12 | `SERVER_PUMP_STEPS`, `SERVER_DAILY_STEPS` | `alerts:email` no longer last | the existing step-order test |
| 7 | `capture/parse.ts` | `v:` breaks a grammar test | every existing grammar test unchanged |
| 11 | vitest setup `fetch` guard | breaks a test that stubs fetch differently | the guard only throws for the two hosts and only when the global is used |
| 12 | `eslint.config.mjs` service-client allowance | allowance too wide | exact path only, as `gate-rpc.ts` |
| 9, 15 | `playwright.config.ts` order; `signout` | published e2e items leak into `public-*` | new projects run after `concepts` and unpublish in `afterAll` |
| all | `src/lib/messages.ts` | key collisions | prefixes `video-`, `letter-`, `reader-` |
