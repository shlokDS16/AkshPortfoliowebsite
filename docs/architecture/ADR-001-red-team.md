# ADR-001 red team (2026-10-04)

Attack only. ADR = `ADR-001-stack.md`, PIT = pitfalls, LAND = tooling-landscape, RULES = publishing-rules. [U] = fact not in the inputs.

## Critical

**1. Ten annual reports never finish.** 10 ARs = 2,500-4,000 pages. The 75% cap leaves 150k tokens/day, about 50-75 pages, so 35-80 days with the tab open all day. Tab closed: one 240 s cron drain at 6k TPM is ~24k tokens, 8-12 pages/day, 200+ days. Arrivals outpace the drain permanently. The same evening uses 10-17% of the 1 GB storage. Evidence: ADR s2, s5; LAND s7; PIT s3-4.

**2. The gate is bound to a publish event, not to revision content.** `items` + append-only `item_revisions`: nothing says a new revision of an already-public item re-enters `publish_item()`. If public views read the latest revision, post-publish edits are ungated. Rule 4 is bypassable by design: publish a stub case study, open a ledger position, then "update" it. Evidence: ADR s3 rows "Content storage", "Compliance audit"; RULES Gate rule 4.

**3. The lint sees only "public body text".** Unchecked: titles, slugs, OpenGraph metadata and images, alt text, chart images, Storage attachments, FTS snippets over `chunks`, newsletter drafts, the interactive model. A reader-driven HyperFormula DCF outputs a per-share value, which is a target price, and the shipped workbook carries Excel cached values (`cell.v`), live prices included, that the lag never inspects. Prose prices have no `as_of_date`, so rule 3 cannot apply. Evidence: RULES Gate rules 1, 3; LAND s2 pipeline; ADR s4 modules `distribution`, `valuation`.

**4. Liveness alerting depends on the thing that died.** The "red strip if cron silent 36 h" shows only when the owner opens the UI, and the incident email needs a running job to send it. PIT asks for a second pinger; the ADR has only a no-retry cron and 1 h logs. One broken secret means a silent week, then a Supabase pause. Evidence: PIT s1, s3; ADR s3 "Owner alerting", s4; LAND s6.

## High

**5. "Defer-not-fail" has no terminal state.** A step that needs more than 6k tokens (75% of 8k TPM; reasoning tokens count) can never run and defers forever. Evidence: ADR s3 "Budget control", s6; PIT s4.

**6. The cron is a god-job.** Heartbeat, drain, prices, scoring, anchor, gate release and newsletter all share one 300 s invocation. A 240 s drain starves later steps; duplicate firing double-anchors. Evidence: ADR s4; PIT s1.

**7. The tab pump is weaker than modelled.** Browsers throttle background tabs, laptops sleep [U], and the cookie-session pump dies silently in a proxy refresh logout loop. Evidence: ADR s3; PIT s2.

**8. Gate overrides need a developer redeploy.** The regex trips on "exit multiple", "sell-side", "SL"/"TP". The only override is editing `allowlist.ts`. A non-technical owner blocked on Shlok for every false positive: likeliest abandonment cause. Evidence: RULES Gate rule 1 and closing paragraph; ADR s5.

**9. API and SQL bypass surface.** Postgres grants EXECUTE on new functions to PUBLIC, and Supabase exposes public-schema RPCs to anon [U]. So `publish_item()`, the job pump and release functions are browser-callable unless revoked, and "only publish path" is only as strong as each function's internal check. Magic-link signup is open by default [U], so any policy written as `authenticated`, which the day-one `clients` visibility invites, leaks the private ledger. Studio or SQL edits of `visibility` skip it entirely. Evidence: ADR s3 rows "Client logins", "Compliance audit"; PIT s2.

**10. The documents conflict and the legal basis is unverified.** RULES says the private tier includes invited client logins; the ADR says no client accounts. Circular PDFs are still TODO; policy_version 1 encodes a secondary summary. Evidence: RULES table and open questions; LAND s5 TODO.

**11. The hash-chain anchor is either worthless or non-compliant.** A public hash of a private ledger proves nothing to an AMC until events are revealed, and revealing them is a public track record, which RULES rule 2 and LAND s5 flag as the riskiest feature. Any migration or restore that rewrites rows breaks the chain. Evidence: ADR s3 "Ledger integrity"; LAND s5.

**12. Caches cannot be retracted.** Social cards and search engines keep old text. Private pages get CDN-cached if the `setAll` Cache-Control headers are missed. Evidence: PIT s2, s5.

## Medium

**13. The read-only cascade.** Past 500 MB the database goes read-only, the heartbeat UPDATE fails, and the project pauses. Evidence: PIT s3.

**14. Expensive to change later.** Deleting original PDFs blocks re-extraction with the planned native-PDF provider, and `source_url` links rot. `LlmPort` is shaped around 1-2-page Groq chunks, so moving to Claude changes `job_steps` and the pipeline, not one adapter. Zod-as-Groq-schema couples the domain to one vendor. GPLv3 locks the bundle open-source. Evidence: ADR s3, s6, s7; LAND s1-2.

**15. Prices stop silently.** The Upstox free tier is unverified, its tokens may expire daily [U], and NSE may block cloud IPs [U]. Scoring then goes stale. Lagged public NSE prices are still redistribution. Evidence: ADR s6; LAND s4.

**16. Untracked spend.** A step killed at 300 s after a provider call never records usage; one scanned AR can exhaust the 500-page monthly OCR quota. Evidence: ADR s2; LAND s8.

**17. Key retirement.** ADR says "service-role key"; legacy keys retire end of 2026. Evidence: ADR s3; PIT s2.

## Low

**18. Vercel and Next.js exposure.** Turbopack CSS 404s are unresolved in 16.3, and a career-motivated site may fall foul of Hobby's non-commercial clause [U]. Evidence: ADR s6; LAND s6.
