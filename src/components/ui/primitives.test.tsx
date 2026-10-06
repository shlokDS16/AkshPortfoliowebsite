// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { Label } from "./label";
import { Skeleton } from "./skeleton";
import { STATUS_WORD, StatusShape } from "./status-shape";
import { TD, TH, Table } from "./table";
import { Textarea } from "./textarea";
import { Toast, useToast } from "./toast";

describe("restyled shadcn primitives", () => {
  it("use desk tokens only, press-scale and no shadcn ring classes", () => {
    const { container } = render(
      <div>
        {(["default", "outline", "ghost", "link", "destructive"] as const).map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
        <Button size="sm">small</Button>
        <Badge variant="count">3</Badge>
        <Badge variant="secondary">alias</Badge>
        <Label htmlFor="x">Title</Label>
        <Input id="x" aria-invalid />
        <Textarea aria-label="Body" />
        <Kbd>c</Kbd>
        <Skeleton className="h-4 w-20" />
      </div>,
    );
    expectTokenOnly(container);
    expect(container.innerHTML).not.toContain("ring-3");
    expect(screen.getByRole("button", { name: "default" }).className).toContain("active:scale-(--press-scale)");
    expect(screen.getByRole("textbox", { name: "Title" }).className).toContain("text-body");
  });
});

describe("Button link variant", () => {
  it("stays unpadded and auto-height at every size, keeping a coarse-pointer touch target", () => {
    render(
      <div>
        <Button variant="link">default link</Button>
        <Button variant="link" size="sm">
          small link
        </Button>
      </div>,
    );
    for (const name of ["default link", "small link"]) {
      const classes = screen.getByRole("button", { name }).className.split(/\s+/);
      expect(classes).toContain("h-auto");
      expect(classes).toContain("px-0");
      expect(classes).toContain("pointer-coarse:h-11");
      for (const gone of ["h-9", "h-8", "px-4", "px-3"]) expect(classes).not.toContain(gone);
    }
  });
});

describe("StatusShape", () => {
  it("is an ink shape plus a word for every status, never a colour", () => {
    const { container } = render(
      <div>
        <StatusShape status="met" />
        <StatusShape status="watching" />
        <StatusShape status="not_met" />
        <StatusShape status="no_data" />
      </div>,
    );
    for (const word of Object.values(STATUS_WORD)) expect(screen.getByText(word)).toBeInTheDocument();
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("only marks the glyph for the tick-in; the word stays static", () => {
    const { container } = render(<StatusShape status="met" tick index={3} withWord={false} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("status-tick");
    expect(svg?.getAttribute("style")).toContain("--i: 3");
    expect(screen.getByText("Met")).toHaveClass("sr-only");
  });
});

describe("Table", () => {
  it("right-aligns numeric columns with tabular figures", () => {
    render(
      <Table>
        <thead>
          <tr>
            <TH numeric>Value</TH>
          </tr>
        </thead>
        <tbody>
          <tr>
            <TD numeric>1,284</TD>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole("columnheader", { name: "Value" })).toHaveClass("text-right");
    expect(screen.getByRole("cell", { name: "1,284" })).toHaveClass("tabular-nums", "text-right");
  });
});

describe("Toast", () => {
  afterEach(() => vi.useRealTimers());
  it("announces as a polite status and clears after 4 s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current[1]("Saved 14:05 · private note"));
    const { container, rerender } = render(<Toast message={result.current[0]} />);
    const region = container.firstElementChild!;
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveTextContent("Saved 14:05 · private note");
    act(() => vi.advanceTimersByTime(4000));
    rerender(<Toast message={result.current[0]} />);
    expect(region).toBeEmptyDOMElement();
  });
});
