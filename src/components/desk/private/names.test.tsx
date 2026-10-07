// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import { NameCard } from "./name-card";

const stub = {
  id: "s1", token: "$KAVPUMPS", type: "company" as const, firstSeen: "2026-10-06T05:00:00Z",
  quote: "t: $KAVPUMPS dealers wait longer", suggestion: { id: "c1", label: "Kaveri Pumps (fictional)" },
};

describe("NameCard", () => {
  it("shows the token, the quote it came from, and three choices", () => {
    const { container } = render(<NameCard name={stub} action={vi.fn()} />);
    expect(screen.getByText("$KAVPUMPS")).toHaveClass("font-mono");
    expect(screen.getByText("“t: $KAVPUMPS dealers wait longer”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Same as Kaveri Pumps (fictional)" })).toHaveAttribute("value", "merge");
    expect(screen.getByRole("button", { name: "New company" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not a company, keep as text" })).toHaveAttribute("value", "plain");
    expectTokenOnly(container);
  });

  it("'New company' asks for the name and a sector, then 'Yes, add it'", async () => {
    render(<NameCard name={stub} action={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "New company" }));
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Sector")).toHaveDisplayValue("Capital goods");
    expect(screen.getByRole("button", { name: "Yes, add it" })).toHaveAttribute("value", "new");
  });

  it("a theme has no sector and no 'Same as'", async () => {
    render(<NameCard name={{ ...stub, type: "theme", token: "#capex", suggestion: null }} action={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "New theme" }));
    expect(screen.queryByLabelText("Sector")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Same as/ })).toBeNull();
  });
});
