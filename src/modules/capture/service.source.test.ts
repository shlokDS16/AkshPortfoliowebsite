import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { createMemorySourcesRepo } from "@/test/fakes/sources-repo";
import { createVideoFiling } from "@/modules/distribution";
import { createSourceFiling } from "@/modules/sources";
import { filingErrorText, FILING_ERRORS } from "./messages";
import { refileCapture } from "./refile";
import { saveCapture } from "./service";

const NOW = new Date("2026-10-16T08:00:00Z");
const LINK = "https://www.example.com/post/1?utm_source=x";

function setup() {
  const research = createMemoryResearchRepo();
  const catalog = createMemoryCatalogRepo();
  const captures = createMemoryCaptureRepo();
  const sourcesRepo = createMemorySourcesRepo(() => NOW.toISOString());
  const sources = createSourceFiling(sourcesRepo, () => NOW);
  return { research, catalog, captures, sourcesRepo, sources, deps: { research, catalog, captures, sources } };
}
const input = (rawText: string) => ({ rawText, source: "web" as const, clientId: randomUUID() });
const only = <T,>(map: Map<string, T>): T => [...map.values()][0];

describe("saveCapture: s: files a source, not an item", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("saves the link with his note, makes no item, and answers in the spec's words", async () => {
    const { deps, research, sourcesRepo, captures } = setup();
    const result = await saveCapture(deps, input(`s: ${LINK} why the bull case is thin`));
    expect(result).toMatchObject({ itemId: null, kind: "source", duplicate: false, parseError: null, sourceAnswer: "Source saved. Reading its title." });
    expect(research.items.size).toBe(0);
    expect(sourcesRepo.records.size).toBe(1);
    expect(only(sourcesRepo.records)).toMatchObject({ url: "https://www.example.com/post/1", kind: "web", note: "why the bull case is thin" });
    expect(captures.records[0]).toMatchObject({ itemId: null, parsed: expect.objectContaining({ kind: "source" }) });
  });

  it("keeps his tags and words in the note exactly as typed, taking out only the prefix and the link", async () => {
    const { deps, sourcesRepo } = setup();
    await saveCapture(deps, input(`s: ${LINK} $TCS #moats  why the bull case is thin`));
    expect(only(sourcesRepo.records).note).toBe("$TCS #moats  why the bull case is thin");
  });

  it("attaches every $ company (at most 5) and every # concept (at most 8), and the capture records the first company", async () => {
    const { deps, sourcesRepo, catalog, captures } = setup();
    await saveCapture(deps, input(`s: ${LINK} $AAA $BBB $CCC $DDD $EEE $FFF #one #two #three`));
    const record = only(sourcesRepo.records);
    expect(record.companyIds).toHaveLength(5);
    expect(record.themeIds).toHaveLength(3);
    expect(captures.records[0].companyId).toBe(record.companyIds[0]);
    expect(catalog.companies.size).toBe(5);
  });

  it("files a YouTube link as a YouTube source", async () => {
    const { deps, sourcesRepo } = setup();
    await saveCapture(deps, input("s: https://youtu.be/dQw4w9WgXcQ $TCS"));
    expect(only(sourcesRepo.records)).toMatchObject({ kind: "youtube", youtubeId: "dQw4w9WgXcQ" });
  });

  it("uses the first link that can be a source", async () => {
    const { deps, sourcesRepo } = setup();
    await saveCapture(deps, input("s: https://user:pass@a.example/x https://b.example/ok note"));
    expect(only(sourcesRepo.records).url).toBe("https://b.example/ok");
  });

  it("saves the same link again as a repeat: the note is appended and the answer says when it was saved", async () => {
    const { deps, sourcesRepo } = setup();
    await saveCapture(deps, input(`s: ${LINK} first`));
    const again = await saveCapture(deps, input(`s: https://example.com/post/1/ second $TCS`));
    expect(sourcesRepo.records.size).toBe(1);
    expect(again.sourceAnswer).toBe("You saved this link on 16 Oct 2026. Your note was added to it.");
    expect(only(sourcesRepo.records).note).toContain("— 16 Oct 2026\nsecond $TCS");
    expect(only(sourcesRepo.records).companyIds).toHaveLength(1);
  });

  it("with no link says 'A source needs a link.' and files nothing, keeping the raw text and leaving no stub names", async () => {
    const { deps, sourcesRepo, catalog, captures } = setup();
    const raw = "s: why the bull case is thin $NEWCO #newidea";
    const result = await saveCapture(deps, input(raw));
    expect(result).toMatchObject({ itemId: null, kind: "source", parseError: "no-source-link" });
    expect(filingErrorText("no-source-link")).toBe("A source needs a link.");
    expect(sourcesRepo.records.size).toBe(0);
    expect(catalog.companies.size).toBe(0);
    expect(captures.records[0].rawText).toBe(raw);
  });

  it("refuses a link with a password in it the same way", async () => {
    const { deps, sourcesRepo } = setup();
    expect((await saveCapture(deps, input("s: https://u:p@a.example/x"))).parseError).toBe("no-source-link");
    expect(sourcesRepo.records.size).toBe(0);
  });

  it("refuses a note over 4,000 characters without filing, saying so", async () => {
    const { deps, sourcesRepo } = setup();
    const result = await saveCapture(deps, input(`s: ${LINK} ${"n".repeat(4001)}`));
    expect(result.parseError).toBe("source-note-full");
    expect(sourcesRepo.records.size).toBe(0);
    expect(filingErrorText("source-note-full")).toMatch(/4,000/);
  });

  it("is not a streak day: the capture is recorded as a source", async () => {
    const { deps, captures } = setup();
    await saveCapture(deps, input(`s: ${LINK}`));
    expect(captures.records[0].parsed?.kind).toBe("source");
  });

  it("shares its no-link sentence with the desk's source codes", async () => {
    const { SOURCE_ERROR_TEXT } = await import("@/lib/messages-sources");
    expect(filingErrorText("no-source-link")).toBe(SOURCE_ERROR_TEXT["source-no-link"]);
    expect(FILING_ERRORS).toContain("source-note-full");
  });
});

describe("saveCapture: v: while the own-channel videos are off", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("files a v: capture as a source when there is no video filing, never as a video item", async () => {
    const { deps, research, sourcesRepo } = setup();
    const result = await saveCapture(deps, input("v: https://youtu.be/dQw4w9WgXcQ a talk on moats $TCS"));
    expect(result).toMatchObject({ itemId: null, kind: "source", parseError: null });
    expect(research.items.size).toBe(0);
    expect(only(sourcesRepo.records)).toMatchObject({ kind: "youtube", note: "a talk on moats $TCS" });
  });

  it("says 'A source needs a link.' for a v: with no link", async () => {
    const { deps } = setup();
    expect((await saveCapture(deps, input("v: my video"))).parseError).toBe("no-source-link");
  });

  it("still files the own-channel video item when the video filing is given (the switch on)", async () => {
    const { deps, research, sourcesRepo } = setup();
    const rows = new Map<string, { itemId: string }>();
    const videos = createVideoFiling({
      findByYoutubeId: async (id: string) => (rows.get(id) ? ({ itemId: rows.get(id)?.itemId } as never) : null),
      insertSource: async (itemId: string, id: string) => (rows.set(id, { itemId }), { id: "vs", itemId, youtubeId: id } as never),
    });
    const result = await saveCapture({ ...deps, videos }, input("v: https://youtu.be/dQw4w9WgXcQ"));
    expect(result.kind).toBe("video");
    expect(research.items.size).toBe(1);
    expect(sourcesRepo.records.size).toBe(0);
  });

  it("does nothing for a v: with neither filing (the error is recorded, the raw text kept)", async () => {
    const { research, catalog, captures } = setup();
    const result = await saveCapture({ research, catalog, captures }, input("v: https://youtu.be/dQw4w9WgXcQ"));
    expect(result.parseError).toBe("filing-failed");
    expect(captures.records[0].rawText).toContain("youtu.be");
  });
});

describe("refileCapture for a source", () => {
  it("files a source capture that failed the first time, and answers no item", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, sourcesRepo, captures } = setup();
    const real = sourcesRepo.insert.bind(sourcesRepo);
    let first = true;
    sourcesRepo.insert = async (s) => {
      if (first) {
        first = false;
        throw new Error("down");
      }
      return real(s);
    };
    const result = await saveCapture(deps, input(`s: ${LINK} note`));
    expect(result.parseError).toBe("filing-failed");
    const later = new Date(NOW.getTime() + 60_000);
    const refiled = await refileCapture(deps, captures.records[0].id, later);
    expect(refiled).toEqual({ itemId: null });
    expect(sourcesRepo.records.size).toBe(1);
  });
});
