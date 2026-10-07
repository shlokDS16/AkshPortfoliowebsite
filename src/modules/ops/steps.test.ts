import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
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

  it("writes a database failure into the heartbeat as its operation and code, never the raw Postgres message", async () => {
    const beats: { detail: string }[] = [];
    const leak = new DbError("ingestion.claim", "23514", 'new row violates check: Failing row contains (secret text)');
    const results = await runSteps([{ job: "ingestion:drain", run: async () => Promise.reject(leak) }], async (b) => void beats.push(b));
    expect(results[0]).toMatchObject({ ok: false, detail: "ingestion.claim (23514)" });
    expect(beats[0].detail).not.toContain("secret");
  });

  it("does not leak a raw database message through a failed heartbeat write either", async () => {
    const results = await runSteps([{ job: "a", run: async () => "done" }], async () =>
      Promise.reject(new DbError("ops.recordHeartbeat", "08006", "password for secret failed")),
    );
    expect(results[0].detail).toBe("done; heartbeat write failed: ops.recordHeartbeat (08006)");
  });
});
