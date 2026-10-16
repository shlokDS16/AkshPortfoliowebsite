// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildStudiedBlock } from "@/modules/showcase";
import { buildSeedSnapshot, STUDIED_HASH, withStudied } from "@/test/fakes/showcase-snapshot";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { StudiedBlock } from "./studied-block";

const cards = () =>
  buildStudiedBlock(
    withStudied(buildSeedSnapshot(), [
      {},
      { kind: "web", url: "https://blog.example.org/dealers", title: "Dealer finance, explained", siteName: "Example Blog", channelUrl: null, thumbPath: null, thumbSha256: null, note: "Disagrees with me on credit days." },
      { title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, url: "https://youtu.be/zzzzzzzzzzz", note: "" },
    ]),
    "i1",
  );

describe("the file page's 'Other people's work I studied' block", () => {
  it("is a section headed with the fixed title and sub, labelled STUDIED, with one item per source", () => {
    const { container } = render(<StudiedBlock cards={cards()} />);
    const section = container.querySelector("section")!;
    expect(section).toHaveAttribute("aria-labelledby", "studied");
    expect(screen.getByRole("heading", { level: 2, name: "Other people's work I studied" })).toHaveAttribute("id", "studied");
    expect(screen.getByText("STUDIED")).toBeInTheDocument();
    expect(screen.getByText("Videos, articles and letters by others, with my note on each. Linked, not endorsed.")).toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("shows the title in the machine face with its label, and credits YouTube and the channel", () => {
    render(<StudiedBlock cards={cards()} />);
    const title = screen.getByText("How a pump maker finances its dealers");
    expect(title.closest("[data-machine]")).not.toBeNull();
    expect(screen.getByText("Title on YouTube")).toBeInTheDocument();
    expect(screen.getByText("YouTube · Dealer Finance Channel")).toBeInTheDocument();
    expect(screen.getByText("Title on the page")).toBeInTheDocument();
    expect(screen.getByText("Example Blog")).toBeInTheDocument();
    expect(screen.getAllByText("Saved 3 Oct 2026").length).toBeGreaterThan(0);
  });

  it("puts his words under 'My note' in the reading face, never in the machine face", () => {
    render(<StudiedBlock cards={cards()} />);
    const note = screen.getByText("Worth watching for how the dealer book is described.");
    expect(note.closest("[data-machine]")).toBeNull();
    expect(note.className).toContain("text-read");
    expect(screen.getAllByText("My note")).toHaveLength(2); // the third source has no note: no empty label
  });

  it("serves the picture from our own route at 320 by 180, lazy, with the fixed alt text, and only for a shown YouTube title", () => {
    const { container } = render(<StudiedBlock cards={cards()} />);
    const pictures = container.querySelectorAll("img");
    expect(pictures).toHaveLength(1);
    const img = pictures[0]!;
    expect(img).toHaveAttribute("src", `/media/studied/${STUDIED_HASH}.jpg`);
    expect(img).toHaveAttribute("width", "320");
    expect(img).toHaveAttribute("height", "180");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "Thumbnail of the video");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img.closest("[data-studied-picture]")).not.toBeNull();
  });

  it("a card without its title is plain: 'A video on YouTube' or the host, no title, no picture", () => {
    render(<StudiedBlock cards={cards()} />);
    expect(screen.getByText("A video on YouTube")).toBeInTheDocument();
  });

  it("links out with no referrer, nofollow and a new tab said in words", () => {
    render(<StudiedBlock cards={cards()} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
      expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.textContent).toContain("opens in a new tab");
    }
    expect(links[0]).toHaveTextContent(/^Watch on YouTube/);
    expect(links[1]).toHaveTextContent(/^Open the page/);
    expect(links[0]!.className).toContain("min-h-11");
  });

  it("is absent when there is nothing to show", () => {
    const { container } = render(<StudiedBlock cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a hostile title and note as text, never as markup", () => {
    const [card] = cards();
    const { container } = render(<StudiedBlock cards={[{ ...card!, title: "<script>alert(1)</script>", note: "<img src=x onerror=alert(1)>" }]} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1); // only the picture
  });

  it("prints its pictures never: they are marked for the print sheet", () => {
    const { container } = render(<StudiedBlock cards={cards()} />);
    expect(container.querySelector("[data-studied-picture]")!.className).toContain("print:hidden");
  });
});
