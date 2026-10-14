// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { proposedFactSchema, type StagedReading, type StagedRow } from "@/modules/ingestion/client";
import { machine, machineReading } from "@/test/fakes/review-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { RevisionEditor } from "../revision-editor";

// Staged test readings in the editor (Plan 2b Task 8, R4): they fill a test row's reading fields, say where they came from, travel in
// the hidden field by their own name, and never move the status.

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);
const DOC = { id: "d1", title: "Annual report 2026-27", sourceType: "Annual report" as const, filedOn: "2027-05-20", sourceUrl: null, status: "active" as const };
const NEXT = { current: 158, readingAsOf: "2027-03-31", prior: 142, valueText: "158" };
const reading = (id: string, over: Parameters<typeof machineReading>[0] = NEXT, testId = "T1", document = DOC): StagedReading => ({ proposalId: id, testId, value: machineReading(over), document });
const open = (props: Partial<React.ComponentProps<typeof RevisionEditor>> = {}) =>
  render(<RevisionEditor action={vi.fn()} bodyMd={bodyMd} sheet={canonical} figuresTo="2026-01-31" stagedReadings={[reading("r1")]} {...props} />);
const hidden = () => {
  const el = document.querySelector<HTMLInputElement>('input[name="provenance"]');
  return el ? JSON.parse(el.value) : null;
};
const t1 = () => within(screen.getByRole("group", { name: "Test reading T1" }));

describe("staged test readings in the editor", () => {
  it("fills the test's reading, its date and its prior, and leaves the status and the line alone", () => {
    open();
    expect(t1().getByLabelText("Reading (blank if none)")).toHaveValue("158");
    expect(t1().getByLabelText("Reading date")).toHaveValue("2027-03-31");
    expect(t1().getByLabelText("Prior reading")).toHaveValue("142");
    expect(t1().getByLabelText("Status")).toHaveValue("watching");
    expect(t1().getByLabelText("Threshold")).toHaveValue("150");
    expect(t1().getByLabelText("Last checked")).toHaveValue("2026-08-20");
    expect(screen.getByText("Receivable days stay above 150 for two straight years.")).toBeInTheDocument();
  });

  it("says where the reading came from on the test row, and what the banner will and will not do", () => {
    open();
    expect(within(screen.getByRole("group", { name: "Test reading T1" })).getByTestId("staged-note")).toHaveTextContent("Reading from Annual report 2026-27, p. 7");
    expect(screen.getByTestId("staged-banner")).toHaveTextContent("1 test reading from Annual report 2026-27 is staged below. It sets the reading, its date and the prior; the status stays yours.");
  });

  it("names the staged reading in the hidden field, apart from the figures", () => {
    open();
    expect(hidden()).toEqual({ staged: [], provenance: [], stagedReadings: [{ testId: "T1", proposalId: "r1" }] });
  });

  it("carries figures and readings together", () => {
    const figure: StagedRow = { proposalId: "p1", status: "accepted", document: DOC, value: proposedFactSchema.parse(machine({ label: "Total borrowings", value: 310, valueText: "310.00" })) };
    open({ staged: [figure] });
    expect(hidden()).toMatchObject({ staged: ["p1"], provenance: [{ factId: "F5", proposalId: "p1" }], stagedReadings: [{ testId: "T1", proposalId: "r1" }] });
  });

  it("keeps the reading in the field when its test row is removed, so the server sends it back to review", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Remove test reading T1" }));
    expect(hidden()?.stagedReadings).toEqual([{ testId: "T1", proposalId: "r1" }]);
    expect(screen.queryByText(/is staged below/)).toBeNull();
  });

  it("leaves a reading for a test the file lacks, or one that is not newer, staged and says so", () => {
    open({ stagedReadings: [reading("old", { current: 100, readingAsOf: "2025-03-31", valueText: "100" }), reading("none", NEXT, "T9")] });
    expect(hidden()).toBeNull();
    expect(screen.getByTestId("staged-banner")).toHaveTextContent("2 more test readings from Annual report 2026-27 are not shown: the file has no such test, or the test already has a reading as new or newer.");
    expect(t1().getByLabelText("Reading (blank if none)")).toHaveValue("142");
  });

  it("shows the change in the text sheet, and sends nothing when the sheet does not parse", async () => {
    const { unmount } = open();
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    expect((screen.getByLabelText("Facts sheet") as HTMLTextAreaElement).value).toContain("T1 | 158 | days | 2027-03-31 | 2026-08-20 | watching | 60 | 200 | 150 | above | 142");
    unmount();
    open({ sheet: "Z1 | ?" });
    expect(screen.getByText("Fix the text sheet to see the 1 staged test reading from Annual report 2026-27.")).toBeInTheDocument();
    expect(hidden()).toBeNull();
  });

  it("sends the document's staged items back to its review screen", async () => {
    const sendBack = vi.fn(async () => ({ ok: true as const }));
    open({ sendBack });
    await userEvent.click(screen.getByRole("button", { name: "Send back to review" }));
    expect(sendBack).toHaveBeenCalledWith("d1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/desk/inbox/d1/review"));
  });

  it("has no banner and no field when no reading is staged", () => {
    open({ stagedReadings: [] });
    expect(hidden()).toBeNull();
    expect(screen.queryByTestId("staged-banner")).toBeNull();
  });
});
