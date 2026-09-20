/**
 * Money.
 *
 * Every rupee in this app is an integer number of paise. Floating point is not
 * allowed anywhere near a farm's books: 0.1 + 0.2 must not decide whether a
 * flock made money. Rates per 100 eggs are paise too, so a rate of ₹5.42 per
 * egg is 542 paise per 100 eggs with nothing lost.
 *
 * The important function here is `distribute`. Farm costing constantly divides
 * one amount across many things — an electricity bill across 21 days, then
 * across four sheds by live-bird share, a pullet cost across 560 laying days.
 * Naive division leaks paise, and leaked paise mean a flock P&L that does not
 * tie back to the expenses the owner entered. `distribute` is exact by
 * construction: the parts always sum to the whole.
 */

export type Paise = number;

/** Largest denominator we ever divide by, kept well inside BigInt comfort. */
const ROUND_HALF_UP = (num: bigint, den: bigint): bigint => {
  // Round half away from zero, on exact integer maths.
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (2n * n + d) / (2n * d);
  return neg ? -q : q;
};

/** Multiply then divide without ever leaving exact integer arithmetic. */
export function mulDiv(value: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(
    ROUND_HALF_UP(BigInt(Math.round(value)) * BigInt(Math.round(numerator)), BigInt(Math.round(denominator))),
  );
}

/**
 * Split `total` into parts proportional to `weights`, exactly.
 *
 * `sum(distribute(total, w)) === total` for every input, including negative
 * totals, zero weights and all-zero weights (which fall back to an equal
 * split). Fractions left over after the proportional floor are handed out one
 * paisa at a time to the largest remainders, earliest index winning ties —
 * the standard largest-remainder method, which keeps the result stable when
 * the same allocation is recomputed.
 */
export function distribute(total: Paise, weights: readonly number[]): Paise[] {
  const n = weights.length;
  if (n === 0) return [];

  const sign = total < 0 ? -1 : 1;
  const amount = BigInt(Math.abs(Math.round(total)));

  // Negative weights are meaningless here (you cannot own -3 birds) and would
  // break the remainder ordering, so they are clamped away.
  const w = weights.map((x) => BigInt(Math.max(0, Math.round(x))));
  let totalW = w.reduce((a, b) => a + b, 0n);

  let effective = w;
  if (totalW === 0n) {
    effective = new Array<bigint>(n).fill(1n);
    totalW = BigInt(n);
  }

  const base: bigint[] = new Array(n);
  const remainder: bigint[] = new Array(n);
  let given = 0n;
  for (let i = 0; i < n; i++) {
    const product = amount * effective[i]!;
    const q = product / totalW;
    base[i] = q;
    remainder[i] = product - q * totalW;
    given += q;
  }

  let left = amount - given;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const ra = remainder[a]!;
    const rb = remainder[b]!;
    if (ra === rb) return a - b;
    return rb > ra ? 1 : -1;
  });
  for (let k = 0; left > 0n; k++, left--) {
    base[order[k % n]!]! += 1n;
  }

  return base.map((v) => sign * Number(v));
}

/** Spread `total` evenly across `count` parts, exactly. */
export const divideEvenly = (total: Paise, count: number): Paise[] =>
  distribute(total, new Array<number>(Math.max(0, count)).fill(1));

/** Parse a rupee amount typed by a human ("1,240.50", "₹1240.5") into paise. */
export function parseRupees(text: string): Paise | null {
  const cleaned = text.replace(/[₹,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const body = negative ? cleaned.slice(1) : cleaned;
  const [whole = '', frac = ''] = body.split('.');
  const paise = (whole === '' ? 0 : Number(whole)) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isFinite(paise)) return null;
  return negative ? -paise : paise;
}

/** '₹1,24,050.50' — Indian digit grouping, which is what the owner reads. */
export function formatRupees(paise: Paise, opts: { paise?: boolean; sign?: boolean } = {}): string {
  const showPaise = opts.paise ?? true;
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = showPaise ? Math.floor(abs / 100) : Math.round(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  const grouped = groupIndian(rupees);
  const prefix = negative ? '−₹' : opts.sign ? '+₹' : '₹';
  return showPaise ? `${prefix}${grouped}.${fraction}` : `${prefix}${grouped}`;
}

/** '₹1.24L' / '₹3.4Cr' — for dashboard tiles where the exact paisa is noise. */
export function formatRupeesShort(paise: Paise): string {
  const negative = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const sign = negative ? '−₹' : '₹';
  if (rupees >= 1_00_00_000) return `${sign}${trim(rupees / 1_00_00_000)}Cr`;
  if (rupees >= 1_00_000) return `${sign}${trim(rupees / 1_00_000)}L`;
  if (rupees >= 1_000) return `${sign}${trim(rupees / 1_000)}k`;
  return `${sign}${Math.round(rupees)}`;
}

const trim = (n: number): string =>
  (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '');

function groupIndian(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const head = s.slice(0, -3);
  const tail = s.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
}
