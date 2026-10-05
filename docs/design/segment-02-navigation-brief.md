# Segment 2: navigation and information architecture (public site)

Comparison: `docs/design/comparisons/02-navigation.html`. Each direction is shown at 960 and 375 px across five screens: desk home, company index, the Kaveri file (B+ unchanged), a learning note, and menu or search. The file passes the gate phrase scan; "buy or sell" appears only in the disclosure.

**Studied:** 39 captures from 31 sites, taken with agent-browser because Mobbin was unavailable. NYT showed a bot check, which I did not bypass. Koyfin, Tegus and Readwise libraries need a log-in, so I studied their public pages.

## A. The Register
*Every company is one row with its version, revision date, test status and data date, so a reader can audit the desk before reading it.*
- **References:** GitHub repo file list, StockAnalysis, Last10K, Stripe and Linear docs rails, arXiv listings, Triyambak's repo of dated reports.
- **Borrows:** a sortable table that wraps to three lines on a phone; one rail that opens into the current file's sections; a "Used in" table on each note.
- **Rejects:** dashboard icon grids, thumbnail cards, tickers as the main label.
- **AMC reader:** in five seconds they see 7 files, which tests are met, and that every figure is at least 30 days old (R1-2, R1-6).
- **Aksh:** costs nothing, because publishing fills the register.
- **Risks:** seven rows can look like a thin database. A file page has four bars on a phone.

## B. The Desk Log
*Home is a dated log of what changed and why, and search is the only navigation.*
- **References:** Linear changelog, Wikipedia revision history, Simon Willison's weblog, Our World in Data and Last10K (search-first), Matuschak and Obsidian backlinks.
- **Borrows:** entries grouped by week, with the reason first; search that matches test conditions and source facts and shows the matching line; note previews that open from words in the view.
- **Rejects:** hamburger site maps, breadcrumbs, undated feeds.
- **AMC reader:** revision reasons are the asset no other research site shows, and the log is honest daily-use evidence (R1-7).
- **Aksh:** costs nothing, but a good home page depends on good change reasons.
- **Risks:** with search as the only navigation, a reader cannot see how small the desk is. Concept links add a second kind of control inside the decided VIEW block.

## C. The Weekly Letter
*The desk reads like a periodical: a short dated letter, the files behind it grouped by sector, and one Contents page.*
- **References:** Stratechery "This Week", Substack archive, Varsity modules, Wikipedia's "Part of a series".
- **Borrows:** a dated masthead; "In this letter"; files grouped by what they teach; a numbered Contents page; "Read first" notes before a file; a link to the next file in the sector.
- **AMC reader:** the most human of the three, and close to letters to partners.
- **Aksh:** about 100 gated words a week; phase 2 could draft them from change reasons.
- **Risks:** a missed week shows as a stale front page, the opposite of R1-7. It is also one more public text to gate.

## Shared in all three
- On a file page, B+'s strip is the only disclosure on screen. Elsewhere the site disclosure sits at the bottom on a phone and at the top on desktop.
- The streak shows counts only (23 of the last 30 days, a 30-cell strip and the last entry date).
- Mistakes show a designed empty state until phase 3.

## Recommendation: A, with two borrowings
Build A's structure: the register home, a four-tab phone bar, and one desktop rail that opens into the file. It shows the desk's state fastest and costs Aksh nothing. Then add:
1. **B's log** as the Desk tab's first block, "What changed": the last five entries, each with its reason first, above the register. This removes A's database feel.
2. **C's "Read first"** on files, in place of A's end-of-page notes table. Keep "Used in" on the notes.

Leave out B's inline concept links, which compete with source chips, and C's letter, which carries cadence risk, until the newsletter phase. Hide the tab bar while scrolling down a file, so a phone shows at most three bars.
