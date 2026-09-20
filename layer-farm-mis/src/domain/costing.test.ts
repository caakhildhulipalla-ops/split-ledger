import { describe, expect, it } from 'vitest';
import {
  dispatchValue, eggRevenue, flockDay, ratePer100, reconcileEggs, rollUp, salesTrueUp,
  totalCost, type CostParts, type RateCard,
} from './costing';

const rate: RateCard = {
  zoneRatePer100: 545_00,   // NECC zone ₹5.45 per egg
  farmGateAdjust: -15_00,   // farm sells 15 paise under zone
  smallEggGap: 60_00,       // under-50 g eggs fetch 60 paise less per egg
};

const eggs = (gradeA: number, gradeB: number, broken = 0) => ({ gradeA, gradeB, broken });

describe('rates', () => {
  it('applies the farm-gate adjustment to the zone rate', () => {
    expect(ratePer100(rate, 'A')).toBe(530_00);
  });
  it('takes the price gap off small eggs', () => {
    expect(ratePer100(rate, 'B')).toBe(470_00);
  });
  it('never goes below zero, however the adjustments are set', () => {
    expect(ratePer100({ zoneRatePer100: 100, farmGateAdjust: -500, smallEggGap: 0 }, 'A')).toBe(0);
  });
});

describe('eggRevenue', () => {
  it('values each grade at its own rate', () => {
    // 7,000 at ₹5.30 + 1,400 at ₹4.70
    expect(eggRevenue(eggs(7_000, 1_400), rate)).toBe(37_100_00 + 6_580_00);
  });
  it('pays nothing for broken eggs', () => {
    expect(eggRevenue(eggs(0, 0, 5_000), rate)).toBe(0);
  });
  it('is exact for counts that do not divide by 100', () => {
    expect(eggRevenue(eggs(8_133, 0), rate)).toBe(Math.round(8_133 * 530_00 / 100));
  });
});

describe('flockDay', () => {
  const cost: CostParts = { feed: 30_800_00, medicine: 400_00, overhead: 2_100_00, pullet: 3_928_00 };

  it('nets revenue against every part of the cost', () => {
    const day = flockDay({
      day: '2026-03-15', flockId: 'L1', liveAtStart: 10_000,
      eggs: eggs(7_000, 1_400, 100), feedGrams: 1_100_000,
      cost, otherIncome: 500_00, rate,
    });
    expect(day.revenue.eggs).toBe(43_680_00);
    expect(day.revenue.total).toBe(44_180_00);
    expect(day.costTotal).toBe(totalCost(cost));
    expect(day.profit).toBe(44_180_00 - totalCost(cost));
  });

  it('divides cost by every egg laid, broken ones included', () => {
    const day = flockDay({
      day: '2026-03-15', flockId: 'L1', liveAtStart: 10_000,
      eggs: eggs(7_000, 1_400, 100), feedGrams: 1_100_000,
      cost, otherIncome: 0, rate,
    });
    expect(day.costPerEgg).toBeCloseTo(totalCost(cost) / 8_500, 6);
  });

  it('reports null rather than dividing by a day with no lay', () => {
    const day = flockDay({
      day: '2026-03-15', flockId: 'L1', liveAtStart: 10_000,
      eggs: eggs(0, 0), feedGrams: 1_100_000,
      cost, otherIncome: 0, rate,
    });
    expect(day.costPerEgg).toBeNull();
    expect(day.marginPerEgg).toBeNull();
    expect(day.profit).toBe(-totalCost(cost));
  });
});

describe('rollUp', () => {
  it('adds days into a period without re-deriving the ratios wrongly', () => {
    const base = {
      flockId: 'L1', liveAtStart: 10_000, feedGrams: 1_100_000,
      cost: { feed: 100, medicine: 10, overhead: 5, pullet: 1 } satisfies CostParts,
      otherIncome: 0, rate,
    };
    const days = [
      flockDay({ ...base, day: '2026-03-01', eggs: eggs(1_000, 0) }),
      flockDay({ ...base, day: '2026-03-02', eggs: eggs(2_000, 0, 50) }),
    ];
    const period = rollUp(days);
    expect(period.eggs).toEqual({ gradeA: 3_000, gradeB: 0, broken: 50 });
    expect(period.cost.feed).toBe(200);
    expect(period.costTotal).toBe(232);
    expect(period.feedGrams).toBe(2_200_000);
    // Cost per egg over the period, not the average of the daily figures.
    expect(period.costPerEgg).toBeCloseTo(232 / 3_050, 8);
  });

  it('handles an empty period', () => {
    const period = rollUp([]);
    expect(period.costTotal).toBe(0);
    expect(period.costPerEgg).toBeNull();
  });
});

describe('salesTrueUp', () => {
  it('reports what the eggs actually fetched against what they were valued at', () => {
    const t = salesTrueUp(10_00_000, 10_20_000);
    expect(t.difference).toBe(20_000);
    expect(t.percent).toBeCloseTo(2, 10);
  });
  it('is null-percent when nothing was valued', () => {
    expect(salesTrueUp(0, 500).percent).toBeNull();
  });
});

describe('dispatchValue', () => {
  it('prices a lorry load at the agreed rate per 100', () => {
    expect(dispatchValue(18_300, 530_00)).toBe(Math.round(18_300 * 530_00 / 100));
  });
});

describe('reconcileEggs', () => {
  it('ties collections to dispatches and stock', () => {
    const r = reconcileEggs({
      opening: 5_000,
      collected: eggs(7_000, 1_400, 100),
      dispatched: 10_000,
      counted: 3_400,
    });
    expect(r.collected).toBe(8_400);   // broken excluded from sellable
    expect(r.expected).toBe(3_400);
    expect(r.difference).toBe(0);
  });

  it('shows the gap when the count disagrees with the books', () => {
    const r = reconcileEggs({
      opening: 5_000, collected: eggs(7_000, 1_400, 100), dispatched: 10_000, counted: 3_100,
    });
    expect(r.difference).toBe(-300);
  });

  it('reports no difference when nobody counted', () => {
    const r = reconcileEggs({ opening: 0, collected: eggs(100, 0), dispatched: 0 });
    expect(r.counted).toBeNull();
    expect(r.difference).toBeNull();
  });
});
