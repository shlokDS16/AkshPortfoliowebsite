import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createMemoryCaptureRepo, type MemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";

const order: string[] = [];
const state = vi.hoisted(() => ({ deps: null as unknown }));
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return {};
  },
}));
vi.mock("./deps", () => ({ createCaptureDeps: () => state.deps }));

import { refileCaptureAction, submitCapture } from "./actions";

let captures: MemoryCaptureRepo;
let research: MemoryResearchRepo;
const entry = (rawText: string, clientId: string = randomUUID()) => ({ clientId, rawText, source: "web" as const });

beforeEach(() => {
  captures = createMemoryCaptureRepo();
  research = createMemoryResearchRepo();
  state.deps = { captures, research, catalog: createMemoryCatalogRepo() };
  order.length = 0;
  requireAdmin.mockClear();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitCapture", () => {
  it("checks the admin before it touches the database", async () => {
    await submitCapture(entry("a thought"));
    expect(order).toEqual(["requireAdmin", "client"]);
  });

  it("does nothing when the admin check fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(submitCapture(entry("a thought"))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(captures.records).toHaveLength(0);
    expect(order).toEqual([]);
  });

  it("saves, files and refreshes the desk", async () => {
    const result = await submitCapture(entry("$TCS order book"));
    expect(result).toMatchObject({ ok: true, duplicate: false, parseError: null });
    expect(captures.records).toHaveLength(1);
    expect(research.items.size).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/desk");
  });

  it("reports a resend of the same clientId as a duplicate, with one capture and one item", async () => {
    const once = entry("$TCS once");
    await submitCapture(once);
    const again = await submitCapture(once);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(captures.records).toHaveLength(1);
    expect(research.items.size).toBe(1);
  });

  it.each([
    ["", "empty-capture"],
    ["  \n ", "empty-capture"],
    ["x".repeat(20_001), "too-long"],
  ])("drops an unsavable entry (%j) with a fixed code and writes nothing", async (text, code) => {
    const result = await submitCapture(entry(text));
    expect(result).toMatchObject({ ok: false, retry: false, code });
    expect(captures.records).toHaveLength(0);
  });

  it("drops a malformed entry (bad client id, unknown source, no object) as invalid-capture", async () => {
    const dropped = { ok: false, retry: false, code: "invalid-capture" };
    expect(await submitCapture({ ...entry("ok"), clientId: "nope" })).toMatchObject(dropped);
    expect(await submitCapture({ ...entry("ok"), source: "sms" as never })).toMatchObject(dropped);
    expect(await submitCapture(null as never)).toMatchObject(dropped);
    expect(captures.records).toHaveLength(0);
  });

  it("keeps the entry on the device when the database is down, without leaking the error", async () => {
    const secret = new DbError("capture.insertRaw", "08006", 'password for "postgres" failed');
    state.deps = {
      captures: { ...captures, insertRaw: () => Promise.reject(secret) },
      research,
      catalog: createMemoryCatalogRepo(),
    };
    const result = await submitCapture(entry("a thought"));
    expect(result).toMatchObject({ ok: false, retry: true, code: "save-failed" });
    expect(JSON.stringify(result)).not.toContain("postgres");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("postgres");
  });

  it("returns ok with a filing code when the text is stored but could not be filed", async () => {
    state.deps = {
      captures,
      research: { ...research, insertItem: () => Promise.reject(new Error("db down")) },
      catalog: createMemoryCatalogRepo(),
    };
    const result = await submitCapture(entry("a thought"));
    expect(result).toMatchObject({ ok: true, itemId: null, parseError: "filing-failed" });
    expect(captures.records).toHaveLength(1);
  });
});

describe("refileCaptureAction", () => {
  it("files a failed capture, refreshes the desk and confirms with a fixed notice code", async () => {
    state.deps = { captures, research: { ...research, insertItem: () => Promise.reject(new Error("db down")) }, catalog: createMemoryCatalogRepo() };
    const failed = await submitCapture(entry("a thought"));
    if (!failed.ok) throw new Error("expected the capture to be stored");
    state.deps = { captures, research, catalog: createMemoryCatalogRepo() };
    order.length = 0;
    await expect(refileCaptureAction(failed.captureId)).rejects.toThrow("NEXT_REDIRECT:/desk?notice=refiled");
    expect(order[0]).toBe("requireAdmin");
    expect(revalidatePath).toHaveBeenCalledWith("/desk");
    expect(captures.records[0].itemId).not.toBeNull();
  });

  it("sends a filed capture and a crafted id back with a fixed error code, never free text", async () => {
    const saved = await submitCapture(entry("filed fine"));
    if (!saved.ok) throw new Error("expected the capture to be stored");
    await expect(refileCaptureAction(saved.captureId)).rejects.toThrow("NEXT_REDIRECT:/desk?error=capture-not-refilable");
    await expect(refileCaptureAction("not-an-id")).rejects.toThrow("NEXT_REDIRECT:/desk?error=capture-not-refilable");
  });

  it("does nothing when the admin check fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(refileCaptureAction(randomUUID())).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
