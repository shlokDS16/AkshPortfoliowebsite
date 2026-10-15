// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConceptPageView } from "@/modules/knowledge";
import type { ConceptRef } from "@/modules/knowledge/client";
import { expectTokenOnly } from "@/test/ui";
import { ConceptPage } from "./concept-page";

const ref = (id: string, name: string, status: ConceptRef["status"] = "private"): ConceptRef => ({ id, slug: name.toLowerCase().replaceAll(" ", "-"), name, status });
const line = (id: string, kind: string, title: string, createdAt: string) => ({ id, kind, title, createdAt, visibility: "private", status: "draft" });

function view(over: Partial<ConceptPageView> = {}, status: ConceptRef["status"] = "private", descriptionMd: string | null = null): ConceptPageView {
  return { concept: { ...ref("c1", "Capital cycle", status), descriptionMd }, groups: [], related: [], suggestions: [], ...over };
}
const fn = () => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const actions = () => ({ makePublic: fn(), saveDescription: fn(), link: fn(), unlink: fn() });
// A bound server action also receives the form data; the three ids are what matter.
const ids = (m: ReturnType<typeof fn>) => m.mock.calls[0]?.slice(0, 3);

describe("ConceptPage", () => {
  it("a private concept: status in words, Make public, his words in a private box, and a line when nothing links it", () => {
    const { container } = render(<ConceptPage view={view()} screened={[]} {...actions()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Capital cycle" })).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make public" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "In your words" })).toBeInTheDocument();
    expect(screen.getByLabelText("What you mean by Capital cycle")).toHaveValue("");
    expect(screen.getByText("Private. Only you see this.")).toBeInTheDocument();
    expect(screen.getByText("No note or file uses this concept yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Seen together in your notes" })).toBeNull();
    expectTokenOnly(container);
  });

  it("a public concept says when the site shows it and offers no Make public", () => {
    render(<ConceptPage view={view({}, "public")} screened={[]} {...actions()} />);
    expect(screen.getByText("Public: shown on the site once a published note or file uses it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make public" })).toBeNull();
  });

  it("a stub says to check it on Names and offers no Make public", () => {
    render(<ConceptPage view={view({}, "unchecked")} screened={[]} {...actions()} />);
    expect(screen.getByText("Not checked yet. Check it on Names.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check it on Names" })).toHaveAttribute("href", "/desk/names");
    expect(screen.queryByRole("button", { name: "Make public" })).toBeNull();
  });

  it("his description comes back exactly as he wrote it, trailing spaces and all", () => {
    render(<ConceptPage view={view({}, "private", "  Capital goes where returns were high.  \n\nSecond line. ")} screened={[]} {...actions()} />);
    expect((screen.getByLabelText("What you mean by Capital cycle") as HTMLTextAreaElement).value).toBe("  Capital goes where returns were high.  \n\nSecond line. ");
  });

  it("groups in the order given, hides the empty ones, and shows each title as stored with its date", () => {
    render(
      <ConceptPage
        view={view({
          groups: [
            { group: "learning", items: [line("i1", "learning", "  Odd -- title?! ", "2026-10-12T05:00:00Z")] },
            { group: "read", items: [line("i2", "reading_note", "Marks memo", "2026-10-03T05:00:00Z")] },
          ],
        })}
        screened={[]}
        {...actions()}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["In your words", "Learnings", "Reads", "Related concepts"]);
    const link = screen.getByRole("link", { name: /Odd -- title/ });
    expect(link.textContent).toBe("  Odd -- title?! ");
    expect(link).toHaveAttribute("href", "/desk/items/i1");
    expect(screen.getByText("12 Oct 2026")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Process" })).toBeNull();
    expect(screen.queryByText("No note or file uses this concept yet.")).toBeNull();
  });

  it("related concepts: each with a Remove link button that unlinks both ends, and a picker that excludes itself and what is linked", async () => {
    const a = actions();
    const moats = ref("c2", "Moats");
    render(<ConceptPage view={view({ related: [moats] })} screened={[ref("c1", "Capital cycle"), moats, ref("c3", "Rates")]} {...a} />);
    const related = screen.getByRole("heading", { name: "Related concepts" }).closest("section")!;
    expect(within(related).getByRole("link", { name: "Moats" })).toHaveAttribute("href", "/desk/concepts/moats");
    await userEvent.click(within(related).getByRole("button", { name: "Remove link to Moats" }));
    expect(ids(a.unlink)).toEqual(["c1", "c2", "capital-cycle"]);
    const picker = within(related).getByLabelText("Link a concept");
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose a concept", "Rates"]);
    await userEvent.selectOptions(picker, "Rates");
    await userEvent.click(within(related).getByRole("button", { name: "Link" }));
    expect(a.link).toHaveBeenCalledWith("c1", "c3", "capital-cycle");
  });

  it("suggestions are the machine's: labelled, captioned, in the machine face, each with its own Link", async () => {
    const a = actions();
    render(<ConceptPage view={view({ suggestions: [{ concept: ref("c4", "Reflexivity"), shared: 3 }] })} screened={[]} {...a} />);
    const block = screen.getByRole("heading", { name: "Seen together in your notes" }).closest("section")!;
    expect(within(block).getByText("The desk found these in the same notes. Link one only if you see a connection.")).toBeInTheDocument();
    expect(within(block).getByText(/3 notes in common/)).toHaveClass("font-mono");
    await userEvent.click(within(block).getByRole("button", { name: "Link Reflexivity" }));
    expect(ids(a.link)).toEqual(["c1", "c4", "capital-cycle"]);
  });

  it("the suggestions block sits below Related concepts", () => {
    render(<ConceptPage view={view({ suggestions: [{ concept: ref("c4", "Reflexivity"), shared: 2 }] })} screened={[]} {...actions()} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Seen together in your notes")).toBeGreaterThan(headings.indexOf("Related concepts"));
  });

  it("Make public posts once even on a double tap", async () => {
    const a = actions();
    let release!: () => void;
    a.makePublic.mockImplementation(() => new Promise<void>((r) => (release = r)));
    render(<ConceptPage view={view()} screened={[]} {...a} />);
    const button = screen.getByRole("button", { name: "Make public" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(a.makePublic).toHaveBeenCalledTimes(1);
    release();
  });
});
