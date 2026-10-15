# Phase 4 Task 3 report: the `knowledge` module, and the change-reason leak from Task 2

Branch `phase-4-learning-graph`, built on a00cc1e. Local only, not pushed. Built by desk-backend (sonnet); review folded into Task 7.
No SQL changed, so `pnpm supabase test db` was not re-run (Task 1's 2281 stand). No public source file changed.

## 1. The leak fix (commit beded52, TDD, separate from the module)
A concept change on a public item wrote concept names into the change reason, which publishes with the revision.
- `conceptChangeReason(added, removed)` now takes `ConceptLabel = { name, isPublic }` and names only concepts that are public at save time. The rest are counted in plain words. A label that does not say `isPublic: true` is counted (fails closed). The count fallback past 300 units is unchanged and names nothing.
- `setItemConcepts(repo, itemId, conceptIds, labels)`: `labels` is now id to `{ name, isPublic }` (was id to name). The caller reads public status when it saves.
- `setItemConcepts` throws `ConceptChangePendingError` (new, `research/errors.ts`) when the item has a revision newer than the current one. A real change is refused; an unchanged list is still a quiet no-op. This was needed, not just tidy: a concept X added in a pending revision is not yet on the current revision, so the Task 1 guards do not freeze it. X could go private, and a later pending revision that removes X would then name it. Refusing a second concept change while one waits closes that. Capture appends (`t:` with `#tags`) also create pending revisions, so they block a concept change the same way.
- Cost: to take a concept out of a waiting revision, publish that revision first (its concept must be public, which the gate demands anyway).
- Tests (research/concepts.test.ts, 24): template with public, private and mixed lists; fails closed; no private name anywhere in the stored revisions; refusal on a pending revision (concept change and capture append); private items never blocked; unchanged list no error; code and sentence equal on the desk.

New strings, pending approval: reason shapes `Concepts: added A and 2 private concepts; removed 1 private concept.` / `Concepts: added 1 private concept.` / `Concepts: removed 1 private concept.`; error `concept-change-pending`: "A newer version of this note is waiting to be published. Publish it before changing the concepts."

## 2. The knowledge module (`src/modules/knowledge/`)
Files: `client.ts` (pure, browser-safe: `monthOf`, `monthBounds`, `shiftMonth`, `isMonth`, `groupMonth`, `groupOfKind`, `groupConceptItems`, `countsByGroup`, `primaryConceptByItem`, `normaliseEdge`, `suggestRelated`, the view types), `types.ts` (ports and read models), `repo.ts`, `service.ts`, `actions.ts`, `errors.ts`, `index.ts` (server-only), `fake-deps.ts` (test fakes). Tests: `client`, `service`, `service.write`, `repo`, `actions`, `knowledge.graph`. No file over 300 lines.

- **repo** (admin cookie client): `linksForConcept`, `allLinks` (paged past 1000 rows), `linksForItems` (chunks of 100; added beyond the brief, the month page needs it), `edgesFor` (the uuid is checked before it goes into the filter string), `insertEdge` (normalised a < b; a duplicate key is not an error, so a double tap is one row), `deleteEdge`, `itemsCreatedBetween` and `itemsByIds` (through research). Only `concept_links` and `concept_edges` are named in `.from()`. Concept rows come through catalog, items through research.
- **Additions to other modules**: research `listItemsByIds` and `listItemsCreatedBetween` (`lookup.ts`, exported from index; `ITEM_COLUMNS` and `toItem` exported from `repo.ts`); catalog `getConceptsByIds` (live rows, stubs included, archived never); `src/lib/supabase/paging.ts` (`readAllPages`, with tests).
- **service**: `conceptIndex`, `conceptPage(slug)` (groups Learnings, Files and case studies, Process, Reads, Notes, newest first, empty hidden; status; his description untouched; related by name; suggestions), `monthPage(month, now)`, `monthCounts(month)`, `linkConcepts`, `unlinkConcepts`, `saveItemConcepts(itemId, ids)` (loads the labels, calls `setItemConcepts`).
- **actions** (`requireAdmin()` first, ids checked, the return slug must be a plain slug or the admin lands on `/desk/concepts`): `linkConceptsAction(a, b, slug)`, `unlinkConceptsAction(a, b, slug)`, `saveConceptsAction(itemId, ids)` (pending revision gives notice `revision-pending-gate`), `saveDescriptionAction(conceptId, slug, formData)` (field `description`), `makePublicAction(conceptId, slug)`.
- **Graph test**: no provider port, no service client, nothing reachable that is the service client, server env or a provider, never ledger, cases, valuation or showcase, only `actions.ts` imports identity, `client.ts` has no server import, reads only those two relations and writes only edges, and nothing under `showcase` or `app/(public)` reaches `@/modules/knowledge`. `eslint.config.mjs` not touched.

## Evidence
- Red seen for the client, service, repo, actions and lookup tests (module missing) and for the pending-error code. The research leak tests were written before the code but I did not run the red step on them before implementing; the missing `ConceptChangePendingError` import would have failed them.
- `rtk pnpm test`: 363 files, 5178 tests pass (Task 2 left 354 files, 5085). `pnpm typecheck` and `pnpm lint`: clean.
- defenso `guard_code`: not run (no such tool in this subagent, as in Tasks 1 and 2). Self-checked the one request-body path: ids are uuid-checked, the only string built into a filter is a checked uuid, no secret or service client is reachable (graph test).

## Wording pending Shlok's approval (new this task)
- Errors: "A newer version of this note is waiting to be published. Publish it before changing the concepts." (`concept-change-pending`); "A concept cannot be linked to itself." (`concept-self-link`); "This concept could not be found." (`concept-not-found`).
- Notices: "Linked." (`concept-linked`); "Link removed." (`concept-unlinked`); "Concepts saved." (`concepts-saved`); "Saved. Only you see this." (`concept-description-saved`).
- Change reason shapes in section 1.
- `client.ts` carries the five heading texts (`ITEM_GROUP_LABELS`: Learnings, Files and case studies, Process, Reads, Notes) as in spec s14; Task 4 renders them.

## Choices where the brief left room (conservative reading each time)
1. **Archived items are not filtered.** The desk has no way to archive an item, and hiding rows silently seemed worse than showing them. Archived concepts are dropped everywhere (the views and `getConceptsByIds` already do).
2. **Concept index "last activity"** = newest `updated_at` of an item whose latest revision links it; concepts with no items go last, by name.
3. **Month page order**: groups by name with "No concept" last as specified; inside a group and for reads, oldest first (the order he wrote them). The concept page is newest first, as specified.
4. **First live concept** = the lowest `position` among concepts that exist and are not archived, so position gaps are fine. A stub counts as live (the group shows its name). The month page never builds from `theme_id` alone; legacy items arrive through the `concept_links` view's own legacy rule.
5. **Linking and suggestions use checked concepts only**: `linkConcepts` refuses a stub or archived concept (`concept-not-found`); suggestions only come from screened live concepts (the pure function skips any id it is given no name for). Related concepts show any live neighbour.
6. **`saveItemConcepts`**: a concept he already has may stay even if it is still a stub; a newly added one must be screened and live (the picker offers no others). An already linked concept that has since been archived is counted as "private" in the reason.
7. **`monthPage` next month**: offered only while it is not later than the current India month; previous month always.
8. `monthCounts` and `monthPage` take a month string `YYYY-MM` and refuse anything else with `InvalidInputError`.

## Concerns for the reviewer
- Stuck state by design: on a public item with a waiting revision, the concept picker is refused until that revision is published. Task 4 should show the `concept-change-pending` sentence beside the picker and could disable "Save concepts" when `pending.length > 0`.
- `conceptIndex` and `conceptPage` read `allLinks()` (up to 8 rows per item, paged). Fine for one writer; the index does one `itemsByIds` over every linked item (chunks of 100). If the desk grows past a few thousand items, move the counts into a SQL view.
- `saveItemConcepts` reads concept visibility once; a concept made private between that read and the save could be named in the reason. The window is the length of one request and `makePublic` is the only way a concept becomes public, so it needs two admin actions at once; left as is.
- `fake-deps.ts` is a non-test source file (like the ledger's `fake-repo.ts`); the graph test scans it and it imports nothing forbidden.
- The plan's lint example "Exit multiples" still does not hold (Task 2 report); not touched here.
