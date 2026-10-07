import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./job-deps", () => ({ createJobHeartbeatRepo: () => ({ record: async () => undefined, latestRuns: async () => ({}) }) }));

import { withCronAuth } from "./cron-auth";

const SECRET = "c".repeat(64);
const authed = new Request("http://x/api/jobs/run", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3100");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("ADMIN_EMAIL", "admin@desk.test");
  vi.stubEnv("CRON_SECRET", SECRET);
});

describe("withCronAuth", () => {
  it("returns only { job, ok } per step: database text stays in the heartbeat row, out of the caller's log", async () => {
    const handler = withCronAuth(async () => [
      { job: "heartbeat:pump", ok: false, detail: 'relation "heartbeats" does not exist (password=hunter2)', ms: 12 },
      { job: "heartbeat:daily", ok: true, detail: "alive", ms: 3 },
    ]);
    const response = await handler(authed);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      ok: false,
      results: [
        { job: "heartbeat:pump", ok: false },
        { job: "heartbeat:daily", ok: true },
      ],
    });
    expect(text).not.toMatch(/hunter2|relation|alive|detail/);
  });

  it("a runner that throws gives a fixed 500 body, never the error text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await withCronAuth(async () => Promise.reject(new Error("password=hunter2")))(authed);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "job runner failed" });
  });
});
