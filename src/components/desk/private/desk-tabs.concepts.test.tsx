// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithMotion } from "@/test/ui";
import { DeskTabs } from "./desk-tabs";

const path = vi.hoisted(() => ({ value: "/desk" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

describe("DeskTabs on the concept and month pages (no sixth tab, D54)", () => {
  it.each(["/desk/concepts", "/desk/concepts/capital-cycle", "/desk/learned"])("%s keeps the Items tab current", (p) => {
    path.value = p;
    renderWithMotion(<DeskTabs names={0} inbox={0} variant="top" />);
    const tabs = screen.getByRole("navigation", { name: "Desk sections" });
    expect(within(tabs).getByRole("link", { name: "Items" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getAllByRole("link")).toHaveLength(5);
  });
});
