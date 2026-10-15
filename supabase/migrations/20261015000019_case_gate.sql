-- =============================================================================
-- 20261015000019_case_gate.sql - Plan 3b Task 1: publishing rule 10 in the gate, and the policy version moves to
-- sebi-unreg-2026-07-v1.1 together with the checks it names (plan D38; docs/compliance/publishing-rules-v1.1-addendum.md).
-- Restates public.publish_revision() whole from 20261013000014_ledger_gate.sql with three changes and nothing else:
--   1. c_policy = 'sebi-unreg-2026-07-v1.1' (must equal POLICY_VERSION in src/modules/compliance/policy.ts);
--   2. one call to private.case_gate_failures (0018), after the ledger half, for every revision. The helper returns '[]' unless
--      the revision's structured data carries a ledger record;
--   3. a case study that carries a ledger record takes no file number (it is not a file: spec s33.4, plan D36).
-- Same signature, so create or replace keeps the function, its owner and its grants; they are restated below.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

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
  c_policy   constant text := 'sebi-unreg-2026-07-v1.1';
  v_item     public.items;
  v_slug     text;
  v_failures jsonb := '[]'::jsonb;
  v_decision public.gate_decisions;
  v_ledger   boolean;
  v_struct   jsonb;
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
  select r.structured into v_struct from public.item_revisions r where r.id = p_revision_id;

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
                            or (v_item.kind = 'case_study' and not (coalesce(v_struct, '{}'::jsonb) ? 'ledger'))
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
