import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { ALERT_STEP, buildAlertDeps } from "./alert-steps";
import { runSteps } from "./steps";

const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown>, db: {} as unknown as Db, serviceCalls: 0 }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => mocks.env }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => {
    mocks.serviceCalls += 1;
    return mocks.db;
  },
}));

beforeEach(() => {
  mocks.serviceCalls = 0;
  mocks.env = { NEXT_PUBLIC_SITE_URL: "https://desk.example.com" };
  mocks.db = { rpc: async () => ({ data: null, error: null }), from: () => { throw new Error("unexpected table read"); } } as unknown as Db;
});

describe("the alerts:email step wiring", () => {
  it("is named alerts:email and builds nothing at import (no secret-key client until it runs)", () => {
    expect(ALERT_STEP.job).toBe("alerts:email");
    expect(mocks.serviceCalls).toBe(0);
  });

  it("builds its deps from the server env when it runs: the desk origin, the secret-key client, a mailer that is off without a key", () => {
    const deps = buildAlertDeps();
    expect(deps.db).toBe(mocks.db);
    expect(deps.origin).toBe("https://desk.example.com");
    expect(deps.mailer()).toBeNull();
    expect(deps.now()).toBeInstanceOf(Date);
  });

  it("makes the Resend mailer once the key and an address are set, and a bad setting throws only when the mailer is asked for", () => {
    mocks.env = { ...mocks.env, RESEND_API_KEY: "re_abcdEFGH_1234567890secretsecret", ALERT_EMAIL: ["shlok@example.com"] };
    expect(buildAlertDeps().mailer()?.name).toBe("resend");
    mocks.env = { ...mocks.env, RESEND_API_KEY: "oops" };
    const deps = buildAlertDeps();
    expect(() => deps.mailer()).toThrow(/RESEND_API_KEY/);
  });

  it("records 'email off' as a green heartbeat while alerts are not switched on", async () => {
    const beats: { job: string; ok: boolean; detail: string }[] = [];
    await runSteps([ALERT_STEP], async (b) => void beats.push(b));
    expect(beats).toEqual([{ job: "alerts:email", ok: true, detail: "email off: RESEND_API_KEY or ALERT_EMAIL is not set" }]);
  });

  it("records a bad setting as a failed heartbeat that names the setting and not its value", async () => {
    mocks.env = { ...mocks.env, RESEND_API_KEY: "oops-secret-value", ALERT_EMAIL: ["shlok@example.com"] };
    const beats: { job: string; ok: boolean; detail: string }[] = [];
    await runSteps([ALERT_STEP], async (b) => void beats.push(b));
    expect(beats[0].ok).toBe(false);
    expect(beats[0].detail).toMatch(/RESEND_API_KEY/);
    expect(beats[0].detail).not.toContain("oops-secret-value");
  });
});
