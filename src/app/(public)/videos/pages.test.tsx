import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_CARD } from "@/components/desk/share-card";
import { videoCard } from "@/modules/showcase";
import { buildSeedSnapshot, VIDEO_SEGMENTS, withVideo } from "@/test/fakes/showcase-snapshot";

// Plan 5b (spec s7.7): /videos and /videos/[slug] are a 404 until a video is listed (the deploy state), list only gate-passed videos, read the
// transcript apart from the snapshot, and the share card follows the same rule.
const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false, notFound: 0, transcript: null as unknown, asked: [] as string[] }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFound += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/og", () => ({ ImageResponse: class { constructor(readonly element: { props: { c: unknown } }, readonly options: unknown) {} } }));
vi.mock("@/lib/og-fonts", () => ({ loadOgFonts: async () => [] }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => (state.unavailable ? { status: "unavailable" } : { status: "ok", data: state.snapshot }),
  getVideoTranscript: async (_s: unknown, slug: string) => {
    state.asked.push(slug);
    return state.transcript;
  },
}));

import VideoRoute, * as video from "./[slug]/page";
import * as cardRoute from "./[slug]/opengraph-image";
import VideosPage, * as index from "./page";

const SLUG = "v1-reading-the-ageing-table";
const seed = () => buildSeedSnapshot();
const world = () => withVideo(seed());
const html = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node);
const route = (slug: string) => VideoRoute({ params: Promise.resolve({ slug }) } as never);

beforeEach(() => {
  state.notFound = 0;
  state.unavailable = false;
  state.transcript = VIDEO_SEGMENTS;
  state.asked = [];
});

describe("/videos", () => {
  it("is a 404 until a video is listed, and is cached like the other public pages", async () => {
    state.snapshot = seed();
    await expect(VideosPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(index.revalidate).toBe(3600);
  });

  it("lists a video with his title and objective, links its page and loads nothing from YouTube", async () => {
    state.snapshot = world();
    const out = await html(VideosPage());
    expect(out).toContain("<h1");
    expect(out).toContain('href="/videos/v1-reading-the-ageing-table"');
    expect(out).toContain("Reading the ageing table");
    expect(out).toContain("How to read who pays late.");
    expect(out).toContain("1:02:05");
    expect(out).not.toMatch(/youtube|ytimg|<iframe|<img/);
    expect(out).toContain("application/ld+json");
  });

  it("says it is unavailable at build time when the snapshot is, never a 404", async () => {
    state.unavailable = true;
    state.snapshot = seed();
    expect(await html(VideosPage())).toContain("Videos");
    expect(state.notFound).toBe(0);
  });

  it("is titled and described", () => {
    expect(index.metadata).toMatchObject({ title: "Videos", alternates: { canonical: "/videos" } });
  });
});

describe("/videos/[slug]", () => {
  it("is a 404 for every slug in the deploy state and for an unknown slug; builds nothing ahead of time", async () => {
    state.snapshot = seed();
    await expect(route(SLUG)).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = world();
    await expect(route("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.asked).toEqual([]);
    expect(await video.generateStaticParams()).toEqual([]);
    expect(video.revalidate).toBe(3600);
  });

  it("is a 404 for a video the gate did not list: no public_videos row, however many revisions the snapshot holds", async () => {
    state.snapshot = { ...world(), videos: [] };
    await expect(route(SLUG)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the title, the player's button, the chapters, his words and the transcript, with no frame and no third-party script", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain("Reading the ageing table");
    expect(out).toContain("Play video (loads YouTube)");
    expect(out).toContain("Chapters");
    expect(out).toContain("Reading the ageing table</span>");
    expect(out).toContain("I walk through one ageing table, line by line.");
    expect(out).toContain("Today we look at how receivables are reported.");
    expect(out).toContain("Typed by machine from the video&#x27;s captions and not edited.");
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ?");
    expect(out.match(/<script src/g)).toBeNull();
    expect(state.asked).toEqual([SLUG]);
  });

  it("puts one JSON-LD VideoObject in the page that parses, carries the transcript, and never closes its own script", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    const scripts = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const nodes = JSON.parse(scripts[0][1]) as { "@type": string; transcript?: string }[];
    expect(nodes.map((n) => n["@type"])).toEqual(["VideoObject", "BreadcrumbList"]);
    expect(nodes[0].transcript).toBe(VIDEO_SEGMENTS.map((g) => g.t).join(" "));
  });

  it("without a transcript the page still renders, with no Transcript section and no transcript in the structured data", async () => {
    state.snapshot = world();
    state.transcript = null;
    const out = await html(route(SLUG));
    expect(out).not.toContain("Transcript");
    expect(out).not.toContain('\\"transcript\\"');
    expect(out).not.toContain('"transcript"');
  });

  it("names a canonical link target and prints its address in the masthead", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    expect(out).toContain("https://desk.example/videos/v1-reading-the-ageing-table");
    const meta = await video.generateMetadata({ params: Promise.resolve({ slug: SLUG }) } as never);
    expect(meta.alternates?.canonical).toBe(`/videos/${SLUG}`);
  });
});

describe("the video share card", () => {
  const run = async (slug: string) => (await cardRoute.default({ params: Promise.resolve({ slug }) })) as unknown as { element: { props: { c: unknown } } };

  it("is 1200 by 630 PNG, regenerated hourly with the page, and builds nothing ahead of time", async () => {
    expect(cardRoute.size).toEqual({ width: 1200, height: 630 });
    expect(cardRoute.contentType).toBe("image/png");
    expect(cardRoute.revalidate).toBe(3600);
    expect(await cardRoute.generateStaticParams()).toEqual([]);
  });

  it("draws the card the builder gives, the site card with the snapshot down, and a 404 where the page is one", async () => {
    state.snapshot = world();
    expect((await run(SLUG)).element.props.c).toEqual(videoCard(world(), SLUG));
    expect(((await cardRoute.default({ params: Promise.resolve({ slug: "nope" }) })) as Response).status).toBe(404);
    state.snapshot = seed();
    expect(((await cardRoute.default({ params: Promise.resolve({ slug: SLUG }) })) as Response).status).toBe(404);
    state.unavailable = true;
    expect((await run(SLUG)).element.props.c).toEqual(HOME_CARD);
  });
});
