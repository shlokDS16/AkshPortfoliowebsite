import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";
import { asRecord, isRecord } from "./records";

describe("asRecord / isRecord", () => {
  it("returns plain objects and rejects arrays, null and primitives", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    for (const value of [null, undefined, [1], "x", 3, true]) {
      expect(asRecord(value)).toBeNull();
      expect(isRecord(value)).toBe(false);
    }
  });
});

describe("isUuid", () => {
  it("accepts a UUID and nothing else", () => {
    expect(isUuid("0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e")).toBe(true);
    for (const value of ["nope", "", null, 1, "0b6f3c1e-8a2d-4f5b-9c7e"]) expect(isUuid(value)).toBe(false);
  });
});
