import { describe, expect, it } from "vitest";
import { buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { createSnapshotLoader } from "./loader";

describe("createSnapshotLoader (D12)", () => {
  it("returns the snapshot when the database answers", async () => {
    const load = createSnapshotLoader({ load: async () => buildSeedSnapshot(), isBuildPhase: () => false });
    expect((await load()).status).toBe("ok");
  });

  it("at runtime a failed read throws, so ISR keeps serving the last good page", async () => {
    const load = createSnapshotLoader({ load: async () => Promise.reject(new Error("paused")), isBuildPhase: () => false });
    await expect(load()).rejects.toThrow("paused");
  });

  it("during next build without a database it renders the unavailable state instead of failing CI", async () => {
    const load = createSnapshotLoader({ load: async () => Promise.reject(new Error("ECONNREFUSED")), isBuildPhase: () => true });
    expect(await load()).toEqual({ status: "unavailable" });
  });
});
