import { describe, expect, it } from "vitest";
import type { HeartbeatRepo } from "./heartbeat";
import { DAILY_STEPS, PUMP_STEPS, runDaily, runPump } from "./schedule";

function recordingRepo() {
  const beats: { job: string; ok: boolean; detail: string }[] = [];
  const repo: HeartbeatRepo = {
    record: async (beat) => void beats.push(beat),
    latestOk: async () => ({}),
  };
  return { beats, repo };
}

describe("runDaily / runPump", () => {
  it("each clock writes its own heartbeat row on every run", async () => {
    const daily = recordingRepo();
    await runDaily(daily.repo);
    expect(daily.beats).toEqual([{ job: "heartbeat:daily", ok: true, detail: "alive" }]);

    const pump = recordingRepo();
    await runPump(pump.repo);
    expect(pump.beats.map((b) => [b.job, b.ok])).toEqual([["heartbeat:pump", true]]);
  });

  it("writes a heartbeat even when a step fails, through one shared runner", async () => {
    const { beats, repo } = recordingRepo();
    const results = await runPump(repo, [{ job: "x", run: async () => Promise.reject(new Error("nope")) }]);
    expect(results[0]).toMatchObject({ job: "x", ok: false, detail: "nope" });
    expect(beats).toEqual([{ job: "x", ok: false, detail: "nope" }]);
  });

  it("registers one step per clock in Phase 1", () => {
    expect(DAILY_STEPS.map((s) => s.job)).toEqual(["heartbeat:daily"]);
    expect(PUMP_STEPS.map((s) => s.job)).toEqual(["heartbeat:pump"]);
  });
});
