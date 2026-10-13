import { describe, expect, it } from "vitest";
import { CHAIN_LIMIT_TEXT } from "@/lib/messages-ledger";
import { chainLines, chainReport, combineChecks } from "./chain";
import type { ChainCheckRows } from "./types";

const OK: ChainCheckRows = {
  chain: { ok: true, events: 42, firstBadSeq: null, badIdea: null },
  anchors: { ok: true, days: 12, firstBadDate: null, reason: null },
};
const withChain = (c: Partial<ChainCheckRows["chain"]>): ChainCheckRows => ({ ...OK, chain: { ...OK.chain, ...c } });
const withAnchors = (a: Partial<ChainCheckRows["anchors"]>): ChainCheckRows => ({ ...OK, anchors: { ...OK.anchors, ...a } });

describe("combineChecks: both checks must pass", () => {
  it("is ok only when the chain and the anchor comparison are both ok", () => {
    expect(combineChecks(OK)).toEqual({ ok: true, events: 42, sealedDays: 12, problems: [] });
  });

  it("reports a chain problem and names the chain check", () => {
    const s = combineChecks(withChain({ ok: false, firstBadSeq: 17 }));
    expect(s.ok).toBe(false);
    expect(s.problems).toEqual([{ source: "chain", firstBadSeq: 17, badIdea: null }]);
  });

  it("reports an anchor problem even when the chain is fine, and names the anchor check", () => {
    const s = combineChecks(withAnchors({ ok: false, firstBadDate: "2026-10-04", reason: "head" }));
    expect(s.ok).toBe(false);
    expect(s.problems).toEqual([{ source: "anchors", firstBadDate: "2026-10-04", reason: "head" }]);
  });

  it("reports both when both fail, chain first", () => {
    const s = combineChecks({
      chain: { ok: false, events: 42, firstBadSeq: 3, badIdea: "idea-9" },
      anchors: { ok: false, days: 12, firstBadDate: "2026-10-01", reason: "count" },
    });
    expect(s.problems.map((p) => p.source)).toEqual(["chain", "anchors"]);
  });

  it("carries the counts through even on a problem", () => {
    const s = combineChecks(withChain({ ok: false, firstBadSeq: 1 }));
    expect(s).toMatchObject({ events: 42, sealedDays: 12 });
  });
});

describe("chainLines: what the screen may say", () => {
  it("a passing result says the ledger is consistent with itself, and nothing stronger", () => {
    const text = chainLines(combineChecks(OK)).join(" ");
    expect(text).toMatch(/consistent with itself/i);
    expect(text).toContain("42 entries");
    expect(text).toContain("12 sealed days");
    expect(text).not.toMatch(/unaltered|cannot be altered|cannot be changed|tamper|proof|immutable|secure|guarantee/i);
  });

  it("says 1 entry and 1 sealed day in the singular", () => {
    const text = chainLines(combineChecks({ chain: { ...OK.chain, events: 1 }, anchors: { ...OK.anchors, days: 1 } })).join(" ");
    expect(text).toContain("1 entry");
    expect(text).toContain("1 sealed day");
  });

  it("a chain problem names the entry", () => {
    expect(chainLines(combineChecks(withChain({ ok: false, firstBadSeq: 17 })))).toEqual(["The ledger chain is broken at entry 17."]);
  });

  it("a chain problem with no entry number still speaks", () => {
    expect(chainLines(combineChecks(withChain({ ok: false })))).toEqual(["The ledger chain is broken."]);
  });

  it("an anchor problem names the day and the way the sealed day differs, and says the check changed nothing", () => {
    const [line] = chainLines(combineChecks(withAnchors({ ok: false, firstBadDate: "2026-10-04", reason: "count" })));
    expect(line).toMatch(/^The sealed days and the entries disagree from 4 Oct 2026/);
    expect(line).toMatch(/number of entries/);
    expect(line).toMatch(/This check changed nothing\. Tell Shlok\.$/);
  });

  it("an unknown anchor reason is not shown as free text", () => {
    const [line] = chainLines(combineChecks(withAnchors({ ok: false, firstBadDate: "2026-10-04", reason: "<script>x</script>" })));
    expect(line).not.toContain("<script>");
  });

  it("both problems give two lines, one per check", () => {
    const lines = chainLines(
      combineChecks({
        chain: { ok: false, events: 2, firstBadSeq: 2, badIdea: null },
        anchors: { ok: false, days: 1, firstBadDate: "2026-10-01", reason: "gap" },
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/chain/);
    expect(lines[1]).toMatch(/sealed days/);
  });
});

describe("chainReport: a pass carries its limit with it", () => {
  it("returns one structure holding the consistent-with-itself line and the standing limit text together", () => {
    const report = chainReport(combineChecks(OK));
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.headline).toBe("Consistent with itself: 42 entries, 12 sealed days.");
    expect(report.limit).toBe(CHAIN_LIMIT_TEXT);
    expect(report.lines).toEqual([report.headline, report.limit]);
  });

  it("chainLines on a pass can never show the headline without the limit", () => {
    const lines = chainLines(combineChecks(OK));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(CHAIN_LIMIT_TEXT);
  });

  it("a failure carries its problem lines and no reassurance", () => {
    const report = chainReport(combineChecks(withChain({ ok: false, firstBadSeq: 17 })));
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual(["The ledger chain is broken at entry 17."]);
    expect(report.lines.join(" ")).not.toMatch(/consistent/i);
  });

  it("the failed-check line does not read as a statement about the ledger", () => {
    const [line] = chainLines(combineChecks(withAnchors({ ok: false, firstBadDate: "2026-10-04", reason: "head" })));
    expect(line).not.toMatch(/Nothing was changed/);
  });
});
