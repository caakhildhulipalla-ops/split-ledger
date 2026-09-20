/**
 * Stock and its cost.
 *
 * Feed is the single biggest cost on a layer farm, so "how much is left" and
 * "what did it cost" have to be answered by the same machinery, or the feed
 * inventory tile and the P&L tile will quietly disagree.
 *
 * Every item at every location is a pool holding two integers: quantity in
 * base units, and total value in paise. The average cost is derived — it is
 * never stored and never drifts. Receiving adds to both; issuing takes value
 * out in proportion to quantity; a physical count adjusts quantity and moves
 * value with it at the pool's own average, so a recount never invents profit.
 *
 * Locations matter. Feed bought sits at the farm. Feed issued to a shed moves
 * to that shed at the farm's average cost, and the feed a flock eats is drawn
 * from the shed's pool. That is how a kilogram of feed carries its cost all
 * the way from the supplier's invoice to the flock's cost per egg.
 */

import { mulDiv } from './money';
import type { DayKey } from './dates';

/** `farm:<id>` for farm stores, `shed:<id>` for what has been issued to a shed. */
export type LocationKey = string;

export const farmLocation = (farmId: string): LocationKey => `farm:${farmId}`;
export const shedLocation = (shedId: string): LocationKey => `shed:${shedId}`;

export interface StockPool {
  qty: number;
  value: number;
  /**
   * Last known rate, in paise per RATE_SCALE base units, kept for when the
   * pool empties. Scaled because feed costs about 2.8 paise per gram, and a
   * rate rounded to whole paise per gram would price a tonne of feed ₹200
   * wrong — an error far larger than the margin on the eggs it produces.
   */
  lastRate: number;
}

/** Rates are held per 1,000 base units: per kg for feed, per 1,000 eggs. */
export const RATE_SCALE = 1000;

export const emptyPool = (): StockPool => ({ qty: 0, value: 0, lastRate: 0 });

/** Current rate in paise per RATE_SCALE base units — exact integer maths. */
export function avgRate(pool: StockPool): number {
  if (pool.qty > 0) return mulDiv(pool.value, RATE_SCALE, pool.qty);
  return pool.lastRate;
}

/** Paise per base unit, as a float. For display and ratios only. */
export const avgCost = (pool: StockPool): number => avgRate(pool) / RATE_SCALE;

/** Paise per kg — how feed cost is quoted, checked and argued about. */
export const avgCostPerKg = (pool: StockPool): number => avgRate(pool);

/** Value of a quantity at a given scaled rate. */
export const valueAt = (qty: number, rate: number): number => mulDiv(qty, rate, RATE_SCALE);

export function receive(pool: StockPool, qty: number, valuePaise: number): StockPool {
  if (qty <= 0) return pool;
  const next: StockPool = { qty: pool.qty + qty, value: pool.value + valuePaise, lastRate: pool.lastRate };
  next.lastRate = avgRate(next);
  return next;
}

export interface IssueResult {
  pool: StockPool;
  /** What the issued quantity cost, in paise. */
  cost: number;
  /** Quantity that could not be issued because the pool ran dry. */
  short: number;
}

/**
 * Take `qty` out of a pool.
 *
 * Issuing more than the pool holds is allowed — a supervisor's count of what
 * the birds ate is evidence, and an app that refuses it teaches people to
 * write the wrong number instead — but the shortfall is reported so the screen
 * can warn, and the value drawn from the pool never exceeds what went in. The
 * cost is taken proportionally rather than at a rounded per-unit rate, so the
 * last issue empties the pool to exactly zero.
 */
export function issue(pool: StockPool, qty: number): IssueResult {
  if (qty <= 0) return { pool, cost: 0, short: 0 };
  const short = Math.max(0, qty - pool.qty);
  const taken = Math.min(qty, pool.qty);
  const cost = taken >= pool.qty ? pool.value : mulDiv(pool.value, taken, pool.qty);
  const rate = avgRate(pool);
  const shortCost = short > 0 ? valueAt(short, rate) : 0;
  return {
    pool: { qty: pool.qty - taken, value: pool.value - cost, lastRate: rate },
    cost: cost + shortCost,
    short,
  };
}

export interface CountResult {
  pool: StockPool;
  /** counted − held; positive when the count found more than the books said. */
  delta: number;
  /** Value written off when the count found less. Zero otherwise. */
  writeOff: number;
}

/** A physical count wins. Value follows quantity at the pool's own rate. */
export function countTo(pool: StockPool, counted: number): CountResult {
  const delta = counted - pool.qty;
  if (delta === 0) return { pool, delta: 0, writeOff: 0 };
  if (delta > 0) {
    return { pool: receive(pool, delta, valueAt(delta, avgRate(pool))), delta, writeOff: 0 };
  }
  const out = issue(pool, -delta);
  return { pool: out.pool, delta, writeOff: out.cost };
}

/* ---------------------------------------------------------------- ledger */

export type MovementKind = 'receive' | 'issue' | 'count';

export interface Movement {
  day: DayKey;
  /** Tie-break within a day: purchases land before the issues that need them. */
  seq: number;
  location: LocationKey;
  itemId: string;
  kind: MovementKind;
  qty: number;
  /** Required for `receive`; ignored otherwise. */
  valuePaise?: number;
  /** Carried through to the result so callers can attribute the cost back. */
  ref?: string;
  flockId?: string;
}

export interface MovementCost {
  ref: string | undefined;
  day: DayKey;
  itemId: string;
  location: LocationKey;
  flockId: string | undefined;
  qty: number;
  /** Positive = value left the pool. */
  cost: number;
  short: number;
}

export interface StockState {
  pools: Map<string, StockPool>;
  /** Cost of every outbound movement, in the order it happened. */
  costs: MovementCost[];
}

export const poolKey = (location: LocationKey, itemId: string): string => `${location}|${itemId}`;

export function getPool(state: StockState, location: LocationKey, itemId: string): StockPool {
  return state.pools.get(poolKey(location, itemId)) ?? emptyPool();
}

/**
 * Replay movements in order and return every pool plus the cost of each issue.
 *
 * Order is everything: the same movements applied in a different order give a
 * different average cost, so movements are sorted by day then `seq` before
 * they are applied — never by insertion order, which on a multi-device farm is
 * whatever order the phones happened to sync in.
 */
export function runStock(movements: readonly Movement[]): StockState {
  const ordered = [...movements].sort((a, b) => (a.day === b.day ? a.seq - b.seq : a.day < b.day ? -1 : 1));
  const state: StockState = { pools: new Map(), costs: [] };

  for (const m of ordered) {
    const key = poolKey(m.location, m.itemId);
    const pool = state.pools.get(key) ?? emptyPool();

    if (m.kind === 'receive') {
      state.pools.set(key, receive(pool, m.qty, m.valuePaise ?? 0));
      continue;
    }
    if (m.kind === 'issue') {
      const result = issue(pool, m.qty);
      state.pools.set(key, result.pool);
      state.costs.push({
        ref: m.ref, day: m.day, itemId: m.itemId, location: m.location,
        flockId: m.flockId, qty: m.qty, cost: result.cost, short: result.short,
      });
      continue;
    }
    const counted = countTo(pool, m.qty);
    state.pools.set(key, counted.pool);
    if (counted.delta < 0) {
      state.costs.push({
        ref: m.ref, day: m.day, itemId: m.itemId, location: m.location,
        flockId: m.flockId, qty: -counted.delta, cost: counted.writeOff, short: 0,
      });
    }
  }
  return state;
}

/** Total base quantity of a set of items at a location — 'all feed at farm A'. */
export function totalQty(state: StockState, location: LocationKey, itemIds: readonly string[]): number {
  return itemIds.reduce((sum, id) => sum + getPool(state, location, id).qty, 0);
}

export function totalValue(state: StockState, location: LocationKey, itemIds: readonly string[]): number {
  return itemIds.reduce((sum, id) => sum + getPool(state, location, id).value, 0);
}
