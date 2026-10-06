import { describe, expect, it } from "vitest";
import { clipUnits, truncateUnits } from "./text";

const emoji = String.fromCodePoint(0x1f600);

describe("UTF-16 length helpers", () => {
  it("leave short text alone", () => {
    expect(clipUnits("abc", 3)).toBe("abc");
    expect(truncateUnits("abc", 3)).toBe("abc");
  });

  it("never exceed the limit and never split a surrogate pair", () => {
    for (let pad = 0; pad < 6; pad++) {
      const text = `${"a".repeat(pad)}${emoji.repeat(10)}`;
      for (const out of [clipUnits(text, 9), truncateUnits(text, 9)]) {
        expect(out.length).toBeLessThanOrEqual(9);
        expect(new TextDecoder().decode(new TextEncoder().encode(out))).toBe(out);
      }
    }
    expect(truncateUnits("a".repeat(20), 10)).toBe(`${"a".repeat(7)}...`);
  });
});
