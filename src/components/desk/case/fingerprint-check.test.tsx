// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { FingerprintCheck } from "./fingerprint-check";

const event = caseRecordFixture().events[1];
const show = (canonical = event.canonical) => render(<FingerprintCheck prevHash={event.prev_hash} canonical={canonical} hash={event.hash} />);
const press = () => fireEvent.click(screen.getByRole("button", { name: "Check in this browser" }));

afterEach(() => vi.unstubAllGlobals());

describe("the in-browser fingerprint check (spec s33.7)", () => {
  it("says nothing until it is pressed, then says Matches for the real entry (sha256 of prev, a line break and the sealed text, in UTF-8)", async () => {
    show();
    expect(screen.queryByRole("status")).toHaveTextContent("");
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Matches: the fingerprint before it and this text give this fingerprint."));
  });

  it("says Does not match after one character of the sealed text changes", async () => {
    show(event.canonical.replace("two seasons", "two seasonz"));
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Does not match."));
    expect(screen.getByRole("status")).not.toHaveTextContent("Matches");
  });

  it("says Does not match when the fingerprint before it is changed, or the fingerprint itself", async () => {
    const { unmount } = render(<FingerprintCheck prevHash={"0".repeat(64)} canonical={event.canonical} hash={event.hash} />);
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Does not match."));
    unmount();
    render(<FingerprintCheck prevHash={event.prev_hash} canonical={event.canonical} hash={"0".repeat(64)} />);
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Does not match."));
  });

  it("says the browser cannot run the check when Web Crypto is missing, and when it throws", async () => {
    vi.stubGlobal("crypto", {});
    show();
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("This browser cannot run the check."));
    vi.stubGlobal("crypto", { subtle: { digest: () => Promise.reject(new Error("no")) } });
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("This browser cannot run the check."));
  });

  it("makes no network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    show();
    press();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Matches"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
