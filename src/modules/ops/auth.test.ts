import { describe, expect, it } from "vitest";
import { isAuthorizedBearer } from "./auth";

const SECRET = "s".repeat(64);

describe("isAuthorizedBearer", () => {
  it("accepts the exact bearer header", () => {
    expect(isAuthorizedBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["missing header", null],
    ["wrong secret", `Bearer ${"x".repeat(64)}`],
    ["no Bearer prefix", SECRET],
    ["a longer header sharing the prefix", `Bearer ${SECRET}x`],
    ["a lower-case scheme", `bearer ${SECRET}`],
  ])("rejects %s", (_label, header) => {
    expect(isAuthorizedBearer(header, SECRET)).toBe(false);
  });

  it.each([[""], ["Bearer"], ["Bearer "], ["Bearer  "]])("rejects the empty or partial header %j against a real secret", (header) => {
    expect(isAuthorizedBearer(header, SECRET)).toBe(false);
  });

  it("rejects everything when the secret is empty", () => {
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
  });
});
