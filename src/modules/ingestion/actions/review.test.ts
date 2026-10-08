import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { ReviewError } from "../errors";

const order: string[] = [];
const ops = vi.hoisted(() => ({ resolveFlag: vi.fn(), saveValues: vi.fn(), fileUnder: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const session = { cookieSession: true };

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return session;
  },
}));
vi.mock("@/modules/documents", async (importOriginal) => ({ ...(await importOriginal<object>()), createSupabaseDocumentsRepo: (db: unknown) => ({ db }) }));
vi.mock("../review-repo", () => ({ createReviewRepo: (db: unknown) => ({ db }) }));
vi.mock("../review", () => ops);

import { fileUnderAction, resolveFlagAction, saveValuesAction } from "./review";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const VIEW = { id: "p1", status: "edited" };
const CASES = [
  ["resolveFlagAction", () => resolveFlagAction(DOC, "p1", { kind: "reject" }), "resolveFlag", [DOC, "p1", { kind: "reject" }], VIEW, { ok: true, view: VIEW }],
  ["saveValuesAction", () => saveValuesAction(DOC, [{ id: "p1", keep: true }]), "saveValues", [DOC, [{ id: "p1", keep: true }]], { accepted: 4, edited: 1, rejected: 1 }, { ok: true, accepted: 4, edited: 1, rejected: 1 }],
  ["fileUnderAction", () => fileUnderAction(DOC, { itemId: "i1" }), "fileUnder", [DOC, { itemId: "i1" }], { itemId: "i1", count: 5 }, { ok: true, itemId: "i1", count: 5 }],
] as const;

beforeEach(() => {
  order.length = 0;
  requireAdmin.mockClear();
  revalidatePath.mockClear();
  for (const fn of Object.values(ops)) fn.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(CASES)("%s", (_name, call, op, args, returned, expected) => {
  it("checks the admin before it touches the database, runs on the admin's own session and refreshes the review page", async () => {
    ops[op].mockResolvedValue(returned);
    expect(await call()).toEqual(expected);
    expect(order).toEqual(["requireAdmin", "client"]);
    const [ports, ...rest] = ops[op].mock.calls[0];
    expect(rest).toEqual(args);
    expect(ports).toMatchObject({ docs: { db: session }, review: { db: session } });
    expect(revalidatePath).toHaveBeenCalledWith(`/desk/inbox/${DOC}/review`);
  });

  it("stops before the database when the admin check redirects", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).toEqual([]);
    expect(ops[op]).not.toHaveBeenCalled();
  });

  it("returns a fixed code and text for a refusal, and a plain save-failed for anything else", async () => {
    ops[op].mockRejectedValueOnce(new ReviewError("type-value-first"));
    expect(await call()).toEqual({ ok: false, code: "type-value-first", message: "Type the value from the page first." });
    ops[op].mockRejectedValueOnce(new InvalidInputError());
    expect(await call()).toMatchObject({ ok: false, code: "invalid-input" });
    ops[op].mockRejectedValueOnce(new Error("relation \"proposals\" row 'secret text' failed"));
    const result = await call();
    expect(result).toEqual({ ok: false, code: "save-failed", message: "Could not save. Try again." });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("fileUnderAction", () => {
  it("also refreshes the file it filed under", async () => {
    ops.fileUnder.mockResolvedValue({ itemId: "i1", count: 5 });
    await fileUnderAction(DOC, {});
    expect(revalidatePath).toHaveBeenCalledWith("/desk/items/i1");
  });
});
