import type { FileNo, ISODate, SourceRef, SourceType, TestCounts, TestStatus } from "./desk-types";

// ---- Chrome (Task 3) ----
export type RailCurrent = "desk" | "files" | "notes" | "process" | "mistakes" | "about";
export type TabCurrent = "desk" | "files" | "notes" | "about";
export type RailSection = { id: string; label: string; count?: number | string };
export type SiteCounts = { files: number; notes: number; process: number; mistakes: number };
export type StreakData = { cells: boolean[]; daysLogged: number; lastEntry: ISODate | null };
export type DatelineData = { revNo: number; revCount: number; revisedOn: ISODate; firstWrittenOn: ISODate; dataAsOf: ISODate };
export type SiteChrome = { counts: SiteCounts; streak: StreakData };

// ---- Reading blocks (Task 4) ----
export type SourceCard = {
  figure: string; // "₹1,284 cr", unit folded in
  unit: string | null;
  prior: { label: string; value: string } | null;
  quote: string | null;
  source: SourceRef;
  asOf: ISODate;
  withheldUntil: ISODate | null;
};
export type SourceChipData = { chipId: string; label: string; card: SourceCard }; // label "S1 p. 131"
export type ViewInline = string | { chip: SourceChipData };
export type ViewBlockData =
  | { kind: "p"; inline: ViewInline[] }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: ViewInline[][] };
export type FactRow = {
  id: string;
  label: string;
  period: string | null; // set only when the row sits in a topic group (the group title is then the topic, not the period)
  value: string | null;
  unit: string | null;
  prior: string | null;
  source: SourceRef;
  withheldUntil: ISODate | null;
};
export type FactGroup = { title: string; asOf: ISODate; rows: FactRow[] }; // title: the topic, or the period for facts with none
export type SourceListItem = SourceRef & { type: SourceType };
export type MeterData = {
  min: number;
  max: number;
  threshold: number;
  current: number | null;
  prior: number | null;
  direction: "above" | "below"; // Met when the reading is above / below the threshold
  unit: string;
  labels: { min: string; max: string; threshold: string };
};
export type KillTest = {
  id: string; // "T1"
  n: number;
  condition: string; // Aksh's words, from body_md
  reading: string | null; // "142 days", from structured
  readingAsOf: ISODate | null;
  withheldUntil: ISODate | null;
  lastChecked: ISODate;
  status: TestStatus;
  meter: MeterData | null;
};
export type ReadFirstNote = { title: string; href: string; minutes: number };
export type UsedInRow = { fileNo: FileNo; company: string; where: string; href: string; since: ISODate };

// ---- Exhibits and history (Task 5) ----
/** Rule 3 at the type level: a withheld point carries no figure (y is null) and the date it clears. */
export type ChartPoint = { x: string; y: number | null; withheld: false } | { x: string; y: null; withheld: true; withheldUntil: ISODate };
export type ChartSeries = { kind: "subject" | "projection" | "benchmark"; label: string; points: ChartPoint[] };
export type ChartThreshold = { y: number; label: string };
export type LineChartData = {
  series: ChartSeries[];
  thresholds: ChartThreshold[];
  dataCap: { x: string; label: string } | null;
  yTicks: number[]; // ascending; first and last set the domain
  unit: string;
  summary: string; // the chart's aria-label: states the finding
};
export type LedgerPeriod = { label: string; yearEnd: ISODate; source: SourceRef; current?: boolean };
/** Parallel arrays cannot tie values[i] to withheld[i] in the type; builders must null values[i] when withheld[i] is set, and the ledger never reads a withheld cell's value. */
export type LedgerRow = { label: string; unit: string; computed?: boolean; values: (string | null)[]; withheld: (ISODate | null)[] };
export type ExhibitKeyMark = "subject" | "projection" | "benchmark" | "threshold" | "withheld";
export type ExhibitData = {
  fileNo: FileNo;
  n: number;
  title: string;
  sub: string | null;
  source: string;
  dataTo: ISODate | null; // null when no figure is old enough to show
  key: { mark: ExhibitKeyMark; label: string }[];
  chart: LineChartData;
  ledger: { periods: LedgerPeriod[]; rows: LedgerRow[] };
};
export type ScenarioData = {
  names: string[];
  assumptions: { label: string; values: string[] }[];
  outputs: { label: string; unit: string; values: string[] }[];
  frozenAtRev: number;
  dataAsOf: ISODate;
};
export type RevisionDiffData = {
  from: { revNo: number; on: ISODate };
  to: { revNo: number; on: ISODate };
  reason: string;
  groups: { location: string; removed: string[]; added: string[] }[];
  fullText: Record<number, string[]>;
};
export type RevisionLogEntry = { revNo: number; on: ISODate; reason: string };

// ---- Home (Task 6) ----
export type RegisterFile = {
  fileNo: FileNo;
  company: string;
  symbol: string | null;
  sector: string | null;
  revNo: number;
  revisedOn: ISODate;
  tests: TestCounts;
  dataAsOf: ISODate;
  href: string;
};
export type WhatChangedEntry = {
  on: ISODate;
  kind: "revision" | "new_file" | "learning" | "process";
  fileNo: FileNo | null;
  subject: { label: string; href: string };
  text: string; // the reason, first
  detail: string; // "Revision R2 · 2 sentences changed · figures to 30 Jun 2026"
};
export type HomeStats = { files: number; sectors: number; lastRevised: ISODate | null; tests: TestCounts; revisions: number; logged: StreakData };
