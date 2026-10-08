// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsMock, MB } from "@/test/inbox-fixtures";
import { DropBar } from "./drop-bar";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  finish: vi.fn(),
  hash: vi.fn(async () => "a".repeat(64)),
  put: vi.fn(async () => ({ error: null })),
  shrink: vi.fn(),
}));
vi.mock("@/lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.put }) } }) }));
vi.mock("./downscale", () => ({ downscaleImage: mocks.shrink }));
vi.mock("@/modules/ingestion/actions", () => ({ startUploadAction: mocks.start, finishUploadAction: mocks.finish }));
vi.mock("@/modules/documents/client", async (importOriginal) => ({ ...(await importOriginal<object>()), hashFile: mocks.hash }));

beforeEach(() => {
  mocks.start.mockReset();
  mocks.finish.mockReset();
  mocks.hash.mockClear();
  mocks.put.mockClear();
  mocks.shrink.mockReset();
});

describe("DropBar", () => {
  const file = (name: string, size: number, type = "application/pdf") => {
    const f = new File(["x"], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const input = () => screen.getByLabelText("Choose a file");

  it("refuses a 51 MB file before any upload, with the spec's sentence", async () => {
    render(<DropBar companies={[]} actions={actionsMock()} />);
    await userEvent.upload(input(), file("big.pdf", 51 * MB));
    expect(await screen.findByRole("alert")).toHaveTextContent("Over 50 MB. Upload the financial statements section, or compress the file.");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("refuses a file that is neither a PDF nor a photo before any upload", async () => {
    render(<DropBar companies={[]} actions={actionsMock()} />);
    fireEvent.change(input(), { target: { files: [file("notes.txt", 1000, "text/plain")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Drop a PDF, a photo or a voice note.");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("offers PDFs and photos in the file picker", () => {
    render(<DropBar companies={[]} actions={actionsMock()} />);
    expect(input()).toHaveAttribute("accept", expect.stringContaining("image/jpeg"));
    expect(input()).toHaveAttribute("accept", expect.stringContaining("application/pdf"));
  });

  it("shrinks a photo, claims it as an image with the shrunk file's bare type and sends that type to Storage", async () => {
    const shrunk = new File(["small"], "table.jpg", { type: "image/jpeg" });
    mocks.shrink.mockResolvedValue({ ok: true, file: shrunk });
    mocks.start.mockResolvedValue({ ok: true, documentId: "d1", path: "d1.jpg", token: "t" });
    mocks.finish.mockResolvedValue({ ok: true });
    render(<DropBar companies={[]} actions={actionsMock()} />);
    await userEvent.upload(input(), file("table.png", 4 * MB, "image/png"));
    expect(await screen.findByText(/Uploaded table.png/)).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ kind: "image", fileName: "table.jpg", mime: "image/jpeg", bytes: 5 }));
    expect(mocks.put).toHaveBeenCalledWith("d1.jpg", "t", shrunk, { contentType: "image/jpeg" });
  });

  it("says to crop a photo that will not shrink under 1 MB, before any upload", async () => {
    mocks.shrink.mockResolvedValue({ ok: false, message: "This photo is still over 1 MB after shrinking; crop it to the table." });
    render(<DropBar companies={[]} actions={actionsMock()} />);
    await userEvent.upload(input(), file("wide.png", 9 * MB, "image/png"));
    expect(await screen.findByRole("alert")).toHaveTextContent("crop it to the table");
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

  it("past 90% of the free storage the bar is disabled, says why with the real percentage, and ignores a dropped file", () => {
    render(<DropBar companies={[]} actions={actionsMock()} storageShare={0.91} />);
    expect(input()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Storage is 91% full. Mark finished documents as done to free space.");
    fireEvent.drop(screen.getByText(/or drop one here/).closest("div")!.parentElement!, { dataTransfer: { files: [file("ar.pdf", 3 * MB)] } });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("takes uploads at 72%", () => {
    render(<DropBar companies={[]} actions={actionsMock()} storageShare={0.72} />);
    expect(input()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
