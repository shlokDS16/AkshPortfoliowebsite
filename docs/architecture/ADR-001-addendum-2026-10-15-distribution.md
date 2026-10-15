# ADR-001 addendum (2026-10-15): distribution without machine drafts or unattended sends

Status: ACCEPTED by desk-architect on Shlok's delegation, 2026-10-15 (he reviews this evening). Amends ADR-001 s3 (provider
ports), s4 (daily cron line) and ADR-003 s4 (the service-client allowance). Detail: `docs/specs/2026-10-15-phase-5-distribution-design.md`
(D83, D88-D91, D96).

## 1. Problem
ADR-001 s4 has the daily cron "draft Monday newsletter (never sends)" and s3 a single `MailerPort`. Phase 5 needs letters, a
consent record for subscribers and a read-only YouTube port, under a new hard line from Shlok: nothing leaves the system without
Aksh's press, and keys stay unset until Shlok sets them.

## 2. Current state
ADR-004 forbids any machine write to `item_revisions` (no `service_role` privilege, a refusing trigger). ADR-003 confines the
service client to `src/modules/ops` and `src/modules/compliance/gate-rpc.ts`. The only mailer is the alert mailer (fixed
recipients, sending-only key).

## 3. Options considered
- **A. Keep the cron draft.** Rejected: the draft is a revision, so the machine would write one (ADR-004).
- **B. Letters, subscribers and sends in their own tables with their own approval function.** Rejected: a second publish path.
- **C. (chosen)** Letters and videos are item kinds published by `publish_revision()`; the draft is computed on read and created
  by Aksh's press; sends and confirmation emails happen only after an admin-actor SQL function records his approval.

## 4. Recommendation (the amendments)
1. ADR-001 s4, daily cron: the line "draft Monday newsletter (never sends)" is replaced by "nothing". The desk shows the week's
   candidates on read; a letter exists only when Aksh makes it.
2. ADR-001 s3, ports: `MailerPort` becomes three ports in `src/lib/providers/`: `AlertMailer` (unchanged), `LetterSender` and
   `ContactMirror` (one Resend adapter, `resend-letters.ts`, own key `RESEND_LETTERS_KEY`, production only). New port
   `VideoMetaPort` (`youtube.ts`, GET `videos.list` only, `YOUTUBE_API_KEY`). Each has a fixture refused on deployed environments.
3. ADR-003 s4, service client: one more exact-path allowance, `src/modules/distribution/send-rpc.ts` (`import "server-only"`),
   imported only by `src/modules/distribution/actions.ts`, every action calling `requireAdmin()` first and passing `p_actor`. It
   calls `letters_issue_confirmations`, `letters_bin`, `letters_erase`, `approve_letter_send`, `set_letters_signup` (all
   service_role only, all re-checking the actor in SQL). The send, reconcile, purge and video steps live in `src/modules/ops`.
4. Public sign-up, confirmation and withdrawal use four anon-executable functions with caps in SQL (D96), not the service client.

## 5. Tradeoffs
A letter needs Aksh's presses (make, publish, approve; and a press per confirmation batch). The anon executable set grows from
four functions to eight. One more secret (`RESEND_LETTERS_KEY`) and two more (`YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`).

## 6. Risks
A leaked admin session can approve a send of an already public letter to confirmed readers (the same trust root as publishing,
ADR-003 s6). Anon functions can be called by bots: requests are capped at 100 a day and 300 waiting, and nothing is sent without
the admin press. A preview deployment shares the hosted database: the letters factory requires `VERCEL_ENV = production`.

## 7. Future evolution
Automatic confirmation emails (one setting) if Q41 allows; Whisper transcripts (5d); a scheduler only if a send ever needs to be
timed, still behind an approved row.
