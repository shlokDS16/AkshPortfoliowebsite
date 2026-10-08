import type { MachineResearch } from "@/modules/ingestion/deps";
import type { NewExtraction, ProposalRow, ProposalsRepo } from "@/modules/ingestion/proposals-repo";

export type MemoryProposalsRepo = ProposalsRepo & {
  extractions: (NewExtraction & { id: string })[];
  proposals: ProposalRow[];
};

/** In-memory extractions and proposals, with the database's unique (document, dedupe key) rule. */
export function createMemoryProposalsRepo(): MemoryProposalsRepo {
  const extractions: MemoryProposalsRepo["extractions"] = [];
  const proposals: ProposalRow[] = [];
  return {
    extractions,
    proposals,
    async findCachedExtraction(inputHash, model, promptVersion) {
      const hit = [...extractions].reverse().find((e) => e.inputHash === inputHash && e.model === model && e.promptVersion === promptVersion);
      return hit ? { output: hit.output } : null;
    },
    async findExtractionFor(documentId, pageNo, inputHash, model, promptVersion) {
      const hit = extractions.find((e) => e.documentId === documentId && e.pageNo === pageNo && e.inputHash === inputHash && e.model === model && e.promptVersion === promptVersion);
      return hit ? { id: hit.id, output: hit.output } : null;
    },
    async insertExtraction(row) {
      const id = `ext-${extractions.length + 1}`;
      extractions.push({ ...row, id });
      return id;
    },
    async countForDocument(documentId) {
      return proposals.filter((p) => p.documentId === documentId).length;
    },
    async insertProposals(rows) {
      for (const row of rows) {
        if (!proposals.some((p) => p.documentId === row.documentId && p.dedupeKey === row.dedupeKey)) proposals.push(row);
      }
    },
  };
}

/** A research lookup that holds one file per company. */
export function createMemoryResearch(files: Record<string, { itemId: string; title: string; structured: unknown }> = {}): MachineResearch & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async latestFileForCompany(companyId) {
      asked.push(companyId);
      return files[companyId] ?? null;
    },
  };
}
