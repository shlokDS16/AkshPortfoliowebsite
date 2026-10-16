import type { SourcesRepo } from "./repo";
import { readStudied } from "./studied";
import type { SourceRecord } from "./types";

// The data of a company file's "Outside sources" panel (spec s6.5): the company's saved sources, the ones the newest revision lists first and in its
// order with the choices it holds, the rest newest first. A listed source that can no longer be listed (archived, no longer on YouTube, or no longer
// attached to the company) stays in the list with the reason, so he can take it off: the gate would refuse the revision otherwise (rule 14.2).

export type PanelProblem = "archived" | "gone" | "detached";
export type PanelRow = {
  record: SourceRecord;
  /** Ticked "Show on the public file": the newest revision lists it. */
  listed: boolean;
  /** "Show its title and picture". Ticked by default for a source not yet listed. */
  showTitle: boolean;
  /** What readers see from him for this source (the revision's words; empty until he writes or copies them). */
  publicNote: string;
  problem: PanelProblem | null;
};

export async function loadPanel(repo: SourcesRepo, companyId: string, structured: unknown): Promise<PanelRow[]> {
  const entries = readStudied(structured);
  const attached = await repo.list({ companyId });
  const byId = new Map(attached.map((r) => [r.id, r]));
  const listed: PanelRow[] = [];
  for (const entry of entries) {
    const record = byId.get(entry.link) ?? (await repo.get(entry.link));
    if (!record) continue;
    const problem: PanelProblem | null = record.archivedAt !== null ? "archived" : record.gone ? "gone" : record.companyIds.includes(companyId) ? null : "detached";
    listed.push({ record, listed: true, showTitle: entry.show, publicNote: entry.note, problem });
  }
  const taken = new Set(listed.map((r) => r.record.id));
  const rest = attached.filter((r) => !taken.has(r.id)).map((record): PanelRow => ({ record, listed: false, showTitle: true, publicNote: "", problem: null }));
  return [...listed, ...rest];
}
