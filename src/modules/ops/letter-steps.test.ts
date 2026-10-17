import { beforeEach, describe, expect, it, vi } from "vitest";
import { peekFixtureLetters, resetFixtureLetters } from "@/lib/providers/fixture-letters";
import type { LetterPorts } from "@/lib/providers";
import { ADMIN, createFakeRpc, fakeSource, fixturePorts, type FakeRpc } from "@/test/fakes/letters-kit";
import type { LetterView } from "@/modules/distribution";
import type { HeartbeatRepo } from "./heartbeat";
import { lettersOn, LETTER_PURGE_STEP, LETTER_RECONCILE_STEP, LETTER_SEND_STEP, letterSteps, runLetterSendNow, sendConfirmationsNow, type LetterRuntime } from "./letter-steps";

const env = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
const touched = vi.hoisted(() => ({ rpc: 0 }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env.value }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    rpc: async () => {
      touched.rpc += 1;
      throw new Error("the database must not be touched while letters are off");
    },
  }),
}));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => ({}) }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));

const ITEM = "10000000-0000-4000-8000-000000000001";
const REV = "20000000-0000-4000-8000-000000000001";
const view: LetterView = {
  itemId: ITEM, revisionId: REV, subject: "What changed", objective: "One note.", note: "",
  entries: [{ revisionId: "30000000-0000-4000-8000-000000000001", kind: "learning", path: "/notes/x", revNo: 1, detail: "Learning note · R1", title: "X", learningObjective: "O", changeReason: null, holdsPosition: null, companyName: null }],
};
let rpc: FakeRpc;
let ports: LetterPorts | null;
const runtime = (): LetterRuntime => ({ rpc, ports, source: fakeSource(view), siteUrl: "https://desk.example" });
const steps = () => letterSteps(runtime);
const run = (job: string) => steps().find((s) => s.job === job)!.run();

beforeEach(() => {
  resetFixtureLetters();
  rpc = createFakeRpc();
  ports = fixturePorts(rpc);
  env.value = {};
  touched.rpc = 0;
});

describe("the letters steps: three jobs, built when they run, never at import", () => {
  it("are named for the heartbeat log, send first (the pump), reconcile and purge after (the daily)", () => {
    expect(steps().map((s) => s.job)).toEqual(["letters:send", "letters:reconcile", "letters:purge"]);
    expect([LETTER_SEND_STEP.job, LETTER_RECONCILE_STEP.job, LETTER_PURGE_STEP.job]).toEqual(["letters:send", "letters:reconcile", "letters:purge"]);
  });

  it("do not build their dependencies until a step runs", () => {
    const make = vi.fn(runtime);
    letterSteps(make);
    expect(make).not.toHaveBeenCalled();
  });
});

describe("letters:send", () => {
  it("says 'letters off' and claims nothing while letters are not set up", async () => {
    ports = null;
    await rpc.approve(ADMIN, ITEM, REV, "subscribers");
    expect(await run("letters:send")).toBe("letters off");
    expect(rpc.calls).toEqual(["approve"]);
  });

  it("says there is nothing to send, and sends nothing, when nothing is approved", async () => {
    expect(await run("letters:send")).toBe("nothing to send");
    expect(peekFixtureLetters().broadcasts).toEqual([]);
  });

  it("sends an approved letter once, and reports counts only", async () => {
    rpc.addReader("secret.reader@example.com");
    await rpc.approve(ADMIN, ITEM, REV, "subscribers");
    const detail = await run("letters:send");
    expect(detail).toBe("sent 1");
    expect(String(detail)).not.toContain("secret.reader");
    expect(peekFixtureLetters().broadcasts.filter((b) => b.status === "sent")).toHaveLength(1);
    expect(await run("letters:send")).toBe("nothing to send");
  });

  it("reports a failed and a waiting send in plain counts", async () => {
    await rpc.approve(ADMIN, ITEM, REV, "subscribers"); // no confirmed reader: it fails
    expect(await run("letters:send")).toBe("failed 1");
  });
});

describe("letters:reconcile (daily)", () => {
  it("says 'letters off' while letters are not set up", async () => {
    ports = null;
    expect(await run("letters:reconcile")).toBe("letters off");
  });

  it("makes Resend's list equal to the confirmed readers and reports counts", async () => {
    rpc.addReader("a@example.com");
    expect(await run("letters:reconcile")).toBe("erased 0, removed 0, added 1, readers 1");
    expect(peekFixtureLetters().contacts.map((c) => c.email)).toEqual(["a@example.com"]);
  });

  it("fails the step, with Resend's cleaned words, when the list cannot be read", async () => {
    ports = { ...fixturePorts(rpc), contacts: { ...fixturePorts(rpc).contacts, listContacts: async () => ({ ok: false, kind: "unavailable", message: "Resend did not answer in time" }) } };
    await expect(run("letters:reconcile")).rejects.toThrow("Resend did not answer in time");
  });
});

describe("letters:purge (daily)", () => {
  it("clears old requests and expired links even while letters are off", async () => {
    ports = null;
    expect(await run("letters:purge")).toBe("nothing to purge");
    expect(rpc.calls).toContain("purge");
  });
});

describe("the desk's 'send now' and the setup check", () => {
  const heartbeats = (): HeartbeatRepo & { beats: { job: string; ok: boolean; detail: string }[] } => {
    const beats: { job: string; ok: boolean; detail: string }[] = [];
    return { beats, record: async (b) => void beats.push(b), latestRuns: async () => ({}) };
  };

  it("runLetterSendNow runs the send step once, under its own heartbeat, and a second press at the same moment is told so", async () => {
    const repo = heartbeats();
    await rpc.approve(ADMIN, ITEM, REV, "self_test");
    const first = runLetterSendNow(repo, runtime);
    expect(await runLetterSendNow(repo, runtime)).toBeNull();
    const results = await first;
    expect(results).toMatchObject([{ job: "letters:send", ok: true, detail: "sent 1" }]);
    expect(repo.beats).toEqual([{ job: "letters:send", ok: true, detail: "sent 1" }]);
    expect(peekFixtureLetters().emails).toHaveLength(1);
  });

  it("sendConfirmationsNow sends through the same ports with the site address", async () => {
    const reader = rpc.addReader("w@example.com", "waiting");
    const batch = await sendConfirmationsNow(ADMIN, [reader.id], runtime);
    expect(batch).toMatchObject({ sent: 1 });
    expect(peekFixtureLetters().emails[0]!.text).toContain("https://desk.example/letters/confirm?t=");
  });

  it("lettersOn follows the settings: off unless all three are set on production, or the fixture is chosen off a deployment", () => {
    env.value = { ADMIN_EMAIL: "a@desk.test" };
    expect(lettersOn()).toBe(false);
    env.value = { ADMIN_EMAIL: "a@desk.test", DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
    expect(lettersOn()).toBe(true);
    env.value = { ADMIN_EMAIL: "a@desk.test", DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", VERCEL_ENV: "production" };
    expect(lettersOn()).toBe(false);
    // The fixture against a database that is not on this machine is off (review finding 9).
    env.value = { ADMIN_EMAIL: "a@desk.test", DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };
    expect(lettersOn()).toBe(false);
    env.value = { ADMIN_EMAIL: "a@desk.test", RESEND_LETTERS_KEY: "re_x".padEnd(20, "x"), LETTERS_FROM: "A <a@verified.example>", LETTERS_SEGMENT_ID: "00000000-0000-4000-8000-000000000001", VERCEL_ENV: "preview" };
    expect(lettersOn()).toBe(false);
  });

  it("with the real wiring and no settings, a step touches no database", async () => {
    env.value = { ADMIN_EMAIL: "a@desk.test" };
    expect(await LETTER_SEND_STEP.run()).toBe("letters off");
    expect(await LETTER_RECONCILE_STEP.run()).toBe("letters off");
    expect(touched.rpc).toBe(0);
  });
});

// Phase 5d (spec s8): the letters are off in production. With every letters setting present (here the local fixture), the send and the reader-list
// steps still say "letters off" and ask the database for nothing; only the retention purge runs (a duty the readers' data is owed, not a send).
describe("the letters steps while the feature is off (Phase 5d)", () => {
  const FIXTURE = { ADMIN_EMAIL: "a@desk.test", DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" } as const;

  it("letters:send and letters:reconcile say 'letters off' and touch no database, although the settings would turn letters on", async () => {
    vi.stubEnv("FEATURES_ON", "");
    env.value = { ...FIXTURE };
    expect(lettersOn()).toBe(false);
    expect(await LETTER_SEND_STEP.run()).toBe("letters off");
    expect(await LETTER_RECONCILE_STEP.run()).toBe("letters off");
    expect(touched.rpc).toBe(0);
    expect(peekFixtureLetters().emails).toEqual([]);
  });

  it("sending the readers' confirmation emails is refused with the fixed 'not set up' answer", async () => {
    vi.stubEnv("FEATURES_ON", "");
    env.value = { ...FIXTURE };
    await expect(sendConfirmationsNow("a@desk.test", [ITEM])).rejects.toThrow();
    expect(touched.rpc).toBe(0);
  });

  it("is the control: the same settings turn letters on under the override the suite runs with", () => {
    env.value = { ...FIXTURE };
    expect(lettersOn()).toBe(true);
  });

  it("a production deployment never takes the override", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    env.value = { ...FIXTURE };
    expect(lettersOn()).toBe(false);
  });
});
