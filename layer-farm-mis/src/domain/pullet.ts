/**
 * Rearing cost and the pullet charge (open decision 7).
 *
 * A flock reared from chick eats for four months before it lays a single egg.
 * Expensing that as it happens would show catastrophic losses every rearing
 * week and fictitious profits every laying week, and the owner would learn
 * nothing from either. So rearing cost is capitalised into one pullet cost and
 * released a day at a time across the laying life, net of what the spent hens
 * are expected to fetch at the end.
 *
 * A bought point-of-lay pullet works the same way; its pullet cost is simply
 * what was paid for it.
 */

import { distribute, type Paise } from './money';
import { addDays, eachDay, type DayKey } from './dates';

export interface RearingComponents {
  chicksOrPullets: Paise;
  feed: Paise;
  medicinesAndVaccines: Paise;
  allocatedOverhead: Paise;
  other: Paise;
}

export const NO_REARING: RearingComponents = {
  chicksOrPullets: 0, feed: 0, medicinesAndVaccines: 0, allocatedOverhead: 0, other: 0,
};

/** Everything spent getting the flock to point of lay. */
export const pulletCost = (c: RearingComponents): Paise =>
  c.chicksOrPullets + c.feed + c.medicinesAndVaccines + c.allocatedOverhead + c.other;

export interface PulletSchedule {
  /** Capitalised cost of the flock at point of lay. */
  cost: Paise;
  /** Estimated cull value, trued up when the flock closes. */
  expectedSpentHenValue: Paise;
  /** First laying day. */
  layFrom: DayKey;
  /** For example 80 weeks = 560 days. */
  layingLifeDays: number;
}

/** Amount to be released over the laying life: cost net of residual value. */
export const amountToRelease = (s: PulletSchedule): Paise =>
  s.cost - s.expectedSpentHenValue;

/**
 * The daily charge, day by day.
 *
 * `distribute` rather than a division, so that the charges summed over the
 * whole laying life equal the capitalised amount exactly — a flock must not
 * finish its life still carrying 37 paise of unreleased pullet cost.
 */
export function pulletChargeSchedule(s: PulletSchedule): Map<DayKey, Paise> {
  const out = new Map<DayKey, Paise>();
  if (s.layingLifeDays <= 0) return out;
  const days = eachDay(s.layFrom, addDays(s.layFrom, s.layingLifeDays - 1));
  const parts = distribute(amountToRelease(s), new Array<number>(days.length).fill(1));
  days.forEach((d, i) => out.set(d, parts[i]!));
  return out;
}

/** Charge for one day; zero outside the laying life. */
export function pulletChargeOn(s: PulletSchedule, day: DayKey): Paise {
  if (s.layingLifeDays <= 0) return 0;
  const last = addDays(s.layFrom, s.layingLifeDays - 1);
  if (day < s.layFrom || day > last) return 0;
  return pulletChargeSchedule(s).get(day) ?? 0;
}

/**
 * What the flock still carries after `through`.
 *
 * When a flock is sold early this is the unreleased balance, which the closing
 * true-up writes off against the actual spent-hen receipt.
 */
export function unreleased(s: PulletSchedule, through: DayKey): Paise {
  let released = 0;
  for (const [day, amount] of pulletChargeSchedule(s)) {
    if (day <= through) released += amount;
  }
  return amountToRelease(s) - released;
}

/**
 * Closing true-up.
 *
 * Positive means the flock did better than the estimate and the last day gets
 * a credit; negative means a write-off.
 */
export function spentHenTrueUp(s: PulletSchedule, actualReceipt: Paise, through: DayKey): Paise {
  return actualReceipt - s.expectedSpentHenValue - unreleased(s, through);
}
