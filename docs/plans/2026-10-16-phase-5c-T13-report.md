# Phase 5c Task 13 report: desk letters and readers screens

Built by desk-ui (sonnet), 2026-10-16. Branch `phase-5c-letters`, code commit `24d927d` on `11deb4f`, then the e2e and this report. Not pushed. Local Supabase only.
Nothing was sent: no test pressed Send, "Send me a test copy" or "Send confirmation emails", and no approval row was written by this task. The unit fetch
guard (`src/test/no-outbound.ts`) and the e2e outbound guard (`e2e/support/outbound.ts`, installed in the new spec) were used as they are and not edited.

## Built
**Routes** (all call `requireAdmin()` first; every button's action checks it again on the server)
- `/desk/letters`: every letter, newest first, one line from its send rows, "Subject still a label" where it applies.
- `/desk/letters/new`: the public changes since the last letter, each ticked, a plain form (works without a script); "Make this letter".
- `/desk/letters/[id]`: his three fields, the email preview (an iframe with `srcdoc` and `sandbox=""`, plus the plain text part), the publish checklist with
  four rule 13 rows, the recorded decision, and the send block with its dialog. Phone order is the order of the work (write, read, publish, send); on a wide
  screen the gate and the send block sit in a right rail, so tab order equals visual order.
- `/desk/letters/readers`: counts, the waiting list, "Send confirmation emails", "Bin", "Erase an address", the sign-up switch.
- `/desk/items/[id]` sends a letter to `/desk/letters/[id]` with its message (like a video), so every redirect that names an item by id keeps working.
- No sixth tab: the Items tab stays current on every letters route; the Items page has a "Letters" link; each letters page has three links between them.
- Desk home: the Monday line (a link to `/desk/letters/new`). It reads nothing on any other day.

**Module additions** (`src/modules/distribution/letters/`, all under 300 lines, exported through the index)
- `subject.ts`: the label and `isPlaceholderSubject`. `makeLetter` now uses it.
- `status.ts`: `sendState` (off, not-published, ready, approved, sending, sent, failed, expired), `testCopyLine`, `listLine`.
- `checks.ts`: the rule 13 checklist rows. `screen.ts`: what the letter page decides (published, frozen fields, which control, why one is off).
- `desk-read.ts`: candidates read fresh, the letters list, the revisions the public shows now, the Monday line's data. `monday.ts`.
- Reads port: `readerCounts()` (three head counts, no address read) and `sendsForItems()`; the fake in `src/test/fakes/letters-kit.ts` follows.
- Components in `src/components/desk/private/letters/`: send block and dialog, fields, candidate picker, email preview, list, readers panel, waiting list, nav, flash, Monday prompt.

## The three binding points
1. **The label.** A new letter's subject is "Untitled letter, {date}". The field carries a visible warning box and `aria-describedby` ("This is only a label the
   desk gave. Replace it with your own subject. A letter cannot be sent while it says this."). The list says "Subject still a label". Rule 13.1 row fails.
   Once the letter is published the Send button is there and `disabled`, with the reason beside it as its accessible description; the dialog cannot be opened.
   Tests: `send-block.test.tsx` (button disabled, description, no dialog, "Approve again" the same, test copy still allowed), a mutation check (the
   test fails when the disabling is removed), `letter-parts.test.tsx`, `checks.test.ts`, `screen.test.ts`, and e2e (`desk-letters.spec.ts`, both sizes).
   **Added a second door the brief did not ask for:** `approveSend` now refuses a send to readers while the title is still the label
   (`letter-subject-label`, with a test), so a hand-made post cannot email it. The 0025 gate still passes a label (Task 12, deviation 7); this is the desk's check.
2. **Readers list.** The waiting list shows the address and the day asked, nothing else (spec s8.5). Confirmed readers are a number, never a list; people who were
   sent a link are a number. No export, download or copy control (tested: no link, no `download`, no export button, no id visible as text; ids travel only in
   hidden fields). No new column is read: `readerCounts` selects `id` with a head count.
3. **Admin only.** Pages call `requireAdmin()`; the actions already did (Task 12 tests). The UI states are tested for every send state. The one new
   server-side check is the label refusal above.

## Evidence (after `pnpm supabase db reset`, at the final commit)
- Unit: **464 files, 6308 tests passed** (463 files and 6306 tests at the first full run, before the report and e2e; the count includes the new files). The plain `rtk pnpm test`
  passed at 64 s on an idle machine. At the end of the session the machine was at 100 % CPU from other processes, and the plain run then failed 16 to 22 tests that all
  passed alone: the source-scan graph tests hit the 5 s limit (`Test timed out in 5000ms`), plus two that read the local database right after a reset. The final green run is
  `pnpm vitest run --testTimeout=60000 --maxWorkers=3`. No test was changed for this.
- `pnpm typecheck`: clean. `rtk pnpm lint`: clean (the module-boundary rule made the components import through the distribution index).
- `rtk pnpm build` with the CI placeholder env, `CI=1`: built. `pnpm check:bundles`: passed, 59 routes.
- E2e: `desk-a11y.spec.ts` extended to `/desk/letters`, `/desk/letters/new`, `/desk/letters/readers` (light and dark, both sizes); new
  `e2e/desk-letters.spec.ts` (7 tests, both sizes): make a letter, the label marker, no Send before publishing, publish with the label (Send off with the
  reason), replace the subject, Send still off with the "no confirmed readers" reason, the list line, readers, tabs. Each test scans axe (light and dark)
  and checks `scrollWidth <= innerWidth`. The email frame is excluded from axe: it is `sandbox=""` so axe cannot enter it (its title and sandbox are asserted
  by hand, and its text is read through `frameLocator`). The spec unpublishes the letter in the last test and in `afterAll`, so the public site is left as found.
  **Full desk e2e after a db reset: `playwright test --project=desk-mobile --project=desk-desktop`, 205 passed (20.2 min), no failure and no retry.**
- TDD, honestly: the component and module tests were written first for the send block, status, checks, screen, monday, readers, fields and list, and the
  failing run was seen for `status`, `monday`, `subject`, `service` (label refusal), `page.letter` (redirect) and the tabs test. The repo reads
  (`readerCounts`, `sendsForItems`) and the other component files were written in the same step as their tests and run together.

## Deviations (each the conservative reading)
1. **The label refusal in `approveSend`** (above). One new error code and sentence, listed below.
2. **Send is shown disabled, not hidden, while the subject is a label or nobody has confirmed**, so he sees why. It is absent while off or not published,
   where the line says why instead.
3. **No Send is possible in e2e** (no confirmed reader can be made by the desk; sign-up is Task 14). The dialog's tick gating, the count and the
   double press are unit tests with the real Base UI dialog in jsdom. Task 15 covers the pressed path with the fixture.
4. **"Approved" is not frozen.** Fields freeze only while a readers send is `sending` or `sent` (the database freezes at the same point); an approved letter
   can still be edited, and the claim then fails it ("The letter changed after you approved it.").
5. **Rule 13.2 on the checklist** compares the entries to the revisions the public site shows now (a fresh anon read); if that cannot be read the row is a
   hand row and the gate decides. Rule 13.3 is a hand row naming the companies; the ledger check is the database's.
6. **The gate refuses an empty objective (rule 6)**, so a letter cannot be published until he writes the one sentence, label or not. The e2e writes it first.
7. **`ItemView` redirect** adds a line to `items/[id]/item-view.tsx` (148 lines).
8. The email preview uses the site's own `/letters/leave` where Resend's unsubscribe link goes at send time (the placeholder would show as text).
9. One early e2e run of `desk-letters` had a failure on the phone project in its first test that did not repeat in four later runs (the last, the full desk run, passed all 205);
   the cause was not captured.

## New strings (pending Shlok's approval)
- Label: "Untitled letter, {date}" (Task 12); field warning "This is only a label the desk gave. Replace it with your own subject. A letter cannot be sent while it says this."; list tag "Subject still a label";
  error and button reason "The subject is still a label. Replace it with your own subject, save, and run the gate again."
- Fields: "Subject", "One sentence: what a reader learns", "A short note (optional)", "Save", "This letter is on the archive. Unpublish it to change the subject or the sentence.", "This letter was sent. It cannot be changed."
- Send block: "Send", "Run the publishing gate first. A letter is sent only after it is on the archive.", "Ready. This is on the archive and goes to {n} subscriber(s).",
  "Approved {time}. It goes out within 15 minutes.", "Sending", "Sent to {n} on {date}", "Not sent: {reason}", "Not sent: no reason was recorded.",
  "Not sent: the approval ran out after 24 hours.", "Send to {n} subscribers", "Approve again", "Cancel this approval", "Send me a test copy".
- Dialog: "Send this letter", "Subject", "This emails {n} people." (or "1 person.") "An email cannot be called back.", "I have read the preview", "Send", "Not now".
- Test copy lines: "Test copy approved {time}.", "Test copy is being sent.", "Test copy sent to you on {date}.", "Test copy not sent: {reason}", "Test copy not sent: the approval ran out."
- Preview: "Preview", "Subject", "Preview line", "Plain text part", frame title "The email, as it will arrive".
- Checklist rows: "Subject and note" ("The subject is your own and the note is within its limit."), "Entries are current" ("All {n} entries are the current public version of their pages." and the failing forms,
  "A letter needs at least one entry.", "The public site could not be read just now. The gate decides."), "Companies named" ("No entry names a company.", "Entries name {names}. The gate checks the ledger for each company before it passes."),
  "Not sent before" ("No send to readers has been approved.", "This letter was already sent. A sent letter cannot be published again.").
- List and new: "Letters" (page intro: "A letter lists what changed on the site since the last one. You write the subject, publish it to the archive, and send it only when you press Send."),
  "All letters", "What changed", "Readers" (links), "No letters yet. Start from what changed.", "Private. Not on the archive yet.", "On the archive. Not sent.", "Made {date}",
  new page intro "These public changes are not in a sent letter yet. Each entry is copied as it is on the site, with the page it came from. You can leave any out; you cannot change their words here.",
  legend "Changes since your last letter. Take off any you do not want in this one.", "Nothing new since your last letter.", "Showing {n} of {total}. The rest wait for the next letter.", "Make this letter".
- Readers: intro "People who asked for letters. Nobody is emailed until you press Send confirmation emails. Confirmed readers are only counted here, never listed.",
  "Readers", "{n} reader(s)", "Waiting: {n}", "Asked to confirm: {n}", "The list has {n} readers, the free limit is 1,000. New sign-ups are closed.", "Sign-ups", "Sign-ups open", "Sign-ups closed",
  "Open sign-ups", "Close sign-ups", "Confirmation emails", "Send confirmation emails ({n})", "{n} of 50 left today.", "50 confirmation emails sent today. The rest can go tomorrow.", "No one is waiting.",
  "Asked {date}", "Bin", "Bin all {n}", "Binning deletes the request. Nothing is emailed to the reader.", "Erase an address", "Email address to erase", "Erase",
  "For a request that came by email. The address is deleted, and the answer is the same whether or not it was on the list."
- Desk home: "Letter: {n} change(s) since your last letter." (spec s15).
- The wording scan (`wording.test.ts`) covers the new screens and the new modules: no "proof", "verified", "buy", "sell", "weekly", no emoji, no dash used as a pause.

## Notes for Tasks 14 to 16
- The desk screens link nowhere public yet. Task 14 should add the public `/letters` pages and then extend `e2e/desk-letters.spec.ts`: with a confirmed
  reader (through the public form) the dialog can be pressed against the fixture.
- Security pass for the opus review: `defenso guard_code` was not available to this agent. Review rows: the new label refusal in `service.ts`; the iframe
  (`sandbox=""`, `srcdoc` from `renderLetter`, which escapes everything of his); the readers page never reads a confirmed address (`readerCounts` head counts);
  the waiting list shows address and date only.
- `pnpm supabase db reset` leaves two private letters made by the e2e (one per desk project); a reset clears them.
