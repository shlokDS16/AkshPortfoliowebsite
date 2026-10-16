# Publishing rules v1.2 addendum: distribution (feeds, print, videos, letters) (2026-10-15)

Status: written by desk-architect on Shlok's delegation, 2026-10-15, with `docs/specs/2026-10-15-phase-5-distribution-design.md`.
Rule 11 is a build rule in force from Phase 5a (no SQL change). Rules 12 and 13 are put into force in SQL by migrations 0023
(videos) and 0025 (letters); 0023 moves the policy version from `sebi-unreg-2026-07-v1.1` to **`sebi-unreg-2026-07-v1.2`**
(`c_policy` and `POLICY_VERSION`). Until 0023 reaches the hosted project, v1.1 governs and no video or letter can be public. Not
legal advice: Q41, Q44 and Q45 are the open legal questions. Append-only: `publishing-rules.md` and the v1.1 addendum are
unchanged; where they and this addendum differ for a feed, card, printed page, video or letter, this addendum governs.

## Why
Rule 8 already says the public surface includes OpenGraph text, newsletter drafts and video transcripts. Phase 5 adds surfaces
that leave the site (a PDF, a feed reader, a social preview, an inbox, YouTube), where a retraction cannot follow. So each must
be built only from what already passed the gate, and the two that are new publications in their own right (a video, a letter)
pass the gate themselves.

## Rule 11: derived surfaces
11.1 Page metadata, structured data (JSON-LD), share cards, the feed, the sitemap and the print layout are built only from the
cached public snapshot (the anon views, which apply the 30-day lag in SQL), from fields the gate lints, and from fixed copy.
11.2 They never show a database id, and on a ledger case study never a figure or verdict (rule 10.7).
11.3 Structured data never uses a type or property that rates, prices or offers a security (Review, Rating, Offer,
FinancialProduct, price).
11.4 Every printed public page carries the standard disclosure in full, the revision number and its date, the figures-to date
and the page's address. A printed desk page carries the private-copy banner.
11.5 Retraction: an unpublished item leaves every derived surface at the next refresh (at most one hour). Copies already taken
by feed readers, social networks or printers cannot be recalled (as in v1 "Retraction").

## Rule 12: videos (item kind `video`)
12.1 Only a video from Aksh's own channel, unlisted or public on YouTube, with YouTube data fetched within 7 days.
12.2 A video is listed only with its transcript, and the lint covers every word of it (rules 1, 2, 3 and 8). The transcript is
the machine's record of what was said: it is never edited in the desk, so a flagged spoken sentence is cleared only by a sentence
allowance for rule 1 or 2, with a reason, or the video is not listed.
12.3 A video that names a company needs a figures-to date at least 30 days old (as a case study), and rule 4 and the position
check apply.
12.4 Chapters are his own, from his YouTube description, and are linted.
12.5 The desk never publishes, uploads or changes anything on YouTube. Making a video public on YouTube is Aksh's own act, and
the guide tells him to do it only after the desk lists it. The desk warns when YouTube shows a video publicly that has not passed.

## Rule 13: letters (item kind `letter`)
13.1 A letter is published (its public archive page) through the gate before it can be sent; it is sent only after Aksh approves
that send in the desk, which records who approved what and when; the send is refused if anything in it changed or left the
public site after the approval.
13.2 A letter contains only his own words: a subject, the learning objective, an optional note, and for each entry the title,
learning objective and change reason of a page that is public now, copied exactly. The machine adds only dates, labels, links and
counts. Nothing is summarised or re-worded.
13.3 Rule 4 and the position check apply to every company an entry names, as of the day of the decision.
13.4 A sent letter is frozen: no new revision. It can be unpublished from the archive; sent emails cannot be recalled.
13.5 Every letter carries the disclosure lines, the position for each company it names, how the reader subscribed and a working
unsubscribe link, and goes only to addresses that confirmed by email (double opt-in) and affirmed they are 18 or older.
13.6 No figure about a ledger case, no performance claim and no actionable language, as for any public page.
