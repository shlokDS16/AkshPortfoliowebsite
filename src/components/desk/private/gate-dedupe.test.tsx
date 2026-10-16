// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GateDecision } from "@/modules/compliance/client";
import { BodyPreview } from "./body-preview";
import { GateDecisionPanel } from "./gate-decision";

vi.mock("@/modules/compliance/actions", () => ({ allowSentenceAction: vi.fn(), removeAllowanceAction: vi.fn() }));

const finding = (field: string) => ({ rule: "1", field, sentence: "Multibagger ideas", match: "multibagger", sentenceHash: "a".repeat(64), message: "Reads as a recommendation." });

describe("a concept that is also the item's theme (Phase 4 T2 note 3)", () => {
  it("the recorded decision lists the flagged name once", () => {
    const decision: GateDecision = {
      decisionId: "d1",
      revisionId: "r1",
      verdict: "fail",
      policyVersion: "sebi-unreg-2026-07-v1.2",
      decidedAt: "2026-10-15T05:00:00Z",
      failures: [finding("themeName"), finding("conceptName")],
      allowedBy: [],
    };
    render(<GateDecisionPanel itemId="i1" decision={decision} decisionRevNo={2} latestId="r1" />);
    expect(screen.getAllByTestId("gate-failure")).toHaveLength(1);
    expect(screen.getByText("In: Linked concept name")).toBeInTheDocument();
  });

  it("the 'Elsewhere in this item' list shows it once", () => {
    const f = (field: "themeName" | "conceptName") => ({ ...finding(field), field, rule: "1" as const });
    render(<BodyPreview itemId="i1" named={false} body={{ paragraphs: [], unplaced: [f("themeName"), f("conceptName")] }} />);
    expect(screen.getAllByText(/Reads as a recommendation\./)).toHaveLength(1);
  });
});
