# Phase 4 spec: the learning graph (concepts, links, a reading log, the month in review)

Status: written 2026-10-15 by desk-architect on Shlok's delegation (he reviews and merges this evening). Decisions D45-D62
below, each with its cost if wrong. Built by `docs/plans/2026-10-15-phase-4-learning-graph.md`. Branch `phase-4-learning-graph`,
stacked on `phase-3b-case-studies` (last migration 0019); this phase adds 0020 and 0021.
Binding parents: ADR-001 s4 (module `knowledge`; "cut from v1: visual graph rendering"); Phase 1 spec s3 (themes, items,
revisions, `publish_revision()`), s5 (capture grammar), s6 item 6 (linked learning notes); `docs/compliance/publishing-rules.md`
(rules 1-9, rule 7 and 8 above all) and the v1.1 addendum (rule 10, unchanged here); `docs/design/decisions.md` segment 2
("Read first" / "Used in" kept; inline concept links rejected); Phase 3 spec s33 and the addendum s6 (the Mistakes page is
filled from published ledger lessons; this phase does not touch it). No ADR changes.

## 1. Problem
Aksh writes `l:` learnings and tags captures with `#capital-cycle`, but nothing gathers them. A tag today links an item to one
theme row that no screen shows, no item can have two, and an item that carries a theme can never be published (the gate
refuses "The linked theme is not public." and nothing can make a theme public: `docs/specs/technical-debt.md`, Plan 1B line).
He has no place to log what he read, and no way to look back at a month. Roadmap items 4.1-4.3 ask for concepts and their
links, concept pages that link to the analyses where each was applied, a reading log, backlinks and "what I learned this month".

## 2. Current state (what is reused)
- `themes` (catalog): `slug`, `name`, `description_md`, `visibility` (default private), `needs_review` (stub until screened on
  Names), `archived_at`. Created by `ensureTheme` from a `#token`; screened by `decideName` ("new" keeps the row, "ignore"
  archives it; there is no theme merge). Anon may read `id, slug, name, visibility` through `themes_public_read` (theme public
  AND a public item has `theme_id` = it) and the view `public_themes` (same predicate). No path sets a theme public.
- `items.theme_id`: one theme per item, set by capture to the first `#token`. The gate checks it (rule code `theme`); the
  catalog guards keep a theme public and its name and slug frozen while a public item names it.
- `item_revisions`: append-only, every public change gated by `publish_revision()` (latest body in
  `20261015000019_case_gate.sql`, 162 lines). The TS lint (rule 8 surface) already reads `themeName`.
- Public "Read first" (a file lists up to 4 learning-note slugs) and "Used in" on a learning note, dated from the first gated
  revision that listed it (Plan 1B D25). These stay; concepts are a topical index beside them, not a replacement.
- Capture: one box, grammar `$ # t: l: p:`, every capture stored verbatim first, filed into an item (`fileCapture`), refile
  after 10 minutes. URLs in a capture are stored only (no ingestion job).
- Public side reads one cached snapshot (`src/modules/showcase`, anon client, ISR 1 h, `updateTag` on publish).

## 3. Options considered (the structural choice: what a concept is and where a link lives)
| Option | Shape | Verdict |
|---|---|---|
| A. New `concepts` + `concept_links` tables | concepts separate from themes; a mutable join table item-concept | **Rejected.** Two sources of truth beside `#theme` (which one does `#moat` create?); a link added to a public item would change the public page with no gate decision (rule 7 says every change to the public surface is gated) |
| B. Concept = a learning note | each concept is one `learning` item; links are "Read first" | **Rejected.** A concept accumulates many dated learnings over months; one note cannot be both the node and the entries; "Read first" is capped at 4 and means "read before this file", not "uses this idea" |
| C. Concept = a screened theme; links in a key of `structured` | reuse `themes`; `structured.concepts` | **Rejected.** `structured` holds casefile data with machine-extracted facts, so his choices would share a field with machine data; every save path must carry the key (the 3b `ledger` carry-over risk again); the lint would walk ids as prose |
| **D. Concept = a screened theme; links on the revision in their own column** | reuse `themes`; `item_revisions.concept_ids uuid[]` (his ordered choice, carried forward by SQL when a write omits it); `concept_links` is a view over the latest revisions; `concept_edges` a small table | **Chosen.** One source of truth for the node (the row `#moat` already creates); a link is versioned with the revision that made it, diffable and public only through `publish_revision()`; no casefile change; no new public grant beyond one column and one view |

**Tradeoffs of D.** Changing an item's concepts writes a revision ("Concepts: added Moats.") and, on a public item, waits for
the gate like any edit. The roadmap's three table names map to: concepts = `themes` (no new table), concept_links = the view,
concept_edges = the table. **Risks.** A future write path that copies `structured` but sets `concept_ids` to `'{}'` would
silently drop links (mitigation: null means "carry", only the concept picker sends an explicit array; a pgTAP test pins the
carry). The legacy rule (null on an old revision = `[items.theme_id]`) lives in one SQL view and one TS function only.
**Future evolution.** Typed relations on `concept_edges` (an added nullable `kind`); public edges once a gated home for them
exists (s8); pgvector suggestions only if ADR-001's cut is lifted.

## 4. Data model (migration `20261016000020_knowledge.sql`)
- `items.kind` check gains `'reading_note'` (constraint `items_kind_check` dropped and re-added). The word "reading" alone is
  taken in code by kill-criteria test readings (`readingAsOf`, `e2e/desk-readings.spec.ts`).
- `item_revisions.concept_ids uuid[]` nullable. Check: `cardinality <= 8` and no null element. BEFORE INSERT trigger
  `private.carry_concept_ids()` (security definer, `search_path = ''`, executable by no API role):
  1. when `new.concept_ids is null`: the previous revision's (highest `rev_no` of the item) array; for the first revision,
     or when every earlier one is null, `array[items.theme_id]` when set, else `'{}'`;
  2. keep the first occurrence of each id (order kept: the first is the primary concept), drop ids of archived themes;
  3. raise `23503` `concept_ids: unknown concept` for an id with no `themes` row; raise `23514` above 8.
  Existing rows stay null (no backfill: revisions are append-only and a gated revision must not gain links after its gate).
- `themes` check `themes_public_is_screened`: `visibility <> 'public' or (needs_review = false and archived_at is null)`. So an
  archived or unscreened theme is never public and the anon predicates need no `archived_at` column.
- `concept_edges(id uuid pk, concept_a uuid not null references themes, concept_b uuid not null references themes,
  created_at timestamptz default now())`, check `concept_a < concept_b`, unique `(concept_a, concept_b)`, index on
  `concept_b`. RLS: `to authenticated` select, insert, delete gated on `private.is_admin()`; no update; nothing for anon or
  service_role. Undirected, no label, no note.
- View `public.concept_links` (security_invoker; select granted to `authenticated` only): per item, its latest revision
  (`distinct on (item_id) order by rev_no desc`), unnested with ordinality into `(item_id, revision_id, concept_id, position)`,
  legacy rule applied (`coalesce(concept_ids, array[theme_id])`, null elements dropped), archived themes filtered. Admin RLS on the base tables does
  the rest (a non-admin session reads nothing).
- Public read (anon). `grant select (concept_ids) on item_revisions to anon`. `themes_public_read` and `public_themes` are
  replaced with the existing predicate OR "a public item whose CURRENT revision's `concept_ids` contains this theme". New view
  `public.public_concept_links` (security_invoker; anon and authenticated): `(item_id, revision_id, concept_id, position)` for
  every revision that passed the gate of a public item (`private.is_public_item` and `private.revision_passed`, as
  `public_item_revisions`), only for concepts in `public_themes`, with the same legacy rule as `concept_links` (a null array
  reads as `[items.theme_id]`, null elements dropped), so a theme made public through `theme_id` alone never shows as a
  concept with no items. The existing public views, `private.is_public_item`, the
  item and revision policies and the 30-day lag are unchanged.
- Guards: `private.guard_catalog_visibility()` and `private.guard_catalog_public_columns()` are restated with "a public item
  uses it" widened, for themes, to "or its current revision's `concept_ids` contains it".

## 5. The gate (migration `20261016000021_knowledge_gate.sql`)
`publish_revision()` is restated whole from 0019 with three changes: it reads `concept_ids` with `structured`
(`select r.structured, r.concept_ids into v_struct, v_concepts`), the existing `theme` failure's message reads "The linked
concept is not public." (rule code unchanged), and after that check it adds
`v_failures := v_failures || private.knowledge_gate_failures(v_item.kind, v_item.theme_id, v_concepts);`. The helper returns
recorded failures (never raises):
- rule `reading_note`, "A reading log entry stays private.", when the kind is `reading_note`;
- rule `concept`, `The linked concept "{name}" is not public.`, once per id in `v_concepts` other than `v_item.theme_id`
  (which the existing `theme` check already covers) whose theme is not archived and not public. Archived ids are ignored
  (never shown anywhere). A null `v_concepts` adds nothing (legacy: only `theme_id`, already checked).
Policy version unchanged (`sebi-unreg-2026-07-v1.1`): these are catalog-consistency and privacy checks of the same class as
`company` and `theme`, not a publishing rule (D56). The TS lint gains the linked concepts' names and slugs as rule-8 fields
(`conceptName`, `conceptSlug`), read server-side from the stored revision like `themeName`.

## 6. Capture and the reading log
- Grammar: `r:` prefix = kind `reading_note` (case-insensitive like `t: l: p:`). A read is one action in the same box:
  `r: Marks, "Sea Change" memo. Rates regime over #interest-rates https://...`. Title = first line, body = his words, the URL
  stays in the body, the date is the capture's. No extra fields (no author, no source type, no "finished on").
- Every resolved `#token` (not only the first) becomes the new item's `concept_ids`, in order, at most 8 (the 9th onwards stay
  text and the receipt says so). `items.theme_id` is still the first (legacy, the gate's `theme` check, Names' first-quote).
- `t:` appending to a thesis: the revision's `concept_ids` = previous ∪ new tokens (order: previous first); no token = null
  (carry).
- Reading notes are private for good in this phase: the desk shows no publish panel for them and the gate refuses them in SQL.
  They appear in the Items list (kind tab "Reads"), on concept pages and on the month page. Daily-use evidence on the public
  side is already the capture streak, which counts every `r:` capture.

## 7. Desk (private)
- `/desk/concepts`: screened, live concepts by last activity: name, status (Private / Public / Not checked), counts per kind.
  Linked from the Items page header ("Concepts", "This month") and every concept chip. No new tab (five already).
- `/desk/concepts/[slug]`: status line and "Make public" (screened only); "In your words": `description_md`, his text only,
  private, up to 2000 characters, never written by the machine; then the items whose latest revision links the concept,
  grouped Learnings, Files and case studies (thesis, case_study), Process, Reads, Notes, each newest first with its date and
  link; "Related concepts" (his edges: add from a picker of screened concepts, remove); "Seen together in your notes"
  (machine, visibly labelled): up to 3 concepts that share at least 2 items with this one and are not yet related, each with
  "Link", which writes HIS edge. Suggestions are computed on read and never stored (D49).
- Item page: a "Concepts" row (chips to concept pages; "Change" opens a picker of screened live concepts, up to 8, order =
  tap order). Saving appends a revision with the same body and structured, `concept_ids` set, change reason
  `Concepts: added {A, B}; removed {C}.` (fixed template, his act), author `aksh`; on a private item it also sets
  `items.theme_id` to the first concept (or null). On a public item the change is a pending revision like any edit.
  Publish checklist: one line per linked concept that is not public, with "Make public" for a screened one and "Check it on
  Names" for a stub (mirrors the existing company line). A reading note shows "A read stays private. It is not published."
  instead of the publish panel.
- `/desk/learned?m=YYYY-MM` (default the current India month; "Earlier month" / "Later month"): "What I learned in {Month
  YYYY}". Machine-assembled, labelled so: his `learning` items first written in that India month (by `items.created_at`),
  grouped under their first live concept (groups by name, "No concept" last), each line his title verbatim, its date and link;
  then "Reads" (his `reading_note` titles verbatim, by date). Counts in the machine face. Nothing summarised, shortened,
  re-worded or ranked by the machine; no LLM. Ledger lessons are not included (they are the ledger journal's and, published,
  the Mistakes page's: Phase 3 s33).
- Desk home: one quiet line under today's list, "This month: {n} learnings, {m} reads", linking to the month page.
- Wording: the user-facing word becomes "concept" (D46): capture placeholder `#concept`, key row, receipt, Names cards
  ("New concept", "Not a concept, keep as text"), the rule label "Linked concept", the guide. Code, tables and the `#`
  token are unchanged.

## 8. Public
- **Nothing changes at deploy** (D55). A concept is public only when (a) he pressed "Make public" (screened only) and (b) the
  current gated revision of a public item links it. No theme is public today, and every existing revision has
  `concept_ids` null, so `/concepts` is a 404 and no page shows a concept line until he publishes a revision that links one.
- `/concepts` (404 while empty): each public concept, A to Z, with the number of public notes and files that use it.
  `/concepts/[slug]` (404 when not public): the name; a fixed rendered standfirst; "Notes" (public learning and process notes),
  "Applied in" (files with file number and company, ledger case studies through `caseHref`), each with title, learning
  objective and "Since {date}" = the first gated revision of that item that linked the concept (D25's rule). No description,
  no edges, no counts across ideas, no ledger data. The site disclosure line as on every public page.
- File and note pages: one labelled "Concepts" line (not inline in the prose, so segment 2's rejection of inline concept links
  stands) listing the public concepts of the CURRENT gated revision, linking to their pages. Absent when there are none. The
  3b case page is unchanged.
- Data: the snapshot loads `public_themes` and `public_concept_links` optionally, like `factChecks`: any error gives no
  concept UI and logs the code only, so a deploy that reaches production before its migration never breaks a public page.
- Concept edges are private in this phase (D51): an edge carries no gate decision, and every public change goes through
  `publish_revision()`.

## 9. Compliance treatment
- Rule 7: links are on the revision, so they reach the public only with a passing gate decision; a public item's concept change
  is a pending revision. Rule 8: linked concept names and slugs are linted with the revision; names and slugs are frozen while
  a public item's current revision links the concept (guards in s4). Rules 1-6, 9, 10 unchanged; the concept page shows only
  text already gated (titles, learning objectives) plus fixed rendered sentences (excluded from the scan like the disclosure).
- No new path to public: "Make public" on a concept exposes nothing by itself (same as `setCompanyPublic`). Anon gains one
  column grant and one view; `pgTAP` pins the full anon inventory.
- His words vs the machine: his words are titles, bodies, the concept description and his edges; the machine's are dates,
  counts, groupings and suggestions, rendered in the machine face and labelled. The month page never rewrites a title.

## 10. Degradation and failure modes
No LLM, OCR, transcriber, cron step or new dependency, so no free-tier quota is touched. Storage: arrays of at most 8 ids per
revision. Supabase paused: public pages from the ISR cache; the desk's existing banner. Concept data unavailable on the public
side: pages render without the concept line, `/concepts` 404s (logged code). A capture with an unknown `#token` still files
(stub; the concept waits on Names); a stub or private concept blocks publish with a line that says how to fix it. The
`concept_links` view scans latest revisions per item: fine to tens of thousands of revisions; past that, materialise it.

## 11. Testing
pgTAP (carry, legacy, kinds, constraint, edges RLS, both views, guards, gate, anon inventory), Vitest (parser, capture,
research, catalog, lint, knowledge service, month boundaries in India time, suggestions, showcase builders, isolation and
graph tests), Playwright (a full loop on the local stack: capture with two concepts, screen, link, publish, signed-out pages;
then unpublish), desk and public axe. Details per task in the plan.

## 12. Out of scope
Public edges, a public reading log, a public month page, typed relations, a visual graph (ADR-001 cut), merging or renaming
concepts, LLM or embedding suggestions, wiki-style `[[links]]` in prose, concept chips on the 3b case page, newsletter use of
the month page (Phase 5).

## 13. Decisions made on Shlok's behalf (cost if wrong)
| # | Decision | Rejected | Cost if wrong |
|---|---|---|---|
| D45 | A concept is a screened theme row; no `concepts` table | new table; concept = a learning note | A field themes lack: an additive column on `themes` |
| D46 | User-facing word "concept" everywhere; `#` token unchanged | keep "theme" (reads as a basket of stocks: "defence theme"); two words | Revert about 15 strings and their test assertions |
| D47 | Links on the revision (`concept_ids`), carried by SQL when omitted; changing them is a revision | mutable join table (public without a gate); a `structured` key | History shows "Concepts: ..." revisions; a public change waits for publish |
| D48 | `concept_links` is a view over latest revisions; legacy null = `[theme_id]`; no backfill | a table kept in sync; backfilling append-only rows | None at this size; materialise later |
| D49 | Edges only from his taps; machine co-occurrence suggestions computed on read, never stored | stored suggestions with confirm state; LLM suggestions; typed relations | A suggestion he dislikes keeps showing (no dismiss) |
| D50 | Public concept = "Make public" + linked by a current gated revision; description private | public description; auto-public | No definition on the public page unless he writes a learning note for it |
| D51 | Edges private this phase | public edges with no gate decision | The public side shows no "related" links |
| D52 | Reading log = kind `reading_note` via `r:`; private; refused by the gate in SQL | separate `readings` table and second capture path; a marker on notes | A public reading log later: one SQL condition and a route |
| D53 | Month page private, from `learning` items first written in the India month and that month's reads, titles verbatim | public monthly page; ledger lessons in it | An allocator does not see the month |
| D54 | No new desk tab | a sixth tab | One more tap |
| D55 | Zero public change at deploy (s8) | show `/concepts` empty | None |
| D56 | Policy version unchanged | bump to v1.2 | If legal reads the concept check as a publishing rule: a one-line migration and constant |
| D57 | Concept names and slugs linted as rule-8 fields | not linted (names are catalog data) | A concept named "Exit multiples" needs a rule-1 sentence allowance per item |
| D58 | Concept page lists ledger case studies under "Applied in" by `caseHref`; case page unchanged | exclude them; add chips to the case page | None (the case is public anyway) |
| D59 | Picker offers screened concepts only; new concepts come from `#name` in a capture | create concepts in the picker | One capture to coin a concept |
| D60 | Concept data loads optionally on the public side | required load | A broken view hides concepts silently (logged code) |
| D61 | At most 8 concepts per revision | unlimited | A 9th tag stays text |
| D62 | `r:` captures do not fetch the URL | ingest the page | He keeps the link only |

## 14. Copy (rendered, not typed; every string pending Shlok's approval)
Desk: placeholder "What did you just notice?   $company  #concept  t:  l:  p:  r:"; key-row hint for `r:` "read"; receipt
"will file under Reading log"; receipt when tags were dropped "Only the first 8 concepts were linked."; Names "New concept",
"Not a concept, keep as text"; index title "Concepts", intro "Every #name you write becomes a concept. Its page gathers your
notes on it.", empty "No concepts yet. Write #name in a capture, for example #capital-cycle."; status "Private", "Public: shown
on the site once a published note or file uses it.", "Not checked yet. Check it on Names.", button "Make public"; "In your
words", label "What you mean by {name}", hint "Private. Only you see this."; group headings "Learnings", "Files and case
studies", "Process", "Reads", "Notes"; "Related concepts", "Link a concept", "Remove link to {name}"; "Seen together in your
notes", caption "The desk found these in the same notes. Link one only if you see a connection.", button "Link"; item row
"Concepts", "Change", picker "Concepts for this note", hint "Up to 8. Saving makes a new version.", "Save concepts"; change
reason "Concepts: added {A}; removed {B}." (a part is omitted when empty); checklist `Concept "{name}" is not public yet.`,
`Concept "{name}" is not checked yet.`, "Check it on Names"; reading note "A read stays private. It is not published.";
month title "What I learned in {Month YYYY}", caption "Put together by the desk from your dated learnings and reads. Your words
are shown as you wrote them.", "Learnings ({n})", "Reads ({n})", "No concept", empty "Nothing logged in {Month YYYY}. A line
starting with l: is a learning; r: is something you read.", "Earlier month", "Later month"; home line "This month: {n}
learnings, {m} reads"; Items header "Concepts", "This month"; kind tab "Reads"; rule labels "Linked concept", "Reading log";
SQL messages in s5.
Public: `/concepts` title "Concepts", standfirst "The ideas Aksh uses to read a business, each with the notes and files where
it comes up."; concept standfirst "Notes and case files by Aksh Agrawal that use {name}, newest first."; headings "Notes",
"Applied in"; meta "Since {date}"; line label "Concepts".

## Why this impresses an allocator
An allocator wants to know whether an analyst has a process or a collection of opinions. The concept pages show the handful of
mental models Aksh actually uses, each tied to the dated files where he applied it and the notes where he worked it out, and
every one of those links entered the public record through the same gate, on the same versioned revision, as the text it sits
on: a reader can see when "capital cycle" first appeared in a file and that it was not added after the outcome. Nothing on the
page is written by a machine; the desk only gathers what he wrote. Read in ten seconds, it says "framework first, companies
second", which is how an AMC head wants a young analyst to think.
