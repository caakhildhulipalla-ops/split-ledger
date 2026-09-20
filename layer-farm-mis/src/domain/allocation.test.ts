import { describe, expect, it } from 'vitest';
import { allocateByWeight, allocateExpenses, sliceIndex, spreadOverDays, type ExpenseToAllocate } from './allocation';
import { eachDay } from './dates';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('spreadOverDays', () => {
  it('spreads a bill across the days it covers', () => {
    const spread = spreadOverDays(30_000, '2026-06-01', '2026-06-30');
    expect(spread.size).toBe(30);
    expect([...spread.values()].reduce((a, b) => a + b, 0)).toBe(30_000);
    expect(spread.get('2026-06-15')).toBe(1_000);
  });

  it('loses nothing when the amount will not divide', () => {
    // ₹100 across 7 days: 14.28 each, 4 paise to place.
    const spread = spreadOverDays(10_000, '2026-06-01', '2026-06-07');
    expect([...spread.values()].reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it('treats a single-day expense as that day', () => {
    const spread = spreadOverDays(5_000, '2026-06-01', '2026-06-01');
    expect(spread.size).toBe(1);
    expect(spread.get('2026-06-01')).toBe(5_000);
  });

  it('gives back nothing when the period runs backwards', () => {
    expect(spreadOverDays(5_000, '2026-06-10', '2026-06-01').size).toBe(0);
  });
});

describe('allocateByWeight', () => {
  it('splits by live birds and sums back to the bill', () => {
    const parts = allocateByWeight(800_000, [
      { key: 'A', weight: 4_000 }, { key: 'B', weight: 3_000 }, { key: 'C', weight: 2_500 },
    ]);
    expect([...parts.values()].reduce((a, b) => a + b, 0)).toBe(800_000);
    expect(parts.get('A')!).toBeGreaterThan(parts.get('B')!);
  });

  it('adds up repeats of the same key rather than overwriting', () => {
    const parts = allocateByWeight(1_000, [
      { key: 'A', weight: 1 }, { key: 'A', weight: 1 }, { key: 'B', weight: 2 },
    ]);
    expect(parts.get('A')).toBe(500);
    expect(parts.get('B')).toBe(500);
  });
});

describe('allocateExpenses', () => {
  const liveByDay = new Map(
    eachDay('2026-06-01', '2026-06-30').map((day) => [
      day,
      new Map(
        day >= '2026-06-16'
          ? [['flock-old', 9_000], ['flock-new', 6_000]]   // second flock placed mid-month
          : [['flock-old', 9_000]],
      ),
    ]),
  );

  it('only charges a flock for the days it was alive', () => {
    const expenses: ExpenseToAllocate[] = [
      { id: 'e1', amount: 30_000_00, from: '2026-06-01', to: '2026-06-30' },
    ];
    const byDay = sliceIndex(allocateExpenses(expenses, liveByDay));

    expect(byDay.get('2026-06-10')!.get('flock-new')).toBeUndefined();
    expect(byDay.get('2026-06-10')!.get('flock-old')).toBe(1_00_000); // whole day's share

    const midMonth = byDay.get('2026-06-20')!;
    expect(midMonth.get('flock-old')! + midMonth.get('flock-new')!).toBe(1_00_000);
    expect(midMonth.get('flock-old')!).toBeGreaterThan(midMonth.get('flock-new')!);
  });

  it('never loses a paisa of the original bill', () => {
    const expenses: ExpenseToAllocate[] = [
      { id: 'e1', amount: 37_777_77, from: '2026-06-01', to: '2026-06-30' },
      { id: 'e2', amount: 1_23_456, from: '2026-06-16', to: '2026-06-16' },
    ];
    const slices = allocateExpenses(expenses, liveByDay);
    expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(37_777_77 + 1_23_456);
  });

  it('sends a flock-tagged expense straight to that flock', () => {
    const slices = allocateExpenses(
      [{ id: 'e1', amount: 10_000, from: '2026-06-20', to: '2026-06-20', flockId: 'flock-new' }],
      liveByDay,
    );
    expect(slices).toEqual([{ day: '2026-06-20', flockId: 'flock-new', expenseId: 'e1', amount: 10_000 }]);
  });

  it('confines a shed-tagged expense to that shed’s flocks', () => {
    const slices = allocateExpenses(
      [{ id: 'e1', amount: 10_000, from: '2026-06-20', to: '2026-06-20', shedId: 'shed-2' }],
      liveByDay,
      (shedId) => (shedId === 'shed-2' ? ['flock-new'] : []),
    );
    expect(slices).toEqual([{ day: '2026-06-20', flockId: 'flock-new', expenseId: 'e1', amount: 10_000 }]);
  });

  it('drops nothing on days with no birds at all, by having nowhere to put it', () => {
    // An expense covering a day before any placement has no flock to carry it.
    const slices = allocateExpenses(
      [{ id: 'e1', amount: 10_000, from: '2026-05-01', to: '2026-05-01' }],
      liveByDay,
    );
    expect(slices).toEqual([]);
  });

  it('conserves the total across 500 random expense sets', () => {
    const rand = rng(99);
    for (let run = 0; run < 500; run++) {
      const amount = Math.floor(rand() * 10_000_000);
      const start = 1 + Math.floor(rand() * 20);
      const len = Math.floor(rand() * 10);
      const from = `2026-06-${String(start).padStart(2, '0')}`;
      const to = `2026-06-${String(Math.min(30, start + len)).padStart(2, '0')}`;
      const slices = allocateExpenses([{ id: 'e', amount, from, to }], liveByDay);
      expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(amount);
    }
  });
});
