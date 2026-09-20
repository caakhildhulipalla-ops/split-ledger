/**
 * Allocation.
 *
 * Farm-level money has to reach a flock before flock P&L means anything. An
 * electricity bill covering 1–30 June is not a 30 June cost; it is 1/30th of a
 * cost on each of thirty days, and on each of those days it belongs to the
 * sheds in proportion to the birds that were actually alive in them.
 *
 * Both steps use `distribute`, so the parts always sum back to the bill. An
 * owner who adds up thirty daily P&Ls gets the month's expenses to the paisa.
 */

import { distribute, type Paise } from './money';
import { eachDay, type DayKey } from './dates';

/** Spread an amount evenly over the inclusive day range it covers. */
export function spreadOverDays(amount: Paise, from: DayKey, to: DayKey): Map<DayKey, Paise> {
  const days = eachDay(from, to);
  const out = new Map<DayKey, Paise>();
  if (days.length === 0) return out;
  const parts = distribute(amount, new Array<number>(days.length).fill(1));
  days.forEach((d, i) => out.set(d, parts[i]!));
  return out;
}

export interface Weighted {
  key: string;
  weight: number;
}

/**
 * Split an amount across keys by weight — live birds, in this app.
 *
 * When every weight is zero (an empty farm, or a cost booked before
 * placement), the amount is split evenly rather than dropped, so nothing
 * disappears from the books.
 */
export function allocateByWeight(amount: Paise, entries: readonly Weighted[]): Map<string, Paise> {
  const out = new Map<string, Paise>();
  if (entries.length === 0) return out;
  const parts = distribute(amount, entries.map((e) => e.weight));
  entries.forEach((e, i) => out.set(e.key, (out.get(e.key) ?? 0) + parts[i]!));
  return out;
}

export interface ExpenseToAllocate {
  id: string;
  amount: Paise;
  /** Inclusive period the expense covers; a one-day expense has from === to. */
  from: DayKey;
  to: DayKey;
  /** When set, the whole expense belongs here and no weighting is applied. */
  flockId?: string;
  shedId?: string;
}

/** Live birds per flock on a day — the weights allocation runs on. */
export type LiveBirdsByDay = ReadonlyMap<DayKey, ReadonlyMap<string, number>>;

export interface AllocatedSlice {
  day: DayKey;
  flockId: string;
  expenseId: string;
  amount: Paise;
}

/**
 * Turn a list of expenses into per-day, per-flock slices.
 *
 * An expense already tagged to a flock skips the weighting and is only spread
 * over its days. An untagged expense is spread over its days and then split
 * across whichever flocks were alive on each of those days — so a flock that
 * was placed halfway through the month carries only the half it was there for.
 */
export function allocateExpenses(
  expenses: readonly ExpenseToAllocate[],
  liveByDay: LiveBirdsByDay,
  flocksOf: (shedId: string) => readonly string[] = () => [],
): AllocatedSlice[] {
  const slices: AllocatedSlice[] = [];

  for (const expense of expenses) {
    const perDay = spreadOverDays(expense.amount, expense.from, expense.to);

    for (const [day, dayAmount] of perDay) {
      if (expense.flockId) {
        slices.push({ day, flockId: expense.flockId, expenseId: expense.id, amount: dayAmount });
        continue;
      }

      const live = liveByDay.get(day) ?? new Map<string, number>();
      const candidates = expense.shedId
        ? flocksOf(expense.shedId).map((id) => ({ key: id, weight: live.get(id) ?? 0 }))
        : [...live.entries()].map(([id, birds]) => ({ key: id, weight: birds }));

      if (candidates.length === 0) continue; // nothing on the farm that day
      for (const [flockId, amount] of allocateByWeight(dayAmount, candidates)) {
        if (amount !== 0) slices.push({ day, flockId, expenseId: expense.id, amount });
      }
    }
  }
  return slices;
}

/** Roll slices up into `day → flock → paise`. */
export function sliceIndex(slices: readonly AllocatedSlice[]): Map<DayKey, Map<string, Paise>> {
  const out = new Map<DayKey, Map<string, Paise>>();
  for (const s of slices) {
    let byFlock = out.get(s.day);
    if (!byFlock) out.set(s.day, (byFlock = new Map()));
    byFlock.set(s.flockId, (byFlock.get(s.flockId) ?? 0) + s.amount);
  }
  return out;
}
