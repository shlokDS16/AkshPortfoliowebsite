import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { InboxError } from "../errors";

const order: string[] = [];
const ops = vi.hoisted(() => ({ setBudget: vi.fn(), skipAttention: vi.fn(), retryAttention: vi.fn(), skipDocument: vi.fn() }));
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const session = { cookieSession: true };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return session;
  },
}));
vi.mock("@/modules/documents", async (importOriginal) => ({ ...(await importOriginal<object>()), createSupabaseDocumentsRepo: (db: unknown) => ({ db }) }));
vi.mock("../inbox-repo", () => ({ createSupabaseInboxRepo: (db: unknown) => ({ db }) }));
vi.mock("../queue-repo", () => ({ createQueueRepo: (db: unknown) => ({ db }) }));
vi.mock("../inbox-ops", () => ops);

import { retryStepAction, setBudgetAction, skipDocumentAction, skipStepAction } from "./inbox";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const CASES = [
  ["setBudgetAction", () => setBudgetAction(DOC, 30), "setBudget", [DOC, 30]],
  ["skipStepAction", () => skipStepAction(DOC), "skipAttention", [DOC]],
  ["retryStepAction", () => retryStepAction(DOC), "retryAttention", [DOC]],
  ["skipDocumentAction", () => skipDocumentAction(DOC), "skipDocument", [DOC]],
] as const;

beforeEach(() => {
  order.length = 0;
  requireAdmin.mockClear();
  for (const fn of Object.values(ops)) fn.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(CASES)("%s", (_name, call, op, args) => {
  it("checks the admin before it touches the database, and runs on the admin's own session", async () => {
    expect(await call()).toEqual({ ok: true });
    expect(order).toEqual(["requireAdmin", "client"]);
    const [ports, ...rest] = ops[op].mock.calls[0];
    expect(rest).toEqual(args);
    expect(ports).toMatchObject({ docs: { db: session }, inbox: { db: session }, queue: { db: session } });
  });

  it("stops before the database when the admin check redirects", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).toEqual([]);
    expect(ops[op]).not.toHaveBeenCalled();
  });

  it("returns a fixed code and text for a refusal, and a plain save-failed for anything else", async () => {
    ops[op].mockRejectedValueOnce(new InboxError("budget-range"));
    expect(await call()).toEqual({ ok: false, code: "budget-range", message: "Choose a page limit from 1 to 40." });
    ops[op].mockRejectedValueOnce(new InvalidInputError());
    expect(await call()).toMatchObject({ ok: false, code: "invalid-input" });
    ops[op].mockRejectedValueOnce(new Error("relation \"documents\" row 'secret text' failed"));
    const result = await call();
    expect(result).toEqual({ ok: false, code: "save-failed", message: "Could not save. Try again." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
