# Rubrics - how we judge the work (v1, 2026-10-04)

Three rubrics, scored 1-5 per row. Nothing ships below 4 on any row of the rubric that applies. Reviewers quote the row number in their verdict.

## R1. Allocator credibility (does an AMC head keep reading?)

| # | Criterion | 5 looks like | 1 looks like |
|---|---|---|---|
| 1 | Process visibility | Every thesis shows the framework used, the sources read, and the kill criteria | Conclusions only |
| 2 | Dated and versioned | Each claim carries an as-of date; thesis revisions are diffable; nothing is silently edited | Undated prose |
| 3 | Facts vs view separation | Machine-extracted facts (cited) sit in a distinct block from Aksh's own words | AI-flavoured opinion blended with data |
| 4 | Honesty about error | Mistakes journal exists, is populated, and links to the original thesis | Only winners shown |
| 5 | Depth over breadth | Fewer companies, each with model, management-claim tracker and scenario ranges | Many shallow posts |
| 6 | Compliance posture | Disclosures designed into the page; 30-day lag visible; no actionable language | Footer disclaimer, live prices, "buy" |
| 7 | Daily-use evidence | Visible cadence: capture log, reading log, weekly digest, all real | Site last updated months ago |

## R2. Design quality (would a renowned designer sign it?)

| # | Criterion | 5 looks like | 1 looks like |
|---|---|---|---|
| 1 | Not generic | Could not be mistaken for a SaaS template; typography-led; segment decisions recorded in `docs/design/decisions.md` | Gradient hero, three feature cards, icon grid |
| 2 | Reading comfort | 60-75 char measure, clear hierarchy, tabular numerals, citations in margin or inline popovers | Walls of text, proportional digits in tables |
| 3 | Data display | Every table/chart has source + as-of, responsive without horizontal scroll on phone, assumption sliders where a model exists | Screenshot of Excel |
| 4 | Capture speed | Admin quick-capture reachable in one tap; a thought saved in < 5 seconds; drop-anything inbox | Multi-step forms |
| 5 | Mobile | Designed at 375 px first; thesis pages fully usable one-handed | Desktop shrunk |
| 6 | Motion | Purposeful, < 300 ms, reduced-motion honoured | Decorative scroll effects |
| 7 | Accessibility and perf | WCAG AA, keyboard-complete admin, LCP < 2.0 s on 4G, CLS ~0 | Fails any |

## R3. Engineering quality (will it still work in six months with nobody watching?)

| # | Criterion | 5 looks like | 1 looks like |
|---|---|---|---|
| 1 | Free-tier safety | Token/page budgets enforced in code; jobs defer, never fail, when quotas hit; owner emailed once per incident | 429s crash jobs |
| 2 | Idempotent jobs | Every job step re-runnable; lease + reaper; duplicate cron runs harmless | "processing" forever |
| 3 | Security | RLS on every table, `WITH CHECK` on updates, service key only in job code, `defenso guard_code` clean, env via zod | Service key in a client bundle |
| 4 | Compliance in code | Publish Gate server-side, tested with adversarial phrases; SQL re-checks 30-day lag | Gate in UI only |
| 5 | Tests | Each module has vitest coverage of its service + gate; admin flows have Playwright smoke; CI green on main | Manual testing |
| 6 | Small units | Files < 300 lines, modules talk via public API, no cross-module table access | God files |
| 7 | Memory discipline | `docs/progress.md`, timeline, ADRs updated every session; next task named with reason | Knowledge in chat only |

## How to use
- Spec review: `desk-architect` scores R1 + R3 rows that apply.
- Design review: `desk-ui` scores R2 before any component is built, after each segment.
- Task review: the reviewer subagent scores R3 on the diff; the controller records scores in `docs/progress.md`.
- Before showing Aksh: controller scores all three; anything < 4 becomes a task.
