import { describe, expect, it } from "vitest";
import { videoChecks, videoStatus, type VideoFacts } from "./status";

const NOW = Date.parse("2026-10-16T06:00:00Z");
const ID = "dQw4w9WgXcQ";
const CHAPTERS = [{ s: 0, title: "One" }, { s: 60, title: "Two" }, { s: 120, title: "Three" }];

const facts = (patch: Partial<VideoFacts> = {}): VideoFacts => ({
  off: false,
  source: { youtubeId: ID, ownChannel: true, privacy: "unlisted", fetchedAt: "2026-10-15T06:00:00Z", fetchProblem: null },
  structured: { schema: "video/1", youtubeId: ID, transcriptId: "t-1", transcriptSha: "a".repeat(64), chapters: CHAPTERS },
  latestTranscriptId: "t-1",
  companyNamed: false,
  dataAsOf: null,
  today: "2026-10-16",
  now: NOW,
  listed: false,
  ...patch,
});
/** The record with no transcript in it. */
const noTranscript = () => Object.fromEntries(Object.entries(facts().structured as object).filter(([k]) => k !== "transcriptId" && k !== "transcriptSha"));
const byId = (f: VideoFacts) => Object.fromEntries(videoChecks(f).map((c) => [c.id, c]));

describe("the rule 12 checklist rows", () => {
  it("all pass for a fetched, own-channel, unlisted video with its transcript in the revision and valid chapters", () => {
    expect(videoChecks(facts()).map((c) => [c.id, c.state])).toEqual([["rule-12-1", "pass"], ["rule-12-2", "pass"], ["rule-12-4", "pass"]]);
  });

  it("12.1: never fetched, a record naming another video, another channel, private or gone, and data older than 7 days each fail with the database's own sentence", () => {
    const base = facts().source!;
    const cases: [Partial<VideoFacts>, string][] = [
      [{ source: null }, "YouTube data has not been fetched yet."],
      [{ source: { ...base, fetchedAt: null } }, "YouTube data has not been fetched yet."],
      [{ structured: { ...(facts().structured as object), youtubeId: "AAAAAAAAAAA" } }, "This revision does not match the video's YouTube link."],
      [{ source: { ...base, ownChannel: false } }, "This video is not from your channel."],
      [{ source: { ...base, privacy: "private" } }, "This video is private or gone on YouTube."],
      [{ source: { ...base, privacy: "gone" } }, "This video is private or gone on YouTube."],
      [{ source: { ...base, fetchedAt: "2026-10-09T05:59:00Z" } }, "YouTube data is more than 7 days old. Fetch it again."],
    ];
    for (const [patch, message] of cases) expect(byId(facts(patch))["rule-12-1"], message).toMatchObject({ state: "fail", detail: message });
  });

  it("12.1: exactly seven days old still passes, as in the database", () => {
    const base = facts().source!;
    expect(byId(facts({ source: { ...base, fetchedAt: "2026-10-09T06:00:00Z" } }))["rule-12-1"].state).toBe("pass");
  });

  it("12.2: no transcript in the revision fails with the approved sentence; a newer stored one is a manual note, not a failure", () => {
    const without = noTranscript();
    expect(byId(facts({ structured: without }))["rule-12-2"]).toMatchObject({ state: "fail", detail: "A video needs its transcript before it is listed." });
    expect(byId(facts({ latestTranscriptId: "t-2" }))["rule-12-2"]).toMatchObject({ state: "manual", detail: "A newer transcript is stored. Use it to put it in the next revision." });
  });

  it("12.3: only a video that names a company, and it needs a figures-to date 30 days old", () => {
    expect(byId(facts())["rule-12-3"]).toBeUndefined();
    const sentence = "A video that names a company needs a figures-to date at least 30 days old.";
    expect(byId(facts({ companyNamed: true }))["rule-12-3"]).toMatchObject({ state: "fail", detail: sentence });
    expect(byId(facts({ companyNamed: true, dataAsOf: "2026-10-01" }))["rule-12-3"]).toMatchObject({ state: "fail", detail: sentence });
    expect(byId(facts({ companyNamed: true, dataAsOf: "2026-09-16" }))["rule-12-3"]).toMatchObject({ state: "pass", detail: "Figures to 16 Sep 2026" });
  });

  it("12.4: no chapters is fine; 3 to 100 rising from 0 is fine; two, a late start, a repeat or a missing list fail", () => {
    const sentence = "Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters.";
    const rec = (chapters: unknown) => facts({ structured: { schema: "video/1", youtubeId: ID, transcriptId: "t-1", transcriptSha: "a", chapters } });
    expect(byId(rec([]))["rule-12-4"]).toMatchObject({ state: "pass", detail: "No chapters." });
    expect(byId(rec(CHAPTERS))["rule-12-4"]).toMatchObject({ state: "pass", detail: "3 chapters." });
    for (const bad of [CHAPTERS.slice(0, 2), CHAPTERS.map((c) => ({ ...c, s: c.s + 5 })), [{ s: 0, title: "a" }, { s: 0, title: "b" }, { s: 9, title: "c" }], [{ s: 0, title: "" }, { s: 5, title: "b" }, { s: 9, title: "c" }], undefined]) {
      expect(byId(rec(bad))["rule-12-4"], JSON.stringify(bad)).toMatchObject({ state: "fail", detail: sentence });
    }
  });
});

describe("the status line", () => {
  it("off while no YouTube key is set, before anything else is said", () => {
    expect(videoStatus(facts({ off: true, source: null }))).toMatchObject({ code: "off", line: "Video listing is not set up yet (Shlok adds a YouTube key).", tone: "muted" });
  });

  it("waiting for YouTube until the first fetch has answered", () => {
    const s = facts({ source: { ...facts().source!, fetchedAt: null } });
    expect(videoStatus(s)).toMatchObject({ code: "waiting", line: "Waiting for YouTube", tone: "muted" });
    expect(videoStatus(facts({ source: null }))).toMatchObject({ code: "waiting" });
  });

  it("not listed: the first reason, in the database's words", () => {
    const without = noTranscript();
    expect(videoStatus(facts({ structured: without }))).toMatchObject({ code: "not-listed", line: "Not listed: A video needs its transcript before it is listed." });
    expect(videoStatus(facts({ source: { ...facts().source!, ownChannel: false } }))).toMatchObject({ line: "Not listed: This video is not from your channel." });
  });

  it("not listed with every check passing says the gate has not been run", () => {
    expect(videoStatus(facts())).toMatchObject({ code: "not-listed", line: "Not listed: run the publishing gate.", tone: "muted" });
  });

  it("public on YouTube but not listed here is a warning, in the approved words", () => {
    const s = videoStatus(facts({ source: { ...facts().source!, privacy: "public" } }));
    expect(s).toMatchObject({ code: "public-on-youtube", tone: "warn", line: "Public on YouTube but not listed here" });
    expect(s.detail).toBe("This video is Public on YouTube but not listed here. Check it before sharing.");
  });

  it("listed: 'Listed', and while still Unlisted on YouTube says he can now make it Public", () => {
    const s = videoStatus(facts({ listed: true }));
    expect(s).toMatchObject({ code: "listed", line: "Listed", tone: "ok", detail: "Listed on the site. You can now make it Public on YouTube." });
    expect(videoStatus(facts({ listed: true, source: { ...facts().source!, privacy: "public" } })).detail).toBe("Listed on the site.");
  });

  it("listed but gone from YouTube: the approved warning to unpublish it here", () => {
    expect(videoStatus(facts({ listed: true, source: { ...facts().source!, privacy: "gone" } }))).toMatchObject({
      code: "gone", tone: "bad", line: "This video is no longer on YouTube. Unpublish it here.", detail: "This video is no longer on YouTube. Unpublish it here.",
    });
  });

  it("passed the gate but inside the 30-day lag for a company video: listed from that date", () => {
    const s = videoStatus(facts({ listed: true, companyNamed: true, dataAsOf: "2026-10-01" }));
    expect(s).toMatchObject({ code: "lagged", line: "Passed the gate. Listed from 31 Oct 2026" });
  });
});
