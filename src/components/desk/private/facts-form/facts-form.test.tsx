// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { expectTokenOnly } from "@/test/ui";
import { RevisionEditor } from "../revision-editor";
import { draftToSheet, toDraft } from "./draft";
import { rowErrors } from "./validate";

const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);

const open = (action = vi.fn()) => ({ action, ...render(<RevisionEditor action={action} bodyMd={bodyMd} sheet={canonical} figuresTo="2026-01-31" />) });
const toText = () => userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
const toForm = () => userEvent.click(screen.getByRole("radio", { name: "Form" }));
const group = (name: string) => within(screen.getByRole("group", { name }));
const sheetValue = () => (screen.getByLabelText("Facts sheet") as HTMLTextAreaElement).value;
const save = () => screen.getByRole("button", { name: "Save revision" });

describe("Facts form draft", () => {
  it("writes the seeded Kaveri file back through casefile's serializer unchanged", () => {
    expect(draftToSheet(toDraft(parseFactsSheet(sheet).caseFile))).toBe(canonical);
  });

  it("places a parser error on the row it came from", () => {
    const text = `${canonical}\nA | Equity value | 1 | 2 | 3`;
    const keyed = rowErrors(text, parseFactsSheet(text).errors);
    expect(keyed.A1?.[0]).toMatch(/^Rule 9/);
  });
});

describe("Facts form (Form is the default; Text sheet stays for pasting)", () => {
  it("round-trips the seeded sheet: Form, change nothing, back to Text gives the same sheet", async () => {
    const { container } = open();
    expect(screen.getByRole("radio", { name: "Form" })).toHaveAttribute("aria-checked", "true");
    expect(group("Fact F1").getByLabelText("Metric")).toHaveValue("Revenue from operations");
    expect(screen.getByText("Receivable days stay above 150 for two straight years.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add reading for T3" })).toBeInTheDocument();
    expect(screen.getByText(/Latest figure date in these facts: 31 Mar 2026/)).toBeInTheDocument();
    expectTokenOnly(container);
    await toText();
    expect(sheetValue()).toBe(canonical);
  });

  it("adds a fact as a serialized line, with the next free id", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Add fact" }));
    const f5 = group("Fact F5");
    await userEvent.type(f5.getByLabelText("Metric"), "Dealer count");
    await userEvent.type(f5.getByLabelText("Value"), "1900");
    await userEvent.type(f5.getByLabelText("Unit"), "dealers");
    await userEvent.type(f5.getByLabelText("Period"), "FY26");
    fireEvent.change(f5.getByLabelText("As of"), { target: { value: "2026-03-31" } });
    await userEvent.type(f5.getByLabelText("Page or locator"), "p. 20");
    expect(save()).toBeEnabled();
    await toText();
    expect(sheetValue()).toContain("F5 | Dealer count | 1900 | dealers | FY26 | 2026-03-31 | S1 | p. 20");
  });

  it("warns before saving when a removed fact is cited in the body, and saves on the second press", async () => {
    const { action } = open();
    await userEvent.click(screen.getByRole("button", { name: "Remove fact F3" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The body cites [F3]");
    await userEvent.click(save());
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Press Save revision again");
    await userEvent.click(save());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][0] as FormData;
    expect(String(data.get("factsSheet"))).not.toMatch(/^F3 \|/m);
    expect(data.get("bodyMd")).toBe(bodyMd);
  });

  it("marks an invalid date next to the field and blocks saving", async () => {
    open();
    fireEvent.change(group("Fact F2").getByLabelText("As of"), { target: { value: "" } });
    expect(group("Fact F2").getByText("Pick a date.")).toBeInTheDocument();
    expect(group("Fact F2").getByLabelText("As of")).toHaveAttribute("aria-invalid", "true");
    expect(save()).toBeDisabled();
  });

  it("refuses a rule-9 output row in words", async () => {
    open();
    const y1 = group("Output Y1");
    await userEvent.clear(y1.getByLabelText("Output"));
    await userEvent.type(y1.getByLabelText("Output"), "Intrinsic value per share");
    expect(y1.getByText(/Rule 9: public scenario tables show operating figures only/)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("refuses a javascript: link", async () => {
    open();
    await userEvent.type(group("Source S1").getByLabelText("Link (optional)"), "javascript:alert(1)");
    expect(group("Source S1").getByText(/starts with http:\/\/ or https:\/\//)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("refuses to open a sheet with parse errors as a form, and shows the lines", async () => {
    open();
    await toText();
    await userEvent.type(screen.getByLabelText("Facts sheet"), "\nZ1 | ?");
    await toForm();
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot open as a form yet.*Line \d+: Start a row with O, S1, F1/);
    expect(screen.getByRole("radio", { name: "Text sheet" })).toHaveAttribute("aria-checked", "true");
    expect(sheetValue()).toMatch(/Z1 \| \?$/);
  });

  it("names Add and Remove buttons with the row, and will not drop a source still in use", async () => {
    open();
    expect(screen.getByRole("button", { name: "Remove test reading T1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove source S1" }));
    expect(screen.getByRole("alert")).toHaveTextContent("S1 is the source of F1, F2, F3, F4, X1");
    expect(group("Source S1").getByLabelText("Document")).toBeInTheDocument();
  });
});
