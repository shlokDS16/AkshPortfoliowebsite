import { describe, expect, it } from "vitest";
import { DbError, dbError, isUniqueViolation, jobDbError, safeErrorText } from "./errors";

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

  it("job code's DbError carries the operation and code only, never the raw Postgres message", () => {
    const error = jobDbError("ingestion.claim", { message: 'Failing row contains (secret, row)', code: "23514" });
    expect(error).toBeInstanceOf(DbError);
    expect(error.message).toBe("ingestion.claim (23514)");
    expect(error.message).not.toContain("secret");
    expect(jobDbError("documents.download", { message: "Object not found" }).message).toBe("documents.download (no code)");
  });
});

describe("safeErrorText (what a heartbeat or a step's last_error may hold)", () => {
  it("reduces any DbError to its operation and code", () => {
    expect(safeErrorText(dbError("ingestion.finish", { message: "value (secret) violates", code: "23514" }))).toBe("ingestion.finish (23514)");
  });

  it("keeps the message of any other error", () => {
    expect(safeErrorText(new Error("This step stopped."))).toBe("This step stopped.");
    expect(safeErrorText("plain")).toBe("plain");
  });
});
