import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { ensureCompany, ensureTheme, InvalidCatalogTokenError } from "./service";

describe("ensureCompany", () => {
  it("creates a stub flagged for review (spec s5)", async () => {
    const repo = createMemoryCatalogRepo();
    const company = await ensureCompany(repo, "m&m");
    expect(company).toMatchObject({ nseSymbol: "M&M", name: "M&M", slug: "m-and-m", needsReview: true });
  });

  it("reuses an existing company whatever the case of the symbol", async () => {
    const repo = createMemoryCatalogRepo();
    const first = await ensureCompany(repo, "TCS");
    expect(await ensureCompany(repo, "tcs")).toEqual(first);
    expect(repo.companies.size).toBe(1);
  });

  it("recovers when a concurrent capture inserted the same symbol first", async () => {
    const repo = createMemoryCatalogRepo();
    repo.simulateRace("INFY");
    const company = await ensureCompany(repo, "INFY");
    expect(company!.nseSymbol).toBe("INFY");
    expect(repo.companies.size).toBe(1);
  });

  it("accepts digit-leading NSE symbols the capture parser produces", async () => {
    const repo = createMemoryCatalogRepo();
    expect(await ensureCompany(repo, "5paisa")).toMatchObject({ nseSymbol: "5PAISA", slug: "5paisa" });
    expect(await ensureCompany(repo, "360ONE")).toMatchObject({ nseSymbol: "360ONE" });
  });

  it.each(["5PAISA!", "500", "", "  ", "-TCS", "A".repeat(21)])("rejects %j as a symbol", async (token) => {
    await expect(ensureCompany(createMemoryCatalogRepo(), token)).rejects.toBeInstanceOf(InvalidCatalogTokenError);
  });

  it("falls back to a suffixed slug on a slug clash", async () => {
    const repo = createMemoryCatalogRepo();
    await ensureCompany(repo, "M&M");
    const clash = await ensureCompany(repo, "M-AND-M");
    expect(clash).toMatchObject({ nseSymbol: "M-AND-M", slug: "m-and-m-2" });
    expect(repo.companies.size).toBe(2);
  });

  it("gives up after five slug attempts and rethrows the unique violation", async () => {
    const repo = createMemoryCatalogRepo();
    const clashing = { ...repo, insertCompany: () => Promise.reject(new DbError("catalog.insertCompany", "23505", "duplicate")) };
    await expect(ensureCompany(clashing, "TCS")).rejects.toBeInstanceOf(DbError);
  });

  it("an ignored symbol returns null and creates nothing", async () => {
    const repo = createMemoryCatalogRepo();
    repo.ignored.add("symbol:AND");
    expect(await ensureCompany(repo, "and")).toBeNull();
    expect(repo.companies.size).toBe(0);
  });

  it("an alias returns the target company and creates nothing", async () => {
    const repo = createMemoryCatalogRepo();
    const target = (await ensureCompany(repo, "KAVPUMP"))!;
    repo.aliases.set("KAVPUMPS", target.id);
    expect(await ensureCompany(repo, "kavpumps")).toEqual(target);
    expect(repo.companies.size).toBe(1);
  });

  it("does not hide other database errors", async () => {
    const repo = createMemoryCatalogRepo();
    const down = new DbError("catalog.insertCompany", "57P01", "terminating connection");
    const broken = { ...repo, insertCompany: () => Promise.reject(down) };
    await expect(ensureCompany(broken, "TCS")).rejects.toBe(down);
  });
});

describe("ensureTheme", () => {
  it("creates a stub theme with a readable name and reuses it", async () => {
    const repo = createMemoryCatalogRepo();
    const theme = await ensureTheme(repo, "Capital-Cycle");
    expect(theme).toMatchObject({ slug: "capital-cycle", name: "Capital Cycle", needsReview: true });
    expect(await ensureTheme(repo, "capital-cycle")).toEqual(theme);
  });

  it("recovers when a concurrent capture inserted the same theme first", async () => {
    const repo = createMemoryCatalogRepo();
    repo.simulateThemeRace("moats");
    const theme = await ensureTheme(repo, "moats");
    expect(theme!.slug).toBe("moats");
    expect(repo.themes.size).toBe(1);
  });

  it("an ignored theme returns null and creates nothing", async () => {
    const repo = createMemoryCatalogRepo();
    repo.ignored.add("theme:capex");
    expect(await ensureTheme(repo, "Capex")).toBeNull();
    expect(repo.themes.size).toBe(0);
  });

  it("rejects a token with nothing usable", async () => {
    await expect(ensureTheme(createMemoryCatalogRepo(), "--")).rejects.toBeInstanceOf(InvalidCatalogTokenError);
  });
});
