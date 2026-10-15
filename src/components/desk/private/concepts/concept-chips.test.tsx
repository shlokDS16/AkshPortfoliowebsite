// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConceptRef } from "@/modules/knowledge/client";
import { expectTokenOnly } from "@/test/ui";
import { ConceptChips } from "./concept-chips";

const ref = (name: string, status: ConceptRef["status"] = "private"): ConceptRef => ({ id: name, slug: name.toLowerCase().replaceAll(" ", "-"), name, status });

describe("ConceptChips", () => {
  it("links each concept to its page, in the order given", () => {
    const { container } = render(<ConceptChips concepts={[ref("Capital cycle"), ref("Moats")]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/desk/concepts/capital-cycle", "/desk/concepts/moats"]);
    expect(links[0]).toHaveTextContent("Capital cycle");
    expectTokenOnly(container);
  });

  it("says in words that a name still waiting on Names is not checked yet", () => {
    render(<ConceptChips concepts={[ref("Stub", "unchecked"), ref("Fine", "public")]} />);
    expect(screen.getByRole("link", { name: /Stub/ })).toHaveTextContent("not checked yet");
    expect(screen.getByRole("link", { name: /Fine/ })).not.toHaveTextContent("not checked yet");
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<ConceptChips concepts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
