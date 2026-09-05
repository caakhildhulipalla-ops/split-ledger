/**
 * The money core.
 *
 * Every amount in this application is an INTEGER count of minor units
 * (paise, cents). Floats only ever cross the UI boundary — they never touch
 * a balance, and they are never stored. Postgres holds these as `bigint`.
 *
 * This module is deliberately free of React, Supabase and Next: it is pure
 * arithmetic, it is the part that must never be wrong, and money.test.ts
 * holds it to that on every build.
 */

export type MemberId = string;
export type Minor = number;
export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares';

/** Raw values as typed into the split editor, keyed by member. */
export type SplitInput = Record<MemberId, number | string>;
/** Resolved amounts owed, keyed by member. Always sums to the total. */
export type Shares = Record<MemberId, Minor>;

export interface ExpenseLike {
  payerId: MemberId;
  amountMinor: Minor;
  shares: Shares;
}
export interface SettlementLike {
  fromId: MemberId;
  toId: MemberId;
  amountMinor: Minor;
}
export interface Transfer {
  from: MemberId;
  to: MemberId;
  amountMinor: Minor;
}

/** Major units (what a person types) to minor units (what we store). */
export const toMinor = (v: number | string): Minor => Math.round(Number(v) * 100);
/** Minor units back to major, for display only. */
export const toMajor = (m: Minor): number => m / 100;

/**
 * Largest-remainder apportionment.
 *
 * Splits `total` across `ids` in proportion to `weights` so that the parts
 * sum to EXACTLY total — no paise invented, none lost. Leftover units go to
 * the largest fractional remainders, ties broken by position, so the same
 * input always produces the same split (important: two devices computing the
 * same expense must agree).
 */
export function apportion(total: Minor, ids: MemberId[], weights: number[]): Shares {
  const n = ids.length;
  const out: Shares = {};
  if (n === 0) return out;

  let ws = weights.map((w) => (Number(w) > 0 ? Number(w) : 0));
  let W = ws.reduce((a, b) => a + b, 0);
  if (W <= 0) {
    ws = ids.map(() => 1);
    W = n;
  }

  const raw = ws.map((w) => (total * w) / W);
  const part = raw.map(Math.floor);
  let rem = total - part.reduce((a, b) => a + b, 0);

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  let k = 0;
  while (rem > 0) {
    part[order[k % n].i] += 1;
    rem -= 1;
    k += 1;
  }

  ids.forEach((id, i) => {
    out[id] = part[i];
  });
  return out;
}

/** Turn a split mode plus raw inputs into exact amounts owed per member. */
export function resolveSplit(
  total: Minor,
  mode: SplitMode,
  participants: MemberId[],
  inputs: SplitInput = {},
): Shares {
  if (mode === 'exact') {
    const out: Shares = {};
    participants.forEach((id) => {
      out[id] = toMinor(inputs[id] ?? 0);
    });
    return out;
  }
  const weights = participants.map((id) => {
    if (mode === 'equal') return 1;
    const v = Number(inputs[id]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  return apportion(total, participants, weights);
}

/**
 * Null when the split can be posted, otherwise a message naming the fix.
 * `fmt` renders a minor-unit amount in the group's currency.
 */
export function splitProblem(
  total: Minor,
  mode: SplitMode,
  participants: MemberId[],
  inputs: SplitInput = {},
  fmt: (m: Minor) => string = (m) => (m / 100).toFixed(2),
): string | null {
  if (!participants.length) return 'Pick at least one person to split between.';
  if (!(total > 0)) return 'Enter an amount greater than zero.';

  if (mode === 'exact') {
    const sum = participants.reduce((a, id) => a + toMinor(inputs[id] ?? 0), 0);
    const gap = total - sum;
    if (gap !== 0) {
      return gap > 0 ? `${fmt(gap)} still unassigned.` : `${fmt(-gap)} over the total.`;
    }
  }
  if (mode === 'percent') {
    const sum = participants.reduce((a, id) => a + (Number(inputs[id]) || 0), 0);
    const gap = Math.round((100 - sum) * 100) / 100;
    if (Math.abs(gap) > 0.001) {
      return gap > 0 ? `${gap}% still unassigned.` : `${-gap}% over 100%.`;
    }
  }
  if (mode === 'shares') {
    const sum = participants.reduce(
      (a, id) => a + (Number(inputs[id]) > 0 ? Number(inputs[id]) : 0),
      0,
    );
    if (sum <= 0) return 'Give at least one person a share.';
  }
  return null;
}

/**
 * Net position per member: positive means the group owes them, negative
 * means they owe the group.
 *
 * Sums to zero across the group, always. That invariant is what the
 * reconciliation line on the Balances screen reports — if it ever prints a
 * non-zero figure, the data is wrong, not the arithmetic.
 */
export function netBalances(
  memberIds: MemberId[],
  expenses: ExpenseLike[],
  settlements: SettlementLike[],
): Record<MemberId, Minor> {
  const net: Record<MemberId, Minor> = {};
  memberIds.forEach((id) => {
    net[id] = 0;
  });
  const bump = (id: MemberId, v: Minor) => {
    if (Object.prototype.hasOwnProperty.call(net, id)) net[id] += v;
  };

  for (const e of expenses) {
    bump(e.payerId, e.amountMinor);
    for (const id of Object.keys(e.shares ?? {})) bump(id, -e.shares[id]);
  }
  for (const s of settlements) {
    bump(s.fromId, s.amountMinor);
    bump(s.toId, -s.amountMinor);
  }
  return net;
}

/**
 * Greedy minimum cash flow: settle the largest debt against the largest
 * credit, repeatedly. Clears every balance in at most (members - 1) payments.
 */
export function settleUp(net: Record<MemberId, Minor>): Transfer[] {
  const cred: { id: MemberId; v: Minor }[] = [];
  const deb: { id: MemberId; v: Minor }[] = [];
  Object.keys(net).forEach((id) => {
    const v = net[id];
    if (v > 0) cred.push({ id, v });
    else if (v < 0) deb.push({ id, v: -v });
  });
  cred.sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  deb.sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));

  const tx: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < deb.length && j < cred.length) {
    const x = Math.min(deb[i].v, cred[j].v);
    if (x > 0) tx.push({ from: deb[i].id, to: cred[j].id, amountMinor: x });
    deb[i].v -= x;
    cred[j].v -= x;
    if (deb[i].v === 0) i += 1;
    if (cred[j].v === 0) j += 1;
  }
  return tx;
}

/**
 * The un-simplified view: what each pair owes each other directly, netted
 * one way. This is the answer to "don't route my debt through Priya".
 */
export function pairwiseDebts(
  memberIds: MemberId[],
  expenses: ExpenseLike[],
  settlements: SettlementLike[],
): Transfer[] {
  const pair: Record<MemberId, Record<MemberId, Minor>> = {};
  const add = (d: MemberId, c: MemberId, v: Minor) => {
    if (d === c) return;
    pair[d] = pair[d] ?? {};
    pair[d][c] = (pair[d][c] ?? 0) + v;
  };
  for (const e of expenses) {
    for (const id of Object.keys(e.shares ?? {})) add(id, e.payerId, e.shares[id]);
  }
  for (const s of settlements) add(s.toId, s.fromId, s.amountMinor);

  const out: Transfer[] = [];
  for (let a = 0; a < memberIds.length; a += 1) {
    for (let b = a + 1; b < memberIds.length; b += 1) {
      const A = memberIds[a];
      const B = memberIds[b];
      const v = (pair[A]?.[B] ?? 0) - (pair[B]?.[A] ?? 0);
      if (v > 0) out.push({ from: A, to: B, amountMinor: v });
      else if (v < 0) out.push({ from: B, to: A, amountMinor: -v });
    }
  }
  return out.sort((x, y) => y.amountMinor - x.amountMinor);
}
