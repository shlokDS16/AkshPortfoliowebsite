import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPumpHandler } from "./handler";

const SITE = "https://desk.example.com";
const admin = { userId: "u-1", email: "aksh@example.com" };
const getAdmin = vi.fn();
const drain = vi.fn();
const post = (headers: Record<string, string> = { origin: SITE }, url = `${SITE}/desk/inbox/pump`) =>
  createPumpHandler({ getAdmin, drain, siteUrl: () => `${SITE}/` })(new Request(url, { method: "POST", headers }));

beforeEach(() => {
  getAdmin.mockReset().mockResolvedValue(admin);
  drain.mockReset().mockResolvedValue({ ran: 2 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the inbox tab's pump route", () => {
  it("drains for the signed-in admin from this site and says whether it ran anything", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ more: true });
    drain.mockResolvedValue({ ran: 0 });
    expect(await (await post()).json()).toEqual({ more: false });
  });

  it("answers 401 without an admin session and drains nothing", async () => {
    getAdmin.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not-signed-in" });
    expect(drain).not.toHaveBeenCalled();
  });

  it("answers 403 to a cross-site request, or one with no Origin, before it looks at the session", async () => {
    const cases: Record<string, string>[] = [{ origin: "https://evil.example" }, {}, { origin: "null" }];
    for (const headers of cases) {
      expect((await post(headers)).status).toBe(403);
    }
    expect(getAdmin).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it("accepts the origin the request itself arrived on (a preview URL), never another", async () => {
    const preview = "https://desk-git-x.vercel.app";
    expect((await post({ origin: preview }, `${preview}/desk/inbox/pump`)).status).toBe(200);
    expect((await post({ origin: preview }, `${SITE}/desk/inbox/pump`)).status).toBe(403);
  });

  it("a failed drain is a 500 with more false and no database text", async () => {
    drain.mockRejectedValue(new Error('relation "documents" row secret'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ more: false });
  });
});
