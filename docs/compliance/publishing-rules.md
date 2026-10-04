# Publishing rules (SEBI-aware), v1 - 2026-10-04

Status: engineering rules derived from research in `docs/research/2026-10-04-tooling-landscape.md` s5. Not legal advice. Aksh should confirm with a lawyer or NISM-certified RA before launch, and again if he registers as a Research Analyst.

## Why this exists

Aksh is not a SEBI-registered Research Analyst. Under RA Regulations 2014 (amended Dec 2024) and the Jan 2025 / May 2026 circulars, an unregistered person may publish **investor education** but not **research reports** (anything that reads as a recommendation or opinion on a specific security that a reader could act on). The May 2026 circular (effective 1 Jul 2026) adds a **30-day lag** on price data in educational content.

The system enforces these rules in code, so a tired 11 pm publish cannot break them.

## Two tiers

| Tier | Who sees it | What is allowed |
|---|---|---|
| **Private** (`visibility = private`) | Aksh only in v1 (no client accounts until Q1 is answered; `clients` exists in the schema only) | Everything: live idea ledger, scores vs Nifty, target ranges, position sizing, interactive valuation models, mistakes with live numbers. |
| **Public** (`visibility = public`) | Anyone | Process, frameworks, learning notes, company **case studies** with >=30-day-old data, management-claim trackers, document summaries, mistakes journal entries (lagged). |

Default for every new object is `private`. Promotion to `public` runs the **Publish Gate** below.

## Publish Gate (automated, blocks publish on failure)

1. **No actionable language.** Reject if public body text matches (case-insensitive, word-boundary): `buy`, `sell`, `accumulate`, `add on dips`, `exit`, `book profit`, `target price`, `TP`, `stop loss`, `SL`, `upside of`, `multibagger`, `will rally`, `will fall`, `undervalued by X%` when attached to a named security. Allowlist: quotations from third-party documents that are clearly cited as source text (rendered in the "Source facts" block), and the words used in a process/educational sense flagged by Aksh in review ("why I avoid target prices").
2. **No performance claims.** Reject phrases like `returned X%`, `my calls`, `hit rate`, `beat the Nifty`, `CAGR of my ideas` on public pages. Private pages may show them.
3. **30-day data lag.** Any price, return or valuation number tied to a named security on a public page must carry `as_of_date <= today - 30 days`. The renderer prints the as-of date next to the number. Numbers younger than 30 days are rendered as `[withheld until DD Mon YYYY]`.
4. **Named-security recency.** A public page may not be *first published* about a company within 30 days of the most recent private ledger entry on that company that changes stance (open/close/upsize/downsize). Updates to an already-public case study are allowed if rules 1-3 pass.
5. **Disclosure block is mandatory.** Every public page ending with a named security renders the standard disclosure (below) with `holds_position: yes | no | not disclosed` taken from the ledger at publish time.
6. **Educational framing field.** Every public piece has a required `learning_objective` field (one sentence). It renders as the page's standfirst and is what makes the content "education" rather than "a view on a stock".

Note: rule 4 is enforced in code from Phase 3 (it needs the ledger); until then Aksh applies it by hand. The rendered standard disclosure block is excluded from rule 1's scan.

7. **Every revision is gated, not just the first publish.** A new revision of a public item stays invisible until it passes rules 1-6 again. Rule 4 is evaluated per revision, so a stub cannot be published and then filled in.
8. **Whole public surface is linted:** title, slug, learning objective, body, structured data, OpenGraph text, newsletter drafts, video transcripts and any text extracted from images shown publicly.
9. **Interactive valuation models are never public** while Aksh is unregistered: a DCF output is a price target by another name. Public pages may show a static scenario table (lagged, labelled as scenario outputs) that itself passes the gate.

A gate failure shows the exact sentence and the rule number in the review UI; Aksh edits and re-runs. Two different things: a **rule override is impossible**; a **sentence allowance** is possible. Aksh may mark a specific flagged sentence as educational usage ("why I avoid target prices") with a reason; it is stored in `lint_allowances` and shown in the gate decision. Allowances never apply to rules 3, 4 or 9.

Retraction: `unpublish_item()` makes the item private, revalidates and purges our cache. Third-party caches (search engines, social previews) cannot be purged by us; this is a known limitation.

## Standard disclosure (rendered, not typed)

> Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag. Position in the security discussed: **{holds_position}**. Investments in securities are subject to market risk; consult a SEBI-registered adviser before acting. Last reviewed {reviewed_date}.

## Wording guide for Aksh (shown in the editor)

- Write "what I expected and why" rather than "what you should do".
- Write "the market priced X; I thought Y because Z" instead of "undervalued".
- Write the kill criteria: "I would have been wrong if...".
- Prefer ranges and scenarios over point targets, and label them as inputs to a learning exercise.
- Mistakes are the most credible content on the site. Publish them.

## Open questions (for `docs/project-memory/unanswered-questions.md`)

- Do invited "client" logins change his status (advice to identified persons)? Likely yes if he charges or if they act on it. v1: clients see the private tier read-only with a prominent "personal research journal, not advice" banner; no fees.
- Official PDFs of the Jan 2025 and May 2026 circulars to be stored in this folder.
