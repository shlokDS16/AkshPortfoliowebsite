// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AttachPicker } from "./attach-picker";

const options = [
  { id: "c1", label: "Kaveri Pumps", hint: "KAVPUMP" },
  { id: "c2", label: "Sahyadri Cold Chain", hint: "SAHCOLD" },
  { id: "c3", label: "Kaveri Textiles", hint: null },
];

function values(container: HTMLElement, name: string): string[] {
  return [...container.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)].map((i) => i.value);
}

describe("AttachPicker", () => {
  it("starts with what is attached, as hidden fields under the given name (one per id, in order)", () => {
    const { container } = render(<AttachPicker name="companyId" label="Companies" noun="company" options={options} initial={["c2", "c1"]} max={5} />);
    expect(values(container, "companyId")).toEqual(["c2", "c1"]);
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });

  it("finds by name or symbol as he types and adds one with a press; the match leaves the list", async () => {
    const { container } = render(<AttachPicker name="companyId" label="Companies" noun="company" options={options} initial={[]} max={5} />);
    const find = screen.getByRole("textbox", { name: "Find a company" });
    await userEvent.type(find, "kav");
    const list = screen.getByRole("list", { name: "Matching companies" });
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual(["Add Kaveri Pumps · KAVPUMP", "Add Kaveri Textiles"]);
    await userEvent.click(within(list).getByRole("button", { name: /Kaveri Pumps/ }));
    expect(values(container, "companyId")).toEqual(["c1"]);
    expect(screen.getByRole("list", { name: "Chosen companies" })).toHaveTextContent("Kaveri Pumps");
    await userEvent.type(find, "kav");
    expect(within(screen.getByRole("list", { name: "Matching companies" })).queryByRole("button", { name: /Kaveri Pumps/ })).toBeNull();
    await userEvent.clear(find);
    await userEvent.type(find, "sahcold");
    expect(within(screen.getByRole("list", { name: "Matching companies" })).getAllByRole("button")).toHaveLength(1);
  });

  it("removes one with a press that names it, and says how many are left", async () => {
    const { container } = render(<AttachPicker name="themeId" label="Concepts" noun="concept" options={options} initial={["c1", "c2"]} max={8} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Kaveri Pumps" }));
    expect(values(container, "themeId")).toEqual(["c2"]);
    expect(screen.getByText("1 of 8")).toBeInTheDocument();
  });

  it("stops at the most it may hold and says so", () => {
    render(<AttachPicker name="companyId" label="Companies" noun="company" options={options} initial={["c1", "c2"]} max={2} />);
    expect(screen.getByRole("textbox", { name: "Find a company" })).toBeDisabled();
    expect(screen.getByText("The most a source can have is 2. Remove one to add another.")).toBeInTheDocument();
  });

  it("Enter in the search box adds the first match and does not submit the form", async () => {
    const submitted: string[] = [];
    const { container } = render(
      <form onSubmit={(e) => (e.preventDefault(), submitted.push("sent"))}>
        <AttachPicker name="companyId" label="Companies" noun="company" options={options} initial={[]} max={5} />
      </form>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Find a company" }), "sah{Enter}");
    expect(values(container, "companyId")).toEqual(["c2"]);
    expect(submitted).toEqual([]);
  });

  it("says when nothing matches", async () => {
    render(<AttachPicker name="companyId" label="Companies" noun="company" options={options} initial={[]} max={5} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Find a company" }), "zzz");
    expect(screen.getByText("No company matches.")).toBeInTheDocument();
  });
});
