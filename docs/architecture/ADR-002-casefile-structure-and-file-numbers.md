# ADR-002: Case-file structure (casefile/1) and permanent file numbers

Status: Accepted for Plan 1B (2026-10-06; migration renumbered 2026-10-07). Depends on ADR-001 and ADR-003; implements decisions.md segments 1, 3 and 5.
Implemented in: `supabase/migrations/20261007000005_casefile.sql`.

## 1. Problem
The decided file page (B+) needs per-figure sources, tests with readings and meters, exhibits and a
scenario table, and the identity (segment 5) makes the file number the mark: "file numbers never
reused". Phase 1's schema has `item_revisions.structured jsonb` with no shape and no file number.
The rule "machine-extracted facts and Aksh's words never share a field" must survive Phase 2, when
extractions start filling facts.

## 2. Current state
`body_md` holds prose; `structured` is free JSON linted as strings; Plan 1A's lint exempts
`structured.sources[i].quote` when the source has a URL. Nothing assigns file numbers. The public
streak would need captures, which anon cannot read. `publish_revision` is the 0004 body
(`20261007000004_hardening.sql`: `p_actor` first, `private.is_admin_user`, pinned policy version, IST dates,
latest-only `revision` and recorded `slug` failures), executable by `service_role` only (ADR-003); the 30-day
lag is already counted in India time by `private.is_lagged` (0004).

## 3. Options considered
- A. Everything in Markdown (tests, facts and sources as Markdown tables in `body_md`). Rejected:
  one field mixes Aksh's words with numbers that Phase 2 will extract; per-figure lag and source
  checks would mean parsing tables out of prose.
- B. New tables (`facts`, `tests`, `sources`) now. Rejected for Phase 1: revisions are append-only
  and gated as a unit; separate tables would need their own versioning and gate wiring before a
  single file exists. Phase 2 can promote the shape into tables if querying across files needs it.
- C. A versioned JSON shape in `structured` (`casefile/1`), validated by Zod in the editor and
  read tolerantly on public pages; Aksh's words stay in `body_md`. Chosen.
- File numbers: (i) derived from publish order at read time: rejected, unpublishing renumbers;
  (ii) a column assigned by `publish_revision()` from a sequence: chosen.
- New names: (i) null the stub's symbol: rejected, the next capture recreates the stub; (ii) an alias
  column on companies: rejected, one company can have many aliases; (iii) alias and ignored-token tables
  read by the stub lookup: chosen.

## 4. Recommendation
`structured` = `casefile/1` (sources with quotes keyed by fact, facts, test readings, exhibits,
read-first slugs, scenario with operating outputs only). Test conditions are `- T1: ...` lines under
the required "What would prove me wrong" heading in `body_md`. `items.file_no` (1-999, unique) is set once,
inside the gate, from `private.file_no_seq` on the first pass of a `thesis` or `case_study`;
`private.guard_publish_columns` rejects any session write to it (insert or update, private or public row).
A `thesis` needs a figures-to date (`data_as_of`, rule 3), without the 30-day lag a case study needs.
`public.capture_days()` (anon only, SECURITY DEFINER) exposes distinct IST dates, capped at 60 days, never text.
The 30-day lag stays in one SQL helper (`private.is_lagged`) that the views, RLS and the gate share;
`casefile/lag.ts` mirrors it. New names records `company_aliases` and `ignored_tokens` (admin-only, insert
and select, no update or delete) and archives the stub (`archived_at`) instead of deleting it.
`archived_at` is not among the columns `private.guard_catalog_public_columns` freezes (ADR-003 / 0004), so
that guard is neither weakened nor bypassed: a linked row can be archived, never renamed.
All gate calls stay behind `src/modules/compliance/gate-rpc.ts` (ADR-003); this ADR adds no new service-role caller.

## 5. Tradeoffs
JSON shape changes need a schema version and a reader for each version. Facts cannot be queried
across files with SQL in Phase 1. The facts sheet is a grammar Aksh must learn (a legend is shown).
`capture_days` is anon-only: a page that reads it with a signed-in session must use the anon client.

## 6. Risks
A malformed `structured` must never break a public page: `readCaseFile` falls back to empty.
Quotes from a source without a URL are linted like prose (stricter, by design). Sequence numbers can
skip after an aborted transaction; that is allowed ("never reused", not "never skipped"). The sequence
stops at 999 (`no cycle`); the 1000th file would fail loudly and roll back its gate row.

## 7. Future evolution
Phase 2 extraction writes facts into the same shape with `pending` review state, or promotes
`facts` to a table with a view that rebuilds `casefile/1`. A `casefile/2` reader can migrate on read.
Phase 3 adds case studies, which take file numbers through the same path.
