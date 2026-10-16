import { describe, expect, it } from "vitest";
import { captureReceipt, insertToken } from "./compose";

const known = { symbols: new Set<string>(), themes: new Set<string>(), ignoredSymbols: new Set<string>(), ignoredThemes: new Set<string>() };
const URL = "https://youtu.be/dQw4w9WgXcQ";

describe("the capture receipt for v:", () => {
  it("says it goes to a private video, without a warning, when the text holds a YouTube video link", () => {
    const model = captureReceipt(`v: ${URL}`, known);
    expect(model.chips[0]).toEqual({ kind: "kind", label: "Video, private" });
    expect(model.warning).toBeNull();
  });

  it("warns before he saves when there is no YouTube video link in it", () => {
    for (const raw of ["v: my video", "v: https://vimeo.com/123456", "v: https://www.youtube.com/@aksh"]) {
      expect(captureReceipt(raw, known).warning, raw).toBe("That is not a YouTube link.");
    }
  });

  it("does not warn about a link on a capture of another kind", () => {
    expect(captureReceipt("l: see https://vimeo.com/123456", known).warning).toBeNull();
  });
});

describe("insertToken v:", () => {
  it("swaps the prefix like the other four keys", () => {
    expect(insertToken("t: margins", 4, "v:")).toEqual({ value: "v: margins", caret: 4 });
    expect(insertToken("v: link", 3, "l:")).toEqual({ value: "l: link", caret: 3 });
    expect(insertToken("https://youtu.be/x", 0, "v:").value).toBe("v: https://youtu.be/x");
  });
});
