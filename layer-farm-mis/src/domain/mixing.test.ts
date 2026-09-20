import { describe, expect, it } from 'vitest';
import { batchCostPerKg, batchInputQty, batchIssueMovements, batchReceiptMovement, mixingLossPercent, type BatchSpec } from './mixing';
import { avgCostPerKg, farmLocation, getPool, runStock, type Movement } from './stock';

const batch: BatchSpec = {
  id: 'B1', day: '2026-03-02', seq: 1, farmId: 'F1',
  inputs: [
    { itemId: 'maize', qty: 6_000_000 },   // 6 t
    { itemId: 'soya',  qty: 2_000_000 },   // 2 t
    { itemId: 'dorb',  qty: 1_500_000 },   // 1.5 t
    { itemId: 'lime',  qty: 500_000 },     // 0.5 t
  ],
  outputItemId: 'layer-feed',
  outputQty: 10_000_000,                    // 10 t
};

describe('a mixing batch', () => {
  it('moves the whole value of the raw materials into the finished feed', () => {
    const purchases: Movement[] = [
      { day: '2026-03-01', seq: 1, location: farmLocation('F1'), itemId: 'maize', kind: 'receive', qty: 6_000_000, valuePaise: 24_00 * 6_000 },
      { day: '2026-03-01', seq: 2, location: farmLocation('F1'), itemId: 'soya',  kind: 'receive', qty: 2_000_000, valuePaise: 48_00 * 2_000 },
      { day: '2026-03-01', seq: 3, location: farmLocation('F1'), itemId: 'dorb',  kind: 'receive', qty: 1_500_000, valuePaise: 18_00 * 1_500 },
      { day: '2026-03-01', seq: 4, location: farmLocation('F1'), itemId: 'lime',  kind: 'receive', qty: 500_000,   valuePaise: 4_00 * 500 },
    ];
    const totalPurchase = purchases.reduce((s, p) => s + (p.valuePaise ?? 0), 0);

    // Price the issues against live pools, then book the receipt at that value.
    const afterIssues = runStock([...purchases, ...batchIssueMovements(batch)]);
    const consumed = afterIssues.costs.reduce((s, c) => s + c.cost, 0);
    expect(consumed).toBe(totalPurchase); // every raw material fully used

    const state = runStock([...purchases, ...batchIssueMovements(batch), batchReceiptMovement(batch, consumed)]);
    const feed = getPool(state, farmLocation('F1'), 'layer-feed');
    expect(feed.qty).toBe(10_000_000);
    expect(feed.value).toBe(totalPurchase);
    // ₹1.44L maize + ₹96k soya + ₹27k DORB + ₹2k lime = ₹2,69,000 over 10 t.
    expect(avgCostPerKg(feed)).toBe(26_90);
    expect(batchCostPerKg(consumed, batch.outputQty)).toBe(26_90);
  });

  it('leaves the raw material pools empty', () => {
    const state = runStock([
      { day: '2026-03-01', seq: 1, location: farmLocation('F1'), itemId: 'maize', kind: 'receive', qty: 6_000_000, valuePaise: 1_44_00_000 },
      ...batchIssueMovements(batch).filter((m) => m.itemId === 'maize'),
    ]);
    expect(getPool(state, farmLocation('F1'), 'maize').qty).toBe(0);
    expect(getPool(state, farmLocation('F1'), 'maize').value).toBe(0);
  });

  it('reports mixing loss so a mistyped bag count is visible', () => {
    expect(batchInputQty(batch)).toBe(10_000_000);
    expect(mixingLossPercent(batch)).toBe(0);
    expect(mixingLossPercent({ ...batch, outputQty: 9_600_000 })).toBeCloseTo(4, 10);
    expect(mixingLossPercent({ ...batch, inputs: [] })).toBeNull();
  });

  it('cannot price a batch that produced nothing', () => {
    expect(batchCostPerKg(1_000, 0)).toBeNull();
  });
});
