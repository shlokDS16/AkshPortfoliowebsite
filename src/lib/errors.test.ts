import { describe, expect, it } from "vitest";
import { DbError } from "./supabase/errors";
import {
  AccessDeniedError,
  AppendOnlyError,
  ItemNotFoundError,
  ItemRuleError,
  PublicItemLockedError,
  DeskError,
  errorShape,
  errorShapeText,
  toDeskError,
} from "./errors";

describe("toDeskError", () => {
  it("maps the item guard (42501 with an items: message) to the locked-item error", () => {
    const error = toDeskError(
      "research.updateItem",
      { code: "42501", message: "items: a public item changes only through publish_revision(); unpublish to edit details" },
      "item-1",
    );
    expect(error).toBeInstanceOf(PublicItemLockedError);
    expect(error.message).toBe("This item is public. Unpublish it before changing its details.");
  });

  it("maps only the frozen-columns guard to the locked-item error; other guard messages are a generic rule error", () => {
    for (const message of [
      "items: only publish_revision() can make an item public",
      "items: published_at is stamped only by publish_revision()",
      "items: only publish_revision() can publish",
    ]) {
      const error = toDeskError("research.insertItem", { code: "42501", message }, "item-1");
      expect(error).toBeInstanceOf(ItemRuleError);
      expect(error.message).not.toMatch(/Unpublish/);
    }
  });

  it("maps a row-level-security 42501 to access denied, not to the locked-item error", () => {
    const error = toDeskError("research.insertItem", {
      code: "42501",
      message: 'new row violates row-level security policy for table "items"',
    });
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(error.message).not.toMatch(/row-level|items/);
  });

  it("maps check and foreign-key violations (23514, 23503) to a rule error", () => {
    expect(toDeskError("op", { code: "23514", message: 'violates check constraint "items_title_check"' })).toBeInstanceOf(ItemRuleError);
    expect(toDeskError("op", { code: "23503", message: "violates foreign key constraint" })).toBeInstanceOf(ItemRuleError);
  });

  it("maps the append-only trigger (P0001) to the append-only error", () => {
    const error = toDeskError("research.insertRevision", { code: "P0001", message: "item_revisions is append-only: UPDATE is not allowed" });
    expect(error).toBeInstanceOf(AppendOnlyError);
    expect(error.message).toMatch(/append-only/);
  });

  it("maps a raised not-found (P0002) to not-found", () => {
    expect(toDeskError("op", { code: "P0002", message: "unpublish_item: item x not found" }, "x")).toBeInstanceOf(ItemNotFoundError);
  });

  it("maps a missing single row (PGRST116) to not-found", () => {
    expect(toDeskError("op", { code: "PGRST116", message: "0 rows" }, "item-1")).toBeInstanceOf(ItemNotFoundError);
  });

  it("keeps unknown failures as a DbError and never as a screen-safe DeskError", () => {
    const error = toDeskError("research.getItem", { code: "XX000", message: "connection reset" });
    expect(error).toBeInstanceOf(DbError);
    expect(error).not.toBeInstanceOf(DeskError);
  });

  it("keeps SQL text out of every typed message", () => {
    const cases = ["42501", "23514", "23503", "P0001", "P0002", "PGRST116"].map((code) =>
      toDeskError("op", { code, message: "SELECT secret FROM private.settings" }),
    );
    for (const error of cases) expect(error.message).not.toMatch(/SELECT|private\.settings/);
  });
});

describe("errorShape", () => {
  it("keeps name, operation and SQLSTATE of a database error, never its message", () => {
    const shape = errorShape(new DbError("research.getItem", "XX000", "secret text"));
    expect(shape).toEqual({ name: "DbError", op: "research.getItem", code: "XX000" });
    expect(JSON.stringify(shape)).not.toContain("secret text");
    expect(errorShapeText(new DbError("research.getItem", "XX000", "secret text"))).toBe("DbError research.getItem XX000");
  });

  it("keeps only the name of any other error, and the type of a non-error", () => {
    expect(errorShape(new TypeError("row data here"))).toEqual({ name: "TypeError" });
    expect(errorShape("boom")).toEqual({ name: "string" });
    expect(errorShapeText(new TypeError("row data here"))).toBe("TypeError");
  });
});
