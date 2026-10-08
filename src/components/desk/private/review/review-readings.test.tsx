// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingView } from "@/modules/ingestion/client";
import { expectTokenOnly } from "@/test/ui";
import { DOC_ID, kaveri } from "@/test/review-fixtures";
import { ReviewOneAtATime } from "./review-one-at-a-time";

// The "Test readings" section of the review list (Plan 2b Task 8, R4): the machine's reading of a test, ticked by Aksh like a figure,
// filed beside the figures, and never a status.

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), save: vi.fn(), file: vi.fn(), start: vi.fn(), push: vi.fn(), link: vi.fn(), done: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock("@/modules/ingestion/actions", () => ({ resolveFlagAction: mocks.resolve, saveValuesAction: mocks.save, fileUnderAction: mocks.file, setDocumentCompanyAction: mocks.link, markDoneAction: mocks.done }));
vi.mock("@/modules/research/actions", () => ({ startFileAction: mocks.start }));

const ITEM = "11111111-2222-4333-8444-555555555555";
const reading = (id: string, over: Partial<ReadingView> = {}): ReadingView => ({
  id, page: 7, testId: "T1", label: "Receivable days", valueText: "142", unit: "days", period: "FY26", asOf: "2026-03-31", prior: 131, quote: "Receivable days 142 131", status: "pending", basis: null, ...over,
});
const R1 = "00000011-0000-4000-8000-000000000011";
const R2 = "00000012-0000-4000-8000-000000000012";
/** A document whose only flag is already resolved, so the list is on screen at once. */
const listed = (readings: ReadingView[]) => {
  const data = kaveri({ readings });
  return { ...data, flags: [], rows: data.rows.filter((r) => r.flags.length === 0), values: data.values.map((g) => ({ ...g, rows: g.rows.filter((r) => r.flags.length === 0) })).filter((g) => g.rows.length > 0) };
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.save.mockResolvedValue({ ok: true, accepted: 4, edited: 0, rejected: 0 });
  mocks.file.mockResolvedValue({ ok: true, itemId: ITEM, count: 5 });
});

describe("Test readings", () => {
  it("lists each reading under its own heading with what Aksh needs to check it, and says it never touches a status", () => {
    const { container } = render(<ReviewOneAtATime data={listed([reading(R1)])} />);
    const section = screen.getByRole("region", { name: "Test readings" });
    expect(within(section).getByText("T1")).toBeInTheDocument();
    expect(within(section).getByText("Receivable days")).toBeInTheDocument();
    expect(within(section).getByText("142 days")).toBeInTheDocument();
    expect(section).toHaveTextContent("FY26 · as of 31 Mar 2026 · prior 131");
    expect(section).toHaveTextContent("p. 7 · Receivable days 142 131");
    expect(section).toHaveTextContent("A reading sets the test's reading, its date and its prior. Its status stays yours.");
    expect(within(section).getByRole("checkbox", { name: /^T1 Receivable days/ })).toBeChecked();
    expectTokenOnly(container);
  });

  it("says which basis a reading was printed on, beside the period", () => {
    render(<ReviewOneAtATime data={listed([reading(R1, { basis: "consolidated" })])} />);
    expect(screen.getByRole("region", { name: "Test readings" })).toHaveTextContent("FY26 · consolidated · as of 31 Mar 2026 · prior 131");
  });

  it("has no section when there are no readings", () => {
    render(<ReviewOneAtATime data={listed([])} />);
    expect(screen.queryByRole("region", { name: "Test readings" })).toBeNull();
  });

  it("starts a reading Aksh dropped before unticked, and a pending one ticked", () => {
    render(<ReviewOneAtATime data={listed([reading(R1), reading(R2, { testId: "T2", status: "rejected" })])} />);
    expect(screen.getByRole("checkbox", { name: /^T1 / })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^T2 / })).not.toBeChecked();
  });

  it("sends the ticks with the figures' decisions, and names the readings on the file button", async () => {
    render(<ReviewOneAtATime data={listed([reading(R1), reading(R2, { testId: "T2", label: "Gross margin", valueText: "31.4", unit: "%" })])} />);
    expect(screen.getByRole("button", { name: /^File these 4 figures and 2 test readings under Kaveri file/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /^T2 / }));
    expect(screen.getByRole("button", { name: /^File these 4 figures and 1 test reading under Kaveri file/ })).toBeEnabled();
    await userEvent.type(screen.getByLabelText("Filed on"), "2026-05-20");
    await userEvent.click(screen.getByRole("button", { name: /^File these 4 figures and 1 test reading/ }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/desk/items/${ITEM}#facts`));
    expect(mocks.save).toHaveBeenCalledWith(DOC_ID, expect.arrayContaining([{ id: R1, keep: true }, { id: R2, keep: false }]));
    expect(mocks.save.mock.calls[0][1]).toHaveLength(6);
  });

  it("counts readings alone as something to file", async () => {
    const data = { ...listed([reading(R1)]), rows: [], values: [] };
    render(<ReviewOneAtATime data={data} />);
    expect(screen.queryByText(/Nothing to review/)).toBeNull();
    expect(screen.getByRole("button", { name: /^File this test reading under Kaveri file/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /^T1 / }));
    expect(screen.getByRole("button", { name: /^File these 0 figures/ })).toBeDisabled();
  });

  it("offers a reading no edit: the value is read from the page and changed in the Facts form", () => {
    render(<ReviewOneAtATime data={listed([reading(R1)])} />);
    const section = screen.getByRole("region", { name: "Test readings" });
    expect(within(section).queryByRole("button", { name: /^Edit/ })).toBeNull();
  });
});
