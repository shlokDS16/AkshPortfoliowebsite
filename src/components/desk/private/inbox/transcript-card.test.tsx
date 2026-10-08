// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import { TranscriptCard } from "./transcript-card";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), saved: vi.fn(), discard: vi.fn(), source: vi.fn() }));
vi.mock("@/modules/capture/actions", () => ({ submitCapture: mocks.submit }));
vi.mock("@/modules/ingestion/actions", () => ({ markTranscriptSavedAction: mocks.saved, discardTranscriptAction: mocks.discard }));
vi.mock("../desk-queue", () => ({ detectSource: mocks.source }));

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const TEXT = "Dealers told me orders are up this quarter.";
const OK = { ok: true } as const;
const box = () => screen.getByRole("textbox", { name: "Your voice note, typed out" });

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.source.mockReturnValue("web");
  mocks.submit.mockResolvedValue({ ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null });
  mocks.saved.mockResolvedValue(OK);
  mocks.discard.mockResolvedValue(OK);
});

describe("TranscriptCard", () => {
  it("shows the transcript in a box Aksh can edit, with Save and Discard", () => {
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    expect(box()).toHaveValue(TEXT);
    expect(screen.getByRole("button", { name: "Save as a capture" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
  });

  it("saves the words as he edited them through the capture box's own save, with the document id as the client id, and only then closes the note", async () => {
    const order: string[] = [];
    mocks.submit.mockImplementation(async () => (order.push("capture"), { ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null }));
    mocks.saved.mockImplementation(async () => (order.push("close"), OK));
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.clear(box());
    await userEvent.type(box(), "$KAVPUMP dealers say orders are up.");
    await userEvent.click(screen.getByRole("button", { name: "Save as a capture" }));
    expect(mocks.submit).toHaveBeenCalledWith({ clientId: DOC, rawText: "$KAVPUMP dealers say orders are up.", source: "web" });
    expect(mocks.saved).toHaveBeenCalledWith(DOC);
    expect(order).toEqual(["capture", "close"]);
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it("sends the source the capture box would (mobile on a touch device)", async () => {
    mocks.source.mockReturnValue("mobile");
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.click(screen.getByRole("button", { name: "Save as a capture" }));
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ source: "mobile" }));
  });

  it("does not close the note when the capture was not saved, and says why in plain words", async () => {
    mocks.submit.mockResolvedValue({ ok: false, retry: true, code: "save-failed", message: "Saved on this device; it will sync when the desk is reachable." });
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.click(screen.getByRole("button", { name: "Save as a capture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("on this device");
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(box()).toHaveValue(TEXT); // his words stay in the box
  });

  it("a double press is safe: the second save is a duplicate of the first and the note closes once more", async () => {
    mocks.submit.mockResolvedValueOnce({ ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null });
    mocks.submit.mockResolvedValueOnce({ ok: true, captureId: "c1", itemId: null, duplicate: true, parseError: null });
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.click(screen.getByRole("button", { name: "Save as a capture" }));
    await userEvent.click(screen.getByRole("button", { name: "Save as a capture" }));
    expect(mocks.submit.mock.calls.map((c) => (c[0] as { clientId: string }).clientId)).toEqual([DOC, DOC]);
  });

  it("shows the failure text when the note could not be closed after the capture was saved", async () => {
    mocks.saved.mockResolvedValue({ ok: false, code: "save-failed", message: "Could not save. Try again." });
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.click(screen.getByRole("button", { name: "Save as a capture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });

  it("asks before it discards, saves nothing, and Keep it leaves everything as it was", async () => {
    render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mocks.discard).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, discard it" }));
    expect(mocks.discard).toHaveBeenCalledWith(DOC);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it("will not save an empty box, and asks him to shorten a transcript over 20,000 characters", async () => {
    const { unmount } = render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    await userEvent.clear(box());
    expect(screen.getByRole("button", { name: "Save as a capture" })).toBeDisabled();
    unmount();
    render(<TranscriptCard documentId={DOC} transcript={"a".repeat(20_001)} />);
    expect(screen.getByRole("button", { name: "Save as a capture" })).toBeDisabled();
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("This is over 20,000 characters. Shorten it before you save.")).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("takes a transcript of exactly 20,000 characters", () => {
    render(<TranscriptCard documentId={DOC} transcript={"a".repeat(20_000)} />);
    expect(screen.getByRole("button", { name: "Save as a capture" })).toBeEnabled();
  });

  it("uses design tokens only", () => {
    const { container } = render(<TranscriptCard documentId={DOC} transcript={TEXT} />);
    expectTokenOnly(container);
  });
});
