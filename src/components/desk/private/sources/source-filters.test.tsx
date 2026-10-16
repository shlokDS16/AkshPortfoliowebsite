// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceFilters } from "./source-filters";

const companies = [{ id: "c1", slug: "kavpump", name: "Kaveri Pumps", symbol: "KAVPUMP" }];
const concepts = [{ id: "t1", slug: "moats", name: "Moats" }];

describe("the sources filters", () => {
  it("is a plain GET form back to the page, so a filtered list is a link he can keep", () => {
    const { container } = render(<SourceFilters companies={companies} concepts={concepts} selected={{}} />);
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/desk/sources");
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
  });

  it("offers every company and concept by name, with 'all' first, and marks the chosen ones", () => {
    render(<SourceFilters companies={companies} concepts={concepts} selected={{ company: "kavpump", concept: "moats", onPublic: true, archived: false }} />);
    const company = screen.getByRole("combobox", { name: "Company" });
    expect(company).toHaveValue("kavpump");
    expect([...(company as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["All companies", "Kaveri Pumps · KAVPUMP"]);
    expect(screen.getByRole("combobox", { name: "Concept" })).toHaveValue("moats");
    expect(screen.getByRole("checkbox", { name: "On a public file" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include archived" })).not.toBeChecked();
  });

  it("offers a way to clear the filters only when one is set", () => {
    const { unmount } = render(<SourceFilters companies={companies} concepts={concepts} selected={{}} />);
    expect(screen.queryByRole("link", { name: "Clear" })).toBeNull();
    unmount();
    render(<SourceFilters companies={companies} concepts={concepts} selected={{ concept: "moats" }} />);
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/desk/sources");
  });
});
