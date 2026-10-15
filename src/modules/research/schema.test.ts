import { describe, expect, it } from "vitest";
import { errorCode, errorText } from "@/lib/messages";
import { addRevisionInput, BODY_TOO_LONG_MESSAGE, createItemInput, ITEM_KINDS } from "./schema";

describe("the body limit (R18)", () => {
  it("a revision or new item past 200,000 characters fails with the one message, and the desk shows it", () => {
    const long = "x".repeat(200_001);
    const revision = addRevisionInput.safeParse({ itemId: "7d1c2f0e-5c1a-4f3a-9a5e-2b7f4e8d9c10", bodyMd: long });
    const item = createItemInput.safeParse({ kind: "note", title: "t", bodyMd: long });
    for (const result of [revision, item]) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toContain(BODY_TOO_LONG_MESSAGE);
        expect(errorCode(result.error)).toBe("body-too-long");
      }
    }
    expect(errorText("body-too-long")).toBe(BODY_TOO_LONG_MESSAGE);
  });
});

describe("concept ids on the revision (Phase 4)", () => {
  const a = "7d1c2f0e-5c1a-4f3a-9a5e-2b7f4e8d9c10";
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

  it("reading_note is an item kind", () => {
    expect(ITEM_KINDS).toContain("reading_note");
    expect(createItemInput.parse({ kind: "reading_note", title: "t" }).kind).toBe("reading_note");
  });

  it("conceptIds defaults to null (carry) on a new item and on a revision", () => {
    expect(createItemInput.parse({ kind: "note", title: "t" }).conceptIds).toBeNull();
    expect(addRevisionInput.parse({ itemId: a, bodyMd: "x" }).conceptIds).toBeNull();
  });

  it("takes up to 8 ids and refuses a ninth or a non-id", () => {
    expect(addRevisionInput.safeParse({ itemId: a, bodyMd: "x", conceptIds: ids(8) }).success).toBe(true);
    expect(addRevisionInput.safeParse({ itemId: a, bodyMd: "x", conceptIds: ids(9) }).success).toBe(false);
    expect(createItemInput.safeParse({ kind: "note", title: "t", conceptIds: ids(9) }).success).toBe(false);
    expect(createItemInput.safeParse({ kind: "note", title: "t", conceptIds: ["nope"] }).success).toBe(false);
  });

  it("an empty array is allowed (explicitly no concepts)", () => {
    expect(addRevisionInput.parse({ itemId: a, bodyMd: "x", conceptIds: [] }).conceptIds).toEqual([]);
  });
});
