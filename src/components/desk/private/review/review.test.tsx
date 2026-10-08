// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalView, ReviewData } from "@/modules/ingestion/client";
import { DOC_ID, kaveri } from "@/test/review-fixtures";
import { ReviewOneAtATime } from "./review-one-at-a-time";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), save: vi.fn(), file: vi.fn(), start: vi.fn(), push: vi.fn(), refresh: vi.fn(), link: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/modules/ingestion/actions", () => ({ resolveFlagAction: mocks.resolve, saveValuesAction: mocks.save, fileUnderAction: mocks.file, setDocumentCompanyAction: mocks.link }));
vi.mock("@/modules/research/actions", () => ({ startFileAction: mocks.start }));

const ITEM = "11111111-2222-4333-8444-555555555555";
const TYPED = (data: ReviewData) => ({ ok: true, view: { ...data.flags[0], status: "edited", valueText: "41.20" } });

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.save.mockResolvedValue({ ok: true, accepted: 3, edited: 1, rejected: 1 });
  mocks.file.mockResolvedValue({ ok: true, itemId: ITEM, count: 4 });
  mocks.start.mockResolvedValue({ ok: true, itemId: ITEM });
});

/** Resolves the one flag by typing 41.20, as Aksh does. */
async function resolve(data: ReviewData) {
  mocks.resolve.mockResolvedValue(TYPED(data));
  await userEvent.click(screen.getByRole("button", { name: "1 Type the value from the page" }));
  await userEvent.type(screen.getByLabelText("Value as printed on the page"), "41.20{Enter}");
  await screen.findByRole("heading", { name: /figures? to file/ });
}

describe("Check 1 of 1", () => {
  it("shows the desk's reading struck through, why it is flagged, and the page line with the matched words marked", () => {
    render(<ReviewOneAtATime data={kaveri()} />);
    const card = screen.getByRole("region", { name: "Check 1 of 1" });
    expect(within(card).getByText("Check 1 of 1")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Finance costs" })).toBeInTheDocument();
    expect(within(card).getByText("41.70").tagName).toBe("S");
    expect(within(card).getByText("The figure 41.70 is not on p. 4.")).toBeInTheDocument();
    const mark = within(card).getByText("Finance costs", { selector: "mark" });
    expect(mark.parentElement).toHaveTextContent("Finance costs 41.20 38.10");
    expect(within(card).getByRole("button", { name: "1 Type the value from the page" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "2 Drop it" })).toBeInTheDocument();
  });

  it("key 1 opens the value field, and Enter sends what was typed", async () => {
    const data = kaveri();
    mocks.resolve.mockResolvedValue(TYPED(data));
    render(<ReviewOneAtATime data={data} />);
    await userEvent.keyboard("1");
    const field = screen.getByLabelText("Value as printed on the page");
    expect(field).toHaveFocus();
    await userEvent.type(field, "41.20{Enter}");
    expect(mocks.resolve).toHaveBeenCalledWith(DOC_ID, data.flags[0].id, { kind: "edit", fields: { valueText: "41.20" } });
  });

  it("key 2 drops the figure; typing a 1 or 2 into the field does not", async () => {
    const data = kaveri();
    mocks.resolve.mockResolvedValue({ ok: true, view: { ...data.flags[0], status: "rejected" } });
    render(<ReviewOneAtATime data={data} />);
    await userEvent.keyboard("1");
    await userEvent.type(screen.getByLabelText("Value as printed on the page"), "2");
    expect(mocks.resolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("heading", { name: "Finance costs" }));
    await userEvent.keyboard("2");
    expect(mocks.resolve).toHaveBeenCalledWith(DOC_ID, data.flags[0].id, { kind: "reject" });
    expect(await screen.findByText("4 accepted · 0 edited · 1 rejected")).toBeInTheDocument();
  });

  it("answers keys 1 and 2 only while focus is in the card (WCAG 2.1.4)", async () => {
    const data = kaveri();
    render(
      <>
        <button>elsewhere</button>
        <ReviewOneAtATime data={data} />
      </>,
    );
    expect(screen.getByRole("region", { name: "Check 1 of 1" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    await userEvent.keyboard("12");
    expect(screen.queryByLabelText("Value as printed on the page")).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("asks for the year and unit when the page did not give them", async () => {
    const data = kaveri();
    const flag = { ...data.flags[0], flags: ["period_unknown", "unit_unknown"] as ProposalView["flags"], period: "", unit: "", why: [] };
    render(<ReviewOneAtATime data={{ ...data, flags: [flag], rows: data.rows.map((r) => (r.id === flag.id ? flag : r)) }} />);
    await userEvent.click(screen.getByRole("button", { name: "1 Type the value from the page" }));
    await userEvent.type(screen.getByLabelText("Value as printed on the page"), "41.20");
    await userEvent.type(screen.getByLabelText("Year, for example FY26"), "FY26");
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "₹ cr");
    mocks.resolve.mockResolvedValue(TYPED(data));
    await userEvent.click(screen.getByRole("button", { name: "Save value" }));
    expect(mocks.resolve).toHaveBeenCalledWith(DOC_ID, flag.id, { kind: "edit", fields: { valueText: "41.20", unit: "₹ cr", period: "FY26" } });
  });

  it("keeps the card and says why when the server refuses", async () => {
    const data = kaveri();
    mocks.resolve.mockResolvedValue({ ok: false, code: "figure-incomplete", message: "Add the period, the as-of date and the unit." });
    render(<ReviewOneAtATime data={data} />);
    await userEvent.keyboard("1");
    await userEvent.type(screen.getByLabelText("Value as printed on the page"), "41.20{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Add the period, the as-of date and the unit.");
    expect(screen.getByRole("region", { name: "Check 1 of 1" })).toBeInTheDocument();
  });
});

describe("the values list", () => {
  it("opens after the last flag with the figures ticked, an Edit control per row and the file button", async () => {
    const data = kaveri();
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    expect(screen.getByRole("heading", { name: "All checked. 5 figures to file" })).toHaveFocus();
    for (const name of [/^Revenue from operations/, /^Finance costs/, /^Profit for the year/, /^Total borrowings/, /^Cash and cash equivalents/]) {
      expect(screen.getByRole("checkbox", { name })).toBeChecked();
    }
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(5);
    expect(screen.getByRole("region", { name: "P&L" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Balance sheet" })).toBeInTheDocument();
    expect(screen.getByText("You typed 41.20; the desk read 41.70.")).toBeInTheDocument();
    expect(screen.getByText("4 accepted · 1 edited · 0 rejected")).toBeInTheDocument();
  });

  it("counts an untick as rejected and puts the count in the button", async () => {
    const data = kaveri();
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Profit for the year/ }));
    expect(screen.getByText("3 accepted · 1 edited · 1 rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File these 4 figures under Kaveri file" })).toBeEnabled();
  });

  it("edits a row's value and says what the desk read", async () => {
    const data = kaveri();
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    await userEvent.click(screen.getByRole("button", { name: "Edit Revenue from operations" }));
    const field = screen.getByLabelText("Value for Revenue from operations");
    await userEvent.clear(field);
    await userEvent.type(field, "1,248.00{Enter}");
    expect(screen.getByText("You typed 1,248.00; the desk read 1,284.00.")).toBeInTheDocument();
    expect(screen.getByText("3 accepted · 2 edited · 0 rejected")).toBeInTheDocument();
  });

  it("shows the page text beside the list on desktop and under a row, on demand, on a phone", async () => {
    const data = kaveri();
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    const aside = screen.getByRole("complementary", { name: "Page text" });
    expect(aside).toHaveClass("hidden", "desk:block");
    expect(aside).toHaveTextContent("Revenue from operations 1,284.00 1,102.00");
    const row = screen.getByRole("checkbox", { name: /^Total borrowings/ }).closest("li")!;
    expect(within(row).queryByLabelText("Text of page 5")).toBeNull();
    await userEvent.click(within(row).getByRole("button", { name: "Page 5 text for Total borrowings" }));
    const inline = within(row).getByLabelText("Text of page 5");
    expect(inline.parentElement).toHaveClass("desk:hidden");
    expect(within(inline).getByText("Total borrowings", { selector: "mark" })).toBeInTheDocument();
    expect(within(aside).getByLabelText("Text of page 5")).toBeInTheDocument();
  });
});

describe("File under", () => {
  it("confirms the source (type, filed on, link), saves the ticks, files under the company's file and opens its Facts", async () => {
    const data = kaveri();
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Profit for the year/ }));
    const form = screen.getByRole("form", { name: "File under" });
    expect(within(form).getByLabelText("Type")).toHaveValue("Annual report");
    expect(within(form).getByLabelText("Filed on")).toBeRequired();
    expect(within(form).getByLabelText("Public link (optional)")).not.toBeRequired();

    await userEvent.click(screen.getByRole("button", { name: "File these 4 figures under Kaveri file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add the date the document was filed.");
    expect(mocks.save).not.toHaveBeenCalled();

    await userEvent.type(within(form).getByLabelText("Filed on"), "2026-05-20");
    await userEvent.type(within(form).getByLabelText("Public link (optional)"), "https://example.com/ar.pdf");
    await userEvent.click(screen.getByRole("button", { name: "File these 4 figures under Kaveri file" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/desk/items/${ITEM}#facts`));

    const profit = data.rows.find((r) => r.label === "Profit for the year")!;
    expect(mocks.save).toHaveBeenCalledWith(DOC_ID, expect.arrayContaining([{ id: profit.id, keep: false }, { id: data.flags[0].id, keep: true }]));
    expect(mocks.save.mock.calls[0][1]).toHaveLength(5);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.file).toHaveBeenCalledWith(DOC_ID, { itemId: ITEM, title: "Annual report 2025-26", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: "https://example.com/ar.pdf" });
  });

  it("with no file, 'Start a file for Kaveri Fixtures' starts it and then files", async () => {
    const data = kaveri({ target: null });
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    expect(screen.getByText(/Kaveri Fixtures has no file yet/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Filed on"), "2026-05-20");
    await userEvent.click(screen.getByRole("button", { name: "Start a file for Kaveri Fixtures" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/desk/items/${ITEM}#facts`));
    expect(mocks.start).toHaveBeenCalledWith(data.document.companyId);
    expect(mocks.file).toHaveBeenCalledWith(DOC_ID, expect.objectContaining({ itemId: ITEM }));
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.start.mock.invocationCallOrder[0]);
  });

  it("stops and says why when saving the ticks fails, and does not start a file", async () => {
    const data = kaveri({ target: null });
    mocks.save.mockResolvedValue({ ok: false, code: "save-failed", message: "Could not save. Try again." });
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    await userEvent.type(screen.getByLabelText("Filed on"), "2026-05-20");
    await userEvent.click(screen.getByRole("button", { name: "Start a file for Kaveri Fixtures" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("has nothing to file when every figure is unticked", async () => {
    const data = kaveri();
    render(<ReviewOneAtATime data={data} />);
    await resolve(data);
    for (const box of screen.getAllByRole("checkbox")) await userEvent.click(box);
    expect(screen.getByRole("button", { name: /^File these 0 figures/ })).toBeDisabled();
    expect(screen.getByText("Tick at least one figure to file.")).toBeInTheDocument();
  });

  describe("a document with no company", () => {
    const noCompany = () => {
      const data = kaveri();
      return { ...data, flags: [], rows: data.rows.filter((r) => r.flags.length === 0), document: { ...data.document, companyId: null, companyName: null }, target: null };
    };
    const companies = [{ id: "c1", symbol: "KAVERI" }, { id: "c2", symbol: "ACME" }];

    it("offers the existing companies instead of the file button, and links the one chosen", async () => {
      mocks.link.mockResolvedValue({ ok: true });
      render(<ReviewOneAtATime data={noCompany()} companies={companies} />);
      expect(screen.getByText("This document is not linked to a company, so there is no file to put its figures in.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /file/i })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Link to this company" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Choose the company this document is about.");
      await userEvent.selectOptions(screen.getByLabelText("Company"), "$KAVERI");
      await userEvent.click(screen.getByRole("button", { name: "Link to this company" }));
      expect(mocks.link).toHaveBeenCalledWith(DOC_ID, "c1");
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });

    it("says why when linking fails, and tells him how to get a company when none exists", async () => {
      mocks.link.mockResolvedValue({ ok: false, code: "invalid-input", message: "Check the fields and try again." });
      const { unmount } = render(<ReviewOneAtATime data={noCompany()} companies={companies} />);
      await userEvent.selectOptions(screen.getByLabelText("Company"), "$ACME");
      await userEvent.click(screen.getByRole("button", { name: "Link to this company" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Check the fields and try again.");
      expect(mocks.refresh).not.toHaveBeenCalled();
      unmount();
      render(<ReviewOneAtATime data={noCompany()} companies={[]} />);
      expect(screen.getByText(/No company exists yet/)).toBeInTheDocument();
    });

    it("once linked the page carries on to the normal File under", () => {
      const data = noCompany();
      render(<ReviewOneAtATime data={{ ...data, document: { ...data.document, companyId: "c1", companyName: "Kaveri Fixtures" }, target: kaveri().target }} />);
      expect(screen.getByRole("button", { name: /^File these 4 figures under Kaveri file/ })).toBeEnabled();
    });
  });
});

describe("with nothing to check", () => {
  it("goes straight to the values list when no figure is flagged", () => {
    const data = kaveri();
    const clean = data.rows.filter((r) => r.flags.length === 0);
    render(<ReviewOneAtATime data={{ ...data, flags: [], rows: clean }} />);
    expect(screen.queryByText(/^Check \d of/)).toBeNull();
    expect(screen.getByRole("heading", { name: "4 figures to file" })).toBeInTheDocument();
  });
  it("says there is nothing to review when no figure is waiting", () => {
    render(<ReviewOneAtATime data={kaveri({ flags: [], rows: [], values: [] })} />);
    expect(screen.getByText(/Nothing to review/)).toBeInTheDocument();
  });
});
