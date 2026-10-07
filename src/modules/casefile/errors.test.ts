import { describe, expect, it } from "vitest";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import { FactsSheetError, NoFigureDateError } from "./errors";

describe("casefile errors reach the screen as fixed codes", () => {
  it.each([
    [new FactsSheetError(), "facts-sheet-invalid"],
    [new NoFigureDateError(), "no-figure-date"],
  ] as const)("%s", (error, code) => {
    expect(errorCode(error)).toBe(code);
    expect(errorText(code)).toBe(error.message);
    expect(userWasTold(error)).toBe(true);
  });
});
