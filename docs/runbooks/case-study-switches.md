# Case study switches runbook

For Shlok. Aksh has no switch and the desk has no button for them: the two switches are rows in a table that only the database owner can write, and you flip them in the Supabase SQL editor. Rules: publishing rule 10 in `docs/compliance/publishing-rules-v1.1-addendum.md` (10.1 is the switches). Decisions: D26 to D44 in `docs/plans/2026-10-15-phase-3b-case-studies.md`.

## What the two switches do

| Row in `private.settings` | What it allows |
|---|---|
| `ledger_reveal` | A closed idea may be published as a case study (the ledger record: his words, dates and fingerprints). While it is off, every new publish and every new revision of a ledger case study is refused with "Case studies from the ledger are switched off by the site owner." |
| `ledger_chart` | The weekly line chart of the share and the Nifty 50 (both rebased to 100, no values printed) may be part of the record. It matters only while `ledger_reveal` is on. |

- A switch is on only when its value is exactly `on`, in lower case. No row, `ON`, `yes`, `true` and everything else mean off.
- Both are off unless you turn them on. A database that never had the rows has both off. Merging the code changes nothing a visitor can see: `/cases` answers "not found" and `/process` has no "How this record is kept" section until one ledger case study is public.
- Nothing in the app reads the rows except the publishing check inside the database. The site, the desk and Aksh cannot turn them on.

## Before anything is switched on in the hosted project

1. Pull request #8 (the valuation work, migration 0017) is merged first.
2. Migrations 0017, 0018 and 0019 and the merge of this branch must land together. The publishing check pins its policy version: 0019 moves it to `sebi-unreg-2026-07-v1.1`, and the running site sends `sebi-unreg-2026-07` until the merge. In between, every publish on the site is refused (not only case studies), with "This database accepts only policy version ...". It fails closed and nothing is lost, but do not leave it that way. Run `pnpm supabase db push --dry-run` against the hosted project first: it must list exactly 0018 and 0019 (0017 too if it has not gone yet). Push, then merge at once.
3. Confirm on the hosted project that both rows are absent. This must return no rows:

```sql
select key, value from private.settings where key in ('ledger_reveal', 'ledger_chart');
```

4. Before you switch `ledger_reveal` on in hosted, check that no revision that passed under policy v1 carries a `ledger` key. Policy v1 had no rule 10, so such a revision would never have been compared with the ledger. This must return no rows:

```sql
select r.item_id, r.id as revision_id, r.rev_no, d.policy_version, d.decided_at
from public.item_revisions r
join public.gate_decisions d on d.revision_id = r.id
where d.verdict = 'pass'
  and d.policy_version = 'sebi-unreg-2026-07'
  and r.structured ? 'ledger';
```

   If it returns a row, do not switch anything on. Unpublish that item on the desk and tell the architect.
5. Q27 (the legal reading of a case study of a closed idea, and of the chart) is answered. Until it is, the hosted switches stay off. Q26 (the public copy of the fingerprints) is separate: with it off, the pages say what their check does and does not show.

## Turn a switch on or off

Supabase dashboard, the hosted project, SQL editor. It runs as the database owner. Each of these is one statement.

```sql
-- on
insert into private.settings (key, value) values ('ledger_reveal', 'on')
  on conflict (key) do update set value = excluded.value;
insert into private.settings (key, value) values ('ledger_chart', 'on')
  on conflict (key) do update set value = excluded.value;

-- off
delete from private.settings where key = 'ledger_reveal';
delete from private.settings where key = 'ledger_chart';

-- look
select key, value from private.settings where key in ('ledger_reveal', 'ledger_chart');
```

The desk shows the state: the idea page says "(now on)" or "(now off)", and the publish checklist has a line "Case studies from the ledger: On|Off (site owner). Chart: on|off." A change is seen at once; there is no cache to wait for.

A chart is added only by "Refresh from the ledger" on the case study's page and then a new publish. Turning `ledger_chart` on does not change a page already public, and turning it off does not remove a chart from one.

## What turning a switch off does not do

- It stops new publishes and new revisions of ledger case studies. It does not take any page down. A case study already public stays public, with the revision that passed, until someone presses Unpublish on its page on the desk. There is no bulk unpublish: one click each.
- Older revisions that passed the check stay readable (the public revision list reads every revision that passed) until the item is unpublished.
- To list every ledger case study that is public now:

```sql
select i.id, i.slug, i.title, i.published_at, i.data_as_of
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
where i.status = 'published' and r.structured ? 'ledger'
order by i.published_at desc;
```

- To list the older revisions of those that are still readable:

```sql
select r.item_id, r.rev_no, r.created_at
from public.item_revisions r
join public.items i on i.id = r.item_id
where r.structured ? 'ledger' and private.revision_passed(r.id)
  and i.status = 'published' and r.id <> i.current_revision_id
order by r.item_id, r.rev_no;
```

- To take a case study down, open it on the desk and press Unpublish. Switch the rows off first if you want nothing new to go out while you do it.

## When the ledger changes under a public case

The case study carries a copy of the ledger record, and the publishing check rebuilds it from the ledger every time. If Aksh writes a new lesson on a closed idea whose case study is public, the page stays as it was. The item page then says the ledger has changed. If the new lesson moves the "Figures to" date, the date is fixed while the case is public, and the page says: Unpublish it, then Refresh from the ledger, then Publish. The page is down between the first and the last step. A lesson written within the last 30 days cannot be published yet; the case waits until its date is 30 days old.

## Trying it on the local stack

`pnpm e2e` runs the `cases` project last. It makes an invented company and one closed idea, moves its entries back 140 to 50 days, turns the switches on and off as above, publishes the case through the real check and reads it as a visitor. It writes only to the local database and refuses to run without the local stack. It rewrites the fingerprints of the local chain, so run `pnpm supabase db reset` before the next run. Never run its SQL (`e2e/support/aged-case.sql`) against the hosted project: it rewrites sealed entries.

## After the merge, with the switches off: what the hosted site should show

- `/cases` and any `/cases/x` answer "not found".
- `/process` has no "How this record is kept" section.
- `/mistakes` shows its empty state.
- The register, the company pages and the home counts are the same as before.
