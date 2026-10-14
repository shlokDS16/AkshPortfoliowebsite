# Plan 2a errata (2026-10-08)

Corrections to `docs/plans/2026-10-07-phase-2a-ingestion.md` found while building it. The plan text is left as written (append-only); where it disagrees with this file, this file and the code win. The decisions and layout drift are also folded into ADR-004 s4.12.

## Stale references (R20)
| Plan text | What is true |
|---|---|
| `src/lib/providers/fixtures/statement-page.json` | The fixture LLM answer is `src/lib/providers/fixtures/extraction.json` (`[]` until Task 12 filled it). |
| `src/modules/research/queries.ts` "edited" or "exists" | The file is new (Task 12): it holds only `latestFileForCompany`, read-only, allowed by `ingestion.graph.test.ts`. |
| "edit `playwright.config.ts`" / "edit `ops.graph.test.ts`" | Neither edit was needed. `LLM_ADAPTER=fixture` is set by the e2e env builder (`e2e/support/stack.ts`), and `ops.graph.test.ts` stayed as it was. |
| `aiReadingOn` imported from `ops/drain` | `src/modules/ops/jobs.ts` re-exports it; desk code imports `@/modules/ops/jobs`. |
| ADR-004 "Status: Proposed" | ADR-004 is **Accepted** (Shlok, 2026-10-07). |
| Task 4 error codes `duplicate-document`, `too-large`, `not-pdf`, `storage-full`, `upload-missing` | They all carry the `upload-` prefix: `upload-duplicate`, `upload-too-large`, `upload-not-pdf`, `upload-storage-full`, `upload-missing` (`src/lib/messages.ts`). |
| One `src/modules/ingestion/actions.ts` (E1) | A folder, `src/modules/ingestion/actions/` (`upload.ts`, `inbox.ts`, `review.ts`, `staging.ts`, `index.ts`), to keep every file under 300 lines. |
| The upload kick inside `finishUploadAction` (Task 4/5) | The browser calls `kickReadingAction` (`app/desk/inbox/pump-actions.ts`) after `finishUploadAction` returns (E1). |
| Verbatim check in `ingestion` (Task 8) | `src/modules/documents/verbatim.ts`, exported through `documents/client` so the browser pane can use it. |
| Strict-schema helper location | `src/lib/providers/strict-schema.ts`. |
| ETA module | `src/modules/ingestion/eta.ts` (browser-safe, exported through `ingestion/client`). |
| Shared document types | `src/modules/documents/types.ts`. |

## Gaps the plan did not name
- Task 15 needed two helpers the file structure omits: `ingestion/allowance.ts` (AI pages today) and `ingestion/needs-you.ts` (the desk home's cards), plus `e2e/support/desk.ts` (shared e2e helpers: admin client, title lookups, retire, axe in both themes).
- The e2e seed finds its files by title in the database, not on `/desk/items` (which lists the 100 most recently updated items and drops the seeded files after many runs).
- Inbox card grids use `grid-cols-1`: an auto track grew to the longest page line when the page chooser opened and made a phone zoom out (the "pointer intercept" flake of Task 14).
