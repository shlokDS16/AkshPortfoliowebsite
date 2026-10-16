# Phase 5b Task 8 report: video screens (desk and public) and their derived surfaces

Built 2026-10-16 by desk-ui on branch `phase-5b-videos` (from `f0d8142`). Local only: nothing pushed, no real YouTube call (fixtures and SQL
seeds only; `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` unset everywhere). No options round (delegated). Review is folded into Task 9.
Design choices are in `docs/design/decisions.md` ("Plan 5b Task 8"); spec changes are the new "Amendment 2026-10-16 (5b Task 8 as built)", (m) to (r).

## What was built (paths under `src/`)
- **Snapshot (`modules/showcase`)**
  - `types.ts`, `repo.ts`: `PublicVideoRow`, `listVideos()` (optional load, D60: a failed read is none and logs only the code), `videoTranscript(itemId)`, the two column
    lists (`VIDEO_COLUMNS` = `item_id, youtube_id, duration_seconds, yt_published_at`; `VIDEO_TRANSCRIPT_COLUMNS` = `item_id, segments`), and `listedItemsOnly`.
  - `video-list.ts` (`listedVideos`, `videoHref`), `videos.ts` (summaries, page model, transcript lines, `transcriptKey`), `video-transcript.ts` (sha check), `queries.ts`
    (`getVideoTranscript`; snapshot cache key bumped to v4).
  - `seo.ts` (routes `videos` and `video`, `VideoObject` with `Clip` parts, sitemap, `videoCard`), `site.ts` (What changed and the feed through `describeRevision`;
    `counts.videos` only when one is listed), `feed.ts` is unchanged (it reads `describeRevision`).
- **Public screens**: `app/(public)/videos/page.tsx`, `[slug]/page.tsx`, `[slug]/opengraph-image.tsx`; `components/desk/video-article.tsx`, `video-index.tsx`,
  `video-transcript.tsx`, `video-player.tsx` (the one client file); `desk-rail.tsx` gains "Videos" (only once one is listed); `view-types.ts` gains `videos`.
- **Desk screens**: `app/desk/videos/page.tsx` (list), `videos/[id]/page.tsx` and `extras.tsx`; `components/desk/private/videos/` (`video-list`, `video-status-line`,
  `youtube-block`, `caption-drop`, `transcript-preview`, `chapters-preview`); `items/[id]/item-view.tsx` (the item page, extracted so both routes share it; `items/[id]/page.tsx`
  is now 12 lines and sends a video to `/desk/videos/[id]` with its message); `modules/distribution/videos/status.ts` (rule 12 rows and the status line) and `list.ts`
  (four reads for the list); `modules/ops/video-steps.ts` gains `videoListingOn()` (exported from `ops/jobs`); `grammar-key-row.tsx`, `capture-bar.tsx` (`v:`);
  `desk-tabs.tsx` (Items stays current on `/desk/videos`); `/desk/items` links to Videos and no longer offers `video` in its Create list.
- **Tests added**: `repo.videos`, `videos`, `video-transcript`, `derived.video`, `isolation.videos` (showcase); `public` (watchUrl), `status`, `list`, `structured` (distribution);
  `video-listing-on` (ops); `video-player`, `video-article`, `desk-rail.videos`, `private/videos/videos` (components); `(public)/videos/pages` (pages and card).
  `e2e/desk-a11y.spec.ts` now scans `/desk/videos` in both themes at both widths.

## The four binding items from the Task 6 and 7 reports
1. **Public kinds.** `repo.ts` admits `video` by kind (it derives from `ITEM_KINDS`), so `loadSnapshot` now drops every video item, and every revision of it, that has no row in
   `public_videos` or when that view cannot be read (`listedItemsOnly`; tests in `repo.videos.test.ts`). `listedVideos` re-checks: row present, id is eleven safe characters,
   the revision's record is `video/1` and names the same id. Only the current gate-passed revision is rendered, through `public_items`, `public_videos` and
   `public_video_transcripts`.
2. **Derived surfaces.** A listed video is in the sitemap (`/videos` and its page, dated by its current revision's IST date), the feed (one entry per gated revision, guid
   `/videos/{slug}#r{n}`), What changed, the metadata, `VideoObject` JSON-LD and the share card; an unlisted or unpublished one is in none (tests build each with `videos: []`
   and with the item removed). No channel, YouTube description, privacy state or fetch problem is a field of the snapshot or a column the read names. `isolation.videos.test.ts`
   fails on any of those names in any file the public pages, the feed, the sitemap or the layout reach, except two files named in the test (the compliance repository and a doc
   comment in the capture service, both reached only through barrels).
3. **Embed.** The spec allows it (s7.7, D79), so: a plain `img` thumbnail, a button "Play video (loads YouTube)", and on the press one `youtube-nocookie.com` frame. Verified in
   a real browser (below): no request to `youtube-nocookie.com` before the press, exactly one after. No script from anyone on any page (the isolation test fails on `next/script`,
   `iframe_api` or a `<script src>`); the index loads nothing from YouTube; a page with no video holds nothing of YouTube's.
4. **Isolation.** Public files import `@/modules/distribution/public` only (the test pins both the import specifiers and that `public.ts` is the one file of the module reached). To make
   that true, `public.ts` now restates the `Segment` type instead of importing `videos/types` (spec (p)).

## Deviations from the plan (conservative; for the Task 9 review)
1. **Transcripts are not in the snapshot** (spec (n)). The plan says the snapshot gains `videoTranscripts`. Next's data cache refuses an entry over 2 MB, one snapshot feeds every public
   page, and an hour of speech is about 60 KB, so a library of videos would silently stop the snapshot caching. The video page reads its own transcript by a second cached read with the
   same tag and shows it only if the sha-256 of its texts equals the `transcriptSha` the current revision names; a mismatch throws (the last good page stays), or is none at build time.
   The feed, sitemap, card and What changed need no transcript. `VideoObject.transcript` takes it through a fifth argument of `jsonLdFor`.
2. **`Clip.startOffset` is a number** (spec (m)). s4.3, as amended, allows no numeric property but a breadcrumb position; s7.7 asks for a `Clip` per chapter, which needs one.
   The test allows exactly that one and fails on any other number.
3. **`/desk/items/[id]` redirects a video to `/desk/videos/[id]`** (spec (q)) rather than building a second editor; the actions that return to the item page keep working.
4. **No `/dev/preview` entry**; the screens were verified with real seeded data instead (below).
5. **Test-after-code**: `video-transcript.ts` and its test, and `public.ts` `watchUrl`, were written together; everything else was seen to fail first (repo, view model, derived surfaces,
   player, article, status, list, pages, isolation).

## New strings (pending Shlok's approval; spec s15 already lists the rest, and the T6 and T7 reports list the gate sentences)
- **Public**: tag "VIDEO"; index title "Videos"; index description "Videos by Aksh Agrawal, each with its chapters and a transcript of what is said. For learning, not advice.";
  dateline "Revised {date} · first written {date} · R{n} of {m} · {length} · Uploaded {date}"; list line "Revised {date} · {length}"; What changed and feed detail "Video · R{n}";
  card tag "Video" and "{length} · Revised {date}"; frame title "{title} (YouTube video)"; rail entry "Videos". From s15 and used as written: "Play video (loads YouTube)", "Chapters",
  "Transcript" and the transcript label.
- **Desk**: section "Video" with "Transcript" and "Chapters"; "Store transcript"; "No transcript stored yet."; "Stored {date}, {time} · {n} words · {n} segments"; "Show all {n} segments";
  "This transcript is in the latest revision."; "These chapters are in the latest revision."; "The chapters are read from the YouTube description once YouTube has answered.";
  "Description from YouTube"; "From YouTube, fetched {date}, {time}"; row labels Title, Channel, On YouTube, Length, Published; "Your channel", "Not your channel", Public, Unlisted, Private, Gone;
  "Waiting for YouTube"; "Added {date}"; list intro "Upload to YouTube as Unlisted, then put v: and its link in the capture box. The desk reads YouTube; it never changes anything there.";
  empty list "No videos yet. Put v: and a YouTube link in the capture box."; status lines "Listed", "Listed on the site." (when already Public), "Passed the gate. Listed from {date}",
  "Not listed: {reason}", "Not listed: run the publishing gate."; checklist rows "From YouTube, your channel", "Transcript", "Company and date", "Chapters" with details "Unlisted on YouTube,
  fetched in the last 7 days.", "Public on YouTube, fetched in the last 7 days.", "The transcript is in this revision and is checked word by word.", "A newer transcript is stored. Use it
  to put it in the next revision.", "No chapters.", "{n} chapters."; "Items" link label "Videos"; key aria-label "v: video"; capture placeholder gains "v:".

## Verification
- `rtk pnpm test`: **430 files, 5,892 tests passed** (Task 7 ended at 418 and 5,751). `pnpm typecheck` and `rtk pnpm lint`: no errors, no warnings. `rtk pnpm build` (CI placeholder env) and
  `pnpm check:bundles` passed (55 routes). `pnpm supabase db reset` and then, on the fresh database, the e2e specs `public-a11y`, `public-distribution`, `public-print`, `public-site` at 375
  and 1280, and `desk-a11y` (now including `/desk/videos`, both themes) in `desk-mobile` and `desk-desktop`: **104 passed, 6 skipped**; the capture, fab-clearance and items specs at 375 passed
  (the seven-key row).
- **A real video through the real gate.** Two throw-away SQL seeds (not committed; a video published through `publish_revision`, a second left private with no transcript) were looked at
  with two temporary Playwright specs (deleted): the public index and page at 375 (light) and 1280 (dark) are axe clean (WCAG 2.2 A and AA), have one h1 and no sideways scroll before and after
  the press; the page requested `youtube-nocookie.com` zero times before the press and once after (route-fulfilled), and a chapter press reloaded the frame with `start=180`; `/feed.xml`
  listed `/videos/{slug}#r1` with no private column; `/sitemap.xml` listed `/videos` and the page; the `og:image` card answered 200 `image/png`; the page's JSON-LD parsed as `VideoObject`
  with three `Clip` parts and the transcript and none of the channel, privacy or id; `page.pdf()` carried the title, chapters, transcript, label and the full disclosure and not "Play video"
  or "Save as PDF". The desk list and page (both themes, 375 and 1280, no sideways scroll) were axe clean, `/desk/items/{id}` redirected to the video page, and the checklist showed the
  database's sentence "A video needs its transcript before it is listed." The seeded video was unpublished and the database then reset.
- Not run: `defenso guard_code` (no tool in this session). Manual review: the new desk code starts every action with `requireAdmin()` through Task 7's actions; the list and page read through the
  admin's session only; the public side holds no secret client and names no private column (tested); a caption file and a transcript are rendered as escaped text (tested with markup in both).

## Concerns
- **Phone reach.** There is no phone tab for Videos (D54). A phone reader gets to `/videos` from What changed on the home page, the feed, a shared link or the sitemap; the desktop rail lists it.
  Process has the same gap today. A link line on the home page or About would close it for both; Shlok's call.
- **Repeated e2e runs drift the shared local database** (file numbers climb, so `public-distribution` expects "File 01" and sees "File 21"). A `pnpm supabase db reset` before a full run cures it;
  Task 9's e2e should say so.
- **`createItemAction` still accepts `kind=video` from a crafted post** (the Create list no longer offers it). Such an item has no YouTube row and cannot pass rule 12.1; a refusal in the research
  service would be tidier (Task 9 or a later fix).
- **A transcript mismatch between the two caches throws at runtime** (by design, the last good page stays), but a persistent mismatch would be a 500 on that page until fixed; it cannot arise
  from a gate-passed revision (rule 12.2 compares the same hash).
- **Q47, Q49 and Q51 stand**: the gate sentences, rule 2 allowances for spoken claims, and the 30-day purge need answers before a key is set.
