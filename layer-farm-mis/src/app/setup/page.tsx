'use client';

/**
 * Master data.
 *
 * The ten masters the requirements list, behind one menu. Each opens a list
 * and a form; none of them is something a farmer touches daily, so they are
 * kept out of the way of the screens that are.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  Banner, DayInput, Field, Icon, Item, MoneyInput, NumberInput, Pill,
  SectionTitle, Sheet, TextInput, TopBar, num,
} from '@/components/ui';
import { formatDay, today } from '@/domain/dates';
import { formatRupees, parseRupees } from '@/domain/money';
import { ITEM_CATEGORY_LABEL, ROLE_LABEL, type HousingType, type ItemCategory, type Role } from '@/lib/types';
import { useMasters, usePermissions, useUnits } from '@/lib/hooks';
import { useData } from '@/lib/store';
import { hashPin, isValidPin, newSalt } from '@/lib/pin';
import { tap } from '@/lib/native';

type Screen = 'farms' | 'sheds' | 'flocks' | 'items' | 'units' | 'parties' | 'rates' | 'heads' | 'users' | 'alerts' | null;

export default function SetupPage() {
  return <AppShell><Setup /></AppShell>;
}

function Setup() {
  const router = useRouter();
  const permissions = usePermissions();
  const { farms, sheds, flocks } = useMasters();
  const { list } = useData();
  const [screen, setScreen] = useState<Screen>(null);

  if (!permissions.masters) {
    return (
      <>
        <TopBar title="Setup" onBack={() => router.back()} />
        <div className="page">
          <div className="empty" style={{ marginTop: 40 }}>
            <h3>Owner only</h3>
            <p>Master data is set up by the owner.</p>
          </div>
        </div>
      </>
    );
  }

  const counts = {
    farms: farms.length,
    sheds: sheds.length,
    flocks: flocks.filter((f) => f.phase !== 'closed').length,
    items: list('item').filter((i) => i.active).length,
    units: list('unit').length,
    parties: list('party').length,
    rates: list('rate').length,
    heads: list('head').filter((h) => h.active).length,
    users: list('user').filter((u) => u.active).length,
  };

  return (
    <>
      <TopBar title="Setup" onBack={() => router.back()} />
      <div className="page">
        <SectionTitle>The farm</SectionTitle>
        <div className="card list" style={{ padding: 0 }}>
          <Item title="Farms" meta="Location, NECC zone, farm-gate rate" value={counts.farms} onClick={() => setScreen('farms')} />
          <Item title="Sheds" meta="Housing, capacity, who records" value={counts.sheds} onClick={() => setScreen('sheds')} />
          <Item title="Flocks" meta="Placement, source, laying life" value={counts.flocks} onClick={() => setScreen('flocks')} />
          <Item title="People" meta="Owner, managers, supervisors" value={counts.users} onClick={() => setScreen('users')} />
        </div>

        <SectionTitle>What is counted</SectionTitle>
        <div className="card list" style={{ padding: 0 }}>
          <Item title="Items" meta="Feed, raw materials, vaccines, packaging" value={counts.items} onClick={() => setScreen('items')} />
          <Item title="Units" meta="Bag, quintal, tray sizes" value={counts.units} onClick={() => setScreen('units')} />
          <Item title="Parties" meta="Suppliers, customers, vehicles" value={counts.parties} onClick={() => setScreen('parties')} />
        </div>

        <SectionTitle>Money and alerts</SectionTitle>
        <div className="card list" style={{ padding: 0 }}>
          <Item title="Egg rates" meta="NECC zone rate by day" value={counts.rates} onClick={() => setScreen('rates')} />
          <Item title="Income and expense heads" meta="How money is classified" value={counts.heads} onClick={() => setScreen('heads')} />
          <Item title="Alert thresholds" meta="When to be told something is wrong" onClick={() => setScreen('alerts')} />
        </div>
      </div>

      {screen === 'farms' && <FarmsSheet onClose={() => setScreen(null)} />}
      {screen === 'sheds' && <ShedsSheet onClose={() => setScreen(null)} />}
      {screen === 'flocks' && <FlocksSheet onClose={() => setScreen(null)} />}
      {screen === 'items' && <ItemsSheet onClose={() => setScreen(null)} />}
      {screen === 'units' && <UnitsSheet onClose={() => setScreen(null)} />}
      {screen === 'parties' && <PartiesSheet onClose={() => setScreen(null)} />}
      {screen === 'rates' && <RatesSheet onClose={() => setScreen(null)} />}
      {screen === 'heads' && <HeadsSheet onClose={() => setScreen(null)} />}
      {screen === 'users' && <UsersSheet onClose={() => setScreen(null)} />}
      {screen === 'alerts' && <ThresholdSheet onClose={() => setScreen(null)} />}
    </>
  );
}

/* --------------------------------------------------------------- farms */

function FarmsSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const farms = list('farm');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const existing = editing && editing !== 'new' ? farms.find((f) => f.id === editing) : null;
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [zone, setZone] = useState('Hyderabad');
  const [adjust, setAdjust] = useState('');
  const [gap, setGap] = useState('');
  const [layingLife, setLayingLife] = useState('560');

  const start = (id: string | 'new') => {
    const farm = id === 'new' ? null : farms.find((f) => f.id === id);
    setName(farm?.name ?? '');
    setLocation(farm?.location ?? '');
    setZone(farm?.neccZone ?? 'Hyderabad');
    setAdjust(farm ? String(farm.farmGateAdjust / 100) : '');
    setGap(farm ? String(farm.smallEggGap / 100) : '');
    setLayingLife(String(farm?.layingLifeDays ?? 560));
    setEditing(id);
  };

  const save = async () => {
    const payload = {
      name: name.trim(), location: location.trim(), neccZone: zone.trim(), contact: '',
      farmGateAdjust: Math.round((Number(adjust) || 0) * 100),
      smallEggGap: Math.round((Number(gap) || 0) * 100),
      layingLifeDays: Math.max(1, Number(layingLife) || 560),
    };
    if (!payload.name) return;
    if (existing) await update(existing.id, payload);
    else await create('farm', payload);
    void tap();
    setEditing(null);
  };

  if (editing) {
    return (
      <Sheet open onClose={() => setEditing(null)} title={existing ? existing.name : 'New farm'}
        actions={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </>}>
        <div className="stack">
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Kadapa farm" autoFocus /></Field>
          <Field label="Location"><TextInput value={location} onChange={setLocation} placeholder="Kadapa, Andhra Pradesh" /></Field>
          <Field label="NECC zone" hint="Drives the daily rate this farm is quoted against.">
            <TextInput value={zone} onChange={setZone} placeholder="Hyderabad" />
          </Field>
          <Field label="Farm-gate adjustment" hint="Per 100 eggs against the zone rate. Negative when you sell below it.">
            <NumberInput value={adjust} onChange={setAdjust} suffix="₹/100" />
          </Field>
          <Field label="Small egg price gap" hint="How much less an under-50 g egg fetches, per 100.">
            <NumberInput value={gap} onChange={setGap} suffix="₹/100" />
          </Field>
          <Field label="Laying life" hint="Days the pullet cost is spread over. 560 is 80 weeks.">
            <NumberInput value={layingLife} onChange={setLayingLife} decimal={false} suffix="days" />
          </Field>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Farms"
      actions={<button className="btn primary" onClick={() => start('new')}><Icon.plus size={17} /> Add a farm</button>}>
      <div className="card list" style={{ padding: 0 }}>
        {farms.map((f) => (
          <Item key={f.id} title={f.name} meta={`${f.location || 'No location'} · ${f.neccZone}`} onClick={() => start(f.id)} />
        ))}
        {farms.length === 0 && <div className="item muted small">No farms yet.</div>}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------- sheds */

function ShedsSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const { farms } = useMasters();
  const sheds = list('shed');
  const users = list('user').filter((u) => u.role === 'supervisor' && u.active);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const existing = editing && editing !== 'new' ? sheds.find((s) => s.id === editing) : null;
  const [name, setName] = useState('');
  const [farmId, setFarmId] = useState(farms[0]?.id ?? '');
  const [housing, setHousing] = useState<HousingType>('a-frame-cage');
  const [capacity, setCapacity] = useState('');
  const [sessions, setSessions] = useState<'1' | '2'>('1');
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);

  const start = (id: string | 'new') => {
    const shed = id === 'new' ? null : sheds.find((s) => s.id === id);
    setName(shed?.name ?? '');
    setFarmId(shed?.farmId ?? farms[0]?.id ?? '');
    setHousing(shed?.housing ?? 'a-frame-cage');
    setCapacity(String(shed?.capacity ?? ''));
    setSessions(String(shed?.sessionsPerDay ?? 1) as '1' | '2');
    setSupervisorIds(shed?.supervisorIds ?? []);
    setEditing(id);
  };

  const save = async () => {
    const payload = {
      farmId, name: name.trim(), housing,
      capacity: Math.max(0, Number(capacity) || 0),
      sessionsPerDay: (sessions === '2' ? 2 : 1) as 1 | 2,
      supervisorIds,
    };
    if (!payload.name || !payload.farmId) return;
    if (existing) await update(existing.id, payload);
    else await create('shed', payload);
    void tap();
    setEditing(null);
  };

  if (editing) {
    return (
      <Sheet open onClose={() => setEditing(null)} title={existing ? existing.name : 'New shed'}
        actions={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </>}>
        <div className="stack">
          <Field label="Farm">
            <select className="select" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Shed 1" autoFocus /></Field>
          <Field label="Housing">
            <select className="select" value={housing} onChange={(e) => setHousing(e.target.value as HousingType)}>
              <option value="a-frame-cage">A-frame cage</option>
              <option value="deep-litter">Deep litter</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Bird capacity"><NumberInput value={capacity} onChange={setCapacity} decimal={false} /></Field>
          <Field label="Entries a day" hint="Two means a morning and an evening collection.">
            <select className="select" value={sessions} onChange={(e) => setSessions(e.target.value as '1' | '2')}>
              <option value="1">Once a day</option>
              <option value="2">Twice a day</option>
            </select>
          </Field>
          {users.length > 0 && (
            <Field label="Supervisors" hint="Who may record entries for this shed.">
              <div className="stack-sm">
                {users.map((u) => (
                  <label key={u.id} className="row" style={{ gap: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={supervisorIds.includes(u.id)}
                           onChange={(e) => setSupervisorIds(e.target.checked
                             ? [...supervisorIds, u.id]
                             : supervisorIds.filter((id) => id !== u.id))}
                           style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
                    <span className="grow">{u.name}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Sheds"
      actions={<button className="btn primary" disabled={farms.length === 0} onClick={() => start('new')}>
        <Icon.plus size={17} /> Add a shed
      </button>}>
      {farms.length === 0 && <Banner tone="warn">Add a farm first.</Banner>}
      <div className="card list" style={{ padding: 0 }}>
        {sheds.map((s) => (
          <Item key={s.id} title={s.name}
                meta={`${farms.find((f) => f.id === s.farmId)?.name ?? ''} · ${num(s.capacity)} birds · ${s.sessionsPerDay}× a day`}
                onClick={() => start(s.id)} />
        ))}
        {sheds.length === 0 && <div className="item muted small">No sheds yet.</div>}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- flocks */

function FlocksSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const { farms, sheds } = useMasters();
  const flocks = list('flock');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const existing = editing && editing !== 'new' ? flocks.find((f) => f.id === editing) : null;
  const [name, setName] = useState('');
  const [shedId, setShedId] = useState(sheds[0]?.id ?? '');
  const [source, setSource] = useState<'own-reared' | 'bought-pullet'>('bought-pullet');
  const [breed, setBreed] = useState('BV300');
  const [placedOn, setPlacedOn] = useState(today());
  const [birds, setBirds] = useState('');
  const [cost, setCost] = useState('');
  const [layFrom, setLayFrom] = useState('');
  const [spentValue, setSpentValue] = useState('');

  const start = (id: string | 'new') => {
    const flock = id === 'new' ? null : flocks.find((f) => f.id === id);
    setName(flock?.name ?? '');
    setShedId(flock?.shedId ?? sheds[0]?.id ?? '');
    setSource(flock?.source ?? 'bought-pullet');
    setBreed(flock?.breed ?? 'BV300');
    setPlacedOn(flock?.placedOn ?? today());
    setBirds(String(flock?.birdsPlaced ?? ''));
    setCost(flock ? String(flock.placementCost / 100) : '');
    setLayFrom(flock?.layFrom ?? '');
    setSpentValue(flock ? String(flock.expectedSpentHenValue / 100) : '');
    setEditing(id);
  };

  const save = async () => {
    const shed = sheds.find((s) => s.id === shedId);
    if (!shed || !name.trim()) return;
    const farm = farms.find((f) => f.id === shed.farmId);
    const payload = {
      farmId: shed.farmId, shedId, name: name.trim(), source,
      supplierId: null, breed: breed.trim(),
      placedOn, birdsPlaced: Math.max(0, Number(birds) || 0),
      placementCost: parseRupees(cost) ?? 0,
      phase: (layFrom ? 'laying' : 'rearing') as 'laying' | 'rearing',
      layFrom: layFrom || null,
      layingLifeDays: farm?.layingLifeDays ?? 560,
      expectedSpentHenValue: parseRupees(spentValue) ?? 0,
      opening: null,
      closedOn: null,
    };
    if (existing) await update(existing.id, payload);
    else await create('flock', payload);
    void tap();
    setEditing(null);
  };

  if (editing) {
    return (
      <Sheet open onClose={() => setEditing(null)} title={existing ? existing.name : 'New flock'}
        actions={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </>}>
        <div className="stack">
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Batch A" autoFocus /></Field>
          <Field label="Shed">
            <select className="select" value={shedId} onChange={(e) => setShedId(e.target.value)}>
              {sheds.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select className="select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="bought-pullet">Bought point-of-lay pullets</option>
              <option value="own-reared">Own-reared from chick</option>
            </select>
          </Field>
          <Field label="Breed"><TextInput value={breed} onChange={setBreed} placeholder="BV300" /></Field>
          <Field label="Placed on"><DayInput value={placedOn} onChange={setPlacedOn} max={today()} /></Field>
          <Field label="Birds placed"><NumberInput value={birds} onChange={setBirds} decimal={false} /></Field>
          <Field label={source === 'own-reared' ? 'Chick cost' : 'Pullet cost'} hint="For the whole placement.">
            <MoneyInput value={cost} onChange={setCost} />
          </Field>
          <Field label="Laying from" hint="Leave blank while the flock is still rearing.">
            <DayInput value={layFrom} onChange={setLayFrom} />
          </Field>
          <Field label="Expected spent-hen value" hint="Trued up when the flock closes.">
            <MoneyInput value={spentValue} onChange={setSpentValue} />
          </Field>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Flocks"
      actions={<button className="btn primary" disabled={sheds.length === 0} onClick={() => start('new')}>
        <Icon.plus size={17} /> Add a flock
      </button>}>
      {sheds.length === 0 && <Banner tone="warn">Add a shed first.</Banner>}
      <div className="card list" style={{ padding: 0 }}>
        {flocks.map((f) => (
          <Item key={f.id} title={f.name}
                meta={`${sheds.find((s) => s.id === f.shedId)?.name ?? ''} · ${num(f.birdsPlaced)} birds · ${f.phase}`}
                onClick={() => start(f.id)} />
        ))}
        {flocks.length === 0 && <div className="item muted small">No flocks yet.</div>}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------- items */

function ItemsSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const units = useUnits();
  const items = list('item');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const existing = editing && editing !== 'new' ? items.find((i) => i.id === editing) : null;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('feed');
  const [entryUnit, setEntryUnit] = useState('bag');

  const dimensionFor = (c: ItemCategory): 'mass' | 'count' | 'volume' =>
    c === 'fuel' ? 'volume' : c === 'vaccine-medicine' || c === 'packaging' ? 'count' : 'mass';

  const start = (id: string | 'new') => {
    const item = id === 'new' ? null : items.find((i) => i.id === id);
    setName(item?.name ?? '');
    setCategory(item?.category ?? 'feed');
    setEntryUnit(item?.entryUnit ?? 'bag');
    setEditing(id);
  };

  const save = async () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), category, dimension: dimensionFor(category), entryUnit, active: true };
    if (existing) await update(existing.id, payload);
    else await create('item', payload);
    void tap();
    setEditing(null);
  };

  if (editing) {
    return (
      <Sheet open onClose={() => setEditing(null)} title={existing ? existing.name : 'New item'}
        actions={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </>}>
        <div className="stack">
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Layer feed" autoFocus /></Field>
          <Field label="Category">
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
              {(Object.keys(ITEM_CATEGORY_LABEL) as ItemCategory[]).map((c) => (
                <option key={c} value={c}>{ITEM_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Usual entry unit" hint="The unit this is normally bought and counted in.">
            <select className="select" value={entryUnit} onChange={(e) => setEntryUnit(e.target.value)}>
              {[...units.values()].filter((u) => u.dimension === dimensionFor(category))
                .map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
            </select>
          </Field>
          {existing && (
            <button className="btn danger block" onClick={() => { void update(existing.id, { active: !existing.active }); setEditing(null); }}>
              {existing.active ? 'Hide this item' : 'Show this item again'}
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Items"
      actions={<button className="btn primary" onClick={() => start('new')}><Icon.plus size={17} /> Add an item</button>}>
      <div className="card list" style={{ padding: 0 }}>
        {items.map((i) => (
          <Item key={i.id} title={i.name} meta={ITEM_CATEGORY_LABEL[i.category]}
                value={i.active ? undefined : <Pill>Hidden</Pill>} onClick={() => start(i.id)} />
        ))}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------- units */

function UnitsSheet({ onClose }: { onClose: () => void }) {
  const { list, update } = useData();
  const units = list('unit').filter((u) => ['bag', 'quintal', 'tray', 'box'].includes(u.code));
  const [editing, setEditing] = useState<string | null>(null);
  const [factor, setFactor] = useState('');

  const unit = units.find((u) => u.id === editing);

  return (
    <Sheet open onClose={onClose} title="Units"
      sub="Change these if your farm's bags or trays are a different size.">
      <div className="card list" style={{ padding: 0 }}>
        {units.map((u) => (
          <Item
            key={u.id}
            title={u.label}
            meta={u.dimension === 'mass' ? `${u.factor / 1000} kg` : `${u.factor} pieces`}
            onClick={() => { setEditing(u.id); setFactor(String(u.dimension === 'mass' ? u.factor / 1000 : u.factor)); }}
          />
        ))}
      </div>

      {unit && (
        <Sheet open onClose={() => setEditing(null)} title={`One ${unit.label}`}
          actions={<>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={() => {
              const value = Number(factor) || 0;
              if (value > 0) void update(unit.id, { factor: unit.dimension === 'mass' ? Math.round(value * 1000) : Math.round(value) });
              setEditing(null);
            }}>Save</button>
          </>}>
          <Field label={unit.dimension === 'mass' ? 'Weighs' : 'Holds'}>
            <NumberInput value={factor} onChange={setFactor} suffix={unit.dimension === 'mass' ? 'kg' : 'pieces'} autoFocus />
          </Field>
          <Banner tone="info">
            Changing this re-reads every quantity ever entered in {unit.plural}. Only change it if the unit itself was wrong.
          </Banner>
        </Sheet>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------- parties */

function PartiesSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const parties = list('party');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const existing = editing && editing !== 'new' ? parties.find((p) => p.id === editing) : null;
  const [kind, setKind] = useState<'supplier' | 'customer' | 'vehicle' | 'driver'>('customer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [registration, setRegistration] = useState('');

  const start = (id: string | 'new') => {
    const party = id === 'new' ? null : parties.find((p) => p.id === id);
    setKind(party?.kind ?? 'customer');
    setName(party?.name ?? '');
    setPhone(party?.phone ?? '');
    setPlace(party?.place ?? '');
    setRegistration(party?.registration ?? '');
    setEditing(id);
  };

  const save = async () => {
    if (!name.trim()) return;
    const payload = { kind, name: name.trim(), phone: phone.trim(), place: place.trim(), registration: registration.trim() };
    if (existing) await update(existing.id, payload);
    else await create('party', payload);
    void tap();
    setEditing(null);
  };

  if (editing) {
    return (
      <Sheet open onClose={() => setEditing(null)} title={existing ? existing.name : 'New party'}
        actions={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </>}>
        <div className="stack">
          <Field label="Kind">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="vehicle">Vehicle</option>
              <option value="driver">Driver</option>
            </select>
          </Field>
          <Field label="Name"><TextInput value={name} onChange={setName} autoFocus /></Field>
          <Field label="Phone"><TextInput value={phone} onChange={setPhone} type="tel" /></Field>
          <Field label="Place"><TextInput value={place} onChange={setPlace} /></Field>
          {kind === 'vehicle' && (
            <Field label="Registration"><TextInput value={registration} onChange={setRegistration} placeholder="AP 04 TX 8821" /></Field>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Parties"
      actions={<button className="btn primary" onClick={() => start('new')}><Icon.plus size={17} /> Add</button>}>
      <div className="card list" style={{ padding: 0 }}>
        {parties.map((p) => (
          <Item key={p.id} title={p.name} meta={`${p.kind}${p.place ? ` · ${p.place}` : ''}`} onClick={() => start(p.id)} />
        ))}
        {parties.length === 0 && <div className="item muted small">Nobody added yet.</div>}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------- rates */

function RatesSheet({ onClose }: { onClose: () => void }) {
  const { list, create } = useData();
  const { farms } = useMasters();
  const rates = list('rate').sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 40);

  const [zone, setZone] = useState(farms[0]?.neccZone ?? 'Hyderabad');
  const [day, setDay] = useState(today());
  const [rate, setRate] = useState('');
  const [adding, setAdding] = useState(false);

  const save = async () => {
    const paise = parseRupees(rate);
    if (paise === null || paise <= 0) return;
    await create('rate', { zone: zone.trim(), day, ratePer100: paise, farmId: null });
    void tap();
    setAdding(false);
    setRate('');
  };

  return (
    <Sheet open onClose={onClose} title="Egg rates"
      sub="NECC zone rate per 100 eggs. The most recent one on or before a day applies."
      actions={<button className="btn primary" onClick={() => setAdding(true)}><Icon.plus size={17} /> Add a rate</button>}>
      <div className="card list" style={{ padding: 0 }}>
        {rates.map((r) => (
          <Item key={r.id} title={r.zone} meta={formatDay(r.day)}
                value={formatRupees(r.ratePer100, { paise: false })} sub="per 100" chevron={false} />
        ))}
        {rates.length === 0 && <div className="item muted small">No rates entered.</div>}
      </div>

      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="Add a rate"
          actions={<>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" onClick={() => void save()}>Save</button>
          </>}>
          <div className="stack">
            <Field label="Zone"><TextInput value={zone} onChange={setZone} autoFocus /></Field>
            <Field label="Date"><DayInput value={day} onChange={setDay} /></Field>
            <Field label="Rate per 100 eggs"><MoneyInput value={rate} onChange={setRate} /></Field>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------- heads */

function HeadsSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const heads = list('head');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [adding, setAdding] = useState(false);

  return (
    <Sheet open onClose={onClose} title="Income and expense heads"
      actions={<button className="btn primary" onClick={() => setAdding(true)}><Icon.plus size={17} /> Add a head</button>}>
      <SectionTitle>Income</SectionTitle>
      <div className="card list" style={{ padding: 0 }}>
        {heads.filter((h) => h.kind === 'income').map((h) => (
          <Item key={h.id} title={h.name} value={h.active ? undefined : <Pill>Hidden</Pill>}
                onClick={() => void update(h.id, { active: !h.active })} chevron={false} />
        ))}
      </div>
      <SectionTitle>Expense</SectionTitle>
      <div className="card list" style={{ padding: 0 }}>
        {heads.filter((h) => h.kind === 'expense').map((h) => (
          <Item key={h.id} title={h.name} value={h.active ? undefined : <Pill>Hidden</Pill>}
                onClick={() => void update(h.id, { active: !h.active })} chevron={false} />
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>Tap a head to hide or show it.</p>

      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="New head"
          actions={<>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" onClick={() => {
              if (name.trim()) void create('head', { kind, name: name.trim(), builtIn: false, active: true });
              setName('');
              setAdding(false);
            }}>Save</button>
          </>}>
          <div className="stack">
            <Field label="Kind">
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </Field>
            <Field label="Name"><TextInput value={name} onChange={setName} autoFocus /></Field>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------- users */

function UsersSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const { sheds } = useMasters();
  const users = list('user');
  const [adding, setAdding] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('supervisor');
  const [pin, setPin] = useState('');
  const [shedIds, setShedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setError('Enter a name.'); return; }
    if (!isValidPin(pin)) { setError('The PIN must be 4 to 6 digits.'); return; }
    const salt = newSalt();
    await create('user', {
      name: name.trim(), phone: phone.trim(), role,
      pinHash: await hashPin(pin, salt), pinSalt: salt,
      shedIds: role === 'supervisor' ? shedIds : [],
      active: true,
    });
    void tap();
    setName(''); setPhone(''); setPin(''); setShedIds([]); setError(null);
    setAdding(false);
  };

  return (
    <Sheet open onClose={onClose} title="People"
      actions={<button className="btn primary" onClick={() => setAdding(true)}><Icon.plus size={17} /> Add a person</button>}>
      <div className="card list" style={{ padding: 0 }}>
        {users.map((u) => (
          <Item key={u.id} title={u.name}
                meta={`${ROLE_LABEL[u.role]}${u.shedIds.length > 0 ? ` · ${u.shedIds.length} shed${u.shedIds.length === 1 ? '' : 's'}` : ''}`}
                value={u.active ? undefined : <Pill>Inactive</Pill>}
                onClick={() => void update(u.id, { active: !u.active })} chevron={false} />
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Tap someone to make them active or inactive. A supervisor sees only their own sheds,
        and never sees prices or profit.
      </p>

      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="Add a person"
          actions={<>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" onClick={() => void save()}>Save</button>
          </>}>
          <div className="stack">
            <Field label="Name"><TextInput value={name} onChange={setName} autoFocus /></Field>
            <Field label="Phone"><TextInput value={phone} onChange={setPhone} type="tel" /></Field>
            <Field label="Role">
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="supervisor">Supervisor — records entries, no prices</option>
                <option value="manager">Manager — purchases and expenses too</option>
                <option value="owner">Owner — everything</option>
              </select>
            </Field>
            <Field label="Sign-in PIN" hint="They can change it later. 4 to 6 digits.">
              <input className="input num" inputMode="numeric" maxLength={6} value={pin}
                     onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
            </Field>
            {role === 'supervisor' && sheds.length > 0 && (
              <Field label="Sheds" hint="Leave all unticked to give access to every shed.">
                <div className="stack-sm">
                  {sheds.map((s) => (
                    <label key={s.id} className="row" style={{ gap: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={shedIds.includes(s.id)}
                             onChange={(e) => setShedIds(e.target.checked
                               ? [...shedIds, s.id]
                               : shedIds.filter((id) => id !== s.id))}
                             style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
                      <span className="grow">{s.name}</span>
                    </label>
                  ))}
                </div>
              </Field>
            )}
            {error && <Banner tone="bad">{error}</Banner>}
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------- thresholds */

function ThresholdSheet({ onClose }: { onClose: () => void }) {
  const { list, create, update } = useData();
  const existing = list('threshold').find((t) => t.farmId === null);

  const [drop, setDrop] = useState(String(existing?.productionDropPoints ?? 5));
  const [baseline, setBaseline] = useState(String(existing?.productionBaselineDays ?? 7));
  const [mortality, setMortality] = useState(String(existing?.mortalitySpikePercent ?? 0.5));
  const [cover, setCover] = useState(String(existing?.feedCoverDays ?? 5));
  const [hour, setHour] = useState(String(existing?.missedEntryByHour ?? 19));
  const [lead, setLead] = useState(String(existing?.vaccinationLeadDays ?? 3));

  const save = async () => {
    const payload = {
      farmId: null,
      productionDropPoints: Number(drop) || 5,
      productionBaselineDays: Math.max(3, Number(baseline) || 7),
      mortalitySpikePercent: Number(mortality) || 0.5,
      feedCoverDays: Number(cover) || 5,
      missedEntryByHour: Math.min(23, Math.max(0, Number(hour) || 19)),
      vaccinationLeadDays: Number(lead) || 3,
    };
    if (existing) await update(existing.id, payload);
    else await create('threshold', payload);
    void tap();
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Alert thresholds"
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => void save()}>Save</button>
      </>}>
      <div className="stack">
        <Field label="Production drop" hint="Hen-day points below the recent average before you are told.">
          <NumberInput value={drop} onChange={setDrop} suffix="points" />
        </Field>
        <Field label="Compared against" hint="Days averaged to form that baseline.">
          <NumberInput value={baseline} onChange={setBaseline} decimal={false} suffix="days" />
        </Field>
        <Field label="Mortality spike" hint="Daily deaths as a share of the flock.">
          <NumberInput value={mortality} onChange={setMortality} suffix="%" />
        </Field>
        <Field label="Low feed warning" hint="Days of cover below which to warn.">
          <NumberInput value={cover} onChange={setCover} suffix="days" />
        </Field>
        <Field label="Entry expected by" hint="Hour of the day, 0 to 23.">
          <NumberInput value={hour} onChange={setHour} decimal={false} suffix="o'clock" />
        </Field>
        <Field label="Vaccination notice" hint="How many days ahead to remind.">
          <NumberInput value={lead} onChange={setLead} decimal={false} suffix="days" />
        </Field>
      </div>
    </Sheet>
  );
}
