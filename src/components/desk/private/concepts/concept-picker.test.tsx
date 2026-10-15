// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConceptRef } from "@/modules/knowledge/client";
import { expectTokenOnly } from "@/test/ui";
import { ConceptPicker } from "./concept-picker";

const ref = (name: string, status: ConceptRef["status"] = "private"): ConceptRef => ({ id: `id-${name}`, slug: name.toLowerCase(), name, status });
const NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];
const options = NAMES.map((n) => ref(n));
const idOf = (n: string) => `id-${n}`;

function setup(over: Partial<React.ComponentProps<typeof ConceptPicker>> = {}) {
  const save = vi.fn<(ids: string[]) => Promise<void>>(async () => {});
  const utils = render(<ConceptPicker options={options} initial={[idOf("Alpha")]} save={save} blocked={false} {...over} />);
  return { save, ...utils };
}

describe("ConceptPicker", () => {
  it("names itself, gives the hint and starts with what the item already has", () => {
    const { container } = setup();
    expect(screen.getByRole("heading", { name: "Concepts for this note" })).toBeInTheDocument();
    expect(screen.getByText("Up to 8. Saving makes a new version.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Beta/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    expectTokenOnly(container);
  });

  it("saves in the order the concepts were tapped", async () => {
    const { save } = setup();
    await userEvent.click(screen.getByRole("option", { name: /Gamma/ }));
    await userEvent.click(screen.getByRole("option", { name: /Beta/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save concepts" }));
    expect(save).toHaveBeenCalledWith([idOf("Alpha"), idOf("Gamma"), idOf("Beta")]);
  });

  it("a second tap takes a concept out, and the chosen list can remove it too", async () => {
    const { save } = setup({ initial: [idOf("Alpha"), idOf("Beta")] });
    await userEvent.click(screen.getByRole("option", { name: /Alpha/ }));
    expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "false");
    const chosen = screen.getByRole("list", { name: "Chosen, in order" });
    await userEvent.click(within(chosen).getByRole("button", { name: "Remove Beta" }));
    await userEvent.click(screen.getByRole("button", { name: "Save concepts" }));
    expect(save).toHaveBeenCalledWith([]);
  });

  it("holds at 8: the ninth tap does nothing and the others read as unavailable", async () => {
    const { save } = setup({ initial: NAMES.slice(0, 8).map(idOf) });
    expect(screen.getByText("8 of 8 chosen")).toBeInTheDocument();
    const ninth = screen.getByRole("option", { name: /Iota/ });
    expect(ninth).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(ninth);
    expect(ninth).toHaveAttribute("aria-selected", "false");
    await userEvent.click(screen.getByRole("button", { name: "Save concepts" }));
    expect(save.mock.calls[0]?.[0]).toHaveLength(8);
  });

  it("type-ahead narrows the list and the keyboard alone can choose and save", async () => {
    const { save } = setup({ initial: [] });
    const box = screen.getByRole("combobox", { name: "Find a concept" });
    await userEvent.click(box);
    await userEvent.keyboard("et");
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("data-name"))).toEqual(["Beta", "Zeta", "Eta", "Theta"]);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByRole("option", { name: /Zeta/ })).toHaveAttribute("aria-selected", "true");
    expect(box).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Zeta/ }).id);
    await userEvent.keyboard("{Escape}");
    expect(box).toHaveValue("");
    // Tab leaves the box, passes the chosen list's Remove button, and lands on Save concepts.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(save).toHaveBeenCalledWith([idOf("Zeta")]);
  });

  it("says so when nothing matches, without an empty listbox", async () => {
    setup();
    await userEvent.type(screen.getByRole("combobox", { name: "Find a concept" }), "zzz");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("No checked concept matches.")).toBeInTheDocument();
  });

  it("marks a linked name that is still waiting on Names", () => {
    setup({ options: [ref("Alpha"), ref("Stub", "unchecked")], initial: [idOf("Stub")] });
    expect(screen.getByRole("option", { name: /Stub/ })).toHaveTextContent("not checked yet");
  });

  it("blocked: the plain refusal sentence shows and Save concepts is off", () => {
    const { save } = setup({ blocked: true });
    expect(screen.getByText("A newer version of this note is waiting to be published. Publish it before changing the concepts.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save concepts" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it("a double tap on Save concepts saves once", async () => {
    let release!: () => void;
    const { save } = setup();
    save.mockImplementation(() => new Promise<void>((r) => (release = r)));
    const button = screen.getByRole("button", { name: "Save concepts" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    release();
  });
});
