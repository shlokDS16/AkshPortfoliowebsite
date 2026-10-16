// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildVideoView, transcriptLines } from "@/modules/showcase";
import { buildSeedSnapshot, VIDEO_SEGMENTS, withVideo } from "@/test/fakes/showcase-snapshot";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { VideoArticle } from "./video-article";
import { VideoIndex } from "./video-index";
import { VideoTranscript } from "./video-transcript";

const SLUG = "v1-reading-the-ageing-table";
const view = () => buildVideoView(withVideo(buildSeedSnapshot()), SLUG)!;
const lines = transcriptLines(VIDEO_SEGMENTS);

describe("the transcript", () => {
  it("is headed, carries the fixed label in the machine face, and shows every segment as text with its clock", () => {
    const { container } = render(<VideoTranscript lines={lines} />);
    expect(screen.getByRole("heading", { level: 2, name: "Transcript" })).toBeInTheDocument();
    const label = screen.getByText("Typed by machine from the video's captions and not edited. If it differs from the video, the video is the record.");
    expect(label.closest("[data-machine]")).not.toBeNull();
    expect(label.closest("[data-lint-exclude]")).not.toBeNull();
    const rows = within(screen.getByRole("region", { name: "Transcript" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["0:00Today we look at how receivables are reported.", "0:30The ageing table is where the story starts.", "1:01:40So the question to carry away is who pays late."]);
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("is a scrollable region a keyboard can reach on screen and prints whole", () => {
    render(<VideoTranscript lines={lines} />);
    const region = screen.getByRole("region", { name: "Transcript" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-y-auto");
    expect(region.className).toContain("print:max-h-none");
    expect(region.className).toContain("print:overflow-visible");
  });

  it("renders a hostile line as text, never as markup", () => {
    const { container } = render(<VideoTranscript lines={[{ s: 0, clock: "0:00", text: "<img src=x onerror=alert(1)> <script>alert(1)</script>" }]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("is not drawn when there is nothing to show", () => {
    const { container } = render(<VideoTranscript lines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the video page", () => {
  it("has one h1, his title and objective as the standfirst, the dateline in the machine face, the player, his words, the transcript", () => {
    const { container } = render(<VideoArticle video={view()} lines={lines} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Reading the ageing table" })).toBeInTheDocument();
    expect(screen.getByText("How to read who pays late.")).toBeInTheDocument();
    expect(screen.getByText("What this teaches")).toBeInTheDocument();
    const dateline = container.querySelector("[data-machine][data-dateline]")!;
    expect(dateline).toHaveTextContent("Revised 25 Sep 2026");
    expect(dateline).toHaveTextContent("1:02:05");
    expect(dateline).toHaveTextContent("Uploaded 24 Sep 2026");
    expect(screen.getByRole("button", { name: /Play video \(loads YouTube\)/ })).toBeInTheDocument();
    expect(screen.getByText("I walk through one ageing table, line by line.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Chapters" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Transcript" })).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("carries the print button once, and the Disclosure block when the video names a company", () => {
    const company = buildVideoView(withVideo(buildSeedSnapshot(), { companyId: "c1", holdsPosition: "no", dataAsOf: "2026-08-22" }), SLUG)!;
    render(<VideoArticle video={company} lines={lines} />);
    expect(screen.getAllByRole("button", { name: "Save as PDF" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Disclosure" })).toBeInTheDocument();
  });

  it("a video with no company prints the standard disclosure instead", () => {
    const { container } = render(<VideoArticle video={view()} lines={lines} />);
    expect(container.querySelector("[data-print-disclosure]")).not.toBeNull();
  });

  it("without a transcript the page still reads, and says nothing about one", () => {
    render(<VideoArticle video={view()} lines={[]} />);
    expect(screen.queryByRole("heading", { name: "Transcript" })).toBeNull();
  });
});

describe("the video index", () => {
  it("lists title as a link, his objective, the revision date and the length, newest first", () => {
    const summaries = [
      { slug: "a", title: "A newer talk", learningObjective: "What a reader learns.", revisedOn: "2026-10-01", durationLabel: "12:04", href: "/videos/a" },
      { slug: "b", title: "An older talk", learningObjective: "Another line.", revisedOn: "2026-09-01", durationLabel: null, href: "/videos/b" },
    ];
    const { container } = render(<VideoIndex videos={summaries} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link", { name: "A newer talk" })).toHaveAttribute("href", "/videos/a");
    expect(rows[0]).toHaveTextContent("Revised 1 Oct 2026 · 12:04");
    expect(rows[1]).toHaveTextContent("Revised 1 Sep 2026");
    expect(rows[1]).not.toHaveTextContent("·");
    expect(container.querySelector("img, iframe")).toBeNull();
    expectTokenOnly(container);
  });
});
