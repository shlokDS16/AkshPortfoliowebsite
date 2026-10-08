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
});
