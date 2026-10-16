// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import type { ReaderCounts, WaitingReader } from "@/modules/distribution";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { ReadersPanel } from "./readers-panel";

const actions = () => ({
  sendConfirmations: vi.fn(async () => {}),
  bin: vi.fn(async () => {}),
  erase: vi.fn(async () => {}),
  openSignup: vi.fn(async () => {}),
  closeSignup: vi.fn(async () => {}),
});
const waiter = (n: number): WaitingReader => ({ id: `00000000-0000-4000-8000-00000000000${n}`, email: `reader${n}@example.com`, requestedAt: `2026-10-1${n}T05:00:00+00:00` });
const show = (patch: { on?: boolean; counts?: Partial<ReaderCounts>; left?: number; leftToday?: number; signupOn?: boolean; contactSet?: boolean; waiting?: WaitingReader[] } = {}) => {
  const a = actions();
  const waiting = patch.waiting ?? [waiter(4), waiter(5)];
  const view = render(
    <ReadersPanel
      on={patch.on ?? true}
      counts={{ waiting: waiting.length, asked: 1, confirmed: 41, ...patch.counts }}
      left={patch.left ?? 50}
      leftToday={patch.leftToday ?? 0}
      signupOn={patch.signupOn ?? false}
      contactSet={patch.contactSet ?? true}
      waiting={waiting}
      actions={a}
    />,
  );
  return { ...view, a };
};

describe("the readers page (spec s8.5)", () => {
  it("shows counts, not people: confirmed readers as a number, those asked as a number, those waiting by address and date", () => {
    const { container } = show();
    expect(screen.getByText("41 readers")).toBeInTheDocument();
    expect(screen.getByText("Waiting: 2")).toBeInTheDocument();
    expect(screen.getByText("Asked to confirm: 1")).toBeInTheDocument();
    expect(screen.getByText("reader4@example.com")).toBeInTheDocument();
    expect(screen.getByText("Asked 14 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("Asked 15 Oct 2026")).toBeInTheDocument();
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("offers no export, download or list of confirmed addresses", () => {
    const { container } = show();
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a[download]")).toBeNull();
    expect(screen.queryByRole("button", { name: /export|download|csv|copy/i })).toBeNull();
    // Ids travel only in hidden fields, never as visible text.
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("singular: one reader", () => {
    show({ counts: { confirmed: 1 } });
    expect(screen.getByText("1 reader")).toBeInTheDocument();
  });

  it("nobody waiting: says so, and offers no confirmation button", () => {
    show({ waiting: [], counts: { waiting: 0 } });
    expect(screen.getByText("No one is waiting.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send confirmation emails/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Bin/ })).toBeNull();
  });
});

describe("Send confirmation emails (its own press, D89)", () => {
  it("names how many will go and how many are left today, and presses once", async () => {
    const { a } = show();
    expect(screen.getByText("50 of 50 left today.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send confirmation emails (2)" }));
    expect(a.sendConfirmations).toHaveBeenCalledTimes(1);
  });

  it("never promises more than today's allowance", () => {
    show({ left: 1 });
    expect(screen.getByRole("button", { name: "Send confirmation emails (1)" })).toBeInTheDocument();
  });

  it("with the day's allowance used up: says so and offers no button", () => {
    show({ left: 0 });
    expect(screen.getByText("50 confirmation emails sent today. The rest can go tomorrow.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send confirmation emails/ })).toBeNull();
  });

  it("with letters off: the off line replaces the button", () => {
    show({ on: false });
    expect(screen.getAllByText(LETTERS_OFF_LINE).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Send confirmation emails/ })).toBeNull();
  });
});

describe("Bin", () => {
  it("bins one address, named for a screen reader, with its id in a hidden field", async () => {
    const { a } = show();
    const row = screen.getByText("reader4@example.com").closest("li")!;
    const button = within(row).getByRole("button", { name: "Bin the request from reader4@example.com" });
    await userEvent.click(button);
    expect(a.bin).toHaveBeenCalledTimes(1);
    const data = (a.bin.mock.calls[0] as unknown as [FormData])[0];
    expect(data.getAll("id")).toEqual(["00000000-0000-4000-8000-000000000004"]);
    expect(data.get("all")).toBeNull();
  });

  it("bins all of them with one press, and says nothing is emailed", async () => {
    const { a } = show();
    expect(screen.getByText("Binning deletes the request. Nothing is emailed to the reader.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bin all 2" }));
    expect((a.bin.mock.calls[0] as unknown as [FormData])[0].get("all")).toBe("1");
  });
});

describe("the sign-up switch", () => {
  it("closed: says so and offers to open", async () => {
    const { a } = show({ signupOn: false });
    expect(screen.getByText("Sign-ups closed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open sign-ups" }));
    expect(a.openSignup).toHaveBeenCalledTimes(1);
    expect(a.closeSignup).not.toHaveBeenCalled();
  });

  it("open: says so and offers to close", async () => {
    const { a } = show({ signupOn: true });
    expect(screen.getByText("Sign-ups open")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open sign-ups" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close sign-ups" }));
    expect(a.closeSignup).toHaveBeenCalledTimes(1);
  });

  it("with letters off it cannot be opened, with the reason; an open one can still be closed", () => {
    const { unmount } = show({ on: false, signupOn: false });
    expect(screen.queryByRole("button", { name: "Open sign-ups" })).toBeNull();
    unmount();
    show({ on: false, signupOn: true });
    expect(screen.getByRole("button", { name: "Close sign-ups" })).toBeInTheDocument();
  });

  it("at the free limit it reads closed whatever the switch says, and says why", () => {
    show({ signupOn: true, counts: { confirmed: 950 } });
    expect(screen.getByText("The list has 950 readers, the free limit is 1,000. New sign-ups are closed.")).toBeInTheDocument();
    expect(screen.getByText("Sign-ups closed")).toBeInTheDocument();
  });

  it("just under the limit there is no limit note", () => {
    show({ signupOn: true, counts: { confirmed: 949 } });
    expect(screen.queryByText(/free limit/)).toBeNull();
    expect(screen.getByText("Sign-ups open")).toBeInTheDocument();
  });
});

describe("what the desk must see the same day (review findings 2, 8 and 11)", () => {
  it("shows how many stopped on the public page today, and nothing when none did", () => {
    const { unmount } = show({ leftToday: 3 });
    expect(screen.getByText("Stopped on this page today: 3")).toBeInTheDocument();
    unmount();
    show({ leftToday: 0 });
    expect(screen.queryByText(/Stopped on this page today/)).toBeNull();
  });

  it("says when the waiting list is full and new requests are dropped: at 300, not at 299", () => {
    const { unmount } = show({ counts: { waiting: 300 } });
    expect(screen.getByText("300 requests are waiting. New requests are not kept until you send confirmations or bin some.")).toBeInTheDocument();
    unmount();
    show({ counts: { waiting: 299 } });
    expect(screen.queryByText(/requests are waiting/)).toBeNull();
  });

  it("says when sign-ups are open but email is not set up", () => {
    show({ on: false, signupOn: true });
    expect(screen.getByText("Sign-ups are open, but email is not set up. Close them, or set email up.")).toBeInTheDocument();
  });

  it("says when sign-ups are open but the contact for complaints is not set", () => {
    const { unmount } = show({ signupOn: true, contactSet: false });
    expect(screen.getByText(/contact address for questions and complaints is not set/)).toBeInTheDocument();
    unmount();
    show({ signupOn: true, contactSet: true });
    expect(screen.queryByText(/contact address for questions and complaints is not set/)).toBeNull();
  });
});

describe("Erase an address", () => {
  it("is a labelled email field and one button, for a request that came by email", async () => {
    const { a } = show();
    const field = screen.getByLabelText("Email address to erase");
    expect(field).toHaveAttribute("type", "email");
    await userEvent.type(field, "gone@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(a.erase).toHaveBeenCalledTimes(1);
    expect((a.erase.mock.calls[0] as unknown as [FormData])[0].get("email")).toBe("gone@example.com");
  });
});
