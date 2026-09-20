/**
 * Production measures.
 *
 * These are the standard layer-farm formulas, written once so the dashboard,
 * the alert engine and the flock report can never disagree about what
 * "hen-day %" meant on a given day.
 *
 * Every ratio returns `null` rather than NaN or Infinity when its denominator
 * is zero. An empty shed has no hen-day percentage — it does not have a
 * hen-day percentage of zero, and showing "0%" for a shed awaiting placement
 * would trip the production-drop alert every morning.
 */

export interface BirdMovements {
  died: number;
  culled: number;
  sold: number;
  transferredOut: number;
  transferredIn: number;
}

export const NO_MOVEMENT: BirdMovements = {
  died: 0, culled: 0, sold: 0, transferredOut: 0, transferredIn: 0,
};

/** Live birds = placed − died − culled − sold − out + in. Never below zero. */
export function liveBirds(placed: number, m: Partial<BirdMovements>): number {
  const mv = { ...NO_MOVEMENT, ...m };
  return Math.max(0, placed - mv.died - mv.culled - mv.sold - mv.transferredOut + mv.transferredIn);
}

export interface EggCount {
  /** Eggs weighing 50 g and above. */
  gradeA: number;
  /** Eggs under 50 g. */
  gradeB: number;
  /** Broken or cracked, counted separately (open decision 5). */
  broken: number;
}

export const NO_EGGS: EggCount = { gradeA: 0, gradeB: 0, broken: 0 };

/** Total eggs the birds actually laid — both grades plus broken. */
export const totalEggs = (e: EggCount): number => e.gradeA + e.gradeB + e.broken;

/** Eggs that can be sold — broken ones cannot. */
export const sellableEggs = (e: EggCount): number => e.gradeA + e.gradeB;

export const addEggs = (a: EggCount, b: EggCount): EggCount => ({
  gradeA: a.gradeA + b.gradeA,
  gradeB: a.gradeB + b.gradeB,
  broken: a.broken + b.broken,
});

export const sumEggs = (list: readonly EggCount[]): EggCount => list.reduce(addEggs, NO_EGGS);

/**
 * Hen-day % — eggs produced against the birds alive at the start of the day.
 *
 * Broken eggs count: the hen laid them. Excluding them would make a
 * collection accident look like a production collapse.
 */
export function henDayPercent(eggs: EggCount, liveAtStartOfDay: number): number | null {
  if (liveAtStartOfDay <= 0) return null;
  return (totalEggs(eggs) / liveAtStartOfDay) * 100;
}

export function mortalityPercent(died: number, liveAtStartOfPeriod: number): number | null {
  if (liveAtStartOfPeriod <= 0) return null;
  return (died / liveAtStartOfPeriod) * 100;
}

/** Grams of feed per bird per day — the number a farmer judges a shed by. */
export function feedPerBirdPerDayGrams(feedGrams: number, live: number): number | null {
  if (live <= 0) return null;
  return feedGrams / live;
}

/**
 * Feed per dozen eggs, in kg.
 *
 * Stands in for FCR: with only two weight classes there is no egg mass to
 * divide by, so the requirements call for feed per dozen instead.
 */
export function feedPerDozenKg(feedGrams: number, eggs: number): number | null {
  if (eggs <= 0) return null;
  return feedGrams / 1000 / (eggs / 12);
}

/** Share of the day's eggs that were under 50 g — a flock-age signal. */
export function smallEggShare(eggs: EggCount): number | null {
  const sellable = sellableEggs(eggs);
  if (sellable <= 0) return null;
  return (eggs.gradeB / sellable) * 100;
}

/** Share of the day's eggs that broke — a handling signal. */
export function breakageShare(eggs: EggCount): number | null {
  const total = totalEggs(eggs);
  if (total <= 0) return null;
  return (eggs.broken / total) * 100;
}

/**
 * Days of feed left = stock ÷ average daily use.
 *
 * `null` when the farm has not used feed yet (no denominator), which the
 * dashboard shows as "—" rather than as infinite cover.
 */
export function daysOfCover(stockGrams: number, avgDailyGrams: number): number | null {
  if (avgDailyGrams <= 0) return null;
  return stockGrams / avgDailyGrams;
}
