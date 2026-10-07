# Design decisions (segment by segment)

Each entry: segment, options shown, choice, reason, date. Never redo a decided segment without being asked.

## Segment 1: reading experience (thesis page)
- **Options shown (2026-10-05):** A Margin Ledger, B Labelled Blocks, C Letter and Exhibits (`docs/design/comparisons/01-reading-experience.html`, brief in `segment-01-reading-brief.md`).
- **Shlok's direction:** Labelled Blocks family. Round 2 requested: improvise on B first (push the research-file idea further), then produce a hybrid of the improved B structure with A's serif typography. Final pick pending round 2 (`comparisons/01b-labelled-blocks-round2.html`).
- **Reason:** an AMC reader scans first (B's compliance strip, labelled blocks, source chips, diff history do the trust work) and reads second (A's typography carries long reading).
- **Round 2 (2026-10-05):** `comparisons/01b-labelled-blocks-round2.html` showed B (reference), B+ (improvised) and H (B+ in A's serif). Brief: `segment-01-round2-brief.md`.
- **DECIDED: B+ (improvised Labelled Blocks).** All-sans research file: quiet expandable compliance strip, arXiv-style dateline, sticky four-tab phone index with counts + hairline progress, source chips opening in-flow source-fact cards (figure, prior, quoted line, source, as-of), kill-criteria status table with last-checked dates, phone-readable prose diff with R1/R2 switch, tabular numerals with units column, proper dark mode, explanatory empty states. Type: IBM Plex Sans for reading and data, Plex Mono for IDs only.
- **Reason (Shlok):** chose B+ over the serif hybrid H; one type system across reading and data screens, lighter font payload. Facts-vs-view separation is carried by block labels and layout, not typeface.
- **Status:** DECIDED 2026-10-05. Tokens to be written into `design-dna.md` when segment 5 (identity) sets colour.

## Segment 2: navigation and information architecture (public site)
- **Options shown (2026-10-05):** A The Register, B The Desk Log, C The Weekly Letter (`comparisons/02-navigation.html`, brief `segment-02-navigation-brief.md`, 39 screens from 31 sites).
- **DECIDED: A + two borrowings.** Register home (one row per company: version, last revision, test status, data date) with B's "What changed" block above it (last five entries, reason first); four-tab bottom bar on phone (hidden while scrolling a file so at most three bars show); one desktop rail that opens into the current file's sections; C's "Read first" notes at the top of each file; "Used in" table on learning notes; streak shown as counts only; site disclosure at bottom on phone, top on desktop (on a file page B+'s strip is the only disclosure). NOT included: B's inline concept links (compete with source chips), C's weekly letter (cadence risk; revisit in Phase 5).
- **Reason:** Shlok asked for the most visually appealing and presentable option; the designer and controller agreed the hybrid shows the desk's state fastest, removes A's database feel, adds daily-use evidence, and adds no weekly obligation for Aksh.
- **Status:** DECIDED 2026-10-05.

## Segment 3: data display (tables, charts, stat tiles, private valuation panel)
- **Options shown (2026-10-05):** A Ledger (table as the exhibit, sticky key row on phone), B Exhibits (numbered figure blocks: chart first, Chart/Table toggle, source + as-of footer), C Instrument rows (one row per measure with sparkline, opens into periods and quotes; tests as distance-to-threshold meters). `comparisons/03-data-display.html`, brief `segment-03-data-brief.md`, 34 screens from 16 sites.
- **PROVISIONAL (controller, Shlok in class; confirm or overturn):** B's exhibit frame for every figure block; exhibit 1 opens on A's ledger table with the sticky phone key row as its Table tab; C's distance-to-threshold meters for kill criteria; B's large figures with unit squares for the register-home stat tiles; B's heatmap only in the private valuation panel.
- **Compliance ruling (rule 9):** public scenario tables never show equity value or per-share value; operating outputs only. Equity/per-share values live in the private panel.
- **Status:** CONFIRMED by Shlok 2026-10-05.

## Segment 6: motion (pulled forward at Shlok's request)
- **Options shown (2026-10-05):** Instrument (snap/tick/roll, 120-220 ms, one ease-out), Paper (glide/draw/settle, 160-300 ms, shared-element morph), Terminal (draw/count/stamp, instant feedback). `comparisons/06-motion.html` (CSS + Web Animations API, no library; CLS 0 measured), brief `segment-06-motion-brief.md`. Research: `docs/research/2026-10-05-motion-landscape.md`.
- **DECIDED: Instrument as the system + Paper's register-row-to-file-title morph + Terminal's chart draw-to-data-cap and CSS scroll-linked reading hairline.** Dropped: parallax, count-ups on financial figures, auto-typing. Tokens: durations 120/180/220 ms, easing cubic-bezier(0.2,0,0,1), steps(4) for status ticks, press scale(0.97), no overshoot; reading content never fades; h1/LCP never animates.
- **Build stack (from brief table):** CSS transitions for hover/press/focus; React `<ViewTransition>` for row-to-title; Motion 14 via LazyMotion/m for strip, source cards, layoutId index indicator, tab-bar hide; NumberFlow for counts (never on financial figures); CSS pathLength/stroke-dashoffset or Recharts `isAnimationActive="auto"` for draw-to-cap; CSS `animation-timeline: scroll()` with @supports + JS fallback for the hairline. No GSAP, no Lenis. Reduced motion: `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion` + `::view-transition-*` rules.
- **Status:** DECIDED 2026-10-05 (Shlok).

## Segment 4: capture and review (private /desk)
- **Options shown (2026-10-05):** A Command line (prompt with coloured tokens, receipt line, number-key review), B Day book (each day a page, gate notes beside sentences, questions as labels), C Trays (state-named trays: Needs you / Being read / Came in today; one flagged value at a time in review; Capture button on every screen). `comparisons/04-capture-review.html`, brief `segment-04-capture-brief.md`, 30 screens from 19 products.
- **DECIDED: C Trays as the base + A's capture sheet internals (live token colouring, one-line receipt "will file under…", `$ # t: l: p:` key row docked at thumb height) + B's gate explanations placed beside each flagged sentence, with C's publish checklist as the summary.** Not taken: A's mono look; B's day page as home.
- **Shared rules kept:** red liveness strip names what is late, says notes are safe and that Shlok was emailed; offline captures show "on this phone"; gate failure shows sentence + rule number + matched words; allowances only for rule-1 sentences with a reason; rule 3 "no allowance"; publish disabled while any rule fails or the rule-4 hand check is unticked; no override control.
- **Reason (Shlok):** accepted the recommendation; trays make Phase 2 job states legible without logs; borrowings fix capture feel and gate clarity. Capture path is 3 taps on phone; measure the < 5 s target on a real phone in the Plan 1A smoke test.
- **Status:** DECIDED 2026-10-05.

## Segment 5: identity
- **Options shown (2026-10-05):** A Masthead (name-led editorial, blue-black #23439A, 0 px radii), B Assay (coined desk brand + crucible monogram, cold teal #006A7E, 6 px radii; candidate names Assay / Plumbline / Nikasha), C Case files (under Aksh's name, khadi off-white, geru red-ochre #A13A22 accent, neel indigo thresholds, 3 px radii, numbering as the mark). `comparisons/05-identity.html`, brief `segment-05-identity-brief.md`, 30 identities studied.
- **DECIDED: C Case files with A's restraint.** Published under Aksh's own name ("Aksh Agrawal · Case files"); the mark is the numbering (File 03, Ex. 03.1, T1; file numbers never reused); geru only for the hand (links, focus, active tab, mark), never on figures/statuses/chart series; chart subject in ink, benchmark grey, thresholds one separate hue; no ornament in the chrome; imagery limited to cited crops of primary documents plus one dated portrait on About; links underlined; third-person chrome around first-person VIEW. Fonts: keep IBM Plex Sans + Plex Mono (Plex has a Devanagari companion). Favicon: SVG with prefers-color-scheme + 32 px PNG fallback, dedicated 16 px drawing. Share card: one fixed card, linted under rule 8.
- **Answers Q5:** own name, not a desk brand; check akshagrawal.in first. B's names reserved for a future SEBI-registered phase.
- **Status:** DECIDED 2026-10-05 (Shlok).

## All six segments decided (2026-10-05). Next: `design-dna.md` tokens + component inventory, then Plan 1B.
