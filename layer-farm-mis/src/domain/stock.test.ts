import { describe, expect, it } from 'vitest';
import {
  avgCost, avgCostPerKg, countTo, emptyPool, farmLocation, getPool, issue,
  receive, runStock, shedLocation, type Movement,
} from './stock';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('a stock pool', () => {
  it('keeps a weighted average across purchases at different prices', () => {
    // 5 tonnes at ₹26/kg, then 5 tonnes at ₹30/kg → ₹28/kg.
    let pool = emptyPool();
    pool = receive(pool, 5_000_000, 26_00 * 5_000);
    pool = receive(pool, 5_000_000, 30_00 * 5_000);
    expect(pool.qty).toBe(10_000_000);
    expect(avgCostPerKg(pool)).toBe(28_00);
  });

  it('takes value out in proportion to what was issued', () => {
    let pool = receive(emptyPool(), 10_000_000, 28_00 * 10_000);
    const out = issue(pool, 1_000_000); // 1 tonne
    expect(out.cost).toBe(28_00 * 1_000);
    expect(out.short).toBe(0);
    pool = out.pool;
    expect(pool.qty).toBe(9_000_000);
    expect(avgCostPerKg(pool)).toBe(28_00); // issuing does not move the average
  });

  it('empties to exactly zero value when the last of it goes out', () => {
    const pool = receive(emptyPool(), 3, 100); // 100 paise across 3 units: not divisible
    const out = issue(pool, 3);
    expect(out.cost).toBe(100);
    expect(out.pool.value).toBe(0);
    expect(out.pool.qty).toBe(0);
  });

  it('remembers its rate after emptying, so the next issue is not free', () => {
    let pool = receive(emptyPool(), 1_000_000, 28_00 * 1_000);
    pool = issue(pool, 1_000_000).pool;
    expect(avgCostPerKg(pool)).toBe(28_00);
  });

  it('allows an over-issue but reports the shortfall', () => {
    const pool = receive(emptyPool(), 1_000, 1_000);
    const out = issue(pool, 1_500);
    expect(out.short).toBe(500);
    expect(out.pool.qty).toBe(0);
    expect(out.cost).toBe(1_500); // 1,000 held + 500 at the last known rate
  });

  it('lets a physical count win without inventing profit', () => {
    const pool = receive(emptyPool(), 10_000, 30_000); // 3 paise per unit
    const down = countTo(pool, 9_000);
    expect(down.delta).toBe(-1_000);
    expect(down.pool.qty).toBe(9_000);
    expect(avgCost(down.pool)).toBe(3);
    const up = countTo(pool, 11_000);
    expect(up.delta).toBe(1_000);
    expect(avgCost(up.pool)).toBe(3);
  });
});

describe('runStock', () => {
  const farm = farmLocation('F1');
  const shed = shedLocation('S1');

  it('applies movements in farm-day order, not insertion order', () => {
    // The issue is recorded before the purchase it depends on, as happens when
    // two phones sync out of order. Day and seq must still decide.
    const movements: Movement[] = [
      { day: '2026-03-02', seq: 2, location: farm, itemId: 'maize', kind: 'issue', qty: 1_000_000, ref: 'batch-1' },
      { day: '2026-03-01', seq: 1, location: farm, itemId: 'maize', kind: 'receive', qty: 5_000_000, valuePaise: 26_00 * 5_000 },
      { day: '2026-03-02', seq: 1, location: farm, itemId: 'maize', kind: 'receive', qty: 5_000_000, valuePaise: 30_00 * 5_000 },
    ];
    const state = runStock(movements);
    // Both purchases land before the issue → average ₹28/kg.
    expect(state.costs).toHaveLength(1);
    expect(state.costs[0]!.cost).toBe(28_00 * 1_000);
    expect(getPool(state, farm, 'maize').qty).toBe(9_000_000);
  });

  it('carries cost from the farm store to the shed and on to the flock', () => {
    const movements: Movement[] = [
      { day: '2026-03-01', seq: 1, location: farm, itemId: 'layer-feed', kind: 'receive', qty: 10_000_000, valuePaise: 28_00 * 10_000 },
      { day: '2026-03-01', seq: 2, location: farm, itemId: 'layer-feed', kind: 'issue', qty: 2_000_000, ref: 'issue-1' },
      { day: '2026-03-01', seq: 3, location: shed, itemId: 'layer-feed', kind: 'receive', qty: 2_000_000, valuePaise: 28_00 * 2_000 },
      { day: '2026-03-02', seq: 1, location: shed, itemId: 'layer-feed', kind: 'issue', qty: 1_100_000, ref: 'daily-1', flockId: 'L1' },
    ];
    const state = runStock(movements);
    const used = state.costs.find((c) => c.ref === 'daily-1')!;
    expect(used.cost).toBe(28_00 * 1_100); // 1,100 kg at ₹28
    expect(used.flockId).toBe('L1');
    expect(getPool(state, shed, 'layer-feed').qty).toBe(900_000);
    expect(getPool(state, farm, 'layer-feed').qty).toBe(8_000_000);
  });

  it('keeps every item and location in its own pool', () => {
    const state = runStock([
      { day: '2026-03-01', seq: 1, location: farm, itemId: 'maize', kind: 'receive', qty: 1000, valuePaise: 100 },
      { day: '2026-03-01', seq: 2, location: farm, itemId: 'soya', kind: 'receive', qty: 1000, valuePaise: 900 },
      { day: '2026-03-01', seq: 3, location: shed, itemId: 'maize', kind: 'receive', qty: 50, valuePaise: 5 },
    ]);
    expect(getPool(state, farm, 'maize').value).toBe(100);
    expect(getPool(state, farm, 'soya').value).toBe(900);
    expect(getPool(state, shed, 'maize').qty).toBe(50);
  });

  it('conserves value across 2,000 random receipt-and-issue histories', () => {
    const rand = rng(7);
    for (let run = 0; run < 2_000; run++) {
      const movements: Movement[] = [];
      let received = 0;
      let seq = 0;
      let held = 0;
      for (let i = 0; i < 12; i++) {
        seq++;
        // Only issue what is genuinely there, so no shortfall value is invented.
        if (held > 0 && rand() < 0.45) {
          const qty = 1 + Math.floor(rand() * held);
          held -= qty;
          movements.push({ day: '2026-03-01', seq, location: farm, itemId: 'x', kind: 'issue', qty, ref: `i${i}` });
        } else {
          const qty = 1 + Math.floor(rand() * 100_000);
          const value = Math.floor(rand() * 1_000_000);
          held += qty;
          received += value;
          movements.push({ day: '2026-03-01', seq, location: farm, itemId: 'x', kind: 'receive', qty, valuePaise: value });
        }
      }
      const state = runStock(movements);
      const issued = state.costs.reduce((s, c) => s + c.cost, 0);
      const remaining = getPool(state, farm, 'x').value;
      expect(issued + remaining).toBe(received);
      expect(remaining).toBeGreaterThanOrEqual(0);
    }
  });
});
