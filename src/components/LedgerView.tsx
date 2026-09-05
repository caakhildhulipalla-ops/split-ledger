'use client';

import { useMemo, useState } from 'react';
import ExpenseDialog from './ExpenseDialog';
import { money, dayLabel, monthLabel, monthOf, splitLabel, hueVar, plural } from '@/lib/format';
import { CATEGORIES, type GroupData, type Expense } from '@/lib/types';

export default function LedgerView({ data }: { data: GroupData }) {
  const { group, members, meMemberId } = data;
  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [who, setWho] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);

  const live = useMemo(() => data.expenses.filter((e) => !e.deleted_at), [data.expenses]);
  const member = (id: string) =>
    members.find((m) => m.id === id) ?? {
      display_name: 'Removed member',
      hue: 1,
      id,
    };

  const months = useMemo(
    () =>
      Array.from(new Set(live.map((e) => monthOf(e.spent_on)).filter(Boolean)))
        .sort()
        .reverse(),
    [live],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return live.filter((e) => {
      if (month !== 'all' && monthOf(e.spent_on) !== month) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (who !== 'all') {
        const inSplit = (e.expense_shares ?? []).some((s) => s.member_id === who);
        if (e.payer_member_id !== who && !inSplit) return false;
      }
      if (
        needle &&
        !e.description.toLowerCase().includes(needle) &&
        !(e.notes ?? '').toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
  }, [live, month, category, who, q]);

  const total = rows.reduce((a, e) => a + e.amount_minor, 0);
  const mine = rows.reduce(
    (a, e) =>
      a + ((e.expense_shares ?? []).find((s) => s.member_id === meMemberId)?.amount_minor ?? 0),
    0,
  );
  const filtered = month !== 'all' || category !== 'all' || who !== 'all' || q;

  return (
    <>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{group.name}</h2>
          <span className="sub">
            {plural(members.filter((m) => !m.removed_at).length, 'member')} · {group.currency}
          </span>
          <span className="grow" />
          <span className="sub num">
            {plural(rows.length, 'entry', 'entries')} · {money(total, group.currency)} total ·
            your share {money(mine, group.currency)}
          </span>
        </div>

        <div className="toolbar">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search description or note"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {filtered && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setMonth('all');
                setCategory('all');
                setWho('all');
                setQ('');
              }}
            >
              Clear
            </button>
          )}
        </div>

        {rows.length ? (
          <div className="tbl-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Paid by</th>
                  <th>Split</th>
                  <th className="r">Amount</th>
                  <th className="r">Your share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const p = member(e.payer_member_id);
                  const my =
                    (e.expense_shares ?? []).find((s) => s.member_id === meMemberId)
                      ?.amount_minor ?? 0;
                  const n = (e.expense_shares ?? []).length;
                  return (
                    <tr key={e.id} className="clickable" onClick={() => setEditing(e)}>
                      <td className="money meta">{dayLabel(e.spent_on)}</td>
                      <td>
                        <div className="desc">{e.description}</div>
                        <div className="meta">
                          <span className="catchip">{e.category}</span>
                          {e.recurring_id && <> <span className="catchip">recurring</span></>}
                          {e.notes ? ` · ${e.notes}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="who">
                          <span className="dot" style={{ background: hueVar(p.hue) }} />
                          {p.display_name}
                        </span>
                      </td>
                      <td className="meta">
                        {splitLabel(e.split_mode)} · {plural(n, 'person', 'people')}
                      </td>
                      <td className="r money">{money(e.amount_minor, group.currency)}</td>
                      <td className={`r money ${my ? '' : 'meta'}`}>
                        {my ? money(my, group.currency) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            {live.length
              ? 'No entries match these filters.'
              : 'No expenses yet. Add the first one and the balances build themselves.'}
          </div>
        )}
      </div>

      <button className="btn btn-primary fab" onClick={() => setAdding(true)}>
        + Add expense
      </button>

      <ExpenseDialog
        open={adding}
        onClose={() => setAdding(false)}
        groupId={group.id}
        currency={group.currency}
        members={members}
        meMemberId={meMemberId}
      />
      <ExpenseDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        groupId={group.id}
        currency={group.currency}
        members={members}
        meMemberId={meMemberId}
        expense={editing}
      />
    </>
  );
}
