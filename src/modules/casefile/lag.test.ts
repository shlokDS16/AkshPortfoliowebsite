import { describe, expect, it } from "vitest";
import { isIsoDate, isLagged, withheldUntil } from "./lag";

describe("lag (rule 3, India dates)", () => {
  it("lagged on or before today - 30; withheld until date + 30", () => {
    expect(isLagged("2026-09-06", "2026-10-06")).toBe(true);
    expect(isLagged("2026-09-07", "2026-10-06")).toBe(false);
    expect(withheldUntil("2026-09-07", "2026-10-06")).toBe("2026-10-07");
    expect(withheldUntil("2026-03-31", "2026-10-06")).toBeNull();
  });

  it("recognises only real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "soon", "2026-1-5", "2026-03-31T00:00:00Z", "", null, 20260331]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });

  it("never lets a malformed date pass as old enough: a date that cannot be read is not lagged", () => {
    expect(isLagged("soon", "2026-10-06")).toBe(false);
    expect(() => withheldUntil("2026-09-20", "yesterday")).toThrow(RangeError);
    expect(() => withheldUntil("soon", "2026-10-06")).toThrow(RangeError);
    expect(() => isLagged("2026-09-20", "yesterday")).toThrow(RangeError);
  });
});
