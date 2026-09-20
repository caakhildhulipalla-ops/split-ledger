/**
 * Feed mixing (open decision 10).
 *
 * In-house mixing is the normal case on these farms, and it is where feed cost
 * per kg is actually decided. A batch consumes raw materials at their
 * weighted-average cost and produces finished feed carrying the whole of that
 * cost:
 *
 *   feed cost per kg = Σ(raw material kg × average cost per kg) ÷ finished kg
 *
 * Nothing is lost and nothing is invented: the value that leaves the raw
 * material pools is exactly the value that enters the finished feed pool, so a
 * batch can never make the farm richer or poorer on paper.
 */

import { mulDiv, type Paise } from './money';
import { RATE_SCALE, farmLocation, type Movement } from './stock';
import type { DayKey } from './dates';

export interface BatchInput {
  itemId: string;
  /** Base units (grams). */
  qty: number;
}

export interface BatchSpec {
  id: string;
  day: DayKey;
  /** Ordering within the day, so a batch lands after the purchases it uses. */
  seq: number;
  farmId: string;
  inputs: readonly BatchInput[];
  /** The finished feed item produced. */
  outputItemId: string;
  /** Finished feed made, in base units. Weighed, not assumed. */
  outputQty: number;
}

/**
 * Movements for one batch: one issue per raw material, then one receipt of
 * finished feed whose value is the total issued.
 *
 * The receipt's value is not known until the issues have been priced against
 * live pools, so the caller runs the issues first and feeds the total back in
 * — see `batchMovements`, which does both halves in the right order.
 */
export function batchIssueMovements(batch: BatchSpec): Movement[] {
  const location = farmLocation(batch.farmId);
  return batch.inputs
    .filter((i) => i.qty > 0)
    .map((input, index) => ({
      day: batch.day,
      seq: batch.seq * 100 + index,
      location,
      itemId: input.itemId,
      kind: 'issue' as const,
      qty: input.qty,
      ref: `batch:${batch.id}`,
    }));
}

export function batchReceiptMovement(batch: BatchSpec, valuePaise: Paise): Movement {
  return {
    day: batch.day,
    seq: batch.seq * 100 + 99,
    location: farmLocation(batch.farmId),
    itemId: batch.outputItemId,
    kind: 'receive',
    qty: batch.outputQty,
    valuePaise,
    ref: `batch:${batch.id}`,
  };
}

/** Cost per kg of the finished feed a batch produced. */
export function batchCostPerKg(totalInputValue: Paise, outputQty: number): Paise | null {
  if (outputQty <= 0) return null;
  return mulDiv(totalInputValue, RATE_SCALE, outputQty);
}

/**
 * Mixing loss — what went in against what came out.
 *
 * A batch that produces 4% less than it consumed is normal moisture loss; one
 * producing 40% less means somebody mistyped a bag count, and the screen says
 * so before the number reaches the P&L.
 */
export function mixingLossPercent(batch: BatchSpec): number | null {
  const input = batch.inputs.reduce((s, i) => s + i.qty, 0);
  if (input <= 0) return null;
  return ((input - batch.outputQty) / input) * 100;
}

export const batchInputQty = (batch: BatchSpec): number =>
  batch.inputs.reduce((s, i) => s + i.qty, 0);
