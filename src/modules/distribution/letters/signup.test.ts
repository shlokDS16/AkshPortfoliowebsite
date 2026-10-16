import { describe, expect, it, vi } from "vitest";
import { askToSubscribe, confirmSubscription, leaveLetters } from "./signup";

const NOTICE = "letters-2026-10-v1";
const good = { email: "reader@example.com", adult: "on", ticket: "t", website: "" };
function deps(ticketOk = true) {
  const request = vi.fn(async () => undefined);
  return { request, ticketOk: vi.fn(() => ticketOk) };
}

describe("askToSubscribe: one answer for everything (no address enumeration)", () => {
  it("passes the address, the 18+ tick and the current notice version to the database door", async () => {
    const d = deps();
    expect(await askToSubscribe(d, good)).toEqual({ status: "asked" });
    expect(d.request).toHaveBeenCalledWith("reader@example.com", NOTICE, true);
  });

  it("gives the same answer and asks the database for nothing when the hidden field is filled", async () => {
    const d = deps();
    expect(await askToSubscribe(d, { ...good, website: "http://spam.example" })).toEqual({ status: "asked" });
    expect(d.request).not.toHaveBeenCalled();
  });

  it("gives the same answer and asks for nothing when the form was posted too fast, forged, or without a ticket", async () => {
    const d = deps(false);
    expect(await askToSubscribe(d, good)).toEqual({ status: "asked" });
    expect(await askToSubscribe(d, { ...good, ticket: undefined })).toEqual({ status: "asked" });
    expect(d.request).not.toHaveBeenCalled();
  });

  it("without the 18+ tick the database is told so (it then keeps nothing)", async () => {
    const d = deps();
    await askToSubscribe(d, { ...good, adult: undefined });
    expect(d.request).toHaveBeenCalledWith("reader@example.com", NOTICE, false);
  });

  it("does not send a value that is not text, or an address over the database's limit, and still answers the same", async () => {
    const d = deps();
    for (const email of [undefined, null, 5, {}, ["a@b.example"], "x".repeat(321)]) expect(await askToSubscribe(d, { ...good, email })).toEqual({ status: "asked" });
    expect(d.request).not.toHaveBeenCalled();
  });

  it("lets a database failure through (an outage is not an answer about an address)", async () => {
    const d = deps();
    d.request.mockRejectedValueOnce(new Error("down"));
    await expect(askToSubscribe(d, good)).rejects.toThrow("down");
  });
});

describe("confirmSubscription: a person's press, never a GET", () => {
  it("says done for a good token and expired for any other", async () => {
    const confirm = vi.fn(async (token: string) => token === "T".repeat(43));
    expect(await confirmSubscription({ confirm }, "T".repeat(43))).toEqual({ status: "confirmed" });
    expect(await confirmSubscription({ confirm }, "U".repeat(43))).toEqual({ status: "expired" });
  });

  it("does not ask the database about something that cannot be a token", async () => {
    const confirm = vi.fn(async () => true);
    for (const token of [undefined, null, 5, "", "x".repeat(129), {}]) expect(await confirmSubscription({ confirm }, token)).toEqual({ status: "expired" });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("leaveLetters: the same answer whether or not the address was there", () => {
  it("calls the database and says done", async () => {
    const leave = vi.fn(async () => undefined);
    expect(await leaveLetters({ leave }, " Reader@Example.com ")).toEqual({ status: "left" });
    expect(leave).toHaveBeenCalledWith(" Reader@Example.com ");
  });

  it("says done without a call for something that is not an address, and lets a failure through so the reader can try again", async () => {
    const leave = vi.fn(async () => undefined);
    for (const email of [undefined, 5, "x".repeat(321)]) expect(await leaveLetters({ leave }, email)).toEqual({ status: "left" });
    expect(leave).not.toHaveBeenCalled();
    leave.mockRejectedValueOnce(new Error("down"));
    await expect(leaveLetters({ leave }, "a@b.example")).rejects.toThrow("down");
  });
});
