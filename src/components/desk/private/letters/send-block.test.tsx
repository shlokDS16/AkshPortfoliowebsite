// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import { sendState, type SendFacts, type SendRow } from "@/modules/distribution";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { SendBlock } from "./send-block";

const send = (patch: Partial<SendRow> = {}): SendRow => ({
  id: "s1", itemId: "i1", revisionId: "r1", kind: "subscribers", status: "approved", approvedAt: "2026-10-16T06:00:00+00:00", claimedAt: null, broadcastId: null,
  recipientsAtApproval: 40, recipientsSent: null, sentAt: null, problem: null, ...patch,
});
const facts = (patch: Partial<SendFacts> = {}): SendFacts => ({ on: true, subjectIsLabel: false, published: true, confirmed: 40, sends: [], ...patch });
const SUBJECT = "What changed in October";

function show(patch: Partial<SendFacts> = {}, props: { testCopy?: boolean; testLine?: string | null } = {}) {
  const approve = vi.fn(async () => {});
  const cancel = vi.fn(async () => {});
  const testCopy = vi.fn(async () => {});
  const state = sendState(facts(patch));
  const view = render(
    <SendBlock
      state={state}
      subject={SUBJECT}
      confirmed={patch.confirmed ?? 40}
      approve={approve}
      cancel={state.control === "cancel" ? cancel : null}
      testCopy={props.testCopy ? testCopy : null}
      testLine={props.testLine ?? null}
    />,
  );
  return { ...view, approve, cancel, testCopy, state };
}
const noSendButtons = () => expect(screen.queryByRole("button", { name: /^(Send|Approve again)/ })).toBeNull();

describe("every state of the send block (spec s8.1, s8.6)", () => {
  it("off: the off line replaces every send control, and the letter still publishes", () => {
    show({ on: false });
    expect(screen.getByRole("status")).toHaveTextContent(LETTERS_OFF_LINE);
    noSendButtons();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("not published: says the gate comes first and offers nothing", () => {
    show({ published: false });
    expect(screen.getByRole("status")).toHaveTextContent("Run the publishing gate first.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ready: 'Send to 40 subscribers', enabled", () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Ready. This is on the archive and goes to 40 subscribers.");
    expect(screen.getByRole("button", { name: "Send to 40 subscribers" })).toBeEnabled();
  });

  it("ready with one reader says subscriber", () => {
    show({ confirmed: 1 });
    expect(screen.getByRole("button", { name: "Send to 1 subscriber" })).toBeEnabled();
  });

  it("approved: the time, and a way to cancel that approval; no Send", async () => {
    const { cancel } = show({ sends: [send()] });
    expect(screen.getByRole("status")).toHaveTextContent("Approved 11:30. It goes out within 15 minutes.");
    noSendButtons();
    await userEvent.click(screen.getByRole("button", { name: "Cancel this approval" }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("sending: the word and nothing to press", () => {
    show({ sends: [send({ status: "sending" })] });
    expect(screen.getByRole("status")).toHaveTextContent("Sending");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sent: how many and when, nothing to press", () => {
    show({ sends: [send({ status: "sent", recipientsSent: 38, sentAt: "2026-10-16T06:20:00+00:00" })] });
    expect(screen.getByRole("status")).toHaveTextContent("Sent to 38 on 16 Oct 2026");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("failed: the reason in plain words, and 'Approve again'", () => {
    show({ sends: [send({ status: "failed", problem: "Resend said no (429)." })] });
    expect(screen.getByRole("status")).toHaveTextContent("Not sent: Resend said no (429).");
    expect(screen.getByRole("button", { name: "Approve again" })).toBeEnabled();
  });

  it("expired: says the approval ran out, and 'Approve again'", () => {
    show({ sends: [send({ status: "expired" })] });
    expect(screen.getByRole("status")).toHaveTextContent("Not sent: the approval ran out after 24 hours.");
    expect(screen.getByRole("button", { name: "Approve again" })).toBeEnabled();
  });

  it("is made of tokens and does not move", () => {
    const { container } = show({}, { testCopy: true });
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("a new letter's subject is only a label (binding rule 1)", () => {
  it("keeps Send disabled, says why next to it, and the dialog cannot be opened", async () => {
    const { approve } = show({ subjectIsLabel: true });
    const button = screen.getByRole("button", { name: "Send to 40 subscribers" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("The subject is still a label. Replace it with your own subject, save, and run the gate again.");
    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  it("the same for 'Approve again' after a failure", () => {
    show({ subjectIsLabel: true, sends: [send({ status: "failed", problem: "x" })] });
    expect(screen.getByRole("button", { name: "Approve again" })).toBeDisabled();
  });

  it("with nobody confirmed the button is disabled and says that instead", () => {
    show({ confirmed: 0 });
    expect(screen.getByRole("button", { name: "Send to 0 subscribers" })).toBeDisabled();
    expect(screen.getByText("There are no confirmed readers yet, so there is nobody to send this to.")).toBeInTheDocument();
  });

  it("a test copy is still offered while the subject is a label (that is how he reads it first)", () => {
    show({ subjectIsLabel: true }, { testCopy: true });
    expect(screen.getByRole("button", { name: "Send me a test copy" })).toBeEnabled();
  });
});

describe("the send dialog (spec s8.1)", () => {
  async function open() {
    const shown = show();
    await userEvent.click(screen.getByRole("button", { name: "Send to 40 subscribers" }));
    const dialog = await screen.findByRole("dialog");
    return { ...shown, dialog };
  }

  it("names the subject and the count, and that an email cannot be called back", async () => {
    const { dialog } = await open();
    expect(within(dialog).getByText(SUBJECT)).toBeInTheDocument();
    expect(within(dialog).getByText("This emails 40 people. An email cannot be called back.")).toBeInTheDocument();
  });

  it("keeps Send off until the preview is ticked, then sends exactly that approval", async () => {
    const { dialog, approve } = await open();
    const send = within(dialog).getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await userEvent.click(send);
    expect(approve).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "I have read the preview" }));
    expect(send).toBeEnabled();
    await userEvent.click(send);
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect((approve.mock.calls[0] as unknown as [FormData])[0].get("read")).toBe("on");
  });

  it("unticking turns Send off again", async () => {
    const { dialog } = await open();
    const tick = within(dialog).getByRole("checkbox", { name: "I have read the preview" });
    await userEvent.click(tick);
    await userEvent.click(tick);
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("a double press makes one approval: the button is off while the first is running", async () => {
    const approve = vi.fn(() => new Promise<void>(() => {}));
    render(<SendBlock state={sendState(facts())} subject={SUBJECT} confirmed={40} approve={approve} cancel={null} testCopy={null} testLine={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Send to 40 subscribers" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "I have read the preview" }));
    const send = within(dialog).getByRole("button", { name: "Send" });
    await userEvent.dblClick(send);
    await waitFor(() => expect(send).toBeDisabled());
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("'Not now' closes it and sends nothing", async () => {
    const { dialog, approve } = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("the test copy", () => {
  it("is one press, to himself, with its own line about the last one", async () => {
    const { testCopy } = show({}, { testCopy: true, testLine: "Test copy sent to you on 16 Oct 2026." });
    expect(screen.getByText("Test copy sent to you on 16 Oct 2026.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send me a test copy" }));
    expect(testCopy).toHaveBeenCalledTimes(1);
  });

  it("is absent when not offered (off, not published, or already sent)", () => {
    show({ on: false });
    expect(screen.queryByRole("button", { name: "Send me a test copy" })).toBeNull();
  });
});
