// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkPaste, looksLikeLink, type PasteExtras } from "./link-paste";

const mocks = vi.hoisted(() => ({ link: vi.fn(), text: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ startLinkAction: mocks.link, startTextAction: mocks.text }));

const FIELDS: PasteExtras = { companyId: "9f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6", filedOn: "2026-10-01", sourceUrl: "https://www.bseindia.com/ir" };
const kick = vi.fn(async () => {});

beforeEach(() => {
  mocks.link.mockReset().mockResolvedValue({ ok: true, documentId: "d-1" });
  mocks.text.mockReset().mockResolvedValue({ ok: true, documentId: "d-2" });
  kick.mockClear();
});

const setup = (extras: () => PasteExtras | string = () => FIELDS, disabled = false) => render(<LinkPaste extras={extras} kick={kick} disabled={disabled} />);
const box = () => screen.getByRole("textbox", { name: "Or paste a link or some text" });
const read = () => screen.getByRole("button", { name: /Read it|Opening the link|Saving/ });

describe("looksLikeLink", () => {
  it.each(["https://www.bseindia.com/a.pdf", "  http://example.com/x?y=1  ", "HTTPS://EXAMPLE.COM/"])("%j is a link", (paste) => {
    expect(looksLikeLink(paste)).toBe(true);
  });
  it.each(["", "Revenue 1,284.00 https://example.com", "https://example.com/a b", "see https://example.com", "ftp://example.com", "www.example.com"])("%j is text", (paste) => {
    expect(looksLikeLink(paste)).toBe(false);
  });
});

describe("LinkPaste", () => {
  it("has nothing to read until something is pasted, and says the desk opens a link only when asked", () => {
    setup();
    expect(read()).toBeDisabled();
    expect(screen.getByText("The desk opens a link only when you press Read it.")).toBeInTheDocument();
  });

  it("sends a pasted link to startLinkAction with the optional company and date, then clears the box and nudges the reader", async () => {
    setup();
    await userEvent.type(box(), "  https://www.bseindia.com/a.pdf ");
    await userEvent.click(read());
    expect(await screen.findByText("Opened the link. The desk starts reading it now.")).toBeInTheDocument();
    expect(mocks.link).toHaveBeenCalledWith({ url: "https://www.bseindia.com/a.pdf", companyId: FIELDS.companyId, filedOn: "2026-10-01" });
    expect(mocks.text).not.toHaveBeenCalled();
    expect(box()).toHaveValue("");
    await waitFor(() => expect(kick).toHaveBeenCalledTimes(1));
  });

  it("sends anything else to startTextAction exactly as pasted, with the public link as its source", async () => {
    setup();
    const table = "Quarterly results\nRevenue from operations 412.60 371.20";
    await userEvent.click(box());
    await userEvent.paste(table);
    await userEvent.click(read());
    expect(await screen.findByText("Added. The desk starts reading it now.")).toBeInTheDocument();
    expect(mocks.text).toHaveBeenCalledWith({ text: table, title: null, companyId: FIELDS.companyId, filedOn: "2026-10-01", sourceUrl: FIELDS.sourceUrl });
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("shows the server's fixed sentence when it refuses, and keeps what was pasted", async () => {
    mocks.link.mockResolvedValueOnce({ ok: false, code: "link-blocked", message: "That link points somewhere the desk will not open." });
    setup();
    await userEvent.type(box(), "https://10.0.0.5/x");
    await userEvent.click(read());
    expect(await screen.findByRole("alert")).toHaveTextContent("That link points somewhere the desk will not open.");
    expect(box()).toHaveValue("https://10.0.0.5/x");
    expect(kick).not.toHaveBeenCalled();
  });

  it("names the earlier copy of a duplicate and links to it", async () => {
    mocks.text.mockResolvedValueOnce({ ok: false, code: "upload-duplicate", message: "x", earlier: { id: "d-0", createdAt: "2026-10-03T09:00:00Z" } });
    setup();
    await userEvent.click(box());
    await userEvent.paste("Quarterly results table with enough words in it to be read at all.");
    await userEvent.click(read());
    expect(await screen.findByRole("alert")).toHaveTextContent(/You added this on .*3 Oct/);
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/desk/inbox#doc-d-0");
  });

  it("says so when the call itself fails", async () => {
    mocks.link.mockRejectedValueOnce(new Error("network"));
    setup();
    await userEvent.type(box(), "https://example.com/a");
    await userEvent.click(read());
    expect(await screen.findByRole("alert")).toHaveTextContent("The desk could not read that. Try again.");
  });

  it("stops at the drop bar's own field error without calling the server", async () => {
    setup(() => "Use a valid date, or leave this blank.");
    await userEvent.type(box(), "https://example.com/a");
    await userEvent.click(read());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a valid date, or leave this blank.");
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("is switched off with the drop bar (storage full)", () => {
    setup(() => FIELDS, true);
    expect(box()).toBeDisabled();
    expect(read()).toBeDisabled();
  });
});
