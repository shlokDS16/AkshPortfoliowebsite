# Publishing rules v1.3 addendum: other people's work on a public file (2026-10-16)

Status: written by desk-architect on Shlok's delegation, 2026-10-16, with `docs/specs/2026-10-16-sources-design.md`. Rule 14 is
put into force in SQL by migration `20261019000027_sources_gate.sql`, which moves the policy version from
`sebi-unreg-2026-07-v1.2` to **`sebi-unreg-2026-07-v1.3`** (`c_policy` and `POLICY_VERSION`). Until 0027 reaches the hosted
project, v1.2 governs and no outside source can be public. Not legal advice (Q55, Q56). Append-only: `publishing-rules.md` and the
v1.1 and v1.2 addenda are unchanged; where they and this addendum differ for an outside source, this addendum governs.

## Why
A link to someone else's video, article or newsletter issue on a page about a named company can read as an endorsement of what
that work says, and a third-party title can carry exactly the words rule 1 forbids ("5 stocks to buy now"). Its date can also
reveal current interest in a security (accepted by Shlok's ruling of 2026-10-16; see 14.4). Rule 8 already makes every public word subject to the lint; rule 14 says how that applies to
text the machine read from another site.

## Rule 14: outside sources (entries `structured.studied` on a company file)
14.1 An outside source appears publicly only as an entry in a company file's revision (kind `thesis`, or a `case_study` that is not
a ledger case), published by `publish_revision()`. No other item kind carries one. A file holds at most 12.
14.2 The source must be attached to the file's company, not archived and still reachable (a YouTube video found missing is hidden
at once and refused at the next publish).
14.3 What the reader sees is fixed at the gate: the title and channel or site name the machine read are shown only when Aksh
ticked "Show its title and picture" and they have not changed since (an SQL hash); otherwise the card shows only the kind of
source and its host. The link, and the title and name when shown, are linted for rules 1 and 2; a rule 1 sentence allowance
applies as usual; a rule 2 hit keeps the title off (untick) or the source off.
14.4 No display hold (Shlok's ruling, 2026-10-16): an entry is shown as soon as its revision passes the gate. Rule 3 is kept by the
lint instead: a price, return or valuation figure in a third-party title, name or link is refused whatever the file's "Figures to"
date, because that text's own date is unknown and may be today; it is never allowanceable, and unticking "Show its title and
picture" publishes the link alone. The YouTube re-check every 25 days and purge at 30 are a storage rule, not a display delay.
14.5 His note on the entry is his own words in the revision and is linted under every rule, as his body is. Rule 4 and the
position check already apply because the file names the company.
14.6 Machine text is never copied into his fields and his note is never re-worded. No article text, no page images, no LLM.
14.7 Pictures (YouTube thumbnails only) are served from this site's own storage and route; a visitor's browser contacts no third
party by opening a page. The desk cannot read words inside a picture: showing it is Aksh's choice, and the desk says so beside it.
14.8 Every card names its origin ("YouTube · {channel}" or the site name) and says, once per block, "Linked, not endorsed."

## Retraction
A new revision without the entry, or `unpublish_item()` on the file, removes it at the next refresh (at most one hour, rule 11.5);
pictures are cached at our edge for at most one hour. Copies taken by others cannot be recalled (v1 "Retraction").

## Amendment 2026-10-17 (whole-branch review of the sources work, append-only)
14.3 and the lint of an outside link: the link is read as the whole address, host, path, query string and fragment, because the page prints and links all of it. A figure or a rule 1 word in the query string or the fragment is refused as it would be in the path. Policy version unchanged (v1.3); this is a TypeScript lint change only.
