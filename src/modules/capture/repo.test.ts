import { describe, expect, it } from "vitest";
import { toListEntry } from "./repo";

const row = (parsed: unknown) => ({
  id: "c1",
  raw_text: "$TCS note",
  created_at: "2026-10-04T06:00:00Z",
  item_id: null,
  company_id: "co1",
  parsed: parsed as never,
  companies: { nse_symbol: "TCS", name: "Tata Consultancy" },
});

describe("toListEntry", () => {
  it("passes a known filing error code through", () => {
    expect(toListEntry(row({ error: "filing-failed" })).parseError).toBe("filing-failed");
    expect(toListEntry(row({ error: "link-failed" })).parseError).toBe("link-failed");
  });

  it("never lets an unknown or non-string error reach the UI", () => {
    expect(toListEntry(row({ error: "duplicate key value violates ... (secret row)" })).parseError).toBeNull();
    expect(toListEntry(row({ error: 42 })).parseError).toBeNull();
    expect(toListEntry(row(null)).parseError).toBeNull();
  });

  it("maps the company join", () => {
    expect(toListEntry(row({}))).toMatchObject({ companySymbol: "TCS", companyName: "Tata Consultancy", companyId: "co1" });
    expect(toListEntry({ ...row({}), companies: null })).toMatchObject({ companySymbol: null, companyName: null });
  });
});
