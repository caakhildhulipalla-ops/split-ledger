/**
 * Day keys.
 *
 * Everything in this app is reported per calendar day on the farm, so the unit
 * of time is a local day key — `YYYY-MM-DD` — never a timestamp. A supervisor
 * recording the evening collection at 23:55 and a supervisor recording it at
 * 00:05 after the phone finally found signal must land on the same farm day,
 * and comparisons must not depend on the device's timezone at read time.
 */

export type DayKey = string; // 'YYYY-MM-DD'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The local calendar day of a Date (default: now), as a day key. */
export function dayKey(at: Date = new Date()): DayKey {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const today = (): DayKey => dayKey();

/** Midday UTC for a day key — far from any timezone edge, so ± a few hours
 *  of device clock skew can never roll the date over. */
function anchor(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function addDays(key: DayKey, days: number): DayKey {
  const t = anchor(key);
  t.setUTCDate(t.getUTCDate() + days);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((anchor(b).getTime() - anchor(a).getTime()) / 86_400_000);
}

/** Inclusive run of day keys. Empty when `to` is before `from`. */
export function eachDay(from: DayKey, to: DayKey): DayKey[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  const out: DayKey[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** The `n` days ending at `to` (inclusive), oldest first. */
export function lastNDays(n: number, to: DayKey = today()): DayKey[] {
  return n <= 0 ? [] : eachDay(addDays(to, -(n - 1)), to);
}

export const minDay = (a: DayKey, b: DayKey): DayKey => (a <= b ? a : b);
export const maxDay = (a: DayKey, b: DayKey): DayKey => (a >= b ? a : b);

/** Bird age. Placement day is day 0, so a flock placed today is 0 days old. */
export const ageInDays = (placedOn: DayKey, on: DayKey = today()): number =>
  daysBetween(placedOn, on);

export const ageInWeeks = (placedOn: DayKey, on: DayKey = today()): number =>
  Math.floor(ageInDays(placedOn, on) / 7);

/** '12 Mar 2026' — the form used on screen. */
export function formatDay(key: DayKey): string {
  if (!isDayKey(key)) return key;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

/** 'Today' / 'Yesterday' / '12 Mar', for dense lists. */
export function formatDayShort(key: DayKey, relativeTo: DayKey = today()): string {
  const diff = daysBetween(key, relativeTo);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  const [, m, d] = key.split('-').map(Number) as [number, number, number];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]}`;
}
