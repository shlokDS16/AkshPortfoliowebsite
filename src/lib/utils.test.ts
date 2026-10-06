import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("treats desk type tokens as font sizes, not colours", () => {
    expect(cn("text-label text-ink-muted")).toBe("text-label text-ink-muted");
    expect(cn("text-read desk:text-read-desk text-ink-body", "text-ink")).toBe("text-read desk:text-read-desk text-ink");
    expect(cn("text-small", "text-read")).toBe("text-read");
    expect(cn("text-mono-inline", "text-geru")).toBe("text-mono-inline text-geru");
  });
});
