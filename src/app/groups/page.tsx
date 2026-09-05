import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { money, plural, hueVar } from '@/lib/format';
import NewGroupDialog from '@/components/NewGroupDialog';
import { signOut } from '../actions';

export const metadata: Metadata = { title: 'Your groups' };

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: groups } = await supabase
    .from('groups')
    .select('*')
    .order('created_at', { ascending: true });

  const groupIds = (groups ?? []).map((g) => g.id);

  // Five queries total regardless of how many groups there are — the naive
  // shape here is one query per group, which degrades badly.
  const [membersRes, expensesRes, settlementsRes] = await Promise.all([
    groupIds.length
      ? supabase.from('group_members').select('*').in('group_id', groupIds)
      : Promise.resolve({ data: [] as never[] }),
    groupIds.length
      ? supabase
          .from('expenses')
          .select('id, group_id, amount_minor, payer_member_id, spent_on')
          .in('group_id', groupIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as never[] }),
    groupIds.length
      ? supabase
          .from('settlements')
          .select('group_id, from_member_id, to_member_id, amount_minor')
          .in('group_id', groupIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const members = membersRes.data ?? [];
  const myMemberIds = members.filter((m) => m.user_id === user.id).map((m) => m.id);

  const sharesRes = myMemberIds.length
    ? await supabase
        .from('expense_shares')
        .select('group_id, member_id, amount_minor, expense_id')
        .in('member_id', myMemberIds)
    : { data: [] as never[] };

  // Only shares belonging to live expenses count toward a balance.
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

  return (
    <>
      <div className="mast">
        <div className="mast-in">
          <Link href="/groups" className="brand">
            <span className="rule-mark" />
            <h1>Split Ledger</h1>
          </Link>
          <span className="mast-spacer" />
          <span className="mini">{displayName}</span>
          <form action={signOut}>
            <button className="btn btn-sm btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="wrap">
        <div className="sheet">
          <div className="sheet-head">
            <h2>Your groups</h2>
            <span className="sub">a group is one shared ledger — a flat, a trip, a family</span>
            <span className="grow" />
            <NewGroupDialog />
          </div>

          {groups?.length ? (
            <div className="tbl-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Members</th>
                    <th className="r">Your position</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const gm = members.filter((m) => m.group_id === g.id && !m.removed_at);
                    const v = net.get(g.id) ?? 0;
                    return (
                      <tr key={g.id} className="clickable">
                        <td>
                          <Link
                            href={`/g/${g.id}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            <div className="desc">{g.name}</div>
                            <div className="meta">{g.currency}</div>
                          </Link>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                            {gm.slice(0, 6).map((m) => (
                              <span key={m.id} className="who">
                                <span
                                  className="dot"
                                  style={{ background: hueVar(m.hue) }}
                                />
                                <span className="meta">{m.display_name}</span>
                              </span>
                            ))}
                            {gm.length > 6 && (
                              <span className="meta">+{gm.length - 6} more</span>
                            )}
                          </span>
                        </td>
                        <td className="r">
                          <span
                            className={`money ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'meta'}`}
                          >
                            {v === 0
                              ? 'settled up'
                              : `${v > 0 ? 'owed ' : 'owe '}${money(Math.abs(v), g.currency)}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty" style={{ padding: '44px 16px' }}>
              <h2 style={{ fontSize: 17, marginBottom: 6, color: 'var(--ink)' }}>
                Nothing here yet
              </h2>
              <p style={{ maxWidth: '42ch', margin: '0 auto 16px' }}>
                Create a group, add the people you split things with, and start
                entering expenses. You can add someone before they have an account —
                invite them whenever.
              </p>
              <NewGroupDialog />
            </div>
          )}

          {groups?.length ? (
            <div className="recon">
              <span className="mini">
                {plural(groups.length, 'group')} ·{' '}
                {plural(members.filter((m) => !m.removed_at).length, 'member')}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
