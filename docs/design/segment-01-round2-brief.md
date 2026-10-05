# Segment 1, round 2: B+ and H

Comparison: `docs/design/comparisons/01b-labelled-blocks-round2.html`. B (round 1), B+ and H render one data object. Round 2 adds quoted lines, units, prior labels, last-checked dates and an empty-state variant.

**Studied:** 31 new screens (21 desktop, 10 phone) from 18 sites, all captured with agent-browser because Mobbin was unavailable. Five sites showed bot checks, which were not bypassed: Finviz, Trendlyne, EDGAR, Bloomberg and the Federal Register.

## B+ changes (references in italics)
- **Strip:** a quiet grey line (Education · No position · Data to 30 Jun 2026) that opens to a summary, replacing the black caps bar. *legislation.gov.uk "up to date… on or before", MDN Baseline badge.*
- **Dateline:** this version, revised, first written, figures to. *arXiv "last revised (this version, v7)", GOV.UK "Last updated".*
- **Phone navigation:** a sticky four-part index with counts plus a hairline progress bar, which does both jobs. The desktop rail adds a file summary. *Linear changelog tabs, Stripe API rail, Last10K tabs.*
- **Source cards:** a chip opens a card in the reading flow showing the figure, prior figure, quoted line, source and as-of date. *Stripe "Show child attributes", Tegus/AlphaSense cited answers.*
- **Kill criteria:** status counts, each status shown as a shape plus a word, the latest reading with its data date, and the date last checked. A legend says that "Met" means the view is wrong. *GitHub Status history, MDN Baseline.*
- **Diff:** the reason comes first, then removed and added sentences as prose blocks, then any new facts and tests. A switch shows R2 or R1 in full. *Wikipedia's 18-character side-by-side phone diff is the counter-example; GitHub's unified phone diff and Last10K "YoY Changes" are the models.*
- **Numbers:** tabular figures in tables, proportional figures in prose. Units get their own column so digits share one right edge, and the as-of date is given once per period. *stockanalysis.com, Google Finance timestamp.*
- **Rhythm:** one rule for the whole VIEW block, about 73 characters a line, and mono only for IDs (the round-1 noise risk).
- **Dark mode:** raised surfaces lighter, body text softened to #D9DDE2, borders visible, `color-scheme` set, and no meaning carried by colour.
- **Empty states:** each says what will appear, what it holds and why it is empty, and shows the column shape. *Readwise's blank 404 is the counter-example.*

## H: where the serif stops
The boundary follows authorship, which mirrors the data model.
- **Source Serif 4:** every sentence Aksh wrote, including the title, description, view, test conditions, revision reasons, diffed sentences and linked notes.
- **Serif italic:** his framing only (section titles, the learning objective, "I would be wrong if"). Never on facts.
- **Source Sans 3:** everything a filing or the desk supplies: figures, tables, status, readings, the strip and the disclosure. Quoted filing lines are sans in quotation marks, so they never read as his voice.
- **IBM Plex Mono:** IDs only (S1, p. 112, R2, VIEW).
- **Test rows:** the boundary runs through each row, with the claim in serif and the evidence below it in sans.

## Recommendation: H
H marks fact versus opinion twice, with a block label and a typeface, and the typeface enforces the CLAUDE.md rule that Aksh's words and extracted facts never share a field. Serif at 18-19.5 px also reads better over 2,000 words, and it eases B's SaaS-docs risk (R2-1) before segment 5.

The cost is a third family: Serif 400, 400 italic and 600, Sans 400 and 600, and Mono 500, subset, self-hosted, to check against the LCP budget. Keep B+'s all-sans system for data screens in segment 3.
