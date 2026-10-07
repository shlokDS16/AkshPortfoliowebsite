// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REVISION_DIFF, REVISION_LOG } from "@/test/fixtures/desk-ui";
import { expectNoMotion, expectTokenOnly, renderWithMotion } from "@/test/ui";
import { RevisionDiff } from "./revision-diff";
import { RevisionLog } from "./revision-log";

describe("RevisionDiff", () => {
  it("renders identical sentences in one group without key collisions", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const data = { ...REVISION_DIFF, groups: [{ location: "Same", removed: ["Twice.", "Twice."], added: ["Again.", "Again."] }, { location: "Same", removed: [], added: ["Once."] }] };
    renderWithMotion(<RevisionDiff data={data} />);
    expect(screen.getAllByText("Twice.")).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reason first, then removed (muted, dashed, no strike-through) and added, grouped by location", async () => {
    const { container } = renderWithMotion(<RevisionDiff data={REVISION_DIFF} />);
    expect(screen.getByText("Receivable days rose again in FY26; added test 3.")).toBeInTheDocument();
    const removed = screen.getByText("I expected margins to hold.");
    expect(removed.closest("[data-diff='removed']")).toHaveClass("border-dashed", "text-ink-muted");
    expect(container.innerHTML).not.toContain("line-through");
    expect(screen.getByText("I expected pricing power to show up in margins first.").closest("[data-diff='added']")).toHaveClass("bg-ins");
    await userEvent.click(screen.getByRole("radio", { name: "R1" }));
    expect(screen.getByText("I expected margins to hold.").closest("[data-diff]")).toBeNull();
    expectTokenOnly(container);
    expectNoMotion(container.querySelector("[data-diff-body]")!);
  });

  it("explains a first version", () => {
    renderWithMotion(<RevisionDiff data={null} />);
    expect(screen.getByText("First version. Later revisions will show what changed and why.")).toBeInTheDocument();
  });
});

describe("RevisionLog", () => {
  it("sorts a copy newest first and leaves the caller's array alone", () => {
    const input = [{ revNo: 1, on: "2026-08-05", reason: "First version." }, { revNo: 3, on: "2026-09-01", reason: "Third." }, { revNo: 2, on: "2026-08-20", reason: "Second." }];
    render(<RevisionLog revisions={input} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent?.slice(0, 2))).toEqual(["R3", "R2", "R1"]);
    expect(input.map((r) => r.revNo)).toEqual([1, 3, 2]);
  });

  it("lists every revision newest first with date and reason", () => {
    render(<RevisionLog revisions={[...REVISION_LOG].reverse()} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("R2");
    expect(items[0]).toHaveTextContent("20 Aug 2026");
    expect(items[1]).toHaveTextContent("First version.");
  });
});
