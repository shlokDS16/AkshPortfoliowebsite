# Phase 5a, Tasks 3 and 4: report

Branch `phase-5-distribution` (from c53faea). Not pushed. No migration, no outbound call, no new dependency. Local Supabase only.

Commits:
- `269daff` controller addition 1: `robots.txt` answers from the running environment
- `70f4300` Task 3: print layout, "Save as PDF", desk print banner
- `645c142` Task 4: end-to-end specs, guide (and one fix the specs found, below)
- this report (fourth commit)

## Evidence

| Gate | Result |
|---|---|
| `rtk pnpm test` | 394 files, 5456 tests, all pass |
| `rtk pnpm typecheck` | no errors |
| `rtk pnpm lint` | clean |
| `rtk pnpm build` (local e2e env) | green; `/robots.txt` now listed as dynamic (`ƒ`), `/feed.xml` and `/sitemap.xml` static |
| `pnpm check:bundles` | passed (50 routes; the print button is the only client code added, under 20 lines) |
| `pnpm supabase db reset`, then full `pnpm e2e` | **415 passed, 38 skipped, 0 failed, 19.5 min** (the 38 skips are the tests that belong to another state or viewport, by design; no flake on the final run) |

An earlier full run had two failures, both in my new spec (a long address wraps inside a word on paper, so the PDF text holds a space where the line broke), and one flake in a scratch run (Next's `next-route-announcer` live region appearing between the screen and print snapshots). Both fixed in the test, not hidden; the last full run is clean.

Print samples for the report (Chromium `page.pdf`, A4, from the local seed; `docs/plans/2026-10-15-phase-5a-print-samples/`): `file-kavpump.pdf` (4 pages), `learning-note.pdf`, `process-note.pdf`, `closed-case.pdf` (chart on, no figure), `desk-ledger.pdf` (banner on page 1), `desk-banner-repeats-3-pages.pdf` (the desk items page with 70 filler lines injected by a script, to show the banner in the top margin of pages 2 and 3). I read each as an image. These stand in for "Chrome print preview" screenshots; the preview is the same engine.

## What was built

### Controller addition 1: robots at request time
`src/app/robots.ts` gets `export const dynamic = "force-dynamic"`. It still reads `VERCEL_ENV` only through `serverEnv()` (no `process.env`). Test: the exported `dynamic` value, and the answer follows the environment between two calls (preview, then production). The route shows as dynamic in the build output.

### Task 3: print
- **`src/app/print.css`** (new, loaded by the root layout after `globals.css`; `globals.css` would have passed 450 lines): `@page` A4 with 18 mm 16 mm margins and a "n / m" page number bottom right; `html` at 87.5%; every button hidden except a citation chip (`[data-chip]`); strip drawer, chart/table switch (`[role="radiogroup"]`) and reading hairline hidden; figure, table row, labelled-block header, disclosure not split, headings stay with what follows; closed `details` print their summary only; a source link prints its address after its text; `print-color-adjust: exact` everywhere (without it the VIEW label's light text sat on nothing).
- **Always light.** A4 with 16 mm margins is about 670 px, under the 960 px desk breakpoint, so the one-column layout prints and the rail never does. The only edit to `globals.css`: the OS dark block is now `@media screen and (prefers-color-scheme: dark)`. A reader on a dark system still prints ink on white.
- **Components** (`src/components/desk/`): `print-masthead.tsx`, `print-disclosure.tsx`, `print-button.tsx` (client, 12 lines, `window.print()`), `private/print-banner.tsx`; tests in `print.test.tsx` and `print-pages.test.tsx`; the CSS in `src/app/print.test.ts`.
- **Wiring.** `PublicFrame` takes `printMasthead` and renders it first in `main`, above the strip; top bar, rail, tab bar, phone index, skip link and the revision diff are `print:hidden`. The four printable pages pass the masthead (address from `NEXT_PUBLIC_SITE_URL` and the page's slug; revision and date from the page's own view model; figures-to for files and cases and for a note that has one). "Save as PDF" sits under the dateline on a file, a note, a process note and a case. A source chip carries `data-chip`.
- **Desk.** `DeskShell` holds the banner. A boxed block heads page 1; the same sentence is set in the top margin of every later page through `@page desk` (a block cannot repeat on paper, a margin box does), taken only by the desk wrapper (`[data-desk-print] { page: desk }`). The banner text is one exported constant; a test keeps the CSS copy equal to it. Bars, tabs, strips and the capture dock are `print:hidden`.
- **Decisions** recorded in `docs/design/decisions.md` ("Plan 5a Task 3"), marked delegated and pending Shlok.

### Task 4: end to end
- `e2e/public-distribution.spec.ts`: the state of the run (deploy, a case public, concepts public) is told by the project name (`e2e/support/derived.ts`); what must exist is read back from the live index pages. Feed parsed with `DOMParser` in the page (200, `application/rss+xml; charset=utf-8`, no parser error, channel title, atom self link, 5 to 50 items, guid `/path#rN` with `isPermaLink=false`, RFC date at `+0530`, the fixed line in every item, `derivedProblems` empty on every title and description, `lastBuildDate` equals the newest item, two fetches byte-identical; deploy state has no `/cases/` item; once a case is public its item says "Closed case · written {date}"). Sitemap parsed the same way and compared with the pages found (exact set; deploy state has no `/cases`, `/mistakes`, `/concepts`). Robots: exactly `User-Agent: *` and `Disallow: /` (the production answer stays a unit test). For every route in the sitemap: title, description, canonical, `og:url`, `og:type` (article for the four detail kinds), `twitter:card`, the feed link, exactly one JSON-LD script that parses, no Review/Rating/Offer/FinancialProduct/price, no UUID anywhere in the head, `derivedProblems` empty over title, description and JSON-LD, and in the deploy state no mention of `/cases`, `/concepts` or `/mistakes` in the head or the JSON-LD; every card is a real PNG; a card for an unknown slug is a 404 for each kind that exists in the state.
- `e2e/public-print.spec.ts`: the button is on each printable page, calls `window.print` once, and is hidden in print; the masthead is hidden on screen and shown in print with the address; **on a phone, print adds nothing the screen hides** (every element visible on screen is tagged, print is emulated, and only the masthead, the disclosure and the banner may be new; the chrome is checked absent the other way); a Chromium PDF at A4 of a file, a learning note, a process note and (when public) a case, read with `unpdf`: the full standard disclosure (position word per page kind), "This copy shows revision R{n} of {date}", the address, "Figures to" on a file, `R1` and `R2` from the revision list, no UUID, none of "Save as PDF", "Skip to content", "Find a file", "On this page", the tab labels or the phone index; on a case, `derivedProblems(text)` is empty (rule 10.7); a printed page is the light theme under a dark system.
- `e2e/desk-print.spec.ts` (desk-* projects, admin session): banner hidden on screen, visible in print with the exact sentence, both tab bars, sign-out and the capture dock hidden in print; a desk PDF carries the sentence on page 1.
- `playwright.config.ts`: the `cases-public-*` and `concepts-public-*` projects also run `public-distribution` and `public-print`, so the same checks run in all three states (deploy: `public-*`; one case public; concepts public).
- Guide: new section 4.11 "Sharing your work: PDFs, links and the feed" in `docs/guide/using-the-desk.md` (contents, a line in 4.7, and the "Not in this version" PDF bullet reworded), a "Save a public page as a PDF" block and a reworded last line in `docs/guide/aksh-quick-guide.md`. No banned word.

## A defect the new e2e found, fixed in this task
Index pages (`/`, `/companies`, `/notes`, `/process`, `/about`, and `/cases`, `/mistakes`, `/concepts` when they exist) had **no `og:image`**. A page's own `openGraph` replaces the parent's whole object, images included, so Task 1/2's `pageMetadata` (which sets `openGraph` on every page) dropped the site card that `app/opengraph-image.tsx` gives pages that say nothing about themselves. Detail pages were fine (their card lives in their own segment). Fix: `card()` names the site card (`/opengraph-image`, 1200 by 630, one shared alt constant `SITE_CARD_ALT`) for index routes only; a unit test covers it, and another keeps the alt equal to the one `opengraph-image.tsx` exports. Controller: this changes Task 1/2 code (`seo.ts`, `index.ts`), by one branch.

## New strings, all pending Shlok's approval
Spec s15 wording, as built: button "Save as PDF"; masthead "Aksh Agrawal · Case files" and "This copy shows revision R{n} of {date}. Figures to {date}. The current version is at the address above." (a note: no "Figures to" part); desk banner "Private desk copy. Not for sharing: it has not passed the publish gate and may show figures less than 30 days old." (set twice: a block on page 1 and the top margin of later pages).
New beyond s15: page numbers "n / m" in the bottom-right margin (print only; nothing depends on them); the print-only disclosure for a note naming no company reads "Position in the security discussed: Not disclosed." (standard text, value from the rule's three); the guide's section 4.11 and quick-guide block (plain words, read through; no "proof", "verified", "buy", "sell", "weekly").

## Interpretations and concerns (for Shlok to confirm)
1. **The disclosure is not printed twice.** The plan has a print-only disclosure at the end of every page. A file, a case and a note about a company already show the Disclosure block on screen, and it prints. So the print-only block (`PrintDisclosure`) renders only where the screen shows just the strip: a note that names no company. Every printed page still ends with the full standard text (the PDF test proves it for all four kinds). "Not disclosed" for a note that names no security is the nearest value the standard text allows; Shlok may prefer a different sentence for that case.
2. **The desk banner is in `DeskShell`, not `src/app/desk/layout.tsx`** (the plan's file). One component, one test, and the layout stays a thin server file.
3. **Repeating the banner needs CSS page margin boxes** (the Chromium that Playwright runs: verified; other browsers may show only the page 1 block on a long desk print; not checked). Printing a desk page is not blocked either way.
4. **`.dark` (the class used only by the dev theme switch) is untouched,** so a page forced dark by that class would print dark. Production never sets it; the OS-driven dark block is screen-only.
5. **`print-color-adjust: exact` on everything** means tinted blocks (the strip, the disclosure, the diff colours that survive) print with their fill. Better fidelity, more ink. The page stays white.
6. **A long address in the masthead wraps mid-word** (case slugs are long), so the PDF's text layer has a space at the break; copying the URL from the PDF needs a join. The e2e removes whitespace before comparing.
7. **Process, not data, picks the state in the e2e.** If someone runs the suite twice without `pnpm supabase db reset`, the `public-*` projects see the case and concepts left by the first run and the deploy-state tests fail, as the existing `public-cases` and `public-concepts` specs already do.
