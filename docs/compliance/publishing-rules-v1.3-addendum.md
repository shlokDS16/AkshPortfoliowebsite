# Publishing rules v1.3 addendum: other people's work on a public file (2026-10-16)

Status: written by desk-architect on Shlok's delegation, 2026-10-16, with `docs/specs/2026-10-16-sources-design.md`. Rule 14 is
put into force in SQL by migration `20261019000027_sources_gate.sql`, which moves the policy version from
`sebi-unreg-2026-07-v1.2` to **`sebi-unreg-2026-07-v1.3`** (`c_policy` and `POLICY_VERSION`). Until 0027 reaches the hosted
project, v1.2 governs and no outside source can be public. Not legal advice (Q55, Q56). Append-only: `publishing-rules.md` and the
v1.1 and v1.2 addenda are unchanged; where they and this addendum differ for an outside source, this addendum governs.

## Why
A link to someone else's video, article or newsletter issue on a page about a named company can read as an endorsement of what
that work says, and a third-party title can carry exactly the words rule 1 forbids ("5 stocks to buy now"). Its date can also
reveal current interest in a security. Rule 8 already makes every public word subject to the lint; rule 14 says how that applies to
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
14.4 30-day lag: an entry is shown only from 30 India calendar days after the date the machine read the data it shows (or saved
the link, when nothing was read). This is rule 3 applied to third-party text whose own date is unknown. The gate does not refuse a
fresh source; the public view withholds it.
14.5 His note on the entry is his own words in the revision and is linted under every rule, as his body is. Rule 4 and the
position check already apply because the file names the company.
14.6 Machine text is never copied into his fields and his note is never re-worded. No article text, no page images, no LLM.
14.7 Pictures (YouTube thumbnails only) are served from this site's own storage and route; a visitor's browser contacts no third
party by opening a page. The desk cannot read words inside a picture: showing it is Aksh's choice, and the desk says so beside it.
14.8 Every card names its origin ("YouTube · {channel}" or the site name) and says, once per block, "Linked, not endorsed."

## Retraction
A new revision without the entry, or `unpublish_item()` on the file, removes it at the next refresh (at most one hour, rule 11.5);
pictures are cached at our edge for at most one hour. Copies taken by others cannot be recalled (v1 "Retraction").
