/**
 * The sync queue.
 *
 * "Entries upload in the order they were made, one at a time, and retry on
 * failure. A failed entry never blocks the ones after it."
 *
 * That last clause is the whole design. A queue that stops at its first
 * failure is a queue that loses a week of a farm's data because one record
 * upset the server on Monday. So a failure parks that one entry with a
 * growing backoff and the queue walks on.
 *
 * The logic here is pure: entries in, entries out, no network and no database.
 * Every rule about ordering, retrying and collapsing repeat edits can be
 * tested directly, which matters more here than anywhere else in the app —
 * this is the part nobody can watch working.
 */

import type { EntityType, OutboxEntry } from './types';

/** 2s, 4s, 8s … capped at five minutes. Deterministic, so tests can assert it. */
export const MAX_BACKOFF_MS = 5 * 60_000;

export function backoffMs(attempts: number): number {
  // Clamped before the shift so a long-dead entry cannot overflow the double;
  // the ceiling then does the real limiting.
  const steps = Math.min(Math.max(attempts, 1), 20);
  return Math.min(2_000 * 2 ** (steps - 1), MAX_BACKOFF_MS);
}

export interface QueueInput {
  tenantId: string;
  entityId: string;
  entityType: EntityType;
  op: 'upsert' | 'delete';
  rev: number;
}

export function newEntry(seq: number, input: QueueInput, now: number): OutboxEntry {
  return {
    seq,
    tenantId: input.tenantId,
    entityId: input.entityId,
    entityType: input.entityType,
    op: input.op,
    rev: input.rev,
    queuedAt: new Date(now).toISOString(),
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    state: 'queued',
  };
}

/**
 * Collapse repeat edits of one record into a single send.
 *
 * A supervisor who corrects the same entry four times before finding signal
 * should cost the farm one upload, not four. The surviving entry keeps the
 * *earliest* position — the order the work was first done in — but the latest
 * revision and operation, because only the final state is worth sending.
 *
 * A delete always survives a preceding upsert of the same record; there is no
 * point uploading a row the device has already thrown away.
 */
export function coalesce(entries: readonly OutboxEntry[]): OutboxEntry[] {
  const byEntity = new Map<string, OutboxEntry>();
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    const existing = byEntity.get(entry.entityId);
    if (!existing) {
      byEntity.set(entry.entityId, entry);
      continue;
    }
    byEntity.set(entry.entityId, {
      ...existing,
      op: entry.op,
      rev: Math.max(existing.rev, entry.rev),
      // Keep the worse of the two retry states so a parked entry stays parked.
      attempts: Math.max(existing.attempts, entry.attempts),
      nextAttemptAt: Math.max(existing.nextAttemptAt, entry.nextAttemptAt),
      state: existing.state === 'failed' || entry.state === 'failed' ? 'failed' : 'queued',
      lastError: entry.lastError ?? existing.lastError,
    });
  }
  return [...byEntity.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * What to send now: oldest first, skipping entries still serving a backoff.
 *
 * Skipping rather than stopping is what keeps one bad record from holding the
 * farm's whole day hostage.
 */
export function due(entries: readonly OutboxEntry[], now: number): OutboxEntry[] {
  return coalesce(entries)
    .filter((e) => e.nextAttemptAt <= now)
    .sort((a, b) => a.seq - b.seq);
}

/** Entries waiting out a backoff — shown as "will retry" rather than "failed". */
export function waiting(entries: readonly OutboxEntry[], now: number): OutboxEntry[] {
  return coalesce(entries).filter((e) => e.nextAttemptAt > now);
}

export function onFailure(entry: OutboxEntry, now: number, error: string): OutboxEntry {
  const attempts = entry.attempts + 1;
  return {
    ...entry,
    attempts,
    state: 'failed',
    lastError: error,
    nextAttemptAt: now + backoffMs(attempts),
  };
}

/** How the sync state reads on screen. */
export interface QueueStatus {
  pending: number;
  failed: number;
  /** Oldest queued entry's timestamp, so the UI can say how far behind it is. */
  oldest: string | null;
}

export function status(entries: readonly OutboxEntry[]): QueueStatus {
  const collapsed = coalesce(entries);
  return {
    pending: collapsed.length,
    failed: collapsed.filter((e) => e.state === 'failed').length,
    oldest: collapsed.length > 0 ? collapsed.reduce((a, b) => (a.queuedAt <= b.queuedAt ? a : b)).queuedAt : null,
  };
}

/** Give up waiting and try everything again — the "Retry now" button. */
export const retryAll = (entries: readonly OutboxEntry[], now: number): OutboxEntry[] =>
  entries.map((e) => ({ ...e, nextAttemptAt: now, state: 'queued' as const }));
