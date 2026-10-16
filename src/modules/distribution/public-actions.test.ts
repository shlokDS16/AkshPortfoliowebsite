import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  answers: {} as Record<string, { data?: unknown; error?: { message: string; code?: string } }>,
  ticketOk: true,
}));
vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args });
      const a = state.answers[name] ?? {};
      return { data: a.data ?? null, error: a.error ?? null };
    },
  }),
}));
vi.mock("@/lib/letters-form", () => ({ checkFormTicket: () => state.ticketOk }));

import { askToSubscribeAction, confirmAction, leaveAction } from "./public-actions";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const idle = { status: "idle" } as const;
beforeEach(() => {
  state.calls.length = 0;
  state.answers = {};
  state.ticketOk = true;
});

describe("askToSubscribeAction (public: anon door only)", () => {
  it("calls letters_request with the address, the notice version and the 18+ tick, and answers 'asked'", async () => {
    expect(await askToSubscribeAction(idle, form({ email: "a@b.example", adult: "on", ticket: "t", website: "" }))).toEqual({ status: "asked" });
    expect(state.calls).toEqual([{ name: "letters_request", args: { p_email: "a@b.example", p_notice_version: "letters-2026-10-v1", p_adult: true } }]);
  });

  it("a filled trap field or a refused ticket is answered the same and calls nothing", async () => {
    expect(await askToSubscribeAction(idle, form({ email: "a@b.example", adult: "on", ticket: "t", website: "x" }))).toEqual({ status: "asked" });
    state.ticketOk = false;
    expect(await askToSubscribeAction(idle, form({ email: "a@b.example", adult: "on", ticket: "t", website: "" }))).toEqual({ status: "asked" });
    expect(state.calls).toEqual([]);
  });

  it("a database failure is thrown without the database's words", async () => {
    state.answers.letters_request = { error: { message: 'value "a@b.example"', code: "XX000" } };
    const error = await askToSubscribeAction(idle, form({ email: "a@b.example", adult: "on", ticket: "t", website: "" })).catch((e: unknown) => e as Error);
    expect((error as Error).message).not.toContain("a@b.example");
  });
});

describe("confirmAction", () => {
  it("is a yes only when the database says true", async () => {
    state.answers.letters_confirm = { data: true };
    expect(await confirmAction(idle, form({ token: "T".repeat(43) }))).toEqual({ status: "confirmed" });
    expect(state.calls[0]).toEqual({ name: "letters_confirm", args: { p_token: "T".repeat(43) } });
    state.answers.letters_confirm = { data: false };
    expect(await confirmAction(idle, form({ token: "T".repeat(43) }))).toEqual({ status: "expired" });
    expect(await confirmAction(idle, form({}))).toEqual({ status: "expired" });
  });
});

describe("leaveAction", () => {
  it("calls letters_leave and always answers 'left'", async () => {
    expect(await leaveAction(idle, form({ email: "a@b.example" }))).toEqual({ status: "left" });
    expect(state.calls).toEqual([{ name: "letters_leave", args: { p_email: "a@b.example" } }]);
  });

  it("a failure is thrown, so the reader sees that it did not work and can try again", async () => {
    state.answers.letters_leave = { error: { message: "paused", code: "08006" } };
    await expect(leaveAction(idle, form({ email: "a@b.example" }))).rejects.toThrow();
  });
});
