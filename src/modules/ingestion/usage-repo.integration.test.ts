import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createUsageRepo, pruneUsage, type Caps } from "./usage-repo";

// Integration: the real reserve_usage and ledger on the LOCAL stack, as service_role (the secret key). Skipped, with
// the reason printed, when no local stack answers (`pnpm supabase start`). Never reads hosted credentials.
function localStack(): { url: string; secretKey: string } | null {
  try {
    const out = execSync("pnpm supabase status -o env", { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] });
    const get = (name: string) => new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m").exec(out)?.[1];
    const url = get("API_URL");
    const secretKey = get("SECRET_KEY");
    return url && secretKey ? { url, secretKey } : null;
  } catch {
    return null;
  }
}

const stack = localStack();
if (!stack) console.warn("usage-repo.integration: no local Supabase stack, skipping (run `pnpm supabase start`)");

const CAPS: Caps = { tpm: 1_000, tpd: 5_000, rpm: 5, rpd: 50 };

describe.skipIf(!stack)("createUsageRepo against reserve_usage on the local database (service_role)", () => {
  const db = createClient<Database>(stack?.url ?? "", stack?.secretKey ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  const repo = createUsageRepo(db);
  const bucket = () => `it:${randomUUID()}`;

  it("reserves, refuses over the minute cap with a future time, and frees room on a release", async () => {
    const b = bucket();
    const first = await repo.reserve(b, 600, CAPS);
    expect(first.ok).toBe(true);
    const second = await repo.reserve(b, 600, CAPS);
    expect(second.ok).toBe(false);
    if (second.ok || !first.ok) throw new Error("unreachable");
    expect(second.reason).toBe("groq_minute");
    expect(second.notBefore.getTime()).toBeGreaterThan(Date.now());
    await repo.settle(first.id, 0, "released");
    expect((await repo.reserve(b, 600, CAPS)).ok).toBe(true);
  });

  it("settles at the provider's total, and totals counts it with the median per call", async () => {
    const b = bucket();
    const r = await repo.reserve(b, 800, CAPS);
    if (!r.ok) throw new Error("expected room");
    await repo.settle(r.id, 300, "used");
    expect(await repo.totals(b)).toEqual({ lastMinute: 300, today: 300, medianPerCall: 300 });
    // 300 used leaves room for 700 in the minute, not 800.
    expect((await repo.reserve(b, 800, CAPS)).ok).toBe(false);
    expect((await repo.reserve(b, 700, CAPS)).ok).toBe(true);
  });

  it("honours a recorded block until its time, with its reason", async () => {
    const b = bucket();
    const until = new Date(Date.now() + 3_600_000);
    await repo.block(b, "observation", until, "groq_day", { remainingTokens: 10, remainingRequests: 1, retryAfterSeconds: null });
    const out = await repo.reserve(b, 100, CAPS);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toBe("groq_day");
    expect(out.notBefore.getTime()).toBe(until.getTime());
  });

  it("refuses over the day cap as groq_day", async () => {
    const b = bucket();
    const wide: Caps = { tpm: 1_000, tpd: 1_200, rpm: 50, rpd: 50 };
    const r = await repo.reserve(b, 1_000, wide);
    if (!r.ok) throw new Error("expected room");
    await repo.settle(r.id, 1_000, "used");
    const out = await repo.reserve(b, 500, wide);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("groq_day");
  });

  describe("reserve_units for the OCR bucket (migration 0008)", () => {
    const ocr = () => `ocr-it-${randomUUID()}`;

    it("reserves one request at a time against a day cap, refuses over it as ocr_day with the reset time, and frees on release", async () => {
      const b = ocr();
      const first = await repo.reserveUnits(b, 1, { day: 2 });
      const second = await repo.reserveUnits(b, 1, { day: 2 });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error("expected room");
      const third = await repo.reserveUnits(b, 1, { day: 2 });
      expect(third.ok).toBe(false);
      if (third.ok) throw new Error("unreachable");
      expect(third.reason).toBe("ocr_day");
      expect(third.notBefore.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      await repo.settle(second.id, 0, "released");
      expect((await repo.reserveUnits(b, 1, { day: 2 })).ok).toBe(true);
    });

    it("refuses a bucket that is not an OCR or voice one, loudly", async () => {
      await expect(repo.reserveUnits(`it:${randomUUID()}`, 1, { day: 5 })).rejects.toThrow(/reserve_units/);
    });

    it("honours a recorded ocr_day block, and says when the day frees and how many refusals came since the last use", async () => {
      const b = ocr();
      const used = await repo.reserveUnits(b, 1, { day: 5 });
      if (!used.ok) throw new Error("expected room");
      await repo.settle(used.id, 1, "used");
      expect(await repo.refusalsSinceUse(b)).toBe(0);
      const reset = await repo.earliestReset(b);
      expect(reset!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      const until = new Date(Date.now() + 3_600_000);
      await repo.block(b, "rate_limited", until, "ocr_day", { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null });
      await repo.block(b, "rate_limited", until, "ocr_day", { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null });
      expect(await repo.refusalsSinceUse(b)).toBe(2);
      const out = await repo.reserveUnits(b, 1, { day: 5 });
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error("unreachable");
      expect(out.reason).toBe("ocr_day");
      expect(out.notBefore.getTime()).toBe(until.getTime());
      expect(await repo.earliestReset(`ocr-it-${randomUUID()}`)).toBeNull();
    });
  });

  it("prunes through the service role (nothing is older than 48 hours here)", async () => {
    await expect(pruneUsage(db)).resolves.toEqual(expect.any(Number));
  });
});
