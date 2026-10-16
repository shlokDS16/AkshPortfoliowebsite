import { describe, expect, it, vi } from "vitest";
import { installNoOutbound } from "./no-outbound";

// Phase 5 spec s9.4 and review finding 4. Every test here hands installNoOutbound a spy as the "real" fetch, so a broken guard
// reaches the spy and fails the test; it never reaches the network (the T11 incident was a self-test making real calls).
const spyFetch = () => vi.fn(async () => new Response("spy")) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("the guard refuses every outside host and never calls the real fetch for one", () => {
  it.each([
    "https://www.googleapis.com/youtube/v3/videos?id=x",
    "https://youtube.googleapis.com/youtube/v3/videos",
    "https://api.resend.com/broadcasts",
    "https://API.Resend.com/emails",
    "https://eu.api.resend.com/emails",
    "https://api.resend.com./emails",
    "https://api.groq.com/openai/v1/chat/completions",
    "https://api.ocr.space/parse/image",
    "https://api.github.com/repos",
    "https://notresend.com/x",
    "https://resend.com.evil.test/x",
    "https://api-resend.com/x",
    "http://127.0.0.1.nip.io/x",
    "https://localhost.evil.test/x",
    "https://example.com/",
  ])("%s", async (url) => {
    const spy = spyFetch();
    const guarded = installNoOutbound(spy);
    await expect(guarded(url)).rejects.toThrow(/no outbound call in a test/);
    await expect(guarded(new Request(url))).rejects.toThrow(/no outbound call in a test/);
    await expect(guarded(new URL(url))).rejects.toThrow(/no outbound call in a test/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("the guard lets this machine through", () => {
  it.each(["http://127.0.0.1:54321/rest/v1/x", "http://localhost:3000/", "http://app.localhost/x", "http://[::1]:3000/", "/relative/path"])(
    "%s reaches the real fetch once",
    async (url) => {
      const spy = spyFetch();
      const guarded = installNoOutbound(spy);
      await guarded(url);
      expect(spy).toHaveBeenCalledTimes(1);
    },
  );

  it("wrapping a guarded fetch again changes nothing", () => {
    const once = installNoOutbound(spyFetch());
    expect(installNoOutbound(once)).toBe(once);
  });
});

describe("the setup file installed the guard on the global fetch", () => {
  it("is the wrapper (marked), without calling it", () => {
    expect((globalThis.fetch as unknown as Record<symbol, unknown>)[Symbol.for("aksh.noOutbound")]).toBe(true);
  });
});
