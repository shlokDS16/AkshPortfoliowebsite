import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createItem } from "@/modules/research";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { fakeKnowledge, makeConcept } from "./fake-deps";

const state = vi.hoisted(() => ({
  admin: true,
  deps: null as unknown,
  setThemePublic: (async () => undefined) as (db: unknown, id: unknown) => Promise<void>,
  updateDescription: (async () => undefined) as (db: unknown, id: unknown, text: unknown) => Promise<void>,
}));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const revalidatePath = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/modules/identity", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("NEXT_REDIRECT:/login");
    return { userId: "u-1", email: "aksh@example.com" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ marker: "db" }) }));
vi.mock("./repo", () => ({ createSupabaseKnowledgeDeps: () => state.deps }));
vi.mock("@/modules/catalog", async (original) => ({
  ...(await original<typeof import("@/modules/catalog")>()),
  setThemePublic: (db: unknown, id: unknown) => state.setThemePublic(db, id),
  updateConceptDescription: (db: unknown, id: unknown, text: unknown) => state.updateDescription(db, id, text),
}));

import { ConceptDescriptionTooLongError, NameNotScreenedError } from "@/modules/catalog";
import { linkConceptsAction, makePublicAction, saveConceptsAction, saveDescriptionAction, unlinkConceptsAction } from "./actions";

const a = makeConcept({ name: "A" });
const b = makeConcept({ name: "B" });
const [lo, hi] = [a.id, b.id].sort() as [string, string];

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

let world: ReturnType<typeof fakeKnowledge>["world"];

beforeEach(() => {
  state.admin = true;
  const fake = fakeKnowledge({ concepts: [a, b] });
  world = fake.world;
  state.deps = fake.deps;
  state.setThemePublic = vi.fn(async () => undefined);
  state.updateDescription = vi.fn(async () => undefined);
  revalidatePath.mockClear();
});

describe("every action needs the admin first", () => {
  it("redirects to the sign-in page and does nothing else", async () => {
    state.admin = false;
    expect(await target(() => linkConceptsAction(a.id, b.id, "a"))).toBe("/login");
    expect(await target(() => unlinkConceptsAction(a.id, b.id, "a"))).toBe("/login");
    expect(await target(() => saveConceptsAction(randomUUID(), []))).toBe("/login");
    expect(await target(() => saveDescriptionAction(a.id, "a", new FormData()))).toBe("/login");
    expect(await target(() => makePublicAction(a.id, "a"))).toBe("/login");
    expect(world.edgeCalls).toEqual([]);
    expect(state.setThemePublic).not.toHaveBeenCalled();
    expect(state.updateDescription).not.toHaveBeenCalled();
  });
});

describe("linkConceptsAction and unlinkConceptsAction", () => {
  it("links once with a < b and returns to the concept page with a notice; a double tap is one row", async () => {
    expect(await target(() => linkConceptsAction(b.id, a.id, "a"))).toBe("/desk/concepts/a?notice=concept-linked");
    await target(() => linkConceptsAction(a.id, b.id, "a"));
    expect(world.edges).toEqual([{ conceptA: lo, conceptB: hi }]);
    expect(revalidatePath).toHaveBeenCalledWith("/desk/concepts/a");
  });

  it("says in words that a concept cannot be linked to itself", async () => {
    expect(await target(() => linkConceptsAction(a.id, a.id, "a"))).toBe("/desk/concepts/a?error=concept-self-link");
    expect(world.edgeCalls).toEqual([]);
  });

  it("refuses malformed ids, and falls back to the index for a crafted slug", async () => {
    expect(await target(() => linkConceptsAction("nope", b.id, "a"))).toBe("/desk/concepts/a?error=invalid-input");
    expect(await target(() => linkConceptsAction(a.id, b.id, "../../login?x="))).toBe("/desk/concepts?notice=concept-linked");
    expect(await target(() => unlinkConceptsAction("nope", b.id, "https://evil"))).toBe("/desk/concepts?error=invalid-input");
  });

  it("removes the link", async () => {
    world.edges.push({ conceptA: lo, conceptB: hi });
    expect(await target(() => unlinkConceptsAction(hi, lo, "a"))).toBe("/desk/concepts/a?notice=concept-unlinked");
    expect(world.edges).toEqual([]);
  });
});

describe("saveConceptsAction", () => {
  it("saves a revision and returns to the item with a notice; a pending one says it waits for the gate", async () => {
    const research = createMemoryResearchRepo();
    (state.deps as { research: unknown }).research = research;
    const { item } = await createItem(research, { kind: "learning", title: "T", conceptIds: [a.id] });
    expect(await target(() => saveConceptsAction(item.id, [a.id, b.id]))).toBe(`/desk/items/${item.id}?notice=concepts-saved`);
    expect(research.revisions).toHaveLength(2);
    research.setVisibility(item.id, "public");
    expect(await target(() => saveConceptsAction(item.id, [a.id]))).toBe(`/desk/items/${item.id}?notice=revision-pending-gate`);
    expect(await target(() => saveConceptsAction(item.id, [b.id]))).toBe(`/desk/items/${item.id}?error=concept-change-pending`);
    expect(research.revisions).toHaveLength(3);
  });

  it("refuses more than 8, a malformed id and a malformed item id before reading anything", async () => {
    const item = randomUUID();
    expect(await target(() => saveConceptsAction(item, Array.from({ length: 9 }, () => randomUUID())))).toBe(`/desk/items/${item}?error=invalid-input`);
    expect(await target(() => saveConceptsAction(item, ["nope"]))).toBe(`/desk/items/${item}?error=invalid-input`);
    expect(await target(() => saveConceptsAction("nope", []))).toBe("/desk/items?error=invalid-input");
  });
});

describe("saveDescriptionAction", () => {
  const form = (text: string) => {
    const data = new FormData();
    data.set("description", text);
    return data;
  };

  it("stores his text through the catalog and returns to the page", async () => {
    expect(await target(() => saveDescriptionAction(a.id, "a", form("what I mean")))).toBe("/desk/concepts/a?notice=concept-description-saved");
    expect(state.updateDescription).toHaveBeenCalledWith({ marker: "db" }, a.id, "what I mean");
    expect(revalidatePath).toHaveBeenCalledWith("/desk/concepts/a");
  });

  it("passes blank text on (the catalog stores it as none) and refuses a missing field", async () => {
    await target(() => saveDescriptionAction(a.id, "a", form("")));
    expect(state.updateDescription).toHaveBeenCalledWith({ marker: "db" }, a.id, "");
    expect(await target(() => saveDescriptionAction(a.id, "a", new FormData()))).toBe("/desk/concepts/a?error=invalid-input");
  });

  it("shows the refusals of the catalog as fixed codes", async () => {
    state.updateDescription = vi.fn(async () => {
      throw new ConceptDescriptionTooLongError();
    });
    expect(await target(() => saveDescriptionAction(a.id, "a", form("x")))).toBe("/desk/concepts/a?error=concept-description-too-long");
  });
});

describe("makePublicAction", () => {
  it("makes a screened concept public and returns to its page", async () => {
    expect(await target(() => makePublicAction(a.id, "a"))).toBe("/desk/concepts/a?notice=concept-public");
    expect(state.setThemePublic).toHaveBeenCalledWith({ marker: "db" }, a.id);
  });

  it("refuses a stub in words", async () => {
    state.setThemePublic = vi.fn(async () => {
      throw new NameNotScreenedError();
    });
    expect(await target(() => makePublicAction(a.id, "a"))).toBe("/desk/concepts/a?error=name-not-screened");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a malformed id", async () => {
    expect(await target(() => makePublicAction("nope", "a"))).toBe("/desk/concepts/a?error=invalid-input");
    expect(state.setThemePublic).not.toHaveBeenCalled();
  });
});
