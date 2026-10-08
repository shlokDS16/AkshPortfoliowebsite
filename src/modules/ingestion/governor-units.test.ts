import { describe, expect, it, vi } from "vitest";
import { OCR_BUCKET, OCR_CAPS } from "./caps";
import { callWithinUnits } from "./governor";
import type { Block, UsageRepo } from "./usage-repo";

const NOW = new Date("2026-10-07T10:00:00Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const CAPS = { day: OCR_CAPS.day };

function fakeUsage(refusal?: Block) {
  return {
    reserve: vi.fn(),
    reserveUnits: vi.fn(async () => (refusal ? ({ ok: false, ...refusal } as const) : ({ ok: true, id: "res-1" } as const))),
    settle: vi.fn(async () => {}),
    block: vi.fn(async () => {}),
    totals: vi.fn(),
    earliestReset: vi.fn(),
    refusalsSinceUse: vi.fn(),
  } satisfies UsageRepo;
}
const run = <R>(repo: UsageRepo, call: () => Promise<{ result: R; spent: boolean }>) =>
  callWithinUnits({ usage: repo, now: () => NOW }, OCR_BUCKET, 1, CAPS, call);

describe("the OCR caps (ruling R9: no month counter)", () => {
  it("375 a day for 31 days stays inside the month cap, so the day cap binds first", () => {
    expect(OCR_CAPS.day * 31).toBeLessThanOrEqual(OCR_CAPS.month);
  });
});

describe("callWithinUnits", () => {
  it("defers with the ledger's time and its named reason, and never calls", async () => {
    const repo = fakeUsage({ notBefore: at(3600), reason: "ocr_day" });
    const call = vi.fn();
    expect(await run(repo, call)).toEqual({ kind: "deferred", notBefore: at(3600), reason: "ocr_day" });
    expect(call).not.toHaveBeenCalled();
    expect(repo.settle).not.toHaveBeenCalled();
    expect(repo.reserveUnits).toHaveBeenCalledWith(OCR_BUCKET, 1, CAPS);
  });

  it("never defers into the past", async () => {
    const out = await run(fakeUsage({ notBefore: at(-30), reason: "ocr_day" }), vi.fn());
    expect(out).toEqual({ kind: "deferred", notBefore: at(1), reason: "ocr_day" });
  });

  it("settles the units as used when the provider counted the call", async () => {
    const repo = fakeUsage();
    expect(await run(repo, async () => ({ result: "text", spent: true }))).toEqual({ kind: "called", result: "text" });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 1, "used");
  });

  it("releases the units when the call was refused or did not reach the provider", async () => {
    const repo = fakeUsage();
    expect(await run(repo, async () => ({ result: "refused", spent: false }))).toEqual({ kind: "called", result: "refused" });
    expect(repo.settle).toHaveBeenCalledWith("res-1", 0, "released");
  });

  it("releases the units and rethrows when the call throws", async () => {
    const repo = fakeUsage();
    await expect(run(repo, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(repo.settle).toHaveBeenCalledWith("res-1", 0, "released");
  });
});
