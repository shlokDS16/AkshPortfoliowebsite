import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxError } from "../errors";

const order: string[] = [];
const ops = vi.hoisted(() => ({ previewReread: vi.fn(), rereadPage: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
const ai = vi.hoisted(() => ({ on: true }));
const usage = vi.hoisted(() => ({ median: 0 as number | null, fail: false }));
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const session = { cookieSession: true };

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => ({ GROQ_MODEL_TEXT: "text-model" }) }));
vi.mock("@/lib/providers", () => ({ createLlmPort: () => (ai.on ? { name: "fixture" } : null) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return session;
  },
}));
vi.mock("@/modules/documents", async (importOriginal) => ({ ...(await importOriginal<object>()), createSupabaseDocumentsRepo: (db: unknown) => ({ db }) }));
vi.mock("../inbox-repo", () => ({ createSupabaseInboxRepo: (db: unknown) => ({ db }) }));
vi.mock("../queue-repo", () => ({ createQueueRepo: (db: unknown) => ({ db }) }));
vi.mock("../usage-repo", () => ({
  createUsageRepo: () => ({
    totals: async (bucket: string) => {
      order.push(`totals:${bucket}`);
      if (usage.fail) throw new Error("boom");
      return { lastMinute: 0, today: 0, medianPerCall: usage.median };
    },
  }),
}));
vi.mock("../reread", () => ({ previewReread: ops.previewReread, rereadPage: ops.rereadPage }));

import { rereadPageAction } from "./reread";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COST = { tokens: 3400, dayCap: 150000, text: "This uses about 3,400 of today's 150,000 AI tokens." };

beforeEach(() => {
  order.length = 0;
  ai.on = true;
  usage.median = 5_100;
  usage.fail = false;
  requireAdmin.mockClear();
  revalidatePath.mockClear();
  ops.previewReread.mockReset().mockResolvedValue(COST);
  ops.rereadPage.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("rereadPageAction", () => {
  it("checks the admin before it touches the database", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(rereadPageAction(DOC, 4, true)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).toEqual([]);
    expect(ops.rereadPage).not.toHaveBeenCalled();
  });

  it("without confirmation only shows the cost, with the measured median and whether AI is on, and spends nothing", async () => {
    expect(await rereadPageAction(DOC, 4, false)).toEqual({ ok: true, cost: COST });
    expect(order).toEqual(["requireAdmin", "client", "totals:text-model"]);
    expect(ops.previewReread).toHaveBeenCalledWith(expect.objectContaining({ docs: { db: session } }), DOC, 4, true, 5_100);
    expect(ops.rereadPage).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats anything but the literal true as unconfirmed (a crafted call cannot skip the price)", async () => {
    await rereadPageAction(DOC, 4, "yes" as never);
    await rereadPageAction(DOC, 4, 1 as never);
    expect(ops.rereadPage).not.toHaveBeenCalled();
  });

  it("with confirmation queues the re-read on Aksh's own session, tells the AI switch, and refreshes the inbox and the review", async () => {
    expect(await rereadPageAction(DOC, 4, true)).toEqual({ ok: true, queued: true });
    expect(ops.rereadPage).toHaveBeenCalledWith(expect.objectContaining({ docs: { db: session }, inbox: { db: session }, queue: { db: session } }), DOC, 4, true);
    expect(revalidatePath).toHaveBeenCalledWith("/desk/inbox");
    expect(revalidatePath).toHaveBeenCalledWith(`/desk/inbox/${DOC}/review`);
    ai.on = false;
    await rereadPageAction(DOC, 4, true);
    expect(ops.rereadPage).toHaveBeenLastCalledWith(expect.anything(), DOC, 4, false);
  });

  it("still shows a price when the usage ledger cannot be read", async () => {
    usage.fail = true;
    await rereadPageAction(DOC, 4, false);
    expect(ops.previewReread).toHaveBeenCalledWith(expect.anything(), DOC, 4, true, null);
  });

  it("returns a fixed code and text for a refusal, and refreshes nothing", async () => {
    ops.rereadPage.mockRejectedValueOnce(new InboxError("reread-closed"));
    expect(await rereadPageAction(DOC, 4, true)).toMatchObject({ ok: false, code: "reread-closed" });
    ops.previewReread.mockRejectedValueOnce(new Error("storage 'secret text' failed"));
    const result = await rereadPageAction(DOC, 4, false);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("secret text");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
