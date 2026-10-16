import { describe, expect, it } from "vitest";
import { embedUrl, formatClock, isoDuration, thumbnailUrl, transcriptPlainText } from "./public";

const ID = "dQw4w9WgXcQ";

describe("the public renderers for a video (pure; the public side may import this file)", () => {
  it("builds the thumbnail address on YouTube's image host and refuses an id that is not eleven safe characters", () => {
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(thumbnailUrl("../x")).toBeNull();
    expect(thumbnailUrl(`${ID}?x=1`)).toBeNull();
  });

  it("builds the privacy-enhanced embed address, with an optional whole-second start", () => {
    expect(embedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(embedUrl(ID, 75)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=75&autoplay=1`);
    expect(embedUrl(ID, 0)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=0&autoplay=1`);
    expect(embedUrl(ID, -5)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(embedUrl(ID, 1.5)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(embedUrl("bad id")).toBeNull();
  });

  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [65, "1:05"],
    [600, "10:00"],
    [3723, "1:02:03"],
    [36000, "10:00:00"],
  ])("formats %s seconds as %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });

  it("formats a negative or fractional number safely", () => {
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(61.9)).toBe("1:01");
  });

  it.each([
    [45, "PT45S"],
    [300, "PT5M"],
    [3600, "PT1H"],
    [3723, "PT1H2M3S"],
    [90061, "PT25H1M1S"],
  ])("writes %s seconds as the ISO 8601 duration %s", (seconds, text) => {
    expect(isoDuration(seconds)).toBe(text);
  });

  it("joins the transcript's segment texts for the page's JSON-LD, without touching a word", () => {
    expect(transcriptPlainText([{ s: 0, t: "Hello <b>world</b>." }, { s: 31, t: "Second line" }])).toBe("Hello <b>world</b>. Second line");
  });
});

describe("the plain link to a moment of a video", () => {
  it("builds a youtube.com watch address with a whole-second start, and refuses an unsafe id", async () => {
    const { watchUrl } = await import("./public");
    expect(watchUrl(ID, 95)).toBe(`https://www.youtube.com/watch?v=${ID}&t=95s`);
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(watchUrl(ID, -1)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(watchUrl("bad id", 5)).toBeNull();
  });
});
