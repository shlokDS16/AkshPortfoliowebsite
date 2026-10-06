import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DbError } from "@/lib/supabase/errors";
import { ItemNotFoundError, PublicItemLockedError } from "./errors";
import { logShape, noticeText, userMessage } from "./messages";

describe("userMessage", () => {
  it("joins distinct validation messages", () => {
    const result = z.object({ a: z.string("Pick a"), b: z.string("Pick a") }).safeParse({});
    expect(result.success).toBe(false);
    expect(userMessage(result.error)).toBe("Pick a");
  });

  it("shows typed research errors as written", () => {
    expect(userMessage(new PublicItemLockedError("x"))).toBe("This item is public. Unpublish it before changing its details.");
    expect(userMessage(new ItemNotFoundError("x"))).toBe("This item could not be found.");
  });

  it("never shows a database or unknown error's text", () => {
    expect(userMessage(new DbError("research.getItem", "XX000", 'relation "private.settings" exploded'))).toBe("Could not save. Try again.");
    expect(userMessage(new Error("SUPABASE_SECRET_KEY=sb_secret_x"))).toBe("Could not save. Try again.");
    expect(userMessage("boom")).toBe("Could not save. Try again.");
  });
});

describe("logShape", () => {
  it("logs op and code for database errors, without the message", () => {
    const shape = logShape(new DbError("research.getItem", "XX000", "secret text"));
    expect(shape).toEqual({ name: "DbError", op: "research.getItem", code: "XX000" });
    expect(JSON.stringify(shape)).not.toContain("secret text");
  });

  it("does not log errors the user was already told about", () => {
    expect(logShape(new PublicItemLockedError())).toBeNull();
    expect(logShape(new z.ZodError([]))).toBeNull();
  });
});

describe("noticeText", () => {
  it("returns fixed text for known codes only", () => {
    expect(noticeText("revision-pending-gate")).toMatch(/waiting for the publishing gate/);
    expect(noticeText("details-saved")).toBe("Details saved.");
    expect(noticeText("<script>alert(1)</script>")).toBeNull();
    expect(noticeText("constructor")).toBeNull();
    expect(noticeText(undefined)).toBeNull();
  });
});
