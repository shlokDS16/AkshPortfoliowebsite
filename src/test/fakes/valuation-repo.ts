import { DbError } from "@/lib/supabase/errors";
import type { CellRow, ChosenCell, MachineRead, ScenarioRow, ValuationRepo, VersionRow } from "@/modules/valuation";

// An in-memory ValuationRepo for tests. It enforces what migration 0017 enforces that a test can lean on: a confirmed version is frozen,
// the same cell twice is a unique violation, a scenario name is unique per version.

export type MemoryValuationRepo = ValuationRepo & {
  versions: Map<string, VersionRow>;
  cells: Map<string, CellRow[]>;
  scenarios: Map<string, ScenarioRow>;
  /** Model objects by path, as putModel stored them. */
  models: Map<string, Uint8Array>;
  /** Every saveRead call, in order. */
  reads: { versionId: string; read: MachineRead }[];
  /** The next call of this method throws this error once. */
  failNext(method: keyof ValuationRepo, error: unknown): void;
};

export function versionRow(over: Partial<VersionRow> = {}): VersionRow {
  return {
    id: "aaaaaaaa-0000-4000-8000-0000000000a1", companyId: "cccccccc-0000-4000-8000-000000000001", documentId: "22222222-2222-4222-8222-222222222222",
    versionNo: 1, status: "reading", refusal: null, modelPath: null, sheetCount: null, cellCount: null, formulaCount: null, report: null, engine: null,
    readAt: null, confirmedAt: null, createdAt: "2026-10-15T09:00:00.000Z", ...over,
  };
}

export function createMemoryValuationRepo(): MemoryValuationRepo {
  const versions = new Map<string, VersionRow>();
  const cells = new Map<string, CellRow[]>();
  const scenarios = new Map<string, ScenarioRow>();
  const models = new Map<string, Uint8Array>();
  const reads: MemoryValuationRepo["reads"] = [];
  const failures = new Map<string, unknown>();
  let seq = 0;
  const uuid = () => `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const gate = (method: keyof ValuationRepo) => {
    if (failures.has(method)) {
      const error = failures.get(method);
      failures.delete(method);
      throw error;
    }
  };

  const repo: MemoryValuationRepo = {
    versions, cells, scenarios, models, reads,
    failNext: (method, error) => void failures.set(method, error),
    async getByDocument(documentId) {
      gate("getByDocument");
      return [...versions.values()].find((v) => v.documentId === documentId) ?? null;
    },
    async saveRead(versionId, read) {
      gate("saveRead");
      const v = versions.get(versionId);
      if (!v) throw new DbError("valuation.saveRead", "PGRST116", null);
      if (v.status === "confirmed") throw new DbError("valuation.saveRead", "55000", null);
      reads.push({ versionId, read });
      versions.set(
        versionId,
        read.status === "ready"
          ? { ...v, status: "ready", refusal: null, modelPath: read.modelPath, sheetCount: read.sheetCount, cellCount: read.cellCount, formulaCount: read.formulaCount, report: read.report, engine: read.engine, readAt: read.readAt }
          : { ...v, status: "refused", refusal: read.refusal, modelPath: null, sheetCount: null, cellCount: null, formulaCount: null, report: null, engine: null, readAt: read.readAt },
      );
    },
    async putModel(path, bytes) {
      gate("putModel");
      models.set(path, bytes.slice());
    },
    async getVersion(versionId) {
      gate("getVersion");
      return versions.get(versionId) ?? null;
    },
    async listCells(versionId) {
      gate("listCells");
      return cells.get(versionId) ?? [];
    },
    async listScenarios(versionId) {
      gate("listScenarios");
      return [...scenarios.values()].filter((s) => s.versionId === versionId);
    },
    async getModel(path) {
      gate("getModel");
      const bytes = models.get(path);
      if (!bytes) throw new DbError("valuation.getModel", undefined, null);
      return bytes.slice();
    },
    async confirm(versionId, chosen: ChosenCell[]) {
      gate("confirm");
      const v = versions.get(versionId);
      if (!v) throw new DbError("valuation.confirm", "P0002", null);
      if (v.status !== "ready") throw new DbError("valuation.confirm", "55000", null);
      const seen = new Set<string>();
      for (const c of chosen) {
        const key = `${c.sheet}!${c.addr}`;
        if (seen.has(key)) throw new DbError("valuation.confirm", "23505", null);
        seen.add(key);
      }
      cells.set(versionId, chosen.map((c) => ({ id: uuid(), versionId, ...c })));
      versions.set(versionId, { ...v, status: "confirmed", confirmedAt: "2026-10-15T10:00:00.000Z" });
    },
    async saveScenario(versionId, name, note, values) {
      gate("saveScenario");
      const v = versions.get(versionId);
      if (!v) throw new DbError("valuation.saveScenario", "P0002", null);
      if (v.status !== "confirmed") throw new DbError("valuation.saveScenario", "55000", null);
      if ([...scenarios.values()].some((s) => s.versionId === versionId && s.name === name)) throw new DbError("valuation.saveScenario", "23505", null);
      const id = uuid();
      scenarios.set(id, { id, versionId, name, note, createdAt: "2026-10-15T10:00:00.000Z", values: Object.entries(values).map(([cellId, value]) => ({ cellId, value })) });
      return id;
    },
    async deleteScenario(scenarioId) {
      gate("deleteScenario");
      scenarios.delete(scenarioId);
    },
    async signModel(path, seconds) {
      gate("signModel");
      return `https://storage.test/sign/${path}?ttl=${seconds}`;
    },
  };
  return repo;
}
