// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import { ADD_FACT_EVENT, type AddFactDetail, type AddSourceDetail } from "../add-source-event";
import { DigestPanel } from "./digest-panel";

const mocks = vi.hoisted(() => ({ digest: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ readDigestAction: mocks.digest }));

const SOURCE: AddSourceDetail = { doc: "Annual report 2025-26", type: "Annual report", filedOn: "2026-07-12", url: "" };
const ON = { section: "Outlook", claim: "Management plans more pump capacity.", line: "We expect the Kaveri Pumps capacity expansion to be commissioned in FY27.", onPage: true };
const OFF = { section: "Risks", claim: "Management guides to 30% growth.", line: "We guide to thirty percent revenue growth.", onPage: false };
const OFF2 = { ...OFF, claim: "Another unconfirmed claim.", line: "A second line the page does not print." };

beforeEach(() => mocks.digest.mockReset().mockResolvedValue({ ok: true, lines: [ON, OFF, OFF2] }));

const open = () => render(<DigestPanel documentId="d1" pageNo={12} source={SOURCE} />);
async function expand() {
  const view = open();
  await userEvent.click(await screen.findByText("Machine-read"));
  return view;
}

describe("DigestPanel", () => {
  it("is labelled Machine-read and counts the claims, closed until Aksh opens it", async () => {
    open();
    expect(await screen.findByText("Machine-read")).toBeInTheDocument();
    expect(screen.getByText("3 claims on this page")).toBeInTheDocument();
    expect(mocks.digest).toHaveBeenCalledWith("d1", 12);
    expect(screen.getByTestId("digest-panel")).not.toHaveAttribute("open");
  });

  it("hides claims whose line is not on the page behind a count, and shows them marked when asked", async () => {
    await expand();
    expect(screen.getByText(ON.claim)).toBeInTheDocument();
    expect(screen.queryByText(OFF.claim)).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show 2 claims the page check could not confirm" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByText(OFF.claim)).toBeInTheDocument();
    expect(screen.getAllByText("Not found on this page")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Hide 2 claims the page check could not confirm" })).toHaveAttribute("aria-expanded", "true");
  });

  it("offers Use as a fact on a confirmed line only", async () => {
    await expand();
    expect(screen.getAllByRole("button", { name: "Use as a fact" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /could not confirm/ }));
    expect(screen.getAllByRole("button", { name: "Use as a fact" })).toHaveLength(1);
  });

  it("Use as a fact sends only the verified line, the page and the source: never the machine's claim", async () => {
    await expand();
    const seen: AddFactDetail[] = [];
    const listen = (e: Event) => {
      seen.push((e as CustomEvent<AddFactDetail>).detail);
      e.preventDefault();
    };
    window.addEventListener(ADD_FACT_EVENT, listen);
    await userEvent.click(screen.getByRole("button", { name: "Use as a fact" }));
    window.removeEventListener(ADD_FACT_EVENT, listen);
    expect(seen).toEqual([{ source: SOURCE, quote: ON.line, locator: "p. 12" }]);
    expect(JSON.stringify(seen)).not.toContain(ON.claim);
    expect(screen.getByRole("status")).toHaveTextContent("It is in the Facts list as a new row. Add the label and value yourself.");
  });

  it("says so when the Facts form did not take it, and does not close the sheet", async () => {
    const onUsed = vi.fn();
    render(<DigestPanel documentId="d1" pageNo={12} source={SOURCE} onUsed={onUsed} />);
    await userEvent.click(await screen.findByText("Machine-read"));
    await userEvent.click(screen.getByRole("button", { name: "Use as a fact" }));
    expect(screen.getByRole("status")).toHaveTextContent("The Facts list could not take it.");
    expect(onUsed).not.toHaveBeenCalled();
  });

  it("closes the phone sheet once the row is in the form", async () => {
    const onUsed = vi.fn();
    render(<DigestPanel documentId="d1" pageNo={12} source={SOURCE} onUsed={onUsed} />);
    await userEvent.click(await screen.findByText("Machine-read"));
    const listen = (e: Event) => e.preventDefault();
    window.addEventListener(ADD_FACT_EVENT, listen);
    await userEvent.click(screen.getByRole("button", { name: "Use as a fact" }));
    window.removeEventListener(ADD_FACT_EVENT, listen);
    expect(onUsed).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for a page with no digest, and a quiet line when the read failed", async () => {
    mocks.digest.mockResolvedValueOnce({ ok: true, lines: [] });
    const { container, rerender } = open();
    await waitFor(() => expect(mocks.digest).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    mocks.digest.mockResolvedValueOnce({ ok: false, message: "The machine-read notes for this page could not be loaded." });
    rerender(<DigestPanel documentId="d1" pageNo={13} source={SOURCE} />);
    expect(await screen.findByText("The machine-read notes for this page could not be loaded.")).toBeInTheDocument();
  });

  it("uses design tokens only", async () => {
    const { container } = await expand();
    expectTokenOnly(container);
  });
});
