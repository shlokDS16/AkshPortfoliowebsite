// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CaseState } from "@/modules/cases/client";
import { IdeaCaseBlock } from "./idea-case-block";

const ITEM = "55555555-5555-4555-8555-555555555555";
const ready: CaseState = { state: "ready", figuresTo: "2026-06-16", earliest: "2026-07-16" };
const draft = vi.fn(async () => {});

const show = (state: CaseState | null, reveal: boolean | null = false) =>
  render(<IdeaCaseBlock state={state} reveal={reveal} draftAction={draft} />);

describe("the case study block on a closed idea (spec s33.8)", () => {
  it("does not guess the switch when it could not be read", () => {
    show(ready, null);
    expect(screen.getByText(/switched on \(could not be read just now\)\./)).toBeInTheDocument();
    expect(screen.queryByText(/\(now (?:on|off)\)/)).toBeNull();
  });

  it.each<CaseState["state"]>(["not_closed", "void"])("shows nothing for an idea that is %s", (state) => {
    const { container } = show({ state } as CaseState);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for the lesson first", () => {
    show({ state: "no_lesson" });
    expect(screen.getByRole("heading", { level: 2, name: "Case study" })).toBeInTheDocument();
    expect(screen.getByText("A case study shows what you learned. Write the lesson first.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says the exit is not fixed, with no button", () => {
    show({ state: "exit_pending" });
    expect(screen.getByText("The exit price is not fixed yet. A case study can be drafted once it is.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    [false, "off"],
    [true, "on"],
  ])("ready with the owner switch %s: the button, the earliest day and the switch in words", (reveal, word) => {
    show(ready, reveal);
    expect(screen.getByRole("button", { name: "Draft a case study" })).toBeEnabled();
    expect(screen.getByText(`It can be published from 16 Jul 2026 at the earliest, and only while the site owner has case studies switched on (now ${word}).`)).toBeInTheDocument();
  });

  it("a double tap sends one draft", async () => {
    draft.mockClear();
    let release: () => void = () => {};
    draft.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    show(ready);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Draft a case study" });
    await user.dblClick(button);
    expect(draft).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
    release();
  });

  it.each(["draft", "public"] as const)("a %s case study is one link to the item", (kind) => {
    show({ state: kind, itemId: ITEM });
    expect(screen.getByText(`Case study: ${kind}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", `/desk/items/${ITEM}`);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says plainly when the state could not be read, and offers no button", () => {
    show(null);
    expect(screen.getByText("Whether a case study can be drafted could not be read just now.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses none of the words the site never says", () => {
    const { container } = show(ready, true);
    expect(container.textContent ?? "").not.toMatch(/\b(proof|proves|verified|tamper-proof|buy|sell|hit)\b/i);
  });
});
