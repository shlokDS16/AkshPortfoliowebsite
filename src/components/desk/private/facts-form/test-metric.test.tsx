// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { RevisionEditor } from "../revision-editor";

// "Metric to watch" (Plan 2b Task 8, R24): the test row names one of the file's fact labels; the sheet carries it as an M row.
const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);
const open = (text = canonical) => render(<RevisionEditor action={vi.fn()} bodyMd={bodyMd} sheet={text} figuresTo="2026-01-31" />);
const group = (name: string) => within(screen.getByRole("group", { name }));
const toText = () => userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
const sheetValue = () => (screen.getByLabelText("Facts sheet") as HTMLTextAreaElement).value;

describe("Metric to watch", () => {
  it("offers no metric by default and lists each of the file's fact labels once", () => {
    open();
    const select = group("Test reading T1").getByLabelText("Metric to watch");
    expect(select).toHaveValue("");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["None", "Revenue from operations", "Gross margin", "Receivable days", "Order book"]);
  });

  it("writes the choice as an M row of the sheet and nothing else changes", async () => {
    open();
    await userEvent.selectOptions(group("Test reading T1").getByLabelText("Metric to watch"), "Receivable days");
    await toText();
    const t2 = canonical.split("\n").find((l) => l.startsWith("T2 |"))!;
    expect(sheetValue()).toBe(canonical.replace(t2, `${t2}\nM | T1 | Receivable days`));
  });

  it("keeps a metric the sheet already has, even when no fact carries that label any more", () => {
    const text = `${canonical}\nM | T2 | Operating margin`;
    open(text);
    const select = group("Test reading T2").getByLabelText("Metric to watch");
    expect(select).toHaveValue("Operating margin");
    expect(within(select).getByRole("option", { name: "Operating margin" })).toBeInTheDocument();
  });

  it("goes back to no metric when None is chosen", async () => {
    open(`${canonical}\nM | T1 | Gross margin`);
    await userEvent.selectOptions(group("Test reading T1").getByLabelText("Metric to watch"), "None");
    await toText();
    expect(sheetValue()).not.toMatch(/^M \| T1/m);
  });
});
