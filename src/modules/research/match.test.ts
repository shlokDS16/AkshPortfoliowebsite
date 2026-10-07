import { describe, expect, it } from "vitest";
import { bodyHoldsText } from "./match";

describe("bodyHoldsText", () => {
  it("matches the whole body or an appended block", () => {
    expect(bodyHoldsText("buy", "buy")).toBe(true);
    expect(bodyHoldsText("first view\n\nbuy more\n", "buy more")).toBe(true);
  });

  it("never matches a short text that only sits inside other words", () => {
    expect(bodyHoldsText("I would buy more today", "buy")).toBe(false);
    expect(bodyHoldsText("ok then\n\nbooked", "ok")).toBe(false);
    expect(bodyHoldsText("anything", "")).toBe(false);
  });
});
