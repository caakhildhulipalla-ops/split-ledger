'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, dayLabel, whenLabel, hueVar } from '@/lib/format';
import { restoreExpense, purgeExpense } from '@/app/actions';
import type { GroupData } from '@/lib/types';

interface Entry {
  ts: string;
  actor: string | null;
  verb: string;
  kind: 'add' | 'edit' | 'del';
  text: React.ReactNode;
  key: string;
}

/**
 * The activity feed is DERIVED from the records themselves — every row
 * carries who created, edited or deleted it and when. A separate append-only
 * log would have been last-writer-wins under concurrent edits and could
 * silently drop entries; this cannot, because the evidence is the row.
 */
export default function ActivityView({ data }: { data: GroupData }) {
  const { group, members } = data;
  const router = useRouter();
  const [pending, start] = useTransition();
  const cur = group.currency;

  // created_by and friends are user ids; names live on the member slot.
  const actorName = (userId: string | null) => {
    if (!userId) return 'Someone';
    const m = members.find((x) => x.user_id === userId);
    return m?.display_name ?? 'A former member';
  };
  const actorHue = (userId: string | null) =>
    hueVar(members.find((x) => x.user_id === userId)?.hue ?? 1);
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? 'Removed member';

  const entries = useMemo(() => {
    const out: Entry[] = [];

    for (const e of data.expenses) {
      const label = (
        <>
          <strong>{e.description}</strong> · {money(e.amount_minor, cur)}
        </>
      );
      if (e.created_at)
        out.push({
          ts: e.created_at,
          actor: e.created_by,
          verb: e.recurring_id ? 'posted' : 'added',
          kind: 'add',
          text: label,
          key: `${e.id}-c`,
        });
      if (e.updated_at && e.updated_at !== e.created_at)
        out.push({
          ts: e.updated_at,
          actor: e.updated_by,
          verb: 'edited',
          kind: 'edit',
          text: label,
          key: `${e.id}-u`,
        });
      if (e.deleted_at)
        out.push({
          ts: e.deleted_at,
          actor: e.deleted_by,
          verb: 'deleted',
          kind: 'del',
          text: label,
          key: `${e.id}-d`,
        });
    }

    for (const s of data.settlements) {
      const label = (
        <>
          payment of {money(s.amount_minor, cur)} from{' '}
          <strong>{memberName(s.from_member_id)}</strong> to{' '}
          <strong>{memberName(s.to_member_id)}</strong>
        </>
      );
      if (s.created_at)
        out.push({
          ts: s.created_at,
          actor: s.created_by,
          verb: 'recorded',
          kind: 'add',
          text: label,
          key: `${s.id}-c`,
        });
      if (s.deleted_at)
        out.push({
          ts: s.deleted_at,
          actor: s.deleted_by,
          verb: 'undid',
          kind: 'del',
          text: label,
          key: `${s.id}-d`,
        });
    }

    return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cur]);

  const deleted = data.expenses.filter((e) => e.deleted_at);

  return (
    <>
      <div className="sheet">
        <div className="sheet-head">
          <h2>Activity</h2>
          <span className="sub">every change to this ledger, newest first</span>
        </div>

        {entries.length ? (
          entries.slice(0, 300).map((a) => (
            <div className="act-row" key={a.key}>
              <span className="act-when">{whenLabel(a.ts)}</span>
              <span className="act-txt">
                <span className="who">
                  <span className="dot" style={{ background: actorHue(a.actor) }} />
                  {actorName(a.actor)}
                </span>{' '}
                <span className={`verb ${a.kind}`}>{a.verb}</span> {a.text}
              </span>
            </div>
          ))
        ) : (
          <div className="empty">Nothing has happened yet.</div>
        )}

        {entries.length > 300 && (
          <div className="recon">
            <span className="mini">Showing the 300 most recent changes.</span>
          </div>
        )}
      </div>

      {deleted.length > 0 && (
        <div className="sheet">
          <div className="sheet-head">
            <h2>Deleted expenses</h2>
            <span className="sub">kept out of every balance — restore or remove for good</span>
          </div>
          <div className="tbl-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="r">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deleted.map((e) => (
                  <tr key={e.id} className="void">
                    <td className="money meta">{dayLabel(e.spent_on)}</td>
                    <td className="desc">{e.description}</td>
                    <td className="r money">{money(e.amount_minor, cur)}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await restoreExpense(group.id, e.id);
                            router.refresh();
                          })
                        }
                      >
                        Restore
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await purgeExpense(group.id, e.id);
                            router.refresh();
                          })
                        }
                      >
                        Delete for good
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
