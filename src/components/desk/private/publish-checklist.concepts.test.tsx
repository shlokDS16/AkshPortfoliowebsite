// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import { PublishChecklist, type ConceptCheck } from "./publish-checklist";

const items = [
  { id: "rule-1", state: "pass" as const, name: "No actionable language", detail: "x" },
  { id: "company", state: "pass" as const, name: "Company is public", detail: "The company can be listed" },
  { id: "rule-4", state: "manual" as const, name: "No recent change of stance", detail: "Tick the hand check below." },
];
const base = { companyName: "Kaveri Pumps (fictional)", companyAction: null, publishAction: vi.fn(), publishLabel: "Run the publishing gate on revision #2", live: null };

describe("PublishChecklist, linked concepts (Phase 4)", () => {
  it("a private concept: one line with its sentence and a Make public button that posts", async () => {
    const action = vi.fn(async () => {});
    const concepts: ConceptCheck[] = [{ id: "c1", name: "Capital cycle", unchecked: false, action }];
    const { container } = render(<PublishChecklist items={items} concepts={concepts} rule4Needed {...base} />);
    const row = screen.getByText('Concept "Capital cycle" is not public yet.').closest("li")!;
    expect(within(row).getByText("Linked concept")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Make Capital cycle public" }));
    expect(action).toHaveBeenCalledTimes(1);
    expectTokenOnly(container);
  });

  it("the line sits after the company line, counts in the total and as a failure", () => {
    const concepts: ConceptCheck[] = [{ id: "c1", name: "Capital cycle", unchecked: false, action: vi.fn() }];
    render(<PublishChecklist items={items} concepts={concepts} rule4Needed {...base} />);
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    const company = rows.findIndex((t) => t.includes("Company is public"));
    const concept = rows.findIndex((t) => t.includes("Capital cycle"));
    expect(concept).toBe(company + 1);
    expect(screen.getByRole("heading", { name: "Publish checklist · 2 of 4" })).toBeInTheDocument();
  });

  it("a stub says it is not checked yet and points to Names; no Make public", () => {
    const concepts: ConceptCheck[] = [{ id: "c2", name: "Stubby", unchecked: true, action: null }];
    render(<PublishChecklist items={items} concepts={concepts} rule4Needed {...base} />);
    expect(screen.getByText('Concept "Stubby" is not checked yet.')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check it on Names" })).toHaveAttribute("href", "/desk/names");
    expect(screen.queryByRole("button", { name: /Make Stubby public/ })).toBeNull();
  });

  it("no concepts passed: the list and the total are unchanged", () => {
    render(<PublishChecklist items={items} rule4Needed {...base} />);
    expect(screen.getByRole("heading", { name: "Publish checklist · 2 of 3" })).toBeInTheDocument();
    expect(screen.queryByText(/is not public yet/)).toBeNull();
  });

  it("without a company line the concept lines come last", () => {
    const concepts: ConceptCheck[] = [{ id: "c1", name: "Capital cycle", unchecked: false, action: vi.fn() }];
    render(<PublishChecklist items={items.filter((i) => i.id !== "company")} concepts={concepts} rule4Needed={false} {...base} />);
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(rows.at(-1)).toContain("Capital cycle");
  });
});
