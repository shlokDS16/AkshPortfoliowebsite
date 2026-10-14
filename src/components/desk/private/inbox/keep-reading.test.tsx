// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_PAUSE_MS, KeepReading, SLICE_PAUSE_MS } from "./keep-reading";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
// Next hands back the same router object on every render; the mock does too.
vi.mock("next/navigation", () => {
  const router = { refresh: () => mocks.refresh() };
  return { useRouter: () => router };
});

beforeEach(() => mocks.refresh.mockReset());
afterEach(() => vi.useRealTimers());

describe("KeepReading", () => {
  const visible = (state: "visible" | "hidden") => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  afterEach(() => visible("visible"));

  async function tick(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("asks, refreshes, waits 3 s and asks again while the last slice found work, then slows down", async () => {
    vi.useFakeTimers();
    visible("visible");
    const keepReading = vi.fn().mockResolvedValueOnce({ more: true }).mockResolvedValue({ more: false });
    render(<KeepReading keepReading={keepReading} active />);
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await tick(SLICE_PAUSE_MS - 1);
    expect(keepReading).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(keepReading).toHaveBeenCalledTimes(2);
    await tick(SLICE_PAUSE_MS * 3);
    expect(keepReading).toHaveBeenCalledTimes(2); // nothing ran last time: only a slow check now
    await tick(IDLE_PAUSE_MS);
    expect(keepReading).toHaveBeenCalledTimes(3);
  });

  it("asks nothing while the tab is hidden, and asks at once when it comes back", async () => {
    vi.useFakeTimers();
    visible("hidden");
    const keepReading = vi.fn().mockResolvedValue({ more: true });
    render(<KeepReading keepReading={keepReading} active />);
    await tick(10_000);
    expect(keepReading).not.toHaveBeenCalled();
    visible("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no document is being read, and stops when the last one finishes", async () => {
    vi.useFakeTimers();
    const keepReading = vi.fn().mockResolvedValue({ more: true });
    const { rerender, unmount } = render(<KeepReading keepReading={keepReading} active={false} />);
    await tick(5_000);
    expect(keepReading).not.toHaveBeenCalled();
    rerender(<KeepReading keepReading={keepReading} active />);
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
    rerender(<KeepReading keepReading={keepReading} active={false} />);
    await tick(10_000);
    expect(keepReading).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("a refresh hands over a new function every time: it must not restart the loop or skip the pause", async () => {
    vi.useFakeTimers();
    const first = vi.fn().mockResolvedValue({ more: false });
    const { rerender } = render(<KeepReading keepReading={first} active />);
    await tick(0);
    expect(first).toHaveBeenCalledTimes(1);
    const second = vi.fn().mockResolvedValue({ more: false });
    rerender(<KeepReading keepReading={second} active />);
    await tick(0);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    await tick(IDLE_PAUSE_MS);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1); // the next slice uses the newest function
  });

  it("keeps going when a slice throws", async () => {
    vi.useFakeTimers();
    const keepReading = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue({ more: false });
    render(<KeepReading keepReading={keepReading} active />);
    await tick(0);
    expect(keepReading).toHaveBeenCalledTimes(1);
    await tick(IDLE_PAUSE_MS);
    expect(keepReading).toHaveBeenCalledTimes(2);
  });
});
