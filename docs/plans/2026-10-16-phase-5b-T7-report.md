# Phase 5b Task 7 report: YouTube adapter, `distribution/videos`, parsers, steps, lint input, `v:`

Built 2026-10-16 by desk-backend on branch `phase-5b-videos` (from `a157fdc`). Local only: nothing pushed, no migration, no real
outbound call, `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` unset everywhere. Review is folded into Task 9. Commits: `2ed6925` (the build);
this report is the next commit.

## What was built (paths under `src/`)
- **Port and adapters** (`lib/providers/`)
  - `video-meta.ts`: `VideoMetaPort { name, ownChannelId, fetch(ids) }` and the four typed results (`ok`, `quota`, `refused`, `unavailable`).
    The one addition to the brief's interface is `ownChannelId`, so a step can say whether a video is from his channel without reading the env.
  - `youtube.ts`: `videos.list` by key, GET only, batches of 50, ids validated before they reach an address, `redirect: "error"`,
    `cache: "no-store"`, 10 s per call, `readCapped`, a partial-response `fields` parameter. Every result is typed; none holds the key, the
    address or YouTube's message (a `refused` carries a reason token of at most 64 letters, else `http_<status>`).
  - `fixture-video-meta.ts`: in-memory; the id's first letters pick the case (`missing...`, `other...`, `private...`, `public...`).
  - `index.ts` `createVideoMetaPort(env)`: null unless both settings are set; the fixture when `DISTRIBUTION_ADAPTER=fixture`, refused on
    preview and production (it then returns null, never the real adapter); a malformed setting throws naming the setting only.
  - `env.server.ts` and `.env.example`: `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` (`^UC[A-Za-z0-9_-]{22}$`), `DISTRIBUTION_ADAPTER` (`fixture`
    only), labelled `[OPTIONAL-P5]`. `vitest.config.mts` + `test/no-outbound.ts`: a unit test that reaches the global `fetch` for
    `googleapis.com` or `api.resend.com` fails (spec s9.4).
- **`modules/distribution/`**
  - `videos/youtube-url.ts`, `captions.ts`, `chapters.ts`: pure parsers (spec s7.5). `types.ts`, `structured.ts` (the `video/1` record,
    always with a `chapters` array), `hash.ts` (text and file sha256, word count; test vectors from the Task 6 report pass).
  - `videos/repo.ts` (admin session, RLS), `service.ts` (`addTranscript`, `applyTranscript`, `applyTitle`, `applyChapters`), `fetch.ts`
    (the step logic with the port and store injected), `filing.ts` (what the capture module gets handed to file a `v:`), `errors.ts`.
  - `actions.ts`: `addTranscriptAction(itemId, formData)` (the file is the `file` field; Next's own 1 MB body cap on server actions is
    tighter than the parser's 1 MB), `useTranscriptAction`, `useTitleAction`, `useChaptersAction`, `fetchAgainAction`. Each starts with
    `requireAdmin()`.
  - `index.ts` (server), `client.ts` (pure: `parseYoutubeUrl`, `parseChapters`), `public.ts` (pure renderers for Task 8: thumbnail and embed
    addresses, `formatClock`, `isoDuration`, `transcriptPlainText`; reaches nothing). `distribution.graph.test.ts`.
  - The service functions are `apply*`, not `use*`: the React hooks lint rule reads any `useX` call in a helper as a hook call. The action
    names are the spec's.
- **`modules/ops/video-steps.ts`**: `videos:fetch` (`SERVER_PUMP_STEPS`, just before `alerts:email`) and `videos:check`
  (`SERVER_DAILY_STEPS`, just before `alerts:email`), the Supabase-backed store (reads `video_sources` and `items.status`; writes only
  through `record_video_fetch`), `runVideoFetchNow` (exported from `ops/jobs`). Both steps answer `videos off` while the env is unset
  and touch no database then. Neither is in `HEALTH_RULES`.
- **Capture**: `parse.ts` (`v:` kind `video`, `[tlprv]`), `service.ts` (`fileVideo`), `messages.ts` (filing error `not-youtube-link`:
  "That is not a YouTube link."), `compose.ts` (receipt label "Video, private", the same warning before he saves, `v:` key token),
  `actions.ts` (builds the filing from distribution; the service itself imports none of it, see Deviations 4).
- **Compliance**: `rules.ts` (`LINT_FIELDS` gains `transcript`; `LintInput.transcript: string | null`; `LintResult.transcriptSha?`),
  `lint.ts` (every sentence of the transcript is linted, the machine keys of a video's record are not, his chapter titles are; the result
  carries `transcriptSha` = sha256 of exactly the linted text), `hash.ts` (`textSha256`), `repo.ts` (`PublishContext.transcript`, loaded for a
  video revision only, only if it is that item's own video's), `lint-input.ts`, `policy.ts` (`RULE_TITLES["12"]` = "Rule 12: videos").
  `research/schema.ts`: `ITEM_KINDS` gains `video`.
- **Desk-side one-liners forced by the types** (no screen designed): `components/desk/private/gate-decision.tsx` (field label
  "Transcript"), `today-list.tsx` (kind word "video").
- **Messages**: `lib/messages.ts` and `lib/message-codes.ts` (9 error codes, 7 notices); `eslint.config.mjs` allows
  `@/modules/distribution/public` as an entry; `lib/json-equal.ts` (moved from `cases`, which re-exports it).

## Binding items from the Task 6 report
1. **Rule 12 texts.** Failures are `rule '12'` with codes `12.1`-`12.4`; `RULE_TITLES["12"]` is added. The desk shows the sentence the
   database recorded (`decisionFromRow` falls back to `message`), because one code carries several sentences (12.1 has five), so a
   code-to-text map would collapse them. `compliance/decision.video.test.ts` pins all ten sentences and that a lint finding on the
   transcript is shown beside a rule 12 refusal. The ten sentences are listed under New strings; Q47 covers their approval.
2. **"Fetch again".** No column and no migration. The jobs table cannot hold a video fetch (`jobs.document_id` is required, `jobs.kind` allows
   only `ingest_pdf`), so the button runs the pump's own fetch for that one video in the press, single-flight, with a heartbeat (the
   `runLedgerNow` pattern). Admin only; a second press while one runs is told so; a repeat is harmless. Logged as **Q48**. Tests:
   `ops/video-steps.test.ts` (single flight, frees on failure, off) and `distribution/actions.test.ts` (admin, off, quota, busy, failure).
3. **Segments and `chapters`.** `parseCaptions` emits only `{s, t}`, starts never go back (clamped), each text 1 to 500 characters (a long
   line is cut at a word, else at 500), at most 5,000 segments. `nextVideoStructured` always writes `chapters` (from an empty or damaged
   record too) and writes only the schema's own keys.
4. **Machine data and his words.** YouTube's title and description exist only in `video_sources`. They reach his item only on his press
   (`applyTitle` copies the title; `applyChapters` copies chapter lines exactly as typed after the time, refusing a title over 100
   characters instead of cutting it). No revision `structured` holds a YouTube field (tested). The transcript is never edited anywhere:
   there is no edit action, and `addTranscript` stores what the parser returns.

## Reading of YouTube's pages (before coding, 2026-10-16)
- <https://developers.google.com/youtube/v3/docs/videos/list>: `GET /youtube/v3/videos`, `part` required, exactly one of
  `chart`/`id`/`myRating`, `id` a comma-separated list, 1 quota unit a call, a 404 `videoNotFound`. The page states no maximum number of ids
  (the spec's 50 is kept) and does not say whether a deleted or private video is left out of `items`; the adapter treats an id not returned as
  `missing`, and a `videoNotFound` 404 as every id missing.
- <https://developers.google.com/youtube/terms/developer-policies> (updated 2026-10-15), III.E.4: data fetched with a key only is
  Non-Authorized Data: stored for no more than 30 calendar days, then deleted or refreshed, and kept consistent with YouTube's current
  data. The daily `videos:check` refreshes every source, so nothing outlives 30 days while a key is set. If the key is removed the stored
  rows would age past 30 days with no purge: **Q51**.

## Deviations (conservative; for the Task 9 review)
1. **"Fetch again" is run-now, not queued** (Q48, above).
2. **Response cap 512 KB, not 64 KB** (Q50): 50 descriptions of up to 5,000 characters are about 250 KB. A `fields` parameter trims the answer.
3. **Rule 1 allowances only** (Q49): addendum 12.2 says "rule 1 or 2"; the gate and `add_lint_allowance()` honour rule 1 only. A spoken
   buy is cleared by an allowance with a reason; a spoken performance claim (rule 2) can only be cleared by not listing the video.
4. **Compliance reads the transcript with two plain queries, not through `@/modules/distribution`**, and the capture service takes the
   video filing as an argument. `showcase/isolation.test.ts` (Phase 5a) forbids the public pages from reaching anything of distribution but
   `public.ts`, and they reach `@/modules/compliance` and `@/modules/capture` through their indexes. The test is unchanged and passes.
5. **`addTranscriptAction(itemId, formData)`**, not `(itemId, file)`: a server action can only receive a file inside `FormData`.
6. **Nothing is done "at once through `after()`"** on a `v:` capture (spec s7.1): the pump fetches within 15 minutes, and "Fetch again"
   is there for the impatient. Say if the `after()` call is wanted.
7. **The check step's "Public on YouTube but not listed" count** uses `items.status = 'published'` (the secret-key client may read
   `status`, not `visibility`). The desk (Task 8) decides the warning line from its own session.
8. **defenso `guard_code` was not run**: this session has no `mcp__defenso__*` tool. Manual review instead: the service client is created
   only in `ops/video-steps.ts` (lint forbids it elsewhere and the graph test checks distribution reaches neither it nor the server env); the
   key is read only through `serverEnv()`; every action starts with `requireAdmin()`; a crafted post cannot put text on screen (fixed codes);
   a caption file is parsed to `{s, t}` text and never rendered as markup; the adapter has no method but GET, no `body`, no `Authorization`
   (checked by the graph test); heartbeat details are counts and fixed words only; the transcript query is tied to the item's own source.

## New strings (pending Shlok's approval; Q47 and spec s15 already list the rest)
- **Gate sentences recorded by the database (rule 12):** "This video is not from your channel."; "YouTube data is more than 7 days old. Fetch
  it again."; "This video is private or gone on YouTube."; "A video needs its transcript before it is listed." (these four are spec s15);
  "This revision does not match the video's YouTube link."; "YouTube data has not been fetched yet."; "The transcript in this revision does not
  match the stored transcript."; "The lint did not check this transcript."; "A video that names a company needs a figures-to date at least 30
  days old."; "Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters."
- **Rule title and labels:** "Rule 12: videos"; field label "Transcript"; receipt "Video, private"; kind word "video".
- **Errors (`lib/messages.ts`):** "This video could not be found."; "Video listing is not set up yet (Shlok adds a YouTube key)." (s15);
  "There is no transcript yet. Drop the caption file from YouTube Studio first."; "YouTube has not answered for this video yet. Fetch again
  first."; "The YouTube description has no chapter list that YouTube would accept: at least 3 lines that start with a time, the first at 0:00.";
  "This is not a caption file. In YouTube Studio choose Subtitles, then Download, then .vtt or .srt." (s7.5); "This file is too big for a
  caption file (1 MB at most)."; "This caption file is too long (5,000 cues at most)."; "A fetch is already running. Wait for it to finish,
  then reload this page."; capture: "That is not a YouTube link." (s7.1).
- **Notices:** "Transcript stored. Use it to put it in the next revision."; "Transcript added to a new revision. Run the publishing gate again.";
  "Title set from YouTube. Run the publishing gate again."; "Chapters set from the description. Run the publishing gate again."; "YouTube was
  asked again. The data below is what it answered."; "Nothing changed: this video already has that."; "YouTube's daily limit is used up. The desk
  tries again tomorrow." (s15).
- **Change reasons (they publish with the revision):** "Transcript set from the caption file."; "Title set from the YouTube title."; "Chapters set from the YouTube description."
- **Chapter refusals shown to him:** "YouTube chapters need at least 3 lines that start with a time."; "The first chapter must start at 0:00.";
  "Chapter times must rise."; "A chapter title is longer than 100 characters."; "A video can have at most 100 chapters."
- **Heartbeat details (desk heartbeat log):** "videos off"; "nothing to fetch"; "nothing to check"; "fetched n, gone g"; "checked n, gone g, public
  on YouTube but not listed p"; "deferred: YouTube's daily limit is used up"; "stopped early: out of time"; "YouTube refused the request
  (code)"; "YouTube could not be reached"; "n could not be stored"; "no such video".

## Verification
- Seen to fail before the code existed (module missing, or 3 to 12 assertions failing): the URL parser, the caption and chapter parsers, the
  adapter, the fixture and the factory, `structured` and `hash`, the transcript lint, the transcript load in the compliance repo, and the
  `v:` parse and capture filing. Written together with, or run only after, their code: the env additions, `test/no-outbound.ts`, the videos
  repo, `fetch`, the services, the steps, the actions, `public.ts`, the graph test, and the `decision`, `publish` and `compose` video tests
  (each of those then failed once on a mistake of mine in the test or the code, which was fixed). The reviewer should read those as written
  after the fact.
- `rtk pnpm test`: 418 files, 5,751 tests passed (Task 6 ended at 396 files, 5,472). `pnpm typecheck` and `rtk pnpm lint`: no errors, no warnings.
  `rtk pnpm build` (with the CI placeholder env, no YouTube settings) passed, and `pnpm check:bundles` passed (50 routes). No SQL changed, so `pnpm supabase test db` was not run again (Task 6: 32 files, 2430 tests).
- `showcase/isolation.test.ts` and the Phase 5a/4/3b tests pass unchanged; the only edited existing tests are the ones that list step names
  (`ops/drain.test.ts`, `app/api/clocks.test.ts`) and the 14 test files that build a `LintInput` or `PublishContext` literal (one line each:
  `transcript: null`).

## For Task 8
- `distribution/client.ts` and `public.ts` are the browser and public entries; `index.ts` is the desk's.
- Screens bind `addTranscriptAction.bind(null, itemId)` as a form action with an `<input type="file" name="file" accept=".vtt,.srt">`.
- `loadVideo` data for the desk page: `createSupabaseVideosRepo(db).findByItem(itemId)` and `.latestTranscript(source.id)`; the preview of
  chapters is `parseChapters(source.ytDescription)` (client-safe).
- `src/modules/showcase/repo.ts` still derives its public kinds from `ITEM_KINDS`, so it now includes `video`. That is safe until a video
  can pass the gate (it needs a key, a fetch and a transcript), and Task 8 adds the public views; it is noted here because Task 7 may not
  touch a public file.

## Concerns
- The gate, `public_videos` and the loader are live in the database before Task 8: a video cannot pass 12.1 without a real fetch, so
  nothing becomes public by accident, but Task 8 should land before the key is ever set.
- Q49 (rule 2 allowances) and Q51 (30-day purge) need an answer before a real key is set.
