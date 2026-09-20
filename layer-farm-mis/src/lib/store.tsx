'use client';

/**
 * The in-memory mirror of the device database.
 *
 * Every row the tenant owns is held in one Map. A farm's entire year is a few
 * thousand small records — far less than a single photo — and holding it in
 * memory is what makes the costing engine possible at all: daily P&L needs
 * every purchase, batch, issue, entry and expense at once, and doing that
 * through async queries per screen would be both slower and much harder to
 * reason about.
 *
 * Writes go three places, in this order: memory (so the screen updates now),
 * IndexedDB (so it survives the app being killed), and the outbox (so it
 * reaches the cloud eventually). The first two are synchronous from the
 * user's point of view; only the third needs a network, and nothing waits
 * for it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as db from './db';
import { newId } from './id';
import { diff, merge } from './merge';
import { newEntry, status as queueStatus, type QueueStatus } from './outbox';
import type { AuditEntry, EntityMap, EntityType, Meta, OutboxEntry, Role, Row } from './types';

export interface Session {
  userId: string;
  userName: string;
  tenantId: string;
  role: Role;
  /** Sheds a supervisor may touch; empty means every shed. */
  shedIds: string[];
}

const SESSION_KEY = 'session';

interface DataValue {
  ready: boolean;
  session: Session | null;
  /** Every live row, by id. Deleted rows are kept out of here. */
  rows: ReadonlyMap<string, Row>;
  queue: QueueStatus;
  lastSyncAt: string | null;

  list: <K extends EntityType>(type: K) => Row<K>[];
  find: <K extends EntityType>(type: K, id: string | null | undefined) => Row<K> | null;

  create: <K extends EntityType>(type: K, payload: EntityMap[K], id?: string) => Promise<Row<K>>;
  update: <K extends EntityType>(id: string, patch: Partial<EntityMap[K]>) => Promise<Row<K> | null>;
  remove: (id: string) => Promise<void>;
  /** Bulk load used by onboarding, demo data and the first sync pull. */
  importRows: (rows: readonly Row[], opts?: { queue?: boolean }) => Promise<void>;

  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  auditFor: (entityId: string) => Promise<AuditEntry[]>;
  resetEverything: () => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside <DataProvider>');
  return value;
}

/** The signed-in session, or null. Screens that require one redirect. */
export const useSession = (): Session | null => useData().session;

export function DataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Map<string, Row>>(() => new Map());
  const [queue, setQueue] = useState<QueueStatus>({ pending: 0, failed: 0, oldest: null });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // The outbox sequence is monotonic per device, never reused.
  const seqRef = useRef(0);
  const outboxRef = useRef<OutboxEntry[]>([]);

  /* ---------------------------------------------------------- first load */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stored, outbox, saved, syncedAt] = await Promise.all([
        db.getAll<Row>('records'),
        db.getAll<OutboxEntry>('outbox'),
        db.getMeta<Session>(SESSION_KEY),
        db.getMeta<string>('lastSyncAt'),
      ]);
      if (cancelled) return;

      const live = new Map<string, Row>();
      for (const row of stored) if (!row.deletedAt) live.set(row.id, row);

      outboxRef.current = outbox;
      seqRef.current = outbox.reduce((max, e) => Math.max(max, e.seq), 0);

      setRows(live);
      setQueue(queueStatus(outbox));
      setSession(saved ?? null);
      setLastSyncAt(syncedAt ?? null);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  /* -------------------------------------------------------------- writes */

  const enqueue = useCallback(async (row: Meta, op: 'upsert' | 'delete') => {
    const entry = newEntry(++seqRef.current, {
      tenantId: row.tenantId, entityId: row.id, entityType: row.type, op, rev: row.rev,
    }, Date.now());
    outboxRef.current = [...outboxRef.current, entry];
    setQueue(queueStatus(outboxRef.current));
    await db.put('outbox', entry);
  }, []);

  const writeAudit = useCallback(async (
    row: Meta,
    action: AuditEntry['action'],
    changes: AuditEntry['changes'],
    who: Session,
  ) => {
    if (changes.length === 0 && action === 'update') return;
    const entry: AuditEntry = {
      id: newId(), tenantId: row.tenantId, entityId: row.id, entityType: row.type,
      action, at: new Date().toISOString(),
      by: who.userId, byName: who.userName, byRole: who.role, changes,
    };
    await db.put('audit', entry);
  }, []);

  const create = useCallback(async <K extends EntityType>(
    type: K, payload: EntityMap[K], id?: string,
  ): Promise<Row<K>> => {
    const who = session;
    if (!who) throw new Error('Not signed in');
    const now = new Date().toISOString();
    const row = {
      ...payload,
      id: id ?? newId(),
      type,
      tenantId: who.tenantId,
      createdAt: now, updatedAt: now,
      createdBy: who.userId, updatedBy: who.userId, updatedByRole: who.role,
      rev: 1, deletedAt: null, sync: 'pending' as const,
    } as unknown as Row<K>;

    setRows((prev) => new Map(prev).set(row.id, row));
    await db.put('records', row);
    await writeAudit(row, 'create', diff(null, payload as unknown as Record<string, unknown>), who);
    await enqueue(row, 'upsert');
    return row;
  }, [session, enqueue, writeAudit]);

  const update = useCallback(async <K extends EntityType>(
    id: string, patch: Partial<EntityMap[K]>,
  ): Promise<Row<K> | null> => {
    const who = session;
    if (!who) throw new Error('Not signed in');
    const before = rows.get(id) as Row<K> | undefined;
    if (!before) return null;

    const next = {
      ...before,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: who.userId,
      updatedByRole: who.role,
      rev: before.rev + 1,
      sync: 'pending' as const,
    } as unknown as Row<K>;

    setRows((prev) => new Map(prev).set(id, next));
    await db.put('records', next);
    await writeAudit(next, 'update', diff(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>), who);
    await enqueue(next, 'upsert');
    return next;
  }, [rows, session, enqueue, writeAudit]);

  const remove = useCallback(async (id: string): Promise<void> => {
    const who = session;
    if (!who) throw new Error('Not signed in');
    const before = rows.get(id);
    if (!before) return;

    // Soft delete: the row stays on disk so the audit trail and the sync
    // protocol both still have something to point at.
    const next: Row = {
      ...before,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: who.userId,
      updatedByRole: who.role,
      rev: before.rev + 1,
      sync: 'pending',
    };

    setRows((prev) => {
      const map = new Map(prev);
      map.delete(id);
      return map;
    });
    await db.put('records', next);
    await writeAudit(next, 'delete', [], who);
    await enqueue(next, 'delete');
  }, [rows, session, enqueue, writeAudit]);

  const importRows = useCallback(async (incoming: readonly Row[], opts: { queue?: boolean } = {}) => {
    if (incoming.length === 0) return;

    setRows((prev) => {
      const map = new Map(prev);
      for (const row of incoming) {
        const existing = map.get(row.id);
        const winner = existing ? merge(existing, row) : row;
        if (winner.deletedAt) map.delete(row.id);
        else map.set(row.id, winner as Row);
      }
      return map;
    });

    await db.putMany('records', incoming);
    if (opts.queue) for (const row of incoming) await enqueue(row, row.deletedAt ? 'delete' : 'upsert');
  }, [enqueue]);

  /* ------------------------------------------------------------ sessions */

  const signIn = useCallback(async (next: Session) => {
    setSession(next);
    await db.setMeta(SESSION_KEY, next);
  }, []);

  const signOut = useCallback(async () => {
    // The farm's data stays on the device: the next person to sign in on this
    // phone is almost always the same person, and re-downloading a season of
    // entries over a village connection is not a sign-out cost worth paying.
    setSession(null);
    await db.setMeta(SESSION_KEY, null);
  }, []);

  const resetEverything = useCallback(async () => {
    await db.clearAll();
    outboxRef.current = [];
    seqRef.current = 0;
    setRows(new Map());
    setSession(null);
    setQueue({ pending: 0, failed: 0, oldest: null });
    setLastSyncAt(null);
  }, []);

  const auditFor = useCallback(async (entityId: string): Promise<AuditEntry[]> => {
    const all = await db.getAll<AuditEntry>('audit');
    return all.filter((a) => a.entityId === entityId).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, []);

  /* ----------------------------------------------------------- selectors */

  const byType = useMemo(() => {
    const index = new Map<EntityType, Row[]>();
    for (const row of rows.values()) {
      const list = index.get(row.type);
      if (list) list.push(row);
      else index.set(row.type, [row]);
    }
    return index;
  }, [rows]);

  const list = useCallback(<K extends EntityType>(type: K): Row<K>[] =>
    (byType.get(type) ?? []) as unknown as Row<K>[], [byType]);

  const find = useCallback(<K extends EntityType>(type: K, id: string | null | undefined): Row<K> | null => {
    if (!id) return null;
    const row = rows.get(id);
    return row && row.type === type ? (row as unknown as Row<K>) : null;
  }, [rows]);

  useEffect(() => {
    if (lastSyncAt) void db.setMeta('lastSyncAt', lastSyncAt);
  }, [lastSyncAt]);

  const value = useMemo<DataValue>(() => ({
    ready, session, rows, queue, lastSyncAt,
    list, find, create, update, remove, importRows,
    signIn, signOut, auditFor, resetEverything,
  }), [ready, session, rows, queue, lastSyncAt, list, find, create, update, remove, importRows, signIn, signOut, auditFor, resetEverything]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
