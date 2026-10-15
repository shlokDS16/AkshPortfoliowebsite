# Phase 4 Task 2 report: the write path (research, capture, catalog, lint, wording)

Branch `phase-4-learning-graph`, built on 352f682. Local only, not pushed. Built by desk-backend (sonnet); review: folded into Task 7.
No SQL changed, so `pnpm supabase test db` was not re-run (Task 1's 2281 stand).

## What was built
- **research** (`schema.ts`, `types.ts`, `repo.ts`, `service.ts`, new `concepts.ts`, `index.ts`)
  - `ITEM_KINDS` gains `reading_note`. `createItemInput` and `addRevisionInput` gain `conceptIds: uuid[] | null` (max 8, default null). `appendRevisionInput.conceptIds` means "concepts to ADD to the latest revision's links" (previous first, repeats dropped, capped at 8); null or empty carries.
  - `Revision.conceptIds: string[] | null` (null only on a pre-Phase-4 row: read it as `[item.themeId]`). `NewRevisionRow.conceptIds` is optional (absent or null = carry), so the 12 existing `insertRevision` callers (cases, casefile) are untouched.
  - `repo.ts` reads `concept_ids` (the Task 1 `Omit` is gone) and omits the key from the insert when null, so the SQL trigger carries.
  - `setItemConcepts(repo, itemId, conceptIds, names: Record<id, name>)`: one revision, newest body and structured copied, author `aksh`, reason from the template, `theme_id` set to the first concept on a private item only (a public item writes the pending revision and leaves `theme_id`; a lost race to public is caught). The same ordered list writes nothing and returns the newest revision. A different order alone is a new revision (the first is the primary concept). A missing name throws `InvalidInputError` (caller bug).
  - Exports: `setItemConcepts`, `conceptChangeReason`, `unionConceptIds`, `MAX_CONCEPTS`.
- **capture** (`parse.ts`, `compose.ts`, `service.ts`, `refile.ts`, grammar key row)
  - `r:` / `R:` is kind `reading_note` (`PREFIX_RE` `[tlpr]`); the prefix span and highlighter needed no change beyond that. `r:` key on the phone key row (`aria-label` "r: read").
  - `fileCapture` links every resolved `#name` in order, at most 8, into `conceptIds`; the first is still `items.theme_id`. Resolution stops at the 8th, so a 9th tag makes no stub and stays text. An ignored token takes no place. No tag files null.
  - `t:` append sends the new ids; research unions them with the previous revision's (a legacy null reads as the theme).
  - Receipt shows a chip per concept (up to 8) and, past 8, the line "Only the first 8 concepts were linked." (joined to the thesis warning when both apply). `MAX_LINKED_CONCEPTS` lives in `parse.ts` because `capture/client` must stay browser-safe; a test pins it equal to research `MAX_CONCEPTS`.
- **catalog** (new `concepts.ts`, `errors.ts`, `actions.ts`, `index.ts`)
  - `setThemePublic` (screened, unarchived only, else `NameNotScreenedError`), `updateConceptDescription` (trim, blank or null to null, over 2000 UTF-16 units refused with `ConceptDescriptionTooLongError`, archived or missing row refused), `listConcepts` (screened live, by name), `getConceptBySlug` (live, a stub included; malformed slug is null without a query), `makeConceptPublicAction(conceptId, itemId)` beside the company one.
- **compliance**
  - `LintInput` and `PublishContext` gain `conceptNames` / `conceptSlugs` (required). `lint.ts` lints each as a plain field `conceptName` / `conceptSlug` (slug hyphens read as spaces). `repo.ts` reads the gated revision's `concept_ids` and loads the live (unarchived) themes in the revision's own order. `LINT_FIELDS` gains the two fields. `policy.ts` labels `concept`, `reading_note`, and `theme` now "Linked concept".
- **Wording**: user-facing "theme" to "concept" in the capture placeholder, key row, receipt, Names card and its empty state, `item-rule` message (`messages.ts` and `errors.ts`), the two guides in `docs/guide/`.
- Fixtures: `themeName: null,` in 12 test files gained `conceptNames: [], conceptSlugs: [],`; the memory research repo mirrors the carry trigger.

## Evidence
- Failing tests seen to fail first for each part (research 7 failed, capture 19 failed, catalog module missing, compliance via missing fields).
- `rtk pnpm test`: 354 files, 5085 tests pass (Task 1 left 348 files, 5014). `pnpm typecheck` and `pnpm lint`: clean.
- No public source file changed (`src/app/(public)`, public components, `showcase` source untouched; the only `showcase` edit is the two `LintInput` fixtures in `showcase/file.test.ts`); `isolation.test.ts` and the research, capture, catalog graph tests pass.
- defenso `guard_code`: not run (tool not reachable from this subagent, as in Task 1). The opus review stands in.
- New test files: `research/concepts.test.ts`, `research/repo.test.ts`, `capture/service.concepts.test.ts`, `catalog/concepts.test.ts`, `catalog/actions.test.ts`, `compliance/lint.concepts.test.ts`, `compliance/repo.concepts.test.ts`; additions to the schema, parse, highlight, compose, publish, policy, names, capture-key-row and today-list tests.

## Wording pending Shlok's approval (every new or changed string)
Desk, capture:
- Placeholder: "What did you just notice?   $company  #concept  t:  l:  p:  r:"
- `r:` key accessible name: "r: read"
- Receipt kind chip: "Reading log, private". Spec s14 says "will file under Reading log"; the receipt always starts "Will go to", so the chip follows the existing "Learning note, private" pattern. Change if he prefers the spec's words.
- Receipt, tags dropped: "Only the first 8 concepts were linked."
- Today list kind line for a read: "reading log"
- Names card label "concept · first seen {date}", buttons "New concept", "Not a concept, keep as text"; New names empty state "No new names. Unknown $symbols and #concepts from your captures appear here."
- Rejected-values message: "The database rejected these values. Check the fields (title, kind, linked company or concept) and try again."

Change reason (fixed template, his act; becomes public with the revision on a public item):
- "Concepts: added A, B." / "Concepts: removed C." / "Concepts: added A, B; removed C."
- "Concepts: order changed." (not in spec s14; for a reorder with the same set)
- "Concepts: added 3; removed 1." (counts, used only when the names pass the 300-unit reason limit)

Gate and lint:
- Rule labels: "Linked concept" (rules `concept` and `theme`), "Reading log" (rule `reading_note`)
- Lint field labels on the gate panel: "Linked concept name", "Linked concept slug" (the old "Theme name" label is now "Linked concept name" too)

Concept actions:
- Error: "That is over 2,000 characters. Shorten it."
- Notice after "Make public" on a concept: "Concept made public. It is shown only once a published note or file uses it."

Guides: `docs/guide/using-the-desk.md` and `aksh-quick-guide.md` (concept wording, the `r:` row, "up to 8").

## Choices where the brief left room (conservative reading each time)
1. `appendRevision.conceptIds` = "add to the previous", not "replace", because the append is the one place the union lives and the revision is already loaded there.
2. `getConceptBySlug` returns a stub (needs_review) so a chip on an item can open a page that says "Not checked yet"; `listConcepts` returns screened rows only, as the plan says.
3. `setItemConcepts` takes `names` as a plain object id to name. An unchanged list is a no-op instead of an empty revision.
4. Compliance reads a null `concept_ids` as no concepts (the item's `themeName` already covers the legacy theme), so nothing is linted twice for old rows.
5. `MAX_LINKED_CONCEPTS` is a second copy of 8 (browser-safe file); a test keeps it equal to the research one.

## Concerns for the reviewer
- **The plan's lint example does not hold.** "Exit multiples" is not a rule 1 finding: the lexicon deliberately exempts "exit multiple" (corporate-finance term). The tests use "Multibagger ideas" and "Accumulate on dips" for the flagged cases, and one test pins that "Exit multiples" passes. The Task 7 and e2e plans should not expect a finding there.
- **A change reason can carry a concept name into public text.** On a public item, a removed concept's name sits in the pending revision's reason, which publishes with the revision. The guards freeze a concept while the current revision links it, so the removed name was public at that time. The gap: a private concept added in an earlier pending revision and removed in a later one. Rare; Task 4 may want to refuse concept changes while a pending revision exists, or name only public concepts.
- A concept that is also the item's `theme_id` is linted twice (`themeName` and `conceptName`), so a flagged name shows as two findings; one allowance clears both (same hash).
- `ensureTheme` finds a theme by slug including an archived one. A capture can then link an archived concept; the Task 1 trigger drops it silently, while `items.theme_id` still holds it. Existing behaviour, not widened here.
- Task 4 must call `setItemConcepts` with `names` for every id in both the old and the new list, and `makeConceptPublicAction` for the checklist line. `description_md` has no desk action yet (`updateConceptDescription` is module-level only).
