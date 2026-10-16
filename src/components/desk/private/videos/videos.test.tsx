// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VideoListRow, VideoSourceRow } from "@/modules/distribution";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { CaptionDrop } from "./caption-drop";
import { ChaptersPreview } from "./chapters-preview";
import { TranscriptPreview } from "./transcript-preview";
import { VideoList } from "./video-list";
import { VideoStatusLine } from "./video-status-line";
import { YoutubeBlock } from "./youtube-block";

const action = vi.fn(async () => {});
const ID = "dQw4w9WgXcQ";
const source = (patch: Partial<VideoSourceRow> = {}): VideoSourceRow => ({
  id: "s1", itemId: "i1", youtubeId: ID, channelId: "UCx", ownChannel: true, ytTitle: "Reading the ageing table", ytDescription: "0:00 One\n1:00 Two\n2:00 Three\nSome words.",
  durationSeconds: 3725, privacy: "unlisted", ytPublishedAt: "2026-09-24T08:30:00+00:00", fetchedAt: "2026-10-16T06:00:00+00:00", fetchProblem: null, createdAt: "2026-10-15T00:00:00+00:00", ...patch,
});

describe("the YouTube block", () => {
  it("shows what YouTube answered in the machine face, labelled with when it was fetched", () => {
    const { container } = render(<YoutubeBlock source={source()} off={false} itemTitle="Video dQw4" fetchAgain={action} useTitle={action} />);
    expect(screen.getByText("From YouTube, fetched 16 Oct 2026, 11:30")).toBeInTheDocument();
    const machine = container.querySelector("dl")!;
    expect(machine).toHaveTextContent("Reading the ageing table");
    expect(machine).toHaveTextContent("Your channel");
    expect(machine).toHaveTextContent("Unlisted");
    expect(machine).toHaveTextContent("1:02:05");
    expect(machine).toHaveTextContent("24 Sep 2026");
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("offers Fetch again always, and Use this title only when YouTube's title differs from his", () => {
    const { rerender } = render(<YoutubeBlock source={source()} off={false} itemTitle="Video dQw4" fetchAgain={action} useTitle={action} />);
    expect(screen.getByRole("button", { name: "Fetch again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this title" })).toBeInTheDocument();
    rerender(<YoutubeBlock source={source()} off={false} itemTitle="Reading the ageing table" fetchAgain={action} useTitle={action} />);
    expect(screen.queryByRole("button", { name: "Use this title" })).toBeNull();
  });

  it("says another channel and a private video plainly", () => {
    const { container } = render(<YoutubeBlock source={source({ ownChannel: false, privacy: "private" })} off={false} itemTitle="x" fetchAgain={action} useTitle={action} />);
    expect(container.querySelector("dl")).toHaveTextContent("Not your channel");
    expect(container.querySelector("dl")).toHaveTextContent("Private");
  });

  it("while off: nothing, because the status line above already says it once, and no button that cannot work", () => {
    const { container } = render(<YoutubeBlock source={null} off itemTitle="x" fetchAgain={action} useTitle={action} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("before the first answer: Waiting for YouTube, with Fetch again", () => {
    render(<YoutubeBlock source={source({ fetchedAt: null, ytTitle: null })} off={false} itemTitle="x" fetchAgain={action} useTitle={action} />);
    expect(screen.getByText("Waiting for YouTube")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this title" })).toBeNull();
  });

  it("shows YouTube's description as escaped text, never as markup", () => {
    const { container } = render(
      <YoutubeBlock source={source({ ytDescription: "<img src=x onerror=alert(1)><script>alert(1)</script>" })} off={false} itemTitle="x" fetchAgain={action} useTitle={action} />,
    );
    expect(container.querySelector("img, script")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});

describe("the caption drop", () => {
  it("is one labelled file field that takes .vtt and .srt, with one button, and posts nothing but the file", () => {
    const { container } = render(<CaptionDrop action={action} />);
    const input = screen.getByLabelText("Drop the caption file from YouTube Studio (.vtt or .srt).");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("name", "file");
    expect(input).toHaveAttribute("accept", ".vtt,.srt");
    expect(input).toBeRequired();
    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Store transcript" })).toBeInTheDocument();
  });
});

const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ s: i * 30, t: `Segment ${i} text.` }));
const transcript = (n: number) => ({ id: "t1", videoSourceId: "s1", source: "captions_file" as const, fileSha256: null, segments: lines(n), textSha256: "a".repeat(64), words: n * 3, createdAt: "2026-10-16T06:30:00+00:00" });

describe("the transcript preview", () => {
  it("shows the first 20 segments as text in the machine face and the rest behind Show all", () => {
    const { container } = render(<TranscriptPreview transcript={transcript(45)} inRevision={false} useAction={action} />);
    expect(screen.getByText(/Stored 16 Oct 2026, 12:00 · 135 words · 45 segments/)).toBeInTheDocument();
    const shown = container.querySelectorAll("ol[data-first] li");
    expect(shown).toHaveLength(20);
    const more = container.querySelector("details")!;
    expect(within(more).getByText("Show all 45 segments")).toBeInTheDocument();
    expect(more.querySelectorAll("li")).toHaveLength(25);
    expect(container.querySelector("[data-machine]")).not.toBeNull();
    expectTokenOnly(container);
  });

  it("has no Show all for 20 segments or fewer", () => {
    const { container } = render(<TranscriptPreview transcript={transcript(20)} inRevision={false} useAction={action} />);
    expect(container.querySelector("details")).toBeNull();
  });

  it("has no edit field anywhere: the transcript is never editable", () => {
    const { container } = render(<TranscriptPreview transcript={transcript(3)} inRevision={false} useAction={action} />);
    expect(container.querySelector("textarea, input, [contenteditable]")).toBeNull();
  });

  it("offers Use this transcript until it is in the latest revision, then says so", () => {
    const { rerender } = render(<TranscriptPreview transcript={transcript(3)} inRevision={false} useAction={action} />);
    expect(screen.getByRole("button", { name: "Use this transcript" })).toBeInTheDocument();
    rerender(<TranscriptPreview transcript={transcript(3)} inRevision useAction={action} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("This transcript is in the latest revision.")).toBeInTheDocument();
  });

  it("with none stored says so", () => {
    render(<TranscriptPreview transcript={null} inRevision={false} useAction={action} />);
    expect(screen.getByText("No transcript stored yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the chapters preview", () => {
  const current = [{ s: 0, title: "One" }, { s: 60, title: "Two" }, { s: 120, title: "Three" }];

  it("lists the chapters it reads in the YouTube description, each with its time, and offers Use chapters from the description", () => {
    const { container } = render(<ChaptersPreview description={"0:00 One\n1:00 Two\n2:00 Three"} current={[]} useAction={action} />);
    const rows = within(container.querySelector("ol")!).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["0:00One", "1:00Two", "2:00Three"]);
    expect(screen.getByRole("button", { name: "Use chapters from the description" })).toBeInTheDocument();
    expect(container.querySelector("[data-machine]")).not.toBeNull();
  });

  it("says why when the description has no list YouTube would accept, with no button", () => {
    render(<ChaptersPreview description={"0:00 One\n1:00 Two"} current={[]} useAction={action} />);
    expect(screen.getByText("YouTube chapters need at least 3 lines that start with a time.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says the latest revision already has them and drops the button", () => {
    render(<ChaptersPreview description={"0:00 One\n1:00 Two\n2:00 Three"} current={current} useAction={action} />);
    expect(screen.getByText("These chapters are in the latest revision.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("before YouTube has answered there is nothing to read and nothing to press", () => {
    render(<ChaptersPreview description={null} current={[]} useAction={action} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the status line", () => {
  it("is plain words with the tone as a border, never colour alone", () => {
    render(<VideoStatusLine status={{ code: "public-on-youtube", tone: "warn", line: "Public on YouTube but not listed here", detail: "This video is Public on YouTube but not listed here. Check it before sharing." }} long />);
    const el = screen.getByRole("status");
    expect(el).toHaveTextContent("This video is Public on YouTube but not listed here. Check it before sharing.");
    expect(el.className).toContain("border-warn");
  });

  it("short form for the list", () => {
    render(<VideoStatusLine status={{ code: "listed", tone: "ok", line: "Listed", detail: "Listed on the site. You can now make it Public on YouTube." }} />);
    expect(screen.getByText("Listed")).toBeInTheDocument();
  });
});

describe("the list", () => {
  const row = (patch: Partial<VideoListRow> = {}): VideoListRow => ({
    itemId: "i1", title: "Video dQw4", visibility: "private", companyNamed: false, dataAsOf: null, createdAt: "2026-10-15T00:00:00+00:00", source: source(),
    structured: { schema: "video/1", youtubeId: ID, chapters: [] }, latestTranscriptId: null, ...patch,
  });

  it("is one row per video: his title as a link to its page, the status in words, the date added", () => {
    render(<VideoList rows={[row(), row({ itemId: "i2", title: "Another", visibility: "public", structured: { schema: "video/1", youtubeId: ID, transcriptId: "t", transcriptSha: "a", chapters: [] }, latestTranscriptId: "t" })]} off={false} today="2026-10-16" now={Date.parse("2026-10-16T08:00:00Z")} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByRole("link", { name: "Video dQw4" })).toHaveAttribute("href", "/desk/videos/i1");
    expect(items[0]).toHaveTextContent("Not listed: A video needs its transcript before it is listed.");
    expect(items[0]).toHaveTextContent("Added 15 Oct 2026");
    expect(items[1]).toHaveTextContent("Listed");
  });

  it("while off every row says so; with no video it says how to add one", () => {
    const { rerender } = render(<VideoList rows={[row({ source: null })]} off today="2026-10-16" now={0} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Video listing is not set up yet (Shlok adds a YouTube key).");
    rerender(<VideoList rows={[]} off={false} today="2026-10-16" now={0} />);
    expect(screen.getByText("No videos yet. Put v: and a YouTube link in the capture box.")).toBeInTheDocument();
  });
});
