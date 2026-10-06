import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DbError } from "./supabase/errors";
import { InvalidInputError, ItemNotFoundError, PublicItemLockedError } from "./errors";
import { errorCode, errorText, noticeText, userWasTold } from "./messages";

describe("userWasTold", () => {
  it("is true for the errors a screen explains (validation and typed desk errors), so they are not logged", () => {
    expect(userWasTold(new PublicItemLockedError())).toBe(true);
    expect(userWasTold(new z.ZodError([]))).toBe(true);
  });

  it("is false for database and unknown errors, which are logged by shape", () => {
    expect(userWasTold(new DbError("research.getItem", "XX000", "secret text"))).toBe(false);
    expect(userWasTold(new Error("x"))).toBe(false);
  });
});

describe("errorCode and errorText", () => {
  it("maps validation messages and typed errors to fixed codes", () => {
    const result = z.object({ a: z.string("Choose a kind") }).safeParse({});
    expect(errorCode(result.error)).toBe("choose-kind");
    expect(errorCode(new PublicItemLockedError("x"))).toBe("public-item-locked");
    expect(errorCode(new ItemNotFoundError("x"))).toBe("item-not-found");
    expect(errorCode(new InvalidInputError())).toBe("invalid-input");
  });

  it("falls back to a generic code for unknown validation text and for non-typed errors", () => {
    const result = z.object({ a: z.string("some text that is not registered") }).safeParse({});
    expect(errorCode(result.error)).toBe("invalid-input");
    expect(errorCode(new DbError("op", "XX000", "secret"))).toBe("save-failed");
    expect(errorCode("boom")).toBe("save-failed");
  });

  it("shows text for known codes only, never the raw string", () => {
    expect(errorText("title-required")).toBe("Title is required");
    expect(errorText("<script>alert(1)</script>")).toBeNull();
    expect(errorText("Title is required")).toBeNull();
    expect(errorText("constructor")).toBeNull();
    expect(errorText(undefined)).toBeNull();
  });

  it("round-trips: every typed error's code has fixed text equal to its own message", () => {
    for (const error of [new PublicItemLockedError(), new ItemNotFoundError("x"), new InvalidInputError()]) {
      expect(errorText(errorCode(error))).toBe(error.message);
    }
  });
});

describe("noticeText", () => {
  it("returns fixed text for known codes only", () => {
    expect(noticeText("revision-pending-gate")).toMatch(/waiting for the publishing gate/);
    expect(noticeText("details-saved")).toBe("Details saved.");
    expect(noticeText("published")).toBe("Published.");
    expect(noticeText("unpublished")).toMatch(/private again/);
    expect(noticeText("allowance-saved")).toMatch(/Publish again/);
    expect(noticeText("<script>alert(1)</script>")).toBeNull();
    expect(noticeText("constructor")).toBeNull();
    expect(noticeText(undefined)).toBeNull();
  });
});
