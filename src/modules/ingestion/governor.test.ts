import { describe, expect, it, vi } from "vitest";
import type { LlmResult, LlmUsage, RateHeaders } from "@/lib/providers/llm";
import { EXTRACT_MAX_COMPLETION, GROQ_CAPS, PAGE_CHAR_LIMIT } from "./caps";
import { callWithinBudget, estimateTokens } from "./governor";
import type { Block, UsageRepo } from "./usage-repo";

const NOW = new Date("2026-10-07T10:00:00Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const rate = (extra: Partial<RateHeaders> = {}): RateHeaders => ({ remainingTokens: null, remainingRequests: null, retryAfterSeconds: null, ...extra });
const usage = (total: number): LlmUsage => ({ promptTokens: total - 100, completionTokens: 100, totalTokens: total });

function fakeUsage(refusal?: Block) {
  const repo = {
    reserve: vi.fn(async () => (refusal ? ({ ok: false, ...refusal } as const) : ({ ok: true, id: "res-1" } as const))),
    settle: vi.fn(async () => {}),
    reserveUnits: vi.fn(async () => ({ ok: true, id: "res-u" }) as const),
    block: vi.fn(async () => {}),
    totals: vi.fn(async () => ({ lastMinute: 0, today: 0, medianPerCall: null })),
    earliestReset: vi.fn(async () => null),
    refusalsSinceUse: vi.fn(async () => 0),
  } satisfies UsageRepo;
  return repo;
}

const run = <T>(repo: UsageRepo, call: () => Promise<LlmResult<T>>, estimate = 4_500) =>
  callWithinBudget({ usage: repo, now: () => NOW }, "groq:test-model", estimate, call);

describe("estimateTokens", () => {
  it("is 5,129 for a full page and fits the minute cap", () => {
    const n = estimateTokens("a".repeat(700), "b".repeat(PAGE_CHAR_LIMIT), EXTRACT_MAX_COMPLETION);
    expect(n).toBe(5_129);
    expect(n).toBeLessThanOrEqual(GROQ_CAPS.tpm);
  });
});

describe("callWithinBudget: before the call", () => {
  it("defers with the ledger's time and reason, and never calls", async () => {
    const repo = fakeUsage({ notBefore: at(42), reason: "groq_day" });
    const call = vi.fn();
    const out = await run(repo, call);
    expect(out).toEqual({ kind: "deferred", notBefore: at(42), reason: "groq_day" });
    expect(call).not.toHaveBeenCalled();
    expect(repo.settle).not.toHaveBeenCalled();
    expect(repo.reserve).toHaveBeenCalledWith("groq:test-model", 4_500, GROQ_CAPS);
  });

  it("never defers into the past: a stale ledger time becomes one second from now", async () => {
    const repo = fakeUsage({ notBefore: at(-30), reason: "groq_minute" });
    const out = await run(repo, vi.fn());
    expect(out).toEqual({ kind: "deferred", notBefore: at(1), reason: "groq_minute" });
  });
});

describe("callWithinBudget: a call that can never fit (Task 11 carry)", () => {
  it.each([[GROQ_CAPS.tpm + 1], [0], [-5], [Number.NaN]])("returns too_large for an estimate of %s without touching the ledger", async (estimate) => {
    const repo = fakeUsage();
    const call = vi.fn();
    const out = await run(repo, call, estimate);
    expect(out).toEqual({ kind: "too_large", estimate, cap: Math.min(GROQ_CAPS.tpm, GROQ_CAPS.tpd) });
    expect(repo.reserve).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("lets an estimate at exactly the cap through", async () => {
    const repo = fakeUsage();
    const out = await run(repo, async () => ({ kind: "ok", data: "x", usage: usage(5_000), rate: rate() }), GROQ_CAPS.tpm);
    expect(out.kind).toBe("called");
  });
});

describe("callWithinBudget: settling", () => {
  it("releases the reservation for an unrecoverable 4xx and returns it as called", async () => {
    const repo = fakeUsage();
    const rejected: LlmResult<string> = { kind: "rejected", status: 413, message: "request_too_large", rate: rate() };
    expect(await run(repo, async () => rejected)).toEqual({ kind: "called", result: rejected });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 0, "released");
    expect(repo.block).not.toHaveBeenCalled();
  });

  it("keeps a paid result when recording the header observation fails", async () => {
    const repo = fakeUsage();
    repo.block.mockRejectedValueOnce(new Error("db down"));
    const result: LlmResult<string> = { kind: "ok", data: "x", usage: usage(4_000), rate: rate({ remainingTokens: 3_000 }) };
    expect(await run(repo, async () => result, 4_500)).toEqual({ kind: "called", result });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 4_000, "used");
  });

  it("still throws when recording a 429 block fails: the deferral must not be lost", async () => {
    const repo = fakeUsage();
    repo.block.mockRejectedValueOnce(new Error("db down"));
    await expect(run(repo, async () => ({ kind: "rate_limited", rate: rate({ retryAfterSeconds: 5 }) }))).rejects.toThrow("db down");
  });

  it("settles ok at the provider's own total", async () => {
    const repo = fakeUsage();
    const result: LlmResult<string> = { kind: "ok", data: "x", usage: usage(3_900), rate: rate() };
    const out = await run(repo, async () => result);
    expect(out).toEqual({ kind: "called", result });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 3_900, "used");
    expect(repo.block).not.toHaveBeenCalled();
  });

  it("settles invalid with usage as used", async () => {
    const repo = fakeUsage();
    const result: LlmResult<string> = { kind: "invalid", raw: "{}", issues: ["x"], usage: usage(2_000), rate: rate() };
    expect(await run(repo, async () => result)).toEqual({ kind: "called", result });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 2_000, "used");
  });

  it("settles invalid without usage as used at the estimate", async () => {
    const repo = fakeUsage();
    const result: LlmResult<string> = { kind: "invalid", raw: "", issues: [], usage: null, rate: rate() };
    await run(repo, async () => result);
    expect(repo.settle).toHaveBeenCalledWith("res-1", 4_500, "used");
  });

  it("releases a provider error", async () => {
    const repo = fakeUsage();
    const result: LlmResult<string> = { kind: "provider_error", status: 503, message: "down", rate: rate() };
    expect(await run(repo, async () => result)).toEqual({ kind: "called", result });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 0, "released");
    expect(repo.block).not.toHaveBeenCalled();
  });

  it("releases a thrown call and reports a provider error without a status or the message", async () => {
    const repo = fakeUsage();
    const out = await run(repo, async () => {
      throw new TypeError("secret detail");
    });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 0, "released");
    expect(out).toEqual({
      kind: "called",
      result: { kind: "provider_error", status: null, message: "TypeError", rate: rate() },
    });
  });
});

describe("callWithinBudget: rate limits", () => {
  it("blocks the minute for a short retry-after and defers", async () => {
    const repo = fakeUsage();
    const limited: LlmResult<string> = { kind: "rate_limited", rate: rate({ retryAfterSeconds: 7.5 }) };
    const out = await run(repo, async () => limited);
    expect(repo.settle).toHaveBeenCalledWith("res-1", 0, "released");
    expect(repo.block).toHaveBeenCalledWith("groq:test-model", "rate_limited", at(7.5), "groq_minute", limited.rate);
    expect(out).toEqual({ kind: "deferred", notBefore: at(7.5), reason: "groq_minute" });
  });

  it("blocks the day for a long retry-after", async () => {
    const repo = fakeUsage();
    const limited: LlmResult<string> = { kind: "rate_limited", rate: rate({ retryAfterSeconds: 1_800 }) };
    const out = await run(repo, async () => limited);
    expect(repo.block).toHaveBeenCalledWith("groq:test-model", "rate_limited", at(1_800), "groq_day", limited.rate);
    expect(out).toEqual({ kind: "deferred", notBefore: at(1_800), reason: "groq_day" });
  });

  it("waits 60 s when there is no retry-after", async () => {
    const repo = fakeUsage();
    const out = await run(repo, async () => ({ kind: "rate_limited", rate: rate() }));
    expect(out).toEqual({ kind: "deferred", notBefore: at(60), reason: "groq_minute" });
    expect(repo.block).toHaveBeenCalledWith("groq:test-model", "rate_limited", at(60), "groq_minute", rate());
  });

  it("still defers into the future when Groq says retry in zero seconds", async () => {
    const repo = fakeUsage();
    const out = await run(repo, async () => ({ kind: "rate_limited", rate: rate({ retryAfterSeconds: 0 }) }));
    expect(out).toEqual({ kind: "deferred", notBefore: at(1), reason: "groq_minute" });
  });
});

describe("callWithinBudget: Groq's counters win over the estimate", () => {
  it("blocks the minute when the remaining tokens cannot fit another call, and still returns the result", async () => {
    const repo = fakeUsage();
    const result: LlmResult<string> = { kind: "ok", data: "x", usage: usage(4_000), rate: rate({ remainingTokens: 3_000 }) };
    expect(await run(repo, async () => result, 4_500)).toEqual({ kind: "called", result });
    expect(repo.block).toHaveBeenCalledWith("groq:test-model", "observation", at(60), "groq_minute", result.rate);
  });

  it("blocks an hour when one request is left", async () => {
    const repo = fakeUsage();
    const result: LlmResult<string> = { kind: "ok", data: "x", usage: usage(4_000), rate: rate({ remainingRequests: 1, remainingTokens: 3_000 }) };
    await run(repo, async () => result);
    expect(repo.block).toHaveBeenCalledOnce();
    expect(repo.block).toHaveBeenCalledWith("groq:test-model", "observation", at(3_600), "groq_day", result.rate);
  });

  it("leaves the bucket open when the counters show room", async () => {
    const repo = fakeUsage();
    await run(repo, async () => ({ kind: "ok", data: "x", usage: usage(4_000), rate: rate({ remainingTokens: 5_000, remainingRequests: 20 }) }));
    expect(repo.block).not.toHaveBeenCalled();
  });
});
