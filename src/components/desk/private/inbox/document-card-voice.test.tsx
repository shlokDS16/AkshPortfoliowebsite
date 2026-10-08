// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TRANSCRIPT_READY, type InboxDoc } from "@/modules/ingestion/client";
import { actionsMock, doc, view } from "@/test/inbox-fixtures";
import { DocumentCard } from "./document-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));
vi.mock("../desk-queue", () => ({ detectSource: () => "web" }));
vi.mock("@/modules/ingestion/actions", () => ({
  skipStepAction: vi.fn(), retryStepAction: vi.fn(), skipDocumentAction: vi.fn(), markTranscriptSavedAction: vi.fn(), discardTranscriptAction: vi.fn(),
}));

const voice = (over: Partial<InboxDoc> = {}) =>
  doc({ title: "Dealer call", kind: "audio", pageCount: 1, transcript: "Dealers say orders are up.", view: view("ready", TRANSCRIPT_READY), ...over });

describe("DocumentCard for a typed-out voice note", () => {
  it("shows the sentence, the transcript to edit, and Save and Discard instead of Review and Skip", () => {
    render(<DocumentCard doc={voice()} aiOn actions={actionsMock()} />);
    expect(screen.getByText("Your voice note is typed out. Check it, then save it as a capture.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your voice note, typed out" })).toHaveValue("Dealers say orders are up.");
    expect(screen.getByRole("button", { name: "Save as a capture" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip this document" })).toBeNull();
  });

  it("shows no transcript box while it is still being typed out or once it is finished", () => {
    const { rerender } = render(<DocumentCard doc={voice({ transcript: null, view: view("reading", "Typing out your voice note.") })} aiOn actions={actionsMock()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    rerender(<DocumentCard doc={voice({ status: "done", transcript: null, view: view("finished", "Done with this document.") })} aiOn actions={actionsMock()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a PDF in Ready has no transcript box and keeps its Review link and Skip", () => {
    render(<DocumentCard doc={doc({ title: "AR", pending: 3, view: view("ready", "3 figures ready to check.") })} aiOn actions={actionsMock()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
  });
});
