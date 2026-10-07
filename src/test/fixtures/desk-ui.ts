import type { SourceRef } from "@/lib/desk-types";
import type {
  DatelineData, ExhibitData, FactGroup, HomeStats, KillTest, RailSection, ReadFirstNote, RegisterFile, RevisionDiffData,
  RevisionLogEntry, ScenarioData, SiteCounts, SourceChipData, SourceListItem, StreakData, UsedInRow, ViewBlockData, WhatChangedEntry,
} from "@/lib/view-types";

export const SITE_COUNTS: SiteCounts = { files: 2, notes: 2, process: 1, mistakes: 0 };
export const STREAK: StreakData = { cells: Array.from({ length: 30 }, (_, i) => i % 4 !== 0), daysLogged: 22, lastEntry: "2026-10-05" };
export const FILE_SECTIONS: RailSection[] = [
  { id: "view", label: "View" },
  { id: "tests", label: "Tests", count: 3 },
  { id: "facts", label: "Facts", count: 4 },
  { id: "history", label: "History", count: "R2" },
];
export const DATELINE: DatelineData = { revNo: 2, revCount: 2, revisedOn: "2026-08-20", firstWrittenOn: "2026-08-05", dataAsOf: "2026-06-30" };

export const SOURCE_S1: SourceRef = { id: "S1", doc: "Annual report 2025-26 (fictional seed data)", locator: "p. 131", filedOn: "2026-07-12" };
const SOURCE_S2: SourceRef = { id: "S2", doc: "Q1 FY27 presentation (fictional seed data)", locator: "slide 7", filedOn: "2026-09-25" };

export const CHIP_F1: SourceChipData = {
  chipId: "F1",
  label: "S1 p. 131",
  card: {
    figure: "₹1,284 cr",
    unit: null,
    prior: { label: "FY25", value: "₹1,102 cr" },
    quote: "Revenue from operations rose to ₹1,284 crore.",
    source: SOURCE_S1,
    asOf: "2026-03-31",
    withheldUntil: null,
  },
};

export const VIEW_BLOCKS: ViewBlockData[] = [
  { kind: "p", inline: ["Kaveri grew revenue to ₹1,284 cr ", { chip: CHIP_F1 }, " while its dealers took longer to pay."] },
  { kind: "p", inline: ["I expected pricing power to show up in margins first."] },
];

export const FACT_GROUPS: FactGroup[] = [
  {
    title: "FY26",
    asOf: "2026-03-31",
    rows: [
      { id: "F1", label: "Revenue from operations", period: null, value: "1,284", unit: "₹ cr", prior: "1,102", source: SOURCE_S1, withheldUntil: null },
      { id: "F2", label: "Gross margin", period: null, value: "31.4", unit: "%", prior: "30.9", source: SOURCE_S1, withheldUntil: null },
      { id: "F3", label: "Receivable days", period: null, value: "142", unit: "days", prior: "131", source: SOURCE_S1, withheldUntil: null },
    ],
  },
  {
    title: "Q1 FY27",
    asOf: "2026-09-25",
    rows: [{ id: "F4", label: "Order book", period: null, value: null, unit: "₹ cr", prior: null, source: SOURCE_S2, withheldUntil: "2026-10-25" }],
  },
];

/** The same facts filed under topics (Phase 2 G rows): the period moves after each metric; untopiced facts keep period groups. */
export const FACT_GROUPS_BY_TOPIC: FactGroup[] = [
  {
    title: "P&L",
    asOf: "2026-03-31",
    rows: [
      { ...FACT_GROUPS[0].rows[0], period: "FY26" },
      { ...FACT_GROUPS[0].rows[1], period: "FY26" },
    ],
  },
  {
    title: "Working capital",
    asOf: "2026-09-25",
    rows: [
      { ...FACT_GROUPS[0].rows[2], period: "FY26" },
      { ...FACT_GROUPS[1].rows[0], period: "Q1 FY27" },
    ],
  },
  {
    title: "FY26",
    asOf: "2026-03-31",
    rows: [{ id: "F5", label: "Dealer count", period: null, value: "1,900", unit: "dealers", prior: "1,840", source: SOURCE_S1, withheldUntil: null }],
  },
];

export const SOURCES: SourceListItem[] = [
  { ...SOURCE_S1, type: "Annual report" },
  { ...SOURCE_S2, type: "Presentation" },
];

export const KILL_TESTS: KillTest[] = [
  {
    id: "T1", n: 1, condition: "Receivable days stay above 150 for two straight years.", reading: "142 days",
    readingAsOf: "2026-03-31", withheldUntil: null, lastChecked: "2026-08-20", status: "watching",
    meter: { min: 60, max: 200, threshold: 150, current: 142, prior: 131, direction: "above", unit: "days", labels: { min: "60", max: "200", threshold: "Test 1 line: 150 days" } },
  },
  {
    id: "T2", n: 2, condition: "Gross margin falls below 28% in a full year.", reading: "31.4%",
    readingAsOf: "2026-03-31", withheldUntil: null, lastChecked: "2026-08-20", status: "not_met",
    meter: { min: 20, max: 40, threshold: 28, current: 31.4, prior: 30.9, direction: "below", unit: "%", labels: { min: "20%", max: "40%", threshold: "Test 2 line: 28%" } },
  },
  {
    id: "T3", n: 3, condition: "The dealer count shrinks for two years.", reading: null,
    readingAsOf: null, withheldUntil: null, lastChecked: "2026-08-20", status: "no_data", meter: null,
  },
];

const FY = ["FY22", "FY23", "FY24", "FY25", "FY26"];
const DAYS = [81, 95, 118, 131, 142];
export const EXHIBIT: ExhibitData = {
  fileNo: "01",
  n: 1,
  title: "Receivable days, FY22 to FY26",
  sub: "Days of sales owed by dealers at year end",
  source: "S1 Annual report 2025-26 (fictional seed data), p. 131",
  dataTo: "2026-03-31",
  key: [
    { mark: "subject", label: "Kaveri Pumps" },
    { mark: "threshold", label: "Test 1 line" },
  ],
  chart: {
    series: [{ kind: "subject", label: "Receivable days", points: FY.map((x, i) => ({ x, y: DAYS[i], withheld: false })) }],
    thresholds: [{ y: 150, label: "Test 1 line: 150 days" }],
    dataCap: { x: "FY26", label: "Data to 31 Mar 2026" },
    yTicks: [60, 100, 140, 180],
    unit: "days",
    summary: "Receivable days rose from 81 in FY22 to 142 in FY26, below the test 1 line at 150.",
  },
  ledger: {
    periods: FY.map((label, i) => ({ label, yearEnd: `20${22 + i}-03-31`, source: SOURCE_S1, current: label === "FY26" })),
    rows: [{ label: "Receivable days", unit: "days", values: DAYS.map(String), withheld: FY.map(() => null) }],
  },
};

export const SCENARIO: ScenarioData = {
  names: ["Slow", "Base", "Fast"],
  assumptions: [{ label: "Volume growth", values: ["4%", "8%", "12%"] }],
  outputs: [
    { label: "FY28 revenue", unit: "₹ cr", values: ["1,390", "1,500", "1,610"] },
    { label: "FY28 EBITDA margin", unit: "%", values: ["12", "13", "14"] },
  ],
  frozenAtRev: 2,
  dataAsOf: "2026-06-30",
};

export const REVISION_DIFF: RevisionDiffData = {
  from: { revNo: 1, on: "2026-08-05" },
  to: { revNo: 2, on: "2026-08-20" },
  reason: "Receivable days rose again in FY26; added test 3.",
  groups: [
    { location: "Aksh's view, paragraph 2", removed: ["I expected margins to hold."], added: ["I expected pricing power to show up in margins first."] },
    { location: "I would be wrong if", removed: [], added: ["T3: The dealer count shrinks for two years."] },
  ],
  fullText: {
    1: ["Kaveri grew revenue while dealers took longer to pay.", "I expected margins to hold."],
    2: ["Kaveri grew revenue while dealers took longer to pay.", "I expected pricing power to show up in margins first."],
  },
};
export const REVISION_LOG: RevisionLogEntry[] = [
  { revNo: 2, on: "2026-08-20", reason: "Receivable days rose again in FY26; added test 3." },
  { revNo: 1, on: "2026-08-05", reason: "First version." },
];

export const READ_FIRST: ReadFirstNote[] = [{ title: "How to read an order book", href: "/notes/how-to-read-an-order-book", minutes: 6 }];
export const USED_IN: UsedInRow[] = [
  { fileNo: "01", company: "Kaveri Pumps (fictional)", where: "Read first", href: "/companies/kavpump", since: "2026-08-05" },
];

export const REGISTER: RegisterFile[] = [
  {
    fileNo: "01", company: "Kaveri Pumps (fictional)", symbol: "KAVPUMP", sector: "Capital goods", revNo: 2, revisedOn: "2026-08-20",
    tests: { met: 0, watching: 1, not_met: 1, no_data: 1 }, dataAsOf: "2026-06-30", href: "/companies/kavpump",
  },
  {
    fileNo: "02", company: "Sahyadri Cold Chain (fictional)", symbol: "SAHCOLD", sector: "Transport and logistics", revNo: 1,
    revisedOn: "2026-08-12", tests: { met: 0, watching: 1, not_met: 1, no_data: 0 }, dataAsOf: "2026-06-30", href: "/companies/sahcold",
  },
];

export const WHAT_CHANGED: WhatChangedEntry[] = [
  {
    on: "2026-08-20", kind: "revision", fileNo: "01", subject: { label: "Kaveri Pumps (fictional)", href: "/companies/kavpump" },
    text: "Receivable days rose again in FY26; added test 3.", detail: "Revision R2 · 2 sentences changed · figures to 30 Jun 2026",
  },
  {
    on: "2026-08-12", kind: "new_file", fileNo: "02", subject: { label: "Sahyadri Cold Chain (fictional)", href: "/companies/sahcold" },
    text: "First version.", detail: "New file · 2 tests · figures to 30 Jun 2026",
  },
];

export const HOME_STATS: HomeStats = {
  files: 2, sectors: 2, lastRevised: "2026-08-20", tests: { met: 0, watching: 2, not_met: 2, no_data: 1 }, revisions: 3, logged: STREAK,
};
