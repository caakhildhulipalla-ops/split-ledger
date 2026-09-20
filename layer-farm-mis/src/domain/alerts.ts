/**
 * Alerts.
 *
 * Five triggers, all of them things a farmer wants to hear about the same day
 * rather than at the end of the month. Each rule is a pure function over
 * numbers that have already been computed, so the alert an owner receives is
 * derived from precisely the figures on the dashboard — an alert that
 * disagrees with the screen it links to destroys trust in both.
 *
 * Every alert carries a stable `key`. The notifier keeps a record of keys
 * already delivered, so a shed that is still short of feed on Thursday does
 * not re-notify every time the app opens.
 */

import type { DayKey } from './dates';

export interface AlertThresholds {
  /** Hen-day % points below the recent average that counts as a drop. */
  productionDropPoints: number;
  /** Days averaged to form that baseline. */
  productionBaselineDays: number;
  /** Daily mortality % at or above which a shed is flagged. */
  mortalitySpikePercent: number;
  /** Warn when feed cover falls below this many days. */
  feedCoverDays: number;
  /** Local hour (0–23) by which the day's entry is expected. */
  missedEntryByHour: number;
  /** Warn this many days before a vaccination falls due. */
  vaccinationLeadDays: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  productionDropPoints: 5,
  productionBaselineDays: 7,
  mortalitySpikePercent: 0.5,
  feedCoverDays: 5,
  missedEntryByHour: 19,
  vaccinationLeadDays: 3,
};

export type AlertKind =
  | 'production-drop'
  | 'mortality-spike'
  | 'low-feed'
  | 'missed-entry'
  | 'vaccination-due'
  | 'vaccination-overdue';

export type Severity = 'info' | 'warn' | 'critical';

export interface AlertScope {
  farmId?: string;
  shedId?: string;
  flockId?: string;
}

export interface Alert {
  /** Stable identity for de-duplication across app opens. */
  key: string;
  kind: AlertKind;
  severity: Severity;
  day: DayKey;
  title: string;
  detail: string;
  scope: AlertScope;
  /** Who should see it: owners and managers always, supervisors when true. */
  toSupervisor: boolean;
}

const pct = (n: number): string => `${n.toFixed(1)}%`;

/* ------------------------------------------------------- production drop */

export interface ProductionInput {
  day: DayKey;
  shedId: string;
  shedName: string;
  farmId: string;
  flockId: string;
  henDayToday: number | null;
  /** Hen-day % for the baseline days, most recent first. */
  baseline: readonly (number | null)[];
}

export function productionDrop(i: ProductionInput, t: AlertThresholds): Alert | null {
  if (i.henDayToday === null) return null;
  const known = i.baseline.filter((v): v is number => v !== null).slice(0, t.productionBaselineDays);
  if (known.length < 3) return null; // too little history to call it a drop
  const average = known.reduce((a, b) => a + b, 0) / known.length;
  const drop = average - i.henDayToday;
  if (drop < t.productionDropPoints) return null;
  return {
    key: `production-drop:${i.shedId}:${i.day}`,
    kind: 'production-drop',
    severity: drop >= t.productionDropPoints * 2 ? 'critical' : 'warn',
    day: i.day,
    title: `Production down in ${i.shedName}`,
    detail: `Hen-day ${pct(i.henDayToday)} against a ${known.length}-day average of ${pct(average)} — down ${drop.toFixed(1)} points.`,
    scope: { farmId: i.farmId, shedId: i.shedId, flockId: i.flockId },
    toSupervisor: true,
  };
}

/* -------------------------------------------------------- mortality spike */

export interface MortalityInput {
  day: DayKey;
  shedId: string;
  shedName: string;
  farmId: string;
  flockId: string;
  died: number;
  liveAtStart: number;
}

export function mortalitySpike(i: MortalityInput, t: AlertThresholds): Alert | null {
  if (i.liveAtStart <= 0 || i.died <= 0) return null;
  const rate = (i.died / i.liveAtStart) * 100;
  if (rate < t.mortalitySpikePercent) return null;
  return {
    key: `mortality-spike:${i.shedId}:${i.day}`,
    kind: 'mortality-spike',
    severity: rate >= t.mortalitySpikePercent * 3 ? 'critical' : 'warn',
    day: i.day,
    title: `Mortality up in ${i.shedName}`,
    detail: `${i.died.toLocaleString('en-IN')} birds died today — ${pct(rate)} of the flock, against a ${pct(t.mortalitySpikePercent)} threshold.`,
    scope: { farmId: i.farmId, shedId: i.shedId, flockId: i.flockId },
    toSupervisor: true,
  };
}

/* --------------------------------------------------------------- low feed */

export interface FeedCoverInput {
  day: DayKey;
  farmId: string;
  farmName: string;
  /** Null when the farm has no usage history to divide by. */
  coverDays: number | null;
  stockKg: number;
}

export function lowFeed(i: FeedCoverInput, t: AlertThresholds): Alert | null {
  if (i.coverDays === null || i.coverDays >= t.feedCoverDays) return null;
  return {
    key: `low-feed:${i.farmId}:${i.day}`,
    kind: 'low-feed',
    severity: i.coverDays < 2 ? 'critical' : 'warn',
    day: i.day,
    title: `Feed running low at ${i.farmName}`,
    detail: `${Math.round(i.stockKg).toLocaleString('en-IN')} kg left — about ${i.coverDays.toFixed(1)} days at current use.`,
    scope: { farmId: i.farmId },
    toSupervisor: false,
  };
}

/* ----------------------------------------------------------- missed entry */

export interface MissedEntryInput {
  day: DayKey;
  shedId: string;
  shedName: string;
  farmId: string;
  sessionsExpected: number;
  sessionsRecorded: number;
  /** Local hour right now, 0–23. */
  hourNow: number;
}

export function missedEntry(i: MissedEntryInput, t: AlertThresholds): Alert | null {
  if (i.hourNow < t.missedEntryByHour) return null;
  if (i.sessionsRecorded >= i.sessionsExpected) return null;
  const missing = i.sessionsExpected - i.sessionsRecorded;
  return {
    key: `missed-entry:${i.shedId}:${i.day}`,
    kind: 'missed-entry',
    severity: 'warn',
    day: i.day,
    title: `No entry yet for ${i.shedName}`,
    detail: missing === i.sessionsExpected
      ? `Today's entry has not been recorded.`
      : `${missing} of ${i.sessionsExpected} sessions still to record today.`,
    scope: { farmId: i.farmId, shedId: i.shedId },
    toSupervisor: true,
  };
}

/* ------------------------------------------------------ vaccination due */

export interface VaccinationInput {
  today: DayKey;
  dueOn: DayKey;
  vaccine: string;
  shedId: string;
  shedName: string;
  farmId: string;
  flockId: string;
  done: boolean;
  /** Days from today to the due date; negative when overdue. */
  daysAway: number;
}

export function vaccinationDue(i: VaccinationInput, t: AlertThresholds): Alert | null {
  if (i.done) return null;
  if (i.daysAway > t.vaccinationLeadDays) return null;
  const overdue = i.daysAway < 0;
  return {
    key: `vaccination:${i.flockId}:${i.vaccine}:${i.dueOn}`,
    kind: overdue ? 'vaccination-overdue' : 'vaccination-due',
    severity: overdue ? 'critical' : 'info',
    day: i.today,
    title: overdue ? `${i.vaccine} overdue in ${i.shedName}` : `${i.vaccine} due in ${i.shedName}`,
    detail: overdue
      ? `Was due ${Math.abs(i.daysAway)} day${Math.abs(i.daysAway) === 1 ? '' : 's'} ago and has not been recorded.`
      : i.daysAway === 0
        ? `Due today.`
        : `Due in ${i.daysAway} day${i.daysAway === 1 ? '' : 's'}.`,
    scope: { farmId: i.farmId, shedId: i.shedId, flockId: i.flockId },
    toSupervisor: true,
  };
}

/* ----------------------------------------------------------------- order */

const RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

/** Worst first, then newest, then stable by key. */
export function sortAlerts(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort((a, b) =>
    RANK[a.severity] - RANK[b.severity] || (a.day < b.day ? 1 : a.day > b.day ? -1 : a.key.localeCompare(b.key)),
  );
}

/** Alerts this user is allowed to receive. */
export const visibleTo = (alerts: readonly Alert[], isSupervisor: boolean): Alert[] =>
  isSupervisor ? alerts.filter((a) => a.toSupervisor) : [...alerts];
