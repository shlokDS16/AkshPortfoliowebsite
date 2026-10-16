import { describe, expect, it, vi } from "vitest";
import { buildSeedSnapshot, withLetter, withVideo } from "@/test/fakes/showcase-snapshot";

// The wiring of spec s8 at the one cached read every public page uses: the snapshot it hands out has no video or letter while off.
const both = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => ({}) }));
vi.mock("./repo", () => ({ createSupabaseShowcaseRepo: () => ({}), loadSnapshot: async () => both.value }));

const { getSnapshot } = await import("./queries");
both.value = withLetter(withVideo(buildSeedSnapshot()));

const kinds = async () => {
  const loaded = await getSnapshot();
  if (loaded.status !== "ok") throw new Error("expected a snapshot");
  return { items: new Set(loaded.data.items.map((i) => i.kind)), videos: loaded.data.videos?.length ?? 0 };
};

describe("getSnapshot hides the kinds whose feature is off", () => {
  it("drops video and letter items and the video rows while both are off", async () => {
    vi.stubEnv("FEATURES_ON", "");
    const out = await kinds();
    expect(out.items.has("video")).toBe(false);
    expect(out.items.has("letter")).toBe(false);
    expect(out.items.has("learning")).toBe(true);
    expect(out.videos).toBe(0);
  });

  it("keeps a kind whose feature the test override switches on", async () => {
    vi.stubEnv("FEATURES_ON", "letters");
    const out = await kinds();
    expect(out.items.has("letter")).toBe(true);
    expect(out.items.has("video")).toBe(false);
  });

  it("keeps both under the override that the rest of the suite runs with", async () => {
    vi.stubEnv("FEATURES_ON", "ownVideos,letters");
    const out = await kinds();
    expect(out.items.has("letter") && out.items.has("video")).toBe(true);
    expect(out.videos).toBe(1);
  });

  it("never takes the override on a production deployment", async () => {
    vi.stubEnv("FEATURES_ON", "ownVideos,letters");
    vi.stubEnv("VERCEL_ENV", "production");
    const out = await kinds();
    expect(out.items.has("letter") || out.items.has("video")).toBe(false);
  });
});
