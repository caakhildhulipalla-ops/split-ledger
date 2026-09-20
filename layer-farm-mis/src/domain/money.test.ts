import { describe, expect, it } from 'vitest';
import { distribute, divideEvenly, formatRupees, formatRupeesShort, mulDiv, parseRupees } from './money';

/** Deterministic PRNG so a failure is always reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('distribute', () => {
  it('splits proportionally when it divides cleanly', () => {
    expect(distribute(1000, [1, 1, 1, 1])).toEqual([250, 250, 250, 250]);
    expect(distribute(900, [1, 2])).toEqual([300, 600]);
  });

  it('hands leftover paise to the largest remainders, earliest index first', () => {
    // 100 across three ways: 33.33 each, one paisa left over.
    expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33]);
    // 10 across [1,1,1,1,1,1,1]: 1 each, 3 left.
    expect(distribute(10, [1, 1, 1, 1, 1, 1, 1])).toEqual([2, 2, 2, 1, 1, 1, 1]);
  });

  it('weights by live birds the way the allocation rule requires', () => {
    // An ₹8,000 bill across sheds of 4,000 / 3,000 / 2,500 birds.
    const parts = distribute(800_000, [4000, 3000, 2500]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(800_000);
    expect(parts[0]).toBeGreaterThan(parts[1]!);
    expect(parts[1]).toBeGreaterThan(parts[2]!);
  });

  it('falls back to an even split when every weight is zero', () => {
    expect(distribute(100, [0, 0, 0, 0])).toEqual([25, 25, 25, 25]);
  });

  it('gives zero-weight entries nothing when others have weight', () => {
    expect(distribute(1000, [0, 5, 0])).toEqual([0, 1000, 0]);
  });

  it('handles negative totals without losing a paisa', () => {
    const parts = distribute(-100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-100);
  });

  it('returns nothing for no parts, and everything for one', () => {
    expect(distribute(500, [])).toEqual([]);
    expect(distribute(500, [7])).toEqual([500]);
  });

  it('is exact across 20,000 random allocations', () => {
    const rand = rng(20260920);
    for (let i = 0; i < 20_000; i++) {
      const n = 1 + Math.floor(rand() * 12);
      const total = Math.floor((rand() - 0.3) * 50_000_000);
      const weights = Array.from({ length: n }, () =>
        rand() < 0.15 ? 0 : Math.floor(rand() * 500_000),
      );
      const parts = distribute(total, weights);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      // No part may exceed the total's magnitude, nor flip sign.
      for (const p of parts) {
        expect(Math.abs(p)).toBeLessThanOrEqual(Math.abs(total));
        if (total >= 0) expect(p).toBeGreaterThanOrEqual(0);
        else expect(p).toBeLessThanOrEqual(0);
      }
    }
  });

  it('is stable: the same inputs always give the same answer', () => {
    const a = distribute(1_234_567, [17, 17, 17, 1]);
    const b = distribute(1_234_567, [17, 17, 17, 1]);
    expect(a).toEqual(b);
  });

  it('survives amounts larger than 2^53 would allow through float maths', () => {
    // ₹50 crore across 5,00,000 birds — the product overflows a double.
    const parts = distribute(500_00_00_000 * 100, [500_000, 499_999]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(500_00_00_000 * 100);
  });
});

describe('divideEvenly', () => {
  it('sums back to the total', () => {
    for (const n of [1, 2, 3, 7, 30, 31, 365, 560]) {
      const parts = divideEvenly(1_000_003, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_003);
    }
  });
});

describe('mulDiv', () => {
  it('rounds half away from zero', () => {
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(-5, 1, 2)).toBe(-3);
    expect(mulDiv(4, 1, 2)).toBe(2);
  });
  it('is exact where floating point is not', () => {
    // 0.1 + 0.2 territory: 8,133 eggs at ₹5.42 per egg.
    expect(mulDiv(8133, 542, 100)).toBe(44_081);
  });
  it('returns zero rather than dividing by zero', () => {
    expect(mulDiv(100, 1, 0)).toBe(0);
  });
});

describe('parseRupees', () => {
  it('reads what a person types', () => {
    expect(parseRupees('1240.50')).toBe(124_050);
    expect(parseRupees('₹1,240.5')).toBe(124_050);
    expect(parseRupees('1240')).toBe(124_000);
    expect(parseRupees('.5')).toBe(50);
    expect(parseRupees('-12.34')).toBe(-1234);
  });
  it('truncates beyond paise rather than rounding into one', () => {
    expect(parseRupees('1.999')).toBe(199);
  });
  it('rejects nonsense', () => {
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('1.2.3')).toBeNull();
  });
});

describe('formatting', () => {
  it('groups rupees the Indian way', () => {
    expect(formatRupees(1_24_05_050)).toBe('₹1,24,050.50');
    expect(formatRupees(100)).toBe('₹1.00');
    expect(formatRupees(-100)).toBe('−₹1.00');
    expect(formatRupees(123_456, { paise: false })).toBe('₹1,235');
  });
  it('abbreviates for dashboard tiles', () => {
    expect(formatRupeesShort(45_00_000_00)).toBe('₹45L');
    expect(formatRupeesShort(3_40_00_000_00)).toBe('₹3.4Cr');
    expect(formatRupeesShort(-1_50_000)).toBe('−₹1.5k');
  });
});
