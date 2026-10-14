// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseFactsSheet, serializeFactsSheet } from "@/modules/casefile/client";
import { proposedFactSchema, type FactProvenance, type StagedRow } from "@/modules/ingestion/client";
import { machine } from "@/test/fakes/review-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { RevisionEditor } from "../revision-editor";
import { chipText } from "./marks";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { bodyMd, sheet } = KAVERI.revisions[1];
const canonical = serializeFactsSheet(parseFactsSheet(sheet).caseFile);
const DOC = { id: "d1", title: "Annual report 2025-26", sourceType: "Annual report" as const, filedOn: "2026-05-20", sourceUrl: null, status: "active" as const };
const row = (id: string, over = {}, status: StagedRow["status"] = "accepted"): StagedRow => ({
  proposalId: id, status, document: DOC, value: proposedFactSchema.parse(machine(over)),
});
const FOUR = [
  row("p1", { label: "Total borrowings", value: 310, valueText: "310.00", page: 5 }),
  row("p2", { label: "Finance costs", value: 41.2, valueText: "41.20", quote: "Finance costs 41.20 38.10" }, "edited"),
  row("p3", { label: "Total equity", value: 900, valueText: "900.00" }),
  row("p4", { label: "Cash and cash equivalents", value: 80, valueText: "80.00" }),
];
const open = (props: Partial<React.ComponentProps<typeof RevisionEditor>> = {}) =>
  render(<RevisionEditor action={vi.fn()} bodyMd={bodyMd} sheet={canonical} figuresTo="2026-01-31" staged={FOUR} {...props} />);
const hidden = () => {
  const el = document.querySelector<HTMLInputElement>('input[name="provenance"]');
  return el ? (JSON.parse(el.value) as { staged: string[]; provenance: { factId: string; proposalId: string }[] }) : null;
};
const sheetValue = () => (screen.getByLabelText("Facts sheet") as HTMLTextAreaElement).value;

describe("staged figures in the editor", () => {
  it("says how many figures from which document are staged, and shows each as a new fact row with where it was read", () => {
    open();
    expect(screen.getByText(/4 figures from Annual report 2025-26 are staged below\. Check them, write your change reason and save\./)).toBeInTheDocument();
    const notes = screen.getAllByTestId("staged-note");
    expect(notes.map((r) => r.textContent)).toEqual(["From Annual report 2025-26, p. 5", ...Array(3).fill("From Annual report 2025-26, p. 4")]);
    const group = within(screen.getByRole("group", { name: "Fact F5" }));
    expect(group.getByLabelText("Metric")).toHaveValue("Total borrowings");
    expect(group.getByLabelText("Quoted line (optional)")).toHaveValue("Revenue from operations 1,284.00 1,102.00");
    expect(group.getByLabelText("Topic (optional)")).toHaveValue("P&L");
  });

  it("carries the staged ids and the fact-to-proposal pairs in one hidden field, and drops a pair when its row is removed", async () => {
    open();
    expect(hidden()).toEqual({
      staged: ["p1", "p2", "p3", "p4"],
      provenance: [{ factId: "F5", proposalId: "p1" }, { factId: "F6", proposalId: "p2" }, { factId: "F7", proposalId: "p3" }, { factId: "F8", proposalId: "p4" }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove fact F7" }));
    expect(hidden()?.provenance.map((p) => p.factId)).toEqual(["F5", "F6", "F8"]);
    // The deleted one is still named, so the server sends it back to review.
    expect(hidden()?.staged).toEqual(["p1", "p2", "p3", "p4"]);
    expect(screen.getByText(/3 figures from Annual report 2025-26 are staged below/)).toBeInTheDocument();
  });

  it("has no hidden field and no banner when nothing is staged", () => {
    open({ staged: [] });
    expect(hidden()).toBeNull();
    expect(screen.queryByTestId("staged-banner")).toBeNull();
  });

  it("keeps the merged rows when Aksh switches to Text sheet without editing (R6), and the field in both modes", async () => {
    open();
    await userEvent.click(screen.getByRole("radio", { name: "Text sheet" }));
    expect(sheetValue()).toContain("Total borrowings");
    expect(sheetValue()).toContain("Finance costs");
    expect(hidden()?.provenance).toHaveLength(4);
    await userEvent.click(screen.getByRole("radio", { name: "Form" }));
    expect(within(screen.getByRole("group", { name: "Fact F5" })).getByLabelText("Metric")).toHaveValue("Total borrowings");
  });

  it("leaves a staged row that equals an existing fact out, and says so", () => {
    const f1 = parseFactsSheet(sheet).caseFile.facts[0];
    open({ staged: [row("pd", { label: f1.label, value: f1.value, valueText: String(f1.value) }), FOUR[0]] });
    expect(screen.getByText(/1 figure from Annual report 2025-26 is staged below/)).toBeInTheDocument();
    expect(screen.getByText(/1 more figure from Annual report 2025-26 is not shown: already in this file/)).toBeInTheDocument();
    expect(hidden()?.staged).toEqual(["p1"]);
  });

  it("when the text sheet does not parse, says to fix it and sends nothing", () => {
    open({ sheet: "Z1 | ?" });
    expect(screen.getByText("Fix the text sheet to see the 4 staged figures from Annual report 2025-26.")).toBeInTheDocument();
    expect(hidden()).toBeNull();
  });

  it("sends a document's figures back to review and goes to its review screen", async () => {
    const sendBack = vi.fn(async () => ({ ok: true as const }));
    open({ sendBack });
    await userEvent.click(screen.getByRole("button", { name: "Send back to review" }));
    expect(sendBack).toHaveBeenCalledWith("d1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/desk/inbox/d1/review"));
  });

  it("for a done or skipped document the button drops the figures and the page reloads instead of going to a review screen that refuses", async () => {
    push.mockClear();
    refresh.mockClear();
    const sendBack = vi.fn(async () => ({ ok: true as const }));
    const closed = FOUR.map((r) => ({ ...r, document: { ...DOC, status: "done" as const } }));
    open({ sendBack, staged: closed });
    expect(screen.queryByRole("button", { name: "Send back to review" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Drop these figures" }));
    expect(sendBack).toHaveBeenCalledWith("d1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a refusal from the server and stays put", async () => {
    push.mockClear();
    open({ sendBack: async () => ({ ok: false as const, code: "save-failed", message: "Could not save. Try again." }) });
    await userEvent.click(screen.getByRole("button", { name: "Send back to review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(push).not.toHaveBeenCalled();
  });

  it("the change reason placeholder is an example, never a value", () => {
    open();
    const input = screen.getByLabelText("Change reason");
    expect(input).toHaveAttribute("placeholder", "What changed and why (for example: added FY26 figures from the annual report)");
    expect(input).toHaveValue("");
  });

  it("shows the provenance chip on saved facts, with the machine reading when Aksh changed it", () => {
    const saved = parseFactsSheet(sheet).caseFile;
    const [f1, f2] = saved.facts;
    const prov = (f: typeof f1, over = {}): FactProvenance => ({
      proposalId: "pp",
      documentTitle: "AR 2025-26",
      page: 4,
      edited: false,
      filedAt: "2026-10-08T10:00:00Z",
      machine: machine({
        label: f.label, value: f.value, unit: f.unit, period: f.period, asOf: f.asOf, locator: f.locator,
        quote: saved.sources.find((s) => s.id === f.sourceId)?.quote[f.id] ?? "",
        prior: f.prior ? { ...f.prior, valueText: String(f.prior.value) } : null,
        ...over,
      }),
    });
    open({ staged: [], provenance: { [f1.id]: prov(f1), [f2.id]: prov(f2, { value: f2.value + 0.5, valueText: `${f2.value + 0.5}0` }) } });
    const chips = screen.getAllByTestId("provenance-chip").map((c) => c.textContent);
    expect(chips[0]).toBe("Read from p. 4 of AR 2025-26; you kept it.");
    expect(chips[1]).toMatch(/^Read from p\. 4 of AR 2025-26; you changed .* to .*\.$/);
  });
});

describe("an id that once carried provenance is never handed out again", () => {
  const gone = (): Record<string, FactProvenance> => ({
    F11: { proposalId: "pp", documentTitle: "AR", page: 4, edited: true, filedAt: "x", machine: machine({ label: "Deleted line", value: 41.7, valueText: "41.70" }) },
  });
  it("a typed fact takes F12, not the deleted F11 (no false chip)", async () => {
    open({ staged: [], provenance: gone() });
    await userEvent.click(screen.getByRole("button", { name: "Add fact" }));
    expect(screen.getByRole("group", { name: "Fact F12" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Fact F11" })).toBeNull();
    expect(screen.queryByTestId("provenance-chip")).toBeNull();
  });
  it("staged figures start past it too", () => {
    open({ provenance: gone() });
    expect(hidden()?.provenance.map((p) => p.factId)).toEqual(["F12", "F13", "F14", "F15"]);
  });
});

describe("chipText", () => {
  const fact = { id: "F6", label: "Finance costs", value: 41.2, unit: "₹ cr", period: "FY26", asOf: "2026-03-31", sourceId: "S1", locator: "p. 4", prior: { label: "FY25", value: 38.1 }, topic: "P&L" };
  const prov = (over = {}, edited = false): FactProvenance => ({
    proposalId: "p",
    documentTitle: "AR",
    page: 4,
    edited,
    filedAt: "x",
    machine: machine({ label: "Finance costs", value: 41.7, valueText: "41.70", quote: "Finance costs 41.70 38.10", prior: { label: "FY25", value: 38.1, valueText: "38.10" }, ...over }),
  });
  it("writes the saved number with the printed decimals", () => {
    expect(chipText(prov(), fact, "Finance costs 41.70 38.10")).toBe("Read from p. 4 of AR; you changed 41.70 to 41.20.");
  });
  it("says kept, checked or edited when the value is the machine's", () => {
    expect(chipText(prov({ value: 41.2, valueText: "41.20" }), fact, "another line")).toBe("Read from p. 4 of AR; you edited it.");
    const exact = prov({ value: 41.2, valueText: "41.20", quote: "q" });
    expect(chipText(exact, fact, "q")).toBe("Read from p. 4 of AR; you kept it.");
    expect(chipText({ ...exact, edited: true }, fact, "q")).toBe("Read from p. 4 of AR; you checked it.");
  });
});
