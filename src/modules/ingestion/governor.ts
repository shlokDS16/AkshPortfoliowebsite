import type { LlmResult } from "@/lib/providers/llm";
import { GROQ_CAPS } from "./caps";
import type { BlockReason, UnitCaps, UsageRepo } from "./usage-repo";

/** About 3.5 characters per token for the English and numeric text of statements; the completion cap is added whole. */
export const estimateTokens = (system: string, user: string, maxCompletion: number): number =>
  Math.ceil((system.length + user.length) / 3.5) + maxCompletion;

export type BudgetResult<T> =
  | { kind: "deferred"; notBefore: Date; reason: BlockReason }
  /** The estimate can never be reserved (over the smaller of the minute and day caps, or under one token): waiting cannot help. */
  | { kind: "too_large"; estimate: number; cap: number }
  | { kind: "called"; result: LlmResult<T> };

const DAY_AFTER_SECONDS = 600; // a retry-after longer than 10 minutes means the day allowance, not the minute
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const MIN_WAIT_SECONDS = 1; // a deferral is always in the future, whatever the clocks or headers say

/**
 * Reserve, call, settle. Groq's own counters win over our estimate (they also show whether limits are pooled).
 * Over a cap is always a deferral with a time, never a failure.
 */
export async function callWithinBudget<T>(
  deps: { usage: UsageRepo; now: () => Date },
  bucket: string,
  estimate: number,
  call: () => Promise<LlmResult<T>>,
): Promise<BudgetResult<T>> {
  const at = (seconds: number) => new Date(deps.now().getTime() + Math.max(seconds, MIN_WAIT_SECONDS) * 1000);
  const cap = Math.min(GROQ_CAPS.tpm, GROQ_CAPS.tpd);
  // reserve_usage raises for these; refusing here keeps a step from failing on a database error for a page that is simply too big.
  if (!Number.isFinite(estimate) || estimate < 1 || estimate > cap) return { kind: "too_large", estimate, cap };
  const r = await deps.usage.reserve(bucket, estimate, GROQ_CAPS);
  if (!r.ok) {
    const earliest = at(MIN_WAIT_SECONDS);
    return { kind: "deferred", notBefore: r.notBefore.getTime() < earliest.getTime() ? earliest : r.notBefore, reason: r.reason };
  }
  let result: LlmResult<T>;
  try {
    result = await call();
  } catch (error) {
    await deps.usage.settle(r.id, 0, "released");
    return { kind: "called", result: { kind: "provider_error", status: null, message: error instanceof Error ? error.name : "error", rate: NO_RATE } };
  }
  if (result.kind === "rate_limited") {
    await deps.usage.settle(r.id, 0, "released");
    const wait = Math.max(result.rate.retryAfterSeconds ?? 60, MIN_WAIT_SECONDS);
    const reason: BlockReason = wait > DAY_AFTER_SECONDS ? "groq_day" : "groq_minute";
    const notBefore = at(wait);
    await deps.usage.block(bucket, "rate_limited", notBefore, reason, result.rate);
    return { kind: "deferred", notBefore, reason };
  }
  if (result.kind === "provider_error" || result.kind === "rejected") {
    await deps.usage.settle(r.id, 0, "released");
    return { kind: "called", result };
  }
  const used = result.usage?.totalTokens ?? estimate;
  await deps.usage.settle(r.id, used, "used");
  // The answer is already paid for: failing to note a header observation must never lose it (a 429 block above still throws).
  try {
    if (result.rate.remainingRequests !== null && result.rate.remainingRequests <= 1) {
      await deps.usage.block(bucket, "observation", at(3600), "groq_day", result.rate);
    } else if (result.rate.remainingTokens !== null && result.rate.remainingTokens < estimate) {
      await deps.usage.block(bucket, "observation", at(60), "groq_minute", result.rate);
    }
  } catch {
    // The next reservation reads the ledger afresh; Groq's own 429 would defer us if the bucket is really empty.
  }
  return { kind: "called", result };
}

export type UnitsResult<R> = { kind: "deferred"; notBefore: Date; reason: BlockReason } | { kind: "called"; result: R };

/**
 * Reserve units (one OCR request, seconds of audio), call, settle (ruling R9). The call says whether the provider counted
 * it: `spent` true settles the units as used, false releases them (a refusal, a local size check, a network error), and a
 * number settles that many units as used (a voice note reconciled to the length the provider reported).
 * An over-cap ledger is always a deferral with a time. A call that throws releases its units and throws again, so
 * the runner counts a provider retry and no reservation is left holding the allowance.
 */
export async function callWithinUnits<R>(
  deps: { usage: UsageRepo; now: () => Date },
  bucket: string,
  units: number,
  caps: UnitCaps,
  call: () => Promise<{ result: R; spent: boolean | number }>,
): Promise<UnitsResult<R>> {
  const r = await deps.usage.reserveUnits(bucket, units, caps);
  if (!r.ok) {
    const earliest = new Date(deps.now().getTime() + MIN_WAIT_SECONDS * 1000);
    return { kind: "deferred", notBefore: r.notBefore.getTime() < earliest.getTime() ? earliest : r.notBefore, reason: r.reason };
  }
  let out: { result: R; spent: boolean | number };
  try {
    out = await call();
  } catch (error) {
    await deps.usage.settle(r.id, 0, "released");
    throw error;
  }
  const used = typeof out.spent === "number" ? out.spent : out.spent ? units : 0;
  await deps.usage.settle(r.id, used, used > 0 ? "used" : "released");
  return { kind: "called", result: out.result };
}
