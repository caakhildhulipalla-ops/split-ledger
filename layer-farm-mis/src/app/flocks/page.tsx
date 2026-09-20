'use client';

/**
 * Flocks, vaccination and the gate log.
 *
 * The flock is the unit that carries production, feed, cost and profit, so
 * this is where a farmer comes to ask whether a particular batch of birds is
 * worth what it is eating. Vaccination and the gate log sit alongside because
 * both are things done *to a flock* on a date, and both are asked for at an
 * inspection.
 */

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  Banner, Card, Chips, DayInput, Field, Icon, Item, KeyValue, Money, Pill, SectionTitle, Sheet, Spark, TextInput, TopBar, num, ratio,
} from '@/components/ui';
import { addDays, ageInWeeks, daysBetween, formatDay, formatDayShort, lastNDays, today } from '@/domain/dates';
import { totalEggs } from '@/domain/production';
import { flockReport } from '@/lib/report';
import { useFarmScope, useMasters, usePermissions, useRecentLedger } from '@/lib/hooks';
import { useData } from '@/lib/store';
import { tap } from '@/lib/native';
import type { Flock } from '@/lib/types';

type Tab = 'flocks' | 'vaccination' | 'gate';

export default function FlocksPage() {
  return <AppShell><Flocks /></AppShell>;
}

function Flocks() {
  const { flocks, sheds, farms } = useMasters();
  const permissions = usePermissions();
  const [farmId] = useFarmScope();
  const [tab, setTab] = useState<Tab>('flocks');
  const [open, setOpen] = useState<Flock | null>(null);
  const [sheet, setSheet] = useState<'vaccination' | 'gate' | null>(null);

  const day = today();
  const ledger = useRecentLedger(31, day);
  const inScope = flocks.filter((f) => !farmId || f.farmId === farmId);

  return (
    <>
      <TopBar title="Flocks" sub={farmId ? farms.find((f) => f.id === farmId)?.name : 'All farms'} />
      <div className="page">
        <div style={{ marginTop: 10 }}>
          <Chips value={tab} onChange={setTab} options={[
            { value: 'flocks', label: 'Flocks' },
            { value: 'vaccination', label: 'Vaccination' },
            { value: 'gate', label: 'Gate log' },
          ]} />
        </div>

        {tab === 'flocks' && (
          <>
            {inScope.length === 0 ? (
              <div className="empty" style={{ marginTop: 30 }}>
                <h3>No flocks yet</h3>
                <p>A flock is a batch of birds in a shed. Everything the app measures hangs off one.</p>
              </div>
            ) : (
              <div className="card list mt-sm" style={{ padding: 0 }}>
                {inScope.map((flock) => {
                  const report = flockReport(ledger, flock.id, addDays(day, -30), day);
                  const shed = sheds.find((s) => s.id === flock.shedId);
                  return (
                    <Item
                      key={flock.id}
                      title={flock.name}
                      meta={`${shed?.name ?? 'Shed'} · ${ageInWeeks(flock.placedOn, day)} weeks · ${num(report?.liveBirds ?? 0)} birds`}
                      value={flock.phase === 'rearing'
                        ? <Pill tone="accent">Rearing</Pill>
                        : ratio(report?.days.at(-1)?.henDay ?? null, 1, '%')}
                      sub={flock.phase === 'laying' ? 'hen-day' : undefined}
                      onClick={() => setOpen(flock)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'vaccination' && <VaccinationList farmId={farmId} onAdd={() => setSheet('vaccination')} />}
        {tab === 'gate' && <GateList farmId={farmId} onAdd={() => setSheet('gate')} />}
      </div>

      {tab !== 'flocks' && (
        <button className="fab" onClick={() => setSheet(tab === 'gate' ? 'gate' : 'vaccination')}>
          <Icon.plus size={19} />
          {tab === 'gate' ? 'Log a vehicle' : 'Record vaccination'}
        </button>
      )}

      {open && <FlockSheet flock={open} onClose={() => setOpen(null)} />}
      {sheet === 'vaccination' && <VaccinationSheet farmId={farmId} onClose={() => setSheet(null)} />}
      {sheet === 'gate' && <GateSheet farmId={farmId} onClose={() => setSheet(null)} />}
    </>
  );
}

/* ------------------------------------------------------- flock report */

function FlockSheet({ flock, onClose }: { flock: Flock; onClose: () => void }) {
  const day = today();
  const ledger = useRecentLedger(31, day);
  const { money } = usePermissions();
  const { shedOf } = useMasters();
  const report = flockReport(ledger, flock.id, addDays(day, -30), day);
  const trend = lastNDays(14, day).map((d) => ledger.days.get(d)?.get(flock.id)?.henDay ?? null);

  if (!report) return null;
  const last = report.days.at(-1);

  return (
    <Sheet open onClose={onClose} title={flock.name}
      sub={`${shedOf(flock.shedId)?.name ?? ''} · placed ${formatDay(flock.placedOn)}`}>
      <div className="stack">
        <Card>
          <KeyValue rows={[
            { k: 'Age', v: `${ageInWeeks(flock.placedOn, day)} weeks` },
            { k: 'Birds placed', v: num(flock.opening?.liveBirds ?? flock.birdsPlaced) },
            { k: 'Live birds', v: num(report.liveBirds) },
            { k: 'Cumulative mortality', v: ratio(report.cumulativeMortality, 2, '%') },
            { k: 'Hen-day today', v: ratio(last?.henDay ?? null, 1, '%') },
            { k: 'Peak hen-day', v: ratio(report.peakHenDay, 1, '%') },
            { k: 'Source', v: flock.source === 'own-reared' ? 'Own-reared' : 'Bought pullet' },
            { k: 'Phase', v: flock.phase },
          ]} />
        </Card>

        <SectionTitle>Hen-day, last 14 days</SectionTitle>
        <Card>
          <Spark values={trend} height={54} tone="good" />
        </Card>

        <SectionTitle>Last 30 days</SectionTitle>
        <Card>
          <KeyValue rows={[
            { k: 'Eggs produced', v: num(totalEggs(report.totals.eggs)) },
            { k: '— 50 g and above', v: num(report.totals.eggs.gradeA) },
            { k: '— under 50 g', v: num(report.totals.eggs.gradeB) },
            { k: '— broken', v: num(report.totals.eggs.broken) },
            { k: 'Feed eaten', v: `${num(report.totals.feedGrams / 1000)} kg` },
            { k: 'Feed per dozen', v: report.totals.feedGrams > 0 && totalEggs(report.totals.eggs) > 0
                ? `${(report.totals.feedGrams / 1000 / (totalEggs(report.totals.eggs) / 12)).toFixed(3)} kg`
                : '—' },
          ]} />
        </Card>

        {money && (
          <>
            <SectionTitle>Profit, last 30 days</SectionTitle>
            <Card>
              <KeyValue rows={[
                { k: 'Revenue', v: <Money paise={report.totals.revenue.total} /> },
                { k: 'Feed cost', v: <Money paise={report.totals.cost.feed} /> },
                { k: 'Overheads', v: <Money paise={report.totals.cost.overhead} /> },
                { k: 'Pullet cost', v: <Money paise={report.totals.cost.pullet} /> },
                { k: 'Medicine', v: <Money paise={report.totals.cost.medicine} /> },
                { k: 'Profit', v: <Money paise={report.totals.profit} /> },
                { k: 'Cost per egg', v: report.totals.costPerEgg === null ? '—' : `₹${(report.totals.costPerEgg / 100).toFixed(2)}` },
              ]} />
            </Card>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------- vaccination */

function VaccinationList({ farmId, onAdd }: { farmId: string | null; onAdd: () => void }) {
  const { list, update } = useData();
  const { shedOf } = useMasters();
  const day = today();

  const rows = list('vaccination')
    .filter((v) => !farmId || v.farmId === farmId)
    .sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1));

  const pending = rows.filter((v) => !v.givenOn);
  const done = rows.filter((v) => v.givenOn).slice(0, 15);

  if (rows.length === 0) {
    return (
      <div className="empty">
        <h3>No vaccinations scheduled</h3>
        <p>The standard layer schedule is in Setup. Copy it to a flock to get reminders.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Record one</button></div>
      </div>
    );
  }

  return (
    <>
      {pending.length > 0 && (
        <>
          <SectionTitle>Due</SectionTitle>
          <div className="card list" style={{ padding: 0 }}>
            {pending.map((v) => {
              const away = daysBetween(day, v.dueOn);
              return (
                <Item
                  key={v.id}
                  title={v.vaccine}
                  meta={`${shedOf(v.shedId)?.name ?? 'Shed'} · ${v.route}`}
                  value={away < 0
                    ? <Pill tone="bad">{Math.abs(away)}d late</Pill>
                    : away === 0 ? <Pill tone="warn">Today</Pill> : <Pill>{away}d</Pill>}
                  onClick={() => void update(v.id, { givenOn: day })}
                />
              );
            })}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>Tap one to mark it given today.</p>
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionTitle>Given</SectionTitle>
          <div className="card list" style={{ padding: 0 }}>
            {done.map((v) => (
              <Item key={v.id} title={v.vaccine}
                    meta={`${shedOf(v.shedId)?.name ?? 'Shed'} · ${formatDayShort(v.givenOn!)}`}
                    value={<Icon.check size={17} />} chevron={false} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function VaccinationSheet({ farmId, onClose }: { farmId: string | null; onClose: () => void }) {
  const { create } = useData();
  const { flocks, shedOf } = useMasters();
  const candidates = flocks.filter((f) => (!farmId || f.farmId === farmId) && f.phase !== 'closed');

  const [flockId, setFlockId] = useState(candidates[0]?.id ?? '');
  const [vaccine, setVaccine] = useState('');
  const [route, setRoute] = useState('Drinking water');
  const [dueOn, setDueOn] = useState(today());
  const [given, setGiven] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flock = candidates.find((f) => f.id === flockId);

  const save = async () => {
    if (!flock) { setError('Pick a flock.'); return; }
    if (!vaccine.trim()) { setError('Name the vaccine.'); return; }
    setBusy(true);
    try {
      await create('vaccination', {
        farmId: flock.farmId, shedId: flock.shedId, flockId: flock.id,
        vaccine: vaccine.trim(), route, dueOn,
        givenOn: given ? dueOn : null, itemId: null, notes: '',
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Vaccination"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="stack">
        <Field label="Flock">
          <select className="select" value={flockId} onChange={(e) => setFlockId(e.target.value)}>
            {candidates.map((f) => (
              <option key={f.id} value={f.id}>{f.name} — {shedOf(f.shedId)?.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Vaccine"><TextInput value={vaccine} onChange={setVaccine} placeholder="Lasota" autoFocus /></Field>
        <Field label="Route">
          <select className="select" value={route} onChange={(e) => setRoute(e.target.value)}>
            {['Drinking water', 'Eye drop', 'Subcutaneous', 'Intramuscular', 'Wing web', 'Spray'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Date"><DayInput value={dueOn} onChange={setDueOn} /></Field>
        <label className="row" style={{ gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={given} onChange={(e) => setGiven(e.target.checked)}
                 style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          <span className="grow">Already given</span>
        </label>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- gate log */

function GateList({ farmId, onAdd }: { farmId: string | null; onAdd: () => void }) {
  const { list } = useData();
  const logs = list('gate-log')
    .filter((g) => !farmId || g.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 40);

  if (logs.length === 0) {
    return (
      <div className="empty">
        <h3>Nothing logged at the gate</h3>
        <p>A record of every vehicle in and out, and whether it was disinfected.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Log a vehicle</button></div>
      </div>
    );
  }

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {logs.map((g) => (
        <Item
          key={g.id}
          title={g.vehicleNo}
          meta={`${formatDayShort(g.day)} · ${g.purpose}${g.driver ? ` · ${g.driver}` : ''}`}
          value={g.disinfected ? <Pill tone="good">Sprayed</Pill> : <Pill tone="warn">Not sprayed</Pill>}
          chevron={false}
        />
      ))}
    </div>
  );
}

function GateSheet({ farmId, onClose }: { farmId: string | null; onClose: () => void }) {
  const { create } = useData();
  const { farms } = useMasters();
  const [selectedFarm, setSelectedFarm] = useState(farmId ?? farms[0]?.id ?? '');
  const [day, setDay] = useState(today());
  const [vehicleNo, setVehicleNo] = useState('');
  const [driver, setDriver] = useState('');
  const [purpose, setPurpose] = useState('Egg collection');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [disinfected, setDisinfected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!vehicleNo.trim()) { setError('Enter the vehicle number.'); return; }
    setBusy(true);
    try {
      await create('gate-log', {
        farmId: selectedFarm, day,
        vehicleNo: vehicleNo.trim().toUpperCase(), driver: driver.trim(),
        purpose, timeIn, timeOut, disinfected, notes: '',
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Gate vehicle log"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="stack">
        {farms.length > 1 && (
          <Field label="Farm">
            <select className="select" value={selectedFarm} onChange={(e) => setSelectedFarm(e.target.value)}>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>
        <Field label="Vehicle number"><TextInput value={vehicleNo} onChange={setVehicleNo} placeholder="AP 04 TX 8821" autoFocus /></Field>
        <Field label="Driver"><TextInput value={driver} onChange={setDriver} placeholder="Name" /></Field>
        <Field label="Purpose">
          <select className="select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {['Egg collection', 'Feed delivery', 'Bird movement', 'Manure removal', 'Visitor', 'Other'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Time in">
            <input className="input num" type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
          </Field>
          <Field label="Time out">
            <input className="input num" type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
          </Field>
        </div>
        <label className="row" style={{ gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={disinfected} onChange={(e) => setDisinfected(e.target.checked)}
                 style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          <span className="grow">Disinfected on entry</span>
        </label>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}
