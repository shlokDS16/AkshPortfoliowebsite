import { beforeEach, describe, expect, it, vi } from "vitest";
import { NameNotScreenedError } from "./errors";

const state = vi.hoisted(() => ({ admin: true, setThemePublic: (async () => undefined) as (db: unknown, id: unknown) => Promise<void> }));
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
vi.mock("./concepts", async (original) => ({ ...(await original<typeof import("./concepts")>()), setThemePublic: (db: unknown, id: unknown) => state.setThemePublic(db, id) }));

import { makeConceptPublicAction } from "./actions";

const CONCEPT = "7d1c2f0e-5c1a-4f3a-9a5e-2b7f4e8d9c10";
const ITEM = "0b6a3c52-8f0e-4d0b-bb0c-3a7e5d2c1f44";

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

beforeEach(() => {
  state.admin = true;
  state.setThemePublic = vi.fn(async () => undefined);
  revalidatePath.mockClear();
});

describe("makeConceptPublicAction", () => {
  it("makes a screened concept public and returns to the item's checklist with the notice", async () => {
    const to = await target(() => makeConceptPublicAction(CONCEPT, ITEM));
    expect(state.setThemePublic).toHaveBeenCalledWith({ marker: "db" }, CONCEPT);
    expect(to).toBe(`/desk/items/${ITEM}?notice=concept-public#gate`);
    expect(revalidatePath).toHaveBeenCalledWith(`/desk/items/${ITEM}`);
  });

  it("refuses a stub with the fixed code, and changes nothing else", async () => {
    state.setThemePublic = vi.fn(async () => {
      throw new NameNotScreenedError();
    });
    const to = await target(() => makeConceptPublicAction(CONCEPT, ITEM));
    expect(to).toBe(`/desk/items/${ITEM}?error=name-not-screened`);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a malformed id before touching the database", async () => {
    const to = await target(() => makeConceptPublicAction("nope", ITEM));
    expect(to).toBe(`/desk/items/${ITEM}?error=invalid-input`);
    expect(state.setThemePublic).not.toHaveBeenCalled();
    expect(await target(() => makeConceptPublicAction(CONCEPT, "nope"))).toBe("/desk/items?error=invalid-input");
  });

  it("needs the admin first", async () => {
    state.admin = false;
    expect(await target(() => makeConceptPublicAction(CONCEPT, ITEM))).toBe("/login");
    expect(state.setThemePublic).not.toHaveBeenCalled();
  });
});
