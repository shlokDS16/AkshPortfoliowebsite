# Phase 5 spec: distribution (print and PDF, search and feeds, videos, letters)

Status: written 2026-10-15 by desk-architect on Shlok's delegation (he reviews and merges this evening). Decisions D63-D97
below, each with its cost if wrong. Built by `docs/plans/2026-10-15-phase-5-distribution.md`. Branch `phase-5-distribution`,
stacked on `phase-4-learning-graph` (PR #10, on #9, on #8; last migration 0021). Phase 5 is built and shipped in three parts,
in this order: **5a** (progress 5.3 and 5.4; no migration, no outbound call, no new dependency), **5b** (5.2 videos; migrations
0022-0023; reads from YouTube, never writes to it), **5c** (5.1 letters; migrations 0024-0025; the only part that can send
anything, and only on Aksh's press).
Binding parents: ADR-001 s3-s4 (module `distribution`; ports; "cut from v1: newsletter auto-send, YouTube audio download"),
ADR-003 (the gate is service-role only; lint computed server-side), ADR-004 (machine output never written into his revision
fields), ADR-005 (ledger; rule 4 helpers); `docs/compliance/publishing-rules.md` rules 1-9 (rule 8 names "OpenGraph text,
newsletter drafts, video transcripts"), the v1.1 addendum (rule 10; 10.7 above all) and the new v1.2 addendum
(`docs/compliance/publishing-rules-v1.2-addendum.md`, rules 11-13, written with this spec); `docs/design/decisions.md` segment 1
("C's weekly letter: cadence risk; revisit in Phase 5") and segment 5 (share cards). ADR change: one addendum,
`docs/architecture/ADR-001-addendum-2026-10-15-distribution.md` (D83, D90, D93 change ADR-001 s4 and ADR-003 s4).

## 1. Problem
Everything Aksh publishes stays on one site that nobody is told about. An allocator who finds a file cannot print it for a
meeting, a search engine sees untyped pages with no feed or sitemap, a link shared in a chat shows a card only for company files,
his videos (if he makes them) live on YouTube with nothing tying them to his files, and there is no way to tell a reader "this
changed". The roadmap asks for a PDF of a thesis, search and share metadata, a feed, a video listing with transcript and
chapters, and a letter drafted from revision diffs and sent only when he approves it. Every one of these is a publication
(rule 8), and two of them (email, video) leave the site, where a retraction cannot follow.

## 2. Current state (what is reused)
- **Public snapshot** (`src/modules/showcase`): one cached read of the anon views (`public_items`, `public_item_revisions`,
  companies, capture days, fact checks, concepts), ISR 1 h, tag `CACHE_TAGS.publicItems` refreshed by every publish and
  unpublish. The views apply the 30-day lag in SQL; `files()` re-checks it. Every page model (`buildFileView`, `buildNoteView`,
  `buildCaseStudyView`, `buildConceptView`, `buildWhatChanged`) is a pure function of the snapshot.
- **Metadata**: `metadataBase` from `NEXT_PUBLIC_SITE_URL`; `generateMetadata` returns only `title` and `description` on the
  five dynamic routes; the desk and login are `noindex`. OG images: the site card (`src/app/opengraph-image.tsx`) and one card per
  company file (`companies/[slug]/opengraph-image.tsx`, `ShareCardImage`, Plex fonts). No `robots`, `sitemap`, feed, JSON-LD,
  canonical or print styles exist. No CSP header exists.
- **Gate**: `publish_revision()` (latest body `20261016000021_knowledge_gate.sql`), helpers `private.ledger_gate_item_failures`,
  `private.case_gate_failures`, `private.knowledge_gate_failures`; policy `sebi-unreg-2026-07-v1.1`; lint in TypeScript over
  title, slug, objective, body, `structured`, change reason, company and concept names (ADR-003).
- **Providers**: `AlertMailer` + `resend-mailer.ts` (plain fetch, idempotency key, never throws, key never echoed; fixed
  recipients) and its fixture; `TranscriberPort` + `groq-whisper.ts` (voice notes, off behind `VOICE_NOTES`); the factory pattern
  in `src/lib/providers/index.ts` (real adapter only when its env is set; fixtures refused on deployed environments).
- **Clocks**: the DB pump (pg_cron every 15 min, `SERVER_PUMP_STEPS`) and the daily cron (`SERVER_DAILY_STEPS`), each step
  writing a heartbeat; `alerts:email` last.
- **Env on hosted today**: `RESEND_API_KEY` and `ALERT_EMAIL` are set on Production (Shlok's Resend address; no verified domain,
  Q9/Q36). No YouTube key exists.

## 3. Options considered
### 3.1 Scope and order (D63)
| Option | Verdict |
|---|---|
| All four items in one build (about 7M tokens with margins) | **Rejected.** Three times today's budget; one PR mixing zero-risk metadata with the system's first outbound sends |
| 5a = 5.3 + 5.4, 5b = 5.1 + 5.2 together | **Rejected.** 5b alone is about 5.4M; letters are blocked on a verified domain (Q9/Q36) while videos are not, so bundling them makes videos wait for a purchase |
| **5a (print, search, feeds) then 5b (videos) then 5c (letters)** | **Chosen.** Each part ships on its own PR in rising order of risk: 5a sends nothing and changes no schema; 5b reads from YouTube and publishes only through the gate; 5c is the only part that can send |

### 3.2 PDF of a thesis (D69)
| Option | Verdict |
|---|---|
| Server-rendered PDF with headless Chromium (`@sparticuz/chromium`) | **Rejected.** About 60 MB of binary against the 250 MB function bundle and 300 s cap; a second rendering path that can drift from the page and the gate |
| Programmatic PDF (`@cantoo/pdf-lib`, already a dependency) | **Rejected.** Re-implements the page layout by hand; every view change is made twice |
| **Print stylesheet and a "Save as PDF" button (the browser's own print to PDF)** | **Chosen.** No dependency, no function time, works on a phone; the PDF is the gated page itself, so it cannot show anything the page does not |

### 3.3 Where a letter and a video live (D73, D82)
| Option | Verdict |
|---|---|
| Own tables with an own approval function | **Rejected.** A second publish path beside `publish_revision()` (CLAUDE.md hard rule: there is only one) and a second audit trail |
| **Item kinds `video` and `letter`, published by `publish_revision()`; machine data in side tables referenced by id and hash** | **Chosen.** One gate, one `gate_decisions` trail, one retraction path (`unpublish_item()`), the existing lint and rule-4 helpers; ADR-004 holds because the machine's text (YouTube metadata, transcript) never enters his revision fields |

### 3.4 Transcript source (D75)
| Option | Verdict |
|---|---|
| YouTube `captions.download` | **Rejected.** Needs OAuth with scope `youtube.force-ssl` and edit permission on the video, 200 quota units a call (verified 2026-10-15, developers.google.com/youtube/v3/docs/captions/download); an OAuth app in Google's "testing" status gets refresh tokens that lapse, so the step would fail silently every few days |
| Download the audio from YouTube and send it to Whisper | **Rejected.** YouTube's terms forbid downloading outside its own features; ADR-001 cut it |
| Groq Whisper on the audio file Aksh recorded | **Deferred (5d).** Free tier allows 25 MB per file (verified 2026-10-15, console.groq.com/docs/speech-to-text); the rate-limit page now lists only Developer-plan Whisper limits (20 RPM, 2K RPD, 7.2K audio s/h, 28.8K audio s/day), so the free-plan quota is no longer a published fact; it also needs the voice-note debt M-4 fixed first |
| **The caption file Aksh downloads from YouTube Studio (.vtt or .srt), dropped on the video's desk page** | **Chosen.** A provided YouTube feature on his own video; zero quota; timestamps included; YouTube's automatic captions cover the case where he wrote none |

### 3.5 Subscribers, consent and who sends (D88, D89)
| Option | Verdict |
|---|---|
| Resend's contact list as the only store | **Rejected.** No record of what the subscriber was told and when they confirmed; withdrawal evidence lives with a processor |
| Single opt-in | **Rejected.** Anyone can subscribe anyone; poor deliverability; weak consent evidence |
| Automatic confirmation emails on sign-up | **Rejected for now.** It is an outbound send no person approved; it turns the form into a way to make the site email strangers ("subscription bombing") |
| **Our table is the consent record (double opt-in, notice version, 18+ affirmation); Resend is a mirror reconciled before every send; Aksh releases waiting confirmation emails with one press** | **Chosen.** Every email that leaves the system follows a press by Aksh; junk requests are visible and binned before anything is sent; withdrawal is one form on the site with no email needed |

### 3.6 Who drafts the letter (D83)
| Option | Verdict |
|---|---|
| A Monday cron step writes the draft item (ADR-001 s4) | **Rejected.** The machine would write a revision; ADR-004 forbids it (`service_role` has no write on `item_revisions`, and a trigger refuses it) |
| **The desk computes "since your last letter" on read; Aksh's press "Make this letter" writes it** | **Chosen.** No machine revision; nothing exists until he asks; the Monday line is a prompt, not a promise |

## 4. Phase 5a: derived public surfaces (progress 5.4)
### 4.1 The rule for every derived surface (publishing rule 11, v1.2 addendum)
Metadata, JSON-LD, OG cards, the feed, the sitemap and the print layout are built **only** from the public snapshot through pure
functions in `src/modules/showcase/`, and only from fields the gate lints (title, slug, learning objective, change reason, body
as rendered, company and concept names) plus fixed copy. They never import a desk module, the service client or the cookie
client, never print an id from the database (no UUID; paths use slugs, file numbers and R-numbers), and on a ledger case study
never print a figure or verdict (rule 10.7): no price, return, excess, rebased value, count across ideas. A test builds every
output from a fixture snapshot whose own text holds no figure, and scans it for a UUID pattern, `%`, `₹`, `Rs` followed by a
digit, "ended ahead" and "ended behind": any hit is something a builder added (an id, a figure from structured data or the
ledger record). His own words may contain figures on a file (lagged, gated); the scan is about what the machine adds.

### 4.2 Metadata and canonical URLs
`src/modules/showcase/seo.ts` builds Next `Metadata` for each public route from its view model: `title`, `description` (his
learning objective or the fixed standfirst of an index), `alternates.canonical` (path; resolved by `metadataBase`),
`openGraph` (`type: "article"` on files, notes, process notes and cases, else `"website"`; `url`, `siteName` "Aksh Agrawal ·
Case files", `locale` `en_IN`, `publishedTime` = the IST date of the first gated revision, `modifiedTime` = the current
revision's date, `authors` ["Aksh Agrawal"]), `twitter: { card: "summary_large_image" }` (X falls back to `og:image`). The root
layout adds `alternates.types["application/rss+xml"] = "/feed.xml"`. Unknown slug: `{}` as today (the page 404s).

### 4.3 JSON-LD (D66)
One `<script type="application/ld+json">` per page, from `seo.ts` builders, serialised by one function that escapes `<`, `>`,
`&`, U+2028 and U+2029 (his titles are user text inside a script element).
- Home: `WebSite` (name, url, `inLanguage` en-IN, `publisher` Person) and `Person` ("Aksh Agrawal", url `/about`).
- Files, notes, process notes, cases: `Article` (`headline`, `description`, `datePublished`, `dateModified`, `author` Person,
  `mainEntityOfPage`, `isAccessibleForFree: true`, `inLanguage`, `version` "R{n}"); a file adds `about: { "@type":
  "Corporation", name }` (the company name only). `BreadcrumbList` on every detail page.
- Index pages: `CollectionPage`. Concept pages: `DefinedTerm` (name, url, `inDefinedTermSet` the `/concepts` URL).
- 5b adds `VideoObject` (s7.7); 5c adds `Article` for letters.
- Never: `Review`, `Rating`, `AggregateRating`, `Offer`, `FinancialProduct`, `InvestmentOrDeposit`, `price`, any numeric
  property. A test fails on any of these strings in any builder output.

### 4.4 Share cards (D72)
New `opengraph-image.tsx` for `/notes/[slug]`, `/process/[slug]`, `/cases/[slug]`, `/concepts/[slug]`, built like the file card
(`revalidate = 3600`, `generateStaticParams` returns `[]`, snapshot down gives the site card, unknown slug 404s), each from a pure
`build*Card` in `seo.ts` returning `ShareCardContent`. Note and process: tag "Learning note" / "Process note", title, objective,
footer "Revised {date}". Case: tag "Closed case", company, title, objective, footer "Written {date} · closed {Mon YYYY}", sub-line
"A past case, not a view on the share today." No figure of any kind. Concept: tag "Concept", name, the concept standfirst, the
count line already on the page. Text over the card's line budget is cut on a word boundary with "…", never re-worded.

### 4.5 Feed (D65, D68)
`GET /feed.xml` (`src/app/feed.xml/route.ts`, `revalidate = 3600`, reads `getSnapshot()` so publish and unpublish refresh it
through the same tag). RSS 2.0 with `atom:link rel="self"`; channel title "Case files · Aksh Agrawal", link the site, description
the site description, `language` en-IN, `lastBuildDate` = the newest entry's date (not "now", so an unchanged feed is
byte-identical). Items: one per gated revision of a served file, a learning note, a process note or a ledger case study (5b adds
videos, 5c letters), newest first, at most 50, built by `buildFeed(s, siteUrl)` reusing `whatChangedEntry` logic:
- `title`: a file "{Company} · File {NNN} · R{n}"; a note or process note its title; a case "{Company}: {title}".
- `link`: the page URL. `guid isPermaLink="false"`: "{path}#r{n}". `pubDate`: the revision's IST date at 00:00 +0530 (day
  precision, as the site prints dates).
- `description` (escaped text, no HTML): his change reason (or "First version."), the machine line ("Revision R3 · 4 sentences
  changed · figures to 12 Sep 2026", or for a case "Closed case · written {date}"), his learning objective, then the fixed line
  "For learning, not advice. Figures on the page are at least 30 days old." Never a fact, test reading, exhibit or scenario
  value. XML is written by a 20-line escaper (`&`, `<`, `>`, `"`, `'`, and control characters removed); no dependency.
- Snapshot unavailable: `503` with `Retry-After: 3600` (a reader keeps its last copy instead of seeing every item vanish).
- Retraction: an unpublished item leaves the feed at the next refresh; a reader that already fetched it keeps it (the same
  third-party-cache limit as in rules v1 "Retraction"; the guide says so).

### 4.6 Sitemap and robots (D67)
`src/app/sitemap.ts` (`revalidate = 3600`): `/`, `/companies`, `/notes`, `/process`, `/about` always; `/cases` and `/mistakes`
only when `hasLedgerCases`; `/concepts` only when a public concept exists (the routes 404 otherwise); every served file, note,
process note, case and concept with `lastModified` = its current revision's IST date. Snapshot unavailable: the static routes
only. `src/app/robots.ts`: on `VERCEL_ENV === "production"` allow `/`, disallow `/desk`, `/login`, `/auth`, `/api`, `/dev`,
`sitemap` = the absolute sitemap URL; on any other environment `disallow: "/"` (preview URLs are never indexed, belt and braces
over Vercel's own preview header). `VERCEL_ENV` is read through `src/lib/env.server.ts`.

## 5. Phase 5a: print and PDF (progress 5.3)
- **Public pages** (`/companies/[slug]`, `/notes/[slug]`, `/process/[slug]`, `/cases/[slug]`; 5b/5c add videos and letters)
  print as a document: `@page { size: A4; margin: 18mm 16mm }`, light theme forced, the tab bar, rail, top bar, skip link, strip
  drawer, buttons, toggles and the interactive revision diff hidden; tables and exhibits not split across pages; `details`
  blocks print their summary only; chart lines keep their colours (`print-color-adjust: exact`); links in the source list print
  their URL after the text.
- **Print masthead** (`PrintMasthead`, hidden on screen): "Aksh Agrawal · Case files", the canonical URL, then "This copy shows
  revision R{n} of {date}. Figures to {date}. The current version is at the address above." (a note has no figures-to part).
- **Disclosure in full** (`PrintDisclosure`, hidden on screen, shown at the end of every printed public page): the standard
  disclosure with the page's `holds_position` and review date (rule 5), so a PDF that travels without the site still carries it.
  On a file page, where the strip is the only on-screen disclosure (design segment 1), the printed copy has both.
- **Revision log** prints (the dated list); the sentence diff does not. A ledger case prints its entries, dates and fingerprints;
  its chart prints only when it is on the page (switch `ledger_chart`).
- **"Save as PDF"** (`PrintButton`, client, about 15 lines, `window.print()`), beside the dateline of each printable page, hidden in
  print. No new route, no server work.
- **Desk pages** (D71) print with a fixed banner repeated on every page: "Private desk copy. Not for sharing: it has not passed
  the publish gate and may show figures less than 30 days old." Printing is not blocked.
- Page numbers through `@page` margin boxes where the browser supports them; nothing depends on them.

## 6. Why 5a needs no migration
Every field it prints is already in the anon views. No new grant, no new function, no change to `publish_revision()`, no new env
(`VERCEL_ENV` is already read). At deploy: new metadata tags, a feed and sitemap listing only what is already public (in
production today: what has passed the gate), share cards for pages that already exist, print styles. Nothing becomes public
that is not public now.

## 7. Phase 5b: videos (progress 5.2)
### 7.1 The flow (one action to add)
1. Aksh uploads to YouTube as **Unlisted** (the guide says why: the desk cannot hold YouTube back, s10).
2. In the capture box: `v: https://youtu.be/<id>` (or `youtube.com/watch?v=`, `/shorts/`, `/live/`). The capture is filed as a
   private item of kind `video` titled "Video {id}" until the fetch fills the YouTube title as a suggestion (s7.6) and a
   `video_sources` row is created with the id; the pump's `videos:fetch` step reads YouTube within 15 minutes (or at once
   through `after()`).
3. The video page shows the machine's YouTube data (title, description, duration, privacy, published date) in the machine face,
   and two of his choices: "Use this title" (copies the YouTube title, his own words, into the item title on his press) and
   "Use chapters from the description" (s7.5).
4. He drops the caption file from YouTube Studio (Subtitles, the language, Download, .vtt or .srt). The transcript is stored as
   machine text and linked to the next revision on his press "Use this transcript".
5. He writes the learning objective, names a company if the video is about one (then "Figures to" is required) and publishes.
   The gate (rule 12) runs on the title, objective, his description of the video (the body), the chapters and the whole
   transcript.
6. On a pass the site lists it at `/videos/[slug]`. The desk then says: "Listed on the site. You can now make it Public on
   YouTube." He does that in YouTube Studio; the desk never touches YouTube (D73).

### 7.2 Data (migration `20261017000022_videos.sql`)
- `items_kind_check` gains `'video'`.
- `public.video_sources`: `id uuid pk`, `item_id uuid not null unique references items on delete restrict`, `youtube_id text not
  null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$')`, and machine columns, all nullable until the first fetch:
  `channel_id text`, `own_channel boolean`, `yt_title text check (length <= 100)`, `yt_description text check (length <= 5000)`,
  `duration_seconds int check (> 0)`, `privacy text check (in ('public','unlisted','private','gone'))`, `yt_published_at
  timestamptz`, `fetched_at timestamptz`, `fetch_problem text check (length <= 160)`. RLS on; admin select; admin insert of
  `(item_id, youtube_id)` only; machine columns written only by `public.record_video_fetch(...)` (security definer, service_role
  only); a trigger refuses any `authenticated` update of a machine column and any change of `youtube_id`; delete refused while
  the item is public.
- `public.video_transcripts` (append-only, `private.reject_mutation` triggers like `gate_decisions`): `id uuid pk`,
  `video_source_id uuid not null references video_sources`, `source text check (in ('captions_file'))` (5d adds `'whisper'`),
  `file_sha256 text`, `segments jsonb not null` (array of `{ "s": int seconds, "t": text }`, 1..5000 elements, each `t`
  1..500 chars), `text_sha256 text not null` (sha256 hex of the segment texts joined by `\n`, computed by SQL in the insert
  trigger, never trusted from the client), `words int`, `created_at`. RLS: admin select and insert; no update or delete.
- Revision `structured` for a video (`schema: "video/1"`): `{ youtubeId, transcriptId, transcriptSha, chapters: [{ "s": int,
  "title": text }] }`. His chapter titles (copied verbatim on his press) and the transcript reference; the transcript text itself
  is never in the revision.
- Public reads (anon): `public.public_videos` view (security_invoker): `item_id, youtube_id, duration_seconds, yt_published_at`
  for items where `private.is_public_item(...)` holds and the kind is `video`; `public.public_video_transcripts` view: `item_id,
  segments` of the transcript whose id is in the CURRENT public revision's `structured.transcriptId` (an older transcript is
  never public). Column grants only; no `channel_id`, `yt_description`, `privacy` or `fetch_problem` to anon. The anon grant
  inventory test gains exactly these two views.

### 7.3 The gate (migration `20261017000023_distribution_gate.sql`)
`publish_revision()` restated whole from 0021 with two changes: `c_policy` becomes `sebi-unreg-2026-07-v1.2` (and
`POLICY_VERSION`), and one call after the knowledge line:
```sql
-- Phase 5 (rules 12, 13; v1.2 addendum). Recorded, never raised.
v_failures := v_failures || private.distribution_gate_failures(v_item.id, v_item.kind, v_item.company_id, v_item.data_as_of,
                                                               p_revision_id, v_struct, p_lint_result);
```
`private.distribution_gate_failures` (security definer, `search_path = ''`, revoked from every API role) returns `'[]'` for
other kinds. For `video` (rule 12; codes `12.1`-`12.5`):
- 12.1 `structured.schema = 'video/1'`, its `youtubeId` equals the item's `video_sources.youtube_id`, that row has
  `own_channel = true`, `privacy in ('unlisted','public')` and `fetched_at` within the last 7 days ("Fetch it again").
- 12.2 `transcriptId` names a `video_transcripts` row of that source whose `text_sha256` equals `transcriptSha`, and
  `p_lint_result ->> 'transcriptSha'` equals it too (the lint covered exactly that text). No transcript: refused ("A video needs
  its transcript before it is listed.").
- 12.3 A video naming a company needs `data_as_of` at least 30 IST days old (the case-study rule); rule 4 and the position
  check already run for it through the ledger half (it names a company).
- 12.4 Chapters: 0 or 3..100 entries, first at 0, strictly rising, each title 1..100 chars (YouTube's own chapter rules).
- 12.5 `company_id` and `theme_id` rules as for every item (existing checks).

### 7.4 YouTube adapter (`src/lib/providers/youtube.ts`, port `VideoMetaPort`)
- One call: `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=<up to 50 ids>&key=…`
  (1 unit per call; default 10,000 units a day, verified 2026-10-15, developers.google.com/youtube/v3/determine_quota_cost).
  No other method, no POST, no OAuth. Returns per id: `found` with channel id, title, description, ISO 8601 duration
  (parsed to seconds), `status.privacyStatus`, `snippet.publishedAt`; or `missing` (deleted or private: the API returns no item).
- Never throws; typed results `ok`, `quota` (403 `quotaExceeded`: defer to tomorrow), `refused` (400/403 other: the reason
  code only), `unavailable` (5xx, timeout 10 s); the key is never in a message; the body is read capped (64 KB) with
  `readCapped`; `redirect: "error"`.
- Env (server, optional, both or neither): `YOUTUBE_API_KEY` (a key restricted to "YouTube Data API v3" in Google Cloud),
  `YOUTUBE_CHANNEL_ID` (`^UC[A-Za-z0-9_-]{22}$`). Unset: videos are "off": the desk says "Video listing is not set up yet
  (Shlok adds a YouTube key)." and capture of `v:` still files the item (nothing is lost). A fixture adapter for tests and e2e,
  refused on deployed environments like the other fixtures.
- Before coding, the implementer re-reads the YouTube API Services Developer Policies on stored data (our understanding: API
  data kept no longer than 30 days without a refresh) and records the reading in the task report; the daily `videos:check`
  refresh (s7.8) satisfies it either way.

### 7.5 Caption and chapter parsing (pure, `src/modules/distribution/videos/`)
- `parseCaptions(bytes, name)`: WebVTT or SubRip, at most 1 MB and 5,000 cues; UTF-8 with or without BOM; tags (`<c>`, `<i>`,
  `<v Name>`, `{\an8}`) and the timing-word markup of automatic captions removed; consecutive duplicate lines collapsed (automatic
  captions repeat the previous line); cues merged into segments of about 30 seconds; start times floored to whole seconds. Any
  other format, a binary file or no cue: a plain refusal ("This is not a caption file. In YouTube Studio choose Subtitles, then
  Download, then .vtt or .srt."). Never an HTML render of caption text: it is stored as text and printed escaped.
- `parseChapters(description)`: lines `[H:]MM:SS title` (YouTube's chapter format), first at 0:00, at least 3, rising; anything
  else returns none with the reason, shown to him.

### 7.6 Desk
`/desk/videos` (list: title, status line "Listed" / "Not listed: {first gate reason}" / "Waiting for YouTube" / "Public on YouTube
but not listed here", added date) and `/desk/videos/[id]` (the item page pattern): YouTube data block (machine face, labelled
"From YouTube, fetched {time}"), "Fetch again", "Use this title", chapters preview with "Use chapters from the description",
transcript drop zone and the current transcript (first 20 segments, "Show all"), "Use this transcript", the usual
objective / company / figures-to fields and the publish panel with the checklist lines of rule 12. The capture key row gains
`v:` "video". Desk home: none.

### 7.7 Public
`/videos` (index: newest first; title, objective, date, duration) and `/videos/[slug]`: title, objective as standfirst, a
click-to-load player (D79: a static thumbnail from `https://i.ytimg.com/vi/<id>/hqdefault.jpg` as a plain `img` with width and
height, a button "Play video (loads YouTube)"; on press, an iframe to `https://www.youtube-nocookie.com/embed/<id>`), chapters as
a list of times (each a link that starts the player at that second once loaded), the transcript under "Transcript" with the
fixed label (s15), the dateline and the disclosure block. `VideoObject` JSON-LD: `name`, `description` (objective),
`thumbnailUrl`, `uploadDate` (YouTube publish time), `duration` (ISO 8601), `embedUrl`, `transcript` (the joined text), and
`hasPart` `Clip` per chapter. Feed, sitemap, share card ("Video", title, objective, duration), print (transcript prints, the
player does not) all included. Both routes 404 until a video is listed (deploy state).

### 7.8 Steps
- `videos:fetch` (pump): sources with `fetched_at is null` or a "Fetch again" request, at most 50 per run, one API call.
- `videos:check` (daily): every source, in calls of 50; refreshes the machine columns; a source now `missing` is marked
  `gone` and, if listed, the desk shows "This video is no longer on YouTube. Unpublish it here." (never unpublished by the
  machine); a source `public` on YouTube whose item has no pass decision shows the warning line.
- Both write heartbeats; neither is in `HEALTH_RULES` (an optional feature must not raise the alert email); both report
  "videos off" while the env is unset. Budget: at 200 videos, about 5 units a day of 10,000.

## 8. Phase 5c: letters (progress 5.1)
### 8.1 The flow
1. Mondays (IST), when at least one public change is not in a sent letter, desk home shows "Letter: {n} changes since your last
   letter." (computed on read; no step, no stored draft; D83, D84).
2. `/desk/letters/new` lists the candidates (s8.3), each ticked; he unticks any; "Make this letter" creates a private item of
   kind `letter` with one revision: `structured` = the ticked entries (copied verbatim), body = empty.
3. On `/desk/letters/[id]` he writes the subject (the item title), the one-sentence objective (the email's preheader and the
   archive standfirst) and, optionally, a short note (the body: plain paragraphs, at most 4,000 characters). The preview shows the
   email exactly as it will arrive.
4. "Publish" runs the gate (rule 13). On a pass the letter is public at `/letters/[slug]` (the archive).
5. "Send me a test copy" (optional) sends it to `ADMIN_EMAIL` only, recorded as a send of kind `self_test`.
6. "Send to {n} subscribers" opens a dialog: the subject, the count, "This emails {n} people. An email cannot be called back.",
   a tick "I have read the preview", and "Send". The press calls `approve_letter_send()` (the audit row); the send happens within
   15 minutes (at once through `after()`). The page shows the status from the row: "Approved {time}", "Sending", "Sent to {n}
   on {time}", or the failure in plain words with "Approve again".

### 8.2 Data (migration `20261018000024_letters.sql`)
- `items_kind_check` gains `'letter'`; a check trigger: a `letter` item has no `company_id`, `theme_id` or `data_as_of`.
- `public.subscribers` (admin select only, no API write): `id uuid pk`, `email text not null unique check (email =
  lower(email) and length(email) between 6 and 254 and email ~ '^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$')`, `status text check
  (in ('waiting','sent','confirmed'))`, `requested_at`, `notice_version text not null`, `adult boolean not null check (adult)`,
  `confirm_token_hash bytea`, `confirm_sent_at`, `confirm_expires_at`, `confirmed_at`, `sends_used int default 0`. No IP, no
  name, no user agent.
- `public.subscriber_events` (append-only, admin select): `event text check (in ('requested','sent','confirmed','left',
  'erased','expired','binned'))`, `email_hmac bytea` (HMAC-SHA256 of the address with `private.settings('letters_pepper')`,
  generated in the migration with `gen_random_bytes(32)`), `notice_version`, `at`. Answers "did this address consent, and
  when?" without keeping the address after withdrawal.
- `public.letter_sends`: `id uuid pk`, `item_id`, `revision_id`, `gate_decision_id` (the pass it relied on), `kind text check
  (in ('self_test','subscribers'))`, `approved_by uuid`, `approved_at`, `recipients_at_approval int`, `status text check (in
  ('approved','sending','sent','failed','expired','cancelled'))`, `broadcast_id text`, `claimed_at`, `sent_at`, `recipients_sent
  int`, `problem text check (length <= 160)`. Partial unique index: one `subscribers` row per item that is not `failed`,
  `expired` or `cancelled`. A trigger allows only forward status changes. Admin select; no API write (functions only).
- `private.settings('letters_signup')`: `on` or absent (off). Changed only through `set_letters_signup(p_actor, p_on)`, which
  records an event.
- A trigger on `item_revisions` refuses a new revision of a `letter` item that has a `sent` subscribers send (D87).
- Functions (all `security definer`, `search_path = ''`):
  - anon and authenticated: `letters_open() returns boolean` (signup switch on AND fewer than 950 confirmed); `letters_request(
    p_email text, p_notice_version text, p_adult boolean) returns void` (normalises; refuses silently, returning nothing, when
    the switch is off, the address is malformed, `p_adult` is false, the notice version is not the current one, the address is
    already waiting or confirmed, or 100 requests were already taken today IST or 300 are waiting; records `requested`);
    `letters_confirm(p_token text) returns boolean` (hash match, not expired, status `sent` -> `confirmed`, clears the hash,
    records `confirmed`); `letters_leave(p_email text) returns void` (deletes any row for the address, records `left`; the
    same answer whether or not it existed).
  - service_role only (called after `requireAdmin()` from `src/modules/distribution/send-rpc.ts`, or from the ops steps):
    `letters_issue_confirmations(p_actor, p_ids uuid[]) returns table(id, email, token)` (admin; at most 50 per IST day
    counted across calls; generates a 32-byte token, stores its sha256, sets `confirm_sent_at` and a 7-day expiry, status
    `sent`; returns the token once); `letters_confirmation_failed(p_id)` (back to `waiting`); `letters_bin(p_actor, p_ids)`
    (deletes waiting rows, records `binned`); `letters_erase(p_actor, p_id)` (deletes any row, records `erased`);
    `letters_purge()` (deletes `waiting` older than 14 days and `sent` past expiry, records `expired`);
    `letters_mark_left(p_emails text[])` (the reconcile step erases addresses Resend reports unsubscribed, records `left`);
    `approve_letter_send(p_actor, p_item_id, p_revision_id, p_kind) returns public.letter_sends`; `claim_letter_send() returns
    public.letter_sends`; `finish_letter_send(p_id, p_status, p_broadcast_id, p_recipients, p_problem)`;
    `confirmed_subscribers() returns table(email)`; `set_letters_signup(p_actor, p_on)`.
  - The anon executable set grows by exactly the four anon functions; the pgTAP allowlist and inventory say so.

### 8.3 Candidates: "what changed since your last letter" (pure, `src/modules/distribution/letters/candidates.ts`)
- Input: the public snapshot (anon) and, read through the admin session, the pass decisions' `decided_at` per revision and the
  last `sent` subscribers letter's `sent_at` (none: the last 14 days).
- An entry is a public item (not a letter) whose current public revision became visible to the public after that time;
  visible-from = the later of its pass time and, for an item with `data_as_of`, the IST day the 30-day lag ends. Only revisions
  present in the snapshot count, so nothing private, pending or still lagged can be a candidate.
- One entry per item, at most 20, ordered files (by number), cases, notes, process notes, videos. Each entry copies, verbatim:
  `title`, `learningObjective`, `changeReason` (null allowed), and the item's `holdsPosition` and company name when it names one;
  the machine adds `kind`, `path`, `revNo` and `detail` (the `whatChangedEntry` line). It also keeps `revisionId` for the gate.
  No sentence diff, no fact, no figure, no chart (10.7).
- A test asserts byte equality of every copied field with its source and the absence of any rewording function in the module
  (no LLM, no truncation of his text: an entry too long for the email is shown whole).

### 8.4 The gate for a letter (0025 replaces `private.distribution_gate_failures` with the letter branch; rule 13)
- 13.1 Title 1..120 chars; objective required (rule 6, already); body at most 4,000 chars.
- 13.2 `structured.schema = 'letter/1'`, 1..20 entries; each `revisionId` belongs to an item that is not a letter, has a pass
  decision, and its item is currently public through `private.is_public_item(...)` with that revision current; each copied
  `title`, `learningObjective` and `changeReason` equals the live value. Otherwise "Entry {n} changed or is no longer public.
  Make the letter again." (code `13.2`).
- 13.3 Rule 4 and the position check for every company an entry names: `private.ledger_gate_item_failures(entry item, its
  company, its holds_position, today)` per entry; any failure is recorded as rule `4` naming the entry (D86).
- 13.4 A letter with a `sent` subscribers send cannot get a new revision (trigger, s8.2); unpublish stays possible.
- The lint input of a letter is its title, objective, body and `structured` (so the copied text is linted again).

### 8.5 Subscribers and consent (D88-D90, D93, D94)
- **Sign-up** (`/letters`, shown only when `letters_open()` is true): one email field, a required tick "I am 18 or older", the
  notice (s15, versioned `letters-2026-10-v1`), a honeypot field, a submit time check (at least 3 s after render, signed with the
  page's render time) and "Ask to subscribe". The answer is always "Thanks. Aksh sends confirmation emails by hand, usually
  within a day. Open the link in it to start receiving letters." (no address enumeration).
- **Confirmation** (desk `/desk/letters/readers`): "Waiting: {n}" lists the waiting addresses with their request date; "Send
  confirmation emails ({n})" (at most 50 a day; the count left is shown) and "Bin" per address or for all. Each email (plain
  text, transactional, idempotency key `confirm-{id}-{sent_at}`): what was asked, the confirm link
  `/letters/confirm?t=<token>`, "If you did not ask, ignore this email; nothing else will be sent." The confirm page shows a
  button (POST); a GET never confirms (mail scanners open links).
- **Withdrawal**: Resend's unsubscribe link in every letter (`{{{RESEND_UNSUBSCRIBE_URL}}}`, managed by Resend), and
  `/letters/leave` (one email field, "Stop my letters"; deletes at once, same answer either way). The reconcile step erases in
  our table every address Resend reports unsubscribed and deletes from Resend every contact not confirmed here, before every send
  and once a day.
- **Retention**: waiting requests 14 days, unconfirmed tokens 7 days, a confirmed address until withdrawal; then only the HMAC
  event row remains. Aksh sees the count of confirmed readers, never needs the list; "Erase an address" exists for a request
  received by email.
- **Law, as engineering defaults (not legal advice; Q41)**: DPDP Act 2023 and the DPDP Rules 2025 (notified 13-14 Nov 2025; most
  duties, including notice, consent and children's data, in force about May 2027): itemised notice before consent, a clear
  affirmative act, withdrawal as easy as giving, erasure when the purpose ends, no child's data without verifiable parental
  consent (hence the 18+ tick). CAN-SPAM-style basics: honest sender and subject, a working unsubscribe in every letter honoured
  at once, no purchased lists. No postal address (non-commercial, a student's home address; Q45).

### 8.6 Approve-to-send and sending (D91)
- `approve_letter_send(p_actor, p_item, p_revision, p_kind)`: admin actor; the item is a `letter`; the revision is its current
  revision, public, with a pass decision under the current `c_policy` taken after the revision was written; for `subscribers`:
  no live subscribers send exists for the item and none for any other item is `approved` or `sending`; for `self_test`: at most 5
  today. Inserts the row with `recipients_at_approval` (count of confirmed) and returns it.
- `letters:send` (pump step, and `after()` from the approve action): `claim_letter_send()` takes the oldest `approved` row
  (`for update skip locked`), marks rows older than 24 h `expired`, re-checks every approve condition and every 13.2/13.3 check
  (an unpublish or an entry change after approval refuses the send: `failed`, "The letter changed after you approved it."), sets
  `sending`. Then: reconcile contacts; create the broadcast as a draft (`POST /broadcasts`, `segment_id`, `from`, `subject`,
  `html`, `text`, `name` "letter-{send id}", `send: false`); record `broadcast_id`; send it (Send Broadcast endpoint); record
  `sent` with the segment's contact count. A retry finding `sending` with a `broadcast_id` reads the broadcast first and sends
  only if it is still a draft, so a crash cannot send twice. A `self_test` is one transactional email to `ADMIN_EMAIL`.
- A failure is `failed` with Resend's words cleaned (at most 160 chars, never the key); the desk offers "Approve again".
- Nothing else in the system calls the broadcast or contacts endpoints (a test scans `src/`).

### 8.7 The email (pure `renderLetter(letter, siteUrl)` returns `{ subject, html, text }`)
Subject = his title. Preheader = his objective. His note as escaped paragraphs (no links, no markup). Then per entry: the kind
label, his title linked to the page, his change reason in quotes, the machine line, "Position: {yes | no | not disclosed}" when
the entry names a company. Then the fixed footer (s15): the standard disclosure's first two sentences and "Each page states the
position in the company it discusses."; "You get this because you asked on {site} and confirmed by email."; "Unsubscribe"
(`{{{RESEND_UNSUBSCRIBE_URL}}}`); "The archive: {site}/letters". No image, no tracking pixel; open and click tracking off on the
Resend domain (Shlok's setup step; D92). HTML is a single-column table layout with inline styles, under 30 KB; the text part is
written, not generated.

### 8.8 Adapter and env (`src/lib/providers/resend-letters.ts`, ports `LetterSender` and `ContactMirror`)
Plain fetch like `resend-mailer.ts` (never throws, key never echoed, capped reads, `redirect: "error"`, 10 s timeout, idempotency
keys). Methods: `sendOne(to, subject, html, text, idempotencyKey)` (confirmations and self tests), `listContacts(segmentId)`
(paginated), `upsertContact(email, segmentId)`, `deleteContact(email)`, `createBroadcast(...)`, `getBroadcast(id)`,
`sendBroadcast(id)`. The implementer reads each endpoint's current reference page before coding (Resend renamed Audiences to
Segments in 2025; verified 2026-10-15 that `POST /broadcasts` takes `segment_id`) and records the URLs in the adapter header.
Env (server, optional): `RESEND_LETTERS_KEY` (a full-access key, separate from the alert key, which can stay sending-only),
`LETTERS_FROM` (`Aksh Agrawal <letters@{verified domain}>`), `LETTERS_SEGMENT_ID`. Letters are off unless all three are set and
`VERCEL_ENV` is `production` (or the fixture is chosen locally). Off: the desk shows "Email is not set up yet. Letters still
publish to the archive." and the sign-up form is not rendered.

### 8.9 Public
`/letters` (archive, newest first: date, subject, objective; the sign-up block when open; a "Stop my letters" link), `/letters/
[slug]` (the letter as a page: note, entries with links, the footer without the unsubscribe placeholder; "Sent to subscribers
on {date}." when sent), `/letters/confirm`, `/letters/leave`. `/letters` renders (with "No letters yet.") only when sign-up is
open or a letter is public; otherwise 404 (deploy state). Feed, sitemap, `Article` JSON-LD, share card ("Letter", subject,
objective, date), print: included.

## 9. The no-send guarantee (deploy, tests, previews)
1. **Env**: every outbound adapter factory returns null unless its own keys are set; `RESEND_LETTERS_KEY`, `LETTERS_FROM`,
   `LETTERS_SEGMENT_ID`, `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` are unset at deploy and only Shlok sets them. The letters factory
   also requires `VERCEL_ENV === "production"`, so a preview sharing the hosted database cannot send even if a key leaks into it.
2. **Database**: no broadcast without a `letter_sends` row in `approved`, written only by `approve_letter_send()` with an admin
   actor; no confirmation without `letters_issue_confirmations()` with an admin actor; the switch `letters_signup` is absent
   (off) after the migration.
3. **Code**: only `resend-letters.ts` may name `api.resend.com/broadcasts` or `/contacts`, only `youtube.ts` may name
   `googleapis.com`, and the YouTube adapter has no method but GET (`distribution.graph.test.ts`); no LLM, OCR or transcriber
   port in `src/modules/distribution/`.
4. **Tests**: adapters are tested with an injected `fetch` stub only; unit setup fails any test that reaches the global
   `fetch` for these hosts; e2e runs with `DISTRIBUTION_ADAPTER=fixture` (refused when `VERCEL_ENV` is preview or production), and
   the fixtures write to an in-memory store the e2e reads back to assert that exactly the approved emails were "sent" and none
   before the press.
5. **YouTube**: the desk never writes to YouTube; "listing" there is Aksh's own act in YouTube Studio.

## 10. Compliance treatment (summary; the rules are the v1.2 addendum)
- Rule 11 (derived surfaces) is in force with 5a as a build rule; rules 12 and 13 are in force in SQL with 0023 and 0025.
- A letter is a publication: gated like any item, rule 4 applied to every company it names, archived publicly before it is sent,
  and frozen once sent. An email cannot be retracted; the archive copy can be unpublished, and the guide says plainly that sent
  copies stay in inboxes.
- A video is a publication twice: on YouTube (outside the desk; the desk cannot stop it) and on the site (gated). The desk lints
  every word of the transcript, refuses a listing until the transcript exists, applies the lag when it names a company, and
  warns when YouTube shows the video publicly without a pass. A spoken "buy" cannot be edited out (the transcript is the
  machine's record of what was said); only a sentence allowance for rules 1 or 2 clears it, with a reason. Spoken numbers written
  out as words ("four hundred rupees") are not caught by rule 3's figure patterns: a known limit, stated in the guide.
- Rule 10.7 holds everywhere: no derived surface, letter entry or card prints a figure about a ledger case.

## 11. Free-tier ceilings and what Aksh sees
| Limit (verified 2026-10-15 unless noted) | Ceiling we set | When hit, Aksh sees | Silent failure prevented by |
|---|---|---|---|
| YouTube Data API: 10,000 units/day; `videos.list` 1 unit | at most 200 calls/day by code | "YouTube's daily limit is used up. The desk tries again tomorrow." on the video page; the step defers | `quota` result, heartbeat detail |
| Resend transactional: 100/day, 3,000/month (shared with alerts) | confirmations 50/day, self tests 5/day | "50 confirmation emails sent today. The rest can go tomorrow." | SQL day counters |
| Resend marketing: 1,000 contacts, emails not capped, 3 segments | sign-up closes itself at 950 confirmed | Desk: "The list has 950 readers, the free limit is 1,000. New sign-ups are closed." Public: the form is gone | `letters_open()` |
| Supabase 500 MB | transcripts at most 5,000 segments x 500 chars; subscribers are small | the existing database-size line | check constraints |
| Vercel Hobby non-commercial | no paid letters, no sponsors, no tip jar | n/a | review rule |
| Groq Whisper (5d only) | not used in Phase 5 | n/a | n/a |
| Snapshot unavailable | feed 503, sitemap static, cards fall back to the site card | n/a (public only) | existing loader |

## 12. Testing
- **5a unit**: every `seo.ts` builder per kind; the scan of s4.1 over all outputs on a snapshot holding a file, a note, a ledger
  case with the chart on, and a concept; JSON escaping of `</script>` and U+2028 in a title; the feed's deterministic bytes for
  a fixed snapshot, escaping, 50-item cap, guid shape, 503 on unavailable; sitemap per state; robots per `VERCEL_ENV`; card
  builders cut on a word boundary; isolation test extended (no desk module, no service or cookie client under the new files).
- **5a e2e** (seeded Kaveri file): `/feed.xml` parses in the browser's `DOMParser` and lists the file; `/sitemap.xml` and
  `/robots.txt` content; each detail page has exactly one JSON-LD script that parses; Chromium `page.pdf()` of the file page,
  text read with `unpdf` (already a dependency): the full disclosure, "Figures to", the canonical URL and "R1" present, the tab
  labels absent; a desk page printed shows the banner. Deploy state: the feed is well-formed with only seeded items.
- **5b pgTAP** (`0022_videos.test.sql`): kinds, constraints, the machine-column trigger, append-only transcripts, SQL-computed
  sha, public views (current revision only, lag, private never), anon inventory +2, every 12.x failure and the pass, policy v1.2,
  every existing gate test unchanged. **Unit**: caption parser on real-shaped automatic-caption VTT (duplicates, timing tags),
  SRT, BOM, 1 MB cap, binary refusal; chapters; adapter with stubbed fetch (shape, 50-id batching, quota, missing, key never in a
  message); steps. **E2e**: `v:` capture, fixture fetch, caption drop, publish refused without a transcript, refused with a
  flagged spoken line, passes, public page axe-clean, player loads nothing before the press, unpublish in `afterAll`.
- **5c pgTAP** (`0024_letters.test.sql`): every function's grants (anon exactly +4), request refusals and caps, token flow
  (expiry, single use, GET-free by design), leave and erase leave only HMAC events, the forward-only status trigger, approve
  refusals (not current, not public, failed decision, second send, approved elsewhere), claim expiry and re-check after unpublish,
  frozen after send, 13.2 and 13.3 failures. **Unit**: candidates (visible-from with lag; byte-identical copies; 20 cap; order),
  `renderLetter` (contains exactly the gated text and fixed copy; no UUID; placeholder present), adapter with stubbed fetch
  (every endpoint, retry reading the broadcast before sending), reconcile (erase unsubscribed, delete strays, add missing), steps
  (off when env unset; nothing sent without a claimed row). **E2e** (fixture adapter): sign-up with the switch on, waiting list,
  confirmation press, confirm page POST, letter made, publish, approve, the fixture shows one broadcast to the confirmed reader
  and nothing before the press, leave, archive page axe-clean.

## 13. Out of scope
Whisper transcripts for videos (5d, with the voice-note M-4 fix); chapters or summaries written by an LLM; editing a transcript in
the desk; any write to YouTube (upload, visibility, captions); YouTube OAuth; scheduled or automatic sends; segments or topics;
open or click tracking; a server-generated PDF; Atom or JSON Feed; IndexNow or search-engine pings (outbound); a CSP (separate
hardening task; when added it needs `frame-src https://www.youtube-nocookie.com` and `img-src https://i.ytimg.com`); paid email.

## 14. Decisions made on Shlok's behalf (cost if wrong)
| # | Decision | Rejected | Cost if wrong |
|---|---|---|---|
| D63 | Build order 5a, then 5b videos, then 5c letters; three PRs | one build; 5b = letters + videos | Letters wait about two build days (they also wait for a domain) |
| D64 | Every derived surface from the public snapshot only (rule 11) | read items in the desk and filter | A field not in the anon views cannot appear in a card or feed (intended) |
| D65 | RSS 2.0 at `/feed.xml`, one entry per gated revision, guid `{path}#r{n}`, 50 items, day dates | Atom; JSON Feed; one entry per item | Atom-only readers (rare) |
| D66 | JSON-LD: WebSite, Person, Article, CollectionPage, BreadcrumbList, DefinedTerm, VideoObject; never Review, Rating, Offer, prices | no structured data; FinancialProduct/Review types | No star snippets (intended) |
| D67 | robots: non-production disallows all; production disallows desk, login, auth, api, dev | rely on Vercel's preview header | None |
| D68 | Feed answers 503 when the snapshot is down; sitemap keeps static routes | empty feed | A reader shows an error for up to an hour |
| D69 | PDF = print stylesheet + "Save as PDF" | server Chromium; pdf-lib layout | PDFs differ slightly by browser |
| D70 | Printed public page carries masthead, canonical URL, revision and date, figures-to and the full disclosure; diff omitted | print the screen as is | Longer PDFs |
| D71 | Desk pages print with a "Private desk copy" banner; printing not blocked | block desk printing | Someone can still share a private print; the banner makes it plainly wrong |
| D72 | Share cards for notes, process, cases, concepts (5a), videos, letters (5b/5c); no figure on any card | file and site cards only | None |
| D73 | Video = item kind `video`; YouTube data in `video_sources`; the desk never writes to YouTube | OAuth to set visibility | One manual step in YouTube Studio |
| D74 | Only videos from `YOUTUBE_CHANNEL_ID` | any channel | A guest appearance cannot be listed (additive later) |
| D75 | Transcript from the Studio caption file; Whisper deferred to 5d | captions API (OAuth, 200 units); YouTube download; Whisper now | One drop per video; poor auto-captions wait for 5d |
| D76 | Transcript is machine text in its own append-only table, referenced by id and SQL hash; never edited in the desk | editable transcript in the revision | Mis-hearings stay until fixed in Studio and re-dropped |
| D77 | The gate lints the whole transcript; a flagged spoken sentence is cleared only by a rule 1/2 allowance | lint only his description | A video with a real "buy" line is never listed (intended) |
| D78 | Chapters only from his description timestamps; no LLM in Phase 5 | machine chapters | No chapters if he writes none on YouTube |
| D79 | Click-to-load player (youtube-nocookie) | iframe on load; link out only | One extra tap |
| D80 | Daily `videos:check` refresh; warns on "public on YouTube, not listed"; never unpublishes | no refresh | None (5 units/day) |
| D81 | Policy version `sebi-unreg-2026-07-v1.2` from 0023; rules 11-13 in the v1.2 addendum | keep v1.1 | One constant and one migration line |
| D82 | Letter = item kind `letter`; published (archive) before any send | separate tables and approval | Every letter is also a public page |
| D83 | No machine-drafted letter; candidates computed on read; ADR-001 s4 "draft Monday newsletter" superseded | cron writes a draft | No letter exists until he presses |
| D84 | No fixed cadence; the Monday line is a prompt; nothing public says "weekly" | weekly promise | None |
| D85 | Entries = items newly visible since the last sent letter (lag-aware), verbatim copies + a machine line, at most 20, untickable | sentence diffs in the email; AI summary | Long entries make a long email |
| D86 | Rule 4 applies to every company a letter entry names | entries exempt (already public) | An entry may have to wait up to 30 days |
| D87 | A sent letter cannot get a new revision; unpublish allowed | editable after send | Typos stay in the archive (as in the inboxes) |
| D88 | Our table is the consent record; Resend is a reconciled mirror; withdrawal by Resend's link or the site form | Resend only; single opt-in | Two stores to reconcile (done before every send and daily) |
| D89 | Confirmation emails go only when Aksh presses "Send confirmation emails" | automatic on sign-up | A subscriber waits up to a day; switching to automatic is one step and Q41 |
| D90 | Separate `RESEND_LETTERS_KEY`, `LETTERS_FROM`, `LETTERS_SEGMENT_ID`; production only | reuse `RESEND_API_KEY` | One more secret |
| D91 | `approve_letter_send()` is the audit row; send within 24 h or expire; draft-then-send with a read-before-retry | send inside the request | An approval left a day must be pressed again |
| D92 | No images, pixels, open or click tracking | Resend tracking on | No open rates |
| D93 | Ceilings: 50 confirmations/day, 5 self tests/day, sign-up closes at 950 readers | vendor limits as is | A burst waits a day; list stops at 950 |
| D94 | No postal address in the footer | Aksh's address | One footer line if Q45 says otherwise |
| D95 | 18+ tick required to subscribe | age-blind; parental consent flow | Some student readers excluded |
| D96 | New anon functions (`letters_open`, `letters_request`, `letters_confirm`, `letters_leave`) with SQL caps, not a public use of the service client | service client in a public action | Bots can fill the waiting list up to 100/day (binned in one press; nothing is sent) |
| D97 | Model per task as in the plan; opus builds the four migrations and the Resend adapter; one opus final review per PR | sonnet migrations with opus review | Higher token cost on four tasks |

## 15. Copy (rendered, not typed; every string pending Shlok's approval)
5a: button "Save as PDF"; masthead "This copy shows revision R{n} of {date}. Figures to {date}. The current version is at the
address above."; desk print banner "Private desk copy. Not for sharing: it has not passed the publish gate and may show figures
less than 30 days old."; feed fixed line "For learning, not advice. Figures on the page are at least 30 days old."; case card
sub-line "A past case, not a view on the share today." (already approved wording from rule 10); card tags "Learning note",
"Process note", "Closed case", "Concept".
5b: key row `v:` "video"; "From YouTube, fetched {time}"; "Fetch again"; "Use this title"; "Use chapters from the description";
"Drop the caption file from YouTube Studio (.vtt or .srt)."; "Use this transcript"; checklist "A video needs its transcript before
it is listed.", "YouTube data is more than 7 days old. Fetch it again.", "This video is private or gone on YouTube.", "This video
is not from your channel."; after a pass "Listed on the site. You can now make it Public on YouTube."; warnings "This video is
Public on YouTube but not listed here. Check it before sharing.", "This video is no longer on YouTube. Unpublish it here.";
off "Video listing is not set up yet (Shlok adds a YouTube key)."; quota "YouTube's daily limit is used up. The desk tries again
tomorrow."; public "Play video (loads YouTube)", "Chapters", "Transcript", label "Typed by machine from the video's captions and
not edited. If it differs from the video, the video is the record."
5c: desk "Letter: {n} changes since your last letter."; "Make this letter"; "Subject"; "One sentence: what a reader learns";
"A short note (optional)"; "Send me a test copy"; "Send to {n} subscribers"; dialog "This emails {n} people. An email cannot be
called back.", "I have read the preview", "Send"; statuses "Approved {time}", "Sending", "Sent to {n} on {date}", "Not sent:
{reason}", "Approve again", "The letter changed after you approved it."; readers "Waiting: {n}", "Send confirmation emails
({n})", "Bin", "{n} readers", "Erase an address", "50 confirmation emails sent today. The rest can go tomorrow.", "Sign-ups
open" / "Sign-ups closed"; off "Email is not set up yet. Letters still publish to the archive."
Public sign-up notice (`letters-2026-10-v1`): "Get an email when Aksh publishes a letter about what changed on this site. We keep
only your email address, and only to send these letters. It is sent through Resend, an email service in the United States. You
can stop at any time with the link in every letter or on this page; we then delete your address. You must be 18 or older."
Field "Email", tick "I am 18 or older", button "Ask to subscribe", answer "Thanks. Aksh sends confirmation emails by hand,
usually within a day. Open the link in it to start receiving letters."; confirm page "Confirm your subscription", button "Yes,
send me the letters", done "You will get the next letter.", expired "This link has expired. Ask again on the letters page.";
leave page "Stop my letters", button "Stop", answer "Done. If a letter was already on its way, it may still arrive."; email
footer "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Each page states
the position in the company it discusses." / "You get this because you asked on {site} and confirmed by email." / "Unsubscribe";
confirmation email subject "Confirm your letters from Aksh Agrawal", body "Someone, probably you, asked to get letters from
{site}. To confirm, open: {link} (valid for 7 days). If you did not ask, ignore this email; nothing else will be sent."; archive
"Sent to subscribers on {date}."; empty "No letters yet."

## 16. Tradeoffs, risks, future evolution
**Tradeoffs.** Browser PDFs over server PDFs (no control over the exact output, no cost). Videos need two of his acts outside
the desk (upload Unlisted, later set Public) because the desk refuses to hold Google credentials. Letters cost Aksh a press per
confirmation batch and per send; that is the price of "nothing leaves without a person".
**Risks.** (1) A video is reachable on YouTube before the gate; the desk can only warn (Q44). (2) Automatic captions mis-hear
words; rule 1 false positives need allowances, false negatives ("by" heard for "buy" is the safe direction) are possible.
(3) Resend's contacts and our table can drift between reconciles; a reader who unsubscribed by Resend's link is never emailed
by Resend, so the drift costs only our record's freshness (at most a day). (4) Third-party caches (feed readers, social
previews, inboxes) keep what was public; documented, not solvable. (5) Vendor APIs change: every adapter re-reads its reference
pages before coding and keeps them in its header.
**Future evolution.** 5d Whisper on the audio file through the existing voice pipeline; automatic confirmations if Q41 says so;
a CSP; IndexNow when outbound pings are acceptable; segments for "files only" readers; a paid Resend plan past 950 readers
(non-commercial use of Vercel unchanged).

## Why this impresses an allocator
**5a.** An allocator forwards things. A file that prints as a clean, dated document with its revision number, its figures-to
date, its source list and the full disclosure on the last page is something a CIO can put in a meeting pack, and it says the
analyst expects his work to be read on paper and checked later. The feed and the typed pages do the quiet part: each entry is
"Revision R3, 4 sentences changed, figures to 12 September", which is a public cadence of revisions rather than a stream of
opinions.
**5b.** A video is where most finfluencers fail compliance. Here every listed video has a full transcript a reader can skim in a
minute, chapters he wrote, the same disclosure and lag as his files, and a desk that refused to list it until every spoken
sentence passed the same rules as his written ones. That is a control an AMC's own compliance team would recognise.
**5c.** The letter contains nothing new: only his own titles and reasons for pages that already passed the gate, sent when he
presses, archived in public before it goes out, and frozen once sent. An allocator reading a year of the archive sees exactly
what a subscriber saw, with dates, which is the opposite of a newsletter that can be quietly rewritten.

## Amendment 2026-10-16 (5a as built)
Written after the Part 5a review (`.superpowers/sdd/2026-10-16-phase-5a-ledger/review.md`). Where this section and s4 to s6 disagree,
this section describes the build and the reason is given. Append only.

- **(a) A note's masthead prints "Figures to" when the note has a `dataAsOf`** (`src/app/(public)/notes/[slug]/page.tsx`). s5 says a
  note has none. Rule 11.4 asks every printed copy to say how current its figures are, so the build keeps the date when there is one.
- **(b) An open `details` prints whole; a closed one prints its summary only** (`src/app/print.css`). s5 says summary only. A reader
  who opened a block wants it on paper, and a closed one never showed its text on screen.
- **(c) The print-only disclosure is not doubled.** s5 says a file prints both the Disclosure block and the print-only copy. Where the
  screen already shows the Disclosure block (a file, a closed case, a note that names a company), that block prints and no second
  copy is rendered. `PrintDisclosure` renders only on pages that show the short strip alone.
- **(d) `/about` is typed `AboutPage`, not `CollectionPage`** in JSON-LD. The page is one document, not a list.
- **(e) The private-copy banner lives in `DeskShell`**, not `src/app/desk/layout.tsx`. `DeskShell` wraps every desk route, so the
  banner reaches the same pages; the margin box that repeats it is in `print.css` (see technical debt, 2026-10-16).
- **(f) `src/app/robots.ts` is `force-dynamic`** (controller addition 1). It answers from `VERCEL_ENV` at request time so a preview
  deployment disallows crawling without a rebuild. It is the only derived route that reads the server env, and a test pins that.
- **(g) The feed builder is `feedEntries` plus `renderRss`**, not `buildFeed`. The first lists the served revisions and the ledger
  cases (each re-checked against the 30-day lag); the second writes the XML.
- **(h) s4.3, "never any numeric property", gains one exception:** the integer `position` of the `ListItem` entries of a
  `BreadcrumbList`, which schema.org requires. `seo.test.ts` walks every JSON-LD node of every route and fails on any other number.
- **(i) s5 and rule 11.4, the outcome for pages that name no one security.** Every printed public page carries the standard
  disclosure in full, with one exception that is not an exception to the text: `/about` already shows it on screen. The register,
  the other index pages, a concept page and a note that names no company now print it too. On those pages the position line reads
  "Position in the security discussed: stated on each file." (`SITE_POSITION`, the wording `/about` already prints). The value
  "Not disclosed" is kept for a page about a security whose position he has not stated; it is no longer used for a page that names
  none. This is not a new string; the earlier "Not disclosed for a note without a company" proposal is withdrawn.
- **(j) Share cards (s4.4):** the file card now cuts company and learning objective on a word boundary with "…", with the same slot
  budgets as the other four cards (72 and 120 characters), so all five cards follow s4.4.
- **(k) Retraction (rule 11.5) has its own proof.** `e2e/cases.spec.ts` unpublishes a case and checks that the feed, the sitemap
  and the case's share card no longer serve it; the unit tests for the feed and the sitemap pin that both read the shared snapshot
  and keep no cache of their own. The isolation test now walks the public pages and the print components as well as the derived routes.
- **(l) XML text (s4.2):** `escapeXml` also drops U+FFFE and U+FFFF, which XML 1.0 forbids, so one stray character cannot make the
  whole feed unreadable.

## Amendment 2026-10-16 (5b Task 8 as built)
Written with the video screens. Where this section and s7 disagree, this section describes the build and gives the reason. Append only.

- **(m) s4.3, "never any numeric property", gains a second exception:** `Clip.startOffset`, the whole second at which one of his chapters
  starts, on the `hasPart` of a `VideoObject` (s7.7 asks for a `Clip` per chapter and schema.org requires the number). It is his chapter
  list, not a figure. `derived.video.test.ts` walks the `VideoObject` and fails on any other number than a breadcrumb position and a `Clip`'s
  `startOffset`.
- **(n) The transcript is not in the snapshot.** s2 and the plan say the snapshot gains `videoTranscripts` as `concepts` did. Next's data
  cache holds an entry of at most 2 MB (`unstable_cache` refuses a larger one, silently), one snapshot holds every public page, and an hour of
  speech is about 60 KB, so a library of videos would push the snapshot over. The snapshot gains `videos` (four small columns of
  `public_videos`); the video page reads its own transcript from `public_video_transcripts` through a second cached read with the same
  tag (`getVideoTranscript`), and shows it only if the sha-256 of its texts equals the `transcriptSha` the current revision names (the value
  gate rule 12.2 compared). A transcript that does not match throws at runtime, so the last good page stays, and counts as none at build time.
  Because the feed, the sitemap, the card and What changed need no transcript, they are built from the snapshot alone, as rule 11 asks. Only
  `VideoObject.transcript` takes it, as a second argument of `jsonLdFor`.
- **(o) A video item is public only with a `public_videos` row.** `ITEM_KINDS` already includes `video` (Task 7), so `repo.ts` would admit a
  video item by its kind alone. `loadSnapshot` now drops every video item, and every revision of it, that has no row in `public_videos` (or
  when that view cannot be read), and `listedVideos` re-checks the row, the id, the record schema and that the record names the row's YouTube
  id. A video that fails any of these appears in no page, feed entry, sitemap line or card.
- **(p) `modules/distribution/public.ts` restates the `Segment` type** instead of importing it from `videos/types.ts`, so that the only file of
  the module the public side reaches is `public.ts` itself (`isolation.test.ts` pins this). It also gains `watchUrl`, the ordinary YouTube link
  a chapter is before the page's script runs.
- **(q) `/desk/items/[id]` redirects a video to `/desk/videos/[id]`.** Both are one `ItemView`; the second adds the video panels and the rule 12
  rows. `saveCaseFileRevisionAction` and the other actions that return to the item page keep working through the redirect, which carries the
  message in the query. The "Create item" kind list no longer offers `video` (a video is filed from its link with `v:`, which also creates its
  YouTube row).
- **(r) The public rail shows "Videos" only once a video is listed** (`SiteCounts.videos` is absent before), so the deploy state links to
  nothing that is a 404. There is no phone tab.
