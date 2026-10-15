-- =============================================================================
-- 20261014000017_valuation.sql - 2.7 valuation models: an uploaded XLSX, the cells Aksh confirms, his scenarios (PRIVATE).
-- Spec: docs/specs/2026-10-14-valuation-2.7-design.md s6 (this file is s6 in full). Plan: docs/plans/2026-10-14-valuation-2.7.md Task 2.
-- Continues 20261014000016_pump_clock.sql. Never edit this file after it reaches the hosted project; add a later migration.
--
-- Rule 9 in the schema: no grant, policy, view or function here gives anon anything, and no `visibility` column exists.
-- The hard rule (the AI organises, Aksh thinks): the machine-read facts of a workbook live in the version row's machine columns
-- (written by service_role, column grants only) and in the model object models/<versionId>.json. His words and choices (labels,
-- roles, scenario names, notes and input values) live only in valuation_cells, valuation_scenarios and valuation_scenario_values,
-- written only by the three functions below. No column holds both.
-- =============================================================================

-- 1. The upload path: a workbook is a document of kind xlsx, read by the job kind ingest_xlsx in the one step xlsx_read.
alter table public.documents drop constraint documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('pdf', 'image', 'audio', 'url', 'text', 'xlsx'));
alter table public.documents drop constraint documents_storage_path_check;
alter table public.documents add constraint documents_storage_path_check
  check (storage_path ~ '^[0-9a-f-]{36}\.(pdf|jpg|png|webp|mp3|m4a|webm|txt|xlsx)$');

alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('ingest_pdf', 'ingest_image', 'ingest_audio', 'ingest_url', 'ingest_text', 'ingest_xlsx'));

alter table public.job_steps drop constraint job_steps_kind_check;
alter table public.job_steps add constraint job_steps_kind_check
  check (kind in ('pdf_text', 'select_pages', 'extract_page', 'ocr_page', 'vision_page', 'transcribe', 'text_pages',
                  'classify_pages', 'digest_page', 'xlsx_read'));

-- "Try again" on a stopped read inserts a fresh xlsx_read step from Aksh's session (as it does for the other upload steps).
drop policy job_steps_admin_insert on public.job_steps;
create policy job_steps_admin_insert on public.job_steps for insert to authenticated
  with check ((select private.is_admin())
              and kind in ('pdf_text', 'extract_page', 'ocr_page', 'digest_page', 'transcribe', 'text_pages', 'xlsx_read')
              and status = 'queued');

-- The private bucket also takes the workbook and the model object (models/<versionId>.json). 50 MB stays the bucket's ceiling;
-- the 10 MB workbook cap is the app's.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                                  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'text/plain',
                                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json']
 where id = 'documents';

-- The model object is machine data (written by job code as service_role): Aksh's session reads it, through the signed link, but
-- cannot store or remove anything under models/, as it cannot write a version's machine columns.
drop policy documents_bucket_admin_insert on storage.objects;
create policy documents_bucket_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and name !~ '^models/' and (select private.is_admin()));
drop policy documents_bucket_admin_delete on storage.objects;
create policy documents_bucket_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and name !~ '^models/' and (select private.is_admin()));

-- 2. valuation_versions: one row per uploaded workbook. Machine columns only (no word of Aksh's).
create table public.valuation_versions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete restrict,
  document_id   uuid not null unique references public.documents (id) on delete restrict,
  version_no    integer not null check (version_no >= 1),
  status        text not null default 'reading' check (status in ('reading', 'ready', 'confirmed', 'refused')),
  refusal       text check (refusal ~ '^[a-z_]{1,40}$'),
  model_path    text check (model_path ~ '^models/[0-9a-f-]{36}\.json$'),
  sheet_count   integer check (sheet_count between 0 and 1000),
  cell_count    integer check (cell_count between 0 and 10000000),
  formula_count integer check (formula_count between 0 and 10000000),
  report        jsonb check (jsonb_typeof(report) = 'object' and pg_column_size(report) <= 1000000),
  engine        jsonb check (jsonb_typeof(engine) = 'object' and pg_column_size(engine) <= 1000),
  read_at       timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint valuation_versions_number_once unique (company_id, version_no),
  -- a refusal code exactly when the read was refused; a model object whenever there is a model to confirm or use
  constraint valuation_versions_refusal_state check ((status = 'refused') = (refusal is not null)),
  constraint valuation_versions_model_state check (status not in ('ready', 'confirmed') or (model_path is not null and read_at is not null)),
  -- confirmed_at is written only by confirm_valuation_version (service_role has no grant on it), so service_role cannot confirm
  constraint valuation_versions_confirmed_state check ((status = 'confirmed') = (confirmed_at is not null))
);

-- A confirmed version is frozen: its model object and report are the ones his cells were chosen against.
create function private.guard_valuation_version()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'confirmed' and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'valuation: a confirmed version cannot change' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger valuation_versions_guard before update on public.valuation_versions
  for each row execute function private.guard_valuation_version();

-- 3. valuation_cells: only Aksh's designations. `label` is HIS words (null means "show the sheet label"); the sheet label is
-- machine text, lives in the model object, and is never stored here.
create table public.valuation_cells (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.valuation_versions (id) on delete restrict,
  sheet      text not null check (char_length(sheet) between 1 and 31),
  addr       text not null check (addr ~ '^[A-Z]{1,3}[0-9]{1,7}$'),
  role       text not null check (role in ('input', 'output')),
  label      text check (label is null or (char_length(label) between 1 and 80 and label = btrim(label))),
  constraint valuation_cells_once unique (version_id, sheet, addr)
);

-- 4. Scenarios: his name and note, and the input values he saved. Outputs are never stored; they are recomputed.
create table public.valuation_scenarios (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.valuation_versions (id) on delete restrict,
  name       text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  note       text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint valuation_scenarios_name_once unique (version_id, name)
);
create table public.valuation_scenario_values (
  scenario_id uuid not null references public.valuation_scenarios (id) on delete cascade,
  cell_id     uuid not null references public.valuation_cells (id) on delete restrict,
  value       numeric not null,
  primary key (scenario_id, cell_id),
  -- finite and at most 1e15 in magnitude (NaN and infinity compare above every number, so they fail this too)
  constraint valuation_scenario_values_range check (value >= -1000000000000000 and value <= 1000000000000000)
);

create index valuation_scenario_values_cell_idx on public.valuation_scenario_values (cell_id);

-- 5. RLS: the admin reads; the only deletion is of a scenario (its values follow). Everything else is written by the functions.
alter table public.valuation_versions        enable row level security;
alter table public.valuation_cells           enable row level security;
alter table public.valuation_scenarios       enable row level security;
alter table public.valuation_scenario_values enable row level security;

create policy valuation_versions_admin_read on public.valuation_versions for select to authenticated
  using ((select private.is_admin()));
create policy valuation_cells_admin_read on public.valuation_cells for select to authenticated
  using ((select private.is_admin()));
create policy valuation_scenarios_admin_read on public.valuation_scenarios for select to authenticated
  using ((select private.is_admin()));
create policy valuation_scenarios_admin_delete on public.valuation_scenarios for delete to authenticated
  using ((select private.is_admin()));
create policy valuation_scenario_values_admin_read on public.valuation_scenario_values for select to authenticated
  using ((select private.is_admin()));

-- 6. Grants. Start from nothing, then grant by name. anon gets nothing at all.
revoke all on public.valuation_versions, public.valuation_cells, public.valuation_scenarios, public.valuation_scenario_values
  from public, anon, authenticated, service_role;
grant select on public.valuation_versions, public.valuation_cells, public.valuation_scenarios, public.valuation_scenario_values
  to authenticated;
grant delete on public.valuation_scenarios to authenticated;
-- Job code reads a version and writes its machine columns, and nothing else (not confirmed_at, not the numbering, not Aksh's tables).
grant select on public.valuation_versions to service_role;
grant update (status, refusal, model_path, sheet_count, cell_count, formula_count, report, engine, read_at)
  on public.valuation_versions to service_role;

-- 7. start_valuation_version: called by finishUpload (Aksh's session) once the workbook is stored. Numbers the version per company.
-- Idempotent per document: a second call returns the same version.
create function public.start_valuation_version(p_document_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind    text;
  v_company uuid;
  v_id      uuid;
begin
  if not private.is_admin() then
    raise exception 'valuation: not allowed' using errcode = '42501';
  end if;
  select d.kind, d.company_id into v_kind, v_company from public.documents d where d.id = p_document_id for update;
  if not found then
    raise exception 'valuation: document not found' using errcode = 'P0002';
  end if;
  if v_kind <> 'xlsx' then
    raise exception 'valuation: not a workbook' using errcode = '22023';
  end if;
  if v_company is null then
    raise exception 'valuation: a workbook needs a company' using errcode = '22023';
  end if;
  select v.id into v_id from public.valuation_versions v where v.document_id = p_document_id;
  if found then
    return v_id;
  end if;
  -- two uploads for one company at once must not take the same number
  perform pg_advisory_xact_lock(hashtext('valuation_version:' || v_company::text));
  insert into public.valuation_versions (company_id, document_id, version_no)
  values (v_company, p_document_id,
          coalesce((select max(v.version_no) from public.valuation_versions v where v.company_id = v_company), 0) + 1)
  returning id into v_id;
  return v_id;
end;
$$;

-- 8. confirm_valuation_version: Aksh's choice of cells, once, all or none. p_cells is an array of
-- {"sheet": text, "addr": "C42", "role": "input" | "output", "label": text | null}. The SQL cannot see the model object, so the
-- app-level checks (an input is a numeric constant, an output is an untainted numeric formula) run in confirmValuationAction first.
create function public.confirm_valuation_version(p_version_id uuid, p_cells jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status  text;
  v_inputs  integer;
  v_outputs integer;
  e         jsonb;
begin
  if not private.is_admin() then
    raise exception 'valuation: not allowed' using errcode = '42501';
  end if;
  select v.status into v_status from public.valuation_versions v where v.id = p_version_id for update;
  if not found then
    raise exception 'valuation: version not found' using errcode = 'P0002';
  end if;
  if v_status <> 'ready' then
    raise exception 'valuation: the version is not ready to confirm' using errcode = '55000';
  end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' then
    raise exception 'valuation: the cells must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cells) > 60 then
    raise exception 'valuation: at most 60 cells' using errcode = '22023';
  end if;
  for e in select x.value from jsonb_array_elements(p_cells) as x loop
    if jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) as k where k not in ('sheet', 'addr', 'role', 'label'))
       or jsonb_typeof(e -> 'sheet') is distinct from 'string'
       or jsonb_typeof(e -> 'addr') is distinct from 'string'
       or jsonb_typeof(e -> 'role') is distinct from 'string'
       or jsonb_typeof(coalesce(e -> 'label', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'valuation: a cell is malformed' using errcode = '22023';
    end if;
    if char_length(e ->> 'sheet') not between 1 and 31
       or (e ->> 'addr') !~ '^[A-Z]{1,3}[0-9]{1,7}$'
       or (e ->> 'role') not in ('input', 'output')
       or ((e ->> 'label') is not null and char_length(btrim(e ->> 'label')) > 80) then
      raise exception 'valuation: a cell is malformed' using errcode = '22023';
    end if;
  end loop;
  select count(*) filter (where x.value ->> 'role' = 'input'), count(*) filter (where x.value ->> 'role' = 'output')
    into v_inputs, v_outputs from jsonb_array_elements(p_cells) as x;
  if v_inputs not between 1 and 40 or v_outputs not between 1 and 20 then
    raise exception 'valuation: choose 1 to 40 inputs and 1 to 20 results' using errcode = '22023';
  end if;
  -- a repeated cell trips valuation_cells_once (23505) and the whole call rolls back
  insert into public.valuation_cells (version_id, sheet, addr, role, label)
  select p_version_id, x.value ->> 'sheet', x.value ->> 'addr', x.value ->> 'role', nullif(btrim(x.value ->> 'label'), '')
    from jsonb_array_elements(p_cells) as x;
  update public.valuation_versions set status = 'confirmed', confirmed_at = now() where id = p_version_id;
end;
$$;

-- 9. save_valuation_scenario: his name, his note and the input values he saved, for a confirmed version. p_values is an object
-- {"<valuation_cells.id>": number}; every key must be an input cell of this version. Returns the scenario id.
create function public.save_valuation_scenario(p_version_id uuid, p_name text, p_note text, p_values jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_name   text := btrim(p_name);
  v_note   text := coalesce(btrim(p_note), '');
  v_id     uuid;
  v_count  integer;
begin
  if not private.is_admin() then
    raise exception 'valuation: not allowed' using errcode = '42501';
  end if;
  select v.status into v_status from public.valuation_versions v where v.id = p_version_id for update;
  if not found then
    raise exception 'valuation: version not found' using errcode = 'P0002';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'valuation: the version is not confirmed' using errcode = '55000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 or char_length(v_note) > 500 then
    raise exception 'valuation: the name or the note is not allowed' using errcode = '22023';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'valuation: the values must be an object' using errcode = '22023';
  end if;
  select count(*) into v_count from jsonb_each(p_values);
  if v_count not between 1 and 40 then
    raise exception 'valuation: save 1 to 40 values' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_values) as x where x.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                                      or jsonb_typeof(x.value) <> 'number') then
    raise exception 'valuation: a value is malformed' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_values) as x where abs((x.value #>> '{}')::numeric) > 1000000000000000) then
    raise exception 'valuation: a value is out of range' using errcode = '22023';
  end if;
  if (select count(*) from public.valuation_cells c
       where c.version_id = p_version_id and c.role = 'input' and c.id::text in (select x.key from jsonb_each(p_values) as x)) <> v_count then
    raise exception 'valuation: a value is not for an input of this version' using errcode = '22023';
  end if;
  -- a repeated name trips valuation_scenarios_name_once (23505)
  insert into public.valuation_scenarios (version_id, name, note) values (p_version_id, v_name, v_note) returning id into v_id;
  insert into public.valuation_scenario_values (scenario_id, cell_id, value)
  select v_id, x.key::uuid, (x.value #>> '{}')::numeric from jsonb_each(p_values) as x;
  return v_id;
end;
$$;

-- 10. Function privileges: Aksh's session only (each function checks the admin inside).
revoke execute on function private.guard_valuation_version() from public, anon, authenticated, service_role;
revoke execute on function public.start_valuation_version(uuid)                   from public, anon, authenticated, service_role;
revoke execute on function public.confirm_valuation_version(uuid, jsonb)          from public, anon, authenticated, service_role;
revoke execute on function public.save_valuation_scenario(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.start_valuation_version(uuid)                   to authenticated;
grant execute on function public.confirm_valuation_version(uuid, jsonb)          to authenticated;
grant execute on function public.save_valuation_scenario(uuid, text, text, jsonb) to authenticated;
