# Proposal: Phase 2 ingestion flexibility (manual-first, editable, large PDFs, Groq setup)

Status: PROPOSAL for Shlok, 2026-10-07. Research and design only. Not a decision; nothing here changes ADR-001, ADR-002 or Plan 1B. Accepted parts become ADR-004 (last section).
Author: desk-architect. Inputs: ADR-001 (s3, s8.1, s9.1), progress.md Phase 2, Phase 1 spec, Plan 1B D5-D7 and Task 12, `src/modules/casefile/schema.ts`, publishing rules, tooling landscape s7-s8, pitfalls s4. Groq policy and rate limits re-checked on the web 2026-10-06.

## 0. The one rule this proposal protects
The case file has two halves that never share a field (Plan 1B D6, `docs/plans/2026-10-06-phase-1b-ui.md:65`): **Aksh's words** live in `body_md` (VIEW + the "What would prove me wrong" conditions), and **facts** live in `structured` (`casefile/1`: sources, facts, test readings, exhibits). The machine may only ever *propose facts*; it never writes `body_md`, and it never writes a revision by itself. A fact Aksh types by hand and a fact the machine read are both facts; their provenance is tracked outside `structured` (s2 below), so the field rule holds without splitting the facts sheet in two.

---

## Q1. "Can he fill the sections manually, without a PDF?"

**Already decided or built**
- The item editor has two separate fields: a body textarea and a facts-sheet textarea (`RevisionEditor`, plan:9696-9745). Saving parses the sheet and writes one append-only revision (`saveCaseFileRevisionAction`, plan:9291-9315).
- The sheet grammar already covers every structured section, not only body text (`SHEET_LEGEND`, plan:5454-5460): `O` one-liner, `S1` sources (link optional), `F1` facts with page and quoted line, `T1` test readings, `X1` exhibits, `R` read-first, `SC/A/Y` scenario. Schema: `src/modules/casefile/schema.ts:66-107`.
- Quick capture creates notes and appends thesis text with no document at all (spec `docs/specs/2026-10-04-phase-1-core-design.md:85-98`).
- So **manual parity exists today**: a complete case file can be built with zero PDFs.

**Gap**
1. The sheet is a power-user format. `F1 | Revenue | 1284 | ₹ cr | FY26 | 2026-03-31 | S1 | p. 131 | FY25 | 1102 | quote` is error-prone on a phone, and Aksh is non-technical.
2. Every fact must cite a source (`schema.ts:114`) and a source needs a type and a filed-on date (`schema.ts:67`). Notes from a concall he listened to, or a number from a news article, need an `S` row first; nothing in the UI tells him that.
3. Fact groups are titled by period only (`buildFactGroups`, plan:5730-5734), so a manual user cannot group facts by topic either.

**Recommendation: one data path, two ways to type into it**
- Keep the facts sheet as the **only** writer of `structured`. Add a small **row builder** beside it (Phase 2.6): "Add fact / source / exhibit / reading" opens a short form (label, value, unit, period, page, source picker with "new source" inline) and *appends a sheet line*. Errors still come from `parseFactsSheet`, line by line. Ingestion proposals also arrive as sheet lines (Q2), so manual, assisted and machine input converge on one parser and one save action.
- Add a source type `Notes` (Aksh's own notes from a call or meeting) to `SOURCE_TYPES` (`src/lib/desk-types.ts:13`) so a fact with no PDF still has an honest citation. URL stays optional.
- Trade-off: the builder is extra UI (about one task), but it is a view over the sheet, not a second model.
- Cost if wrong: a separate forms editor with its own save path would make two writers of `structured` that drift (round-trip `serializeFactsSheet` breaks, revisions disagree with what was shown). Skipping the builder means Aksh stops entering facts on the phone, and the public file shows prose with no figures.

## Q2. "After a PDF, he must be able to edit anything easily"

**Already decided or built**
- Revisions are append-only; an "edit" is a new revision with a reason (ADR-001:28; spec:29-31; `item_revisions.author in ('aksh','system')`, `supabase/migrations/20261005000001_core.sql:173`).
- Every OCR'd value lands as `pending` for review (ADR-001:82). Phase 2.6 plans a review screen with "page text beside editable JSON" (progress.md:58).
- Every revision of a public item is re-gated (publishing rules:31; ADR-001:70).

**Gap**
1. "Editable JSON" is a developer surface; Aksh will not edit JSON.
2. Where pending values live before approval is undefined, and nothing says whether the system may write a revision itself.
3. No record of *what the machine read* versus *what Aksh kept*, which is the evidence an allocator wants and the thing that proves "AI organises, Aksh thinks".

**Recommendation: proposals, then a normal revision**
- **Machine output is immutable and never in a revision.** New Phase 2 tables (drafted in ADR-004, not here): `extractions` (document, page, model, prompt version, raw JSON; append-only) and `proposals` (one row per proposed fact, source, exhibit or reading; `status in ('pending','accepted','edited','rejected')`, `machine_value`, `accepted_value`).
- **Review screen** (2.6): left, the page image or text; right, proposals as plain rows (label, value, unit, period, page, quoted line) with Accept / Edit / Reject. Accepted rows are serialised into the editor's facts sheet, where Aksh can change *anything* (label, value, period, page, grouping, delete) before pressing Save. Save is the existing `saveCaseFileRevisionAction`, so the revision is authored `aksh`.
- **The system never writes `item_revisions`** (the `'system'` author value stays reserved for migrations/seed). Otherwise a machine change appears in revision history and in the Phase 5 "what changed" newsletter as if Aksh made it.
- **Provenance outside `structured`:** `fact_provenance(revision_id, fact_id, proposal_id, edited bool)`. The private chip reads "read from p. 131; you changed 1,248 to 1,284". `casefile/1` needs no change for this.
- **Verbatim check:** a proposed quote is accepted only if it appears in the stored page text after whitespace/number normalisation; a proposed value must appear on its cited page. Anything that fails is shown as "not found on the page" and cannot be one-click accepted.
- Edit anything also means: change the page selection, "re-read this page" (spends budget, shows the cost), merge or split topic groups, drop a whole document. All are reversible because nothing is overwritten.
- Cost if wrong: if machine values flow straight into `structured`, a mis-read figure reaches a public file with Aksh's name on it, and there is no way to show which numbers he checked.

**Why this impresses an allocator.** Each figure on a public file opens the exact filing line it came from, the line is proven verbatim on the cited page, and the revision log shows that a person accepted or corrected every machine reading. That is the four-eyes control an AMC research desk runs, visible on a student's site.

## Q3. "A 100-page PDF: keep only what is relevant"

**Already decided:** LLM calls only on selected pages (statements, notes, commentary by keyword, 10-20 per annual report), every other page text-extracted and indexed with no LLM call; a page budget and a visible ETA; `max_attempts` and a terminal `needs_attention` with "enter manually / skip AI" (ADR-001:68; progress.md:60). OCR.space: 1 MB per file, 3 pages per PDF request, 500/day per IP, 25,000/month; tables in scans go to Groq vision (ADR-001:82). Groq free: 8k TPM, 200k TPD, 1,000 RPD per model (tooling:49-52; re-checked at https://console.groq.com/docs/rate-limits on 2026-10-06).

**Gap:** no numbers for a real document, no rule for which extracted values are worth proposing (the case file caps facts at 80 and exhibits at 6, `schema.ts:103-105`), and the vision step as written would breach the TPM cap (below).

**Pipeline (each step a resumable job step under 250 s)**
1. **Text pass (no AI):** `unpdf` per page, in 50-page steps; store page text for search. Pages under 50 characters are scans.
2. **OCR pass (scans only):** one downscaled page per OCR.space request (a scanned A4 page at 150 dpi grayscale is typically 200-500 KB, so three pages rarely fit in 1 MB; use 3-page PDFs only when they do).
3. **Page selector (keyword first, AI only for doubt):** regex on headings ("Statement of Profit and Loss", "Balance Sheet as at", "Cash Flow Statement", "Notes forming part", "Segment", "Management Discussion"), plus number density. Prefer consolidated over standalone (Aksh can flip it per document). Only ambiguous pages go to a cheap classifier (step table in Q5).
4. **Budget:** default 20 LLM pages per document. The inbox shows the chosen pages as thumbnails; Aksh can add or remove pages and the ETA updates before any token is spent.
5. **Extract** selected pages (one page per call; two when a statement runs over a page and both fit under the TPM cap).
6. **Relevance filter (code, not AI):** everything extracted is kept in `extractions` (private, searchable), but only these become proposals: (a) metrics matching an existing fact label or a test Aksh mapped; (b) a core set of about 15 (revenue, EBITDA, PAT, operating cash flow, capex, net debt, receivable/inventory/payable days, segment revenue); (c) lines that moved more than a set threshold year on year, with the reason shown. This is how "only relevant data" stays inside the 80-fact cap and inside Aksh's attention.
7. **`needs_attention`:** after 2 schema-validation failures or 3 provider errors on a page, the step stops; the inbox card says "Pages 142-147 could not be read" with **Enter manually** (opens the editor with that page's text beside the facts sheet and an `S` row pre-filled with the page locator) or **Skip**.

**Throughput estimate (assumptions stated; verify on the first real report)**
Governor caps at 75%: 6,000 TPM and 150,000 TPD per model. One text-page call on `gpt-oss-120b`: about 700 prompt+schema + 1,800 page + 300 low-effort reasoning + 600 JSON = **about 3,400 tokens** (range 2,500-4,500).

| Document | AI work | Tokens | Wall clock (15-min pump) | Per day |
|---|---|---|---|---|
| 100-page digital annual report | ~2 classifier calls + 15-20 page calls | 55-70k on 120b | 15-20 min of TPM time, about 1-1.5 h elapsed | **2 reports** (3 if lean) |
| 100-page scanned report | 100 OCR requests + ~8 vision table pages + ~10 text pages | ~31k vision + ~34k text | same day | 2 reports; OCR allows 3 (375 of 500/day) |
| 300-page report (typical Indian large-cap) | same as 100 pages: the budget, not the length, sets the cost | 55-70k | longer text pass only | 2 reports |

TPM, not TPD, sets the pace: one 3,400-token call per minute, so about 4 calls per 240-s pump run. Storage: page text is about 4 KB per page (1.2 MB per 300-page report), so 500 MB holds a few hundred reports; originals can be deleted after approval (ADR-001:54).

Cost if wrong: without the relevance filter a single report proposes hundreds of rows, review takes an hour, and Aksh stops uploading. Without one-page vision calls, every table page 429s forever.

## Q4. "Automatically create new sections based on the data"

**Reconciliation.** `casefile/1` is a fixed shape (`schema.ts:98-108`, ADR-002 via Plan 1B Task 8) and that fixity is a credibility feature: every file reads the same way (spec:100-109). Fact groups today are not sections at all; they are derived from the period (`plan:5734`). So "new sections" can safely mean three things, and must never mean a fourth.

| Where | AI may | How it lands |
|---|---|---|
| **Document digest** (new, private, labelled "Machine-read", per document) | Create any sections it finds: segments, related-party, contingent liabilities, guidance, capex plans; each line cites a page | Never public in Phase 2; Aksh promotes lines into the file as facts |
| **Fact topic groups** (new optional `topic` on a fact) | Propose a topic name ("Working capital", "Segment: Pumps") for proposed facts | Pending until accepted; Aksh can rename or merge; public groups render by topic when present, else by period |
| **Sources, facts, exhibits** (`S`, `F`, `X` rows) | Propose; exhibits are multi-period series, max 6 per file | Pending until accepted |
| **Test readings** (`current`, `readingAsOf`, `prior` of an existing `T` id) | Propose a reading only for a test whose metric Aksh mapped once | Pending until accepted |

**The machine may never write:** `body_md` (VIEW and every `- T1:` condition), title, `learning_objective`, `change_reason`, `holds_position`, `visibility`, `data_as_of`, `oneLiner`, `readFirst`, the scenario table, and a test's threshold, min, max, direction, status or existence. Those are judgments; they stay Aksh's. It may *show* beside the editor "pages you might cite", but it cannot insert text.

Rejected options: (a) AI adds headed sections to the body: breaks D6 and puts machine prose under Aksh's name. (b) Free-form AI sections on the public file: every file would read differently, and machine text on public pages widens the lint surface (publishing rules:32). (c) No dynamic structure at all: loses what the 100-page report actually contains.
Trade-off: the `topic` field is a schema change (backward-compatible: optional, old revisions read as period groups) and touches the decided segment-3 fact display; it needs ADR-004 and a desk-ui check. Cost if wrong: if the machine can write the body, one hallucinated sentence under Aksh's name is the end of the site's credibility.

## Q5. The Groq agent configuration

**Already decided:** strict JSON via Zod (ADR-001:38; Zod 4.6.5 ships `toJSONSchema`), `provider_usage` with caps at 75% and defer-not-fail (ADR-001:30), `LlmPort` with env-chosen models (ADR-001:29; `.env.example:42-46`). Pitfalls: reasoning tokens count, honour `retry-after`, keep `max_tokens` tight (pitfalls:30-33).

**Per-step routing**

| Step | Model (env var) | Input | Output schema (Zod, strict) | Notes |
|---|---|---|---|---|
| Ambiguous-page classifier | `openai/gpt-oss-20b` (`GROQ_MODEL_CLASSIFY`, new) | first ~600 chars of 10 pages per call | `{page, kind, confidence}[]` | low reasoning; most pages never reach it |
| Statement/notes extraction | `openai/gpt-oss-120b` (`GROQ_MODEL_TEXT`) | one page (or two) of text | `{rows: {label, period, value, unit, page, quote}[]}` per statement type | values re-checked against page text |
| Table structure from scans | `qwen/qwen3.8-27b` (`GROQ_MODEL_VISION`) | **one image per call** | same row schema | 3 images = 6,144 image tokens alone, over the 6,000 cap; ADR-001:82's "3 images/request" must become 1 |
| Commentary digest | `openai/gpt-oss-120b` | MD&A pages | `{section, claim, page}[]` | goes to the digest only |
| Relevance + topic proposal | code first; `gpt-oss-20b` only to name leftover topics | labels | `{factId, topic}[]` | cheap |

The published limits table lists limits per model, so the classifier and vision work should draw on separate allowances from the 120b extraction; confirm with the `x-ratelimit-*` headers in Task 2.3 before relying on it.

**Budget governor (Task 2.3)**
- Before each call: estimate tokens (input chars / 3.5 + `max_tokens`), reserve in `provider_usage`; refuse locally if the per-model 75% TPM or TPD cap would be crossed, and set the step's `not_before`.
- On 429: read `retry-after`, set `not_before`, release the lease. 429s do not count towards `max_attempts`; schema failures do.
- Tight `max_tokens` per step; `reasoning_effort: low`; one retry with the validation error fed back, then `needs_attention`.
- **What the owner sees:** inbox card "Waiting for today's AI allowance: ready by Thu 10:00" (Groq); "Scanned pages wait for tomorrow's OCR allowance" (OCR.space); a red strip and one email per incident when the queue is older than 48 h or Supabase is unreachable (progress 2.9). Never a silent stall, never a lost upload.

## Q6. "I can provide a backup Groq key from another account"

**Verified: not allowed.** Groq's Acceptable Use Policy (https://console.groq.com/docs/legal/ai-policy, checked 2026-10-06) prohibits use "beyond published parameters, rate limits, or use limitations, including by registering multiple accounts or orchestrating usage between multiple organizations". A key from a second account used to get past the free limits is exactly that, even if each account stays under its own limit. Groq can terminate both accounts, which would take the whole ingestion pipeline down. **Recommendation: do not add it.**

**Compliant fallbacks, best first**
1. **Use the allowances already granted:** route classification to `gpt-oss-20b` and vision to `qwen`, keeping the 120b budget for extraction (Q5). No new account, no cost.
2. **Paid burst through the existing slot:** `ANTHROPIC_API_KEY` (ADR-001:68, `.env.example:49`) behind an `anthropic` `LlmPort` adapter. Used only when Aksh presses "Finish this document now" on a deferred card, with a cost estimate shown first and a hard monthly cap. Native PDF text mode is about 330 tokens/page (tooling:7), so 20 selected pages cost cents.
3. **Groq Developer plan** (paid, higher limits, same code path): the simplest switch if Aksh ingests more than two reports a day for weeks.
4. **A second free provider** behind `LlmPort` is possible, but its free-tier limits and terms are not in our research yet; verify them before choosing one (ADR-004 research item).

All provider keys go in `src/lib/env.server.ts` as validated optional entries (today it holds only the Supabase secret, admin email and cron secret, `env.server.ts:6-10`): `GROQ_API_KEY` (required from Phase 2), `ANTHROPIC_API_KEY` (optional), `LLM_BURST_MONTHLY_CAP_USD` (optional, burst disabled when unset). Never in `NEXT_PUBLIC_*`, never in the client bundle.

---

## Decisions Shlok needs to make
1. **Backup Groq key from another account:** decline it (Groq AUP forbids it). Default: per-model routing now, plus an optional paid burst key later.
2. **Paid burst:** default off; when enabled, a one-click per document, cost shown first, hard cap USD 3/month.
3. **LLM page budget per document:** default 20 pages; Aksh may raise it to 40 for one document, with the ETA shown before spending.
4. **Fact topic groups (optional `topic` on facts):** default yes, via ADR-004, rendered by topic when present and by period otherwise; desk-ui confirms the display.
5. **Manual row builder that writes facts-sheet lines (plus a `Notes` source type):** default yes, built with the 2.6 review screen; no second save path.

## What goes in a future ADR-004 (ingestion pipeline and machine write boundary)
- Problem/options/trade-offs for the pipeline: text pass, OCR pass, keyword page selector, budget and ETA, extract, relevance filter, `needs_attention`.
- Data model drafts: `documents`, `pages`, `extractions` (append-only), `proposals`, `fact_provenance`, `document_digests`, `provider_usage` with per-model reservations; RLS admin-only; nothing public.
- The machine write-permission matrix (Q4) as a binding rule, with a test that no ingestion code path can call `addRevision`.
- `casefile/1` evolution: optional `topic` on facts and the `Notes` source type (amends ADR-002), with read compatibility for old revisions.
- `LlmPort` routing per step, governor parameters, one-image vision calls (amends ADR-001 s9.1), verbatim-quote check.
- Provider policy: the Groq AUP finding, the burst adapter and cap, and the verified second-provider option if one is chosen.
- Owner degradation copy for Groq, OCR.space and Supabase limits, and the first-report measurement that replaces this proposal's token estimates.
