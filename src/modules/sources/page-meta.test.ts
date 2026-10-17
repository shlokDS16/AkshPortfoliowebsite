import { describe, expect, it } from "vitest";
import { readPageMeta } from "./page-meta";

const page = (head: string, body = "<p>hello</p>") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("readPageMeta: the title and the site name, nothing else", () => {
  it("prefers og:title to <title>, and reads og:site_name", () => {
    const html = page(`<title>Plain title | Site</title><meta property="og:title" content="The real title"><meta property="og:site_name" content="The Site">`);
    expect(readPageMeta(html)).toEqual({ title: "The real title", siteName: "The Site" });
  });

  it("falls back to <title> and has no site name when there is no og:site_name", () => {
    expect(readPageMeta(page("<title>Only a title</title>"))).toEqual({ title: "Only a title", siteName: null });
  });

  it("is null for both when the page has neither", () => {
    expect(readPageMeta(page('<meta name="description" content="x">'))).toEqual({ title: null, siteName: null });
    expect(readPageMeta("")).toEqual({ title: null, siteName: null });
  });

  it("falls back to <title> when og:title is empty or only spaces", () => {
    expect(readPageMeta(page(`<meta property="og:title" content="  "><title>Fallback</title>`)).title).toBe("Fallback");
  });

  it("decodes entities, named and numeric, in the tag and in the attribute", () => {
    const html = page(`<title>Moats &amp; margins &#8217; 2026 &#x2014; part&nbsp;1</title><meta property="og:site_name" content="Tom &amp; Jerry &quot;News&quot;">`);
    expect(readPageMeta(html)).toEqual({ title: "Moats & margins ’ 2026 — part 1", siteName: 'Tom & Jerry "News"' });
  });

  it("collapses spaces and line breaks", () => {
    expect(readPageMeta(page("<title>\n   A\t\tlong \n  title  </title>")).title).toBe("A long title");
  });

  it("removes control characters and invisible direction marks", () => {
    const html = page("<title>A\u0000B\u0007C‮reversed​z﻿</title>");
    expect(readPageMeta(html).title).toBe("A B C reversed z");
  });

  it("reads tags in any case, with single or no quotes, and the name attribute as well as property", () => {
    expect(readPageMeta(`<HEAD><TITLE>Upper</TITLE><META NAME=og:site_name CONTENT=Plain></HEAD>`)).toEqual({ title: "Upper", siteName: "Plain" });
    expect(readPageMeta(`<meta property='og:title' content='Single'>`).title).toBe("Single");
  });

  it("ignores twitter:title and other meta names", () => {
    expect(readPageMeta(page(`<meta name="twitter:title" content="Nope"><meta property="og:description" content="Nope">`))).toEqual({ title: null, siteName: null });
  });

  it("does not read a tag inside a script, a style, a comment or the body", () => {
    const html = page(
      `<script>var s = '<title>Script title</title><meta property="og:title" content="Script og">';</script><style>/* <title>Style</title> */</style><!-- <title>Comment</title> --><title>Head title</title>`,
      `<title>Body title</title><meta property="og:title" content="Body og"><svg><title>Svg title</title></svg>`,
    );
    expect(readPageMeta(html)).toEqual({ title: "Head title", siteName: null });
  });

  it("takes the first of two titles", () => {
    expect(readPageMeta(page("<title>First</title><title>Second</title>")).title).toBe("First");
  });

  it("cuts a long title at 300 characters on a word boundary, marking the cut", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const title = readPageMeta(page(`<title>${words}</title>`)).title ?? "";
    expect(Array.from(title).length).toBeLessThanOrEqual(300);
    expect(title.endsWith("…")).toBe(true);
    expect(words.startsWith(title.slice(0, -1))).toBe(true);
    expect(title.slice(0, -1)).toMatch(/word\d+$/);
  });

  it("counts characters, not UTF-16 units, so the database's 300 limit holds for emoji", () => {
    const title = readPageMeta(page(`<title>${"\u{1F600}".repeat(400)}</title>`)).title ?? "";
    expect(Array.from(title).length).toBeLessThanOrEqual(300);
  });

  it("cuts a site name at 120", () => {
    const site = readPageMeta(page(`<meta property="og:site_name" content="${"s ".repeat(200)}">`)).siteName ?? "";
    expect(Array.from(site).length).toBeLessThanOrEqual(120);
  });

  it("keeps a '>' inside a quoted attribute from ending the tag early", () => {
    expect(readPageMeta(page(`<meta data-x="a>b" property="og:title" content="After">`)).title).toBe("After");
  });
});

describe("readPageMeta is linear on a hostile 512 KB page", () => {
  const SIZE = 512 * 1024;
  const timed = (html: string) => {
    const started = performance.now();
    readPageMeta(html);
    return performance.now() - started;
  };

  it.each([
    ["many unclosed meta tags", "<meta ".repeat(SIZE / 6)],
    ["many tags with an open quote", '<a "'.repeat(SIZE / 4)],
    ["many less-than signs", "<".repeat(SIZE)],
    ["many entity starts", "&#".repeat(SIZE / 2)],
    ["many open comments", "<!--".repeat(SIZE / 4)],
    ["many titles", "<title>x".repeat(SIZE / 8)],
    ["a huge attribute list", `<meta ${"a=b ".repeat(SIZE / 4)}>`],
    ["a huge title of entities", `<title>${"&amp;".repeat(SIZE / 5)}</title>`],
  ])("%s", (_label, html) => {
    expect(timed(html)).toBeLessThan(1500);
  });
});
