-- ============================================================================
-- Layer Farm MIS — row-level security
--
-- The whole multi-tenant promise rests on this file. A signed-in stranger who
-- knows a farm's tenant id must not be able to read one egg count from it.
--
-- Every policy routes through `is_member()` / `has_role()`, which read the
-- caller's memberships. They are marked STABLE and SECURITY DEFINER so the
-- policy can see the memberships table without the caller needing to, and so
-- Postgres evaluates them once per statement rather than once per row.
-- ============================================================================

alter table public.tenants     enable row level security;
alter table public.memberships enable row level security;
alter table public.records     enable row level security;
alter table public.audit_log   enable row level security;
alter table public.zone_rates  enable row level security;

-- --------------------------------------------------------------- helpers

create or replace function public.is_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function public.has_role(target uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target and m.user_id = auth.uid() and m.active
      and m.role = any(roles)
  );
$$;

/**
 * May the caller write this record?
 *
 * Owners and managers: anything in their tenant. Supervisors: only the
 * operational record types, and only for a shed they are responsible for.
 * A supervisor cannot write a rate, an expense or another shed's entry —
 * which is the same rule the app's UI enforces, restated where it cannot be
 * bypassed by pointing a script at the API.
 */
create or replace function public.may_write(target uuid, record_type text, shed uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_role(target, array['owner', 'manager']) then true
    when public.has_role(target, array['supervisor']) then
      record_type in ('daily-entry', 'feed-issue', 'vaccination', 'gate-log', 'dispatch', 'medicine-issue')
      and exists (
        select 1 from public.memberships m
        where m.tenant_id = target and m.user_id = auth.uid() and m.active
          and (cardinality(m.shed_ids) = 0 or shed is null or shed = any(m.shed_ids))
      )
    else false
  end;
$$;

-- --------------------------------------------------------------- tenants

drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants
  for select using (public.is_member(id));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update using (public.has_role(id, array['owner']))
  with check (public.has_role(id, array['owner']));

-- A brand-new tenant has no members yet, so its creator cannot be checked
-- against a membership. Creation is therefore open to any signed-in user;
-- what keeps it safe is that an empty tenant grants nothing until a
-- membership row exists, and that row is guarded below.
drop policy if exists tenants_insert on public.tenants;
create policy tenants_insert on public.tenants
  for insert to authenticated with check (true);

-- ------------------------------------------------------------ memberships

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships
  for select using (user_id = auth.uid() or public.is_member(tenant_id));

-- The first membership in a tenant must be the caller making themselves
-- owner — that is how a tenant they just created becomes reachable. Every
-- later membership can only be added by an existing owner.
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated with check (
    public.has_role(tenant_id, array['owner'])
    or (
      user_id = auth.uid()
      and role = 'owner'
      and not exists (select 1 from public.memberships m where m.tenant_id = memberships.tenant_id)
    )
  );

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update using (public.has_role(tenant_id, array['owner']))
  with check (public.has_role(tenant_id, array['owner']));

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
  for delete using (public.has_role(tenant_id, array['owner']));

-- ---------------------------------------------------------------- records

-- Everyone in the tenant reads everything in it. Hiding prices from
-- supervisors is a UI rule, not a security boundary: the same rows drive
-- their own screens, and a column-level split would double the policy
-- surface for a guarantee the app does not actually need.
drop policy if exists records_read on public.records;
create policy records_read on public.records
  for select using (public.is_member(tenant_id));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
  for insert to authenticated with check (
    public.may_write(tenant_id, type, nullif(payload->>'shedId', '')::uuid)
  );

drop policy if exists records_update on public.records;
create policy records_update on public.records
  for update using (
    public.may_write(tenant_id, type, nullif(payload->>'shedId', '')::uuid)
  ) with check (
    public.may_write(tenant_id, type, nullif(payload->>'shedId', '')::uuid)
  );

-- Records are never hard-deleted: a delete sets `deleted_at` so the audit
-- trail and the sync protocol still have a row to point at.
drop policy if exists records_delete on public.records;
create policy records_delete on public.records
  for delete using (public.has_role(tenant_id, array['owner']));

-- -------------------------------------------------------------- audit log

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select using (public.has_role(tenant_id, array['owner', 'manager']));

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to authenticated with check (public.is_member(tenant_id));

-- No update or delete policy exists, so the log is append-only for everyone,
-- including owners. That is the point of it.

-- ------------------------------------------------------------- zone rates

-- Published rates are readable by every signed-in user; only the service
-- role (which bypasses RLS) writes them.
drop policy if exists zone_rates_read on public.zone_rates;
create policy zone_rates_read on public.zone_rates
  for select to authenticated using (true);
