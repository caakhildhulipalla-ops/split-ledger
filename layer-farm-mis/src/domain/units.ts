/**
 * Units.
 *
 * "Users enter in the unit they think in (bags, quintals, trays, pieces). The
 * system stores base units." A supervisor says "eleven bags"; the ledger holds
 * 550,000 grams. Nobody on a farm should have to do that multiplication, and
 * nobody should be able to get it wrong.
 *
 * Base units are integers, always:
 *   mass   → grams
 *   count  → pieces (eggs, birds, vials, trays-worth-of-eggs)
 *   volume → millilitres
 *
 * Bag, quintal and tray sizes are farm-editable — 50 kg is the common bag but
 * not a law — so conversions are looked up through a table the farm owns
 * rather than hard-coded at the call site.
 */

import { mulDiv } from './money';

export type Dimension = 'mass' | 'count' | 'volume';

export interface UnitDef {
  code: string;
  label: string;
  plural: string;
  dimension: Dimension;
  /** How many base units one of this unit is worth. */
  factor: number;
  /** Farm-editable (a bag is whatever this farm's bags weigh). */
  editable: boolean;
  /** Decimal places to accept and show when entering in this unit. */
  decimals: number;
}

export const BASE_UNIT: Record<Dimension, string> = {
  mass: 'kg',
  count: 'piece',
  volume: 'l',
};

/** The defaults from the requirements: bag = 50 kg, quintal = 100 kg, tray = 30 eggs. */
export const DEFAULT_UNITS: UnitDef[] = [
  { code: 'g',       label: 'gram',    plural: 'g',        dimension: 'mass',   factor: 1,          editable: false, decimals: 0 },
  { code: 'kg',      label: 'kg',      plural: 'kg',       dimension: 'mass',   factor: 1_000,      editable: false, decimals: 3 },
  { code: 'bag',     label: 'bag',     plural: 'bags',     dimension: 'mass',   factor: 50_000,     editable: true,  decimals: 2 },
  { code: 'quintal', label: 'quintal', plural: 'quintals', dimension: 'mass',   factor: 100_000,    editable: true,  decimals: 2 },
  { code: 'tonne',   label: 'tonne',   plural: 'tonnes',   dimension: 'mass',   factor: 1_000_000,  editable: false, decimals: 3 },
  { code: 'piece',   label: 'piece',   plural: 'pieces',   dimension: 'count',  factor: 1,          editable: false, decimals: 0 },
  { code: 'dozen',   label: 'dozen',   plural: 'dozen',    dimension: 'count',  factor: 12,         editable: false, decimals: 0 },
  { code: 'tray',    label: 'tray',    plural: 'trays',    dimension: 'count',  factor: 30,         editable: true,  decimals: 0 },
  { code: 'hundred', label: '100s',    plural: '100s',     dimension: 'count',  factor: 100,        editable: false, decimals: 0 },
  { code: 'box',     label: 'box',     plural: 'boxes',    dimension: 'count',  factor: 360,        editable: true,  decimals: 0 },
  { code: 'ml',      label: 'ml',      plural: 'ml',       dimension: 'volume', factor: 1,          editable: false, decimals: 0 },
  { code: 'l',       label: 'litre',   plural: 'litres',   dimension: 'volume', factor: 1_000,      editable: false, decimals: 2 },
];

export type UnitTable = ReadonlyMap<string, UnitDef>;

export function unitTable(units: readonly UnitDef[] = DEFAULT_UNITS): UnitTable {
  return new Map(units.map((u) => [u.code, u]));
}

export const DEFAULT_UNIT_TABLE = unitTable();

export function unitsFor(dimension: Dimension, table: UnitTable = DEFAULT_UNIT_TABLE): UnitDef[] {
  return [...table.values()].filter((u) => u.dimension === dimension);
}

/**
 * Convert a quantity typed in `unitCode` into base units.
 *
 * The input is a *string* on purpose. "12.345 kg" must become exactly 12,345 g,
 * and `12.345 * 1000` in binary floating point is 12344.999999999998.
 */
export function toBase(text: string, unitCode: string, table: UnitTable = DEFAULT_UNIT_TABLE): number | null {
  const unit = table.get(unitCode);
  if (!unit) return null;
  const scaled = parseScaled(text, 6);
  if (scaled === null) return null;
  // scaled is the value × 10^6; factor is exact; divide back down once.
  return mulDiv(scaled, unit.factor, 1_000_000);
}

/** Base units back into `unitCode`, as a number for display maths. */
export function fromBase(base: number, unitCode: string, table: UnitTable = DEFAULT_UNIT_TABLE): number {
  const unit = table.get(unitCode);
  if (!unit || unit.factor === 0) return 0;
  return base / unit.factor;
}

/** Base units rendered in `unitCode` — '11 bags', '550 kg', '18,300 eggs'. */
export function formatQty(
  base: number,
  unitCode: string,
  table: UnitTable = DEFAULT_UNIT_TABLE,
  opts: { label?: boolean } = {},
): string {
  const unit = table.get(unitCode);
  if (!unit) return String(base);
  const value = fromBase(base, unitCode, table);
  const shown = value.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit.decimals,
  });
  if (opts.label === false) return shown;
  const word = Math.abs(value) === 1 ? unit.label : unit.plural;
  return `${shown} ${word}`;
}

/** Kilograms, the unit every feed number in the requirements is quoted in. */
export const kg = (grams: number): number => grams / 1000;
export const gramsFromKg = (kilos: number): number => Math.round(kilos * 1000);

/**
 * Parse a decimal string into an integer scaled by 10^`decimals`, without
 * floating point. Returns null for anything that is not a plain number.
 */
export function parseScaled(text: string, decimals: number): number | null {
  const cleaned = text.replace(/[,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const body = negative ? cleaned.slice(1) : cleaned;
  const [whole = '', frac = ''] = body.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const value = Number(whole || '0') * 10 ** decimals + Number(padded || '0');
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** A quantity as stored: an integer in base units, plus the unit it was typed in. */
export interface Quantity {
  base: number;
  enteredUnit: string;
}

export const quantity = (base: number, enteredUnit: string): Quantity => ({ base, enteredUnit });
