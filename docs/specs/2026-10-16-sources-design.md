# Phase 5d spec: sources (other people's videos, pages and newsletter issues)

Status: written 2026-10-16 by desk-architect on Shlok's delegation; his binding decisions of 2026-10-16 are s0. Plan:
`docs/plans/2026-10-16-sources.md`. Rules: `docs/compliance/publishing-rules.md`, the v1.1 and v1.2 addenda, and the new
`docs/compliance/publishing-rules-v1.3-addendum.md` (rule 14). Migrations `20261019000026_sources.sql` and
`20261019000027_sources_gate.sql` (hosted ends at 0025). Policy moves to `sebi-unreg-2026-07-v1.3`. Decisions D98-D113 (s12),
questions Q53-Q56. Not legal advice.

## 0. Shlok's decisions (2026-10-16, binding)
1. Aksh has no YouTube channel. He adds other channels' videos by link; the thumbnail is shown.
2. Sources are private by default, attached to a company and/or concept with his note. He can show a source on a public file
   page only through `publish_revision()`. Machine data and his words never share a field. No LLM.
3. Titles and thumbnails are fetched by the server (YouTube oEmbed, no key); the thumbnail is copied to our own storage, so a
   visitor's browser never contacts Google or any third party by opening a page (the 5b privacy rule).
4. Websites and newsletters: the server reads the page title and site name once through the existing SSRF-hardened fetch
   (`src/modules/documents/safe-fetch.ts`), plus his note. No copied article text, no preview images.
5. Letters (5c) are hidden: no Letters tab, no public sign-up or archive entry point. Code and tables stay, switched off, reversible.
6. The own-channel video flow (5b: `/desk/videos`, `v:` capture, public `/videos`) is hidden the same way. His YouTube links now
   live in sources.

## 1. Problem
Aksh studies other people's work daily (a fund manager's interview, a sector newsletter issue, a blog post on a filing) and today
has nowhere to keep it beside the company or concept it informs. The inbox "paste a link" reads a page into facts for the AI;
it is the wrong tool for "I watched this, here is what I think". On the public side, a file that names the outside work its author
studied, with his own judgement on each, is what a reader at an AMC looks for first: where did this view come from, and did he
read the other side.

## 2. Current state (reused)
- **One publish path:** `publish_revision()` (body last restated in 0023), helper `private.distribution_gate_failures` (last
  replaced in 0025: video and letter branches), lint in TypeScript over the whole public surface (`compliance/lint.ts`,
  `lint-input.ts`, `repo.ts` loads extra text such as a video transcript and the gate checks `p_lint ->> 'transcriptSha'`).
- **File revisions:** `structured` is a `casefile/1` record whose `sources` key already means the documents the facts cite
  (S1..S30, "Sources" block on the file page). A ledger case carries only `ledger`, owned by `src/modules/cases`.
  `saveCaseFileRevisionAction` rebuilds `structured` from the facts sheet, so any other key must be carried forward by hand.
- **Outbound:** `safeFetch(link, deps)` (https and port 443 only, every address public, DNS pinned, 2 redirects, byte cap, timeout,
  no cookies; throws `link-too-large` past the cap). `createLinkFetchDeps(env)` swaps in made-up `*.test` sites under
  `LLM_ADAPTER=fixture` and refuses that on Vercel. `parseYoutubeUrl` exists in `@/modules/distribution/client`.
- **Capture:** `parseCapture` (prefixes `t: l: p: r: v:`, `$SYMBOL`, `#concept`, URLs); a `v:` capture files through an injected
  `VideoFiling`. Concepts are themes (Phase 4).
- **Public:** the cached snapshot (anon views, ISR 1 h, tag `publicItems`); 5b public video pages show a local placeholder and
  request nothing from Google before Play; rule 11 governs every derived surface.
- **Steps:** `SERVER_PUMP_STEPS` (every 15 min) and `SERVER_DAILY_STEPS` in `src/modules/ops/drain.ts`; 5b's
  `purge_stale_video_data()` is the precedent for YouTube's 30-day rule.

## 3. Options considered
### 3.1 Data model and how a public source is gated (D98)
| Option | Verdict |
|---|---|
| Own table with its own "show publicly" function | **Rejected.** A second publish path beside `publish_revision()` (hard rule) |
| Item kind `source`, each published by `publish_revision()` | **Rejected.** Every link would need a learning objective (rule 6), a disclosure, an R-number and a place in the feed, sitemap, cards and JSON-LD, then exclusions from all of them; a new kind touches every kind switch in the code. Most surfaces for the least gain |
| **Table `source_links` for the link and the machine data (private); the public choice is an entry in the company file's revision (`structured.studied`), published with that revision by the existing gate** | **Chosen.** No new kind, no new page, no feed or sitemap entry. The gate already runs rule 4 and the position check for the file's company. Removing a source publicly is a new revision without it; unpublishing the file removes all of them. The machine's title stays in the table, referenced by id and an SQL-computed hash, exactly as 5b's transcript |

Cost if wrong: showing a source publicly takes a file revision (one press plus Publish). A source attached only to a concept
cannot be public (Q54).

### 3.2 Thumbnail serving (D103)
| Option | Verdict |
|---|---|
| `<img src="https://i.ytimg.com/...">` | **Rejected.** Every visitor's browser contacts Google (s0.3) |
| Public Storage bucket | **Rejected.** A public object named by its hash leaks which private videos he saved: anyone can hash YouTube's own thumbnail and probe |
| Inline data URI in the page | **Rejected.** Puts image bytes in the cached snapshot (2 MB cache entry ceiling) |
| **Private bucket `source-thumbs`; anon may read an object only while a public entry shows it (storage policy over the public view); served by our route `/media/studied/<sha>.jpg`** | **Chosen.** The browser only ever contacts our own origin; private saves stay unreachable |

### 3.3 Freshness of YouTube data (D104)
| Option | Verdict |
|---|---|
| Fetch once, keep forever | **Rejected.** If oEmbed counts as a YouTube API Service, data kept by a key-less client must be deleted or refreshed within 30 calendar days (Developer Policies III.E.4.d, read 2026-10-16; oEmbed is not named in the definition in IV). A deleted video would also stay on his public page |
| **Fetch once when saved; a server-side re-check every 25 days (at most 40 a day) and a purge of anything not re-checked in 30 days, as 5b did for videos** | **Chosen.** No visitor ever causes a fetch; dead videos leave the public page; the 5b reading of Q51 holds unchanged. This is a small widening of "fetched once" (Q55) |

## 4. Data (migration `20261019000026_sources.sql`)
- `public.source_links`: `id uuid pk`; `url text not null` (https, at most 2,000 chars; the link as saved, `http` upgraded to
  `https`); `url_key text not null unique` (s6.2); `kind text check in ('youtube','web')`; `youtube_id text` (`^[A-Za-z0-9_-]{11}$`,
  set exactly when `kind = 'youtube'`); `note text not null default ''` (HIS private words, at most 4,000 chars); `created_at`;
  `archived_at`. Machine columns, null until read, written only by `public.record_source_fetch(...)`: `title` (at most 300),
  `site_name` (at most 120; the channel name for YouTube, `og:site_name` or the host for a page), `channel_url` (YouTube only,
  `https://www.youtube.com/...`), `thumb_path`, `thumb_sha256`, `meta_sha` (sha256 hex over kind, title, site name, channel URL
  and thumbnail hash, computed in SQL, never sent by a client), `meta_since timestamptz` (set only when `meta_sha` changes),
  `fetched_at`, `checked_at`, `gone boolean default false`, `fetch_problem` (a code from s6.4), `fetch_attempts smallint`.
- `public.source_link_companies (link_id, company_id)` at most 5 per link, and `public.source_link_concepts (link_id, theme_id)`
  at most 8 per link; primary keys on the pair, foreign keys `on delete restrict`.
- No delete for any API role. Archive is `archived_at`. A trigger refuses archiving a link, or removing its company row, while the
  current public revision of any item shows it ("It is on the public file. Save a revision without it first.").
- RLS on all three; admin select, insert and update of `note`, `archived_at` only (column grants); machine columns refused to
  `authenticated` by a guard trigger, as `video_sources` in 0022. `record_source_fetch` and `purge_stale_source_data()` are
  security definer, `search_path = ''`, service_role only.
- Bucket `source-thumbs`: private, `file_size_limit` 200 KB, `allowed_mime_types` `{image/jpeg}`; object name
  `yt/<thumb_sha256>.jpg`; written and deleted by the service role only; admin select; anon select only where the name equals a
  `thumb_path` in `public.public_studied`.
- `public.public_studied` (security_invoker view; anon column grants and an anon row policy on `source_links` repeating the
  predicate through a definer helper `private.studied_is_public(link_id)`, the 0022 pattern): one row per entry of the CURRENT
  public revision of a public `thesis` or non-ledger `case_study` item: `item_id, position, kind, url, saved_on` (IST date of
  `created_at`), `note` (the entry's note, his public words), and, only when the entry has `show = true` and its `metaSha`
  equals the link's current `meta_sha`: `title, site_name, channel_url, thumb_path, thumb_sha256`; else those are null. A row
  appears only when the link is not `gone` and the IST date of `meta_since` (or of `created_at` when there is no meta) is at least
  30 days before today (rule 14.4). Never: `note` of the link, `id`, `youtube_id`, `fetch_problem`, company or concept rows.
- Anon grant inventory: exactly `public_studied` (select) and the column grants it needs.

## 5. The revision entry and the gate (migration `20261019000027_sources_gate.sql`, rule 14)
- A file revision may carry `structured.studied`: at most 12 entries, each exactly `{ "link": uuid, "show": boolean,
  "metaSha": hex64 | null, "note": text 0..500 }`. `note` is his public words for that source (prefilled from his private note on
  his press, editable, then his). `link`, `show` and `metaSha` are the machine's keys. Only `src/modules/sources` writes the key;
  `saveCaseFileRevisionAction` carries it forward unchanged (a test), and a ledger case never has it.
- `publish_revision()` restated whole from 0023 with only `c_policy = 'sebi-unreg-2026-07-v1.3'` (`POLICY_VERSION` the same).
  `private.distribution_gate_failures` replaced with the same signature, keeping the video and letter branches byte for byte, plus
  a `studied` branch for every kind (codes `14.1`-`14.3`):
  - 14.1 Shape as above, no duplicate link, kind `thesis` or non-ledger `case_study` only ("Outside sources go on a company file.").
  - 14.2 Each link exists, is not archived, is not `gone`, and has a `source_link_companies` row for the item's company.
  - 14.3 `show = true` needs `metaSha` equal to the link's current `meta_sha` ("YouTube or the page changed since you chose it.
    Save the sources again.") and `metaSha` present in `p_lint -> 'studied'` (the lint read exactly that title); `show = false`
    needs `metaSha` null.
- The lag (14.4) is applied by the view, not refused by the gate: a fresh source on an old file publishes and appears on its 30th
  day, so adding a link never hides a file.
- Lint (TypeScript): new fields `outsideTitle`, `outsideSite` (when `show`) and `outsideLink` (always: host and path, hyphens and
  slashes read as spaces), rules 1 and 2 only (a rule 1 allowance applies as usual); entry machine keys are skipped by the
  structured walk; his entry `note` is linted as structured text like the body (all rules). The lint result gains `studied:
  string[]`, the `metaSha` of each entry whose texts it read. `compliance/repo.ts` loads the texts only for links whose current
  `meta_sha` equals the entry's.

## 6. Capture, the desk and the outbound reads
### 6.1 Capture (one action)
`s: <link> $SYMBOL #concept my note` in the capture box. The first link is the source; `$` tokens attach companies (existing
resolution, stubs as today), `#` tokens attach concepts (at most 8); the note is the text with the prefix and that link removed,
exactly as typed. Answer: "Source saved. Reading its title." No link: "A source needs a link." (nothing filed). A `v:` capture is
filed the same way while own videos are off (s8). Filing goes through an injected `SourceFiling` (the `VideoFiling` pattern). A
saved source is not an item and does not count in the capture streak (D108).

### 6.2 Dedupe (D105)
`url_key`: YouTube links (every shape `parseYoutubeUrl` reads) become `yt:<id>`; any other link becomes lower-case host without
`www.`, the path without a trailing slash, the query without `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`, `ref_src`,
`igshid`, `si` and the rest sorted, no fragment. Saving a link again adds nothing new: his new note is appended to the old one
under a dated line ("— 16 Oct 2026"), new companies and concepts are added, an archived link is restored, and the desk says
"You saved this link on 3 Oct 2026. Your note was added to it."

### 6.3 Reads (server only; ports in `src/modules/sources/outbound.ts`, every call through `safeFetch`)
| Read | Request | Limits | Stored |
|---|---|---|---|
| YouTube details | `GET https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` (shape checked 2026-10-16: `title`, `author_name`, `author_url`, `thumbnail_url`, `provider_name`) | 10 s, 64 KB, JSON only | `title`, `site_name` = `author_name`, `channel_url` = `author_url` only if it is on `www.youtube.com` |
| Thumbnail | `GET https://i.ytimg.com/vi/<id>/mqdefault.jpg`, built from the id (oEmbed's `thumbnail_url` is never followed) | 10 s, 200 KB, `image/jpeg` with bytes `FF D8 FF` | bytes in `source-thumbs`, `thumb_sha256` |
| Page title | `GET` the saved link | 10 s, first 512 KB only (new `safeFetch` option `prefixOnly`: stop at the cap and return the prefix instead of refusing), `text/html` or `application/xhtml+xml` | `og:title`, else `<title>`, entity-decoded, spaces collapsed, control characters removed, cut at 300 on a word boundary; `site_name` = `og:site_name`, else the host |
No cookies, no article text, no images from pages, no other host. A pure `readPageMeta(html)` (linear scan, no parser dependency,
the `html-text.ts` approach) reads the two tags.

### 6.4 Steps, failures and what Aksh sees (D106)
- `sources:fetch` (pump): links never read with fewer than 3 attempts, at most 5 a run, stop after 40 s; also run at once through
  `after()` on save. `sources:recheck` (daily): first `purge_stale_source_data()` (clears title, channel and thumbnail of a
  YouTube link not checked in 30 days and deletes its object), then YouTube links not checked in 25 days, at most 40, stop after
  60 s. Pages are never re-read automatically. Both write heartbeats; neither is in `HEALTH_RULES`.
- Problem codes and the desk's words: `not_found` "YouTube says this video does not exist or is private."; `not_embeddable` (oEmbed
  401) "YouTube does not share this video's details. The link is saved."; `timeout` / `unavailable` "The site did not answer. The
  desk tries again (3 tries), or press Read again."; `refused` "This link cannot be read by the desk (only public https pages).";
  `not_page` "This link is not a web page. The link is saved."; `too_big_image` "The thumbnail was too large and was not kept.";
  `purged` "YouTube details older than 30 days were removed. They are read again at the next check.".
- A YouTube link found missing on a re-check is marked `gone`, its machine data and thumbnail removed; the public page drops it
  at the next refresh; the desk says "This video is no longer on YouTube. It is hidden on the public file; save the sources
  again to drop it."
- "Read again" on a source: admin, cooldown 1 minute (from `fetched_at`), the same code as the step.

### 6.5 Desk
- `/desk/sources` (under the Items tab nav, beside Concepts): the add form (link, companies, concepts, note; one press), then
  sources newest first, filterable by company, concept and "on a public file". Each card: thumbnail (through the desk route
  `/desk/sources/[id]/thumb`, admin session), the machine block in the machine face labelled "From YouTube, read {date}" or
  "From the page, read {date}" (title, channel or site), his note (editable), company and concept chips (editable), status
  ("Reading the link", a problem sentence, "Private", "On the public file", "On the public file from {date}"), Archive.
- File page (`/desk/items/[id]`, `thesis` and non-ledger `case_study`): panel "Outside sources" listing the company's sources,
  each with "Show on the public file", "Show its title and picture" (default on), and "What readers see from me" (prefilled from
  his note on his press). One button "Save as a new revision" (his change reason optional, never written by the machine), then
  the usual publish panel. Fixed line under each picture: "The desk does not read pictures. Untick if this one tells people to buy
  or sell." Publish checklist gains the rule 14 lines.
- `/desk/concepts/[slug]`: a "Sources" list (read only, links to `/desk/sources?concept=`).

## 7. Public
- File page block (after the Sources block, before the dateline): label "STUDIED", title "Other people's work I studied", sub
  "Videos, articles and letters by others, with my note on each. Linked, not endorsed." Each card: the picture (YouTube, shown,
  320x180, `loading="lazy"`, from `/media/studied/<sha>.jpg`), the title in the machine face with "Title on YouTube" / "Title on
  the page", "YouTube · {channel}" or the site name (attribution: YouTube is named as the source and the channel is credited,
  III.F.2.a), "Saved {date}", his note under "My note", and the link "Watch on YouTube" / "Open the page" (`rel="noopener
  noreferrer nofollow"`, `referrerpolicy="no-referrer"`). With `show = false` or changed data: no picture or title; the card says
  "A video on YouTube" or the host name. Block absent when no row is visible.
- `/media/studied/[file]` (route handler, anon client only): `<64 hex>.jpg` only; 404 unless the object is readable to anon;
  `Content-Type: image/jpeg`, `Cache-Control: public, max-age=3600, s-maxage=3600` (no stale-while-revalidate, so a retraction
  holds rule 11.5's hour), `X-Content-Type-Options: nosniff`.
- Derived surfaces: feed, sitemap, JSON-LD and share cards are unchanged (no source text, no new URL; a revision that only
  changes sources is a normal feed entry with his change reason). Print: titles, names, his notes and each link printed in full;
  pictures not printed.
- Isolation: the media route and the showcase builder (`buildStudiedBlock`, pure over the snapshot) import no desk module, no
  service or cookie client; the derived-output scan finds no UUID in the block.

## 8. Hiding letters and own videos (D109)
`src/lib/features.ts`: `featureOn("ownVideos" | "letters")` returns the constant `false`; outside Vercel preview and production,
`FEATURES_ON=ownVideos,letters` turns them on for tests only (the fixture-adapter rule), so the hidden code stays tested and can
be switched back by changing one constant. Off means: no "Videos" or "Letters" link in the desk Items nav or the public rail; every
route under `/desk/videos`, `/desk/letters`, `/videos`, `/letters` calls `notFound()` (layouts); public letter server actions
refuse with the generic answer; the snapshot drops video and letter items so feed, sitemap, cards and counts omit them; the steps
`videos:*`, `letters:*` report "off"; the capture key row shows `s:` instead of `v:`; a letter item's desk redirect 404s. No table,
migration or env value changes.

## 9. Free-tier ceilings
| Limit | Ceiling we set | When hit, Aksh sees |
|---|---|---|
| Supabase Storage 1 GB | 200 KB per picture (mqdefault is about 10-20 KB); 1,000 sources about 20 MB | the existing storage meter (Task 3 makes it count `source-thumbs`) |
| Supabase DB 500 MB | notes 4,000 chars, 12 entries per revision | the existing database-size line |
| Vercel 300 s per function | 40 s pump budget, 60 s daily budget, 10 s per request | links wait for the next run; status "Reading the link" |
| YouTube oEmbed (no published quota) | at most 5 new reads per 15 min, 40 re-checks a day | 3 tries, then the problem sentence and "Read again" |
| Bandwidth | pictures cached an hour at Vercel's edge | none |

## 10. Testing (nothing reaches the network)
- **pgTAP** (`0026_sources.test.sql`, `0027_sources_gate.test.sql`): constraints, url_key uniqueness, guard trigger, no delete,
  archive refused while public, SQL-computed `meta_sha` and `meta_since`, purge, grants (anon exactly `public_studied` +
  columns), storage policy (anon reads only a shown picture), the view (current revision only, lag, `show` and hash masking,
  `gone`), each 14.x failure and the pass, policy v1.3, every existing gate test unchanged but the policy string.
- **Unit:** url_key per shape; capture `s:`; `readPageMeta` (entities, og vs title, hostile long input is linear); adapters with
  `safe-fetch-fakes.ts` resolvers and transports only (never `httpsTransport` or `systemResolver`; a graph test); `prefixOnly`;
  steps (budgets, attempts, purge first, gone); lint fields and `studied`; casefile carry-forward; features off and on.
- **E2E** (`LLM_ADAPTER=fixture`; the fixture sites gain `www.youtube.com/oembed` and `i.ytimg.com` answers): `s:` capture,
  dedupe, panel, publish refused for a title with "buy" until untick, passes, public card served from `/media/studied` (a
  Playwright route guard fails on any request to a host other than the app), hidden letters and videos 404.

## 10a. Rejected small options (recorded)
- Showing sources on public concept pages now (Q54). JSON-LD `citation` (a new derived surface for little reader value).
  Automatic re-read of pages (no rule asks for it). One company per source (a newsletter issue often covers several). Reading
  text in pictures (no OCR in a publish path).

## 11. Tradeoffs, risks, future evolution
- Tradeoff: a public source change costs a file revision; in return it rides every existing guarantee.
- Risk: a third-party picture can carry words the lint cannot read; mitigated by his tick and the fixed warning (Q56).
- Risk: a channel renames or changes its picture; the card falls back to the plain form until he saves again (never shows unchecked
  text).
- Evolution: sources on concept pages; sources on learning notes; Whisper for his own videos if 5b returns.

## 12. Decisions taken on Shlok's behalf (cost if wrong)
| # | Decision | Cost if wrong |
|---|---|---|
| D98 | Public sources are entries in the file revision, not an item kind | One revision per change; concept-only sources stay private |
| D99 | Policy v1.3, rule 14 in SQL; `publish_revision` restated only for the constant | Publishes refused between the hosted push and the merge (as 3b, 5b) |
| D100 | Third-party titles, site names and links are linted (rules 1, 2), allowanceable for rule 1; untick shows the plain card | Some clickbait titles need an untick or an allowance |
| D101 | 30-day lag per entry by the date its data was read, in the view | A fresh link shows a month later |
| D102 | Up to 5 companies and 8 concepts per source; 12 entries per file revision | A thirteenth needs a choice |
| D103 | Private bucket + our media route | One route to maintain |
| D104 | Monthly YouTube re-check and 30-day purge | About 40 server reads a day |
| D105 | Dedupe by normalised key; a repeat appends his note | A link that differs only in a dropped parameter is treated as the same |
| D106 | Budgets: 5 per pump run in 40 s, 40 re-checks a day in 60 s, 10 s per request | A burst of saves waits up to 45 min |
| D107 | `mqdefault.jpg` (320x180) built from the id, never oEmbed's URL | Lower resolution than `hqdefault` |
| D108 | Sources do not count in the capture streak | Streak looks lower on link-heavy days |
| D109 | Hiding by a code constant with a test-only override | Turning back on needs a one-line PR |
| D110 | Public block name "Other people's work I studied" (Q53) | Copy change only |
| D111 | `nofollow` and no-referrer on outbound links | None for readers |
| D112 | Inbox "paste a link" unchanged; the guide says which to use | A YouTube link pasted in the inbox still goes the facts route |
| D113 | No new dependency; no LLM, OCR or transcriber port in `src/modules/sources` (graph test) | None |

## 13. Copy (rendered, not typed; every string pending Shlok's approval)
All strings in s6.1, s6.2, s6.4, s6.5 and s7 as quoted, plus: checklist lines "Outside sources match what you chose (rule 14)."
and "Outside titles and links pass the wording check."; status "On the public file from {date} (30 days after it was read)."

## Why this impresses an allocator
A research file that lists the other people's work its author studied, each with his own one-line judgement, answers the first
question an AMC head asks of any analyst: where did this view come from, and did he read the other side? It shows reading breadth,
citation discipline and the habit of disagreeing in writing, in the format a CIO already trusts in sell-side notes. It is
"linked, not endorsed": every title passes the same wording check as his own words, nothing shows until it is a month old, and
opening the page tells no third party who is reading. That care is visible to a professional reader and is rare on personal sites.
