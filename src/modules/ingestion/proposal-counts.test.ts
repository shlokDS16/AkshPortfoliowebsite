import { describe, expect, it } from "vitest";
import { machine } from "@/test/fakes/review-repo";
import { tallyPending, type ProposalCountRow } from "./proposal-counts";

let n = 0;
const row = (documentId: string, over: Partial<ProposalCountRow> & { fact?: Parameters<typeof machine>[0] } = {}): ProposalCountRow => {
  n += 1;
  const { fact, ...rest } = over;
  return { id: `p${n}`, document_id: documentId, flags: [], status: "pending", machine_value: machine(fact), accepted_value: null, ...rest };
};
const basis = new Map<string, "consolidated" | "standalone">([["a", "consolidated"], ["b", "consolidated"]]);

describe("tallyPending", () => {
  it("counts pending figures per document and the flagged ones among them", () => {
    const tally = tallyPending(
      [
        row("a", { fact: { label: "Revenue from operations" } }),
        row("a", { fact: { label: "Finance costs" }, flags: ["value_not_on_page"] }),
        row("a", { fact: { label: "Total income" }, flags: ["period_unknown", "unit_unknown"] }),
        row("b", { fact: { label: "Total equity" } }),
      ],
      basis,
    );
    expect(tally.get("a")).toEqual({ pending: 3, flagged: 2, decided: 0 });
    expect(tally.get("b")).toEqual({ pending: 1, flagged: 0, decided: 0 });
    expect(tally.get("c")).toBeUndefined();
  });

  it("leaves out a standalone repeat of a consolidated line, so the card says what the review will show", () => {
    const tally = tallyPending(
      [
        row("a", { fact: { label: "Revenue from operations", basis: "consolidated" } }),
        row("a", { fact: { label: "Revenue from operations", basis: "standalone", page: 6 } }),
        row("a", { fact: { label: "Total income", basis: "standalone", page: 6 } }),
      ],
      basis,
    );
    expect(tally.get("a")).toEqual({ pending: 2, flagged: 0, decided: 0 });
  });

  it("still hides the repeat when its consolidated twin is already accepted, and ignores decided figures", () => {
    const tally = tallyPending(
      [
        row("a", { fact: { label: "Revenue from operations", basis: "consolidated" }, status: "accepted" }),
        row("a", { fact: { label: "Revenue from operations", basis: "standalone", page: 6 } }),
        row("a", { fact: { label: "Total income" }, status: "rejected" }),
      ],
      basis,
    );
    expect(tally.get("a")).toEqual({ pending: 0, flagged: 0, decided: 2 });
  });

  it("counts every accepted, edited, dropped or filed figure as decided, so a fully checked document is not 'no figures'", () => {
    const tally = tallyPending(
      [
        row("a", { fact: { label: "Revenue from operations" }, status: "accepted" }),
        row("a", { fact: { label: "Finance costs" }, status: "edited", flags: ["value_not_on_page"] }),
        row("a", { fact: { label: "Total income" }, status: "rejected" }),
        row("a", { fact: { label: "Total equity" }, status: "filed" }),
        row("b", { fact: { label: "Total equity" } }),
      ],
      basis,
    );
    expect(tally.get("a")).toEqual({ pending: 0, flagged: 0, decided: 4 });
    expect(tally.get("b")).toEqual({ pending: 1, flagged: 0, decided: 0 });
  });

  describe("after a re-read (the card must say what is true)", () => {
    const key = (label: string, pass = 1) => `${label.toLowerCase()}|FY26|consolidated${pass > 1 ? `|r${pass}` : ""}`;
    const mine = (label: string, over: Partial<ProposalCountRow> = {}) => row("a", { fact: { label }, dedupe_key: key(label), ...over });

    it("does not count the rows the re-read replaced as Aksh's decisions, so a re-read that found nothing new does not say all are checked", () => {
      const tally = tallyPending(
        [mine("Revenue from operations", { status: "rejected", superseded: true }), mine("Finance costs", { status: "rejected", superseded: true })],
        basis,
      );
      expect(tally.get("a")).toBeUndefined();
    });

    it("counts the new pass's rows and none of the replaced ones", () => {
      const tally = tallyPending(
        [
          mine("Revenue from operations", { status: "rejected", superseded: true }),
          row("a", { fact: { label: "Revenue from operations" }, dedupe_key: key("Revenue from operations", 2) }),
        ],
        basis,
      );
      expect(tally.get("a")).toEqual({ pending: 1, flagged: 0, decided: 0 });
    });

    it("still counts a figure Aksh dropped himself as his decision, and does not count the later pass's repeat of it as waiting", () => {
      const tally = tallyPending(
        [mine("Finance costs", { status: "rejected" }), row("a", { fact: { label: "Finance costs" }, dedupe_key: key("Finance costs", 2) }), mine("Total equity")],
        basis,
      );
      expect(tally.get("a")).toEqual({ pending: 1, flagged: 0, decided: 1 });
    });
  });
});
