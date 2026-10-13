-- =============================================================================
-- 20261013000014_ledger_gate.sql - Plan 3a Task 5: the publish gate learns about the private track-record ledger.
-- Publishing rules 4, 5 and 7; spec s5.6, s11, s17; ADR-005 s4. Continues 20261007000005_casefile.sql (the latest body of
-- public.publish_revision), which this file restates whole and extends. 0001-0013 are not edited.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
--
-- Two additions, both recorded as gate failures (never raised, like every other gate failure) and neither can be lifted
-- by a sentence allowance or any screen:
--   Rule 4 (named-security recency). An item that names a company cannot be published, and a public item about a company
--     cannot take a new revision, while the sealed ledger has an open, close, or resize (upsize, downsize) entry on that
--     company dated within the last 30 India days (entry date > today - 30; the same IST arithmetic as the existing
--     30-day lag). It applies to every revision of every item that names the company, including items first published
--     before the idea existed (rule 7 reading, Q28). It never unpublishes anything: the revision already public stays.
--   Rule 5, consistency. A "no position" disclosure is refused while the sealed ledger shows an open idea on the company
--     whose latest holding entry says it is held. "yes" and "not_disclosed" are never contradicted.
--
-- What the gate compares, and where it reads it from. EVERYTHING comes from the sealed events (public.idea_events), never
-- from the editable projection (public.ideas): two reviews found that reading the projection lets the owner move a result.
--   * the company of an entry is the company id SEALED inside its canonical text;
--   * a withdrawn idea is one with a sealed 'void' event (spec s5.6: a non-void idea; a withdrawn idea counts for nothing);
--   * the date of an entry is the IST date of its sealed recorded_at;
--   * an idea is open when it has no sealed 'close' and no sealed 'void'; it is held when its latest sealed holding entry
--     (open, upsize, downsize, in seq order) says so: open and downsize carry held, upsize means held.
-- Before any sealed text is read, the gate runs the ledger check (private.ledger_chain_check: hash chain, columns against
-- sealed text, and the projection against a replay of the events) and the sealed-day comparison
-- (private.ledger_anchor_check). If either fails the gate REFUSES every item that names a company (rule 4, code
-- ledger_check_failed): it cannot trust the facts, so it does not guess. A tampered projection therefore can only turn a
-- decision towards a refusal, never towards a pass.
--
-- Public paths are untouched: anon gets nothing new, no view or function changes, and a refusal is visible only in
-- gate_decisions (admin read only). Policy version is NOT bumped: spec s11 ("no change to POLICY_VERSION in 3a").
-- =============================================================================

-- 1. The facts. One company; the sealed ledger only. last_stance is the IST date of the latest open / close / upsize /
-- downsize entry on a non-withdrawn idea (null when none); holds_position says whether a non-withdrawn, not-closed idea is
-- held. When the ledger fails its checks the result is (false, null, null) and the caller must refuse.
create function private.ledger_gate_facts(p_company_id uuid)
returns table (ledger_ok boolean, last_stance date, holds_position boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select c.ok into v_ok from private.ledger_chain_check() c;
  if v_ok is true then
    select a.ok into v_ok from private.ledger_anchor_check() a;
  end if;
  if v_ok is not true then
    return query select false, null::date, null::boolean;
    return;
  end if;
  -- The ledger verified, so every sealed text parses and holds exactly the version 1 keys.
  return query
  with ev as (
    select e.idea_id, e.seq, e.kind, e.recorded_at, e.stance
      from public.idea_events e
     where e.canonical::jsonb ->> 'company_id' = p_company_id::text
  ), live as (
    select distinct x.idea_id from ev x
     where not exists (select 1 from public.idea_events v where v.idea_id = x.idea_id and v.kind = 'void')
  )
  select true,
         (select max((x.recorded_at at time zone 'Asia/Kolkata')::date)
            from ev x join live l on l.idea_id = x.idea_id
           where x.kind in ('open', 'close', 'upsize', 'downsize')),
         exists (select 1 from live l
                  where not exists (select 1 from ev c where c.idea_id = l.idea_id and c.kind = 'close')
                    and coalesce((select case h.kind when 'upsize' then true else (h.stance ->> 'held')::boolean end
                                    from ev h
                                   where h.idea_id = l.idea_id and h.kind in ('open', 'upsize', 'downsize')
                                   order by h.seq desc limit 1), false));
end;
$$;

-- 2. The decision. p_today is the India date that counts as today (the caller passes the real one; a test passes a fixed
-- one). Returns a jsonb array of failures in the gate's own shape ({rule, message}) plus a stable code, and for rule 4 the
-- day it can be published from (ISO) so a screen can say it in its own words.
create function private.ledger_gate_failures(p_company_id uuid, p_holds_position text, p_today date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  f        record;
  v_out    jsonb := '[]'::jsonb;
begin
  select * into f from private.ledger_gate_facts(p_company_id);
  if f.ledger_ok is not true then
    return jsonb_build_array(jsonb_build_object('rule', '4', 'code', 'ledger_check_failed', 'message',
      'The ledger failed its own check, so nothing about this company can be published until it is looked at. Run the integrity check on the Ledger page.'));
  end if;
  if f.last_stance is not null and f.last_stance > p_today - 30 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '4', 'code', 'ledger_recent_entry',
      'clear_from', to_char(f.last_stance + 30, 'YYYY-MM-DD'),
      'message', format('The ledger has an entry on this company from the last 30 days. This can be published from %s.',
                        to_char(f.last_stance + 30, 'DD Mon YYYY'))));
  end if;
  if p_holds_position = 'no' and f.holds_position then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '5', 'code', 'ledger_position', 'message',
      'The ledger shows a position in this company; the disclosure cannot say no.'));
  end if;
  return v_out;
end;
$$;

-- 3. The admin's door to the same facts, for the checklist the publish panel shows (one source: the screen cannot disagree
-- with the gate). clear_from is the India date rule 4 passes from, or null when it is clear today.
create function public.ledger_gate_facts(p_company_id uuid)
returns table (ledger_ok boolean, clear_from date, holds_position boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  f record;
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  select * into f from private.ledger_gate_facts(p_company_id);
  return query select f.ledger_ok,
    case when f.last_stance is not null and f.last_stance + 30 > (now() at time zone 'Asia/Kolkata')::date
         then f.last_stance + 30 end,
    f.holds_position;
end;
$$;

-- 4. publish_revision: the 0005 body (actor check, pinned policy, IST dates, latest-only 'revision' and recorded 'slug'
-- failures, figures-to for files, file numbers) with the ledger half added where rule 4 was reserved. Same signature, so
-- create or replace keeps the function, its owner and its grants; they are restated below so this file reads alone.
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
  -- (D9) a company file needs a figures-to date (the public page shows it; the lag is not required).
  if v_item.kind = 'thesis' and v_item.data_as_of is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A file needs a figures-to date (data_as_of).'));
  end if;
  -- NEW (Plan 3a Task 5): rule 4 (named-security recency) and the position check, read from the sealed ledger events.
  -- Every item that names a company, every revision. Recorded, never raised; no allowance and no screen lifts it.
  if v_item.company_id is not null then
    v_failures := v_failures || private.ledger_gate_failures(
      v_item.company_id, v_item.holds_position, (now() at time zone 'Asia/Kolkata')::date);
  end if;
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
           -- (D8) a file's first pass takes the next number; it never changes or returns.
           file_no = case when v_item.kind in ('thesis', 'case_study')
                          then coalesce(v_item.file_no, nextval('private.file_no_seq')::integer)
                          else v_item.file_no end
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- 5. Privileges. Start from nothing, grant by name. anon gets nothing; the two private helpers are called only by
-- security-definer code. publish_revision keeps the ADR-003 confinement: service_role only.
revoke execute on function private.ledger_gate_facts(uuid)                  from public, anon, authenticated, service_role;
revoke execute on function private.ledger_gate_failures(uuid, text, date)   from public, anon, authenticated, service_role;
revoke execute on function public.ledger_gate_facts(uuid)                   from public, anon, authenticated, service_role;
grant execute on function public.ledger_gate_facts(uuid) to authenticated;
revoke execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, uuid, text, jsonb) to service_role;
