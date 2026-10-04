# Segment 1: reading experience brief (2026-10-04)

Comparison: `docs/design/comparisons/01-reading-experience.html`. All three directions render one fictional thesis from one data object. Colour and identity are left to segment 5.

## What was studied
Mobbin MCP was unavailable (it needs a paid plan). `agent-browser` captured **40 screens** instead: 20 live pages at 1280 px and 375 px, with computed type metrics. Pages: Stratechery, Tufte CSS, Gwern, Antifragile Thinking, Marcellus, Bessemer Anti-Portfolio, Our World in Data, Robinhood Learn, Public.com, Linear docs, Koyfin, Smallcase, Groww, Tegus, the Triyambak repo and a report, Works in Progress, Ink & Switch, Notion and Readwise docs. Five text reads included Zerodha Varsity. Varsity chapters and Bloomberg returned bot checks, which were not bypassed.

Findings: finance learn pages run 88-103 characters per line, while the best readers stay at 59-77. No finance site separated facts from opinion typographically. Marcellus puts its disclosure in a blocking modal. Triyambak's dated "REVISED" banner was the only revision pattern found.

## A. Margin Ledger
**References:** Tufte CSS, Gwern sidenotes, Stratechery article body, Triyambak report revision banner.
**Borrows:** sidenotes that carry source, page and as-of date beside the claim. A serif argument against a tinted sans ledger of facts. A revision rule beside the changed paragraph.
**Rejects:** Gwern's density, Stratechery's sidebar, and endnotes the reader has to jump to.
**Why it suits:** an AMC reader checks any figure without leaving the sentence; on the phone, notes fold under each paragraph. Aksh writes plain Markdown with `{S1|p. 84|date}` tokens.
**Risks:**
- Sidenote placement is the hardest of the three to build without layout shift (R2-7).
- Six notes under three phone paragraphs interrupt rhythm.
- The full disclosure sits at the end, with only a short line in the header.

## B. Labelled Blocks
**References:** Linear docs, Readwise docs, Tegus "fully cited" claims, Koyfin blog TOC and dateline, Notion block model.
**Borrows:**
- Each block declares its kind: VIEW (solid), TEST (outlined), FACT (dashed).
- Inline source chips (`S1 · p. 84`) and a fact table with Source and As-of columns.
- Kill criteria as a status table, and revisions as a true diff.
- A sticky disclosure strip on every screen.
**Rejects:** Koyfin's 60 px mobile headline, Groww's link sidebar and signup chrome.
**Why it suits:** fastest to scan. An allocator reads the tests and their status in five seconds, and the diff shows exactly what changed (R1-2). It maps directly onto `structured.sources[]` and `item_revisions`, so Aksh's edits never touch layout.
**Risks:**
- Closest to a docs or SaaS look. It fails R2-1 unless segment 5 gives it a strong identity.
- Mono labels add visual noise.
- 16.5 px sans reads less warmly over 2,000 words.

## C. Letter and Exhibits
**References:** Nomad partnership letters (via Marcellus), Marcellus newsletters, Works in Progress, Ink & Switch essays, Bessemer Anti-Portfolio.
**Borrows:**
- A dated letter voice and section numerals.
- Facts as numbered exhibits with a source and as-of caption.
- Revisions as signed, dated postscripts that quote the old text.
- "I would be wrong if..." as a sentence form.
- The disclosure as a preface at body size.
**Rejects:** Marcellus's jurisdiction modal, which blocks the content, and decorative hero art (Works in Progress, Smallcase).
**Why it suits:** fund letters are an AMC head's native genre. Quoting the old paragraph is the most candid way to show a change of mind (R1-4), and a postscript is a natural daily act for Aksh.
**Risks:**
- The preface costs about one phone screen before the thesis starts.
- Exhibits take more authoring work than B's rows.
- It can read as nostalgic rather than rigorous.

## Shared decisions (any direction)
- Tabular numerals are verified in all six faces.
- Body text is at least 16 px. Measure is 37-43 characters on phone and 61-73 on desktop, with no horizontal scroll at 375 px.
- Status is shown in words, never by colour alone.
- Sample copy passes Publish Gate rules 1-2.
- `ui-ux-pro-max` proposed a "lead magnet" landing pattern, which was rejected; its academic font pairing informed the type.

## Decision needed from Shlok
Pick A, B, C or a mix of matrix rows. Record the choice in `docs/design/decisions.md` before segment 2.
