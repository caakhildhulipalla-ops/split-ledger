-- ============================================================================
-- Split Ledger — row-level security
--
-- Rule: you can see and touch a row if, and only if, you are a live member
-- of the group that row belongs to. Nothing else is readable — not by URL
-- guessing, not by a crafted API call, not by another group's members.
--
-- The membership test lives in a SECURITY DEFINER function on purpose. A
-- policy on `group_members` that queried `group_members` directly would
-- recurse forever; routing through a definer function evaluates the check
-- once, outside RLS. This is the single most common way Supabase schemas
-- break, so it is worth the indirection.
-- ============================================================================

-- ------------------------------------------------------------- predicates
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and m.removed_at is null
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and m.removed_at is null
      and m.role = 'owner'
  ) or exists (
    select 1 from public.groups g
    where g.id = gid and g.created_by = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_admin(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- ----------------------------------------------------------- enable RLS
alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.expenses           enable row level security;
alter table public.expense_shares     enable row level security;
alter table public.settlements        enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.group_invites      enable row level security;

-- Force RLS even for the table owner, so a mistake in a server-side helper
-- cannot quietly read the whole table.
alter table public.profiles           force row level security;
alter table public.groups             force row level security;
alter table public.group_members      force row level security;
alter table public.expenses           force row level security;
alter table public.expense_shares     force row level security;
alter table public.settlements        force row level security;
alter table public.recurring_expenses force row level security;
alter table public.group_invites      force row level security;

-- ---------------------------------------------------------------- profiles
-- Your profile is yours alone. Names shown to other people come from
-- `group_members.display_name`, so nobody reads anyone else's account row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- ------------------------------------------------------------------ groups
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select using (public.is_group_member(id));

drop policy if exists groups_insert_self on public.groups;
create policy groups_insert_self on public.groups
  for insert with check (created_by = auth.uid());

drop policy if exists groups_update_member on public.groups;
create policy groups_update_member on public.groups
  for update using (public.is_group_member(id)) with check (public.is_group_member(id));

drop policy if exists groups_delete_admin on public.groups;
create policy groups_delete_admin on public.groups
  for delete using (public.is_group_admin(id));

-- ----------------------------------------------------------- group members
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members
  for select using (public.is_group_member(group_id));

-- The creator can add the first members before they are themselves a member —
-- otherwise creating a group would be impossible without a definer function.
drop policy if exists members_insert on public.group_members;
create policy members_insert on public.group_members
  for insert with check (
    public.is_group_member(group_id) or public.is_group_admin(group_id)
  );

drop policy if exists members_update on public.group_members;
create policy members_update on public.group_members
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- A member referenced by any expense cannot be deleted: the composite
-- foreign keys reject it, which is what keeps balances reconciling. Use
-- `removed_at` to retire someone instead.
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members
  for delete using (public.is_group_admin(group_id));

-- ---------------------------------------------------------------- expenses
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_group_member(group_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    public.is_group_member(group_id) and created_by = auth.uid()
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (public.is_group_member(group_id));

-- ----------------------------------------------------------- expense shares
drop policy if exists shares_select on public.expense_shares;
create policy shares_select on public.expense_shares
  for select using (public.is_group_member(group_id));

drop policy if exists shares_insert on public.expense_shares;
create policy shares_insert on public.expense_shares
  for insert with check (public.is_group_member(group_id));

drop policy if exists shares_update on public.expense_shares;
create policy shares_update on public.expense_shares
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists shares_delete on public.expense_shares;
create policy shares_delete on public.expense_shares
  for delete using (public.is_group_member(group_id));

-- ------------------------------------------------------------- settlements
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select using (public.is_group_member(group_id));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert with check (
    public.is_group_member(group_id) and created_by = auth.uid()
  );

drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements
  for delete using (public.is_group_member(group_id));

-- ------------------------------------------------------ recurring expenses
drop policy if exists recurring_select on public.recurring_expenses;
create policy recurring_select on public.recurring_expenses
  for select using (public.is_group_member(group_id));

drop policy if exists recurring_insert on public.recurring_expenses;
create policy recurring_insert on public.recurring_expenses
  for insert with check (public.is_group_member(group_id));

drop policy if exists recurring_update on public.recurring_expenses;
create policy recurring_update on public.recurring_expenses
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists recurring_delete on public.recurring_expenses;
create policy recurring_delete on public.recurring_expenses
  for delete using (public.is_group_member(group_id));

-- ----------------------------------------------------------------- invites
-- Only existing members may read invite rows, so codes cannot be enumerated
-- through the API. Joining goes through redeem_invite() below, which is the
-- only path that reads an invite on behalf of a non-member.
drop policy if exists invites_select on public.group_invites;
create policy invites_select on public.group_invites
  for select using (public.is_group_member(group_id));

drop policy if exists invites_insert on public.group_invites;
create policy invites_insert on public.group_invites
  for insert with check (
    public.is_group_member(group_id) and created_by = auth.uid()
  );

drop policy if exists invites_update on public.group_invites;
create policy invites_update on public.group_invites
  for update using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists invites_delete on public.group_invites;
create policy invites_delete on public.group_invites
  for delete using (public.is_group_member(group_id));

-- ============================================================================
-- Create a group and its members in one transaction.
--
-- Without this, creating a group is a chicken-and-egg problem: you cannot
-- insert yourself as a member of a group you are not yet a member of.
-- ============================================================================
create or replace function public.create_group(
  group_name text,
  group_currency text default 'INR',
  other_members text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_group uuid;
  nm text;
  i int := 1;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if group_name is null or length(trim(group_name)) = 0 then
    raise exception 'group_name_required' using errcode = '22000';
  end if;
  if array_length(other_members, 1) > 49 then
    raise exception 'too_many_members' using errcode = '22000';
  end if;

  insert into public.groups (name, currency, created_by)
  values (trim(group_name), upper(coalesce(nullif(trim(group_currency), ''), 'INR')), uid)
  returning id into new_group;

  insert into public.group_members (group_id, user_id, display_name, hue, role)
  values (
    new_group, uid,
    coalesce((select display_name from public.profiles where id = uid), 'Me'),
    1, 'owner'
  );

  foreach nm in array coalesce(other_members, '{}')
  loop
    if length(trim(nm)) > 0 then
      i := i + 1;
      insert into public.group_members (group_id, user_id, display_name, hue)
      values (new_group, null, trim(nm), 1 + (i - 1) % 8);
    end if;
  end loop;

  return new_group;
end;
$$;

-- ============================================================================
-- Redeem an invite.
--
-- The only route by which a non-member touches a group. It validates the
-- code, expiry and use count itself rather than trusting the caller, and
-- claims a named placeholder slot when the link was made for one — so an
-- invited flatmate inherits their existing history instead of arriving with
-- a zero balance beside a ghost of themselves.
-- ============================================================================
create or replace function public.redeem_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.group_invites;
  existing uuid;
  claimed uuid;
  member_count int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into inv
    from public.group_invites
   where code = invite_code
     and revoked_at is null
     and expires_at > now()
     and uses < max_uses;

  if not found then
    raise exception 'invite_invalid' using errcode = '22023';
  end if;

  -- Already in this group: joining again is a no-op, not an error.
  select id into existing
    from public.group_members
   where group_id = inv.group_id and user_id = uid and removed_at is null;
  if found then
    return inv.group_id;
  end if;

  -- Claim the specific slot this link was made for, if still unclaimed.
  if inv.member_id is not null then
    update public.group_members
       set user_id = uid
     where id = inv.member_id
       and user_id is null
       and removed_at is null
    returning id into claimed;
  end if;

  if claimed is null then
    select count(*) into member_count
      from public.group_members where group_id = inv.group_id;
    insert into public.group_members (group_id, user_id, display_name, hue)
    values (
      inv.group_id, uid,
      coalesce((select display_name from public.profiles where id = uid), 'New member'),
      1 + (member_count % 8)
    );
  end if;

  update public.group_invites set uses = uses + 1 where id = inv.id;
  return inv.group_id;
end;
$$;

revoke all on function public.create_group(text, text, text[]) from public;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.create_group(text, text, text[]) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;

-- --------------------------------------------------------------- table grants
-- RLS decides which rows; these decide which verbs. Both are required.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.groups, public.group_members, public.expenses,
  public.expense_shares, public.settlements, public.recurring_expenses,
  public.group_invites
  to authenticated;

-- Anonymous visitors get nothing at all.
revoke all on public.profiles, public.groups, public.group_members,
  public.expenses, public.expense_shares, public.settlements,
  public.recurring_expenses, public.group_invites from anon;
