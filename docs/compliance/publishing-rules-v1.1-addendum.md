# Publishing rules v1.1 addendum: case studies from the track-record ledger (2026-10-15)

Status: written by desk-architect on Shlok's delegation, 2026-10-15. It is put into force in code by Plan 3b Task 1
(`docs/plans/2026-10-15-phase-3b-case-studies.md`): migration 0019 restates `publish_revision()` with the checks below and moves
the policy version from `sebi-unreg-2026-07` to **`sebi-unreg-2026-07-v1.1`** (`c_policy` in SQL, `POLICY_VERSION` in
`src/modules/compliance/policy.ts`). Until that migration reaches the hosted project, v1 governs and nothing in this addendum
can be public. Not legal advice: Q27 (and Q12) are the legal questions, and both owner switches below stay OFF until Shlok
answers them. Append-only: `publishing-rules.md` is unchanged; where it and this addendum differ for a case study that carries
a ledger record, this addendum governs.

## 1. Why this addendum exists
`publishing-rules.md` v1 allows "company case studies with >=30-day-old data" and forbids every performance claim (rule 2).
Plan 3b lets a closed idea from the private track-record ledger become a public case study. That needs rules v1 did not have:
which sealed entries may be shown, what counts as a figure about how an idea did, and what a fingerprint may be said to show.

The reading that governs (tooling landscape s5; Phase 3 spec s11): SEBI's January 2025 circular keeps content that is
**solely investor education** outside the research-analyst regime only if it carries **no recommendation and no performance
claim**; the May 2026 circular (in force 1 July 2026) adds the **30-day lag** on price data in educational content and forbids
naming a security from the preceding 30 days in a way that indicates its future price direction. A ledger case study is
education about a decision process: what he expected and why, what happened, what he learned. It is never a record of results.

## 2. Publishing rule 10: case studies from the ledger (new)
A **ledger case study** is an item of kind `case_study` whose revision carries a ledger record (`structured.ledger`, spec s33).
Every check below runs inside `publish_revision()` on every revision (rule 7), is recorded as a gate failure with the rule
number `10`, and **cannot be lifted by a sentence allowance, a screen or a caller's word**.

10.1 **Owner switches, both OFF by default.** Two rows in `private.settings`, which no API role can read or write:
`ledger_reveal` (any ledger case study) and `ledger_chart` (the rebased chart). Each is on only when its value is exactly
`on`; a missing row or any other value is off. Only the database owner changes them (SQL editor; runbook
`docs/runbooks/case-study-switches.md`). With `ledger_reveal` off, no revision carrying a ledger record passes. With
`ledger_chart` off, the ledger record is built without a chart and a revision carrying one does not pass.

10.2 **Closed ideas only, and nothing open on the company.** The idea must have a sealed `close` and no sealed `void`, at
least one sealed `review` (what he learned), and a fixed exit (its score is final). No idea on the same company (the company
and every stub merged into it, as rule 4 reads it) may be open at the time of the decision: a past case must not sit beside a
live view on the same share.

10.3 **What may be shown, and only this.** From the sealed events of that one idea: the `open` entry, every `revise` entry,
the `close` entry and every `review` entry, each with its words exactly as sealed, its sealed time, its structured choices,
its sealed text, the fingerprint before it and its own fingerprint. From the scores: the entry date, the exit date and the
number of days between them. From his review: the process call (sound or flawed) and the kinds of mistake he named. Nothing
else from the ledger: no `note`, `upsize` or `downsize` entry, no other idea, no price, no return, no excess, no flag, no
summary figure, no journal-grid label (earned, lucky, unlucky, deserved).

10.4 **The record is the ledger's, not typed.** The ledger record is built by one SQL function from the sealed events, the
scores and the sealed-day table. The gate rebuilds it at decision time and refuses unless the revision carries exactly that
record. So his sealed words cannot be edited for publication, an entry cannot be left out or added, and no number can be
put into the record by hand. His later prose about the case goes in the revision body, where the lint applies as usual.

10.5 **The 30-day lag covers every revealed entry and every chart point.** The record's "figures to" date is the latest of
the India dates of the revealed entries and the last chart point. The item's `data_as_of` must equal it, so the existing
case-study rule (rule 3: `data_as_of` at least 30 India days old) and the public views' lag (`private.is_public_item`) apply
to the whole record. Rule 4 (no stance-changing entry on the company in the last 30 India days) is unchanged and still applies.

10.6 **The chart (second switch).** Allowed only when all of these hold: `ledger_chart` is on; the score is final; the score
carries none of the flags `entry_pending`, `exit_pending`, `jump`, `isin_changed`, `hand_price`, `attested` or `stale` (so no
typed or uploaded close and no hand-entered corporate action stands under it); every point uses only closes the desk fetched
from NSE itself. Shape: the share and the Nifty 50 price index, both rebased to 100 at the entry close, one point per week (the
last fetched trading day of each week), from the entry date to the exit date, at most 600 points, values rounded to two
decimals. Caption, rendered: "Closing prices, NSE. Rebased to 100 on {entry date}. Figures to {date}. Price only, dividends not
included. A past case, not a view on the share today."

10.7 **No outcome as a figure or a verdict.** No page prints a return, an excess, a rupee price (entry, exit or any other), a
rebased value as text, "ended ahead" or "ended behind", or any count, rate or average across ideas. The chart is drawn with a
labelled 100 baseline and unlabelled gridlines; its text alternative describes what is drawn, not how the idea did. **Be
plain about this:** the chart's weekly values are in the page's data, which anyone can read; switching the chart on is
publishing them. That is why it has its own switch.

10.8 **The lint applies to his sealed words.** Rules 1, 2 and 8 apply to every revealed entry's words, as to any public text.
A sealed sentence cannot be edited, so a sentence the lint refuses keeps that idea off the site unless a sentence allowance for
rule 1 or 2 applies under the existing allowance rules. The sealed text's other fields are fixed keys and catalog identifiers
(symbol, ISIN, company name) and are not linted as prose. The fixed template sentences of the case-study page (section 4) are
rendered, not typed, and are excluded from the scan like the standard disclosure.

10.9 **Only a case study carries a ledger record**, and one idea is published as at most one case study at a time.

## 3. What existing rules mean for a ledger case study
- **Rule 2 (no performance claims).** Section 10.7 is its engineering form for the ledger. A single closed case shown with its
  original words and dates is not a performance claim; the chart is the one depiction of how the share moved, and it is behind
  its own switch because Q27(b) asks exactly that question.
- **Rule 3 (30-day lag).** The chart values are "a price ... tied to a named security": they carry the lag through `data_as_of`.
- **Rule 4.** Unchanged and strict (Q28): every revision, 30 India days from any open, close, upsize or downsize on the company.
- **Rule 5 (disclosure).** The standard disclosure block with `holds_position` and the review date is rendered on every case
  study; the position consistency check from the ledger applies.
- **Rule 6.** `learning_objective` is required and is the standfirst.
- **Rule 9.** Unchanged: no model, no target, no scenario value comes from the ledger.

## 4. Fixed wording on every ledger case study (rendered, not typed; pending Shlok's approval of the exact strings, spec s33)
- Under the chart: the caption in 10.6.
- At the foot, always, chart or no chart: "A past case, not a view on the share today."
- Under each revealed entry: "Written on {date}. Fingerprint {hash}." and, only when the gate has confirmed that the entry's
  day was published in the public fingerprint file: "Listed in the public file on {date}."
- The standard disclosure block.

## 5. What may be said about the fingerprints (from the ADR-005 addendum of 2026-10-14)
While the public copy of the fingerprints is OFF (as released): a reader can recompute an entry's fingerprint from the sealed
text and the fingerprint before it, which shows that the text is the text the desk sealed at that place in its chain. It does
not show when the entry was written, and the database owner could rewrite the chain. Never say "proof", "proves", "verified",
"cannot be altered" or "tamper-proof". When the public copy is on, an entry may also say on which day its fingerprint was
listed in the public file; for entries sealed before the switch-on day, that day is the switch-on day.

## 6. The Mistakes page
Lists only published ledger case studies in which **his own review** called the process flawed or named a kind of mistake
(thesis, valuation, timing, sizing, process, behaviour). It is never chosen by the machine's outcome, shows no count, and links
each entry to its case study.

## 7. Switching off, and withdrawing
Turning a switch off stops every new publish and every new revision of a ledger case study at once. It does not take down a
page already public: each one is withdrawn with the existing Unpublish action (rule "Retraction" in v1), and third-party caches
remain a known limit. The runbook lists the query that finds every published ledger case study.
