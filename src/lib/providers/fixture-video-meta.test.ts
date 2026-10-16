import { describe, expect, it } from "vitest";
import { createFixtureVideoMeta, FIXTURE_CHANNEL_ID } from "./fixture-video-meta";

describe("the fixture video-metadata port (local e2e and CI only; never calls YouTube)", () => {
  it("answers a made-up unlisted video from the fixture channel, with chapter lines in its description", async () => {
    const port = createFixtureVideoMeta();
    expect(port.name).toBe("fixture");
    expect(port.ownChannelId).toBe(FIXTURE_CHANNEL_ID);
    const out = await port.fetch(["aaaaaaaaaaa"]);
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    const meta = out.videos.get("aaaaaaaaaaa");
    expect(meta).toMatchObject({ channelId: FIXTURE_CHANNEL_ID, privacy: "unlisted", durationSeconds: 600 });
    expect((meta as { description: string }).description).toMatch(/^0:00 Opening$/m);
  });

  it("picks the case from the id's first letters: missing, other channel, private, public", async () => {
    const out = await createFixtureVideoMeta().fetch(["missingAAAA", "otherBBBBBB", "privateCCCC", "publicDDDDD"]);
    expect(out.kind === "ok" && out.videos.get("missingAAAA")).toBe("missing");
    expect(out.kind === "ok" && (out.videos.get("otherBBBBBB") as { channelId: string }).channelId).not.toBe(FIXTURE_CHANNEL_ID);
    expect(out.kind === "ok" && (out.videos.get("privateCCCC") as { privacy: string }).privacy).toBe("private");
    expect(out.kind === "ok" && (out.videos.get("publicDDDDD") as { privacy: string }).privacy).toBe("public");
  });

  it("uses the channel it is given, so it matches YOUTUBE_CHANNEL_ID when that is set", async () => {
    const channel = "UC0123456789abcdefghijkl";
    const port = createFixtureVideoMeta({ channelId: channel });
    expect(port.ownChannelId).toBe(channel);
    const out = await port.fetch(["aaaaaaaaaaa"]);
    expect(out.kind === "ok" && (out.videos.get("aaaaaaaaaaa") as { channelId: string }).channelId).toBe(channel);
  });

  it("makes no network call", async () => {
    const real = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("no network in a fixture");
    }) as typeof fetch;
    try {
      await createFixtureVideoMeta().fetch(["aaaaaaaaaaa"]);
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toBe(0);
  });
});
