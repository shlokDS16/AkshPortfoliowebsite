import { describe, expect, it } from "vitest";
import { cleanSourceUrl, urlKey } from "./url-key";

const ID = "dQw4w9WgXcQ";

describe("urlKey: YouTube links of every shape become yt:<id>", () => {
  it.each([
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abcDEF123&t=42`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&utm_source=x`,
    `https://m.youtube.com/watch?v=${ID}&feature=share`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `http://www.youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
  ])("%s", (url) => {
    expect(urlKey(url)).toEqual({ key: `yt:${ID}`, kind: "youtube", youtubeId: ID });
  });

  it("does not treat a lookalike host or a channel page as a video", () => {
    expect(urlKey(`https://youtube.com.evil.test/watch?v=${ID}`)).toEqual({ key: `youtube.com.evil.test/watch?v=${ID}`, kind: "web", youtubeId: null });
    expect(urlKey("https://www.youtube.com/@somechannel")).toEqual({ key: "youtube.com/@somechannel", kind: "web", youtubeId: null });
  });
});

describe("urlKey: any other link", () => {
  it("lower-cases the host, drops www., a trailing slash and the fragment", () => {
    expect(urlKey("https://WWW.Example.COM/Blog/Post/#section")?.key).toBe("example.com/Blog/Post");
    expect(urlKey("https://example.com")?.key).toBe("example.com");
    expect(urlKey("https://example.com/")?.key).toBe("example.com");
    expect(urlKey("https://example.com//")?.key).toBe("example.com");
  });

  it("is the same for http and https", () => {
    expect(urlKey("http://example.com/a")?.key).toBe(urlKey("https://example.com/a")?.key);
  });

  it("drops tracking parameters and sorts the rest", () => {
    const messy = "https://example.com/p?utm_source=x&b=2&fbclid=1&a=1&gclid=2&mc_cid=3&mc_eid=4&ref=5&ref_src=6&igshid=7&si=8&UTM_Medium=m";
    expect(urlKey(messy)).toEqual({ key: "example.com/p?a=1&b=2", kind: "web", youtubeId: null });
    expect(urlKey("https://example.com/p?b=2&a=1")?.key).toBe("example.com/p?a=1&b=2");
    expect(urlKey("https://example.com/p?utm_source=x")?.key).toBe("example.com/p");
  });

  it("keeps a parameter that only looks like a tracking one", () => {
    expect(urlKey("https://example.com/p?reference=1&utmx=2")?.key).toBe("example.com/p?reference=1&utmx=2");
  });

  it("keeps a port in the key (a different server)", () => {
    expect(urlKey("https://example.com:8443/a")?.key).toBe("example.com:8443/a");
  });

  it("two links that differ in path case are different (paths are case-sensitive)", () => {
    expect(urlKey("https://example.com/A")?.key).not.toBe(urlKey("https://example.com/a")?.key);
  });
});

describe("urlKey: refusals", () => {
  it.each([
    ["", "empty"],
    ["not a link", "text"],
    ["ftp://example.com/a", "another scheme"],
    ["javascript:alert(1)", "script"],
    ["https://user:pass@example.com/a", "credentials"],
    ["https://user@example.com/a", "a user name"],
    [`https://example.com/${"a".repeat(2000)}`, "over 2,000 characters"],
  ])("%s (%s) is not a source link", (url) => {
    expect(urlKey(url)).toBeNull();
    expect(cleanSourceUrl(url)).toBeNull();
  });
});

describe("cleanSourceUrl: the link as saved, http upgraded to https", () => {
  it("trims and upgrades the scheme only", () => {
    expect(cleanSourceUrl("  http://Example.com/A?x=1#f ")).toBe("https://Example.com/A?x=1#f");
    expect(cleanSourceUrl("https://example.com/a")).toBe("https://example.com/a");
  });
});
