// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SealedWordsHint } from "./words-hint";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const settle = () => act(() => void vi.advanceTimersByTime(500));

describe("the hint while writing sealed words (D44)", () => {
  it("says nothing for a clean sentence, but keeps a polite live region ready", async () => {
    const { container } = render(<SealedWordsHint text="Orders are growing faster than the street expects." />);
    await settle();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByText(/would keep it off the site/)).toBeNull();
  });

  it("names the sentence and the rule, and says sealed words cannot be changed", async () => {
    render(<SealedWordsHint text="I will buy more below 500." />);
    await settle();
    expect(screen.getByText("I will buy more below 500.")).toBeInTheDocument();
    expect(screen.getByText(/If this idea is ever shown as a case study, this sentence would keep it off the site \(Rule 1: no actionable language\)\. Sealed words cannot be changed later\./)).toBeInTheDocument();
  });

  it("waits for a pause in typing before it speaks", async () => {
    const { rerender } = render(<SealedWordsHint text="" />);
    rerender(<SealedWordsHint text="I will buy more below 500." />);
    expect(screen.queryByText(/would keep it off the site/)).toBeNull();
    await settle();
    expect(screen.getByText(/would keep it off the site/)).toBeInTheDocument();
  });

  it("goes away when the sentence is fixed", async () => {
    const { rerender } = render(<SealedWordsHint text="I will buy more below 500." />);
    await settle();
    rerender(<SealedWordsHint text="I expect orders to keep growing." />);
    await settle();
    expect(screen.queryByText(/would keep it off the site/)).toBeNull();
  });

  it("shows at most three flagged sentences and counts the rest", async () => {
    render(<SealedWordsHint text={"Sell now.\n\nBuy more.\n\nAccumulate it.\n\nSell the rest.\n\nBuy again."} />);
    await settle();
    expect(screen.getAllByText(/would keep it off the site/)).toHaveLength(3);
    expect(screen.getByText("2 more sentences are flagged in the same way.")).toBeInTheDocument();
  });

  it("is a hint, not an alert: it does not use role alert and never disables anything", async () => {
    render(<SealedWordsHint text="Sell now." />);
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
