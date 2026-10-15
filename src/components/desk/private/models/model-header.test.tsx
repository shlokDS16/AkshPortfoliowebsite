// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ModelHead } from "@/modules/valuation";
import { ModelHeader } from "./model-header";

const head: ModelHead = {
  versionId: "11111111-0000-4000-8000-000000000001",
  versionNo: 3,
  status: "confirmed",
  companyId: "cccccccc-0000-4000-8000-000000000001",
  company: "$KAVPUMP",
  documentId: "22222222-2222-4222-8222-222222222222",
  fileTitle: "Kaveri DCF",
  readAt: "2026-10-14T06:00:00Z",
  formulaCount: 12,
  report: null,
  refusal: null,
  newer: null,
};

describe("the model page's header", () => {
  it("links back to the list of models, so the list is reachable without typing its address", () => {
    render(<ModelHeader head={head} />);
    expect(screen.getByRole("link", { name: "All models" })).toHaveAttribute("href", "/desk/models");
  });

  it("names the company and the version, and points to a newer version when there is one", () => {
    render(<ModelHeader head={{ ...head, newer: { versionId: "11111111-0000-4000-8000-000000000002", versionNo: 4 } }} />);
    expect(screen.getByRole("heading", { level: 1, name: "$KAVPUMP" })).toBeInTheDocument();
    expect(screen.getByText("Model version 3, read 14 Oct 2026 from Kaveri DCF")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "open it" })).toHaveAttribute("href", "/desk/models/11111111-0000-4000-8000-000000000002");
  });
});
