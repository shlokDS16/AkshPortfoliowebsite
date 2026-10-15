// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { VideoPlayer } from "./video-player";

const ID = "dQw4w9WgXcQ";
const CHAPTERS = [
  { s: 0, clock: "0:00", title: "Why receivables" },
  { s: 95, clock: "1:35", title: "Reading the ageing table" },
  { s: 3725, clock: "1:02:05", title: "What to ask next" },
];
const props = { youtubeId: ID, title: "Reading the ageing table", thumbnail: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`, durationLabel: "1:02:05", chapters: CHAPTERS };

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("the click-to-load player (D79)", () => {
  it("before the press loads nothing from YouTube but the thumbnail: no iframe, no script, a plain img with its size", () => {
    const { container } = render(<VideoPlayer {...props} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", props.thumbnail);
    expect(img).toHaveAttribute("width", "480");
    expect(img).toHaveAttribute("height", "360");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    // The only address in the markup that is not this site's own: the image host and the plain watch links (a link loads nothing).
    const hosts = [...container.querySelectorAll("[src],[href]")].map((el) => new URL(el.getAttribute("src") ?? el.getAttribute("href")!).host);
    expect(new Set(hosts)).toEqual(new Set(["i.ytimg.com", "www.youtube.com"]));
    expect(container.innerHTML).not.toContain("youtube-nocookie.com");
  });

  it("names the button with the approved words and shows the length beside it", () => {
    render(<VideoPlayer {...props} />);
    const button = screen.getByRole("button", { name: /Play video \(loads YouTube\)/ });
    expect(button).toHaveTextContent("1:02:05");
    expect(button).toHaveAttribute("type", "button");
  });

  it("on the press mounts one privacy-enhanced iframe, titled, and takes focus into it", () => {
    const { container } = render(<VideoPlayer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Play video/ }));
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${ID}?start=0&autoplay=1`);
    expect(frames[0]).toHaveAttribute("title", "Reading the ageing table (YouTube video)");
    expect(frames[0]).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    expect(frames[0]).toHaveAttribute("allowfullscreen");
    expect(frames[0]).toHaveFocus();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: /Play video/ })).toBeNull();
  });

  it("is a still image box of a fixed shape both before and after, so nothing moves when the frame arrives", () => {
    const { container } = render(<VideoPlayer {...props} />);
    const box = container.querySelector("[data-player-box]")!;
    const before = box.className;
    fireEvent.click(screen.getByRole("button", { name: /Play video/ }));
    expect(container.querySelector("[data-player-box]")!.className).toBe(before);
    expect(before).toContain("aspect-video");
  });
});

describe("the chapters", () => {
  it("are a labelled list of times in the machine face and his titles as links, one per chapter, in order", () => {
    render(<VideoPlayer {...props} />);
    const list = screen.getByRole("list", { name: "Chapters" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["0:00Why receivables", "1:35Reading the ageing table", "1:02:05What to ask next"]);
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", `https://www.youtube.com/watch?v=${ID}&t=95s`);
    expect(rows[1]).toHaveAttribute("id", "chapter-95");
    expect(rows[1].querySelector("[data-machine]")).toHaveTextContent("1:35");
  });

  it("start the player at that second, once loaded: the press loads the frame at the chapter and brings the player into view", () => {
    const { container } = render(<VideoPlayer {...props} />);
    fireEvent.click(screen.getByRole("link", { name: /Reading the ageing table/ }));
    expect(container.querySelector("iframe")).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${ID}?start=95&autoplay=1`);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("move a loaded player to another chapter by reloading the frame at its start", () => {
    const { container } = render(<VideoPlayer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Play video/ }));
    fireEvent.click(screen.getByRole("link", { name: /What to ask next/ }));
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(container.querySelector("iframe")).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${ID}?start=3725&autoplay=1`);
  });

  it("leave the page's own link behaviour alone for a modified click, and are absent when the video has none", () => {
    const { container } = render(<VideoPlayer {...props} />);
    document.addEventListener("click", (e) => e.preventDefault(), { once: true }); // jsdom cannot navigate; the ordinary link is left to the browser
    fireEvent.click(screen.getByRole("link", { name: /Why receivables/ }), { metaKey: true });
    expect(container.querySelector("iframe")).toBeNull();
    const none = render(<VideoPlayer {...props} chapters={[]} />);
    expect(none.container.querySelector("#chapters-heading")).toBeNull();
  });
});

describe("print and tokens", () => {
  it("hides the player in print and keeps the chapters; uses tokens only; no motion", () => {
    const { container } = render(<VideoPlayer {...props} />);
    expect(container.querySelector("[data-player]")!.className).toContain("print:hidden");
    expect(container.querySelector("ol")!.closest(".print\\:hidden")).toBeNull();
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});
