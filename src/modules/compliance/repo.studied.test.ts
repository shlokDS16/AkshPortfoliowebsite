import { describe, expect, it } from "vitest";
import { createTableDb } from "@/test/fakes/table-db";
import { createSupabaseComplianceRepo } from "./repo";

// Rule 14: the lint's outside texts are loaded by the server, from the table, only for the links a revision lists, and the title and the
// site name only when the entry shows them and its hash is the table's current one.
const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const L3 = "33333333-3333-4333-8333-333333333333";
const SHA = "a".repeat(64);
const OLD = "b".repeat(64);

const item = { id: ITEM, kind: "thesis", title: "T", slug: null, learning_objective: null, company_id: null, holds_position: null, data_as_of: null, visibility: "private" };
const link = (id: string, over: Record<string, unknown> = {}) => ({ id, url: `https://example.com/${id.slice(0, 4)}`, title: "A title", site_name: "A site", meta_sha: SHA, note: "HIS PRIVATE NOTE", ...over });
const world = (structured: Record<string, unknown>, links = [link(L1), link(L2, { title: "Other", site_name: "Other site", meta_sha: OLD }), link(L3, { title: null, site_name: null, meta_sha: null })]) =>
  createTableDb({ items: [item], item_revisions: [{ id: REV, item_id: ITEM, body_md: "b", structured, change_reason: null, concept_ids: null }], lint_allowances: [], source_links: links });
const load = async (structured: Record<string, unknown>) => (await createSupabaseComplianceRepo(world(structured).db).loadPublishContext(ITEM, REV))?.outside;
const entry = (link: string, over: Record<string, unknown> = {}) => ({ link, show: true, metaSha: SHA, note: "n", ...over });

describe("loadPublishContext: the outside sources of a revision", () => {
  it("loads the link always, and the title and site name when the entry shows them with the table's current hash", async () => {
    expect(await load({ studied: [entry(L1)] })).toEqual([{ url: `https://example.com/1111`, show: true, metaSha: SHA, read: true, title: "A title", siteName: "A site" }]);
  });

  it("loads only the link for an entry that does not show its title", async () => {
    expect(await load({ studied: [entry(L1, { show: false, metaSha: null })] })).toEqual([{ url: `https://example.com/1111`, show: false, metaSha: null, read: false, title: null, siteName: null }]);
  });

  it("loads no title for a hash that is not the table's current one (the page changed): the gate then refuses", async () => {
    expect(await load({ studied: [entry(L1, { metaSha: OLD })] })).toEqual([{ url: `https://example.com/1111`, show: true, metaSha: OLD, read: false, title: null, siteName: null }]);
  });

  it("never reads a title of a link that has none read (a null hash is not a match for a null hash)", async () => {
    expect((await load({ studied: [entry(L3, { metaSha: null })] }))?.[0]).toMatchObject({ read: false, title: null });
  });

  it("keeps the file's order, and drops an entry that is not a link id or names a link the table does not hold", async () => {
    const got = await load({ studied: [entry(L2, { metaSha: OLD }), { link: "not-a-uuid", show: true, metaSha: SHA, note: "" }, 7, entry("44444444-4444-4444-8444-444444444444"), entry(L1)] });
    expect(got?.map((s) => s.url)).toEqual(["https://example.com/2222", "https://example.com/1111"]);
  });

  it("is an empty list when there is no studied key or it is not a list, and makes no query then", async () => {
    for (const structured of [{}, { studied: "x" }, { studied: [] }]) {
      const w = world(structured);
      expect((await createSupabaseComplianceRepo(w.db).loadPublishContext(ITEM, REV))?.outside).toEqual([]);
      expect(w.log.filter((l) => l.table === "source_links")).toEqual([]);
    }
  });

  it("never loads his private note on the link", async () => {
    expect(JSON.stringify(await load({ studied: [entry(L1)] }))).not.toContain("PRIVATE");
  });
});
