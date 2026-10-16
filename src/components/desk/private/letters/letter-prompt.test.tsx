// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import { LetterPrompt } from "./letter-prompt";

describe("the Monday line on the desk home", () => {
  it("is one link to the list of what changed", () => {
    const { container } = render(<LetterPrompt line="Letter: 3 changes since your last letter." />);
    const link = screen.getByRole("link", { name: "Letter: 3 changes since your last letter." });
    expect(link).toHaveAttribute("href", "/desk/letters/new");
    expectTokenOnly(container);
  });

  it("is nothing at all when there is no line", () => {
    const { container } = render(<LetterPrompt line={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
