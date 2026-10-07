import { describe, expect, it } from "vitest";
import { DbError, dbError, isUniqueViolation } from "./errors";

describe("dbError", () => {
  it("keeps the operation and Postgres code", () => {
    const error = dbError("research.insertItem", { message: "duplicate key", code: "23505" });
    expect(error).toBeInstanceOf(DbError);
    expect(error.message).toBe("research.insertItem: duplicate key");
    expect(error.code).toBe("23505");
  });

  it("recognises unique violations only", () => {
    expect(isUniqueViolation(dbError("x", { message: "dup", code: "23505" }))).toBe(true);
    expect(isUniqueViolation(dbError("x", { message: "rls", code: "42501" }))).toBe(false);
    expect(isUniqueViolation(new Error("23505"))).toBe(false);
  });
});
