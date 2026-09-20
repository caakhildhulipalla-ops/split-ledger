'use client';

/**
 * Money: what the eggs fetched, what the farm spent, and what is left.
 *
 * Revenue here is recognised on production, not on dispatch — a trader's lorry
 * coming on Tuesday and Friday should not make Monday look like a disaster and
 * Tuesday like a windfall. The dispatch screen still records exactly what left
 * and what it invoiced, and the P&L tab shows both figures side by side so a
 * drifting rate card cannot hide.
 */

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  Banner, Card, Chips, DayInput, Field, Icon, Item, KeyValue, Money, MoneyInput,
  NumberInput, QtyInput, SectionTitle, Sheet, TextArea, TopBar, num, } from '@/components/ui';
import { formatDayShort, lastNDays, today } from '@/domain/dates';
import { formatRupees, parseRupees } from '@/domain/money';
import { dispatchValue, salesTrueUp } from '@/domain/costing';
import { toBase } from '@/domain/units';
import { totalEggs } from '@/domain/production';
import { eggStock, summariseFarm, valuedVsInvoiced } from '@/lib/report';
import { unitOptions, useFarmScope, useMasters, usePermissions, useRecentLedger, useUnits } from '@/lib/hooks';
import { useData } from '@/lib/store';
import { tap } from '@/lib/native';
import { rateFor } from '@/lib/report';

type Tab = 'pnl' | 'dispatch' | 'expenses' | 'income';

export default function MoneyPage() {
  return <AppShell><MoneyScreen /></AppShell>;
}

function MoneyScreen() {
  const { farms } = useMasters();
  const permissions = usePermissions();
  const [farmId] = useFarmScope();
  const [tab, setTab] = useState<Tab>('pnl');
  const [sheet, setSheet] = useState<Tab | null>(null);

  const day = today();
  const ledger = useRecentLedger(31, day);
  const activeFarm = farmId ?? farms[0]?.id ?? null;

  if (!permissions.money) {
    return (
      <>
        <TopBar title="Money" />
        <div className="page">
          <div className="empty" style={{ marginTop: 40 }}>
            <h3>Not shown to supervisors</h3>
            <p>Prices, costs and profit are the owner’s to see.</p>
          </div>
        </div>
      </>
    );
  }

  if (!activeFarm) {
    return (
      <>
        <TopBar title="Money" />
        <div className="page"><div className="empty" style={{ marginTop: 40 }}><h3>No farm set up yet</h3></div></div>
      </>
    );
  }

  const farmName = farms.find((f) => f.id === activeFarm)?.name ?? 'Farm';

  return (
    <>
      <TopBar title="Money" sub={farmName} />
      <div className="page">
        <div style={{ marginTop: 10 }}>
          <Chips value={tab} onChange={setTab} options={[
            { value: 'pnl', label: 'P&L' },
            { value: 'dispatch', label: 'Dispatch' },
            { value: 'expenses', label: 'Expenses' },
            { value: 'income', label: 'Other income' },
          ]} />
        </div>

        {tab === 'pnl' && <Pnl farmId={activeFarm} />}
        {tab === 'dispatch' && <DispatchList farmId={activeFarm} onAdd={() => setSheet('dispatch')} />}
        {tab === 'expenses' && <ExpenseList farmId={activeFarm} onAdd={() => setSheet('expenses')} />}
        {tab === 'income' && <IncomeList farmId={activeFarm} onAdd={() => setSheet('income')} />}
      </div>

      {tab !== 'pnl' && (
        <button className="fab" onClick={() => setSheet(tab)}>
          <Icon.plus size={19} />
          {tab === 'dispatch' ? 'Dispatch eggs' : tab === 'expenses' ? 'Add expense' : 'Add income'}
        </button>
      )}

      {sheet === 'dispatch' && <DispatchSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
      {sheet === 'expenses' && <ExpenseSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
      {sheet === 'income' && <IncomeSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
    </>
  );
}

/* ----------------------------------------------------------------- P&L */

function Pnl({ farmId }: { farmId: string }) {
  const day = today();
  const ledger = useRecentLedger(31, day);
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');

  const days = range === 'today' ? [day] : lastNDays(range === 'week' ? 7 : 30, day);
  const totals = days
    .map((d) => summariseFarm(ledger, d, farmId))
    .reduce((acc, s) => ({
      revenue: acc.revenue + s.revenue,
      cost: acc.cost + s.cost,
      profit: acc.profit + s.profit,
      eggs: acc.eggs + totalEggs(s.eggs),
      feed: acc.feed + s.costParts.feed,
      overhead: acc.overhead + s.costParts.overhead,
      pullet: acc.pullet + s.costParts.pullet,
      medicine: acc.medicine + s.costParts.medicine,
    }), { revenue: 0, cost: 0, profit: 0, eggs: 0, feed: 0, overhead: 0, pullet: 0, medicine: 0 });

  const trueUp = valuedVsInvoiced(ledger, farmId, days[0]!, days[days.length - 1]!);
  const comparison = salesTrueUp(trueUp.valued, trueUp.invoiced);
  const stock = eggStock(ledger, farmId, day);

  return (
    <>
      <div style={{ marginTop: 10 }}>
        <Chips value={range} onChange={setRange} options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: '7 days' },
          { value: 'month', label: '30 days' },
        ]} />
      </div>

      <Card className="mt-sm">
        <div className="row-between" style={{ alignItems: 'baseline' }}>
          <span className="dim small">Profit</span>
          <span className={`num ${totals.profit >= 0 ? 'figure good' : 'figure bad'}`} style={{ fontSize: '1.5rem' }}>
            {formatRupees(totals.profit, { paise: false })}
          </span>
        </div>
        <div className="mt-sm">
          <KeyValue rows={[
            { k: 'Revenue', v: <Money paise={totals.revenue} /> },
            { k: 'Cost', v: <Money paise={totals.cost} /> },
            { k: 'Eggs produced', v: num(totals.eggs) },
            { k: 'Cost per egg', v: totals.eggs > 0 ? `₹${(totals.cost / totals.eggs / 100).toFixed(2)}` : '—' },
            { k: 'Margin per egg', v: totals.eggs > 0 ? `₹${(totals.profit / totals.eggs / 100).toFixed(2)}` : '—' },
          ]} />
        </div>
      </Card>

      <SectionTitle>Where the cost went</SectionTitle>
      <Card>
        <KeyValue rows={[
          { k: 'Feed', v: <Money paise={totals.feed} /> },
          { k: 'Overheads allocated', v: <Money paise={totals.overhead} /> },
          { k: 'Pullet cost released', v: <Money paise={totals.pullet} /> },
          { k: 'Medicines and vaccines', v: <Money paise={totals.medicine} /> },
        ]} />
      </Card>

      <SectionTitle>Valued against invoiced</SectionTitle>
      <Card>
        <KeyValue rows={[
          { k: 'Production valued at rate', v: <Money paise={comparison.valued} /> },
          { k: 'Dispatches invoiced', v: <Money paise={comparison.invoiced} /> },
          { k: 'Difference', v: <Money paise={comparison.difference} sign /> },
          { k: 'Eggs in stock', v: num(stock.total) },
        ]} />
        <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
          Revenue is booked as eggs are laid, so daily profit reflects the day’s
          farming rather than the lorry’s timetable. A gap that keeps growing
          means the rate card needs correcting.
        </p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------ dispatch */

function DispatchList({ farmId, onAdd }: { farmId: string; onAdd: () => void }) {
  const { list } = useData();
  const parties = new Map(list('party').map((p) => [p.id, p]));
  const dispatches = list('dispatch')
    .filter((d) => d.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 40);

  if (dispatches.length === 0) {
    return (
      <div className="empty">
        <h3>No dispatches recorded</h3>
        <p>Record what leaves the farm so egg stock and revenue tie up.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Dispatch eggs</button></div>
      </div>
    );
  }

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {dispatches.map((d) => {
        const sent = d.lines.reduce((s, l) => s + l.qtySent, 0);
        const value = d.lines.reduce((s, l) => s + dispatchValue(l.qtyReceived || l.qtySent, l.ratePer100), 0);
        return (
          <Item
            key={d.id}
            title={parties.get(d.customerId ?? '')?.name ?? 'Customer'}
            meta={`${formatDayShort(d.day)} · ${num(sent)} eggs${d.transitBreakage > 0 ? ` · ${d.transitBreakage} broke` : ''}`}
            value={formatRupees(value, { paise: false })}
            chevron={false}
          />
        );
      })}
    </div>
  );
}

function DispatchSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const { farmOf } = useMasters();
  const ledger = useRecentLedger(1, today());
  const customers = list('party').filter((p) => p.kind === 'customer');
  const vehicles = list('party').filter((p) => p.kind === 'vehicle');

  const farm = farmOf(farmId);
  const card = rateFor(ledger.data, farm, today());
  const defaultA = Math.max(0, card.zoneRatePer100 + card.farmGateAdjust);
  const defaultB = Math.max(0, defaultA - card.smallEggGap);

  const [day, setDay] = useState(today());
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const [sentA, setSentA] = useState('');
  const [sentB, setSentB] = useState('');
  const [receivedA, setReceivedA] = useState('');
  const [receivedB, setReceivedB] = useState('');
  const [rateA, setRateA] = useState(String(defaultA / 100));
  const [rateB, setRateB] = useState(String(defaultB / 100));
  const [breakage, setBreakage] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stock = eggStock(ledger, farmId, day);
  const n = (s: string) => Math.max(0, Math.round(Number(s) || 0));
  const rA = parseRupees(rateA) ?? 0;
  const rB = parseRupees(rateB) ?? 0;
  const value = dispatchValue(n(receivedA) || n(sentA), rA) + dispatchValue(n(receivedB) || n(sentB), rB);

  const save = async () => {
    if (n(sentA) + n(sentB) <= 0) { setError('Enter how many eggs went out.'); return; }
    setBusy(true);
    try {
      await create('dispatch', {
        farmId, day, customerId: customerId || null, vehicleId: vehicleId || null, driverId: null,
        lines: [
          { grade: 'A' as const, qtySent: n(sentA), qtyReceived: n(receivedA) || n(sentA), ratePer100: rA },
          { grade: 'B' as const, qtySent: n(sentB), qtyReceived: n(receivedB) || n(sentB), ratePer100: rB },
        ].filter((l) => l.qtySent > 0),
        transitBreakage: n(breakage),
        notes: notes.trim(),
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Egg dispatch"
      sub={`${num(stock.total)} eggs in stock`}
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save dispatch'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>
        <Field label="Customer">
          <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Not recorded</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <SectionTitle>50 g and above</SectionTitle>
        <div className="grid-3">
          <Field label="Sent"><NumberInput value={sentA} onChange={setSentA} decimal={false} autoFocus /></Field>
          <Field label="Received"><NumberInput value={receivedA} onChange={setReceivedA} decimal={false} /></Field>
          <Field label="₹ per 100"><NumberInput value={rateA} onChange={setRateA} /></Field>
        </div>

        <SectionTitle>Under 50 g</SectionTitle>
        <div className="grid-3">
          <Field label="Sent"><NumberInput value={sentB} onChange={setSentB} decimal={false} /></Field>
          <Field label="Received"><NumberInput value={receivedB} onChange={setReceivedB} decimal={false} /></Field>
          <Field label="₹ per 100"><NumberInput value={rateB} onChange={setRateB} /></Field>
        </div>

        <div className="grid-2">
          <Field label="Broke in transit" hint="Recorded, not deducted.">
            <NumberInput value={breakage} onChange={setBreakage} decimal={false} />
          </Field>
          <Field label="Vehicle">
            <select className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Not recorded</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration || v.name}</option>)}
            </select>
          </Field>
        </div>

        <Card>
          <div className="row-between">
            <span className="dim small">Invoice value</span>
            <span className="num strong">{formatRupees(value, { paise: false })}</span>
          </div>
        </Card>

        {n(sentA) + n(sentB) > stock.total && (
          <Banner tone="warn">
            That is more than the {num(stock.total)} eggs the records show in stock.
          </Banner>
        )}

        <Field label="Notes"><TextArea value={notes} onChange={setNotes} placeholder="Optional" /></Field>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ expenses */

function ExpenseList({ farmId, onAdd }: { farmId: string; onAdd: () => void }) {
  const { list } = useData();
  const heads = new Map(list('head').map((h) => [h.id, h]));
  const expenses = list('expense')
    .filter((e) => e.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 50);

  if (expenses.length === 0) {
    return (
      <div className="empty">
        <h3>No expenses recorded</h3>
        <p>Every cost entered here reaches a flock, which is what makes flock profit real.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Add an expense</button></div>
      </div>
    );
  }

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {expenses.map((e) => (
        <Item
          key={e.id}
          title={heads.get(e.headId)?.name ?? 'Expense'}
          meta={e.from === e.to
            ? formatDayShort(e.day)
            : `${formatDayShort(e.from)} – ${formatDayShort(e.to)}`}
          value={formatRupees(e.amount, { paise: false })}
          chevron={false}
        />
      ))}
    </div>
  );
}

function ExpenseSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const { shedsOf, flocks } = useMasters();
  const heads = list('head').filter((h) => h.kind === 'expense' && h.active);
  const sheds = shedsOf(farmId);

  const [day, setDay] = useState(today());
  const [headId, setHeadId] = useState(heads[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [spread, setSpread] = useState(false);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [shedId, setShedId] = useState('');
  const [flockId, setFlockId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paise = parseRupees(amount);
  const days = spread ? Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1) : 1;

  const save = async () => {
    if (!headId) { setError('Pick a head.'); return; }
    if (paise === null || paise <= 0) { setError('Enter the amount.'); return; }
    setBusy(true);
    try {
      await create('expense', {
        farmId, day, headId, amount: paise,
        from: spread ? from : day, to: spread ? to : day,
        shedId: shedId || null, flockId: flockId || null, partyId: null,
        notes: notes.trim(),
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Expense"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={(v) => { setDay(v); if (!spread) { setFrom(v); setTo(v); } }} max={today()} /></Field>
        <Field label="Head">
          <select className="select" value={headId} onChange={(e) => setHeadId(e.target.value)}>
            {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>

        <label className="row" style={{ gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)}
                 style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          <span className="grow">This covers a period, not one day</span>
        </label>

        {spread && (
          <>
            <div className="grid-2">
              <Field label="From"><DayInput value={from} onChange={setFrom} /></Field>
              <Field label="To"><DayInput value={to} onChange={setTo} /></Field>
            </div>
            {paise !== null && paise > 0 && (
              <Banner tone="info">
                {formatRupees(Math.round(paise / days), { paise: false })} a day across {days} days,
                split between flocks by how many birds were alive each day.
              </Banner>
            )}
          </>
        )}

        <Field label="Charge to" hint="Leave as the whole farm unless it belongs to one shed or flock.">
          <select className="select" value={flockId ? `flock:${flockId}` : shedId ? `shed:${shedId}` : ''}
                  onChange={(e) => {
                    const [kind, id] = e.target.value.split(':');
                    setShedId(kind === 'shed' ? (id ?? '') : '');
                    setFlockId(kind === 'flock' ? (id ?? '') : '');
                  }}>
            <option value="">Whole farm</option>
            {sheds.map((s) => <option key={s.id} value={`shed:${s.id}`}>{s.name}</option>)}
            {flocks.filter((f) => f.farmId === farmId && f.phase !== 'closed')
              .map((f) => <option key={f.id} value={`flock:${f.id}`}>{f.name} (flock)</option>)}
          </select>
        </Field>

        <Field label="Notes"><TextArea value={notes} onChange={setNotes} placeholder="Optional" /></Field>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------- other income */

function IncomeList({ farmId, onAdd }: { farmId: string; onAdd: () => void }) {
  const { list } = useData();
  const heads = new Map(list('head').map((h) => [h.id, h]));
  const income = list('other-income')
    .filter((i) => i.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 40);

  if (income.length === 0) {
    return (
      <div className="empty">
        <h3>No other income yet</h3>
        <p>Spent hens, manure, empty bags and trays all belong here.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Add income</button></div>
      </div>
    );
  }

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {income.map((i) => (
        <Item
          key={i.id}
          title={heads.get(i.headId)?.name ?? 'Income'}
          meta={formatDayShort(i.day)}
          value={formatRupees(i.amount, { paise: false })}
          chevron={false}
        />
      ))}
    </div>
  );
}

function IncomeSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const { flocks } = useMasters();
  const units = useUnits();
  const heads = list('head').filter((h) => h.kind === 'income' && h.active && !h.name.startsWith('Eggs sold'));

  const [day, setDay] = useState(today());
  const [headId, setHeadId] = useState(heads[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('piece');
  const [amount, setAmount] = useState('');
  const [flockId, setFlockId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paise = parseRupees(amount);

  const save = async () => {
    if (paise === null || paise <= 0) { setError('Enter the amount received.'); return; }
    setBusy(true);
    try {
      await create('other-income', {
        farmId, day, headId,
        qty: toBase(qty, unit, units) ?? 0, enteredUnit: unit,
        amount: paise, flockId: flockId || null, partyId: null, notes: notes.trim(),
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Other income"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>
        <Field label="Head">
          <select className="select" value={headId} onChange={(e) => setHeadId(e.target.value)}>
            {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="Quantity" hint="Optional — tonnes of manure, number of birds, and so on.">
          <QtyInput value={qty} onChange={setQty} unit={unit} onUnitChange={setUnit}
                    units={[...unitOptions(units, 'count'), ...unitOptions(units, 'mass')]} />
        </Field>
        <Field label="Amount received"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Credit to flock" hint="Spent hens belong to the flock that was sold.">
          <select className="select" value={flockId} onChange={(e) => setFlockId(e.target.value)}>
            <option value="">Whole farm</option>
            {flocks.filter((f) => f.farmId === farmId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Notes"><TextArea value={notes} onChange={setNotes} placeholder="Optional" /></Field>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}
