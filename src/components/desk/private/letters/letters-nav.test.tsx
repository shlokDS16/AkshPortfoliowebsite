// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LettersNav } from "./letters-nav";

describe("the letters section links", () => {
  it("lists the letters, what changed, and the readers, and marks the current one", () => {
    render(<LettersNav current="readers" />);
    expect(screen.getByRole("navigation", { name: "Letters" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All letters" })).toHaveAttribute("href", "/desk/letters");
    expect(screen.getByRole("link", { name: "What changed" })).toHaveAttribute("href", "/desk/letters/new");
    const readers = screen.getByRole("link", { name: "Readers" });
    expect(readers).toHaveAttribute("href", "/desk/letters/readers");
    expect(readers).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All letters" })).not.toHaveAttribute("aria-current");
  });

  it("marks none when the page is one letter", () => {
    render(<LettersNav current="letter" />);
    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  });
});
