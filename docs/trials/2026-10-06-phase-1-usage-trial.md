# Phase 1 usage trial (3 days): Shlok and Aksh

Exit criterion (Phase 1 spec, header): deployed preview; Aksh has captured real notes on 3 consecutive days;
rubric rows R1 1-3, R2 1-5 and R3 1-7 score at least 4. Fix only what blocks capture during the trial; log everything else.

## Before day 1 (Shlok, about 30 minutes)
- [ ] Preview deployed from `phase-1a`; `GET /api/health` returns 200; the uptime monitor shows green.
- [ ] The controller pushes the hosted migrations through `20261007000005_casefile.sql` (`pnpm db:push`, dry run first; Shlok approved this on 2026-10-07), then `pnpm db:types` shows no diff.
- [ ] No seeding of the hosted project (R15): Aksh enters his own trial content through the desk; the fictional seed exists only on local stacks.
- [ ] Aksh signs in on his phone by magic link (open the link in the same browser that asked for it) and adds the desk to his home screen.
- [ ] Walk Aksh through the facts sheet legend, the facts row form and the Wording guide in the editor (10 minutes, no slides).

## Device checks (Shlok, once, on real phones)
Automated runs cover Chromium only; these need a real browser or screen reader.
- [ ] iPhone Safari: type a capture with `$SYMBOL`, `#theme` and `t:` in the capture box; the coloured mirror sits exactly under the typed text (no drift at line wrap, no doubled glyphs). Repeat in Firefox (Android or desktop).
- [ ] VoiceOver (iPhone) on `/companies` and a company file: the register, the facts table, the kill-criteria table and the ledger (exhibit Table tab) are announced as tables with rows and column headers, not as loose text. NVDA (Windows, Firefox or Chrome) on the same pages at a narrow window. Note any table read as plain text in the friction log.
- [ ] iPhone Safari, company file with a ledger: scroll the Table tab; the period key row stays pinned under the top bar.

## Every day (Aksh)
- [ ] At least three captures from the phone, at the moment of noticing. Time one: unlock to "Saved" with a stopwatch (target under 5 s) and write it in Capture timings below.
- [ ] At least one capture each with a `$SYMBOL`, a `#theme` and `t:`.
- [ ] Open New names and say who each new name is.
- [ ] Write one line in the friction log below for anything that slowed you, however small.

## Day-specific (Aksh)
- [ ] Day 1: capture only. Do not open the editor.
- [ ] Day 2: open one real company's thesis, add a revision with at least two facts-sheet rows and one test; read the checklist. Publish only if it is real work.
- [ ] Day 3: write one learning note and publish it through the gate; open it on the public site on the phone.

## Every evening (Shlok, 5 minutes)
- [ ] `/desk` shows no red strip; `/api/health` is 200.
- [ ] Read the friction log. Fix only "blocks" items, on a branch, with a test.

## Friction log
| Day | Who | Screen | What got in the way | Seconds lost | Blocks / slows / cosmetic | Fixed in (commit) |
|---|---|---|---|---|---|---|
| | | | | | | |

## Capture timings (unlock to "Saved", real phone, stopwatch)
| Day | Phone and browser | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## Scores after day 3 (controller, with evidence)
| Rubric row | Score (1-5) | Evidence |
|---|---|---|
| R1.1 Process visibility | | |
| R1.2 Dated and versioned | | |
| R1.3 Facts vs view separation | | |
| R2.1 Not generic | | |
| R2.2 Reading comfort | | |
| R2.3 Data display | | |
| R2.4 Capture speed | | |
| R2.5 Mobile | | |
| R3.1 to R3.7 | | |

Anything below 4 becomes a task in `docs/progress.md`.

## Before any public launch
- [ ] On any stack where the fictional seed was run, unpublish the two fictional files and the seed notes, or replace them with real work (Plan 1B D20). The hosted project is never seeded.
- [ ] Aksh confirms the publishing rules with a lawyer or a NISM-certified RA (`docs/compliance/publishing-rules.md`).
- [ ] Domain decision (Q5: check akshagrawal.in) and `NEXT_PUBLIC_SITE_URL` updated, so share cards carry the final URL.
- [ ] Q8 (`docs/project-memory/unanswered-questions.md`): ADR-003 confines `publish_revision()` to `service_role` with a verified admin actor (migration 0004), but SQL still accepts the `p_lint_result` the server builds and does not re-run the lint; the rule-4 hand check (D16) is stored in that same jsonb. Decide whether that is enough before launch, or sign the lint result.
