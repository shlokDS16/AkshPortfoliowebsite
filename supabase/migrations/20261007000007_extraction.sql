-- =============================================================================
-- 20261007000007_extraction.sql - Phase 2a: what the machine read (extractions), what it proposes
-- (proposals), what Aksh filed (fact_provenance), and the provider budget ledger (ADR-004 s4.2-s4.5).
-- Spec: docs/specs/2026-10-07-phase-2-ingestion-design.md. Never edit after it reaches hosted.
-- =============================================================================

-- 1. The machine may read facts (structured) to match labels, never Aksh's words (body_md, change_reason,
-- learning_objective) nor visibility. created_at picks the newest file; status lets it skip archived files (R12).
grant select (id, company_id, kind, title, created_at, status) on public.items to service_role;
grant select (id, item_id, rev_no, structured, created_at) on public.item_revisions to service_role;

-- 2. Extractions: append-only, per document page, model and prompt version.
create table public.extractions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null,
  page_no        integer not null,
  model          text not null check (char_length(model) between 1 and 80),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  input_hash     text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output         jsonb not null,
  tokens_used    integer not null default 0 check (tokens_used >= 0),
  created_at     timestamptz not null default now(),
  foreign key (document_id, page_no) references public.document_pages (document_id, page_no) on delete restrict
);
create index extractions_cache_idx on public.extractions (input_hash, model, prompt_version);
create index extractions_document_idx on public.extractions (document_id, page_no);
create trigger extractions_append_only before update or delete on public.extractions
  for each row execute function private.reject_mutation();
create trigger extractions_no_truncate before truncate on public.extractions
  for each statement execute function private.reject_mutation();

-- 3. Proposals: the machine inserts pending rows; only Aksh decides.
create table public.proposals (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete restrict,
  page_no        integer not null check (page_no >= 1),
  extraction_id  uuid not null references public.extractions (id) on delete restrict,
  dedupe_key     text not null check (char_length(dedupe_key) between 1 and 200),
  machine_value  jsonb not null,
  accepted_value jsonb,
  flags          text[] not null default '{}'
                 check (flags <@ array['value_not_on_page', 'quote_not_on_page', 'prior_not_on_page', 'period_unknown', 'unit_unknown']::text[]),
  reason         text not null check (reason in ('core', 'label_match', 'moved')),
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'edited', 'rejected', 'filed')),
  item_id        uuid references public.items (id) on delete restrict,
  revision_id    uuid references public.item_revisions (id) on delete restrict,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (document_id, dedupe_key),
  check ((status = 'filed') = (revision_id is not null)),
  check (status not in ('accepted', 'edited', 'filed') or accepted_value is not null)
);
create index proposals_item_idx on public.proposals (item_id) where status in ('accepted', 'edited');
create index proposals_document_status_idx on public.proposals (document_id, status);
create index proposals_extraction_id_idx on public.proposals (extraction_id);
create index proposals_revision_id_idx on public.proposals (revision_id) where revision_id is not null;
create trigger proposals_set_updated_at before update on public.proposals
  for each row execute function private.set_updated_at();

create function private.guard_proposal_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'pending' or new.accepted_value is not null or new.item_id is not null
     or new.revision_id is not null or new.decided_at is not null then
    raise exception 'the machine only proposes: a new proposal is pending and undecided' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger proposals_insert_pending before insert on public.proposals
  for each row execute function private.guard_proposal_insert();

-- Layer 3 (ADR-004 s4.2): refuses the machine even if a grant is ever added, and also when a SECURITY DEFINER
-- function is called with the secret key (current_user is then the owner, the request's JWT role is not).
create function private.guard_proposal_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.machine_value is distinct from old.machine_value or new.extraction_id <> old.extraction_id
     or new.dedupe_key <> old.dedupe_key or new.flags is distinct from old.flags or new.document_id <> old.document_id
     or new.page_no <> old.page_no or new.reason <> old.reason then
    raise exception 'what the machine read is never changed' using errcode = 'P0001';
  end if;
  if current_user = 'service_role'
     or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role' then
    raise exception 'only Aksh decides on a proposal (ADR-004 s4.2)' using errcode = '42501';
  end if;
  if old.status = 'filed' then
    raise exception 'a filed proposal is final' using errcode = 'P0001';
  end if;
  if new.revision_id is not null and new.item_id is distinct from
     (select r.item_id from public.item_revisions r where r.id = new.revision_id) then
    raise exception 'a proposal is filed only under a revision of its own item' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger proposals_guard_update before update on public.proposals
  for each row execute function private.guard_proposal_update();

-- 4. Provenance: which proposal each filed fact came from, and whether Aksh changed it.
create table public.fact_provenance (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.item_revisions (id) on delete restrict,
  fact_id     text not null check (fact_id ~ '^F\d{1,3}$'),
  proposal_id uuid not null references public.proposals (id) on delete restrict,
  edited      boolean not null,
  created_at  timestamptz not null default now(),
  unique (revision_id, fact_id)
);
create index fact_provenance_proposal_idx on public.fact_provenance (proposal_id);
create trigger fact_provenance_append_only before update or delete on public.fact_provenance
  for each row execute function private.reject_mutation();
create trigger fact_provenance_no_truncate before truncate on public.fact_provenance
  for each statement execute function private.reject_mutation();

-- 5. The provider budget ledger (ADR-004 s4.5).
create table public.provider_usage (
  id                 uuid primary key default gen_random_uuid(),
  bucket             text not null check (char_length(bucket) between 1 and 80),
  kind               text not null check (kind in ('reservation', 'observation', 'rate_limited')),
  tokens_est         integer check (tokens_est >= 0),
  tokens_used        integer check (tokens_used >= 0),
  status             text check (status in ('reserved', 'used', 'released')),
  remaining_tokens   integer,
  remaining_requests integer,
  retry_after_s      numeric,
  blocked_until      timestamptz,
  block_reason       text check (block_reason in ('groq_minute', 'groq_day')),
  at                 timestamptz not null default clock_timestamp(),
  check ((kind = 'reservation') = (status is not null)),
  check ((blocked_until is null) = (block_reason is null))
);
create index provider_usage_bucket_at_idx on public.provider_usage (bucket, at desc);

-- Reserve tokens before a call. Serialised per bucket (advisory lock), so two runners never both fit in one gap.
create function public.reserve_usage(p_bucket text, p_tokens integer, p_tpm integer, p_tpd integer, p_rpm integer, p_rpd integer)
returns table (ok boolean, reservation_id uuid, not_before timestamptz, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz;
  v_block record;
  v_min_tokens bigint;
  v_day_tokens bigint;
  v_min_reqs bigint;
  v_day_reqs bigint;
  v_id uuid;
begin
  if p_bucket is null or p_tpm is null or p_tpd is null or p_rpm is null or p_rpd is null
     or p_tpm < 1 or p_tpd < 1 or p_rpm < 1 or p_rpd < 1 then
    raise exception 'a bucket and four positive caps are required' using errcode = '22023';
  end if;
  if p_tokens is null or p_tokens < 1 or p_tokens > least(p_tpm, p_tpd) then
    raise exception 'one call must fit inside the minute and day caps' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('provider_usage:' || p_bucket));
  -- Read the clock only once the lock is held: a waiter must never write an earlier `at` than the holder.
  v_now := clock_timestamp();

  select u.blocked_until, u.block_reason into v_block
    from public.provider_usage u
   where u.bucket = p_bucket and u.blocked_until > v_now
   order by u.blocked_until desc limit 1;
  if found then
    return query select false, null::uuid, v_block.blocked_until, v_block.block_reason;
    return;
  end if;

  select coalesce(sum(coalesce(u.tokens_used, u.tokens_est)) filter (where u.at > v_now - interval '1 minute'), 0),
         coalesce(sum(coalesce(u.tokens_used, u.tokens_est)), 0),
         count(*) filter (where u.at > v_now - interval '1 minute'),
         count(*)
    into v_min_tokens, v_day_tokens, v_min_reqs, v_day_reqs
    from public.provider_usage u
   where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '24 hours';

  if v_day_tokens + p_tokens > p_tpd or v_day_reqs + 1 > p_rpd then
    return query
      select false, null::uuid, min(u.at) + interval '24 hours', 'groq_day'::text
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '24 hours';
    return;
  end if;
  if v_min_tokens + p_tokens > p_tpm or v_min_reqs + 1 > p_rpm then
    return query
      select false, null::uuid, min(u.at) + interval '1 minute', 'groq_minute'::text
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '1 minute';
    return;
  end if;

  insert into public.provider_usage (bucket, kind, tokens_est, status, at)
  values (p_bucket, 'reservation', p_tokens, 'reserved', v_now)
  returning id into v_id;
  return query select true, v_id, null::timestamptz, null::text;
end;
$$;

-- The daily sweep keeps the ledger to two days (the governor only looks back 24 h).
create function public.prune_provider_usage()
returns integer language sql security definer set search_path = ''
as $$
  with gone as (delete from public.provider_usage where at < now() - interval '48 hours' returning 1)
  select count(*)::integer from gone;
$$;

-- 6. RLS and grants: admin only; job code is service_role (bypasses RLS, still needs table privileges).
alter table public.extractions     enable row level security;
alter table public.proposals       enable row level security;
alter table public.fact_provenance enable row level security;
alter table public.provider_usage  enable row level security;

create policy extractions_admin_read on public.extractions for select to authenticated using ((select private.is_admin()));
create policy proposals_admin_read on public.proposals for select to authenticated using ((select private.is_admin()));
-- A decision is never undone to pending in 2a; Unstage (Task 14) only clears item_id and keeps accepted/edited.
create policy proposals_admin_update on public.proposals for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()) and status <> 'pending');
create policy fact_provenance_admin_read on public.fact_provenance for select to authenticated using ((select private.is_admin()));
-- R1: the new row's columns are qualified; unqualified, revision_id would bind to proposals.revision_id (null until
-- filed) and every insert would be refused. Only an accepted, edited or filed proposal has provenance (ADR-004 s4.7).
create policy fact_provenance_admin_insert on public.fact_provenance for insert to authenticated
  with check ((select private.is_admin()) and exists (
    select 1 from public.proposals p join public.item_revisions r on r.item_id = p.item_id
     where p.id = fact_provenance.proposal_id and r.id = fact_provenance.revision_id
       and p.status in ('accepted', 'edited', 'filed')));
create policy provider_usage_admin_read on public.provider_usage for select to authenticated using ((select private.is_admin()));

revoke all on public.extractions, public.proposals, public.fact_provenance, public.provider_usage
  from public, anon, authenticated, service_role;
grant select on public.extractions, public.proposals, public.fact_provenance, public.provider_usage to authenticated;
grant update (accepted_value, status, item_id, revision_id, decided_at) on public.proposals to authenticated;
grant insert on public.fact_provenance to authenticated;

grant select, insert on public.extractions, public.proposals to service_role;
grant select, insert on public.provider_usage to service_role;
grant update (tokens_used, status) on public.provider_usage to service_role;

revoke execute on function public.reserve_usage(text, integer, integer, integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.reserve_usage(text, integer, integer, integer, integer, integer) to service_role;
revoke execute on function public.prune_provider_usage() from public, anon, authenticated, service_role;
grant execute on function public.prune_provider_usage() to service_role;
