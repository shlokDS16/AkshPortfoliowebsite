import type { RateHeaders } from "@/lib/providers/llm";
import { dbError, jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// The provider budget ledger (ADR-004 s4.5; migration 0007). Job code reaches it through ctx.deps.repos.usage (R7).

export type Caps = { readonly tpm: number; readonly tpd: number; readonly rpm: number; readonly rpd: number };
/** What a refusal or a block names (provider_usage.block_reason, migration 0008). */
export type BlockReason = "groq_minute" | "groq_day" | "ocr_day" | "voice_hour" | "voice_day";
const BLOCK_REASONS: readonly string[] = ["groq_minute", "groq_day", "ocr_day", "voice_hour", "voice_day"];
/** Caps for a unit bucket (OCR requests, Whisper seconds); null or absent means no cap on that window (reserve_units). */
export type UnitCaps = { minute?: number | null; hour?: number | null; day?: number | null; rpm?: number | null; rpd?: number | null };
export type Block = { notBefore: Date; reason: BlockReason };

export interface UsageRepo {
  /** Atomic per bucket (advisory lock in reserve_usage). A refusal is a time to retry, never an error. */
  reserve(bucket: string, tokens: number, caps: Caps): Promise<{ ok: true; id: string } | ({ ok: false } & Block)>;
  /** Like reserve, for units (one OCR request, seconds of audio). Refused for a bucket that is not an 'ocr*' or 'whisper' one. */
  reserveUnits(bucket: string, units: number, caps: UnitCaps): Promise<{ ok: true; id: string } | ({ ok: false } & Block)>;
  settle(id: string, tokensUsed: number, status: "used" | "released"): Promise<void>;
  /** Records a hold on the bucket (a header observation or a 429) until `until`. */
  block(bucket: string, kind: "observation" | "rate_limited", until: Date, reason: BlockReason, rate: RateHeaders): Promise<void>;
  /** For meters and the ETA: tokens in the last minute and day (non-released reservations) and the median of the last 20 used. */
  totals(bucket: string): Promise<{ lastMinute: number; today: number; medianPerCall: number | null }>;
  /** When the bucket's rolling 24 hours first frees room: its oldest counted reservation plus 24 hours; null when it has none. */
  earliestReset(bucket: string): Promise<Date | null>;
  /** How many times the provider refused the bucket since its last used reservation (24-hour look-back). */
  refusalsSinceUse(bucket: string): Promise<number>;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MEDIAN_OF = 20;

/** reserve_units reads a null cap as "no cap"; the generated argument types do not say the arguments may be null. */
const noCap = (cap: number | null | undefined): number => (cap ?? null) as number;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function createUsageRepo(db: Db): UsageRepo {
  return {
    async reserve(bucket, tokens, caps) {
      const { data, error } = await db.rpc("reserve_usage", {
        p_bucket: bucket, p_tokens: tokens, p_tpm: caps.tpm, p_tpd: caps.tpd, p_rpm: caps.rpm, p_rpd: caps.rpd,
      });
      if (error) throw jobDbError("reserve_usage", error);
      const row = data?.[0];
      if (!row) throw jobDbError("reserve_usage", { message: "no row", code: "empty" });
      if (row.ok && row.reservation_id) return { ok: true, id: row.reservation_id };
      if (!row.ok && row.not_before && (row.reason === "groq_minute" || row.reason === "groq_day")) {
        return { ok: false, notBefore: new Date(row.not_before), reason: row.reason };
      }
      throw jobDbError("reserve_usage", { message: "malformed row", code: "malformed" });
    },

    async reserveUnits(bucket, units, caps) {
      const { data, error } = await db.rpc("reserve_units", {
        p_bucket: bucket, p_units: units, p_minute_cap: noCap(caps.minute), p_hour_cap: noCap(caps.hour),
        p_day_cap: noCap(caps.day), p_rpm: noCap(caps.rpm), p_rpd: noCap(caps.rpd),
      });
      if (error) throw jobDbError("reserve_units", error);
      const row = data?.[0];
      if (!row) throw jobDbError("reserve_units", { message: "no row", code: "empty" });
      if (row.ok && row.reservation_id) return { ok: true, id: row.reservation_id };
      if (!row.ok && row.not_before && row.reason && BLOCK_REASONS.includes(row.reason)) {
        return { ok: false, notBefore: new Date(row.not_before), reason: row.reason as BlockReason };
      }
      throw jobDbError("reserve_units", { message: "malformed row", code: "malformed" });
    },

    async settle(id, tokensUsed, status) {
      const { error } = await db.from("provider_usage").update({ tokens_used: tokensUsed, status }).eq("id", id);
      if (error) throw jobDbError("settle_usage", error);
    },

    async block(bucket, kind, until, reason, rate) {
      const { error } = await db.from("provider_usage").insert({
        bucket, kind, blocked_until: until.toISOString(), block_reason: reason,
        remaining_tokens: rate.remainingTokens, remaining_requests: rate.remainingRequests, retry_after_s: rate.retryAfterSeconds,
      });
      if (error) throw jobDbError("block_usage", error);
    },

    async totals(bucket) {
      const now = Date.now();
      const [day, used] = await Promise.all([
        db.from("provider_usage").select("at, tokens_est, tokens_used")
          .eq("bucket", bucket).eq("kind", "reservation").neq("status", "released").gt("at", new Date(now - DAY_MS).toISOString()),
        db.from("provider_usage").select("tokens_used")
          .eq("bucket", bucket).eq("kind", "reservation").eq("status", "used").not("tokens_used", "is", null)
          .order("at", { ascending: false }).limit(MEDIAN_OF),
      ]);
      if (day.error) throw dbError("usage_totals", day.error);
      if (used.error) throw dbError("usage_totals", used.error);
      let lastMinute = 0;
      let today = 0;
      for (const r of day.data) {
        const tokens = r.tokens_used ?? r.tokens_est ?? 0;
        today += tokens;
        if (Date.parse(r.at) > now - MINUTE_MS) lastMinute += tokens;
      }
      return { lastMinute, today, medianPerCall: median(used.data.map((r) => r.tokens_used ?? 0)) };
    },

    async earliestReset(bucket) {
      const { data, error } = await db.from("provider_usage").select("at")
        .eq("bucket", bucket).eq("kind", "reservation").neq("status", "released").gt("at", new Date(Date.now() - DAY_MS).toISOString())
        .order("at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw dbError("usage_earliest_reset", error);
      return data ? new Date(Date.parse(data.at) + DAY_MS) : null;
    },

    async refusalsSinceUse(bucket) {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const last = await db.from("provider_usage").select("at")
        .eq("bucket", bucket).eq("kind", "reservation").eq("status", "used").gt("at", since)
        .order("at", { ascending: false }).limit(1).maybeSingle();
      if (last.error) throw dbError("usage_refusals", last.error);
      const { count, error } = await db.from("provider_usage").select("id", { count: "exact", head: true })
        .eq("bucket", bucket).eq("kind", "rate_limited").gt("at", last.data?.at ?? since);
      if (error) throw dbError("usage_refusals", error);
      return count ?? 0;
    },
  };
}

/** The daily sweep keeps the ledger to two days. Returns how many rows went (0 when the answer is not a count). */
export async function pruneUsage(db: Db): Promise<number> {
  const { data, error } = await db.rpc("prune_provider_usage");
  if (error) throw jobDbError("prune_provider_usage", error);
  return typeof data === "number" ? data : 0;
}
