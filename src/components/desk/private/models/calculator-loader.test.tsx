// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScenarioCell } from "@/modules/valuation/client";
import { CalculatorShell } from "./calculator-shell";
import { withFallback } from "./calculator-loader";
import { CALCULATOR_FAILED, CALCULATOR_LOADING } from "./copy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Spec s8: a calculator chunk that does not load shows "The calculator did not load..." with the workbook values still on the page.
const cells: ScenarioCell[] = [
  { id: "c1", sheet: "Assumptions", addr: "B1", role: "input", label: "Cost of equity", own: false, value: 0.115, z: "0.0%" },
  { id: "c2", sheet: "DCF", addr: "B13", role: "output", label: "Per-share result", own: false, value: 61.5, z: "#,##0.00" },
];

describe("the calculator's loader", () => {
  it("turns a chunk that fails to load into the failed shell with the spec s8 sentence", async () => {
    const { default: Failed } = await withFallback(() => Promise.reject(new Error("ChunkLoadError")))();
    render(<Failed versionId="v" cells={cells} scenarios={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(CALCULATOR_FAILED);
    expect(screen.getByText("61.50")).toBeInTheDocument();
  });

  it("the loading shell shows the workbook values read-only", () => {
    render(<CalculatorShell cells={cells} />);
    expect(screen.getByRole("status")).toHaveTextContent(CALCULATOR_LOADING);
    expect(screen.getByRole("textbox", { name: /Cost of equity/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Cost of equity/ })).toHaveValue("11.5");
  });
});
