// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUEUE_KEY } from "@/modules/capture/client";
import { expectTokenOnly, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { CaptureDock } from "./capture-dock";
import { CaptureField } from "./capture-field";
import { CaptureReceipt } from "./capture-receipt";
import { deskQueue, resetDeskQueueForTests } from "./desk-queue";
import { GrammarKeyRow } from "./grammar-key-row";

const submitCapture = vi.fn();
const refresh = vi.fn();
vi.mock("@/modules/capture/actions", () => ({ submitCapture: (input: unknown) => submitCapture(input) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/desk/items" }));

const none = new Set<string>();
const known = { symbols: new Set(["KAVPUMP"]), themes: new Set<string>(), ignoredSymbols: none, ignoredThemes: none };
const lists = (symbols: string[]) => ({ symbols, themes: [], ignoredSymbols: [], ignoredThemes: [] });

afterEach(() => {
  resetDeskQueueForTests();
  window.localStorage.clear();
  submitCapture.mockReset();
  refresh.mockReset();
});

describe("CaptureField", () => {
  it("colours tokens in a mirror under a transparent textarea; Enter saves, Shift+Enter adds a line", async () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <CaptureField id="f" value="t: $KAVPUMP #capex https://x.in" onChange={onChange} onSubmit={onSubmit} known={known} placeholder="What did you just notice?" />,
    );
    const mirror = container.querySelector("[aria-hidden='true']")!;
    expect(mirror.querySelector(".bg-ink")).toHaveTextContent("t:");
    expect([...mirror.querySelectorAll(".text-geru")].map((s) => s.textContent)).toEqual(["$KAVPUMP", "https://x.in"]);
    expect(mirror.querySelector(".decoration-dashed")).toHaveTextContent("#capex");
    const box = screen.getByRole("textbox", { name: "Capture" });
    expect(box).toHaveClass("text-transparent", "caret-ink");
    await userEvent.type(box, "{Shift>}{Enter}{/Shift}");
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(box, "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expectTokenOnly(container);
  });
});

describe("CaptureReceipt and GrammarKeyRow", () => {
  it("speaks the receipt politely and never says publish", () => {
    render(<CaptureReceipt model={{ empty: false, chips: [{ kind: "company-new", label: "$NEWCO → New names" }], warning: null }} />);
    const receipt = screen.getByText("Will go to").parentElement!;
    expect(receipt).toHaveAttribute("aria-live", "polite");
    expect(receipt).toHaveTextContent("$NEWCO → New names");
    expect(receipt.textContent).not.toMatch(/publish/i);
  });

  it("offers the five grammar keys at thumb height without stealing focus", async () => {
    const onInsert = vi.fn();
    render(<GrammarKeyRow onInsert={onInsert} />);
    const keys = screen.getAllByRole("button");
    expect(keys.map((k) => k.textContent)).toEqual(["$", "#", "t:", "l:", "p:"]);
    await userEvent.click(keys[2]);
    expect(onInsert).toHaveBeenCalledWith("t:");
    expect(keys[0]).toHaveClass("min-h-11");
  });
});

describe("CaptureDock", () => {
  it("c opens the sheet; saving files the capture, clears the field and toasts the time", async () => {
    mockMatchMedia({ desk: true });
    submitCapture.mockResolvedValue({ ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null });
    renderWithMotion(<CaptureDock known={lists(["KAVPUMP"])} />);
    await userEvent.keyboard("c");
    const dialog = await screen.findByRole("dialog", { name: "Capture" });
    const box = screen.getByRole("textbox", { name: "Capture" });
    await userEvent.type(box, "$KAVPUMP dealers wait");
    expect(dialog).toHaveTextContent("$KAVPUMP");
    await userEvent.type(box, "{Enter}");
    await waitFor(() => expect(box).toHaveValue(""));
    expect(submitCapture).toHaveBeenCalledWith(expect.objectContaining({ rawText: "$KAVPUMP dealers wait", source: "web" }));
    expect(await screen.findByText(/^Saved \d{2}:\d{2} · \$KAVPUMP$/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("a permanent server rejection empties the field and keeps the text under Needs attention", async () => {
    mockMatchMedia({ desk: true });
    submitCapture.mockResolvedValue({ ok: false, retry: false, code: "too-long", message: "x" });
    renderWithMotion(<CaptureDock known={lists([])} />);
    await userEvent.click(screen.getByRole("button", { name: /Capture/ }));
    const box = await screen.findByRole("textbox", { name: "Capture" });
    await userEvent.type(box, "keep me{Enter}");
    const attention = await screen.findByRole("region", { name: "Needs attention" });
    expect(attention).toHaveTextContent("keep me");
    expect(attention).toHaveTextContent("too long to capture");
    expect(box).toHaveValue("");
  });

  it("offline: the note stays on this phone, the toast and status say it will sync, and the sheet stays", async () => {
    mockMatchMedia({ coarse: true });
    submitCapture.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithMotion(<CaptureDock known={lists([])} />, { reducedMotion: true });
    await userEvent.click(screen.getByRole("button", { name: /Capture/ }));
    const box = await screen.findByRole("textbox", { name: "Capture" });
    await userEvent.type(box, "on the train{Enter}");
    expect(await screen.findByText("Saved on this phone. It will sync.")).toBeInTheDocument();
    expect(await screen.findByText("Saved on this device, will sync (1 waiting).")).toBeInTheDocument();
    expect(Object.keys(window.localStorage).some((k) => k.startsWith(`${QUEUE_KEY}:`))).toBe(true);
    expect(screen.getByRole("dialog", { name: "Capture" })).toBeInTheDocument();
  });

  it("on a phone the sheet closes once the note reached the server", async () => {
    mockMatchMedia({ coarse: true });
    submitCapture.mockResolvedValue({ ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null });
    renderWithMotion(<CaptureDock known={lists([])} />, { reducedMotion: true });
    await userEvent.click(screen.getByRole("button", { name: /Capture/ }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Capture" }), "quick one{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/^Saved \d{2}:\d{2} · private note$/)).toBeInTheDocument();
  });

  it("the key row inserts into the sheet's field and keeps focus there", async () => {
    mockMatchMedia({ desk: true });
    renderWithMotion(<CaptureDock known={lists([])} />);
    await userEvent.keyboard("c");
    const dialog = await screen.findByRole("dialog", { name: "Capture" });
    const box = within(dialog).getByRole("textbox", { name: "Capture" });
    await userEvent.type(box, "margins thin");
    await userEvent.click(within(dialog).getByRole("button", { name: "t:" }));
    expect(box).toHaveValue("t: margins thin");
    await waitFor(() => expect(box).toHaveFocus());
    expect(within(dialog).getByText("A thesis belongs to one company. Add $SYMBOL, or this saves as a private draft without one.")).toBeInTheDocument();
  });

  it("on load a note left on the device is sent, and the page refreshes", async () => {
    mockMatchMedia({ desk: true });
    deskQueue().queue.enqueue({ clientId: "left", rawText: "left earlier", source: "mobile", queuedAt: "2026-10-06T03:00:00Z" });
    submitCapture.mockResolvedValue({ ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null });
    renderWithMotion(<CaptureDock known={lists([])} />);
    await waitFor(() => expect(submitCapture).toHaveBeenCalledWith(expect.objectContaining({ clientId: "left" })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
