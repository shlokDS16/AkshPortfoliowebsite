import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { createMemorySourcesRepo, type MemorySourcesRepo } from "@/test/fakes/sources-repo";
import { createItem } from "@/modules/research";

const order: string[] = [];
const state = vi.hoisted(() => ({ research: null as unknown, sources: null as unknown, afterCallbacks: [] as (() => unknown)[], read: "read" as string }));
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const revalidatePath = vi.fn();
const startSourceRead = vi.fn(async (id: string): Promise<undefined> => void id);
const runSourceReadNow = vi.fn(async (id: string) => (void id, state.read));

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void state.afterCallbacks.push(fn) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => (order.push("client"), {}) }));
vi.mock("@/modules/ops/jobs", () => ({ startSourceRead: (id: string) => startSourceRead(id), runSourceReadNow: (id: string) => runSourceReadNow(id) }));
vi.mock("@/modules/research", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.research }));
vi.mock("./repo", () => ({ createSupabaseSourcesRepo: () => state.sources }));

import { archiveSourceAction, readAgainAction, restoreSourceAction, saveSourceAction, saveStudiedRevisionAction, updateSourceAction } from "./actions";

const C1 = "11111111-1111-4111-8111-111111111111";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BAD = "not-a-uuid";
const SHA = "a".repeat(64);
let research: MemoryResearchRepo;
let sources: MemorySourcesRepo;

function form(fields: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return f;
}
async function redirected(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return (error as Error).message;
}

beforeEach(() => {
  research = createMemoryResearchRepo();
  sources = createMemorySourcesRepo();
  state.research = research;
  state.sources = sources;
  state.afterCallbacks.length = 0;
  state.read = "read";
  order.length = 0;
  requireAdmin.mockClear();
  revalidatePath.mockClear();
  startSourceRead.mockClear();
  runSourceReadNow.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("every action checks the admin before it touches anything", () => {
  it("stops at the admin check", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));
    for (const call of [
      () => saveSourceAction(form([["url", "https://a.example/x"]])),
      () => updateSourceAction(C1, form([])),
      () => archiveSourceAction(C1),
      () => restoreSourceAction(C1),
      () => readAgainAction(C1),
      () => saveStudiedRevisionAction(C1, form([])),
    ]) {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    }
    expect(order).toEqual([]);
    expect(sources.records.size).toBe(0);
    requireAdmin.mockImplementation(async () => (order.push("requireAdmin"), { userId: "u-1", email: "aksh@example.com" }));
  });
});

describe("saveSourceAction", () => {
  it("saves the link with his note, companies and concepts, answers in the spec's words and starts the first read after the answer", async () => {
    const result = await saveSourceAction(form([["url", "https://example.com/post"], ["note", "why it matters"], ["companyId", C1], ["themeId", T1]]));
    expect(result).toMatchObject({ ok: true, answer: "Source saved. Reading its title." });
    const [record] = sources.records.values();
    expect(record).toMatchObject({ url: "https://example.com/post", note: "why it matters", companyIds: [C1], themeIds: [T1] });
    expect(startSourceRead).not.toHaveBeenCalled();
    await Promise.all(state.afterCallbacks.map((fn) => fn()));
    expect(startSourceRead).toHaveBeenCalledWith(record.id);
    expect(revalidatePath).toHaveBeenCalledWith("/desk/sources");
  });

  it("does not read a link saved before again, and says when it was saved", async () => {
    await saveSourceAction(form([["url", "https://example.com/post"]]));
    state.afterCallbacks.length = 0;
    const again = await saveSourceAction(form([["url", "https://example.com/post"], ["note", "second"]]));
    expect(again).toMatchObject({ ok: true, answer: expect.stringMatching(/^You saved this link on .* Your note was added to it\.$/) });
    expect(state.afterCallbacks).toHaveLength(0);
  });

  it("answers with a fixed code, never text, for a missing link, a long note, and an id that is not a UUID", async () => {
    expect(await saveSourceAction(form([["url", "words only"]]))).toEqual({ ok: false, error: "source-no-link" });
    expect(await saveSourceAction(form([["url", "https://a.example/x"], ["note", "n".repeat(4001)]]))).toEqual({ ok: false, error: "source-note-full" });
    expect(await saveSourceAction(form([["url", "https://a.example/x"], ["companyId", BAD]]))).toEqual({ ok: false, error: "invalid-input" });
    expect(sources.records.size).toBe(0);
  });

  it("reads no machine field from the form: a title, a picture or a hash in the request changes nothing", async () => {
    await saveSourceAction(form([["url", "https://a.example/x"], ["title", "Injected"], ["metaSha", SHA], ["thumbPath", "yt/x.jpg"]]));
    expect([...sources.records.values()][0]).toMatchObject({ title: null, metaSha: null, thumbPath: null });
  });
});

describe("updateSourceAction, archiveSourceAction and restoreSourceAction", () => {
  async function one() {
    await saveSourceAction(form([["url", "https://a.example/x"], ["note", "first"], ["companyId", C1]]));
    return [...sources.records.values()][0].id;
  }

  it("sets the note and the lists to what was sent", async () => {
    const id = await one();
    expect(await updateSourceAction(id, form([["note", "changed"], ["themeId", T1]]))).toMatchObject({ ok: true });
    expect(sources.records.get(id)).toMatchObject({ note: "changed", companyIds: [], themeIds: [T1] });
  });

  it("refuses an id that is not a UUID and a source on a public file, by code", async () => {
    const id = await one();
    expect(await updateSourceAction(BAD, form([]))).toEqual({ ok: false, error: "source-not-found" });
    sources.publicOn.set(id, [C1]);
    expect(await archiveSourceAction(id)).toEqual({ ok: false, error: "source-on-public-file" });
    expect(await updateSourceAction(id, form([["note", "x"]]))).toEqual({ ok: false, error: "source-on-public-file" });
  });

  it("archives and restores", async () => {
    const id = await one();
    expect(await archiveSourceAction(id)).toMatchObject({ ok: true });
    expect(sources.records.get(id)?.archivedAt).not.toBeNull();
    expect(await restoreSourceAction(id)).toMatchObject({ ok: true });
    expect(sources.records.get(id)?.archivedAt).toBeNull();
  });
});

describe("readAgainAction", () => {
  it("reads that source now and says what happened", async () => {
    await saveSourceAction(form([["url", "https://a.example/x"]]));
    const id = [...sources.records.keys()][0];
    expect(await readAgainAction(id)).toEqual({ ok: true, id, result: "read" });
    expect(runSourceReadNow).toHaveBeenCalledWith(id);
  });

  it("answers by code for a source that is not there, one read a minute ago, and an id that is not a UUID", async () => {
    expect(await readAgainAction(BAD)).toEqual({ ok: false, error: "source-not-found" });
    expect(await readAgainAction("00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "source-not-found" });
    expect(runSourceReadNow).not.toHaveBeenCalled();
    await saveSourceAction(form([["url", "https://a.example/x"]]));
    state.read = "recent";
    expect(await readAgainAction([...sources.records.keys()][0])).toEqual({ ok: false, error: "source-read-recent" });
  });

  it("answers a failed read by code and logs only its shape", async () => {
    await saveSourceAction(form([["url", "https://a.example/x"]]));
    runSourceReadNow.mockRejectedValueOnce(new Error("secret link https://a.example/x?token=abc"));
    const result = await readAgainAction([...sources.records.keys()][0]);
    expect(result).toEqual({ ok: false, error: "save-failed" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/token|a\.example/);
  });
});

describe("saveStudiedRevisionAction", () => {
  async function file(kind: "thesis" | "note" = "thesis") {
    const { item } = await createItem(research, { kind, title: "T", bodyMd: "My body.", companyId: C1, structured: { schema: "casefile/1", facts: [{ id: "F1" }] } });
    await saveSourceAction(form([["url", "https://a.example/x"], ["companyId", C1]]));
    const link = [...sources.records.values()][0];
    link.metaSha = SHA;
    return { item, link };
  }

  it("saves a new revision with the chosen sources, the body and the rest of the record carried forward, and his reason", async () => {
    const { item, link } = await file();
    const f = form([["link", link.id], [`showTitle:${link.id}`, "on"], [`note:${link.id}`, "what I took"], ["changeReason", "added a source"]]);
    expect(await redirected(saveStudiedRevisionAction(item.id, f))).toBe(`NEXT_REDIRECT:/desk/items/${item.id}?notice=revision-saved`);
    const latest = research.revisions.filter((r) => r.itemId === item.id).at(-1);
    expect(latest).toMatchObject({
      bodyMd: "My body.", changeReason: "added a source",
      structured: { schema: "casefile/1", facts: [{ id: "F1" }], studied: [{ link: link.id, show: true, metaSha: SHA, note: "what I took" }] },
    });
  });

  it("takes the hash from the table, never from the form", async () => {
    const { item, link } = await file();
    const f = form([["link", link.id], [`showTitle:${link.id}`, "on"], [`metaSha:${link.id}`, "b".repeat(64)], ["metaSha", "c".repeat(64)]]);
    await redirected(saveStudiedRevisionAction(item.id, f));
    const studied = research.revisions.at(-1)?.structured.studied as { metaSha: string }[];
    expect(studied[0].metaSha).toBe(SHA);
  });

  it("writes no change reason of its own when he gives none", async () => {
    const { item, link } = await file();
    await redirected(saveStudiedRevisionAction(item.id, form([["link", link.id]])));
    expect(research.revisions.at(-1)?.changeReason).toBeNull();
  });

  it("says the revision waits for the gate when the file is public", async () => {
    const { item, link } = await file();
    research.setVisibility(item.id, "public");
    expect(await redirected(saveStudiedRevisionAction(item.id, form([["link", link.id]])))).toBe(`NEXT_REDIRECT:/desk/items/${item.id}?notice=revision-pending-gate`);
  });

  it("refuses by code, saving nothing, for a kind that takes no sources, a source of another company, and an id that is not a UUID", async () => {
    const note = await file("note");
    const { item } = await createItem(research, { kind: "thesis", title: "Other", bodyMd: "b", companyId: "22222222-2222-4222-8222-222222222222", structured: { schema: "casefile/1" } });
    const before = research.revisions.length;
    expect(await redirected(saveStudiedRevisionAction(note.item.id, form([["link", note.link.id]])))).toBe(`NEXT_REDIRECT:/desk/items/${note.item.id}?error=studied-not-company-file`);
    expect(await redirected(saveStudiedRevisionAction(item.id, form([["link", note.link.id]])))).toBe(`NEXT_REDIRECT:/desk/items/${item.id}?error=studied-not-attached`);
    expect(await redirected(saveStudiedRevisionAction(BAD, form([])))).toBe("NEXT_REDIRECT:/desk/items?error=item-not-found");
    expect(research.revisions.length).toBe(before);
  });
});
