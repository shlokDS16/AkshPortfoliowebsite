-- =============================================================================
-- 20261007000005_casefile.sql - Plan 1B: permanent file numbers (D8), the figures-to rule for files (D9),
-- public capture days (D10) and the New names tables (R17). ADR-002. Continues 20261007000004_hardening.sql.
-- 0001-0004 are applied to the hosted project: nothing here edits them; each changed function is restated whole.
-- The 30-day lag is already counted in India time by 0004 (private.is_lagged); this file does not touch it.
-- =============================================================================

-- 9. File numbers (design-dna 11: "File 03", never reused). Assigned only inside publish_revision(); a sequence
-- never hands a number out twice, even after a rollback (a gap is allowed, a repeat is not).
create sequence private.file_no_seq as integer start with 1 minvalue 1 maxvalue 999 no cycle;
revoke all on sequence private.file_no_seq from public, anon, authenticated, service_role;
alter table public.items add column file_no integer unique check (file_no between 1 and 999);
grant select (file_no) on public.items to anon;

-- 10. The publish guard: the 0004 body with two checks added (file_no is never written by a session).
create or replace function private.guard_publish_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.publish_gate', true), '') = 'on'
     and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
                          where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.visibility = 'public' or new.status = 'published' or new.published_at is not null then
      raise exception 'items: only publish_revision() can make an item public' using errcode = '42501';
    end if;
    if new.file_no is not null then
      raise exception 'items: file_no is assigned only by publish_revision()' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.published_at is distinct from old.published_at then
    raise exception 'items: published_at is stamped only by publish_revision()' using errcode = '42501';
  end if;
  if new.file_no is distinct from old.file_no then
    raise exception 'items: file_no is assigned only by publish_revision()' using errcode = '42501';
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
  ) then
    raise exception 'items: a public item changes only through publish_revision(); unpublish to edit details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 11. public_items: the 0002 columns and predicate unchanged, file_no appended (create or replace may only add
-- at the end). Privileges are kept by create or replace.
create or replace view public.public_items with (security_invoker = true) as
select i.id, i.kind, i.slug, i.title, i.company_id, i.theme_id, i.published_at, i.data_as_of,
       i.learning_objective, i.holds_position,
       r.id as revision_id, r.rev_no, r.body_md, r.structured, r.schema_version,
       r.created_at as revised_at,
       i.file_no
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
where private.is_public_item(i.visibility, i.status, i.data_as_of);

-- 12. publish_revision: the 0004 body (actor check, pinned policy, IST dates, latest-only 'revision' and recorded
-- 'slug' failures) with two additions: the figures-to rule for files (D9) and file numbers (D8).
-- Same signature as 0004, so create or replace keeps the function and its grants.
create or replace function public.publish_revision(
  p_actor          uuid,
  p_item_id        uuid,
  p_revision_id    uuid,
  p_policy_version text,
  p_lint_result    jsonb
)
returns public.gate_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  -- Must equal POLICY_VERSION in src/modules/compliance/policy.ts (a vitest checks the two agree).
  c_policy   constant text := 'sebi-unreg-2026-07';
  v_item     public.items;
  v_slug     text;
  v_failures jsonb := '[]'::jsonb;
  v_decision public.gate_decisions;
begin
  if not private.is_admin_user(p_actor) then
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

  -- Latest only: a revision with a newer sibling cannot be published. Recorded like every other
  -- failure (never raised), so the attempt stays in the audit trail.
  if exists (select 1
               from public.item_revisions older
               join public.item_revisions newer on newer.item_id = older.item_id and newer.rev_no > older.rev_no
              where older.id = p_revision_id) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'revision', 'message', 'A newer revision exists; publish the latest.'));
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
  if p_policy_version is distinct from c_policy then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'policy', 'message', format('This database accepts only policy version %s.', c_policy)));
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
     and (v_item.data_as_of is null or v_item.data_as_of > (now() at time zone 'Asia/Kolkata')::date - 30) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A case study needs data_as_of at least 30 days old.'));
  end if;
  -- NEW (D9): a company file needs a figures-to date (the public page shows it; the lag is not required).
  if v_item.kind = 'thesis' and v_item.data_as_of is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A file needs a figures-to date (data_as_of).'));
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

  -- A first publish gets a generated slug; if another item already has it, that is a
  -- recorded failure (never an exception, which would roll back the audit row).
  v_slug := coalesce(v_item.slug,
              coalesce(nullif(private.slugify(v_item.title), ''), 'item') || '-' || left(v_item.id::text, 6));
  if v_item.slug is null
     and exists (select 1 from public.items o where o.slug = v_slug and o.id <> v_item.id) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'slug', 'message', format('The slug %s is already used by another item; rename this item.', v_slug)));
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
           slug = v_slug,
           -- NEW (D8): a file's first pass takes the next number; it never changes or returns.
           file_no = case when v_item.kind in ('thesis', 'case_study')
                          then coalesce(v_item.file_no, nextval('private.file_no_seq')::integer)
                          else v_item.file_no end
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- 13. Public capture days: distinct India dates only (segment 2: "streak shown as counts only"). No text, no
-- ids, no times. The window is the last p_days IST dates including today, capped at 60.
create function public.capture_days(p_days integer default 30)
returns table (day date)
language sql stable security definer set search_path = ''
as $$
  select distinct (c.created_at at time zone 'Asia/Kolkata')::date
    from public.captures c
   where (c.created_at at time zone 'Asia/Kolkata')::date
         > (now() at time zone 'Asia/Kolkata')::date - least(greatest(p_days, 1), 60)
   order by 1;
$$;

-- 14. New names (R17). "Same as X" records an alias and archives the stub; "Not a company/theme" records an
-- ignored token and archives the stub. The catalog stub lookup reads both before creating a stub.
-- archived_at is not one of the columns private.guard_catalog_public_columns freezes (0004), so a stub can be
-- archived while a public item links it; the frozen text and identifiers stay frozen.
alter table public.companies add column archived_at timestamptz;
alter table public.themes add column archived_at timestamptz;

create table public.company_aliases (
  symbol     text primary key
             check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9][A-Z0-9&-]{0,19}$' and symbol ~ '[A-Z]'),
  company_id uuid not null references public.companies (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index company_aliases_company_id_idx on public.company_aliases (company_id);

create table public.ignored_tokens (
  kind       text not null check (kind in ('symbol', 'theme')),
  token      text not null,
  created_at timestamptz not null default now(),
  primary key (kind, token),
  check ((kind = 'symbol' and token = upper(token) and token ~ '^[A-Z0-9][A-Z0-9&-]{0,19}$' and token ~ '[A-Z]')
      or (kind = 'theme' and token ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(token) <= 80))
);

alter table public.company_aliases enable row level security;
alter table public.ignored_tokens  enable row level security;
create policy company_aliases_admin_read on public.company_aliases for select to authenticated
  using ((select private.is_admin()));
create policy company_aliases_admin_insert on public.company_aliases for insert to authenticated
  with check ((select private.is_admin()));
create policy ignored_tokens_admin_read on public.ignored_tokens for select to authenticated
  using ((select private.is_admin()));
create policy ignored_tokens_admin_insert on public.ignored_tokens for insert to authenticated
  with check ((select private.is_admin()));
revoke all on public.company_aliases, public.ignored_tokens from public, anon, authenticated, service_role;
-- No UPDATE or DELETE: decisions are not undone in Phase 1 (D24).
grant select, insert on public.company_aliases, public.ignored_tokens to authenticated;

-- 15. Function privileges. create or replace keeps grants; restated so this file reads alone. 0004's gate
-- confinement (ADR-003) is unchanged: service_role only.
revoke execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.capture_days(integer) from public, anon, authenticated, service_role;
grant execute on function public.capture_days(integer) to anon;
