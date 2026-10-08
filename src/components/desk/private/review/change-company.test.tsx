// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOC_ID, kaveri } from "@/test/review-fixtures";
import { ReviewOneAtATime } from "./review-one-at-a-time";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), link: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock("@/modules/ingestion/actions", () => ({ resolveFlagAction: vi.fn(), saveValuesAction: vi.fn(), fileUnderAction: vi.fn(), setDocumentCompanyAction: mocks.link, markDoneAction: vi.fn() }));
vi.mock("@/modules/research/actions", () => ({ startFileAction: vi.fn() }));

const companies = [{ id: "c1", symbol: "KAVERI" }, { id: "c2", symbol: "ACME" }];
const linked = () => {
  const data = kaveri();
  return { ...data, document: { ...data.document, companyId: "c1", companyName: "Kaveri Fixtures" } };
};

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.link.mockReset();
});

describe("Change company on the review screen", () => {
  it("moves a wrongly linked document to another company, offering every company but the current one", async () => {
    mocks.link.mockResolvedValue({ ok: true });
    render(<ReviewOneAtATime data={linked()} companies={companies} />);
    await userEvent.click(screen.getByRole("button", { name: "Change company" }));
    expect(screen.getByText("This document is linked to Kaveri Fixtures. Choose the right company if that was a mistake.")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "$KAVERI" })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Company"), "$ACME");
    await userEvent.click(screen.getByRole("button", { name: "Move to this company" }));
    expect(mocks.link).toHaveBeenCalledWith(DOC_ID, "c2");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Change company" })).toBeInTheDocument();
  });

  it("says why when the server refuses, and cancel closes the chooser", async () => {
    mocks.link.mockResolvedValue({ ok: false, code: "company-locked", message: "Some of this document's figures are already in its company's file, so the company cannot be changed." });
    render(<ReviewOneAtATime data={linked()} companies={companies} />);
    await userEvent.click(screen.getByRole("button", { name: "Change company" }));
    await userEvent.selectOptions(screen.getByLabelText("Company"), "$ACME");
    await userEvent.click(screen.getByRole("button", { name: "Move to this company" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Some of this document's figures are already in its company's file");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Change company" })).toBeInTheDocument();
  });

  it("is not offered on a done or skipped document", () => {
    const data = linked();
    render(<ReviewOneAtATime data={{ ...data, document: { ...data.document, status: "done" } }} companies={companies} />);
    expect(screen.queryByRole("button", { name: "Change company" })).toBeNull();
  });
});
