import { afterEach, describe, expect, it, vi } from "vitest";
import { peekFixtureLetters, resetFixtureLetters } from "./fixture-letters";
import { createLetterPorts, type LettersEnv, lettersMode } from "./index";
import type { ApprovalCheck } from "./letters";

// Phase 5c Task 11: letters are off unless the three settings are set AND this is a Vercel production deployment that is not a test
// or CI run (spec s8.8, s9.1); the fixture only when asked and never on a preview or production deployment (s9.4).

const SET = {
  RESEND_LETTERS_KEY: "re_lettersKEY_1234567890secretsecret",
  LETTERS_FROM: "Aksh Agrawal <letters@akshagrawal.example>",
  LETTERS_SEGMENT_ID: "78261eea-8f8b-4381-83c6-79fa7120f1cf",
};
const BASE: LettersEnv = { ADMIN_EMAIL: "admin@example.com" };
const LOCAL = "http://127.0.0.1:54321";
const FIXTURE: LettersEnv = { ...BASE, DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: LOCAL };
/** The fixture keeps its store in memory in a unit test (never in the directory the e2e reads). */
const memory = { fixtureDirectory: null } as const;
const PROD: LettersEnv = { ...BASE, ...SET, VERCEL_ENV: "production" };
const live: ApprovalCheck = { sendIsLive: async () => true, confirmationIsLive: async () => true };
const never: ApprovalCheck = { sendIsLive: async () => false, confirmationIsLive: async () => false };
const SEND = "f8000000-0000-4000-8000-000000000001";

afterEach(() => {
  resetFixtureLetters();
  vi.restoreAllMocks();
});

describe("createLetterPorts: the real adapter", () => {
  it("is the Resend adapter with all three settings on Vercel production", () => {
    expect(createLetterPorts(PROD, { approvals: live })?.name).toBe("resend");
    expect(lettersMode(PROD)).toEqual({ mode: "resend" });
  });

  it("is null in every combination short of all three settings plus production", () => {
    const names = Object.keys(SET) as (keyof typeof SET)[];
    let checked = 0;
    for (let mask = 0; mask < 8; mask++) {
      for (const VERCEL_ENV of [undefined, "development", "preview", "production", "Production"]) {
        const env: LettersEnv = { ...BASE, VERCEL_ENV };
        names.forEach((name, bit) => { if (mask & (1 << bit)) env[name] = SET[name]; });
        if (mask === 7 && VERCEL_ENV === "production") continue;
        expect(createLetterPorts(env, { approvals: live })).toBeNull();
        expect(lettersMode(env).mode).toBe("off");
        checked++;
      }
    }
    expect(checked).toBe(39);
  });

  it.each([
    ["CI", { CI: "1" }],
    ["CI=true", { CI: "true" }],
    ["NODE_ENV=test", { NODE_ENV: "test" }],
    ["VITEST", { VITEST: "true" }],
  ])("is null in a test or CI run (%s) even with everything else set", (_label, extra) => {
    expect(createLetterPorts({ ...PROD, ...extra }, { approvals: live })).toBeNull();
    expect(lettersMode({ ...PROD, ...extra })).toEqual({ mode: "off", reason: "test_or_ci" });
  });

  it("CI=false or 0 is not a CI run", () => {
    expect(lettersMode({ ...PROD, CI: "false" })).toEqual({ mode: "resend" });
    expect(lettersMode({ ...PROD, CI: "0" })).toEqual({ mode: "resend" });
  });

  it("a setting of the wrong shape is off (not a crash), logged by the setting's name and never its value", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bad of [{ RESEND_LETTERS_KEY: "sk_nope" }, { LETTERS_FROM: "Desk <onboarding@resend.dev>" }, { LETTERS_SEGMENT_ID: "../x" }]) {
      expect(createLetterPorts({ ...PROD, ...bad }, { approvals: live })).toBeNull();
      expect(lettersMode({ ...PROD, ...bad })).toEqual({ mode: "off", reason: "bad_setting" });
    }
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toMatch(/RESEND_LETTERS_KEY|LETTERS_FROM|LETTERS_SEGMENT_ID/);
    for (const value of [SET.RESEND_LETTERS_KEY, "sk_nope", "onboarding@resend.dev", "admin@example.com"]) expect(logged).not.toContain(value);
  });

  it("names the reason when off", () => {
    expect(lettersMode(BASE)).toEqual({ mode: "off", reason: "not_set_up" });
    expect(lettersMode({ ...PROD, VERCEL_ENV: "preview" })).toEqual({ mode: "off", reason: "not_production" });
  });
});

describe("createLetterPorts: the fixture", () => {
  it("is the fixture when DISTRIBUTION_ADAPTER=fixture off Vercel, with or without the settings", () => {
    expect(createLetterPorts(FIXTURE, { approvals: live, ...memory })?.name).toBe("fixture");
    expect(createLetterPorts({ ...FIXTURE, ...SET, VERCEL_ENV: "development" }, { approvals: live, ...memory })?.name).toBe("fixture");
    expect(createLetterPorts({ ...FIXTURE, CI: "1" }, { approvals: live, ...memory })?.name).toBe("fixture");
  });

  it("is refused unless the database is on this machine (review finding 9): a dev server pointed at the hosted project gets nothing", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const url of ["https://abc.supabase.co", "https://127.0.0.1.evil.test", "http://localhost.evil.test:54321", "", undefined]) {
      const env: LettersEnv = { ...BASE, DISTRIBUTION_ADAPTER: "fixture", ...(url === undefined ? {} : { NEXT_PUBLIC_SUPABASE_URL: url }) };
      expect(lettersMode(env), String(url)).toEqual({ mode: "off", reason: "fixture_refused" });
      expect(createLetterPorts(env, { approvals: live, ...memory }), String(url)).toBeNull();
    }
    for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
      expect(lettersMode({ ...BASE, DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: url }), url).toEqual({ mode: "fixture" });
    }
    expect(log).toHaveBeenCalled();
  });

  it("is refused on Vercel preview and production, and the real adapter is not used instead", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const VERCEL_ENV of ["preview", "production"]) {
      expect(createLetterPorts({ ...FIXTURE, VERCEL_ENV }, { approvals: live, ...memory })).toBeNull();
      expect(createLetterPorts({ ...PROD, DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: LOCAL, VERCEL_ENV }, { approvals: live, ...memory })).toBeNull();
      expect(lettersMode({ ...FIXTURE, VERCEL_ENV })).toEqual({ mode: "off", reason: "fixture_refused" });
    }
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(SET.RESEND_LETTERS_KEY);
  });

  it("is wrapped in the approval guard like the real adapter: no live approval, nothing recorded", async () => {
    const off = createLetterPorts(FIXTURE, { approvals: never, ...memory });
    expect(await off?.sender.sendSelfTest({ sendId: SEND }, { subject: "s", html: "h", text: "t" })).toMatchObject({ kind: "not_approved" });
    expect(peekFixtureLetters().emails).toEqual([]);
    const on = createLetterPorts(FIXTURE, { approvals: live, ...memory });
    expect(await on?.sender.sendSelfTest({ sendId: SEND }, { subject: "s", html: "h", text: "t" })).toEqual({ ok: true, value: null });
    expect(peekFixtureLetters().emails.map((e) => e.to)).toEqual(["admin@example.com"]);
  });
});

describe("createLetterPorts: the real adapter is behind the same guard", () => {
  const BID = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";

  it("calls nothing without a live approval, and only the injected fetch with one", async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: BID, name: `letter-${SEND}`, segment_id: SET.LETTERS_SEGMENT_ID, status: "sent" })));
    const off = createLetterPorts(PROD, { approvals: never, fetch: f });
    expect(await off?.sender.sendBroadcast({ sendId: SEND }, BID)).toMatchObject({ ok: false, kind: "not_approved" });
    expect(await off?.sender.sendSelfTest({ sendId: SEND }, { subject: "s", html: "h", text: "t" })).toMatchObject({ kind: "not_approved" });
    expect(f).not.toHaveBeenCalled();
    const on = createLetterPorts(PROD, { approvals: live, fetch: f });
    expect(await on?.sender.sendBroadcast({ sendId: SEND }, BID)).toEqual({ ok: true, value: "already_sent" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe(`https://api.resend.com/broadcasts/${BID}`);
  });
});
