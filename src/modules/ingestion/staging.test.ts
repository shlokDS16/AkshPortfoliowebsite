import { describe, expect, it } from "vitest";
import { machine } from "@/test/fakes/review-repo";
import { createTableDb } from "@/test/fakes/table-db";
import { buildFact } from "./decide";
import { listStagedForItem } from "./staging";

const ITEM = "11111111-2222-4333-8444-555555555555";
const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const accepted = (over = {}) => buildFact(machine(over), { valueText: String(machine(over).valueText) });
const row = (id: string, page: number, over: Record<string, unknown> = {}, fact = {}) => ({
  id, document_id: DOC, page_no: page, item_id: ITEM, status: "accepted", revision_id: null, created_at: id, accepted_value: accepted(fact), ...over,
});

describe("listStagedForItem", () => {
  const documents = [{ id: DOC, title: "AR 2025-26", source_type: "Annual report", filed_on: "2026-05-20", source_url: null, basis: "consolidated" }];

  it("lists the item's accepted and edited figures that no revision holds, with their document, in page order", async () => {
    const t = createTableDb({
      proposals: [
        row("p3", 5, {}, { label: "Total equity" }),
        row("p1", 4),
        row("p2", 4, { status: "edited" }, { label: "Finance costs" }),
        row("p4", 4, { status: "filed", revision_id: "r1" }),
        row("p5", 4, { status: "pending", accepted_value: null }),
        row("p6", 4, { item_id: "other" }),
        row("p7", 4, { status: "rejected", accepted_value: null }),
      ],
      documents,
    });
    const staged = await listStagedForItem(t.db, ITEM);
    expect(staged.map((s) => [s.proposalId, s.status])).toEqual([["p1", "accepted"], ["p2", "edited"], ["p3", "accepted"]]);
    expect(staged[0].document).toEqual({ id: DOC, title: "AR 2025-26", sourceType: "Annual report", filedOn: "2026-05-20", sourceUrl: null });
    expect(staged[1].value.label).toBe("Finance costs");
  });

  it("leaves out a standalone repeat of a consolidated line, as the review screen does", async () => {
    const t = createTableDb({ proposals: [row("p1", 4), row("p2", 9, {}, { basis: "standalone" }), row("p3", 9, {}, { basis: "standalone", label: "Total equity" })], documents });
    expect((await listStagedForItem(t.db, ITEM)).map((s) => s.proposalId)).toEqual(["p1", "p3"]);
  });

  it("skips a row whose accepted value is not a whole fact, and asks for nothing more when nothing is staged", async () => {
    const t = createTableDb({ proposals: [row("p1", 4, { accepted_value: { label: "x" } })], documents });
    expect(await listStagedForItem(t.db, ITEM)).toEqual([]);
    const empty = createTableDb({ proposals: [] });
    expect(await listStagedForItem(empty.db, ITEM)).toEqual([]);
    expect(empty.log).toHaveLength(1);
  });
});
