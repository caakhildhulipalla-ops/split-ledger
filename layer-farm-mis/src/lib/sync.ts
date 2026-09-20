/**
 * Cloud sync.
 *
 * One farm, one phone, no internet is a complete product — so this module is
 * allowed to be absent. When Supabase is configured it pushes the outbox and
 * pulls whatever other devices have written since the last sync; when it is
 * not, every function here returns "nothing to do" and the app is unaffected.
 *
 * Pushing is deliberately one record at a time. Batching would be faster on a
 * good connection, but on a 2G connection in a shed the failure mode matters
 * more than the speed: a batch that fails loses the whole batch's progress,
 * while a record that fails is parked on its own and the next one goes.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cloudEnabled, supabaseAnonKey, supabaseUrl } from './config';
import * as db from './db';
import { due, onFailure } from './outbox';
import type { OutboxEntry, Row } from './types';

let client: SupabaseClient | null = null;

export function cloud(): SupabaseClient | null {
  if (!cloudEnabled()) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    });
  }
  return client;
}

export interface SyncResult {
  ran: boolean;
  pushed: number;
  pulled: number;
  failed: number;
  error: string | null;
}

const IDLE: SyncResult = { ran: false, pushed: 0, pulled: 0, failed: 0, error: null };

/** The single table every entity lives in; `type` discriminates. */
const TABLE = 'records';

/**
 * Push the outbox, then pull what changed elsewhere.
 *
 * Push first: a device's own work should reach the server before it accepts
 * anyone else's view of the same rows, so that its pending edits take part in
 * conflict resolution rather than being silently overwritten by the pull.
 */
export async function sync(tenantId: string, since: string | null): Promise<SyncResult> {
  const supabase = cloud();
  if (!supabase) return IDLE;

  try {
    const pushed = await push(supabase, tenantId);
    const pulled = await pull(supabase, tenantId, since);
    return { ran: true, pushed: pushed.pushed, pulled: pulled.length, failed: pushed.failed, error: null };
  } catch (e) {
    return { ...IDLE, ran: true, error: e instanceof Error ? e.message : 'Sync failed' };
  }
}

async function push(supabase: SupabaseClient, tenantId: string): Promise<{ pushed: number; failed: number }> {
  const entries = (await db.getAll<OutboxEntry>('outbox')).filter((e) => e.tenantId === tenantId);
  const ready = due(entries, Date.now());
  let pushed = 0;
  let failed = 0;

  for (const entry of ready) {
    const row = await db.get<Row>('records', entry.entityId);
    if (!row) {
      // The record is gone from the device and there is nothing to send.
      await db.del('outbox', entry.seq);
      continue;
    }

    const { error } = await supabase.from(TABLE).upsert(toRemote(row), { onConflict: 'id' });

    if (error) {
      failed++;
      await db.put('outbox', onFailure(entry, Date.now(), error.message));
      continue; // a failed entry never blocks the ones after it
    }

    await db.del('outbox', entry.seq);
    await db.put('records', { ...row, sync: 'synced' });
    pushed++;
  }
  return { pushed, failed };
}

async function pull(supabase: SupabaseClient, tenantId: string, since: string | null): Promise<Row[]> {
  let query = supabase.from(TABLE).select('*').eq('tenant_id', tenantId);
  if (since) query = query.gt('updated_at', since);

  const { data, error } = await query.order('updated_at', { ascending: true }).limit(5_000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRemote);
}

/* --------------------------------------------------- row ⇄ table shape */

interface RemoteRow {
  id: string;
  type: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  updated_by_role: string;
  rev: number;
  deleted_at: string | null;
  payload: Record<string, unknown>;
}

/**
 * The payload travels as JSON rather than as columns.
 *
 * Twenty-four entity types would otherwise be twenty-four tables and
 * twenty-four sets of row-level-security policies to keep in step. One table
 * with a JSON payload means the security rules — which are what actually keep
 * one farm's books away from another's — are written once and reviewed once.
 */
export function toRemote(row: Row): RemoteRow {
  const { id, type, tenantId, createdAt, updatedAt, createdBy, updatedBy, updatedByRole, rev, deletedAt, sync: _sync, ...payload } = row;
  return {
    id, type, tenant_id: tenantId,
    created_at: createdAt, updated_at: updatedAt,
    created_by: createdBy, updated_by: updatedBy, updated_by_role: updatedByRole,
    rev, deleted_at: deletedAt,
    payload: payload as Record<string, unknown>,
  };
}

export function fromRemote(remote: RemoteRow): Row {
  return {
    ...(remote.payload as object),
    id: remote.id,
    type: remote.type,
    tenantId: remote.tenant_id,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    createdBy: remote.created_by,
    updatedBy: remote.updated_by,
    updatedByRole: remote.updated_by_role,
    rev: remote.rev,
    deletedAt: remote.deleted_at,
    sync: 'synced',
  } as Row;
}
