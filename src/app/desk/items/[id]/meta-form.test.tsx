// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/modules/research";

vi.mock("@/modules/research/actions", () => ({ updateItemMetaAction: vi.fn() }));
import { MetaForm } from "./meta-form";

const item: Item = {
  id: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10", kind: "case_study", slug: null, title: "A closed idea", companyId: null, themeId: null,
  visibility: "private", status: "draft", currentRevisionId: null, publishedAt: null, dataAsOf: "2026-06-16", learningObjective: null,
  holdsPosition: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
};

describe("the details form", () => {
  it("shows Figures to read-only, with the sentence, on a case study from the ledger", () => {
    render(<MetaForm item={item} figuresToFromLedger />);
    expect(screen.queryByLabelText("Figures to")).toBeNull();
    expect(document.querySelector('input[name="dataAsOf"]')).toBeNull();
    expect(screen.getByText("Figures to")).toBeInTheDocument();
    expect(screen.getByText("16 Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("Set from the ledger. Refresh from the ledger moves it.")).toBeInTheDocument();
  });

  it("keeps the date input everywhere else", () => {
    render(<MetaForm item={{ ...item, kind: "thesis" }} figuresToFromLedger={false} />);
    expect(screen.getByLabelText("Figures to")).toHaveValue("2026-06-16");
  });
});
