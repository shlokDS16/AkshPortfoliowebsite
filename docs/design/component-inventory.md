# Component inventory

Every component the decided screens need (segments 1 to 6 in `decisions.md`), built against `docs/design/design-dna.md`. Written 2026-10-05.

**Conventions for every entry**
- Path under `src/components/ui/` (shadcn primitives, base-nova style on `@base-ui/react`) or `src/components/desk/` (domain). Public-site components in `desk/`, private `/desk` components in `desk/private/`, chart parts in `desk/chart/`.
- Size budget: hard ceiling 200 lines per file; the number given is the target. Split before exceeding it.
- **RSC** = Server Component (default). **Client** = `"use client"` leaf; keep it small and pass server-rendered children through it.
- Colours, type, spacing, motion only through tokens (`text-read desk:text-read-desk`, `bg-surface`, `duration-(--motion-slow)`, `ease-snap`). No inline style objects for theming; inline style allowed only for computed geometry (meter position, chart coordinates).
- Every component has: an empty state that says what will appear and shows its shape; a skeleton that is the loaded layout with ink removed (`bg-surface-2` blocks at text line-heights, no shimmer); an error state with a cause and a retry or fallback; a reduced-motion behaviour per design-dna 10.4.
- Motion libraries: CSS, Motion 14 (`m` + `LazyMotion`, `strict`), NumberFlow, React `<ViewTransition>`. No GSAP, no Lenis.
- Compliance hooks name the publishing rule they serve (rule numbers from `docs/compliance/publishing-rules.md`).
- Names from the Phase 1 spec (`ThesisBody`, `SourceFacts`, `RevisionTimeline`, `Disclosure`, `AsOfBadge`) are kept as aliases where noted.
- Every component appears on `/dev/preview` (development only) in light, dark, 375 and 960, with its empty, skeleton and error states.

Shared types used below:
```ts
type ISODate = string;                         // "2026-06-30"
type HoldsPosition = "yes" | "no" | "not_disclosed";
type TestStatus = "met" | "watching" | "not_met" | "no_data";
type SourceRef = { id: string; doc: string; locator: string; filedOn?: ISODate; url?: string }; // S1, "Annual Report 2025-26", "p. 131"
type FileNo = string;                          // "03", never reused
```

---

## A. UI primitives (`src/components/ui/`)

### Existing (scaffolded) and the change each needs

| File | Change | Budget |
|---|---|---|
| `button.tsx` | Variants: `default` (ink fill, paper text), `outline` (paper, `--rule-strong` border), `ghost`, `link` (geru, underlined), `destructive` (private only: `--bad` text on `--bad-wash`). Remove `ring-3 ring-ring/50` focus classes (global focus ring applies). Sizes: `default` h-11 on coarse pointer / h-9 fine; `sm` h-9 / h-8; `icon` 44 / 36 square. `active:scale-(--press-scale)` with `transition-transform duration-(--motion-fast)`; drop the `translate-y-px` press. Disabled: `opacity-45`, `aria-disabled`, no press scale. | 90 |
| `badge.tsx` | Becomes the mono count/label base: variants `count` (mono-id, muted), `label` (mono-label outline), `inverse` (ink fill). No colour variants. | 50 |
| `input.tsx` | 16 px text, min-h 44, border `--input-line`, radius 3, `aria-invalid` → `--bad` border + error text below (never colour alone). | 40 |
| `textarea.tsx` | Same as input; auto-grow by `field-sizing: content` with a JS fallback. | 40 |
| `label.tsx` | `text-small` muted; required marked with the word "required", not an asterisk. | 25 |

### To add with `pnpm dlx shadcn add` (verify each exists in the base-nova registry first)

| Primitive | Used by | Notes | Budget |
|---|---|---|---|
| `toggle-group` | Exhibit Chart/Table, diff R2/R1 switch, review choices | Restyle as segmented control: 1 px `--rule-strong` frame, pressed = ink fill + paper text; indicator via Motion `layoutId` in a wrapper (`SegmentedControl`, below) | 60 |
| `collapsible` | ComplianceStrip details, SourceFactCard, "All 12 lines" on phone review | Content animation handled by our Motion wrappers, not tw-animate | 40 |
| `dialog` / `sheet` | CaptureSheet (bottom sheet), unpublish confirm | Bottom side only; radius 3 top corners; `--scrim`; focus trap; Esc closes | 80 |
| `checkbox` | Rule-4 hand check, publish checklist manual items | 18 px box, 44 px row hit area, ink check mark, geru focus ring | 40 |
| `table` | Register, tests, facts, ledger, scenario | Thin semantic wrappers only (`Table`, `THead`, `TRow`, `TCell` with `numeric` prop → right-align + tabular) | 70 |
| `skeleton` | Every component's loading state | Static `bg-surface-2` block, no pulse animation (remove `animate-pulse`) | 15 |
| `sonner` (toast) | Capture saved, offline saved | Bottom-centre above the tab bar, `z-(--z-toast)`, 4 s, `aria-live="polite"`, ink fill + paper text, radius 3 | 40 |
| `tooltip` | Chart readout on hover/focus | Level-1 elevation; keyboard reachable; never the only way to see a value (table tab exists) | 50 |
| `separator` | Rail sections, strip dots | Hairline `--rule` | 15 |

### Local primitives (no shadcn equivalent)

| Component | Path | Purpose and props | Budget |
|---|---|---|---|
| `SegmentedControl` | `ui/segmented-control.tsx` (Client) | Wraps toggle-group with a sliding ink indicator. `{ value: string; onValueChange(v: string): void; items: { value: string; label: string; count?: number }[]; size?: "sm" \| "md"; "aria-label": string }`. Motion `layoutId`, 220 ms; reduced: jumps. | 80 |
| `StatusShape` | `ui/status-shape.tsx` (RSC) | The four ink glyphs from design-dna 2.6 plus the word. `{ status: TestStatus; withWord?: boolean; size?: 12 \| 20 }`. Optional `tick` prop adds `animate-tick-in` when its parent block first enters view. | 50 |
| `Kbd` | `ui/kbd.tsx` (RSC) | Mono 11 px key hint, `--rule-strong` border with 2 px bottom. Desktop only (`pointer: fine`). | 20 |
| `VisuallyHidden` | `ui/visually-hidden.tsx` (RSC) | `.sr-only` span for table headers on phone reflow and chart summaries. | 15 |
| `MotionRoot` | `ui/motion-root.tsx` (Client) | `<LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user">`. Mounted once in the root layout around client leaves only. | 25 |

---

## B. Public desk components (`src/components/desk/`)

### Chrome and navigation

#### TopBar
`desk/top-bar.tsx` · RSC · 70
- **Purpose:** wordmark + "Find a file" (desktop) / back + search (phone file pages).
- **Props:** `{ variant: "home" | "file"; backHref?: string; backLabel?: string }`
- **States:** default; phone file variant (back "Files" + search icon with `aria-label`). No loading state (static).
- **Motion:** none (sticky, `z-(--z-top-bar)`).
- **Compliance:** none.

#### Wordmark
`desk/wordmark.tsx` · RSC · 35
- **Purpose:** "Aksh Agrawal" 600 ink + "Case files" muted, with the 26 px AA tag mark on desktop (24 px phone).
- **Props:** `{ size?: "phone" | "desk"; showMark?: boolean }`
- **States:** default only. **Motion:** none. **Compliance:** published under Aksh's own name, never a desk brand.

#### DeskRail
`desk/desk-rail.tsx` · RSC shell + Client indicator · 120
- **Purpose:** the one desktop rail: site sections, opening into the current file's sections; streak summary at the foot.
- **Props:** `{ current: "desk" | "files" | "notes" | "process" | "mistakes" | "about"; counts: Record<string, number>; file?: { fileNo: FileNo; shortName: string; sections: { id: string; label: string; count?: number | string }[]; activeId?: string }; streak: { daysLogged: number; lastEntry: ISODate; cells: boolean[] } }`
- **States:** site mode; file mode (sub-list with 2 px geru inset bar on the active section); empty counts render "0" (never hidden); skeleton = labels without counts.
- **Motion:** active-section indicator via Motion `layoutId` 220 ms; counts via NumberFlow on change only; reduced: jumps.
- **Compliance:** streak shows counts only (no content); "About and disclosures" is always present.

#### PhoneIndex
`desk/phone-index.tsx` · Client · 110
- **Purpose:** sticky four-part file index on phone (View · Tests 3 · Facts 8 · History R2) with the reading-progress hairline underneath.
- **Props:** `{ sections: { id: string; label: string; count?: number | string }[]; activeId: string }` (active id driven by IntersectionObserver on the section headings)
- **States:** default; a section with zero items still shows with count 0 and scrolls to its empty state; skeleton = labels only.
- **Motion:** 2 px geru underline indicator via `layoutId` 220 ms; counts NumberFlow on change; hairline via `ReadingHairline`. Reduced: indicator jumps; hairline kept.
- **Compliance:** none. A11y: `nav` of in-page links with `aria-current`, 44 px targets.

#### ReadingHairline
`desk/reading-hairline.tsx` · Client · 60
- **Purpose:** 1 px reading-progress fill under the phone index (and the top bar on desktop files).
- **Props:** `{ targetId: string }`
- **States:** supported (CSS `animation-timeline: scroll()` inside `@supports`, class `progress-hairline`); fallback (IntersectionObserver/`useScroll` writes `transform: scaleX()`).
- **Motion:** scroll-linked, linear; stays under reduced motion. **Compliance:** none.

#### TabBar
`desk/tab-bar.tsx` · Client · 90
- **Purpose:** phone bottom bar: Desk, Files 7, Notes 3, About. Hidden on desktop.
- **Props:** `{ current: "desk" | "files" | "notes" | "about"; counts: { files: number; notes: number }; hideOnScroll?: boolean }` (true on file pages)
- **States:** default; hidden (translated down while scrolling down a file, back on scroll up); safe-area padding.
- **Motion:** Motion `useScroll` direction → `translateY(100%)` 180 ms; reduced: instant. Counts NumberFlow on change.
- **Compliance:** none. A11y: labels always visible with icons (lucide 1.5 stroke, geru stroke on active).

#### SiteDisclosureLine
`desk/site-disclosure-line.tsx` · RSC · 35
- **Purpose:** the site disclosure on non-file pages: bottom of page on phone, the top strip on desktop (rendered through `ComplianceStrip variant="site"` there).
- **Props:** none (copy is fixed in design-dna 13.2).
- **Compliance:** site-level disclosure; on file pages it is not rendered (the strip is the only one).

### Compliance and dating

#### ComplianceStrip
`desk/compliance-strip.tsx` · RSC content + Client toggle · 110
- **Purpose:** the quiet expandable line: **For learning** · {position} · Figures to {date} · Details. Opens to a short paragraph and a link to the full disclosure.
- **Props:** `{ variant: "site" | "file"; holdsPosition?: HoldsPosition; dataAsOf?: ISODate; disclosureHref?: string }`
- **States:** closed (default, server HTML); open; file with `holdsPosition` null → render "Position not disclosed" and log a build warning (publish_revision forbids null for company items, so this is a guard). No loading state (renders from the item row).
- **Motion:** drawer: `clip-path` from top + 8 px slide, 180 ms open / 120 ms close (Motion). Chevron rotates 180 ms. Reduced: 120 ms fade in, instant close.
- **Compliance:** rule 5 (position from the ledger at publish time), rule 3 (figures-to date). Copy is rendered, never typed. Excluded from the rule-1 lint like the disclosure.

#### Disclosure (alias of spec `Disclosure`)
`desk/disclosure.tsx` · RSC · 50
- **Purpose:** the full standard disclosure block at the end of every public page about a named security.
- **Props:** `{ holdsPosition: HoldsPosition; reviewedOn: ISODate }`
- **States:** default only; never empty, never collapsible.
- **Motion:** none, ever.
- **Compliance:** rule 5 verbatim text from publishing-rules with `{holds_position}` → Yes/No/Not disclosed; excluded from the rule-1 scan; `id="disclosure"` target of the strip link.

#### Dateline
`desk/dateline.tsx` · RSC · 55
- **Purpose:** arXiv-style dateline under the title: This version (R2 of 2) · Revised · First written · Figures to.
- **Props:** `{ revNo: number; revCount: number; revisedOn: ISODate; firstWrittenOn: ISODate; dataAsOf: ISODate }`
- **States:** 4-up on desktop, 2 × 2 on phone; R1 shows "R1 of 1"; skeleton = labels with empty values.
- **Motion:** none. **Compliance:** rule 3 (figures-to date always visible near the title); rule 7 (shows which gated revision is live).

#### AsOf (alias of spec `AsOfBadge`) and Withheld
`desk/as-of.tsx` · RSC · 45
- **Purpose:** the inline "Figures to 30 Jun 2026" / "as of 31 Mar 2026" text, and the `[withheld until DD Mon YYYY]` replacement for any value younger than 30 days.
- **Props:** `AsOf { date: ISODate; prefix?: "Figures to" | "as of" | "Data to" }` · `Withheld { availableOn: ISODate }`
- **States:** normal; withheld (muted, hatch underline, tabular).
- **Motion:** none. **Compliance:** rule 3. `Withheld` is chosen by a pure function `isLagged(date, today)` shared with the server views, so UI and SQL cannot disagree.

### File page blocks

#### FileTag and IdMark (FileNumber / ExhibitNumber)
`desk/id-mark.tsx` · RSC · 60
- **Purpose:** the numbering mark. `FileTag` = notched geru tag "FILE 03 · R2"; `IdMark` = inline mono geru ID ("03", "Ex. 03.1", "S1 p. 131", "R2"; "T1" muted).
- **Props:** `FileTag { fileNo: FileNo; revNo: number }` · `IdMark { kind: "file" | "exhibit" | "source" | "revision" | "test"; value: string; muted?: boolean }`
- **States:** default only. **Motion:** none.
- **Compliance:** file numbers never reused (assigned in the DB; the component only renders).

#### BlockHeader
`desk/block-header.tsx` · RSC · 50
- **Purpose:** the labelled-block head: mono label + h2 title + one-line sub + hairline.
- **Props:** `{ label: "VIEW" | "TESTS" | "FACTS" | "HISTORY" | "SOURCES" | "SCENARIO" | "LINKS"; title: string; sub?: string; count?: number | string; id: string }`
- **States:** label styles per design-dna section 17, item 6 (VIEW geru fill; TESTS ink outline; FACTS dashed; HISTORY dotted; others muted outline).
- **Motion:** none. **Compliance:** the label is the facts-vs-view separation (CLAUDE.md: machine facts and Aksh's words never share a field).

#### ViewBlock (alias of spec `ThesisBody`)
`desk/view-block.tsx` · RSC · 110
- **Purpose:** Aksh's view: reading-size prose with one continuous 2 px ink left rule, with source chips inline and source-fact cards opening in flow.
- **Props:** `{ paragraphs: ViewParagraph[]; revisionMarks?: { paragraph: number; revNo: number; changeHref: string }[] }` where `ViewParagraph = { segments: (string | { chip: SourceChipData })[] }`
- **States:** default; empty (should not happen on a public file; private preview shows "No view written yet. The VIEW block holds Aksh's own words; facts go in FACTS."); skeleton = 3 paragraphs of `surface-2` lines at reading line-height.
- **Motion:** none on the prose (never fades). Cards animate inside `SourceFactCard`.
- **Compliance:** rule 1 text is the linted body; proportional figures; first person allowed only here.

#### SourceChip + SourceFactCard
`desk/source-chip.tsx` (Client, 70) · `desk/source-fact-card.tsx` (RSC body, 90)
- **Purpose:** a mono chip ("S1 p. 131") after a figure opens an in-flow card: figure + unit, prior figure, the quoted line, source line, as-of date.
- **Props:** `SourceChipData { sourceId: string; locator: string; card: { figure: string; unit?: string; prior?: { label: string; value: string }; quote: string; source: SourceRef; asOf: ISODate } }`; chip `{ data: SourceChipData; open: boolean; onToggle(): void }`
- **States:** closed; open (chip geru-wash + geru border, `aria-expanded`); withheld figure (card shows `Withheld`); missing quote (card shows "Quoted line not captured yet" and the source line); one card open at a time per paragraph.
- **Motion:** card grows out of the chip's rect (clip) and slides down, 220 ms open / 120 ms close (Motion `AnimatePresence`); reduced: 120 ms fade, instant close. Card insertion pushes text below only after user input (CLS exempt).
- **Compliance:** every number shows source + as-of; figure in ink (never geru); quoted filing text is sans in quotation marks (rule 1 allowlist: quoted source text).

#### FactTable (alias of spec `SourceFacts`) and SourceList
`desk/fact-table.tsx` (RSC, 130) · `desk/source-list.tsx` (RSC, 50)
- **Purpose:** grouped fact rows (metric, value, unit column, prior, source chip), as-of stated once per group; then the numbered source list (S1 type, document, filed date).
- **Props:** `FactTable { groups: { title: string; asOf: ISODate; rows: { label: string; value: string | null; unit?: string; prior?: string; source: SourceRef; withheldUntil?: ISODate }[] }[] }` · `SourceList { sources: (SourceRef & { type: "Annual report" | "Presentation" | "Filing" | "Transcript" | "Other" })[] }`
- **States:** desktop table; phone two-line rows sharing one right edge; withheld cells; empty ("No source facts yet. Each fact will show its figure, prior year, source and date." + column shape); skeleton rows.
- **Motion:** none (figures never move). **Compliance:** rule 3 per cell; tabular figures + units column.

#### KillCriteriaTable + ThresholdMeter
`desk/kill-criteria-table.tsx` (RSC, 140) · `desk/threshold-meter.tsx` (RSC, 90)
- **Purpose:** "I would be wrong if": status counts with legend, then one row per test: T-number, condition (Aksh's words), latest reading with data date, last checked, status shape + word, and a distance-to-threshold meter.
- **Props:** `KillCriteriaTable { tests: { id: string; n: number; condition: string; reading: string; readingAsOf: ISODate; lastChecked: ISODate; status: TestStatus; addedInRev?: number; meter?: MeterData }[] }` · `MeterData { min: number; max: number; threshold: number; current: number | null; prior?: number; direction: "above" | "below"; unit: string; labels: { min: string; max: string; threshold: string } }`
- **States:** desktop table (No. · Condition · Latest reading · Data to · Status); phone stacked rows; `no_data` row replaces the meter with a dashed box "Not disclosed yet"; withheld reading; empty ("No tests yet. A test says what would prove the view wrong; each will show its latest reading and status."); skeleton.
- **Meter visuals:** 2 px `--surface-2` track; Met zone hatched; threshold 2 px `--neel` tick with neel label; current reading 12 px ink dot; prior as a hollow ink ring; min/max captions muted.
- **Motion:** status glyphs tick in (`steps(4)`, 180 ms, 60 ms apart) when the table enters view; meter dot does not travel (figures never move); reduced: static.
- **Compliance:** "Met means the view is wrong" legend always shown; statuses are shapes + words, never colour; reading carries its data date (rule 3).

#### Exhibit (frame) + ExhibitChart + ExhibitTable
`desk/exhibit.tsx` (RSC frame + Client toggle, 120) · `desk/chart/line-chart.tsx` (Client, 180) · `desk/chart/chart-readout.tsx` (Client, 80)
- **Purpose:** every figure block: 2 px geru top rule, "Ex. 03.1" mono geru, factual title, sub, Chart/Table toggle, the chart (or the ledger table), footer `Source` / `Data to` key-value lines.
- **Props:** `Exhibit { fileNo: FileNo; n: number; title: string; sub?: string; source: string; dataTo: ISODate; key?: { mark: "subject" | "projection" | "benchmark" | "threshold" | "withheld"; label: string }[]; chart: React.ReactNode; table: React.ReactNode; defaultView?: "chart" | "table"; summary: string }` (summary = the chart's `aria-label`)
- **LineChart props:** `{ series: { kind: "subject" | "projection" | "benchmark"; points: { x: string; y: number | null }[] }[]; thresholds?: { y: number; label: string }[]; dataCap?: ISODate; withheldFrom?: string; yTicks: number[]; unit: string; height: { phone: number; desk: number } }`
- **States:** chart; table; withheld region hatched; empty ("No figures yet for this exhibit." + axis shape, never a blank axis); error ("Chart could not be drawn. The table holds the same figures." and switches to Table); skeleton = reserved `aspect-ratio` box with title.
- **Motion:** subject line draws to the data cap 220 ms linear (`pathLength=1`, `stroke-dashoffset`) only if the exhibit was below the fold at hydration; then cap label ticks in 120 ms `steps(4)`; toggle indicator `layoutId`; Chart/Table swap is instant. Reduced: drawn at once.
- **Compliance:** rule 3 data cap + hatched withheld weeks; markers are filing dates, never Aksh's revisions (so it cannot read as a scorecard); title is factual and passes rule 1 (linted as part of the body); geru never inside the plot.

#### LedgerTable (with sticky phone key row)
`desk/ledger-table.tsx` · RSC + tiny Client cell toggle · 170
- **Purpose:** exhibit 1's Table tab: years across, each column with year end and source chip; units column; `=` on computed rows; shaded current column; sparkline column on desktop. On phone, a sticky key row (year, year end, source chip) above metric rows so no sideways scroll.
- **Props:** `{ periods: { label: string; yearEnd: ISODate; source: SourceRef; current?: boolean }[]; rows: { label: string; unit: string; computed?: boolean; values: (string | null)[]; withheld?: (ISODate | null)[] }[]; spark?: boolean }`
- **States:** desktop table with 3 px double ink rule under headers; phone key row sticky at `top: calc(var(--top-bar-h) + var(--index-h))`, `z-(--z-sticky-key)`; withheld cells; empty; skeleton with the same column count (no shift).
- **Motion:** none on values. **Compliance:** rule 3 per column (year end + source); tabular right-aligned digits.

#### ScenarioTable
`desk/scenario-table.tsx` · RSC · 90
- **Purpose:** the public SCENARIO block: static, lagged, labelled scenario outputs under stated assumptions, frozen with the revision.
- **Props:** `{ assumptions: { label: string; values: string[] }[]; outputs: { label: string; unit: string; values: string[] }[]; scenarios: string[]; frozenAtRev: number; dataAsOf: ISODate }`
- **States:** default; empty; skeleton.
- **Compliance:** **rule 9**: operating outputs only. The type forbids equity value, per-share value, target or price fields (enforce with a `zod` schema that rejects those keys). Linted under rule 1.

#### RevisionDiff + RevisionLog (alias of spec `RevisionTimeline`)
`desk/revision-diff.tsx` (Client switch + RSC body, 150) · `desk/revision-log.tsx` (RSC, 60)
- **Purpose:** phone-readable prose diff: reason first, then removed and added sentences as prose blocks grouped by location, then new facts/tests; a switch shows R2 or R1 in full. The log lists every revision with date and change reason.
- **Props:** `RevisionDiff { from: { revNo: number; on: ISODate }; to: { revNo: number; on: ISODate }; reason: string; groups: { location: string; removed: string[]; added: string[] }[]; added?: { facts: number; tests: number }; fullText: Record<number, string[]> }` · `RevisionLog { revisions: { revNo: number; on: ISODate; reason: string; href: string }[] }`
- **States:** Changes view (default); full R-n view; R1 only ("First version. Later revisions will show what changed and why."); skeleton.
- **Motion:** switch indicator `layoutId`; content swap instant (reading content never fades).
- **Compliance:** rule 7 (every revision gated; only gated revisions appear); deletions muted with dashed rule, no strike-through (legibility).

#### ReadFirst
`desk/read-first.tsx` · RSC · 45
- **Purpose:** "Read first: {note} · 6 min" before a file (one line on desktop; small boxed list if more than one).
- **Props:** `{ notes: { title: string; href: string; minutes: number }[] }`
- **States:** one; many (ordered list); none (render nothing; this is optional context, not a block).
- **Motion:** none. **Compliance:** linked notes are public items that passed the gate.

#### UsedIn
`desk/used-in.tsx` · RSC · 55
- **Purpose:** table at the end of a learning note: File · Where · Since.
- **Props:** `{ uses: { fileNo: FileNo; company: string; where: string; href: string; since: ISODate }[] }`
- **States:** rows; empty ("Not used in a file yet. Files that rely on this note will be listed here."); skeleton.
- **Motion:** none. **Compliance:** only public files listed.

#### EmptyState
`desk/empty-state.tsx` · RSC · 40
- **Purpose:** the shared dashed box: what will appear, what it holds, why it is empty, plus the column shape.
- **Props:** `{ title?: string; body: string; shape: string[] }`
- **Motion:** none (counts beside it may roll on change). **Compliance:** used for Mistakes until Phase 3.

### Desk home

#### StatTile + UnitSquares
`desk/stat-tile.tsx` (RSC, 70) · `desk/unit-squares.tsx` (RSC, 45)
- **Purpose:** the 4-up (2 × 2 on phone) home band: key label, large figure with unit word, context line; Tests tile shows unit squares (one 12 px status shape per test, ordered Met, Watching, Not met, No data).
- **Props:** `StatTile { label: string; value: number; unit?: string; context?: string; children?: React.ReactNode }` · `UnitSquares { counts: Record<TestStatus, number> }`
- **States:** default; zero ("0" with context "none yet"); skeleton (same box, no figure).
- **Motion:** values are counts of desk activity, not financial: NumberFlow rolls on client-side change only; server HTML shows the final value. Unit squares tick in once in view.
- **Compliance:** counts only; never returns, hit rates or performance (rule 2). `aria-label` on unit squares spells the counts.

#### StreakStrip
`desk/streak-strip.tsx` · RSC · 40
- **Purpose:** 30 cells (ink = logged, `--rule` = not), "23 of the last 30 days", last entry date.
- **Props:** `{ cells: boolean[]; lastEntry: ISODate; variant?: "tile" | "rail" }`
- **States:** default; all empty ("No research logged in the last 30 days" is shown honestly, not hidden).
- **Motion:** none. **Compliance:** counts only, no content of the private notes.

#### WhatChangedList
`desk/what-changed-list.tsx` · RSC · 80
- **Purpose:** the last five entries above the register: date, entry with the file name as a link and the reason first, then "Revision · 2 paragraphs rewritten · test 2 met · figures to 30 Jun 2026".
- **Props:** `{ entries: { on: ISODate; kind: "revision" | "new_file" | "learning" | "process"; fileNo?: FileNo; subject: { label: string; href: string }; text: string; detail: string }[] }`
- **States:** 1 to 5 entries; empty ("Nothing has changed yet. Each new file or revision will be listed here with its reason."); skeleton (5 rows).
- **Motion:** none. **Compliance:** only gated public revisions; lagged dates; entries are linted text (rule 8).

#### RegisterTable
`desk/register-table.tsx` · RSC rows + Client sort/search · 170
- **Purpose:** one row per public file: No. (geru mono), Company + symbol, Sector, Version, Revised, Tests summary (shapes + counts), Figures to. Phone: three-line rows.
- **Props:** `{ files: { fileNo: FileNo; company: string; symbol: string; sector: string; revNo: number; revisedOn: ISODate; tests: Record<TestStatus, number>; dataAsOf: ISODate; href: string; transitionName: string }[]; sort?: "revised" | "fileNo" | "company" }`
- **States:** default (sorted by last revision); search with no match ("No file matches "{q}". Search covers company names, symbols and sectors." and the table keeps its height); empty ("No files yet."); skeleton (7 rows, same columns).
- **Motion:** sort/search FLIP 220 ms (Motion `layout`); count in header via NumberFlow on change; company name carries the `<ViewTransition name>` for the row-to-title morph (see `FileTitleTransition`). Reduced: instant.
- **Compliance:** Figures-to column (rule 3); sort by revision date, never by any performance measure (rule 2).

#### FileTitleTransition
`desk/file-title-transition.tsx` · Client · 40
- **Purpose:** wraps the register company name and the file h1 in matching `<ViewTransition name={"file-" + fileNo}>` so the name morphs into the title.
- **Props:** `{ fileNo: FileNo; children: React.ReactNode }`
- **Motion:** 220 ms ease-snap morph; rest cross-fades 120 ms; back reverses. Placed in `page.tsx`, not a layout; names unique per file. Reduced: `::view-transition-*` rule → none. Must not delay LCP: the h1 renders as normal text without the transition on first load.

### Identity assets

#### Favicon
`src/app/icon.svg` + `src/app/icon.png` (32 px) + 16 px drawing · asset · n/a
- AA notched tag (design-dna 11, 15), `prefers-color-scheme` rule inside the SVG; replaces `src/app/favicon.ico`.

#### ShareCard
`src/app/(public)/companies/[slug]/opengraph-image.tsx` (route from the Phase 1 spec) · RSC (`next/og`) · 120
- **Purpose:** the one fixed 1200 × 630 card per file (design-dna 15).
- **Props (from the route):** `{ fileNo; revNo; company; learningObjective; revisedOn; dataAsOf }`
- **States:** default; missing learning objective cannot occur (rule 6 requires it). Fonts loaded from the same Plex files.
- **Compliance:** rule 8: the card text (title, objective, footer) is linted with the page; footer always carries "For learning, not advice" and the figures-to date.

---

## C. Private `/desk` components (`src/components/desk/private/`)

All private screens share: `DeskTopBar` + `LivenessStrip`/`OfflineStrip` + tabs Capture · Inbox · Items · Names. Second-person voice to Aksh.

#### DeskShell
`private/desk-shell.tsx` · RSC + Client tabs · 110
- **Purpose:** private top bar ("Desk" + mono "private" marker), desktop tab nav, phone bottom tabs with counts, dock area for the capture button.
- **Props:** `{ current: "capture" | "inbox" | "items" | "names"; counts: { inbox: number; names: number }; liveness: LivenessState; offlineQueued: number; children: React.ReactNode }`
- **Motion:** tab indicator `layoutId`; counts NumberFlow on change. **Compliance:** marks the whole surface private (never indexed: `robots: noindex`).

#### LivenessStrip
`private/liveness-strip.tsx` · RSC · 50
- **Purpose:** red strip naming what is late, that notes are safe and that Shlok was emailed.
- **Props:** `LivenessState = { status: "ok" } | { status: "late"; job: string; lastRunAt: string; agoText: string }`
- **States:** hidden when ok; late (alert glyph, `--bad` 2 px bottom rule on `--bad-wash`, `role="alert"`).
- **Motion:** none (arrives with the page). **Compliance:** copy verbatim (design-dna 13.2); no dismiss control.

#### OfflineStrip
`private/offline-strip.tsx` · Client · 45
- **Purpose:** "Offline. {n} notes are saved on this phone…" (`role="status"`), dashed bottom rule on `--surface`.
- **Props:** `{ queued: number }` · **States:** hidden online; offline with n ≥ 0. **Motion:** none.

#### CaptureSheet (with CaptureField, CaptureReceipt, GrammarKeyRow, CaptureButton)
`private/capture-sheet.tsx` (Client, 150) · `private/capture-field.tsx` (Client, 120) · `private/capture-receipt.tsx` (RSC-safe pure render, 80) · `private/grammar-key-row.tsx` (Client, 50) · `private/capture-button.tsx` (Client, 40)
- **Purpose:** C's Capture button on every screen opening a bottom sheet (phone) / an inline capture bar (desktop), with A's internals: live token colouring, a one-line receipt "Will go to …", and the `$ # t: l: p:` key row docked at thumb height above the keyboard.
- **Props:** `CaptureSheet { open: boolean; onOpenChange(o: boolean): void; onSave(raw: string): Promise<SaveResult> }` · `CaptureField { value: string; onChange(v: string): void; parse: (raw: string) => ParsedCapture; placeholder: string; autoFocus?: boolean }` · `CaptureReceipt { parsed: ParsedCapture; queued?: boolean }` · `GrammarKeyRow { onInsert(token: "$" | "#" | "t:" | "l:" | "p:"): void }`
- **Token colouring (textarea over a highlight mirror; colour never changes width):** `t:/l:/p:` inverse ink; `$KNOWN` geru on geru-wash; `$UNKNOWN` same + dashed underline; `#known` ink on surface-2; `#unknown` + dashed underline; URL geru dotted underline.
- **States:** empty (receipt "Will go to: Today, as a private note"); typing; thesis without company (warn line); saving (Save disabled, label "Saving…"); saved (toast, sheet stays open on desktop, closes on phone); offline (saved to IndexedDB, receipt "Saved on this phone, will sync", warn colour); error ("Not saved. Your text is still here." + Retry; text never cleared on failure).
- **Motion:** sheet slides up 220 ms, scrim 120 ms, close 120 ms (Motion `AnimatePresence`); receipt chips swap instantly (no motion while typing); key-row press scale. Reduced: 120 ms fade.
- **Keyboard:** `c` opens, `/` focuses the desktop bar, Enter saves, Shift+Enter newline, Esc closes. Three taps on phone (icon, Capture, type, Save).
- **Compliance:** captures are private by default; the receipt never says "publish". Parsing uses the same `parseCapture` as the server (`src/modules/capture`), imported, not re-implemented.

#### Tray
`private/tray.tsx` · RSC · 50
- **Purpose:** a state-named group with an uppercase heading and a 3 px-radius ink count (Needs you 3, Today 6).
- **Props:** `{ title: string; count: number; children: React.ReactNode; empty: { body: string } }`
- **States:** filled; empty ("Nothing needs you. New gate failures, reports to review and new names appear here."); skeleton. **Motion:** count NumberFlow on change.

#### NeedsYouCard
`private/needs-you-card.tsx` · RSC · 60
- **Purpose:** one card per problem, one action each: Publish stopped (bad), Ready to review, New names (warn), On this phone.
- **Props:** `{ tone: "bad" | "warn" | "neutral"; stateWord: string; title: string; body: string; action?: { label: string; href: string } }`
- **States:** per tone: 4 px left rule (`--bad` / `--warn` / `--ink-muted`), mono state word with glyph; no action variant for "On this phone".
- **Motion:** press scale on the action. **Compliance:** "Publish stopped" links to the editor; it never offers an override.

#### TodayList
`private/today-list.tsx` · RSC · 60
- **Purpose:** today's captures, newest first, token-coloured, company and kind beneath, time on the right ("on phone" when queued).
- **Props:** `{ captures: { raw: string; at: string; queued?: boolean; company?: string; kind: "note" | "thesis" | "learning" | "process" }[] }`
- **States:** list; empty ("Nothing captured today. Captures appear here as you save them."); skeleton.

#### InboxSection
`private/inbox-section.tsx` · RSC + Client actions · 110
- **Purpose:** document inbox grouped by state: Ready for you · Needs attention · Being read · Paused, nothing lost · Waiting to start; drop bar ("Drop anything, or paste a link"); budget meters (AI pages today 41/60, scan pages this month).
- **Props:** `{ state: "ready" | "attention" | "reading" | "paused" | "waiting"; docs: { id: string; name: string; message: string; eta: string; pages: string; progress?: number }[] }` · `BudgetMeter { label: string; used: number; limit: number }`
- **States:** each tray state's copy is the message (e.g. "Paused, nothing lost. Today's free reading limit is used up; it carries on by itself tomorrow morning."); attention actions "Enter manually" / "Skip AI"; ready action "Review"; empty tray hidden except Ready ("Nothing to review."); skeleton.
- **Motion:** rows move between trays with `layout` 220 ms when a job changes state; progress bar fills by transform. Reduced: instant.
- **Compliance:** quota facts from `docs/research/2026-10-04-tooling-landscape.md` (meters show real limits, never guesses).

#### ReviewOneAtATime
`private/review-one-at-a-time.tsx` (Client, 150) · `private/page-text.tsx` (RSC, 70)
- **Purpose:** one flagged value at a time: "Check 1 of 2", the desk read (struck if totals disagree) vs the totals need, why, the page line, numbered choices (keys 1/2); desktop shows all values list and the page text alongside.
- **Props:** `{ doc: { name: string; page: number; section: string }; flags: { id: string; title: string; read: string; expected: string; reason: "totals_disagree" | "low_confidence"; why: string; line: string; choices: { id: string; label: string }[] }[]; values: { label: string; value: string; flagged: boolean }[]; onResolve(flagId: string, choiceId: string): Promise<void> }`
- **States:** flag n of m; all checked ("File these 24 values" + file-under receipt); filed (undo link); error on resolve (value kept, retry).
- **Motion:** next flag replaces the card instantly (it is data); list row tick via StatusShape-like check glyph. Keys 1/2 and Enter.
- **Compliance:** machine-read values and Aksh's words never share a field; nothing files until every flag is resolved.

#### GatedSentence + GateNote + AllowanceForm
`private/gated-sentence.tsx` (RSC, 50) · `private/gate-note.tsx` (Client, 100) · `private/allowance-form.tsx` (Client, 80)
- **Purpose:** B's gate explanation placed directly under/beside each flagged sentence: the sentence (wavy `--bad` underline, matched words bold `--bad`, superscript rule number), the rule message, "Edit sentence n", and for rule-1 only "Allow this sentence…" with a required reason.
- **Props:** `GatedSentence { id: string; text: string; rule?: 1 | 2 | 3 | 8; match?: string; allowed?: { reason: string; at: string } }` · `GateNote { sentence: GatedSentence; message: string; onEdit(id: string): void; onAllow?(id: string, reason: string): Promise<void>; onRemoveAllowance?(id: string): Promise<void> }`
- **States:** failing; allowed (green is not used: ink check + "Allowed by you: "{reason}", {time}" + Remove allowance); editing; reason missing error ("Add a reason first."); rule 3 ("Rule 3 has no allowance", no allow button).
- **Motion:** on "jump to sentence" the sentence gets a 2 px `--bad` outline for 1 s (static outline, no flash animation under reduced motion); allowance form opens with the strip drawer pattern (180 ms).
- **Compliance:** allowances only for rule 1, with a reason, stored per sentence in `lint_allowances`, shown in the gate decision; rules 3, 4, 9 never allowable; **no override control exists anywhere**.

#### PublishChecklist + Rule4HandCheck + PublishBar
`private/publish-checklist.tsx` (RSC + Client, 130) · `private/publish-bar.tsx` (Client, 60)
- **Purpose:** C's checklist as the summary: "Publish checklist · 9 of 11", a segment bar (ink = pass, crimson = fail, hatched warn = manual), rows for each rule with pass/fail/manual glyphs and the failing sentences nested; the rule-4 hand-check checkbox; a sticky publish bar.
- **Props:** `PublishChecklist { items: { id: string; state: "pass" | "fail" | "manual"; name: string; detail: string; sentences?: GatedSentence[] }[]; rule4Checked: boolean; onRule4Change(v: boolean): void }` · `PublishBar { canPublish: boolean; reason: string; onPublish(): Promise<GateResult> }`
- **States:** blocked (Publish disabled with the reason in words: "2 rules fail · rule 4 unchecked"); ready; publishing ("Publishing…"); published (receipt with revision number); gate failure returned by `publish_revision` (rows update from `gate_decisions.reasons`, focus moves to the first failing sentence).
- **Motion:** checklist rows re-order nothing; segment bar segments change colour 120 ms. Reduced: instant.
- **Compliance:** Publish is disabled while any rule fails or the rule-4 hand check is unticked; the only publish path is the DB `publish_revision()`; no override button; R(n−1) stays public meanwhile (stated in the bar).

#### StubCompanyList (New names screener)
`private/stub-company-list.tsx` · RSC + Client choices · 120
- **Purpose:** unknown `$SYM` and `#theme` tokens from captures become stub cards: type and first-seen, the token in mono 17 px, the quote it came from, and choices (Same as {suggestion} / New company / Not a company, keep as text; or a name field + "Yes, add it").
- **Props:** `{ names: { id: string; token: string; type: "company" | "theme"; firstSeen: string; quote: string; suggestion?: string }[]; onDecide(id: string, d: { kind: "merge" | "new" | "plain"; name?: string }): Promise<void> }`
- **States:** to screen; decided (dashed card + result + Undo); empty ("No new names. Unknown $symbols and #themes from your captures appear here."); error (decision not saved, choices stay).
- **Motion:** decided card stays in place (no reorder); count in tab rolls on change.
- **Compliance:** stubs are private; a company becomes public only through a gated item.

#### PrivateValuationPanel + Heatmap
`private/valuation-panel.tsx` (Client, 150) · `private/heatmap.tsx` (RSC, 90)
- **Purpose:** the private model: assumption sliders with outputs, and B's cost-of-capital × growth heatmap on the neel ramp, current cell ringed in ink.
- **Props:** `ValuationPanel { inputs: { id: string; label: string; min: number; max: number; step: number; value: number; unit: string; help?: string }[]; outputs: { label: string; value: string; unit: string }[]; onChange(id: string, v: number): void }` · `Heatmap { rows: string[]; cols: string[]; values: number[][]; current: [number, number]; format(v: number): string; rowLabel: string; colLabel: string }`
- **States:** default; recomputing (outputs keep last values with a muted "updating" note, no spinner); error; skeleton.
- **Motion:** none on figures (outputs change instantly; no tweening).
- **Compliance:** rule 9: never rendered on a public route (lives under `/desk` only; route guard + `server-only` data loader); a striped "Private · not published" bar heads the panel.

---

## D. Count

| Group | Components |
|---|---|
| UI primitives, existing (restyled) | 5 |
| UI primitives, to add from shadcn | 9 |
| UI primitives, local | 5 |
| Public desk components | 40 (TopBar, Wordmark, DeskRail, PhoneIndex, ReadingHairline, TabBar, SiteDisclosureLine, ComplianceStrip, Disclosure, Dateline, AsOf, Withheld, FileTag, IdMark, BlockHeader, ViewBlock, SourceChip, SourceFactCard, FactTable, SourceList, KillCriteriaTable, ThresholdMeter, Exhibit, LineChart, ChartReadout, LedgerTable, ScenarioTable, RevisionDiff, RevisionLog, ReadFirst, UsedIn, EmptyState, StatTile, UnitSquares, StreakStrip, WhatChangedList, RegisterTable, FileTitleTransition, Favicon, ShareCard) |
| Private desk components | 22 (DeskShell, LivenessStrip, OfflineStrip, CaptureSheet, CaptureField, CaptureReceipt, GrammarKeyRow, CaptureButton, Tray, NeedsYouCard, TodayList, InboxSection, ReviewOneAtATime, PageText, GatedSentence, GateNote, AllowanceForm, PublishChecklist, PublishBar, StubCompanyList, ValuationPanel, Heatmap) |
| **Total** | **81** |

Build order suggestion (dependencies first): tokens + fonts → `MotionRoot`, `StatusShape`, `SegmentedControl`, `IdMark` → strip, dateline, disclosure, AsOf → file blocks → exhibit + ledger → home → private shell → capture → trays/inbox → review → gate + checklist → names → valuation.
