import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  beats: [] as { job: string; ok: boolean; detail: string }[],
  ages: [] as { job: string; age_seconds: number; ok: boolean }[],
  failReads: false,
  rpcCalls: [] as string[],
}));

// The job routes' only database door is the secret-key repo; the health route's is the anon client.
vi.mock("@/modules/ops/job-deps", () => ({
  createJobHeartbeatRepo: () => ({
    record: async (beat: { job: string; ok: boolean; detail: string }) => void fake.beats.push(beat),
    latestOk: async () => ({}),
  }),
}));
vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    rpc: async (name: string) => {
      fake.rpcCalls.push(name);
      if (fake.failReads) return { data: null, error: { message: "paused", code: "08006" } };
      return { data: fake.ages, error: null };
    },
  }),
}));

import { GET as health } from "./health/route";
import { GET as daily } from "./cron/daily/route";
import { POST as pump } from "./jobs/run/route";

const SECRET = "c".repeat(64);
const authed = { authorization: `Bearer ${SECRET}` };
const fresh = (job: string, minutes: number, ok = true) => ({ job, age_seconds: minutes * 60, ok });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3100");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("ADMIN_EMAIL", "admin@desk.test");
  vi.stubEnv("CRON_SECRET", SECRET);
  fake.beats.length = 0;
  fake.rpcCalls.length = 0;
  fake.ages = [];
  fake.failReads = false;
});

describe("GET /api/cron/daily", () => {
  it("rejects calls without the bearer secret, uncached, and writes nothing", async () => {
    const response = await daily(new NextRequest("http://x/api/cron/daily"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fake.beats).toEqual([]);
  });

  it("rejects a wrong secret", async () => {
    const response = await daily(new NextRequest("http://x/api/cron/daily", { headers: { authorization: `Bearer ${"d".repeat(64)}` } }));
    expect(response.status).toBe(401);
  });

  it("writes the daily heartbeat", async () => {
    const response = await daily(new NextRequest("http://x/api/cron/daily", { headers: authed }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fake.beats).toEqual([{ job: "heartbeat:daily", ok: true, detail: "alive" }]);
  });
});

describe("POST /api/jobs/run", () => {
  it("rejects calls without the bearer secret", async () => {
    const response = await pump(new NextRequest("http://x/api/jobs/run", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fake.beats).toEqual([]);
  });

  it("writes the pump heartbeat on every call", async () => {
    const call = () => pump(new NextRequest("http://x/api/jobs/run", { method: "POST", headers: authed }));
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, results: [{ job: "heartbeat:pump", ok: true }] });
    await call();
    expect(fake.beats.map((b) => b.job)).toEqual(["heartbeat:pump", "heartbeat:pump"]);
  });
});

describe("GET /api/health", () => {
  it("is 200 and uncached when both clocks are fresh, and returns ages only", async () => {
    fake.ages = [fresh("heartbeat:pump", 10), fresh("heartbeat:daily", 600)];
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fake.rpcCalls).toEqual(["heartbeat_ages"]);
    expect(await response.json()).toEqual({
      ok: true,
      checks: [
        { job: "heartbeat:pump", ageSeconds: 600, ok: true },
        { job: "heartbeat:daily", ageSeconds: 36_000, ok: true },
      ],
    });
  });

  it("is 500 when the pump is stale", async () => {
    fake.ages = [fresh("heartbeat:pump", 180), fresh("heartbeat:daily", 600)];
    const response = await health();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is 500 when no clock has ever run", async () => {
    expect((await health()).status).toBe(500);
  });

  it("is 500 with a fixed message, never the error text, when the database cannot be read", async () => {
    fake.failReads = true;
    const response = await health();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: false, error: "database unreachable" });
  });
});
