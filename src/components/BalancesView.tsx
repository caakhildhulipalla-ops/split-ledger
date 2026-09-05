'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SettlementDialog, { type PrefilledPayment } from './SettlementDialog';
import { netBalances, settleUp, pairwiseDebts } from '@/lib/money';
import { money, dayLabel, hueVar, plural } from '@/lib/format';
import { deleteSettlement } from '@/app/actions';
import type { GroupData } from '@/lib/types';

export default function BalancesView({ data }: { data: GroupData }) {
  const { group, members, meMemberId } = data;
  const router = useRouter();
  const [simplify, setSimplify] = useState(true);
  const [payment, setPayment] = useState<PrefilledPayment | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const cur = group.currency;
  const member = (id: string) =>
    members.find((m) => m.id === id) ?? { display_name: 'Removed member', hue: 1, id };

  const { net, drift, plan, pairwise, liveExpenses, liveSettlements } = useMemo(() => {
    const ids = members.filter((m) => !m.removed_at).map((m) => m.id);
    const exps = data.expenses
      .filter((e) => !e.deleted_at)
      .map((e) => ({
        payerId: e.payer_member_id,
        amountMinor: e.amount_minor,
        shares: Object.fromEntries(
          (e.expense_shares ?? []).map((s) => [s.member_id, s.amount_minor]),
        ),
      }));
    const setts = data.settlements
      .filter((s) => !s.deleted_at)
      .map((s) => ({
        fromId: s.from_member_id,
        toId: s.to_member_id,
        amountMinor: s.amount_minor,
      }));

    const net = netBalances(ids, exps, setts);
    return {
      net,
      drift: Object.values(net).reduce((a, b) => a + b, 0),
      plan: settleUp(net),
      pairwise: pairwiseDebts(ids, exps, setts),
      liveExpenses: exps.length,
      liveSettlements: setts.length,
    };
  }, [data, members]);

  const rows = Object.entries(net)
    .map(([id, v]) => ({ id, label: member(id).display_name, value: v }))
    .sort((a, b) => b.value - a.value);

  const shown = simplify ? plan : pairwise;
  const settlements = data.settlements.filter((s) => !s.deleted_at);

  const undo = (id: string) =>
    start(async () => {
      await deleteSettlement(group.id, id);
      router.refresh();
    });

  return (
    <>
      <div className="sheet">
        <div className="sheet-head">
          <h2>Net position</h2>
          <span className="sub">as of today, across every expense and payment</span>
        </div>
        <div>
          {rows.map((r) => (
            <div className="balrow" key={r.id}>
              <span className="who">
                <span className="dot" style={{ background: hueVar(member(r.id).hue) }} />
                <strong>{r.label}</strong>
                {r.id === meMemberId && <span className="mini"> (you)</span>}
              </span>
              <span
                className={`money ${r.value > 0 ? 'pos' : r.value < 0 ? 'neg' : 'meta'}`}
              >
                {r.value === 0
                  ? 'settled up'
                  : `${r.value > 0 ? 'is owed ' : 'owes '}${money(Math.abs(r.value), cur)}`}
              </span>
            </div>
          ))}
        </div>
        <div className="recon">
          <span>Reconciliation</span>
          <span className={drift === 0 ? 'ok' : 'bad'}>
            {drift === 0
              ? `✓ balances net to ${money(0, cur)}`
              : `⚠ off by ${money(drift, cur)}`}
          </span>
          <span className="mini">
            across {plural(rows.length, 'member')} · {plural(liveExpenses, 'expense')} ·{' '}
            {plural(liveSettlements, 'payment')}
          </span>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-head">
          <h2>{simplify ? 'Settle up' : 'Direct debts'}</h2>
          <span className="sub">
            {simplify
              ? 'the fewest payments that clear everyone'
              : 'what each pair owes each other, unrouted'}
          </span>
          <span className="grow" />
          <button className="btn btn-sm" onClick={() => setSimplify(!simplify)}>
            {simplify ? 'Show direct debts' : 'Simplify debts'}
          </button>
        </div>

        {shown.length ? (
          shown.map((t, i) => (
            <div className="settle-row" key={`${t.from}-${t.to}-${i}`}>
              <span className="who">
                <span className="dot" style={{ background: hueVar(member(t.from).hue) }} />
                <strong>{member(t.from).display_name}</strong>
              </span>
              <span className="arrow">pays →</span>
              <span className="who">
                <span className="dot" style={{ background: hueVar(member(t.to).hue) }} />
                <strong>{member(t.to).display_name}</strong>
              </span>
              <span className="grow" />
              <span className="money" style={{ fontSize: 15 }}>
                {money(t.amountMinor, cur)}
              </span>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setPayment({ from: t.from, to: t.to, amountMinor: t.amountMinor });
                  setOpen(true);
                }}
              >
                Record payment
              </button>
            </div>
          ))
        ) : (
          <div className="empty">Everyone is square. Nothing to settle.</div>
        )}

        {simplify && plan.length > 0 && pairwise.length > plan.length && (
          <div className="recon">
            <span className="mini">
              {plural(plan.length, 'payment')} instead of {plural(pairwise.length, 'direct IOU')}.
            </span>
          </div>
        )}
      </div>

      <div className="sheet">
        <div className="sheet-head">
          <h2>Payments recorded</h2>
          <span className="grow" />
          <button
            className="btn btn-sm"
            onClick={() => {
              setPayment(null);
              setOpen(true);
            }}
          >
            Record a payment
          </button>
        </div>
        {settlements.length ? (
          <div className="tbl-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Note</th>
                  <th className="r">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="money meta">{dayLabel(s.settled_on)}</td>
                    <td>
                      <span className="who">
                        <span
                          className="dot"
                          style={{ background: hueVar(member(s.from_member_id).hue) }}
                        />
                        {member(s.from_member_id).display_name}
                      </span>
                    </td>
                    <td>
                      <span className="who">
                        <span
                          className="dot"
                          style={{ background: hueVar(member(s.to_member_id).hue) }}
                        />
                        {member(s.to_member_id).display_name}
                      </span>
                    </td>
                    <td className="meta">{s.note || '—'}</td>
                    <td className="r money">{money(s.amount_minor, cur)}</td>
                    <td className="r">
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        onClick={() => undo(s.id)}
                        disabled={pending}
                      >
                        Undo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No payments recorded yet.</div>
        )}
      </div>

      <SettlementDialog
        open={open}
        onClose={() => setOpen(false)}
        groupId={group.id}
        members={members}
        meMemberId={meMemberId}
        prefill={payment}
      />
    </>
  );
}
