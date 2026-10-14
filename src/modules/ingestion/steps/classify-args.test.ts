import { describe, expect, it } from "vitest";
import { PAGE_KINDS } from "../prompts";
import { CHOOSING_FAILED } from "../trays";
import { CHOOSING_FAILED as FROM_STEP } from "./classify-pages";
import { classifyArgsSchema } from "./classify-args";

// Plan 2b Task 8 carries (e) and (f): one list of page kinds and one sentence for a stuck page choice.
describe("classify step arguments", () => {
  it("accepts every page kind the prompt knows and nothing else", () => {
    for (const kind of PAGE_KINDS) {
      expect(classifyArgsSchema.safeParse({ pages: [3], accepted: [{ pageNo: 3, kind, basis: null, score: 30 }] }).success).toBe(true);
    }
    expect(classifyArgsSchema.safeParse({ pages: [3], accepted: [{ pageNo: 3, kind: "cover", basis: null, score: 30 }] }).success).toBe(false);
  });

  it("uses the tray's own sentence when the arguments cannot be read", () => {
    expect(FROM_STEP).toBe(CHOOSING_FAILED);
  });
});
