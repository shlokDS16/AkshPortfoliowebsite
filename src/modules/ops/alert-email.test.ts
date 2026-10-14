import { describe, expect, it } from "vitest";
import { createFixtureAlertMailer } from "@/lib/providers/fixture-alert-mailer";
import type { Db } from "@/lib/supabase/types";
import { alertEmail, closedMessage, openMessage, redKeys, type AlertDeps } from "./alert-email";
import { describeQueue, describeStale, evaluateHealth, HEALTH_RULES } from "./health";
import type { HeartbeatRepo, LatestRun } from "./heartbeat";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const ORIGIN = "https://desk.example.com";
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

type StepRow = { incident_id: number; kind: "open" | "closed" | "still_open"; keys: string[]; opened_at: string };
type Script = { queueAge?: number | null; stepRows?: StepRow[]; stepError?: boolean; sentError?: boolean };

/** A database double that only knows the three calls the step makes, and keeps what it was asked. */
function fakeDb(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "queue_age") return { data: script.queueAge ?? null, error: null };
      if (name === "alert_step") return script.stepError ? { data: null, error: { message: "boom 123 secret row", code: "XX000" } } : { data: script.stepRows ?? [], error: null };
      if (name === "alert_sent") return script.sentError ? { data: null, error: { message: "boom", code: "XX000" } } : { data: null, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  } as unknown as Db;
  return { db, calls, named: (name: string) => calls.filter((c) => c.name === name) };
}

/** Healthy by default: both clocks ran a minute ago. */
function repoWith(overrides: Record<string, LatestRun | null> = {}): HeartbeatRepo {
  const healthy: Record<string, LatestRun | null> = {
    "heartbeat:pump": { ranAt: minutesAgo(1), ok: true, detail: "alive" },
    "heartbeat:daily": { ranAt: minutesAgo(1), ok: true, detail: "alive" },
  };
  const all = { ...healthy, ...overrides };
  return { record: async () => undefined, latestRuns: async (jobs) => Object.fromEntries(jobs.map((j) => [j, all[j] ?? null])) };
}

function deps(over: Partial<AlertDeps> & { script?: Script; mailer?: AlertDeps["mailer"] } = {}) {
  const fake = fakeDb(over.script);
  const mailer = createFixtureAlertMailer();
  const built: AlertDeps = { db: fake.db, repo: repoWith(), mailer: () => mailer, now: () => NOW, origin: ORIGIN, ...over };
  return { deps: built, mailer, ...fake };
}
const row = (over: Partial<StepRow> = {}): StepRow => ({ incident_id: 3, kind: "open", keys: ["heartbeat:pump"], opened_at: "2026-10-14T03:30:00.000Z", ...over });
const pumpStale = repoWith({ "heartbeat:pump": { ranAt: minutesAgo(180), ok: true, detail: "alive" } });

describe("alerts:email: off", () => {
  it("says so and touches nothing when there is no mailer (RESEND_API_KEY or ALERT_EMAIL unset)", async () => {
    const t = deps({ mailer: () => null });
    expect(await alertEmail(t.deps)).toBe("email off: RESEND_API_KEY or ALERT_EMAIL is not set");
    expect(t.calls).toEqual([]);
  });

  it("a mailer that cannot be built (a setting of the wrong shape) fails the step with the reason, and reads nothing", async () => {
    const t = deps({ mailer: () => { throw new Error("RESEND_API_KEY does not have the shape of a Resend key (re_...)"); } });
    await expect(alertEmail(t.deps)).rejects.toThrow("RESEND_API_KEY does not have the shape");
    expect(t.calls).toEqual([]);
  });
});

describe("alerts:email: the red set", () => {
  it("is the job of every failing check, then queue when the queue is red", () => {
    const report = evaluateHealth({ "heartbeat:pump": { ranAt: minutesAgo(180), ok: true }, "heartbeat:daily": { ranAt: minutesAgo(1), ok: false } }, NOW, 8 * 3600);
    expect(redKeys(report)).toEqual(["heartbeat:pump", "heartbeat:daily", "queue"]);
  });

  it("is empty for a healthy report, and a never-run optional step is not red", () => {
    const report = evaluateHealth({ "heartbeat:pump": { ranAt: minutesAgo(1), ok: true }, "heartbeat:daily": { ranAt: minutesAgo(1), ok: true } }, NOW, null);
    expect(redKeys(report)).toEqual([]);
  });

  it("passes it to alert_step: [] when healthy, the stale job when not, 'queue' when documents are stuck", async () => {
    const healthy = deps();
    expect(await alertEmail(healthy.deps)).toBe("no incident");
    expect(healthy.named("alert_step")[0].args).toEqual({ p_red: [] });
    const stale = deps({ repo: pumpStale, script: { queueAge: 8 * 3600 } });
    await alertEmail(stale.deps);
    expect(stale.named("alert_step")[0].args).toEqual({ p_red: ["heartbeat:pump", "queue"] });
  });

  it("does not put alerts:email itself in the health rules (an alerting failure must not become an incident loop)", () => {
    expect(HEALTH_RULES.map((r) => r.job)).not.toContain("alerts:email");
  });
});

describe("alerts:email: what the database answers", () => {
  it("no row: no incident, nothing sent", async () => {
    const t = deps();
    expect(await alertEmail(t.deps)).toBe("no incident");
    expect(t.mailer.attempts).toBe(0);
  });

  it("still_open: says so and sends nothing (one email per incident)", async () => {
    const t = deps({ repo: pumpStale, script: { stepRows: [row({ kind: "still_open" })] } });
    expect(await alertEmail(t.deps)).toBe("incident 3 still open");
    expect(t.mailer.attempts).toBe(0);
    expect(t.named("alert_sent")).toEqual([]);
  });

  it("open: sends once, records the send, and says so", async () => {
    const t = deps({ repo: pumpStale, script: { stepRows: [row()] } });
    expect(await alertEmail(t.deps)).toBe("opened incident 3, emailed");
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0].idempotencyKey).toBe("incident-3-open");
    expect(t.mailer.sent[0].subject).toBe("Aksh Research Desk: something needs a look");
    expect(t.named("alert_sent")).toEqual([{ name: "alert_sent", args: { p_id: 3, p_kind: "open" } }]);
  });

  it("closed: sends the all-clear once, records the send, and says so", async () => {
    const t = deps({ script: { stepRows: [row({ kind: "closed" })] } });
    expect(await alertEmail(t.deps)).toBe("closed incident 3, emailed");
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0].idempotencyKey).toBe("incident-3-closed");
    expect(t.mailer.sent[0].subject).toBe("Aksh Research Desk: all clear again");
    expect(t.named("alert_sent")).toEqual([{ name: "alert_sent", args: { p_id: 3, p_kind: "closed" } }]);
  });
});

describe("alerts:email: failures", () => {
  it("a send failure fails the step with the provider's words and does NOT mark the email sent (the next tick retries)", async () => {
    const t = deps({ repo: pumpStale, script: { stepRows: [row()] }, mailer: () => createFixtureAlertMailer({ fail: "Resend answered 403: You can only send testing emails to your own email address." }) });
    await expect(alertEmail(t.deps)).rejects.toThrow("Resend answered 403: You can only send testing emails to your own email address.");
    expect(t.named("alert_sent")).toEqual([]);
  });

  it("a failure to record the send fails the step (the retry is harmless: the idempotency key drops the repeat)", async () => {
    const t = deps({ repo: pumpStale, script: { stepRows: [row()], sentError: true } });
    await expect(alertEmail(t.deps)).rejects.toThrow(/ops\.alertSent/);
    expect(t.mailer.sent).toHaveLength(1);
  });

  it("a database failure in alert_step fails the step with the operation and code only, and sends nothing", async () => {
    const t = deps({ script: { stepError: true } });
    const error = await alertEmail(t.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain("ops.alertStep");
    expect(t.mailer.attempts).toBe(0);
  });

  it("a mailer that throws instead of answering (a bug in an adapter) is a failed step, not a crash of the run", async () => {
    const broken = { name: "fixture" as const, send: async () => { throw new Error("adapter bug"); } };
    const t = deps({ repo: pumpStale, script: { stepRows: [row()] }, mailer: () => broken });
    await expect(alertEmail(t.deps)).rejects.toThrow(/failed unexpectedly/);
    expect(t.named("alert_sent")).toEqual([]);
  });
});

describe("the open email", () => {
  const report = evaluateHealth(
    { "heartbeat:pump": { ranAt: minutesAgo(180), ok: true, detail: "SECRET-DETAIL-pump" }, "heartbeat:daily": { ranAt: minutesAgo(40 * 60), ok: true, detail: "SECRET-DETAIL-daily" } },
    NOW,
    8 * 3600,
  );

  it("has one line per red item, from describeStale and describeQueue, then the reassurance and what to do", () => {
    const { subject, text } = openMessage(report, ["heartbeat:pump", "heartbeat:daily", "queue"], ORIGIN);
    expect(subject).toBe("Aksh Research Desk: something needs a look");
    for (const line of [...describeStale(report), describeQueue(report) as string]) {
      expect(text).toContain(line.charAt(0).toUpperCase() + line.slice(1));
    }
    expect(text.indexOf("Nothing you saved is lost.")).toBeGreaterThan(text.lastIndexOf("Documents have not moved"));
    expect(text).toContain(`Open the desk to see the details: ${ORIGIN}/desk`);
    expect(text).toContain("If it is still red tomorrow, tell Shlok.");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("holds no heartbeat detail beyond what describeStale shows, no stack trace, no key", () => {
    const { text } = openMessage(report, ["heartbeat:pump"], ORIGIN);
    expect(text).not.toContain("SECRET-DETAIL");
    expect(text).not.toMatch(/\bat \S+ \(|node_modules|re_[A-Za-z0-9]{6}/);
  });

  it("uses no em dashes", () => {
    const { subject, text } = openMessage(report, ["heartbeat:pump"], ORIGIN);
    expect(subject + text).not.toMatch(/[—–]/);
  });

  it("when the checks have recovered since the incident opened (a retry within the hold), still says what was red", () => {
    const green = evaluateHealth({ "heartbeat:pump": { ranAt: minutesAgo(1), ok: true }, "heartbeat:daily": { ranAt: minutesAgo(1), ok: true } }, NOW, null);
    const { text } = openMessage(green, ["heartbeat:pump", "queue", "something:unknown"], ORIGIN);
    expect(text).toContain("The 15-minute pump needed a look a little while ago, and may have recovered.");
    expect(text).toContain("Documents were not moving a little while ago, and may have recovered.");
    expect(text).toContain("Something else needed a look a little while ago, and may have recovered.");
    expect(text).not.toContain("something:unknown");
  });

  it("links the desk at the origin it is given", () => {
    expect(openMessage(report, ["heartbeat:pump"], "https://x.example").text).toContain("https://x.example/desk");
  });
});

describe("the closed email", () => {
  it("says everything is running again, when it was first noticed in India time, and links the desk", () => {
    const { subject, text } = closedMessage("2026-10-14T03:30:00.000Z", ORIGIN);
    expect(subject).toBe("Aksh Research Desk: all clear again");
    expect(text).toContain("Everything is running again (it was first noticed 2026-10-14 09:00 IST).");
    expect(text).toContain(`${ORIGIN}/desk`);
    expect(subject + text).not.toMatch(/[—–]/);
  });
});
