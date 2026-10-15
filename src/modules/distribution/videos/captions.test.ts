import { describe, expect, it } from "vitest";
import { parseCaptions } from "./captions";

const bytes = (text: string) => new TextEncoder().encode(text);
const REFUSAL = "This is not a caption file. In YouTube Studio choose Subtitles, then Download, then .vtt or .srt.";

const AUTO = [
  "WEBVTT",
  "Kind: captions",
  "Language: en",
  "",
  "00:00:00.160 --> 00:00:02.230 align:start position:0%",
  " ",
  "hello everyone<00:00:00.800><c> welcome</c><00:00:01.200><c> to</c>",
  "",
  "00:00:02.230 --> 00:00:02.240 align:start position:0%",
  "hello everyone welcome to",
  " ",
  "",
  "00:00:02.240 --> 00:00:04.000 align:start position:0%",
  "hello everyone welcome to",
  "the<00:00:02.800><c> channel</c>",
  "",
  "00:00:04.000 --> 00:00:04.010 align:start position:0%",
  "the channel",
  " ",
  "",
].join("\n");

describe("parseCaptions: WebVTT", () => {
  it("collapses an automatic caption's repeated lines and strips its timing tags", () => {
    const out = parseCaptions(bytes(AUTO), "auto.en.vtt");
    expect(out).toEqual({ ok: true, segments: [{ s: 0, t: "hello everyone welcome to the channel" }] });
  });

  it("reads a manual file with identifiers, NOTE blocks, voice tags and positioning", () => {
    const vtt = [
      "WEBVTT - a title",
      "",
      "NOTE this block is not a cue",
      "",
      "intro",
      "00:00:01.000 --> 00:00:03.000 line:90%",
      "<v Aksh>I   read the <i>annual report</i>.</v>",
      "",
      "STYLE",
      "::cue { color: red }",
      "",
      "00:00:03.500 --> 00:00:05.000",
      "{\\an8}It said &amp; showed &lt;3 things.",
      "",
    ].join("\r\n");
    const out = parseCaptions(bytes(vtt), "manual.vtt");
    expect(out).toEqual({ ok: true, segments: [{ s: 1, t: "I read the annual report. It said & showed <3 things." }] });
  });

  it("accepts a byte-order mark and minute-only timestamps", () => {
    const out = parseCaptions(bytes("﻿WEBVTT\n\n01:02.900 --> 01:04.000\nHello there.\n"), "x.vtt");
    expect(out).toEqual({ ok: true, segments: [{ s: 62, t: "Hello there." }] });
  });

  it("merges cues into segments of about thirty seconds and floors each start", () => {
    const cue = (a: string, b: string, text: string) => `${a} --> ${b}\n${text}\n`;
    const vtt = `WEBVTT\n\n${[
      cue("00:00:00.900", "00:00:05.000", "one"),
      cue("00:00:10.000", "00:00:12.000", "two"),
      cue("00:00:29.900", "00:00:31.000", "three"),
      cue("00:00:31.500", "00:00:33.000", "four"),
      cue("00:01:01.000", "00:01:02.000", "five"),
    ].join("\n")}`;
    const out = parseCaptions(bytes(vtt), "x.vtt");
    expect(out).toEqual({
      ok: true,
      segments: [
        { s: 0, t: "one two three" },
        { s: 31, t: "four" },
        { s: 61, t: "five" },
      ],
    });
  });

  it("never lets a start go back, even when the file's cues are out of order", () => {
    const vtt = "WEBVTT\n\n00:00:40.000 --> 00:00:41.000\nlate\n\n00:00:05.000 --> 00:00:06.000\nearly in the file, later in time\n\n00:01:20.000 --> 00:01:21.000\nthird\n";
    const out = parseCaptions(bytes(vtt), "x.vtt");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (let i = 1; i < out.segments.length; i++) expect(out.segments[i].s).toBeGreaterThanOrEqual(out.segments[i - 1].s);
  });

  it("splits a segment that would pass 500 characters, so every segment fits the database limit", () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const lines = Array.from({ length: 40 }, (_, i) => `00:00:${String(i).padStart(2, "0")}.000 --> 00:00:${String(i).padStart(2, "0")}.900\n${words.slice(i * 60, i * 60 + 60) || "x"}`);
    const out = parseCaptions(bytes(`WEBVTT\n\n${lines.join("\n\n")}\n`), "x.vtt");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.segments.length).toBeGreaterThan(1);
    for (const seg of out.segments) {
      expect(seg.t.length).toBeGreaterThanOrEqual(1);
      expect(seg.t.length).toBeLessThanOrEqual(500);
      expect(Object.keys(seg).sort()).toEqual(["s", "t"]);
    }
  });

  it("splits one over-long cue on word boundaries, and a single unbroken run by length", () => {
    const long = "abc ".repeat(300).trim();
    const a = parseCaptions(bytes(`WEBVTT\n\n00:00:00.000 --> 00:00:09.000\n${long}\n`), "x.vtt");
    expect(a.ok && a.segments.every((s) => s.t.length <= 500 && !s.t.startsWith(" ") && !s.t.endsWith(" "))).toBe(true);
    const b = parseCaptions(bytes(`WEBVTT\n\n00:00:00.000 --> 00:00:09.000\n${"x".repeat(1200)}\n`), "x.vtt");
    expect(b.ok && b.segments.map((s) => s.t.length)).toEqual([500, 500, 200]);
  });
});

describe("parseCaptions: SubRip", () => {
  it("reads numbered cues with comma milliseconds and CRLF", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>First</i> line\r\nsecond line\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nThird.\r\n";
    expect(parseCaptions(bytes(srt), "x.srt")).toEqual({ ok: true, segments: [{ s: 1, t: "First line second line Third." }] });
  });

  it("collapses a consecutive duplicate line", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nYes.\n\n2\n00:00:02,500 --> 00:00:03,000\nYes.\n\n3\n00:00:04,000 --> 00:00:05,000\nNo.\n";
    expect(parseCaptions(bytes(srt), "x.srt")).toEqual({ ok: true, segments: [{ s: 1, t: "Yes. No." }] });
  });
});

describe("parseCaptions: refusals", () => {
  const refused = (data: Uint8Array | string, name = "x.vtt") => parseCaptions(typeof data === "string" ? bytes(data) : data, name);

  it.each([
    ["an empty file", ""],
    ["plain prose", "This is just a paragraph about a company."],
    ["an HTML page", "<!DOCTYPE html><html><body>00:00:01.000 --> 00:00:02.000 hi</body></html>"],
    ["a web page saved with a .vtt name", "<html><head></head><body>WEBVTT</body></html>"],
    ["a header and no cue", "WEBVTT\n\nNOTE nothing here\n"],
    ["a TTML document", '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="2s">hi</p></div></body></tt>'],
    ["a SubViewer file", "[INFORMATION]\n[TITLE]\n00:00:01.00,00:00:02.00\nhello\n"],
    ["JSON", '{"events":[{"tStartMs":0}]}'],
  ])("refuses %s with the plain sentence", (_label, text) => {
    expect(refused(text)).toEqual({ ok: false, reason: REFUSAL });
  });

  it("refuses a binary file (NUL bytes, invalid UTF-8)", () => {
    expect(refused(new Uint8Array([0x57, 0x45, 0x42, 0x56, 0x54, 0x54, 0x0a, 0x00, 0xff, 0xfe]))).toEqual({ ok: false, reason: REFUSAL });
    expect(refused(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toEqual({ ok: false, reason: REFUSAL });
  });

  it("refuses a name that is not .vtt or .srt", () => {
    expect(refused("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n", "captions.html")).toEqual({ ok: false, reason: REFUSAL });
    expect(refused("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n", "noextension")).toEqual({ ok: false, reason: REFUSAL });
  });

  it("refuses more than 1 MB without reading it, with its own sentence", () => {
    expect(refused(new Uint8Array(1_048_577).fill(65))).toEqual({ ok: false, reason: "This file is too big for a caption file (1 MB at most)." });
    expect(refused(new Uint8Array(1_048_576).fill(65))).toEqual({ ok: false, reason: REFUSAL });
  });

  it("refuses more than 5,000 cues", () => {
    const cues = Array.from({ length: 5001 }, (_, i) => `00:00:00.${String(i % 1000).padStart(3, "0")} --> 00:00:01.000\nline ${i}`);
    expect(refused(`WEBVTT\n\n${cues.join("\n\n")}\n`)).toEqual({ ok: false, reason: "This caption file is too long (5,000 cues at most)." });
  });

  it("stores caption text as text: markup in a cue is removed or kept as plain characters, never returned as a tag", () => {
    const out = refused("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<script>alert(1)</script>hello <b>bold</b>\n");
    expect(out).toEqual({ ok: true, segments: [{ s: 1, t: "alert(1)hello bold" }] });
  });
});
