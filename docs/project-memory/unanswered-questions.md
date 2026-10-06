# Unanswered Questions

Open questions that should become future work items. Append only.
Move to the timeline with an answer when resolved. Do not delete.

Format: **[date]** - the question, why it matters, what would answer it.

## Open (2026-10-04)
- **Q1 (legal, blocks Phase 3.6):** Do invited "client" logins to the private tier make Aksh's content advice to identified persons under SEBI RA regulations, even unpaid? Until answered: no client accounts; `clients` visibility exists in schema only.
- **Q2 (data):** ANSWERED 2026-10-06 — no Upstox account; NSE bhavcopy is the only price source in v1 (ADR-001 s9.2).
- **Q3 (scope):** Does Aksh cover anything beyond Indian listed equities (global stocks, mutual funds, macro)? Assumed no.
- **Q4 (content):** Are the "videos" his own recordings (transcribe via Whisper) or curated third-party videos (list only)? Assumed his own, hosted unlisted on YouTube.
- **Q5 (identity):** ANSWERED 2026-10-05 — under Aksh's own name ("Aksh Agrawal · Case files"); domain to check: akshagrawal.in. Desk-brand names (Assay / Plumbline / Nikasha) reserved for a future registered phase.
- **Q6 (verify):** Next.js 16.3.8 Turbopack CSS-404 bug on Vercel - confirmed fixed? Test in task 1.1.
- **Q7 (tooling):** The Mobbin MCP requires a paid Mobbin plan; every call was refused. Does Shlok have or want a subscription? Otherwise `desk-ui` continues with agent-browser captures of live sites (worked for segment 1).
- **Q8 (security, before public launch):** `publish_revision` trusts the caller's `lint_result.passed`; the admin session token is readable by page JavaScript (Supabase SSR cookies), so a stolen session could publish text that fails rules 1-2 by calling the RPC directly. Decide in ADR-003: HMAC-signed lint result verified in SQL, or a server-only role for the RPC. Logged 2026-10-06 from the Task 9 review.
- **Q9 (deploy, email):** Supabase free tier with the built-in email sender cannot customise the magic-link template, so hosted login links use PKCE and must be opened in the browser that requested them (iPhone in-app mail browsers may fail). Fix: buy a domain (e.g. akshagrawal.in), verify it in Resend, set Supabase custom SMTP, then apply `supabase/templates/magic_link.html` (token-hash /auth/confirm link). Also lifts the 2 emails/hour cap and enables the Phase 5 newsletter. Logged 2026-10-07.
- **Q10 (compliance, public tests):** When a kill-criterion test's reading is younger than 30 days (withheld), should the public file still show its status (met / not met / watching)? Current ruling: no - public shows 'withheld until <date>' for the status too, because a verdict on fresh data reveals the direction of the hidden figure; the private desk shows the real status. Logged 2026-10-07 from the Plan 1B Task 7 build.
