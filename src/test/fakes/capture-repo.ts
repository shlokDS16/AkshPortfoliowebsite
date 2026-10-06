import { randomUUID } from "node:crypto";
import { DbError } from "@/lib/supabase/errors";
import { asFilingError, type CaptureRecord, type CaptureRepo } from "@/modules/capture";

export type MemoryCaptureRepo = CaptureRepo & { records: CaptureRecord[] };

/** In-memory CaptureRepo; like the table, it refuses a second row with the same client_id. */
export function createMemoryCaptureRepo(): MemoryCaptureRepo {
  const records: CaptureRecord[] = [];
  let tick = 0;
  return {
    records,
    async findByClientId(clientId) {
      return records.find((r) => r.clientId === clientId) ?? null;
    },
    async insertRaw({ rawText, source, clientId }) {
      if (records.some((r) => r.clientId === clientId)) {
        throw new DbError("capture.insertRaw", "23505", "duplicate key value violates unique constraint");
      }
      const record: CaptureRecord = {
        id: randomUUID(),
        rawText,
        parsed: null,
        itemId: null,
        companyId: null,
        themeId: null,
        source,
        clientId,
        createdAt: new Date(Date.UTC(2026, 9, 4, 6, 0, tick++)).toISOString(),
      };
      records.push(record);
      return record;
    },
    async attach(id, patch) {
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) throw new Error(`no capture ${id}`);
      const current = records[index];
      records[index] = {
        ...current,
        parsed: patch.parsed,
        itemId: patch.itemId === undefined ? current.itemId : patch.itemId,
        companyId: patch.companyId === undefined ? current.companyId : patch.companyId,
        themeId: patch.themeId === undefined ? current.themeId : patch.themeId,
      };
    },
    async listSince(sinceIso) {
      return records
        .filter((r) => r.createdAt >= sinceIso)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          id: r.id,
          rawText: r.rawText,
          createdAt: r.createdAt,
          itemId: r.itemId,
          companyId: r.companyId,
          companySymbol: null,
          companyName: null,
          parseError: asFilingError(r.parsed?.error),
        }));
    },
  };
}
