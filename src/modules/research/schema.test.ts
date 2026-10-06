import { describe, expect, it } from "vitest";
import { errorCode, errorText } from "@/lib/messages";
import { addRevisionInput, BODY_TOO_LONG_MESSAGE, createItemInput } from "./schema";

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
