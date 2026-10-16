// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LetterRow } from "@/modules/distribution";
import type { Candidate } from "@/modules/distribution";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { CandidatePicker } from "./candidate-picker";
import { EmailPreview } from "./email-preview";
import { Flash } from "./flash";
import { LetterFields } from "./letter-fields";
import { LetterList } from "./letter-list";

const action = vi.fn(async () => {});

const candidate = (n: number, patch: Partial<Candidate> = {}): Candidate => ({
  itemId: `item-${n}`, visibleFrom: "2026-10-10T05:00:00Z", revisionId: `00000000-0000-4000-8000-00000000000${n}`, kind: "learning", path: `/notes/n${n}`, revNo: 2,
  detail: "Revision R2 · 3 sentences changed", title: `Note ${n} <b>title</b>`, learningObjective: "What a reader learns", changeReason: "I rewrote the second paragraph.",
  holdsPosition: null, companyName: null, ...patch,
});

describe("the list of what changed (spec s8.1 step 2)", () => {
  it("shows every candidate ticked, his words as text and the machine's line apart", () => {
    const { container } = render(<CandidatePicker candidates={[candidate(1), candidate(2, { kind: "file", companyName: "Kaveri Seeds", holdsPosition: "yes", changeReason: null })]} total={2} action={action} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeChecked();
    expect(boxes[0]).toHaveAttribute("name", "revision");
    expect(boxes[0]).toHaveAttribute("value", "00000000-0000-4000-8000-000000000001");
    // His title is text, never markup.
    expect(screen.getByText("Note 1 <b>title</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("“I rewrote the second paragraph.”")).toBeInTheDocument();
    expect(screen.getAllByText("Revision R2 · 3 sentences changed")[0]).toHaveAttribute("data-machine");
    expect(screen.getByText("Position: Yes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make this letter" })).toBeEnabled();
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("each tick can be taken off, and has a name a screen reader can say", async () => {
    render(<CandidatePicker candidates={[candidate(1)]} total={1} action={action} />);
    const box = screen.getByRole("checkbox", { name: /Note 1/ });
    await userEvent.click(box);
    expect(box).not.toBeChecked();
  });

  it("says plainly when nothing is new, and offers no button", () => {
    render(<CandidatePicker candidates={[]} total={0} action={action} />);
    expect(screen.getByText("Nothing new since your last letter.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make this letter" })).toBeNull();
  });

  it("says when more than twenty are waiting", () => {
    render(<CandidatePicker candidates={[candidate(1)]} total={27} action={action} />);
    expect(screen.getByText("Showing 1 of 27. The rest wait for the next letter.")).toBeInTheDocument();
  });
});

describe("the fields of a letter (spec s8.1 step 3)", () => {
  const props = { action, subject: "What changed in October", objective: "Two files moved.", note: "A note.", subjectIsLabel: false, mode: "open" as const };

  it("labels the three fields in his words and stores them as given", () => {
    render(<LetterFields {...props} />);
    expect(screen.getByLabelText("Subject")).toHaveValue("What changed in October");
    expect(screen.getByLabelText("One sentence: what a reader learns")).toHaveValue("Two files moved.");
    expect(screen.getByLabelText("A short note (optional)")).toHaveValue("A note.");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("marks a label plainly as something to replace (binding rule 1)", () => {
    render(<LetterFields {...props} subject="Untitled letter, 16 Oct 2026" subjectIsLabel />);
    const subject = screen.getByLabelText("Subject");
    expect(subject).toHaveValue("Untitled letter, 16 Oct 2026");
    expect(subject).toHaveAccessibleDescription("This is only a label the desk gave. Replace it with your own subject. A letter cannot be sent while it says this.");
  });

  it("says nothing about a label when the subject is his", () => {
    render(<LetterFields {...props} />);
    expect(screen.queryByText(/only a label/)).toBeNull();
  });

  it("on the archive: subject and sentence are frozen with the reason, the note can still be changed", () => {
    render(<LetterFields {...props} mode="public" />);
    expect(screen.getByLabelText("Subject")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("One sentence: what a reader learns")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("A short note (optional)")).not.toHaveAttribute("readonly");
    expect(screen.getByText("This letter is on the archive. Unpublish it to change the subject or the sentence.")).toBeInTheDocument();
  });

  it("sent: nothing can be changed and there is no Save", () => {
    render(<LetterFields {...props} mode="sent" />);
    for (const name of ["Subject", "One sentence: what a reader learns", "A short note (optional)"]) expect(screen.getByLabelText(name)).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("This letter was sent. It cannot be changed.")).toBeInTheDocument();
  });

  it("holds his limits so a paste cannot go past them", () => {
    render(<LetterFields {...props} />);
    expect(screen.getByLabelText("Subject")).toHaveAttribute("maxlength", "120");
    expect(screen.getByLabelText("One sentence: what a reader learns")).toHaveAttribute("maxlength", "300");
    expect(screen.getByLabelText("A short note (optional)")).toHaveAttribute("maxlength", "4000");
  });
});

describe("the email preview (spec s8.1 step 3)", () => {
  const html = '<!doctype html><html><body><p>Hello <script>alert(1)</script></p></body></html>';

  it("is a sandboxed frame with no permissions at all, holding exactly the email", () => {
    const { container } = render(<EmailPreview subject="What changed" preheader="Two files moved." html={html} text={"Plain\nbody"} />);
    const frame = screen.getByTitle("The email, as it will arrive");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", html);
    expect(frame).not.toHaveAttribute("src");
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.getByText("Two files moved.")).toBeInTheDocument();
    expectTokenOnly(container);
  });

  it("offers the plain text part as text, and nothing else is rendered as markup", () => {
    render(<EmailPreview subject="s" preheader="" html={html} text={"Plain <b>body</b>"} />);
    const details = screen.getByText("Plain text part").closest("details")!;
    expect(within(details).getByText("Plain <b>body</b>", { exact: false })).toBeInTheDocument();
    expect(details.querySelector("b")).toBeNull();
  });
});

describe("the letters list", () => {
  const row = (patch: Partial<LetterRow> = {}): LetterRow => ({
    itemId: "i1", title: "What changed in October", visibility: "private", createdAt: "2026-10-16T05:00:00+00:00", sends: [], subjectIsLabel: false, ...patch,
  });

  it("links each letter to its page with its line in words and the day it was made", () => {
    render(<LetterList rows={[row(), row({ itemId: "i2", title: "Earlier", visibility: "public" })]} />);
    expect(screen.getByRole("link", { name: "What changed in October" })).toHaveAttribute("href", "/desk/letters/i1");
    expect(screen.getByText("Private. Not on the archive yet.")).toBeInTheDocument();
    expect(screen.getByText("On the archive. Not sent.")).toBeInTheDocument();
    expect(screen.getAllByText("Made 16 Oct 2026")).toHaveLength(2);
  });

  it("marks a subject that is still a label", () => {
    render(<LetterList rows={[row({ title: "Untitled letter, 16 Oct 2026", subjectIsLabel: true })]} />);
    expect(screen.getByText("Subject still a label")).toBeInTheDocument();
  });

  it("says when there are none and how to start", () => {
    render(<LetterList rows={[]} />);
    expect(screen.getByText("No letters yet. Start from what changed.")).toBeInTheDocument();
  });
});

describe("the message strip", () => {
  it("shows a fixed error as an alert and a notice as status, and nothing for an unknown code", () => {
    const { rerender, container } = render(<Flash error="letter-subject-label" />);
    expect(screen.getByRole("alert")).toHaveTextContent("The subject is still a label.");
    rerender(<Flash notice="letter-saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Letter saved.");
    rerender(<Flash error="made-up" notice="made-up" />);
    expect(container).toBeEmptyDOMElement();
  });
});
