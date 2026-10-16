import type { FileNo, HoldsPosition, ISODate } from "@/lib/desk-types";
import type {
  DatelineData, ExhibitData, FactGroup, KillTest, RailSection, ReadFirstNote, RevisionDiffData, RevisionLogEntry, ScenarioData,
  SourceListItem, UsedInRow, ViewBlockData,
} from "@/lib/view-types";
import type { CaseEventKind, CasePoint } from "@/modules/casefile";
import type { ItemKind } from "@/modules/research";

export type { ItemKind };

export type PublicItemRow = {
  id: string; kind: ItemKind; slug: string; title: string; companyId: string | null; themeId: string | null;
  publishedAt: string; dataAsOf: ISODate | null; learningObjective: string | null; holdsPosition: HoldsPosition | null;
  revisionId: string; revNo: number; bodyMd: string; structured: unknown; revisedAt: string; fileNo: number | null;
};
export type PublicRevisionRow = { id: string; itemId: string; revNo: number; bodyMd: string; structured: unknown; changeReason: string | null; createdAt: string };
export type PublicCompanyRow = { id: string; slug: string; name: string; symbol: string | null; sector: string | null };
/** Task 9: the page a filed fact was checked against (public_fact_checks). Page number only; never a machine value. */
export type PublicFactCheck = { itemId: string; factId: string; pageNo: number };
/** Plan 4: a public concept (public_themes: id, slug, name; never a description or an edge). */
export type PublicConceptRow = { id: string; slug: string; name: string };
/** Plan 4: public_concept_links. `position` is the place in the revision's array and has gaps: the primary concept is the lowest present. */
export type PublicConceptLink = { itemId: string; revisionId: string; conceptId: string; position: number };
/**
 * `concepts` and `conceptLinks` are optional loads (D60): a failed read, or a snapshot cached by an earlier deployment, has none, and every
 * reader treats a missing field as empty.
 */
export type PublicSnapshot = {
  items: PublicItemRow[]; revisions: PublicRevisionRow[]; companies: PublicCompanyRow[]; captureDays: ISODate[]; factChecks: PublicFactCheck[];
  concepts: PublicConceptRow[]; conceptLinks: PublicConceptLink[]; today: ISODate;
};

export interface ShowcaseRepo {
  listItems(): Promise<PublicItemRow[]>;
  listRevisions(): Promise<PublicRevisionRow[]>;
  listCompanies(): Promise<PublicCompanyRow[]>;
  captureDays(days: number): Promise<ISODate[]>;
  factChecks(): Promise<PublicFactCheck[]>;
  listConcepts(): Promise<PublicConceptRow[]>;
  listConceptLinks(): Promise<PublicConceptLink[]>;
}

export type FileView = {
  fileNo: FileNo; companySlug: string; company: string; symbol: string | null; sector: string | null; oneLiner: string | null;
  title: string; learningObjective: string; holdsPosition: HoldsPosition; dataAsOf: ISODate; reviewedOn: ISODate; revNo: number;
  dateline: DatelineData; readFirst: ReadFirstNote[]; view: ViewBlockData[]; tests: KillTest[]; factGroups: FactGroup[];
  factCount: number; sources: SourceListItem[]; exhibits: ExhibitData[]; scenario: ScenarioData | null;
  diff: RevisionDiffData | null; log: RevisionLogEntry[]; sections: RailSection[]; concepts: ItemConcept[];
};
/**
 * What a share card shows (Plan 5a, spec s4.4). `kicker` (a line above the title) and `aside` (a fixed sentence under the standfirst) are
 * optional. Text is his linted words, cut to a slot's budget, plus fixed copy and dates; never a figure of a case.
 */
export type ShareCardContent = {
  tag: string; number: string; sub: string; kicker?: string; title: string; standfirst: string; aside?: string; footerLeft: string; footerRight: string;
};
export type ShareCardModel = { fileNo: FileNo; revNo: number; company: string; title: string; learningObjective: string; revisedOn: ISODate; dataAsOf: ISODate };
export type NoteKind = "learning" | "process";
export type NoteSummary = { slug: string; title: string; learningObjective: string; revisedOn: ISODate; minutes: number; href: string };
export type NoteView = {
  kind: NoteKind; slug: string; title: string; learningObjective: string; revisedOn: ISODate; firstWrittenOn: ISODate; revNo: number;
  revCount: number; body: ViewBlockData[]; usedIn: UsedInRow[]; minutes: number; holdsPosition: HoldsPosition | null; dataAsOf: ISODate | null;
  concepts: ItemConcept[];
};

// ---- Concepts (Plan 4 Task 5). His words: names, titles, learning objectives. The machine's: dates, counts, the fixed sentences. ----
/** One entry of an item's "Concepts" line: the public concepts of its CURRENT gated revision. */
export type ItemConcept = { slug: string; name: string; href: string };
export type ConceptSummary = { slug: string; name: string; href: string; notes: number; files: number; countLine: string };
/** A public item that uses a concept. `href` is null for a kind with no public page; `fileNo` only for a file. */
export type ConceptItem = { title: string; label: string | null; fileNo: string | null; href: string | null; learningObjective: string; since: ISODate };
export type ConceptView = { slug: string; name: string; standfirst: string; notes: ConceptItem[]; applied: ConceptItem[] };

// ---- Ledger case studies (Plan 3b, spec s33). Every string a reader sees is built here, so a test can read all of it. ----
/** One revealed entry. `words` are his; every other field is the machine's. */
export type CaseEntryView = {
  seq: number; kind: CaseEventKind; kindLabel: string; sealedOn: ISODate; lead: string | null; words: string; writtenLine: string; sealedLabel: string;
  hash: string; prevHash: string; canonical: string; listedLine: string | null; findLine: string | null;
};
export type CaseBodyBlock = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul"; items: string[] };
export type CaseChartView = { points: CasePoint[]; company: string; from: ISODate; to: ISODate; alt: string; caption: string };
export type CaseStudyView = {
  slug: string; company: string; symbol: string; title: string; standfirst: string; holdsPosition: HoldsPosition; reviewedOn: ISODate; revNo: number; revCount: number;
  dateline: { writtenOn: ISODate; closedOn: ISODate; figuresTo: ISODate };
  expected: string; opening: CaseEntryView; revisions: CaseEntryView[];
  happened: { chart: CaseChartView | null; priceLine: string; closedLine: string; closing: CaseEntryView };
  learned: { call: string | null; mistakes: string | null; entry: CaseEntryView }[];
  lookingBack: CaseBodyBlock[]; checks: CaseEntryView[]; publicFile: { url: string; since: ISODate } | null;
};
export type CaseSummary = { slug: string; href: string; company: string; title: string; standfirst: string; closedMonth: string };
export type MistakeEntry = { slug: string; href: string; company: string; title: string; closedMonth: string; call: string; mistakes: string; entry: CaseEntryView };
