// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { EmptyState } from "./empty-state";
import { FileTag, IdMark } from "./id-mark";

describe("numbering marks", () => {
  it("sets IDs in mono; geru for identifiers, muted for test labels", () => {
    const { container } = render(
      <p>
        <IdMark kind="exhibit" value="Ex. 03.1" /> <IdMark kind="test" value="T1" /> <FileTag fileNo="03" revNo={2} />
      </p>,
    );
    expect(screen.getByText("Ex. 03.1")).toHaveClass("font-mono", "text-geru");
    expect(screen.getByText("T1")).toHaveClass("text-ink-muted");
    expect(screen.getByText("FILE 03 · R2")).toHaveClass("file-tag", "bg-geru", "text-on-geru");
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("EmptyState", () => {
  it("says what will appear and shows the column shape", () => {
    render(<EmptyState body="No tests yet." shape={["No.", "Condition", "Status"]} />);
    expect(screen.getByText("No tests yet.")).toBeInTheDocument();
    expect(screen.getByText(/No\. · Condition · Status/)).toHaveTextContent("Will show: No. · Condition · Status");
  });
});
