# Phase 4 Task 6 report: the full loop end to end, and the guide

Branch `phase-4-learning-graph`, built on d3b9ae0. Local only, not pushed. Built by desk-backend (sonnet); review folded into Task 7.
No application code, SQL or migration changed. Files: `e2e/concepts.spec.ts` (new, 234 lines), `e2e/support/concept-pages.ts` (new, 64 lines), `playwright.config.ts`, `.github/workflows/ci.yml` (one comment), `docs/guide/using-the-desk.md` (section 4.10), `docs/guide/aksh-quick-guide.md` (one paragraph).

## What was built
- **`concepts` project** (config): runs after `anon`, every `public-*`, `reduced-motion`, `desk-mobile`, `desk-desktop` and `cases`; `signout` now also waits for it. **`concepts-public-375` / `concepts-public-1280`** run `public-concepts.spec.ts` after it, as `cases-public-*` do, so the published half (axe, one h1, no sideways scroll, 44 px targets on the phone) runs against a real gated link. In those two projects the "no public concept" test skips and the "with one public" test passes (checked in the full run).
- **The loop** (`e2e/concepts.spec.ts`, serial, local stack, admin session, through the desk screens and the real server actions):
  1. `l: <title> #e2e-moats #e2e-cycles` captured; both names wait on Names, are screened there ("New concept", "Yes, add it"); the note shows both chips in order.
  2. The concept page lists the note under Learnings; "Link a concept" then a double click on **Link** writes one `concept_edges` row (counted in the database) and one Remove button.
  3. `r: <title> #e2e-moats` captured: kind `reading_note`, private; it shows under Reads on the concept page and on `/desk/learned` (title word for word, the learning under Learnings); its item page says "A read stays private. It is not published." and has no gate button. The refusal is asked for directly: `publish_revision` called with the service key (the gate's only caller; the local stack only) returns verdict `fail`, `reading_note` is in the recorded reasons, the item stays private.
  4. With a learning objective saved, the checklist shows one line per concept; the gate refuses with exactly two failures (the first concept through rule `theme`, "The linked concept is not public."; the second through rule `concept`, `The linked concept "E2E cycles" is not public.`). "Make E2E moats public" and "Make E2E cycles public" on the checklist, then the gate passes (item public, slug assigned).
  5. Signed out at 375 and 1280 (`support/concept-pages.ts`): `/concepts` lists both, `/concepts/e2e-cycles` lists the note with "Since", the note's own page carries the Concepts line in order (44 px targets at 375), axe WCAG 2.2 A/AA clean on all three pages, one h1, no sideways scroll; the read's title appears nowhere.
  6. **Concept change on a public note:** a second version saved; the picker shows the plain refusal sentence and "Save concepts" is disabled while it waits; after the gate passes it, the picker is enabled; one public concept ("E2E margins", made public from its own page) and two private concepts are added; the stored change reason is exactly `Concepts: added E2E margins and 2 private concepts.` and neither private name appears in any revision's reason.
  7. Signed out again at both sizes: the public pages still show only the two public concepts of the version that passed the gate; "E2E margins" and both private names (and slugs) are in no page.
- **Guide**: section 4.10 "Concepts, reads and your month" in `using-the-desk.md` (contents entry, intro date line, messages table, two "Not in this version" bullets); one short paragraph in `aksh-quick-guide.md` (a `#name` makes a concept; `r:` logs a read; where the page and the month are). Plain words, no banned words (checked by search); both files kept CRLF as they are in the index so the diff is only the added lines.

## Deviation from the plan, on purpose
The plan's `afterAll` unpublishes the note "so later projects see the deploy state". The brief (item 1) needs a public concept to survive until `concepts-public-*`, so the note stays public, exactly as `cases.spec.ts` leaves its case public. Nothing that runs after `concepts` (`concepts-public-*`, `cases-public-*`, `signout`) expects the deploy state; every project that does (`public-*`, `reduced-motion`, `anon`) finishes before it. A second run on a used database stops in `beforeAll` with "The e2e concepts already exist in this database. Run `pnpm supabase db reset` before the full suite." (the same rule as the case loop).

## The brief's four items
1. Done: the loop links two public concepts to a published note through the real gate; `concepts-public-*` added in `playwright.config.ts`; CI needed only a comment change (it runs `pnpm e2e`).
2. Done: refusal while a revision is pending (step 6); the reason naming only public concepts with "and 2 private concepts" (step 6); the `r:` capture refused by the gate (step 3).
3. The loop never produced a lint refusal (titles are plain), so "Exit multiples" or its replacements were not needed.
4. Order independence: the full suite ran from a freshly reset database with the T4 `concept-world` seeds in place (they run earlier, in `desk-*`) and passed. My spec finds its items by exact title and its Names cards by exact token, so the extra private concepts and learnings do not matter. My spec alone, on a reset database, passed before the full run (after one fix to a wait).

## Evidence (all from this worktree, local stack)
- `pnpm supabase db reset` then `pnpm supabase test db`: 30 files, **2283 tests, PASS** (T1 reported 2281; the count is what the files hold now).
- `rtk pnpm test`: 381 files, **5318 tests pass**. `rtk pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- `pnpm build`: passes with the CI placeholder env (a build without that env fails at "collect page data", as it did before this task).
- Full `pnpm e2e` after a fresh `db reset`: **336 passed, 25 skipped, 0 failed, 15.7 min** (the figure includes the build the web server step runs; 944 s wall clock by my timer). The 25 skips are the by-design ones: the published halves of `public-cases` and `public-concepts` in the eight `public-*` projects (12), the deploy-state halves in `cases-public-*` and `concepts-public-*` (4), public-perf, which runs only in `public-375` (6), the phone-only 44 px check in the two 1280 projects (2), and one desk-desktop check that is phone-only (1). New: 9 tests in `concepts` plus 4 in `concepts-public-*` (2 pass, 2 skip). That is about 1.2 minutes added, so the e2e job stays well inside its 35-minute timeout, though a CI runner is slower than this machine; check the first CI run.
- defenso `guard_code`: not run (no such tool in this subagent, as in Tasks 1 to 5). No auth, database or request-body code was written. The one privileged call in a spec is the service-key `publish_revision` in the test, guarded by `requireStack()` (local only).

## Strings pending Shlok's approval
- No application string was added in this task. The new text is the guide section 4.10 and the quick-guide paragraph. Its quoted messages are the Task 2 to 5 strings exactly as they stand in the code. Plain-word choices to look at: "Showing a concept" (a concept is shown only when you made it public and a published note or file uses it), "The reason the desk writes", and the sentence "A read is never published".

## Concerns for the reviewer
- **A capture keeps its `#names` in the title.** The title is the whole first line, so `l: What moats do #moats #cycles` publishes as a note titled "What moats do #moats #cycles" and the public page shows the hashes. This is existing capture behaviour (and the e2e title has to include them), but with concepts now being the point of the tag it may deserve a decision: strip trailing tags from the title, or leave it. Not changed here.
- The note stays public with a pending revision that links three more concepts, two of them private. The public pages ignore the pending version (checked at both sizes), which is the property to look at in the Task 7 review of SQL s4/s5.
- The "double tap makes one link" test pins the result (one row, one button); the database also treats a duplicate as a no-op, so it does not prove the button blocks the second press.
- CI e2e time: 15.7 min locally against a 35-minute timeout; confirm on the first real CI run.
- The first full run I started was killed by me and restarted because a second command reset the database under it; the reported run is the clean one.

## Fix wave (after the final whole-branch review)
Branch `phase-4-learning-graph`, built on d9c5711. Local only, not pushed. Built by desk-backend. Input: `.superpowers/sdd/2026-10-15-phase-4-ledger/final-review.md` (1 Important, 7 Minor FIX-NOW, 6 DEBT) and the deferred items of `T1-review.md`.

### Findings
| # | Finding | Commit | Proof |
|---|---|---|---|
| 1 | Important: deploy-state e2e skipped by data. `public-concepts.spec.ts` and `public-cases.spec.ts` now decide by Playwright project name (`public-*` = deploy state, `concepts-public-*` / `cases-public-*` = after the loop); the published half asserts the list is not empty instead of skipping | 12cbfb0 | On the database the full run left dirty, `pnpm e2e --project=public-375 --grep "no public concept"` FAILS (404 expected, 200 received); after `db reset` the full suite passes |
| 2 | `publish_revision` holds the linked themes and the company `for share` (0021 edited in place) | 3d75328 | pgTAP test 102 of `0020_knowledge.test.sql` (function-text check; two sessions need dblink, noted in the test); failed before the edit, passes after |
| 3 | A concept change is blocked only on public items (`service.ts`, `items/[id]/page.tsx`, JSDoc) | cc23480 | `research/concepts.test.ts`: private item with a leftover pending revision saves rev 3 and syncs `theme_id`; the public refusal tests pass unchanged |
| 7 | Change reason says "other concept(s)" instead of "private concept(s)" (code, unit tests, e2e step 6, guide) | cc23480 | `conceptChangeReason` tests, including the review's example |
| 4 | `reading_note` is not a public kind in the showcase snapshot (`PUBLIC_KINDS`, comment points at D52) | 60bee26 | `showcase/repo.test.ts`: a `reading_note` row is dropped, a `learning` row kept |
| 5 | The isolation test makes the transitive name check: every file the public closure reaches is scanned, exactly `modules/catalog/concepts.ts` may name a private relation | 2c15e89 | Adding `// concept_edges` to `modules/research/lookup.ts` made it fail (it listed that file); reverted, it passes |
| 6 | A trailing run of `#names` is left out of the title at capture (`parse.ts` `TRAILING_TAGS`), never at render time; `e2e/concepts.spec.ts` captures `NOTE_CAPTURE` and looks the item up by `NOTE` (the title); guide lines updated; one older unit expectation (the `r:` read with `#interest-rates`) changed to the new title | ab39f98 | `parse.test.ts`: the review's cases (`What moats do #moats #cycles`, tag inside the sentence, lone tag, `issue #12`, `C# is fun`, URL fragment, 120-unit cut, later line) |
| 8 | Desk concept index counts agree with their number: `groupCountText` in `knowledge/client.ts`; headings keep their plural labels | 5f119d3 | `concept-list.test.tsx`: `{learning:1, read:2}` renders "1 learning · 2 reads", plus the other nouns |

Titles are not retroactive: an item captured before this wave keeps the hashes in its title.

### Debt added
`docs/specs/technical-debt.md`, new section "2026-10-15 (Phase 4 fix wave ...)" (commit a9ef182): the six review DEBT lines (D1 to D6), and from `T1-review.md` the raw `concept_ids` uuid exposure on older revisions, the `position` gaps, the BEFORE INSERT trigger probe, and the hosted pre-push query; plus a line that the `for share` lock is proved by function text only. The T1 race itself is closed (finding 2); the T1 point about the /concepts index listing from `public_concept_links` was already met by Task 5 (final review "Checked and correct").

### Strings pending Shlok's approval (new in this wave)
- Capture titles: a trailing run of `#names` is no longer part of the title (behaviour, with the other Phase 4 strings). Guide text added in section 4.10 and the `#capital-cycle` table row.
- Change reason: "Concepts: added Margins and 2 other concepts." (was "... 2 private concepts.").
- Desk concept index count nouns: "learning / learnings", "file or case study / files and case studies", "process note / process notes", "read / reads", "note / notes".
- Unchanged and still pending from before: the picker's refusal sentence now appears only on public items.

### Evidence (this worktree, local stack, after the last code commit)
- `pnpm supabase db reset` then `pnpm supabase test db`: 30 files, **2284 tests, PASS** (one more than before: finding 2).
- `rtk pnpm test`: 381 files, **5325 tests pass** (7 more than before). `rtk pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- `pnpm build` (local-stack env, as the e2e web server builds it): passes.
- Full `pnpm e2e` after a fresh `db reset`: **336 passed, 25 skipped, 0 failed, 15.9 min**. The skips are the by-design ones (each deploy-state or published-state test skips in the other half); same totals as the Task 6 run.
- defenso `guard_code`: not run (no such tool in this subagent, as in earlier tasks). Auth or request-body code was not touched; the one SQL change adds read locks inside an existing definer function.
