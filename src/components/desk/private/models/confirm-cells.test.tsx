// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmData, ConfirmRow } from "@/modules/valuation/client";
import { confirmValuationAction } from "@/modules/valuation/actions";
import { ConfirmCells } from "./confirm-cells";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/valuation/actions", () => ({ confirmValuationAction: vi.fn(async () => ({ ok: true })), modelUrlAction: vi.fn() }));

// Spec s7.2: nothing is trusted before the one click; nothing is pre-ticked but an unchanged carry-forward; a result that depends on a
// disagreement is greyed with its reason; his label is only what he typed (an untouched field is sent as null, D11).
const VERSION = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const row = (addr: string, sheetLabel: string | null, over: Partial<ConfirmRow> = {}): ConfirmRow => ({
  sheet: "DCF", addr, value: 0.115, z: "0.0%", sheetLabel, carried: false, blocked: null, ...over,
});
const data = (over: Partial<ConfirmData> = {}): ConfirmData => ({
  inputs: [row("B1", "Cost of equity"), row("B2", "Terminal growth", { value: 0.04 })],
  outputs: [row("B13", "Per-share result", { value: 61.5, z: "#,##0.00" }), row("B9", "Reads the stale cell", { value: 1, z: null, blocked: { cls: "depends", fn: null } })],
  carriedFrom: null,
  ...over,
});

beforeEach(() => vi.mocked(confirmValuationAction).mockClear());

describe("ConfirmCells", () => {
  it("ticks nothing, and the button names the counts and waits for at least one of each", () => {
    render(<ConfirmCells versionId={VERSION} data={data()} />);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Use 0 inputs and 0 results" })).toBeDisabled();
    expect(screen.getByText("sheet says: Cost of equity")).toBeInTheDocument();
    expect(screen.getByText("11.5%")).toBeInTheDocument();
  });

  it("greys a result that depends on a disagreement, with the reason, and it cannot be ticked", () => {
    render(<ConfirmCells versionId={VERSION} data={data()} />);
    const box = screen.getByRole("checkbox", { name: /^DCF!B9\b/ });
    expect(box).toBeDisabled();
    expect(screen.getByText(/Cannot be chosen: depends on a cell that gives a different answer from Excel/)).toBeInTheDocument();
  });

  it("pre-ticks a carried cell with its chip", () => {
    render(<ConfirmCells versionId={VERSION} data={data({ carriedFrom: 3, inputs: [row("B1", "Cost of equity", { carried: true }), row("B2", "Terminal growth")] })} />);
    expect(screen.getByRole("checkbox", { name: /^DCF!B1\b/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^DCF!B2\b/ })).not.toBeChecked();
    expect(screen.getByText("used in version 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use 1 input and 0 results" })).toBeDisabled();
  });

  it("confirms exactly what was ticked; an untouched label is null, a typed one is his words", async () => {
    render(<ConfirmCells versionId={VERSION} data={data()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B1\b/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B2\b/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B13\b/ }));
    const label = screen.getByRole("textbox", { name: "Your label for DCF!B1 (optional)" });
    expect(label).toHaveValue("");
    expect(label).toHaveAttribute("placeholder", "Cost of equity");
    fireEvent.change(label, { target: { value: "  My cost of capital " } });
    fireEvent.click(screen.getByRole("button", { name: "Use 2 inputs and 1 result" }));
    await waitFor(() => expect(confirmValuationAction).toHaveBeenCalledTimes(1));
    expect(confirmValuationAction).toHaveBeenCalledWith({
      versionId: VERSION,
      cells: [
        { sheet: "DCF", addr: "B1", role: "input", label: "My cost of capital" },
        { sheet: "DCF", addr: "B2", role: "input", label: null },
        { sheet: "DCF", addr: "B13", role: "output", label: null },
      ],
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the action's refusal and names the cell", async () => {
    vi.mocked(confirmValuationAction).mockResolvedValueOnce({ ok: false, code: "output_tainted", message: "A chosen result depends on a cell the desk cannot reproduce exactly.", cell: "DCF!B13" });
    render(<ConfirmCells versionId={VERSION} data={data()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B1\b/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^DCF!B13\b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use 1 input and 1 result" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/DCF!B13/)).toBeInTheDocument();
  });
});
