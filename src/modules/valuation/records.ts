// The rows the repo returns (migration 0017). Browser-safe: types only. A version row holds MACHINE-READ facts; a cell row, a scenario and
// its values hold ONLY Aksh's words and choices (spec s9). Nothing here mixes the two.
import type { RefusalCode } from "./refusal";
import type { ModelObject, Report } from "./types";

export type VersionStatus = "reading" | "ready" | "confirmed" | "refused";

export type VersionRow = {
  id: string;
  companyId: string;
  documentId: string;
  versionNo: number;
  status: VersionStatus;
  refusal: RefusalCode | null;
  /** models/<id>.json in the private documents bucket. */
  modelPath: string | null;
  sheetCount: number | null;
  cellCount: number | null;
  formulaCount: number | null;
  report: Report | null;
  engine: ModelObject["engine"] | null;
  readAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

/** What the xlsx_read step writes to a version: the nine machine columns, and nothing of Aksh's. */
export type MachineRead =
  | { status: "ready"; modelPath: string; sheetCount: number; cellCount: number; formulaCount: number; report: Report; engine: ModelObject["engine"]; readAt: string }
  | { status: "refused"; refusal: RefusalCode; readAt: string };

export type CellRole = "input" | "output";

/** One cell Aksh designated. `label` is HIS words, or null (then the page shows the sheet label, marked as the sheet's). */
export type CellRow = { id: string; versionId: string; sheet: string; addr: string; role: CellRole; label: string | null };
export type ChosenCell = { sheet: string; addr: string; role: CellRole; label: string | null };

export type ScenarioRow = { id: string; versionId: string; name: string; note: string; createdAt: string; values: { cellId: string; value: number }[] };
