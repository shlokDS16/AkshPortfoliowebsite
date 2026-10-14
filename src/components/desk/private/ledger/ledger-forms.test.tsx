// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/modules/ledger/actions";
import { eventLine } from "@/modules/ledger/client";
import { event } from "@/test/fixtures/ledger";
import { EventForm } from "./event-form";
import { IdeaForm } from "./idea-form";
import { IdeaTimeline } from "./idea-timeline";

// Task 10 review: the form errors, focus, the pending button, a double submit, the link to a file, and his words at their
// worst (a very long unbroken string, a right-to-left override, combining marks).

const ACME = { id: "11111111-1111-4111-8111-111111111111", name: "Acme Ltd", symbol: "ACME", needsReview: false };
const BETA = { id: "22222222-2222-4222-8222-222222222222", name: "Beta Ltd", symbol: "BETA", needsReview: false };
const ITEM = "55555555-5555-4555-8555-555555555555";
const LABEL = "Why do you think so, and what would change your mind?";

async function fill(user: ReturnType<typeof userEvent.setup>, company = true) {
  if (company) await user.selectOptions(screen.getByLabelText("Company"), ACME.id);
  await user.click(screen.getByLabelText("Expects to do better than the Nifty 50"));
  await user.click(screen.getByLabelText("1 year"));
  await user.click(screen.getByLabelText("No, I do not hold it"));
  await user.click(screen.getByLabelText(LABEL));
  await user.paste("My thesis.");
}

const refuse = (error: FormState["error"]) => vi.fn(async (): Promise<FormState> => ({ error }));

describe("a refusal is tied to its field, announced, and focused (M1)", () => {
  it.each([
    ["ledger-words-required", LABEL, "textarea"],
    ["ledger-body-too-long", LABEL, "textarea"],
    ["ledger-opposite-open", "Company", "select"],
    ["ledger-no-symbol", "Company", "select"],
  ] as const)("%s describes %s", async (code, label, tag) => {
    render(<IdeaForm companies={[ACME, BETA]} action={refuse(code)} />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    const alert = await screen.findByRole("alert");
    const field = screen.getByLabelText(label);
    expect(field.tagName.toLowerCase()).toBe(tag);
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    expect(field).toHaveAttribute("aria-invalid", "true");
    // The other fields are not marked.
    expect(screen.getByLabelText(label === "Company" ? LABEL : "Company")).not.toHaveAttribute("aria-invalid");
  });

  it("a horizon refusal describes the horizon choices and the days box", async () => {
    render(<IdeaForm companies={[ACME]} action={refuse("ledger-bad-horizon")} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Company"), ACME.id);
    await user.click(screen.getByLabelText("Expects to do better than the Nifty 50"));
    await user.click(screen.getByLabelText("A number of days"));
    await user.type(screen.getByLabelText("Days (30 to 3650)"), "5");
    await user.click(screen.getByLabelText("Yes, I hold a position"));
    await user.click(screen.getByLabelText(LABEL));
    await user.paste("Words");
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    const alert = await screen.findByRole("alert");
    expect(screen.getByLabelText("Days (30 to 3650)").getAttribute("aria-describedby")).toContain(alert.id);
    expect(screen.getByRole("group", { name: "Over what horizon?" }).getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("an error about the form as a whole is not hung on one field", async () => {
    render(<IdeaForm companies={[ACME]} action={refuse("ledger-integrity")} />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(LABEL)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Company")).not.toHaveAttribute("aria-invalid");
  });

  it("moves focus to the error after a failed submit, again after a second identical failure", async () => {
    render(<IdeaForm companies={[ACME]} action={refuse("ledger-words-required")} />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    await user.click(screen.getByLabelText(LABEL));
    expect(alert).not.toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("does not take focus on first render, before any submit", () => {
    render(<IdeaForm companies={[ACME]} action={refuse(null)} />);
    expect(document.body).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the entry form ties its refusals the same way", async () => {
    render(<EventForm ideaId={ACME.id} allowed={["note", "revise"]} voidUntil={null} action={refuse("ledger-words-required")} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Your note"));
    await user.paste("x");
    await user.click(screen.getByRole("button", { name: "Add the note" }));
    const alert = await screen.findByRole("alert");
    expect(screen.getByLabelText("Your note").getAttribute("aria-describedby")).toContain(alert.id);
    expect(screen.getByLabelText("Your note")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

describe("the pending button and a double submit (M1)", () => {
  it("is aria-disabled, not disabled, while the save runs; one request even when pressed twice", async () => {
    let release: (s: FormState) => void = () => {};
    const action = vi.fn(() => new Promise<FormState>((resolve) => (release = resolve)));
    render(<IdeaForm companies={[ACME]} action={action} />);
    const user = userEvent.setup();
    await fill(user);
    const button = screen.getByRole("button", { name: "Record the idea" });
    // Two presses in the same tick: the second must not send a second request.
    button.click();
    button.click();
    await waitFor(() => expect(screen.getByRole("button", { name: "Recording..." })).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByRole("button", { name: "Recording..." })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Recording..." }));
    expect(action).toHaveBeenCalledTimes(1);
    release({ error: "ledger-words-required" });
    await screen.findByRole("alert");
    // After the answer the form can be sent again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Record the idea" })).toHaveAttribute("aria-disabled", "false"));
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    expect(action).toHaveBeenCalledTimes(2);
    release({ error: null });
  });

  it("the entry form sends one request for two presses", async () => {
    let release: (s: FormState) => void = () => {};
    const action = vi.fn(() => new Promise<FormState>((resolve) => (release = resolve)));
    render(<EventForm ideaId={ACME.id} allowed={["note"]} voidUntil={null} action={action} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Your note"));
    await user.paste("Once.");
    const button = screen.getByRole("button", { name: "Add the note" });
    button.click();
    button.click();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    release({ error: null });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("the link to a file follows the company (I3)", () => {
  it("fixes the company to the file's, says so, and sends the file with it", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: null }));
    render(<IdeaForm companies={[ACME, BETA]} action={action} companyId={BETA.id} itemId={ITEM} />);
    expect(screen.getByTestId("linked-file")).toHaveTextContent("Linked to the file for Beta Ltd.");
    expect(screen.queryByLabelText("Company")).toBeNull(); // the select is hidden from everyone
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Expects to do better than the Nifty 50"));
    await user.click(screen.getByLabelText("1 year"));
    await user.click(screen.getByLabelText("No, I do not hold it"));
    await user.click(screen.getByLabelText(LABEL));
    await user.paste("Words");
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(data.get("companyId")).toBe(BETA.id);
    expect(data.get("itemId")).toBe(ITEM);
    expect(data.getAll("companyId")).toHaveLength(1);
  });

  it("without a link, the company is a free choice and no file is sent", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: null }));
    render(<IdeaForm companies={[ACME, BETA]} action={action} />);
    expect(screen.queryByTestId("linked-file")).toBeNull();
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(data.has("itemId")).toBe(false);
  });

  it("a link whose company cannot be picked is not sent", () => {
    const stub = { ...BETA, needsReview: true };
    render(<IdeaForm companies={[ACME, stub]} action={vi.fn()} companyId={stub.id} itemId={ITEM} />);
    expect(screen.queryByTestId("linked-file")).toBeNull();
    expect(document.querySelector('input[name="itemId"]')).toBeNull();
  });
});

describe("his words at their worst (layout and order)", () => {
  const show = (body: string) => {
    const { container } = render(<IdeaTimeline events={[eventLine(event({ id: "e1", ideaId: "i", seq: 1, kind: "open", bodyMd: body }))]} />);
    return container.querySelector("[data-words]") as HTMLElement;
  };

  it("10,000 unbroken characters are kept whole and may wrap anywhere", () => {
    const long = "W".repeat(10_000);
    const el = show(long);
    expect(el.textContent).toBe(long);
    expect(el.className).toContain("[overflow-wrap:anywhere]");
    expect(el.className).toContain("whitespace-pre-wrap");
  });

  it("a right-to-left override and combining marks are kept exactly, in a paragraph that isolates its own direction", () => {
    const hostile = "before ‮evil‬ after é́́ ‏⁦x⁩\n\nsecond";
    const el = show(hostile);
    expect(el.textContent).toBe(hostile);
    expect(el.getAttribute("dir")).toBe("auto");
    expect(el.className).toContain("[unicode-bidi:isolate]");
  });

  it("shows markup-looking text as text", () => {
    const el = show("<script>alert(1)</script> [x](javascript:alert(1))");
    expect(el.querySelector("script, a")).toBeNull();
    expect(el.textContent).toBe("<script>alert(1)</script> [x](javascript:alert(1))");
  });
});
