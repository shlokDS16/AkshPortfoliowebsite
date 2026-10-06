# Design DNA: Aksh Agrawal · Case files

Single source of truth for the build. Written 2026-10-05 from the six decided segments in `decisions.md`. An implementer never needs to open `docs/design/comparisons/*.html`; if this file and a comparison disagree, this file wins. Values marked **(R)** are decisions this file had to make that `decisions.md` did not cover; they are listed for ratification in section 17.

Decided frames this distils: B+ (`01b`), A Register + borrowings (`02`), B exhibits + A ledger + C meters (`03`), C trays + A capture internals + B gate notes (`04`), C Case files with A's restraint (`05`), Instrument + Paper morph + Terminal draw-to-cap (`06`).

---

## 1. Principles (the five rules every screen obeys)

1. **The accent is for the hand; ink is for the data.** Geru marks links, focus, the active tab, file/exhibit numbers and the mark. It never colours a figure, a status, a chart series or a table cell value.
2. **Every number carries its as-of date and source.** Compliance elements (strip, dateline, disclosure, withheld marker) are designed UI, not footers.
3. **Statuses are ink shapes plus a word.** Filled, half, open, dashed. Colour never carries meaning alone (public site uses no status colour at all).
4. **Reading content never moves.** Prose, figures and the h1 are painted static; motion is reserved for the reader's own actions and for instruments (meters, counts, chart draw).
5. **One type system.** IBM Plex Sans for everything people read; Plex Mono only for identifiers. Facts-vs-view is carried by block labels and layout, not by typeface.

---

## 2. Colour

Hex values are canonical (contrast below is computed from them with the WCAG 2.x relative-luminance formula). Light is "khadi paper"; dark is warm brown-black. Both are designed together; dark is not an inversion.

### 2.1 Neutrals (the greys scale)

The scale runs paper to ink. Semantic names are what components use; the step number is for reference only.

| Step | Token | Role | Light | Dark |
|---|---|---|---|---|
| 0 | `--paper` | Page background | `#F7F2E8` | `#17140F` |
| 1 | `--surface` | Strip, teach box, source card, disclosure box, chart tooltip | `#EEE7D8` | `#201C16` |
| 2 | `--surface-2` | Active rail row, hover tint, diff insertion (`--ins`), skeleton blocks | `#E5DCC9` | `#29241D` |
| 3 | `--rule` | Hairlines, row separators, chart gridlines | `#E0D6C4` | `#2E2920` |
| 4 | `--rule-strong` | Header underlines, chip borders, dashed empty-state border, hatch lines | `#C6B9A2` | `#4A4236` |
| 5 | `--bench` | Benchmark series, input borders (`--input-line`), disabled glyphs | `#8A8173` | `#857C6E` |
| 6 | `--ink-muted` | Secondary text, labels, axis text, meta lines | `#62594D` | `#A99F90` |
| 7 | `--ink-body` | Body and reading text | `#2B251E` | `#DED6C8` |
| 8 | `--ink` | Headings, figures, status shapes, primary buttons, chart subject | `#1F1A14` | `#F1EBE0` |

Aliases: `--ins` = `--surface-2`; `--input-line` = `--bench`; `--grid` = `--rule`.

### 2.2 Accent: geru (the hand)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--geru` | Links (always underlined), focus ring, active tab indicator, file/exhibit numbers, VIEW label fill, file tag, exhibit top rule, favicon | `#A13A22` | `#E8907A` |
| `--on-geru` | Text on geru fill (file tag, VIEW label) | `#FFFFFF` | `#1B0F0B` |
| `--geru-wash` | Expanded source chip background, text selection, `$company` capture token background | `#F3DDD2` | `#3A2219` |

Never on: figures, statuses, chart series, table values, buttons' fill (primary buttons are ink), backgrounds of whole regions.

### 2.3 Data hue: neel (thresholds only)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--neel` | Kill-criteria threshold lines in charts and meters, and their direct labels; nothing else on the public site | `#34478F` | `#9AAAEA` |

Private valuation heatmap only (sequential neel ramp, **R**). Label text: steps 0 to 3 use `--ink`, steps 4 to 6 use `--paper`.

| Token | Light | Dark | Label on cell (light / dark) |
|---|---|---|---|
| `--heat-0` | `#E9ECF6` | `#1B2033` | ink 14.63 / ink 13.60 |
| `--heat-1` | `#CDD4EC` | `#232B4D` | ink 11.70 / ink 11.61 |
| `--heat-2` | `#A9B5DE` | `#2F3B6B` | ink 8.51 / ink 9.04 |
| `--heat-3` | `#7F8FCA` | `#3F4F8F` | ink 5.50 / ink 6.49 |
| `--heat-4` | `#5768B1` | `#7486CC` | paper 4.68 / paper 5.27 |
| `--heat-5` | `#34478F` | `#9AAAEA` | paper 7.70 / paper 8.14 |
| `--heat-6` | `#1F2B62` | `#CBD4F7` | paper 11.91 / paper 12.51 |

The current-assumption cell is marked with a 2 px `--ink` ring outside a 2 px `--paper` gap, never with colour.

### 2.4 Signal colours (private `/desk` only, **R**)

Segment 4 decided a red liveness strip and red gate failures. Under the identity they are shifted to a crimson that is a different hue from geru, and green is dropped: a pass is an ink check shape.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bad` | Liveness strip rule and words, gate failure words, wavy underline on a failing sentence, flagged review value | `#A8193A` | `#FF8FA0` |
| `--bad-wash` | Liveness strip background, failing checklist row, sentence highlight | `#F5DCDC` | `#3A1A1F` |
| `--warn` | Paused tray state, "on this phone", manual check pending, new-name receipt warning | `#7A4A00` | `#E9B95C` |
| `--warn-wash` | Warn background | `#F3E4C2` | `#33270F` |
| (pass) | Pass state = `--ink` check glyph; no colour | | |

`--bad` and `--geru` have equal luminance (1.10:1): they must never be the only difference between two things. Every bad state carries an alert glyph, a word and (for sentences) a wavy underline.

### 2.5 Overlays and textures

| Token | Light | Dark | Use |
|---|---|---|---|
| `--scrim` | `rgb(31 26 20 / 0.45)` | `rgb(0 0 0 / 0.60)` | Behind the capture sheet only |
| `--hatch` | `repeating-linear-gradient(135deg, var(--rule-strong) 0 1px, transparent 1px 4px)` | same | Withheld chart region, Met zone on meters, paused progress |
| `--shadow-pop` | `0 6px 18px rgb(31 26 20 / 0.12)` | `0 6px 18px rgb(0 0 0 / 0.45)` | Tooltip/popover only |
| `--shadow-sheet` | `0 -12px 24px rgb(31 26 20 / 0.10)` | `0 -12px 24px rgb(0 0 0 / 0.40)` | Capture sheet only |

### 2.6 Status shapes (ink only, 12 px, `viewBox 0 0 12 12`)

| Status | Shape | SVG |
|---|---|---|
| Met (the view is wrong) | Filled circle | `<circle cx="6" cy="6" r="5" fill="currentColor"/>` |
| Watching | Ring, right half filled | `<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor"/>` |
| Not met | Open ring | `<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/>` |
| No data | Dashed ring | `<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>` |

Always followed by the word. Summary order everywhere: Met, Watching, Not met, No data. A legend sentence states that "Met" means the view is wrong.

### 2.7 Chart series (ink / grey / threshold, nothing else)

| Mark | Stroke | Notes |
|---|---|---|
| Subject (the company) | `--ink`, 2 px, solid, round joins | Points 2.6 px radius ink; last real point labelled with its value, 600 |
| Projection / annualised / partial period | `--ink`, 2 px, dash `3 3`; last point hollow (paper fill, ink 1.5 px stroke) | Named in the key and footer ("Dashed: Q1 FY27 annualised") |
| Benchmark / peer / index | `--bench`, 1.5 px, solid **(R)** | Solid so the dash vocabulary stays with projection and threshold |
| Threshold (a kill-criterion line) | `--neel`, 1.5 px, dash `5 4` | Always direct-labelled in neel, 500: "Test 1 line: 100 days" |
| Data cap | `--ink`, 1 px vertical | Label "Data to 30 Jun 2026", caption 600 ink |
| Withheld (inside the 30-day lag) | `--hatch` fill, no data drawn | Label "withheld", caption muted |
| Gridlines | `--rule`, 1 px, 3 to 4 lines max | No vertical gridlines |
| Axis text | `--ink-muted`, caption size, tabular | Units in the axis title, not on each tick |
| Bars | `--ink` fill; comparison bars `--bench` | No stacked colour bars |

`--geru` never appears inside a chart. Charts never use red/green for up/down. More than three series means small multiples, not more colours.

### 2.8 Contrast ratios (every pair used)

AA body text needs 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) and non-text UI need 3:1.

| Foreground on background | Use | Light | Dark | Verdict |
|---|---|---|---|---|
| `--ink-body` on `--paper` | Reading text | 13.58 | 12.73 | AAA |
| `--ink` on `--paper` | Headings, figures | 15.48 | 15.48 | AAA |
| `--ink-muted` on `--paper` | Meta, labels | 6.16 | 7.04 | AA |
| `--ink-body` on `--surface` | Strip details, cards | 12.31 | 11.75 | AAA |
| `--ink` on `--surface` | Card figures | 14.03 | 14.28 | AAA |
| `--ink-muted` on `--surface` | Strip line | 5.58 | 6.50 | AA |
| `--ink` on `--surface-2` | Active row, diff insertion | 12.67 | 12.97 | AAA |
| `--ink-body` on `--surface-2` | Diff insertion body | 11.12 | 10.67 | AAA |
| `--ink-muted` on `--surface-2` | Count in active row | 5.04 | 5.90 | AA |
| `--geru` on `--paper` | Links, IDs | 5.99 | 7.61 | AA |
| `--geru` on `--surface` | Links in strip/cards | 5.43 | 7.02 | AA |
| `--geru` on `--surface-2` | Link in active row | 4.90 | 6.38 | AA |
| `--geru` on `--geru-wash` | Open chip | 5.12 | 6.12 | AA |
| `--ink` on `--geru-wash` | Selected text | 13.23 | 12.44 | AAA |
| `--ink-muted` on `--geru-wash` | Muted text in selection | 5.26 | 5.66 | AA |
| `--on-geru` on `--geru` | File tag, VIEW label | 6.68 | 7.77 | AA |
| `--paper` on `--ink` | Primary button, inverse labels | 15.48 | 15.48 | AAA |
| `--neel` on `--paper` | Threshold label text | 7.70 | 8.14 | AAA |
| `--neel` on `--surface` | Threshold in a card | 6.98 | 7.52 | AA |
| `--bench` on `--paper` | Benchmark line, input border (non-text) | 3.44 | 4.47 | 3:1 pass |
| `--bench` on `--surface` | Benchmark in a card (non-text) | 3.12 | 4.12 | 3:1 pass |
| `--geru` on `--paper` as focus ring (non-text) | Focus | 5.99 | 7.61 | 3:1 pass |
| `--bad` on `--paper` | Gate words, liveness words | 6.57 | 8.47 | AA |
| `--bad` on `--bad-wash` | Liveness strip | 5.64 | 7.19 | AA |
| `--ink` on `--bad-wash` | Liveness strip body | 13.28 | 13.14 | AAA |
| `--warn` on `--paper` | Paused, on this phone | 6.70 | 10.11 | AA |
| `--warn` on `--warn-wash` | Warn row | 5.94 | 8.04 | AA |
| `--ink` on `--warn-wash` | Warn row body | 13.72 | 12.31 | AAA |
| `--rule-strong` on `--paper` | Decorative hairline only | 1.73 | 1.86 | Not for meaning |
| `--rule` on `--paper` | Decorative hairline only | 1.29 | 1.27 | Not for meaning |
| `--geru` against `--ink` | Link next to ink text | 2.59 | 2.03 | Below 3: links must be underlined |
| `--neel` against `--ink` | Threshold next to subject | 2.01 | 1.90 | Below 3: threshold must be dashed + labelled |
| `--bad` against `--geru` | Never adjacent as the only cue | 1.10 | 1.11 | Shape + word required |

Heatmap label pairs are in 2.3. Input borders use `--input-line` (`--bench`, 3.44 / 4.47) **(R)**, not `--rule-strong` (1.73), to meet WCAG 1.4.11.

---

## 3. Typography

### 3.1 Families and files

| Role | Family | Weights shipped | Use |
|---|---|---|---|
| Sans | IBM Plex Sans | 400, 500, 600 (no italics) | All reading, UI and data |
| Mono | IBM Plex Mono | 400, 500 | Identifiers only: File 03, Ex. 03.1, T1, S1, p. 112, R2, block labels, `$SYM`, `#theme`, `t:` grammar keys, keyboard hints |

No italics anywhere (not shipped, never synthesised: `font-synthesis: none`). Quoted filing lines are sans inside curly quotes. Devanagari (`IBM Plex Sans Devanagari`) is **not shipped in v1** **(R)**; the optional "अक्ष अग्रवाल" wordmark line waits until a page needs Devanagari text.

### 3.2 Type scale

Phone values apply below 960 px; desktop values from 960 px (`desk` breakpoint). Line-height is unitless. Letter-spacing in em.

| Style | Token | Family | Phone size / LH | Desktop size / LH | Weight | Tracking | Figures | Used for |
|---|---|---|---|---|---|---|---|---|
| Display | `display` | Sans | 30 / 1.12 | 40 / 1.12 | 600 | -0.015 | lining, proportional | File title (h1), "Case files" home h1. The LCP element. |
| Title | `title` | Sans | 22 / 1.2 | 24 / 1.2 | 600 | -0.005 | lining, proportional | Block headings (h2): "Aksh's view", "I would be wrong if", "What changed", "Files" |
| Subtitle | `subtitle` | Sans | 17 / 1.3 | 18 / 1.3 | 600 | 0 | lining, proportional | Exhibit titles, card headings (h3), flagged-value heading |
| Reading | `read` | Sans | 18 / 1.62 | 19.5 / 1.62 | 400 | 0 | lining, **proportional** | VIEW prose, standfirst/description, learning objective, test conditions, revision reasons, diff sentences, learning-note body **(R: size, see 17)** |
| Body | `body` | Sans | 16 / 1.5 | 16 / 1.5 | 400 | 0 | lining, tabular | UI body: What-changed entries, card text, list rows, form inputs (16 px minimum on inputs, stops iOS zoom) |
| Data | `data` | Sans | 14.5 / 1.45 | 15 / 1.45 | 400 (600 for the current period) | 0 | lining, **tabular** | Tables, ledger, register, fact rows, meter values |
| Small | `small` | Sans | 13 / 1.45 | 13.5 / 1.45 | 400 | 0 | lining, tabular | Strip line, block sub-lines, meta, dateline values, rail items |
| Caption | `caption` | Sans | 12 / 1.4 | 12 / 1.4 | 400 | 0 | lining, tabular | Exhibit footer, chart axes and labels, source line in cards, key row |
| Label | `label` | Sans | 11 / 1.3 | 11 / 1.3 | 600 | +0.07, UPPERCASE | lining, tabular | Table headers, dateline/teach keys, tray headings, stat-tile keys |
| Figure large | `figure-lg` | Sans | 30 / 1.1 | 34 / 1.1 | 600 | -0.02 | lining, **proportional** | Home stat tiles |
| Figure medium | `figure-md` | Sans | 20 / 1.2 | 22 / 1.2 | 500 | 0 | lining, tabular | Source-fact card figure, review "desk read / totals need" values |
| Mono ID | `mono-id` | Mono | 12.5 / 1.4 (inline: 0.86 em) | 13 / 1.4 | 400 | 0 | tabular | File numbers, exhibit numbers, source IDs, page refs, revision IDs, symbols |
| Mono label | `mono-label` | Mono | 11 / 1 | 11 / 1 | 500 | +0.06, UPPERCASE | tabular | Block labels VIEW / TESTS / FACTS / HISTORY / SOURCES, state words in private trays |
| Mono tag | `mono-tag` | Mono | 12 / 1.4 | 12 / 1.4 | 500 | +0.02 | tabular | File tag "FILE 03 · R2", grammar key-row buttons (14 px there) |

Floor: nothing below 11 px. Body text never below 16 px on phone; reading text never below 18 px.

### 3.3 Measure

- Reading prose `max-width: 34em` at the reading size = about 663 px at 19.5 px, 60 to 72 characters a line on desktop. Use `em`, not `ch` (Plex zero is wider than the average glyph, so `ch` overshoots).
- Phone: the column (343 px at 375) sets the measure, about 38 to 42 characters at 18 px. Do not shrink type to gain characters.
- Data blocks (tables, exhibits) use the reading column width (660 px); only the register and ledger may use the wide container (880 px).
- Strip details, disclosure text and empty-state text: `max-width: 72ch` at small size.

### 3.4 Figures: tabular vs proportional

- Root default: `font-variant-numeric: lining-nums tabular-nums` (a data-first site).
- **Proportional** (`lining-nums proportional-nums`): reading prose (`read`), display and title text, `figure-lg` stat tiles. A ₹1,284 cr inside a sentence should not look like a ledger.
- **Tabular**: every column of numbers, every date in a table or list, counts in tabs/rail, meter values, axis ticks, IDs, timers.
- Units live in their own column (left-aligned, caption, muted) so digits share one right edge. Numbers right-align; text left-aligns.
- Format: `Intl.NumberFormat('en-IN')`; currency "₹1,284 cr"; percent "61%"; negatives with U+2212 minus "−4.2%"; dates "2 Sep 2026" (no comma, no weekday on public pages); fiscal "FY26", "Q1 FY27"; ranges with an en dash "96–142".
- The as-of date is stated once per period column or block, not per cell.

### 3.5 Font loading

- Self-host with `next/font/local` from the OFL release (npm `@ibm/plex-sans` and `@ibm/plex-mono`, or the github.com/IBM/plex release), subset to woff2 with `pyftsubset`: U+0020-007E, U+00A0-00FF, U+2009, U+200B, U+2010-2015, U+2018-201F, U+2022, U+2026, U+2032-2033, U+202F, U+20B9 (₹), U+2190-2193, U+2212, U+2248, U+2264-2265, U+25A0-25A1. Verify ₹ renders from the subset in the 375 px smoke test.
- CSS variables `--font-plex-sans`, `--font-plex-mono`. `display: "swap"`, `adjustFontFallback: "Arial"` for the sans (metric-matched fallback keeps CLS at 0).
- Preload only Sans 400 and 600. Mono and Sans 500 load without preload. Budget: total font payload ≤ 110 kB woff2, preloaded ≤ 50 kB.
- Replace the scaffold's Geist imports in `src/app/layout.tsx`.

---

## 4. Spacing

4 px base (Tailwind v4 default `--spacing: 0.25rem`, so `p-1` = 4 px, `p-1.5` = 6 px, `p-2.5` = 10 px). Allowed steps: **2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80** px. 14, 18, 22, 28 are not in the scale.

| Semantic token (`:root`) | Phone | Desktop | Use |
|---|---|---|---|
| `--gutter` | 16 px | 32 px | Page side padding (24 px from 768 to 959) |
| `--section-gap` | 48 px | 56 px | Between labelled blocks (VIEW, TESTS, FACTS, HISTORY) |
| `--block-gap` | 32 px | 32 px | Between sub-blocks: exhibit to exhibit, register to What changed |
| `--stack` | 16 px | 16 px | Heading to content, paragraph rhythm inside cards |
| `--row-y` | 10 px | 10 px | Table/list row vertical padding (register, tests, What changed) |
| `--cell-x` | 8 px | 10 px | Table cell horizontal padding |
| `--para` | 1em | 1em | Paragraph spacing in prose (relative to reading size) |
| `--top-bar-h` | 52 px | 56 px | Top bar |
| `--index-h` | 44 px + 2 px hairline | n/a | Phone section index |
| `--tab-bar-h` | 56 px + `env(safe-area-inset-bottom)` | n/a | Phone tab bar |

---

## 5. Radii

The 3 px system. Everything that has a corner uses 3 px.

| Token | Value | Use |
|---|---|---|
| `--radius` | 3px | Buttons, inputs, chips, cards, strip details, tooltips, the capture sheet's top corners, segmented controls, tray counts, block labels |
| `--radius-none` | 0 | Tables, rules, exhibit frames, stat tiles, the register |
| `--radius-full` | 9999px | Status shapes and meter dots only (they are circles, not "pills") |
| File-tag notch | `clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)` | The FILE tag and the share-card panel (46 px notch there) |

No pill buttons, no pill counts, no 8 to 12 px card radii (the segment-4 comparison's 10 to 12 px radii and pill FAB become 3 px).

---

## 6. Rules and hairlines

| Rule | Spec | Where |
|---|---|---|
| Hairline | 1 px `--rule` | Row separators, block-heading underline, dateline top/bottom, strip bottom, top bar bottom, rail right edge |
| Strong hairline | 1 px `--rule-strong` | Table header underline, chip and input borders on surface (inputs use `--input-line`) |
| Exhibit rule | 2 px `--geru`, top only | Top of every exhibit frame (the mark) |
| VIEW rule | 2 px `--ink`, left, one continuous rule for the whole block | VIEW block (padding-left 16 px desktop, 12 px phone) |
| Ledger double rule | 3 px `double` `--ink` | Under ledger/scenario column headers and the phone sticky key row; above totals |
| Diff insertion | 2 px solid `--ink` left + `--ins` background | Added sentences |
| Diff deletion | 2 px dashed `--rule-strong` left, `--ink-muted` text, no strike-through | Removed sentences |
| Empty state | 1 px dashed `--rule-strong`, radius 3 | Empty blocks |
| Disclosure | Top 2 px `--ink` + `--surface` box | Full disclosure block at file end |
| Progress hairline | 1 px `--rule-strong` track at bottom of phone index, fill `--ink` | Reading progress |

No double rule under the top bar or masthead **(R)** (the segment-5 recommendation mentioned A's double-rule masthead; decisions.md says no ornament in chrome, so the chrome has 1 px hairlines only).

---

## 7. Elevation

Flat. Separation comes from hairlines and the surface step, not shadows.

| Level | Treatment | Use |
|---|---|---|
| 0 | none | Everything by default, including cards, trays, exhibits, stat tiles |
| 1 | `--surface` background + 1 px `--rule-strong` border + `--shadow-pop` | Chart tooltip/readout, popover menus |
| 2 | `--paper` + `--shadow-sheet` + `--scrim` | Capture sheet (private) only |

Raised surfaces in dark mode are lighter (`--surface` > `--paper`), never shadow-only.

---

## 8. Layout grid

### 8.1 Breakpoints

| Name | Min width | Layout |
|---|---|---|
| base | 320 (designed at 375) | One column, top bar + sticky section index (file pages) + bottom tab bar, `--gutter` 16 |
| `md` | 768 | Same phone chrome, `--gutter` 24, reading column centred at 660 max **(R)** |
| `desk` | 960 | Rail + reading column; tab bar and phone index hidden; site disclosure moves to the top strip |
| `xl` | 1280 | Same as desk; page centred at 1200 max |

The 760 px container switch in the B+ comparison becomes 960 because the rail (208) plus the 660 column plus gutters needs 932 px **(R)**.

### 8.2 Desktop (≥ 960)

```
| rail 208 | 1px rule | 32 | reading column ≤ 660 (wide blocks ≤ 880) | 32 |
```
- Page max width 1200, centred; the rail is sticky (`top: var(--top-bar-h)`), scrolls internally if taller than the viewport.
- Rail: site sections (Desk, Files 7, Learning notes 3, Process 2, Mistakes 0, About and disclosures); on a file it opens into that file's sections (View 3, Tests 3, Facts 8, Sources 3, History R2, Disclosure) with a 2 px geru inset left bar on the current one; the streak summary sits at the foot.
- File pages: the compliance strip sits at the top of the main column under the top bar.
- Home: site strip spans the top above the top bar (desktop site disclosure is at the top).

### 8.3 Phone (< 960, designed at 375)

- 375 = 16 + 343 + 16. No horizontal page scroll, ever: tables reflow to two-line rows or the sticky key-row pattern.
- File page stack: top bar (52, sticky) → compliance strip (in flow, scrolls away) → section index (44 + hairline, sticky under the top bar) → content → tab bar (56 + safe area, sticky bottom; hides while scrolling down a file). At most three bars visible.
- Home: top bar → content → site disclosure line at the bottom of the page → tab bar.
- Tab bar: Desk, Files 7, Notes 3, About. Active = ink 600 label + geru icon stroke.

### 8.4 Private `/desk`

Same breakpoints. Top bar shows "Desk" + a mono "private" marker; tabs Capture, Inbox, Items, Names. Desktop has no rail; it uses two columns (Needs you | Today) at ≥ 960, and the editor puts the publish checklist in a 330 px sticky left column.

---

## 9. Z-layers

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | Content |
| `--z-sticky-key` | 10 | Ledger sticky key row, sticky table headers |
| `--z-index` | 20 | Phone section index |
| `--z-strip` | 25 | Compliance strip and its open drawer, liveness/offline strips |
| `--z-top-bar` | 30 | Top bar |
| `--z-rail` | 30 | Desktop rail |
| `--z-tab-bar` | 40 | Phone tab bar, publish bar (private) |
| `--z-fab` | 45 | Capture button (private, phone) |
| `--z-scrim` | 50 | Sheet scrim |
| `--z-sheet` | 60 | Capture sheet |
| `--z-popover` | 70 | Tooltip, chart readout, popover |
| `--z-toast` | 80 | Toast ("Saved on this phone. It will sync.") |
| `--z-skip` | 90 | Skip link when focused |

Use as `z-(--z-sheet)` in Tailwind v4. Never write a raw z-index number in a component.

---

## 10. Motion

System: **Instrument** (snap, tick, roll), plus Paper's register-row-to-file-title morph and Terminal's chart draw-to-cap and scroll-linked hairline.

### 10.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms | Press, hover, focus, closes, reduced-motion fade |
| `--motion-base` | 180ms | Strip open, tab bar hide/show, status tick |
| `--motion-slow` | 220ms | Source card open, index indicator, sort FLIP, chart wipe/draw, row-to-title morph, sheet open |
| `--ease-snap` | `cubic-bezier(0.2, 0, 0, 1)` | Every entering/moving animation |
| `--ease-snap-in` | `cubic-bezier(0.3, 0, 1, 1)` | Closing/exiting |
| `--ease-tick` | `steps(4, end)` | Status glyph tick-in |
| `--press-scale` | 0.97 | `:active` on buttons, chips, rows that navigate |
| `--stagger-micro` | 25ms | Skeleton-to-content blocks |
| `--stagger-row` | 60ms | Status ticks down a table (max total 500 ms) |

No overshoot, no springs, nothing longer than 300 ms, no stagger longer than 500 ms in total. Closes and exits use `--motion-fast` (120 ms) with `--ease-snap-in`. `ink-in` runs only on the client when data replaces a skeleton (never on server HTML).

### 10.2 Moments

| Moment | Spec | Library |
|---|---|---|
| Hover | Background/border colour, 120 ms ease-snap | CSS |
| Press | `scale(0.97)` 120 ms; not on disabled | CSS |
| Focus ring | `outline-offset` 5 px → 2 px, 120 ms | CSS |
| Compliance strip | Drawer: `clip-path` from top + 8 px slide, open 180 ms ease-snap, close 120 ms ease-snap-in | Motion (`m`, LazyMotion) |
| Source chip → card | Card grows out of the chip box (clip from the chip's rect) and slides down, open 220 ms, close 120 ms | Motion |
| Section index / rail / segmented indicator | One indicator translates and scales between items, 220 ms | Motion `layoutId` |
| Sort / search reorder | FLIP, rows slide 220 ms; digits never change during the move | Motion `layout` |
| Counts (tabs, rail, register count, test summary counts, tray counts) | Digit roll 220 ms **only when the value changes on the client** (filter, search, new capture); server HTML always shows the final value **(R)** | NumberFlow |
| Status tick-in | Glyph clips in with `steps(4)`, 180 ms, 60 ms apart, when the block first enters view; the word is static | CSS keyframes + IntersectionObserver |
| Chart draw-to-cap | Subject line draws to the data cap, 220 ms linear, via `pathLength=1` + `stroke-dashoffset`; then the cap label ticks in 120 ms `steps(4)` **(R: durations)** | CSS (or Recharts `isAnimationActive="auto"`) |
| Register row → file title | Shared element: company name morphs into the h1 position, 220 ms ease-snap **(R: 220 not Paper's 300)**; rest of the page cross-fades 120 ms; back reverses | React `<ViewTransition>` |
| Reading progress hairline | Tracks scroll directly, `animation-timeline: scroll()` in `@supports`, JS (IntersectionObserver/`useScroll`) fallback | CSS |
| Tab bar hide on a file | `translateY(100%)` on scroll down, back on scroll up, 180 ms | Motion `useScroll` |
| Skeleton → content | Static skeleton (the loaded layout with ink removed); ink snaps in per block 120 ms `steps(2)`, 25 ms apart, max 300 ms | CSS |
| Capture sheet | Slides up 220 ms ease-snap, scrim fades 120 ms; close 120 ms | Motion `AnimatePresence` |
| Toast | 8 px rise + fade 180 ms; auto-dismiss 4 s; never steals focus | CSS |

### 10.3 Never animates

- The h1 / LCP element, ever. Nothing is `opacity: 0` in server HTML.
- Reading content: VIEW prose, test conditions, diff text, disclosure text, strip text. No fade-ins, no reveals, no blur.
- **Financial figures**: no count-ups, no digit rolls, no tweening of any ₹, %, days, ratio or price value (tables, cards, stat-figure values that are financial, chart labels).
- As-of dates, source lines, withheld markers.
- Anything already in the viewport at hydration (it renders final; only below-fold effects arm on the client).
- No parallax, no auto-typing, no loops, no pulses, no scroll-jacking (no GSAP, no Lenis).
- Animate only `transform`, `opacity`, `clip-path`, `stroke-dashoffset`, colours. Never width, height, top, left, margin.

### 10.4 Reduced motion

- `<MotionConfig reducedMotion="user">` at the client root; CSS `@media (prefers-reduced-motion: reduce)` rule; `::view-transition-*` rule.
- Under reduced motion: screen changes, source cards, the strip, the sheet and arriving content use one 120 ms opacity fade; everything else is instant (press has no scale, indicator jumps, reorder is instant, chart is drawn at once, counts show the final value).
- The scroll-linked progress hairline stays (the reader moves it).
- A watchdog completes any stalled animation (hidden tab) so a value never rests at an intermediate state.

---

## 11. Iconography and the mark

- **The mark is the numbering.** File numbers (`File 03`, two digits, never reused even if a file is retracted), exhibit numbers (`Ex. 03.1` = file 03, exhibit 1), test IDs (`T1`), source IDs (`S1`), revisions (`R2`). Set in Plex Mono, geru, wherever they act as identifiers (register No. column, exhibit header, file tag, rail sub-item prefix). In tables of tests the `T1` is muted mono (it labels a row, the row is not a link).
- **File tag:** notched geru tag, mono-tag text "FILE 03 · R2", `--on-geru`, padding 2 px 10 px 2 px 8 px, above the file h1.
- **AA tag mark** (favicon, share card): a 32-unit square with the top-right corner cut (path `M2 2H23L30 9V30H2Z`), geru fill, "AA" in Plex Sans 700 outlined to paths, `--on-geru`. The 16 px favicon is its own drawing: `M1 1H11L15 5V15H1Z` with a single "A".
- **No icon grids, no feature icons, no decorative glyphs.** Icons appear only as utility affordances: search, back, chevron (strip Details), close, plus (Capture), tab-bar glyphs, alert/offline/check/pause in private strips and trays.
- Utility icons: lucide-react at 18 to 20 px, `strokeWidth={1.5}`, `currentColor`, always with a visible text label (except the search and back buttons, which carry `aria-label`). Status glyphs are the custom shapes in 2.6, not lucide.
- No emoji, no logos of third parties, no rupee-sign logo, no saffron/tricolour, no maps, no paisley or mandala ornament.

---

## 12. Imagery

- No photography, illustration, stock or AI imagery anywhere in the chrome or files.
- Allowed: **cited crops of primary documents** (an annual-report line, a filing header), always with source ID, document, page and filing date beneath in caption style, `alt` text that transcribes the cropped text. Served via `next/image` with explicit width/height, AVIF/WebP, lazy below the fold. Crops shown publicly are linted under rule 8 (text extracted from public images).
- One real, dated, monochrome portrait on About only ("Photographed {month year}").
- Share card: one fixed design per file (section 15), no pictures.

---

## 13. Micro-copy

### 13.1 Voice rules

- **Public chrome is third person about Aksh** ("Aksh holds no position", "Three tests Aksh set himself"). **Aksh's own words are first person** and appear only inside VIEW, test conditions ("…receivable days fall below 100…" under "I would be wrong if"), revision reasons, learning-note bodies and process notes.
- **Private `/desk` chrome speaks to Aksh in the second person** ("Your notes are safe").
- Sentence case everywhere; labels in uppercase only through the `label`/`mono-label` styles (source text stays sentence case). No exclamation marks. No "you should". No hype words. Numbers are digits ("3 tests" in counts, "Three tests" at the start of a sentence).
- Every empty state says what will appear, what it holds and why it is empty, and shows the column shape.
- Dates: "2 Sep 2026"; "Figures to 30 Jun 2026" (never "as of" in chrome; "as of" only inside source cards).

### 13.2 Verbatim strings (rendered, not typed)

| Place | Text |
|---|---|
| Wordmark | **Aksh Agrawal** (600, ink) · Case files (muted) |
| Home eyebrow | Case files 01 to {NN} · Indian listed companies |
| Home h1 / standfirst | Case files / Each file says what Aksh expected, what would prove him wrong, and every revision since. For learning, not advice. |
| Site strip (desktop top; phone bottom line) | **For learning** · Aksh is not SEBI-registered · Figures 30+ days old · Details |
| Site strip details **(R)** | Case studies Aksh writes to learn how businesses work. Nothing here is advice, and he is not SEBI-registered. Every figure is at least 30 days old. |
| Phone site disclosure line | **For learning** · Aksh is not SEBI-registered · Figures 30+ days old. Disclosures (link) |
| File strip | **For learning** · {position} · Figures to {data_as_of} · Details |
| {position} from `holds_position` **(R)** | yes: "Aksh holds a position" · no: "Aksh holds no position" · not_disclosed: "Position not disclosed" |
| File strip details | A case study Aksh wrote to learn how this business works. It is not advice, and he is not SEBI-registered. Every figure is at least 30 days old. |
| Disclosure block heading | Read this first **(R: name collides with "Read first", see 17)** |
| Disclosure block text | The standard disclosure in `docs/compliance/publishing-rules.md`, verbatim, with `{holds_position}` → Yes / No / Not disclosed and `{reviewed_date}`. Excluded from the rule-1 scan. |
| Learning objective key | What this teaches |
| Dateline keys | This version (R2 of 2) · Revised · First written · Figures to |
| Read first line | Read first: {note title} · {n} min |
| VIEW block | Label VIEW · heading "Aksh's view" · sub "His own words. Each figure opens the line it came from." |
| TESTS block | Label TESTS · heading "I would be wrong if" · sub "{Count} tests Aksh set himself. "Met" means his view is wrong." |
| FACTS block | Label FACTS · heading "Source facts" · sub "Taken from filings. Each row names its source and date." **(R)** |
| HISTORY block | Label HISTORY · heading "Revisions" · reason first, then "Removed" / "Added", switch "R2 · R1" |
| What changed | Heading "What changed" + "last 5 entries" · sub "Reason first, then what moved." |
| Register | Heading "Files {n}" · sub "Sorted by last revision. Every company link opens its file." · columns No. · Company · Sector · Version · Revised · Tests · Figures to |
| Stat tiles | FILES {n} companies / {k} sectors · last {d} · TESTS {n} + unit squares · REVISIONS {n} / each with its reason · LOGGED {n} of 30 days + streak |
| Rail foot | {n} of the last 30 days research logged; counts only. Last entry {date} |
| Mistakes empty | Nothing here yet. When one of Aksh's tests proves him wrong, that file and the date are listed here first, next to what he wrote before. Shape: File and test · Date · Original text |
| Withheld value | [withheld until DD Mon YYYY] |
| Chart withheld region | withheld |
| Data cap label | Data to {date} |
| Liveness strip (private) | **Background jobs are late.** The 15-minute check last ran at {hh:mm}, {duration} ago. Your notes are safe; documents wait until it runs. Shlok has been emailed. |
| Offline strip | **Offline.** {n} notes are saved on this phone and will sync when you are back online. Nothing is lost. |
| Capture placeholder | Phone sheet: "What did you just notice?" · Desktop bar: "Capture a thought   ($company  #theme  t:  l:  p:)" · hint "Enter saves" |
| Receipt | "Will go to" + chips; empty: "Will go to: Today, as a private note"; unknown symbol: "$SYM → New names"; thesis without company: "A thesis belongs to one company. Add $SYMBOL, or this saves as a private note." |
| Save toasts | "Saved {hh:mm} · {company or private note}" · offline: "Saved on this phone. It will sync." |
| Inbox trays | Ready for you · Needs attention · Being read · Paused, nothing lost · Waiting to start |
| Gate note, rule 1 | Rule 1, no actionable language: "{match}" about a named company. Rewrite it as a scenario range, or remove it. |
| Gate note, rule 1 allowable | Rule 1 matched "{match}". If the sentence explains your process rather than a view on the stock, you can allow this one sentence, with a reason. |
| Gate note, rule 3 | Rule 3, 30-day lag: this price is dated {date}. Public figures must be dated on or before {date − 30}. Rule 3 has no allowance. |
| Allowance form | "Reason, saved with the gate decision (required)" · button "Allow this sentence" · "Covers this exact sentence only; editing it runs the check again. Rules 3, 4 and 9 can never be allowed." · error "Add a reason first." |
| Rule 4 hand check | I have not changed my stance on {company} in my private notes in the last 30 days. |
| Checklist head | Publish checklist · {passed} of {total} |
| Review | "The desk read" vs "The totals need" (or "The totals agree with") |
| New names | Like a screener: say who each one is. Your notes were saved either way. |
| Share card footer | Revised {date} · figures to {date} · For learning, not advice |

---

## 14. Accessibility

- **Contrast:** every text pair in 2.8 passes AA in both themes; non-text UI ≥ 3:1. Test both themes separately.
- **Focus ring:** `outline: 2px solid var(--geru); outline-offset: 2px;` on `:focus-visible` for every focusable element, following the element's radius. Never removed, never replaced by a box-shadow ring (replace shadcn's `ring-3 ring-ring/50` classes). On geru-filled elements the ring sits outside on paper, so it stays visible.
- **Hit targets:** every control ≥ 44 × 44 px on coarse pointers (`@media (pointer: coarse)`), ≥ 32 px visual height on fine pointers with ≥ 24 px target. Source chips and inline links extend their hit area with an `::after { inset: -8px -3px }`. Adjacent targets ≥ 8 px apart.
- **Semantics:** skip link to `#main`; one h1 per page; h2 per labelled block; section index is `role="tablist"` only if it switches panels, otherwise a `nav` of in-page links with `aria-current="true"` (the decided behaviour scrolls, so: `nav` + links). Tables are real `<table>`s with `scope`; phone reflow keeps the table semantics (CSS grid on rows, `thead` visually hidden).
- **Charts:** `role="img"` + an `aria-label` that states the finding ("Receivable days rose from 81 in FY22 to 142 in FY26…"); every chart has its Table tab; hover readout is also reachable by focus + arrow keys.
- **Status:** shape + word; summaries carry an `aria-label` ("1 met, 1 watching, 1 not met, 0 no data").
- **Live regions:** capture receipt `aria-live="polite"`; liveness strip `role="alert"`; offline `role="status"`; toasts polite and non-focus-stealing.
- **Forms (private):** visible labels, 16 px inputs, errors under the field with `role="alert"`, focus moves to the first failing sentence on gate failure. Keyboard-complete: `c` opens capture, `/` focuses capture on desktop, `1`/`2` resolve a flagged value, Esc closes the sheet.
- **Zoom:** never disable; layouts hold at 200% text zoom without horizontal scroll.
- **Reduced motion:** section 10.4.

---

## 15. Favicon and share card

- **Favicon:** `src/app/icon.svg` with outlined paths and an embedded `@media (prefers-color-scheme: dark)` rule (light: tag `#A13A22`, letter `#FFFFFF`; dark: tag `#E8907A`, letter `#1B0F0B`), plus a 32 px PNG fallback and a separate 16 px drawing (single "A"). Replace the scaffold `favicon.ico`.
- **Share card (1200 × 630, light theme fixed):** left panel 270 px geru with a 46 px notch, mono "FILE" (23 px), file number 150 px Plex Sans 600 tabular, mono "R2"; right panel padding 58 × 66: "Aksh Agrawal" 30 px 600 + "Case files" muted; title 78 px 600 / 1.04; learning objective 30 px / 1.38; footer 21 px muted above a `--rule-strong` hairline: "Revised {date} · figures to {date}" left, "For learning, not advice" right in ink. Its text is linted under rule 8. Rendered with `next/og`; verify `clip-path` support there, otherwise draw the notch as an absolutely positioned paper triangle.

---

## 16. Performance

- LCP < 2.0 s on 4G at 375 px; the LCP element (h1) is server-rendered text, never animated, never behind a client component.
- CLS = 0: reserved space for charts (`aspect-ratio`), numbers (tabular), images (width/height), skeletons that reuse the loaded layout, the strip drawer opened only by user input, fonts with metric-matched fallback.
- Fonts: section 3.5. No third-party font CSS.
- Pages are Server Components; motion lives in small `"use client"` leaves. Client motion budget: Motion `m` + LazyMotion + `domAnimation` (~20 kB), NumberFlow (~6 kB), loaded only where used. Charts: hand-drawn SVG first; Recharts only if a chart needs it, lazy-loaded below the fold.
- No GSAP, no Lenis, no Rive/Lottie.
- Tables never shift on sort or skeleton → content; search holds the register's height.

---

## 17. Decisions this file made (for ratification)

1. **Reading size 18 / 19.5 px** (brief's figure). The decided B+ comparison set Plex Sans prose at 16.5 / 17 px; 18 / 19.5 came from the serif hybrid H. Adopted as requested; the title scale was raised (22 / 24) so headings stay above body.
2. **Private signal colours:** crimson `--bad` (#A8193A / #FF8FA0) instead of the segment-4 red, so it is not geru; **no green** (pass = ink check); amber `--warn` kept.
3. **Neel heatmap ramp** (7 steps) for the private valuation panel, replacing the segment-3 placeholder blue ramp.
4. **Input borders use `--bench`** (3.44:1), not `--rule-strong` (1.73:1), for WCAG 1.4.11.
5. **Benchmark series solid grey** (segment 3 drew it dashed); dashes are reserved for projection and threshold.
6. **Block labels:** VIEW = geru fill (the hand = Aksh's words); TESTS = ink outline; FACTS = dashed ink outline; HISTORY = dotted ink outline; SOURCES and other plain labels = `--rule-strong` outline, muted. (C filled every label geru; B+ distinguished fact vs view by outline style.)
7. **Counts roll only on client-side change**, never from 0 on first view (keeps server HTML final and true).
8. **Morph and draw durations:** register-row-to-title 220 ms (Paper used 300); chart draw 220 ms linear (Terminal used 280); status tick 180 ms (comparison used 160).
9. **Layout switch at 960 px** (not 760); 768–959 keeps phone chrome with a 24 px gutter.
10. **No double rule under the top bar** (chrome hairlines only).
11. **Site strip details text** written for the home (C reused the file text, which says "A case study").
12. **Strip position wording** for `holds_position` yes / not_disclosed.
13. **"Read this first"** (C's disclosure heading) sits on the same page as "Read first" (notes). Kept verbatim; suggest renaming the disclosure heading to "Disclosure" if the collision bothers Shlok.
14. **FACTS block heading/sub** copy ("Source facts" / "Taken from filings…") written here; the comparisons did not fix it under C.
15. **Capture token colouring under the identity:** `$company` geru on geru-wash; `#theme` ink on surface-2 (no teal, neel stays thresholds-only); `t: l: p:` keys inverse ink; URLs geru dotted underline; unknown company/theme adds a dashed underline.
16. **No Devanagari font in v1**; no theme toggle in v1 (follows the OS; `.light` / `.dark` classes on `<html>` override for testing).
17. **StubCompanyList** interpreted as the private "New names" screener (stub companies created by unknown `$SYM` captures).

**Ratified 2026-10-06 (controller):** items 2-12 and 14-17 as written. Two changes, which override the token values elsewhere in this file wherever they conflict:
- **Item 1 changed:** reading body is **17 px phone / 18 px desktop** (line-height 1.6), closer to the B+ page Shlok chose (16.5/17) than to the hybrid's 18/19.5. Title scale moves down one step to match (phone 21 / desktop 23). Implementers update the `@theme` block in section 18 accordingly in the first UI task.
- **Item 13 changed:** the disclosure heading is **"Disclosure"**, not "Read this first", so it no longer collides with the "Read first" notes on file pages.

---

## 18. Tailwind v4 `@theme` block (paste into `src/app/globals.css`)

Replaces the scaffold's token section (everything from `@custom-variant` to the end). Keeps the existing imports and shadcn variable names, so `src/components/ui/*` keeps working. Hex values match section 2 exactly.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* Dark follows the OS; .dark / .light on <html> override it. */
@custom-variant dark {
  &:where(.dark, .dark *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not(.light) *) { @slot; }
  }
}

@theme inline {
  /* fonts */
  --font-sans: var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
  --font-heading: var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif;

  /* desk colours */
  --color-paper: var(--paper);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-rule: var(--rule);
  --color-rule-strong: var(--rule-strong);
  --color-bench: var(--bench);
  --color-ink-muted: var(--ink-muted);
  --color-ink-body: var(--ink-body);
  --color-ink: var(--ink);
  --color-geru: var(--geru);
  --color-on-geru: var(--on-geru);
  --color-geru-wash: var(--geru-wash);
  --color-neel: var(--neel);
  --color-bad: var(--bad);
  --color-bad-wash: var(--bad-wash);
  --color-warn: var(--warn);
  --color-warn-wash: var(--warn-wash);
  --color-ins: var(--surface-2);
  --color-heat-0: var(--heat-0);
  --color-heat-1: var(--heat-1);
  --color-heat-2: var(--heat-2);
  --color-heat-3: var(--heat-3);
  --color-heat-4: var(--heat-4);
  --color-heat-5: var(--heat-5);
  --color-heat-6: var(--heat-6);

  /* shadcn contract (mapped onto desk tokens) */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  /* radii: the 3 px system (shadcn's scale collapses onto it) */
  --radius-xs: 2px;
  --radius-sm: 3px;
  --radius-md: 3px;
  --radius-lg: 3px;
  --radius-xl: 3px;
  --radius-2xl: 3px;
  --radius-3xl: 3px;
  --radius-4xl: 3px;
}

@theme {
  /* breakpoints */
  --breakpoint-md: 48rem;   /* 768 */
  --breakpoint-desk: 60rem; /* 960: rail layout */
  --breakpoint-xl: 80rem;   /* 1280 */

  /* containers */
  --container-read: 660px;
  --container-wide: 880px;
  --container-page: 1200px;

  /* type scale: phone values; desktop overrides via desk: variants (see 3.2) */
  --text-display: 1.875rem;            /* 30 */
  --text-display--line-height: 1.12;
  --text-display--letter-spacing: -0.015em;
  --text-display--font-weight: 600;
  --text-display-desk: 2.5rem;         /* 40 */
  --text-display-desk--line-height: 1.12;
  --text-display-desk--letter-spacing: -0.015em;
  --text-display-desk--font-weight: 600;

  --text-title: 1.375rem;              /* 22 */
  --text-title--line-height: 1.2;
  --text-title--letter-spacing: -0.005em;
  --text-title--font-weight: 600;
  --text-title-desk: 1.5rem;           /* 24 */
  --text-title-desk--line-height: 1.2;
  --text-title-desk--letter-spacing: -0.005em;
  --text-title-desk--font-weight: 600;

  --text-subtitle: 1.0625rem;          /* 17 */
  --text-subtitle--line-height: 1.3;
  --text-subtitle--font-weight: 600;
  --text-subtitle-desk: 1.125rem;      /* 18 */
  --text-subtitle-desk--line-height: 1.3;
  --text-subtitle-desk--font-weight: 600;

  --text-read: 1.125rem;               /* 18 */
  --text-read--line-height: 1.62;
  --text-read-desk: 1.21875rem;        /* 19.5 */
  --text-read-desk--line-height: 1.62;

  --text-body: 1rem;                   /* 16 */
  --text-body--line-height: 1.5;

  --text-data: 0.90625rem;             /* 14.5 */
  --text-data--line-height: 1.45;
  --text-data-desk: 0.9375rem;         /* 15 */
  --text-data-desk--line-height: 1.45;

  --text-small: 0.8125rem;             /* 13 */
  --text-small--line-height: 1.45;
  --text-small-desk: 0.84375rem;       /* 13.5 */
  --text-small-desk--line-height: 1.45;

  --text-caption: 0.75rem;             /* 12 */
  --text-caption--line-height: 1.4;

  --text-label: 0.6875rem;             /* 11 */
  --text-label--line-height: 1.3;
  --text-label--letter-spacing: 0.07em;
  --text-label--font-weight: 600;

  --text-figure-lg: 1.875rem;          /* 30 */
  --text-figure-lg--line-height: 1.1;
  --text-figure-lg--letter-spacing: -0.02em;
  --text-figure-lg--font-weight: 600;
  --text-figure-lg-desk: 2.125rem;     /* 34 */
  --text-figure-lg-desk--line-height: 1.1;
  --text-figure-lg-desk--letter-spacing: -0.02em;
  --text-figure-lg-desk--font-weight: 600;

  --text-figure-md: 1.25rem;           /* 20 */
  --text-figure-md--line-height: 1.2;
  --text-figure-md--font-weight: 500;
  --text-figure-md-desk: 1.375rem;     /* 22 */
  --text-figure-md-desk--line-height: 1.2;
  --text-figure-md-desk--font-weight: 500;

  --text-mono-id: 0.78125rem;          /* 12.5 */
  --text-mono-id--line-height: 1.4;
  --text-mono-label: 0.6875rem;        /* 11 */
  --text-mono-label--line-height: 1;
  --text-mono-label--letter-spacing: 0.06em;
  --text-mono-label--font-weight: 500;
  --text-mono-tag: 0.75rem;            /* 12 */
  --text-mono-tag--line-height: 1.4;
  --text-mono-tag--letter-spacing: 0.02em;
  --text-mono-tag--font-weight: 500;

  /* motion */
  --ease-snap: cubic-bezier(0.2, 0, 0, 1);
  --ease-snap-in: cubic-bezier(0.3, 0, 1, 1);
  --ease-tick: steps(4, end);

  --animate-tick-in: tick-in 180ms steps(4, end) both;
  --animate-ink-in: ink-in 120ms steps(2, end) both;
  --animate-draw: draw 220ms linear both;
  --animate-fade: fade 120ms linear both;

  @keyframes tick-in {
    from { clip-path: inset(0 100% 0 0); }
    to { clip-path: inset(0 0 0 0); }
  }
  @keyframes ink-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes draw {
    from { stroke-dashoffset: 1; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}

/* ---------- light (default) ---------- */
:root {
  --paper: #F7F2E8;
  --surface: #EEE7D8;
  --surface-2: #E5DCC9;
  --rule: #E0D6C4;
  --rule-strong: #C6B9A2;
  --bench: #8A8173;
  --ink-muted: #62594D;
  --ink-body: #2B251E;
  --ink: #1F1A14;
  --geru: #A13A22;
  --on-geru: #FFFFFF;
  --geru-wash: #F3DDD2;
  --neel: #34478F;
  --bad: #A8193A;
  --bad-wash: #F5DCDC;
  --warn: #7A4A00;
  --warn-wash: #F3E4C2;
  --heat-0: #E9ECF6; --heat-1: #CDD4EC; --heat-2: #A9B5DE; --heat-3: #7F8FCA;
  --heat-4: #5768B1; --heat-5: #34478F; --heat-6: #1F2B62;
  --scrim: rgb(31 26 20 / 0.45);
  --shadow-pop: 0 6px 18px rgb(31 26 20 / 0.12);
  --shadow-sheet: 0 -12px 24px rgb(31 26 20 / 0.10);
  --hatch: repeating-linear-gradient(135deg, var(--rule-strong) 0 1px, transparent 1px 4px);

  /* shadcn contract */
  --background: var(--paper);
  --foreground: var(--ink-body);
  --card: var(--paper);
  --card-foreground: var(--ink-body);
  --popover: var(--surface);
  --popover-foreground: var(--ink-body);
  --primary: var(--ink);
  --primary-foreground: var(--paper);
  --secondary: var(--surface);
  --secondary-foreground: var(--ink);
  --muted: var(--surface);
  --muted-foreground: var(--ink-muted);
  --accent: var(--surface-2);          /* shadcn "accent" = hover tint, NOT geru */
  --accent-foreground: var(--ink);
  --destructive: var(--bad);
  --border: var(--rule);
  --input: var(--bench);
  --ring: var(--geru);
  --chart-1: var(--ink);               /* subject */
  --chart-2: var(--bench);             /* benchmark */
  --chart-3: var(--neel);              /* threshold */
  --chart-4: var(--rule-strong);       /* withheld hatch, not a series */
  --chart-5: var(--ink-muted);         /* axes, not a series */
  --radius: 3px;
  --sidebar: var(--paper);
  --sidebar-foreground: var(--ink-body);
  --sidebar-primary: var(--ink);
  --sidebar-primary-foreground: var(--paper);
  --sidebar-accent: var(--surface-2);
  --sidebar-accent-foreground: var(--ink);
  --sidebar-border: var(--rule);
  --sidebar-ring: var(--geru);

  /* layout, motion, z (used as px-(--gutter), duration-(--motion-base), z-(--z-sheet)) */
  --gutter: 16px;
  --section-gap: 48px;
  --block-gap: 32px;
  --stack: 16px;
  --row-y: 10px;
  --cell-x: 8px;
  --top-bar-h: 52px;
  --index-h: 46px;
  --tab-bar-h: calc(56px + env(safe-area-inset-bottom));
  --rail-w: 208px;
  --measure: 34em;

  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 220ms;
  --press-scale: 0.97;
  --stagger-micro: 25ms;
  --stagger-row: 60ms;

  --z-base: 0; --z-sticky-key: 10; --z-index: 20; --z-strip: 25; --z-top-bar: 30; --z-rail: 30;
  --z-tab-bar: 40; --z-fab: 45; --z-scrim: 50; --z-sheet: 60; --z-popover: 70; --z-toast: 80; --z-skip: 90;

  color-scheme: light;
}

@media (min-width: 48rem) { :root { --gutter: 24px; } }
@media (min-width: 60rem) {
  :root { --gutter: 32px; --section-gap: 56px; --cell-x: 10px; --top-bar-h: 56px; --tab-bar-h: 0px; }
}

/* ---------- dark: class override and OS preference share one token set ---------- */
.dark {
  --paper: #17140F;
  --surface: #201C16;
  --surface-2: #29241D;
  --rule: #2E2920;
  --rule-strong: #4A4236;
  --bench: #857C6E;
  --ink-muted: #A99F90;
  --ink-body: #DED6C8;
  --ink: #F1EBE0;
  --geru: #E8907A;
  --on-geru: #1B0F0B;
  --geru-wash: #3A2219;
  --neel: #9AAAEA;
  --bad: #FF8FA0;
  --bad-wash: #3A1A1F;
  --warn: #E9B95C;
  --warn-wash: #33270F;
  --heat-0: #1B2033; --heat-1: #232B4D; --heat-2: #2F3B6B; --heat-3: #3F4F8F;
  --heat-4: #7486CC; --heat-5: #9AAAEA; --heat-6: #CBD4F7;
  --scrim: rgb(0 0 0 / 0.60);
  --shadow-pop: 0 6px 18px rgb(0 0 0 / 0.45);
  --shadow-sheet: 0 -12px 24px rgb(0 0 0 / 0.40);
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --paper: #17140F;
    --surface: #201C16;
    --surface-2: #29241D;
    --rule: #2E2920;
    --rule-strong: #4A4236;
    --bench: #857C6E;
    --ink-muted: #A99F90;
    --ink-body: #DED6C8;
    --ink: #F1EBE0;
    --geru: #E8907A;
    --on-geru: #1B0F0B;
    --geru-wash: #3A2219;
    --neel: #9AAAEA;
    --bad: #FF8FA0;
    --bad-wash: #3A1A1F;
    --warn: #E9B95C;
    --warn-wash: #33270F;
    --heat-0: #1B2033; --heat-1: #232B4D; --heat-2: #2F3B6B; --heat-3: #3F4F8F;
    --heat-4: #7486CC; --heat-5: #9AAAEA; --heat-6: #CBD4F7;
    --scrim: rgb(0 0 0 / 0.60);
    --shadow-pop: 0 6px 18px rgb(0 0 0 / 0.45);
    --shadow-sheet: 0 -12px 24px rgb(0 0 0 / 0.40);
    color-scheme: dark;
  }
}
/* shadcn contract vars reference desk tokens, so they need no dark block. */

@layer base {
  * { @apply border-border; }
  html {
    @apply font-sans;
    font-synthesis: none;
    -webkit-text-size-adjust: 100%;
    font-variant-numeric: lining-nums tabular-nums;
  }
  body {
    @apply bg-background text-foreground text-body;
    -webkit-font-smoothing: antialiased;
  }
  ::selection { background: var(--geru-wash); color: var(--ink); }
  :focus-visible {
    outline: 2px solid var(--geru);
    outline-offset: 2px;
    transition: outline-offset var(--motion-fast) var(--ease-snap);
  }
  a { color: var(--geru); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
  .prose-read { font-variant-numeric: lining-nums proportional-nums; max-width: var(--measure); }

  ::view-transition { pointer-events: none; }
  ::view-transition-group(*) { animation-duration: var(--motion-slow); animation-timing-function: var(--ease-snap); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
    ::view-transition-group(*),
    ::view-transition-old(*),
    ::view-transition-new(*) { animation: none !important; }
    /* the scroll-linked progress hairline is exempt: it uses .progress-hairline with animation-timeline */
  }
}
```

Notes for the paste:
- `desk:` utilities use the `--breakpoint-desk` above (`text-read desk:text-read-desk`). The `-desk` text tokens exist so each style is one class pair.
- Under reduced motion the global rule zeroes transitions; components that keep the 120 ms fade apply it with `motion-reduce:` utilities or Motion's `reducedMotion="user"` (which keeps opacity).
- The progress hairline must opt back in: `@media (prefers-reduced-motion: reduce) { .progress-hairline { animation-duration: auto !important; } }` (scroll timelines have no time duration).

### 18.1 `components.json` adjustments

```diff
-  "baseColor": "neutral",
+  "baseColor": "stone",
```
Cosmetic only (with `cssVariables: true` the CLI's base colour is overwritten by the tokens above; `stone` is the warm neutral nearest khadi, so components the CLI adds will not reintroduce cool greys). Keep `"style": "base-nova"`, `"iconLibrary": "lucide"`, `"rsc": true`, aliases unchanged. After each `shadcn add`, strip shadcn's `ring-3 ring-ring/50` focus classes and `rounded-lg/xl` assumptions are already collapsed to 3 px by the theme.

`src/app/layout.tsx`: replace Geist with `next/font/local` Plex files exposing `--font-plex-sans` and `--font-plex-mono`; set `lang="en-IN"`; title template "{page} · Aksh Agrawal".
