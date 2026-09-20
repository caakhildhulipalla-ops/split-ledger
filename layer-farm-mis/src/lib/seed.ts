/**
 * What exists before anyone types anything.
 *
 * Ten masters have to be in place before a supervisor can make the first
 * entry. Asking a farmer to key in "Maize", "Layer feed", "Electricity" and
 * "bag = 50 kg" before they can record a single egg is how onboarding dies, so
 * the app ships with the sensible South Indian defaults and lets the owner
 * change any of them.
 */

import { addDays, dayKey, daysBetween, eachDay, type DayKey } from '@/domain/dates';
import { DEFAULT_UNITS } from '@/domain/units';
import { newId } from './id';
import type { EntityMap, EntityType, Row } from './types';

export interface SeedContext {
  tenantId: string;
  userId: string;
  role: 'owner';
}

/** Build a stored row directly, bypassing the write path used by the UI. */
export function seedRow<K extends EntityType>(
  ctx: SeedContext, type: K, payload: EntityMap[K], id?: string, at = new Date().toISOString(),
): Row<K> {
  return {
    ...payload,
    id: id ?? newId(),
    type,
    tenantId: ctx.tenantId,
    createdAt: at, updatedAt: at,
    createdBy: ctx.userId, updatedBy: ctx.userId, updatedByRole: ctx.role,
    rev: 1, deletedAt: null, sync: 'pending',
  } as unknown as Row<K>;
}

/* ------------------------------------------------------------- heads */

export const INCOME_HEADS = [
  'Eggs sold (50 g and above)',
  'Eggs sold (under 50 g)',
  'Spent hens (cull birds)',
  'Manure',
  'Empty feed bags',
  'Egg trays',
  'Other income',
];

export const EXPENSE_HEADS = [
  'Feed and raw materials',
  'Chicks or pullets',
  'Medicines and vaccines',
  'Labour',
  'Electricity',
  'Diesel',
  'Repairs and maintenance',
  'Transport',
  'Miscellaneous',
];

/* ------------------------------------------------------------- items */

const FEED_ITEMS: { name: string; unit: string }[] = [
  { name: 'Chick mash', unit: 'bag' },
  { name: 'Grower mash', unit: 'bag' },
  { name: 'Layer feed', unit: 'bag' },
];

const RAW_ITEMS: { name: string; unit: string }[] = [
  { name: 'Maize', unit: 'quintal' },
  { name: 'Soya DOC', unit: 'quintal' },
  { name: 'DORB', unit: 'quintal' },
  { name: 'Limestone powder', unit: 'quintal' },
  { name: 'Shell grit', unit: 'bag' },
  { name: 'Layer premix', unit: 'kg' },
];

const OTHER_ITEMS: { name: string; category: 'vaccine-medicine' | 'packaging' | 'fuel' | 'manure'; unit: string; dimension: 'mass' | 'count' | 'volume' }[] = [
  { name: 'Lasota vaccine', category: 'vaccine-medicine', unit: 'piece', dimension: 'count' },
  { name: 'R2B vaccine', category: 'vaccine-medicine', unit: 'piece', dimension: 'count' },
  { name: 'IBD vaccine', category: 'vaccine-medicine', unit: 'piece', dimension: 'count' },
  { name: 'Calcium supplement', category: 'vaccine-medicine', unit: 'kg', dimension: 'mass' },
  { name: 'Egg trays', category: 'packaging', unit: 'piece', dimension: 'count' },
  { name: 'Diesel', category: 'fuel', unit: 'l', dimension: 'volume' },
  { name: 'Manure', category: 'manure', unit: 'tonne', dimension: 'mass' },
];

/** The standard layer schedule, copied to each farm and editable there. */
export const VACCINATION_ROWS = [
  { ageDays: 0, vaccine: "Marek's", route: 'Subcutaneous', notes: 'At the hatchery' },
  { ageDays: 5, vaccine: 'Lasota (F1)', route: 'Eye drop', notes: '' },
  { ageDays: 12, vaccine: 'IBD (1)', route: 'Drinking water', notes: '' },
  { ageDays: 21, vaccine: 'IBD (2)', route: 'Drinking water', notes: '' },
  { ageDays: 28, vaccine: 'Lasota (F2)', route: 'Drinking water', notes: '' },
  { ageDays: 42, vaccine: 'Fowl pox', route: 'Wing web', notes: '' },
  { ageDays: 56, vaccine: 'R2B', route: 'Subcutaneous', notes: '' },
  { ageDays: 84, vaccine: 'Fowl cholera', route: 'Subcutaneous', notes: '' },
  { ageDays: 112, vaccine: 'Lasota booster', route: 'Drinking water', notes: '' },
  { ageDays: 119, vaccine: 'EDS', route: 'Intramuscular', notes: 'Before point of lay' },
];

/**
 * Everything a new tenant needs before the first entry.
 *
 * Returns the rows only — the caller decides whether they go into the device
 * database, the outbox, or both.
 */
export function masterData(ctx: SeedContext, tenantName: string): Row[] {
  const rows: Row[] = [];

  rows.push(seedRow(ctx, 'tenant', { name: tenantName, layingLifeDays: 560, currency: 'INR' }, ctx.tenantId));

  for (const unit of DEFAULT_UNITS) {
    rows.push(seedRow(ctx, 'unit', {
      code: unit.code, label: unit.label, plural: unit.plural,
      dimension: unit.dimension, factor: unit.factor, decimals: unit.decimals,
    }));
  }

  for (const { name, unit } of FEED_ITEMS) {
    rows.push(seedRow(ctx, 'item', { name, category: 'feed', dimension: 'mass', entryUnit: unit, active: true }));
  }
  for (const { name, unit } of RAW_ITEMS) {
    rows.push(seedRow(ctx, 'item', { name, category: 'raw-material', dimension: 'mass', entryUnit: unit, active: true }));
  }
  for (const item of OTHER_ITEMS) {
    rows.push(seedRow(ctx, 'item', {
      name: item.name, category: item.category, dimension: item.dimension,
      entryUnit: item.unit, active: true,
    }));
  }

  for (const name of INCOME_HEADS) {
    rows.push(seedRow(ctx, 'head', { kind: 'income', name, builtIn: true, active: true }));
  }
  for (const name of EXPENSE_HEADS) {
    rows.push(seedRow(ctx, 'head', { kind: 'expense', name, builtIn: true, active: true }));
  }

  rows.push(seedRow(ctx, 'vaccination-template', {
    farmId: null,
    name: 'Standard layer schedule',
    rows: VACCINATION_ROWS.map((r) => ({ id: newId(), ...r })),
  }));

  rows.push(seedRow(ctx, 'threshold', {
    farmId: null,
    productionDropPoints: 5,
    productionBaselineDays: 7,
    mortalitySpikePercent: 0.5,
    feedCoverDays: 5,
    missedEntryByHour: 19,
    vaccinationLeadDays: 3,
  }));

  return rows;
}

/* --------------------------------------------------------- demo farm */

/** Deterministic noise, so the demo farm looks the same on every phone. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * A realistic laying curve.
 *
 * Birds start laying around 18 weeks, climb to a peak near 94% at about 30
 * weeks, then decline slowly. Without this shape the dashboard's trends would
 * be a flat line and nothing on it could be judged.
 */
function henDayFor(ageWeeks: number): number {
  if (ageWeeks < 18) return 0;
  if (ageWeeks < 20) return 20 + (ageWeeks - 18) * 25;
  if (ageWeeks < 24) return 70 + (ageWeeks - 20) * 5;
  if (ageWeeks < 32) return 90 + (ageWeeks - 24) * 0.5;
  return Math.max(55, 94 - (ageWeeks - 32) * 0.38);
}

/** Grams of feed a bird eats a day, by age. */
function feedGramsFor(ageWeeks: number): number {
  if (ageWeeks < 8) return 35 + ageWeeks * 3;
  if (ageWeeks < 18) return 60 + (ageWeeks - 8) * 3.5;
  return 108 + Math.min(10, (ageWeeks - 18) * 0.2);
}

export interface DemoOptions {
  /** How many days of history to generate. */
  days?: number;
  /** Last day of the generated history. */
  through?: DayKey;
}

/**
 * A three-farm business with history, so the dashboard has something to show.
 *
 * Matches the shape the requirements describe for a large customer: one owner,
 * farms in different places, several sheds per farm, one supervisor per shed,
 * and flocks at different ages so the age-related figures differ.
 */
export function demoFarm(ctx: SeedContext, options: DemoOptions = {}): Row[] {
  const through = options.through ?? dayKey();
  const days = options.days ?? 120;
  const from = addDays(through, -(days - 1));
  const rand = rng(20260920);
  const rows: Row[] = [];
  const at = new Date(Date.parse(`${from}T06:00:00.000Z`)).toISOString();

  const add = <K extends EntityType>(type: K, payload: EntityMap[K], id?: string) => {
    const row = seedRow(ctx, type, payload, id, at);
    rows.push(row);
    return row;
  };

  /* masters ------------------------------------------------------------ */

  const feedItem = add('item', { name: 'Layer feed', category: 'feed', dimension: 'mass', entryUnit: 'bag', active: true });
  const growerItem = add('item', { name: 'Grower mash', category: 'feed', dimension: 'mass', entryUnit: 'bag', active: true });
  const maize = add('item', { name: 'Maize', category: 'raw-material', dimension: 'mass', entryUnit: 'quintal', active: true });
  const soya = add('item', { name: 'Soya DOC', category: 'raw-material', dimension: 'mass', entryUnit: 'quintal', active: true });
  const dorb = add('item', { name: 'DORB', category: 'raw-material', dimension: 'mass', entryUnit: 'quintal', active: true });
  const lime = add('item', { name: 'Limestone powder', category: 'raw-material', dimension: 'mass', entryUnit: 'quintal', active: true });
  const vaccineItem = add('item', { name: 'Lasota vaccine', category: 'vaccine-medicine', dimension: 'count', entryUnit: 'piece', active: true });

  const electricity = add('head', { kind: 'expense', name: 'Electricity', builtIn: true, active: true });
  const labour = add('head', { kind: 'expense', name: 'Labour', builtIn: true, active: true });
  const transport = add('head', { kind: 'expense', name: 'Transport', builtIn: true, active: true });
  const repairs = add('head', { kind: 'expense', name: 'Repairs and maintenance', builtIn: true, active: true });
  const manureHead = add('head', { kind: 'income', name: 'Manure', builtIn: true, active: true });

  const trader = add('party', { kind: 'customer', name: 'Sri Lakshmi Egg Traders', phone: '98480 11223', place: 'Hyderabad', registration: '' });
  const feedSupplier = add('party', { kind: 'supplier', name: 'Anjaneya Agro Mills', phone: '94900 55441', place: 'Kadapa', registration: '' });
  const lorry = add('party', { kind: 'vehicle', name: 'Ashok Leyland Dost', phone: '', place: '', registration: 'AP 04 TX 8821' });

  /* farms and sheds ---------------------------------------------------- */

  const kadapa = add('farm', {
    name: 'Kadapa farm', location: 'Kadapa, Andhra Pradesh', neccZone: 'Hyderabad',
    contact: '98480 11223', farmGateAdjust: -15_00, smallEggGap: 60_00, layingLifeDays: 560,
  });
  const nellore = add('farm', {
    name: 'Nellore farm', location: 'Nellore, Andhra Pradesh', neccZone: 'Chennai',
    contact: '98480 11224', farmGateAdjust: -10_00, smallEggGap: 55_00, layingLifeDays: 560,
  });

  const shedK1 = add('shed', { farmId: kadapa.id, name: 'Shed 1', housing: 'a-frame-cage', capacity: 20_000, sessionsPerDay: 2, supervisorIds: [] });
  const shedK2 = add('shed', { farmId: kadapa.id, name: 'Shed 2', housing: 'a-frame-cage', capacity: 20_000, sessionsPerDay: 1, supervisorIds: [] });
  const shedK3 = add('shed', { farmId: kadapa.id, name: 'Grower shed', housing: 'deep-litter', capacity: 12_000, sessionsPerDay: 1, supervisorIds: [] });
  const shedN1 = add('shed', { farmId: nellore.id, name: 'Shed 1', housing: 'a-frame-cage', capacity: 15_000, sessionsPerDay: 1, supervisorIds: [] });

  /* flocks ------------------------------------------------------------- */

  interface DemoFlock { id: string; shedId: string; farmId: string; placed: DayKey; birds: number; layFrom: DayKey | null }

  const flockSpecs: DemoFlock[] = [
    // Well into lay: placed 14 months ago, laying since 18 weeks.
    { id: '', shedId: shedK1.id, farmId: kadapa.id, placed: addDays(through, -430), birds: 18_000, layFrom: addDays(through, -430 + 126) },
    // Just past peak.
    { id: '', shedId: shedK2.id, farmId: kadapa.id, placed: addDays(through, -250), birds: 17_500, layFrom: addDays(through, -250 + 126) },
    // Still rearing — no eggs yet, which is the case that breaks naive maths.
    { id: '', shedId: shedK3.id, farmId: kadapa.id, placed: addDays(through, -70), birds: 11_000, layFrom: null },
    // Nellore, in lay.
    { id: '', shedId: shedN1.id, farmId: nellore.id, placed: addDays(through, -330), birds: 14_000, layFrom: addDays(through, -330 + 126) },
  ];

  for (const spec of flockSpecs) {
    const isRearing = spec.layFrom === null;
    const flock = add('flock', {
      farmId: spec.farmId, shedId: spec.shedId,
      name: `Batch ${String.fromCharCode(65 + flockSpecs.indexOf(spec))}`,
      source: isRearing ? 'own-reared' : 'bought-pullet',
      supplierId: null, breed: 'BV300',
      placedOn: spec.placed,
      birdsPlaced: spec.birds,
      placementCost: isRearing ? 42_00 * spec.birds : 285_00 * spec.birds,
      phase: isRearing ? 'rearing' : 'laying',
      layFrom: spec.layFrom,
      layingLifeDays: 560,
      expectedSpentHenValue: 62_00 * spec.birds,
      // Onboarding mid-life: the farm's books start the day it joined.
      opening: spec.placed < from
        ? { asOf: from, liveBirds: Math.round(spec.birds * 0.94), costToDate: 0 }
        : null,
      closedOn: null,
    });
    spec.id = flock.id;
  }

  /* rates: one a day, wandering the way NECC does -------------------- */

  let hyderabad = 540_00;
  let chennai = 548_00;
  for (const day of eachDay(from, through)) {
    hyderabad = Math.max(420_00, Math.min(640_00, hyderabad + Math.round((rand() - 0.48) * 14_00)));
    chennai = Math.max(420_00, Math.min(640_00, chennai + Math.round((rand() - 0.48) * 14_00)));
    add('rate', { zone: 'Hyderabad', day, ratePer100: hyderabad, farmId: null });
    add('rate', { zone: 'Chennai', day, ratePer100: chennai, farmId: null });
  }

  /* feed: weekly raw material purchases, mixing, and issues ----------- */

  const rawPrices: Record<string, number> = {
    [maize.id]: 24_50, [soya.id]: 48_00, [dorb.id]: 17_50, [lime.id]: 4_20,
  };

  for (const farm of [kadapa, nellore]) {
    const farmFlocks = flockSpecs.filter((f) => f.farmId === farm.id);

    for (const day of eachDay(from, through)) {
      const dayIndex = daysBetween(from, day);

      // Buy raw materials every Monday-ish.
      if (dayIndex % 7 === 0) {
        for (const [itemId, pricePerKg] of Object.entries(rawPrices)) {
          const tonnes = itemId === maize.id ? 22 : itemId === soya.id ? 7 : itemId === dorb.id ? 5 : 2;
          const jitter = 1 + (rand() - 0.5) * 0.06;
          add('feed-purchase', {
            farmId: farm.id, day, supplierId: feedSupplier.id, itemId,
            qty: tonnes * 1_000_000, enteredUnit: 'quintal',
            amount: Math.round(pricePerKg * jitter) * tonnes * 1_000,
            vehicleId: lorry.id, invoiceNo: `INV-${dayIndex}`, notes: '',
          });
        }

        // Mix a batch: 36 tonnes in, 36 tonnes out.
        add('feed-batch', {
          farmId: farm.id, day,
          inputs: [
            { itemId: maize.id, qty: 22_000_000, enteredUnit: 'quintal' },
            { itemId: soya.id, qty: 7_000_000, enteredUnit: 'quintal' },
            { itemId: dorb.id, qty: 5_000_000, enteredUnit: 'quintal' },
            { itemId: lime.id, qty: 2_000_000, enteredUnit: 'quintal' },
          ],
          outputItemId: feedItem.id,
          outputQty: 36_000_000,
          outputUnit: 'kg',
          notes: '',
        });
      }

      // Issue feed to each shed every second day.
      if (dayIndex % 2 === 0) {
        for (const spec of farmFlocks) {
          const ageWeeks = Math.floor(daysBetween(spec.placed, day) / 7);
          const grams = Math.round(feedGramsFor(ageWeeks) * spec.birds * 2.2);
          add('feed-issue', {
            farmId: farm.id, shedId: spec.shedId, day,
            itemId: ageWeeks < 18 ? growerItem.id : feedItem.id,
            qty: grams, enteredUnit: 'bag',
          });
        }
      }
    }
  }

  // Grower mash has to exist in stock before it can be issued.
  for (const farm of [kadapa, nellore]) {
    for (const day of eachDay(from, through)) {
      if (daysBetween(from, day) % 14 !== 0) continue;
      add('feed-purchase', {
        farmId: farm.id, day, supplierId: feedSupplier.id, itemId: growerItem.id,
        qty: 12_000_000, enteredUnit: 'bag', amount: 31_00 * 12_000,
        vehicleId: lorry.id, invoiceNo: '', notes: '',
      });
    }
  }

  /* the daily entries, which is what this whole app is for ----------- */

  for (const spec of flockSpecs) {
    const shed = [shedK1, shedK2, shedK3, shedN1].find((s) => s.id === spec.shedId)!;
    let alive = Math.round(spec.birds * 0.94);

    for (const day of eachDay(from, through)) {
      const ageWeeks = Math.floor(daysBetween(spec.placed, day) / 7);
      const laying = spec.layFrom !== null && day >= spec.layFrom;

      const died = Math.round(rand() * (alive * 0.0004) + (rand() < 0.04 ? rand() * 18 : 0));
      const culled = rand() < 0.08 ? Math.round(rand() * 6) : 0;

      const henDay = laying ? Math.max(0, henDayFor(ageWeeks) + (rand() - 0.5) * 3) : 0;
      const laid = Math.round((alive * henDay) / 100);
      const broken = Math.round(laid * (0.004 + rand() * 0.004));
      const smallShare = ageWeeks < 30 ? 0.18 - (ageWeeks - 18) * 0.01 : 0.05;
      const gradeB = Math.round((laid - broken) * Math.max(0.02, smallShare));
      const gradeA = laid - broken - gradeB;

      const feedGrams = Math.round(feedGramsFor(ageWeeks) * alive * (0.97 + rand() * 0.06));
      const feedItemId = ageWeeks < 18 ? growerItem.id : feedItem.id;

      if (shed.sessionsPerDay === 2 && laying) {
        const split = 0.58;
        add('daily-entry', {
          farmId: spec.farmId, shedId: spec.shedId, flockId: spec.id, day, session: 'morning',
          eggs: { gradeA: Math.round(gradeA * split), gradeB: Math.round(gradeB * split), broken: Math.round(broken * split) },
          died: Math.round(died / 2), culled: 0,
          feedGrams: Math.round(feedGrams * 0.5), feedItemId, remarks: '',
        });
        add('daily-entry', {
          farmId: spec.farmId, shedId: spec.shedId, flockId: spec.id, day, session: 'evening',
          eggs: { gradeA: gradeA - Math.round(gradeA * split), gradeB: gradeB - Math.round(gradeB * split), broken: broken - Math.round(broken * split) },
          died: died - Math.round(died / 2), culled,
          feedGrams: feedGrams - Math.round(feedGrams * 0.5), feedItemId, remarks: '',
        });
      } else {
        add('daily-entry', {
          farmId: spec.farmId, shedId: spec.shedId, flockId: spec.id, day, session: 'day',
          eggs: { gradeA, gradeB, broken },
          died, culled, feedGrams, feedItemId,
          remarks: rand() < 0.03 ? 'Water line cleaned' : '',
        });
      }

      alive = Math.max(0, alive - died - culled);
    }
  }

  /* dispatches: the lorry comes twice a week ------------------------- */

  for (const farm of [kadapa, nellore]) {
    for (const day of eachDay(from, through)) {
      const dayIndex = daysBetween(from, day);
      if (dayIndex % 3 !== 0) continue;

      const zone = farm.id === kadapa.id ? hyderabad : chennai;
      const rateA = Math.max(0, zone + farm.farmGateAdjust);
      const sentA = 26_000 + Math.round(rand() * 6_000);
      const sentB = 3_000 + Math.round(rand() * 1_500);

      add('dispatch', {
        farmId: farm.id, day, customerId: trader.id, vehicleId: lorry.id, driverId: null,
        lines: [
          { grade: 'A', qtySent: sentA, qtyReceived: sentA - Math.round(rand() * 60), ratePer100: rateA },
          { grade: 'B', qtySent: sentB, qtyReceived: sentB, ratePer100: Math.max(0, rateA - farm.smallEggGap) },
        ],
        transitBreakage: Math.round(rand() * 60),
        notes: '',
      });

      if (dayIndex % 9 === 0) {
        add('gate-log', {
          farmId: farm.id, day, vehicleNo: 'AP 04 TX 8821', driver: 'Ravi',
          purpose: 'Egg collection', timeIn: '06:40', timeOut: '07:25',
          disinfected: true, notes: '',
        });
      }
    }
  }

  /* expenses, month by month ----------------------------------------- */

  for (const farm of [kadapa, nellore]) {
    let cursor = from;
    while (cursor <= through) {
      const monthEnd = addDays(cursor, 29) > through ? through : addDays(cursor, 29);
      const scale = farm.id === kadapa.id ? 1 : 0.62;

      for (const [head, amount] of [
        [electricity, 1_05_000_00],
        [labour, 2_40_000_00],
        [transport, 48_000_00],
        [repairs, 22_000_00],
      ] as const) {
        add('expense', {
          farmId: farm.id, day: cursor, headId: head.id,
          amount: Math.round(amount * scale * (0.92 + rand() * 0.16)),
          from: cursor, to: monthEnd,
          shedId: null, flockId: null, partyId: null, notes: '',
        });
      }

      add('other-income', {
        farmId: farm.id, day: monthEnd, headId: manureHead.id,
        qty: 14_000_000, enteredUnit: 'tonne',
        amount: Math.round(28_000_00 * scale),
        flockId: flockSpecs.find((f) => f.farmId === farm.id)?.id ?? null,
        partyId: null, notes: '',
      });

      cursor = addDays(monthEnd, 1);
    }
  }

  /* vaccinations for the rearing flock -------------------------------- */

  const rearing = flockSpecs.find((f) => f.layFrom === null);
  if (rearing) {
    for (const template of VACCINATION_ROWS) {
      const dueOn = addDays(rearing.placed, template.ageDays);
      if (dueOn > addDays(through, 21)) continue;
      add('vaccination', {
        farmId: rearing.farmId, shedId: rearing.shedId, flockId: rearing.id,
        vaccine: template.vaccine, route: template.route,
        dueOn,
        givenOn: dueOn <= through ? dueOn : null,
        itemId: template.vaccine.includes('Lasota') ? vaccineItem.id : null,
        notes: '',
      });
      if (dueOn <= through) {
        add('medicine-issue', {
          farmId: rearing.farmId, shedId: rearing.shedId, flockId: rearing.id, day: dueOn,
          itemId: vaccineItem.id, qty: rearing.birds, enteredUnit: 'piece', notes: template.vaccine,
        });
      }
    }
    add('feed-purchase', {
      farmId: rearing.farmId, day: from, supplierId: feedSupplier.id, itemId: vaccineItem.id,
      qty: rearing.birds * 12, enteredUnit: 'piece', amount: 45_000_00,
      vehicleId: null, invoiceNo: '', notes: '',
    });
  }

  return rows;
}
