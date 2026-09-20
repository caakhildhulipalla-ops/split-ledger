-- ============================================================================
-- Layer Farm MIS — schema
--
-- Two decisions shape this file.
--
-- 1. ONE TABLE, NOT TWENTY-FOUR. Every entity — farm, shed, flock, daily
--    entry, purchase, expense — is a row in `records`, discriminated by
--    `type`, with its own fields in a `payload` JSONB column. Twenty-four
--    tables would mean twenty-four sets of row-level-security policies to
--    keep in step, and the security rules are the only thing standing
--    between one farm's books and another's. Written once, reviewed once.
--
-- 2. THE DEVICE IS THE SOURCE OF TRUTH. Ids are generated offline on the
--    phone, so the server never assigns one. `rev` and `updated_by_role`
--    travel with each row because conflict resolution — an owner's edit
--    beats a supervisor's, otherwise the latest wins — has to give the same
--    answer on the server as it does on every phone.
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tenants
-- A tenant is one customer: an owner, their farms, and nothing else's data.
create table if not exists public.tenants (
  id         uuid primary key,
  name       text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- members
-- Who may reach a tenant, and as what. A person is an auth user; a
-- membership is that person's role inside one tenant.
create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'manager', 'supervisor')),
  -- Sheds a supervisor may write to. Empty means every shed in the tenant.
  shed_ids   uuid[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists memberships_by_user on public.memberships (user_id) where active;

-- ----------------------------------------------------------------- records
create table if not exists public.records (
  id              uuid primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  type            text not null check (length(type) between 1 and 40),
  payload         jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null,
  updated_at      timestamptz not null,
  created_by      text not null,
  updated_by      text not null,
  -- Carried from the device so the server can apply the same conflict rule.
  updated_by_role text not null check (updated_by_role in ('owner', 'manager', 'supervisor')),
  rev             integer not null default 1 check (rev >= 1),
  deleted_at      timestamptz,

  -- When the server saw it. Sync pulls on this, never on `updated_at`, which
  -- is a device clock and can run backwards relative to other devices.
  server_at       timestamptz not null default now()
);

-- The pull query: everything in my tenant the server saw after my last sync.
create index if not exists records_sync on public.records (tenant_id, server_at);
create index if not exists records_by_type on public.records (tenant_id, type) where deleted_at is null;

-- A shed's day is looked up constantly; this makes it an index hit.
create index if not exists records_daily_entry
  on public.records ((payload->>'shedId'), (payload->>'day'))
  where type = 'daily-entry' and deleted_at is null;

-- One entry per shed, per date, per session — enforced by the database, not
-- only by the app, because two phones can be offline at the same time.
create unique index if not exists records_one_entry_per_session
  on public.records (tenant_id, (payload->>'shedId'), (payload->>'day'), (payload->>'session'))
  where type = 'daily-entry' and deleted_at is null;

-- --------------------------------------------------------------- audit log
-- Every create, edit and delete: who, when, and what changed. Append-only —
-- there is no policy allowing update or delete, for anybody.
create table if not exists public.audit_log (
  id          uuid primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  entity_id   uuid not null,
  entity_type text not null,
  action      text not null check (action in ('create', 'update', 'delete')),
  at          timestamptz not null,
  by_user     text not null,
  by_name     text not null,
  by_role     text not null,
  changes     jsonb not null default '[]'::jsonb,
  server_at   timestamptz not null default now()
);

create index if not exists audit_by_entity on public.audit_log (tenant_id, entity_id, at desc);

-- ------------------------------------------------------------- zone rates
-- NECC zone rates are shared across every tenant: one team enters them once a
-- day for everyone (decision 15). Owners override per farm in their own
-- `records`, which is why this table has no tenant column.
create table if not exists public.zone_rates (
  zone         text not null,
  day          date not null,
  rate_per_100 integer not null check (rate_per_100 >= 0),
  updated_at   timestamptz not null default now(),
  primary key (zone, day)
);

-- --------------------------------------------------------------- triggers
-- `server_at` is the server's own clock and must not be settable by a client.
create or replace function public.stamp_server_at()
returns trigger
language plpgsql
as $$
begin
  new.server_at := now();
  return new;
end;
$$;

drop trigger if exists records_stamp_server_at on public.records;
create trigger records_stamp_server_at
  before insert or update on public.records
  for each row execute function public.stamp_server_at();

drop trigger if exists audit_stamp_server_at on public.audit_log;
create trigger audit_stamp_server_at
  before insert on public.audit_log
  for each row execute function public.stamp_server_at();

-- ------------------------------------------------------- conflict rule
-- The same rule the phones apply, applied again on arrival: an owner's edit
-- beats a supervisor's; otherwise the later edit wins; ties break on `rev`.
-- Without this, the last device to sync would always win regardless of rank.
create or replace function public.resolve_record_conflict()
returns trigger
language plpgsql
as $$
declare
  rank_new int := case new.updated_by_role
                    when 'owner' then 2 when 'manager' then 1 else 0 end;
  rank_old int := case old.updated_by_role
                    when 'owner' then 2 when 'manager' then 1 else 0 end;
begin
  if rank_new < rank_old then
    return old;  -- incoming edit outranked; keep what is stored
  end if;

  if rank_new = rank_old then
    if new.updated_at < old.updated_at then
      return old;
    end if;
    if new.updated_at = old.updated_at and new.rev < old.rev then
      return old;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists records_resolve_conflict on public.records;
create trigger records_resolve_conflict
  before update on public.records
  for each row execute function public.resolve_record_conflict();
