import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const flow = vi.hoisted(() => ({ runStartLink: vi.fn(), runStartText: vi.fn() }));
const env = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const session = { cookieSession: true };
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env.current }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return session;
  },
}));
vi.mock("@/modules/documents", async (importOriginal) => ({ ...(await importOriginal<object>()), createSupabaseDocumentsRepo: (db: unknown) => ({ db }) }));
vi.mock("../queue-repo", () => ({ createQueueRepo: (db: unknown) => ({ db }) }));
vi.mock("../link-flow", () => flow);

import { startLinkAction, startTextAction } from "./link";

const COMPANY = "9f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
const LINK = { url: "https://bse.test/RUN1.pdf", companyId: COMPANY, filedOn: "2026-10-01" };
const TEXT = { text: "Quarterly results table\nRevenue 1,284.00 1,102.00 and some more words here", title: null, companyId: null, filedOn: null, sourceUrl: null };

beforeEach(() => {
  order.length = 0;
  env.current = {};
  requireAdmin.mockClear();
  revalidatePath.mockClear();
  flow.runStartLink.mockReset().mockResolvedValue({ ok: true, documentId: "d-1" });
  flow.runStartText.mockReset().mockResolvedValue({ ok: true, documentId: "d-2" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["startLinkAction", (input?: object) => startLinkAction({ ...LINK, ...input }), flow.runStartLink],
  ["startTextAction", (input?: object) => startTextAction({ ...TEXT, ...input }), flow.runStartText],
] as const)("%s", (_name, call, run) => {
  it("checks the admin before it touches the database, then runs the flow on his own session and refreshes the inbox", async () => {
    expect(await call()).toMatchObject({ ok: true });
    expect(order).toEqual(["requireAdmin", "client"]);
    const [deps] = run.mock.calls[0];
    expect(deps).toMatchObject({ docs: { db: session }, queue: { db: session } });
    expect(typeof deps.newId()).toBe("string");
    expect(revalidatePath).toHaveBeenCalledWith("/desk/inbox");
  });

  it("stops before anything when the admin check redirects", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a key the schema does not know (a client cannot name a path, a kind or a fetched_from)", async () => {
    for (const extra of [{ storagePath: "x.txt" }, { kind: "pdf" }, { fetchedFrom: "https://example.com" }]) {
      expect(await call(extra)).toMatchObject({ ok: false, code: "invalid-input" });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a company that is not an id and a date that is not a date", async () => {
    expect(await call({ companyId: "not-a-guid" })).toMatchObject({ ok: false, code: "invalid-input" });
    expect(await call({ filedOn: "yesterday" })).toMatchObject({ ok: false, code: "invalid-input" });
    expect(run).not.toHaveBeenCalled();
  });

  it("does not refresh the inbox when nothing was added, and passes the refusal through", async () => {
    run.mockResolvedValueOnce({ ok: false, code: "link-blocked", message: "x" });
    expect(await call()).toEqual({ ok: false, code: "link-blocked", message: "x" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("startLinkAction", () => {
  it("hands the flow a fetch that uses the fixture sites only when the server asks for the fixture (and the guard still runs)", async () => {
    env.current = { LLM_ADAPTER: "fixture" };
    await startLinkAction(LINK);
    const { fetchLink } = flow.runStartLink.mock.calls[0][0];
    expect((await fetchLink("https://bse.test/RUN1.pdf")).contentType).toBe("application/pdf");
    await expect(fetchLink("https://internal.test/x")).rejects.toMatchObject({ code: "link-blocked" });
  });

  it("passes the link and fields on as the schema parsed them", async () => {
    await startLinkAction({ ...LINK, url: "  https://bse.test/RUN1.pdf  " });
    expect(flow.runStartLink.mock.calls[0][1]).toEqual(LINK);
  });
});

describe("startTextAction", () => {
  it("takes only an http(s) public link as the source", async () => {
    expect(await startTextAction({ ...TEXT, sourceUrl: "javascript:alert(1)" })).toMatchObject({ ok: false, code: "invalid-input" });
    expect(await startTextAction({ ...TEXT, sourceUrl: "https://www.bseindia.com/a" })).toMatchObject({ ok: true });
  });
});
