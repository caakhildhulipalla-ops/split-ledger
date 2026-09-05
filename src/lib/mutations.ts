'use client';

import { supabase } from './supabase/client';
import { resolveSplit, splitProblem, type SplitMode, type SplitInput } from './money';
import { CATEGORIES, CURRENCIES } from './types';

/**
 * Every mutation in the app.
 *
 * These were Next.js server actions. They are now plain async functions that
 * run in the browser / WebView and call Supabase directly under the anon key
 * and RLS. The shares for an expense are still computed here from the raw
 * inputs and never trusted from a form, and the database still enforces the
 * zero-sum invariant with a deferred constraint — so the guarantees the old
 * version relied on are unchanged. What is gone is `revalidatePath`; callers
 * call `router.refresh()` (see `router-compat`) which re-fetches the data
 * hooks.
 */

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

/** 128 bits of entropy, URL-safe, no lookalike characters. */
function inviteCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let b64 = btoa(String.fromCharCode(...bytes));
  b64 = b64.replace(/\+/g, '').replace(/\//g, '').replace(/=/g, '');
  return b64.slice(0, 22);
}

/* ------------------------------------------------------------------ groups */

export async function createGroup(
  name: string,
  currency: string,
  memberNames: string[],
): Promise<Result> {
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
  return ok(data as string);
}

export async function updateGroup(
  groupId: string,
  name: string,
  currency: string,
): Promise<Result> {
  if (!name.trim()) return fail('Give the group a name.');
  if (!CURRENCIES[currency]) return fail('Pick a supported currency.');

  const { error } = await supabase
    .from('groups')
    .update({ name: name.trim(), currency })
    .eq('id', groupId);
  if (error) return fail(dbError(error));
  return ok();
}

export async function deleteGroup(groupId: string): Promise<Result> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) return fail(dbError(error));
  return ok();
}

/* ----------------------------------------------------------------- members */

export async function addMember(groupId: string, displayName: string): Promise<Result> {
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
  return ok(data.id);
}

export async function renameMember(
  _groupId: string,
  memberId: string,
  displayName: string,
): Promise<Result> {
  if (!displayName.trim()) return fail('A member needs a name.');
  const { error } = await supabase
    .from('group_members')
    .update({ display_name: displayName.trim() })
    .eq('id', memberId);
  if (error) return fail(dbError(error));
  return ok();
}

/**
 * Retire a member without touching history. Hard deletion is refused by the
 * database whenever they appear in an expense — which is what keeps balances
 * reconciling — so retiring is the honest operation to expose.
 */
export async function removeMember(_groupId: string, memberId: string): Promise<Result> {
  const { error } = await supabase
    .from('group_members')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) return fail(dbError(error));
  return ok();
}

export async function restoreMember(_groupId: string, memberId: string): Promise<Result> {
  const { error } = await supabase
    .from('group_members')
    .update({ removed_at: null })
    .eq('id', memberId);
  if (error) return fail(dbError(error));
  return ok();
}

/* ----------------------------------------------------------------- invites */

export async function createInvite(groupId: string, memberId?: string): Promise<Result> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Sign in first.');

  const { error } = await supabase.from('group_invites').insert({
    group_id: groupId,
    code: inviteCode(),
    member_id: memberId ?? null,
    created_by: user.id,
  });
  if (error) return fail(dbError(error));
  return ok();
}

export async function revokeInvite(_groupId: string, inviteId: string): Promise<Result> {
  const { error } = await supabase
    .from('group_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) return fail(dbError(error));
  return ok();
}

export async function redeemInvite(code: string): Promise<Result> {
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code });
  if (error) {
    if (error.message?.includes('invite_invalid')) {
      return fail('That invite link has expired or been used up. Ask for a new one.');
    }
    return fail(dbError(error));
  }
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
  const amountMinor = Math.round(Number(input.amount) * 100);
  if (!input.description.trim()) return fail('Give the expense a description.');
  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) {
    return fail('Pick a category from the list.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) return fail('Pick a valid date.');

  // Shares are computed HERE, from the mode and the raw inputs — never taken
  // from the client form. A tampered request cannot post a split that does
  // not reconcile, and the database would reject it even if it tried.
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
  return ok(data as string);
}

export async function deleteExpense(_groupId: string, expenseId: string): Promise<Result> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq('id', expenseId);
  if (error) return fail(dbError(error));
  return ok();
}

export async function restoreExpense(_groupId: string, expenseId: string): Promise<Result> {
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', expenseId);
  if (error) return fail(dbError(error));
  return ok();
}

export async function purgeExpense(_groupId: string, expenseId: string): Promise<Result> {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) return fail(dbError(error));
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
  return ok();
}

export async function deleteSettlement(_groupId: string, id: string): Promise<Result> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('settlements')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq('id', id);
  if (error) return fail(dbError(error));
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
  return ok();
}

export async function toggleRecurring(
  _groupId: string,
  id: string,
  active: boolean,
): Promise<Result> {
  const { error } = await supabase.from('recurring_expenses').update({ active }).eq('id', id);
  if (error) return fail(dbError(error));
  return ok();
}

export async function deleteRecurring(_groupId: string, id: string): Promise<Result> {
  const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
  if (error) return fail(dbError(error));
  return ok();
}

/* ------------------------------------------------------------------- misc */

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
