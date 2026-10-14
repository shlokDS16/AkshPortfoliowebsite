// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pagesNotSortedText } from "@/lib/messages";
import { trayFor, type DocState } from "@/modules/ingestion";
import { actionsMock, doc } from "@/test/inbox-fixtures";
import { DocumentCard } from "./document-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));
vi.mock("../desk-queue", () => ({ detectSource: () => "web" }));
vi.mock("@/modules/ingestion/actions", () => ({
  skipStepAction: vi.fn(), retryStepAction: vi.fn(), skipDocumentAction: vi.fn(), markTranscriptSavedAction: vi.fn(), discardTranscriptAction: vi.fn(),
}));

// Live smoke S3: a classifier batch that was let go shows on the card, in the sentence the card already prints.
const state = (unsortedPages: number): DocState => ({
  status: "active", pageCount: 80, pagesRead: 80, scanPages: 0, aiOn: true, pending: 2, flagged: 0, decided: 0, unsortedPages,
  steps: [{ kind: "classify_pages", status: "done", notBefore: "2026-10-08T05:00:00.000Z", waitReason: null, pageNo: 1, lastError: null, everClaimed: true }],
});

describe("DocumentCard when the classifier let a batch go", () => {
  it("prints how many pages could not be sorted, beside the figures count", () => {
    const view = trayFor(state(7), new Date("2026-10-08T05:30:00Z"), null);
    render(<DocumentCard doc={doc({ title: "Annual report", pending: 2, view })} aiOn actions={actionsMock()} />);
    expect(screen.getByText(`2 figures ready to check. ${pagesNotSortedText(7)}`)).toBeInTheDocument();
    expect(screen.getByText(/7 pages could not be sorted by the desk\. You can choose the pages to read yourself\./)).toBeInTheDocument();
  });

  it("prints nothing extra when no batch was let go", () => {
    const view = trayFor(state(0), new Date("2026-10-08T05:30:00Z"), null);
    render(<DocumentCard doc={doc({ title: "Annual report", pending: 2, view })} aiOn actions={actionsMock()} />);
    expect(screen.queryByText(/could not be sorted/)).toBeNull();
  });
});
