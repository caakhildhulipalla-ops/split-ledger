'use client';

/**
 * Feed: what was bought, what was mixed, what went to the sheds, what is left.
 *
 * Four of the twelve entry screens live here because they are one story. A
 * farmer thinking "have I got enough feed" and a farmer thinking "what did
 * that batch cost" are looking at the same pools from two sides, and splitting
 * them across four menu items would hide that.
 *
 * Every quantity is typed in the unit the farm thinks in — bags, quintals —
 * and stored in grams.
 */

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import {
  Banner, Card, Chips, DayInput, Field, Icon, Item, KeyValue, Money, MoneyInput,
  QtyInput, SectionTitle, Sheet, TextInput, TopBar, num,
} from '@/components/ui';
import { formatDayShort, today } from '@/domain/dates';
import { formatRupees, parseRupees } from '@/domain/money';
import { avgCostPerKg, farmLocation, getPool, shedLocation } from '@/domain/stock';
import { mixingLossPercent } from '@/domain/mixing';
import { formatQty, toBase } from '@/domain/units';
import { feedInventory } from '@/lib/report';
import { unitOptions, useFarmScope, useMasters, usePermissions, useRecentLedger, useUnits } from '@/lib/hooks';
import { useData } from '@/lib/store';
import { tap } from '@/lib/native';

type Tab = 'stock' | 'purchases' | 'mixing' | 'issues';

export default function FeedPage() {
  return <AppShell><Feed /></AppShell>;
}

function Feed() {
  const { list } = useData();
  const { farms, shedsOf } = useMasters();
  const permissions = usePermissions();
  const units = useUnits();
  const [farmId] = useFarmScope();

  const [tab, setTab] = useState<Tab>('stock');
  const [sheet, setSheet] = useState<Tab | null>(null);

  const day = today();
  const ledger = useRecentLedger(14, day);
  const activeFarm = farmId ?? farms[0]?.id ?? null;
  const items = list('item');

  const tabs: { value: Tab; label: string }[] = permissions.purchases
    ? [
        { value: 'stock', label: 'Stock' },
        { value: 'purchases', label: 'Purchases' },
        { value: 'mixing', label: 'Mixing' },
        { value: 'issues', label: 'To sheds' },
      ]
    : [
        { value: 'stock', label: 'Stock' },
        { value: 'issues', label: 'To sheds' },
      ];

  if (!activeFarm) {
    return (
      <>
        <TopBar title="Feed" />
        <div className="page">
          <div className="empty" style={{ marginTop: 40 }}>
            <h3>No farm set up yet</h3>
            <p>Add a farm before recording feed.</p>
          </div>
        </div>
      </>
    );
  }

  const inventory = feedInventory(ledger, activeFarm, day, 7);
  const farmName = farms.find((f) => f.id === activeFarm)?.name ?? 'Farm';

  return (
    <>
      <TopBar title="Feed" sub={farmName} />
      <div className="page">
        <div style={{ marginTop: 10 }}>
          <Chips value={tab} onChange={setTab} options={tabs} />
        </div>

        {tab === 'stock' && (
          <>
            <Card className="mt-sm">
              <KeyValue rows={[
                { k: 'Finished feed at the farm', v: `${num(inventory.feedGrams / 1000)} kg` },
                { k: 'Already in the sheds', v: `${num(inventory.shedGrams / 1000)} kg` },
                { k: 'Raw materials', v: `${num(inventory.rawGrams / 1000)} kg` },
                ...(permissions.money ? [
                  { k: 'Stock value', v: <Money paise={inventory.valuePaise} /> },
                  { k: 'Feed cost', v: `${formatRupees(inventory.costPerKg, { paise: false })}/kg` },
                ] : []),
                { k: 'Used a day', v: `${num(inventory.avgDailyGrams / 1000)} kg` },
                { k: 'Days of cover', v: inventory.coverDays === null ? '—' : inventory.coverDays.toFixed(1) },
              ]} />
            </Card>

            {inventory.coverDays !== null && inventory.coverDays < 5 && (
              <div className="mt-sm">
                <Banner tone={inventory.coverDays < 2 ? 'bad' : 'warn'} title="Feed running low">
                  About {inventory.coverDays.toFixed(1)} days left at the current rate of use.
                </Banner>
              </div>
            )}

            <SectionTitle
              action={permissions.purchases
                ? <button className="btn ghost sm" onClick={() => setSheet('stock')}>Count stock</button>
                : undefined}
            >
              At the farm
            </SectionTitle>
            <div className="card list" style={{ padding: 0 }}>
              {items
                .filter((i) => i.category === 'feed' || i.category === 'raw-material')
                .map((item) => {
                  const pool = getPool(ledger.stock, farmLocation(activeFarm), item.id);
                  if (pool.qty === 0 && pool.value === 0) return null;
                  return (
                    <Item
                      key={item.id}
                      title={item.name}
                      meta={permissions.money ? `${formatRupees(avgCostPerKg(pool), { paise: false })}/kg` : undefined}
                      value={formatQty(pool.qty, item.entryUnit, units, { label: false })}
                      sub={units.get(item.entryUnit)?.plural ?? 'kg'}
                      chevron={false}
                    />
                  );
                })}
            </div>

            <SectionTitle>In the sheds</SectionTitle>
            <div className="card list" style={{ padding: 0 }}>
              {shedsOf(activeFarm).map((shed) => {
                const total = items
                  .filter((i) => i.category === 'feed')
                  .reduce((sum, i) => sum + getPool(ledger.stock, shedLocation(shed.id), i.id).qty, 0);
                return (
                  <Item key={shed.id} title={shed.name} value={num(total / 1000)} sub="kg" chevron={false} />
                );
              })}
            </div>
          </>
        )}

        {tab === 'purchases' && <PurchaseList farmId={activeFarm} onAdd={() => setSheet('purchases')} />}
        {tab === 'mixing' && <BatchList farmId={activeFarm} onAdd={() => setSheet('mixing')} />}
        {tab === 'issues' && <IssueList farmId={activeFarm} onAdd={() => setSheet('issues')} />}
      </div>

      {(tab !== 'stock' || permissions.purchases) && (
        <button className="fab" onClick={() => setSheet(tab === 'stock' ? 'purchases' : tab)}>
          <Icon.plus size={19} />
          {tab === 'mixing' ? 'Mix a batch' : tab === 'issues' ? 'Issue feed' : 'Add purchase'}
        </button>
      )}

      {sheet === 'purchases' && <PurchaseSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
      {sheet === 'mixing' && <BatchSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
      {sheet === 'issues' && <IssueSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
      {sheet === 'stock' && <AdjustSheet farmId={activeFarm} onClose={() => setSheet(null)} />}
    </>
  );
}

/* ----------------------------------------------------------- purchases */

function PurchaseList({ farmId, onAdd }: { farmId: string; onAdd: () => void }) {
  const { list } = useData();
  const { money } = usePermissions();
  const units = useUnits();
  const items = new Map(list('item').map((i) => [i.id, i]));
  const parties = new Map(list('party').map((p) => [p.id, p]));

  const purchases = list('feed-purchase')
    .filter((p) => p.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 40);

  if (purchases.length === 0) {
    return (
      <div className="empty">
        <h3>No purchases yet</h3>
        <p>Record what comes in so stock and feed cost stay right.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Add a purchase</button></div>
      </div>
    );
  }

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {purchases.map((p) => (
        <Item
          key={p.id}
          title={items.get(p.itemId)?.name ?? 'Item'}
          meta={`${formatDayShort(p.day)}${parties.get(p.supplierId ?? '') ? ` · ${parties.get(p.supplierId!)!.name}` : ''}`}
          value={formatQty(p.qty, p.enteredUnit, units, { label: false })}
          sub={money ? formatRupees(p.amount, { paise: false }) : units.get(p.enteredUnit)?.plural}
          chevron={false}
        />
      ))}
    </div>
  );
}

function PurchaseSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const units = useUnits();
  const items = list('item').filter((i) => ['feed', 'raw-material', 'vaccine-medicine', 'packaging', 'fuel'].includes(i.category) && i.active);
  const suppliers = list('party').filter((p) => p.kind === 'supplier');

  const [day, setDay] = useState(today());
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(items[0]?.entryUnit ?? 'kg');
  const [amount, setAmount] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = items.find((i) => i.id === itemId);
  const base = item ? toBase(qty, unit, units) : null;
  const paise = parseRupees(amount);
  const perKg = base && base > 0 && paise ? (paise * 1000) / base : null;

  const save = async () => {
    if (!item) { setError('Pick an item.'); return; }
    if (!base || base <= 0) { setError('Enter a quantity.'); return; }
    if (paise === null || paise <= 0) { setError('Enter the amount paid.'); return; }
    setBusy(true);
    try {
      await create('feed-purchase', {
        farmId, day, supplierId: supplierId || null, itemId,
        qty: base, enteredUnit: unit, amount: paise,
        vehicleId: null, invoiceNo: invoiceNo.trim(), notes: '',
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Feed purchase"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>
        <Field label="Item">
          <select className="select" value={itemId} onChange={(e) => {
            setItemId(e.target.value);
            const next = items.find((i) => i.id === e.target.value);
            if (next) setUnit(next.entryUnit);
          }}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Quantity">
          <QtyInput value={qty} onChange={setQty} unit={unit} onUnitChange={setUnit}
                    units={unitOptions(units, item?.dimension ?? 'mass', item?.entryUnit)} autoFocus />
        </Field>
        <Field label="Amount paid" hint={perKg ? `${formatRupees(Math.round(perKg), { paise: false })} per kg` : undefined}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Supplier">
          <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Not recorded</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Invoice number"><TextInput value={invoiceNo} onChange={setInvoiceNo} placeholder="Optional" /></Field>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- mixing */

function BatchList({ farmId, onAdd }: { farmId: string; onAdd: () => void }) {
  const { list } = useData();
  const ledger = useRecentLedger(1, today());
  const batches = list('feed-batch')
    .filter((b) => b.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 30);

  if (batches.length === 0) {
    return (
      <div className="empty">
        <h3>No batches mixed</h3>
        <p>Mixing turns raw materials into feed, and sets what that feed costs per kg.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Mix a batch</button></div>
      </div>
    );
  }

  const items = new Map(ledger.data.items.map((i) => [i.id, i]));

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {batches.map((b) => {
        const spec = { id: b.id, day: b.day, seq: 0, farmId, inputs: b.inputs, outputItemId: b.outputItemId, outputQty: b.outputQty };
        const loss = mixingLossPercent(spec);
        return (
          <Item
            key={b.id}
            title={items.get(b.outputItemId)?.name ?? 'Feed'}
            meta={`${formatDayShort(b.day)} · ${b.inputs.length} materials${loss !== null && Math.abs(loss) > 8 ? ` · ${loss.toFixed(0)}% loss` : ''}`}
            value={num(b.outputQty / 1000)}
            sub="kg made"
            chevron={false}
          />
        );
      })}
    </div>
  );
}

function BatchSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const units = useUnits();
  const ledger = useRecentLedger(1, today());
  const raws = list('item').filter((i) => i.category === 'raw-material' && i.active);
  const feeds = list('item').filter((i) => i.category === 'feed' && i.active);

  const [day, setDay] = useState(today());
  const [rows, setRows] = useState<{ itemId: string; qty: string; unit: string }[]>(
    raws.slice(0, 4).map((r) => ({ itemId: r.id, qty: '', unit: r.entryUnit })),
  );
  const [outputItemId, setOutputItemId] = useState(feeds[0]?.id ?? '');
  const [outputQty, setOutputQty] = useState('');
  const [outputUnit, setOutputUnit] = useState('kg');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputs = rows
    .map((r) => ({ itemId: r.itemId, qty: toBase(r.qty, r.unit, units) ?? 0, enteredUnit: r.unit }))
    .filter((r) => r.qty > 0);
  const inputTotal = inputs.reduce((s, r) => s + r.qty, 0);
  const outBase = toBase(outputQty, outputUnit, units) ?? 0;

  // Price the batch from the live pools, so the cost shown is the cost booked.
  const inputValue = inputs.reduce((sum, r) => {
    const pool = getPool(ledger.stock, farmLocation(farmId), r.itemId);
    return sum + (pool.qty > 0 ? Math.round((pool.value * r.qty) / pool.qty) : 0);
  }, 0);
  const costPerKg = outBase > 0 ? Math.round((inputValue * 1000) / outBase) : null;
  const loss = inputTotal > 0 ? ((inputTotal - outBase) / inputTotal) * 100 : null;

  const save = async () => {
    if (inputs.length === 0) { setError('Add at least one raw material.'); return; }
    if (outBase <= 0) { setError('Enter how much feed came out.'); return; }
    setBusy(true);
    try {
      await create('feed-batch', {
        farmId, day, inputs, outputItemId, outputQty: outBase, outputUnit, notes: '',
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Mix a batch"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save batch'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>

        <SectionTitle
          action={<button className="btn ghost sm" onClick={() => setRows([...rows, { itemId: raws[0]?.id ?? '', qty: '', unit: raws[0]?.entryUnit ?? 'quintal' }])}>Add</button>}
        >
          Raw materials in
        </SectionTitle>

        <div className="stack-sm">
          {rows.map((r, index) => (
            <div key={index} className="stack-sm">
              <div className="row">
                <select className="select grow" value={r.itemId}
                        onChange={(e) => setRows(rows.map((x, i) => i === index ? { ...x, itemId: e.target.value } : x))}>
                  {raws.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {rows.length > 1 && (
                  <button className="btn ghost sm" aria-label="Remove"
                          onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                    <Icon.trash size={17} />
                  </button>
                )}
              </div>
              <QtyInput
                value={r.qty}
                onChange={(v) => setRows(rows.map((x, i) => i === index ? { ...x, qty: v } : x))}
                unit={r.unit}
                onUnitChange={(u) => setRows(rows.map((x, i) => i === index ? { ...x, unit: u } : x))}
                units={unitOptions(units, 'mass', r.unit)}
              />
            </div>
          ))}
        </div>

        <SectionTitle>Finished feed out</SectionTitle>
        <Field label="Feed made">
          <select className="select" value={outputItemId} onChange={(e) => setOutputItemId(e.target.value)}>
            {feeds.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Quantity" hint="Weigh it — do not assume it equals what went in.">
          <QtyInput value={outputQty} onChange={setOutputQty} unit={outputUnit} onUnitChange={setOutputUnit}
                    units={unitOptions(units, 'mass', 'kg')} />
        </Field>

        <Card>
          <KeyValue rows={[
            { k: 'Raw material in', v: `${num(inputTotal / 1000)} kg` },
            { k: 'Feed out', v: `${num(outBase / 1000)} kg` },
            { k: 'Mixing loss', v: loss === null ? '—' : `${loss.toFixed(1)}%` },
            { k: 'Cost of materials', v: <Money paise={inputValue} /> },
            { k: 'Feed cost', v: costPerKg === null ? '—' : `${formatRupees(costPerKg, { paise: false })}/kg` },
          ]} />
        </Card>

        {loss !== null && Math.abs(loss) > 12 && (
          <Banner tone="warn">
            {loss > 0 ? `${loss.toFixed(0)}% of the material did not come out as feed.` : `More feed came out than went in.`} Check the quantities.
          </Banner>
        )}
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- issues */

function IssueList({ farmId, onAdd }: { farmId: string; onAdd: () => void }) {
  const { list } = useData();
  const units = useUnits();
  const { shedsOf } = useMasters();
  const sheds = new Map(shedsOf(farmId).map((s) => [s.id, s]));
  const items = new Map(list('item').map((i) => [i.id, i]));

  const issues = list('feed-issue')
    .filter((i) => i.farmId === farmId)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 40);

  if (issues.length === 0) {
    return (
      <div className="empty">
        <h3>Nothing issued yet</h3>
        <p>Moving feed to a shed is what lets the flock’s feed cost be worked out.</p>
        <div className="mt"><button className="btn primary" onClick={onAdd}>Issue feed</button></div>
      </div>
    );
  }

  return (
    <div className="card list mt-sm" style={{ padding: 0 }}>
      {issues.map((i) => (
        <Item
          key={i.id}
          title={sheds.get(i.shedId)?.name ?? 'Shed'}
          meta={`${formatDayShort(i.day)} · ${items.get(i.itemId)?.name ?? 'Feed'}`}
          value={formatQty(i.qty, i.enteredUnit, units, { label: false })}
          sub={units.get(i.enteredUnit)?.plural}
          chevron={false}
        />
      ))}
    </div>
  );
}

function IssueSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const units = useUnits();
  const { shedsOf } = useMasters();
  const permissions = usePermissions();
  const ledger = useRecentLedger(1, today());
  const sheds = shedsOf(farmId).filter((s) => permissions.allows(s.id));
  const feeds = list('item').filter((i) => i.category === 'feed' && i.active);

  const [day, setDay] = useState(today());
  const [shedId, setShedId] = useState(sheds[0]?.id ?? '');
  const [itemId, setItemId] = useState(feeds[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('bag');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = toBase(qty, unit, units) ?? 0;
  const available = getPool(ledger.stock, farmLocation(farmId), itemId).qty;

  const save = async () => {
    if (!shedId) { setError('Pick a shed.'); return; }
    if (base <= 0) { setError('Enter a quantity.'); return; }
    setBusy(true);
    try {
      await create('feed-issue', { farmId, shedId, day, itemId, qty: base, enteredUnit: unit });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Issue feed to a shed"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>
        <Field label="Shed">
          <select className="select" value={shedId} onChange={(e) => setShedId(e.target.value)}>
            {sheds.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Feed">
          <select className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {feeds.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Quantity" hint={`${num(available / 1000)} kg at the farm`}>
          <QtyInput value={qty} onChange={setQty} unit={unit} onUnitChange={setUnit}
                    units={unitOptions(units, 'mass', 'bag')} autoFocus />
        </Field>
        {base > available && (
          <Banner tone="warn">
            That is more than the {num(available / 1000)} kg the records show at the farm. It will be saved, and the shortfall flagged in stock.
          </Banner>
        )}
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------- stock count */

function AdjustSheet({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const { list, create } = useData();
  const units = useUnits();
  const ledger = useRecentLedger(1, today());
  const items = list('item').filter((i) => ['feed', 'raw-material'].includes(i.category) && i.active);

  const [day, setDay] = useState(today());
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [counted, setCounted] = useState('');
  const [unit, setUnit] = useState(items[0]?.entryUnit ?? 'kg');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const systemQty = getPool(ledger.stock, farmLocation(farmId), itemId).qty;
  const base = toBase(counted, unit, units);
  const delta = base === null ? null : base - systemQty;

  const save = async () => {
    if (base === null || base < 0) { setError('Enter the counted quantity.'); return; }
    setBusy(true);
    try {
      await create('stock-adjustment', {
        farmId, day, itemId, countedQty: base, enteredUnit: unit, systemQty, reason: reason.trim(),
      });
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Physical stock count"
      sub="The count wins. The difference is kept for the record."
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save count'}</button>
      </>}>
      <div className="stack">
        <Field label="Date"><DayInput value={day} onChange={setDay} max={today()} /></Field>
        <Field label="Item">
          <select className="select" value={itemId} onChange={(e) => {
            setItemId(e.target.value);
            const next = items.find((i) => i.id === e.target.value);
            if (next) setUnit(next.entryUnit);
          }}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Counted quantity" hint={`Records say ${num(systemQty / 1000)} kg`}>
          <QtyInput value={counted} onChange={setCounted} unit={unit} onUnitChange={setUnit}
                    units={unitOptions(units, 'mass', unit)} autoFocus />
        </Field>
        {delta !== null && delta !== 0 && (
          <Banner tone={Math.abs(delta) > systemQty * 0.1 ? 'warn' : 'info'}>
            {delta > 0 ? 'More' : 'Less'} than the records by {num(Math.abs(delta) / 1000)} kg.
          </Banner>
        )}
        <Field label="Reason"><TextInput value={reason} onChange={setReason} placeholder="Spillage, weighing difference…" /></Field>
        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}
