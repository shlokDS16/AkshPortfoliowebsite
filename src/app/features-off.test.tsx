import { describe, expect, it, vi } from "vitest";
import DeskLettersLayout from "./desk/letters/layout";
import DeskVideosLayout from "./desk/videos/layout";
import PublicLettersLayout from "./(public)/letters/layout";
import PublicVideosLayout from "./(public)/videos/layout";

// Phase 5d (spec s8): every route under /desk/videos, /desk/letters, /videos and /letters answers 404 while its feature is off.
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const props = { children: "inside" } as never;

const cases = [
  ["/desk/letters", DeskLettersLayout, "letters"],
  ["/desk/videos", DeskVideosLayout, "ownVideos"],
  ["/letters", PublicLettersLayout, "letters"],
  ["/videos", PublicVideosLayout, "ownVideos"],
] as const;

describe.each(cases)("%s", (_path, Layout, name) => {
  it("is a 404 while its feature is off", () => {
    vi.stubEnv("FEATURES_ON", "");
    expect(() => Layout(props)).toThrow(expect.objectContaining({ digest: NOT_FOUND }));
  });

  it("is a 404 when only the other feature is on", () => {
    vi.stubEnv("FEATURES_ON", name === "letters" ? "ownVideos" : "letters");
    expect(() => Layout(props)).toThrow(expect.objectContaining({ digest: NOT_FOUND }));
  });

  it("is a 404 on a production deployment even with the override set", () => {
    vi.stubEnv("FEATURES_ON", "ownVideos,letters");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => Layout(props)).toThrow(expect.objectContaining({ digest: NOT_FOUND }));
  });

  it("shows its pages when the test override switches it on", () => {
    vi.stubEnv("FEATURES_ON", name);
    expect(Layout(props)).toBe("inside");
  });
});

// A share card is a route handler, outside the layouts: it answers 404 itself, before it reads the snapshot (a hidden feature has no card even on a fallback).
describe("the share cards of a hidden feature", () => {
  it.each([
    ["letters", async () => (await import("./(public)/letters/[slug]/opengraph-image")).default],
    ["ownVideos", async () => (await import("./(public)/videos/[slug]/opengraph-image")).default],
  ] as const)("%s: 404 while off, before any read", async (_name, load) => {
    const Image = await load();
    vi.stubEnv("FEATURES_ON", "");
    const off = await Image({ params: Promise.resolve({ slug: "anything" }) });
    expect(off).toBeInstanceOf(Response);
    expect((off as Response).status).toBe(404);
  });
});
