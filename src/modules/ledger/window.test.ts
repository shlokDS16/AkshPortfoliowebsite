import { describe, expect, it } from "vitest";
import { windowOf, WINDOW_MAX } from "./window";

describe("windowOf: the list window from the address", () => {
  it("takes a whole number from the base up", () => {
    expect(windowOf("100", 50)).toBe(100);
    expect(windowOf("50", 50)).toBe(50);
    expect(windowOf(String(WINDOW_MAX), 50)).toBe(WINDOW_MAX);
  });

  it.each(["abc", "-5", "1e3", "99999", "5001", "49", "0", "", " 100", "100 ", "1.5", "0x64", "٣٠٠", "NaN", "Infinity", "+100", "007"])(
    "falls back to the base for %j",
    (raw) => {
      expect(windowOf(raw, 50)).toBe(50);
    },
  );

  it("falls back to the base when the parameter is missing or repeated", () => {
    expect(windowOf(undefined, 25)).toBe(25);
    expect(windowOf(["100", "200"], 25)).toBe(25);
  });
});
