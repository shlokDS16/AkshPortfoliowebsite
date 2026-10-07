// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsMock, MB } from "@/test/inbox-fixtures";
import { DropBar } from "./drop-bar";

const mocks = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn(), hash: vi.fn(async () => "a".repeat(64)) }));
vi.mock("@/lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("@/modules/ingestion/actions", () => ({ startUploadAction: mocks.start, finishUploadAction: mocks.finish }));
vi.mock("@/modules/documents/client", async (importOriginal) => ({ ...(await importOriginal<object>()), hashFile: mocks.hash }));

beforeEach(() => {
  mocks.start.mockReset();
  mocks.finish.mockReset();
  mocks.hash.mockClear();
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
