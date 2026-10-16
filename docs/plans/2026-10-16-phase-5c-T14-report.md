# Phase 5c Task 14 report: public letters pages and derived surfaces

Built by desk-ui (Sonnet 5.5), 2026-10-16. Branch `phase-5c-letters`, code commit `c0e21eb` on `a08fd79`, then test and e2e fixes and this report. Not pushed. Local Supabase only.
Nothing was sent and nothing left the machine: the unit fetch guard (`src/test/no-outbound.ts`) and the e2e outbound guard (`e2e/support/outbound.ts`) were used as they are and not edited.
No spec press touched Send, a test copy or "Send confirmation emails". The sign-up form of the e2e only asks to subscribe and then leaves; the address is `reader-<tag>@example.com`.

## Built
**Pages** (`src/app/(public)/letters/`)
- `page.tsx` (`/letters`): 404 unless `letters_open()` is true or a letter is public (the deploy state). When open: the notice, the form, the one answer after a post. Then the archive (newest first: subject, his sentence, "Published {date}"), then "Stop my letters". `force-dynamic` (the form's ticket carries the render time).
- `[slug]/page.tsx`: the letter as a page (`LetterArticle`); `[slug]/opengraph-image.tsx`: its share card. Cached like the video page (`revalidate` 3600, `generateStaticParams` empty).
- `confirm/page.tsx`: GET shows a button only (token in a hidden field), `force-dynamic`, `noindex`, `referrer: no-referrer`. `leave/page.tsx`: one field, one button, `force-dynamic`, `noindex`; it does not depend on the sign-up switch.
- `form-actions.ts`: three plain-form wrappers over `askToSubscribeAction`, `confirmAction`, `leaveAction` that end on an ordinary GET (`/letters?asked=1#subscribe`, `/letters/confirm?r=confirmed|expired`, `/letters/leave?r=left`). No client JavaScript anywhere on the new pages.

**Components** (`src/components/desk/`): `letter-article.tsx`, `letter-index.tsx`, `signup-form.tsx` (notice first, email, "I am 18 or older" 44 px row, off-page trap, ticket), `reader-forms.tsx` (`ConfirmForm`, `LeaveForm`). Rail: "Letters" appears once a letter is public.

**Showcase module**
- `letter-list.ts`: which letters are listed and which entries still show. `letters.ts`: summaries, page model, `letterCard`. `seo-text.ts`: `cutWords` and the card budgets, moved out of `seo.ts` to keep it under 300 lines (re-exported, nothing else changed).
- `seo.ts`: `letters` index and `letter` detail routes (metadata, `Article` + breadcrumb, sitemap lines). `feed.ts`: one entry per gated revision of a public letter. `site.ts`: `counts.letters`.
- `letters-open.ts` + `queries.ts#getLettersOpen`: the switch, read through the cookie-less client, cached on the snapshot's tag for 300 s, thrown on a failed read (a cache never keeps a wrong "closed").
- `distribution/public.ts` gains the page words and `LETTER_KIND_LABEL` / `LETTER_POSITION_*`; `letters/copy.ts` re-exports them, so the email and the archive cannot drift.
- `distribution/actions.ts#setSignupAction` now calls `updateTag(public-items)` and revalidates `/letters`, so a closed door is closed at once.

## The three binding points
1. **Reader actions only from `public-actions.ts`.** Public code imports `@/modules/distribution/public` and `@/modules/distribution/public-actions` and nothing else of the module (new ESLint allowance by exact path). `showcase/isolation.letters.test.ts` walks every public page, component, derived route and card: the reach in the distribution module is exactly four files (`public.ts`, `public-actions.ts`, `letters/signup.ts`, `letters/copy.ts`); `actions.ts`, `send-rpc.ts` and the module index are forbidden by name; no secret-key client, cookie client, admin session, ops code or private desk component; the only server-env reader besides `robots.ts` is `lib/letters-form.ts`, and it reads `CRON_SECRET` only; the only database doors named are the four anon letters functions plus the two the snapshot already uses. Mutation-checked: adding `import "@/modules/distribution/actions"` to the pages fails 16 tests. The older isolation tests (`isolation.test.ts`, `isolation.videos.test.ts`) were updated for the same closed list and their comments say why.
2. **Only gate-passed published letters; no reader, address or send data.** A letter is listed only if it is of kind letter with no company, theme or data_as_of, a 1-to-120 title, a present sentence, a note within 4,000, and a whole `letter/1` record. Each entry shows only while its page is still public in the snapshot (revision present, a video still listed, a dated page past the 30-day lag); a letter with no entry left is not listed anywhere (retraction, rule 11.5). The snapshot has no field for readers or sends, and the pages contain no such text (tests scan the HTML). "Sent to subscribers on {date}." is therefore **not shown** (see Deviation 1).
3. **Form abuse.** The ticket from T12 (`issueFormTicket()` at render, `checkFormTicket` in the action: genuine, 3 s to 2 h old) and the honeypot are honoured; the database caps (100 a day, 300 waiting, silent refusals) are untouched. The e2e shows a trapped post and a forged ticket keep nothing and get the same answer, and a real post after 3 s is kept as `waiting` with `adult = true`. No address in any URL (asserted after sign-up and leave); the confirm link carries only `?t=<token>`; the token is not in the URL after the POST, and the page puts it only in a hidden field (escaped).

## Surfaces (5a/5b) and print
Sitemap (`/letters` and each letter, dated by its current revision), feed (title is his subject; description is his reason, `Letter · R{n}`, his sentence and the fixed line), `Article` JSON-LD, share card ("Letter", subject, sentence, "Published {date}"), print (masthead with address and revision, standard disclosure; the form and links are `print:hidden`). All drop an unpublished letter (unit tests per builder and per route; e2e: unpublish, then the page, its card, the feed line and the sitemap line are gone and `/letters` is a 404 again). `derivedProblems` is clean on every output. "What changed" on the home page does not list letters.

## Evidence
- Unit: `pnpm vitest run --testTimeout=60000 --maxWorkers=3`: **469 files, 6392 tests passed** at `c0e21eb` (no file needed a re-run). After it, only a test file was split (`pages.test.tsx` into `pages.test.tsx` and `reader-pages.test.tsx`, both under 300 lines): 28 tests in the folder pass. Final full run after the split: **470 files, 6392 tests passed**.
- `pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- `rtk pnpm build` (CI placeholder env, `CI=1`): built; `/letters`, `/letters/confirm`, `/letters/leave` dynamic, `/letters/[slug]` and its card on-demand static. `pnpm check:bundles`: passed, 64 routes.
- E2E, final run after `pnpm supabase db reset` (local stack, fixture adapter, outbound guard on): `playwright test --project=public-375 --project=public-1280 --project=desk-mobile --project=desk-desktop` over `public-a11y`, `public-letters`, `public-site`, `public-distribution`, `public-print`, `public-videos` and `desk-letters`: **90 passed, 8 skipped (the phone-only and published-state checks that skip by design), 0 failed**. Earlier runs on the same code: `public-a11y` extended with `/letters/leave` and `/letters/confirm?t=` at 375 and 1280, all green; `public-letters.spec.ts` (new, 6 tests, both sizes) green after one fix to my own selector (a button in the 1280 chrome); `desk-letters.spec.ts` now also opens the public archive, the letter page, its card, the feed and the sitemap while the letter is public, and checks all of them are gone after Unpublish (16 passed in the two desk projects after one fix: the card lives at a hashed address named by `og:image`).
- TDD, honestly: the failing run was seen first for `letters.test.ts` (module missing), `derived.letters.test.ts` (route and builder missing, after the types were in place) and `isolation.letters.test.ts` (pages missing). `letters-open`, `pages` and `reader-pages` tests were written in the same step as their files and run together; the isolation test is mutation-checked as above.
- `defenso guard_code` is not among this agent's tools (as in Tasks 10 to 13). Manual security pass: the new code takes no secret and no admin session; every value of his goes through React's escaping; the token and the address never reach a URL, a log or the JSON-LD; the hidden trap is `aria-hidden` with `tabindex=-1` and axe is clean; the e2e Tab loop never reaches it.

## Deviations (each the conservative reading)
1. **No "Sent to subscribers on {date}." on the letter page.** Spec s8.9 and s15 ask for it; the brief forbids send data on public pages, and anon cannot read `letter_sends`. `LETTERS_COPY.sentLine` stays, unused. Showing it needs a new anon door and a ruling.
2. **The forms are plain forms with redirects, not `useActionState`.** The spec says no client JavaScript; the T12 actions were written for `useActionState`, so three small wrappers in the route folder call them with `{ status: "idle" }` and redirect. The answer is the same sentence whatever happened. A reader who types `?r=confirmed` into the address bar sees "You will get the next letter." (harmless, no state change).
3. **`/letters` is rendered per request** (the ticket carries the render time); the snapshot and the switch stay cached. Spec s8.9 asks for the 300 s cache on the switch; `setSignupAction` also refreshes it at once.
4. **The public side now reaches `lib/env.server.ts` through `lib/letters-form.ts`** (T12's note). The old isolation tests said "never"; they now allow exactly that one file and pin what it reads.
5. **An entry is dropped from the archive page once its page is not public** (Rule 11.5). The email already sent is not recalled.
6. **A sign-up page with no letter yet has no rail link** (the deploy state links to nothing that 404s); Aksh shares its address.
7. **Rail and tab:** no phone tab (like videos).

All of these are also written as an append-only amendment (w) to (ac) at the end of the spec.

## New strings (pending Shlok's approval)
- Page words (`LETTERS_COPY` in `distribution/public.ts`): "Letters" (page title and heading); "Each letter lists what changed on this site since the last one. For learning, not advice."; "Get the letters by email"; "Leave this field empty" (the trap's label, read only by a script or a screen with no styles); "All letters"; "Stop my letters" (the link; the page title is the approved one); "What changed" (the letter page's list heading); "Press the button to start receiving letters."; "Enter the address the letters come to. We delete it at once."; "Published {date}".
- The letter page tag "LETTER".
- Already approved in spec s15 and used as written: the sign-up notice, "Email", "I am 18 or older", "Ask to subscribe", the one answer, "Confirm your subscription", "Yes, send me the letters", "You will get the next letter.", "This link has expired. Ask again on the letters page.", "Stop my letters", "Stop", "Done. If a letter was already on its way, it may still arrive.", "No letters yet.".
- Entry labels on the page (same as the email): "File", "Closed case", "Learning note", "Process note", "Video", "Position: Yes | No | Not disclosed".
- Metadata: the `/letters` description is the page intro above. Share card: tag "Letter", footer "Published {date}" and the usual "For learning, not advice".
- The wording scan (`copy.test.ts`) covers `public.ts`: no "proof", "verified", "buy", "sell", "weekly", no emoji, no dash used as a pause.

## Concerns for the Task 16 review
1. A sign-up form left open for over two hours is answered with the thank-you but not recorded (the ticket is too old). Rare; the fix is to say so or lengthen the window.
2. `/letters/leave` deletes any address typed into it, with no proof of ownership (spec s8.5: one press, no sign-in, same answer either way). It is the intended trade, but it lets anyone remove anyone; the database has no cap on leaves.
3. If the sign-up switch is on while letters are off in the environment (the env removed later), the form shows but the confirmation cannot be sent. The switch can only be opened while letters are on; nothing closes it when they go off.
4. The dark-mode public projects (`public-375-dark`, `public-1280-dark`) were not run for the new pages; the desk-letters spec scans the public archive and letter page in both colour schemes at both sizes.
