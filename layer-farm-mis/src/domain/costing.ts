/**
 * Revenue, cost and the per-day P&L.
 *
 * Revenue is recognised on production, not on dispatch (open decision 8).
 * Sales are lumpy — a trader's lorry comes on Tuesday and Friday — so booking
 * revenue on dispatch days would give the owner a P&L that swings wildly for
 * reasons that have nothing to do with how the farm ran that day. Instead the
 * eggs laid today are valued at today's rate, and the difference against what
 * the eggs actually fetched is reported as a true-up rather than hidden.
 *
 * Cost is the four parts the requirements name: the feed the birds ate, the
 * medicine issued to them, their share of the farm's expenses, and the slice
 * of their own rearing cost that today used up.
 */

import { mulDiv, type Paise } from './money';
import { sellableEggs, totalEggs, type EggCount } from './production';
import type { DayKey } from './dates';

/* ------------------------------------------------------------------ rates */

export interface RateCard {
  /** NECC zone rate per 100 eggs, in paise. */
  zoneRatePer100: Paise;
  /** Farm-gate adjustment per 100 eggs; negative when the farm sells below zone. */
  farmGateAdjust: Paise;
  /** How much less an under-50 g egg fetches, per 100 eggs. */
  smallEggGap: Paise;
}

export const DEFAULT_RATE: RateCard = { zoneRatePer100: 0, farmGateAdjust: 0, smallEggGap: 0 };

export type Grade = 'A' | 'B';

/** Realised rate per 100 eggs for a grade. Never negative. */
export function ratePer100(card: RateCard, grade: Grade): Paise {
  const base = card.zoneRatePer100 + card.farmGateAdjust;
  return Math.max(0, grade === 'A' ? base : base - card.smallEggGap);
}

/** Value of a quantity of one grade. */
export const gradeValue = (eggs: number, card: RateCard, grade: Grade): Paise =>
  mulDiv(eggs, ratePer100(card, grade), 100);

/**
 * Value of a day's lay.
 *
 * Broken eggs earn nothing — they count towards hen-day % because the bird
 * laid them, but nobody buys them.
 */
export function eggRevenue(eggs: EggCount, card: RateCard): Paise {
  return gradeValue(eggs.gradeA, card, 'A') + gradeValue(eggs.gradeB, card, 'B');
}

/* ------------------------------------------------------------------- cost */

export interface CostParts {
  /** Feed drawn from the shed's pool, at the shed's average cost. */
  feed: Paise;
  /** Medicines and vaccines issued to this flock. */
  medicine: Paise;
  /** This flock's share of farm expenses covering this day. */
  overhead: Paise;
  /** Today's release of the capitalised pullet cost. */
  pullet: Paise;
}

export const NO_COST: CostParts = { feed: 0, medicine: 0, overhead: 0, pullet: 0 };

export const totalCost = (c: CostParts): Paise => c.feed + c.medicine + c.overhead + c.pullet;

export const addCost = (a: CostParts, b: CostParts): CostParts => ({
  feed: a.feed + b.feed,
  medicine: a.medicine + b.medicine,
  overhead: a.overhead + b.overhead,
  pullet: a.pullet + b.pullet,
});

export const sumCost = (list: readonly CostParts[]): CostParts => list.reduce(addCost, NO_COST);

/* ---------------------------------------------------------------- one day */

export interface FlockDayInput {
  day: DayKey;
  flockId: string;
  liveAtStart: number;
  eggs: EggCount;
  feedGrams: number;
  cost: CostParts;
  /** Spent hens, manure, empty bags, trays — booked on the day recorded. */
  otherIncome: Paise;
  rate: RateCard;
}

export interface FlockDayResult {
  day: DayKey;
  flockId: string;
  liveAtStart: number;
  eggs: EggCount;
  feedGrams: number;
  revenue: { eggs: Paise; other: Paise; total: Paise };
  cost: CostParts;
  costTotal: Paise;
  profit: Paise;
  /** Paise per egg produced; null on a day with no lay. */
  costPerEgg: number | null;
  /** Paise per egg of realised margin; null on a day with no lay. */
  marginPerEgg: number | null;
}

export function flockDay(input: FlockDayInput): FlockDayResult {
  const eggs = eggRevenue(input.eggs, input.rate);
  const revenueTotal = eggs + input.otherIncome;
  const costTotal = totalCost(input.cost);
  const produced = totalEggs(input.eggs);

  return {
    day: input.day,
    flockId: input.flockId,
    liveAtStart: input.liveAtStart,
    eggs: input.eggs,
    feedGrams: input.feedGrams,
    revenue: { eggs, other: input.otherIncome, total: revenueTotal },
    cost: input.cost,
    costTotal,
    profit: revenueTotal - costTotal,
    costPerEgg: produced > 0 ? costTotal / produced : null,
    marginPerEgg: produced > 0 ? (revenueTotal - costTotal) / produced : null,
  };
}

/** Add up any set of daily results — a farm's day, a flock's life, a month. */
export function rollUp(days: readonly FlockDayResult[]): Omit<FlockDayResult, 'day' | 'flockId' | 'liveAtStart'> {
  const eggs = days.reduce<EggCount>(
    (a, d) => ({ gradeA: a.gradeA + d.eggs.gradeA, gradeB: a.gradeB + d.eggs.gradeB, broken: a.broken + d.eggs.broken }),
    { gradeA: 0, gradeB: 0, broken: 0 },
  );
  const cost = sumCost(days.map((d) => d.cost));
  const revenueEggs = days.reduce((s, d) => s + d.revenue.eggs, 0);
  const revenueOther = days.reduce((s, d) => s + d.revenue.other, 0);
  const costTotal = totalCost(cost);
  const produced = totalEggs(eggs);
  const revenueTotal = revenueEggs + revenueOther;

  return {
    eggs,
    feedGrams: days.reduce((s, d) => s + d.feedGrams, 0),
    revenue: { eggs: revenueEggs, other: revenueOther, total: revenueTotal },
    cost,
    costTotal,
    profit: revenueTotal - costTotal,
    costPerEgg: produced > 0 ? costTotal / produced : null,
    marginPerEgg: produced > 0 ? (revenueTotal - costTotal) / produced : null,
  };
}

/* --------------------------------------------------------------- true-up */

export interface SalesTrueUp {
  valued: Paise;
  invoiced: Paise;
  /** Positive when the eggs fetched more than the rate card said they would. */
  difference: Paise;
  /** Difference as a share of the valued amount; null when nothing was valued. */
  percent: number | null;
}

/**
 * Production valued at rate against what dispatches actually invoiced.
 *
 * This is the honesty check on decision 8: if the true-up drifts, the farm's
 * rate card is wrong and the daily P&L has been quietly lying.
 */
export function salesTrueUp(valued: Paise, invoiced: Paise): SalesTrueUp {
  return {
    valued,
    invoiced,
    difference: invoiced - valued,
    percent: valued !== 0 ? ((invoiced - valued) / Math.abs(valued)) * 100 : null,
  };
}

/** Value of an egg dispatch line, by grade, at an agreed rate per 100. */
export const dispatchValue = (eggs: number, ratePer100Paise: Paise): Paise =>
  mulDiv(eggs, ratePer100Paise, 100);

/* ---------------------------------------------------- egg reconciliation */

export interface EggReconciliation {
  opening: number;
  collected: number;
  dispatched: number;
  broken: number;
  /** What the books say should be on hand. */
  expected: number;
  /** What was counted, when a count was done. */
  counted: number | null;
  /** counted − expected; positive means more eggs than the books expected. */
  difference: number | null;
}

/**
 * Eggs collected must equal eggs sold, plus eggs in stock, plus broken.
 *
 * Broken eggs are removed from sellable stock here even though they counted
 * towards production, which is exactly the gap this check exists to catch.
 */
export function reconcileEggs(input: {
  opening: number;
  collected: EggCount;
  dispatched: number;
  counted?: number | null;
}): EggReconciliation {
  const collected = sellableEggs(input.collected);
  const expected = input.opening + collected - input.dispatched;
  const counted = input.counted ?? null;
  return {
    opening: input.opening,
    collected,
    dispatched: input.dispatched,
    broken: input.collected.broken,
    expected,
    counted,
    difference: counted === null ? null : counted - expected,
  };
}
