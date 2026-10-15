// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConceptRef } from "@/modules/knowledge/client";
import { ItemConcepts } from "./item-concepts";

const ref = (name: string): ConceptRef => ({ id: `id-${name}`, slug: name.toLowerCase(), name, status: "private" });

describe("ItemConcepts", () => {
  it("shows the Concepts row with chips and a Change button; the picker is closed", () => {
    render(<ItemConcepts linked={[ref("Alpha")]} options={[ref("Alpha"), ref("Beta")]} save={vi.fn()} blocked={false} />);
    expect(screen.getByText("Concepts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/desk/concepts/alpha");
    const change = screen.getByRole("button", { name: "Change" });
    expect(change).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Concepts for this note" })).toBeNull();
  });

  it("Change opens the picker with the current concepts chosen", async () => {
    render(<ItemConcepts linked={[ref("Alpha")]} options={[ref("Alpha"), ref("Beta")]} save={vi.fn()} blocked={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Change" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
  });

  it("with no concepts the row says so", () => {
    render(<ItemConcepts linked={[]} options={[ref("Beta")]} save={vi.fn()} blocked={false} />);
    expect(screen.getByText("None yet")).toBeInTheDocument();
  });
});
