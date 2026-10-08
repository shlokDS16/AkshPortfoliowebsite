import { describe, expect, it } from "vitest";
import { firstLink, hostOf } from "./first-link";

describe("firstLink", () => {
  it.each([
    ["t: $KAVPUMP results https://www.bseindia.com/xml-data/a.pdf worth a read", "https://www.bseindia.com/xml-data/a.pdf"],
    ["see https://example.com/page.", "https://example.com/page"],
    ["(https://example.com/a?b=1&c=2), then", "https://example.com/a?b=1&c=2"],
    ["https://example.com/a and https://other.com/b", "https://example.com/a"],
    ["HTTPS://EXAMPLE.COM/A", "HTTPS://EXAMPLE.COM/A"],
    ["quote: \"https://example.com/q\"", "https://example.com/q"],
  ])("finds the link in %j", (raw, expected) => {
    expect(firstLink(raw)).toBe(expected);
  });

  it.each([
    "no link here",
    "http://example.com/plain",
    "ftp://example.com/x",
    "www.example.com/x",
    "https://",
    "javascript:alert(1)",
    `https://example.com/${"a".repeat(2000)}`,
    "",
  ])("finds none in %j", (raw) => {
    expect(firstLink(raw)).toBeNull();
  });

  it("names the site", () => {
    expect(hostOf("https://www.bseindia.com/a.pdf")).toBe("www.bseindia.com");
  });
});
