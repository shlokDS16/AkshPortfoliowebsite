// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { decisionFromRow } from "@/modules/compliance";
import { GateDecisionPanel } from "./gate-decision";

vi.mock("@/modules/compliance/actions", () => ({ allowSentenceAction: vi.fn() }));

// Phase 5d, rule 14: the recorded decision shows the gate's own refusal sentences for an outside source, with where they were found.
const row = (reasons: unknown) => ({ id: "d1", revision_id: "r2", verdict: "fail", policy_version: "sebi-unreg-2026-07-v1.3", decided_at: "2026-10-16T05:00:00Z", reasons: reasons as never });

describe("the recorded decision for outside sources", () => {
  it("names rule 14 and shows the database's sentence for the entry", () => {
    const decision = decisionFromRow(row({ failures: [{ rule: "14", code: "14.3", message: "YouTube or the page changed since you chose it. Save the sources again." }], lint: { findings: [], allowedBy: [] } }));
    render(<GateDecisionPanel itemId="i1" decision={decision} decisionRevNo={2} latestId="r2" />);
    const failure = screen.getByTestId("gate-failure");
    expect(failure).toHaveAttribute("data-rule", "14");
    expect(within(failure).getByText("Rule 14: outside sources")).toBeInTheDocument();
    expect(within(failure).getByText("YouTube or the page changed since you chose it. Save the sources again.")).toBeInTheDocument();
  });

  it("shows a refused outside title with its quoted sentence and where it was found", () => {
    const finding = { rule: "1", field: "outsideTitle", sentence: "Five stocks to buy now", sentenceHash: "a".repeat(64), match: "buy", message: "Rule 1 message." };
    const decision = decisionFromRow(row({ failures: [], lint: { findings: [finding], allowedBy: [] } }));
    render(<GateDecisionPanel itemId="i1" decision={decision} decisionRevNo={2} latestId="r2" />);
    expect(screen.getByText("In: Title of an outside source")).toBeInTheDocument();
    expect(screen.getByTestId("flagged-sentence")).toHaveTextContent("Five stocks to buy now");
  });
});
