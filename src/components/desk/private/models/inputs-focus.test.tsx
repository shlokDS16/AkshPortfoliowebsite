// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmData, ConfirmRow } from "@/modules/valuation/client";
import { confirmValuationAction } from "@/modules/valuation/actions";
import { ConfirmCells } from "./confirm-cells";
import { disarmInputsFocus } from "./focus-handoff";
import { InputsPanel } from "./inputs-panel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/valuation/actions", () => ({ confirmValuationAction: vi.fn(async () => ({ ok: true })), modelUrlAction: vi.fn() }));

// Final review M12: after he confirms a model's cells, the page swaps to the scenarios view. The confirm view is gone by then, so the focus
// goes to the Inputs heading (tabIndex -1) of the view that replaces it, for keyboard and screen-reader users.
const VERSION = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const row = (addr: string, sheetLabel: string): ConfirmRow => ({ sheet: "DCF", addr, value: 0.115, z: "0.0%", sheetLabel, carried: false, blocked: null });
const data: ConfirmData = { inputs: [row("B1", "Cost of equity")], outputs: [row("B13", "Per-share result")], carriedFrom: null };
const panel = () => <InputsPanel inputs={[]} values={{}} disabled onChange={() => {}} onReset={() => {}} onValidity={() => {}} />;

/** Confirms, and then removes the confirm view, as the page refresh does. */
async function confirmCells() {
  const view = render(<ConfirmCells versionId={VERSION} data={data} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B1\b/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B13\b/ }));
  fireEvent.click(screen.getByRole("button", { name: "Use 1 input and 1 result" }));
  await waitFor(() => expect(confirmValuationAction).toHaveBeenCalledTimes(1));
  return view;
}
const gone = (view: Awaited<ReturnType<typeof confirmCells>>) => view.unmount();

beforeEach(() => {
  disarmInputsFocus();
  refresh.mockClear();
  vi.mocked(confirmValuationAction).mockClear();
});
afterEach(() => vi.useRealTimers());

describe("focus after confirming the cells", () => {
  it("the Inputs heading takes focus in the view that replaces the confirm view, and can hold it without being a tab stop", async () => {
    gone(await confirmCells());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const { unmount } = render(panel());
    const heading = screen.getByRole("heading", { name: "Inputs" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveFocus();
    // The shell is swapped for the loaded calculator: the new heading takes the focus again.
    unmount();
    render(panel());
    expect(screen.getByRole("heading", { name: "Inputs" })).toHaveFocus();
  });

  it("does not take focus from something he has already moved to", async () => {
    gone(await confirmCells());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    render(panel());
    expect(other).toHaveFocus();
    other.remove();
  });

  it("a plain visit to the scenarios view leaves the focus alone", () => {
    render(panel());
    expect(screen.getByRole("heading", { name: "Inputs" })).not.toHaveFocus();
  });

  it("a refused confirm does not arm it", async () => {
    vi.mocked(confirmValuationAction).mockResolvedValueOnce({ ok: false, code: "bad_request", message: "The desk could not use that request." });
    const view = await confirmCells();
    await screen.findByRole("alert");
    gone(view);
    render(panel());
    expect(screen.getByRole("heading", { name: "Inputs" })).not.toHaveFocus();
  });

  it("the hand-off lapses after ten seconds, so a later visit is not hijacked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    gone(await confirmCells());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    vi.setSystemTime(Date.now() + 11_000);
    render(panel());
    expect(screen.getByRole("heading", { name: "Inputs" })).not.toHaveFocus();
  });
});
