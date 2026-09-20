'use client';

/**
 * The owner's dashboard.
 *
 * "The owner's dashboard must show these four before anything else: feed
 * consumption, egg production %, feed inventory, and per-day P&L including all
 * expenses and revenue." They are the first four tiles, in that order, above
 * everything else on the screen.
 *
 * Each tile carries a seven-day trend and drills down. Nothing here is stored:
 * every figure is recomputed from the farm's records on each render, so a
 * correction made anywhere in the app shows up here immediately.
 */

import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  Banner, Bars, Card, Delta, Icon, Item, KeyValue, Money, Pill, SectionTitle,
  Spark, Tile, TopBar, num, ratio,
} from '@/components/ui';
import { addDays, formatDay, lastNDays, today } from '@/domain/dates';
import { totalEggs } from '@/domain/production';
import { formatRupees } from '@/domain/money';
import { useAlerts, useFarmScope, useMasters, useRecentLedger, useTodayAndYesterday } from '@/lib/hooks';
import { eggStock, feedInventory, series, summariseFarm, summariseShed } from '@/lib/report';
import { useData } from '@/lib/store';

export default function DashboardPage() {
  return <AppShell><Dashboard /></AppShell>;
}

function Dashboard() {
  const router = useRouter();
  const { session } = useData();
  const { farms, shedsOf } = useMasters();
  const [farmId, setFarmId] = useFarmScope();

  const day = today();
  const ledger = useRecentLedger(14, day);
  const { today: now, yesterday } = useTodayAndYesterday(ledger, farmId, day);
  const alerts = useAlerts(ledger, farmId);

  const week = lastNDays(7, day);
  const trend = series(ledger, week, (f) => !farmId || f.farmId === farmId);

  const scopeName = farmId ? farms.find((f) => f.id === farmId)?.name ?? 'Farm' : 'All farms';
  const inventory = farmId
    ? feedInventory(ledger, farmId, day, 7)
    : farms.reduce((acc, farm) => {
        const one = feedInventory(ledger, farm.id, day, 7);
        return {
          feedGrams: acc.feedGrams + one.feedGrams,
          rawGrams: acc.rawGrams + one.rawGrams,
          shedGrams: acc.shedGrams + one.shedGrams,
          valuePaise: acc.valuePaise + one.valuePaise,
          costPerKg: one.costPerKg || acc.costPerKg,
          avgDailyGrams: acc.avgDailyGrams + one.avgDailyGrams,
          coverDays: null as number | null,
        };
      }, { feedGrams: 0, rawGrams: 0, shedGrams: 0, valuePaise: 0, costPerKg: 0, avgDailyGrams: 0, coverDays: null as number | null });

  // A combined cover figure only makes sense once the usage is summed.
  const coverDays = farmId
    ? inventory.coverDays
    : inventory.avgDailyGrams > 0
      ? (inventory.feedGrams + inventory.shedGrams) / inventory.avgDailyGrams
      : null;

  const eggs = eggStock(ledger, farmId, day);
  const henDayDelta = now.henDay !== null && yesterday.henDay !== null ? now.henDay - yesterday.henDay : null;
  const feedDelta = now.feedPerBird !== null && yesterday.feedPerBird !== null ? now.feedPerBird - yesterday.feedPerBird : null;

  const noData = now.flocks === 0;

  return (
    <>
      <TopBar
        title={scopeName}
        sub={`${formatDay(day)} · ${session?.userName ?? ''}`}
        right={<SyncBadge />}
      />

      <div className="page">
        {farms.length > 1 && (
          <div className="chips" style={{ marginTop: 10 }}>
            <button className="chip" aria-pressed={farmId === null} onClick={() => setFarmId(null)}>All farms</button>
            {farms.map((farm) => (
              <button key={farm.id} className="chip" aria-pressed={farmId === farm.id} onClick={() => setFarmId(farm.id)}>
                {farm.name}
              </button>
            ))}
          </div>
        )}

        {alerts.length > 0 && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            {alerts.slice(0, 3).map((alert) => (
              <Banner key={alert.key} tone={alert.severity === 'critical' ? 'bad' : alert.severity === 'warn' ? 'warn' : 'info'} title={alert.title}>
                {alert.detail}
              </Banner>
            ))}
            {alerts.length > 3 && (
              <button className="btn ghost sm" onClick={() => router.push('/more/alerts')}>
                {alerts.length - 3} more alert{alerts.length - 3 === 1 ? '' : 's'}
              </button>
            )}
          </div>
        )}

        {noData ? (
          <div className="empty" style={{ marginTop: 30 }}>
            <h3>Nothing recorded for today yet</h3>
            <p>Once a shed entry is in, this screen fills with the day’s production, feed and profit.</p>
            <div className="mt">
              <button className="btn primary" onClick={() => router.push('/entry')}>Record a shed entry</button>
            </div>
          </div>
        ) : (
          <>
            {/* ---- the day-one four, in the order the requirements name them ---- */}
            <div className="tiles" style={{ marginTop: 14 }}>
              <Tile
                label="Feed today"
                figure={num(now.feedGrams / 1000)}
                unit="kg"
                foot={<>
                  <span>{ratio(now.feedPerBird, 0, ' g/bird')}</span>
                  <Delta value={feedDelta} suffix=" g" invert />
                </>}
                onClick={() => router.push('/feed')}
              >
                <Spark values={trend.map((d) => (d.feedGrams > 0 ? d.feedGrams / 1000 : null))} height={26} />
              </Tile>

              <Tile
                label="Egg production"
                figure={ratio(now.henDay, 1)}
                unit="%"
                foot={<>
                  <span>{num(totalEggs(now.eggs))} eggs</span>
                  <Delta value={henDayDelta} suffix=" pts" />
                </>}
                onClick={() => router.push('/flocks')}
              >
                <Spark values={trend.map((d) => d.henDay)} height={26} tone="good" />
              </Tile>

              <Tile
                label="Feed inventory"
                figure={num((inventory.feedGrams + inventory.shedGrams) / 1000)}
                unit="kg"
                foot={<span>{coverDays === null ? 'No usage yet' : `${coverDays.toFixed(1)} days of cover`}</span>}
                onClick={() => router.push('/feed')}
              >
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  + {num(inventory.rawGrams / 1000)} kg raw
                </div>
              </Tile>

              <Tile
                label="Profit today"
                figure={formatRupees(now.profit, { paise: false })}
                tone={now.profit >= 0 ? 'good' : 'bad'}
                foot={<span>{now.costPerEgg === null ? '—' : `${(now.costPerEgg / 100).toFixed(2)}/egg cost`}</span>}
                onClick={() => router.push('/money')}
              >
                <Spark
                  values={trend.map((d) => (d.flocks > 0 ? d.profit / 100 : null))}
                  height={26}
                  tone={now.profit >= 0 ? 'good' : 'bad'}
                />
              </Tile>
            </div>

            {/* ------------------------------ supporting figures ------------------------------ */}

            <SectionTitle>Today in detail</SectionTitle>
            <Card>
              <KeyValue rows={[
                { k: 'Revenue', v: <Money paise={now.revenue} /> },
                { k: 'Cost', v: <Money paise={now.cost} /> },
                { k: '— feed', v: <Money paise={now.costParts.feed} /> },
                { k: '— overheads', v: <Money paise={now.costParts.overhead} /> },
                { k: '— pullet cost', v: <Money paise={now.costParts.pullet} /> },
                { k: '— medicine', v: <Money paise={now.costParts.medicine} /> },
                { k: 'Mortality', v: `${num(now.died)} (${ratio(now.mortality, 2, '%')})` },
                { k: 'Feed per dozen', v: now.feedPerDozen === null ? '—' : `${now.feedPerDozen.toFixed(3)} kg` },
                { k: 'Live birds', v: num(now.liveBirds) },
                { k: 'Egg stock', v: `${num(eggs.total)} (${num(eggs.gradeA)} big)` },
              ]} />
            </Card>

            <SectionTitle>Last 7 days</SectionTitle>
            <Card>
              <div className="row-between small dim" style={{ marginBottom: 8 }}>
                <span>Eggs a day</span>
                <span className="num">{num(trend.reduce((s, d) => s + totalEggs(d.eggs), 0))} total</span>
              </div>
              <Bars values={trend.map((d) => totalEggs(d.eggs))} />
              <div className="row-between tiny muted" style={{ marginTop: 6 }}>
                <span>{formatDay(week[0]!).slice(0, 6)}</span>
                <span>Today</span>
              </div>
            </Card>

            {/* ------------------------------------ sheds ------------------------------------ */}

            <SectionTitle>Sheds</SectionTitle>
            <div className="card list" style={{ padding: 0 }}>
              {shedsOf(farmId).map((shed) => {
                const summary = summariseShed(ledger, day, shed.id);
                const recorded = ledger.data.entries.filter((e) => e.shedId === shed.id && e.day === day).length;
                return (
                  <Item
                    key={shed.id}
                    title={shed.name}
                    meta={recorded === 0
                      ? 'No entry today'
                      : `${num(totalEggs(summary.eggs))} eggs · ${num(summary.liveBirds)} birds`}
                    value={ratio(summary.henDay, 1, '%')}
                    sub={recorded < shed.sessionsPerDay
                      ? `${recorded}/${shed.sessionsPerDay} sessions`
                      : `${num(summary.feedGrams / 1000)} kg feed`}
                    onClick={() => router.push(`/flocks?shed=${shed.id}`)}
                  />
                );
              })}
            </div>

            {farms.length > 1 && farmId === null && (
              <>
                <SectionTitle>Farms</SectionTitle>
                <div className="card list" style={{ padding: 0 }}>
                  {farms.map((farm) => {
                    const summary = summariseFarm(ledger, day, farm.id);
                    return (
                      <Item
                        key={farm.id}
                        title={farm.name}
                        meta={`${num(summary.liveBirds)} birds · ${ratio(summary.henDay, 1, '%')}`}
                        value={formatRupees(summary.profit, { paise: false })}
                        sub="profit today"
                        onClick={() => setFarmId(farm.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Pending / synced / offline, in the one place an owner will look for it. */
function SyncBadge() {
  const { queue } = useData();
  const router = useRouter();

  const tone = queue.failed > 0 ? 'bad' : queue.pending > 0 ? 'warn' : 'good';
  const label = queue.failed > 0
    ? `${queue.failed} failed`
    : queue.pending > 0
      ? `${queue.pending} pending`
      : 'Saved';

  return (
    <button className="btn ghost sm" onClick={() => router.push('/more')} aria-label="Sync status">
      <Pill tone={tone === 'good' ? 'good' : tone === 'warn' ? 'warn' : 'bad'}>
        <span className={`sync-dot ${queue.pending > 0 ? 'pending' : 'synced'}`} />
        {label}
      </Pill>
    </button>
  );
}
