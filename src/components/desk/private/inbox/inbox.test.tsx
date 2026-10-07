// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorText } from "@/lib/messages";
import { STORAGE_BYTES } from "@/modules/documents/client";
import type { ActionResult, InboxDoc, TrayView } from "@/modules/ingestion/client";
import { expectTokenOnly } from "@/test/ui";
import { BudgetMeter } from "./budget-meter";
import { DropBar } from "./drop-bar";
import { InboxSection } from "./inbox-section";
import { IDLE_PAUSE_MS, KeepReading, SLICE_PAUSE_MS } from "./keep-reading";
import { PageChooser } from "./page-chooser";
import type { InboxActions } from "./types";
import { uploadPdf, type UploadDeps } from "./upload-file";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  setBudget: vi.fn(),
  skipStep: vi.fn(),
  retryStep: vi.fn(),
  skipDocument: vi.fn(),
  hash: vi.fn(async () => "a".repeat(64)),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("@/modules/ingestion/actions", () => ({
  startUploadAction: mocks.start,
  finishUploadAction: mocks.finish,
  setBudgetAction: mocks.setBudget,
  skipStepAction: mocks.skipStep,
  retryStepAction: mocks.retryStep,
  skipDocumentAction: mocks.skipDocument,
}));
vi.mock("@/modules/documents/client", async (importOriginal) => ({ ...(await importOriginal<object>()), hashFile: mocks.hash }));

const OK = { ok: true } as const;
const MB = 1_048_576;

function actionsMock(): InboxActions {
  return {
    setPageSelected: vi.fn(async () => OK),
    readSelected: vi.fn(async () => OK),
    kick: vi.fn(async () => {}),
    keepReading: vi.fn(async () => ({ more: false })),
  };
}

const view = (tray: TrayView["tray"], message: string, over: Partial<TrayView> = {}): TrayView => ({
  tray, message, attentionPages: [], extractDone: 0, extractTotal: 0, ...over,
});
const page = (pageNo: number, over: Partial<InboxDoc["pages"][number]> = {}): InboxDoc["pages"][number] => ({
  pageNo, kind: null, basis: null, firstLine: "", selected: false, by: null, ...over,
});
let n = 0;
function doc(over: Partial<InboxDoc> & { view: TrayView }): InboxDoc {
  n += 1;
  return {
    id: `0000000${n}-0000-4000-8000-000000000000`, title: `Report ${n}`, company: null, createdAt: "2026-10-03T06:00:00Z", status: "active",
    pageCount: 312, budget: 20, pending: 0, flagged: 0, pages: [], ...over,
  };
}

const section = (docs: InboxDoc[], over: Partial<Parameters<typeof InboxSection>[0]> = {}) => (
  <InboxSection docs={docs} usage={{ storageBytes: 412 * MB, databaseBytes: 12 * MB }} aiOn companies={[]} actions={actionsMock()} {...over} />
);

beforeEach(() => {
  for (const m of [mocks.refresh, mocks.start, mocks.finish, mocks.setBudget, mocks.skipStep, mocks.retryStep, mocks.skipDocument]) m.mockReset();
  mocks.setBudget.mockResolvedValue(OK);
  mocks.skipStep.mockResolvedValue(OK);
  mocks.retryStep.mockResolvedValue(OK);
  mocks.skipDocument.mockResolvedValue(OK);
});
afterEach(() => vi.useRealTimers());

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

describe("BudgetMeter", () => {
  const meter = (used: number) => render(<BudgetMeter label="Storage" used={used} limit={STORAGE_BYTES} refuse={errorText("upload-storage-full") ?? undefined} />);

  it("says how much of the real limit is used", () => {
    const { container } = meter(412 * MB);
    expect(screen.getByText(/^Storage/)).toHaveTextContent("Storage 412 MB of 1 GB");
    expect(screen.getByRole("meter", { name: "Storage" })).toHaveAttribute("aria-valuenow", String(412 * MB));
    expect(container.firstElementChild).toHaveAttribute("data-tone", "ok");
    expectTokenOnly(container);
  });

  it("warns from 70% and says what is refused from 90%", () => {
    const { container, unmount } = meter(Math.floor(0.69 * STORAGE_BYTES));
    expect(container.firstElementChild).toHaveAttribute("data-tone", "ok");
    unmount();
    const warn = meter(Math.ceil(0.7 * STORAGE_BYTES));
    expect(warn.container.firstElementChild).toHaveAttribute("data-tone", "warn");
    expect(screen.queryByText(/Mark finished documents/)).toBeNull();
    warn.unmount();
    const bad = meter(Math.ceil(0.9 * STORAGE_BYTES));
    expect(bad.container.firstElementChild).toHaveAttribute("data-tone", "bad");
    expect(screen.getByText("Storage is over 90% full. Mark finished documents as done to free space.")).toBeInTheDocument();
  });
});

describe("PageChooser", () => {
  const pages = [
    page(3, { kind: "mdna", firstLine: "Management Discussion and Analysis" }),
    page(4, { kind: "pl", basis: "consolidated", firstLine: "Consolidated Statement of Profit and Loss", selected: true, by: "rule" }),
    page(5, { kind: "bs", basis: "consolidated", firstLine: "Consolidated Balance Sheet as at March 31, 2026", selected: true, by: "rule" }),
  ];
  const full = doc({ budget: 2, pages, view: view("ready", "x", { extractDone: 1, extractTotal: 2 }) });

  it("lists pages with what they are, ticked ones checked, and the count against the limit", () => {
    render(<PageChooser doc={full} aiOn pagesLeft={1} actions={actionsMock()} />);
    expect(screen.getByRole("checkbox", { name: "Page 4, P&L · consolidated" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Page 5, Balance sheet · consolidated" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Page 3, Management discussion" })).not.toBeChecked();
    expect(screen.getByText("2 of 2 allowed")).toBeInTheDocument();
    expect(screen.getByText("P&L · consolidated")).toBeInTheDocument();
  });

  it("ticks a page within the limit straight away, and unticks one", async () => {
    const actions = actionsMock();
    render(<PageChooser doc={{ ...full, budget: 5 }} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Page 3/ }));
    expect(actions.setPageSelected).toHaveBeenLastCalledWith(full.id, 3, true);
    await userEvent.click(screen.getByRole("checkbox", { name: /Page 4/ }));
    expect(actions.setPageSelected).toHaveBeenLastCalledWith(full.id, 4, false);
    expect(mocks.setBudget).not.toHaveBeenCalled();
  });

  it("shows a tick at once, before the server has answered, and springs back when it refuses", async () => {
    const actions = actionsMock();
    let answer: (r: ActionResult) => void = () => {};
    actions.setPageSelected = vi.fn(() => new Promise<ActionResult>((resolve) => (answer = resolve)));
    render(<PageChooser doc={{ ...full, budget: 5 }} aiOn pagesLeft={1} actions={actions} />);
    const three = screen.getByRole("checkbox", { name: /Page 3/ });
    await userEvent.click(three);
    expect(three).toBeChecked();
    expect(screen.getByText("3 of 5 allowed")).toBeInTheDocument();
    await act(async () => answer({ ok: false, code: "save-failed", message: "Could not save. Try again." }));
    expect(three).not.toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });

  it("asks before ticking past the limit, and only then raises it and ticks", async () => {
    const actions = actionsMock();
    render(<PageChooser doc={full} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Page 3/ }));
    const ask = screen.getByRole("group", { name: "Raise the page limit" });
    expect(ask).toHaveTextContent(/^Raise this document to 40 pages\? Ready by (?:\w{3} )?\d\d:\d\d\./);
    expect(actions.setPageSelected).not.toHaveBeenCalled();
    expect(mocks.setBudget).not.toHaveBeenCalled();

    await userEvent.click(within(ask).getByRole("button", { name: "Raise to 40 and tick page 3" }));
    expect(mocks.setBudget).toHaveBeenCalledWith(full.id, 40);
    await waitFor(() => expect(actions.setPageSelected).toHaveBeenCalledWith(full.id, 3, true));
    expect(mocks.setBudget.mock.invocationCallOrder[0]).toBeLessThan((actions.setPageSelected as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it("declining the raise ticks nothing; at 40 there is nothing to raise", async () => {
    const actions = actionsMock();
    const { rerender } = render(<PageChooser doc={full} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Page 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("group", { name: "Raise the page limit" })).toBeNull();
    expect(actions.setPageSelected).not.toHaveBeenCalled();

    rerender(<PageChooser doc={{ ...full, budget: 40 }} aiOn pagesLeft={1} actions={actions} />);
    const many = Array.from({ length: 40 }, (_, i) => page(100 + i, { selected: true, kind: "notes" }));
    rerender(<PageChooser doc={{ ...full, budget: 40, pages: [...pages.slice(0, 1), ...many] }} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Page 3/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("This document is at 40 pages, the most the AI reads. Untick a page first.");
    expect(actions.setPageSelected).not.toHaveBeenCalled();
  });
});

describe("DropBar", () => {
  const file = (name: string, size: number, type = "application/pdf") => {
    const f = new File(["x"], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const input = () => screen.getByLabelText("Choose a PDF");

  it("refuses a 51 MB file before any upload, with the spec's sentence", async () => {
    render(<DropBar companies={[]} actions={actionsMock()} />);
    await userEvent.upload(input(), file("big.pdf", 51 * MB));
    expect(await screen.findByRole("alert")).toHaveTextContent("Over 50 MB. Upload the financial statements section, or compress the file.");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a PDF before any upload", async () => {
    render(<DropBar companies={[]} actions={actionsMock()} />);
    fireEvent.change(input(), { target: { files: [file("notes.png", 1000, "image/png")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files can be uploaded.");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("names the earlier upload of the same file and links to it", async () => {
    mocks.start.mockResolvedValue({ ok: false, code: "upload-duplicate", message: "You uploaded this PDF before. Open the earlier copy.", earlier: { id: "e1", createdAt: "2026-10-03T06:00:00Z" } });
    render(<DropBar companies={[]} actions={actionsMock()} />);
    await userEvent.upload(input(), file("ar.pdf", 3 * MB));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You uploaded this on 3 Oct 2026.");
    expect(within(alert).getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/desk/inbox#doc-e1");
  });

  it("refuses a symbol it does not know, before any upload", async () => {
    render(<DropBar companies={[{ id: "c1", symbol: "KAVPUMP" }]} actions={actionsMock()} />);
    await userEvent.type(screen.getByLabelText("Company, as $SYMBOL"), "$NOPE");
    await userEvent.upload(input(), file("ar.pdf", 3 * MB));
    expect(await screen.findByRole("alert")).toHaveTextContent("No company has that symbol yet.");
    expect(mocks.start).not.toHaveBeenCalled();
  });
});

describe("uploadPdf", () => {
  const pdf = new File(["x"], "AR.pdf", { type: "application/pdf" });
  const extras = { companyId: "c1", filedOn: "2026-06-30", sourceUrl: null };
  const deps = (over: Partial<UploadDeps> = {}): UploadDeps & { calls: string[] } => {
    const calls: string[] = [];
    const rec = <T,>(name: string, value: T) => async () => (calls.push(name), value);
    return {
      calls,
      hash: rec("hash", "b".repeat(64)),
      start: rec("start", { ok: true, documentId: "d1", path: "d1.pdf", token: "t" } as const),
      put: rec("put", { error: null }),
      finish: rec("finish", { ok: true } as const),
      kick: rec("kick", undefined),
      ...over,
    };
  };

  it("checks, signs, sends, confirms and kicks the reader, in that order, with the claim the server checks", async () => {
    const d = deps();
    const stages: string[] = [];
    const start = vi.fn(d.start);
    expect(await uploadPdf(pdf, extras, { ...d, start }, (s) => stages.push(s))).toEqual({ ok: true, documentId: "d1" });
    expect(d.calls).toEqual(["hash", "start", "put", "finish", "kick"]);
    expect(stages).toEqual(["checking", "uploading", "saving"]);
    expect(start).toHaveBeenCalledWith({ fileName: "AR.pdf", bytes: 1, mime: "application/pdf", sha256: "b".repeat(64), ...extras });
  });

  it("a failed send leaves the document to resume and never confirms it", async () => {
    const d = deps({ put: async () => ({ error: { message: "network" } }) });
    const outcome = await uploadPdf(pdf, extras, d, () => {});
    expect(outcome).toEqual({ ok: false, message: "Upload not finished. Choose the file again to resume." });
    expect(d.calls).not.toContain("finish");
  });

  it("a kick that fails does not undo the upload", async () => {
    const d = deps({ kick: async () => Promise.reject(new Error("x")) });
    expect(await uploadPdf(pdf, extras, d, () => {})).toEqual({ ok: true, documentId: "d1" });
  });
});

describe("KeepReading", () => {
  const visible = (state: "visible" | "hidden") => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  afterEach(() => visible("visible"));

  async function tick(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("asks, refreshes, waits 3 s and asks again while the last slice found work, then slows down", async () => {
    vi.useFakeTimers();
    visible("visible");
    const keepReading = vi.fn().mockResolvedValueOnce({ more: true }).mockResolvedValue({ more: false });
    render(<KeepReading keepReading={keepReading} active />);
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await tick(SLICE_PAUSE_MS - 1);
    expect(keepReading).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(keepReading).toHaveBeenCalledTimes(2);
    await tick(SLICE_PAUSE_MS * 3);
    expect(keepReading).toHaveBeenCalledTimes(2); // nothing ran last time: only a slow check now
    await tick(IDLE_PAUSE_MS);
    expect(keepReading).toHaveBeenCalledTimes(3);
  });

  it("asks nothing while the tab is hidden, and asks at once when it comes back", async () => {
    vi.useFakeTimers();
    visible("hidden");
    const keepReading = vi.fn().mockResolvedValue({ more: true });
    render(<KeepReading keepReading={keepReading} active />);
    await tick(10_000);
    expect(keepReading).not.toHaveBeenCalled();
    visible("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no document is being read, and stops when the last one finishes", async () => {
    vi.useFakeTimers();
    const keepReading = vi.fn().mockResolvedValue({ more: true });
    const { rerender, unmount } = render(<KeepReading keepReading={keepReading} active={false} />);
    await tick(5_000);
    expect(keepReading).not.toHaveBeenCalled();
    rerender(<KeepReading keepReading={keepReading} active />);
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
    rerender(<KeepReading keepReading={keepReading} active={false} />);
    await tick(10_000);
    expect(keepReading).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps going when a slice throws", async () => {
    vi.useFakeTimers();
    const keepReading = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue({ more: false });
    render(<KeepReading keepReading={keepReading} active />);
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
    await tick(IDLE_PAUSE_MS);
    expect(keepReading).toHaveBeenCalledTimes(2);
  });
});
