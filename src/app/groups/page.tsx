'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth, FullScreenLoader } from '@/lib/auth';
import { useGroups } from '@/lib/hooks';
import { signOut } from '@/lib/mutations';
import { money, plural, hueVar } from '@/lib/format';
import NewGroupDialog from '@/components/NewGroupDialog';

function Groups() {
  const router = useRouter();
  const { data, loading } = useGroups();

  if (loading && !data) return <FullScreenLoader />;

  const groups = data?.groups ?? [];
  const members = data?.members ?? [];
  const net = data?.net ?? new Map<string, number>();
  const displayName = data?.displayName ?? 'you';

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
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            onClick={async () => {
              await signOut();
              router.push('/signin');
            }}
          >
            Sign out
          </button>
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

          {groups.length ? (
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
                            href={`/g?id=${g.id}`}
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

          {groups.length ? (
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

export default function GroupsPage() {
  return (
    <RequireAuth>
      <Groups />
    </RequireAuth>
  );
}
