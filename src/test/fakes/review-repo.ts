import { InvalidInputError } from "@/lib/errors";
import type { Flag, MachineFact } from "@/modules/ingestion/proposed-fact";
import type { ProposalRecord, ReviewRepo } from "@/modules/ingestion/review-repo";

export type MemoryReviewRepo = ReviewRepo & {
  records: ProposalRecord[];
  texts: Map<number, string>;
  file: { itemId: string; title: string } | null;
  name: string | null;
  recorded: { id: string; status: string }[];
};

/** A machine reading as extract_page stores it: P&L, FY26, consolidated, with a prior year. */
export const machine = (over: Partial<MachineFact> = {}): MachineFact => ({
  label: "Revenue from operations", value: 1284, valueText: "1,284.00", page: 4, locator: "p. 4", quote: "Revenue from operations 1,284.00 1,102.00",
  basis: "consolidated", topic: "P&L", statement: "pl", unit: "₹ cr", period: "FY26", asOf: "2026-03-31",
  prior: { label: "FY25", value: 1102, valueText: "1,102.00" }, ...over,
});

export function record(id: string, over: { fact?: Partial<MachineFact>; flags?: Flag[]; status?: string; accepted?: unknown; itemId?: string | null; reason?: string } = {}): ProposalRecord {
  const fact = machine(over.fact);
  return { id, pageNo: fact.page, machine: fact, accepted: over.accepted ?? null, flags: over.flags ?? [], reason: over.reason ?? "core", status: over.status ?? "pending", itemId: over.itemId ?? null };
}

export function createMemoryReviewRepo(records: ProposalRecord[] = []): MemoryReviewRepo {
  const repo: MemoryReviewRepo = {
    records,
    texts: new Map(),
    file: null,
    name: null,
    recorded: [],
    async list() {
      return repo.records.map((r) => ({ ...r }));
    },
    async pageTexts(_documentId, pages) {
      return new Map(pages.flatMap((p) => (repo.texts.has(p) ? [[p, repo.texts.get(p)!] as const] : [])));
    },
    async fileOf() {
      return repo.file;
    },
    async companyName() {
      return repo.name;
    },
    async record(_documentId, id, decided) {
      const at = repo.records.find((r) => r.id === id);
      if (!at) throw new InvalidInputError();
      at.status = decided.status;
      at.accepted = decided.acceptedValue;
      if (decided.status === "rejected") at.itemId = null;
      repo.recorded.push({ id, status: decided.status });
    },
    async assignItem(_documentId, itemId) {
      const mine = repo.records.filter((r) => (r.status === "accepted" || r.status === "edited") && r.itemId !== itemId);
      for (const r of mine) r.itemId = itemId;
      return repo.records.filter((r) => (r.status === "accepted" || r.status === "edited") && r.itemId === itemId).length;
    },
  };
  return repo;
}
