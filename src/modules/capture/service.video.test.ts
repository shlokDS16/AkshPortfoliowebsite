import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { createVideoFiling, type VideoSourceRow } from "@/modules/distribution";
import { filingErrorText } from "./messages";
import { saveCapture } from "./service";

const ID = "dQw4w9WgXcQ";
const URL = `https://youtu.be/${ID}`;

function setup() {
  const research = createMemoryResearchRepo();
  const catalog = createMemoryCatalogRepo();
  const captures = createMemoryCaptureRepo();
  const sources = new Map<string, VideoSourceRow>();
  const videos = createVideoFiling({
    async findByYoutubeId(youtubeId: string) {
      return sources.get(youtubeId) ?? null;
    },
    async insertSource(itemId: string, youtubeId: string) {
      const row = { id: randomUUID(), itemId, youtubeId } as VideoSourceRow;
      sources.set(youtubeId, row);
      return row;
    },
  });
  return { research, catalog, captures, sources, videos, deps: { research, catalog, captures, videos } };
}
const input = (rawText: string) => ({ rawText, source: "web" as const, clientId: randomUUID() });

describe("saveCapture: v: files a private video item and its source row", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("files kind video titled 'Video {id}', an empty body, the schema record with empty chapters, and the source", async () => {
    const { deps, research, sources } = setup();
    const result = await saveCapture(deps, input(`v: ${URL}`));
    expect(result.parseError).toBeNull();
    expect(result.kind).toBe("video");
    const item = research.items.get(result.itemId ?? "");
    expect(item).toMatchObject({ kind: "video", title: `Video ${ID}`, visibility: "private" });
    const [revision] = research.revisions.filter((r) => r.itemId === result.itemId);
    expect(revision).toMatchObject({ bodyMd: "", structured: { schema: "video/1", youtubeId: ID, chapters: [] } });
    expect(sources.get(ID)?.itemId).toBe(result.itemId);
  });

  it("keeps his own words and tags in the body and takes only the YouTube link out of it", async () => {
    const { deps, research, catalog } = setup();
    const result = await saveCapture(deps, input(`v: how I read a filing ${URL} see https://example.com/a #moats $NEWCO`));
    const [revision] = research.revisions.filter((r) => r.itemId === result.itemId);
    expect(revision.bodyMd).toBe("how I read a filing  see https://example.com/a #moats $NEWCO");
    expect(research.items.get(result.itemId ?? "")?.companyId).toBe([...catalog.companies.values()][0].id);
  });

  it("uses the first link that is a YouTube video, ignoring one that is not", async () => {
    const { deps, sources } = setup();
    const result = await saveCapture(deps, input(`v: https://example.com/x ${URL} https://youtu.be/aaaaaaaaaaa`));
    expect(result.parseError).toBeNull();
    expect([...sources.keys()]).toEqual([ID]);
  });

  it.each([
    ["no link", "v: my video about moats"],
    ["a link on another site", "v: https://vimeo.com/123456"],
    ["a YouTube address that is not a video", "v: https://www.youtube.com/@aksh"],
    ["a lookalike host", `v: https://youtube.com.evil.test/watch?v=${ID}`],
  ])("refuses %s with 'That is not a YouTube link.' and files nothing, keeping the raw text", async (_label, raw) => {
    const { deps, research, captures, sources } = setup();
    const result = await saveCapture(deps, input(raw));
    expect(result.itemId).toBeNull();
    expect(result.parseError).toBe("not-youtube-link");
    expect(filingErrorText("not-youtube-link")).toBe("That is not a YouTube link.");
    expect(research.items.size).toBe(0);
    expect(sources.size).toBe(0);
    expect(captures.records[0].rawText).toBe(raw);
  });

  it("opens the video already filed instead of making a second item for the same link", async () => {
    const { deps, research } = setup();
    const first = await saveCapture(deps, input(`v: ${URL}`));
    const second = await saveCapture(deps, input(`v: ${URL} again`));
    expect(second.itemId).toBe(first.itemId);
    expect(second.parseError).toBeNull();
    expect(research.items.size).toBe(1);
  });

  it("still files the item when the key is not set: filing never needs YouTube", async () => {
    const { deps, research } = setup();
    const result = await saveCapture(deps, input(`v: ${URL}`));
    expect(result.itemId).not.toBeNull();
    expect(research.items.size).toBe(1);
  });

  it("does not file a video capture at all when the caller gave no videos repo, rather than an item with no source", async () => {
    const { research, catalog, captures } = setup();
    const result = await saveCapture({ research, catalog, captures }, input(`v: ${URL}`));
    expect(result.parseError).toBe("filing-failed");
    expect(research.items.size).toBe(0);
  });

  it("leaves the other prefixes as they were", async () => {
    const { deps, research } = setup();
    const result = await saveCapture(deps, input("l: depreciation is a non-cash charge"));
    expect(research.items.get(result.itemId ?? "")?.kind).toBe("learning");
  });
});

describe("saveCapture: a refused or repeated video link leaves no stub names", () => {
  it("makes no company or concept for a capture that is refused", async () => {
    const { deps, catalog } = setup();
    await saveCapture(deps, input("v: no link here $NEWCO #newidea"));
    expect(catalog.companies.size).toBe(0);
  });
});
