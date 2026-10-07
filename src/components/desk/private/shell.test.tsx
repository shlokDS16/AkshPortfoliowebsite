// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectTokenOnly, renderWithMotion } from "@/test/ui";
import { deskQueue, QUEUE_EVENT, resetDeskQueueForTests } from "./desk-queue";
import { DeskShell } from "./desk-shell";
import { LivenessStrip } from "./liveness-strip";
import { OfflineStrip } from "./offline-strip";

vi.mock("next/navigation", () => ({ usePathname: () => "/desk/names" }));
// The queue's send path is a server action; the shell only reads the queue.
vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));

afterEach(() => {
  resetDeskQueueForTests();
  window.localStorage.clear();
});

describe("DeskShell", () => {
  it("marks the surface private, shows Capture · Inbox · Items · Names with the inbox and names counts, and the current tab", () => {
    renderWithMotion(
      <DeskShell names={3} inbox={2} liveness={{ status: "ok" }} signOut={async () => {}}>
        <p>body</p>
      </DeskShell>,
    );
    expect(screen.getByText("private")).toHaveClass("font-mono");
    const tabs = screen.getAllByRole("navigation", { name: "Desk sections" })[0];
    expect(within(tabs).getAllByRole("link").map((l) => l.textContent)).toEqual(["Capture", "Inbox 2", "Items", "Names 3"]);
    expect(within(tabs).getByRole("link", { name: /Names/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveTextContent("body");
    expectTokenOnly(document.body);
  });

  it("renders both bars, top tabs for desktop and bottom tabs for the phone, and sign out", () => {
    renderWithMotion(
      <DeskShell names={0} inbox={0} liveness={{ status: "ok" }} signOut={async () => {}}>
        <p>body</p>
      </DeskShell>,
    );
    expect(screen.getAllByRole("navigation", { name: "Desk sections" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Names" })).toHaveLength(2); // no count when zero
    expect(screen.getAllByRole("link", { name: "Inbox" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("places the capture dock in the top bar", () => {
    renderWithMotion(
      <DeskShell names={0} inbox={0} liveness={{ status: "ok" }} signOut={async () => {}} capture={<button type="button">Capture dock</button>}>
        <p>body</p>
      </DeskShell>,
    );
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Capture dock" })).toBeInTheDocument();
  });
});

describe("LivenessStrip", () => {
  it("is absent when everything ran", () => {
    const { container } = render(<LivenessStrip state={{ status: "ok" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names what is late, says notes are safe and that Shlok and Aksh were emailed; no dismiss control", () => {
    render(<LivenessStrip state={{ status: "late", problems: ["the 15-minute pump last ran 5 h ago", "the daily job has never run"] }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-testid", "health-strip");
    expect(alert).toHaveTextContent(
      "Background jobs are late: the 15-minute pump last ran 5 h ago; the daily job has never run. Your notes are safe; documents wait until the jobs run. The uptime monitor has emailed Shlok and Aksh.",
    );
    expect(within(alert).queryByRole("button")).toBeNull();
    expect(alert).toHaveClass("bg-bad-wash", "border-bad");
  });

  it("says plainly when the database cannot be reached, with a fixed text", () => {
    render(<LivenessStrip state={{ status: "unreachable" }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The database cannot be reached right now. New captures stay saved on this device and sync when it is back.");
    expect(document.body.textContent).not.toContain("hunter2");
  });
});

describe("OfflineStrip", () => {
  const setOnline = (value: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });

  it("appears offline with the number of notes held on this phone", () => {
    setOnline(false);
    deskQueue().queue.enqueue({ clientId: "a", rawText: "note", source: "mobile", queuedAt: "2026-10-06T03:00:00Z" });
    render(<OfflineStrip />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline. 1 note is saved on this phone and will sync when you are back online. Nothing is lost.");
  });

  it("follows the queue while offline", () => {
    setOnline(false);
    render(<OfflineStrip />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline. New notes are saved on this phone and will sync when you are back online. Nothing is lost.");
    for (const id of ["a", "b"]) deskQueue().queue.enqueue({ clientId: id, rawText: id, source: "web", queuedAt: "2026-10-06T03:00:00Z" });
    act(() => window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { kind: "enqueued" } })));
    expect(screen.getByRole("status")).toHaveTextContent("Offline. 2 notes are saved on this phone");
  });

  it("is absent online", () => {
    setOnline(true);
    const { container } = render(<OfflineStrip />);
    expect(container).toBeEmptyDOMElement();
  });
});
