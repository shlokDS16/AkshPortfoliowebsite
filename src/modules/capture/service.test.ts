import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createMemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { saveCapture } from "./service";

function setup() {
  const research = createMemoryResearchRepo();
  const catalog = createMemoryCatalogRepo();
  const captures = createMemoryCaptureRepo();
  return { research, catalog, captures, deps: { research, catalog, captures } };
}
const input = (rawText: string) => ({ rawText, source: "web" as const, clientId: randomUUID() });
const reject = (message: string) => async () => Promise.reject(new Error(message));

/** Returns each value in turn, then the last one again. */
function sequence<T>(values: T[]) {
  let i = 0;
  return async () => values[Math.min(i++, values.length - 1)];
}

describe("saveCapture", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores the raw text verbatim and files a private note", async () => {
    const { deps, captures, research } = setup();
    const raw = "  Margins expanding at the cement majors  ";
    const result = await saveCapture(deps, input(raw));
    expect(captures.records[0].rawText).toBe(raw);
    const item = research.items.get(result.itemId ?? "");
    expect(item).toMatchObject({ kind: "note", title: "Margins expanding at the cement majors", visibility: "private" });
    expect(captures.records[0]).toMatchObject({ itemId: result.itemId, parsed: expect.objectContaining({ kind: "note" }) });
  });

  it("links $SYMBOL to a stub company flagged for review", async () => {
    const { deps, catalog, research, captures } = setup();
    const result = await saveCapture(deps, input("$NEWCO capex plan"));
    const company = [...catalog.companies.values()][0];
    expect(company).toMatchObject({ nseSymbol: "NEWCO", needsReview: true });
    expect(research.items.get(result.itemId ?? "")?.companyId).toBe(company.id);
    expect(captures.records[0].companyId).toBe(company.id);
  });

  it("reuses one company for $tcs and $TCS", async () => {
    const { deps, catalog } = setup();
    await saveCapture(deps, input("$tcs order book"));
    await saveCapture(deps, input("$TCS attrition"));
    expect(catalog.companies.size).toBe(1);
  });

  it("links #theme to a stub theme", async () => {
    const { deps, catalog, captures } = setup();
    await saveCapture(deps, input("#capital-cycle cement adds capacity"));
    const theme = [...catalog.themes.values()][0];
    expect(theme).toMatchObject({ slug: "capital-cycle", name: "Capital Cycle", needsReview: true });
    expect(captures.records[0].themeId).toBe(theme.id);
  });

  it("keeps one thesis per company and appends later t: captures as revisions (decision D7)", async () => {
    const { deps, research } = setup();
    const first = await saveCapture(deps, input("t: $TCS deal wins slowing"));
    const second = await saveCapture(deps, input("t: $TCS margins holding\nmore detail"));
    expect(second.itemId).toBe(first.itemId);
    const item = research.items.get(first.itemId ?? "");
    expect(item).toMatchObject({ kind: "thesis", title: "TCS thesis" });
    const latest = (await research.listRevisions(first.itemId ?? ""))[0];
    expect(latest).toMatchObject({
      revNo: 2,
      bodyMd: "$TCS deal wins slowing\n\n$TCS margins holding\nmore detail",
      changeReason: "$TCS margins holding",
    });
  });

  it("keeps a long first line inside the revision reason limit", async () => {
    const { deps, captures } = setup();
    await saveCapture(deps, input("t: $TCS first"));
    const result = await saveCapture(deps, input(`t: $TCS ${"word ".repeat(100)}`));
    expect(result).toMatchObject({ parseError: null });
    expect(captures.records[1].itemId).toBe(captures.records[0].itemId);
  });

  it("files an emoji-heavy first line: limits count UTF-16 units like the item schema", async () => {
    const { deps, research } = setup();
    const emoji = String.fromCodePoint(0x1f600);
    const note = await saveCapture(deps, input(emoji.repeat(150)));
    expect(note.parseError).toBeNull();
    expect(research.items.get(note.itemId ?? "")?.title.length).toBeLessThanOrEqual(200);

    await saveCapture(deps, input("t: $TCS first"));
    const revised = await saveCapture(deps, input(`t: $TCS ${emoji.repeat(400)}`));
    expect(revised.parseError).toBeNull();
    const reason = (await research.listRevisions(revised.itemId ?? ""))[0].changeReason ?? "";
    expect(reason.length).toBeGreaterThan(0);
    expect(reason.length).toBeLessThanOrEqual(300);
  });

  it("files l: as learning and p: as process", async () => {
    const { deps, research } = setup();
    const learning = await saveCapture(deps, input("l: how float works"));
    const processItem = await saveCapture(deps, input("p: annual report checklist"));
    expect(research.items.get(learning.itemId ?? "")?.kind).toBe("learning");
    expect(research.items.get(processItem.itemId ?? "")?.kind).toBe("process");
  });

  it("files a digit-leading symbol such as $5PAISA", async () => {
    const { deps, catalog } = setup();
    const result = await saveCapture(deps, input("$5PAISA brokerage take rate"));
    expect(result.parseError).toBeNull();
    expect([...catalog.companies.values()][0].nseSymbol).toBe("5PAISA");
  });

  it("treats a repeated clientId as already saved (offline queue retry)", async () => {
    const { deps, captures, research } = setup();
    const once = input("$TCS once");
    const first = await saveCapture(deps, once);
    const again = await saveCapture(deps, once);
    expect(again).toMatchObject({ duplicate: true, captureId: first.captureId, itemId: first.itemId, parseError: null });
    expect(captures.records).toHaveLength(1);
    expect(research.items.size).toBe(1);
  });

  it("creates one capture and one item when a double-submit runs concurrently", async () => {
    const { deps, captures, research } = setup();
    const once = input("$TCS double tap");
    const results = await Promise.all([saveCapture(deps, once), saveCapture(deps, once)]);
    expect(captures.records).toHaveLength(1);
    expect(research.items.size).toBe(1);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(new Set(results.map((r) => r.captureId)).size).toBe(1);
  });

  it("recovers when the insert loses a race to another request with the same clientId", async () => {
    const { deps, captures } = setup();
    const once = input("raced");
    const winner = await captures.insertRaw(once);
    const losing = { ...deps, captures: { ...captures, findByClientId: sequence([null, winner]) } };
    const result = await saveCapture(losing, once);
    expect(result).toMatchObject({ duplicate: true, captureId: winner.id });
    expect(captures.records).toHaveLength(1);
  });

  it("reports an earlier filing failure on a retry instead of pretending it was filed", async () => {
    const { deps } = setup();
    const broken = { ...deps, research: { ...deps.research, insertItem: reject("db down") } };
    const once = input("A thought worth keeping");
    await saveCapture(broken, once);
    expect(await saveCapture(deps, once)).toMatchObject({ duplicate: true, itemId: null, parseError: "filing-failed" });
  });

  describe("verbatim first: a failure while filing never loses the text", () => {
    it("keeps the capture, with no item link, and reports a fixed code", async () => {
      const { deps, captures } = setup();
      const broken = { ...deps, research: { ...deps.research, insertItem: reject("db down") } };
      const result = await saveCapture(broken, input("A thought worth keeping"));
      expect(result).toMatchObject({ itemId: null, duplicate: false, parseError: "filing-failed" });
      expect(captures.records).toHaveLength(1);
      expect(captures.records[0]).toMatchObject({
        rawText: "A thought worth keeping",
        itemId: null,
        parsed: expect.objectContaining({ kind: "note", error: "filing-failed" }),
      });
    });

    it("never copies the error message into the capture row or the result", async () => {
      const { deps, captures } = setup();
      const leak = new DbError("research.insertItem", "42P01", 'relation "secret_table" does not exist');
      const broken = { ...deps, research: { ...deps.research, insertItem: () => Promise.reject(leak) } };
      const result = await saveCapture(broken, input("note"));
      expect(JSON.stringify([result, captures.records[0].parsed])).not.toContain("secret_table");
      expect(captures.records[0].parsed).toMatchObject({ errorDetail: "DbError research.insertItem 42P01" });
    });

    it("keeps the capture when the catalog stub cannot be created", async () => {
      const { deps, captures, research } = setup();
      const broken = { ...deps, catalog: { ...deps.catalog, insertCompany: reject("catalog down") } };
      const result = await saveCapture(broken, input("$NEWCO plan"));
      expect(result).toMatchObject({ itemId: null, parseError: "filing-failed" });
      expect(captures.records[0].rawText).toBe("$NEWCO plan");
      expect(research.items.size).toBe(0);
    });

    it("still reports the filing failure if recording it also fails", async () => {
      const { deps, captures } = setup();
      const broken = {
        ...deps,
        research: { ...deps.research, insertItem: reject("db down") },
        captures: { ...captures, attach: reject("db down") },
      };
      const result = await saveCapture(broken, input("kept anyway"));
      expect(result).toMatchObject({ itemId: null, parseError: "filing-failed" });
      expect(captures.records[0].rawText).toBe("kept anyway");
    });

    it("reports the item that was filed when only linking it to the capture fails", async () => {
      const { deps, captures, research } = setup();
      const broken = { ...deps, captures: { ...captures, attach: reject("db down") } };
      const result = await saveCapture(broken, input("filed but unlinked"));
      expect(result).toMatchObject({ parseError: "link-failed" });
      expect(result.itemId).toBe([...research.items.keys()][0]);
      expect(research.items.size).toBe(1);
    });

    it("throws (so the client retries) when the raw text cannot even be stored", async () => {
      const { deps, captures } = setup();
      const broken = { ...deps, captures: { ...captures, insertRaw: reject("db down") } };
      await expect(saveCapture(broken, input("lost?"))).rejects.toThrow("db down");
      expect(deps.research.items.size).toBe(0);
    });
  });

  it("stores URLs on the capture for Phase 2 ingestion", async () => {
    const { deps, captures } = setup();
    await saveCapture(deps, input("read https://example.com/ar.pdf"));
    expect(captures.records[0].parsed).toMatchObject({ urls: ["https://example.com/ar.pdf"] });
  });

  it.each(["", "   ", "\n\t  "])("rejects an empty capture %j and writes nothing", async (text) => {
    const { deps, captures } = setup();
    await expect(saveCapture(deps, input(text))).rejects.toThrow(/Empty capture/);
    expect(captures.records).toHaveLength(0);
  });

  it("rejects an over-long capture and a malformed client id", async () => {
    const { deps, captures } = setup();
    await expect(saveCapture(deps, input("x".repeat(20_001)))).rejects.toThrow(/too long/);
    await expect(saveCapture(deps, { ...input("ok"), clientId: "not-a-guid" })).rejects.toThrow();
    expect(captures.records).toHaveLength(0);
  });
});
