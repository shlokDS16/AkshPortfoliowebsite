-- =============================================================================
-- 20261005000002_publish.sql - Phase 1 core, part 2: public views, the publish
-- gate, retraction, and the public health function. Continues 20261005000001.
-- Spec: docs/specs/2026-10-04-phase-1-core-design.md s3 (amended 2026-10-05).
-- =============================================================================

-- 11. Public views. security_invoker = true so the caller's RLS applies. The admin
-- passes the admin policy on every base table, so each view repeats the full public
-- predicate itself (via the one shared helper) instead of relying on RLS to hide rows.
create view public.public_items with (security_invoker = true) as
select i.id, i.kind, i.slug, i.title, i.company_id, i.theme_id, i.published_at, i.data_as_of,
       i.learning_objective, i.holds_position,
       r.id as revision_id, r.rev_no, r.body_md, r.structured, r.schema_version,
       r.created_at as revised_at
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
where private.is_public_item(i.visibility, i.status, i.data_as_of);

-- change_reason is exposed only for revisions that passed the gate.
create view public.public_item_revisions with (security_invoker = true) as
select r.id, r.item_id, r.rev_no, r.body_md, r.structured, r.change_reason, r.created_at
from public.item_revisions r
join public.items i on i.id = r.item_id
where private.is_public_item(i.visibility, i.status, i.data_as_of)
  and private.revision_passed(r.id);

create view public.public_companies with (security_invoker = true) as
select c.id, c.slug, c.name, c.nse_symbol, c.bse_code, c.isin, c.sector
from public.companies c
where c.visibility = 'public'
  and exists (select 1 from public.items i
              where i.company_id = c.id
                and private.is_public_item(i.visibility, i.status, i.data_as_of));

create view public.public_themes with (security_invoker = true) as
select t.id, t.slug, t.name
from public.themes t
where t.visibility = 'public'
  and exists (select 1 from public.items i
              where i.theme_id = t.id
                and private.is_public_item(i.visibility, i.status, i.data_as_of));

-- The views read columns the first migration did not open to anon. Same columns the
-- views expose, nothing more; the *_public_read policies still restrict the rows.
grant select (bse_code, isin) on public.companies to anon;
grant select (schema_version) on public.item_revisions to anon;

revoke all on public.public_items, public.public_item_revisions,
              public.public_companies, public.public_themes from public, anon, authenticated, service_role;
grant select on public.public_items, public.public_item_revisions,
                public.public_companies, public.public_themes to anon, authenticated;

-- 12. Slug helper. Not callable by API roles; publish_revision (definer) uses it.
create function private.slugify(p_text text)
returns text language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-');
$$;

-- 13. Guard: only publish_revision() may make an item public or change what a public
-- item shows. The gate is a transaction-local setting that publish_revision sets for
-- its own update. It only counts when the caller is not an API role, so an API role
-- that sets the setting itself gains nothing.
create function private.guard_publish_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.publish_gate', true), '') = 'on'
     and current_user not in ('anon', 'authenticated', 'service_role', 'authenticator') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.visibility = 'public' or new.status = 'published' or new.published_at is not null then
      raise exception 'items: only publish_revision() can make an item public' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status = 'published' and old.status is distinct from 'published' then
    raise exception 'items: only publish_revision() can publish' using errcode = '42501';
  end if;
  if new.visibility = 'public' and (
       old.visibility is distinct from 'public'
    or new.current_revision_id is distinct from old.current_revision_id
    or new.title is distinct from old.title
    or new.slug is distinct from old.slug
    or new.kind is distinct from old.kind
    or new.company_id is distinct from old.company_id
    or new.theme_id is distinct from old.theme_id
    or new.learning_objective is distinct from old.learning_objective
    or new.data_as_of is distinct from old.data_as_of
    or new.holds_position is distinct from old.holds_position
    or new.status is distinct from old.status
    or new.published_at is distinct from old.published_at
  ) then
    raise exception 'items: a public item changes only through publish_revision(); unpublish to edit details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger items_guard_publish
  before insert or update on public.items
  for each row execute function private.guard_publish_columns();

-- 14. The only publish path. Re-checks in SQL what the TypeScript lint already checked,
-- records every decision (a failure is a recorded row, not an exception, so the audit
-- trail survives), and raises only for "not admin" and "not found".
create function public.publish_revision(
  p_item_id        uuid,
  p_revision_id    uuid,
  p_policy_version text,
  p_lint_result    jsonb
)
returns public.gate_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  v_item     public.items;
  v_failures jsonb := '[]'::jsonb;
  v_decision public.gate_decisions;
begin
  if not private.is_admin() then
    raise exception 'publish_revision: admin only' using errcode = '42501';
  end if;

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'publish_revision: item % not found', p_item_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.item_revisions r
                 where r.id = p_revision_id and r.item_id = p_item_id) then
    raise exception 'publish_revision: revision % does not belong to item %', p_revision_id, p_item_id
      using errcode = 'P0002';
  end if;

  if (p_lint_result -> 'passed') is distinct from 'true'::jsonb then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'lint', 'message', 'The text lint did not pass.'));
  end if;
  if (p_lint_result ->> 'revisionId') is distinct from p_revision_id::text then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'lint', 'message', 'The lint result belongs to a different revision.'));
  end if;
  if coalesce(p_policy_version, '') = ''
     or (p_lint_result ->> 'policyVersion') is distinct from p_policy_version then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'policy', 'message', 'The lint ran under a different policy version.'));
  end if;
  if v_item.learning_objective is null or length(trim(v_item.learning_objective)) = 0 then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '6', 'message', 'A learning objective is required.'));
  end if;
  if v_item.company_id is not null and v_item.holds_position is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '5', 'message', 'holds_position is required when a company is named.'));
  end if;
  if v_item.kind = 'case_study'
     and (v_item.data_as_of is null or v_item.data_as_of > current_date - 30) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A case study needs data_as_of at least 30 days old.'));
  end if;
  -- Rule '4' (named-security recency) is reserved: it needs the Phase 3 ledger, and
  -- that phase's migration replaces this function to add the check.
  if exists (select 1 from public.companies c
             where c.id = v_item.company_id and c.visibility <> 'public') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'company', 'message', 'The linked company is not public.'));
  end if;
  if exists (select 1 from public.themes t
             where t.id = v_item.theme_id and t.visibility <> 'public') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'theme', 'message', 'The linked theme is not public.'));
  end if;

  insert into public.gate_decisions (item_id, revision_id, policy_version, verdict, reasons)
  values (
    p_item_id, p_revision_id, coalesce(p_policy_version, ''),
    case when jsonb_array_length(v_failures) = 0 then 'pass' else 'fail' end,
    jsonb_build_object('failures', v_failures, 'lint', coalesce(p_lint_result, '{}'::jsonb))
  )
  returning * into v_decision;

  if v_decision.verdict = 'pass' then
    perform set_config('app.publish_gate', 'on', true);
    update public.items
       set visibility = 'public',
           status = 'published',
           current_revision_id = p_revision_id,
           published_at = coalesce(published_at, now()),
           slug = coalesce(slug,
                    coalesce(nullif(private.slugify(title), ''), 'item') || '-' || left(id::text, 6))
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- Retraction. Visibility goes back to private; status stays as it was, so the item can
-- be edited and republished through the gate. Returns the slug for cache purging.
create function public.unpublish_item(p_item_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_slug text;
begin
  if not private.is_admin() then
    raise exception 'unpublish_item: admin only' using errcode = '42501';
  end if;
  update public.items set visibility = 'private' where id = p_item_id returning slug into v_slug;
  if not found then
    raise exception 'unpublish_item: item % not found', p_item_id using errcode = 'P0002';
  end if;
  return v_slug;
end;
$$;

-- 15. Liveness for the public /api/health route: the latest run per job, nothing else
-- (no detail column). The only way anon reaches the heartbeats table.
create function public.heartbeat_ages()
returns table (job text, age_seconds numeric, ok boolean)
language sql stable security definer set search_path = ''
as $$
  select distinct on (h.job) h.job, extract(epoch from (now() - h.ran_at))::numeric, h.ok
    from public.heartbeats h
   order by h.job, h.ran_at desc;
$$;

-- 16. Function privileges. Everything else stays revoked (section 0 of the first migration).
revoke execute on function public.publish_revision(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.unpublish_item(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.heartbeat_ages() from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.unpublish_item(uuid) to authenticated;
grant execute on function public.heartbeat_ages() to anon;
