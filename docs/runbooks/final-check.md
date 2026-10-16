# Final check of the live site and desk

For the person checking the finished version. Site: https://aksh-research-desk.vercel.app. The desk (`/desk`) needs the admin
sign-in: enter the admin address at `/login` and press the link in the email. Note anything that looks wrong, reads badly or is
slow, with the page address and the phone or computer used; those notes become the next plan.

Nothing here can publish by accident: publishing goes through a check that refuses until its rules pass, and the case-study
switches, videos and letters are off.

## Public site (no sign-in), on a phone and a computer
- Home, Files (`/companies`), a file page, Notes, Process, About, Mistakes: text, layout, the disclosure at the bottom.
- Print or "Save as PDF" one file page: dated, addressed, disclosure in full, no buttons on paper.
- `/feed.xml`, `/sitemap.xml`, `/robots.txt` open.
- `/cases`, `/concepts`, `/videos`, `/letters` are "not found" until something is published there. That is expected.

## Desk (signed in)
- Capture box, Inbox, Items, a company file, Ledger, Concepts, the month page (`/desk/learned`), Videos, Letters (shows "off").
- **The spreadsheet check** (the one live check still to do, about 10 minutes):
  1. In the Capture box type `first note on $KVMTEST` and press Enter.
  2. Inbox > "Company, filing date and link (optional)" > company `$KVMTEST` > choose `e2e/fixtures/model-small.xlsx` from the
     repository.
  3. Within 15 minutes, after a reload, the card moves to Ready for you: "Model read: 3 sheets, ... Choose its inputs and results."
  4. Open model > tick Assumptions!B1, Assumptions!B2, DCF!B13 > "Use 2 inputs and 1 result".
  5. The per-share result reads **233.57**; change the cost of capital from 11.5 to **12.5** and it reads **204.11**.
  6. Afterwards: Skip the document. If the card lands in Needs attention instead, copy its sentence.
- Do not record a test idea in the Ledger: a ledger entry can never be removed.

The user guide is `docs/guide/using-the-desk.md`; Aksh's short version is `docs/guide/aksh-quick-guide.md`.
