# Task 5 report: end-to-end spec and guide (Phase 5d, e2e and guide part only)

Built by desk-backend (sonnet) on 2026-10-17. Branch `phase-5d-sources`, on top of 24a334b. Review and fix wave come after this.

**The end-to-end spec was NOT run here.** No Docker, Supabase, Playwright browser or build was started on this laptop (memory limits). GitHub CI is the check. Verified locally:
`pnpm typecheck` (covers `e2e/`) clean, `rtk pnpm lint` clean, and `playwright test --list --project=sources` loads the config and resolves every project dependency (617 tests in 46 files listed).
No unit test file was touched, so no vitest run was needed.

## Files
- `e2e/sources.spec.ts` (new, about 260 lines): project `sources`.
- `e2e/support/sources-flow.ts` (new, 80 lines): capture box, wait for the server's read, panel row, revision save, gate run, fixture ids and picture hashes.
- `playwright.config.ts`: project `sources` added after `sources-screens` (so after `concepts` and every other project, including the `*-public-*` ones), before `signout`; `signout` now also depends on `sources`. `e2e/support/stack.ts` and `e2e/support/outbound.ts` are unedited.
- `docs/guide/using-the-desk.md`: new section 4.14 "Sources" (the `s:` line, the same link twice, the list, putting a source on a file, the picture tick, why a title with a price must be unticked, taking one off, what changes by itself, four messages), a contents entry, the `s:` and changed `v:` rows in the capture table, a bullet in 4.7 for the public block, a "Switched off for now" note at the top of 4.12 and 4.13, and a first bullet under "What is switched off on purpose".
- `docs/guide/aksh-quick-guide.md`: "Save a source" block (five numbered lines) before "Add a video"; "Add a video" and "Send a letter" now open by saying they are switched off.
- Not touched: `docs/specs/technical-debt.md` (the plan assigns the debt lines to the fix wave and close-out).

## What the spec does (serial, one file, Kaveri file `/companies/kavpump`)
1. `s: https://youtu.be/fxBuyTitle1 $KAVPUMP #moats why the bull case is thin` through the real Capture box. Polls the admin's own `source_links` row until the title is read (the read runs in `after()` on the e2e server with the fixture adapter, so nothing leaves the machine). The desk card shows the title, the channel "Fixture Channel", the note, "Private", the picture, the company and `#moats` chips. The stored picture hash equals the SHA-256 of the fixture bytes.
2. The same link again with a new note: still one `source_links` row and one card, the note holds both texts and a dated "— d Mon yyyy" line, the picture hash is unchanged.
3. Two more captures: `fxPriceTtl1` (title holds "Rs 450") and a new clean id `fxCleanVid1` (the fixture's default title "Fixture video fxCleanVid1: how to read a balance sheet"). Each read and stored with its own picture.
4. Panel on the Kaveri file: the "buy" source ticked with its title: gate verdict fail, first failure `data-rule="1"`, "In: Title of an outside source", the flagged sentence is the title; after a reload the panel lists "The last gate run refused"; the public HTML (signed-out context) holds neither the title nor the block.
5. "Show its title and picture" unticked, new revision: passes. Public file lists one plain card ("A video on YouTube", no image, link to the video), never the title or his private note; `/media/studied/<its sha>.jpg` answers 404.
6. The price source ticked: fail, `data-rule="3"`, same field label, nothing public; unticked: passes; picture route 404; title absent from the public HTML.
7. The clean source ticked, with "What readers see from me" filled in: passes; the very next signed-out read of the file has the block (no hold).
8. Public file at 375 and 1280 (fresh signed-out contexts, `guardOutbound`): three cards; the clean one has "Title on YouTube", "YouTube · Fixture Channel", the public note and exactly one image whose `src` is `/media/studied/<sha>.jpg` and loads; the two plain ones have no image and no title; no request to any host but the app's own; no sideways scroll; one h1; axe WCAG 2.2 A/AA in both themes; the raw HTML holds none of the refused titles, nor his private notes; the picture route answers 200 with `image/jpeg` and `public, max-age=3600, s-maxage=3600` for the clean picture and 404 for the other two.
9. Unpublish on the file: the block is gone from the public file and the clean picture 404s; running the gate on the same revision again brings the three cards and the picture (200) back.
10. Cleanup: unticks all three, new revision, gate pass, block and picture gone, the file stays public. It leaves Kaveri public with no outside source, the state `sources-screens.spec.ts` also leaves.

Order and state: needs `supabase db reset` before a full run (the made-up links are the same every run; `beforeAll` fails with a plain sentence if one is already saved, like `concepts.spec.ts`). Assertions use titles and ids, never counts of the whole database; the world source from `sources-screens` (attached to Kaveri, unticked) sits in the panel and is ignored.

## Deviations and gaps (read these)
1. **The 404 check for `/letters`, `/videos`, `/desk/letters`, `/desk/videos` is NOT in this spec.** The brief's list did not include it, and the plan's own note (T1 report concern 5) says it needs a second server on a separate build directory: the e2e web server runs with `FEATURES_ON=ownVideos,letters` (needed by the `videos` and `letters` projects), so the shipped off state cannot be seen on it. T1's unit tests (`features-off.test.tsx`, `hide-kinds.test.ts`, the layouts) and its manual smoke cover it. Suggested way if wanted: a second `webServer` entry with `distDir` set by an env variable and no `FEATURES_ON`, plus an anon project `features-off`. Needs a second `pnpm build` in CI (about 2 minutes).
2. **No `afterAll` that unpublishes.** The plan's text said cleanup unpublishes in `afterAll`. Unpublishing the seeded Kaveri file would leave the shared file private for anything after it, so the last test instead takes the sources off through the panel (one more revision, real gate) and leaves the file public, as `sources-screens.spec.ts` does. If a test fails midway the file may keep a listed source until `supabase db reset` (CI starts fresh).
3. **Untested assumptions that CI will confirm**, all read from the code but not run: the company chip's accessible name (the spec accepts `KAVPUMP` or `Kaveri`); the stance tick being on the page after Unpublish (the videos spec does the same re-run); that a fresh signed-out `browser.newContext()` carries no admin session (the same method `sources-screens.spec.ts` uses); the rule number on the outside-title refusals (1 and 3 from T3's report, via `data-rule`).
4. The rule 3 sentence for an outside title is not asserted word for word, only its rule number and field label, so a wording change by the owner's approval does not break the spec.

## New strings (pending Shlok's approval)
Only guide text; no app string was added or changed. New guide text is plain and never says "proof" or "verified". The words "buy" and "sell" appear in the guide only (a) inside the fixed picture warning quoted from the screen ("The desk does not read pictures. Untick if this one tells people to buy or sell."), and (b) where the guide describes what rule 1 refuses ("an instruction to buy or sell"), as the existing guide sections already do.
New guide headings and blocks: "4.14 Sources" with the bold lead-ins "What it is for", "Saving a source", "The same link twice", "The list", "Putting a source on a company file", "The picture tick", "Why a title with a price has to be unticked", "Taking one off", "What is kept, and what changes by itself"; "Save a source (someone else's video or article)" in the quick guide; the lines "Switched off for now." for 4.12 and 4.13, "Letters are switched off for now. ..." and "Videos and letters are switched off for now ..." in the quick guide; the bullet "Own-channel videos and letters." under "What is switched off on purpose".

## Needs CI (everything above runs there, none locally)
Run the whole chain once from a fresh `supabase db reset`; the new project's dependency names were checked by `--list` only. Also worth a look in the CI report: `sources.spec.ts` step 4 and 6 (gate failure markup), and the public step at 375 px (three cards, axe).

## Earlier reports' "Needs Docker" lists (T4 items 1 to 7) are all still open
`sources-screens` project, `desk-a11y` and `public-a11y` additions, the full chain, the integration tests that skip without the stack, the visual review with `SOURCES_SHOTS=<folder>` and the `v:`/`s:` key row under `FEATURES_ON=ownVideos,letters` (unit-tested only) have not been run by anyone yet; CI on this push is the first run of all of them.
