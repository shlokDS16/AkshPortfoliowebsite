// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { expectTokenOnly } from "@/test/ui";
import { AllowanceForm } from "./allowance-form";
import { BodyPreview } from "./body-preview";
import { FiguresToHint } from "./figures-to-hint";
import { GateNote } from "./gate-note";
import { GatedSentence } from "./gated-sentence";
import { PublishChecklist } from "./publish-checklist";
import { RevisionEditor } from "./revision-editor";

vi.mock("@/modules/compliance/actions", () => ({ allowSentenceAction: vi.fn(), removeAllowanceAction: vi.fn() }));

const flag = { hash: "a".repeat(64), rule: "1", match: "buy", message: "x", allowable: true, sentence: "You should buy the leader now." };

describe("GatedSentence and GateNote", () => {
  it("marks the sentence: wavy crimson underline, the matched words bold, the rule number", () => {
    const { container } = render(<GatedSentence segment={{ text: flag.sentence, flag, allowed: null }} first />);
    const s = screen.getByTestId("preview-flag");
    expect(s).toHaveAttribute("id", "first-flag");
    expect(s).toHaveClass("decoration-wavy", "decoration-bad");
    expect(within(s).getByText("buy")).toHaveClass("font-semibold", "text-bad");
    expect(within(s).getByText("1")).toHaveProperty("tagName", "SUP");
    expectTokenOnly(container);
  });

  it("rule 1 recorded by the gate explains itself and offers an allowance with a reason; never an override", () => {
    render(<GateNote itemId="i1" flag={flag} />);
    expect(screen.getByText(/Rule 1, no actionable language: "buy" about a named company/)).toBeInTheDocument();
    expect(screen.getByText(/The gate recorded this sentence/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit sentence" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reason, saved with the gate decision (required)")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/override|publish anyway/i);
  });

  it("a rule 1 flag the gate has not recorded offers no allowance, and says how to get one", () => {
    render(<GateNote itemId="i1" flag={{ ...flag, allowable: false }} />);
    expect(screen.getByText(/Run the publishing gate; if it records this sentence under rule 1 you can then allow it with a reason\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow this sentence" })).toBeNull();
  });

  it("rule 2 and rule 3 have no allowance", () => {
    const { rerender } = render(<GateNote itemId="i1" flag={{ ...flag, rule: "2", match: "my calls", allowable: false }} />);
    expect(screen.getByText(/Rule 2 has no allowance; rewrite it\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow this sentence" })).toBeNull();
    rerender(<GateNote itemId="i1" flag={{ ...flag, rule: "3", match: null, message: "A case study needs data_as_of at least 30 days old.", allowable: false }} />);
    expect(screen.getByText(/Rule 3 has no allowance/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow this sentence" })).toBeNull();
  });

  it("the allowance form refuses an empty reason in words", async () => {
    const action = vi.fn();
    render(<AllowanceForm action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Allow this sentence" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a reason first.");
    expect(action).not.toHaveBeenCalled();
  });
});

describe("BodyPreview", () => {
  it("lists findings outside the body, such as rule 3a's message, under 'Elsewhere in this item'", () => {
    const message = "A figure is dated 2026-09-30, after this file's 'Figures to' date (2026-08-22). Move 'Figures to' forward or remove the figure.";
    render(
      <BodyPreview
        itemId="i1"
        body={{ paragraphs: [[{ text: "Margins held.", flag: null, allowed: null }]], unplaced: [{ rule: "3", field: "structured", sentence: null, sentenceHash: null, match: null, message }] }}
      />,
    );
    expect(screen.getByText("Elsewhere in this item")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message.slice(0, 40)))).toBeInTheDocument();
    expect(screen.getByText(/Rule 3: 30-day data lag/)).toBeInTheDocument();
  });

  it("gives #first-flag to the first flagged sentence only, with its note under that paragraph", () => {
    const second = { ...flag, hash: "b".repeat(64), sentence: "Sell the laggard." };
    render(
      <BodyPreview
        itemId="i1"
        body={{
          paragraphs: [
            [{ text: "Plain opening.", flag: null, allowed: null }],
            [{ text: flag.sentence, flag, allowed: null }],
            [{ text: second.sentence, flag: second, allowed: null }],
          ],
          unplaced: [],
        }}
      />,
    );
    const marked = screen.getAllByTestId("preview-flag");
    expect(marked).toHaveLength(2);
    expect(marked[0]).toHaveAttribute("id", "first-flag");
    expect(marked[1]).not.toHaveAttribute("id");
    expect(screen.getAllByRole("button", { name: "Edit sentence" })).toHaveLength(2);
  });
});

describe("PublishChecklist", () => {
  const items = [
    { id: "rule-1", state: "fail" as const, name: "No actionable language", detail: "x" },
    { id: "rule-2", state: "pass" as const, name: "No performance claims", detail: "x" },
    { id: "rule-4", state: "manual" as const, name: "No recent change of stance", detail: "Tick the hand check below." },
  ];
  const base = { companyName: "Kaveri Pumps (fictional)", companyAction: null, publishAction: vi.fn(), publishLabel: "Run the publishing gate on revision #2", live: null };

  it("summarises 'n of total', keeps the run button enabled while a rule fails, and has no override", () => {
    const { container } = render(<PublishChecklist items={items} rule4Needed {...base} />);
    expect(screen.getByRole("heading", { name: "Publish checklist · 1 of 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run the publishing gate on revision #2" })).toBeEnabled();
    expect(screen.getByText("Preview: 1 rule fails · rule 4 unchecked. The gate decides and records the result; you can run it now.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/override/i);
    expectTokenOnly(container);
  });

  it("with every rule passing, the preview says so; ticking rule 4 puts rule4=on in the form", async () => {
    const { container } = render(<PublishChecklist items={items.map((i) => ({ ...i, state: i.id === "rule-4" ? i.state : ("pass" as const) }))} rule4Needed {...base} />);
    expect(screen.getByText("Preview: rule 4 unchecked. The gate decides and records the result; you can run it now.")).toBeInTheDocument();
    const form = container.querySelector("form")!;
    expect(new FormData(form).get("rule4")).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "I have not changed my stance on Kaveri Pumps (fictional) in my private notes in the last 30 days." }));
    expect(new FormData(form).get("rule4")).toBe("on");
    expect(screen.getByText("Preview passes. The gate decides and records the result.")).toBeInTheDocument();
  });

  it("with nothing to run it says how to get something to publish; a live item can be unpublished", () => {
    const { rerender } = render(<PublishChecklist items={[]} rule4Needed={false} {...base} publishAction={null} publishLabel="" />);
    expect(screen.getByText("Save a revision to publish it.")).toBeInTheDocument();
    rerender(<PublishChecklist items={[]} rule4Needed={false} {...base} publishAction={null} publishLabel="" live={{ revNo: 3, unpublish: vi.fn() }} />);
    expect(screen.getByText("Live: revision #3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("reminds that exhibit titles and summaries must not quote figures younger than 30 days (carried from Task 7)", () => {
    render(<PublishChecklist items={items} rule4Needed {...base} />);
    expect(screen.getByText(/exhibit titles and summaries/i)).toHaveTextContent(/younger than 30 days/);
  });

  it("offers to make a named company public, by name", () => {
    const withCompany = items.map((i) => (i.id === "rule-2" ? { id: "company", state: "fail" as const, name: "Company is public", detail: "Make the company public before publishing." } : i));
    render(<PublishChecklist items={withCompany} rule4Needed {...base} companyAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Make Kaveri Pumps (fictional) public" })).toBeInTheDocument();
  });
});

describe("RevisionEditor", () => {
  it("keeps Aksh's words and the facts sheet in separate fields and checks the sheet line by line", async () => {
    render(<RevisionEditor action={vi.fn()} bodyMd={KAVERI.revisions[0].bodyMd} sheet={KAVERI.revisions[0].sheet} />);
    expect(screen.getByLabelText("Body (Markdown)")).toHaveValue(KAVERI.revisions[0].bodyMd);
    const sheet = screen.getByLabelText("Facts sheet");
    expect(parseFactsSheet((sheet as HTMLTextAreaElement).value).errors).toEqual([]);
    expect(screen.getByLabelText("Change reason")).toHaveValue("");
    await userEvent.type(sheet, "\nZ1 | ?");
    expect(screen.getByText(/Line \d+: Start a row with O, S1, F1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save revision" })).toBeDisabled();
  });

  it("checks a scenario with casefile's own rule 9 (a value row is refused in words)", async () => {
    render(<RevisionEditor action={vi.fn()} bodyMd="x" sheet="" />);
    await userEvent.type(screen.getByLabelText("Facts sheet"), "SC | Slow | Base{enter}Y | Intrinsic value per share | ₹ | 100 | 200");
    expect(screen.getByText(/Rule 9: public scenario tables show operating outputs only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save revision" })).toBeDisabled();
  });

  it("a note has no facts sheet", () => {
    render(<RevisionEditor action={vi.fn()} bodyMd="A note." sheet={null} />);
    expect(screen.queryByLabelText("Facts sheet")).toBeNull();
  });

  it("selects the sentence in the body when a gate note asks to edit it", async () => {
    render(<RevisionEditor action={vi.fn()} bodyMd={"Margins held.\nYou should buy\nthe leader now."} sheet={null} />);
    window.dispatchEvent(new CustomEvent("desk:edit-sentence", { detail: "You should buy the leader now." }));
    const body = screen.getByLabelText("Body (Markdown)") as HTMLTextAreaElement;
    expect(body.value.slice(body.selectionStart, body.selectionEnd)).toBe("You should buy\nthe leader now.");
  });
});

describe("FiguresToHint (rule 3a: make Figures to easy to set)", () => {
  it("offers the latest figure date when Figures to is missing or earlier, and nothing when it already covers it", () => {
    const { rerender } = render(<FiguresToHint latest="2026-03-31" figuresTo="2026-01-31" action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Set Figures to 31 Mar 2026" })).toBeInTheDocument();
    expect(screen.getByText(/Latest figure in the saved facts: 31 Mar 2026. Figures to: 31 Jan 2026/)).toBeInTheDocument();
    rerender(<FiguresToHint latest="2026-03-31" figuresTo={null} action={vi.fn()} />);
    expect(screen.getByText(/Figures to: not set/)).toBeInTheDocument();
    rerender(<FiguresToHint latest="2026-03-31" figuresTo="2026-03-31" action={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<FiguresToHint latest={null} figuresTo={null} action={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
