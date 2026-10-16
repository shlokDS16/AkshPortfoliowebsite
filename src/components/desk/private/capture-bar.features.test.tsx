// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptureBar } from "./capture-bar";
import { CaptureDock } from "./capture-dock";

vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/desk" }));

const known = { symbols: [], themes: [], ignoredSymbols: [], ignoredThemes: [] };

describe("the capture box and the v: key (Phase 5d: own videos are off)", () => {
  it("offers no v: key and does not name v: in its hint by default", () => {
    render(<CaptureBar known={known} />);
    expect(screen.queryByRole("button", { name: "v: video" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.not.stringContaining("v:"));
  });

  it("offers it, and names it, when the page says own videos are on", () => {
    render(<CaptureBar known={known} videoKey />);
    expect(screen.getByRole("button", { name: "v: video" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringContaining("v:"));
  });

  it("the dock takes the same flag for its sheet", () => {
    render(<CaptureDock known={known} videoKey />);
    expect(screen.getByRole("button", { name: /capture/i })).toBeInTheDocument();
  });
});
