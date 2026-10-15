// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/modules/ledger/actions";
import { EventForm } from "./event-form";
import { IdeaForm } from "./idea-form";

// D44: the hint rides on the four forms whose words a case study can show (new idea, change of period, close, lesson) and not on
// the ones it never shows (a note, a size change, a withdrawal). It never blocks a submit.

const ACME = { id: "11111111-1111-4111-8111-111111111111", name: "Acme Ltd", symbol: "ACME", needsReview: false };
const action = vi.fn(async (): Promise<FormState> => ({ error: null }));
const HINT = /would keep it off the site/;

describe("the hint while writing sealed words", () => {
  it("shows under the new idea's words for an instruction to act, and not for a clean sentence", async () => {
    render(<IdeaForm companies={[ACME]} action={action} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Why do you think so, and what would change your mind?"));
    await user.paste("Orders are growing faster than the street expects.");
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByText(HINT)).toBeNull();
    await user.clear(screen.getByLabelText("Why do you think so, and what would change your mind?"));
    await user.paste("I will buy more below 500");
    expect(await screen.findByText(HINT)).toBeInTheDocument();
  });

  it.each([
    ["Change the horizon", "revise", true],
    ["Close this idea", "close", true],
    ["Write what I learned", "review", true],
    ["Add a note", "note", false],
  ] as const)("%s (%s): hint %s", async (label, kind, shown) => {
    const allowed = kind === "review" ? (["review"] as const) : (["note", "revise", "close"] as const);
    render(<EventForm ideaId="i" allowed={[...allowed]} voidUntil={null} action={action} />);
    const user = userEvent.setup();
    if (kind !== "review") await user.selectOptions(screen.getByLabelText("What do you want to add?"), kind);
    await user.click(screen.getByLabelText(/./, { selector: "#event-body" }));
    await user.paste("I will buy more below 500");
    if (shown) expect(await screen.findByText(HINT)).toBeInTheDocument();
    else {
      await new Promise((r) => setTimeout(r, 600));
      expect(screen.queryByText(HINT)).toBeNull();
    }
    void label;
  });

  it("does not stop the button from sending the words", async () => {
    render(<EventForm ideaId="i" allowed={["review"]} voidUntil={null} action={action} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/./, { selector: "#event-body" }));
    await user.paste("I will buy more below 500");
    await screen.findByText(HINT);
    await waitFor(() => expect(screen.getByRole("button", { name: /Save what I learned/ })).not.toBeDisabled());
  });
});
