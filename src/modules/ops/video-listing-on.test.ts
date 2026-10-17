import { describe, expect, it, vi } from "vitest";
import { videoListingOn } from "./video-steps";

// The desk page asks this to say "Video listing is not set up yet" instead of "Waiting for YouTube": the same rule the steps use.
const env = vi.hoisted(() => ({ value: {} as Record<string, string | undefined>, throws: false }));
vi.mock("@/lib/env.server", () => ({
  serverEnv: () => {
    if (env.throws) throw new Error("bad setting");
    return env.value;
  },
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({}) }));

const KEY = "AIzaSyA-1234567890abcdefghijklmnopqrstu";
const CHANNEL = "UC0123456789abcdefghijkl";

describe("videoListingOn", () => {
  it("is off with neither setting, or with only one of them", () => {
    env.throws = false;
    env.value = {};
    expect(videoListingOn()).toBe(false);
    env.value = { YOUTUBE_API_KEY: KEY };
    expect(videoListingOn()).toBe(false);
    env.value = { YOUTUBE_CHANNEL_ID: CHANNEL };
    expect(videoListingOn()).toBe(false);
  });

  it("is on with both, and on with the fixture adapter outside a deployment", () => {
    env.value = { YOUTUBE_API_KEY: KEY, YOUTUBE_CHANNEL_ID: CHANNEL };
    expect(videoListingOn()).toBe(true);
    env.value = { YOUTUBE_CHANNEL_ID: CHANNEL, DISTRIBUTION_ADAPTER: "fixture" };
    expect(videoListingOn()).toBe(true);
  });

  it("is off, not an error, when the settings cannot be read", () => {
    env.throws = true;
    expect(videoListingOn()).toBe(false);
  });
});

describe("videoListingOn while the own-channel videos are off (Phase 5d)", () => {
  it("is false even with both settings set", () => {
    vi.stubEnv("FEATURES_ON", "");
    env.throws = false;
    env.value = { YOUTUBE_API_KEY: KEY, YOUTUBE_CHANNEL_ID: CHANNEL };
    expect(videoListingOn()).toBe(false);
  });
});
