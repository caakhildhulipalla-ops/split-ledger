-- ============================================================================
-- Security test: prove one group's finances are unreachable from another.
--
-- Run with ON_ERROR_STOP=1 — every check raises on failure, so a non-zero
-- exit means the isolation is broken. These are the attacks a public expense
-- app actually faces: a signed-in stranger reading your ledger, writing into
-- it, or corrupting balances with a bad split.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

-- Three real people.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'akhil@example.com',  '{"full_name":"Akhil"}'),
  ('22222222-2222-2222-2222-222222222222', 'mallory@example.com','{"full_name":"Mallory"}'),
  ('33333333-3333-3333-3333-333333333333', 'rohan@example.com',  '{"full_name":"Rohan"}');

create or replace function act_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false);
$$;

-- Scratch table for carrying ids between the blocks below. Part of the test
-- harness, not the schema; it needs grants because the checks run as the
-- `authenticated` role rather than as a superuser (a superuser would bypass
-- RLS entirely and prove nothing).
create table if not exists t_ids (k text primary key, v uuid);
grant select, insert, update on t_ids to authenticated;
grant execute on function act_as(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Akhil creates a flat ledger with a placeholder slot for Rohan.
-- ---------------------------------------------------------------------------
set role authenticated;
select act_as('11111111-1111-1111-1111-111111111111');

do $$
declare g uuid;
begin
  g := public.create_group('Flat 302', 'INR', array['Rohan', 'Priya']);
  insert into t_ids values ('g1', g) on conflict (k) do update set v = excluded.v;

  if (select count(*) from public.group_members where group_id = g) <> 3 then
    raise exception 'FAIL: expected 3 members after create_group';
  end if;
  raise notice 'ok  create_group made a group with 3 members (1 real, 2 placeholders)';
end $$;

-- Post an expense: 3000.00 rent, split equally three ways.
do $$
declare
  g uuid; me uuid; rohan uuid; priya uuid; e uuid;
begin
  select v into g from t_ids where k = 'g1';
  select id into me    from public.group_members where group_id = g and user_id is not null;
  select id into rohan from public.group_members where group_id = g and display_name = 'Rohan';
  select id into priya from public.group_members where group_id = g and display_name = 'Priya';
  insert into t_ids values ('rohan', rohan) on conflict (k) do update set v = excluded.v;

  insert into public.expenses
    (group_id, description, amount_minor, payer_member_id, category, spent_on,
     split_mode, created_by)
  values (g, 'Flat rent', 300000, me, 'Rent', current_date, 'equal',
          '11111111-1111-1111-1111-111111111111')
  returning id into e;

  insert into public.expense_shares (expense_id, member_id, group_id, amount_minor) values
    (e, me, g, 100000), (e, rohan, g, 100000), (e, priya, g, 100000);

  raise notice 'ok  expense posted with a balanced 3-way split';
end $$;

-- ---------------------------------------------------------------------------
-- The zero-sum invariant is enforced by the database, not the client.
-- ---------------------------------------------------------------------------
-- The share check is a DEFERRED constraint trigger, so in normal use it fires
-- at COMMIT — which is what lets an expense and its shares be written in
-- either order inside one transaction. A deferred violation therefore cannot
-- be caught by an exception handler in that same transaction; forcing the
-- constraint IMMEDIATE is how the check is observed here.
do $$
declare g uuid; me uuid; e uuid; failed boolean := false; msg text;
begin
  select v into g from t_ids where k = 'g1';
  select id into me from public.group_members where group_id = g and user_id is not null;
  begin
    insert into public.expenses
      (group_id, description, amount_minor, payer_member_id, category, spent_on,
       split_mode, created_by)
    values (g, 'Bad split', 100000, me, 'Other', current_date, 'equal',
            '11111111-1111-1111-1111-111111111111')
    returning id into e;
    -- shares deliberately short by 1.00
    insert into public.expense_shares (expense_id, member_id, group_id, amount_minor)
    values (e, me, g, 99900);
    set constraints all immediate;
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  if not failed then
    raise exception 'FAIL: database accepted a split that does not sum to its total';
  end if;
  raise notice 'ok  a split that does not add up is rejected: %', left(msg, 60);
end $$;

-- ...and the same guard catches an amount edited out from under its shares.
do $$
declare g uuid; me uuid; other uuid; e uuid; failed boolean := false;
begin
  select v into g from t_ids where k = 'g1';
  select id into me from public.group_members where group_id = g and user_id is not null;
  select id into other from public.group_members where group_id = g and display_name = 'Priya';
  begin
    insert into public.expenses
      (group_id, description, amount_minor, payer_member_id, category, spent_on,
       split_mode, created_by)
    values (g, 'Repriced later', 50000, me, 'Other', current_date, 'equal',
            '11111111-1111-1111-1111-111111111111')
    returning id into e;
    insert into public.expense_shares (expense_id, member_id, group_id, amount_minor)
    values (e, me, g, 25000), (e, other, g, 25000);
    set constraints all immediate;
    -- shares still total 500.00; the expense now claims 900.00
    update public.expenses set amount_minor = 90000 where id = e;
    set constraints all immediate;
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'FAIL: an expense amount was changed without its split';
  end if;
  raise notice 'ok  repricing an expense without restating its split is rejected';
end $$;

-- ---------------------------------------------------------------------------
-- Mallory is a perfectly ordinary signed-in user of the same app.
-- ---------------------------------------------------------------------------
select act_as('22222222-2222-2222-2222-222222222222');

do $$
declare n int; g uuid;
begin
  select v into g from t_ids where k = 'g1';

  select count(*) into n from public.groups;
  if n <> 0 then raise exception 'FAIL: Mallory can see % group(s)', n; end if;

  select count(*) into n from public.expenses;
  if n <> 0 then raise exception 'FAIL: Mallory can see % expense(s)', n; end if;

  select count(*) into n from public.expense_shares;
  if n <> 0 then raise exception 'FAIL: Mallory can see % share row(s)', n; end if;

  select count(*) into n from public.group_members;
  if n <> 0 then raise exception 'FAIL: Mallory can see % member(s)', n; end if;

  select count(*) into n from public.group_invites;
  if n <> 0 then raise exception 'FAIL: Mallory can enumerate invites'; end if;

  -- Even knowing the group id exactly.
  select count(*) into n from public.groups where id = g;
  if n <> 0 then raise exception 'FAIL: Mallory reads the group by guessing its id'; end if;

  raise notice 'ok  a stranger sees nothing — not by listing, not by id';
end $$;

-- Mallory tries to write into Akhil's ledger.
do $$
declare g uuid; victim uuid; blocked boolean := false;
begin
  select v into g from t_ids where k = 'g1';
  select v into victim from t_ids where k = 'rohan';
  begin
    insert into public.expenses
      (group_id, description, amount_minor, payer_member_id, category, spent_on,
       split_mode, created_by)
    values (g, 'Mallory owes nothing', 999999, victim, 'Other', current_date, 'equal',
            '22222222-2222-2222-2222-222222222222');
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL: a stranger wrote an expense into someone else''s group';
  end if;
  raise notice 'ok  a stranger cannot write into a group they are not in';
end $$;

-- Mallory tries to add herself to the group.
do $$
declare g uuid; blocked boolean := false;
begin
  select v into g from t_ids where k = 'g1';
  begin
    insert into public.group_members (group_id, user_id, display_name)
    values (g, '22222222-2222-2222-2222-222222222222', 'Mallory');
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL: a stranger added themselves to a group';
  end if;
  raise notice 'ok  a stranger cannot add themselves to a group';
end $$;

-- ---------------------------------------------------------------------------
-- Rohan joins by invite and inherits the history already recorded for him.
-- ---------------------------------------------------------------------------
select act_as('11111111-1111-1111-1111-111111111111');
do $$
declare g uuid; rohan uuid;
begin
  select v into g from t_ids where k = 'g1';
  select v into rohan from t_ids where k = 'rohan';
  insert into public.group_invites (group_id, code, member_id, created_by)
  values (g, 'join-rohan-abc123', rohan, '11111111-1111-1111-1111-111111111111');
  raise notice 'ok  invite created for a specific placeholder slot';
end $$;

select act_as('33333333-3333-3333-3333-333333333333');
do $$
declare g uuid; joined uuid; owed bigint; n int;
begin
  select v into g from t_ids where k = 'g1';

  select count(*) into n from public.groups;
  if n <> 0 then raise exception 'FAIL: Rohan saw the group before redeeming'; end if;

  joined := public.redeem_invite('join-rohan-abc123');
  if joined <> g then raise exception 'FAIL: redeem returned the wrong group'; end if;

  select count(*) into n from public.groups;
  if n <> 1 then raise exception 'FAIL: Rohan cannot see the group after joining'; end if;

  -- The point of slot-claiming: he owes the 1000.00 already recorded against
  -- his name, rather than arriving fresh beside a ghost of himself.
  select s.amount_minor into owed
    from public.expense_shares s
    join public.group_members m on m.id = s.member_id
   where m.user_id = '33333333-3333-3333-3333-333333333333';
  if owed is distinct from 100000 then
    raise exception 'FAIL: Rohan did not inherit his existing share (got %)', owed;
  end if;

  select count(*) into n from public.group_members where group_id = g;
  if n <> 3 then raise exception 'FAIL: joining created a duplicate member (% rows)', n; end if;

  raise notice 'ok  invited member claims their slot and inherits their history';
end $$;

-- A used-up or expired invite is refused.
do $$
declare blocked boolean := false;
begin
  begin
    perform public.redeem_invite('no-such-code-at-all');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an unknown invite code was accepted'; end if;
  raise notice 'ok  an unknown invite code is refused';
end $$;

-- ---------------------------------------------------------------------------
-- A member carrying expenses cannot be deleted out from under the balances.
-- ---------------------------------------------------------------------------
select act_as('11111111-1111-1111-1111-111111111111');
do $$
declare rohan uuid; blocked boolean := false;
begin
  select v into rohan from t_ids where k = 'rohan';
  begin
    delete from public.group_members where id = rohan;
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL: deleted a member who appears in expenses — balances would not reconcile';
  end if;
  raise notice 'ok  a member with expenses cannot be deleted (use removed_at)';
end $$;

-- ---------------------------------------------------------------------------
-- save_expense() must run as the CALLER, not as its definer. If it were
-- SECURITY DEFINER this would be a hole straight through every policy above.
-- ---------------------------------------------------------------------------
select act_as('11111111-1111-1111-1111-111111111111');
do $$
declare g uuid; me uuid; rohan uuid; e uuid; n int;
begin
  select v into g from t_ids where k = 'g1';
  select v into rohan from t_ids where k = 'rohan';
  select id into me from public.group_members
    where group_id = g and user_id = '11111111-1111-1111-1111-111111111111';

  e := public.save_expense(
    null, g, 'Groceries', 60000, me, 'Groceries', current_date, '', 'equal',
    '{}'::jsonb,
    jsonb_build_object(me::text, 30000, rohan::text, 30000)
  );

  select count(*) into n from public.expense_shares where expense_id = e;
  if n <> 2 then raise exception 'FAIL: save_expense wrote % share rows', n; end if;
  raise notice 'ok  save_expense writes an expense and its split together';

  -- Editing re-states the whole split rather than leaving orphans behind.
  perform public.save_expense(
    e, g, 'Groceries', 90000, me, 'Groceries', current_date, '', 'equal',
    '{}'::jsonb,
    jsonb_build_object(me::text, 45000, rohan::text, 45000)
  );
  select count(*) into n from public.expense_shares where expense_id = e;
  if n <> 2 then raise exception 'FAIL: editing left % share rows', n; end if;
  raise notice 'ok  editing an expense replaces its split cleanly';
end $$;

do $$
declare g uuid; me uuid; blocked boolean := false;
begin
  select v into g from t_ids where k = 'g1';
  select id into me from public.group_members
    where group_id = g and user_id = '11111111-1111-1111-1111-111111111111';
  begin
    perform public.save_expense(
      null, g, 'Off by one rupee', 10000, me, 'Other', current_date, '', 'equal',
      '{}'::jsonb, jsonb_build_object(me::text, 9900));
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: save_expense accepted a short split'; end if;
  raise notice 'ok  save_expense refuses a split that does not add up';
end $$;

select act_as('22222222-2222-2222-2222-222222222222');
do $$
declare g uuid; victim uuid; blocked boolean := false;
begin
  select v into g from t_ids where k = 'g1';
  select v into victim from t_ids where k = 'rohan';
  begin
    perform public.save_expense(
      null, g, 'Injected by a stranger', 50000, victim, 'Other', current_date, '',
      'equal', '{}'::jsonb, jsonb_build_object(victim::text, 50000));
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL: save_expense let a stranger write into another group — it is running as definer';
  end if;
  raise notice 'ok  save_expense runs as the caller, so RLS still applies';
end $$;

reset role;
\echo ''
\echo '  ALL SECURITY CHECKS PASSED'
\echo ''
