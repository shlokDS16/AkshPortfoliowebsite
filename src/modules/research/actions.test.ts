import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";

const order: string[] = [];
const state = vi.hoisted(() => ({ repo: null as unknown }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const createRepo = vi.fn(() => state.repo);

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return {};
  },
}));
vi.mock("./repo", () => ({ createSupabaseResearchRepo: () => createRepo() }));

import { addRevisionAction, createItemAction, updateItemMetaAction } from "./actions";

let repo: MemoryResearchRepo;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
/** Runs an action and returns the redirect target it threw. */
async function target(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1];
    throw error;
  }
  throw new Error("expected a redirect");
}
const errorOf = (to: string) => new URL(to, "http://x").searchParams.get("error");

beforeEach(() => {
  repo = createMemoryResearchRepo();
  state.repo = repo;
  order.length = 0;
  requireAdmin.mockClear();
  createRepo.mockClear();
  redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("every action checks the admin first", () => {
  it("stops before touching the database when requireAdmin redirects", async () => {
    requireAdmin.mockImplementationOnce(async () => {
      throw new Error("NEXT_REDIRECT:/login");
    });
    await expect(createItemAction(form({ kind: "note", title: "T" }))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).not.toContain("client");
    expect(repo.items.size).toBe(0);
  });

  it.each([
    ["createItemAction", () => createItemAction(form({ kind: "note", title: "T" }))],
    ["updateItemMetaAction", () => updateItemMetaAction(randomUUID(), form({ title: "T" }))],
    ["addRevisionAction", () => addRevisionAction(randomUUID(), form({ bodyMd: "x" }))],
  ])("%s calls requireAdmin before opening a database client", async (_name, run) => {
    await target(run);
    expect(order[0]).toBe("requireAdmin");
  });
});

describe("createItemAction", () => {
  it("creates a private draft and opens it", async () => {
    const to = await target(() => createItemAction(form({ kind: "learning", title: "  Capex cycles " })));
    const [item] = [...repo.items.values()];
    expect(to).toBe(`/desk/items/${item.id}`);
    expect(item).toMatchObject({ title: "Capex cycles", visibility: "private" });
  });

  it("sends a validation message back to the list", async () => {
    const to = await target(() => createItemAction(form({ kind: "note", title: "  " })));
    expect(to).toMatch(/^\/desk\/items\?error=/);
    expect(errorOf(to)).toBe("title-required");
    expect(repo.items.size).toBe(0);
  });
});

describe("updateItemMetaAction", () => {
  it("saves details and ignores a slug field (ruling R5)", async () => {
    const { item } = await (await import("./service")).createItem(repo, { kind: "learning", title: "T" });
    const to = await target(() =>
      updateItemMetaAction(item.id, form({ title: "T2", slug: "hijack", learningObjective: "Spot a peak.", holdsPosition: "no", dataAsOf: "2026-08-01" })),
    );
    expect(to).toBe(`/desk/items/${item.id}?notice=details-saved`);
    expect(repo.items.get(item.id)).toMatchObject({ title: "T2", learningObjective: "Spot a peak.", holdsPosition: "no", dataAsOf: "2026-08-01", slug: null });
  });

  it("says plainly that a public item is locked", async () => {
    const { item } = await (await import("./service")).createItem(repo, { kind: "learning", title: "T" });
    repo.setVisibility(item.id, "public");
    const to = await target(() => updateItemMetaAction(item.id, form({ title: "New" })));
    expect(errorOf(to)).toBe("public-item-locked");
  });

  it("treats a malformed id as not found without touching the repo", async () => {
    const to = await target(() => updateItemMetaAction("not-a-uuid", form({ title: "T" })));
    expect(to).toMatch(/^\/desk\/items\?error=/);
    expect(errorOf(to)).toBe("item-not-found");
    expect(createRepo).not.toHaveBeenCalled();
  });

  it("never leaks a raw database error", async () => {
    vi.spyOn(repo, "getItem").mockRejectedValueOnce(new DbError("research.getItem", "XX000", 'relation "private.settings" does not exist'));
    const to = await target(() => updateItemMetaAction(randomUUID(), form({ title: "T" })));
    expect(errorOf(to)).toBe("save-failed");
    expect(decodeURIComponent(to)).not.toMatch(/private\.settings/);
    expect(console.error).toHaveBeenCalledWith("research action failed", { name: "DbError", op: "research.getItem", code: "XX000" });
  });
});

describe("addRevisionAction", () => {
  it("saves a revision on a private item", async () => {
    const { item } = await (await import("./service")).createItem(repo, { kind: "note", title: "T", bodyMd: "v1" });
    const to = await target(() => addRevisionAction(item.id, form({ bodyMd: "v2", changeReason: "sharper" })));
    expect(to).toBe(`/desk/items/${item.id}?notice=revision-saved`);
    expect(repo.revisions.map((r) => r.bodyMd)).toEqual(["v1", "v2"]);
  });

  it("says the revision is waiting for the gate on a public item", async () => {
    const { item, revision } = await (await import("./service")).createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    const to = await target(() => addRevisionAction(item.id, form({ bodyMd: "v2" })));
    expect(to).toBe(`/desk/items/${item.id}?notice=revision-pending-gate`);
    expect(repo.items.get(item.id)?.currentRevisionId).toBe(revision.id);
    expect(repo.revisions).toHaveLength(2);
  });

  it("keeps the body exactly as typed (no trimming of Markdown)", async () => {
    const { item } = await (await import("./service")).createItem(repo, { kind: "note", title: "T" });
    await target(() => addRevisionAction(item.id, form({ bodyMd: "  indented\n\n- list\n" })));
    expect(repo.revisions[1].bodyMd).toBe("  indented\n\n- list\n");
  });
});
