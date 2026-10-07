# Segment 3: data display

Comparison: `docs/design/comparisons/03-data-display.html`. All three directions use the same Kaveri data across three screens (the file's figures, the desk home, the private valuation), at 960 and 375 px, light and dark, inside the decided B+ and Register chrome. One validated blue (#2a78d6 light, #3987e5 dark) is a placeholder accent until segment 5. The gate scan finds "buy or sell" only in the disclosure.

**Studied:** 34 captures (23 desktop, 11 phone) from 16 sites, listed in the HTML. Six sites were blocked (bot checks were not bypassed, plus 403 errors).

## A. Ledger
*The table is the exhibit: years across, each column with its year end and source.*
- **References:** the Screener P&L (viewed only), StockAnalysis's period-end row, Damodaran's "data as of" line, annual-report notes.
- **Borrows:** a double rule under the headers, a units column, = on computed rows, a shaded FY26 column and a sparkline column.
- **Rejects:** sideways scrolling on phones and green or red growth rows.
- **AMC reader on a phone:** a sticky key row (year, year end, source chip) with each metric under it, so every number shows without sideways scrolling.
- **Aksh's effort:** none.
- **Risks:** a well-made Screener: familiar but forgettable. The charts are small.

## B. Exhibits
*Every figure block is a numbered exhibit: a factual title, the chart first, the table one tap away, and a source and as-of footer.*
- **References:** Our World in Data (Chart and Table tabs), FRED's observation block, Observable's axis label, broker-report exhibits.
- **Borrows:** small multiples, a threshold line on the receivable-days chart, filing-date markers, unit squares for test statuses, and a cost-of-capital heatmap in the private panel.
- **Rejects:** dual axes (the price is indexed instead) and a label on every point.
- **AMC reader on a phone:** the most presentable of the three: the title states the change before the chart.
- **Aksh's effort:** one title per exhibit, drafted from the data, edited by him and checked by the gate.
- **Risks:** titles can drift into interpretation (I reworded exhibit 3 to remove a causal claim). Small multiples hide exact values. It needs the most chart code.

## C. Instrument rows
*One row per measure: sparkline, latest value and date; tap the row for every year, its source and the quoted line.*
- **References:** Koyfin, the Stripe and Linear dashboards, GitHub Insights, Google Finance.
- **Borrows:** progressive disclosure, range pills that end at the lag date, a crosshair readout, and distance-to-threshold meters for the tests.
- **Rejects:** live ranges and tickers as headlines.
- **AMC reader on a phone:** the fastest scan, but facts sit behind taps the reader may skip.
- **Aksh's effort:** none.
- **Risks:** it reads like a SaaS dashboard (R2-1), and five-point sparklines are thin.

## Shared rules
- Tabular figures in columns and proportional figures for large values. Every block carries a source and an as-of date. Statuses use shapes and textures, not colour alone. Every chart has a hover and arrow-key readout and a table.
- The price chart ends at a "Data to 31 Aug 2026" cap, with the withheld weeks hatched. Its markers show filing dates, not Aksh's revisions, so it cannot be read as a scorecard.
- The scenario table is a new SCENARIO block, labelled scenario outputs under stated assumptions and frozen with R2. It has no per-share figure and no price comparison. The private panel runs the same model.

## Recommendation
Use B's exhibit frame (number, factual title, source and as-of footer) for every figure block. Open exhibit 1 on a Table tab that holds A's ledger and sticky phone key, and use C's threshold meters for the kill criteria. On the home page use B's large figures and unit squares; in the private panel, B's heatmap.

**Open:** under rule 9, may a static public table show total equity value? If not, drop that row.
