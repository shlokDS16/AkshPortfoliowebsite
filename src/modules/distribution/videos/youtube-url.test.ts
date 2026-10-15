import { describe, expect, it } from "vitest";
import { parseYoutubeUrl } from "./youtube-url";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeUrl: the four shapes", () => {
  it.each([
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?t=42`],
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&list=PLabc&t=3s`],
    [`https://m.youtube.com/watch?feature=share&v=${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/shorts/${ID}/`],
    [`https://www.youtube.com/live/${ID}?si=abc`],
    [`http://youtu.be/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])("reads %s", (url) => {
    expect(parseYoutubeUrl(url)).toBe(ID);
  });

  it("keeps ids with a hyphen and an underscore", () => {
    expect(parseYoutubeUrl("https://youtu.be/-_abcDEF123")).toBe("-_abcDEF123");
    expect(parseYoutubeUrl("https://www.youtube.com/watch?v=a-b_c-d_e-f")).toBe("a-b_c-d_e-f");
  });
});

describe("parseYoutubeUrl: refusals", () => {
  it.each([
    ["no text", ""],
    ["plain words", "my video"],
    ["another site", `https://vimeo.com/watch?v=${ID}`],
    ["a lookalike suffix", `https://youtube.com.evil.test/watch?v=${ID}`],
    ["a lookalike prefix", `https://evilyoutube.com/watch?v=${ID}`],
    ["a subdomain of an attacker", `https://youtu.be.evil.test/${ID}`],
    ["credentials in the address", `https://user:pw@youtube.com/watch?v=${ID}`],
    ["an odd port", `https://youtube.com:8443/watch?v=${ID}`],
    ["a scheme that is not http", `ftp://youtu.be/${ID}`],
    ["javascript", `javascript:alert(1)//youtu.be/${ID}`],
    ["a short id", "https://youtu.be/abc"],
    ["a long id", `https://youtu.be/${ID}x`],
    ["a bad character in the id", "https://youtu.be/dQw4w9WgXc!"],
    ["watch without v", "https://www.youtube.com/watch"],
    ["a playlist", "https://www.youtube.com/playlist?list=PLabcdefghijk"],
    ["a channel", "https://www.youtube.com/@aksh"],
    ["an embed address", `https://www.youtube.com/embed/${ID}`],
    ["the id inside another path", `https://www.youtube.com/user/${ID}`],
    ["two ids", `https://www.youtube.com/watch?v=${ID}&v=aaaaaaaaaaa`],
  ])("refuses %s", (_label, text) => {
    expect(parseYoutubeUrl(text)).toBeNull();
  });

  it("never throws on an over-long or malformed string", () => {
    expect(parseYoutubeUrl("https://" + "a".repeat(100_000))).toBeNull();
    expect(parseYoutubeUrl("https://[::1")).toBeNull();
  });
});
