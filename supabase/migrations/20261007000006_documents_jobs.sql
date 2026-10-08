-- =============================================================================
-- 20261007000006_documents_jobs.sql - Phase 2a: documents, pages, the job queue, the private
-- documents bucket, queue health, and the machine write boundary (ADR-004 s4.2-s4.3).
-- Spec: docs/specs/2026-10-07-phase-2-ingestion-design.md s4. Never edit after it reaches hosted.
-- =============================================================================

-- 1. Documents: one row per upload. Fine-grained state is derived from job_steps (plan E2).
create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references public.companies (id) on delete restrict,
  title               text not null check (length(trim(title)) between 1 and 160),
  kind                text not null default 'pdf' check (kind in ('pdf')),
  storage_path        text unique check (storage_path ~ '^[0-9a-f-]{36}\.pdf$'),
  sha256              text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes               integer not null check (bytes between 1 and 52428800),
  page_count          integer check (page_count between 1 and 5000),
  status              text not null default 'uploading' check (status in ('uploading', 'active', 'done', 'skipped')),
  llm_page_budget     integer not null default 20 check (llm_page_budget between 1 and 40),
  basis               text not null default 'consolidated' check (basis in ('consolidated', 'standalone')),
  source_type         text not null default 'Annual report'
                      check (source_type in ('Annual report', 'Presentation', 'Filing', 'Transcript', 'Other')),
  filed_on            date,
  source_url          text check (source_url is null or source_url ~ '^https?://'),
  original_deleted_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger documents_set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();
create index documents_company_id_idx on public.documents (company_id);
create index documents_status_idx on public.documents (status, created_at desc);

-- 2. Page text: written once by job code; a scan page (under 50 characters) may be filled once by OCR (Plan 2b);
-- selection is editable. first_line feeds the inbox chooser without reading whole pages (R18).
create table public.document_pages (
  document_id uuid not null references public.documents (id) on delete restrict,
  page_no     integer not null check (page_no between 1 and 5000),
  text        text not null,
  char_count  integer generated always as (length(text)) stored,
  is_scan     boolean generated always as (length(btrim(text)) < 50) stored,
  first_line  text generated always as (left(btrim(text), 120)) stored,
  kind        text check (kind in ('pl', 'bs', 'cf', 'notes', 'segment', 'mdna', 'other')),
  basis       text check (basis in ('consolidated', 'standalone')),
  score       real not null default 0,
  selected    boolean not null default false,
  selected_by text check (selected_by in ('rule', 'aksh')),
  search      tsvector generated always as (to_tsvector('simple'::regconfig, left(text, 50000))) stored,
  created_at  timestamptz not null default now(),
  primary key (document_id, page_no)
);
create index document_pages_search_idx on public.document_pages using gin (search);
create index document_pages_selected_idx on public.document_pages (document_id) where selected;

create function private.guard_page_text()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.text is distinct from old.text and length(btrim(old.text)) >= 50)
     or new.page_no <> old.page_no or new.document_id <> old.document_id then
    raise exception 'document_pages.text is written once' using errcode = 'P0001';
  end if;
  -- A page Aksh ticked is his: job code (service_role) may mark a page 'rule' but never records a tick as his,
  -- and never undoes one (the final-review hardening of the R7 boundary).
  if (current_user = 'service_role'
      or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role')
     and ((new.selected_by = 'aksh' and old.selected_by is distinct from 'aksh')
          or (old.selected_by = 'aksh' and (new.selected is distinct from old.selected or new.selected_by is distinct from old.selected_by))) then
    raise exception 'only Aksh ticks a page himself' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger document_pages_text_immutable before update on public.document_pages
  for each row execute function private.guard_page_text();

-- 3. The job queue (ADR-001 s4; pitfalls s1: a lease, not a bare SKIP LOCKED).
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('ingest_pdf')),
  document_id  uuid not null references public.documents (id) on delete restrict,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index jobs_one_live_per_document on public.jobs (document_id) where cancelled_at is null;
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();

create table public.job_steps (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.jobs (id) on delete restrict,
  kind              text not null check (kind in ('pdf_text', 'select_pages', 'extract_page')),
  page_no           integer check (page_no between 1 and 5000),
  args              jsonb not null default '{}'::jsonb,
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'done', 'skipped', 'needs_attention')),
  schema_failures   integer not null default 0 check (schema_failures >= 0),
  provider_failures integer not null default 0 check (provider_failures >= 0),
  lease_expiries    integer not null default 0 check (lease_expiries >= 0),
  not_before        timestamptz not null default now(),
  wait_reason       text check (wait_reason in ('groq_minute', 'groq_day', 'ai_off')),
  locked_until      timestamptz,
  lease_owner       uuid,
  last_error        text check (char_length(last_error) <= 500),
  result            jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- pdf_text carries the page it starts from; extract_page the page it reads; select_pages none.
  check ((kind = 'select_pages') = (page_no is null)),
  -- One step per (job, kind, page); select_pages (page_no null) at most once per job. Not a partial index:
  -- ON CONFLICT (job_id, kind, page_no) DO NOTHING must be able to infer it (idempotent enqueue).
  constraint job_steps_once unique nulls not distinct (job_id, kind, page_no)
);
create index job_steps_runnable_idx on public.job_steps (not_before, created_at) where status in ('queued', 'running');
create index job_steps_job_id_idx on public.job_steps (job_id);
create trigger job_steps_set_updated_at before update on public.job_steps
  for each row execute function private.set_updated_at();

-- 4. Claim one runnable step with a lease. An expired lease is reclaimable and counted, so the runner can stop a
-- step that keeps dying (two expiries -> needs_attention, decided in TypeScript).
create function public.claim_job_step(p_owner uuid, p_lease_seconds integer default 270)
returns setof public.job_steps
language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner is null then
    raise exception 'a lease needs an owner' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 290 then
    raise exception 'lease must be 30-290 seconds' using errcode = '22023';
  end if;
  return query
  with next as (
    select s.id
      from public.job_steps s
      join public.jobs j on j.id = s.job_id
     where j.cancelled_at is null
       and s.not_before <= now()
       and (s.status = 'queued' or (s.status = 'running' and s.locked_until < now()))
     order by s.not_before, s.created_at
     for update of s skip locked
     limit 1
  )
  update public.job_steps s
     set lease_expiries = s.lease_expiries + (case when s.status = 'running' then 1 else 0 end),
         status = 'running',
         locked_until = now() + make_interval(secs => p_lease_seconds),
         lease_owner = p_owner,
         wait_reason = null
    from next
   where s.id = next.id
  returning s.*;
end;
$$;

-- 5. Queue health for the public monitor and the desk strip: a number, never a row (plan E7, R11).
create function public.queue_age()
returns integer language sql stable security definer set search_path = ''
as $$
  select extract(epoch from (now() - min(s.not_before)))::integer
    from public.job_steps s join public.jobs j on j.id = s.job_id
   where j.cancelled_at is null and s.not_before <= now()
     and (s.status = 'queued' or (s.status = 'running' and s.locked_until < now()));
$$;

-- 6. Storage and database size for the desk meters (admin only; nulls for anyone else).
create function public.storage_usage()
returns table (storage_bytes bigint, database_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select
    case when private.is_admin() then
      (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = 'documents')
    end,
    case when private.is_admin() then pg_database_size(current_database()) end;
$$;

-- 7. The machine write boundary (ADR-004 s4.2, layer 1). service_role holds no privilege on items or
-- item_revisions; this trigger refuses the insert even if a grant is ever added, and also when a SECURITY DEFINER
-- function is called with the secret key (current_user is then the owner, but the request's JWT role is not).
create function private.reject_machine_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'service_role'
     or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role' then
    raise exception 'machines do not author revisions (ADR-004 s4.2)' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger item_revisions_no_machine_author before insert on public.item_revisions
  for each row execute function private.reject_machine_revision();

-- 8. RLS: admin only; job code is service_role (bypasses RLS, still needs table privileges).
alter table public.documents      enable row level security;
alter table public.document_pages enable row level security;
alter table public.jobs           enable row level security;
alter table public.job_steps      enable row level security;

create policy documents_admin_read   on public.documents for select to authenticated using ((select private.is_admin()));
create policy documents_admin_insert on public.documents for insert to authenticated
  with check ((select private.is_admin()) and status = 'uploading');
create policy documents_admin_update on public.documents for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy document_pages_admin_read   on public.document_pages for select to authenticated using ((select private.is_admin()));
create policy document_pages_admin_update on public.document_pages for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy jobs_admin_read   on public.jobs for select to authenticated using ((select private.is_admin()));
create policy jobs_admin_insert on public.jobs for insert to authenticated
  with check ((select private.is_admin()) and cancelled_at is null);
-- Skip and Done stop the job (R4): the admin may set cancelled_at, never clear it.
create policy jobs_admin_cancel on public.jobs for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()) and cancelled_at is not null);
create policy job_steps_admin_read   on public.job_steps for select to authenticated using ((select private.is_admin()));
create policy job_steps_admin_insert on public.job_steps for insert to authenticated
  with check ((select private.is_admin()) and kind in ('pdf_text', 'extract_page') and status = 'queued');
-- A running step is never touched from the desk (its lease holder may still be working: no double run).
create policy job_steps_admin_update on public.job_steps for update to authenticated
  using ((select private.is_admin()) and status <> 'running') with check ((select private.is_admin()) and status in ('queued', 'skipped'));

revoke all on public.documents, public.document_pages, public.jobs, public.job_steps
  from public, anon, authenticated, service_role;
grant select, insert on public.documents to authenticated;
grant update (title, company_id, llm_page_budget, basis, source_type, filed_on, source_url, status, original_deleted_at)
  on public.documents to authenticated;
grant select on public.document_pages, public.jobs, public.job_steps to authenticated;
grant update (selected, selected_by) on public.document_pages to authenticated;
grant insert on public.jobs to authenticated;
grant update (cancelled_at) on public.jobs to authenticated;
grant insert (job_id, kind, page_no, args) on public.job_steps to authenticated;
grant update (status, not_before, schema_failures, provider_failures, lease_expiries, wait_reason, last_error)
  on public.job_steps to authenticated;

grant select on public.documents to service_role;
grant update (page_count) on public.documents to service_role;
grant select, insert on public.document_pages to service_role;
grant update (text, kind, basis, score, selected, selected_by) on public.document_pages to service_role;
-- No UPDATE on jobs: job code never changes a job, and must never clear Aksh's cancel (cancelled_at).
grant select, insert on public.jobs to service_role;
grant select, insert, update on public.job_steps to service_role;

-- 9. The private bucket (PDF only in 2a; 50 MB is the Free plan ceiling, spec s9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
create policy documents_bucket_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_bucket_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_bucket_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));

-- 10. Function privileges. queue_age is a number for the public monitor and the admin desk (R11).
revoke execute on function public.claim_job_step(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_job_step(uuid, integer) to service_role;
revoke execute on function public.queue_age() from public, anon, authenticated, service_role;
grant execute on function public.queue_age() to anon, authenticated;
revoke execute on function public.storage_usage() from public, anon, authenticated, service_role;
grant execute on function public.storage_usage() to authenticated;
