-- ============================================================================
-- Split Ledger — schema
--
-- Two ideas drive this design:
--
-- 1. MEMBERS ARE NOT USERS. A `group_members` row is a named slot in a
--    ledger. It *may* be linked to a signed-in user, and it may not — so you
--    can add "Rohan" to the flat ledger tonight and let Rohan sign up next
--    week without re-entering three months of expenses. Every expense,
--    share and settlement points at a member slot, never at a user.
--
-- 2. THE DATABASE ENFORCES THE ZERO-SUM INVARIANT. A client bug must not be
--    able to corrupt balances. Shares are checked against their expense
--    total by a deferred constraint trigger, and cross-group contamination
--    is impossible by composite foreign key.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member'
               check (length(trim(display_name)) between 1 and 60),
  email        text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ groups
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  currency    char(3) not null default 'INR',
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- ----------------------------------------------------------- group members
create table if not exists public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  -- NULL user_id = a placeholder slot for someone who has not signed up yet.
  user_id      uuid references auth.users(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  hue          smallint not null default 1 check (hue between 1 and 8),
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  removed_at   timestamptz
);

-- One user occupies at most one slot per group. Postgres treats NULLs as
-- distinct, so any number of placeholder slots coexist happily.
create unique index if not exists group_members_one_slot_per_user
  on public.group_members (group_id, user_id) where user_id is not null;

-- Target for the composite foreign keys below: a referenced member is
-- guaranteed to belong to the same group as the row referencing it.
alter table public.group_members
  drop constraint if exists group_members_group_id_id_key;
alter table public.group_members
  add constraint group_members_group_id_id_key unique (group_id, id);

create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists group_members_group_idx on public.group_members (group_id);

-- ------------------------------------------------------- recurring expense
create table if not exists public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  description     text not null check (length(trim(description)) between 1 and 140),
  amount_minor    bigint not null check (amount_minor > 0),
  payer_member_id uuid not null,
  category        text not null default 'Rent',
  day_of_month    smallint not null default 1 check (day_of_month between 1 and 28),
  start_month     text not null check (start_month ~ '^\d{4}-\d{2}$'),
  split_mode      text not null check (split_mode in ('equal', 'exact', 'percent', 'shares')),
  split_input     jsonb not null default '{}'::jsonb,
  participants    uuid[] not null check (array_length(participants, 1) >= 1),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  constraint recurring_payer_in_group
    foreign key (group_id, payer_member_id)
    references public.group_members (group_id, id)
);

create index if not exists recurring_group_idx on public.recurring_expenses (group_id);

-- ---------------------------------------------------------------- expenses
create table if not exists public.expenses (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.groups(id) on delete cascade,
  description      text not null check (length(trim(description)) between 1 and 140),
  amount_minor     bigint not null check (amount_minor > 0),
  payer_member_id  uuid not null,
  category         text not null default 'Other',
  spent_on         date not null,
  notes            text not null default '',
  split_mode       text not null check (split_mode in ('equal', 'exact', 'percent', 'shares')),
  split_input      jsonb not null default '{}'::jsonb,
  recurring_id     uuid references public.recurring_expenses(id) on delete set null,
  recurring_period text check (recurring_period ~ '^\d{4}-\d{2}$'),
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_at       timestamptz,
  updated_by       uuid references auth.users(id),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users(id),
  constraint expenses_payer_in_group
    foreign key (group_id, payer_member_id)
    references public.group_members (group_id, id)
);

-- A recurring template posts each month at most once, whoever opens the app
-- first. This is the database-level guarantee against duplicate rent.
create unique index if not exists expenses_one_post_per_period
  on public.expenses (recurring_id, recurring_period)
  where recurring_id is not null;

create index if not exists expenses_group_date_idx
  on public.expenses (group_id, spent_on desc);
create index if not exists expenses_group_live_idx
  on public.expenses (group_id) where deleted_at is null;

-- ----------------------------------------------------------- expense shares
create table if not exists public.expense_shares (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  member_id    uuid not null,
  group_id     uuid not null references public.groups(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (expense_id, member_id),
  constraint shares_member_in_group
    foreign key (group_id, member_id)
    references public.group_members (group_id, id)
);

create index if not exists expense_shares_member_idx on public.expense_shares (member_id);
create index if not exists expense_shares_group_idx on public.expense_shares (group_id);

-- ------------------------------------------------------------- settlements
create table if not exists public.settlements (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  from_member_id uuid not null,
  to_member_id   uuid not null,
  amount_minor   bigint not null check (amount_minor > 0),
  settled_on     date not null,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  deleted_at     timestamptz,
  deleted_by     uuid references auth.users(id),
  check (from_member_id <> to_member_id),
  constraint settlement_from_in_group
    foreign key (group_id, from_member_id)
    references public.group_members (group_id, id),
  constraint settlement_to_in_group
    foreign key (group_id, to_member_id)
    references public.group_members (group_id, id)
);

create index if not exists settlements_group_idx on public.settlements (group_id, settled_on desc);

-- ----------------------------------------------------------------- invites
create table if not exists public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  code       text not null unique check (length(code) between 8 and 64),
  -- When set, redeeming this link claims that specific placeholder slot,
  -- so "Rohan" keeps his three months of history instead of arriving as a
  -- brand new member with a zero balance.
  member_id  uuid references public.group_members(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  max_uses   int not null default 20 check (max_uses > 0),
  uses       int not null default 0,
  revoked_at timestamptz
);

create index if not exists group_invites_group_idx on public.group_invites (group_id);

-- ============================================================================
-- The zero-sum invariant, enforced by the database.
--
-- An expense's shares must sum to exactly its amount. Checked as a DEFERRED
-- constraint trigger so that an expense and its shares can be written in any
-- order within one transaction, and validated once at commit.
-- ============================================================================
create or replace function public.assert_shares_balance()
returns trigger
language plpgsql
as $$
declare
  target_expense uuid;
  expected bigint;
  actual bigint;
begin
  target_expense := coalesce(new.expense_id, old.expense_id);

  select amount_minor into expected
    from public.expenses where id = target_expense;

  -- The expense itself was deleted in this transaction; nothing to check.
  if not found then
    return null;
  end if;

  select coalesce(sum(amount_minor), 0) into actual
    from public.expense_shares where expense_id = target_expense;

  if actual <> expected then
    raise exception
      'expense % shares sum to % but the expense is % — a split must account for every unit',
      target_expense, actual, expected
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists expense_shares_balance on public.expense_shares;
create constraint trigger expense_shares_balance
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function public.assert_shares_balance();

-- Changing an expense's amount must not silently orphan its shares.
--
-- This trigger is DEFERRED, so it runs at COMMIT — by which time `new` is a
-- snapshot taken when the statement ran, not the row as it now stands. An
-- expense inserted at one amount and then edited to another queues two
-- events, and the first would compare its stale snapshot against the final
-- shares and fail a transaction that is actually correct. So re-read the
-- current row instead of trusting `new`, and let both events converge on the
-- same answer.
create or replace function public.assert_expense_amount_balance()
returns trigger
language plpgsql
as $$
declare
  current_amount bigint;
  is_deleted timestamptz;
  actual bigint;
begin
  select amount_minor, deleted_at into current_amount, is_deleted
    from public.expenses where id = new.id;

  -- Row gone, or soft-deleted, in this same transaction: nothing to check.
  if not found or is_deleted is not null then
    return null;
  end if;

  select coalesce(sum(amount_minor), 0) into actual
    from public.expense_shares where expense_id = new.id;

  if actual <> current_amount then
    raise exception
      'expense % is % but its shares sum to % — update the split with the amount',
      new.id, current_amount, actual
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists expenses_amount_balance on public.expenses;
create constraint trigger expenses_amount_balance
  after insert or update of amount_minor on public.expenses
  deferrable initially deferred
  for each row execute function public.assert_expense_amount_balance();

-- ----------------------------------------------------- profile bookkeeping
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, phone)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New member'
    ),
    new.email,
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
