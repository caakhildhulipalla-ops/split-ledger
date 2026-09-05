import { supabase } from './supabase/client';
import { resolveSplit } from './money';
import type {
  GroupData,
  Expense,
  Settlement,
  GroupMember,
  RecurringExpense,
} from './types';
import type { ExpenseLike, SettlementLike, Shares } from './money';
import { monthOf, todayISO } from './format';

/** Distinguishes "no group for you" from a transport error, for the UI. */
export class GroupNotFound extends Error {
  constructor() {
    super('group-not-found');
    this.name = 'GroupNotFound';
  }
}

/**
 * Load one group in a handful of round trips.
 *
 * Every query runs under RLS as the signed-in user, so a group id the caller
 * has no business seeing simply returns nothing — the "not found" is a real
 * "not found for you", not an authorisation check written in app code.
 */
export async function loadGroup(groupId: string): Promise<GroupData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not-signed-in');

  const [groupRes, membersRes, expensesRes, settlementsRes, recurringRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select('*').eq('group_id', groupId).order('joined_at'),
    supabase
      .from('expenses')
      .select('*, expense_shares(*)')
      .eq('group_id', groupId)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('settled_on', { ascending: false }),
    supabase.from('recurring_expenses').select('*').eq('group_id', groupId),
  ]);

  if (!groupRes.data) throw new GroupNotFound();

  const members = (membersRes.data ?? []) as GroupMember[];
  const me = members.find((m) => m.user_id === user.id) ?? null;

  return {
    group: groupRes.data,
    members,
    expenses: (expensesRes.data ?? []) as Expense[],
    settlements: (settlementsRes.data ?? []) as Settlement[],
    recurring: (recurringRes.data ?? []) as RecurringExpense[],
    meMemberId: me?.id ?? null,
    userId: user.id,
  };
}

/* --------------------------------------------------------------------------
   Adapters: database rows -> the shapes the money core works in.
   -------------------------------------------------------------------------- */

export const liveExpenses = (expenses: Expense[]) => expenses.filter((e) => !e.deleted_at);
export const liveSettlements = (s: Settlement[]) => s.filter((x) => !x.deleted_at);

export const sharesOf = (e: Expense): Shares =>
  Object.fromEntries((e.expense_shares ?? []).map((s) => [s.member_id, s.amount_minor]));

export const toExpenseLike = (e: Expense): ExpenseLike => ({
  payerId: e.payer_member_id,
  amountMinor: e.amount_minor,
  shares: sharesOf(e),
});

export const toSettlementLike = (s: Settlement): SettlementLike => ({
  fromId: s.from_member_id,
  toId: s.to_member_id,
  amountMinor: s.amount_minor,
});

export const activeMemberIds = (members: GroupMember[]) =>
  members.filter((m) => !m.removed_at).map((m) => m.id);

/* --------------------------------------------------------------------------
   Recurring expenses.

   Posts every month that has come due since the template started. The unique
   index on (recurring_id, recurring_period) is what makes this safe when two
   flatmates open the app in the same minute: the second insert is rejected by
   the database rather than producing a duplicate month of rent.
   -------------------------------------------------------------------------- */

export function monthsBetween(fromYM: string, toYM: string): string[] {
  const out: string[] = [];
  let [y, m] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  // Guard against a malformed start month walking forever.
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

export async function postDueRecurring(data: GroupData): Promise<number> {
  const active = data.recurring.filter((r) => r.active);
  if (!active.length) return 0;

  const today = todayISO();
  const nowYM = monthOf(today);
  const memberIds = new Set(activeMemberIds(data.members));

  const alreadyPosted = new Set(
    data.expenses
      .filter((e) => e.recurring_id && e.recurring_period)
      .map((e) => `${e.recurring_id}:${e.recurring_period}`),
  );

  let posted = 0;

  for (const r of active) {
    if (!memberIds.has(r.payer_member_id)) continue;
    const participants = (r.participants ?? []).filter((p) => memberIds.has(p));
    if (!participants.length) continue;

    for (const ym of monthsBetween(r.start_month, nowYM)) {
      if (alreadyPosted.has(`${r.id}:${ym}`)) continue;
      const day = Math.min(Math.max(r.day_of_month || 1, 1), 28);
      const spentOn = `${ym}-${String(day).padStart(2, '0')}`;
      if (spentOn > today) continue;

      const shares = resolveSplit(r.amount_minor, r.split_mode, participants, r.split_input ?? {});

      const { data: inserted, error } = await supabase
        .from('expenses')
        .insert({
          group_id: r.group_id,
          description: r.description,
          amount_minor: r.amount_minor,
          payer_member_id: r.payer_member_id,
          category: r.category,
          spent_on: spentOn,
          notes: '',
          split_mode: r.split_mode,
          split_input: r.split_input ?? {},
          recurring_id: r.id,
          recurring_period: ym,
          created_by: data.userId,
        })
        .select('id')
        .single();

      // A duplicate-key error here means another device posted this month
      // first. That is the mechanism working, not a failure.
      if (error || !inserted) continue;

      const { error: shareError } = await supabase.from('expense_shares').insert(
        participants.map((memberId) => ({
          expense_id: inserted.id,
          member_id: memberId,
          group_id: r.group_id,
          amount_minor: shares[memberId] ?? 0,
        })),
      );

      if (shareError) {
        // Never leave an expense without its split: the deferred constraint
        // would reject it anyway, but clean up rather than rely on that.
        await supabase.from('expenses').delete().eq('id', inserted.id);
        continue;
      }
      posted += 1;
    }
  }

  return posted;
}
