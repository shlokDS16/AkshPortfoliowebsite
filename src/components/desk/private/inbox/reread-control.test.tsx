// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import { RereadControl } from "./reread-control";

const mocks = vi.hoisted(() => ({ reread: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ rereadPageAction: mocks.reread }));

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COST = { ok: true, cost: { tokens: 3400, dayCap: 150000, text: "This uses about 3,400 of today's 150,000 AI tokens. Figures from this page that you have not checked yet are replaced by the new reading." } };

beforeEach(() => {
  mocks.reread.mockReset().mockImplementation(async (_d: string, _p: number, confirmed: boolean) => (confirmed ? { ok: true, queued: true } : COST));
});

describe("RereadControl", () => {
  it("offers the button for the page and spends nothing until Aksh has seen the price and said yes", async () => {
    const { container } = render(<RereadControl documentId={DOC} pageNo={4} />);
    await userEvent.click(screen.getByRole("button", { name: "Re-read page 4" }));
    expect(mocks.reread).toHaveBeenCalledTimes(1);
    expect(mocks.reread).toHaveBeenLastCalledWith(DOC, 4, false);
    const ask = await screen.findByRole("group", { name: "Re-read page 4" });
    expect(ask).toHaveTextContent("This uses about 3,400 of today's 150,000 AI tokens.");
    expect(ask).toHaveTextContent("not checked yet are replaced");
    expectTokenOnly(container);

    await userEvent.click(screen.getByRole("button", { name: "Re-read, using about 3,400 tokens" }));
    expect(mocks.reread).toHaveBeenLastCalledWith(DOC, 4, true);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Queued. This page will be read again."));
    expect(screen.queryByRole("group", { name: "Re-read page 4" })).toBeNull();
  });

  it("Not now closes the price and nothing is queued", async () => {
    render(<RereadControl documentId={DOC} pageNo={4} />);
    await userEvent.click(screen.getByRole("button", { name: "Re-read page 4" }));
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("group", { name: "Re-read page 4" })).toBeNull();
    expect(mocks.reread).toHaveBeenCalledTimes(1);
  });

  it("shows the desk's sentence when the price cannot be given or the click is refused, and offers the button again", async () => {
    mocks.reread.mockResolvedValueOnce({ ok: false, code: "ai-off", message: "AI reading is off, so figures cannot be read yet. Pages are still read and searchable." });
    render(<RereadControl documentId={DOC} pageNo={4} />);
    await userEvent.click(screen.getByRole("button", { name: "Re-read page 4" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI reading is off");
    expect(screen.queryByRole("group", { name: "Re-read page 4" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Re-read page 4" }));
    const confirm = await screen.findByRole("button", { name: /^Re-read, using about/ });
    mocks.reread.mockResolvedValueOnce({ ok: false, code: "reread-closed", message: "You marked this document done or skipped, so its pages are not read again." });
    await userEvent.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent("so its pages are not read again");
    expect(screen.getByRole("button", { name: "Re-read page 4" })).toBeEnabled();
  });

  it("says a plain sentence when the call itself fails", async () => {
    mocks.reread.mockRejectedValueOnce(new Error("network"));
    render(<RereadControl documentId={DOC} pageNo={4} />);
    await userEvent.click(screen.getByRole("button", { name: "Re-read page 4" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });
});
