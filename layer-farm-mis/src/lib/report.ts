/**
 * From rows to answers.
 *
 * This is the one place that knows how a farm's stored records become the four
 * numbers on the owner's dashboard. Everything it does is arithmetic already
 * proved correct in `src/domain`; its job is ordering and bookkeeping — which
 * movement happens before which, which bird was alive on which day, which
 * rate applied when.
 *
 * It recomputes from source records every time rather than storing running
 * balances. On a farm's volume that costs a few milliseconds, and it buys
 * something worth far more: an owner who corrects a three-week-old feed
 * purchase sees every figure that depended on it correct itself, instead of
 * discovering that the dashboard and the ledger have drifted apart.
 */

import { allocateExpenses, sliceIndex, type ExpenseToAllocate } from '@/domain/allocation';
import { DEFAULT_RATE, flockDay, rollUp, type CostParts, type FlockDayResult, type RateCard } from '@/domain/costing';
import { addDays, daysBetween, eachDay, maxDay, minDay, type DayKey } from '@/domain/dates';
import { batchIssueMovements, batchReceiptMovement } from '@/domain/mixing';
import type { Paise } from '@/domain/money';
import {
  addEggs, daysOfCover, feedPerBirdPerDayGrams, feedPerDozenKg, henDayPercent,
  mortalityPercent, NO_EGGS, totalEggs, type EggCount,
} from '@/domain/production';
import { pulletChargeSchedule, type PulletSchedule } from '@/domain/pullet';
import { avgCostPerKg, farmLocation, getPool, runStock, shedLocation, type Movement, type StockState } from '@/domain/stock';
import type {
  DailyEntry, Dispatch, Expense, FeedBatch, FeedIssue, FeedPurchase, Flock, FlockEvent,
  Item, MedicineIssue, OtherIncome, Rate, Row, Shed, StockAdjustment, Farm, EntityType,
  Vaccination, GateLog,
} from './types';

/** Movement order within a day. Purchases land before the batches that use them. */
const SEQ = {
  purchase: 100,
  batch: 200,
  issueFromFarm: 300,
  receiveAtShed: 310,
  medicine: 400,
  feedUsed: 500,
  count: 900,
} as const;

export interface Dataset {
  farms: Farm[];
  sheds: Shed[];
  flocks: Flock[];
  items: Item[];
  entries: DailyEntry[];
  purchases: FeedPurchase[];
  batches: FeedBatch[];
  issues: FeedIssue[];
  adjustments: StockAdjustment[];
  medicines: MedicineIssue[];
  vaccinations: Vaccination[];
  gateLogs: GateLog[];
  dispatches: Dispatch[];
  expenses: Expense[];
  otherIncome: OtherIncome[];
  events: FlockEvent[];
  rates: Rate[];
}

const of = <K extends EntityType>(rows: readonly Row[], type: K): Row<K>[] =>
  rows.filter((r) => r.type === type) as unknown as Row<K>[];

export function dataset(rows: readonly Row[]): Dataset {
  return {
    farms: of(rows, 'farm'),
    sheds: of(rows, 'shed'),
    flocks: of(rows, 'flock'),
    items: of(rows, 'item'),
    entries: of(rows, 'daily-entry'),
    purchases: of(rows, 'feed-purchase'),
    batches: of(rows, 'feed-batch'),
    issues: of(rows, 'feed-issue'),
    adjustments: of(rows, 'stock-adjustment'),
    medicines: of(rows, 'medicine-issue'),
    vaccinations: of(rows, 'vaccination'),
    gateLogs: of(rows, 'gate-log'),
    dispatches: of(rows, 'dispatch'),
    expenses: of(rows, 'expense'),
    otherIncome: of(rows, 'other-income'),
    events: of(rows, 'flock-event'),
    rates: of(rows, 'rate'),
  };
}

/* ------------------------------------------------------------ live birds */

export interface BirdLedger {
  /** day → flock → birds alive at the start of that day. */
  byDay: Map<DayKey, Map<string, number>>;
  /** flock → day → birds alive at the start. */
  byFlock: Map<string, Map<DayKey, number>>;
  /** flock → day → birds still alive at the end of that day. */
  endByFlock: Map<string, Map<DayKey, number>>;
  /** flock → day → birds that died that day. */
  deathsByFlock: Map<string, Map<DayKey, number>>;
}

/**
 * Birds alive at the start of each day, per flock.
 *
 * "At the start of the day" is the denominator hen-day % and mortality % are
 * defined against, so the day's own deaths must not be subtracted before the
 * day's own eggs are divided by it.
 */
export function birdLedger(data: Dataset, through: DayKey): BirdLedger {
  const byDay = new Map<DayKey, Map<string, number>>();
  const byFlock = new Map<string, Map<DayKey, number>>();
  const endByFlock = new Map<string, Map<DayKey, number>>();
  const deathsByFlock = new Map<string, Map<DayKey, number>>();

  const entriesByFlock = new Map<string, DailyEntry[]>();
  for (const entry of data.entries) {
    const list = entriesByFlock.get(entry.flockId);
    if (list) list.push(entry);
    else entriesByFlock.set(entry.flockId, [entry]);
  }

  const eventsByFlock = new Map<string, FlockEvent[]>();
  for (const event of data.events) {
    const list = eventsByFlock.get(event.flockId);
    if (list) list.push(event);
    else eventsByFlock.set(event.flockId, [event]);
  }

  for (const flock of data.flocks) {
    // A farm onboarding mid-life starts from its opening count, not from a
    // placement it never recorded.
    const start = flock.opening?.asOf ?? flock.placedOn;
    let alive = flock.opening?.liveBirds ?? flock.birdsPlaced;
    const last = flock.closedOn ? minDay(flock.closedOn, through) : through;
    if (start > last) continue;

    const perDay = new Map<DayKey, number>();
    const endOfDay = new Map<DayKey, number>();
    const deaths = new Map<DayKey, number>();

    const lossByDay = new Map<DayKey, number>();
    for (const entry of entriesByFlock.get(flock.id) ?? []) {
      lossByDay.set(entry.day, (lossByDay.get(entry.day) ?? 0) + entry.died + entry.culled);
      deaths.set(entry.day, (deaths.get(entry.day) ?? 0) + entry.died);
    }
    for (const event of eventsByFlock.get(flock.id) ?? []) {
      if (event.kind === 'bird-sale') lossByDay.set(event.day, (lossByDay.get(event.day) ?? 0) + event.birds);
      if (event.kind === 'transfer' && event.fromShedId && !event.toShedId) {
        lossByDay.set(event.day, (lossByDay.get(event.day) ?? 0) + event.birds);
      }
    }

    for (const day of eachDay(start, last)) {
      perDay.set(day, alive);
      let forDay = byDay.get(day);
      if (!forDay) byDay.set(day, (forDay = new Map()));
      forDay.set(flock.id, alive);
      alive = Math.max(0, alive - (lossByDay.get(day) ?? 0));
      endOfDay.set(day, alive);
    }

    byFlock.set(flock.id, perDay);
    endByFlock.set(flock.id, endOfDay);
    deathsByFlock.set(flock.id, deaths);
  }

  return { byDay, byFlock, endByFlock, deathsByFlock };
}

/* ----------------------------------------------------------- stock */

/**
 * Every stock movement the farm's records imply, in the order they happened.
 *
 * Feed batches are the awkward case: a batch's finished feed is worth exactly
 * what its raw materials cost, and that is not known until the issues have
 * been priced against live pools. So the ledger is run twice — once to price
 * the issues, once with the resulting receipts folded in.
 */
export function stockMovements(data: Dataset): Movement[] {
  const moves: Movement[] = [];

  for (const p of data.purchases) {
    moves.push({
      day: p.day, seq: SEQ.purchase, location: farmLocation(p.farmId), itemId: p.itemId,
      kind: 'receive', qty: p.qty, valuePaise: p.amount, ref: `purchase:${p.id}`,
    });
  }

  for (const issue of data.issues) {
    moves.push({
      day: issue.day, seq: SEQ.issueFromFarm, location: farmLocation(issue.farmId),
      itemId: issue.itemId, kind: 'issue', qty: issue.qty, ref: `feed-issue:${issue.id}`,
    });
  }

  for (const m of data.medicines) {
    moves.push({
      day: m.day, seq: SEQ.medicine, location: farmLocation(m.farmId), itemId: m.itemId,
      kind: 'issue', qty: m.qty, ref: `medicine:${m.id}`, flockId: m.flockId ?? undefined,
    });
  }

  for (const entry of data.entries) {
    if (entry.feedGrams > 0 && entry.feedItemId) {
      moves.push({
        day: entry.day, seq: SEQ.feedUsed, location: shedLocation(entry.shedId),
        itemId: entry.feedItemId, kind: 'issue', qty: entry.feedGrams,
        ref: `entry:${entry.id}`, flockId: entry.flockId,
      });
    }
  }

  for (const a of data.adjustments) {
    moves.push({
      day: a.day, seq: SEQ.count, location: farmLocation(a.farmId), itemId: a.itemId,
      kind: 'count', qty: a.countedQty, ref: `adjustment:${a.id}`,
    });
  }

  return moves;
}

export function runFarmStock(data: Dataset): StockState {
  const base = stockMovements(data);

  const batchSpecs = data.batches.map((b, index) => ({
    id: b.id, day: b.day, seq: SEQ.batch + index, farmId: b.farmId,
    inputs: b.inputs.map((i) => ({ itemId: i.itemId, qty: i.qty })),
    outputItemId: b.outputItemId, outputQty: b.outputQty,
  }));

  // Pass one: price the batch issues and the farm-side feed issues.
  const firstPass = runStock([...base, ...batchSpecs.flatMap(batchIssueMovements)]);

  const batchReceipts = batchSpecs.map((spec) => {
    const consumed = firstPass.costs
      .filter((c) => c.ref === `batch:${spec.id}`)
      .reduce((sum, c) => sum + c.cost, 0);
    return batchReceiptMovement(spec, consumed);
  });

  // Feed issued to a shed arrives there carrying the cost it left the farm with.
  const shedReceipts: Movement[] = data.issues.map((issue) => {
    const cost = firstPass.costs.find((c) => c.ref === `feed-issue:${issue.id}`)?.cost ?? 0;
    return {
      day: issue.day, seq: SEQ.receiveAtShed, location: shedLocation(issue.shedId),
      itemId: issue.itemId, kind: 'receive', qty: issue.qty, valuePaise: cost,
      ref: `feed-issue:${issue.id}`,
    };
  });

  return runStock([
    ...base,
    ...batchSpecs.flatMap(batchIssueMovements),
    ...batchReceipts,
    ...shedReceipts,
  ]);
}

/* ------------------------------------------------------------- rates */

/** The rate in force for a farm on a day: farm override first, else the zone. */
export function rateFor(data: Dataset, farm: Farm | null, day: DayKey): RateCard {
  if (!farm) return DEFAULT_RATE;
  const candidates = data.rates
    .filter((r) => r.day <= day && (r.farmId === farm.id || (r.farmId === null && r.zone === farm.neccZone)))
    .sort((a, b) => (a.day === b.day ? (a.farmId ? -1 : 1) : a.day < b.day ? 1 : -1));
  const best = candidates[0];
  return {
    zoneRatePer100: best?.ratePer100 ?? 0,
    farmGateAdjust: farm.farmGateAdjust,
    smallEggGap: farm.smallEggGap,
  };
}

/* -------------------------------------------------------- pullet cost */

/** Laying-life release schedule per flock, keyed by flock id. */
export function pulletSchedules(data: Dataset, stock: StockState): Map<string, Map<DayKey, Paise>> {
  const out = new Map<string, Map<DayKey, Paise>>();

  for (const flock of data.flocks) {
    const layFrom = flock.layFrom;
    if (!layFrom || flock.layingLifeDays <= 0) continue;

    // Bought pullets carry their purchase price. Own-reared flocks carry the
    // placement cost plus everything spent on them before they started laying.
    let cost = flock.placementCost + (flock.opening?.costToDate ?? 0);
    if (flock.source === 'own-reared') {
      cost += stock.costs
        .filter((c) => c.flockId === flock.id && c.day < layFrom)
        .reduce((sum, c) => sum + c.cost, 0);
    }

    const schedule: PulletSchedule = {
      cost,
      expectedSpentHenValue: flock.expectedSpentHenValue,
      layFrom,
      layingLifeDays: flock.layingLifeDays,
    };
    out.set(flock.id, pulletChargeSchedule(schedule));
  }
  return out;
}

/* ------------------------------------------------------- the big build */

export interface FlockDay extends FlockDayResult {
  farmId: string;
  shedId: string;
  henDay: number | null;
  mortality: number | null;
  died: number;
  culled: number;
  feedPerBird: number | null;
  feedPerDozen: number | null;
}

export interface Ledger {
  data: Dataset;
  stock: StockState;
  birds: BirdLedger;
  /** day → flock → the day's full picture. */
  days: Map<DayKey, Map<string, FlockDay>>;
  from: DayKey;
  to: DayKey;
}

/**
 * Build everything for a date range.
 *
 * The range bounds the *output*, not the input: stock and pullet schedules are
 * always replayed from the beginning, because the average cost of the feed
 * eaten today depends on a purchase made months ago.
 */
export function buildLedger(rows: readonly Row[], from: DayKey, to: DayKey): Ledger {
  const data = dataset(rows);
  const stock = runFarmStock(data);
  const birds = birdLedger(data, to);
  const pullets = pulletSchedules(data, stock);

  const flockById = new Map(data.flocks.map((f) => [f.id, f]));
  const farmById = new Map(data.farms.map((f) => [f.id, f]));

  // Feed and medicine costs, indexed by flock and day.
  const feedCost = new Map<string, number>();
  const medicineCost = new Map<string, number>();
  for (const cost of stock.costs) {
    if (!cost.flockId) continue;
    const key = `${cost.flockId}|${cost.day}`;
    if (cost.ref?.startsWith('entry:')) feedCost.set(key, (feedCost.get(key) ?? 0) + cost.cost);
    if (cost.ref?.startsWith('medicine:')) medicineCost.set(key, (medicineCost.get(key) ?? 0) + cost.cost);
  }

  // Expenses spread over their period, then split by live birds.
  const toAllocate: ExpenseToAllocate[] = data.expenses.map((e) => ({
    id: e.id, amount: e.amount,
    from: e.from || e.day, to: e.to || e.day,
    flockId: e.flockId ?? undefined,
    shedId: e.shedId ?? undefined,
  }));
  const flocksOfShed = (shedId: string): string[] =>
    data.flocks.filter((f) => f.shedId === shedId).map((f) => f.id);
  const overhead = sliceIndex(allocateExpenses(toAllocate, birds.byDay, flocksOfShed));

  // Other income, on the day it was recorded.
  const otherIncome = new Map<string, Paise>();
  for (const income of data.otherIncome) {
    if (!income.flockId) continue;
    const key = `${income.flockId}|${income.day}`;
    otherIncome.set(key, (otherIncome.get(key) ?? 0) + income.amount);
  }

  // Eggs, feed and deaths per flock-day, from the shed entries.
  const eggsBy = new Map<string, EggCount>();
  const feedBy = new Map<string, number>();
  const diedBy = new Map<string, number>();
  const culledBy = new Map<string, number>();
  for (const entry of data.entries) {
    const key = `${entry.flockId}|${entry.day}`;
    eggsBy.set(key, addEggs(eggsBy.get(key) ?? NO_EGGS, entry.eggs));
    feedBy.set(key, (feedBy.get(key) ?? 0) + entry.feedGrams);
    diedBy.set(key, (diedBy.get(key) ?? 0) + entry.died);
    culledBy.set(key, (culledBy.get(key) ?? 0) + entry.culled);
  }

  const days = new Map<DayKey, Map<string, FlockDay>>();

  for (const day of eachDay(from, to)) {
    const live = birds.byDay.get(day);
    if (!live) continue;
    const forDay = new Map<string, FlockDay>();

    for (const [flockId, liveAtStart] of live) {
      const flock = flockById.get(flockId);
      if (!flock) continue;
      const key = `${flockId}|${day}`;
      const eggs = eggsBy.get(key) ?? NO_EGGS;
      const feedGrams = feedBy.get(key) ?? 0;
      const died = diedBy.get(key) ?? 0;
      const culled = culledBy.get(key) ?? 0;

      const cost: CostParts = {
        feed: feedCost.get(key) ?? 0,
        medicine: medicineCost.get(key) ?? 0,
        overhead: overhead.get(day)?.get(flockId) ?? 0,
        pullet: pullets.get(flockId)?.get(day) ?? 0,
      };

      const result = flockDay({
        day, flockId, liveAtStart, eggs, feedGrams, cost,
        otherIncome: otherIncome.get(key) ?? 0,
        rate: rateFor(data, farmById.get(flock.farmId) ?? null, day),
      });

      forDay.set(flockId, {
        ...result,
        farmId: flock.farmId,
        shedId: flock.shedId,
        died,
        culled,
        henDay: henDayPercent(eggs, liveAtStart),
        mortality: mortalityPercent(died, liveAtStart),
        feedPerBird: feedPerBirdPerDayGrams(feedGrams, liveAtStart),
        feedPerDozen: feedPerDozenKg(feedGrams, totalEggs(eggs)),
      });
    }
    days.set(day, forDay);
  }

  return { data, stock, birds, days, from, to };
}

/* --------------------------------------------------------- read-outs */

export interface DaySummary {
  day: DayKey;
  eggs: EggCount;
  liveBirds: number;
  died: number;
  feedGrams: number;
  revenue: Paise;
  cost: Paise;
  profit: Paise;
  costParts: CostParts;
  henDay: number | null;
  mortality: number | null;
  feedPerBird: number | null;
  feedPerDozen: number | null;
  costPerEgg: number | null;
  flocks: number;
}

const EMPTY_SUMMARY = (day: DayKey): DaySummary => ({
  day, eggs: NO_EGGS, liveBirds: 0, died: 0, feedGrams: 0,
  revenue: 0, cost: 0, profit: 0,
  costParts: { feed: 0, medicine: 0, overhead: 0, pullet: 0 },
  henDay: null, mortality: null, feedPerBird: null, feedPerDozen: null, costPerEgg: null,
  flocks: 0,
});

/** Roll a day up across whichever flocks pass the filter. */
export function summarise(
  ledger: Ledger,
  day: DayKey,
  keep: (f: FlockDay) => boolean = () => true,
): DaySummary {
  const forDay = [...(ledger.days.get(day)?.values() ?? [])].filter(keep);
  if (forDay.length === 0) return EMPTY_SUMMARY(day);

  const period = rollUp(forDay);
  const liveBirds = forDay.reduce((s, f) => s + f.liveAtStart, 0);
  const died = forDay.reduce((s, f) => s + f.died, 0);

  return {
    day,
    eggs: period.eggs,
    liveBirds,
    died,
    feedGrams: period.feedGrams,
    revenue: period.revenue.total,
    cost: period.costTotal,
    profit: period.profit,
    costParts: period.cost,
    // Ratios are recomputed from the totals, never averaged from the parts.
    henDay: henDayPercent(period.eggs, liveBirds),
    mortality: mortalityPercent(died, liveBirds),
    feedPerBird: feedPerBirdPerDayGrams(period.feedGrams, liveBirds),
    feedPerDozen: feedPerDozenKg(period.feedGrams, totalEggs(period.eggs)),
    costPerEgg: period.costPerEgg,
    flocks: forDay.length,
  };
}

export const summariseFarm = (ledger: Ledger, day: DayKey, farmId: string | null): DaySummary =>
  summarise(ledger, day, (f) => !farmId || f.farmId === farmId);

export const summariseShed = (ledger: Ledger, day: DayKey, shedId: string): DaySummary =>
  summarise(ledger, day, (f) => f.shedId === shedId);

/** A run of daily summaries, for trends and sparklines. */
export function series(
  ledger: Ledger,
  days: readonly DayKey[],
  keep: (f: FlockDay) => boolean = () => true,
): DaySummary[] {
  return days.map((day) => summarise(ledger, day, keep));
}

/* ------------------------------------------------------ feed inventory */

export interface FeedInventory {
  /** Finished feed held at the farm, in grams. */
  feedGrams: number;
  /** Raw materials held at the farm, in grams. */
  rawGrams: number;
  /** Feed already issued and sitting in the sheds. */
  shedGrams: number;
  valuePaise: Paise;
  /** Paise per kg of finished feed. */
  costPerKg: number;
  /** Average daily use over the look-back window. */
  avgDailyGrams: number;
  /** Stock ÷ average daily use, counting what is in the sheds too. */
  coverDays: number | null;
}

export function feedInventory(ledger: Ledger, farmId: string, on: DayKey, lookBackDays = 7): FeedInventory {
  const { data, stock } = ledger;
  const feedItems = data.items.filter((i) => i.category === 'feed').map((i) => i.id);
  const rawItems = data.items.filter((i) => i.category === 'raw-material').map((i) => i.id);
  const sheds = data.sheds.filter((s) => s.farmId === farmId).map((s) => s.id);

  const location = farmLocation(farmId);
  let feedGrams = 0;
  let valuePaise = 0;
  let weightedRate = 0;
  for (const itemId of feedItems) {
    const pool = getPool(stock, location, itemId);
    feedGrams += pool.qty;
    valuePaise += pool.value;
    weightedRate += avgCostPerKg(pool) * pool.qty;
  }
  const rawGrams = rawItems.reduce((sum, itemId) => sum + getPool(stock, location, itemId).qty, 0);
  const rawValue = rawItems.reduce((sum, itemId) => sum + getPool(stock, location, itemId).value, 0);

  let shedGrams = 0;
  for (const shedId of sheds) {
    for (const itemId of feedItems) shedGrams += getPool(stock, shedLocation(shedId), itemId).qty;
  }

  const window = eachDay(addDays(on, -(lookBackDays - 1)), on);
  const used = window.reduce((sum, day) => sum + summariseFarm(ledger, day, farmId).feedGrams, 0);
  const avgDailyGrams = window.length > 0 ? used / window.length : 0;

  return {
    feedGrams,
    rawGrams,
    shedGrams,
    valuePaise: valuePaise + rawValue,
    costPerKg: feedGrams > 0 ? Math.round(weightedRate / feedGrams) : 0,
    avgDailyGrams,
    coverDays: daysOfCover(feedGrams + shedGrams, avgDailyGrams),
  };
}

/* ---------------------------------------------------------- egg stock */

export interface EggStock {
  gradeA: number;
  gradeB: number;
  total: number;
}

/**
 * Eggs on hand: everything collected, less everything dispatched.
 *
 * Broken eggs never enter stock — they counted towards production because the
 * bird laid them, but they cannot be sold, which is exactly the gap the
 * reconciliation screen exists to surface.
 */
export function eggStock(ledger: Ledger, farmId: string | null, through: DayKey): EggStock {
  const { data } = ledger;
  const flockFarm = new Map(data.flocks.map((f) => [f.id, f.farmId]));

  let gradeA = 0;
  let gradeB = 0;
  for (const entry of data.entries) {
    if (entry.day > through) continue;
    if (farmId && flockFarm.get(entry.flockId) !== farmId) continue;
    gradeA += entry.eggs.gradeA;
    gradeB += entry.eggs.gradeB;
  }
  for (const dispatch of data.dispatches) {
    if (dispatch.day > through) continue;
    if (farmId && dispatch.farmId !== farmId) continue;
    for (const line of dispatch.lines) {
      if (line.grade === 'A') gradeA -= line.qtySent;
      else gradeB -= line.qtySent;
    }
  }
  return { gradeA, gradeB, total: gradeA + gradeB };
}

/* ------------------------------------------------------- flock report */

export interface FlockReport {
  flock: Flock;
  days: FlockDay[];
  totals: ReturnType<typeof rollUp>;
  liveBirds: number;
  ageDays: number;
  peakHenDay: number | null;
  cumulativeMortality: number | null;
}

export function flockReport(ledger: Ledger, flockId: string, from: DayKey, to: DayKey): FlockReport | null {
  const flock = ledger.data.flocks.find((f) => f.id === flockId);
  if (!flock) return null;

  const days: FlockDay[] = [];
  for (const day of eachDay(maxDay(from, flock.opening?.asOf ?? flock.placedOn), to)) {
    const found = ledger.days.get(day)?.get(flockId);
    if (found) days.push(found);
  }

  // The headline count is what is alive now — after the last day's losses, not
  // before them. A farmer reading "9,985 birds" on an evening when fifteen
  // died that morning would rightly stop trusting the screen.
  const endOfDay = ledger.birds.endByFlock.get(flockId);
  const lastDay = days.at(-1);
  const liveBirds = endOfDay?.get(to)
    ?? (lastDay ? Math.max(0, lastDay.liveAtStart - lastDay.died - lastDay.culled) : 0);
  const placed = flock.opening?.liveBirds ?? flock.birdsPlaced;
  const henDays = days.map((d) => d.henDay).filter((v): v is number => v !== null);

  return {
    flock,
    days,
    totals: rollUp(days),
    liveBirds,
    ageDays: daysBetween(flock.placedOn, to),
    peakHenDay: henDays.length > 0 ? Math.max(...henDays) : null,
    cumulativeMortality: placed > 0 ? ((placed - liveBirds) / placed) * 100 : null,
  };
}

/* ------------------------------------------------- sales reconciliation */

/**
 * Production valued at rate against what the dispatches actually invoiced.
 *
 * This is the honesty check on recognising revenue at production: a true-up
 * that drifts means the farm's rate card is wrong, and the daily P&L has been
 * quietly overstating or understating every day since.
 */
export function valuedVsInvoiced(
  ledger: Ledger, farmId: string | null, from: DayKey, to: DayKey,
): { valued: Paise; invoiced: Paise } {
  let valued = 0;
  for (const day of eachDay(from, to)) {
    for (const flockDayResult of ledger.days.get(day)?.values() ?? []) {
      if (farmId && flockDayResult.farmId !== farmId) continue;
      valued += flockDayResult.revenue.eggs;
    }
  }

  let invoiced = 0;
  for (const dispatch of ledger.data.dispatches) {
    if (dispatch.day < from || dispatch.day > to) continue;
    if (farmId && dispatch.farmId !== farmId) continue;
    for (const line of dispatch.lines) {
      invoiced += Math.round((line.qtyReceived || line.qtySent) * line.ratePer100 / 100);
    }
  }

  return { valued, invoiced };
}
