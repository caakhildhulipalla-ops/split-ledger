import { describe, expect, it } from 'vitest';
import {
  breakageShare, daysOfCover, feedPerBirdPerDayGrams, feedPerDozenKg, henDayPercent,
  liveBirds, mortalityPercent, sellableEggs, smallEggShare, sumEggs, totalEggs,
} from './production';

const eggs = (gradeA: number, gradeB: number, broken = 0) => ({ gradeA, gradeB, broken });

describe('liveBirds', () => {
  it('nets every movement off the placement', () => {
    expect(liveBirds(10_000, { died: 120, culled: 30, sold: 0, transferredOut: 0, transferredIn: 0 })).toBe(9_850);
    expect(liveBirds(10_000, { transferredIn: 500 })).toBe(10_500);
  });
  it('never goes negative, however the numbers were entered', () => {
    expect(liveBirds(100, { died: 500 })).toBe(0);
  });
});

describe('henDayPercent', () => {
  it('counts both grades and the broken ones', () => {
    // 8,500 of 10,000 birds laid, 100 of them broken.
    expect(henDayPercent(eggs(7_000, 1_400, 100), 10_000)).toBeCloseTo(85, 10);
  });
  it('is null, not zero, for a shed with no birds', () => {
    expect(henDayPercent(eggs(0, 0), 0)).toBeNull();
  });
  it('can exceed 100 when a session straddles midnight', () => {
    expect(henDayPercent(eggs(10_100, 0), 10_000)).toBeCloseTo(101, 10);
  });
});

describe('mortalityPercent', () => {
  it('measures against the birds alive at the start', () => {
    expect(mortalityPercent(25, 10_000)).toBeCloseTo(0.25, 10);
  });
  it('is null for an empty shed', () => {
    expect(mortalityPercent(0, 0)).toBeNull();
  });
});

describe('feed measures', () => {
  it('reports grams per bird per day', () => {
    // 1,100 kg across 10,000 birds = 110 g each.
    expect(feedPerBirdPerDayGrams(1_100_000, 10_000)).toBe(110);
  });
  it('reports feed per dozen eggs in kg', () => {
    // 1,100 kg for 8,400 eggs = 700 dozen → 1.571 kg per dozen.
    expect(feedPerDozenKg(1_100_000, 8_400)).toBeCloseTo(1.5714, 4);
  });
  it('is null when there is nothing to divide by', () => {
    expect(feedPerBirdPerDayGrams(1000, 0)).toBeNull();
    expect(feedPerDozenKg(1000, 0)).toBeNull();
  });
});

describe('daysOfCover', () => {
  it('divides stock by average daily use', () => {
    expect(daysOfCover(11_000_000, 1_100_000)).toBe(10);
  });
  it('is null rather than infinite when nothing has been used', () => {
    expect(daysOfCover(11_000_000, 0)).toBeNull();
  });
});

describe('egg arithmetic', () => {
  it('separates what was laid from what can be sold', () => {
    const e = eggs(7_000, 1_400, 100);
    expect(totalEggs(e)).toBe(8_500);
    expect(sellableEggs(e)).toBe(8_400);
  });
  it('sums a farm from its sheds', () => {
    expect(sumEggs([eggs(1, 2, 3), eggs(10, 20, 30)])).toEqual(eggs(11, 22, 33));
    expect(sumEggs([])).toEqual(eggs(0, 0, 0));
  });
  it('reports the small-egg and breakage shares', () => {
    expect(smallEggShare(eggs(9_000, 1_000))).toBeCloseTo(10, 10);
    expect(breakageShare(eggs(9_900, 0, 100))).toBeCloseTo(1, 10);
    expect(smallEggShare(eggs(0, 0))).toBeNull();
  });
});
