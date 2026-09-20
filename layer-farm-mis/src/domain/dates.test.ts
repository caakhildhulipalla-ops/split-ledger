import { describe, expect, it } from 'vitest';
import {
  addDays, ageInDays, ageInWeeks, dayKey, daysBetween, eachDay, formatDay,
  formatDayShort, isDayKey, lastNDays, maxDay, minDay,
} from './dates';

describe('day keys', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isDayKey('2026-02-28')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);   // leap year
    expect(isDayKey('2026-02-29')).toBe(false);  // not a leap year
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2026-1-1')).toBe(false);
    expect(isDayKey('')).toBe(false);
    expect(isDayKey(20260101)).toBe(false);
  });

  it('reads a Date in the device’s own calendar', () => {
    expect(dayKey(new Date(2026, 2, 15, 23, 59))).toBe('2026-03-15');
    expect(dayKey(new Date(2026, 2, 15, 0, 1))).toBe('2026-03-15');
  });
});

describe('day arithmetic', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('measures whole days in both directions', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
    expect(daysBetween('2026-03-15', '2026-03-01')).toBe(-14);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('is immune to the clock changes a naive implementation trips on', () => {
    // Across a 23-hour DST day, a midnight-anchored implementation returns 0.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    // 560 laying days must land exactly 560 days later, not 559.
    expect(daysBetween('2026-01-01', addDays('2026-01-01', 560))).toBe(560);
  });

  it('builds inclusive runs', () => {
    expect(eachDay('2026-03-01', '2026-03-03')).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(eachDay('2026-03-03', '2026-03-01')).toEqual([]);
    expect(eachDay('2026-03-01', '2026-03-01')).toHaveLength(1);
    expect(eachDay('2026-01-01', '2026-12-31')).toHaveLength(365);
  });

  it('gives the last N days oldest first', () => {
    expect(lastNDays(3, '2026-03-15')).toEqual(['2026-03-13', '2026-03-14', '2026-03-15']);
    expect(lastNDays(0, '2026-03-15')).toEqual([]);
  });

  it('compares day keys as strings, which sort correctly', () => {
    expect(minDay('2026-03-01', '2026-02-28')).toBe('2026-02-28');
    expect(maxDay('2026-03-01', '2026-02-28')).toBe('2026-03-01');
  });
});

describe('flock age', () => {
  it('counts placement day as day zero', () => {
    expect(ageInDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(ageInDays('2026-01-01', '2026-01-08')).toBe(7);
    expect(ageInWeeks('2026-01-01', '2026-01-08')).toBe(1);
    expect(ageInWeeks('2026-01-01', '2026-01-07')).toBe(0);
  });

  it('reaches point of lay at the expected week', () => {
    // 17 weeks = 119 days.
    expect(ageInWeeks('2026-01-01', addDays('2026-01-01', 119))).toBe(17);
  });
});

describe('formatting', () => {
  it('spells a date the way it appears on screen', () => {
    expect(formatDay('2026-03-15')).toBe('15 Mar 2026');
  });
  it('says today and yesterday in dense lists', () => {
    expect(formatDayShort('2026-03-15', '2026-03-15')).toBe('Today');
    expect(formatDayShort('2026-03-14', '2026-03-15')).toBe('Yesterday');
    expect(formatDayShort('2026-03-01', '2026-03-15')).toBe('1 Mar');
  });
});
