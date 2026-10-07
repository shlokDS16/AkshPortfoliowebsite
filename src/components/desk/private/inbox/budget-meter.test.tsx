// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { errorText } from "@/lib/messages";
import { STORAGE_BYTES } from "@/modules/documents/client";
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
});
