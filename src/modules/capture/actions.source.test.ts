import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCaptureRepo, type MemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { createMemorySourcesRepo, type MemorySourcesRepo } from "@/test/fakes/sources-repo";

// The capture action hands the service a source filing always, and a video filing only while the own-channel videos are on (spec s8), and
// starts the first read of a new source after the answer (spec s6.4). The read itself is the ops job, replaced here by a spy.

const state = vi.hoisted(() => ({ deps: null as unknown, sources: null as unknown, ownVideos: false, afterCallbacks: [] as (() => unknown)[] }));
const startSourceRead = vi.fn(async (id: string): Promise<undefined> => void id);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void state.afterCallbacks.push(fn) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: async () => ({ userId: "u-1", email: "aksh@example.com" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/features", () => ({ featureOn: (name: string) => name === "ownVideos" && state.ownVideos }));
vi.mock("@/modules/ops/jobs", () => ({ startSourceRead: (id: string) => startSourceRead(id) }));
vi.mock("./deps", () => ({ createCaptureDeps: () => state.deps }));
vi.mock("@/modules/distribution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/distribution")>()),
  createSupabaseVideosRepo: () => ({ findByYoutubeId: async () => null, insertSource: async () => ({}) }),
}));
vi.mock("@/modules/sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/sources")>()),
  createSupabaseSourcesRepo: () => state.sources,
}));

import { submitCapture } from "./actions";

let captures: MemoryCaptureRepo;
let research: MemoryResearchRepo;
let sources: MemorySourcesRepo;
const entry = (rawText: string) => ({ clientId: randomUUID(), rawText, source: "web" as const });
const ran = async () => {
  await Promise.all(state.afterCallbacks.map((fn) => fn()));
};

beforeEach(() => {
  captures = createMemoryCaptureRepo();
  research = createMemoryResearchRepo();
  sources = createMemorySourcesRepo();
  state.deps = { captures, research, catalog: createMemoryCatalogRepo() };
  state.sources = sources;
  state.ownVideos = false;
  state.afterCallbacks.length = 0;
  startSourceRead.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitCapture: s:", () => {
  it("saves the link, answers in the spec's words, and starts the first read after the answer", async () => {
    const result = await submitCapture(entry("s: https://example.com/post $TCS my note"));
    expect(result).toMatchObject({ ok: true, itemId: null, parseError: null, sourceAnswer: "Source saved. Reading its title." });
    expect(sources.records.size).toBe(1);
    expect(research.items.size).toBe(0);
    expect(startSourceRead).not.toHaveBeenCalled(); // not before the answer is sent
    await ran();
    expect(startSourceRead).toHaveBeenCalledWith([...sources.records.keys()][0]);
  });

  it("does not start a read for a link he saved before, and says when he saved it", async () => {
    await submitCapture(entry("s: https://example.com/post"));
    state.afterCallbacks.length = 0;
    startSourceRead.mockClear();
    const again = await submitCapture(entry("s: https://example.com/post/ a second thought"));
    expect(again).toMatchObject({ ok: true, sourceAnswer: expect.stringMatching(/^You saved this link on \d{1,2} [A-Z][a-z]{2} \d{4}\. Your note was added to it\.$/) });
    await ran();
    expect(startSourceRead).not.toHaveBeenCalled();
  });

  it("answers 'A source needs a link.' as the parse error and starts nothing", async () => {
    const result = await submitCapture(entry("s: just words"));
    expect(result).toMatchObject({ ok: true, parseError: "no-source-link" });
    expect("sourceAnswer" in result).toBe(false);
    await ran();
    expect(startSourceRead).not.toHaveBeenCalled();
  });

  it("gives a capture that is not a source no source answer", async () => {
    const result = await submitCapture(entry("$TCS order book"));
    expect("sourceAnswer" in result).toBe(false);
    expect(research.items.size).toBe(1);
  });
});

describe("submitCapture: v: follows the feature switch", () => {
  it("files a source while the own-channel videos are off (the shipped state)", async () => {
    const result = await submitCapture(entry("v: https://youtu.be/dQw4w9WgXcQ"));
    expect(result).toMatchObject({ ok: true, itemId: null, sourceAnswer: "Source saved. Reading its title." });
    expect(research.items.size).toBe(0);
    expect([...sources.records.values()][0]).toMatchObject({ kind: "youtube", youtubeId: "dQw4w9WgXcQ" });
  });

  it("files an own-channel video item when the switch is on (tests only)", async () => {
    state.ownVideos = true;
    const result = await submitCapture(entry("v: https://youtu.be/dQw4w9WgXcQ"));
    expect(result).toMatchObject({ ok: true, parseError: null });
    expect(research.items.size).toBe(1);
    expect(sources.records.size).toBe(0);
  });
});
