import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import {
  AccessDeniedError,
  AppendOnlyError,
  ItemNotFoundError,
  ItemRuleError,
  PublicItemLockedError,
  ResearchError,
  toResearchError,
} from "./errors";

describe("toResearchError", () => {
  it("maps the item guard (42501 with an items: message) to the locked-item error", () => {
    const error = toResearchError(
      "research.updateItem",
      { code: "42501", message: "items: a public item changes only through publish_revision(); unpublish to edit details" },
      "item-1",
    );
    expect(error).toBeInstanceOf(PublicItemLockedError);
    expect(error.message).toBe("This item is public. Unpublish it before changing its details.");
  });

  it("maps a row-level-security 42501 to access denied, not to the locked-item error", () => {
    const error = toResearchError("research.insertItem", {
      code: "42501",
      message: 'new row violates row-level security policy for table "items"',
    });
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(error.message).not.toMatch(/row-level|items/);
  });

  it("maps check and foreign-key violations (23514, 23503) to a rule error", () => {
    expect(toResearchError("op", { code: "23514", message: 'violates check constraint "items_title_check"' })).toBeInstanceOf(ItemRuleError);
    expect(toResearchError("op", { code: "23503", message: "violates foreign key constraint" })).toBeInstanceOf(ItemRuleError);
  });

  it("maps the append-only trigger (P0001) to the append-only error", () => {
    const error = toResearchError("research.insertRevision", { code: "P0001", message: "item_revisions is append-only: UPDATE is not allowed" });
    expect(error).toBeInstanceOf(AppendOnlyError);
    expect(error.message).toMatch(/append-only/);
  });

  it("maps a missing single row (PGRST116) to not-found", () => {
    expect(toResearchError("op", { code: "PGRST116", message: "0 rows" }, "item-1")).toBeInstanceOf(ItemNotFoundError);
  });

  it("keeps unknown failures as a DbError and never as a screen-safe ResearchError", () => {
    const error = toResearchError("research.getItem", { code: "XX000", message: "connection reset" });
    expect(error).toBeInstanceOf(DbError);
    expect(error).not.toBeInstanceOf(ResearchError);
  });

  it("keeps SQL text out of every typed message", () => {
    const cases = ["42501", "23514", "23503", "P0001", "PGRST116"].map((code) =>
      toResearchError("op", { code, message: "SELECT secret FROM private.settings" }),
    );
    for (const error of cases) expect(error.message).not.toMatch(/SELECT|private\.settings/);
  });
});
