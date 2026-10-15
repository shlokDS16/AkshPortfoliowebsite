// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { retryStepAction } from "@/modules/ingestion/actions";
import { REFUSAL_MESSAGES } from "@/modules/valuation/client";
import { RefusedState, StuckState } from "./model-state";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/ingestion/actions", () => ({ retryStepAction: vi.fn(async () => ({ ok: true })) }));

// Spec s8 and the Task 2 review: a read that stopped is shown as needing attention with Try again, never as an endless spinner.
const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";

describe("the model page with no model yet", () => {
  it("stuck: the sentence, Try again (a new pass of the read) and a fixed upload; no busy indicator", async () => {
    render(<StuckState documentId={DOC} message={REFUSAL_MESSAGES.too_slow} />);
    expect(screen.getByText(REFUSAL_MESSAGES.too_slow)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(retryStepAction).toHaveBeenCalledWith(DOC));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Upload a fixed workbook" })).toHaveAttribute("href", "/desk/inbox#upload");
  });

  it("refused: the exact sentence and a fixed upload, no Try again", () => {
    render(<RefusedState message={REFUSAL_MESSAGES.macros} />);
    expect(screen.getByText(REFUSAL_MESSAGES.macros)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: "Upload a fixed workbook" })).toBeInTheDocument();
  });
});
