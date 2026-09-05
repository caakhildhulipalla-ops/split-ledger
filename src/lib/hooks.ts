'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase/client';
import { loadGroup, postDueRecurring, GroupNotFound } from './ledger';
import { onRevalidate } from './store';
import type { GroupData, Group, GroupMember, GroupInvite } from './types';

/* ------------------------------------------------------------------ shared */

interface Async<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Runs `loader` on mount, again whenever `deps` change, and again whenever any
 * mutation calls `revalidate()`. The first load shows `loading`; later reloads
 * (including revalidations) keep the stale data on screen and swap it when the
 * fresh copy lands, so the UI does not flash.
 */
function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    let cancelled = false;
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof GroupNotFound
              ? 'not-found'
              : e instanceof Error
                ? e.message
                : 'Something went wrong.',
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    const cancel = run();
    const off = onRevalidate(run);
    return () => {
      cancel();
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh: run };
}

/* -------------------------------------------------------------- one group */

export interface UseGroup extends Async<GroupData> {
  notFound: boolean;
}

export function useGroup(groupId: string | null): UseGroup {
  const postedFor = useRef<string | null>(null);

  const result = useAsync<GroupData>(async () => {
    if (!groupId) throw new GroupNotFound();
    const data = await loadGroup(groupId);

    // Post any recurring month that has come due. Only attempted once per
    // group per mount; the unique (recurring_id, recurring_period) index makes
    // it harmless if two devices race.
    if (postedFor.current !== groupId) {
      postedFor.current = groupId;
      const posted = await postDueRecurring(data).catch(() => 0);
      if (posted > 0) return loadGroup(groupId);
    }
    return data;
  }, [groupId]);

  return { ...result, notFound: result.error === 'not-found' };
}

/* --------------------------------------------------------- list of groups */

export interface GroupsOverview {
  groups: Group[];
  members: GroupMember[];
  /** Signed-in user's net position per group id, in minor units. */
  net: Map<string, number>;
  displayName: string;
}

export function useGroups(): Async<GroupsOverview> {
  return useAsync<GroupsOverview>(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('not-signed-in');

    const { data: groups } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: true });

    const groupIds = (groups ?? []).map((g) => g.id);

    const [membersRes, expensesRes, settlementsRes] = await Promise.all([
      groupIds.length
        ? supabase.from('group_members').select('*').in('group_id', groupIds)
        : Promise.resolve({ data: [] as GroupMember[] }),
      groupIds.length
        ? supabase
            .from('expenses')
            .select('id, group_id, amount_minor, payer_member_id, spent_on')
            .in('group_id', groupIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as { id: string; group_id: string; amount_minor: number; payer_member_id: string }[] }),
      groupIds.length
        ? supabase
            .from('settlements')
            .select('group_id, from_member_id, to_member_id, amount_minor')
            .in('group_id', groupIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as { group_id: string; from_member_id: string; to_member_id: string; amount_minor: number }[] }),
    ]);

    const members = (membersRes.data ?? []) as GroupMember[];
    const myMemberIds = members.filter((m) => m.user_id === user.id).map((m) => m.id);

    const sharesRes = myMemberIds.length
      ? await supabase
          .from('expense_shares')
          .select('group_id, member_id, amount_minor, expense_id')
          .in('member_id', myMemberIds)
      : { data: [] as { group_id: string; amount_minor: number; expense_id: string }[] };

    const liveExpenseIds = new Set((expensesRes.data ?? []).map((e) => e.id));

    const net = new Map<string, number>();
    const bump = (gid: string, v: number) => net.set(gid, (net.get(gid) ?? 0) + v);

    for (const e of expensesRes.data ?? []) {
      if (myMemberIds.includes(e.payer_member_id)) bump(e.group_id, e.amount_minor);
    }
    for (const s of sharesRes.data ?? []) {
      if (liveExpenseIds.has(s.expense_id)) bump(s.group_id, -s.amount_minor);
    }
    for (const s of settlementsRes.data ?? []) {
      if (myMemberIds.includes(s.from_member_id)) bump(s.group_id, s.amount_minor);
      if (myMemberIds.includes(s.to_member_id)) bump(s.group_id, -s.amount_minor);
    }

    const displayName =
      members.find((m) => m.user_id === user.id)?.display_name ??
      user.email ??
      user.phone ??
      'you';

    return { groups: (groups ?? []) as Group[], members, net, displayName };
  }, []);
}

/* --------------------------------------------------------- group invites */

export function useInvites(groupId: string | null): Async<GroupInvite[]> {
  return useAsync<GroupInvite[]>(async () => {
    if (!groupId) return [];
    const { data } = await supabase
      .from('group_invites')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    return (data ?? []) as GroupInvite[];
  }, [groupId]);
}

/* --------------------------------------------- group names for the switcher */

export function useGroupList(): { id: string; name: string }[] {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const load = () =>
      supabase
        .from('groups')
        .select('id, name')
        .order('created_at')
        .then(({ data }) => setList(data ?? []));
    load();
    return onRevalidate(load);
  }, []);
  return list;
}
