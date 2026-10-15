// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatDate } from "@/lib/format";
import { buildCaseStudyView, buildFileView, buildNoteView } from "@/modules/showcase";
import { buildRichSnapshot, buildSeedSnapshot, withLedgerCase } from "@/test/fakes/showcase-snapshot";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { SITE_COUNTS, STREAK } from "@/test/fixtures/desk-ui";
import { mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { CasePage } from "./case/case-page";
import { FileHeader } from "./file-header";
import { NoteArticle } from "./note-article";
import { DeskShell } from "./private/desk-shell";
import { PublicFrame } from "./public-frame";
import { SITE_POSITION, STANDARD_DISCLOSURE } from "./disclosure";
import AboutPage from "@/app/(public)/about/page";
import CasesPage from "@/app/(public)/cases/page";
import FilesPage from "@/app/(public)/companies/page";
import ConceptsPage from "@/app/(public)/concepts/page";
import ConceptRoute from "@/app/(public)/concepts/[slug]/page";
import MistakesPage from "@/app/(public)/mistakes/page";
import NotesPage from "@/app/(public)/notes/page";
import Home from "@/app/(public)/page";
import ProcessPage from "@/app/(public)/process/page";

const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/desk",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => (state.unavailable ? { status: "unavailable" } : { status: "ok", data: state.snapshot }),
}));

// Plan 5a Task 3 wiring: where the button, the masthead and the disclosure sit on each printable page, and which chrome stays off paper.
const seed = buildSeedSnapshot();

describe("Save as PDF sits beside the dateline of each printable page", () => {
  it("file", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    renderWithMotion(<FileHeader file={buildFileView(seed, "kavpump")!} />);
    expect(screen.getAllByRole("button", { name: "Save as PDF" })).toHaveLength(1);
  });

  it("learning note, and a note about no company prints its own disclosure", () => {
    const note = buildNoteView(seed, "learning", "how-to-read-receivable-days")!;
    expect(note.holdsPosition).toBeNull();
    const { container } = render(<NoteArticle note={note} />);
    expect(screen.getAllByRole("button", { name: "Save as PDF" })).toHaveLength(1);
    expect(container.querySelectorAll("[data-print-disclosure]")).toHaveLength(1);
    expect(container.textContent).toContain("Position in the security discussed: stated on each file.");
    expect(container.textContent).not.toContain("Not disclosed");
  });

  it("a note that already shows its Disclosure block does not print a second copy of the sentence", () => {
    const note = { ...buildNoteView(seed, "learning", "how-to-read-receivable-days")!, holdsPosition: "no" as const };
    const { container } = render(<NoteArticle note={note} />);
    expect(container.querySelectorAll("[data-print-disclosure]")).toHaveLength(0);
    expect(container.textContent?.match(/Educational content only\./g)).toHaveLength(1);
  });

  it("closed case", () => {
    const snapshot = withLedgerCase(seed, caseRecordFixture({}), { bodyMd: "## What I would watch next time\n\nThe monsoon signal, earlier." });
    render(<CasePage view={buildCaseStudyView(snapshot, "lc1-a-closed-idea")!} />);
    expect(screen.getAllByRole("button", { name: "Save as PDF" })).toHaveLength(1);
  });
});

describe("what PublicFrame keeps off paper", () => {
  it("hides the top bar, rail, tab bar and the phone index, and puts the masthead first in main", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    renderWithMotion(
      <PublicFrame
        current="files"
        chrome={{ counts: SITE_COUNTS, streak: STREAK }}
        strip={{ variant: "file", holdsPosition: "no", dataAsOf: "2026-08-22" }}
        topBar="file"
        printMasthead={<p data-print-masthead>masthead</p>}
      >
        <h1>Kaveri</h1>
      </PublicFrame>,
    );
    expect(screen.getByRole("banner").className).toMatch(/print:hidden/);
    expect(screen.getByRole("navigation", { name: "Site" }).className).toMatch(/print:hidden/);
    expect(screen.getByRole("navigation", { name: "Main" }).className).toMatch(/print:hidden/);
    const main = screen.getByRole("main");
    expect(main.firstElementChild).toHaveAttribute("data-print-masthead");
  });
});

describe("what the desk keeps off paper", () => {
  it("hides the bars, tabs and strips, and carries the private-copy banner in the page", () => {
    renderWithMotion(
      <DeskShell names={0} inbox={0} liveness={{ status: "ok" }} signOut={async () => {}}>
        <p>body</p>
      </DeskShell>,
    );
    expect(screen.getByRole("banner").className).toMatch(/print:hidden/);
    for (const nav of screen.getAllByRole("navigation", { name: "Desk sections" })) expect(nav.closest(".print\\:hidden")).not.toBeNull();
    expect(document.querySelectorAll("[data-print-banner]")).toHaveLength(1);
  });
});

// Rule 11.4: every printed public page carries the standard disclosure in full; /about already shows it on screen.
describe("index and concept pages print the full standard disclosure", () => {
  const rich = buildRichSnapshot();
  const full = STANDARD_DISCLOSURE(SITE_POSITION, formatDate(rich.today));
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never;
  const pages: [string, () => Promise<React.ReactNode>][] = [
    ["/", () => Home()],
    ["/companies", () => FilesPage()],
    ["/notes", () => NotesPage()],
    ["/process", () => ProcessPage()],
    ["/mistakes", () => MistakesPage()],
    ["/concepts", () => ConceptsPage()],
    ["/concepts/receivable-days", () => ConceptRoute(params("receivable-days"))],
    ["/cases", () => CasesPage()],
  ];

  it.each(pages)("%s has exactly one, with the whole sentence", async (_path, page) => {
    state.snapshot = rich;
    state.unavailable = false;
    const out = renderToStaticMarkup(await page());
    expect(out.match(/data-print-disclosure/g)).toHaveLength(1);
    expect(out.replaceAll("&#x27;", "'")).toContain(full.replaceAll("&", "&amp;"));
  });

  it("the unavailable state prints none, and /about adds none to the one it already shows", async () => {
    state.snapshot = rich;
    state.unavailable = true;
    expect(renderToStaticMarkup(await Home())).not.toContain("data-print-disclosure");
    state.unavailable = false;
    expect(renderToStaticMarkup(await AboutPage())).not.toContain("data-print-disclosure");
  });
});
