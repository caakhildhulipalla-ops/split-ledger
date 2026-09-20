import { describe, expect, it } from 'vitest';
import { backoffMs, coalesce, due, newEntry, onFailure, retryAll, status, waiting } from './outbox';
import type { OutboxEntry } from './types';

const T0 = Date.parse('2026-03-15T06:00:00.000Z');

const entry = (over: Partial<OutboxEntry> & { seq: number; entityId: string }): OutboxEntry => ({
  tenantId: 't1', entityType: 'daily-entry', op: 'upsert', rev: 1,
  queuedAt: new Date(T0).toISOString(), attempts: 0, nextAttemptAt: T0,
  lastError: null, state: 'queued', ...over,
});

describe('backoffMs', () => {
  it('doubles and then stops growing', () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(20)).toBe(5 * 60_000);
  });
});

describe('coalesce', () => {
  it('collapses repeat edits of one entry into a single upload', () => {
    const collapsed = coalesce([
      entry({ seq: 1, entityId: 'a', rev: 1 }),
      entry({ seq: 2, entityId: 'a', rev: 2 }),
      entry({ seq: 3, entityId: 'a', rev: 3 }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.rev).toBe(3);
    expect(collapsed[0]!.seq).toBe(1); // keeps its place in the queue
  });

  it('lets a delete supersede the upsert before it', () => {
    const collapsed = coalesce([
      entry({ seq: 1, entityId: 'a', op: 'upsert' }),
      entry({ seq: 2, entityId: 'a', op: 'delete', rev: 2 }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.op).toBe('delete');
  });

  it('keeps separate records separate, in the order they were made', () => {
    const collapsed = coalesce([
      entry({ seq: 3, entityId: 'c' }),
      entry({ seq: 1, entityId: 'a' }),
      entry({ seq: 2, entityId: 'b' }),
    ]);
    expect(collapsed.map((e) => e.entityId)).toEqual(['a', 'b', 'c']);
  });

  it('does not un-park an entry that is serving a backoff', () => {
    const collapsed = coalesce([
      entry({ seq: 1, entityId: 'a', state: 'failed', attempts: 3, nextAttemptAt: T0 + 8_000, lastError: 'boom' }),
      entry({ seq: 2, entityId: 'a', rev: 2 }),
    ]);
    expect(collapsed[0]!.state).toBe('failed');
    expect(collapsed[0]!.nextAttemptAt).toBe(T0 + 8_000);
    expect(collapsed[0]!.rev).toBe(2); // but it will send the newest version
  });
});

describe('due', () => {
  it('sends oldest first', () => {
    const list = due([entry({ seq: 5, entityId: 'e' }), entry({ seq: 2, entityId: 'b' })], T0);
    expect(list.map((e) => e.seq)).toEqual([2, 5]);
  });

  it('walks past a failed entry instead of stopping at it', () => {
    const list = due([
      entry({ seq: 1, entityId: 'a', state: 'failed', attempts: 2, nextAttemptAt: T0 + 60_000 }),
      entry({ seq: 2, entityId: 'b' }),
      entry({ seq: 3, entityId: 'c' }),
    ], T0);
    expect(list.map((e) => e.entityId)).toEqual(['b', 'c']);
  });

  it('picks a parked entry back up once its backoff has passed', () => {
    const parked = entry({ seq: 1, entityId: 'a', state: 'failed', attempts: 1, nextAttemptAt: T0 + 2_000 });
    expect(due([parked], T0)).toHaveLength(0);
    expect(due([parked], T0 + 2_000)).toHaveLength(1);
  });
});

describe('onFailure', () => {
  it('backs off further each time, and remembers why', () => {
    let e = entry({ seq: 1, entityId: 'a' });
    e = onFailure(e, T0, 'network down');
    expect(e.attempts).toBe(1);
    expect(e.state).toBe('failed');
    expect(e.lastError).toBe('network down');
    expect(e.nextAttemptAt).toBe(T0 + 2_000);

    e = onFailure(e, T0 + 2_000, 'still down');
    expect(e.attempts).toBe(2);
    expect(e.nextAttemptAt).toBe(T0 + 2_000 + 4_000);
  });
});

describe('status and retryAll', () => {
  it('counts what is waiting and what has gone wrong', () => {
    const s = status([
      entry({ seq: 1, entityId: 'a', state: 'failed', attempts: 1, nextAttemptAt: T0 + 2_000 }),
      entry({ seq: 2, entityId: 'b' }),
      entry({ seq: 3, entityId: 'b', rev: 2 }),
    ]);
    expect(s.pending).toBe(2); // b collapsed
    expect(s.failed).toBe(1);
    expect(s.oldest).toBe(new Date(T0).toISOString());
  });

  it('is empty for an empty queue', () => {
    expect(status([])).toEqual({ pending: 0, failed: 0, oldest: null });
  });

  it('puts everything back in line when the owner asks', () => {
    const retried = retryAll([entry({ seq: 1, entityId: 'a', state: 'failed', nextAttemptAt: T0 + 300_000 })], T0);
    expect(retried[0]!.state).toBe('queued');
    expect(due(retried, T0)).toHaveLength(1);
  });
});

describe('waiting', () => {
  it('separates "will retry shortly" from "ready to go"', () => {
    const entries = [
      entry({ seq: 1, entityId: 'a', nextAttemptAt: T0 + 60_000, state: 'failed' }),
      entry({ seq: 2, entityId: 'b' }),
    ];
    expect(waiting(entries, T0).map((e) => e.entityId)).toEqual(['a']);
    expect(due(entries, T0).map((e) => e.entityId)).toEqual(['b']);
  });
});

describe('newEntry', () => {
  it('starts ready to send', () => {
    const e = newEntry(1, { tenantId: 't1', entityId: 'x', entityType: 'expense', op: 'upsert', rev: 1 }, T0);
    expect(e.state).toBe('queued');
    expect(e.attempts).toBe(0);
    expect(due([e], T0)).toHaveLength(1);
  });
});
