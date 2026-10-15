-- =============================================================================
-- 20261016000020_knowledge.sql - Phase 4 Task 1: concepts on the revision (spec s4; plan D45, D47, D49, D52, D56).
-- A concept is a screened themes row (D45). A link is item_revisions.concept_ids, carried forward by SQL when a write omits it
-- (D47), so a link reaches the public only on a revision that passed publish_revision() (migration 0021). Nothing here changes
-- what a visitor sees until Aksh publishes a revision that carries concepts.
--   1. items.kind gains 'reading_note' (the private reading log, D52; the gate refuses it in 0021).
--   2. item_revisions.concept_ids uuid[] and the BEFORE INSERT carry trigger.
--   3. themes_public_is_screened: a stub or archived theme is never public.
--   4. concept_edges (admin only, his own links, private this phase: D49).
--   5. public.concept_links (admin view over latest revisions).
--   6. Public reads: concept_ids column for anon, the widened themes predicate, public_concept_links.
--   7. The two catalog guards, widened for themes to "the current revision of a public item links it".
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

-- 1. The reading log is an item kind. "reading" alone is taken in code by kill-criteria test readings.
alter table public.items drop constraint items_kind_check,
  add constraint items_kind_check check (kind in ('note', 'thesis', 'learning', 'case_study', 'process', 'reading_note'));

-- 2. Concepts on the revision. Null means "carry the previous revision's" (existing rows stay null: revisions are append-only,
-- and a gated revision must not gain links after its gate). The check also covers the carried array.
alter table public.item_revisions
  add column concept_ids uuid[]
  check (concept_ids is null or (cardinality(concept_ids) <= 8 and array_position(concept_ids, null) is null));

-- Carry, dedupe, drop archived, refuse unknown. Fires after item_revisions_assign_rev_no (alphabetical order), which has
-- already locked the item row, so two concurrent writes to one item cannot both carry the same predecessor.
-- An unknown id is refused only when it is explicit (a carried id whose theme row no longer exists is just dropped, so one
-- bad row can never block every later revision of an item).
create function private.carry_concept_ids()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_ids      uuid[] := new.concept_ids;
  v_explicit boolean := new.concept_ids is not null;
  v_theme    uuid;
begin
  if v_explicit and array_position(v_ids, null) is not null then
    raise exception 'concept_ids: a null element is not a concept' using errcode = '23514';
  end if;
  if not v_explicit then
    select r.concept_ids into v_ids
      from public.item_revisions r
     where r.item_id = new.item_id and r.concept_ids is not null
     order by r.rev_no desc limit 1;
    if not found then
      select i.theme_id into v_theme from public.items i where i.id = new.item_id;
      v_ids := case when v_theme is null then '{}'::uuid[] else array[v_theme] end;
    end if;
  elsif exists (select 1 from unnest(v_ids) u(id) where not exists (select 1 from public.themes t where t.id = u.id)) then
    raise exception 'concept_ids: unknown concept' using errcode = '23503';
  end if;
  -- First occurrence of each id, order kept (the first is the primary concept); archived themes dropped.
  select coalesce(array_agg(s.id order by s.min_ord), '{}'::uuid[]) into new.concept_ids
    from (select u.id, min(u.ord) as min_ord from unnest(v_ids) with ordinality u(id, ord) group by u.id) s
    join public.themes t on t.id = s.id
   where t.archived_at is null;
  return new;
end;
$$;

create trigger item_revisions_carry_concepts
  before insert on public.item_revisions
  for each row execute function private.carry_concept_ids();

-- 3. A stub or archived theme is never public, so the anon predicates need no archived_at column. No code path made a stub or
-- archived theme public before Phase 4; if a row breaks the rule anyway, stop here with its slugs (T1 review) rather than with
-- a bare check violation, and never demote it here (a public change goes through publish_revision() and the guards).
do $$
declare v_bad text;
begin
  select string_agg(t.slug, ', ' order by t.slug) into v_bad from public.themes t
   where t.visibility = 'public' and (t.needs_review or t.archived_at is not null);
  if v_bad is not null then
    raise exception '0020: public themes that are stubs or archived: %. Make each private (or screen it) first.', v_bad
      using errcode = '23514';
  end if;
end;
$$;
alter table public.themes add constraint themes_public_is_screened
  check (visibility <> 'public' or (needs_review = false and archived_at is null));

-- 4. His own links between concepts. Undirected (a < b), no label, no note. Admin only; nothing for anon or service_role.
create table public.concept_edges (
  id         uuid primary key default gen_random_uuid(),
  concept_a  uuid not null references public.themes (id),
  concept_b  uuid not null references public.themes (id),
  created_at timestamptz not null default now(),
  check (concept_a < concept_b),
  unique (concept_a, concept_b)
);
create index concept_edges_concept_b_idx on public.concept_edges (concept_b);
alter table public.concept_edges enable row level security;
create policy concept_edges_admin_select on public.concept_edges for select to authenticated
  using ((select private.is_admin()));
create policy concept_edges_admin_insert on public.concept_edges for insert to authenticated
  with check ((select private.is_admin()));
create policy concept_edges_admin_delete on public.concept_edges for delete to authenticated
  using ((select private.is_admin()));
revoke all on public.concept_edges from public, anon, authenticated, service_role;
grant select, insert, delete on public.concept_edges to authenticated;

-- 5. Per item, its latest revision's concepts (legacy rule: a null array reads as the item's theme_id; null elements and
-- archived themes drop out, so position can have gaps). The base-table RLS does the rest: a non-admin session reads nothing.
create view public.concept_links with (security_invoker = true) as
select l.item_id, l.revision_id, c.concept_id, c.position::int as position
from (select distinct on (r.item_id) r.item_id, r.id as revision_id, r.concept_ids, i.theme_id
        from public.item_revisions r
        join public.items i on i.id = r.item_id
       order by r.item_id, r.rev_no desc) l
cross join lateral unnest(coalesce(l.concept_ids, array[l.theme_id])) with ordinality as c(concept_id, position)
join public.themes t on t.id = c.concept_id and t.archived_at is null;
revoke all on public.concept_links from public, anon, authenticated, service_role;
grant select on public.concept_links to authenticated;

-- 6. Public reads. concept_ids is readable by anon only on revisions the existing item_revisions_public_read policy lets
-- through (a revision that passed the gate, of a public item past the lag).
grant select (concept_ids) on public.item_revisions to anon;

-- A theme is public when its own visibility says so AND a public item uses it: through theme_id (as before), or because the
-- CURRENT revision of a public item lists it. A pending (newer, ungated) revision never counts: current_revision_id moves
-- only when publish_revision() passes. The views repeat the full predicate (the admin passes every base-table policy).
drop policy themes_public_read on public.themes;
create policy themes_public_read on public.themes for select to anon
  using (visibility = 'public' and (
    exists (select 1 from public.items i
             where i.theme_id = themes.id
               and private.is_public_item(i.visibility, i.status, i.data_as_of))
    or exists (select 1 from public.items i
                 join public.item_revisions r on r.id = i.current_revision_id
                where private.is_public_item(i.visibility, i.status, i.data_as_of)
                  and themes.id = any (r.concept_ids))));

create or replace view public.public_themes with (security_invoker = true) as
select t.id, t.slug, t.name
from public.themes t
where t.visibility = 'public'
  and (exists (select 1 from public.items i
                where i.theme_id = t.id
                  and private.is_public_item(i.visibility, i.status, i.data_as_of))
       or exists (select 1 from public.items i
                    join public.item_revisions r on r.id = i.current_revision_id
                   where private.is_public_item(i.visibility, i.status, i.data_as_of)
                     and t.id = any (r.concept_ids)));

-- Which public concepts each gated revision of a public item links. Same legacy rule as concept_links, so a theme made public
-- through theme_id alone never shows as a concept with no items. Only concepts that are public now.
create view public.public_concept_links with (security_invoker = true) as
select r.item_id, r.id as revision_id, c.concept_id, c.position::int as position
from public.item_revisions r
join public.items i on i.id = r.item_id
cross join lateral unnest(coalesce(r.concept_ids, array[i.theme_id])) with ordinality as c(concept_id, position)
where private.is_public_item(i.visibility, i.status, i.data_as_of)
  and private.revision_passed(r.id)
  and exists (select 1 from public.public_themes pt where pt.id = c.concept_id);
revoke all on public.public_concept_links from public, anon, authenticated, service_role;
grant select on public.public_concept_links to anon, authenticated;

-- 7. Guards. Restated from 20261005000002_publish.sql (visibility) and 20261007000004_hardening.sql section 7 (public columns),
-- widening only the themes clause: "a public item uses it" now also means "its current revision's concept_ids contains it".
-- create or replace keeps the triggers; the revokes are restated.
create or replace function private.guard_catalog_visibility()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.visibility = 'public' and new.visibility is distinct from 'public' and exists (
    select 1 from public.items i
     where i.visibility = 'public'
       and ((tg_table_name = 'companies' and i.company_id = old.id)
         or (tg_table_name = 'themes' and (i.theme_id = old.id
              or exists (select 1 from public.item_revisions r
                          where r.id = i.current_revision_id and old.id = any (r.concept_ids)))))
  ) then
    raise exception '%.%: public items still use it; unpublish them first', tg_table_name, old.slug
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.guard_catalog_public_columns()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
begin
  if exists (select 1 from unnest(tg_argv) c where (v_new -> c) is distinct from (v_old -> c))
     and exists (
       select 1 from public.items i
        where i.visibility = 'public'
          and ((tg_table_name = 'companies' and i.company_id = old.id)
            or (tg_table_name = 'themes' and (i.theme_id = old.id
                 or exists (select 1 from public.item_revisions r
                             where r.id = i.current_revision_id and old.id = any (r.concept_ids)))))
     ) then
    raise exception '%.%: public items use it; unpublish them first', tg_table_name, old.slug
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Function privileges: no API role executes any of these (triggers need no EXECUTE grant).
revoke execute on function private.carry_concept_ids() from public, anon, authenticated, service_role;
revoke execute on function private.guard_catalog_visibility() from public, anon, authenticated, service_role;
revoke execute on function private.guard_catalog_public_columns() from public, anon, authenticated, service_role;
