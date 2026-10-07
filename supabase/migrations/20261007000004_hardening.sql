-- =============================================================================
-- 20261007000004_hardening.sql - fixes from the Plan 1A final review (2026-10-07). 0001-0003 are applied to
-- the hosted project and are never edited; everything here replaces or adds.
--   I1 (Q8, ADR-003) publish_revision, unpublish_item and lint-allowance writes are confined to service_role.
--      Each takes the admin the server action verified (p_actor) and re-checks it against profiles.role.
--      The policy version is pinned in SQL. authenticated loses EXECUTE and lint_allowances writes, so an
--      admin access token alone (for example one lifted by XSS) can no longer publish or forge a lint.
--   I2 The 30-day lag is counted on the India calendar, not the caller's session timezone.
--   I3 A company's or theme's public text and identifiers are frozen while a public item links it.
--   Slug: private.slugify caps at 60 characters on a dash boundary.
-- Spec: docs/specs/2026-10-04-phase-1-core-design.md s3; review .superpowers/sdd/2026-10-04-phase-1a-core.
-- =============================================================================

-- 1. Admin check for a named actor. Called only from the definer functions below (they run as the owner);
-- no API role may execute it.
create function private.is_admin_user(p_actor uuid)
returns boolean language sql stable set search_path = ''
as $$
  select p_actor is not null and exists (
    select 1 from public.profiles p where p.id = p_actor and p.role = 'admin'
  );
$$;
revoke execute on function private.is_admin_user(uuid) from public, anon, authenticated, service_role;

-- 2. The 30-day lag on the India calendar (I2). now() is the same instant in every session; AT TIME ZONE with
-- a fixed zone name turns it into the Asia/Kolkata wall clock, so `Prefer: timezone=...` cannot move the
-- boundary. Same signature, so every policy and view that calls it picks this up. TypeScript uses the same
-- rule: isPastLag() in src/lib/dates.ts with istDate().
create or replace function private.is_lagged(d date)
returns boolean language sql stable set search_path = ''
as $$
  select d is null or d <= (now() at time zone 'Asia/Kolkata')::date - 30;
$$;

-- 3. Slugs for public URLs: at most 60 characters, cut back to the last whole word, no dash runs. A
-- symbol-only title still gives '' and publish_revision falls back to 'item'.
create or replace function private.slugify(p_text text)
returns text language sql immutable set search_path = ''
as $$
  with s as (
    select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-') as v
  )
  select case
           when length(v) <= 60 then v
           when substr(v, 61, 1) = '-' then left(v, 60)
           else btrim(regexp_replace(left(v, 60), '-[^-]*$', ''), '-')
         end
    from s;
$$;

-- 4. The publish path (I1). The 0003 body with three changes: the actor parameter and its admin check
-- (instead of auth.uid()), the pinned policy version, and the IST date in the case-study check (I2).
drop function public.publish_revision(uuid, uuid, text, jsonb);

create function public.publish_revision(
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
           slug = v_slug
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- The guard honours the gate only for the owner of publish_revision; point it at the new signature.
-- Body otherwise identical to 20261005000002.
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
    return new;
  end if;
  if new.published_at is distinct from old.published_at then
    raise exception 'items: published_at is stamped only by publish_revision()' using errcode = '42501';
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

-- 5. Retraction, with the same actor check.
drop function public.unpublish_item(uuid);

create function public.unpublish_item(p_actor uuid, p_item_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_slug text;
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'unpublish_item: admin only' using errcode = '42501';
  end if;
  update public.items set visibility = 'private' where id = p_item_id returning slug into v_slug;
  if not found then
    raise exception 'unpublish_item: item % not found', p_item_id using errcode = 'P0002';
  end if;
  return v_slug;
end;
$$;

-- 6. Lint allowances (rule 1 only, publishing-rules). The admin session keeps SELECT through RLS; writes go
-- through these two functions. An allowance is accepted only for a sentence that the item's latest gate
-- decision flagged under rule 1, and only while that decision is for the item's newest revision. Returns
-- false (records nothing) when refused; raises only for a non-admin actor.
revoke insert, update, delete on public.lint_allowances from authenticated;
drop policy lint_allowances_admin_all on public.lint_allowances;
create policy lint_allowances_admin_read on public.lint_allowances for select to authenticated
  using ((select private.is_admin()));

create function public.add_lint_allowance(p_actor uuid, p_item_id uuid, p_sentence_hash text, p_reason text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_decision public.gate_decisions;
  v_latest   uuid;
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'add_lint_allowance: admin only' using errcode = '42501';
  end if;
  -- Serialise with publish_revision and new revisions (assign_rev_no locks the same row).
  perform 1 from public.items i where i.id = p_item_id for update;
  if not found then
    return false;
  end if;
  select * into v_decision from public.gate_decisions g
   where g.item_id = p_item_id order by g.decided_at desc, g.created_at desc limit 1;
  select r.id into v_latest from public.item_revisions r
   where r.item_id = p_item_id order by r.rev_no desc limit 1;
  if v_decision.id is null or v_decision.revision_id is distinct from v_latest
     or not coalesce(v_decision.reasons -> 'lint' -> 'findings', '[]'::jsonb)
            @> jsonb_build_array(jsonb_build_object('rule', '1', 'sentenceHash', p_sentence_hash)) then
    return false;
  end if;
  insert into public.lint_allowances (item_id, sentence_hash, reason)
  values (p_item_id, p_sentence_hash, p_reason)
  on conflict (item_id, sentence_hash) do nothing;
  return true;
end;
$$;

create function public.remove_lint_allowance(p_actor uuid, p_item_id uuid, p_sentence_hash text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'remove_lint_allowance: admin only' using errcode = '42501';
  end if;
  delete from public.lint_allowances where item_id = p_item_id and sentence_hash = p_sentence_hash;
  return found;
end;
$$;

-- 7. Public catalog columns are frozen while a public item links the row (I3). The columns are the trigger
-- arguments: everything public_companies / public_themes show (the text the lint reads under rule 8, plus
-- the bse_code and isin identifiers); id is the key and visibility has its own guard.
create function private.guard_catalog_public_columns()
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
            or (tg_table_name = 'themes' and i.theme_id = old.id))
     ) then
    raise exception '%.%: public items use it; unpublish them first', tg_table_name, old.slug
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger companies_guard_public_columns
  before update of name, slug, nse_symbol, one_liner, sector, bse_code, isin on public.companies
  for each row execute function private.guard_catalog_public_columns(
    'name', 'slug', 'nse_symbol', 'one_liner', 'sector', 'bse_code', 'isin');
create trigger themes_guard_public_columns
  before update of name, slug on public.themes
  for each row execute function private.guard_catalog_public_columns('name', 'slug');

-- 8. Function privileges. Everything else stays revoked (section 0 of the first migration).
revoke execute on function private.guard_catalog_public_columns() from public, anon, authenticated, service_role;
revoke execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.unpublish_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.add_lint_allowance(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.remove_lint_allowance(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.unpublish_item(uuid, uuid) to service_role;
grant execute on function public.add_lint_allowance(uuid, uuid, text, text) to service_role;
grant execute on function public.remove_lint_allowance(uuid, uuid, text) to service_role;
