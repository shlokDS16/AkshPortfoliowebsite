// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { expectTokenOnly } from "@/test/ui";
import { RevisionEditor } from "../revision-editor";
import { draftToSheet, nextId, toDraft } from "./draft";
import { rowErrors } from "./validate";

const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);

const open = (action = vi.fn(), body = bodyMd, text = canonical) => ({ action, ...render(<RevisionEditor action={action} bodyMd={body} sheet={text} figuresTo="2026-01-31" />) });
const toText = () => userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
const toForm = () => userEvent.click(screen.getByRole("radio", { name: "Form" }));
const group = (name: string) => within(screen.getByRole("group", { name }));
const sheetValue = () => (screen.getByLabelText("Facts sheet") as HTMLTextAreaElement).value;
const save = () => screen.getByRole("button", { name: "Save revision" });

describe("Facts form draft", () => {
  it("writes the seeded Kaveri file back through casefile's serializer unchanged", () => {
    expect(draftToSheet(toDraft(parseFactsSheet(sheet).caseFile))).toBe(canonical);
  });

  it("takes new ids past the high-water mark, never reusing one", () => {
    expect(nextId("F", ["F1", "F2"])).toBe("F3");
    expect(nextId("F", ["F1", "F4", "S9", "X7"])).toBe("F5");
    expect(nextId("X", [])).toBe("X1");
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

  it("never gives a removed, cited fact's id to a new row", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Remove fact F4" }));
    await userEvent.click(screen.getByRole("button", { name: "Add fact" }));
    expect(screen.queryByRole("group", { name: "Fact F4" })).toBeNull();
    expect(screen.getByRole("group", { name: "Fact F5" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The body cites [F4]");
  });

  it("moves focus to the new row on Add, and to the next row or the Add button on Remove", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Add fact" }));
    expect(document.activeElement).toBe(group("Fact F5").getByLabelText("Metric"));
    await userEvent.click(screen.getByRole("button", { name: "Remove fact F2" }));
    expect(document.activeElement).toBe(group("Fact F3").getByLabelText("Metric"));
    await userEvent.click(screen.getByRole("button", { name: "Remove exhibit X1" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add exhibit" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove output Y2" }));
    expect(document.activeElement).toBe(group("Output Y1").getByLabelText("Output"));
  });

  it("checks citations in Text sheet mode too, whenever the text parses", async () => {
    open();
    await toText();
    fireEvent.change(screen.getByLabelText("Facts sheet"), { target: { value: canonical.replace(/^F3 \|.*\n/m, "") } });
    expect(screen.getByRole("alert")).toHaveTextContent("The body cites [F3]");
  });

  it("holds the save only for newly broken citations; ones broken at load only warn", async () => {
    const { action } = open(vi.fn(), `${bodyMd}\nSee also [F9].`);
    expect(screen.getByRole("alert")).toHaveTextContent("already cited [F9]");
    await userEvent.click(save());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("holds the save for a citation the body newly breaks, then saves on the second press", async () => {
    const { action } = open();
    await userEvent.type(screen.getByLabelText("Body (Markdown)"), " See [[F9].");
    await userEvent.click(save());
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The body cites [F9]");
    expect(screen.getByRole("alert")).toHaveTextContent("Press Save revision again");
    await userEvent.click(save());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(String((action.mock.calls[0][0] as FormData).get("bodyMd"))).toMatch(/See \[F9\]\.$/);
  });

  it("refuses Form to Text while a field is marked, and clears a Text to Form refusal once the text changes", async () => {
    open();
    await userEvent.clear(group("Fact F1").getByLabelText("Metric"));
    await toText();
    expect(screen.getByRole("alert")).toHaveTextContent("One field needs fixing before the facts can turn into the text sheet");
    expect(screen.getByRole("radio", { name: "Form" })).toHaveAttribute("aria-checked", "true");
    await userEvent.type(group("Fact F1").getByLabelText("Metric"), "Revenue");
    await toText();
    await userEvent.type(screen.getByLabelText("Facts sheet"), "\nZ1 | ?");
    await toForm();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot open as a form yet");
    await userEvent.type(screen.getByLabelText("Facts sheet"), "{backspace}");
    expect(screen.queryByText(/cannot open as a form yet/)).toBeNull();
  });

  it("hides Add at the schema's cap with a short note", () => {
    const cf = parseFactsSheet(sheet).caseFile;
    const full = { ...cf, exhibits: [1, 2, 3, 4, 5, 6].map((n) => ({ ...cf.exhibits[0], id: `X${n}` })) };
    open(vi.fn(), bodyMd, serializeFactsSheet(full));
    expect(screen.queryByRole("button", { name: "Add exhibit" })).toBeNull();
    expect(screen.getByText("That is the most a file can hold: 6 exhibits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove the last scenario (scenario 3)" })).toBeInTheDocument();
  });

  it("keeps typed values, selects included, after the form action resolves (a failed save redirects back)", async () => {
    const action = vi.fn(async () => {});
    open(action);
    await userEvent.clear(group("Fact F1").getByLabelText("Metric"));
    await userEvent.type(group("Fact F1").getByLabelText("Metric"), "Net revenue");
    await userEvent.selectOptions(group("Source S1").getByLabelText("Type"), "Filing");
    await userEvent.selectOptions(group("Test reading T1").getByLabelText("Status"), "met");
    expect(group("Source S1").getByLabelText("Type")).toHaveValue("Filing");
    await userEvent.type(screen.getByLabelText("Body (Markdown)"), " One more line.");
    await userEvent.type(screen.getByLabelText("Change reason"), "typed");
    await userEvent.click(save());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(group("Fact F1").getByLabelText("Metric")).toHaveValue("Net revenue");
    expect(group("Source S1").getByLabelText("Type")).toHaveValue("Filing");
    expect(group("Test reading T1").getByLabelText("Status")).toHaveValue("met");
    expect(screen.getByLabelText("Body (Markdown)")).toHaveValue(`${bodyMd} One more line.`);
    expect(screen.getByLabelText("Change reason")).toHaveValue("typed");
    await toText();
    expect(sheetValue()).toMatch(/^F1 \| Net revenue \|/m);
  });
});

describe("Facts form topics (E10): lossless both ways", () => {
  const cf0 = parseFactsSheet(sheet).caseFile;
  const TOPIC: Record<string, string> = { F1: "P&L", F2: "P&L", F3: "Working capital" };
  const topical = serializeFactsSheet({ ...cf0, facts: cf0.facts.map((f) => ({ ...f, topic: TOPIC[f.id] ?? null })) });
  const hidden = (c: HTMLElement) => (c.querySelector('input[name="factsSheet"]') as HTMLInputElement).value;
  const topic = (id: string) => group(`Fact ${id}`).getByLabelText("Topic (optional)");

  it("writes a typed topic as a G row, and the Form save sends it", async () => {
    const { action, container } = open();
    await userEvent.type(topic("F2"), "Working capital");
    expect(hidden(container)).toMatch(/^G \| Working capital \| F2$/m);
    await userEvent.click(save());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(String((action.mock.calls[0][0] as FormData).get("factsSheet"))).toMatch(/^G \| Working capital \| F2$/m);
  });

  it("opens a sheet saved in Text mode with topics, offers them as suggestions, and saves them unchanged from the Form", async () => {
    const { action } = open(vi.fn(), bodyMd, topical);
    expect(topic("F3")).toHaveValue("Working capital");
    expect(topic("F4")).toHaveValue("");
    expect(topic("F1")).toHaveAttribute("list", "ff-topics");
    const options = [...document.querySelectorAll("datalist#ff-topics option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["P&L", "Working capital"]);
    await userEvent.click(save());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0][0] as FormData).get("factsSheet")).toBe(topical);
  });

  it("keeps topics typed in Text mode through Form and back to Text", async () => {
    open();
    await toText();
    fireEvent.change(screen.getByLabelText("Facts sheet"), { target: { value: topical } });
    await toForm();
    expect(topic("F1")).toHaveValue("P&L");
    await userEvent.type(topic("F4"), "Working capital");
    await toText();
    expect(sheetValue()).toContain("G | P&L | F1 F2\nG | Working capital | F3 F4");
  });

  it("marks a topic over 40 characters, or holding a | or a tab, and blocks Save", async () => {
    open();
    fireEvent.change(topic("F1"), { target: { value: "x".repeat(41) } });
    expect(group("Fact F1").getByText("Keep the topic under 40 characters.")).toBeInTheDocument();
    expect(topic("F1")).toHaveAttribute("aria-invalid", "true");
    expect(save()).toBeDisabled();
    fireEvent.change(topic("F1"), { target: { value: "x".repeat(40) } });
    expect(save()).toBeEnabled();
    for (const bad of ["P|L", "P\tL"]) {
      fireEvent.change(topic("F1"), { target: { value: bad } });
      expect(group("Fact F1").getByText(/Take out the \| character/)).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
  });

  it("lists Notes as a source type", () => {
    open();
    expect(within(group("Source S1").getByLabelText("Type")).getByRole("option", { name: "Notes" })).toBeInTheDocument();
  });
});
