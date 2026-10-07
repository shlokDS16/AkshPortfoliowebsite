import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const ai = vi.hoisted(() => ({ on: false }));
const core = vi.hoisted(() => ({ setPageSelected: vi.fn(), readSelected: vi.fn() }));
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const ports = { docs: {}, inbox: {}, queue: {} };

vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/modules/ops/jobs", () => ({ aiReadingOn: () => ai.on }));
vi.mock("@/modules/ingestion", () => ({
  ...core,
  runInbox: async (op: (p: unknown) => Promise<void>) => {
    order.push("run");
    await op(ports);
    return { ok: true };
  },
}));

import { readSelectedAction, setPageSelectedAction } from "./page-actions";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";

beforeEach(() => {
  order.length = 0;
  ai.on = false;
  requireAdmin.mockClear();
  core.setPageSelected.mockReset().mockResolvedValue(undefined);
  core.readSelected.mockReset().mockResolvedValue(undefined);
});

describe("the AI-dependent inbox actions", () => {
  it("setPageSelectedAction checks the admin first and passes whether AI reading is on", async () => {
    expect(await setPageSelectedAction(DOC, 7, true)).toEqual({ ok: true });
    expect(order).toEqual(["requireAdmin", "run"]);
    expect(core.setPageSelected).toHaveBeenLastCalledWith(ports, DOC, 7, true, false);
    ai.on = true;
    await setPageSelectedAction(DOC, 7, false);
    expect(core.setPageSelected).toHaveBeenLastCalledWith(ports, DOC, 7, false, true);
  });

  it("readSelectedAction checks the admin first and passes whether AI reading is on", async () => {
    await readSelectedAction(DOC);
    expect(order).toEqual(["requireAdmin", "run"]);
    expect(core.readSelected).toHaveBeenLastCalledWith(ports, DOC, false);
    ai.on = true;
    await readSelectedAction(DOC);
    expect(core.readSelected).toHaveBeenLastCalledWith(ports, DOC, true);
  });

  it("neither runs when the admin check redirects", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));
    await expect(setPageSelectedAction(DOC, 1, true)).rejects.toThrow("NEXT_REDIRECT");
    await expect(readSelectedAction(DOC)).rejects.toThrow("NEXT_REDIRECT");
    expect(order).toEqual([]);
    requireAdmin.mockResolvedValue({ userId: "u-1", email: "aksh@example.com" });
  });
});
