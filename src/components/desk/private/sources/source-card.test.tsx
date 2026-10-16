// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { errorText } from "@/lib/messages";
import { GONE_TEXT, PROBLEM_TEXT, type SourceRecord } from "@/modules/sources/client";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { SourceCard, type CardActions, type CardModel } from "./source-card";

const record = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e", url: "https://www.youtube.com/watch?v=abcdefghijk", kind: "youtube", youtubeId: "abcdefghijk",
  note: "Why the bull case is thin.", createdAt: "2026-10-03T05:00:00Z", archivedAt: null, title: "How a pump maker finances its dealers", siteName: "Dealer Finance Channel",
  channelUrl: "https://www.youtube.com/@dealerfinance", thumbPath: `yt/${"a".repeat(64)}.jpg`, thumbSha256: "a".repeat(64), metaSha: "b".repeat(64), metaSince: "2026-10-14T05:00:00Z",
  fetchedAt: "2026-10-14T05:00:00Z", checkedAt: "2026-10-14T05:00:00Z", gone: false, fetchProblem: null, fetchAttempts: 1, companyIds: ["c1"], themeIds: ["t1"], ...over,
});
const model = (over: Partial<SourceRecord> = {}, rest: Partial<CardModel> = {}): CardModel => ({
  record: record(over), companies: [{ id: "c1", label: "Kaveri Pumps", hint: "KAVPUMP", slug: "kavpump" }], concepts: [{ id: "t1", label: "Moats", hint: null, slug: "moats" }],
  publicFiles: [], ...rest,
});
const actions = (): CardActions => ({
  readAgain: vi.fn(async () => ({ ok: true as const, id: "x", result: "read" as const })),
  archive: vi.fn(async () => ({ ok: true as const, id: "x", answer: "" })),
  restore: vi.fn(async () => ({ ok: true as const, id: "x", answer: "" })),
  update: vi.fn(async () => ({ ok: true as const, id: "x", answer: "" })),
});
const options = { companies: [{ id: "c1", label: "Kaveri Pumps", hint: "KAVPUMP" }], concepts: [{ id: "t1", label: "Moats", hint: null }] };
const card = (m: CardModel, a: CardActions = actions()) => <SourceCard model={m} actions={a} {...options} />;

describe("a source card", () => {
  it("shows what YouTube answered in the machine face, labelled with whose it is and when it was read", () => {
    const { container } = render(card(model()));
    const label = screen.getByText("From YouTube, read 14 Oct 2026");
    expect(label.closest("[data-machine]")).not.toBeNull();
    expect(screen.getByText("How a pump maker finances its dealers").closest("[data-machine]")).not.toBeNull();
    expect(screen.getByText("Dealer Finance Channel").closest("[data-machine]")).not.toBeNull();
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("labels a page's data as the page's", () => {
    render(card(model({ kind: "web", youtubeId: null, url: "https://blog.example.org/dealers", title: "Dealer finance, explained", siteName: "Example Blog", thumbPath: null, thumbSha256: null, channelUrl: null })));
    expect(screen.getByText("From the page, read 14 Oct 2026")).toBeInTheDocument();
  });

  it("keeps his note in the reading face, apart from the machine's block", () => {
    render(card(model()));
    const note = screen.getByText("Why the bull case is thin.", { selector: "p" });
    expect(note.closest("[data-machine]")).toBeNull();
    expect(screen.getByText("My note", { selector: "p" })).toBeInTheDocument();
  });

  it("shows the picture through the desk's own route, at a fixed size, lazily", () => {
    const { container } = render(card(model()));
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/desk/sources/0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e/thumb");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "Thumbnail of the video");
    expect(img).toHaveAttribute("width", "160");
    expect(img).toHaveAttribute("height", "90");
  });

  it("has no picture and no machine block for a link not read yet, and says it is being read", () => {
    const { container } = render(card(model({ title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, metaSha: null, metaSince: null, fetchedAt: null, checkedAt: null })));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-machine]")?.textContent ?? "").not.toMatch(/read \d/);
    expect(screen.getByText("Reading the link")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it.each(Object.entries(PROBLEM_TEXT))("says a failed read in its fixed sentence (%s)", (code, text) => {
    render(card(model({ fetchProblem: code as keyof typeof PROBLEM_TEXT })));
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("says a video is gone and that the public file hides it", () => {
    render(card(model({ gone: true }), actions()));
    expect(screen.getByText(GONE_TEXT)).toBeInTheDocument();
  });

  it("says it is on the public file and leads to the file", () => {
    render(card(model({}, { publicFiles: [{ itemId: "i1", title: "Kaveri Pumps: does pricing power survive" }] })));
    expect(screen.getByText("On the public file")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kaveri Pumps: does pricing power survive" })).toHaveAttribute("href", "/desk/items/i1");
    expect(screen.queryByText("Private")).toBeNull();
  });

  it("lists the companies and concepts it is attached to, as links that filter the list", () => {
    render(card(model()));
    expect(screen.getByRole("link", { name: "$KAVPUMP" })).toHaveAttribute("href", "/desk/sources?company=kavpump");
    expect(screen.getByRole("link", { name: "#moats" })).toHaveAttribute("href", "/desk/sources?concept=moats");
  });

  it("opens the saved link in a new tab with no referrer", () => {
    render(card(model()));
    const link = screen.getByRole("link", { name: /youtube\.com\/watch/ });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abcdefghijk");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders a hostile title as text, never markup", () => {
    const { container } = render(card(model({ title: "<script>alert(1)</script><img src=x onerror=alert(1)>" })));
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});

describe("the card's actions", () => {
  it("'Read again' asks the server once and, if the cooldown holds, says so in the fixed words", async () => {
    const a = actions();
    a.readAgain = vi.fn(async () => ({ ok: false as const, error: "source-read-recent" as const }));
    render(card(model(), a));
    await userEvent.click(screen.getByRole("button", { name: "Read again" }));
    expect(a.readAgain).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(errorText("source-read-recent")!);
  });

  it("'Archive' asks the server, and an archived card offers 'Restore' instead", async () => {
    const a = actions();
    const { unmount } = render(card(model(), a));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(a.archive).toHaveBeenCalledTimes(1);
    unmount();
    render(card(model({ archivedAt: "2026-10-15T05:00:00Z" }), a));
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(a.restore).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("an archive refused because the source is on the public file says why", async () => {
    const a = actions();
    a.archive = vi.fn(async () => ({ ok: false as const, error: "source-on-public-file" as const }));
    render(card(model(), a));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("It is on the public file. Save a revision without it first.");
  });

  it("'Edit' opens his note and the attachments, and saves exactly what is in the form", async () => {
    const a = actions();
    render(card(model(), a));
    const details = screen.getByText("Edit note and attachments").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Edit note and attachments"));
    const box = within(details).getByRole("textbox", { name: "My note" });
    expect(box).toHaveValue("Why the bull case is thin.");
    await userEvent.clear(box);
    await userEvent.type(box, "Changed my mind.");
    await userEvent.click(within(details).getByRole("button", { name: "Remove Moats" }));
    await userEvent.click(within(details).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(a.update).toHaveBeenCalledTimes(1));
    const sent = (a.update as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FormData;
    expect(sent.get("note")).toBe("Changed my mind.");
    expect(sent.getAll("companyId")).toEqual(["c1"]);
    expect(sent.getAll("themeId")).toEqual([]);
    // The machine's data is never in the form.
    expect([...sent.keys()].sort()).toEqual(["companyId", "note"]);
  });
});
