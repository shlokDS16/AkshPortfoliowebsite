# Task 4 report: desk and public screens, the media route, print (Phase 5d)

Finished 2026-10-17 by desk-ui (sonnet) after two interrupted runs. Branch `phase-5d-sources`. Not pushed. No Docker, Supabase, Playwright or browser was started
(memory limits); nothing outbound.

## Where it started
The earlier runs left five commits: bd67bfc (public block, media route, print, isolation, `s:` key, Today list), 3868aea (desk `/desk/sources`, thumb route, add form,
cards, filters, attach picker, `listAttachables`), f262e4b (file-page "Outside sources" panel, concept Sources list, rule 14 checklist rows, `loadPanel`), 74e3892
(checkpoint: e2e specs, playwright project, design notes, preview entries; marked unverified) and 3302c94 (isolation test split). I read every commit's file list and
re-checked the code against plan Task 4 and spec s6.5, s7 and s13. Nothing in Task 4 was missing in code. The checkpoint's unit tests all pass; its one real defect was in
an e2e spec (below).

## Done (all of Task 4)
- Public: `StudiedBlock` ("STUDIED", "Other people's work I studied", the Q53 sub line) on the company file between Sources and Revisions, absent when empty, with a
  "Studied" entry in the file's section rail only when it has cards. Cards: picture (320 by 180, lazy, fixed alt "Thumbnail of the video", only from
  `/media/studied/<sha>.jpg`), machine-face title with "Title on YouTube" or "Title on the page", "YouTube · {channel}" (attribution) or the site name, "Saved {date}", his note
  under "My note", link `rel="noopener noreferrer nofollow"` with `referrerpolicy="no-referrer"`. Unticked or changed data: no title, no picture ("A video on YouTube" or the host).
  Shown as soon as the gate passes (no hold). The snapshot gains `studied` from `public_studied` (optional load, D60); `buildStudiedBlock` is pure.
- Media route `src/app/media/studied/[file]/route.ts`: `^[0-9a-f]{64}\.jpg$` only, anon client, JPEG magic and 200 KB check, `public, max-age=3600, s-maxage=3600`,
  `nosniff`, 404 otherwise. The pure server is `showcase/studied-media.ts`.
- Print: the block prints title, name, his note and the full address; pictures are `print:hidden` and `[data-studied-picture]` is hidden in `print.css`. Feed, sitemap, JSON-LD
  and share cards are unchanged (the e2e checks the feed and sitemap name nothing).
- Isolation: `showcase/isolation.test.ts` (split in 3302c94) covers the new public files and the media route; no UUID in the block.
- Desk `/desk/sources`: add form (paste a link, attach companies and concepts by type-to-find, his note, one press), filters (company, concept, on a public file, archived; a GET
  form), cards with the machine block labelled "From YouTube, read {date}" or "From the page, read {date}", status in plain words (Reading the link, the seven problem sentences,
  the gone sentence, Private, On the public file with the file linked, Archived), "Read again" (fixed one-minute refusal sentence), Archive and Restore (the database's refusal
  sentence while a public file lists it), edit note and attachments. Thumbnail through the admin-only `/desk/sources/[id]/thumb` (401 without a session, 404 for a non-UUID,
  `private, max-age=300`). The Items sub-nav has Sources.
- File page `/desk/items/[id]` (company thesis and non-ledger case study): "Outside sources" panel with "Show on the public file", "Show its title and picture" (ticked by default,
  disabled with a reason when nothing was read), "What readers see from me" (500 characters; "Use my private note" copies only on press), the fixed picture warning beside each
  picture (Q56), a boxed list of the last gate run's refusals about outside sources in the gate's own sentences, an optional change reason (his), "Save as a new revision". The
  publish checklist has the two rule 14 lines. `/desk/concepts/[slug]` has a read-only Sources list.
- Capture: the key row shows `s:` (not `v:`) while own videos are off. Today list: a source capture shows the word "source" and "See it in Sources" and never the inbox's
  "Read this link" (D112: the inbox route itself is untouched). The forced edits listed in the Task 3 report finished cleanly (typecheck, lint, full suite).
- `/dev/preview` entries and `docs/design/{decisions,component-inventory}.md` entries (delegated picks, pending approval) are in.

## Changed in this run
- `e2e/sources-screens.spec.ts`: the "Read again inside the first minute" test now runs first. It relied on the seeded read still being under a minute old; after the axe
  runs, screenshots and filters (minutes) the press would really ask the fixture site, replace the seeded title and break every later step (the metaSha, the public title). No other
  code change was needed.

## Evidence
- Touched unit files (29 files, 235 tests): pass. Full suite, once: `pnpm vitest run --testTimeout=60000 --maxWorkers=2`: 517 files passed, 4 skipped (integration tests that need
  the local stack); 6,962 tests passed, 18 skipped.
- `pnpm typecheck` (includes `e2e/`): clean. `rtk pnpm lint`: clean. `pnpm build` (CI placeholder env): passed, with `/media/studied/[file]` and `/desk/sources` in the route list.
  `pnpm check:bundles`: passed (67 routes).
- Files over 300 lines among those Task 4 touched: none in `src` (only `docs/design/component-inventory.md`, already a long inventory).

## Needs Docker (Task 5 runs these with the local stack; none was run here)
1. `e2e/sources-screens.spec.ts` (project `sources-screens`, after every desk, case, concept, video, letters and public project, before `signout`). Whole file, serial: Read-again
   cooldown sentence; `/desk/sources` at 375 and 1280 in light and dark (axe WCAG 2.2 A/AA, no sideways scroll); the desk thumb route; the filters and the add-form refusal; the file
   page's Outside sources panel at both sizes and themes; panel to revision to the rule 14 checklist lines to a gate pass; the public file at 375 and 1280 (block, picture from
   `/media/studied/`, no request to a host other than the app, axe in both themes, print media: picture hidden and address printed, route headers and 404s); feed and sitemap
   unchanged; unlisting through a new revision, after which the block and the picture route go away. It leaves Kaveri public with no outside source.
2. `e2e/desk-a11y.spec.ts`: the new `/desk/sources` rows (light and dark).
3. `e2e/public-a11y.spec.ts`: the new "picture route serves nothing that no public file shows" test.
4. Run the whole chain once so the new project's dependency list is proven (`playwright.config.ts` fails at load if a project name is wrong; the names were checked by reading, not by
   running). Also re-run the existing capture and `clocks.spec.ts` projects, which share the changed pages and step names.
5. Integration tests that skip without the stack: `src/modules/ops/source-steps.integration.test.ts` and the other `*.integration.test.ts` files (4 skipped files, 18 tests).
6. Visual review is not done: no browser was started. With Docker up, run `sources-screens` with `SOURCES_SHOTS=<folder>` and look at the 375 px desk list, the panel and the public
   block in both themes before Shlok sees them.
7. `appEnv` sets `FEATURES_ON=ownVideos,letters` for e2e, so the capture key row shows `v:` there; the `s:` row and "v: filed as a source" are unit-tested only.

## New strings (pending Shlok's approval; none is advice language)
Spec s6.5, s7 and s13 sentences as written, plus these Task 4 wordings:
- Desk page: "Sources"; intro "Other people's videos, pages and newsletters you studied. Paste a link here, or put s: and the link in the capture box. The desk reads the title and the picture once. What you write about a link is private until you put it on a company file."; "Saved sources"; "No sources yet. Paste a link above."; "No source matches these filters."; labels "Link", "My note", "Companies", "Concepts", "Save source", "Save changes", "Company", "Concept", "All companies", "All concepts", "Filter the sources"; "Your words. Private until you put a source on a public file."
- Card: "From YouTube, read {date}", "From the page, read {date}", "Private", "On the public file", "Archived", "Reading the link", "Read again", "Archive", "Restore", "Attached to", "(opens in a new tab)".
- Panel: "Outside sources"; "Other people's work you studied, attached to {company}. A ticked source is listed on the public file once the new revision passes the gate. At most 12."; "Show on the public file"; "Show its title and picture"; "Nothing was read from this link yet, so only the link can be shown."; "What readers see from me"; "Use my private note"; "Change reason (optional)"; "Save as a new revision"; "This makes a new revision from the latest saved one. Your view, tests and facts are carried over unchanged."; "The last gate run refused:"; "In: {field}"; "No source is attached to {company} yet." with "Add a source"; "Not read yet".
- Fixed picture warning (Q56): "The desk does not read pictures. Untick if this one tells people to buy or sell." (spec wording; "buy" and "sell" appear only as the warning to him, on the desk).
- Checklist: "Outside sources match what you chose (rule 14)." and "Outside titles and links pass the wording check."
- Today list: "source", "See it in Sources". Public: "Studied" (rail), "STUDIED" (label), alt text "Thumbnail of the video".
