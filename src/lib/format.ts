import { CURRENCIES } from './types';
import type { Minor } from './money';

export function money(minor: Minor, currency = 'INR', opts: Intl.NumberFormatOptions = {}) {
  const c = CURRENCIES[currency] ?? CURRENCIES.INR;
  try {
    return new Intl.NumberFormat(c.locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...opts,
    }).format(minor / 100);
  } catch {
    return `${c.sym}${(minor / 100).toFixed(2)}`;
  }
}

export const money0 = (minor: Minor, currency = 'INR') =>
  money(minor, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Compact form for axis ticks — lakh and crore where the locale expects them. */
export function moneyAxis(minor: Minor, currency = 'INR') {
  const c = CURRENCIES[currency] ?? CURRENCIES.INR;
  const v = minor / 100;
  const a = Math.abs(v);
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (currency === 'INR') {
    if (a >= 1e7) return `${c.sym}${trim((v / 1e7).toFixed(1))}Cr`;
    if (a >= 1e5) return `${c.sym}${trim((v / 1e5).toFixed(1))}L`;
  } else if (a >= 1e6) {
    return `${c.sym}${trim((v / 1e6).toFixed(1))}M`;
  }
  if (a >= 1000) return `${c.sym}${trim((v / 1000).toFixed(a >= 10000 ? 0 : 1))}k`;
  return `${c.sym}${Math.round(v)}`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const monthOf = (iso: string) => (iso ?? '').slice(0, 7);

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export function dayLabel(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function whenLabel(ts: string | null) {
  if (!ts) return '';
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export const MEMBER_HUE_VARS = [
  'var(--m1)', 'var(--m2)', 'var(--m3)', 'var(--m4)',
  'var(--m5)', 'var(--m6)', 'var(--m7)', 'var(--m8)',
];
export const hueVar = (n: number) => MEMBER_HUE_VARS[(Math.max(1, n) - 1) % 8];

export const splitLabel = (m: string) =>
  ({ equal: 'Equally', exact: 'Exact amounts', percent: 'By percent', shares: 'By shares' })[m] ??
  'Equally';

export function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
