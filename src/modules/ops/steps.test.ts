import { describe, expect, it } from "vitest";
import { runSteps } from "./steps";

describe("runSteps", () => {
  it("runs every step even when one throws, writing one heartbeat per step", async () => {
    const beats: { job: string; ok: boolean; detail: string }[] = [];
    const results = await runSteps(
      [
        { job: "a", run: async () => Promise.reject(new Error("boom")) },
        { job: "b", run: async () => "done" },
        { job: "c", run: async () => undefined },
      ],
      async (beat) => void beats.push(beat),
    );
    expect(results.map((r) => [r.job, r.ok, r.detail])).toEqual([
      ["a", false, "boom"],
      ["b", true, "done"],
      ["c", true, "ok"],
    ]);
    expect(beats.map((b) => b.job)).toEqual(["a", "b", "c"]);
  });

  it("reports a failed heartbeat write instead of throwing", async () => {
    const results = await runSteps([{ job: "a", run: async () => "done" }], async () => Promise.reject(new Error("db down")));
    expect(results[0]).toMatchObject({ ok: false, detail: "done; heartbeat write failed: db down" });
  });
});
