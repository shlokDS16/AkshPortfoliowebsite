import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { createItem } from "@/modules/research";
import { initialVideoStructured } from "./videos/structured";
import type { VideosRepo } from "./videos/repo";
import type { TranscriptRow, VideoSourceRow } from "./videos/types";

const state = vi.hoisted(() => ({
  research: null as unknown,
  videos: null as unknown,
  admin: true,
  fetchNow: null as null | ((itemId: string) => Promise<StepResult[] | null>),
}));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/modules/identity", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("NEXT_REDIRECT:/login");
    return { userId: "u-1", email: "aksh@example.com" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/modules/research", async (original) => ({ ...(await original<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.research }));
vi.mock("./videos/repo", async (original) => ({ ...(await original<typeof import("./videos/repo")>()), createSupabaseVideosRepo: () => state.videos }));
vi.mock("@/modules/ops/jobs", () => ({ runVideoFetchNow: (itemId: string) => state.fetchNow?.(itemId) }));

import { addTranscriptAction, fetchAgainAction, useChaptersAction, useTitleAction, useTranscriptAction } from "./actions";

type StepResult = { job: string; ok: boolean; detail: string; ms: number };
const YT = "dQw4w9WgXcQ";
let research: MemoryResearchRepo;
let transcripts: TranscriptRow[];
let itemId: string;
let sourceId: string;
const param = (to: string, name: string) => new URL(to, "http://x").searchParams.get(name);
async function target(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1] as string;
    throw error;
  }
  throw new Error("expected a redirect");
}
const file = (text: string, name = "captions.vtt") => {
  const form = new FormData();
  form.set("file", new File([text], name, { type: "text/vtt" }));
  return form;
};
const VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world.\n";

beforeEach(async () => {
  research = createMemoryResearchRepo();
  transcripts = [];
  const { item } = await createItem(research, { kind: "video", title: `Video ${YT}`, bodyMd: "Mine.", structured: initialVideoStructured(YT) });
  itemId = item.id;
  sourceId = randomUUID();
  const source: VideoSourceRow = {
    id: sourceId, itemId, youtubeId: YT, channelId: "UC0123456789abcdefghijkl", ownChannel: true, ytTitle: "From YouTube", ytDescription: "0:00 A\n1:00 B\n2:00 C",
    durationSeconds: 60, privacy: "unlisted", ytPublishedAt: null, fetchedAt: "2026-10-16T00:00:00+00:00", fetchProblem: null, createdAt: "2026-10-15T00:00:00+00:00",
  };
  const videos: VideosRepo = {
    findByItem: async (id) => (id === itemId ? source : null),
    findByYoutubeId: async () => null,
    insertSource: async () => source,
    insertTranscript: async (input) => {
      const row: TranscriptRow = { id: randomUUID(), videoSourceId: input.videoSourceId, source: "captions_file", fileSha256: input.fileSha256, segments: input.segments, textSha256: input.textSha256, words: input.words, createdAt: new Date().toISOString() };
      transcripts.push(row);
      return row;
    },
    latestTranscript: async () => transcripts.at(-1) ?? null,
    transcriptForItem: async () => null,
  };
  state.research = research;
  state.videos = videos;
  state.admin = true;
  state.fetchNow = null;
  redirect.mockClear();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const back = () => `/desk/videos/${itemId}`;
const done = (name: string) => `${back()}?notice=${name}`;

describe("addTranscriptAction", () => {
  it("stores the dropped caption file and says so", async () => {
    expect(await target(() => addTranscriptAction(itemId, file(VTT)))).toBe(done("transcript-stored"));
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0].segments).toEqual([{ s: 1, t: "Hello world." }]);
    expect(revalidatePath).toHaveBeenCalledWith(back());
  });

  it("sends a file that is not a caption file back with that sentence's code", async () => {
    expect(param(await target(() => addTranscriptAction(itemId, file("just words"))), "error")).toBe("video-captions-invalid");
    expect(transcripts).toEqual([]);
  });

  it("refuses a file over 1 MB by its size, before reading it", async () => {
    const big = new FormData();
    big.set("file", new File([new Uint8Array(1_048_577)], "x.vtt"));
    expect(param(await target(() => addTranscriptAction(itemId, big)), "error")).toBe("video-captions-too-big");
  });

  it("refuses a request with no file or with text where the file should be (a crafted post)", async () => {
    const none = new FormData();
    const text = new FormData();
    text.set("file", "WEBVTT");
    for (const form of [none, text]) expect(param(await target(() => addTranscriptAction(itemId, form)), "error")).toBe("invalid-input");
    expect(transcripts).toEqual([]);
  });

  it("maps an item that is not a video to not-found", async () => {
    expect(param(await target(() => addTranscriptAction(randomUUID(), file(VTT))), "error")).toBe("video-not-found");
  });

  it("does nothing for a visitor who is not the admin", async () => {
    state.admin = false;
    await expect(addTranscriptAction(itemId, file(VTT))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(transcripts).toEqual([]);
  });
});

describe("the three 'Use ...' buttons", () => {
  it("useTranscriptAction links the newest transcript and says so; the second press says nothing changed", async () => {
    await target(() => addTranscriptAction(itemId, file(VTT)));
    expect(await target(() => useTranscriptAction(itemId))).toBe(done("transcript-used"));
    expect(await target(() => useTranscriptAction(itemId))).toBe(done("video-unchanged"));
    expect(research.revisions.filter((r) => r.itemId === itemId)).toHaveLength(2);
  });

  it("useTranscriptAction without a transcript goes back with that code", async () => {
    expect(param(await target(() => useTranscriptAction(itemId)), "error")).toBe("video-no-transcript");
  });

  it("useTitleAction sets the title; on a public item it says the item is public and changes nothing", async () => {
    expect(await target(() => useTitleAction(itemId))).toBe(done("title-used"));
    expect(research.items.get(itemId)?.title).toBe("From YouTube");
    research.items.set(itemId, { ...research.items.get(itemId)!, title: "Other" });
    research.setVisibility(itemId, "public");
    expect(param(await target(() => useTitleAction(itemId)), "error")).toBe("public-item-locked");
  });

  it("useChaptersAction copies the chapters and says so", async () => {
    expect(await target(() => useChaptersAction(itemId))).toBe(done("chapters-used"));
    expect(research.revisions.filter((r) => r.itemId === itemId).at(-1)?.structured).toMatchObject({ chapters: [{ s: 0, title: "A" }, { s: 60, title: "B" }, { s: 120, title: "C" }] });
  });

  it("says 'revision waits for the gate' when the item is public", async () => {
    await target(() => addTranscriptAction(itemId, file(VTT)));
    research.setVisibility(itemId, "public");
    expect(await target(() => useTranscriptAction(itemId))).toBe(done("revision-pending-gate"));
  });

  it.each([["useTranscriptAction", useTranscriptAction], ["useTitleAction", useTitleAction], ["useChaptersAction", useChaptersAction]] as const)(
    "%s does nothing for a visitor who is not the admin",
    async (_name, action) => {
      state.admin = false;
      await expect(action(itemId)).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(research.revisions.filter((r) => r.itemId === itemId)).toHaveLength(1);
    },
  );
});

describe("fetchAgainAction (Fetch again)", () => {
  const result = (detail: string, ok = true): StepResult[] => [{ job: "videos:fetch", ok, detail, ms: 1 }];

  it("runs one fetch for this item and says YouTube was asked", async () => {
    const asked: string[] = [];
    state.fetchNow = async (id) => (asked.push(id), result("fetched 1"));
    expect(await target(() => fetchAgainAction(itemId))).toBe(done("video-fetched"));
    expect(asked).toEqual([itemId]);
    expect(revalidatePath).toHaveBeenCalledWith(back());
  });

  it("says video listing is off while the YouTube settings are unset", async () => {
    state.fetchNow = async () => result("videos off");
    expect(param(await target(() => fetchAgainAction(itemId)), "error")).toBe("video-off");
  });

  it("says the daily limit is used up and will be tried again tomorrow", async () => {
    state.fetchNow = async () => result("deferred: YouTube's daily limit is used up");
    expect(await target(() => fetchAgainAction(itemId))).toBe(done("video-deferred"));
  });

  it("says YouTube was asked less than a minute ago, as a notice, not an error", async () => {
    state.fetchNow = async () => result("fetched less than a minute ago");
    expect(await target(() => fetchAgainAction(itemId))).toBe(done("video-fetch-recent"));
  });

  it("says a fetch is already running when a second press arrives during one", async () => {
    state.fetchNow = async () => null;
    expect(param(await target(() => fetchAgainAction(itemId)), "error")).toBe("video-fetch-busy");
  });

  it("goes back with a general error when the fetch failed, without YouTube's or the database's words", async () => {
    state.fetchNow = async () => result("YouTube could not be reached", false);
    const to = await target(() => fetchAgainAction(itemId));
    expect(param(to, "error")).toBe("save-failed");
    expect(to).not.toContain("YouTube%20could");
  });

  it("refuses an id that is not an item id without running anything", async () => {
    let ran = false;
    state.fetchNow = async () => ((ran = true), result("fetched 1"));
    expect(param(await target(() => fetchAgainAction("not-an-id")), "error")).toBe("video-not-found");
    expect(ran).toBe(false);
  });

  it("does nothing for a visitor who is not the admin", async () => {
    let ran = false;
    state.fetchNow = async () => ((ran = true), result("fetched 1"));
    state.admin = false;
    await expect(fetchAgainAction(itemId)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(ran).toBe(false);
  });
});
