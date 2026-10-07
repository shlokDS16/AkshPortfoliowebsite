// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentListItem } from "@/modules/documents/client";
import { DocLayout } from "./doc-layout";
import { DocWorkspace, OpenDocumentButton } from "./workspace";

vi.mock("@/modules/documents/actions", () => ({
  readPageAction: vi.fn().mockResolvedValue({ ok: true, text: "page text", pageCount: 2, kind: null }),
  searchPagesAction: vi.fn().mockResolvedValue([]),
  checkQuotesAction: vi.fn().mockResolvedValue([]),
}));

const DOC: DocumentListItem = { id: "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e", title: "Annual report", pageCount: 2, filedOn: null, sourceUrl: null, sourceType: "Annual report" };

function setRail(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
}

const page = () => (
  <DocWorkspace documents={[DOC]} company="$KAVPUMP">
    <OpenDocumentButton />
    <DocLayout
      gate={
        <aside id="gate">
          <label>
            <input type="checkbox" /> Rule 4 ticked
          </label>
        </aside>
      }
    >
      <p>editor</p>
    </DocLayout>
  </DocWorkspace>
);

beforeEach(() => setRail(true));

describe("DocLayout on a wide screen", () => {
  it("keeps the publishing checklist mounted (its tick survives) while the document is open and shut", async () => {
    render(page());
    const tick = screen.getByRole("checkbox", { name: "Rule 4 ticked" });
    await userEvent.click(tick);
    expect(tick).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Open a document" }));
    expect(await screen.findByRole("complementary", { name: "Document" })).toBeInTheDocument();
    expect(document.getElementById("gate")).toBeInTheDocument();
    expect(document.getElementById("gate")?.closest(".hidden")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Close the document" }));
    const back = screen.getByRole("checkbox", { name: "Rule 4 ticked" });
    expect(back).toBe(tick);
    expect(back).toBeChecked();
    expect(screen.queryByRole("complementary", { name: "Document" })).not.toBeInTheDocument();
  });
});
