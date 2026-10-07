import type { UsageRepo } from "@/modules/ingestion/usage-repo";

export type MemoryUsageRepo = UsageRepo & {
  reservations: { id: string; bucket: string; tokens: number; settled: { used: number; status: "used" | "released" } | null }[];
  blocks: { bucket: string; kind: string; until: Date; reason: string }[];
};

/** A ledger that always has room: step tests that need a refusal build their own. The caps are the database's job. */
export function createMemoryUsageRepo(): MemoryUsageRepo {
  const reservations: MemoryUsageRepo["reservations"] = [];
  const blocks: MemoryUsageRepo["blocks"] = [];
  return {
    reservations,
    blocks,
    async reserve(bucket, tokens) {
      const id = `res-${reservations.length + 1}`;
      reservations.push({ id, bucket, tokens, settled: null });
      return { ok: true, id };
    },
    async settle(id, used, status) {
      const r = reservations.find((x) => x.id === id);
      if (r) r.settled = { used, status };
    },
    async block(bucket, kind, until, reason) {
      blocks.push({ bucket, kind, until, reason });
    },
    async totals() {
      const used = reservations.flatMap((r) => (r.settled?.status === "used" ? [r.settled.used] : []));
      const sum = used.reduce((a, b) => a + b, 0);
      return { lastMinute: sum, today: sum, medianPerCall: used.length ? used.sort((a, b) => a - b)[used.length >> 1]! : null };
    },
  };
}
