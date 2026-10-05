-- =============================================================================
-- 20261005000001_core.sql - Phase 1 core: identity, catalog, research, capture,
-- compliance, ops. The only schema source (ADR-001 s4). Never edit this file
-- after it reaches the hosted project; add a later migration instead.
-- Spec: docs/specs/2026-10-04-phase-1-core-design.md s3.
-- =============================================================================

create schema if not exists private; -- must exist before its default privileges (section 0)

-- 0. Nothing in public or private is reachable by API roles unless granted in section 10.
-- Implicit PUBLIC EXECUTE on new functions can only be removed by a global default
-- (a per-schema REVOKE cannot undo a global grant), so the first statement is global.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

-- 1. Private schema: helpers and settings, never exposed by the Data API.
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
-- The auth service fires on_auth_user_created; give it a path to the trigger function.
grant usage on schema private to supabase_auth_admin;

-- The migration creates the table only. The admin email is seeded by hand on the
-- hosted project and by supabase/seed.sql locally; it is never committed here.
create table private.settings (
  key   text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated, service_role;

-- 2. Identity. Role comes from private.settings('admin_email'), never user_metadata.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- The 30-day publication lag (decision D3), written once. Every public-read policy
-- and, in Task 4, every public view calls this instead of repeating the expression.
create function private.is_lagged(d date)
returns boolean language sql stable set search_path = ''
as $$
  select d is null or d <= current_date - 30;
$$;

-- The public tier predicate (decision D3), written once: public + published + past the
-- lag. Every public-read policy and, in Task 4, every public view calls this.
create function private.is_public_item(visibility text, status text, data_as_of date)
returns boolean language sql stable set search_path = ''
as $$
  select visibility = 'public' and status = 'published' and private.is_lagged(data_as_of);
$$;

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_email text;
begin
  select s.value into v_admin_email from private.settings s where s.key = 'admin_email';
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case when v_admin_email is not null
              and lower(coalesce(new.email, '')) = lower(v_admin_email)
         then 'admin' else 'client' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.apply_admin_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.key = 'admin_email' then
    update public.profiles
       set role = case when lower(email) = lower(new.value) then 'admin' else 'client' end
     where true;
  end if;
  return new;
end;
$$;

create trigger settings_apply_admin_email
  after insert or update on private.settings
  for each row execute function private.apply_admin_email();

-- Users created before this migration (Shlok creates the admin first) get a profile now.
insert into public.profiles (id, email)
select u.id, coalesce(u.email, '') from auth.users u
on conflict (id) do nothing;

-- 3. Catalog. Capture creates stubs flagged needs_review.
create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (length(trim(name)) > 0),
  nse_symbol   text unique check (nse_symbol = upper(nse_symbol)),
  bse_code     text,
  isin         text,
  sector       text,
  one_liner    text,
  visibility   text not null default 'private' check (visibility in ('private', 'clients', 'public')),
  needs_review boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.themes (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null check (length(trim(name)) > 0),
  description_md text,
  visibility     text not null default 'private' check (visibility in ('private', 'clients', 'public')),
  needs_review   boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 4. Research: items and append-only revisions.
create table public.items (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('note', 'thesis', 'learning', 'case_study', 'process')),
  slug                text unique check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (length(trim(title)) > 0),
  company_id          uuid references public.companies (id) on delete restrict,
  theme_id            uuid references public.themes (id) on delete restrict,
  visibility          text not null default 'private' check (visibility in ('private', 'clients', 'public')),
  status              text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_revision_id uuid,
  published_at        timestamptz,
  data_as_of          date,
  learning_objective  text,
  holds_position      text check (holds_position in ('yes', 'no', 'not_disclosed')),
  search              tsvector generated always as (
                        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                        setweight(to_tsvector('english'::regconfig, coalesce(learning_objective, '')), 'B')
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.item_revisions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.items (id) on delete restrict,
  rev_no         int not null default 0 check (rev_no >= 1), -- set by trigger
  body_md        text not null default '',
  structured     jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  change_reason  text,
  author         text not null default 'aksh' check (author in ('aksh', 'system')),
  created_at     timestamptz not null default now(),
  unique (item_id, rev_no)
);

alter table public.items
  add constraint items_current_revision_fk
  foreign key (current_revision_id) references public.item_revisions (id) on delete restrict;

create function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function private.set_updated_at();

create function private.assign_rev_no()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.items i where i.id = new.item_id for update;
  select coalesce(max(r.rev_no), 0) + 1 into new.rev_no
    from public.item_revisions r where r.item_id = new.item_id;
  return new;
end;
$$;

create trigger item_revisions_assign_rev_no
  before insert on public.item_revisions
  for each row execute function private.assign_rev_no();

create function private.reject_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create trigger item_revisions_append_only
  before update or delete on public.item_revisions
  for each row execute function private.reject_mutation();
create trigger item_revisions_no_truncate
  before truncate on public.item_revisions
  for each statement execute function private.reject_mutation();

create function private.check_current_revision()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.current_revision_id is not null and not exists (
    select 1 from public.item_revisions r
    where r.id = new.current_revision_id and r.item_id = new.id
  ) then
    raise exception 'current_revision_id % does not belong to item %',
      new.current_revision_id, new.id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger items_check_current_revision
  before insert or update of current_revision_id on public.items
  for each row execute function private.check_current_revision();

-- 5. Capture log: stored verbatim before parsing, never deleted.
create table public.captures (
  id         uuid primary key default gen_random_uuid(),
  raw_text   text not null,
  parsed     jsonb,
  item_id    uuid references public.items (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  theme_id   uuid references public.themes (id) on delete set null,
  source     text not null default 'web' check (source in ('web', 'mobile', 'api')),
  client_id  uuid unique,
  created_at timestamptz not null default now()
);

create function private.guard_capture_raw_text()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.raw_text is distinct from old.raw_text then
    raise exception 'captures.raw_text is stored verbatim and cannot change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger captures_raw_text_immutable
  before update on public.captures
  for each row execute function private.guard_capture_raw_text();
create function private.reject_capture_removal()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'captures are never deleted: % is not allowed', tg_op
    using errcode = 'P0001';
end;
$$;

create trigger captures_no_delete
  before delete on public.captures
  for each row execute function private.reject_capture_removal();
create trigger captures_no_truncate
  before truncate on public.captures
  for each statement execute function private.reject_capture_removal();

-- 6. Compliance: audit trail of every gate decision, and the sentence allowlist.
create table public.gate_decisions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.items (id) on delete restrict,
  revision_id    uuid not null references public.item_revisions (id) on delete restrict,
  policy_version text not null,
  verdict        text not null check (verdict in ('pass', 'fail')),
  reasons        jsonb not null default '{}'::jsonb,
  decided_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create trigger gate_decisions_append_only
  before update or delete on public.gate_decisions
  for each row execute function private.reject_mutation();
create trigger gate_decisions_no_truncate
  before truncate on public.gate_decisions
  for each statement execute function private.reject_mutation();

create table public.lint_allowances (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.items (id) on delete cascade,
  sentence_hash text not null check (sentence_hash ~ '^[0-9a-f]{64}$'),
  reason        text not null check (length(trim(reason)) >= 3),
  created_at    timestamptz not null default now(),
  unique (item_id, sentence_hash)
);

create function private.revision_passed(p_revision_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.gate_decisions g
    where g.revision_id = p_revision_id and g.verdict = 'pass'
  );
$$;

-- 7. Ops: one row per clock tick (spec s8).
create table public.heartbeats (
  id         uuid primary key default gen_random_uuid(),
  job        text not null,
  ran_at     timestamptz not null default now(),
  ok         boolean not null,
  detail     text,
  created_at timestamptz not null default now()
);

-- 8. Indexes (spec s3). item_revisions(item_id, rev_no) is served by its unique constraint.
create index items_company_id_idx          on public.items (company_id);
create index items_theme_id_idx            on public.items (theme_id);
create index items_current_revision_id_idx on public.items (current_revision_id);
create index items_public_feed_idx         on public.items (visibility, status, published_at desc);
create index items_search_idx              on public.items using gin (search);
create index captures_created_at_idx       on public.captures (created_at desc);
create index captures_item_id_idx          on public.captures (item_id);
create index captures_company_id_idx       on public.captures (company_id);
create index captures_theme_id_idx         on public.captures (theme_id);
create index gate_decisions_item_idx       on public.gate_decisions (item_id, decided_at desc);
create index gate_decisions_revision_idx   on public.gate_decisions (revision_id);
create index heartbeats_job_ran_at_idx     on public.heartbeats (job, ran_at desc);

-- 9. Row level security.
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.themes          enable row level security;
alter table public.items           enable row level security;
alter table public.item_revisions  enable row level security;
alter table public.captures        enable row level security;
alter table public.gate_decisions  enable row level security;
alter table public.lint_allowances enable row level security;
alter table public.heartbeats      enable row level security;

create policy profiles_admin_all on public.profiles for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy companies_admin_all on public.companies for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy themes_admin_all on public.themes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy items_admin_all on public.items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy item_revisions_admin_all on public.item_revisions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy captures_admin_all on public.captures for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy gate_decisions_admin_read on public.gate_decisions for select to authenticated
  using ((select private.is_admin()));
create policy lint_allowances_admin_all on public.lint_allowances for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy heartbeats_admin_read on public.heartbeats for select to authenticated
  using ((select private.is_admin()));

-- Public reads, for anon only: the same predicate as the public_* views (decision D3),
-- so the 30-day rule holds in SQL whichever object a caller queries. They are not
-- extended to `authenticated`: that role holds full-table grants for the admin, and a
-- public-read policy would hand any non-admin session every column of a public row.
create policy items_public_read on public.items for select to anon
  using (private.is_public_item(visibility, status, data_as_of));
create policy item_revisions_public_read on public.item_revisions for select to anon
  using (private.revision_passed(id) and exists (
    select 1 from public.items i
    where i.id = item_revisions.item_id
      and private.is_public_item(i.visibility, i.status, i.data_as_of)));
-- A company or theme is public only when its own visibility says so AND a public item uses it.
create policy companies_public_read on public.companies for select to anon
  using (visibility = 'public' and exists (
    select 1 from public.items i
    where i.company_id = companies.id
      and private.is_public_item(i.visibility, i.status, i.data_as_of)));
create policy themes_public_read on public.themes for select to anon
  using (visibility = 'public' and exists (
    select 1 from public.items i
    where i.theme_id = themes.id
      and private.is_public_item(i.visibility, i.status, i.data_as_of)));

-- 10. Grants. Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke execute on all functions in schema public from public, anon, authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
-- RLS predicates run as the caller, so the helpers they call must be executable by it.
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.revision_passed(uuid) to anon, authenticated;
grant execute on function private.is_lagged(date) to anon, authenticated;
grant execute on function private.is_public_item(text, text, date) to anon, authenticated;

-- anon: column-level SELECT only, limited to what the public views (Task 4) expose.
-- The *_public_read policies then restrict the rows. No full-table SELECT anywhere.
grant select (id, slug, name, one_liner, sector, nse_symbol, visibility) on public.companies to anon;
grant select (id, slug, name, visibility) on public.themes to anon;
grant select (id, kind, slug, title, company_id, theme_id, visibility, status, current_revision_id,
              published_at, data_as_of, learning_objective, holds_position) on public.items to anon;
grant select (id, item_id, rev_no, body_md, structured, change_reason, created_at)
  on public.item_revisions to anon;

-- authenticated: the admin only (signups are disabled; every policy above is admin-only
-- for this role). RLS still filters every row.
grant select, insert, update on public.companies, public.themes, public.items, public.captures to authenticated;
grant select, insert on public.item_revisions to authenticated;
grant select, insert, delete on public.lint_allowances to authenticated;
grant select on public.profiles, public.gate_decisions, public.heartbeats to authenticated;

-- service_role: job code (src/modules/ops) writes and reads heartbeats only in Phase 1.
grant select, insert on public.heartbeats to service_role;
