# ADR-004: Ingestion pipeline and the machine write boundary

Status: Proposed (desk-architect, 2026-10-07). Becomes Accepted when Shlok approves it with the Phase 2 spec.
Records: the five defaults Shlok accepted on 2026-10-07 (`docs/architecture/proposals/2026-10-07-ingestion-flexibility.md`, "Decisions Shlok needs to make").
Amends: ADR-001 s9.1 (vision calls carry one image, not three), ADR-002 (`casefile/1` gains the `Notes` source type and an optional fact `topic`, read-compatible).
Depends on: ADR-001 (binding), ADR-002, ADR-003. Spec: `docs/specs/2026-10-07-phase-2-ingestion-design.md`. Plans: `docs/plans/2026-10-07-phase-2a-ingestion.md`, `docs/plans/2026-10-07-phase-2b-ingestion.md`.

## 1. Problem
Phase 2 lets Aksh drop an annual report, a results PDF or (2b) a scan, photo, voice note or link, and get back cited figures he can file into a company file. Four things must hold at once:
1. **The AI organises, Aksh thinks.** Machine-read facts and Aksh's words never share a field, and no machine writes a revision. A mis-read figure must never reach a public file under his name without a person accepting it.
2. **Free tiers are a hard ceiling.** Groq free gives 8k tokens a minute; a 300-page report cannot go to the model whole. Supabase gives 1 GB storage and 5 GB egress a month. Vercel functions stop at 300 s and accept 4.5 MB request bodies.
3. **Daily use.** If review of one report takes an hour, he stops uploading. If quota exhaustion looks like a crash, he stops trusting it.
4. **Compliance.** Every revision of a public item still passes `publish_revision()` (ADR-003); ingestion adds no publish path.

## 2. Current state (facts, checked 2026-10-07)
- Facts live in `item_revisions.structured` (`casefile/1`, `src/modules/casefile/schema.ts`); Aksh's words in `body_md` and `change_reason`. The only writer of `structured` is `saveCaseFileRevisionAction` (`src/modules/casefile/actions.ts`), which parses the facts sheet.
- The manual row builder already exists: Plan 1B Task 15b built the Facts form (`src/components/desk/private/facts-form/`) as a view over the facts sheet, with one save path. Decision 5 below is therefore mostly built; what is missing is the `Notes` source type, topics, and the document pane.
- `item_revisions.author in ('aksh','system')`; `service_role` holds no table privilege on `items` or `item_revisions` (grants in `20261005000001_core.sql:429` are heartbeats only; the gate RPCs of ADR-003 are the only other `service_role` grants).
- There is no job table yet. The 15-minute GitHub pump and the daily cron run `PUMP_STEPS` / `DAILY_STEPS` (`src/modules/ops/schedule.ts`) that only write heartbeats. The secret-key client is created only in `src/modules/ops` and `src/modules/compliance/gate-rpc.ts` (ESLint + `gate.graph.test.ts`).
- Vendor limits re-verified on 2026-10-07 (see spec s9 for the table and URLs): Groq free `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` each 30 RPM, 1K RPD, 8K TPM, 200K TPD; Groq states "Rate limits apply at the organization level"; 429 carries `retry-after` in seconds; `x-ratelimit-remaining-tokens` is per minute and `x-ratelimit-remaining-requests` per day. Strict `json_schema` on all three models requires every field `required` and `additionalProperties: false`; streaming and tool use are not supported with structured outputs. Vision: `qwen/qwen3.8-27b` only (preview model), up to 3 images per request, each image 2,048 input tokens. OCR.space free: 25,000 requests/month, 500/day per IP, 1 MB per file, 3 pages per PDF. `unpdf` 1.8.1 (MIT, no dependencies; `@napi-rs/canvas` is an optional peer needed only for `renderPageAsImage`). Supabase Free: 50 MB per file (not raisable on Free), 1 GB storage, 5 GB egress; signed upload URLs are valid for 2 hours. Vercel Hobby: 300 s max duration, 2 GB memory, 4.5 MB request body.

## 3. Options considered

### 3.1 Where machine output lives before Aksh accepts it
- **A. Write extracted facts straight into a new revision marked `author = 'system'`.** Rejected: a machine change would appear in revision history and in the Phase 5 "what changed" newsletter as an edit to Aksh's file; a mis-read figure on a public item would only be stopped by the gate, which checks wording, not truth.
- **B. Add a `pending` flag inside `casefile/1` facts.** Rejected: puts machine state inside the field that also holds Aksh's typed facts, so every reader (public view builders, gate rule 3a, the diff) would need to filter it, and one missed filter leaks an unchecked number. ADR-002 s7 floated this; this ADR closes it.
- **C. Immutable `extractions` + reviewable `proposals` in their own tables; accepted proposals are staged into the editor and saved by Aksh through the existing action; provenance recorded beside the revision.** Chosen.

### 3.2 How accepted proposals reach the file
- **A. A "File these values" server action that appends facts and saves a revision.** Rejected: a second writer of `structured` (decision 5 says one save path), and a revision Aksh never looked at in the editor.
- **B. Staging into the editor (client-side merge into the Facts form draft), saved by `saveCaseFileRevisionAction`.** Chosen. Aksh sees, edits or deletes every staged row and writes the change reason himself.

### 3.3 Running the pipeline on Hobby
- **A. Vercel Queues or Workflows** (pitfalls s1: both run on Hobby). Rejected for now: a new vendor surface with its own retention and visibility timeouts, and ADR-001 s3 already fixed Postgres as the job store.
- **B. Supabase Edge Functions.** Rejected: 150 s wall clock, shorter than Vercel's 300 s.
- **C. `jobs` + `job_steps` in Postgres, claimed with `FOR UPDATE SKIP LOCKED` and a lease, pumped by `after()` on upload, the GitHub pump, the open inbox tab and the daily cron.** Chosen (ADR-001 s4, s8.2).

### 3.4 Upload path
- **A. Post the file to a server action.** Rejected: Vercel's 4.5 MB request body limit; annual reports run 5-40 MB.
- **B. Signed upload URL to a private Supabase Storage bucket, then a finish action.** Chosen.

### 3.5 Budget control
- **A. Count calls in TypeScript memory.** Rejected: up to four pumps can run at once (after(), GitHub, tab loop, daily cron).
- **B. A `provider_usage` ledger with an atomic SQL reservation (`reserve_usage`) under an advisory lock, caps at 75% of the verified limits, reconciled from Groq's headers and 429s.** Chosen. Header reconciliation also covers the open question of whether Groq pools limits across models (s2: "organization level").

### 3.6 Owner alerting
- **A. A mailer now (Resend).** Rejected for Phase 2: without a verified domain Resend only sends to the account owner's address (Q9), so Aksh would not receive it, and it adds a key.
- **B. Plain-English inbox states + the desk liveness strip + one new `queue` check in `/api/health`, so the external uptime monitor already planned in ADR-001 s8.2 emails Shlok and Aksh once per incident.** Chosen.

### 3.7 `casefile/1` evolution for topics
- **A. Bump to `casefile/2`.** Rejected: `readCaseFile` falls back to an empty file on any schema mismatch, so every stored revision would need a migrating reader for an additive optional field.
- **B. Additive optional field, schema literal unchanged; `topic` defaults to null on read.** Chosen. In the facts sheet, topics are a separate `G | Topic | F1 F2` row so the F row grammar does not change.

## 4. Decision

### 4.1 The five defaults Shlok accepted (2026-10-07)
1. **No backup Groq key from a second account.** Groq's Acceptable Use Policy forbids "registering multiple accounts or orchestrating usage between multiple organizations" to exceed limits (checked 2026-10-06). Capacity comes from per-step model routing within one account.
2. **Paid burst off.** Not built in Phase 2. If ever enabled: one click per deferred document, cost estimate shown first, hard cap USD 3/month (`LLM_BURST_MONTHLY_CAP_USD`), `ANTHROPIC_API_KEY` behind an `anthropic` `LlmPort` adapter. No env var is added until then.
3. **LLM page budget 20 per document;** Aksh may raise one document to 40, and the ETA is shown before he confirms. The database caps it (`documents.llm_page_budget between 1 and 40`).
4. **Optional `topic` on facts** (max 40 characters). Public facts group by topic when any fact has one, else by period; desk-ui confirms the display with Shlok before it ships (Plan 2a Task 2).
5. **Manual row builder + `Notes` source type, one save path.** The row builder is the Task 15b Facts form; Phase 2 adds `Notes` to `SOURCE_TYPES`, the topic field, and staged machine rows, all saved by `saveCaseFileRevisionAction`.

### 4.2 Machine write-permission matrix (binding)
| Target | Machine (job code, `service_role`) | Aksh |
|---|---|---|
| `item_revisions` (any column), `items` | **never** | through existing actions |
| `body_md`, `change_reason`, title, `learning_objective`, `holds_position`, `visibility`, `data_as_of`, `oneLiner`, `readFirst`, scenario, a test's threshold/min/max/direction/status/existence | **never, not even as a proposal** | yes |
| Facts (`F`), sources (`S`), exhibits (`X`, 2b), test readings (`current`, `readingAsOf`, `prior` of a test whose metric Aksh mapped, 2b), fact `topic` | **propose only** (`proposals`, status `pending`) | accept, edit, reject, then save in the editor |
| `extractions`, `document_pages.text` | write once (append-only / immutable text) | read |
| Document digest (2b) | write, private, labelled "Machine-read" | read; promote a line by typing it as a fact |
| `proposals.status`, `accepted_value` | **never** (only `machine_value` at insert) | yes |

Enforcement, three layers: (1) `service_role` holds no write privilege on `items` or `item_revisions` (only column SELECT on `items (id, company_id, kind, title)` and `item_revisions (id, item_id, rev_no, structured, created_at)`, so the machine can match labels against facts but can never read `body_md` or `change_reason`), asserted by pgTAP, and a `BEFORE INSERT` trigger on `item_revisions` refuses any insert while `current_user = 'service_role'` in case a grant is ever added; (2) `ingestion.graph.test.ts` fails if any file under `src/modules/ingestion/`, `src/modules/documents/` or `src/app/desk/inbox/` imports `addRevision`, `appendRevision`, `createItem`, `createSupabaseResearchRepo` or `@/modules/casefile/actions`; (3) a trigger on `proposals` refuses `service_role` updates to `status` and `accepted_value`, and refuses any change to `machine_value`.

### 4.3 Data model (drafts in Plan 2a Tasks 3 and 10; admin-only RLS; nothing public)
- `documents` (one row per upload; `sha256` unique for dedupe; `status in ('uploading','active','done','skipped')`; everything finer is derived from steps), `document_pages` (immutable text per page, generated `char_count`, `is_scan`, `search`; `kind`, `basis`, `score`, `selected`, `selected_by` editable).
- `jobs`, `job_steps` (lease `locked_until` + `lease_owner`, `not_before`, `wait_reason`, `schema_failures`, `provider_failures`, `lease_expiries`, terminal `needs_attention`).
- `extractions` (append-only; document, page, model, prompt version, input hash, raw JSON, tokens), `proposals` (one per proposed row; `machine_value` immutable; `status in ('pending','accepted','edited','rejected','filed')`; `dedupe_key` unique per document), `fact_provenance(revision_id, fact_id, proposal_id, edited)` (append-only), `provider_usage` (reservations, observations from headers, 429s).
- 2b adds `document_digests` and extends `documents.kind`.
- Private bucket `documents` (PDF only in 2a, 50 MB, admin-only object policies).

### 4.4 Pipeline (each step resumable, under 240 s, idempotent)
`pdf_text` (one download, `unpdf` page by page until 180 s, re-enqueues itself from the next page) → `select_pages` (keyword + number density, prefer the document's basis, budget) → `extract_page` per selected page (one page per call; `gpt-oss-120b`, `reasoning_effort: "low"`, strict schema; values and quotes verified against the stored page text; relevance filter; proposals inserted with a dedupe key) → Aksh reviews. Selection starts automatically inside the default budget (one action for Aksh: upload); he can add or remove pages at any time, and raising above 20 shows the ETA first. Machine output is cached by `(page text hash, model, prompt version)`: re-reading an unchanged page spends nothing.

### 4.5 Budget governor
Caps at 75% of verified limits per bucket (bucket = model id): 6,000 TPM, 150,000 TPD, 22 RPM, 750 RPD. Before each call: estimate `ceil(input chars / 3.5) + max_completion_tokens`, call `reserve_usage`; refused → step `not_before` set, `wait_reason` named, lease released, no attempt counted. After the call: record actual tokens and the `x-ratelimit-remaining-*` headers; a 429 records `retry-after` and defers the bucket. A schema failure is retried once with the validation error in the prompt; two schema failures or three provider errors (5xx, network) end in `needs_attention`. 429s never count as failures.

### 4.6 Verbatim check
A proposal is one-click acceptable only if its printed value text and its quoted line both occur in the stored page text after normalisation (whitespace collapsed, Unicode dashes and minus to `-`, NBSP to space, case-folded; numbers compared with grouping commas removed and `(1,234)` read as `-1234`). Failures are flags reviewed one at a time and can only be accepted by typing the value (provenance `edited`). The machine reports lines as printed; it never computes derived ratios (days, margins, growth): those are analysis, so they are Aksh's.

### 4.7 Staging and provenance
Accepting proposals and choosing "File under" stores them as `accepted`/`edited` against a target item. The editor loads them as new Facts-form rows (new ids past the high-water mark, the document's `S` row reused if its title and filed-on date match, else added). A hidden `provenance` field maps fact id to proposal id; `saveCaseFileRevisionAction` saves the revision exactly as before, then calls `ingestion.recordFiledFacts`, which re-loads the proposals (must belong to the item and be accepted or edited), computes `edited` server-side by comparing the saved fact with `machine_value`, inserts `fact_provenance` and marks the proposals `filed`. A staged row Aksh deletes is simply not filed and returns to the review list.

### 4.8 Storage and egress
Upload through a signed URL (2 h validity); the finish action checks the object's size and type. Uploads are refused above 90% of 1 GB with a plain message. "Done with this document" deletes the stored original and keeps page text and the source link (ADR-001 s6). One PDF download per `pdf_text` step keeps egress to roughly one to two downloads per document against the 5 GB/month allowance.

### 4.9 Degradation and alerting
Every limit has a named owner-visible state (spec s10): "Waiting for today's AI allowance: ready by Thu 10:00", "AI reading is off" (no `GROQ_API_KEY`), "Storage is 92% full", "This page could not be read: Enter manually / Skip". `/api/health` gains a `queue` check (a runnable step older than 6 h), so the existing uptime monitor emails both people once per incident; quota waits are not failures.

### 4.10 Module boundaries
`src/lib/providers/` holds the ports (`LlmPort`, `OcrPort`, `TranscriberPort`), the Groq adapter and fixture adapters (ADR-001 s4). `src/modules/documents` owns documents, pages, upload and page selection. `src/modules/ingestion` owns jobs, steps, the governor, extraction, proposals, review and provenance. Job code receives a `Db` from `src/modules/ops`, which stays the only creator of the secret-key client outside `gate-rpc.ts`. `casefile/actions.ts` calls `ingestion.recordFiledFacts`; `ingestion` imports only `casefile/client` (pure), so there is no runtime cycle.

### 4.11 Scope
2a: Notes + topics, upload, PDF text, page selection, document pane, Groq text extraction, governor, review, staging, provenance, alerting. 2b: OCR.space for scans, photos and screenshots through `qwen` vision (one image per call), voice notes through Whisper into captures (Aksh's words, never facts), links and pasted text, the ambiguous-page classifier on `gpt-oss-20b`, the document digest, "re-read this page", the public provenance line. 2c (own spec): XLSX valuation (progress 2.7), private only (publishing rule 9).

## 5. Tradeoffs
- Verified rows are pre-ticked on the review screen. Ticking each row by hand would prove more attention but makes a 24-value report a 24-tap chore; the verbatim check already proves each number is on its cited page, and the decision left to Aksh is which numbers matter. Flags must be resolved one by one.
- Auto-starting inside the default budget spends tokens before Aksh looks; accepted because the budget is the one he set (decision 3) and capture-speed beats a confirm step.
- Two-column statements only in 2a (current and prior year). Quarterly results with five columns are proposed for the first two columns; Aksh types the rest.
- No mailer: the monitor email is generic ("desk health failing"); the plain-English reason is on the desk.
- A module-level dependency from `casefile/actions` to `ingestion` (one function) is the price of a single save path.

## 6. Risks
- **Groq changes models or limits** (it did twice in 2026; `qwen/qwen3.8-27b` is a preview model). Mitigation: models from env, ports with fixtures, header reconciliation, `needs_attention` instead of silent loops.
- **Pooled limits.** If Groq pools the TPM across models, per-model caps overstate capacity; observations from headers and 429s defer correctly, but the ETA will be optimistic until the first real report is measured (spec s11 measurement task).
- **Token estimates** (3,400 per page) are assumptions from the proposal; Task 16 replaces them with measured medians.
- **Indian report formats** vary (lakh vs crore headers, merged cells, notes numbering); the verbatim check fails safe (flags), and Aksh can always enter manually.
- **Storage fills** at about 50-100 reports if originals are never marked done; the meter and the 90% refusal make it visible before it bites.
- **Q11 (living files)** gets more frequent: ingestion makes newer figures easy to stage into a public file whose Figures-to is frozen. The editor's existing note applies; ADR-005 (after the trial) decides per-revision Figures-to.

## 7. Future evolution
Paid burst adapter (decision 2) when Aksh outgrows two reports a day; Groq Developer plan as the zero-code alternative; a second free provider only after its terms are verified; promoting `facts` to a table if cross-file queries are needed (ADR-002 s7); pgvector over `document_pages` (parking lot); totals checks (components sum to the reported total) as an extra flag reason.

## 8. Facts, assumptions, open questions
- **Facts:** s2 (all vendor numbers with URLs in spec s9).
- **Assumptions:** about 3,400 tokens per statement page on `gpt-oss-120b` with low reasoning; `reasoning_effort` and `response_format: json_schema` can be combined on `gpt-oss-*` (the API reference lists both; the reasoning page does not say; Plan 2a Task 9 includes a one-off live check before the adapter is relied on); a statement page fits one call.
- **Open (not blocking 2a):** voice notes send Aksh's own words to Groq for transcription (2b): confirm he is comfortable with that before Plan 2b Task 5; Q11 and Q12 unchanged.

## Why this impresses an allocator
Every figure on a public file traces to one line on one page of a named filing, that line is proven verbatim on the page by code, and the private record shows that a person accepted or corrected every machine reading before it entered a dated, append-only revision. It is the four-eyes control of an institutional research desk, built by a student on free tiers, with the machine kept visibly out of the analyst's voice.
