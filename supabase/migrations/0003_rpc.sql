-- ============================================================================
-- save_expense — write an expense and its split in one transaction.
--
-- SECURITY INVOKER on purpose (the default): this runs as the calling user,
-- so row-level security still decides whether they may touch this group. A
-- definer function here would quietly become a hole straight through RLS.
--
-- Two round trips from the client (insert expense, then insert shares) could
-- be interrupted between them and leave an expense with no split. One
-- function call cannot.
-- ============================================================================
create or replace function public.save_expense(
  p_id          uuid,           -- null to create
  p_group       uuid,
  p_description text,
  p_amount      bigint,
  p_payer       uuid,
  p_category    text,
  p_spent_on    date,
  p_notes       text,
  p_split_mode  text,
  p_split_input jsonb,
  p_shares      jsonb           -- { "<member_id>": <minor units>, ... }
)
returns uuid
language plpgsql
as $$
declare
  uid uuid := auth.uid();
  eid uuid;
  share_total bigint;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.' using errcode = '22000';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'object' or p_shares = '{}'::jsonb then
    raise exception 'Pick at least one person to split between.' using errcode = '22000';
  end if;

  -- Fail loudly and immediately rather than waiting for the deferred
  -- constraint at commit, so the message reaching the person is the useful one.
  select coalesce(sum((value)::text::bigint), 0) into share_total
    from jsonb_each(p_shares);

  if share_total <> p_amount then
    raise exception
      'The split adds up to % but the expense is % — every unit has to be accounted for.',
      share_total, p_amount
      using errcode = '22000';
  end if;

  if p_id is null then
    insert into public.expenses
      (group_id, description, amount_minor, payer_member_id, category, spent_on,
       notes, split_mode, split_input, created_by)
    values
      (p_group, trim(p_description), p_amount, p_payer, p_category, p_spent_on,
       coalesce(p_notes, ''), p_split_mode, coalesce(p_split_input, '{}'::jsonb), uid)
    returning id into eid;
  else
    update public.expenses set
      description     = trim(p_description),
      amount_minor    = p_amount,
      payer_member_id = p_payer,
      category        = p_category,
      spent_on        = p_spent_on,
      notes           = coalesce(p_notes, ''),
      split_mode      = p_split_mode,
      split_input     = coalesce(p_split_input, '{}'::jsonb),
      updated_at      = now(),
      updated_by      = uid,
      deleted_at      = null,
      deleted_by      = null
    where id = p_id
    returning id into eid;

    if eid is null then
      raise exception 'expense_not_found' using errcode = '22023';
    end if;

    delete from public.expense_shares where expense_id = eid;
  end if;

  insert into public.expense_shares (expense_id, member_id, group_id, amount_minor)
  select eid, key::uuid, p_group, (value)::text::bigint
    from jsonb_each(p_shares);

  return eid;
end;
$$;

revoke all on function public.save_expense(uuid, uuid, text, bigint, uuid, text, date, text, text, jsonb, jsonb) from public;
grant execute on function public.save_expense(uuid, uuid, text, bigint, uuid, text, date, text, text, jsonb, jsonb) to authenticated;
