import { InvalidInputError } from "@/lib/errors";
import type { Flag, MachineFact } from "@/modules/ingestion/proposed-fact";
import type { ProposalRecord, ReadingRecord, ReviewRepo } from "@/modules/ingestion/review-repo";
import type { MachineReading } from "@/modules/ingestion/readings";

export type MemoryReviewRepo = ReviewRepo & {
  records: ProposalRecord[];
  readings: ReadingRecord[];
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

export function record(id: string, over: { fact?: Partial<MachineFact>; flags?: Flag[]; status?: string; accepted?: unknown; itemId?: string | null; reason?: string; pass?: number; baseKey?: string; superseded?: boolean } = {}): ProposalRecord {
  const fact = machine(over.fact);
  return { id, pageNo: fact.page, pass: over.pass ?? 1, baseKey: over.baseKey ?? `${fact.label}|${fact.period}`, superseded: over.superseded ?? false, machine: fact, accepted: over.accepted ?? null, flags: over.flags ?? [], reason: over.reason ?? "core", status: over.status ?? "pending", itemId: over.itemId ?? null };
}

/** A machine reading of a test: Receivable days, 142 days at 31 March 2026, with a prior of 131, from page 7. */
export const machineReading = (over: Partial<MachineReading> = {}): MachineReading => ({
  current: 142, readingAsOf: "2026-03-31", prior: 131, unit: "days", label: "Receivable days", period: "FY26", valueText: "142", quote: "Receivable days 142 131", page: 7, basis: "consolidated", ...over,
});

export function reading(id: string, over: { testId?: string; machine?: Partial<MachineReading>; status?: string; itemId?: string | null; pass?: number; superseded?: boolean } = {}): ReadingRecord {
  const m = machineReading(over.machine);
  return { id, pageNo: m.page, pass: over.pass ?? 1, testId: over.testId ?? "T1", machine: m, status: over.status ?? "pending", itemId: over.itemId ?? null, superseded: over.superseded ?? false };
}

export function createMemoryReviewRepo(records: ProposalRecord[] = [], readings: ReadingRecord[] = []): MemoryReviewRepo {
  const repo: MemoryReviewRepo = {
    records,
    readings,
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
    async assignItem(_documentId, itemId, proposalIds) {
      const mine = repo.records.filter((r) => proposalIds.includes(r.id) && (r.status === "accepted" || r.status === "edited"));
      for (const r of mine) r.itemId = itemId;
      return mine.length;
    },
    async unassignItem(_documentId, itemId) {
      const mine = repo.records.filter((r) => (r.status === "accepted" || r.status === "edited") && r.itemId === itemId);
      for (const r of mine) r.itemId = null;
      return mine.length;
    },
    async listReadings() {
      return repo.readings.map((r) => ({ ...r }));
    },
    async recordReading(_documentId, id, status) {
      const at = repo.readings.find((r) => r.id === id && r.status !== "filed");
      if (!at) throw new InvalidInputError();
      at.status = status;
      if (status === "rejected") at.itemId = null;
      repo.recorded.push({ id, status });
    },
    async assignReadings(_documentId, itemId, ids) {
      const mine = repo.readings.filter((r) => ids.includes(r.id) && r.status === "accepted");
      for (const r of mine) r.itemId = itemId;
      return mine.length;
    },
    async unassignReadings(_documentId, itemId) {
      const mine = repo.readings.filter((r) => r.status === "accepted" && r.itemId === itemId);
      for (const r of mine) r.itemId = null;
      return mine.length;
    },
    async dropStagedReadings(_documentId, itemId) {
      const mine = repo.readings.filter((r) => r.status === "accepted" && r.itemId === itemId);
      for (const r of mine) Object.assign(r, { status: "rejected", itemId: null });
      return mine.length;
    },
    async dropStaged(_documentId, itemId) {
      const mine = repo.records.filter((r) => (r.status === "accepted" || r.status === "edited") && r.itemId === itemId);
      for (const r of mine) Object.assign(r, { status: "rejected", accepted: null, itemId: null });
      return mine.length;
    },
  };
  return repo;
}
