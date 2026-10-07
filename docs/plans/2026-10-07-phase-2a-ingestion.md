# Phase 2A Ingestion (manual first, PDF reading, Groq extraction, review, provenance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Aksh file cited figures from annual reports into his company files in three slices, each shippable on its own: (A) manual: a `Notes` source type and fact topics in the existing Facts form; (B) documents: upload a PDF, have its pages read and the statement pages found, and read any page beside the editor while typing figures; (C) AI: Groq reads the chosen pages inside a budget governor, Aksh reviews flagged values one at a time, files the rest into the editor, and the saved revision records the provenance of every machine-read figure.

**Architecture:** Postgres is the job store (`jobs`, `job_steps`, lease + `FOR UPDATE SKIP LOCKED`), pumped by the GitHub pump, the daily cron, an `after()` kick on upload and the open inbox tab; every step is resumable, idempotent and under 240 s. Job code runs with the secret-key client created only in `src/modules/ops` and receives a `Db`. Two new modules: `documents` (documents, pages, upload, page selection, verbatim check) and `ingestion` (queue, runner, step handlers, governor, extraction, proposals, review, staging, provenance). Provider ports and the Groq adapter live in `src/lib/providers/` (ADR-001 s4). Machine output lives in `extractions` and `proposals`; it reaches a file only as staged rows in the Facts form, saved by the one existing action, `saveCaseFileRevisionAction` (ADR-004 s4.2, s4.7).

**Tech Stack:** Next.js 16.3.8 App Router, React 19.2, TypeScript strict, Zod 4.6.5 (`z.toJSONSchema`), Supabase (Postgres, Storage, pgTAP), `unpdf` 1.8.1 (new runtime dependency, MIT, no dependencies; Task 6), Groq chat completions over `fetch` (no SDK), Vitest 5 + jsdom + Testing Library, Playwright 1.63.

**Spec:** `docs/specs/2026-10-07-phase-2-ingestion-design.md` (binding). ADR: `docs/architecture/ADR-004-ingestion.md` (Proposed; s4.2 matrix binding). Read with `docs/compliance/publishing-rules.md`, `docs/rubrics.md`, `docs/design/component-inventory.md` (InboxSection, ReviewOneAtATime, PageText), `docs/design/decisions.md` segment 4, and the Plan 1B rulings `docs/plans/2026-10-07-phase-1b-rulings.md`.

**Scope:** progress items 2.1-2.4, 2.5 (PDF digital only), 2.6, 2.8 (inbox and review screens of segment 4), 2.9, 2.10. Out: scans/OCR, images, voice, links, digest, classifier, re-read, public provenance line (Plan 2b); XLSX valuation 2.7 (own spec, 2c).

## Global Constraints

Every task implicitly includes these.

- **The machine never writes a revision.** No file under `src/modules/ingestion/`, `src/modules/documents/` or `src/app/desk/inbox/` imports `addRevision`, `appendRevision`, `createItem`, `createSupabaseResearchRepo` or `@/modules/casefile/actions` (`ingestion.graph.test.ts`, Task 5). Job code (anything run by the runner) uses only the `Db` handed to it by `src/modules/ops`. Machine output is never written to `body_md`, `change_reason` or any field in ADR-004 s4.2's "never" row, not even as a proposal.
- **One save path.** Staged machine rows are saved by `saveCaseFileRevisionAction` (`src/modules/casefile/actions.ts`) and nothing else.
- **Quotas are facts.** Every limit used in code comes from spec s9 (verified 2026-10-07) and lives in one constant file per provider (`src/modules/ingestion/caps.ts`, `src/modules/documents/limits.ts`). A changed number needs a spec s9 edit with a source URL.
- **Tests never call Groq** (`LLM_ADAPTER=fixture` in e2e; fake `LlmPort` in unit tests). The one live check in Task 9 is manual and is not committed as a test.
- **Migrations** are applied to the local stack only (`pnpm db:reset`); the controller pushes to hosted after review with `pnpm supabase db push --dry-run` first. Regenerate types with `pnpm db:types` after each migration.
- **Explicit column lists** on every Supabase read (no `select("*")`): "PostgREST select=* returns 42501 under column grants".
- **Files under 300 lines, components under 200** (Plan 1B constraint). Split before crossing.
- **Tokens only** for colour, type and motion in components (Plan 1B Global Constraints, unchanged); Server Components by default; `"use client"` only in leaves with input or animation.
- **Copy** shown to Aksh is the text in the spec s7 and s10 tables, second person, plain English; never "error", "failed job" or "quota" without the plain sentence beside it.
- **Secrets** only via `src/lib/env.server.ts`. New variables are listed per task in "New environment variables" below.
- **Security review:** run `defenso guard_code` on Tasks 3, 4, 5, 9, 10, 14 diffs (auth, storage policies, env, request bodies, provenance).
- **Commit** after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the implementer's real model, per ruling G11). Pushing follows the controller's policy.
- Prefix heavy CLI with `rtk` (`rtk pnpm test`). Supabase CLI only as the pinned devDependency (`pnpm supabase ...`).
- Never run two implementers at once (CLAUDE.md).

## Before Task 1 (controller)
- Branch: cut `phase-2a` from the head of `phase-1a` (33cb302 or later) unless the controller rules otherwise.
- The 3-day usage trial runs on the preview built from `phase-1a`. Slice A changes the Facts form Aksh is trialling: do not deploy Slice A to the preview until the trial ends (or Shlok says otherwise). Slices B and C add a new tab and do not change Phase 1 screens apart from the editor's document pane (Task 8).
- Q11 (per-revision Figures-to) is out of scope; Task 14 shows the existing note when staged figures are newer than a public file's Figures-to.

## Decisions this plan makes (record in ADR-004 when the plan is accepted)
- **E1 Action placement.** All inbox and review server actions live in `src/modules/ingestion/actions.ts`; read-only page actions in `src/modules/documents/actions.ts`. The pump kick and the tab loop live in `src/app/desk/inbox/pump-actions.ts` because they import `@/modules/ops/jobs`, and `ops` imports `ingestion` (no module cycle).
- **E2 Derived states.** `documents.status` is coarse (`uploading`, `active`, `done`, `skipped`); trays, progress and ETA are computed from `job_steps` and `proposals` by pure functions (`ingestion/trays.ts`). Nothing to keep in sync.
- **E3 Statements are read as two columns** (current, prior). Period and unit come from the page's headers through code (`ingestion/periods.ts`), not from the model.
- **E4 Verified rows are pre-ticked** on the review screen; flagged rows are resolved one at a time (ADR-004 s5).
- **E5 `research` gains one read-only query**, `latestFileForCompany(db, companyId)`, returning the company file's id, title and latest `structured`. Ingestion uses it for label matching and File under; it is not a write path and is allowed by the graph test.
- **E6 Fixture LLM** is chosen by `LLM_ADAPTER=fixture` (local and CI only, never on Vercel).
- **E7 Queue health.** `public.queue_age()` (anon, numbers only) and a `queue` check in `/api/health`: unhealthy when a runnable step has waited more than 6 h. Waiting on quota (`not_before` in the future) is not runnable, so it is never a failure.
- **E8 `documents.source_type`** (the source type the document's `S` row gets) is chosen at File under; default `Annual report`.
- **E9 Storage meter** warns at 70% and refuses new uploads at 90% of 1 GB.
- **E10 Topic display (default A):** a topic is the group heading; each row shows its period after the metric ("Revenue from operations · FY26"); facts without a topic stay grouped by period after the topic groups. desk-ui shows Shlok A and one alternative before Task 2 ships.
- **E11 Staging is a client-side merge** into the Facts form draft (`facts-form/staged.ts`), reusing `nextId` so ids are never reused.
- **E12 Relevance numbers:** "moved" means |change| >= 20% year on year, at most 3 per page; at most 60 proposals per document; dedupe key `normalisedLabel|period|basis`.
- **E13 Migration names:** `20261007000006_documents_jobs.sql` (Task 3), `20261007000007_extraction.sql` (Task 10); tests `supabase/tests/0006_documents_jobs.test.sql`, `0007_extraction.test.sql`.

## New environment variables (the controller sets these in Vercel)
| Task | Variable | Where | Value |
|---|---|---|---|
| 1-8 | none | | |
| 9 | `GROQ_API_KEY` [SECRET] | Vercel Preview + Production, `.env.local` | Groq console key (one account only, ADR-004 s4.1 item 1). Optional in the schema: unset means "AI reading is off". |
| 9 | `GROQ_MODEL_TEXT` | optional | default `openai/gpt-oss-120b` (already in `.env.example`) |
| 9 (schema), 12 (e2e app env) | `LLM_ADAPTER` | local `.env.local` and the e2e app env only; **never on Vercel** | `fixture` for tests; unset means `groq` |
| 10-16 | none | | |

`.env.example` already lists `GROQ_API_KEY` and `GROQ_MODEL_TEXT` as `[REQUIRED-P2]` / `[OPTIONAL]`; Task 9 adds `LLM_ADAPTER` with a `[DEV-ONLY]` label. No mailer variable is added (ADR-004 s3.6).

## File structure
```
supabase/migrations/20261007000006_documents_jobs.sql          Task 3
supabase/migrations/20261007000007_extraction.sql              Task 10
supabase/tests/0006_documents_jobs.test.sql, 0007_extraction.test.sql
scripts/make-fixture-pdf.mjs  ->  e2e/fixtures/annual-report.pdf (Task 6)
src/lib/desk-types.ts                         + "Notes" (Task 1)
src/lib/env.server.ts                         + GROQ_API_KEY?, GROQ_MODEL_TEXT, LLM_ADAPTER? (Task 9)
src/lib/providers/  llm.ts strict-schema.ts groq.ts fixture-llm.ts fixtures/statement-page.json index.ts (Task 9)
src/modules/casefile/  schema.ts sheet.ts view.ts (Tasks 1-2)
src/modules/research/  queries.ts (+ latestFileForCompany, Task 12), actions.ts (+ startFileAction, Task 13)
src/modules/documents/ types.ts limits.ts repo.ts upload.ts selector.ts verbatim.ts pages.ts actions.ts index.ts client.ts (Tasks 4, 6, 8)
src/modules/ingestion/ types.ts caps.ts queue-repo.ts runner.ts deps.ts steps/{index,pdf-text,select-pages,extract-page}.ts
                       eta.ts trays.ts inbox.ts usage-repo.ts governor.ts prompts.ts periods.ts relevance.ts proposals.ts
                       review.ts staging.ts provenance.ts actions.ts index.ts client.ts ingestion.graph.test.ts
src/modules/ops/       drain.ts (new), jobs.ts, health.ts, heartbeat.ts (Tasks 5, 15)
src/app/api/jobs/run/route.ts, src/app/api/cron/daily/route.ts (Task 5)
src/app/desk/inbox/    page.tsx pump-actions.ts [documentId]/review/page.tsx (Tasks 7, 13)
src/components/desk/private/inbox/   drop-bar.tsx inbox-section.tsx document-card.tsx budget-meter.tsx page-chooser.tsx keep-reading.tsx (Task 7)
src/components/desk/private/doc-pane/ doc-pane.tsx page-view.tsx (Task 8)
src/components/desk/private/review/  review-one-at-a-time.tsx page-text.tsx values-list.tsx file-under.tsx (Task 13)
src/components/desk/private/facts-form/ draft.ts fact-row.tsx staged.ts provenance-chip.tsx (Tasks 2, 14)
e2e/desk-inbox.spec.ts (Tasks 7, 15)
```

---

### Task 1: `casefile`: `Notes` source type, optional fact `topic`, `G` sheet rows (Slice A; ADR-004 s4.1 items 4-5)

Executed by `desk-backend`. Pure module work; no UI, no migration.

**Files:**
- Modify: `src/lib/desk-types.ts:13` (`SOURCE_TYPES`), `src/modules/casefile/schema.ts:93-96` (`factSchema`), `src/modules/casefile/sheet.ts` (legend, parser, serializer)
- Test: `src/modules/casefile/sheet.test.ts`, `src/modules/casefile/schema.test.ts`

**Interfaces:**
- Produces: `SOURCE_TYPES = ["Annual report", "Presentation", "Filing", "Transcript", "Notes", "Other"]`; `CfFact.topic: string | null` (input optional, defaults to null; trimmed, 1-40 characters); sheet row `G | <topic> | F1 F2 F3` (ids separated by spaces or commas); `CASEFILE_SCHEMA` stays `"casefile/1"`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests.** Append to `src/modules/casefile/sheet.test.ts`:

```ts
describe("topics (G rows) and Notes sources", () => {
  const base = [
    "S1 | Q2 call notes | Notes | 2026-08-14",
    "F1 | Revenue from operations | 1284 | ₹ cr | FY26 | 2026-03-31 | S1 | call, 14 Aug",
    "F2 | Trade receivables | 210.4 | ₹ cr | FY26 | 2026-03-31 | S1 | call, 14 Aug",
    "F3 | Inventories | 305 | ₹ cr | FY26 | 2026-03-31 | S1 | call, 14 Aug",
  ];

  it("accepts Notes as a source type", () => {
    const { caseFile, errors } = parseFactsSheet(base.join("\n"));
    expect(errors).toEqual([]);
    expect(caseFile.sources[0]?.type).toBe("Notes");
  });

  it("assigns topics from G rows, before or after the facts", () => {
    const { caseFile, errors } = parseFactsSheet(["G | Working capital | F2, F3", ...base].join("\n"));
    expect(errors).toEqual([]);
    expect(caseFile.facts.map((f) => f.topic)).toEqual([null, "Working capital", "Working capital"]);
  });

  it("reports an unknown fact, a fact in two topics and an empty topic on their lines", () => {
    const { errors } = parseFactsSheet([...base, "G | Working capital | F2 F9", "G | Balance sheet | F2", "G |  | F1"].join("\n"));
    expect(errors).toEqual([
      { line: 5, message: "G: F9 is not a fact in this sheet." },
      { line: 6, message: "F2 is in two topics (lines 5 and 6)." },
      { line: 7, message: "G: name the topic." },
    ]);
  });

  it("caps a topic at 40 characters", () => {
    const { errors } = parseFactsSheet([...base, `G | ${"x".repeat(41)} | F1`].join("\n"));
    expect(errors.map((e) => e.line)).toContain(5);
  });

  it("round-trips topics through the serializer, one G row per topic in first-seen order", () => {
    const { caseFile } = parseFactsSheet([...base, "G | Working capital | F3 F2", "G | P&L | F1"].join("\n"));
    const text = serializeFactsSheet(caseFile);
    expect(text).toContain("G | P&L | F1");
    expect(text).toContain("G | Working capital | F2 F3");
    expect(parseFactsSheet(text).caseFile).toEqual(caseFile);
  });

  it("reads a revision saved before topics existed as topic null", () => {
    const old = { ...EMPTY_CASEFILE, sources: [{ id: "S1", doc: "AR", type: "Annual report", filedOn: "2026-05-20", url: null, quote: {} }],
      facts: [{ id: "F1", label: "Revenue", value: 1, unit: "₹ cr", period: "FY26", asOf: "2026-03-31", sourceId: "S1", locator: "p. 1", prior: null }] };
    expect(readCaseFile(old).facts[0]?.topic).toBeNull();
  });
});
```
Import `EMPTY_CASEFILE`, `readCaseFile` from `./schema` at the top of the test file if not already imported.

- [ ] **Step 2: Run and see them fail.** `rtk pnpm vitest run src/modules/casefile/sheet.test.ts` — expected: the Notes test fails on the type error message, the G tests fail with "Start a row with O, S1, ...".

- [ ] **Step 3: Implement.**
  - `src/lib/desk-types.ts`: insert `"Notes"` before `"Other"` in `SOURCE_TYPES`.
  - `schema.ts` `factSchema`: add `topic: z.string().trim().min(1).max(40).nullable().default(null)`.
  - `sheet.ts`: add `// G | topic | F1 F2 (facts under one heading)` to `SHEET_LEGEND` after the `F1` line; add `G` to `ROW_KINDS` ("Start a row with O, S1, F1, G, T1, X1, R, SC, A or Y."). In the parser collect `topics: { line: number; topic: string; ids: string[] }[]` for `key === "G"` (`ids = (cells[2] ?? "").split(/[\s,]+/).filter(Boolean)`; empty `cells[1]` → `err("G: name the topic.")`). After the line loop and before quotes are applied: for each G row, unknown id → error on its line `G: ${id} is not a fact in this sheet.`; an id already assigned → error on the later line `${id} is in two topics (lines ${first} and ${line}).`; otherwise `fact.topic = topic`. Length errors come from the schema (map issue path `facts[i]` to the fact's line, as today; the G row line is acceptable too: test asserts the line number 5, so map topic-length issues to the G row by remembering `topicLineByFact`).
  - Serializer: after the `F` lines, group facts with a non-null topic in first-seen order and emit `join(["G", topic, ids.join(" ")])`.
  - `toDraft`/`draftToSheet` are Task 2 (they compile unchanged because `topic` is not read there yet; `SheetCaseFile` facts now require `topic`, so `draftToSheet` sets `topic: null` until Task 2: add `topic: null` to its fact mapping in this task to keep `pnpm typecheck` green).

- [ ] **Step 4: Run the casefile suite.** `rtk pnpm vitest run src/modules/casefile` — expected: all green, including the existing round-trip tests (facts without topics serialise exactly as before: no G rows).

- [ ] **Step 5: Whole checks.** `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm test` — expected: green. If a test elsewhere lists `SOURCE_TYPES` verbatim (grep `"Transcript", "Other"`), update it to include `Notes`.

- [ ] **Step 6: Commit.** `git add src/lib/desk-types.ts src/modules/casefile && git commit -m "feat(casefile): Notes source type, optional fact topics, G sheet rows (ADR-004)"`.

---

### Task 2: Facts form topic field, topic groups in the view, public fact table (Slice A; E10)

Executed by `desk-ui` (opus). Step 0 is a design checkpoint with Shlok.

**Files:**
- Modify: `src/components/desk/private/facts-form/draft.ts` (`FactDraft.topic`), `fact-row.tsx` (Topic field), `validate.ts` (topic length), `facts-form.tsx` (pass the topic list), `src/modules/casefile/view.ts:100-115` (`buildFactGroups`), `src/lib/view-types.ts:28-37` (`FactRow.period`), `src/components/desk/fact-table.tsx` (period after the label when grouped by topic), `src/app/dev/preview/page.dev.tsx` (a topic-grouped example)
- Test: `src/components/desk/private/facts-form/facts-form.test.tsx`, `src/modules/casefile/view.test.ts`, `src/components/desk/reading.test.tsx`

**Interfaces:**
- Consumes: Task 1 `CfFact.topic`, `SOURCE_TYPES` with `Notes`.
- Produces: `FactDraft.topic: string`; `FactRow.period: string | null` (set only when the row sits in a topic group); `FactGroup.title` = topic or period; groups: topics first in first-seen order, then period groups for facts without a topic.

- [ ] **Step 0: Design checkpoint.** On `/dev/preview`, render the fixture file's facts as (A) topic heading, period after each metric, as-of once per group (E10 default) and (B) topic heading with period sub-captions. Screenshot both at 375 and 1280, light and dark; show Shlok; record his pick in `docs/design/decisions.md` under segment 3 ("Topic groups", 2026-10-xx). Build A unless he picks B.

- [ ] **Step 1: Failing view test** (`view.test.ts`):

```ts
it("groups by topic first, then by period for facts without a topic, with the period on topic rows", () => {
  const cf = fixtureCaseFile({ topics: { F1: "P&L", F2: "Working capital", F3: "Working capital" } }); // F4 has no topic
  const groups = buildFactGroups(cf, "2026-10-07");
  expect(groups.map((g) => g.title)).toEqual(["P&L", "Working capital", "FY26"]);
  expect(groups[1]?.rows.map((r) => r.period)).toEqual(["FY26", "FY26"]);
  expect(groups[2]?.rows[0]?.period).toBeNull();
});
```
(`fixtureCaseFile` is the test file's existing builder; add the `topics` option if it has none.)

- [ ] **Step 2: Failing form tests** (`facts-form.test.tsx`): typing "Working capital" in F2's Topic field puts `G | Working capital | F2` in the hidden sheet; the Topic field offers the file's existing topics as suggestions (`<datalist>`); a 41-character topic shows "Keep the topic under 40 characters." on the field and blocks Save; the source Type select lists Notes.

- [ ] **Step 3: Run, see failures.** `rtk pnpm vitest run src/modules/casefile/view.test.ts src/components/desk/private/facts-form`.

- [ ] **Step 4: Implement.** `buildFactGroups`: key = `f.topic ?? f.period`; keep two ordered maps (topic groups, period groups) and concatenate; `period: f.topic ? f.period : null`. `FactTable` renders `{row.label}{row.period ? <span className="text-ink-muted"> · {row.period}</span> : null}` (phone two-line layout unchanged). Draft: `toDraft` copies `topic ?? ""`; `draftToSheet` writes `topic: orNull(f.topic)`; `blankFact` sets `topic: ""`. `FactRow`: a `TextField` labelled "Topic (optional)" with `list` pointing at a `<datalist id="ff-topics">` rendered once by `facts-form.tsx` from the distinct non-empty topics.

- [ ] **Step 5: Checks.** `rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint`, then `rtk pnpm e2e --project=desk-desktop e2e/desk-facts-form.spec.ts` (the Task 15b e2e must stay green). Controller visual QA at 375/1280 light/dark of the editor and `/dev/preview`.

- [ ] **Step 6: Commit.** `feat(desk): fact topics in the Facts form and topic-grouped source facts (ADR-004, E10)`.

---

### Task 3: Migration 0006: documents, pages, job queue, private bucket, machine write boundary (Slice B; ADR-004 s4.2-s4.3)

Executed by `desk-backend`. Local stack only.

**Files:**
- Create: `supabase/migrations/20261007000006_documents_jobs.sql`, `supabase/tests/0006_documents_jobs.test.sql`
- Modify: `supabase/tests/0001_core_grants.test.sql:30-37` (service_role allowlist gains the four new tables), `supabase/tests/0002_function_privileges.test.sql` (anon allowlist gains `queue_age()`, authenticated gains `storage_usage()`, service_role gains `claim_job_step(uuid, integer)`), `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `private.is_admin()`, `private.set_updated_at()`, `public.companies`, `public.item_revisions` (0001).
- Produces: tables `documents`, `document_pages`, `jobs`, `job_steps`; `public.claim_job_step(p_owner uuid, p_lease_seconds integer default 270) returns setof job_steps` (service_role); `public.queue_age() returns integer` (anon; seconds the oldest runnable step has waited, or null); `public.storage_usage() returns table (storage_bytes bigint, database_bytes bigint)` (authenticated; null row values for non-admins); trigger `item_revisions_no_machine_author`; bucket `documents`.

- [ ] **Step 1: Write the failing pgTAP test.** `supabase/tests/0006_documents_jobs.test.sql` (setup copied from `0005_casefile.test.sql`: admin via `private.settings` + `auth.users`; a company row). Assertions, in this order (plan(24)):
  1-4. `has_table` for each new table; `ok(relrowsecurity)` for each (one assertion over all four).
  5. anon holds no privilege on any of the four (loop over `pg_class`, as `0001_core_grants` does).
  6. `service_role` has no INSERT, UPDATE or DELETE on `public.items` or `public.item_revisions`.
  7. With `grant insert on public.item_revisions to service_role` inside the test transaction and `set local role service_role`, inserting a revision throws `42501` with message `machines do not author revisions (ADR-004 s4.2)`; `reset role`.
  8. As the admin (`authenticated` + claims), inserting a revision still succeeds.
  9. Admin inserts a document with `status 'uploading'`; inserting one with `status 'active'` throws (RLS `with check`).
  10. Admin cannot update `documents.sha256` (column privilege, 42501).
  11. Service role inserts page 1 with 60+ characters; updating its `text` throws `P0001` (`document_pages.text is written once`); a page with 10 characters (a scan) can take new text once it is filled, and then not again; updating `selected` succeeds.
  12. `is_scan` is true for a page with 10 characters and false for 60.
  13. A `select_pages` step with a `page_no` is refused (check constraint); an `extract_page` without one is refused.
  14. A second `extract_page` for the same job and page, and a second `select_pages` for the same job, are refused (`job_steps_once`); `insert ... on conflict (job_id, kind, page_no) do nothing` succeeds silently.
  15. `claim_job_step` is executable by `service_role` only (`has_function_privilege` for anon, authenticated, service_role).
  16. As service_role: claim returns the queued step, sets `status 'running'`, `lease_owner`, and `locked_until` about 270 s ahead.
  17. A second claim returns the other queued step, not the running one.
  18. A step with `not_before` in the future is not returned.
  19. A running step whose `locked_until` has passed is returned again with `lease_expiries = 1`.
  20. Steps of a job with `cancelled_at` set are never returned.
  21. A lease outside 30-290 s raises `22023`.
  22. `queue_age()`: null with no runnable steps; about 7 h when one queued step has `not_before = now() - 7 h`; anon may execute it.
  23. Admin updating a step to `status 'running'` is refused (`with check`); to `'skipped'` succeeds.
  24. Bucket `documents` exists, `public = false`, `file_size_limit = 52428800`, `allowed_mime_types = '{application/pdf}'`; a non-admin `authenticated` session cannot insert into `storage.objects` for it.

- [ ] **Step 2: Run and see it fail.** `pnpm db:reset && pnpm db:test` — expected: 0006 fails at test 1 (tables do not exist).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261007000006_documents_jobs.sql`:

```sql
-- =============================================================================
-- 20261007000006_documents_jobs.sql - Phase 2a: documents, pages, the job queue, the private
-- documents bucket, queue health, and the machine write boundary (ADR-004 s4.2-s4.3).
-- Spec: docs/specs/2026-10-07-phase-2-ingestion-design.md s4. Never edit after it reaches hosted.
-- =============================================================================

-- 1. Documents: one row per upload. Fine-grained state is derived from job_steps (plan E2).
create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references public.companies (id) on delete restrict,
  title               text not null check (length(trim(title)) between 1 and 160),
  kind                text not null default 'pdf' check (kind in ('pdf')),
  storage_path        text unique check (storage_path ~ '^[0-9a-f-]{36}\.pdf$'),
  sha256              text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes               integer not null check (bytes between 1 and 52428800),
  page_count          integer check (page_count between 1 and 5000),
  status              text not null default 'uploading' check (status in ('uploading', 'active', 'done', 'skipped')),
  llm_page_budget     integer not null default 20 check (llm_page_budget between 1 and 40),
  basis               text not null default 'consolidated' check (basis in ('consolidated', 'standalone')),
  source_type         text not null default 'Annual report'
                      check (source_type in ('Annual report', 'Presentation', 'Filing', 'Transcript', 'Other')),
  filed_on            date,
  source_url          text check (source_url is null or source_url ~ '^https?://'),
  original_deleted_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger documents_set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();
create index documents_company_id_idx on public.documents (company_id);
create index documents_status_idx on public.documents (status, created_at desc);

-- 2. Page text: written once by job code; a scan page (under 50 characters) may be filled once by OCR (Plan 2b);
-- selection is editable.
create table public.document_pages (
  document_id uuid not null references public.documents (id) on delete restrict,
  page_no     integer not null check (page_no between 1 and 5000),
  text        text not null,
  char_count  integer generated always as (length(text)) stored,
  is_scan     boolean generated always as (length(btrim(text)) < 50) stored,
  kind        text check (kind in ('pl', 'bs', 'cf', 'notes', 'segment', 'mdna', 'other')),
  basis       text check (basis in ('consolidated', 'standalone')),
  score       real not null default 0,
  selected    boolean not null default false,
  selected_by text check (selected_by in ('rule', 'aksh')),
  search      tsvector generated always as (to_tsvector('simple'::regconfig, left(text, 50000))) stored,
  created_at  timestamptz not null default now(),
  primary key (document_id, page_no)
);
create index document_pages_search_idx on public.document_pages using gin (search);
create index document_pages_selected_idx on public.document_pages (document_id) where selected;

create function private.guard_page_text()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.text is distinct from old.text and length(btrim(old.text)) >= 50)
     or new.page_no <> old.page_no or new.document_id <> old.document_id then
    raise exception 'document_pages.text is written once' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger document_pages_text_immutable before update on public.document_pages
  for each row execute function private.guard_page_text();

-- 3. The job queue (ADR-001 s4; pitfalls s1: a lease, not a bare SKIP LOCKED).
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('ingest_pdf')),
  document_id  uuid not null references public.documents (id) on delete restrict,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index jobs_one_live_per_document on public.jobs (document_id) where cancelled_at is null;
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();

create table public.job_steps (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.jobs (id) on delete restrict,
  kind              text not null check (kind in ('pdf_text', 'select_pages', 'extract_page')),
  page_no           integer check (page_no between 1 and 5000),
  args              jsonb not null default '{}'::jsonb,
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'done', 'skipped', 'needs_attention')),
  schema_failures   integer not null default 0 check (schema_failures >= 0),
  provider_failures integer not null default 0 check (provider_failures >= 0),
  lease_expiries    integer not null default 0 check (lease_expiries >= 0),
  not_before        timestamptz not null default now(),
  wait_reason       text check (wait_reason in ('groq_minute', 'groq_day', 'ai_off')),
  locked_until      timestamptz,
  lease_owner       uuid,
  last_error        text check (char_length(last_error) <= 500),
  result            jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- pdf_text carries the page it starts from; extract_page the page it reads; select_pages none.
  check ((kind = 'select_pages') = (page_no is null)),
  -- One step per (job, kind, page); select_pages (page_no null) at most once per job. Not a partial index:
  -- ON CONFLICT (job_id, kind, page_no) DO NOTHING must be able to infer it (idempotent enqueue).
  constraint job_steps_once unique nulls not distinct (job_id, kind, page_no)
);
create index job_steps_runnable_idx on public.job_steps (not_before, created_at) where status in ('queued', 'running');
create index job_steps_job_id_idx on public.job_steps (job_id);
create trigger job_steps_set_updated_at before update on public.job_steps
  for each row execute function private.set_updated_at();

-- 4. Claim one runnable step with a lease. An expired lease is reclaimable and counted, so the runner can stop a
-- step that keeps dying (two expiries -> needs_attention, decided in TypeScript).
create function public.claim_job_step(p_owner uuid, p_lease_seconds integer default 270)
returns setof public.job_steps
language plpgsql security definer set search_path = ''
as $$
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 290 then
    raise exception 'lease must be 30-290 seconds' using errcode = '22023';
  end if;
  return query
  with next as (
    select s.id
      from public.job_steps s
      join public.jobs j on j.id = s.job_id
     where j.cancelled_at is null
       and s.not_before <= now()
       and (s.status = 'queued' or (s.status = 'running' and s.locked_until < now()))
     order by s.not_before, s.created_at
     for update of s skip locked
     limit 1
  )
  update public.job_steps s
     set lease_expiries = s.lease_expiries + (case when s.status = 'running' then 1 else 0 end),
         status = 'running',
         locked_until = now() + make_interval(secs => p_lease_seconds),
         lease_owner = p_owner,
         wait_reason = null
    from next
   where s.id = next.id
  returning s.*;
end;
$$;

-- 5. Queue health for the public monitor: a number, never a row (plan E7).
create function public.queue_age()
returns integer language sql stable security definer set search_path = ''
as $$
  select extract(epoch from (now() - min(s.not_before)))::integer
    from public.job_steps s join public.jobs j on j.id = s.job_id
   where j.cancelled_at is null and s.not_before <= now()
     and (s.status = 'queued' or (s.status = 'running' and s.locked_until < now()));
$$;

-- 6. Storage and database size for the desk meters (admin only; nulls for anyone else).
create function public.storage_usage()
returns table (storage_bytes bigint, database_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select
    case when private.is_admin() then
      (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = 'documents')
    end,
    case when private.is_admin() then pg_database_size(current_database()) end;
$$;

-- 7. The machine write boundary (ADR-004 s4.2, layer 1). service_role holds no privilege on items or
-- item_revisions; this trigger refuses the insert even if a grant is ever added.
create function private.reject_machine_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'service_role' then
    raise exception 'machines do not author revisions (ADR-004 s4.2)' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger item_revisions_no_machine_author before insert on public.item_revisions
  for each row execute function private.reject_machine_revision();

-- 8. RLS: admin only; job code is service_role (bypasses RLS, still needs table privileges).
alter table public.documents      enable row level security;
alter table public.document_pages enable row level security;
alter table public.jobs           enable row level security;
alter table public.job_steps      enable row level security;

create policy documents_admin_read   on public.documents for select to authenticated using ((select private.is_admin()));
create policy documents_admin_insert on public.documents for insert to authenticated
  with check ((select private.is_admin()) and status = 'uploading');
create policy documents_admin_update on public.documents for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy document_pages_admin_read   on public.document_pages for select to authenticated using ((select private.is_admin()));
create policy document_pages_admin_update on public.document_pages for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy jobs_admin_read   on public.jobs for select to authenticated using ((select private.is_admin()));
create policy jobs_admin_insert on public.jobs for insert to authenticated
  with check ((select private.is_admin()) and cancelled_at is null);
create policy job_steps_admin_read   on public.job_steps for select to authenticated using ((select private.is_admin()));
create policy job_steps_admin_insert on public.job_steps for insert to authenticated
  with check ((select private.is_admin()) and kind in ('pdf_text', 'extract_page') and status = 'queued');
create policy job_steps_admin_update on public.job_steps for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()) and status in ('queued', 'skipped'));

revoke all on public.documents, public.document_pages, public.jobs, public.job_steps
  from public, anon, authenticated, service_role;
grant select, insert on public.documents to authenticated;
grant update (title, company_id, llm_page_budget, basis, source_type, filed_on, source_url, status, original_deleted_at)
  on public.documents to authenticated;
grant select on public.document_pages, public.jobs, public.job_steps to authenticated;
grant update (selected, selected_by) on public.document_pages to authenticated;
grant insert on public.jobs to authenticated;
grant insert (job_id, kind, page_no, args) on public.job_steps to authenticated;
grant update (status, not_before, schema_failures, provider_failures, lease_expiries, wait_reason, last_error)
  on public.job_steps to authenticated;

grant select on public.documents to service_role;
grant update (page_count, status) on public.documents to service_role;
grant select, insert on public.document_pages to service_role;
grant update (text, kind, basis, score, selected, selected_by) on public.document_pages to service_role;
grant select, insert, update on public.jobs, public.job_steps to service_role;

-- 9. The private bucket (PDF only in 2a; 50 MB is the Free plan ceiling, spec s9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
create policy documents_bucket_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_bucket_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_bucket_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));

-- 10. Function privileges.
revoke execute on function public.claim_job_step(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_job_step(uuid, integer) to service_role;
revoke execute on function public.queue_age() from public, anon, authenticated, service_role;
grant execute on function public.queue_age() to anon;
revoke execute on function public.storage_usage() from public, anon, authenticated, service_role;
grant execute on function public.storage_usage() to authenticated;
```

- [ ] **Step 4: Run.** `pnpm db:reset && pnpm db:test` — expected: every file green (update the two allowlist tests named in Files first; they will otherwise fail on the new grants). If test 24 shows the hosted-only `storage` columns differ locally, record the difference in the task report; do not weaken the assertion.

- [ ] **Step 5: Types.** `pnpm db:types`; `rtk pnpm typecheck` green.

- [ ] **Step 6: Commit.** `feat(db): documents, pages, job queue, private bucket, machine write boundary (migration 0006, ADR-004)`.

---

### Task 4: `documents` module: repo, signed upload, storage meter (Slice B)

Executed by `desk-backend`. TDD against a fake repo; the Supabase repo is covered by the Task 7 e2e.

**Files:**
- Create: `src/modules/documents/types.ts`, `limits.ts`, `errors.ts`, `repo.ts`, `upload.ts`, `upload.test.ts`, `index.ts`, `client.ts`
- Modify: `src/lib/messages.ts` (new error codes: `duplicate-document`, `too-large`, `not-pdf`, `storage-full`, `upload-missing`)

**Interfaces:**
- Consumes: `Db` (`src/lib/supabase/types.ts`), `dbError` (`src/lib/supabase/errors.ts`), migration 0006.
- Produces:

```ts
// types.ts
export type DocumentStatus = "uploading" | "active" | "done" | "skipped";
export type Basis = "consolidated" | "standalone";
export type DocumentRow = {
  id: string; companyId: string | null; title: string; kind: "pdf"; storagePath: string | null; sha256: string; bytes: number;
  pageCount: number | null; status: DocumentStatus; llmPageBudget: number; basis: Basis; sourceType: DocSourceType;
  filedOn: string | null; sourceUrl: string | null; originalDeletedAt: string | null; createdAt: string;
};
export type DocSourceType = "Annual report" | "Presentation" | "Filing" | "Transcript" | "Other";
export type PageKind = "pl" | "bs" | "cf" | "notes" | "segment" | "mdna" | "other";
export type PageRow = { documentId: string; pageNo: number; text: string; charCount: number; isScan: boolean; kind: PageKind | null;
  basis: Basis | null; score: number; selected: boolean; selectedBy: "rule" | "aksh" | null };
export type StartUploadInput = { fileName: string; bytes: number; mime: string; sha256: string; companyId: string | null;
  filedOn: string | null; sourceUrl: string | null };

// limits.ts (browser-safe; numbers from spec s9)
export const MAX_UPLOAD_BYTES = 52_428_800;
export const STORAGE_BYTES = 1_073_741_824;
export const STORAGE_WARN = 0.7;
export const STORAGE_REFUSE = 0.9;
export const DATABASE_BYTES = 524_288_000;
export const DEFAULT_PAGE_BUDGET = 20;
export const MAX_PAGE_BUDGET = 40;

// repo.ts
export interface DocumentsRepo {
  findBySha(sha256: string): Promise<{ id: string; createdAt: string } | null>;
  insertUploading(row: { id: string; title: string; storagePath: string; sha256: string; bytes: number; companyId: string | null; filedOn: string | null; sourceUrl: string | null }): Promise<void>;
  get(id: string): Promise<DocumentRow | null>;
  update(id: string, patch: Partial<Pick<DocumentRow, "title" | "companyId" | "llmPageBudget" | "basis" | "sourceType" | "filedOn" | "sourceUrl" | "status" | "originalDeletedAt">>): Promise<void>;
  usage(): Promise<{ storageBytes: number; databaseBytes: number }>;
  signUpload(path: string): Promise<{ path: string; token: string }>;
  objectInfo(path: string): Promise<{ size: number; mimetype: string } | null>;
  removeObject(path: string): Promise<void>;
  listForCompany(companyId: string): Promise<Pick<DocumentRow, "id" | "title" | "pageCount" | "filedOn" | "sourceUrl" | "sourceType">[]>;
}
export function createSupabaseDocumentsRepo(db: Db): DocumentsRepo;

// upload.ts
export async function startUpload(repo: DocumentsRepo, input: StartUploadInput, newId: () => string): Promise<{ documentId: string; path: string; token: string }>;
export async function finishUpload(repo: DocumentsRepo, documentId: string): Promise<DocumentRow>;
```
`startUpload` throws `DocumentError` with codes `duplicate-document` (message carries the earlier upload date and id), `too-large`, `not-pdf` (mime is not `application/pdf` or the name does not end `.pdf`), `storage-full` (`storageBytes + bytes > STORAGE_REFUSE * STORAGE_BYTES`). Title = file name without `.pdf`, trimmed to 160. Path = `${documentId}.pdf`, stored in `storage_path` at insert (`insertUploading` takes it). `finishUpload` throws `upload-missing` unless `objectInfo(path)` exists with `size === bytes` and `mimetype === "application/pdf"`; then `update(id, { status: "active" })`.

- [ ] **Step 1: Failing tests** (`upload.test.ts`, fake in-memory repo): refuses a duplicate hash and names the earlier date; refuses 52,428,801 bytes; refuses `image/png`; refuses when storage is at 89.9% and the file would cross 90%; accepts a 3 MB PDF and returns `{ documentId, path: "<id>.pdf", token }`; `finishUpload` refuses when the object is missing, when its size differs, and sets `active` otherwise; titles drop `.pdf` and trim to 160.
- [ ] **Step 2: Run, see failures.** `rtk pnpm vitest run src/modules/documents`.
- [ ] **Step 3: Implement** `upload.ts` (pure logic over the repo) and `repo.ts` (explicit columns: `id, company_id, title, kind, storage_path, sha256, bytes, page_count, status, llm_page_budget, basis, source_type, filed_on, source_url, original_deleted_at, created_at`; `signUpload` uses `db.storage.from("documents").createSignedUploadUrl(path)`; `objectInfo` uses `.list("", { search: path, limit: 1 })` and reads `metadata.size` / `metadata.mimetype`; `usage` calls `rpc("storage_usage")`). `client.ts` exports limits, types and `hashFile(file: Blob): Promise<string>` (`crypto.subtle.digest("SHA-256", await file.arrayBuffer())` to hex). `index.ts` exports the server API.
- [ ] **Step 4: Run** the module tests, `rtk pnpm typecheck && rtk pnpm lint`.
- [ ] **Step 5: `defenso guard_code`** on `upload.ts` and `repo.ts`; fix findings.
- [ ] **Step 6: Commit.** `feat(documents): upload through a signed URL with dedupe, size, type and storage checks`.

---

### Task 5: `ingestion` job engine, pumps, queue health and the boundary graph test (Slice B; ADR-004 s4.4, E1, E7)

Executed by `desk-backend`.

**Files:**
- Create: `src/modules/ingestion/types.ts`, `caps.ts`, `queue-repo.ts`, `runner.ts`, `runner.test.ts`, `deps.ts`, `steps/index.ts`, `index.ts`, `client.ts`, `actions.ts` (upload actions only in this task), `ingestion.graph.test.ts`, `src/modules/ops/drain.ts`, `src/app/desk/inbox/pump-actions.ts`
- Modify: `src/modules/ops/jobs.ts` (export `drainFor`, `SERVER_PUMP_STEPS`, `SERVER_DAILY_STEPS`), `src/app/api/jobs/run/route.ts` and `src/app/api/cron/daily/route.ts` (pass the server step lists; daily `maxDuration = 300`), `src/modules/ops/health.ts` (queue check), `src/modules/ops/health.test.ts`, `src/modules/ops/ops.graph.test.ts` (allow `src/app/desk/inbox/pump-actions.ts` to import `@/modules/ops/jobs`)

**Interfaces:**

```ts
// types.ts
export type StepKind = "pdf_text" | "select_pages" | "extract_page";
export type StepStatus = "queued" | "running" | "done" | "skipped" | "needs_attention";
export type WaitReason = "groq_minute" | "groq_day" | "ai_off";
export type Step = { id: string; jobId: string; kind: StepKind; pageNo: number | null; args: Record<string, unknown>; status: StepStatus;
  schemaFailures: number; providerFailures: number; leaseExpiries: number; notBefore: string; leaseOwner: string | null };
export type NewStep = { kind: StepKind; pageNo: number | null; args?: Record<string, unknown> };
export type StepOutcome =
  | { kind: "done"; result?: Record<string, unknown>; enqueue?: NewStep[] }
  | { kind: "defer"; notBefore: Date; reason: WaitReason }
  | { kind: "retry"; failure: "schema" | "provider"; error: string }
  | { kind: "attention"; error: string };
export type StepContext = { step: Step; documentId: string; deadline: number; deps: DrainDeps };
export type StepHandler = (ctx: StepContext) => Promise<StepOutcome>;

// deps.ts
export type DrainDeps = { db: Db; llm: LlmPort | null; models: { text: string }; now: () => Date; clock: () => number };
// (LlmPort arrives in Task 9; until then deps.ts declares `llm: null` and Task 9 widens the type.)

// caps.ts (spec s8, s9)
export const LEASE_SECONDS = 270;
export const MIN_STEP_MS = 30_000;          // do not claim a step with less than this left
export const SCHEMA_FAILURE_LIMIT = 2;
export const PROVIDER_FAILURE_LIMIT = 3;
export const LEASE_EXPIRY_LIMIT = 2;
export const QUEUE_STALE_SECONDS = 6 * 60 * 60;
export const DRAIN_MS = { pump: 240_000, daily: 200_000, kick: 200_000, tab: 50_000 } as const;

// queue-repo.ts
export interface QueueRepo {
  claim(owner: string): Promise<(Step & { documentId: string }) | null>;
  finish(step: Step, owner: string, patch: { status: StepStatus; notBefore?: Date; waitReason?: WaitReason | null;
    schemaFailures?: number; providerFailures?: number; lastError?: string | null; result?: Record<string, unknown> | null }): Promise<boolean>; // false when the lease was lost
  enqueue(jobId: string, steps: NewStep[]): Promise<void>; // insert ... on conflict do nothing
  createJob(documentId: string, first: NewStep): Promise<string>;
}

// runner.ts
export type DrainSummary = { ran: number; done: number; deferred: number; attention: number; leaseLost: number };
export async function drain(deps: DrainDeps, repo: QueueRepo, handlers: Record<StepKind, StepHandler>, budgetMs: number): Promise<DrainSummary>;

// ops/drain.ts (server-only)
export async function drainFor(budgetMs: number): Promise<DrainSummary>;
export const SERVER_PUMP_STEPS: readonly Step[];   // PUMP_STEPS + { job: "ingestion:drain" }
export const SERVER_DAILY_STEPS: readonly Step[];  // DAILY_STEPS + { job: "ingestion:sweep" }
export function aiReadingOn(): boolean;            // buildLlm() !== null; buildLlm() returns null until Task 9 wires createLlmPort

// ingestion/actions.ts ("use server")
export async function startUploadAction(input: StartUploadInput): Promise<{ ok: true; documentId: string; path: string; token: string } | { ok: false; code: string; message: string }>;
export async function finishUploadAction(documentId: string): Promise<{ ok: true } | { ok: false; code: string; message: string }>;

// app/desk/inbox/pump-actions.ts ("use server")
export async function kickReadingAction(): Promise<void>;      // requireAdmin(); after(() => drainFor(DRAIN_MS.kick))
export async function keepReadingAction(): Promise<{ more: boolean }>; // requireAdmin(); drainFor(DRAIN_MS.tab)
```

- [ ] **Step 1: Failing runner tests** (`runner.test.ts`, in-memory `QueueRepo`, fake clock, fake handlers). Cases:
  - drains queued steps in order until none remain; summary counts them;
  - stops claiming when less than `MIN_STEP_MS` remains (fake clock);
  - `done` with `enqueue` inserts the new steps; a duplicate enqueue is ignored;
  - `defer` sets `status 'queued'`, `not_before`, `wait_reason`, and does not change failure counters;
  - `retry` schema: first failure queues again with `not_before = now`; the second sets `needs_attention` with the error;
  - `retry` provider: back-off 1, 2 min; the third sets `needs_attention`;
  - a claimed step with `leaseExpiries >= 2` goes to `needs_attention` with "This step stopped twice before finishing." without running its handler;
  - a handler that throws is a provider retry (error text truncated to 500), never a crash of the drain;
  - `finish` returning false (lease lost) is counted in `leaseLost` and the result is dropped.
- [ ] **Step 2: Failing graph test** `src/modules/ingestion/ingestion.graph.test.ts` (complete code):

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-004 s4.2: no ingestion, documents or inbox code can write a revision or an item. Layer 2 of three
// (layer 1: service_role grants + trigger, pgTAP 0006; layer 3: proposals trigger, pgTAP 0007).
const SRC = resolve(__dirname, "../..");
const ROOTS = ["modules/ingestion", "modules/documents", "app/desk/inbox"];
const FORBIDDEN = [
  /\baddRevision\b/, /\bappendRevision\b/, /\bcreateItem\b/, /\bcreateSupabaseResearchRepo\b/,
  /from\s+"@\/modules\/casefile\/actions"/, /from\s+"@\/modules\/research\/actions"/, /\.from\("item_revisions"\)/, /\.from\("items"\)/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("machine write boundary (ADR-004 s4.2)", () => {
  const sources = ROOTS.flatMap((root) => {
    const dir = join(SRC, root);
    try { return files(dir); } catch { return []; }
  });

  it("finds the code it guards", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  for (const pattern of FORBIDDEN) {
    it(`no ingestion, documents or inbox file matches ${pattern}`, () => {
      const offenders = sources
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map((file) => relative(SRC, file).split(sep).join("/"));
      expect(offenders).toEqual([]);
    });
  }

  it("job steps never import a cookie-session client: they run on the Db ops hands them", () => {
    const steps = sources.filter((f) => f.includes(`${sep}steps${sep}`));
    const offenders = steps.filter((f) => /@\/lib\/supabase\/(server|browser|service)/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```
(`createItemAction` is matched by `\bcreateItem\b`? No: `\b` sits between `createItem` and `Action`'s `A` only if `A` is a non-word character; it is a word character, so `createItemAction` does not match. Task 13 calls `startFileAction` from the review page through `@/modules/research/actions`, which this test forbids under `app/desk/inbox`: Task 13 therefore imports it inside the File under component, `src/components/desk/private/review/file-under.tsx`, which is outside these roots and is Aksh's own click, not job code. The rule stays: inbox and job code never name a research write.)

- [ ] **Step 3: Failing health tests** (`health.test.ts`): `evaluatePublicHealth(rows, queueAgeSeconds)` adds `{ job: "queue", ageSeconds, ok }` where `ok` is true for `null` and for ages up to `QUEUE_STALE_SECONDS`, false above; `describeStale` says "Documents have not moved for 7 h; your uploads are safe". The desk report gains the same check.
- [ ] **Step 4: Run, see failures.** `rtk pnpm vitest run src/modules/ingestion src/modules/ops`.
- [ ] **Step 5: Implement.**
  - `queue-repo.ts`: `claim` calls `rpc("claim_job_step", { p_owner, p_lease_seconds: LEASE_SECONDS })` and reads `document_id` from `jobs`; `finish` updates `job_steps` with `.eq("id", step.id).eq("lease_owner", owner).eq("status", "running")` and returns whether a row changed (`select("id")` on the update); `enqueue` uses `upsert(rows, { onConflict: "job_id,kind,page_no", ignoreDuplicates: true })` (the `job_steps_once` constraint from Task 3; `NULLS NOT DISTINCT` makes a second `select_pages` a no-op too).
  - `runner.ts` (complete core):

```ts
import { randomUUID } from "node:crypto";
import { LEASE_EXPIRY_LIMIT, MIN_STEP_MS, PROVIDER_FAILURE_LIMIT, SCHEMA_FAILURE_LIMIT } from "./caps";
import type { DrainDeps } from "./deps";
import type { QueueRepo } from "./queue-repo";
import type { StepHandler, StepKind, StepOutcome } from "./types";

export type DrainSummary = { ran: number; done: number; deferred: number; attention: number; leaseLost: number };
const text = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** Claims and runs steps until the budget is spent or nothing is runnable. Never throws for a step's failure. */
export async function drain(deps: DrainDeps, repo: QueueRepo, handlers: Record<StepKind, StepHandler>, budgetMs: number): Promise<DrainSummary> {
  const owner = randomUUID();
  const deadline = deps.clock() + budgetMs;
  const summary: DrainSummary = { ran: 0, done: 0, deferred: 0, attention: 0, leaseLost: 0 };
  while (deadline - deps.clock() >= MIN_STEP_MS) {
    const step = await repo.claim(owner);
    if (!step) break;
    summary.ran += 1;
    let outcome: StepOutcome;
    if (step.leaseExpiries >= LEASE_EXPIRY_LIMIT) outcome = { kind: "attention", error: "This step stopped twice before finishing." };
    else {
      try {
        outcome = await handlers[step.kind]({ step, documentId: step.documentId, deadline, deps });
      } catch (error) {
        outcome = { kind: "retry", failure: "provider", error: text(error) };
      }
    }
    const now = deps.now();
    let ok: boolean;
    if (outcome.kind === "done") {
      if (outcome.enqueue?.length) await repo.enqueue(step.jobId, outcome.enqueue);
      ok = await repo.finish(step, owner, { status: "done", result: outcome.result ?? null, lastError: null });
      summary.done += Number(ok);
    } else if (outcome.kind === "defer") {
      ok = await repo.finish(step, owner, { status: "queued", notBefore: outcome.notBefore, waitReason: outcome.reason });
      summary.deferred += Number(ok);
    } else if (outcome.kind === "attention") {
      ok = await repo.finish(step, owner, { status: "needs_attention", lastError: outcome.error.slice(0, 500) });
      summary.attention += Number(ok);
    } else {
      const schema = step.schemaFailures + (outcome.failure === "schema" ? 1 : 0);
      const provider = step.providerFailures + (outcome.failure === "provider" ? 1 : 0);
      const stop = schema >= SCHEMA_FAILURE_LIMIT || provider >= PROVIDER_FAILURE_LIMIT;
      const backoffMs = outcome.failure === "provider" ? 60_000 * 2 ** (provider - 1) : 0;
      ok = await repo.finish(step, owner, {
        status: stop ? "needs_attention" : "queued", schemaFailures: schema, providerFailures: provider,
        notBefore: new Date(now.getTime() + backoffMs), lastError: outcome.error.slice(0, 500),
      });
      summary.attention += Number(ok && stop);
    }
    if (!ok) summary.leaseLost += 1;
  }
  return summary;
}
```
  - `steps/index.ts`: `export const HANDLERS: Record<StepKind, StepHandler>` with placeholder handlers that return `{ kind: "attention", error: "This kind of step is not built yet." }` (replaced in Tasks 6 and 12).
  - `ops/drain.ts` (`import "server-only"`): builds `DrainDeps` from `createSupabaseServiceClient()` (ops is allowed), `llm: null` until Task 9, `now: () => new Date()`, `clock: Date.now`; `drainFor(ms)` calls `drain(deps, createQueueRepo(deps.db), HANDLERS, ms)`; `SERVER_PUMP_STEPS = [...PUMP_STEPS, { job: "ingestion:drain", run: async () => summaryText(await drainFor(DRAIN_MS.pump)) }]`; `SERVER_DAILY_STEPS = [...DAILY_STEPS, { job: "ingestion:sweep", run: ... DRAIN_MS.daily }]`. `summaryText` returns e.g. `"ran 4, done 3, deferred 1"` (no document text, no error text).
  - Routes: `runPump(repo, SERVER_PUMP_STEPS)`, `runDaily(repo, SERVER_DAILY_STEPS)`; daily `maxDuration = 300`.
  - `ingestion/actions.ts`: `startUploadAction` and `finishUploadAction` call `requireAdmin()`, build the documents repo on the cookie session (`createSupabaseServerClient()`), call `startUpload` / `finishUpload`, then `finishUploadAction` creates the job and its first step (`{ kind: "pdf_text", pageNo: 1 }`) through a `createQueueRepo` built on the same admin session (RLS allows the insert, Task 3); errors return `{ ok: false, code, message }` with the message from `src/lib/messages.ts`. `revalidatePath("/desk/inbox")`.
  - `pump-actions.ts`: as in Interfaces; `keepReadingAction` returns `{ more }` = whether the drain ran at least one step.
  - `health.ts`: `getPublicHealth` also calls `rpc("queue_age")` and passes the number to `evaluatePublicHealth`; the desk report calls `queue_age()` through the cookie-less public client (`src/lib/supabase/public.ts`), because the grant is anon-only (the `capture_days` pattern, ADR-002 s5).
- [ ] **Step 6: Run** `rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint`; then `rtk pnpm e2e --project=anon e2e/clocks.spec.ts` (the health contract gains one check: update its expected `checks` length).
- [ ] **Step 7: `defenso guard_code`** on `actions.ts`, `pump-actions.ts`, `drain.ts`.
- [ ] **Step 8: Commit.** `feat(ingestion): job queue runner, pumps, queue health, machine-boundary graph test`.

---

### Task 6: Reading a PDF: `pdf_text` and `select_pages` steps, the page selector and the ETA (Slice B; spec s6.3, ADR-004 s4.4)

Executed by `desk-backend`. Adds the one new runtime dependency.

**Files:**
- Create: `scripts/make-fixture-pdf.mjs`, `e2e/fixtures/annual-report.pdf` (generated, committed), `src/modules/documents/pages.ts`, `src/modules/documents/selector.ts`, `selector.test.ts`, `src/modules/ingestion/eta.ts`, `eta.test.ts`, `src/modules/ingestion/steps/pdf-text.ts`, `steps/select-pages.ts`, `steps/steps.test.ts`
- Modify: `package.json` (`unpdf` 1.8.1 exact), `src/modules/documents/repo.ts` (+ `download`, `insertPages`, `setPageCount`, `listPagesForSelection`, `setVerdicts`, `setSelection`, `getPage`), `src/modules/ingestion/steps/index.ts` (register the two handlers), `src/modules/ingestion/caps.ts` (+ `PDF_TEXT_MS = 180_000`, `TOKENS_PER_PAGE_DEFAULT = 3_400`, `PUMP_EVERY_MIN = 15`, `PUMP_RUN_MS = 240_000`)

**Interfaces:**

```ts
// documents/pages.ts
export type PdfDoc = Awaited<ReturnType<typeof import("unpdf").getDocumentProxy>>;
export async function openPdf(bytes: Uint8Array): Promise<PdfDoc>;            // throws PdfOpenError
export async function pageText(pdf: PdfDoc, pageNo: number): Promise<string>; // NUL bytes stripped, whitespace tidied

// documents/selector.ts (pure)
export type PageVerdict = { pageNo: number; kind: PageKind; basis: Basis | null; score: number };
export function classifyPages(pages: { pageNo: number; text: string; isScan: boolean }[]): PageVerdict[];
export function selectPages(verdicts: PageVerdict[], opts: { budget: number; basis: Basis }): number[]; // ascending page numbers

// ingestion/eta.ts (pure)
export type Eta = { readyBy: Date; limitedBy: "minute" | "day" | null };
export function estimateReadyBy(i: { pagesLeft: number; tokensPerPage: number; usedToday: number; caps: { tpm: number; tpd: number }; now: Date; tabOpen: boolean }): Eta;
export function formatReadyBy(eta: Eta, now: Date): string; // "ready by 11:40" (same IST day) or "ready by Thu 10:00"
```

- [ ] **Step 1: Fixture PDF.** Add `unpdf@1.8.1` (`pnpm add unpdf@1.8.1 --save-exact`). Create `scripts/make-fixture-pdf.mjs` (complete; no dependencies; six text pages: page 4 a consolidated P&L, page 5 a consolidated balance sheet):

```js
// Writes e2e/fixtures/annual-report.pdf: a six-page, text-only PDF for the ingestion tests. Run: node scripts/make-fixture-pdf.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const pages = [
  ["Kaveri Fixtures Limited", "Annual Report 2025-26"],
  ["Directors' Report", "The Board presents its report for the year."],
  ["Management Discussion and Analysis", "Demand improved in the second half of the year."],
  ["Consolidated Statement of Profit and Loss for the year ended March 31, 2026", "(Rs. in crore)",
    "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
    "Revenue from operations 1,284.00 1,102.00", "Finance costs 41.20 38.90", "Profit for the year 152.60 118.30"],
  ["Consolidated Balance Sheet as at March 31, 2026", "(Rs. in crore)", "Particulars As at March 31, 2026 As at March 31, 2025",
    "Trade receivables 210.40 188.10", "Inventories 305.00 251.70"],
  ["Notice of Annual General Meeting", "Notice is hereby given that the meeting will be held."],
];
const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const objs = [];
const reserve = () => objs.push(null); // returns the new object number
const set = (n, body) => { objs[n - 1] = body; };
const catalog = reserve();
const pagesNode = reserve();
const font = reserve();
set(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const kids = pages.map((lines) => {
  const content = ["BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const stream = reserve();
  set(stream, `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  const page = reserve();
  set(page, `<< /Type /Page /Parent ${pagesNode} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
  return page;
});
set(pagesNode, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
set(catalog, `<< /Type /Catalog /Pages ${pagesNode} 0 R >>`);
let out = "%PDF-1.4\n";
const offsets = [];
objs.forEach((body, i) => {
  offsets.push(Buffer.byteLength(out, "latin1"));
  out += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(out, "latin1");
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
mkdirSync("e2e/fixtures", { recursive: true });
writeFileSync("e2e/fixtures/annual-report.pdf", Buffer.from(out, "latin1"));
```
Run `node scripts/make-fixture-pdf.mjs` and commit the PDF.

- [ ] **Step 2: Failing tests.**
  - `selector.test.ts`: on the fixture texts (read with `openPdf`/`pageText` in the test), page 4 is `pl`/consolidated, page 5 `bs`/consolidated, pages 1, 2, 6 are `other`, page 3 is `mdna`; a contents page that names three or more statement headings is `other` (contents penalty); a page right after a `pl` page with no heading but number density above 0.25 is `pl` (continuation) with a lower score; `selectPages(budget 1)` returns `[4]`; with `basis: "standalone"` a standalone P&L outranks a consolidated one; scans are never selected; the result is ascending.
  - `eta.test.ts`: 0 pages → `readyBy = now`, `limitedBy null`; 20 pages × 3,400 at 6,000 TPM with the tab open → about 12 min; tab closed → 3 pump runs → 45 min; when `usedToday` leaves 20,000 tokens and 20 pages remain → `limitedBy "day"` and `readyBy` the next day; `formatReadyBy` prints `ready by 11:40` for the same IST day and `ready by Thu 10:00` otherwise (IST via `src/lib/dates.ts`).
  - `steps.test.ts` (fake `DocumentsRepo`, fake clock): `pdf_text` on the fixture writes six pages and enqueues `select_pages`; with a clock that passes `PDF_TEXT_MS` after page 2 it writes pages 1-2 and enqueues `pdf_text` from page 3; garbage bytes → `attention` "This PDF could not be opened (it may be password-protected or damaged)."; `select_pages` marks pages 4 and 5 `selected_by 'rule'` and enqueues two `extract_page` steps when `deps.llm` is set, none when it is null (result `{ aiOff: true }`).
- [ ] **Step 3: Run, see failures.** `rtk pnpm vitest run src/modules/documents src/modules/ingestion`.
- [ ] **Step 4: Implement.**
  - `pages.ts`: `openPdf` = `getDocumentProxy(bytes)` from `unpdf` in try/catch → `PdfOpenError`; `pageText` = `pdf.getPage(n)` → `getTextContent()` → join each item's `str` with `"\n"` when `hasEOL`, else `" "`; then `.replace(/\u0000/g, "")` (Postgres text cannot hold NUL), collapse runs of spaces, trim; `page.cleanup()`.
  - `selector.ts` (complete core):

```ts
import type { Basis, PageKind } from "./types";

export type PageVerdict = { pageNo: number; kind: PageKind; basis: Basis | null; score: number };
const HEAD = 400; // statement headings sit at the top of the page
const HEADINGS: [Exclude<PageKind, "other">, RegExp, number][] = [
  ["pl", /statement\s+of\s+profit\s+(?:and|&)\s+loss/i, 100],
  ["bs", /balance\s+sheet\s+as\s+at/i, 100],
  ["cf", /cash\s+flows?\s+statement|statement\s+of\s+cash\s+flows?/i, 100],
  ["segment", /segment\s+(?:information|reporting|revenue)/i, 70],
  ["notes", /notes?\s+(?:forming\s+part|to\s+the\s+(?:consolidated\s+|standalone\s+)?financial\s+statements)/i, 40],
  ["mdna", /management(?:'s|’s)?\s+discussion\s+(?:and|&)\s+analysis/i, 30],
];
const numberDensity = (text: string): number => {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  return tokens.filter((t) => /^\(?-?[\d,]+(?:\.\d+)?\)?$/.test(t)).length / tokens.length;
};
const basisOf = (head: string): Basis | null =>
  /\bconsolidated\b/i.test(head) ? "consolidated" : /\bstandalone\b/i.test(head) ? "standalone" : null;

export function classifyPages(pages: { pageNo: number; text: string; isScan: boolean }[]): PageVerdict[] {
  const out: PageVerdict[] = [];
  for (const p of pages) {
    const head = p.text.slice(0, HEAD);
    const density = numberDensity(p.text);
    const hits = HEADINGS.filter(([, re]) => re.test(p.text)).length;
    const top = HEADINGS.find(([, re]) => re.test(head));
    const prev = out[out.length - 1];
    let verdict: PageVerdict = { pageNo: p.pageNo, kind: "other", basis: basisOf(head), score: 0 };
    if (p.isScan || hits >= 3) {
      // scans wait for Plan 2b; a contents page names every statement
    } else if (top) {
      verdict = { ...verdict, kind: top[0], score: top[2] + density * 50 };
    } else if (prev && ["pl", "bs", "cf"].includes(prev.kind) && prev.pageNo === p.pageNo - 1 && density > 0.25) {
      verdict = { pageNo: p.pageNo, kind: prev.kind, basis: prev.basis, score: prev.score - 10 }; // the statement runs on
    }
    out.push(verdict);
  }
  return out;
}

export function selectPages(verdicts: PageVerdict[], opts: { budget: number; basis: Basis }): number[] {
  return verdicts
    .filter((v) => v.kind !== "other" && v.score > 0)
    .map((v) => ({ ...v, rank: v.score + (v.basis === opts.basis ? 20 : v.basis === null ? 5 : -40) }))
    .sort((a, b) => b.rank - a.rank || a.pageNo - b.pageNo)
    .slice(0, Math.max(0, opts.budget))
    .map((v) => v.pageNo)
    .sort((a, b) => a - b);
}
```
  - `pdf-text.ts`: download once (`repo.download(storagePath)` = `db.storage.from("documents").download(path)` → `Uint8Array`), `openPdf`, loop from `step.pageNo` while `clock() < Math.min(deadline - 20_000, start + PDF_TEXT_MS)`, flushing every 25 pages with `insertPages` (`upsert(rows, { onConflict: "document_id,page_no", ignoreDuplicates: true })`); on the first step `setPageCount`; pages left → `{ kind: "done", enqueue: [{ kind: "pdf_text", pageNo: next }] }`; finished → `enqueue: [{ kind: "select_pages", pageNo: null }]`; over 5,000 pages → attention.
  - `select-pages.ts`: `listPagesForSelection(documentId)` (columns `page_no, text, is_scan`), `classifyPages`, `setVerdicts` (non-`other` pages only), `selectPages` with the document's budget and basis, `setSelection(..., "rule")`, enqueue `extract_page` per selected page when `deps.llm` is not null.
  - `eta.ts` from the Interfaces and the test numbers (`PUMP_RUN_MS`, `PUMP_EVERY_MIN` from caps).
- [ ] **Step 5: Run** the suites, then `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build` (the build proves `unpdf` bundles for the server without `@napi-rs/canvas`).
- [ ] **Step 6: Commit.** `feat(ingestion): read PDF pages with unpdf, find statement pages, estimate ready-by`.

---

### Task 7: Inbox screen: drop bar, trays, page chooser, keep-reading loop (Slice B; segment 4 C, `InboxSection`)

Executed by `desk-ui` (opus), both halves (pure tray logic and screens); `desk-backend` reviews the actions. Controller visual QA at 375/1280, light/dark.

**Files:**
- Create: `src/modules/ingestion/trays.ts`, `trays.test.ts`, `src/modules/ingestion/inbox.ts`, `src/app/desk/inbox/page.tsx`, `src/components/desk/private/inbox/{drop-bar,inbox-section,document-card,budget-meter,page-chooser,keep-reading}.tsx`, `inbox.test.tsx`, `e2e/desk-inbox.spec.ts`
- Modify: `src/components/desk/private/desk-tabs.tsx:10-14` (Inbox tab between Capture and Items, count = ready + attention documents; remove the "Inbox arrives with Phase 2" comment), `src/app/desk/desk-data.ts` (inbox count), `src/modules/ingestion/actions.ts` (+ `setPageSelectedAction`, `setBudgetAction`, `skipStepAction`, `retryStepAction`, `skipDocumentAction`, `readSelectedAction`), `src/lib/messages.ts`, `e2e/desk-a11y.spec.ts` (scan `/desk/inbox`), `playwright.config.ts` (add `desk-inbox` to the desk projects)

**Interfaces:**

```ts
// trays.ts (pure)
export type Tray = "ready" | "attention" | "reading" | "paused" | "waiting" | "finished";
export type DocState = {
  status: DocumentStatus; pageCount: number | null; pagesRead: number; aiOn: boolean; pending: number; flagged: number;
  steps: { kind: StepKind; status: StepStatus; notBefore: string; waitReason: WaitReason | null; pageNo: number | null; lastError: string | null; everClaimed: boolean }[];
};
export type TrayView = { tray: Tray; message: string; attentionPages: number[]; extractDone: number; extractTotal: number };
export function trayFor(d: DocState, now: Date, eta: string | null): TrayView;

// inbox.ts
export type InboxDoc = { id: string; title: string; company: string | null; createdAt: string; budget: number; view: TrayView;
  pages: { pageNo: number; kind: PageKind | null; basis: Basis | null; firstLine: string; selected: boolean; by: "rule" | "aksh" | null }[] };
export async function listInbox(db: Db, now: Date): Promise<{ docs: InboxDoc[]; usage: { storageBytes: number; databaseBytes: number }; aiOn: boolean }>;
```
`everClaimed` is `lease_owner is not null or status <> 'queued'`. Tray rules, in order (one test each): `done`/`skipped` → finished; `uploading` → waiting ("Upload not finished. Choose the file again to resume."); any step `needs_attention` → attention ("Page 142 could not be read." / "Pages 142-147 could not be read." / for `pdf_text`: "This PDF could not be opened (it may be password-protected or damaged)."; when `pending > 0` add "{pending} figures are ready to check."); every unfinished step waiting with a `wait_reason` and `notBefore > now` → paused (`groq_day`: "Today's free AI allowance is used up. It carries on by itself: {eta}."; `groq_minute`: "Waiting a minute for the AI allowance."; `ai_off`: "AI reading is off."); an unfinished `pdf_text` → reading ("Reading page {pagesRead} of {pageCount}"); an unfinished `extract_page` → reading ("Reading figures: {done} of {total} pages, {eta}"); no step ever claimed → waiting ("Queued. Starts within 15 minutes, sooner while this page is open."); `pending > 0` → ready ("{pending} figures ready to check." plus " {flagged} need a look." when flagged); otherwise ready ("Read. No figures matched; open it beside your file.").

- [ ] **Step 1: Failing tests.** `trays.test.ts` (one case per rule; priority: attention beats ready and carries the pending sentence). `inbox.test.tsx`: InboxSection renders trays in the order Ready, Needs attention, Being read, Paused, Waiting; empty trays hidden except Ready ("Nothing to review."); card actions per tray (Review; Enter manually / Skip / Try again; none while reading); BudgetMeter "Storage 412 MB of 1 GB" with warn tone at 70% and the refuse sentence at 90%; PageChooser lists pages with a kind label ("P&L · consolidated"), and ticking past the budget first shows "Raise this document to 40 pages? Ready by ..." and only then ticks; DropBar refuses a 51 MB file before upload with the spec s10 sentence.
- [ ] **Step 2: Failing e2e** `e2e/desk-inbox.spec.ts` (desk-desktop and desk-mobile): upload `e2e/fixtures/annual-report.pdf` with `$KAV` → a card under Being read or Waiting → within 60 s (the keep-reading loop drives the drain) the chooser shows pages 4 and 5 ticked → banner "AI reading is off" (no LLM until Task 9; Task 15 flips this assertion) → upload the same file again → "You uploaded this on ..." with a link to the first document.
- [ ] **Step 3: Implement.** `listInbox`: documents not finished plus the last 10 finished; their steps in one `.in()` query; page rows for the chooser (columns `page_no, kind, basis, selected, selected_by, left(text, 120)` through a view or `select` with a computed first line in TypeScript; never ship whole page texts to the client); pending and flagged counts from `proposals` once Task 10 exists (0 until then); `aiOn` passed in from the page, which calls `aiReadingOn()` from `@/modules/ops/jobs` (Task 5; false until Task 9 wires the port). Actions (each `requireAdmin()`, admin cookie session): `setPageSelectedAction` refuses to pass the budget, inserts an `extract_page` step when ticking with AI on, sets a queued step `skipped` when unticking; `setBudgetAction` accepts 1-40; `retryStepAction` sets `queued`, zeroes `schema_failures`, `provider_failures`, `lease_expiries`, clears `last_error`; `skipStepAction` sets `skipped`; `skipDocumentAction` sets the document `skipped`; `readSelectedAction` enqueues steps for selected pages that have none (documents read while AI was off). Components (tokens only): `KeepReading` is a client leaf that, while `document.visibilityState === "visible"` and the last call returned `more`, calls `keepReadingAction`, then `router.refresh()`, waits 3 s and repeats; `DropBar` hashes with `hashFile`, calls `startUploadAction`, uploads with the browser client's `storage.from("documents").uploadToSignedUrl(path, token, file)`, then `finishUploadAction`, then `kickReadingAction`. Copy verbatim from spec s7/s10.
- [ ] **Step 4: Run** `rtk pnpm vitest run`, `rtk pnpm e2e --project=desk-desktop --project=desk-mobile e2e/desk-inbox.spec.ts e2e/desk-a11y.spec.ts`, typecheck, lint. Controller visual QA.
- [ ] **Step 5: Commit.** `feat(desk): Inbox tab with drop bar, trays, page chooser and keep-reading loop`.

---

### Task 8: Document pane beside the editor (Slice B; spec s6.1)

Executed by `desk-ui` (opus). The manual path's payoff before any AI: the report open beside the Facts form.

**Files:**
- Create: `src/modules/documents/verbatim.ts`, `verbatim.test.ts`, `src/modules/documents/actions.ts`, `src/components/desk/private/doc-pane/{doc-pane,page-view}.tsx`, `doc-pane.test.tsx`, `src/components/desk/private/add-source-event.ts`
- Modify: `src/modules/documents/client.ts` (export `onPage`, `normaliseText`, `parsePrinted`), `src/app/desk/items/[id]/load.ts` (+ `documents` for the item's company), `src/app/desk/items/[id]/page.tsx` (desktop: the pane opens as a column beside the editor; phone: a full-height sheet from "Open a document"), `src/components/desk/private/facts-form/use-facts-state.ts` (handle the add-source event: add or reuse an `S` row)

**Interfaces:**

```ts
// documents/verbatim.ts (pure, browser-safe; ADR-004 s4.6)
export function normaliseText(s: string): string;
export function onPage(needle: string, pageText: string): boolean;
export function parsePrinted(text: string): number | null;

// documents/actions.ts ("use server", read-only, admin)
export async function readPageAction(documentId: string, pageNo: number): Promise<{ ok: true; text: string; pageCount: number; kind: PageKind | null } | { ok: false; message: string }>;
export async function searchPagesAction(documentId: string, query: string): Promise<{ pageNo: number; snippet: string }[]>;
export async function checkQuotesAction(documentId: string, items: { factId: string; pageNo: number; quote: string; valueText: string }[]): Promise<{ factId: string; quoteFound: boolean; valueFound: boolean }[]>;

// add-source-event.ts
export const ADD_SOURCE_EVENT = "desk:add-source";
export type AddSourceDetail = { doc: string; type: SourceType; filedOn: string; url: string };
```

- [ ] **Step 1: Failing tests.** `verbatim.test.ts`: `onPage("1,284.00", "Revenue from operations 1,284.00 1,102.00")` true; `onPage("1284", same)` false (a number must stand alone: `1284.00` continues with `.0`); `onPage("41.70", "Finance costs 41.20 38.90")` false; `onPage("(1,234.50)", "Loss (1,234.50) (980.00)")` true; a line with double spaces and an NBSP matches its single-spaced copy; `onPage("Revenue – total", "revenue - total")` true (en dash); `parsePrinted`: `"1,28,400"` 128400, `"(1,234.50)"` -1234.5, `"−12.5"` -12.5, `"-"` null, `"Nil"` null, `"₹ 45"` 45. `doc-pane.test.tsx`: the page stepper reads pages through a mocked `readPageAction`; search lists snippets; "Use as source" dispatches `ADD_SOURCE_EVENT` with the document's title, type, filed-on and link; "Check my quotes" lists "found on p. 4" / "not on p. 4".
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement** `verbatim.ts` (complete):

```ts
const DASHES = /[‐-―−]/g;
export function normaliseText(s: string): string {
  return s.normalize("NFKC").replace(/ /g, " ").replace(DASHES, "-").replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}
const ungroup = (s: string) => s.replace(/(\d),(?=\d)/g, "$1");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function onPage(needle: string, pageText: string): boolean {
  const n = ungroup(normaliseText(needle));
  const p = ungroup(normaliseText(pageText));
  if (n === "") return false;
  if (/^\(?-?\d[\d.]*\)?$/.test(n)) return new RegExp(`(?<![\\d.])${escapeRe(n)}(?!\\d|\\.\\d)`).test(p);
  return p.includes(n);
}
export function parsePrinted(text: string): number | null {
  const t = normaliseText(text).replace(/₹|\brs\.?|\binr\b/g, "").replace(/,/g, "").replace(/\s+/g, "");
  if (t === "" || t === "-" || t === "nil") return null;
  const negative = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/^\(|\)$/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
```
  The actions use the admin cookie session, explicit columns; `searchPagesAction` uses `.textSearch("search", query, { type: "websearch", config: "simple" })` and returns 10 snippets of 160 characters around the first hit. The pane holds the open document, page number and text; it never writes facts: "Use as source" only dispatches the event, which `useFactsState` turns into an `S` row (reused when an existing source has the same title, case-insensitive, and filed-on date).
- [ ] **Step 4: Run** unit tests, `rtk pnpm e2e --project=desk-desktop --project=desk-mobile e2e/desk-facts-form.spec.ts` (unchanged without documents), and extend `e2e/desk-inbox.spec.ts`: open the Kaveri file, open the uploaded document, step to page 4, "Use as source" adds an `S` row, type a fact with quote "Revenue from operations 1,284.00 1,102.00", "Check my quotes" says found on p. 4.
- [ ] **Step 5: Commit.** `feat(desk): document pane beside the editor with search, use-as-source and quote checks`.

---

### Task 9: Provider port, the Groq adapter and the fixture adapter (Slice C; ADR-004 s3.5, s4.5; spec s9)

Executed by `desk-backend`. **New env vars: `GROQ_API_KEY`, `GROQ_MODEL_TEXT`, `LLM_ADAPTER`** (table above).

**Files:**
- Create: `src/lib/providers/llm.ts`, `strict-schema.ts`, `strict-schema.test.ts`, `groq.ts`, `groq.test.ts`, `fixture-llm.ts`, `fixtures/extraction.json` (`[]` until Task 12), `index.ts`, `scripts/groq-live-check.mjs`
- Modify: `src/lib/env.server.ts`, `src/lib/env.server.test.ts`, `.env.example` (`LLM_ADAPTER` under Groq with `[DEV-ONLY]`: "fixture for local e2e; never set on Vercel"), `src/modules/ingestion/deps.ts` (`llm: LlmPort | null`), `src/modules/ops/drain.ts` (`buildLlm()` returns `createLlmPort(serverEnv())`, which also turns `aiReadingOn()` true when a key or the fixture is configured). The e2e app env gains `LLM_ADAPTER=fixture` in Task 12, not here: until the extract handler exists, an enabled LLM would send every selected page to the placeholder handler.

**Interfaces:**

```ts
// llm.ts
import type { z } from "zod";
export type LlmUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type RateHeaders = { remainingTokens: number | null; remainingRequests: number | null; retryAfterSeconds: number | null };
export type LlmRequest<T> = { model: string; system: string; user: string; schema: z.ZodType<T>; schemaName: string;
  maxCompletionTokens: number; reasoningEffort?: "low" | "medium" | "high" };
export type LlmResult<T> =
  | { kind: "ok"; data: T; usage: LlmUsage; rate: RateHeaders }
  | { kind: "invalid"; raw: string; issues: string[]; usage: LlmUsage | null; rate: RateHeaders }
  | { kind: "rate_limited"; rate: RateHeaders }
  | { kind: "provider_error"; status: number | null; message: string; rate: RateHeaders };
export interface LlmPort { readonly name: "groq" | "fixture"; complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> }

// index.ts
export function createLlmPort(env: { GROQ_API_KEY?: string; LLM_ADAPTER?: "groq" | "fixture" }): LlmPort | null;
```
`OcrPort` and `TranscriberPort` are declared in Plan 2b, when a caller exists.

- [ ] **Step 1: Failing tests.**
  - `strict-schema.test.ts`: for a schema with a nullable string, an array of objects and an enum, `strictJsonSchema` returns no `$schema`; every object has `additionalProperties: false` and `required` equal to all its property names; nullable fields read `{ "type": ["string", "null"] }`; no `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern` or `format` remain (strict-mode support for them is not documented; limits are enforced after parsing).
  - `groq.test.ts` (fake `fetch`): `POST https://api.groq.com/openai/v1/chat/completions` with `Authorization: Bearer <key>`, `temperature: 0`, `max_completion_tokens`, `reasoning_effort: "low"`, `include_reasoning: false`, `response_format.type "json_schema"` and `strict: true`; 200 with valid JSON → `ok` with usage and parsed headers (`x-ratelimit-remaining-tokens: "5400"` → 5400, `x-ratelimit-remaining-requests: "998"` → 998); `finish_reason "length"` → `invalid`; non-JSON → `invalid`; JSON failing Zod → `invalid` with paths; 429 with `retry-after: "7.5"` → `rate_limited` with 7.5; 400 with `error.code "json_validate_failed"` → `invalid`; 500 → `provider_error` 500; a thrown `fetch` → `provider_error` null; the key never appears in any returned field.
  - `env.server.test.ts`: `GROQ_API_KEY=""` parses as undefined; a 10-character key is refused; `GROQ_MODEL_TEXT` defaults to `openai/gpt-oss-120b`; `LLM_ADAPTER="other"` is refused.
- [ ] **Step 2: Run, see failures.** `rtk pnpm vitest run src/lib`.
- [ ] **Step 3: Implement.**
  - `env.server.ts` (empty strings from the template must not crash the app):

```ts
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
// inside serverSchema:
GROQ_API_KEY: optional(z.string().trim().min(20, "must be a Groq API key")),
GROQ_MODEL_TEXT: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).default("openai/gpt-oss-120b")),
LLM_ADAPTER: optional(z.enum(["groq", "fixture"])),
```
  - `strict-schema.ts`: `z.toJSONSchema(schema)`, delete `$schema`, then a recursive `tighten` that (a) sets `additionalProperties: false` and `required: Object.keys(properties)` on every object, (b) rewrites `anyOf: [X, { type: "null" }]` where `X.type` is a string into `{ ...X, type: [X.type, "null"] }` (adding `null` to `enum` when present), (c) deletes `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `format`.
  - `groq.ts` (complete):

```ts
import "server-only";
import type { LlmPort, LlmRequest, LlmResult, LlmUsage, RateHeaders } from "./llm";
import { strictJsonSchema } from "./strict-schema";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"; // API reference, verified 2026-10-07
const NO_RATE: RateHeaders = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const num = (v: string | null): number | null => (v === null || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function readRate(h: Headers): RateHeaders {
  return {
    remainingTokens: num(h.get("x-ratelimit-remaining-tokens")),
    remainingRequests: num(h.get("x-ratelimit-remaining-requests")),
    retryAfterSeconds: num(h.get("retry-after")),
  };
}
function readUsage(u: unknown): LlmUsage | null {
  const o = u as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } | null;
  return o && typeof o.total_tokens === "number"
    ? { promptTokens: Number(o.prompt_tokens ?? 0), completionTokens: Number(o.completion_tokens ?? 0), totalTokens: o.total_tokens }
    : null;
}
type Body = { error?: { code?: string; message?: string }; usage?: unknown; choices?: { finish_reason?: string; message?: { content?: unknown } }[] };

export function createGroqLlm(opts: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number }): LlmPort {
  const doFetch = opts.fetch ?? fetch;
  return {
    name: "groq",
    async complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
      const body = {
        model: req.model,
        temperature: 0,
        max_completion_tokens: req.maxCompletionTokens,
        ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort, include_reasoning: false } : {}),
        response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: strictJsonSchema(req.schema), strict: true } },
        messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
      };
      let res: Response;
      try {
        res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
        });
      } catch (error) {
        return { kind: "provider_error", status: null, message: error instanceof Error ? error.name : "network", rate: NO_RATE };
      }
      const rate = readRate(res.headers);
      if (res.status === 429) return { kind: "rate_limited", rate };
      const json = (await res.json().catch(() => null)) as Body | null;
      if (!res.ok) {
        // Strict mode can refuse a non-conforming answer; Step 5's live check confirms this code name.
        if (res.status === 400 && json?.error?.code === "json_validate_failed") {
          return { kind: "invalid", raw: "", issues: [String(json.error.message ?? "json_validate_failed").slice(0, 300)], usage: null, rate };
        }
        return { kind: "provider_error", status: res.status, message: String(json?.error?.code ?? res.statusText).slice(0, 200), rate };
      }
      const usage = readUsage(json?.usage);
      const choice = json?.choices?.[0];
      const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
      if (choice?.finish_reason === "length") {
        return { kind: "invalid", raw: content.slice(0, 2000), issues: ["The answer was cut off at max_completion_tokens."], usage, rate };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { kind: "invalid", raw: content.slice(0, 2000), issues: ["The answer was not JSON."], usage, rate };
      }
      const checked = req.schema.safeParse(parsed);
      if (!checked.success) {
        const issues = checked.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { kind: "invalid", raw: content.slice(0, 2000), issues, usage, rate };
      }
      return { kind: "ok", data: checked.data, usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, rate };
    },
  };
}
```
  - `fixture-llm.ts`: `createFixtureLlm(table = FIXTURES)` where `FIXTURES` is `fixtures/extraction.json` (`{ when: string; output: unknown }[]`); the first entry whose `when` occurs in `req.user` answers, else the empty page `{ page_kind: "other", basis: "unknown", unit_header: null, current_header: null, prior_header: null, rows: [] }`; the output always goes through `req.schema.safeParse` (drift fails loudly as `invalid`); usage `{ promptTokens: 2500, completionTokens: 500, totalTokens: 3000 }`; rate headers null.
  - `index.ts`: `fixture` wins; else Groq when the key is set; else null ("AI reading is off").
- [ ] **Step 4: Run** `rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint`.
- [ ] **Step 5: Live check (manual, Shlok's key; not CI).** `scripts/groq-live-check.mjs` sends one request (`openai/gpt-oss-120b`, `reasoning_effort: "low"`, `include_reasoning: false`, strict schema `{ ok: boolean }`, `max_completion_tokens: 200`) via `node --env-file=.env.local scripts/groq-live-check.mjs` and prints only the HTTP status, `usage`, the names of the `x-ratelimit-*` headers present and, on a 400, `error.code`. Paste the output (never the key) into the task report. If reasoning and strict schema cannot be combined, Task 12 drops `reasoningEffort` and ADR-004 s8 records it.
- [ ] **Step 6: `defenso guard_code`** on `groq.ts` and `env.server.ts`.
- [ ] **Step 7: Commit.** `feat(providers): LlmPort, Groq adapter with strict JSON and rate headers, fixture adapter`.

---

### Task 10: Migration 0007: extractions, proposals, provenance, usage ledger and reservation (Slice C; ADR-004 s4.2-s4.5)

Executed by `desk-backend`. Local stack only.

**Files:**
- Create: `supabase/migrations/20261007000007_extraction.sql`, `supabase/tests/0007_extraction.test.sql`
- Modify: `supabase/tests/0001_core_grants.test.sql` (service_role allowlist: column SELECT on `items` and `item_revisions`, and the four new tables), `supabase/tests/0002_function_privileges.test.sql` (service_role gains `reserve_usage`, `prune_provider_usage`), `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `extractions`, `proposals`, `fact_provenance`, `provider_usage`; `public.reserve_usage(p_bucket text, p_tokens integer, p_tpm integer, p_tpd integer, p_rpm integer, p_rpd integer) returns table (ok boolean, reservation_id uuid, not_before timestamptz, reason text)` and `public.prune_provider_usage() returns integer` (service_role only). `service_role` gains column SELECT on `items (id, company_id, kind, title, created_at)` and `item_revisions (id, item_id, rev_no, structured, created_at)`: the machine may read facts to match labels, never `body_md` or `change_reason`.

- [ ] **Step 1: Failing pgTAP** `0007_extraction.test.sql` (plan(22)): tables exist with RLS; anon holds nothing; `extractions` UPDATE and DELETE raise (append-only); a service_role proposal insert with `status 'accepted'` or an `item_id` raises `P0001` ("the machine only proposes ..."); a service_role UPDATE of a proposal is refused (no grant) and, with a temporary grant, the guard raises "only Aksh decides on a proposal (ADR-004 s4.2)"; the admin can set `accepted` with `accepted_value`; changing `machine_value` raises "what the machine read is never changed"; a `filed` proposal cannot change; `filed` without `revision_id` violates the check; a duplicate `dedupe_key` for one document is refused; a `fact_provenance` admin insert succeeds only when the revision belongs to the proposal's item; `fact_provenance` UPDATE and DELETE raise; as service_role `select body_md from item_revisions` raises 42501 while `select structured` succeeds; `reserve_usage`: the first call is ok; with tpm 6000 a second 4,000-token call in the same minute returns `ok false`, `reason 'groq_minute'`, `not_before` about 60 s ahead; with tpd 5000 → `'groq_day'`; a `rate_limited` row with a future `blocked_until` blocks with its `block_reason`; released reservations do not count; `p_tokens > p_tpm` raises 22023; `prune_provider_usage()` deletes rows older than 48 h and returns the count; both functions are service_role only.
- [ ] **Step 2: Run, see failures.** `pnpm db:reset && pnpm db:test`.
- [ ] **Step 3: Write the migration** `20261007000007_extraction.sql` (complete):

```sql
-- =============================================================================
-- 20261007000007_extraction.sql - Phase 2a: what the machine read (extractions), what it proposes
-- (proposals), what Aksh filed (fact_provenance), and the provider budget ledger (ADR-004 s4.2-s4.5).
-- =============================================================================

-- 1. The machine may read facts (structured) to match labels, never Aksh's words (body_md, change_reason).
grant select (id, company_id, kind, title, created_at) on public.items to service_role;
grant select (id, item_id, rev_no, structured, created_at) on public.item_revisions to service_role;

-- 2. Extractions: append-only, per document page, model and prompt version.
create table public.extractions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null,
  page_no        integer not null,
  model          text not null check (char_length(model) between 1 and 80),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  input_hash     text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output         jsonb not null,
  tokens_used    integer not null default 0 check (tokens_used >= 0),
  created_at     timestamptz not null default now(),
  foreign key (document_id, page_no) references public.document_pages (document_id, page_no) on delete restrict
);
create index extractions_cache_idx on public.extractions (input_hash, model, prompt_version);
create index extractions_document_idx on public.extractions (document_id, page_no);
create trigger extractions_append_only before update or delete on public.extractions
  for each row execute function private.reject_mutation();
create trigger extractions_no_truncate before truncate on public.extractions
  for each statement execute function private.reject_mutation();

-- 3. Proposals: the machine inserts pending rows; only Aksh decides.
create table public.proposals (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete restrict,
  page_no        integer not null check (page_no >= 1),
  extraction_id  uuid not null references public.extractions (id) on delete restrict,
  dedupe_key     text not null check (char_length(dedupe_key) between 1 and 200),
  machine_value  jsonb not null,
  accepted_value jsonb,
  flags          text[] not null default '{}'
                 check (flags <@ array['value_not_on_page', 'quote_not_on_page', 'prior_not_on_page', 'period_unknown', 'unit_unknown']::text[]),
  reason         text not null check (reason in ('core', 'label_match', 'moved')),
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'edited', 'rejected', 'filed')),
  item_id        uuid references public.items (id) on delete restrict,
  revision_id    uuid references public.item_revisions (id) on delete restrict,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (document_id, dedupe_key),
  check ((status = 'filed') = (revision_id is not null)),
  check (status not in ('accepted', 'edited', 'filed') or accepted_value is not null)
);
create index proposals_item_idx on public.proposals (item_id) where status in ('accepted', 'edited');
create index proposals_document_status_idx on public.proposals (document_id, status);
create trigger proposals_set_updated_at before update on public.proposals
  for each row execute function private.set_updated_at();

create function private.guard_proposal_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'pending' or new.accepted_value is not null or new.item_id is not null
     or new.revision_id is not null or new.decided_at is not null then
    raise exception 'the machine only proposes: a new proposal is pending and undecided' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger proposals_insert_pending before insert on public.proposals
  for each row execute function private.guard_proposal_insert();

create function private.guard_proposal_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.machine_value is distinct from old.machine_value or new.extraction_id <> old.extraction_id
     or new.dedupe_key <> old.dedupe_key or new.flags is distinct from old.flags or new.document_id <> old.document_id
     or new.page_no <> old.page_no or new.reason <> old.reason then
    raise exception 'what the machine read is never changed' using errcode = 'P0001';
  end if;
  if current_user = 'service_role' then
    raise exception 'only Aksh decides on a proposal (ADR-004 s4.2)' using errcode = '42501';
  end if;
  if old.status = 'filed' then
    raise exception 'a filed proposal is final' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger proposals_guard_update before update on public.proposals
  for each row execute function private.guard_proposal_update();

-- 4. Provenance: which proposal each filed fact came from, and whether Aksh changed it.
create table public.fact_provenance (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.item_revisions (id) on delete restrict,
  fact_id     text not null check (fact_id ~ '^F\d{1,3}$'),
  proposal_id uuid not null references public.proposals (id) on delete restrict,
  edited      boolean not null,
  created_at  timestamptz not null default now(),
  unique (revision_id, fact_id)
);
create index fact_provenance_proposal_idx on public.fact_provenance (proposal_id);
create trigger fact_provenance_append_only before update or delete on public.fact_provenance
  for each row execute function private.reject_mutation();
create trigger fact_provenance_no_truncate before truncate on public.fact_provenance
  for each statement execute function private.reject_mutation();

-- 5. The provider budget ledger (ADR-004 s4.5).
create table public.provider_usage (
  id                 uuid primary key default gen_random_uuid(),
  bucket             text not null check (char_length(bucket) between 1 and 80),
  kind               text not null check (kind in ('reservation', 'observation', 'rate_limited')),
  tokens_est         integer check (tokens_est >= 0),
  tokens_used        integer check (tokens_used >= 0),
  status             text check (status in ('reserved', 'used', 'released')),
  remaining_tokens   integer,
  remaining_requests integer,
  retry_after_s      numeric,
  blocked_until      timestamptz,
  block_reason       text check (block_reason in ('groq_minute', 'groq_day')),
  at                 timestamptz not null default clock_timestamp(),
  check ((kind = 'reservation') = (status is not null)),
  check ((blocked_until is null) = (block_reason is null))
);
create index provider_usage_bucket_at_idx on public.provider_usage (bucket, at desc);

create function public.reserve_usage(p_bucket text, p_tokens integer, p_tpm integer, p_tpd integer, p_rpm integer, p_rpd integer)
returns table (ok boolean, reservation_id uuid, not_before timestamptz, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_block record;
  v_min_tokens bigint;
  v_day_tokens bigint;
  v_min_reqs bigint;
  v_day_reqs bigint;
  v_id uuid;
begin
  if p_tokens is null or p_tokens < 1 or p_tokens > p_tpm then
    raise exception 'one call must fit inside the minute cap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('provider_usage:' || p_bucket));

  select u.blocked_until, u.block_reason into v_block
    from public.provider_usage u
   where u.bucket = p_bucket and u.blocked_until > v_now
   order by u.blocked_until desc limit 1;
  if found then
    return query select false, null::uuid, v_block.blocked_until, v_block.block_reason;
    return;
  end if;

  select coalesce(sum(coalesce(u.tokens_used, u.tokens_est)) filter (where u.at > v_now - interval '1 minute'), 0),
         coalesce(sum(coalesce(u.tokens_used, u.tokens_est)), 0),
         count(*) filter (where u.at > v_now - interval '1 minute'),
         count(*)
    into v_min_tokens, v_day_tokens, v_min_reqs, v_day_reqs
    from public.provider_usage u
   where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '24 hours';

  if v_day_tokens + p_tokens > p_tpd or v_day_reqs + 1 > p_rpd then
    return query
      select false, null::uuid, min(u.at) + interval '24 hours', 'groq_day'::text
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '24 hours';
    return;
  end if;
  if v_min_tokens + p_tokens > p_tpm or v_min_reqs + 1 > p_rpm then
    return query
      select false, null::uuid, min(u.at) + interval '1 minute', 'groq_minute'::text
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '1 minute';
    return;
  end if;

  insert into public.provider_usage (bucket, kind, tokens_est, status, at)
  values (p_bucket, 'reservation', p_tokens, 'reserved', v_now)
  returning id into v_id;
  return query select true, v_id, null::timestamptz, null::text;
end;
$$;

create function public.prune_provider_usage()
returns integer language sql security definer set search_path = ''
as $$
  with gone as (delete from public.provider_usage where at < now() - interval '48 hours' returning 1)
  select count(*)::integer from gone;
$$;

-- 6. RLS and grants.
alter table public.extractions     enable row level security;
alter table public.proposals       enable row level security;
alter table public.fact_provenance enable row level security;
alter table public.provider_usage  enable row level security;

create policy extractions_admin_read on public.extractions for select to authenticated using ((select private.is_admin()));
create policy proposals_admin_read on public.proposals for select to authenticated using ((select private.is_admin()));
create policy proposals_admin_update on public.proposals for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()) and status <> 'pending');
create policy fact_provenance_admin_read on public.fact_provenance for select to authenticated using ((select private.is_admin()));
create policy fact_provenance_admin_insert on public.fact_provenance for insert to authenticated
  with check ((select private.is_admin()) and exists (
    select 1 from public.proposals p join public.item_revisions r on r.item_id = p.item_id
     where p.id = proposal_id and r.id = revision_id));
create policy provider_usage_admin_read on public.provider_usage for select to authenticated using ((select private.is_admin()));

revoke all on public.extractions, public.proposals, public.fact_provenance, public.provider_usage
  from public, anon, authenticated, service_role;
grant select on public.extractions, public.proposals, public.fact_provenance, public.provider_usage to authenticated;
grant update (accepted_value, status, item_id, revision_id, decided_at) on public.proposals to authenticated;
grant insert on public.fact_provenance to authenticated;

grant select, insert on public.extractions, public.proposals to service_role;
grant select, insert on public.provider_usage to service_role;
grant update (tokens_used, status) on public.provider_usage to service_role;

revoke execute on function public.reserve_usage(text, integer, integer, integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.reserve_usage(text, integer, integer, integer, integer, integer) to service_role;
revoke execute on function public.prune_provider_usage() from public, anon, authenticated, service_role;
grant execute on function public.prune_provider_usage() to service_role;
```
  The proposals update policy's `with check (status <> 'pending')` means a decision is never undone in 2a; Unstage (Task 14) only clears `item_id` and keeps `accepted`/`edited`.
- [ ] **Step 4: Run** `pnpm db:reset && pnpm db:test`; `pnpm db:types`; `rtk pnpm typecheck`.
- [ ] **Step 5: `defenso guard_code`** on the migration.
- [ ] **Step 6: Commit.** `feat(db): extractions, proposals, provenance and the provider usage ledger (migration 0007, ADR-004)`.

---

### Task 11: Budget governor (Slice C; ADR-004 s4.5; R3 row 1)

Executed by `desk-backend`.

**Files:**
- Create: `src/modules/ingestion/usage-repo.ts`, `governor.ts`, `governor.test.ts`
- Modify: `src/modules/ingestion/caps.ts` (Groq caps), `src/modules/ops/drain.ts` (the daily sweep also calls `prune_provider_usage`)

**Interfaces:**

```ts
// caps.ts (spec s9: 75% of 30 RPM, 1K RPD, 8K TPM, 200K TPD per model; verified 2026-10-07)
export const GROQ_CAPS = { tpm: 6_000, tpd: 150_000, rpm: 22, rpd: 750 } as const;
export const PAGE_CHAR_LIMIT = 12_000;       // with a 700-char system prompt and 1,500 completion tokens, one call is about 5,100 tokens
export const EXTRACT_MAX_COMPLETION = 1_500;

// usage-repo.ts
export type Caps = typeof GROQ_CAPS;
export type Block = { notBefore: Date; reason: "groq_minute" | "groq_day" };
export interface UsageRepo {
  reserve(bucket: string, tokens: number, caps: Caps): Promise<{ ok: true; id: string } | ({ ok: false } & Block)>;
  settle(id: string, tokensUsed: number, status: "used" | "released"): Promise<void>;
  block(bucket: string, kind: "observation" | "rate_limited", until: Date, reason: Block["reason"], rate: RateHeaders): Promise<void>;
  totals(bucket: string): Promise<{ lastMinute: number; today: number; medianPerCall: number | null }>;
}
export function createUsageRepo(db: Db): UsageRepo;

// governor.ts
export const estimateTokens: (system: string, user: string, maxCompletion: number) => number;
export type BudgetResult<T> = { kind: "deferred"; notBefore: Date; reason: "groq_minute" | "groq_day" } | { kind: "called"; result: LlmResult<T> };
export async function callWithinBudget<T>(deps: { usage: UsageRepo; now: () => Date }, bucket: string, estimate: number,
  call: () => Promise<LlmResult<T>>): Promise<BudgetResult<T>>;
```

- [ ] **Step 1: Failing tests** (`governor.test.ts`, fake `UsageRepo`): a refused reservation returns `deferred` with the repo's time and reason and never calls; `ok` settles `used` with `usage.totalTokens`; `invalid` with usage settles `used`; `invalid` without usage settles `used` at the estimate; `provider_error` settles `released`; a thrown call settles `released` and returns `called` with `provider_error` (status null); `rate_limited` with `retryAfterSeconds 7.5` settles `released`, blocks until now + 7.5 s with `groq_minute` and returns `deferred`; `retryAfterSeconds 1800` blocks with `groq_day`; null retry-after blocks 60 s; after an `ok` call whose `remainingTokens` (3,000) is below the estimate (4,500) the bucket is blocked 60 s (`groq_minute`); `remainingRequests` 1 blocks one hour (`groq_day`); `estimateTokens("a".repeat(700), "b".repeat(12_000), 1500)` is 5,129 and fits `GROQ_CAPS.tpm`.
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement** `governor.ts` (complete):

```ts
import type { LlmResult } from "@/lib/providers/llm";
import { GROQ_CAPS } from "./caps";
import type { UsageRepo } from "./usage-repo";

export const estimateTokens = (system: string, user: string, maxCompletion: number): number =>
  Math.ceil((system.length + user.length) / 3.5) + maxCompletion;
export type BudgetResult<T> = { kind: "deferred"; notBefore: Date; reason: "groq_minute" | "groq_day" } | { kind: "called"; result: LlmResult<T> };
const DAY_AFTER_SECONDS = 600; // a retry-after longer than 10 minutes means the day allowance, not the minute
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };

/** Reserve, call, settle. Groq's own counters win over our estimate (they also show whether limits are pooled). */
export async function callWithinBudget<T>(
  deps: { usage: UsageRepo; now: () => Date }, bucket: string, estimate: number, call: () => Promise<LlmResult<T>>,
): Promise<BudgetResult<T>> {
  const r = await deps.usage.reserve(bucket, estimate, GROQ_CAPS);
  if (!r.ok) return { kind: "deferred", notBefore: r.notBefore, reason: r.reason };
  const at = (seconds: number) => new Date(deps.now().getTime() + seconds * 1000);
  let result: LlmResult<T>;
  try {
    result = await call();
  } catch (error) {
    await deps.usage.settle(r.id, 0, "released");
    return { kind: "called", result: { kind: "provider_error", status: null, message: error instanceof Error ? error.name : "error", rate: NO_RATE } };
  }
  if (result.kind === "rate_limited") {
    await deps.usage.settle(r.id, 0, "released");
    const wait = result.rate.retryAfterSeconds ?? 60;
    const reason = wait > DAY_AFTER_SECONDS ? "groq_day" : "groq_minute";
    await deps.usage.block(bucket, "rate_limited", at(wait), reason, result.rate);
    return { kind: "deferred", notBefore: at(wait), reason };
  }
  if (result.kind === "provider_error") {
    await deps.usage.settle(r.id, 0, "released");
    return { kind: "called", result };
  }
  await deps.usage.settle(r.id, result.usage?.totalTokens ?? estimate, "used");
  if (result.rate.remainingRequests !== null && result.rate.remainingRequests <= 1) {
    await deps.usage.block(bucket, "observation", at(3600), "groq_day", result.rate);
  } else if (result.rate.remainingTokens !== null && result.rate.remainingTokens < estimate) {
    await deps.usage.block(bucket, "observation", at(60), "groq_minute", result.rate);
  }
  return { kind: "called", result };
}
```
  `usage-repo.ts`: `reserve` → `rpc("reserve_usage", { p_bucket, p_tokens, p_tpm, p_tpd, p_rpm, p_rpd })` (first row); `settle` → update `tokens_used`, `status` by id; `block` → insert an `observation` or `rate_limited` row with `blocked_until`, `block_reason`, `remaining_tokens`, `remaining_requests`, `retry_after_s`; `totals` → sums over the last minute and 24 h of non-released reservations and the median `tokens_used` of the last 20 `used` reservations (the admin session reads it for meters, the service client for ETA).
- [ ] **Step 4: Run** `rtk pnpm vitest run src/modules/ingestion && rtk pnpm typecheck && rtk pnpm lint`.
- [ ] **Step 5: Commit.** `feat(ingestion): budget governor on an atomic usage ledger with header reconciliation`.

---

### Task 12: `extract_page`: prompt, periods and units, verbatim check, relevance filter, proposals (Slice C; spec s6.4; ADR-004 s4.4, s4.6; E3, E5, E12)

Executed by `desk-backend`.

**Files:**
- Create: `src/modules/ingestion/prompts.ts`, `periods.ts`, `periods.test.ts`, `relevance.ts`, `relevance.test.ts`, `proposals.ts`, `proposals.test.ts`, `proposals-repo.ts`, `steps/extract-page.ts`, `src/modules/research/queries.ts` (if absent; else modify)
- Modify: `src/lib/providers/fixtures/extraction.json` (content below), `src/modules/ingestion/steps/index.ts`, `steps/steps.test.ts`, `src/modules/ingestion/inbox.ts` (pending and flagged counts), `src/modules/ingestion/client.ts` (`ProposedFact`, `proposedFactSchema`, `Flag`), `src/modules/research/index.ts` (export `latestFileForCompany`), `e2e/support/stack.ts` (`appEnv` adds `LLM_ADAPTER: "fixture"`), `e2e/desk-inbox.spec.ts` (the AI-off banner assertion becomes "Ready for you: 5 figures ready to check. 1 needs a look."; the AI-off banner moves to a unit test in `inbox.test.tsx`)

**Interfaces:**

```ts
// research/queries.ts (read-only; E5). Explicit columns; never body_md.
export async function latestFileForCompany(db: Db, companyId: string): Promise<{ itemId: string; title: string; structured: unknown } | null>;

// ingestion/prompts.ts
export const PROMPT_VERSION = "extract-v1";
export const extractionSchema: z.ZodType<Extraction>;   // strictObject, no length limits (Task 9 note)
export type Extraction = { page_kind: PageKind; basis: "consolidated" | "standalone" | "unknown"; unit_header: string | null;
  current_header: string | null; prior_header: string | null; rows: { label: string; current_text: string; prior_text: string | null; line: string }[] };
export const SYSTEM_PROMPT: string;
export const userPrompt: (pageNo: number, text: string) => string;

// ingestion/periods.ts (pure)
export function periodFromHeader(header: string | null): { period: string; asOf: string } | null; // "FY26"/"Q1 FY26", ISO date
export function unitFromHeader(header: string | null): string | null;                           // "₹ cr" | "₹ lakh" | "₹ mn" | "₹ bn" | "₹" | null

// ingestion/relevance.ts (pure)
export type Topic = "P&L" | "Balance sheet" | "Cash flow" | "Working capital" | "Segments" | "Other figures";
export const CORE_LINES: { key: string; topic: Topic; match: RegExp }[];
export function normaliseLabel(label: string): string;
export function classifyRow(row: { label: string; current: number; prior: number | null }, kind: PageKind, fileLabels: Set<string>):
  { reason: "core" | "label_match" | "moved"; topic: Topic; movedPct: number | null } | null;

// ingestion/client.ts
export type Flag = "value_not_on_page" | "quote_not_on_page" | "prior_not_on_page" | "period_unknown" | "unit_unknown";
export type ProposedFact = { label: string; value: number; valueText: string; unit: string; period: string; asOf: string;
  prior: { label: string; value: number; valueText: string } | null; page: number; locator: string; quote: string;
  basis: Basis | null; topic: string; statement: PageKind };
export const proposedFactSchema: z.ZodType<ProposedFact>;

// ingestion/proposals.ts (pure)
export type NewProposal = { dedupeKey: string; machineValue: ProposedFact; flags: Flag[]; reason: "core" | "label_match" | "moved"; movedPct: number | null };
export function buildProposals(i: { extraction: Extraction; pageNo: number; pageText: string; pageKind: PageKind; pageBasis: Basis | null;
  docBasis: Basis; fileLabels: Set<string> }): NewProposal[];
```

- [ ] **Step 1: Failing tests.**
  - `periods.test.ts`: "Year ended March 31, 2026" → FY26 / 2026-03-31; "As at 31st March, 2026" → FY26 / 2026-03-31; "31.03.2025" → FY25 / 2025-03-31; "Quarter ended June 30, 2025" → Q1 FY26 / 2025-06-30; "Three months ended 31-12-2025" → Q3 FY26; "Year ended December 31, 2025" → FY25 / 2025-12-31 (calendar-year companies keep the calendar year); "FY 2025-26" → FY26 / 2026-03-31; "Particulars" → null; every result matches `PERIOD_RE`. `unitFromHeader`: "(Rs. in crore)" → "₹ cr"; "(₹ in lakhs)" → "₹ lakh"; "Rupees in Million" → "₹ mn"; "Amount in ₹" → "₹"; "Particulars" → null.
  - `relevance.test.ts`: each CORE_LINES label matches its printed variants ("Revenue from Operations", "Finance Costs", "Profit for the year", "Net cash generated from operating activities", "Purchase of property, plant and equipment", "Trade Receivables"); `normaliseLabel("(a) Revenue from operations")` → "revenue from operations"; a label in the file's labels → `label_match` with the page kind's topic; a non-core line that moved 25% → `moved` with 25; one that moved 10% → null; prior 0 → never `moved`.
  - `proposals.test.ts` on the fixture P&L page text and the fixture extraction: five proposals across both pages; "Finance costs" flagged `value_not_on_page` (fixture says 41.70, page says 41.20); every proposal has `locator "p. 4"` (or 5), unit "₹ cr", period FY26, prior FY25; the dedupe key is `revenue from operations|FY26|consolidated`; an unknown header adds `period_unknown`; a row whose `current_text` does not parse is dropped; at most 3 `moved` rows per page; labels over 80 characters are cut to 80 (labels are not verbatim-checked; the quote is).
  - `steps.test.ts` (fake LLM, fake repos, fake governor): `extract_page` with AI off defers `ai_off` 6 h; on a scan page → attention "This page is a scan. Scans are read in a later update; enter it manually or skip."; a cached extraction (same hash, model, prompt version) inserts a copy with `tokens_used 0` and never calls the LLM; a `deferred` budget returns `defer` with the governor's time and reason; `invalid` → `retry` schema, and the second attempt's system prompt ends with "Your previous answer was rejected: <issues>. Follow the schema exactly."; `provider_error` → `retry` provider; `ok` inserts the extraction and the proposals and stops at 60 per document.
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement.**
  - `prompts.ts`:

```ts
export const PROMPT_VERSION = "extract-v1";
export const SYSTEM_PROMPT = [
  "You read one page of an Indian listed company's annual report or results. Copy; never compute.",
  "Return every line item that has a printed number for the latest period on this page.",
  "label: the line item's words as printed, without numbering such as (a) or ii.",
  "current_text and prior_text: the numbers exactly as printed, with commas, brackets and decimals; prior_text is null when there is no prior column.",
  "line: the full printed line the numbers sit on, character for character.",
  "current_header and prior_header: the column headings exactly as printed, for example \"Year ended March 31, 2026\".",
  "unit_header: the unit line exactly as printed, for example \"(Rs. in crore)\", or null.",
  "basis: consolidated or standalone when the page says so, else unknown.",
  "Never add a line that is not on the page. Never calculate totals, ratios or growth. A page with no figures returns an empty rows list.",
].join("\n");
export const userPrompt = (pageNo: number, text: string) => `Page ${pageNo}:\n"""\n${text}\n"""`;
```
  - `periods.ts`: find the last date in the header (`March 31, 2026`, `31st March, 2026`, `31 Mar 2026`, `31.03.2026`, `31-03-2026`, `31/03/2026`); quarterly when the header says "quarter", "three months" or "3 months"; annual label `FY` + two-digit calendar year of the end date; quarter label by Indian fiscal quarters (Apr-Jun Q1 of the next FY, Jul-Sep Q2, Oct-Dec Q3, Jan-Mar Q4 of the same FY); else `FY 2025-26` / `2025-26` → FY26 ending 31 March; else null.
  - `relevance.ts`:

```ts
export const CORE_LINES: { key: string; topic: Topic; match: RegExp }[] = [
  { key: "revenue", topic: "P&L", match: /^revenue from operations$/ },
  { key: "total-income", topic: "P&L", match: /^total income$/ },
  { key: "finance-costs", topic: "P&L", match: /^finance costs?$/ },
  { key: "depreciation", topic: "P&L", match: /^depreciation(?: and| &) amorti[sz]ation(?: expenses?)?$/ },
  { key: "pbt", topic: "P&L", match: /^profit before (?:exceptional items and )?tax$/ },
  { key: "pat", topic: "P&L", match: /^(?:net )?profit (?:for the (?:year|period)|after tax)$/ },
  { key: "cfo", topic: "Cash flow", match: /^net cash (?:generated )?(?:from|used in) operating activities$/ },
  { key: "capex", topic: "Cash flow", match: /^(?:purchase|acquisition) of property,? plant and equipment/ },
  { key: "borrowings", topic: "Balance sheet", match: /^(?:total )?borrowings$/ },
  { key: "cash", topic: "Balance sheet", match: /^cash and cash equivalents$/ },
  { key: "equity", topic: "Balance sheet", match: /^total equity$/ },
  { key: "receivables", topic: "Working capital", match: /^trade receivables$/ },
  { key: "inventories", topic: "Working capital", match: /^inventories$/ },
  { key: "payables", topic: "Working capital", match: /^(?:total )?trade payables$/ },
  { key: "segment-revenue", topic: "Segments", match: /^(?:total )?segment revenue$/ },
];
const TOPIC_BY_KIND: Record<PageKind, Topic> = { pl: "P&L", bs: "Balance sheet", cf: "Cash flow", segment: "Segments", notes: "Other figures", mdna: "Other figures", other: "Other figures" };
export const normaliseLabel = (label: string): string =>
  normaliseText(label).replace(/^\(?(?:[a-z]|[ivx]{1,4}|\d{1,2})[).]\s+/, "").replace(/[^a-z0-9&,' -]/g, "").replace(/\s+/g, " ").trim();
export function classifyRow(row: { label: string; current: number; prior: number | null }, kind: PageKind, fileLabels: Set<string>) {
  const label = normaliseLabel(row.label);
  const core = CORE_LINES.find((c) => c.match.test(label));
  if (core) return { reason: "core" as const, topic: core.topic, movedPct: null };
  if (fileLabels.has(label)) return { reason: "label_match" as const, topic: TOPIC_BY_KIND[kind], movedPct: null };
  if (row.prior !== null && row.prior !== 0) {
    const pct = ((row.current - row.prior) / Math.abs(row.prior)) * 100;
    if (Math.abs(pct) >= 20) return { reason: "moved" as const, topic: TOPIC_BY_KIND[kind], movedPct: Math.round(pct * 10) / 10 };
  }
  return null;
}
```
  - `proposals.ts`: for each row parse `current_text` (`parsePrinted`; drop when null) and `prior_text`; classify; period and unit from the headers; flags from `onPage` (value, quote, prior), unknown period, unknown unit; `basis` = the extraction's basis unless `unknown`, else the page verdict's, else the document's; `topic` from the classification; label cut to 80, quote cut to 600, `locator: "p. ${pageNo}"`; keep every `core` and `label_match`, the top 3 `moved` by absolute change.
  - `proposals-repo.ts`: `findCachedExtraction(hash, model, version)`, `insertExtraction(...)`, `countForDocument(documentId)`, `insertProposals(rows)` (`upsert(..., { onConflict: "document_id,dedupe_key", ignoreDuplicates: true })`).
  - `extract-page.ts`: as the steps tests describe; `sha256` with `node:crypto`; page text cut to `PAGE_CHAR_LIMIT` (the result records `truncated: true` when cut); `callWithinBudget({ usage: createUsageRepo(deps.db), now: deps.now }, deps.models.text, estimateTokens(system, user, EXTRACT_MAX_COMPLETION), () => deps.llm.complete({ ..., reasoningEffort: "low" }))`; file labels from `latestFileForCompany(deps.db, doc.companyId)` read through `readCaseFile(...).facts.map((f) => normaliseLabel(f.label))`.
  - `research/queries.ts` `latestFileForCompany`: `items` (`id, title`, `company_id = $1`, `kind in ('thesis','case_study')`, newest) then `item_revisions` (`structured`, newest `rev_no`); explicit columns only (service_role holds exactly these, Task 10).
  - `fixtures/extraction.json`:

```json
[
  { "when": "Statement of Profit and Loss", "output": {
    "page_kind": "pl", "basis": "consolidated", "unit_header": "(Rs. in crore)",
    "current_header": "Year ended March 31, 2026", "prior_header": "Year ended March 31, 2025",
    "rows": [
      { "label": "Revenue from operations", "current_text": "1,284.00", "prior_text": "1,102.00", "line": "Revenue from operations 1,284.00 1,102.00" },
      { "label": "Finance costs", "current_text": "41.70", "prior_text": "38.90", "line": "Finance costs 41.20 38.90" },
      { "label": "Profit for the year", "current_text": "152.60", "prior_text": "118.30", "line": "Profit for the year 152.60 118.30" }
    ] } },
  { "when": "Balance Sheet as at", "output": {
    "page_kind": "bs", "basis": "consolidated", "unit_header": "(Rs. in crore)",
    "current_header": "As at March 31, 2026", "prior_header": "As at March 31, 2025",
    "rows": [
      { "label": "Trade receivables", "current_text": "210.40", "prior_text": "188.10", "line": "Trade receivables 210.40 188.10" },
      { "label": "Inventories", "current_text": "305.00", "prior_text": "251.70", "line": "Inventories 305.00 251.70" }
    ] } }
]
```
  ("Finance costs" is deliberately mis-read so the e2e meets one flag.)
- [ ] **Step 4: Run** unit suites; `rtk pnpm e2e --project=desk-desktop --project=desk-mobile e2e/desk-inbox.spec.ts`; typecheck; lint.
- [ ] **Step 5: Commit.** `feat(ingestion): read statement pages into verified, relevant proposals`.

---

### Task 13: Review screen: flags one at a time, the values list, File under (Slice C; segment 4 C `ReviewOneAtATime`, `PageText`; spec s6.5; E4)

Executed by `desk-ui` (opus); `desk-backend` reviews `review.ts`. Controller visual QA.

**Files:**
- Create: `src/modules/ingestion/review.ts`, `review.test.ts`, `src/app/desk/inbox/[documentId]/review/page.tsx`, `src/components/desk/private/review/{review-one-at-a-time,page-text,values-list,file-under}.tsx`, `review.test.tsx`
- Modify: `src/modules/ingestion/actions.ts` (+ `resolveFlagAction`, `saveValuesAction`, `fileUnderAction`), `src/modules/research/actions.ts` (+ `startFileAction`), `src/lib/messages.ts`, `e2e/desk-inbox.spec.ts`, `e2e/desk-a11y.spec.ts` (scan the review page)

**Interfaces:**

```ts
// review.ts
export type ProposalView = { id: string; page: number; label: string; valueText: string; unit: string; period: string; prior: string | null;
  quote: string; topic: string; flags: Flag[]; why: string[]; status: "pending" | "accepted" | "edited" | "rejected" | "filed"; reason: "core" | "label_match" | "moved"; basis: Basis | null };
export type ReviewData = { document: { id: string; title: string; companyId: string | null; companyName: string | null; filedOn: string | null; sourceUrl: string | null; sourceType: DocSourceType };
  flags: ProposalView[]; values: { topic: string; rows: ProposalView[] }[]; hiddenBasis: number; target: { itemId: string; title: string } | null; pageTexts: Record<number, string> };
export async function getReview(db: Db, documentId: string): Promise<ReviewData | null>;
export type Decision = { kind: "accept" } | { kind: "edit"; value: ProposedFact } | { kind: "reject" };
export function decide(p: { status: string; flags: Flag[]; machine: ProposedFact }, d: Decision): { status: "accepted" | "edited" | "rejected"; acceptedValue: ProposedFact | null };
export async function fileUnder(db: Db, documentId: string, input: { itemId: string; title: string; sourceType: DocSourceType; filedOn: string; sourceUrl: string | null }): Promise<{ itemId: string; count: number }>;

// research/actions.ts
export async function startFileAction(companyId: string): Promise<{ ok: true; itemId: string } | { ok: false; message: string }>; // Aksh's click: a thesis titled with the company name, empty body and facts
```
`why` copy per flag: `value_not_on_page` "The figure {valueText} is not on p. {page}."; `quote_not_on_page` "The quoted line is not on p. {page}."; `prior_not_on_page` "The prior-year figure is not on p. {page}."; `period_unknown` "The column heading did not say which year."; `unit_unknown` "The page did not say crore or lakh.". `decide`: `accept` refused while any flag stands ("Type the value from the page first."); `edit` validates with `proposedFactSchema` and needs a period, an as-of date and a unit; `edit` with a value equal to the machine's in every field is stored as `accepted`; `reject` always allowed; a `filed` proposal refuses every decision. `fileUnder`: the item must be the document company's file (`latestFileForCompany`); `filedOn` required; writes the document's source fields; sets `item_id` on its `accepted`/`edited` proposals with no `revision_id`; returns the count.

- [ ] **Step 1: Failing tests.** `review.test.ts` (decision table above; values grouped by topic in CORE_LINES order then "Other figures"; standalone duplicates of a consolidated label are counted in `hiddenBasis` and not listed); `review.test.tsx`: "Check 1 of 1" shows the machine reading struck through, the why line, the page line with the matched words marked, choices "1 Type the value from the page" and "2 Drop it" (keys 1 and 2 work; Enter confirms a typed value); after the last flag, the values list shows verified rows ticked, an Edit control per row, and "File these 4 figures under Kaveri file"; with no file, "Start a file for Kaveri Fixtures" calls `startFileAction` then files; the S-row confirmation asks for type, filed-on (required) and link; desktop shows `PageText` beside the list, phone shows it under each row on demand.
- [ ] **Step 2: Failing e2e** (extend `desk-inbox.spec.ts`): Review → resolve the Finance costs flag by typing 41.20 → untick Profit for the year → File under Kaveri file with filed-on 2026-05-20 → lands on `/desk/items/<id>#facts` (Task 14 shows the staged rows; this task asserts the redirect and the `accepted`/`edited`/`rejected` counts on the review page's summary).
- [ ] **Step 3: Implement.** `getReview` reads proposals (explicit columns), page texts only for the pages with flags or values (desktop PageText), the target through `latestFileForCompany` on the admin session; actions call `requireAdmin()`, use the admin cookie session, and `revalidatePath`. `FileUnder` imports `startFileAction` from `@/modules/research/actions` itself (graph test, Task 5 note). No machine text is ever placed in the change reason or body.
- [ ] **Step 4: Run** unit, e2e (desk-desktop, desk-mobile), a11y, typecheck, lint; controller visual QA.
- [ ] **Step 5: Commit.** `feat(desk): review machine-read figures one flag at a time and file them under a company file`.

---

### Task 14: Staged rows in the editor, provenance on save, Done with a document (Slice C; ADR-004 s4.7-s4.8; E11)

Executed by `desk-backend` (module, action) then `desk-ui` reviews the editor changes (one implementer: desk-backend; the editor diff gets the controller's visual QA).

**Files:**
- Create: `src/modules/ingestion/staging.ts`, `provenance.ts`, `provenance.test.ts`, `src/components/desk/private/facts-form/staged.ts`, `staged.test.ts`, `src/components/desk/private/facts-form/provenance-chip.tsx`
- Modify: `src/modules/casefile/actions.ts` (read `provenance`, call `recordFiledFacts` after `addRevision`), `src/modules/casefile/actions.test.ts`, `src/app/desk/items/[id]/load.ts` (+ `staged`, `provenance`), `src/app/desk/items/[id]/page.tsx`, `src/components/desk/private/revision-editor.tsx` (staged prop, banner, hidden `provenance` input, "Send back to review"), `src/components/desk/private/facts-form/use-facts-state.ts` (initial merge), `fact-row.tsx` (staged note, provenance chip), `src/modules/ingestion/actions.ts` (+ `markDoneAction`, `unstageAction`), `src/lib/messages.ts`

**Interfaces:**

```ts
// ingestion/staging.ts
export type StagedRow = { proposalId: string; status: "accepted" | "edited"; value: ProposedFact;
  document: { id: string; title: string; sourceType: DocSourceType; filedOn: string; sourceUrl: string | null } };
export async function listStagedForItem(db: Db, itemId: string): Promise<StagedRow[]>; // item_id = itemId, status accepted|edited, revision_id null

// facts-form/staged.ts (pure, client)
export function mergeStaged(draft: Draft, staged: StagedRow[], reserved: string[]): { draft: Draft; provenance: { factId: string; proposalId: string }[]; skipped: number };

// ingestion/provenance.ts
export function factDiffers(fact: CfFact, quote: string | null, machine: ProposedFact): boolean;
export async function recordFiledFacts(db: Db, input: { itemId: string; revisionId: string; structured: CaseFile;
  provenance: { factId: string; proposalId: string }[] }): Promise<{ filed: number }>;
export type FactProvenance = { proposalId: string; documentTitle: string; page: number; machine: ProposedFact; filedAt: string };
export async function provenanceForItem(db: Db, itemId: string): Promise<Record<string, FactProvenance>>; // by fact id, newest filing wins
```

- [ ] **Step 1: Failing tests.**
  - `staged.test.ts`: two staged rows from one document add one `S` row (title, type, filed-on, link) and two `F` rows with new ids past the high-water mark of the draft, its loaded ids and the body's citations (`reserved`); a document whose title (case-insensitive) and filed-on match an existing source reuses that `S` id; a staged row equal to an existing fact (label, period, value) is skipped and counted; the staged quote lands on the fact draft; the topic lands on `FactDraft.topic`; `provenance` maps each new fact id to its proposal.
  - `provenance.test.ts`: `factDiffers` is false when every field matches (whitespace-insensitive quote) and true when value, unit, period, as-of, locator, prior value or quote differ; `recordFiledFacts` ignores pairs whose proposal belongs to another item, is not accepted/edited, or whose fact is missing from `structured`; it inserts `fact_provenance` rows with `edited` computed on the server and sets the proposals `filed` with the revision id; it never throws for a bad pair.
  - `casefile/actions.test.ts`: a save with a `provenance` field calls `recordFiledFacts` with the new revision's id and the parsed `structured`; a malformed `provenance` field (not JSON, more than 80 pairs, bad ids) is ignored, and the save still succeeds; when `recordFiledFacts` throws, the save still redirects with the notice `revision-saved-provenance-missing` ("Saved. The record of where some figures came from could not be written; they stay staged and are skipped as duplicates next time.").
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement.**
  - `casefile/actions.ts` after `addRevision` (the result carries `revision`, `src/modules/research/service.ts:15`):

```ts
const provenance = parseProvenance(formData.get("provenance")); // zod: array (max 80) of { factId: /^F\d{1,3}$/, proposalId: uuid }; invalid -> []
if (provenance.length > 0) {
  try {
    await recordFiledFacts(db, { itemId, revisionId: result.revision.id, structured, provenance });
  } catch {
    notice = "revision-saved-provenance-missing";
  }
}
```
  (`db` is the admin cookie session already used for the repo; hoist it.) The revision is saved exactly as before: provenance is evidence about a save, never a condition of it.
  - `provenance.ts` (core):

```ts
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
export function factDiffers(fact: CfFact, quote: string | null, m: ProposedFact): boolean {
  return fact.label !== m.label || fact.value !== m.value || fact.unit !== m.unit || fact.period !== m.period || fact.asOf !== m.asOf
    || fact.locator !== m.locator || (fact.prior?.value ?? null) !== (m.prior?.value ?? null) || !same(quote ?? "", m.quote);
}
```
  `recordFiledFacts` loads the proposals (`id, item_id, status, machine_value`) with `.in("id", ids)`, builds rows for valid pairs, inserts them into `fact_provenance`, then updates `proposals` to `filed` with `revision_id` (`.in("id", filed).in("status", ["accepted", "edited"])`).
  - Editor: `loadEditor` adds `staged` (`listStagedForItem`) and `provenance` (`provenanceForItem`); `useFactsState(sheet, body, staged)` merges once at init (form mode only; when the sheet does not parse, the banner says "Fix the text sheet to see the 4 staged figures"); `RevisionEditor` shows a banner "4 figures from {doc} are staged below. Check them, write your change reason and save." with "Send back to review" (`unstageAction`: clears `item_id`), and renders `<input type="hidden" name="provenance">` holding the pairs whose fact ids are still in the draft; staged fact rows carry the note "From {doc}, p. {page}"; saved facts with provenance show `ProvenanceChip`: "Read from p. {page} of {doc}; you kept it." or "Read from p. {page}; you changed {machine} to {current}." (private desk only). The change reason placeholder reads "What changed and why (for example: added FY26 figures from the annual report)"; it is a placeholder, never a value.
  - `markDoneAction(documentId)`: `requireAdmin()`; remove the stored object (admin storage delete policy); set `status 'done'` and `original_deleted_at`; notice "Done. The PDF was deleted to save space; its page text and your figures stay." Pending proposals stay and are hidden.
- [ ] **Step 4: Run** unit suites; extend `e2e/desk-inbox.spec.ts`: after File under, the editor shows four staged rows and the banner; delete one; write a change reason; save → the facts list shows three new facts, the edited Finance costs row's chip says "you changed 41.70 to 41.20", the others "you kept it"; the review page shows them as filed; "Done with this document" removes the PDF (the pane says "The PDF was deleted; page text is still here") — desk-desktop and desk-mobile.
- [ ] **Step 5: `defenso guard_code`** on `casefile/actions.ts` and `provenance.ts`.
- [ ] **Step 6: Commit.** `feat(desk): staged machine figures in the editor, provenance on save, done-with-document`.

---

### Task 15: Owner-visible degradation, meters, Needs-you cards, the full-flow e2e (Slice C; spec s7, s10; progress 2.9)

Executed by `desk-ui` (opus). Controller visual QA.

**Files:**
- Modify: `src/app/desk/inbox/page.tsx` (AI meter, AI-off banner, paused copy with ETA), `src/components/desk/private/inbox/budget-meter.tsx` ("AI pages today: 41 of 44" from `totals` and `TOKENS_PER_PAGE_DEFAULT` or the measured median), `src/app/desk/page.tsx` + `src/app/desk/desk-data.ts` (Needs you tray: "Ready to review" neutral card per ready document; "Pages could not be read" warn card per attention document), `src/components/desk/private/liveness-strip.tsx` (queue sentence from Task 5's `describeStale`), `e2e/desk-inbox.spec.ts` (one full-flow test at 375 and 1280), `e2e/desk-a11y.spec.ts`, `src/components/desk/private/inbox/inbox.test.tsx`
- Test: `inbox.test.tsx`, `shell.test.tsx` / `trays.test.tsx` (desk home cards)

**Interfaces:** consumes `listInbox`, `createUsageRepo(...).totals`, `estimateReadyBy`/`formatReadyBy`, `describeStale`; produces no new module API.

- [ ] **Step 1: Failing tests.** Inbox: AI off → banner with the spec s10 sentence and no AI meter; paused `groq_day` card → "Today's free AI allowance is used up. It carries on by itself: ready by Thu 10:00." (fake clock); storage at 72% → warn meter; at 91% → DropBar disabled with "Storage is 91% full. Mark finished documents as done to free space."; database at 72% of 500 MB → warn line. Desk home: a ready document adds a neutral "Ready to review" card linking to its review page; an attention document adds a warn card "Pages 142-147 could not be read" linking to the inbox; liveness strip with a stale queue says "Documents have not moved for 7 h; your uploads are safe. Shlok has been emailed." (the existing strip pattern).
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement** with copy verbatim from spec s7/s10.
- [ ] **Step 4: Full-flow e2e.** One spec, both desk projects: upload → read → fixture extraction → Ready card on the desk home → review (one flag) → File under → staged rows → save → chips → Done. Plus `desk-a11y` axe scans of `/desk/inbox` and the review page at 375 and 1280, light and dark (WCAG 2.2 AA, as Plan 1B Task 16).
- [ ] **Step 5: Run** `rtk pnpm test && rtk pnpm e2e` (whole suite twice, retries 0, as Plan 1B), `pnpm db:test`, typecheck, lint, build.
- [ ] **Step 6: Commit.** `feat(desk): plain-English degradation, budget meters and Needs-you cards for the inbox`.

---

### Task 16: First real report, measurement and close-out (spec s11; R1 2-3, R2 3-4 and 7, R3 1-7)

Executed by the controller with Shlok and Aksh; `desk-architect` scores.

**Files:**
- Create: `docs/trials/2026-10-xx-first-report.md` (date when run)
- Modify: `src/modules/ingestion/caps.ts` (`TOKENS_PER_PAGE_DEFAULT` = measured median), `docs/specs/2026-10-07-phase-2-ingestion-design.md` s9 (throughput line, with the date), `docs/architecture/ADR-004-ingestion.md` (status line; decisions E1-E13 folded into s4 as "Plan decisions"; s8 assumptions replaced by measurements), `docs/progress.md`, `docs/project-memory/timeline.md`, `docs/specs/technical-debt.md`, `docs/project-memory/unanswered-questions.md`

- [ ] **Step 1: Hosted.** Dry run then push migrations 0006-0007 (`pnpm supabase db push --dry-run`, then `pnpm db:push`), set `GROQ_API_KEY` on Vercel Preview (and Production only with Shlok's approval), deploy the preview, confirm the bucket exists on hosted with the 50 MB limit.
- [ ] **Step 2: Run one real annual report** (Aksh's choice, digital PDF under 50 MB). Record in the trial doc: page count, text-pass wall time and steps, pages selected and how many Aksh changed, tokens per page (median and p90 from `provider_usage`), wall-clock to Ready with the tab closed and open, proposals, flags, false flags, Aksh's review minutes, figures filed, anything he typed by hand instead.
- [ ] **Step 3: Update numbers** (caps, spec s9) from the measurement; if tokens per page exceed 5,000, lower `PAGE_CHAR_LIMIT` and record why.
- [ ] **Step 4: Score** R1 rows 2-3, R2 rows 3, 4, 7, R3 rows 1-7 with evidence; anything below 4 becomes a task in `docs/progress.md`.
- [ ] **Step 5: End-of-session routine** (`claude/routines.md`): progress ticks for 2.1-2.4, 2.5 (PDF), 2.6, 2.8, 2.9, 2.10; timeline entry; debt (originals are not in the database backups: `scripts/backup` dumps Postgres only; page text is); open questions.
- [ ] **Step 6: Commit.** `docs: Phase 2a first-report measurement, rubric scores and close-out`.

---

## Execution

Use `superpowers:subagent-driven-development`, one implementer at a time (CLAUDE.md). Owners: `desk-backend` for Tasks 1, 3, 4, 5, 6, 9, 10, 11, 12, 14; `desk-ui` (opus) for Tasks 2, 7, 8, 13, 15; the controller for 16. Each task gets a reviewer pass scored on R3 (and R2 for UI tasks) before the next starts. Slices are shippable in order: after Task 2 (Slice A), after Task 8 (Slice B, no AI key needed), after Task 15 (Slice C). Run `defenso guard_code` where Global Constraints say.

## Coverage map

| Source | Requirement | Task |
|---|---|---|
| ADR-004 s4.1 item 1 | no second Groq account key | 9 (one `GROQ_API_KEY`), env table |
| ADR-004 s4.1 item 2 | paid burst off | not built; ADR-004 records the shape |
| ADR-004 s4.1 item 3 | 20-page budget, raise to 40 with ETA first | 3 (column check), 6 (selector), 7 (chooser) |
| ADR-004 s4.1 item 4 | optional fact topic, display confirmed by desk-ui | 1, 2 |
| ADR-004 s4.1 item 5 | row builder + Notes, one save path | 1, 2, 14 |
| ADR-004 s4.2 | machine write matrix, three layers | 3 (grants + trigger), 5 (graph test), 10 (proposal guards, column grants) |
| ADR-004 s4.3 | data model | 3, 10 |
| ADR-004 s4.4 | pipeline, auto-start in budget, cache | 5, 6, 12 |
| ADR-004 s4.5 | governor, 75% caps, 429 defer, headers | 10, 11 |
| ADR-004 s4.6 | verbatim check, no derived ratios | 8, 12 |
| ADR-004 s4.7 | staging, provenance, server-computed edited | 13, 14 |
| ADR-004 s4.8 | signed upload, dedupe, 90% refusal, done deletes original | 3, 4, 7, 14 |
| ADR-004 s4.9; spec s10 | degradation copy, queue health | 5, 7, 15 |
| spec s7 | trays and messages | 7, 15 |
| spec s8 | four pumps, lease 270 s, two expiries | 3, 5, 7 |
| spec s11 | first-report measurement | 16 |
| publishing rules 3a, 8 | no new public surface; staged figures go through the gate | 14 (existing editor note), Global Constraints |
| R3 rows 1-7 | free-tier safety, idempotent jobs, security, tests, small units, memory | 3-16 |

## Self-review
1. **Spec coverage:** every spec section maps to a task above; out-of-scope items are named in Plan 2b.
2. **Placeholders:** "2026-10-xx" in Task 16's file name is filled when the trial runs. Two interim states are deliberate and each names the task that ends it: Task 5's step handlers answer `attention` "This kind of step is not built yet." until Tasks 6 and 12 register the real ones, and `buildLlm()` returns null (AI reading off) until Task 9. Slice B therefore ships with AI off, which is a real, tested state (spec s10).
3. **Type consistency:** `StepOutcome`, `DrainDeps`, `LlmPort`, `ProposedFact`, `StagedRow` are defined once (Tasks 5, 9, 12, 14) and consumed by name later.
4. **Compliance:** no task adds a publish path or public surface; machine text never reaches `body_md`, `change_reason` or a revision; provenance is private.

## Pre-flight conflict table (task pairs sharing files or interfaces)

| Tasks | Shared file / interface | Risk | Resolution |
|---|---|---|---|
| 1 → 2 | `facts-form/draft.ts` (`topic: null` placeholder in 1, real field in 2); `casefile/schema.ts` `CfFact.topic` | 2 overwrites 1's placeholder | sequential; 2 starts from 1's commit |
| 1 → 14 | sheet `G` rows serialise staged topics; `draft.ts` | staged topic lost if 14 bypasses `FactDraft.topic` | 14's `mergeStaged` writes `topic`; test in `staged.test.ts` |
| 2 → 14 | `facts-form/fact-row.tsx` (topic field; staged note + chip) | merge collisions | sequential; 14 adds below 2's field |
| 8 → 14 | `facts-form/use-facts-state.ts` (add-source event; initial staged merge) | both change the hook's init | 14 extends the signature `(sheet, body, staged = [])`; 8's listener untouched |
| 8 → 14 | `app/desk/items/[id]/load.ts`, `page.tsx` | both add loader fields and props | additive; 14 rebases on 8 |
| 3 → 10 | `supabase/tests/0001_core_grants.test.sql`, `0002_function_privileges.test.sql` allowlists | 10 reverts 3's entries | 10 edits on top of 3's version; both run `pnpm db:test` whole |
| 3 → 5 | `public.queue_age()` | health reads a function 3 creates | order fixed |
| 3, 10 | `src/lib/supabase/database.types.ts` regenerated | stale types | `pnpm db:types` in both; never hand-edit |
| 4 → 6 → 8 | `documents/repo.ts` (6 adds methods), `documents/client.ts` (8 adds verbatim exports) | interface drift | `DocumentsRepo` grows additively; fakes in tests updated in the same task |
| 5 → 7 → 13 → 14 | `ingestion/actions.ts` grows each task | 300-line limit | actions stay thin (requireAdmin + service call); split service bodies into `upload.ts`/`review.ts`/`staging.ts`; check `wc -l` in each review |
| 5 → 6 → 12 | `ingestion/steps/index.ts` registry | placeholder handler left behind | 6 registers pdf_text/select_pages, 12 extract_page; graph test counts none |
| 5 → 9 → 11 | `ops/drain.ts` (create; LLM port; prune in sweep), `ingestion/deps.ts` (`llm` type widens) | type break between tasks | 5 declares `llm: null` (type `null`); 9 widens it to `LlmPort | null` |
| 5 → 15 | `ops/health.ts`, `liveness-strip.tsx` copy | two copies of the queue sentence | 5 owns `describeStale`; 15 only renders it |
| 6 → 11 → 12 | `ingestion/caps.ts` | duplicate constants | one file, appended per task |
| 7 → 12 | `ingestion/inbox.ts` pending/flagged counts (0 until 12) | counts never wired | 12's Files list includes it |
| 7 → 8 → 12 → 13 → 14 → 15 | `e2e/desk-inbox.spec.ts` | the AI-off assertion breaks when 12 sets `LLM_ADAPTER=fixture` | 12 flips it (Files), later tasks extend the same flow |
| 9 → 12 | `src/lib/providers/fixtures/extraction.json` (`[]` then content), `e2e/support/stack.ts` (12 only) | an enabled LLM before 12 would hit the placeholder handler | `LLM_ADAPTER=fixture` is added to the e2e env in 12, not 9 |
| 10 → 11 | `reserve_usage` signature and `provider_usage` columns | arg names drift | `usage-repo.ts` uses the exact `p_*` names from 10 |
| 10 → 12 → 13 → 14 | `proposals` columns, `ProposedFact`/`proposedFactSchema` | shape drift between machine_value and staging | defined once in `ingestion/client.ts` (12); 13 and 14 import it |
| 10 → 12 | service_role column SELECT on `items`/`item_revisions` | `latestFileForCompany` selects a column the grant lacks | 12's query uses only `id, title, kind, company_id, created_at` and `structured, rev_no`; 10's pgTAP proves `body_md` is refused |
| 12 → 13 | `research/queries.ts` `latestFileForCompany` | none | read-only, allowed by the graph test |
| 13 → 14 | `research/actions.ts` (`startFileAction`), `ingestion/actions.ts` | none beyond the size watch | sequential |
| 14 | `casefile/actions.ts` (Plan 1B's save action) | breaking the one save path | additive after `addRevision`; existing `actions.test.ts` cases must stay green |
| 7, 15 | `desk-tabs.tsx`, `desk-data.ts`, `src/app/desk/page.tsx` | tab and tray counts computed twice | 7 adds `inboxCount` to `desk-data.ts`; 15 reuses it |
| 4, 5, 7, 13, 14 | `src/lib/messages.ts` | key collisions | append-only; new keys prefixed by area (`upload-`, `review-`, `revision-saved-provenance-missing`) |
| 5 | `ops/ops.graph.test.ts`, ESLint entry points | the new desk importer of `@/modules/ops/jobs` fails the graph test | 5 updates the allowlist with `app/desk/inbox/pump-actions.ts` |
| Phase 1 trial | Facts form (Tasks 2, 14) | changing the screen Aksh is trialling | Slice A ships after the trial (Before Task 1) |
| `scripts/backup/`, `.github/workflows/backup.yml` (database backups) | table lists from `information_schema` | new tables included automatically; Storage objects are not | noted as debt in 16 |

## Verified references (checked 2026-10-07)
- Groq rate limits (free: gpt-oss-120b, gpt-oss-20b, qwen3.8-27b 30 RPM / 1K RPD / 8K TPM / 200K TPD; whisper-large-v3-turbo 20 RPM / 2K RPD / 7.2K ASH / 28.8K ASD; "organization level"; headers and `retry-after`): https://console.groq.com/docs/rate-limits
- Groq models (gpt-oss-120b and -20b production, 131,072 context, 65,536 max completion; qwen3.8-27b preview, 16,384 max completion): https://console.groq.com/docs/models
- Groq structured outputs (strict on gpt-oss-120b, gpt-oss-20b, qwen3.8-27b; all fields required; `additionalProperties: false`; no streaming or tools): https://console.groq.com/docs/structured-outputs
- Groq reasoning (`reasoning_effort` low/medium/high on gpt-oss; `include_reasoning`): https://console.groq.com/docs/reasoning
- Groq chat completions (`POST https://api.groq.com/openai/v1/chat/completions`, `max_completion_tokens`, `response_format.json_schema`, `usage.completion_tokens_details.reasoning_tokens`): https://console.groq.com/docs/api-reference
- Groq vision (qwen3.8-27b, 3 images, 2,048 tokens per image): https://console.groq.com/docs/vision
- OCR.space free (25,000/month, 500/day per IP, 1 MB, 3 PDF pages; `https://api.ocr.space/parse/image`): https://ocr.space/ocrapi
- unpdf 1.8.1 (MIT; no dependencies; optional peer `@napi-rs/canvas` for rendering only; `extractText`, `getDocumentProxy`): https://registry.npmjs.org/unpdf/latest , https://github.com/unjs/unpdf
- Supabase Storage (Free: 50 MB per file, not raisable): https://supabase.com/docs/guides/storage/uploads/file-limits ; signed upload URLs valid 2 hours: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl ; storage RLS (INSERT for upload, SELECT for download, `storage.foldername`): https://supabase.com/docs/guides/storage/security/access-control
- Vercel Functions (Hobby 300 s, 2 GB, 4.5 MB request body): https://vercel.com/docs/functions/limitations
- Next.js `after` (server functions and route handlers may read cookies inside; runs up to the route's max duration; `waitUntil` on Vercel): https://nextjs.org/docs/app/api-reference/functions/after
