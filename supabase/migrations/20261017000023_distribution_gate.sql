-- =============================================================================
-- 20261017000023_distribution_gate.sql - Phase 5b Task 6: publishing rule 12 (videos) in the gate, and the policy version moves to
-- sebi-unreg-2026-07-v1.2 together with the rule it names (plan D81; docs/compliance/publishing-rules-v1.2-addendum.md; spec s7.3).
-- Restates public.publish_revision() whole from 20261016000021_knowledge_gate.sql (copied, not retyped) with two changes and
-- nothing else:
--   1. c_policy = 'sebi-unreg-2026-07-v1.2' (must equal POLICY_VERSION in src/modules/compliance/policy.ts);
--   2. after the knowledge line, one call to private.distribution_gate_failures (below). It returns '[]' for every kind but
--      'video' (0025 adds the letter branch). Recorded, never raised.
-- Every earlier check stays as it was: actor, latest only, lint, policy, rules 3, 5, 6, the ledger half (rule 4 and the position
-- check, which a video naming a company passes through like any item), rule 10, company, theme, the knowledge checks, the slug, the
-- file number (a video takes none) and the for share locks. Same signature, so create or replace keeps the function, its owner
-- and its grants; they are restated below. Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

-- Rule 12, codes 12.1-12.4 (12.5, company and theme, is the existing checks). Each failure is {rule '12', code, message}.
--   12.1 the revision is a video/1 record of this item's source; the source is his own channel, unlisted or public on YouTube,
--        fetched within the last 7 days.
--   12.2 the revision names a transcript of this source whose SQL hash equals transcriptSha, and the lint covered exactly that text.
--   12.3 a video naming a company needs data_as_of at least 30 IST days old (as a case study).
--   12.4 chapters: an array of 0 or 3..100 {s, title}, first at 0, whole seconds strictly rising, titles 1..100 characters.
-- The source row is held for share until the decision commits, so a concurrent record_video_fetch waits and the decision is taken
-- on the data it read. Lock order: items (publish_revision, for update), then video_sources; record_video_fetch locks only the source.
create function private.distribution_gate_failures(p_item_id uuid, p_kind text, p_company_id uuid, p_data_as_of date,
                                                   p_revision_id uuid, p_struct jsonb, p_lint jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_src public.video_sources;
  v_tr  public.video_transcripts;
  v_tid text;
  v_ch  jsonb;
  v_n   integer;
begin
  if p_kind is distinct from 'video' then
    return v_out;
  end if;

  select s.* into v_src from public.video_sources s where s.item_id = p_item_id for share;
  if v_src.id is null or jsonb_typeof(p_struct) is distinct from 'object'
     or (p_struct ->> 'schema') is distinct from 'video/1'
     or (p_struct ->> 'youtubeId') is distinct from v_src.youtube_id then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.1',
      'message', 'This revision does not match the video''s YouTube link.'));
  elsif v_src.fetched_at is null then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.1',
      'message', 'YouTube data has not been fetched yet.'));
  else
    if v_src.own_channel is not true then
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.1',
        'message', 'This video is not from your channel.'));
    end if;
    if v_src.privacy is null or v_src.privacy not in ('unlisted', 'public') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.1',
        'message', 'This video is private or gone on YouTube.'));
    end if;
    if v_src.fetched_at < now() - interval '7 days' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.1',
        'message', 'YouTube data is more than 7 days old. Fetch it again.'));
    end if;
  end if;

  v_tid := case when jsonb_typeof(p_struct) = 'object' then nullif(p_struct ->> 'transcriptId', '') end;
  if v_tid is null then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.2',
      'message', 'A video needs its transcript before it is listed.'));
  else
    select t.* into v_tr from public.video_transcripts t
     where t.id::text = lower(v_tid) and t.video_source_id = v_src.id;
    if v_tr.id is null or v_tr.text_sha256 is distinct from (p_struct ->> 'transcriptSha') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.2',
        'message', 'The transcript in this revision does not match the stored transcript.'));
    elsif (p_lint ->> 'transcriptSha') is distinct from v_tr.text_sha256 then
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.2',
        'message', 'The lint did not check this transcript.'));
    end if;
  end if;

  if p_company_id is not null
     and (p_data_as_of is null or p_data_as_of > (now() at time zone 'Asia/Kolkata')::date - 30) then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.3',
      'message', 'A video that names a company needs a figures-to date at least 30 days old.'));
  end if;

  v_ch := case when jsonb_typeof(p_struct) = 'object' then p_struct -> 'chapters' end;
  v_n := case when jsonb_typeof(v_ch) = 'array' then jsonb_array_length(v_ch) end;
  if v_n is null or v_n in (1, 2) or v_n > 100 or exists (
       select 1
         from (select x.e, x.ord,
                      case when jsonb_typeof(x.e -> 's') = 'number' then (x.e ->> 's')::numeric end as s,
                      lag(case when jsonb_typeof(x.e -> 's') = 'number' then (x.e ->> 's')::numeric end)
                        over (order by x.ord) as prev
                 from jsonb_array_elements(case when v_n between 3 and 100 then v_ch else '[]'::jsonb end)
                      with ordinality x(e, ord)) q
        where jsonb_typeof(q.e) is distinct from 'object'
           or q.s is null or q.s <> trunc(q.s)
           or (q.ord = 1 and q.s <> 0)
           or (q.ord > 1 and (q.prev is null or q.s <= q.prev))
           or jsonb_typeof(q.e -> 'title') is distinct from 'string'
           or length(q.e ->> 'title') not between 1 and 100
           or btrim(q.e ->> 'title') = '') then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '12', 'code', '12.4',
      'message', 'Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters.'));
  end if;

  return v_out;
end;
$$;
revoke execute on function private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

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
  c_policy   constant text := 'sebi-unreg-2026-07-v1.2';
  v_item     public.items;
  v_slug     text;
  v_failures jsonb := '[]'::jsonb;
  v_decision public.gate_decisions;
  v_ledger   boolean;
  v_struct   jsonb;
  v_concepts uuid[];
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
  select r.structured, r.concept_ids into v_struct, v_concepts from public.item_revisions r where r.id = p_revision_id;

  -- Hold the linked catalog rows until this decision commits, so a concurrent make-private or rename waits and its guard then sees the
  -- new current revision (spec s4 guards). Same class as company_id/theme_id. Lock order is items (for update, above) then themes.
  perform 1 from public.themes t
   where t.id = any (coalesce(v_concepts, '{}'::uuid[]) || v_item.theme_id)
   for share;
  perform 1 from public.companies c where c.id = v_item.company_id for share;

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
  -- (D9) a company file needs a figures-to date (the public page shows it; the lag is not required).
  if v_item.kind = 'thesis' and v_item.data_as_of is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A file needs a figures-to date (data_as_of).'));
  end if;
  -- NEW (Plan 3a Task 5): rule 4 (named-security recency) and the position check, read from the sealed ledger events.
  -- Every item that names a company or is linked to an idea, every revision. Recorded, never raised; no allowance and no
  -- screen lifts it. (Round 3: the helper takes the chain lock, follows merged companies and linked ideas, and turns any
  -- error into a recorded ledger_check_failed.)
  v_ledger := v_item.company_id is not null or exists (select 1 from public.ideas i where i.item_id = p_item_id);
  if v_ledger then
    v_failures := v_failures || private.ledger_gate_item_failures(
      p_item_id, v_item.company_id, v_item.holds_position, (now() at time zone 'Asia/Kolkata')::date);
  end if;
  -- NEW (Plan 3b Task 1): publishing rule 10 (v1.1 addendum). A revision that carries a ledger record must be exactly what the
  -- ledger builds now, behind the owner's switches. Called for every revision, whether or not the item names a company: a ledger
  -- case study filed under no company must not slip past the ledger half above. Recorded, never raised.
  v_failures := v_failures || private.case_gate_failures(v_item.id, v_item.kind, v_item.company_id, v_item.data_as_of, v_struct);
  if exists (select 1 from public.companies c
             where c.id = v_item.company_id and c.visibility <> 'public') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'company', 'message', 'The linked company is not public.'));
  end if;
  if exists (select 1 from public.themes t
             where t.id = v_item.theme_id and t.visibility <> 'public') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'theme', 'message', 'The linked concept is not public.'));
  end if;
  -- Phase 4 (spec s5): a reading note never publishes; every linked concept must be public. Recorded, never raised.
  v_failures := v_failures || private.knowledge_gate_failures(v_item.kind, v_item.theme_id, v_concepts);
  -- Phase 5 (rules 12, 13; v1.2 addendum). Recorded, never raised.
  v_failures := v_failures || private.distribution_gate_failures(v_item.id, v_item.kind, v_item.company_id, v_item.data_as_of,
                                                                 p_revision_id, v_struct, p_lint_result);

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
    jsonb_build_object('failures', v_failures, 'lint', coalesce(p_lint_result, '{}'::jsonb),
                       'ledger', jsonb_build_object('checked', v_ledger))
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
           -- (D8, 3b) a file's first pass takes the next number; a case study from the ledger is not a file and takes none.
           file_no = case when v_item.kind = 'thesis'
                            or (v_item.kind = 'case_study'
                                and not (jsonb_typeof(v_struct) = 'object' and v_struct ? 'ledger'))
                          then coalesce(v_item.file_no, nextval('private.file_no_seq')::integer)
                          else v_item.file_no end
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- Privileges: ADR-003 confinement. service_role only; anon gets nothing.
revoke execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) to service_role;
