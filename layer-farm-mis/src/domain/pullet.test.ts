import { describe, expect, it } from 'vitest';
import { amountToRelease, pulletChargeOn, pulletChargeSchedule, pulletCost, spentHenTrueUp, unreleased, type PulletSchedule } from './pullet';
import { addDays } from './dates';

const schedule: PulletSchedule = {
  // 10,000 pullets reared at ₹280 each.
  cost: 280_00 * 10_000,
  expectedSpentHenValue: 60_00 * 10_000,
  layFrom: '2026-01-01',
  layingLifeDays: 560, // 80 weeks
};

describe('pulletCost', () => {
  it('adds up everything spent getting to point of lay', () => {
    expect(pulletCost({
      chicksOrPullets: 45_00_000, feed: 1_80_00_000,
      medicinesAndVaccines: 12_00_000, allocatedOverhead: 20_00_000, other: 3_00_000,
    })).toBe(2_60_00_000);
  });
});

describe('pulletChargeSchedule', () => {
  it('releases exactly the cost net of spent-hen value, to the paisa', () => {
    const charges = pulletChargeSchedule(schedule);
    expect(charges.size).toBe(560);
    expect([...charges.values()].reduce((a, b) => a + b, 0)).toBe(amountToRelease(schedule));
    expect(amountToRelease(schedule)).toBe(220_00 * 10_000);
  });

  it('is exact for amounts that refuse to divide', () => {
    const odd: PulletSchedule = { ...schedule, cost: 1_00_00_001, expectedSpentHenValue: 7, layingLifeDays: 559 };
    const charges = pulletChargeSchedule(odd);
    expect([...charges.values()].reduce((a, b) => a + b, 0)).toBe(1_00_00_001 - 7);
  });

  it('charges nothing outside the laying life', () => {
    expect(pulletChargeOn(schedule, '2025-12-31')).toBe(0);
    expect(pulletChargeOn(schedule, '2026-01-01')).toBeGreaterThan(0);
    expect(pulletChargeOn(schedule, addDays('2026-01-01', 559))).toBeGreaterThan(0);
    expect(pulletChargeOn(schedule, addDays('2026-01-01', 560))).toBe(0);
  });

  it('is empty for a flock with no laying life set', () => {
    expect(pulletChargeSchedule({ ...schedule, layingLifeDays: 0 }).size).toBe(0);
  });
});

describe('unreleased', () => {
  it('is the whole amount the day before laying starts', () => {
    expect(unreleased(schedule, '2025-12-31')).toBe(amountToRelease(schedule));
  });
  it('is nothing once the laying life is over', () => {
    expect(unreleased(schedule, addDays('2026-01-01', 600))).toBe(0);
  });
  it('falls as the flock ages', () => {
    const early = unreleased(schedule, addDays('2026-01-01', 99));
    const late = unreleased(schedule, addDays('2026-01-01', 399));
    expect(late).toBeLessThan(early);
  });
});

describe('spentHenTrueUp', () => {
  it('is zero when the birds fetch exactly what was expected, at full term', () => {
    const through = addDays('2026-01-01', 559);
    expect(spentHenTrueUp(schedule, schedule.expectedSpentHenValue, through)).toBe(0);
  });

  it('is a credit when the birds beat the estimate', () => {
    const through = addDays('2026-01-01', 559);
    expect(spentHenTrueUp(schedule, 70_00 * 10_000, through)).toBe(10_00 * 10_000);
  });

  it('writes off what is still carried when a flock is sold early', () => {
    // Sold at day 280 of 560: roughly half the cost is still unreleased.
    const through = addDays('2026-01-01', 279);
    const trueUp = spentHenTrueUp(schedule, schedule.expectedSpentHenValue, through);
    expect(trueUp).toBeLessThan(0);
    expect(trueUp).toBeCloseTo(-amountToRelease(schedule) / 2, -3);
  });
});
