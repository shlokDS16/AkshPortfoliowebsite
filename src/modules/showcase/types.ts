import type { FileNo, HoldsPosition, ISODate } from "@/lib/desk-types";
import type {
  DatelineData, ExhibitData, FactGroup, KillTest, RailSection, ReadFirstNote, RevisionDiffData, RevisionLogEntry, ScenarioData,
  SourceListItem, UsedInRow, ViewBlockData,
} from "@/lib/view-types";
import type { ItemKind } from "@/modules/research";

export type { ItemKind };

export type PublicItemRow = {
  id: string; kind: ItemKind; slug: string; title: string; companyId: string | null; themeId: string | null;
  publishedAt: string; dataAsOf: ISODate | null; learningObjective: string | null; holdsPosition: HoldsPosition | null;
  revisionId: string; revNo: number; bodyMd: string; structured: unknown; revisedAt: string; fileNo: number | null;
};
export type PublicRevisionRow = { id: string; itemId: string; revNo: number; bodyMd: string; structured: unknown; changeReason: string | null; createdAt: string };
export type PublicCompanyRow = { id: string; slug: string; name: string; symbol: string | null; sector: string | null };
export type PublicSnapshot = { items: PublicItemRow[]; revisions: PublicRevisionRow[]; companies: PublicCompanyRow[]; captureDays: ISODate[]; today: ISODate };

export interface ShowcaseRepo {
  listItems(): Promise<PublicItemRow[]>;
  listRevisions(): Promise<PublicRevisionRow[]>;
  listCompanies(): Promise<PublicCompanyRow[]>;
  captureDays(days: number): Promise<ISODate[]>;
}

export type FileView = {
  fileNo: FileNo; companySlug: string; company: string; symbol: string | null; sector: string | null; oneLiner: string | null;
  title: string; learningObjective: string; holdsPosition: HoldsPosition; dataAsOf: ISODate; reviewedOn: ISODate; revNo: number;
  dateline: DatelineData; readFirst: ReadFirstNote[]; view: ViewBlockData[]; tests: KillTest[]; factGroups: FactGroup[];
  factCount: number; sources: SourceListItem[]; exhibits: ExhibitData[]; scenario: ScenarioData | null;
  diff: RevisionDiffData | null; log: RevisionLogEntry[]; sections: RailSection[];
};
export type ShareCardModel = { fileNo: FileNo; revNo: number; company: string; title: string; learningObjective: string; revisedOn: ISODate; dataAsOf: ISODate };
export type NoteKind = "learning" | "process";
export type NoteSummary = { slug: string; title: string; learningObjective: string; revisedOn: ISODate; minutes: number; href: string };
export type NoteView = {
  kind: NoteKind; slug: string; title: string; learningObjective: string; revisedOn: ISODate; firstWrittenOn: ISODate; revNo: number;
  revCount: number; body: ViewBlockData[]; usedIn: UsedInRow[]; minutes: number; holdsPosition: HoldsPosition | null; dataAsOf: ISODate | null;
};
