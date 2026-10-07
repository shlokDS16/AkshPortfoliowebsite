# Technical Debt

Shortcuts, TODOs, known limitations, and refactor opportunities.

| Added | Item | Why it exists | Cost if ignored | Trigger to fix |
|---|---|---|---|---|

## 2026-10-04 (planning phase)
- Official SEBI circular PDFs (Jan 2025, May 2026) not yet downloaded into `docs/compliance/`; rules were derived from the research report and news coverage.
- Upstox API pricing/token-refresh and Next.js 16.3.8 Turbopack CSS fix are unverified assumptions with documented fallbacks (bhavcopy; `--webpack`).
- Reference-site research could not fetch Scuttleblurb, Nomad, Akre, Ambit, Dalton; findings for those are from search snippets only.

## 2026-10-07 (Plan 1B close-out)
- (Plan 1B) `listBlockedItems` scans the latest 200 gate decisions; replace with a view when items exceed a few hundred.
- (Plan 1B) The public snapshot loads every gated revision; fine below ~100 files, then page by item.
- (Plan 1B) New names runs four idempotent writes (record, items, captures, archive) without a transaction (re-runnable); move to an RPC in Phase 2.
- (Plan 1B) Prose numbers in Aksh's VIEW rely on the item-level 30-day lag; per-figure withholding covers facts, chips and exhibits only.
- (Plan 1B) Theme pages are not public in Phase 1 (themes are private stubs); revisit with the learning graph (Phase 4).
- (Plan 1B) Visual baselines are platform-specific and local-only (D29); move to a Linux container job if drift appears.
- (Plan 1B) Refile has no lock: two simultaneous clicks can file one capture twice.
- (Plan 1B) Q8: `publish_revision()` trusts the server-built `p_lint_result` (ADR-003 confines the caller to service_role with a verified admin actor; SQL does not re-run the lint). Decide before launch whether to sign it.
- (Plan 1B) The display:block phone tables keep table roles in Chromium's accessibility tree (e2e); Safari/VoiceOver and NVDA are checked by hand only (trial doc).
