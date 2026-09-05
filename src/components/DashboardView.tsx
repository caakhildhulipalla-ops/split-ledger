'use client';

import { useMemo, useState } from 'react';
import { ChartCard, HBar, DivBar, ColChart, LineChart, GroupedBar } from './Charts';
import { netBalances } from '@/lib/money';
import { money, money0, monthLabel, monthOf, dayLabel, todayISO, plural } from '@/lib/format';
import { CATEGORIES, type GroupData } from '@/lib/types';

type Period = 'mtd' | '3m' | '12m' | 'all';
const PERIODS: [Period, string][] = [
  ['mtd', 'This month'],
  ['3m', 'Last 3 months'],
  ['12m', 'Last 12 months'],
  ['all', 'All time'],
];

function periodStart(p: Period) {
  const d = new Date();
  if (p === 'mtd') return `${todayISO().slice(0, 8)}01`;
  if (p === '3m') {
    d.setMonth(d.getMonth() - 2);
    return `${d.toISOString().slice(0, 8)}01`;
  }
  if (p === '12m') {
    d.setMonth(d.getMonth() - 11);
    return `${d.toISOString().slice(0, 8)}01`;
  }
  return '0000-01-01';
}

export default function DashboardView({ data }: { data: GroupData }) {
  const [period, setPeriod] = useState<Period>('12m');
  const { group, members, meMemberId } = data;
  const cur = group.currency;

  const active = members.filter((m) => !m.removed_at);
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? 'Removed member';

  const view = useMemo(() => {
    const from = periodStart(period);
    const live = data.expenses.filter((e) => !e.deleted_at);
    const inPeriod = live.filter((e) => e.spent_on >= from);
    const total = inPeriod.reduce((a, e) => a + e.amount_minor, 0);

    const ids = active.map((m) => m.id);
    const net = netBalances(
      ids,
      live.map((e) => ({
        payerId: e.payer_member_id,
        amountMinor: e.amount_minor,
        shares: Object.fromEntries(
          (e.expense_shares ?? []).map((s) => [s.member_id, s.amount_minor]),
        ),
      })),
      data.settlements
        .filter((s) => !s.deleted_at)
        .map((s) => ({
          fromId: s.from_member_id,
          toId: s.to_member_id,
          amountMinor: s.amount_minor,
        })),
    );

    const months = Array.from(new Set(inPeriod.map((e) => monthOf(e.spent_on)).filter(Boolean))).sort();
    const byMonth = months.map((m) => ({
      label: monthLabel(m),
      value: inPeriod
        .filter((e) => monthOf(e.spent_on) === m)
        .reduce((a, e) => a + e.amount_minor, 0),
    }));
    const headCount = Math.max(active.length, 1);
    const perHead = byMonth.map((r) => ({
      label: r.label,
      value: Math.round(r.value / headCount),
    }));

    const thisMonth = inPeriod
      .filter((e) => monthOf(e.spent_on) === monthOf(todayISO()))
      .reduce((a, e) => a + e.amount_minor, 0);
    const avgMonth = byMonth.length ? Math.round(total / byMonth.length) : 0;

    const byCat = CATEGORIES.map((c) => ({
      label: c as string,
      value: inPeriod.filter((e) => e.category === c).reduce((a, e) => a + e.amount_minor, 0),
    }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((r) => ({
        ...r,
        note: `${((r.value / Math.max(total, 1)) * 100).toFixed(1)}% of spend`,
      }));

    const paidVsShare = active
      .map((m) => ({
        label: m.display_name,
        paid: inPeriod
          .filter((e) => e.payer_member_id === m.id)
          .reduce((a, e) => a + e.amount_minor, 0),
        share: inPeriod.reduce(
          (a, e) =>
            a + ((e.expense_shares ?? []).find((s) => s.member_id === m.id)?.amount_minor ?? 0),
          0,
        ),
      }))
      .sort((a, b) => b.paid - a.paid);

    const top = [...inPeriod]
      .sort((a, b) => b.amount_minor - a.amount_minor)
      .slice(0, 8)
      .map((e) => ({
        label: e.description,
        value: e.amount_minor,
        note: `${dayLabel(e.spent_on)} · ${memberName(e.payer_member_id)}`,
      }));

    const balRows = active
      .map((m) => ({ label: m.display_name, value: net[m.id] ?? 0 }))
      .sort((a, b) => b.value - a.value);

    return {
      inPeriod,
      total,
      byMonth,
      perHead,
      thisMonth,
      avgMonth,
      byCat,
      paidVsShare,
      top,
      balRows,
      myNet: meMemberId ? (net[meMemberId] ?? 0) : 0,
      headCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period]);

  const periodLabel = PERIODS.find((p) => p[0] === period)![1].toLowerCase();

  return (
    <>
      <div className="sheet">
        <div className="toolbar">
          <span
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink-3)',
              fontWeight: 600,
            }}
          >
            Period
          </span>
          <div className="seg">
            {PERIODS.map(([k, label]) => (
              <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>
                {label}
              </button>
            ))}
          </div>
          <span className="grow" />
          <span className="mini">{plural(view.inPeriod.length, 'expense')} in view</span>
        </div>

        <div className="tiles">
          <div className="tile">
            <div className="k">Group spend</div>
            <div className="v">{money0(view.total, cur)}</div>
            <div className="n">{periodLabel}</div>
          </div>
          <div className="tile">
            <div className="k">Your position</div>
            <div
              className="v"
              style={{
                color:
                  view.myNet > 0
                    ? 'var(--credit)'
                    : view.myNet < 0
                      ? 'var(--debit)'
                      : 'var(--ink)',
              }}
            >
              {money0(Math.abs(view.myNet), cur)}
            </div>
            <div className="n">
              {view.myNet > 0
                ? 'you are owed · all time'
                : view.myNet < 0
                  ? 'you owe · all time'
                  : 'settled up'}
            </div>
          </div>
          <div className="tile">
            <div className="k">This month</div>
            <div className="v">{money0(view.thisMonth, cur)}</div>
            <div className="n">
              {view.avgMonth
                ? `${view.thisMonth > view.avgMonth ? '+' : ''}${Math.round(
                    ((view.thisMonth - view.avgMonth) / view.avgMonth) * 100,
                  )}% vs average`
                : 'no history yet'}
            </div>
          </div>
          <div className="tile">
            <div className="k">Per person / month</div>
            <div className="v">{money0(Math.round(view.avgMonth / view.headCount), cur)}</div>
            <div className="n">average across {plural(view.headCount, 'member')}</div>
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Who owes whom"
          caption="net position per member · all time, not filtered by period"
          table={{
            cols: ['Member', 'Net'],
            rows: view.balRows.map((r) => [
              r.label,
              `${r.value > 0 ? 'is owed ' : r.value < 0 ? 'owes ' : ''}${money(Math.abs(r.value), cur)}`,
            ]),
          }}
        >
          <DivBar rows={view.balRows} currency={cur} />
        </ChartCard>

        <ChartCard
          title="Where the money goes"
          caption={`by category, ${periodLabel}`}
          table={{
            cols: ['Category', 'Spend', 'Share'],
            rows: view.byCat.map((r) => [r.label, money(r.value, cur), r.note ?? '']),
          }}
        >
          <HBar rows={view.byCat} currency={cur} aria="Spend by category" />
        </ChartCard>

        <ChartCard
          title="Group spend by month"
          caption="total posted each month"
          table={{
            cols: ['Month', 'Spend'],
            rows: view.byMonth.map((r) => [r.label, money(r.value, cur)]),
          }}
        >
          <ColChart rows={view.byMonth} currency={cur} aria="Group spend by month" />
        </ChartCard>

        <ChartCard
          title="Per person, per month"
          caption={`the same spend divided by ${plural(view.headCount, 'member')}`}
          table={{
            cols: ['Month', 'Per person'],
            rows: view.perHead.map((r) => [r.label, money(r.value, cur)]),
          }}
        >
          <LineChart
            rows={view.perHead}
            currency={cur}
            aria="Spend per person per month"
          />
        </ChartCard>

        <ChartCard
          title="Cash fronted vs. share"
          caption="who carries the group's cash flow"
          legend={[
            { label: 'Cash fronted', color: 'var(--s1)' },
            { label: 'Their share of spending', color: 'var(--s2)' },
          ]}
          table={{
            cols: ['Member', 'Fronted', 'Their share', 'Difference'],
            rows: view.paidVsShare.map((r) => [
              r.label,
              money(r.paid, cur),
              money(r.share, cur),
              `${r.paid - r.share > 0 ? '+' : ''}${money(r.paid - r.share, cur)}`,
            ]),
          }}
        >
          <GroupedBar rows={view.paidVsShare} currency={cur} />
        </ChartCard>

        <ChartCard
          title="Largest single expenses"
          caption={`top ${Math.min(8, view.top.length)} in this period`}
          table={{
            cols: ['Expense', 'Amount', 'Detail'],
            rows: view.top.map((r) => [r.label, money(r.value, cur), r.note ?? '']),
          }}
        >
          <HBar rows={view.top} currency={cur} aria="Largest expenses" />
        </ChartCard>
      </div>
    </>
  );
}
