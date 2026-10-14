// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { errorText } from "@/lib/messages";
import { DATABASE_BYTES, STORAGE_BYTES } from "@/modules/documents/client";
import { MB } from "@/test/inbox-fixtures";
import { expectTokenOnly } from "@/test/ui";
import { BudgetMeter } from "./budget-meter";

describe("BudgetMeter", () => {
  const meter = (used: number) => render(<BudgetMeter label="Storage" used={used} limit={STORAGE_BYTES} refuse={errorText("upload-storage-full") ?? undefined} />);

  it("says how much of the real limit is used", () => {
    const { container } = meter(412 * MB);
    expect(screen.getByText(/^Storage/)).toHaveTextContent("Storage 412 MB of 1 GB");
    expect(screen.getByRole("meter", { name: "Storage" })).toHaveAttribute("aria-valuenow", String(412 * MB));
    expect(container.firstElementChild).toHaveAttribute("data-tone", "ok");
    expectTokenOnly(container);
  });

  it("warns from 70% and says what is refused from 90%", () => {
    const { container, unmount } = meter(Math.floor(0.69 * STORAGE_BYTES));
    expect(container.firstElementChild).toHaveAttribute("data-tone", "ok");
    unmount();
    const warn = meter(Math.ceil(0.7 * STORAGE_BYTES));
    expect(warn.container.firstElementChild).toHaveAttribute("data-tone", "warn");
    expect(screen.queryByText(/Mark finished documents/)).toBeNull();
    warn.unmount();
    const bad = meter(Math.ceil(0.9 * STORAGE_BYTES));
    expect(bad.container.firstElementChild).toHaveAttribute("data-tone", "bad");
    expect(screen.getByText("Storage is over 90% full. Mark finished documents as done to free space.")).toBeInTheDocument();
  });

  it("counts the AI allowance in pages, and a spent day is a pause, not an alarm", () => {
    const { container, rerender } = render(<BudgetMeter label="AI pages today:" used={41} limit={44} count />);
    expect(screen.getByText(/^AI pages today:/)).toHaveTextContent("AI pages today: 41 of 44");
    expect(screen.getByRole("meter", { name: "AI pages today" })).toHaveAttribute("aria-valuenow", "41");
    expect(container.firstElementChild).toHaveAttribute("data-tone", "warn");
    rerender(<BudgetMeter label="AI pages today:" used={44} limit={44} count />);
    expect(container.firstElementChild).toHaveAttribute("data-tone", "warn");
    rerender(<BudgetMeter label="AI pages today:" used={10} limit={44} count />);
    expect(container.firstElementChild).toHaveAttribute("data-tone", "ok");
    expectTokenOnly(container);
  });

  it("warns on the database line from 70% of the 500 MB plan", () => {
    const { container } = render(<BudgetMeter label="Database" used={360 * MB} limit={DATABASE_BYTES} />);
    expect(screen.getByText(/^Database/)).toHaveTextContent("Database 360 MB of 500 MB");
    expect(container.firstElementChild).toHaveAttribute("data-tone", "warn");
  });
});
