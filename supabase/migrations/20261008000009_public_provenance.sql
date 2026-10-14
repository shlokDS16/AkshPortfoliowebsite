-- =============================================================================
-- 20261008000009_public_provenance.sql - Plan 2b Task 9 (controller ruling R5): the one public read path for the
-- "checked against page N" line on a filed figure. Never edit after it reaches hosted (this file is LOCAL only for now).
--
-- Why a function and not a view: a view over fact_provenance and proposals would need anon grants and RLS on both
-- tables (a direct anon read of the machine's work), or it raises 42501. This definer function returns three
-- columns and nothing else: no proposal, extraction, machine value, edited flag or document.
-- =============================================================================

-- For every public item (visibility, status and the 30-day lag, through the same private.is_public_item as the
-- public read policies): the page of the latest filing of each fact among the item's revisions that passed the
-- publish gate, and only when the desk really matched what the public page now prints. The latest filing is picked
-- first; it is then dropped (an older clean filing never stands in for it) when
--   * Aksh edited it (fact_provenance.edited), or
--   * the machine flagged the figure or its quote as not on the page (proposals.flags), or
--   * the item's CURRENT public revision no longer holds that fact with the machine's value at locator 'p. <page>'
--     (a retyped, moved or removed fact).
-- So every row returned is one the page prints as the desk read it; the caller keeps its own locator check as defence
-- in depth. The change from the first draft only narrows what is returned.
create function public.public_fact_checks()
returns table (item_id uuid, fact_id text, page_no integer)
language sql stable security definer set search_path = ''
as $$
  select l.item_id, l.fact_id, l.page_no
    from (
      select distinct on (i.id, fp.fact_id)
             i.id as item_id, fp.fact_id, p.page_no, fp.edited, p.flags,
             p.machine_value -> 'value' as machine_value, cur.structured
        from public.items i
        join public.item_revisions cur on cur.id = i.current_revision_id
        join public.item_revisions r on r.item_id = i.id
        join public.fact_provenance fp on fp.revision_id = r.id
        join public.proposals p on p.id = fp.proposal_id and p.item_id = i.id and p.status = 'filed'
       where private.is_public_item(i.visibility, i.status, i.data_as_of)
         and private.revision_passed(r.id)
         and private.revision_passed(cur.id)
       order by i.id, fp.fact_id, r.rev_no desc, fp.created_at desc
    ) l
   where not l.edited
     and not (l.flags && array['value_not_on_page', 'quote_not_on_page']::text[])
     and jsonb_typeof(l.machine_value) = 'number'
     and jsonb_path_exists(
           l.structured,
           '$.facts[*] ? (@.id == $id && @.value == $v && @.locator == $loc)',
           jsonb_build_object('id', l.fact_id, 'v', l.machine_value, 'loc', 'p. ' || l.page_no),
           true);
$$;

-- Anon only (the capture_days precedent): the showcase repo reads through the cookie-less public client.
revoke execute on function public.public_fact_checks() from public, anon, authenticated, service_role;
grant execute on function public.public_fact_checks() to anon;
