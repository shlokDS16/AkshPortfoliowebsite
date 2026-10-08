// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CASEFILE_LIMITS, parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { ADD_FACT_EVENT, type AddFactDetail } from "../add-source-event";
import { RevisionEditor } from "../revision-editor";
import { blankFact, blankSource, toDraft } from "./draft";
import { withFact } from "./add-fact";

const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);
const open = (text = canonical) => render(<RevisionEditor action={vi.fn()} bodyMd={bodyMd} sheet={text} figuresTo="2026-01-31" />);
const group = (name: string) => within(screen.getByRole("group", { name }));
const LINE = "We expect the Kaveri Pumps capacity expansion to be commissioned in the second half of FY27.";
const DETAIL: AddFactDetail = {
  source: { doc: "Investor deck Q1", type: "Presentation", filedOn: "2026-08-01", url: "" },
  quote: LINE,
  locator: "p. 12",
};
/** Fires the event the way the pane does and says whether the Facts form took it (cancelled). */
const fire = (detail = DETAIL) => {
  let taken = false;
  act(() => void (taken = !window.dispatchEvent(new CustomEvent(ADD_FACT_EVENT, { detail, cancelable: true }))));
  return taken;
};

describe("Facts form: the document pane's Use as a fact", () => {
  const facts = toDraft(parseFactsSheet(canonical).caseFile).facts.length;

  it("adds a new fact row with only the quote, the page and the source: label and value stay empty", () => {
    open();
    expect(fire()).toBe(true);
    const row = group(`Fact F${facts + 1}`);
    expect(row.getByLabelText("Quoted line (optional)")).toHaveValue(LINE);
    expect(row.getByLabelText("Page or locator")).toHaveValue("p. 12");
    expect(row.getByLabelText("Metric")).toHaveValue("");
    expect(row.getByLabelText("Value")).toHaveValue("");
    expect(row.getByLabelText("Source")).toHaveValue("S2");
    expect(group("Source S2").getByLabelText("Document")).toHaveValue("Investor deck Q1");
    expect(screen.getByLabelText("Metric", { selector: `#ff-F${facts + 1}-label` })).toHaveFocus();
  });

  it("reuses the document's source row and does not reuse an id (a second press adds the next fact)", () => {
    open();
    fire();
    fire({ ...DETAIL, quote: "A second confirmed line of at least twenty characters.", locator: "p. 13" });
    expect(screen.getAllByRole("group", { name: /^Source S\d+$/ })).toHaveLength(2);
    expect(group(`Fact F${facts + 2}`).getByLabelText("Page or locator")).toHaveValue("p. 13");
  });

  it("never takes an id the body already cites", () => {
    render(<RevisionEditor action={vi.fn()} bodyMd={`${bodyMd}\n\nSee [F${facts + 1}].`} sheet={canonical} figuresTo="2026-01-31" />);
    fire();
    expect(screen.queryByRole("group", { name: `Fact F${facts + 1}` })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: `Fact F${facts + 2}` })).toBeInTheDocument();
  });

  it("from the Text sheet: opens the form with the row; the empty label and value then block the way back until Aksh fills them", async () => {
    open();
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    expect(fire()).toBe(true);
    expect(screen.getByRole("radio", { name: "Form" })).toHaveAttribute("aria-checked", "true");
    expect(group(`Fact F${facts + 1}`).getByLabelText("Quoted line (optional)")).toHaveValue(LINE);
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/fields? need/);
  });

  it("leaves a text sheet that does not parse alone, says why, and does not cancel the event", async () => {
    open(`${canonical}\nQ | not a row`);
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    expect(fire()).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot open as a form yet/);
  });
});

describe("withFact", () => {
  it("refuses a full list of facts, or a new source when the sources are full", () => {
    const base = toDraft(parseFactsSheet(canonical).caseFile);
    const full = { ...base, facts: Array.from({ length: CASEFILE_LIMITS.facts }, (_, i) => blankFact(`F${i + 1}`, "S1")) };
    expect(withFact(full, DETAIL, [])).toBeNull();
    const manySources = { ...base, sources: Array.from({ length: CASEFILE_LIMITS.sources }, (_, i) => blankSource(`S${i + 1}`)) };
    expect(withFact(manySources, DETAIL, [])).toBeNull();
  });
});
