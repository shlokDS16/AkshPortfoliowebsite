# Segment 4: capture and review (private /desk)

Comparison: `docs/design/comparisons/04-capture-review.html`: five screens per direction at 960 and 375 px, light and dark, three states, live grammar parsing. B+ type, segment-3 tokens, fictional content.

**Studied:** 30 captures, 19 products (listed in the HTML); six pages blocked or missing; no Mobbin.

## A. Command line
*One prompt that reads the grammar as you type; review by number keys.*
- **References:** Raycast, Linear Triage, Superhuman, Todoist Quick Add, Kite order window, Prodigy.
- **Borrows:** inline token colouring (Todoist), a one-line receipt after typing (Kite), keyed triage (Linear), a gate report that cites sentences by number.
- **Rejects:** command palettes and slash menus; the grammar is the only syntax.
- **Daily use:** fastest phone path. The prompt docks at thumb height with a `$ # t: l: p:` key row.
- **Risks:** reads as a developer tool to a non-technical owner. Its shortcuts do nothing on a phone. Closest to a template look (R2-1).

## B. Day book
*Each day is a page; the desk answers in sentences.*
- **References:** Drafts, Bear, Apple Notes, Notion and Obsidian mobile, Google Keep.
- **Borrows:** reading-size input, pills that say where a line will be filed, a 30-dot strip, gate notes beside their sentence, track-changes diffs, and questions in place of field names ("Do you hold it?").
- **Rejects:** status columns and counts as the main view.
- **Daily use:** the warmest direction. Its gate explanations are the clearest for a non-technical owner.
- **Risks:** the line sits at the top of the screen, a stretch for one thumb. The page hides queue states and invites editing old lines, but captures are append-only. Could drift toward a Notion clone.

## C. Trays
*What needs Aksh, what is being read, what came in today.*
- **References:** HEY (Screener, Imbox), Things Today, Linear Triage, Readwise Reader, Lightroom flags, Label Studio.
- **Borrows:** a Needs-you tray with one action per card; inbox sections named by state ("Paused, nothing lost"); one flagged value at a time in review (what the desk read against what the totals need); Screener cards for new names; a publish checklist.
- **Rejects:** charts and badge counts on every surface.
- **Daily use:** fits Phase 2, where his time goes on states and short decisions. Capture is one button on every screen.
- **Risks:** the most chrome; cards could look like a SaaS dashboard. Needs-you could become a guilt list. The sheet adds a 220 ms animation.

## Shared rules
- The red strip names what is late, says notes are safe and that Shlok has been emailed. Offline captures show "on this phone" and sync later.
- A gate failure shows the sentence, its rule number and the words that matched. Allowances apply only to rule 1 sentences and need a reason. Rule 3 says "no allowance". Publish stays disabled while a rule fails or the rule-4 hand check is unticked. There is no override control.

## The < 5 s capture path
iOS raises the keyboard only after a tap, so every direction needs one tap into the field.

| | Phone (home-screen app) | Laptop (pinned tab) | Overhead before typing (estimate) |
|---|---|---|---|
| A | icon, tap box, type, send: **3 taps** | focused on load or `/`, Enter | ~1.2 s |
| B | icon, tap line, type, Save: **3 taps** | focused on load, Enter | ~1.5 s (reach) |
| C | icon, tap Capture, type, Save: **3 taps** | `c`, Enter | ~1.4 s (sheet) |

Overheads are unmeasured estimates. All three fit if the shell opens from cache in about 1 s and saves locally in under 100 ms; measure on a real phone in the Plan 1A smoke test.

## Recommendation
**C as the base, with two borrowings.** C's trays, state-named inbox, one-at-a-time review and Screener cards suit short, interrupted sessions, and they show Phase 2 states without logs. From A, put live token colouring, the receipt line and the `$ # t: l: p:` key row in C's capture sheet. From B, place each gate note under or beside its sentence, with C's checklist as the summary.

**Not taken:** A's mono look (too technical); B's page as the home (hides states).
