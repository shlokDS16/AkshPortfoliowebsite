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
-- publish gate. Provenance rows belong to the filing revision, so "latest per fact" keeps the line after a later,
-- routine save; the caller shows it only while the fact's own locator still names the same page (a moved or
-- re-sourced fact shows no line).
create function public.public_fact_checks()
returns table (item_id uuid, fact_id text, page_no integer)
language sql stable security definer set search_path = ''
as $$
  select distinct on (i.id, fp.fact_id) i.id, fp.fact_id, p.page_no
    from public.items i
    join public.item_revisions r on r.item_id = i.id
    join public.fact_provenance fp on fp.revision_id = r.id
    join public.proposals p on p.id = fp.proposal_id and p.item_id = i.id and p.status = 'filed'
   where private.is_public_item(i.visibility, i.status, i.data_as_of)
     and private.revision_passed(r.id)
   order by i.id, fp.fact_id, r.rev_no desc, fp.created_at desc;
$$;

-- Anon only (the capture_days precedent): the showcase repo reads through the cookie-less public client.
revoke execute on function public.public_fact_checks() from public, anon, authenticated, service_role;
grant execute on function public.public_fact_checks() to anon;
