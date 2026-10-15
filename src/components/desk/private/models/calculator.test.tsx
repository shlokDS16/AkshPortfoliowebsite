// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioCell, ScenarioRow } from "@/modules/valuation/client";
import { modelUrlAction, saveValuationScenarioAction } from "@/modules/valuation/actions";
import Calculator from "./calculator";
import { CALCULATOR_FAILED } from "./copy";
import type { Connect, Engine, EngineInput } from "./engine-protocol";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/valuation/actions", () => ({
  modelUrlAction: vi.fn(async () => ({ ok: true, url: "https://storage.test/m.json", expiresInSeconds: 600 })),
  saveValuationScenarioAction: vi.fn(async () => ({ ok: true, id: "s-new" })),
  deleteValuationScenarioAction: vi.fn(async () => ({ ok: true })),
}));

// Spec s7.3 with a fake engine: the result is 1,000 x the cost of equity plus the growth, so a change is easy to read.
const COST = "11111111-0000-4000-8000-000000000001";
const GROWTH = "11111111-0000-4000-8000-000000000002";
const RESULT = "11111111-0000-4000-8000-000000000003";
const cells: ScenarioCell[] = [
  { id: COST, sheet: "Assumptions", addr: "B1", role: "input", label: "Cost of equity", own: false, value: 0.115, z: "0.0%" },
  { id: GROWTH, sheet: "Assumptions", addr: "B2", role: "input", label: "My growth", own: true, value: 0.04, z: "0.0%" },
  { id: RESULT, sheet: "DCF", addr: "B13", role: "output", label: "Per-share result", own: false, value: 115.04, z: "#,##0.00" },
];
const bear: ScenarioRow = { id: "s-bear", versionId: "v", name: "Bear", note: "Higher cost of capital", createdAt: "2026-10-15T09:00:00Z", values: [{ cellId: COST, value: 0.14 }, { cellId: GROWTH, value: 0.03 }] };

const compute = (inputs: EngineInput[]) => {
  const v = (addr: string) => inputs.find((i) => i.addr === addr)?.value ?? 0;
  return { kind: "number" as const, value: 1000 * v("B1") + v("B2") };
};
function fakeEngine() {
  const engine: Engine & { evaluate: ReturnType<typeof vi.fn>; grid: ReturnType<typeof vi.fn> } = {
    evaluate: vi.fn(async (inputs: EngineInput[]) => [compute(inputs)]),
    grid: vi.fn(async (base: EngineInput[], a, b, points: { a: number; b: number }[]) =>
      points.map((p) => compute(base.map((i) => (i.addr === a.addr ? { ...i, value: p.a } : i.addr === b.addr ? { ...i, value: p.b } : i)))),
    ),
    dispose: vi.fn(),
  };
  const connect: Connect = vi.fn(async () => engine);
  return { engine, connect };
}

const outputRow = () => screen.getByRole("row", { name: /Per-share result/ });
const costField = () => screen.getByRole("textbox", { name: /Cost of equity/ });

beforeEach(() => {
  vi.mocked(saveValuationScenarioAction).mockClear();
  vi.mocked(modelUrlAction).mockClear();
});

describe("Calculator", () => {
  it("shows the three result headings exactly, and the workbook values once the engine is ready", async () => {
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    for (const name of ["Workbook value", "Scenario output", "Change"]) expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    await waitFor(() => expect(within(outputRow()).getAllByText("115.04")).toHaveLength(2));
    expect(connect).toHaveBeenCalledWith("https://storage.test/m.json", [{ sheet: "DCF", addr: "B13" }], { signal: expect.any(AbortSignal) });
  });

  it("edits a percent cell in percent: 12.5 means 12.5%, and the output and the change follow", async () => {
    const { engine, connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    expect(costField()).toHaveValue("11.5");
    fireEvent.change(costField(), { target: { value: "12.5" } });
    await waitFor(() => expect(within(outputRow()).getByText("125.04")).toBeInTheDocument());
    expect(engine.evaluate).toHaveBeenLastCalledWith([
      { sheet: "Assumptions", addr: "B1", value: 0.125 },
      { sheet: "Assumptions", addr: "B2", value: 0.04 },
    ]);
    expect(within(outputRow()).getByText("+10.00")).toBeInTheDocument();
  });

  it("resets a row to the workbook value", async () => {
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    fireEvent.change(costField(), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Cost of equity to the workbook value" }));
    expect(costField()).toHaveValue("11.5");
  });

  it("Workbook values cannot be changed or deleted: an edit becomes unsaved changes, and picking it again brings the workbook back", async () => {
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[bear]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    const picker = screen.getByRole("combobox", { name: "Scenario" });
    expect(picker).toHaveValue("workbook");
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    fireEvent.change(costField(), { target: { value: "13" } });
    expect(picker).toHaveValue("draft");
    fireEvent.change(picker, { target: { value: "workbook" } });
    expect(costField()).toHaveValue("11.5");
    fireEvent.change(picker, { target: { value: "s-bear" } });
    expect(costField()).toHaveValue("14");
    expect(screen.getByText("Higher cost of capital")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Bear" })).toBeInTheDocument();
  });

  it("marks the sheet's label as the sheet's and shows his own as he typed it", () => {
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    const panel = within(screen.getByRole("region", { name: "Inputs" }));
    expect(panel.getByText("My growth")).toBeInTheDocument();
    expect(panel.getAllByText("sheet")).toHaveLength(1);
  });

  it("saves the input values under his name, keyed by his cells", async () => {
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    fireEvent.change(costField(), { target: { value: "14" } });
    fireEvent.click(screen.getByText("Save as scenario"));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bear" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveValuationScenarioAction).toHaveBeenCalledWith({ versionId: "v", name: "Bear", note: "", values: { [COST]: 0.14, [GROWTH]: 0.04 } }));
  });

  it("Save is off while an input shows text that is not a number, and on again once it is fixed", async () => {
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    fireEvent.click(screen.getByText("Save as scenario"));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bear" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.change(costField(), { target: { value: "12.5x" } });
    expect(save).toBeDisabled();
    expect(screen.getByText("Fix the inputs marked above first.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Scenario" })).toBeEnabled();
    fireEvent.change(costField(), { target: { value: "12.5" } });
    expect(save).toBeEnabled();
    expect(screen.queryByText("Fix the inputs marked above first.")).toBeNull();
  });

  it("the sensitivity grid's centre is this scenario", async () => {
    const { engine, connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Fill the grid" }));
    const grid = await screen.findByRole("table", { name: /Per-share result/ });
    expect(engine.grid).toHaveBeenCalledTimes(1);
    const centre = within(grid).getByText("this scenario").closest("td");
    expect(centre).toHaveTextContent("115.04this scenario");
    expect(within(grid).getAllByRole("row")).toHaveLength(6);
  });

  it("a refresh that brings the same cells again does not load the engine a second time", async () => {
    const { connect } = fakeEngine();
    const { rerender } = render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    await waitFor(() => expect(costField()).toBeEnabled());
    rerender(<Calculator versionId="v" cells={cells.map((c) => ({ ...c }))} scenarios={[bear]} connect={connect} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Bear" })).toBeInTheDocument());
    expect(costField()).toBeEnabled();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(modelUrlAction).toHaveBeenCalledTimes(1);
  });

  it("a failed load shows the spec s8 sentence", async () => {
    const connect: Connect = vi.fn(async () => {
      throw new Error("wasm");
    });
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    expect(await screen.findByText(CALCULATOR_FAILED)).toBeInTheDocument();
  });

  it("a link that could not be signed shows the same sentence", async () => {
    vi.mocked(modelUrlAction).mockResolvedValueOnce({ ok: false, code: "not_ready", message: "x" });
    const { connect } = fakeEngine();
    render(<Calculator versionId="v" cells={cells} scenarios={[]} connect={connect} />);
    expect(await screen.findByText(CALCULATOR_FAILED)).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });
});
