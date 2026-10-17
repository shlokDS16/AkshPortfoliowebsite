// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GateDecision } from "@/modules/compliance/client";
import type { PanelRow } from "@/modules/sources";
import { buildStudiedEntries, readStudiedForm } from "@/modules/sources";
import type { SourceRecord } from "@/modules/sources/client";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { OutsidePanel, outsideRefusals } from "./outside-panel";

const A = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const B = "1c7f4d2f-9b3e-4a6c-8d8f-2e3b4c5d6e7f";
const HASH_A = "a".repeat(64);
const record = (id: string, over: Partial<SourceRecord> = {}): SourceRecord => ({
  id, url: "https://www.youtube.com/watch?v=abcdefghijk", kind: "youtube", youtubeId: "abcdefghijk", note: "my private words", createdAt: "2026-10-03T05:00:00Z", archivedAt: null,
  title: "How a pump maker finances its dealers", siteName: "Dealer Finance Channel", channelUrl: null, thumbPath: `yt/${"c".repeat(64)}.jpg`, thumbSha256: "c".repeat(64),
  metaSha: id === A ? HASH_A : "b".repeat(64), metaSince: "2026-10-14T05:00:00Z", fetchedAt: "2026-10-14T05:00:00Z", checkedAt: "2026-10-14T05:00:00Z", gone: false, fetchProblem: null,
  fetchAttempts: 1, companyIds: ["c1"], themeIds: [], ...over,
});
const row = (r: SourceRecord, over: Partial<PanelRow> = {}): PanelRow => ({ record: r, listed: false, showTitle: true, publicNote: "", problem: null, ...over });
const save = vi.fn(async () => undefined);
const panel = (rows: PanelRow[], rest: Partial<React.ComponentProps<typeof OutsidePanel>> = {}) => <OutsidePanel rows={rows} save={save} company="Kaveri Pumps" refusals={[]} {...rest} />;
const formData = (container: HTMLElement) => new FormData(container.querySelector("form")!);

describe("the file page's Outside sources panel", () => {
  it("is a labelled section that says what it does, in plain words", () => {
    const { container } = render(panel([row(record(A))]));
    expect(screen.getByRole("heading", { level: 2, name: "Outside sources" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Outside sources" })).toBeInTheDocument();
    expect(container.textContent).toContain("Kaveri Pumps");
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("gives each source its three choices, each with a visible label, and shows the machine's title in the machine face", () => {
    render(panel([row(record(A))]));
    expect(screen.getByRole("checkbox", { name: "Show on the public file" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show its title and picture" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "What readers see from me" })).toHaveValue("");
    expect(screen.getByText("How a pump maker finances its dealers").closest("[data-machine]")).not.toBeNull();
  });

  it("prints the fixed warning beside each picture, and no picture for a source without one", () => {
    const { container } = render(panel([row(record(A)), row(record(B, { thumbPath: null, thumbSha256: null }))]));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute("src", `/desk/sources/${A}/thumb`);
    expect(screen.getAllByText("The desk does not read pictures. Untick if this one tells people to buy or sell.")).toHaveLength(1);
  });

  it("a source the desk has not read yet cannot show a title (nothing was read), and says why", () => {
    render(panel([row(record(A, { title: null, siteName: null, metaSha: null, metaSince: null, fetchedAt: null, thumbPath: null, thumbSha256: null }))]));
    expect(screen.getByRole("checkbox", { name: "Show its title and picture" })).toBeDisabled();
    expect(screen.getByText("Reading the link")).toBeInTheDocument();
  });

  it("starts from the revision: ticked, its choice and its words", () => {
    render(panel([row(record(A), { listed: true, showTitle: false, publicNote: "what readers see" })]));
    expect(screen.getByRole("checkbox", { name: "Show on the public file" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show its title and picture" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "What readers see from me" })).toHaveValue("what readers see");
  });

  it("copies his private note into the readers' field only when he presses, and the field stays his to edit", async () => {
    render(panel([row(record(A))]));
    const field = screen.getByRole("textbox", { name: "What readers see from me" });
    expect(field).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Use my private note" }));
    expect(field).toHaveValue("my private words");
    await userEvent.type(field, " and more");
    expect(field).toHaveValue("my private words and more");
  });

  it("offers no copy button when he has no private note, and counts the readers' words against 500", async () => {
    render(panel([row(record(A, { note: "" }))]));
    expect(screen.queryByRole("button", { name: "Use my private note" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "What readers see from me" }), "four");
    expect(screen.getByText("4 of 500")).toBeInTheDocument();
  });

  it("sends the hash the table holds for a ticked title, and never one from the form", () => {
    const { container } = render(panel([row(record(A), { listed: true, showTitle: true, publicNote: "n" }), row(record(B))]));
    const fd = formData(container);
    expect([...fd.keys()].some((k) => /meta|hash|sha|title$/i.test(k) && !k.startsWith("showTitle:"))).toBe(false);
    const entries = buildStudiedEntries(readStudiedForm(fd), (link) => (link === A ? HASH_A : null));
    expect(entries).toEqual([{ link: A, show: true, metaSha: HASH_A, note: "n" }]);
  });

  it("an unticked source is not listed, and an unticked title lists the link alone (no hash)", async () => {
    const { container } = render(panel([row(record(A), { listed: true, showTitle: true, publicNote: "n" }), row(record(B), { listed: true })]));
    const titles = screen.getAllByRole("checkbox", { name: "Show its title and picture" });
    await userEvent.click(titles[0]!);
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Show on the public file" })[1]!);
    const entries = buildStudiedEntries(readStudiedForm(formData(container)), () => HASH_A);
    expect(entries).toEqual([{ link: A, show: false, metaSha: null, note: "n" }]);
  });

  it("keeps the order of the list in the form, which is the order readers see", () => {
    const { container } = render(panel([row(record(B), { listed: true }), row(record(A), { listed: true })]));
    expect(readStudiedForm(formData(container)).map((r) => r.link)).toEqual([B, A]);
  });

  it("takes his change reason (optional) and has one save button", () => {
    render(panel([row(record(A))]));
    expect(screen.getByRole("textbox", { name: /Change reason/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as a new revision" })).toBeInTheDocument();
  });

  it("shows why a listed source cannot stay, in the fixed sentence", () => {
    render(panel([row(record(A, { gone: true }), { listed: true, problem: "gone" }), row(record(B, { archivedAt: "2026-10-15T05:00:00Z" }), { listed: true, problem: "archived" })]));
    expect(screen.getAllByText("One of these sources was archived or is no longer on YouTube. Take it off the list.")).toHaveLength(2);
  });

  it("says so when the company has no sources, and points to where to add one", () => {
    render(panel([]));
    expect(screen.getByRole("link", { name: /^Add a source/ })).toHaveAttribute("href", "/desk/sources");
    expect(screen.queryByRole("button", { name: "Save as a new revision" })).toBeNull();
  });

  it("lists what the last gate run refused, in the gate's words, with the quoted title", () => {
    render(
      panel([row(record(A), { listed: true })], {
        refusals: [
          { message: "A price, return or valuation figure in someone else's title or name is not shown. Untick 'Show its title and picture' to show the link alone.", field: "Title of an outside source", sentence: "Five stocks to buy now" },
          { message: "YouTube or the page changed since you chose it. Save the sources again.", field: null, sentence: null },
        ],
      }),
    );
    const refused = screen.getByRole("group", { name: "The last gate run refused" });
    expect(within(refused).getByText(/Untick 'Show its title and picture'/)).toBeInTheDocument();
    expect(within(refused).getByText("Five stocks to buy now")).toBeInTheDocument();
    expect(within(refused).getByText("YouTube or the page changed since you chose it. Save the sources again.")).toBeInTheDocument();
  });
});

describe("outsideRefusals", () => {
  const failure = (over: Record<string, unknown>) => ({ rule: "14", message: "m", field: null, sentence: null, match: null, sentenceHash: null, ...over });
  const decision = (failures: unknown[], revisionId = "r2", verdict: "pass" | "fail" = "fail") => ({ decisionId: "d", revisionId, verdict, policyVersion: "v", decidedAt: "2026-10-16T05:00:00Z", failures, allowedBy: [] }) as unknown as GateDecision;

  it("takes rule 14 failures and the wording failures on an outside title, name or link", () => {
    const out = outsideRefusals(decision([failure({ message: "a" }), failure({ rule: "1", field: "outsideTitle", sentence: "Buy now", message: "b" }), failure({ rule: "3", field: "outsideLink", message: "c" }), failure({ rule: "1", field: "body", message: "not ours" })]), "r2");
    expect(out.map((o) => o.message)).toEqual(["a", "b", "c"]);
    expect(out[1]).toMatchObject({ field: "Title of an outside source", sentence: "Buy now" });
  });

  it("is empty for a decision on an older revision, for a pass and for none", () => {
    expect(outsideRefusals(decision([failure({})], "r1"), "r2")).toEqual([]);
    expect(outsideRefusals(decision([], "r2", "pass"), "r2")).toEqual([]);
    expect(outsideRefusals(null, "r2")).toEqual([]);
  });
});
