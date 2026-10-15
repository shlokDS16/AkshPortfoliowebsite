# Phase 4 Task 4 report: the private desk screens

Branch `phase-4-learning-graph`, built on d7e2016. Local only, not pushed. Built by desk-ui; review folded into Task 7.
No SQL changed. No public source file changed (`src/app/(public)`, public components and `showcase` untouched; `isolation.test.ts` and the knowledge graph test pass). Layout picks are in `docs/design/decisions.md` ("Plan 4 Task 4", delegated by Shlok 2026-10-15, pending his approval).

## What was built
- **Routes:** `/desk/concepts` (index), `/desk/concepts/[slug]` (a 404 for an unknown or archived concept), `/desk/learned?m=YYYY-MM` (an invalid month reads as this India month). All call `requireAdmin()` first and show an error or notice only from a fixed code (`errorText` / `noticeText`).
- **Components** (`src/components/desk/private/concepts/`, each under 200 lines): `concept-list`, `concept-page`, `concept-chips`, `concept-picker`, `item-concepts`, `related-concepts`, `link-picker`, `seen-together`, `month-page`, `concept-check-row`.
- **Item page:** a "Concepts" row (chips, "Change" opens the picker under it); the checklist gets one line per linked concept that is not public (after the company line, counted in "n of m"); a read shows "A read stays private. It is not published." and no checklist or decision panel (`load.ts` also stops preparing a gate candidate for a read).
- **Items page:** "Concepts" and "This month" links; an "All / Reads" pair of links (`?kind=reading_note`); a read is called "read" in the list.
- **Desk home:** one quiet line, "This month: n learnings, m reads", linking to the month page; left out (error's name logged) if the count fails.
- **Tabs:** the Items tab stays current on `/desk/concepts*` and `/desk/learned`; still five tabs.
- **Knowledge module additions** (additive, tested): `screenedConceptRefs`, `conceptRefs` (service, exported from the entry), `monthLabel`, `MAX_ITEM_CONCEPTS` (a browser-safe 8 with a test that pins it to research `MAX_CONCEPTS`).
- **`PendingButton`** gained optional `variant`, `size`, `className`, `disabled` (all existing callers unchanged).

## The four binding notes
1. `ConceptChangePendingError`: the picker shows the plain refusal sentence and disables "Save concepts" whenever the item has a revision waiting (`pending.length > 0`, which is exactly research's condition; a private item has none). Pressing it is never the way to find out.
2. `updateConceptDescription`: reached through the existing `saveDescriptionAction` (T3 added it); the concept page's "In your words" box uses it. No new action was needed.
3. Theme + concept double finding: new pure `uniqueFindings` (themeName read as conceptName) applied in the recorded-decision panel and the "Elsewhere in this item" list; the allowed-sentences line is de-duplicated too. The checklist rows already showed only the first message.
4. "Concept" replaces "theme" on every new screen; the `#` token is unchanged.

## Evidence
- Red seen before green for the new components, pages, tabs, home line, items page and knowledge additions (missing module or missing behaviour).
- `rtk pnpm test`: 378 files, 5270 tests pass (T3 left 363 files, 5178).
- `rtk pnpm typecheck`: clean. `rtk pnpm lint`: clean, no warnings.
- `pnpm build` with the CI placeholder env: passes; routes `/desk/concepts`, `/desk/concepts/[slug]`, `/desk/learned` listed.
- e2e (local stack; setup, seed, desk-mobile at 375 and desk-desktop at 1280): `desk-a11y` (extended: the concept index, a concept page with every block, a read's item page with the picker open, and the month page, in light and dark; axe WCAG 2.2 A/AA clean, no horizontal scroll, a read has no publish panel), `desk-items`, `desk-gate`, `desk-links`, `desk-capture-screen`, `desk-fab-clearance` and the new `desk-concepts-screens` (real server actions: Link from a suggestion, Remove, his words saved and kept, the picker adding a concept and the row showing the order). 101 passed, 1 skipped (a skip already in those specs). The full desk project set was not re-run; Task 6 runs the whole suite.
- New e2e support `e2e/support/concept-world.ts` seeds three checked concepts, two learnings, a read and one edge with the admin's own rights; items cannot be deleted, so the `A11y ...` rows stay in the local database (names carry a run tag).
- defenso `guard_code`: not run (no such tool in this subagent, as in Tasks 1-3). The only request-body paths are the existing T3 actions; this task added no server code beyond reads.

## New strings pending Shlok's approval (all new or changed in Task 4)
Concepts index: title "Concepts"; intro and empty text as spec s14; page links "Items", "This month"; status "Private", "Public", "Not checked yet"; "Nothing linked yet"; "Last activity {date}"; counts "{n} Learnings / Files and case studies / Process / Reads / Notes" (the s14 headings used as count labels).
Chips: "not checked yet".
Concept page: back link "Concepts"; status lines as s14; "Check it on Names"; "Make public"; "In your words"; "What you mean by {name}"; "Private. Only you see this."; button "Save"; **"No note or file uses this concept yet."**; "Related concepts"; "Link a concept"; **"Choose a concept"**; "Link"; "Remove link to {name}" (the visible word is "Remove"); "Seen together in your notes" with the s14 caption; **"{n} notes in common"**.
Item row and picker: "Concepts", **"None yet"**, "Change"; "Concepts for this note"; **"Find a concept"**; **"Chosen, in order"**; **"Remove {name}"**; **"{n} of 8 chosen"**; "Up to 8. Saving makes a new version."; "Save concepts"; **"No checked concept matches."**; **"Showing the first 50. Keep typing to narrow the list."**; the T3 refusal sentence beside the button.
Checklist: row name "Linked concept"; `Concept "{name}" is not public yet.`; `Concept "{name}" is not checked yet.`; **"Make {name} public"**; "Check it on Names"; read panel "A read stays private. It is not published."
Month page: "What I learned in {Month YYYY}"; caption, "Learnings ({n})", "Reads ({n})", "No concept", empty text, "Earlier month", "Later month" as s14.
Items page: **"All"**, "Reads" (s14 kind tab), **"No reads yet. A line starting with r: logs one."**; the row word **"read"** (instead of "reading note").
Desk home: "This month: {n} learnings, {m} reads" with singular forms ("1 learning", "1 read") through `formatCount`, a small departure from the s14 string.
Screen-reader only (not visible): navigation labels "Concept pages", "Concepts and the month", "Show items", "Months".

## Choices where the brief left room (conservative reading each time)
1. **A native select for "Link a concept"**, a listbox picker only for an item's concepts (the spec says "a picker" for both).
2. **The reads filter is two links, not a tab**, because the Items page has no tabs; it filters the 100 most recent items, so an old read can scroll off it (the concept and month pages show every read).
3. **The picker offers checked concepts plus what the item already links** (a linked stub can be removed, never added), matching `saveItemConcepts`.
4. **"Make public" on the concept page returns to the concept page; the checklist's returns to the item** (it uses the T2 `makeConceptPublicAction`).
5. **Suggestions disappear entirely when empty** (no empty heading).
6. **Description save is open to a stub** (the catalog allows any live row).
7. **A failed concept read leaves the Concepts row out** and the editor still works, with only the error's name logged.

## Concerns for the reviewer
- **His words are trimmed at the ends only.** `updateConceptDescription` stores the trimmed text (T2), so the textarea returns his text minus leading and trailing whitespace. Inside, nothing is changed. The e2e pins this.
- **The concept page's "Make public" has no confirmation and the status text says what it does** ("shown on the site once a published note or file uses it"); the gate and Task 1's checks are what protect the public side.
- **`PendingButton` is shared.** The change is additive; the picker's "Save concepts" and the checklist's concept button rely on `disabled`.
- **Unchanged-list save:** pressing "Save concepts" with the same list is a quiet no-op in research (a notice "Concepts saved." still shows); I did not add a "no change" state.
- **The month line uses `formatCount`**, so counts of 1 read as "1 learning" and "1 read".
