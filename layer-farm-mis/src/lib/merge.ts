/**
 * Who wins, and who may still change their mind.
 *
 * Two phones can record the same shed's evening collection while both are out
 * of signal. When they meet in the cloud, something has to decide. The
 * requirements set the rule: an owner's edit beats a supervisor's, otherwise
 * the latest edit wins — and both versions stay in the audit trail, so the
 * loser is never simply erased.
 *
 * These are pure functions over two records. They are the whole of the
 * conflict policy, so the rule can be read, argued with and tested without a
 * database, a network or a second device.
 */

import { daysBetween, dayKey, type DayKey } from '@/domain/dates';
import type { Meta, Role } from './types';

/** Owner and manager outrank a supervisor; owner outranks manager. */
const RANK: Record<Role, number> = { owner: 2, manager: 1, supervisor: 0 };

export type Winner = 'local' | 'remote';

/**
 * Pick the surviving version of a record.
 *
 * Deletion is not special-cased into "always wins": a supervisor who deletes
 * an entry the owner then corrects must not silently take the owner's
 * correction away with it.
 */
export function resolve(local: Meta, remote: Meta): Winner {
  const byRank = RANK[remote.updatedByRole] - RANK[local.updatedByRole];
  if (byRank !== 0) return byRank > 0 ? 'remote' : 'local';

  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? 'remote' : 'local';
  if (remote.rev !== local.rev) return remote.rev > local.rev ? 'remote' : 'local';

  // Identical rank, clock and revision: pick deterministically so every device
  // in the fleet converges on the same answer rather than ping-ponging.
  return remote.updatedBy > local.updatedBy ? 'remote' : 'local';
}

export const merge = <T extends Meta>(local: T, remote: T): T =>
  resolve(local, remote) === 'remote' ? remote : local;

/* ------------------------------------------------------- edit windows */

export interface EditContext {
  role: Role;
  /** Now, as epoch millis. */
  now: number;
}

const DAY_MS = 86_400_000;

/**
 * May this user still change an entry? (decisions 3 and 18)
 *
 * Owners and managers, always. A supervisor, only on the day the entry is
 * *for* — plus a 24-hour grace from when the record was actually created, so
 * an entry made at 23:50 offline and synced at 00:05 is still theirs to fix.
 * Without that grace, going offline would silently cost a supervisor their
 * edit rights, and the fix would be a wrong number nobody could correct.
 */
export function canEdit(
  record: { createdAt: string; deletedAt: string | null },
  entryDay: DayKey,
  ctx: EditContext,
): boolean {
  if (record.deletedAt) return false;
  if (ctx.role !== 'supervisor') return true;
  if (entryDay === dayKey(new Date(ctx.now))) return true;
  const age = ctx.now - Date.parse(record.createdAt);
  return Number.isFinite(age) && age >= 0 && age <= DAY_MS;
}

/** Plain-English reason an edit is refused, for the screen to show. */
export function editRefusal(
  record: { createdAt: string; deletedAt: string | null },
  entryDay: DayKey,
  ctx: EditContext,
): string | null {
  if (canEdit(record, entryDay, ctx)) return null;
  if (record.deletedAt) return 'This entry was deleted.';
  return 'Entries can be changed on the day they were made. Ask the owner to correct this one.';
}

/**
 * May this user record an entry *for* this day? (backdating, section 8)
 *
 * A supervisor enters today, or yesterday when a session was missed. Anything
 * older is the owner's to enter, and nothing may be recorded for the future.
 */
export function canEnterFor(day: DayKey, ctx: EditContext): boolean {
  const todayKey = dayKey(new Date(ctx.now));
  if (day > todayKey) return false;
  if (ctx.role !== 'supervisor') return true;
  return daysBetween(day, todayKey) <= 1;
}

export function entryRefusal(day: DayKey, ctx: EditContext): string | null {
  if (canEnterFor(day, ctx)) return null;
  const todayKey = dayKey(new Date(ctx.now));
  if (day > todayKey) return 'You cannot record an entry for a future date.';
  return 'Supervisors can record today or yesterday. Ask the owner to enter an older date.';
}

/* ------------------------------------------------------- duplicates */

/**
 * One entry per shed, per date, per session.
 *
 * Returned as a string so it can be an index key: a second entry for the same
 * key is refused and the existing one is offered for editing instead.
 */
export const dailyEntryKey = (shedId: string, day: DayKey, session: string): string =>
  `${shedId}|${day}|${session}`;

/** Field-level diff for the audit trail. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  ignore: readonly string[] = ['updatedAt', 'updatedBy', 'updatedByRole', 'rev', 'sync'],
): { field: string; from: unknown; to: unknown }[] {
  const skip = new Set(ignore);
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const field of fields) {
    if (skip.has(field)) continue;
    const from = before?.[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes.sort((a, b) => a.field.localeCompare(b.field));
}
