import { describe, expect, it } from 'vitest';
import { canEdit, canEnterFor, dailyEntryKey, diff, editRefusal, entryRefusal, merge, resolve } from './merge';
import type { Meta, Role } from './types';

const meta = (over: Partial<Meta>): Meta => ({
  id: 'r1', type: 'daily-entry', tenantId: 't1',
  createdAt: '2026-03-15T06:00:00.000Z', updatedAt: '2026-03-15T06:00:00.000Z',
  createdBy: 'u1', updatedBy: 'u1', updatedByRole: 'supervisor',
  rev: 1, deletedAt: null, sync: 'pending', ...over,
});

describe('resolve', () => {
  it('lets an owner edit beat a supervisor edit, even an older one', () => {
    const local = meta({ updatedByRole: 'supervisor', updatedAt: '2026-03-15T20:00:00.000Z', updatedBy: 'sup' });
    const remote = meta({ updatedByRole: 'owner', updatedAt: '2026-03-15T09:00:00.000Z', updatedBy: 'own' });
    expect(resolve(local, remote)).toBe('remote');
    expect(merge(local, remote)).toBe(remote);
  });

  it('lets a supervisor keep their edit against another supervisor who edited earlier', () => {
    const local = meta({ updatedAt: '2026-03-15T20:00:00.000Z', updatedBy: 'a' });
    const remote = meta({ updatedAt: '2026-03-15T09:00:00.000Z', updatedBy: 'b' });
    expect(resolve(local, remote)).toBe('local');
  });

  it('takes the later edit between equals', () => {
    const local = meta({ updatedAt: '2026-03-15T09:00:00.000Z' });
    const remote = meta({ updatedAt: '2026-03-15T20:00:00.000Z' });
    expect(resolve(local, remote)).toBe('remote');
  });

  it('ranks owner above manager above supervisor', () => {
    const at = '2026-03-15T09:00:00.000Z';
    const of = (role: Role) => meta({ updatedByRole: role, updatedAt: at });
    expect(resolve(of('manager'), of('owner'))).toBe('remote');
    expect(resolve(of('owner'), of('manager'))).toBe('local');
    expect(resolve(of('supervisor'), of('manager'))).toBe('remote');
  });

  it('breaks an exact tie the same way on every device', () => {
    const local = meta({ updatedBy: 'aaa' });
    const remote = meta({ updatedBy: 'bbb' });
    expect(resolve(local, remote)).toBe('remote');
    // The mirror image on the other phone must agree, or they ping-pong.
    expect(resolve(remote, local)).toBe('local');
  });

  it('uses the revision when two clocks read the same', () => {
    const local = meta({ rev: 3 });
    const remote = meta({ rev: 7 });
    expect(resolve(local, remote)).toBe('remote');
  });
});

describe('canEdit', () => {
  const at = (iso: string) => Date.parse(iso);
  const record = { createdAt: '2026-03-15T14:00:00.000Z', deletedAt: null };

  it('lets the owner change anything, whenever', () => {
    expect(canEdit(record, '2025-01-01', { role: 'owner', now: at('2026-06-01T10:00:00.000Z') })).toBe(true);
    expect(canEdit(record, '2025-01-01', { role: 'manager', now: at('2026-06-01T10:00:00.000Z') })).toBe(true);
  });

  it('lets a supervisor fix today’s entry', () => {
    const now = at('2026-03-15T18:00:00.000Z');
    expect(canEdit(record, '2026-03-15', { role: 'supervisor', now })).toBe(true);
  });

  it('closes the window on a supervisor the next day', () => {
    const now = at('2026-03-17T10:00:00.000Z');
    expect(canEdit(record, '2026-03-15', { role: 'supervisor', now })).toBe(false);
    expect(editRefusal(record, '2026-03-15', { role: 'supervisor', now })).toContain('Ask the owner');
  });

  it('keeps an entry made just before midnight editable for 24 hours', () => {
    // Recorded 23:50 on the 15th, still being corrected at 08:00 on the 16th.
    const late = { createdAt: '2026-03-15T23:50:00.000Z', deletedAt: null };
    const now = at('2026-03-16T08:00:00.000Z');
    expect(canEdit(late, '2026-03-15', { role: 'supervisor', now })).toBe(true);
  });

  it('refuses to edit something already deleted', () => {
    const gone = { createdAt: '2026-03-15T14:00:00.000Z', deletedAt: '2026-03-15T15:00:00.000Z' };
    const now = at('2026-03-15T16:00:00.000Z');
    expect(canEdit(gone, '2026-03-15', { role: 'supervisor', now })).toBe(false);
    expect(canEdit(gone, '2026-03-15', { role: 'owner', now })).toBe(false);
  });
});

describe('canEnterFor', () => {
  const now = Date.parse('2026-03-15T18:00:00.000Z');

  it('lets a supervisor record today and yesterday', () => {
    expect(canEnterFor('2026-03-15', { role: 'supervisor', now })).toBe(true);
    expect(canEnterFor('2026-03-14', { role: 'supervisor', now })).toBe(true);
  });

  it('sends older dates to the owner', () => {
    expect(canEnterFor('2026-03-13', { role: 'supervisor', now })).toBe(false);
    expect(entryRefusal('2026-03-13', { role: 'supervisor', now })).toContain('older date');
    expect(canEnterFor('2026-03-13', { role: 'owner', now })).toBe(true);
  });

  it('refuses the future to everybody', () => {
    expect(canEnterFor('2026-03-16', { role: 'owner', now })).toBe(false);
    expect(entryRefusal('2026-03-16', { role: 'owner', now })).toContain('future');
  });
});

describe('dailyEntryKey', () => {
  it('is one per shed, per date, per session', () => {
    expect(dailyEntryKey('S1', '2026-03-15', 'morning')).toBe('S1|2026-03-15|morning');
    expect(dailyEntryKey('S1', '2026-03-15', 'morning')).not.toBe(dailyEntryKey('S1', '2026-03-15', 'evening'));
  });
});

describe('diff', () => {
  it('records what actually changed, and nothing else', () => {
    expect(diff({ died: 12, feedGrams: 1_100_000 }, { died: 21, feedGrams: 1_100_000 }))
      .toEqual([{ field: 'died', from: 12, to: 21 }]);
  });
  it('ignores the bookkeeping fields every write touches', () => {
    expect(diff({ rev: 1, died: 5 }, { rev: 2, died: 5 })).toEqual([]);
  });
  it('sees a creation as every field arriving', () => {
    expect(diff(null, { died: 5 })).toEqual([{ field: 'died', from: undefined, to: 5 }]);
  });
  it('compares nested values by content, not identity', () => {
    expect(diff({ eggs: { gradeA: 1 } }, { eggs: { gradeA: 1 } })).toEqual([]);
    expect(diff({ eggs: { gradeA: 1 } }, { eggs: { gradeA: 2 } })).toHaveLength(1);
  });
});
