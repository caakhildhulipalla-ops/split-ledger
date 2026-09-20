import { describe, expect, it } from 'vitest';
import { DEFAULT_UNITS, formatQty, fromBase, parseScaled, toBase, unitTable } from './units';

describe('toBase', () => {
  it('converts the units a farmer actually says', () => {
    expect(toBase('11', 'bag')).toBe(550_000);      // 11 bags = 550 kg
    expect(toBase('3', 'quintal')).toBe(300_000);   // 3 quintals = 300 kg
    expect(toBase('610', 'tray')).toBe(18_300);     // 610 trays = 18,300 eggs
    expect(toBase('2.5', 'kg')).toBe(2_500);
  });

  it('does not lose a gram to binary floating point', () => {
    // 12.345 * 1000 is 12344.999999999998 as a double.
    expect(toBase('12.345', 'kg')).toBe(12_345);
    expect(toBase('0.1', 'kg')).toBe(100);
    expect(toBase('0.3', 'kg')).toBe(300);
    // Half a bag of 50 kg.
    expect(toBase('0.5', 'bag')).toBe(25_000);
  });

  it('honours a farm that redefines its bag', () => {
    const table = unitTable(DEFAULT_UNITS.map((u) => (u.code === 'bag' ? { ...u, factor: 45_000 } : u)));
    expect(toBase('11', 'bag', table)).toBe(495_000);
  });

  it('rejects an unknown unit or unreadable number', () => {
    expect(toBase('5', 'furlong')).toBeNull();
    expect(toBase('', 'kg')).toBeNull();
    expect(toBase('five', 'kg')).toBeNull();
  });
});

describe('fromBase and formatQty', () => {
  it('round-trips through the entry unit', () => {
    expect(fromBase(550_000, 'bag')).toBe(11);
    expect(fromBase(18_300, 'tray')).toBe(610);
  });
  it('reads the way it would be said aloud', () => {
    expect(formatQty(550_000, 'bag')).toBe('11 bags');
    expect(formatQty(50_000, 'bag')).toBe('1 bag');
    expect(formatQty(18_300, 'piece')).toBe('18,300 pieces');
    expect(formatQty(550_000, 'kg', undefined, { label: false })).toBe('550');
  });
});

describe('parseScaled', () => {
  it('scales without floating point', () => {
    expect(parseScaled('1.5', 3)).toBe(1500);
    expect(parseScaled('0.001', 3)).toBe(1);
    expect(parseScaled('12', 0)).toBe(12);
    expect(parseScaled('-2.25', 2)).toBe(-225);
  });
  it('truncates past the scale rather than rounding up into it', () => {
    expect(parseScaled('1.9999', 2)).toBe(199);
  });
  it('rejects nonsense', () => {
    expect(parseScaled('.', 2)).toBeNull();
    expect(parseScaled('1-2', 2)).toBeNull();
  });
});
