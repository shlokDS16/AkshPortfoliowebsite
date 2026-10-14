// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { ADD_SOURCE_EVENT, type AddSourceDetail } from "../add-source-event";
import { DocWorkspace, useDocWorkspace } from "../doc-pane/workspace";
import { RevisionEditor } from "../revision-editor";

const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);
const open = (text = canonical) => render(<RevisionEditor action={vi.fn()} bodyMd={bodyMd} sheet={text} figuresTo="2026-01-31" />);
const send = (detail: AddSourceDetail) => act(() => void window.dispatchEvent(new CustomEvent(ADD_SOURCE_EVENT, { detail })));
const group = (name: string) => within(screen.getByRole("group", { name }));
const DOC: AddSourceDetail = { doc: "Investor deck Q1", type: "Presentation", filedOn: "2026-08-01", url: "https://example.com/deck.pdf" };

describe("Facts form: the document pane's Use as source", () => {
  it("adds a source row with the next free S id and the document's details", () => {
    open();
    send(DOC);
    const s2 = group("Source S2");
    expect(s2.getByLabelText("Document")).toHaveValue("Investor deck Q1");
    expect(s2.getByLabelText("Type")).toHaveValue("Presentation");
    expect(s2.getByLabelText("Filed on")).toHaveValue("2026-08-01");
    expect(s2.getByLabelText("Link (optional)")).toHaveValue("https://example.com/deck.pdf");
  });

  it("reuses a source with the same title (any case) and filed-on date instead of adding another", () => {
    open();
    send({ ...DOC, doc: "  annual REPORT 2025-26 (fictional seed data)", type: "Annual report", filedOn: "2026-07-12" });
    expect(screen.queryByRole("group", { name: "Source S2" })).not.toBeInTheDocument();
    send(DOC);
    send({ ...DOC, doc: "investor deck q1" });
    expect(screen.getAllByRole("group", { name: /^Source S\d+$/ })).toHaveLength(2);
  });

  it("adds a second row when only the date differs, and never reuses a removed row's id", async () => {
    open();
    send(DOC);
    send({ ...DOC, filedOn: "2026-09-01" });
    expect(screen.getByRole("group", { name: "Source S3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove source S3" }));
    send({ ...DOC, filedOn: "2026-10-01" });
    expect(screen.getByRole("group", { name: "Source S4" })).toBeInTheDocument();
  });

  it("from the Text sheet: opens the form with the source added, and the text sheet gets it back", async () => {
    open();
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    send(DOC);
    expect(screen.getByRole("radio", { name: "Form" })).toHaveAttribute("aria-checked", "true");
    expect(group("Source S2").getByLabelText("Document")).toHaveValue("Investor deck Q1");
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    expect((screen.getByLabelText("Facts sheet") as HTMLTextAreaElement).value).toContain("S2 | Investor deck Q1 | Presentation | 2026-08-01");
  });

  it("cancels the event when the row is in the form, and leaves it alone when the sheet could not be opened", async () => {
    const fire = () => window.dispatchEvent(new CustomEvent(ADD_SOURCE_EVENT, { detail: DOC, cancelable: true }));
    const first = open();
    let handled = false;
    act(() => void (handled = !fire()));
    expect(handled).toBe(true); // added
    act(() => void (handled = !fire()));
    expect(handled).toBe(true); // reused row: still handled
    first.unmount();
    open(`${canonical}\nQ | not a row`);
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    act(() => void (handled = !fire()));
    expect(handled).toBe(false);
  });

  it("does not touch a text sheet that does not parse, and says why", async () => {
    open(`${canonical}\nQ | not a row`);
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    send(DOC);
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot open as a form yet/);
    expect(screen.getByLabelText("Facts sheet")).toBeInTheDocument();
  });

  it("publishes its facts to the pane's workspace, quote and source name as typed", async () => {
    function Spy() {
      const facts = useDocWorkspace()?.facts ?? [];
      const f1 = facts.find((f) => f.id === "F1");
      return <output aria-label="published">{f1 ? `${f1.doc} | ${f1.locator} | ${f1.quote}` : "none"}</output>;
    }
    render(
      <DocWorkspace documents={[]} company={null}>
        <Spy />
        <RevisionEditor action={vi.fn()} bodyMd={bodyMd} sheet={canonical} figuresTo="2026-01-31" />
      </DocWorkspace>,
    );
    expect(screen.getByLabelText("published")).toHaveTextContent("Annual report 2025-26 (fictional seed data) | p. 131 | Revenue from operations rose to");
    const quote = group("Fact F1").getByLabelText("Quoted line (optional)");
    await userEvent.clear(quote);
    await userEvent.type(quote, "Revenue from operations 1,284.00");
    expect(screen.getByLabelText("published")).toHaveTextContent("p. 131 | Revenue from operations 1,284.00");
  });
});
