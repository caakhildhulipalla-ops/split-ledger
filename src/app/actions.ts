'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveSplit, splitProblem, type SplitMode, type SplitInput } from '@/lib/money';
import { CATEGORIES, CURRENCIES } from '@/lib/types';

export type Result = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const ok = (id?: string): Result => ({ ok: true, id });

/** Postgres messages are surfaced only where they are safe and useful. */
function dbError(e: { message?: string; code?: string } | null): string {
  if (!e) return 'Something went wrong. Try again.';
  if (e.code === '23505') return 'That already exists.';
  if (e.code === '42501' || e.code === '28000') {
    return 'You do not have access to that group.';
  }
  return e.message ?? 'Something went wrong. Try again.';
}

/* ------------------------------------------------------------------ groups */

export async function createGroup(
  name: string,
  currency: string,
  memberNames: string[],
): Promise<Result> {
  const supabase = await createClient();
  const clean = name.trim();
  if (!clean) return fail('Give the group a name.');
  if (!CURRENCIES[currency]) return fail('Pick a supported currency.');

  const others = memberNames.map((n) => n.trim()).filter(Boolean);
  if (new Set(others.map((n) => n.toLowerCase())).size !== others.length) {
    return fail('Two members share a name — make them distinguishable.');
  }

  const { data, error } = await supabase.rpc('create_group', {
    group_name: clean,
    group_currency: currency,
    other_members: others,
  });
  if (error) return fail(dbError(error));

  revalidatePath('/groups');
  return ok(data as string);
}

export async function updateGroup(
  groupId: string,
  name: string,
  currency: string,
): Promise<Result> {
  const supabase = await createClient();
  if (!name.trim()) return fail('Give the group a name.');
  if (!CURRENCIES[currency]) return fail('Pick a supported currency.');

  const { error } = await supabase
    .from('groups')
    .update({ name: name.trim(), currency })
    .eq('id', groupId);
  if (error) return fail(dbError(error));

  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

export async function deleteGroup(groupId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) return fail(dbError(error));
  revalidatePath('/groups');
  redirect('/groups');
}

/* ----------------------------------------------------------------- members */

export async function addMember(groupId: string, displayName: string): Promise<Result> {
  const supabase = await createClient();
  const clean = displayName.trim();
  if (!clean) return fail('Give the member a name.');

  const { count } = await supabase
    .from('group_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId);

  const { data, error } = await supabase
    .from('group_members')
    .insert({
      group_id: groupId,
      display_name: clean,
      hue: 1 + ((count ?? 0) % 8),
    })
    .select('id')
    .single();
  if (error) return fail(dbError(error));

  revalidatePath(`/g/${groupId}`, 'layout');
  return ok(data.id);
}

export async function renameMember(
  groupId: string,
  memberId: string,
  displayName: string,
): Promise<Result> {
  const supabase = await createClient();
  if (!displayName.trim()) return fail('A member needs a name.');
  const { error } = await supabase
    .from('group_members')
    .update({ display_name: displayName.trim() })
    .eq('id', memberId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

/**
 * Retire a member without touching history. Hard deletion is refused by the
 * database whenever they appear in an expense — which is what keeps balances
 * reconciling — so retiring is the honest operation to expose.
 */
export async function removeMember(groupId: string, memberId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('group_members')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

export async function restoreMember(groupId: string, memberId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('group_members')
    .update({ removed_at: null })
    .eq('id', memberId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

/* ----------------------------------------------------------------- invites */

export async function createInvite(groupId: string, memberId?: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Sign in first.');

  // 128 bits of entropy, URL-safe, no lookalike characters.
  const code = randomBytes(16)
    .toString('base64url')
    .replace(/[-_]/g, '')
    .slice(0, 22);

  const { error } = await supabase.from('group_invites').insert({
    group_id: groupId,
    code,
    member_id: memberId ?? null,
    created_by: user.id,
  });
  if (error) return fail(dbError(error));

  revalidatePath(`/g/${groupId}/settings`);
  return ok(code);
}

export async function revokeInvite(groupId: string, inviteId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('group_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}/settings`);
  return ok();
}

export async function redeemInvite(code: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code });
  if (error) {
    if (error.message?.includes('invite_invalid')) {
      return fail('That invite link has expired or been used up. Ask for a new one.');
    }
    return fail(dbError(error));
  }
  revalidatePath('/groups');
  return ok(data as string);
}

/* ---------------------------------------------------------------- expenses */

export interface ExpenseInput {
  id?: string | null;
  groupId: string;
  description: string;
  amount: string | number;
  payerMemberId: string;
  category: string;
  spentOn: string;
  notes?: string;
  splitMode: SplitMode;
  participants: string[];
  splitInput: SplitInput;
}

export async function saveExpense(input: ExpenseInput): Promise<Result> {
  const supabase = await createClient();

  const amountMinor = Math.round(Number(input.amount) * 100);
  if (!input.description.trim()) return fail('Give the expense a description.');
  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) {
    return fail('Pick a category from the list.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) return fail('Pick a valid date.');

  // Shares are computed HERE, from the mode and the raw inputs — never taken
  // from the client. A tampered request cannot post a split that does not
  // reconcile, and the database would reject it even if it tried.
  const problem = splitProblem(
    amountMinor,
    input.splitMode,
    input.participants,
    input.splitInput,
    (m) => (m / 100).toFixed(2),
  );
  if (problem) return fail(problem);

  const shares = resolveSplit(
    amountMinor,
    input.splitMode,
    input.participants,
    input.splitInput,
  );

  const { data, error } = await supabase.rpc('save_expense', {
    p_id: input.id ?? null,
    p_group: input.groupId,
    p_description: input.description,
    p_amount: amountMinor,
    p_payer: input.payerMemberId,
    p_category: input.category,
    p_spent_on: input.spentOn,
    p_notes: input.notes ?? '',
    p_split_mode: input.splitMode,
    p_split_input: input.splitMode === 'equal' ? {} : input.splitInput,
    p_shares: shares,
  });
  if (error) return fail(dbError(error));

  revalidatePath(`/g/${input.groupId}`, 'layout');
  return ok(data as string);
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq('id', expenseId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

export async function restoreExpense(groupId: string, expenseId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', expenseId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

export async function purgeExpense(groupId: string, expenseId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

/* ------------------------------------------------------------- settlements */

export async function saveSettlement(
  groupId: string,
  fromMemberId: string,
  toMemberId: string,
  amount: string | number,
  settledOn: string,
  note = '',
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Sign in first.');

  const amountMinor = Math.round(Number(amount) * 100);
  if (fromMemberId === toMemberId) return fail('Pick two different people.');
  if (!(amountMinor > 0)) return fail('Enter an amount greater than zero.');

  const { error } = await supabase.from('settlements').insert({
    group_id: groupId,
    from_member_id: fromMemberId,
    to_member_id: toMemberId,
    amount_minor: amountMinor,
    settled_on: settledOn,
    note: note.trim(),
    created_by: user.id,
  });
  if (error) return fail(dbError(error));

  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

export async function deleteSettlement(groupId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('settlements')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq('id', id);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

/* --------------------------------------------------------------- recurring */

export interface RecurringInput {
  id?: string | null;
  groupId: string;
  description: string;
  amount: string | number;
  payerMemberId: string;
  category: string;
  dayOfMonth: number;
  startMonth: string;
  splitMode: SplitMode;
  participants: string[];
  splitInput: SplitInput;
  active: boolean;
}

export async function saveRecurring(input: RecurringInput): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Sign in first.');

  const amountMinor = Math.round(Number(input.amount) * 100);
  if (!input.description.trim()) return fail('Give it a description.');
  if (!/^\d{4}-\d{2}$/.test(input.startMonth)) return fail('Pick a first month.');

  const problem = splitProblem(
    amountMinor,
    input.splitMode,
    input.participants,
    input.splitInput,
    (m) => (m / 100).toFixed(2),
  );
  if (problem) return fail(problem);

  const row = {
    group_id: input.groupId,
    description: input.description.trim(),
    amount_minor: amountMinor,
    payer_member_id: input.payerMemberId,
    category: input.category,
    day_of_month: Math.min(Math.max(input.dayOfMonth || 1, 1), 28),
    start_month: input.startMonth,
    split_mode: input.splitMode,
    split_input: input.splitMode === 'equal' ? {} : input.splitInput,
    participants: input.participants,
    active: input.active,
  };

  const { error } = input.id
    ? await supabase.from('recurring_expenses').update(row).eq('id', input.id)
    : await supabase.from('recurring_expenses').insert({ ...row, created_by: user.id });
  if (error) return fail(dbError(error));

  revalidatePath(`/g/${input.groupId}`, 'layout');
  return ok();
}

export async function toggleRecurring(
  groupId: string,
  id: string,
  active: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('recurring_expenses').update({ active }).eq('id', id);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

export async function deleteRecurring(groupId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
  if (error) return fail(dbError(error));
  revalidatePath(`/g/${groupId}`, 'layout');
  return ok();
}

/* ------------------------------------------------------------------- misc */

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/signin');
}
