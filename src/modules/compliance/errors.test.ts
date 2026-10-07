import { describe, expect, it } from "vitest";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import { FileStructureError, HandCheckRequiredError } from "./errors";

describe("compliance errors reach the screen as fixed codes", () => {
  it.each([
    [new HandCheckRequiredError(), "hand-check-required"],
    [new FileStructureError(), "file-structure"],
  ] as const)("%s", (error, code) => {
    expect(errorCode(error)).toBe(code);
    expect(errorText(code)).toBe(error.message);
    expect(userWasTold(error)).toBe(true);
  });
});
