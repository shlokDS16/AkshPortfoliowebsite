import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { CaptureNotRefilableError, needsRefile, REFILE_AFTER_MS, refileCapture } from "./refile";
import { saveCapture } from "./service";

function setup() {
  const research = createMemoryResearchRepo();
  const catalog = createMemoryCatalogRepo();
  const captures = createMemoryCaptureRepo();
  return { research, catalog, captures, deps: { research, catalog, captures } };
}
const input = (rawText: string) => ({ rawText, source: "web" as const, clientId: randomUUID() });
const after = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("needsRefile", () => {
  const base = { itemId: null, parseError: null, parsedMissing: false, createdAt: "2026-10-06T08:00:00Z" } as const;
  const now = new Date("2026-10-06T08:09:00Z");

  it("is false once an item is attached", () => {
    expect(needsRefile({ ...base, itemId: "i", parseError: "filing-failed" }, now)).toBe(false);
  });

  it("is true at once for a recorded filing failure, never for thesis-full or link-failed", () => {
    expect(needsRefile({ ...base, parseError: "filing-failed" }, now)).toBe(true);
    expect(needsRefile({ ...base, parseError: "thesis-full" }, now)).toBe(false);
    expect(needsRefile({ ...base, parseError: "link-failed" }, now)).toBe(false);
  });

  it("waits 10 minutes for a capture that was never parsed", () => {
    expect(needsRefile({ ...base, parsedMissing: true }, now)).toBe(false);
    expect(needsRefile({ ...base, parsedMissing: true }, new Date("2026-10-06T08:10:00Z"))).toBe(true);
  });
});

describe("refileCapture", () => {
  it("files a failed capture at once", async () => {
    const { deps, captures, research } = setup();
    vi.spyOn(research, "insertItem").mockRejectedValueOnce(new Error("db down"));
    const saved = await saveCapture(deps, input("p: $KAVPUMP receivables again"));
    expect(saved).toMatchObject({ itemId: null, parseError: "filing-failed" });

    const { itemId } = await refileCapture(deps, saved.captureId, new Date());
    expect(research.items.get(itemId)).toMatchObject({ kind: "process", visibility: "private" });
    expect(captures.records[0]).toMatchObject({ itemId, parsed: expect.not.objectContaining({ error: expect.anything() }) });
    expect(research.items.size).toBe(1);
  });

  it("refiles a capture with no parse at all only from 10 minutes on", async () => {
    const { deps, captures, research } = setup();
    const record = await captures.insertRaw({ rawText: "a stranded thought", source: "web", clientId: randomUUID() });
    await expect(refileCapture(deps, record.id, after(record.createdAt, REFILE_AFTER_MS - 1000))).rejects.toBeInstanceOf(CaptureNotRefilableError);
    expect(research.items.size).toBe(0);
    const { itemId } = await refileCapture(deps, record.id, after(record.createdAt, REFILE_AFTER_MS));
    expect(research.items.get(itemId)?.title).toBe("a stranded thought");
    expect(captures.records[0].itemId).toBe(itemId);
  });

  it("links the item that already holds the text (the link was lost) and creates none", async () => {
    const { deps, captures, research } = setup();
    vi.spyOn(captures, "attach").mockRejectedValueOnce(new Error("db blip"));
    const saved = await saveCapture(deps, input("$KAVPUMP channel checks look weak"));
    expect(saved).toMatchObject({ parseError: "link-failed" });
    expect(captures.records[0].itemId).toBeNull();
    // The fake stamps revisions before the capture; real ones are written after it.
    research.revisions[0].createdAt = after(captures.records[0].createdAt, 2000).toISOString();

    const { itemId } = await refileCapture(deps, saved.captureId, after(captures.records[0].createdAt, REFILE_AFTER_MS + 1000));
    expect(itemId).toBe(saved.itemId);
    expect(research.items.size).toBe(1);
    expect(captures.records[0].itemId).toBe(saved.itemId);
  });

  it("throws for a capture that is already filed, one that does not exist, and a thesis-full capture", async () => {
    const { deps, captures } = setup();
    const filed = await saveCapture(deps, input("filed fine"));
    await expect(refileCapture(deps, filed.captureId, new Date())).rejects.toBeInstanceOf(CaptureNotRefilableError);
    await expect(refileCapture(deps, randomUUID(), new Date())).rejects.toBeInstanceOf(CaptureNotRefilableError);
    const full = await captures.insertRaw({ rawText: "t: $X more", source: "web", clientId: randomUUID() });
    await captures.attach(full.id, { parsed: { error: "thesis-full" } });
    await expect(refileCapture(deps, full.id, new Date())).rejects.toBeInstanceOf(CaptureNotRefilableError);
  });
});
