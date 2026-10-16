-- =============================================================================
-- 20261018000025_letters_gate.sql - Phase 5c Task 10: publishing rule 13 (letters) in the gate, and the doors of a send
-- (spec s8.4, s8.6; plan Part 5c; v1.2 addendum rule 13). publish_revision() is NOT restated: it already calls
-- private.distribution_gate_failures (0023), which this file replaces with the same signature, keeping the 0023 video branch
-- verbatim and sending a letter to private.letter_gate_failures (below). The policy stays sebi-unreg-2026-07-v1.2.
--   13.1 subject (the item title) 1..120 characters; the note (the revision body) at most 4,000; the objective is rule 6.
--   13.2 structured is letter/1 with 1..20 entries; each names, by revisionId, the CURRENT passed revision of a public item that
--        is not a letter, at most once, and copies its title, learningObjective and changeReason exactly (and, for a page that
--        names a company, its holdsPosition and companyName; a page that names none carries neither). Its path, the one link
--        the machine adds, must be a page of this site ("/companies/x", "/notes/x"), never another address.
--   13.3 rule 4 and the position check for every entry, through private.ledger_gate_item_failures, recorded as rule 4.
--   13.4 a letter sent (or being sent) to subscribers cannot publish another revision (the 0024 trigger stops new ones).
-- The send doors (service_role only, called after requireAdmin or by the letters:send step): approve_letter_send writes the
-- audit row; claim_letter_send expires approvals older than 24 h, re-checks everything and hands one send to one worker;
-- finish_letter_send records the broadcast and the outcome. Nothing here talks to the network.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

-- The policy publish_revision pins (one source: its c_policy constant), so a later restatement moves both at once.
create function private.gate_policy()
returns text language sql stable security definer set search_path = ''
as $$
  select substring(pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure)
                   from 'c_policy\s+constant\s+text\s*:=\s*''([^'']+)''')
$$;

-- Rule 13. Never raises: a malformed record is a recorded failure. Entry items are held for share until the decision commits, so
-- a concurrent unpublish or rename of an entry waits (lock order: the letter, for update in publish_revision; then the entries).
create function private.letter_gate_failures(p_item_id uuid, p_revision_id uuid, p_struct jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_out     jsonb := '[]'::jsonb;
  v_entries jsonb;
  v_n       integer;
  e         record;
  v_rid     uuid;
  v_rev     public.item_revisions;
  v_item    public.items;
  v_seen    uuid[] := '{}';
  v_bad     boolean;
  f         jsonb;
begin
  if (select length(i.title) between 1 and 120 from public.items i where i.id = p_item_id) is not true then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '13', 'code', '13.1',
      'message', 'A letter''s subject must be 1 to 120 characters.'));
  end if;
  if (select length(r.body_md) <= 4000 from public.item_revisions r where r.id = p_revision_id) is not true then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '13', 'code', '13.1',
      'message', 'A letter''s note must be at most 4,000 characters.'));
  end if;
  if exists (select 1 from public.letter_sends s
              where s.item_id = p_item_id and s.kind = 'subscribers' and s.status in ('sending', 'sent')
                and s.revision_id is distinct from p_revision_id) then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '13', 'code', '13.4',
      'message', 'This letter was sent to subscribers and cannot change.'));
  end if;

  v_entries := case when jsonb_typeof(p_struct) = 'object' and (p_struct ->> 'schema') = 'letter/1' then p_struct -> 'entries' end;
  v_n := case when jsonb_typeof(v_entries) = 'array' then jsonb_array_length(v_entries) end;
  if v_n is null or v_n not between 1 and 20 then
    return v_out || jsonb_build_array(jsonb_build_object('rule', '13', 'code', '13.2',
      'message', 'A letter needs 1 to 20 entries. Make the letter again.'));
  end if;

  for e in select x.value as v, x.ord from jsonb_array_elements(v_entries) with ordinality x(value, ord) loop
    v_bad := true;
    v_rev := null;
    v_item := null;
    if jsonb_typeof(e.v) = 'object' and jsonb_typeof(e.v -> 'revisionId') = 'string'
       and (e.v ->> 'revisionId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_rid := (e.v ->> 'revisionId')::uuid;
      select r.* into v_rev from public.item_revisions r where r.id = v_rid;
      select i.* into v_item from public.items i where i.id = v_rev.item_id for share;
      v_bad := v_item.id is null or v_item.kind = 'letter' or v_rid = any (v_seen)
        or v_item.current_revision_id is distinct from v_rid
        or not private.is_public_item(v_item.visibility, v_item.status, v_item.data_as_of)
        or not private.revision_passed(v_rid)
        or jsonb_typeof(e.v -> 'title') is distinct from 'string'
        or coalesce((e.v ->> 'path') !~ '^/[a-z0-9-]+(/[a-z0-9-]+)*$', true)
        or coalesce(jsonb_typeof(e.v -> 'learningObjective'), 'null') not in ('string', 'null')
        or coalesce(jsonb_typeof(e.v -> 'changeReason'), 'null') not in ('string', 'null')
        or coalesce(jsonb_typeof(e.v -> 'holdsPosition'), 'null') not in ('string', 'null')
        or coalesce(jsonb_typeof(e.v -> 'companyName'), 'null') not in ('string', 'null')
        or (e.v ->> 'title') is distinct from v_item.title
        or (e.v ->> 'learningObjective') is distinct from v_item.learning_objective
        or (e.v ->> 'changeReason') is distinct from v_rev.change_reason
        or (e.v ->> 'companyName') is distinct from (select c.name from public.companies c where c.id = v_item.company_id)
        or (v_item.company_id is not null and (e.v ->> 'holdsPosition') is distinct from v_item.holds_position)
        or (v_item.company_id is null and (e.v ->> 'holdsPosition') is not null);
    end if;
    if v_bad then
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '13', 'code', '13.2', 'entry', e.ord,
        'message', format('Entry %s changed or is no longer public. Make the letter again.', e.ord)));
      continue;
    end if;
    v_seen := v_seen || v_rid;
    for f in select x.value from jsonb_array_elements(private.ledger_gate_item_failures(
               v_item.id, v_item.company_id, v_item.holds_position, (now() at time zone 'Asia/Kolkata')::date)) x loop
      v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '4', 'code', '13.3', 'entry', e.ord,
        'ledgerCode', f ->> 'code', 'message', format('Entry %s: %s', e.ord, f ->> 'message')));
    end loop;
  end loop;
  return v_out;
end;
$$;
revoke execute on function private.gate_policy(), private.letter_gate_failures(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- The 0023 function (comment, body and revoke copied, not retyped); the one new statement sends a letter to its own branch.
-- Rule 12, codes 12.1-12.4 (12.5, company and theme, is the existing checks). Each failure is {rule '12', code, message}.
--   12.1 the revision is a video/1 record of this item's source; the source is his own channel, unlisted or public on YouTube,
--        fetched within the last 7 days.
--   12.2 the revision names a transcript of this source whose SQL hash equals transcriptSha, and the lint covered exactly that text.
--   12.3 a video naming a company needs data_as_of at least 30 IST days old (as a case study).
--   12.4 chapters: an array of 0 or 3..100 {s, title}, first at 0, whole seconds strictly rising, titles 1..100 characters.
-- The source row is held for share until the decision commits, so a concurrent record_video_fetch waits and the decision is taken
-- on the data it read. Lock order: items (publish_revision, for update), then video_sources; record_video_fetch locks only the source.
create or replace function private.distribution_gate_failures(p_item_id uuid, p_kind text, p_company_id uuid, p_data_as_of date,
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
  if p_kind = 'letter' then
    return private.letter_gate_failures(p_item_id, p_revision_id, p_struct);
  end if;
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
    -- A gone video has its channel cleared (0022, Q51): it is reported as gone below, not as someone else's.
    if v_src.own_channel is not true and v_src.privacy is distinct from 'gone' then
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

-- Sends. Approvals older than 24 hours expire (D91). Called by both doors under the sends lock.
create function private.expire_letter_sends()
returns void language sql security definer set search_path = ''
as $$
  update public.letter_sends set status = 'expired' where status = 'approved' and approved_at < now() - interval '24 hours'
$$;

-- Why this letter revision cannot be sent (null when it can), and the pass decision it relies on: a letter, this revision current
-- and public, its latest decision a pass under the policy the gate pins now (a tie counts the failure), and rule 13 clean today.
create function private.letter_send_check(p_item_id uuid, p_revision_id uuid, out problem text, out decision_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.items;
  v_rev  public.item_revisions;
  v_dec  public.gate_decisions;
  v_fail jsonb;
begin
  select i.* into v_item from public.items i where i.id = p_item_id for share;
  if v_item.id is null or v_item.kind is distinct from 'letter' then
    problem := 'This is not a letter.';
    return;
  end if;
  if p_revision_id is null or v_item.current_revision_id is distinct from p_revision_id then
    problem := 'Approve the letter''s current public revision.';
    return;
  end if;
  if not private.is_public_item(v_item.visibility, v_item.status, v_item.data_as_of) then
    problem := 'The letter is not public.';
    return;
  end if;
  select r.* into v_rev from public.item_revisions r where r.id = p_revision_id;
  select g.* into v_dec from public.gate_decisions g where g.revision_id = p_revision_id
   order by g.decided_at desc, (g.verdict = 'fail') desc, g.created_at desc limit 1;
  if v_dec.verdict is distinct from 'pass' or v_dec.policy_version is distinct from private.gate_policy()
     or v_dec.decided_at < v_rev.created_at then
    problem := 'The letter''s last gate decision is not a pass under the current policy. Publish it again.';
    return;
  end if;
  v_fail := private.letter_gate_failures(p_item_id, p_revision_id, v_rev.structured);
  if jsonb_array_length(v_fail) > 0 then
    problem := v_fail -> 0 ->> 'message';
    return;
  end if;
  decision_id := v_dec.id;
end;
$$;

create function public.approve_letter_send(p_actor uuid, p_item_id uuid, p_revision_id uuid, p_kind text)
returns public.letter_sends
language plpgsql security definer set search_path = ''
as $$
declare
  c     record;
  v_row public.letter_sends;
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'approve_letter_send: admin only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('self_test', 'subscribers') then
    raise exception 'approve_letter_send: kind must be self_test or subscribers' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('letters:sends'));
  perform private.expire_letter_sends();
  select * into c from private.letter_send_check(p_item_id, p_revision_id);
  if c.problem is not null then
    raise exception '%', c.problem using errcode = '55000';
  end if;
  if p_kind = 'subscribers' then
    if exists (select 1 from public.letter_sends s where s.item_id = p_item_id and s.kind = 'subscribers'
                 and s.status not in ('failed', 'expired', 'cancelled')) then
      raise exception 'This letter has already been sent to subscribers, or its send is waiting.' using errcode = '55000';
    end if;
    if exists (select 1 from public.letter_sends s where s.kind = 'subscribers' and s.status in ('approved', 'sending')) then
      raise exception 'Another letter is being sent. Wait until it has gone.' using errcode = '55000';
    end if;
  elsif (select count(*) from public.letter_sends s where s.kind = 'self_test' and s.approved_at >= private.ist_day_start()) >= 5 then
    raise exception '5 test copies sent today. The next can go tomorrow.' using errcode = '55000';
  end if;
  insert into public.letter_sends (item_id, revision_id, gate_decision_id, kind, approved_by, recipients_at_approval)
  values (p_item_id, p_revision_id, c.decision_id, p_kind, p_actor,
          case when p_kind = 'subscribers' then (select count(*) from public.subscribers b where b.status = 'confirmed') else 1 end)
  returning * into v_row;
  return v_row;
end;
$$;

-- One send to one worker. First a send whose worker stopped (sending, claimed more than 10 minutes ago): it is handed out again
-- as it is when it has a broadcast id (the step reads the broadcast and sends only a draft, spec s8.6), and re-checked when it
-- has none. Then the oldest approval, re-checked: an unpublish, an entry change or a gate change after approval fails it.
-- Returns the claimed row (status sending), or a row of nulls when there is nothing to send.
create function public.claim_letter_send()
returns public.letter_sends
language plpgsql security definer set search_path = ''
as $$
declare
  c     record;
  v_row public.letter_sends;
begin
  perform pg_advisory_xact_lock(hashtext('letters:sends'));
  perform private.expire_letter_sends();
  for v_row in
    select s.* from public.letter_sends s
     where s.status = 'approved' or (s.status = 'sending' and s.claimed_at < now() - interval '10 minutes')
     order by (s.status = 'sending') desc, s.approved_at, s.id
     for update skip locked
  loop
    if v_row.status = 'sending' and v_row.broadcast_id is not null then
      update public.letter_sends set claimed_at = now() where id = v_row.id returning * into v_row;
      return v_row;
    end if;
    select * into c from private.letter_send_check(v_row.item_id, v_row.revision_id);
    if v_row.status = 'approved' then
      update public.letter_sends set status = 'sending', claimed_at = now() where id = v_row.id returning * into v_row;
    end if;
    if c.problem is null and private.is_admin_user(v_row.approved_by) then
      update public.letter_sends set claimed_at = now() where id = v_row.id returning * into v_row;
      return v_row;
    end if;
    update public.letter_sends set status = 'failed', problem = 'The letter changed after you approved it.' where id = v_row.id;
  end loop;
  return null;
end;
$$;

-- The worker's report. 'sending' records the broadcast id once; 'sent' and 'failed' end the send. The problem is kept on one
-- line, at most 160 characters (the caller has already removed the key; spec s8.6).
create function public.finish_letter_send(p_id uuid, p_status text, p_broadcast_id text, p_recipients integer, p_problem text)
returns public.letter_sends
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.letter_sends;
begin
  if p_status is null or p_status not in ('sending', 'sent', 'failed') or length(p_broadcast_id) > 100 or p_recipients < 0
     or (p_status = 'sending' and p_broadcast_id is null) then
    raise exception 'finish_letter_send: bad arguments' using errcode = '22023';
  end if;
  select s.* into v_row from public.letter_sends s where s.id = p_id for update;
  if v_row.id is null then
    raise exception 'finish_letter_send: send % not found', p_id using errcode = 'P0002';
  end if;
  if v_row.status is distinct from 'sending' then
    raise exception 'finish_letter_send: the send is %, not sending', v_row.status using errcode = '55000';
  end if;
  if p_broadcast_id is not null and v_row.broadcast_id is not null and p_broadcast_id is distinct from v_row.broadcast_id then
    raise exception 'finish_letter_send: the send already has a broadcast' using errcode = '55000';
  end if;
  update public.letter_sends
     set status = p_status,
         broadcast_id = coalesce(v_row.broadcast_id, p_broadcast_id),
         sent_at = case when p_status = 'sent' then now() end,
         recipients_sent = case when p_status = 'sent' then p_recipients end,
         problem = case when p_status = 'failed'
                        then left(btrim(regexp_replace(coalesce(p_problem, ''), '[[:cntrl:]]+', ' ', 'g')), 160) end
   where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- "Cancel" (Task 12): Aksh withdraws an approval before the step has claimed it. The forward-only trigger already allows
-- approved -> cancelled; no API role can update the table, so this is the only way. Under the sends lock, so it waits for a claim in
-- progress and then finds the row `sending`, which it refuses.
create function public.cancel_letter_send(p_actor uuid, p_id uuid)
returns public.letter_sends
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.letter_sends;
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'cancel_letter_send: admin only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('letters:sends'));
  select s.* into v_row from public.letter_sends s where s.id = p_id for update;
  if v_row.id is null then
    raise exception 'This send could not be found.' using errcode = 'P0002';
  end if;
  if v_row.status is distinct from 'approved' then
    raise exception 'Only a send that is still waiting can be cancelled.' using errcode = '55000';
  end if;
  update public.letter_sends set status = 'cancelled' where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- Privileges: the four doors are service_role only; no API role executes the helpers.
revoke execute on function private.expire_letter_sends(), private.letter_send_check(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.approve_letter_send(uuid, uuid, uuid, text), public.claim_letter_send(),
  public.finish_letter_send(uuid, text, text, integer, text), public.cancel_letter_send(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.approve_letter_send(uuid, uuid, uuid, text), public.claim_letter_send(),
  public.finish_letter_send(uuid, text, text, integer, text), public.cancel_letter_send(uuid, uuid) to service_role;

-- The adapter's last question before an email leaves (Task 11; spec s9.2): is there a recorded, live approval for exactly this
-- send? Read-only, never raises, false for anything unknown. src/lib/providers/letters-guard.ts asks it before every send call.
-- A send: the row is `sending` of this kind under a live lease (claimed in the last 10 minutes, the window after which
-- claim_letter_send hands it out again), with exactly this broadcast id recorded (null: none yet, the draft is still to be
-- created; a self test never has one).
create function public.letters_send_live(p_id uuid, p_kind text, p_broadcast_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select s.status = 'sending' and s.claimed_at > now() - interval '10 minutes'
           and s.broadcast_id is not distinct from p_broadcast_id
           and (s.kind = 'subscribers' or p_broadcast_id is null)
      from public.letter_sends s
     where s.id = p_id and s.kind = p_kind), false)
$$;
-- A confirmation email: letters_issue_confirmations (admin actor) issued it to this reader, at this address, at this time (to the
-- millisecond, as a JavaScript date holds it), in the last hour, and the link is still unused and unexpired.
create function public.letters_confirmation_live(p_id uuid, p_email text, p_sent_at timestamptz)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select b.status = 'sent' and b.confirm_token_hash is not null and b.confirm_expires_at > now()
           and b.confirm_sent_at > now() - interval '1 hour'
           and abs(extract(epoch from b.confirm_sent_at - p_sent_at)) < 0.001
      from public.subscribers b
     where b.id = p_id and b.email = lower(btrim(p_email))), false)
$$;
revoke execute on function public.letters_send_live(uuid, text, text), public.letters_confirmation_live(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.letters_send_live(uuid, text, text), public.letters_confirmation_live(uuid, text, timestamptz)
  to service_role;
