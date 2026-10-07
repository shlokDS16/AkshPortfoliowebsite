// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsMock, doc, MB, OK, page, view } from "@/test/inbox-fixtures";
import { expectTokenOnly } from "@/test/ui";
import { InboxSection } from "./inbox-section";

const mocks = vi.hoisted(() => ({ skipStep: vi.fn(), retryStep: vi.fn(), skipDocument: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./pump-client", () => ({ fetchSlice: async () => ({ more: false }) }));
vi.mock("@/lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("@/modules/ingestion/actions", () => ({
  startUploadAction: vi.fn(),
  finishUploadAction: vi.fn(),
  setBudgetAction: vi.fn(),
  skipStepAction: mocks.skipStep,
  retryStepAction: mocks.retryStep,
  skipDocumentAction: mocks.skipDocument,
}));

const section = (docs: Parameters<typeof InboxSection>[0]["docs"], over: Partial<Parameters<typeof InboxSection>[0]> = {}) => (
  <InboxSection docs={docs} usage={{ storageBytes: 412 * MB, databaseBytes: 12 * MB }} aiOn companies={[]} actions={actionsMock()} {...over} />
);

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset().mockResolvedValue(OK);
});

describe("InboxSection", () => {
  const ready = doc({ title: "Ready one", pending: 24, view: view("ready", "24 figures ready to check.") });
  const stuck = doc({ title: "Stuck one", view: view("attention", "Pages 142-147 could not be read.", { attentionPages: [142, 143] }) });
  const reading = doc({ title: "Reading one", view: view("reading", "Reading figures: 7 of 20 pages, ready by 11:40", { extractDone: 7, extractTotal: 20 }) });
  const paused = doc({ title: "Paused one", view: view("paused", "Waiting a minute for the AI allowance.") });
  const waiting = doc({ title: "Waiting one", view: view("waiting", "Queued. Starts within 15 minutes, sooner while this page is open.") });
  const finished = doc({ title: "Finished one", status: "done", view: view("finished", "Done with this document.") });

  it("lists the trays in the order Ready, Needs attention, Being read, Paused, Waiting, with their counts", () => {
    const { container } = render(section([waiting, paused, reading, stuck, ready, finished]));
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Ready for you1", "Needs attention1", "Being read1", "Paused, nothing lost1", "Waiting to start1",
    ]);
    expect(within(screen.getByRole("region", { name: /Ready for you/ })).getByText("Ready one")).toBeInTheDocument();
    expect(screen.getByText("Finished 1")).toBeInTheDocument();
    expectTokenOnly(container);
  });

  it("hides every empty tray except Ready, which says there is nothing to review", () => {
    render(section([]));
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Ready for you0"]);
    expect(screen.getByText("Nothing to review.")).toBeInTheDocument();
    expect(screen.queryByText(/^Finished/)).toBeNull();
  });

  it("offers Review on a ready card, Enter manually, Skip and Try again on a stuck one, and nothing while reading", async () => {
    render(section([ready, stuck, reading]));
    const card = (title: string) => screen.getByRole("heading", { name: title }).closest("article") as HTMLElement;

    expect(within(card("Ready one")).getByRole("link", { name: "Review" })).toHaveAttribute("href", `/desk/inbox/${ready.id}/review`);

    const attention = card("Stuck one");
    expect(within(attention).getByRole("link", { name: "Enter manually" })).toBeInTheDocument();
    await userEvent.click(within(attention).getByRole("button", { name: "Skip" }));
    expect(mocks.skipStep).toHaveBeenCalledWith(stuck.id);
    await userEvent.click(within(attention).getByRole("button", { name: "Try again" }));
    expect(mocks.retryStep).toHaveBeenCalledWith(stuck.id);

    const busy = card("Reading one");
    expect(within(busy).queryByRole("button")).toBeNull();
    expect(within(busy).queryByRole("link")).toBeNull();
    expect(within(busy).getByRole("progressbar", { name: "Pages read" })).toHaveAttribute("aria-valuenow", "7");
  });

  it("a read document with no figures offers to skip it; a waiting one too; an unfinished upload offers nothing", async () => {
    const quiet = doc({ title: "Quiet one", view: view("ready", "Read. No figures matched; open it beside your file.") });
    const half = doc({ title: "Half one", status: "uploading", view: view("waiting", "Upload not finished. Choose the file again to resume.") });
    render(section([quiet, waiting, half]));
    for (const [title, d] of [["Quiet one", quiet], ["Waiting one", waiting]] as const) {
      const c = screen.getByRole("heading", { name: title }).closest("article") as HTMLElement;
      await userEvent.click(within(c).getByRole("button", { name: "Skip this document" }));
      expect(mocks.skipDocument).toHaveBeenLastCalledWith(d.id);
    }
    expect(within(screen.getByRole("heading", { name: "Half one" }).closest("article") as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("shows a refusal from an action under the card, in words", async () => {
    mocks.retryStep.mockResolvedValue({ ok: false, code: "save-failed", message: "Could not save. Try again." });
    render(section([stuck]));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });

  it("with AI off says so, in the spec's words, and offers to queue ticked pages once it is on", () => {
    const { rerender } = render(section([], { aiOn: false }));
    expect(screen.getByText("AI reading is off. Pages are still read and searchable; open a document beside your file to enter figures.")).toBeInTheDocument();
    const ticked = doc({ title: "Ticked", view: view("ready", "Read. No figures matched; open it beside your file."), pages: [page(4, { selected: true, by: "rule", kind: "pl" })] });
    rerender(section([ticked], { aiOn: true }));
    expect(screen.queryByText(/AI reading is off/)).toBeNull();
    expect(screen.getByRole("button", { name: "Read the ticked pages" })).toBeInTheDocument();
  });
});
