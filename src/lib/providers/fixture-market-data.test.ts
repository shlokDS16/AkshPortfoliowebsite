import { describe, expect, it, vi } from "vitest";
import { createFixtureMarketData } from "./fixture-market-data";

describe("createFixtureMarketData (local e2e and CI only)", () => {
  const port = createFixtureMarketData();

  it("is named fixture and never calls the network", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await port.equityCloses("2026-10-12", ["ALPHA"]);
    await port.indexClose("2026-10-12");
    expect(port.name).toBe("fixture");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("gives the same closes for the same symbol and date, every time, in the order asked", async () => {
    const a = await port.equityCloses("2026-10-12", ["BETA", "ALPHA"]);
    const b = await createFixtureMarketData().equityCloses("2026-10-12", ["BETA", "ALPHA"]);
    expect(a).toEqual(b);
    expect(a.kind === "ok" && a.closes.map((c) => c.symbol)).toEqual(["BETA", "ALPHA"]);
    expect(a.kind === "ok" && a.tradeDate).toBe("2026-10-12");
  });

  it("gives positive two-decimal closes that differ by symbol and by date, with no ISIN", async () => {
    const day1 = await port.equityCloses("2026-10-12", ["ALPHA", "BETA"]);
    const day2 = await port.equityCloses("2026-10-13", ["ALPHA"]);
    if (day1.kind !== "ok" || day2.kind !== "ok") throw new Error("expected ok");
    const [alpha, beta] = day1.closes;
    expect(alpha.close).toBeGreaterThan(0);
    expect(Math.round(alpha.close * 100)).toBe(alpha.close * 100);
    expect(alpha.close).not.toBe(beta.close);
    expect(alpha.close).not.toBe(day2.closes[0].close);
    expect(alpha).toMatchObject({ series: "EQ", isin: null });
  });

  it("gives a Nifty 50 close that is the same on the same date and moves between dates", async () => {
    const a = await port.indexClose("2026-10-12");
    const b = await port.indexClose("2026-10-13");
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("expected ok");
    expect(a).toEqual(await port.indexClose("2026-10-12"));
    expect(a.close).toBeGreaterThan(1000);
    expect(a.close).not.toBe(b.close);
  });

  it("weekends have no file, for both files", async () => {
    expect(await port.equityCloses("2026-10-10", ["ALPHA"])).toEqual({ kind: "no_file" }); // Saturday
    expect(await port.indexClose("2026-10-11")).toEqual({ kind: "no_file" }); // Sunday
  });

  it("the symbol BLOCKED is blocked", async () => {
    expect(await port.equityCloses("2026-10-12", ["ALPHA", "BLOCKED"])).toMatchObject({ kind: "blocked" });
  });

  it("a date that is not a calendar date is a provider error", async () => {
    expect(await port.equityCloses("not-a-date", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
    expect(await port.indexClose("2026-02-30")).toMatchObject({ kind: "provider_error" });
  });
});
