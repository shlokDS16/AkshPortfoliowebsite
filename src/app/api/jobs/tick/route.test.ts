import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  redeemed: true,
  rpcCalls: [] as { name: string; args: unknown }[],
  beats: [] as { job: string; ok: boolean; detail: string }[],
  afterTasks: [] as (() => Promise<void>)[],
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => void fake.afterTasks.push(task),
}));
vi.mock("@/modules/ops/job-deps", () => ({
  createJobHeartbeatRepo: () => ({
    record: async (beat: { job: string; ok: boolean; detail: string }) => void fake.beats.push(beat),
    latestRuns: async () => ({}),
  }),
}));
vi.mock("@/modules/ops/drain", () => ({
  SERVER_PUMP_STEPS: [{ job: "test:step", run: async () => "ran" }],
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    rpc: async (name: string, args: unknown) => {
      fake.rpcCalls.push({ name, args });
      return { data: fake.redeemed, error: null };
    },
  }),
}));

import * as route from "./route";

const TOKEN = "55555555-5555-4555-8555-555555555555";
const post = (headers: Record<string, string> = {}) => route.POST(new Request("http://x/api/jobs/tick", { method: "POST", headers }));

beforeEach(() => {
  fake.redeemed = true;
  fake.rpcCalls = [];
  fake.beats = [];
  fake.afterTasks = [];
});

describe("POST /api/jobs/tick", () => {
  it("is POST only, dynamic, and may run for five minutes", () => {
    expect(Object.keys(route).filter((k) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k))).toEqual([]);
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.maxDuration).toBe(300);
  });

  it("turns away a call without a ticket before any database call", async () => {
    expect((await post()).status).toBe(401);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("turns away a ticket the database does not redeem", async () => {
    fake.redeemed = false;
    expect((await post({ "x-pump-ticket": TOKEN })).status).toBe(401);
    expect(fake.rpcCalls).toEqual([{ name: "redeem_pump_ticket", args: { p_token: TOKEN } }]);
    expect(fake.afterTasks).toHaveLength(0);
  });

  it("answers 202 for a redeemed ticket and runs the pump steps (each with its heartbeat) inside after()", async () => {
    const response = await post({ "x-pump-ticket": TOKEN });
    expect(response.status).toBe(202);
    expect(fake.beats).toEqual([]);
    expect(fake.afterTasks).toHaveLength(1);
    await fake.afterTasks[0]();
    expect(fake.beats).toEqual([{ job: "test:step", ok: true, detail: "ran" }]);
  });
});
