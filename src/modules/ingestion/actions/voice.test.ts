import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidInputError } from "@/lib/errors";

const order: string[] = [];
const ops = vi.hoisted(() => ({ finishTranscript: vi.fn() }));
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
vi.mock("../voice-ops", () => ops);

import { discardTranscriptAction, markTranscriptSavedAction } from "./voice";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const CASES = [
  ["markTranscriptSavedAction", () => markTranscriptSavedAction(DOC), "saved"],
  ["discardTranscriptAction", () => discardTranscriptAction(DOC), "discarded"],
] as const;

beforeEach(() => {
  order.length = 0;
  requireAdmin.mockClear();
  ops.finishTranscript.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(CASES)("%s", (_name, call, decision) => {
  it("checks the admin before it touches the database, and runs on the admin's own session with that decision", async () => {
    expect(await call()).toEqual({ ok: true });
    expect(order).toEqual(["requireAdmin", "client"]);
    const [ports, documentId, said] = ops.finishTranscript.mock.calls[0];
    expect([documentId, said]).toEqual([DOC, decision]);
    expect(ports).toMatchObject({ docs: { db: session }, inbox: { db: session }, queue: { db: session } });
  });

  it("stops before the database when the admin check redirects", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).toEqual([]);
    expect(ops.finishTranscript).not.toHaveBeenCalled();
  });

  it("returns a fixed code and text for a refusal, and a plain save-failed for anything else", async () => {
    ops.finishTranscript.mockRejectedValueOnce(new InvalidInputError());
    expect(await call()).toMatchObject({ ok: false, code: "invalid-input" });
    ops.finishTranscript.mockRejectedValueOnce(new Error("row 'my private words' failed"));
    const result = await call();
    expect(result).toEqual({ ok: false, code: "save-failed", message: "Could not save. Try again." });
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
