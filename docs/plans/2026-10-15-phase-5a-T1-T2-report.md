# Phase 5a, Tasks 1 and 2: report

Branch `phase-5-distribution` (from 8bbdf32). Not pushed. No migration, no outbound call, no new dependency. Local Supabase only.

Commits:
- `995c659` Task 1: typed metadata, structured data, a feed, a sitemap and robots, all built from the gated snapshot
- `acc1201` Task 2: share cards for notes, process notes, cases and concepts; metadata and structured data on every public page
- this report (third commit)

## Evidence

| Gate | Result |
|---|---|
| `rtk pnpm test` | 391 files, 5426 tests, all pass (two clean reruns; see concern 3) |
| `rtk pnpm typecheck` | no errors |
| `rtk pnpm lint` | clean |
| `rtk pnpm build` (CI placeholder env) | green; routes `/feed.xml`, `/robots.txt`, `/sitemap.xml` and four new `opengraph-image` routes listed |
| `pnpm check:bundles` | passed (50 routes; no client code added: `JsonLd` is a server component) |
| e2e `public-375`, `public-1280`, `public-1280-dark` with `public-site`, `public-a11y`, `public-file` | 72 passed, 2 skipped (the phone-only target-size check, by design) on the local stack |
| `isolation.test.ts` | 23 pass; new block "derived public surfaces stay inside the public boundary" |

`curl` on `pnpm dev` with the local seed (two fictional files, three notes):
- `/robots.txt`: `User-Agent: *` / `Disallow: /` (VERCEL_ENV unset locally, so the non-production answer).
- `/sitemap.xml`: `/`, `/companies`, `/notes`, `/process`, `/about`, then `/companies/kavpump`, `/companies/sahcold`, the two notes and the process note, each with `<lastmod>`; no `/cases`, `/mistakes`, `/concepts` (the deploy state).
- `/feed.xml`: RSS 2.0, `atom:link rel=self`, `lastBuildDate` = the newest entry, five items, for example `Kaveri Pumps (fictional) · File 01 · R2`, guid `/companies/kavpump#r2`, description = his reason, "Revision R2 · 2 sentences changed · figures to 31 Aug 2026", his objective, the fixed line.
- Production build (`next start`): `/cases`, `/concepts` and `/cases/x/opengraph-image-…` all 404; a file page carries one `application/ld+json` script (`Article` + `BreadcrumbList`), canonical, the feed link, `og:type article`, IST article times, and an `og:image` on `NEXT_PUBLIC_SITE_URL`.

## What was built

Task 1 (`src/modules/showcase/`, all pure, snapshot in, plain data out):
- `seo.ts`: `pageMetadata(route, s | null, slug?)`, `jsonLdFor(route, s | null, slug, siteUrl)`, `serializeJsonLd`, `sitemapEntries`, `robotsFor`, `SITE_DESCRIPTION`, `CONCEPTS_STANDFIRST`. One internal `detailOf` feeds metadata and JSON-LD, so a page cannot say two things about itself. A page's `alternates` replaces the layout's in Next, so every page repeats the feed link.
- `feed.ts`: `feedEntries(s, limit = 50)`, `renderRss`, `escapeXml`. Reuses the revision rules of "What changed": `site.ts` now exports `describeRevision` (the old `whatChangedEntry` body, returning the entry plus its R-number and path); `buildWhatChanged` output is unchanged (its test still passes untouched). Feed uses `servedFiles`, so a company with a thesis and a case study is one feed line per revision, not two.
- `derived-scan.ts`: `derivedProblems(text)` (uuid, `%`, `₹`, `Rs` figure, "ended ahead", "ended behind"). `buildRichSnapshot()` in `src/test/fakes/showcase-snapshot.ts` is every public kind at once, with a case whose chart is ON and whose record carries UUIDs, so a hit is something a builder added.
- `src/app/sitemap.ts`, `robots.ts` (the only `serverEnv()` read, `VERCEL_ENV`), `feed.xml/route.ts` (503 + `retry-after: 3600` when the snapshot is unavailable), `src/components/desk/json-ld.tsx`, root layout (`alternates.types`, `SITE_DESCRIPTION`).
- Isolation: a new block walks the sitemap, robots, feed route, builders, `JsonLd` and every `opengraph-image.tsx`; none reaches the service client, the cookie client, a desk module or a private component; only `robots.ts` reaches `env.server.ts`, and it reads one value.

Task 2:
- Card builders in `seo.ts`: `noteCard`, `processCard`, `caseCard`, `conceptCard`, `cutWords`. `ShareCardContent` moved to `showcase/types.ts` (re-exported by `share-card.tsx`) so the module does not import a component.
- `share-card.tsx` (62 lines): optional `kicker` and `aside` slots, tag set in capitals by the card, title steps down (78, 60, 48 px) instead of overflowing. The file card is unchanged.
- Four `opengraph-image.tsx` (notes, process, cases, concepts), shaped like the company card. Checked by eye on the worst case in the dev server (a 100-character case title and a 170-character objective): it fits.
- Every public page: `pageMetadata` (static `metadata` on index pages, `generateMetadata` on detail pages) and one `<JsonLd>` as the last child of `main`. Index pages no longer hold their own description strings. The existing case and concept page tests got a `publicEnv` mock and `toMatchObject` for metadata.
- `docs/design/decisions.md`: "Plan 5a Task 2" entry, marked "delegated by Shlok 2026-10-15, pending his approval".

## New strings, all pending Shlok's approval

Copy that is new in this build (reused strings, such as the index descriptions, "First version.", "For learning, not advice" and the case sub-line, are not repeated):
- Feed: channel title "Case files · Aksh Agrawal"; fixed line "For learning, not advice. Figures on the page are at least 30 days old."; case machine line "Closed case · written {date}"; note machine lines "Learning note · R{n}" and "Process note · R{n}".
- Cards: tags "Learning note", "Process note", "Closed case", "Concept"; the big letters N, P, C and "Aa"; footers "Revised {date}" and "Written {date} · closed {Mon YYYY}"; sub-line "A past case, not a view on the share today." (approved wording from rule 10).
- Card alt texts (four): "Learning note share card: the note's title, what it teaches and the date it was revised."; "Process note share card: …"; "Closed case share card: the company, the case title, what it teaches and its dates. No figure."; "Concept share card: the concept's name, a sentence about it and how many notes and files use it."
- Structured data and metadata: breadcrumb root "Case files"; WebSite name "Case files · Aksh Agrawal"; `siteName` "Aksh Agrawal · Case files"; the `about` page typed `AboutPage`.
- No banned word ("proof", "verified", "buy", "sell", "weekly") in any added line.

## Interpretations (conservative), for Shlok to confirm

1. "written {date}" on a case (feed and card) is the date of the record's opening entry, the same date the page's dateline prints as "written".
2. OG times are the IST date of the first and current gated revisions at midnight `+05:30` (day precision, as the feed).
3. `/mistakes` is in the sitemap only once a case is public (as the spec says), although the page renders an empty state before that.
4. Feed description parts are joined by a blank line. A reader may collapse them into one run; his reason is never given extra punctuation.
5. Card budgets: title 72, objective 120, company 40 characters, cut on a word boundary.

## Concerns

1. `robots.txt` is prerendered at build, so it follows `VERCEL_ENV` of the build. A preview build promoted to production keeps the preview answer (disallow all). Normal production builds are fine.
2. `BreadcrumbList` needs integer `position` values; the plan says "no numeric property". They are list positions, not figures, and are kept. Confirm.
3. One run of the full vitest suite showed one failing test out of 5426 (name not captured); three later full runs were green. Not reproduced.
4. The existing file card's objective is not cut by `cutWords` (only the four new cards are); his learning sentences are short today.
5. A build with no database prerenders `/feed.xml` as the 503 (placeholder CI builds); on a real build, or after the hourly refresh, it serves the feed. Same shape as the other public pages.
6. The root layout now imports the showcase index (for `SITE_DESCRIPTION`), which brings `server-only` code into the layout's server module graph; build and bundle check pass.
7. No new e2e spec was added (Task 4's job); Task 1 and 2 coverage is unit and page level, plus the existing public specs above.
