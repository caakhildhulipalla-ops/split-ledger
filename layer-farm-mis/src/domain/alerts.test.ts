import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS, lowFeed, missedEntry, mortalitySpike, productionDrop,
  sortAlerts, vaccinationDue, visibleTo, type Alert,
} from './alerts';

const t = DEFAULT_THRESHOLDS;
const shed = { day: '2026-03-15', shedId: 'S1', shedName: 'Shed 1', farmId: 'F1', flockId: 'L1' };

describe('productionDrop', () => {
  it('fires when today falls well below the recent average', () => {
    const alert = productionDrop({ ...shed, henDayToday: 78, baseline: [88, 89, 87, 88, 90] }, t);
    expect(alert?.kind).toBe('production-drop');
    expect(alert?.detail).toContain('78.0%');
  });

  it('stays quiet for normal daily wobble', () => {
    expect(productionDrop({ ...shed, henDayToday: 86, baseline: [88, 89, 87, 88, 90] }, t)).toBeNull();
  });

  it('escalates a collapse to critical', () => {
    const alert = productionDrop({ ...shed, henDayToday: 60, baseline: [88, 89, 87] }, t);
    expect(alert?.severity).toBe('critical');
  });

  it('will not call a drop without enough history', () => {
    expect(productionDrop({ ...shed, henDayToday: 40, baseline: [88, 89] }, t)).toBeNull();
    expect(productionDrop({ ...shed, henDayToday: 40, baseline: [88, null, null] }, t)).toBeNull();
  });

  it('says nothing about a shed with no birds', () => {
    expect(productionDrop({ ...shed, henDayToday: null, baseline: [88, 89, 87] }, t)).toBeNull();
  });
});

describe('mortalitySpike', () => {
  it('fires above the threshold', () => {
    const alert = mortalitySpike({ ...shed, died: 60, liveAtStart: 10_000 }, t);
    expect(alert?.kind).toBe('mortality-spike');
    expect(alert?.detail).toContain('60');
  });
  it('ignores ordinary daily losses', () => {
    expect(mortalitySpike({ ...shed, died: 20, liveAtStart: 10_000 }, t)).toBeNull();
  });
  it('escalates a wipe-out', () => {
    expect(mortalitySpike({ ...shed, died: 300, liveAtStart: 10_000 }, t)?.severity).toBe('critical');
  });
  it('says nothing when no birds died, or none were there', () => {
    expect(mortalitySpike({ ...shed, died: 0, liveAtStart: 10_000 }, t)).toBeNull();
    expect(mortalitySpike({ ...shed, died: 5, liveAtStart: 0 }, t)).toBeNull();
  });
});

describe('lowFeed', () => {
  const farm = { day: '2026-03-15', farmId: 'F1', farmName: 'Kadapa farm' };
  it('warns when cover runs short', () => {
    const alert = lowFeed({ ...farm, coverDays: 3.2, stockKg: 3_520 }, t);
    expect(alert?.kind).toBe('low-feed');
    expect(alert?.toSupervisor).toBe(false); // stock is the owner's problem
  });
  it('turns critical under two days', () => {
    expect(lowFeed({ ...farm, coverDays: 1.4, stockKg: 1_540 }, t)?.severity).toBe('critical');
  });
  it('stays quiet with comfortable cover, or no usage history', () => {
    expect(lowFeed({ ...farm, coverDays: 9, stockKg: 9_900 }, t)).toBeNull();
    expect(lowFeed({ ...farm, coverDays: null, stockKg: 9_900 }, t)).toBeNull();
  });
});

describe('missedEntry', () => {
  const base = { day: '2026-03-15', shedId: 'S1', shedName: 'Shed 1', farmId: 'F1' };
  it('waits until the cut-off hour before complaining', () => {
    expect(missedEntry({ ...base, sessionsExpected: 2, sessionsRecorded: 0, hourNow: 11 }, t)).toBeNull();
    expect(missedEntry({ ...base, sessionsExpected: 2, sessionsRecorded: 0, hourNow: 20 }, t)).not.toBeNull();
  });
  it('knows a half-done day from an untouched one', () => {
    const half = missedEntry({ ...base, sessionsExpected: 2, sessionsRecorded: 1, hourNow: 20 }, t);
    expect(half?.detail).toContain('1 of 2');
  });
  it('is silent once the day is complete', () => {
    expect(missedEntry({ ...base, sessionsExpected: 2, sessionsRecorded: 2, hourNow: 23 }, t)).toBeNull();
  });
});

describe('vaccinationDue', () => {
  const base = { today: '2026-03-15', dueOn: '2026-03-17', vaccine: 'Lasota', ...shed, done: false };
  it('gives notice a few days ahead', () => {
    const alert = vaccinationDue({ ...base, daysAway: 2 }, t);
    expect(alert?.kind).toBe('vaccination-due');
    expect(alert?.detail).toContain('2 days');
  });
  it('says so on the day', () => {
    expect(vaccinationDue({ ...base, daysAway: 0 }, t)?.detail).toBe('Due today.');
  });
  it('escalates once overdue', () => {
    const alert = vaccinationDue({ ...base, daysAway: -3 }, t);
    expect(alert?.kind).toBe('vaccination-overdue');
    expect(alert?.severity).toBe('critical');
  });
  it('stops as soon as it is recorded', () => {
    expect(vaccinationDue({ ...base, daysAway: -3, done: true }, t)).toBeNull();
  });
  it('keeps quiet about vaccinations still far off', () => {
    expect(vaccinationDue({ ...base, daysAway: 20 }, t)).toBeNull();
  });
  it('keys on the flock, vaccine and due date so it notifies once', () => {
    const a = vaccinationDue({ ...base, daysAway: 0 }, t)!;
    const b = vaccinationDue({ ...base, today: '2026-03-16', daysAway: -1 }, t)!;
    expect(a.key).toBe(b.key);
  });
});

describe('ordering and visibility', () => {
  const alerts: Alert[] = [
    { key: 'a', kind: 'low-feed', severity: 'warn', day: '2026-03-15', title: 'a', detail: '', scope: {}, toSupervisor: false },
    { key: 'b', kind: 'mortality-spike', severity: 'critical', day: '2026-03-14', title: 'b', detail: '', scope: {}, toSupervisor: true },
    { key: 'c', kind: 'vaccination-due', severity: 'info', day: '2026-03-15', title: 'c', detail: '', scope: {}, toSupervisor: true },
  ];

  it('puts the worst first, newest within a severity', () => {
    expect(sortAlerts(alerts).map((a) => a.key)).toEqual(['b', 'a', 'c']);
  });

  it('keeps feed stock away from supervisors', () => {
    expect(visibleTo(alerts, true).map((a) => a.key)).toEqual(['b', 'c']);
    expect(visibleTo(alerts, false)).toHaveLength(3);
  });
});
