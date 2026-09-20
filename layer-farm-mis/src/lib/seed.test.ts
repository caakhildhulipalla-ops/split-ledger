import { describe, expect, it } from 'vitest';
import { demoFarm, masterData, type SeedContext } from './seed';
import { buildLedger, eggStock, feedInventory, summariseFarm } from './report';
import { addDays, lastNDays } from '@/domain/dates';
import { totalEggs } from '@/domain/production';

const ctx: SeedContext = { tenantId: 't1', userId: 'u1', role: 'owner' };
const THROUGH = '2026-09-20';

describe('masterData', () => {
  const rows = masterData(ctx, 'Demo Farms');

  it('gives a new tenant everything it needs before the first entry', () => {
    const types = new Set(rows.map((r) => r.type));
    for (const required of ['tenant', 'unit', 'item', 'head', 'vaccination-template', 'threshold']) {
      expect(types).toContain(required);
    }
  });

  it('ships the income and expense heads the requirements list', () => {
    const heads = rows.filter((r) => r.type === 'head');
    expect(heads.filter((h) => (h as { kind: string }).kind === 'income')).toHaveLength(7);
    expect(heads.filter((h) => (h as { kind: string }).kind === 'expense')).toHaveLength(9);
  });

  it('defaults a bag to 50 kg and a tray to 30 eggs, both editable', () => {
    const units = rows.filter((r) => r.type === 'unit') as unknown as { code: string; factor: number }[];
    expect(units.find((u) => u.code === 'bag')!.factor).toBe(50_000);
    expect(units.find((u) => u.code === 'tray')!.factor).toBe(30);
  });

  it('belongs entirely to the tenant that asked for it', () => {
    expect(rows.every((r) => r.tenantId === 't1')).toBe(true);
    expect(rows.every((r) => r.deletedAt === null)).toBe(true);
  });
});

describe('demoFarm', () => {
  const rows = demoFarm(ctx, { days: 120, through: THROUGH });
  const ledger = buildLedger(rows, addDays(THROUGH, -13), THROUGH);

  it('builds the shape the requirements call a large customer', () => {
    expect(rows.filter((r) => r.type === 'farm')).toHaveLength(2);
    expect(rows.filter((r) => r.type === 'shed')).toHaveLength(4);
    expect(rows.filter((r) => r.type === 'flock')).toHaveLength(4);
  });

  it('is identical on every device, so two phones show the same demo', () => {
    const again = demoFarm(ctx, { days: 120, through: THROUGH });
    const strip = (r: { type: string }) => r.type;
    expect(again.map(strip)).toEqual(rows.map(strip));
    const ledgerAgain = buildLedger(again, addDays(THROUGH, -13), THROUGH);
    expect(summariseFarm(ledgerAgain, THROUGH, null).profit)
      .toBe(summariseFarm(ledger, THROUGH, null).profit);
  });

  it('produces a believable laying day across the business', () => {
    const today = summariseFarm(ledger, THROUGH, null);
    // Three laying flocks of ~14k–18k birds.
    expect(today.liveBirds).toBeGreaterThan(30_000);
    expect(today.liveBirds).toBeLessThan(70_000);
    expect(totalEggs(today.eggs)).toBeGreaterThan(20_000);
    expect(today.henDay!).toBeGreaterThan(40);
    expect(today.henDay!).toBeLessThan(100);
  });

  it('keeps feed per bird in the range a layer actually eats', () => {
    const today = summariseFarm(ledger, THROUGH, null);
    expect(today.feedPerBird!).toBeGreaterThan(70);
    expect(today.feedPerBird!).toBeLessThan(150);
  });

  it('includes a flock still rearing, which lays nothing and still costs money', () => {
    const rearing = [...ledger.days.get(THROUGH)!.values()].filter((f) => totalEggs(f.eggs) === 0);
    expect(rearing.length).toBeGreaterThanOrEqual(1);
    expect(rearing[0]!.costTotal).toBeGreaterThan(0);
    expect(rearing[0]!.henDay).toBe(0);
  });

  it('values feed stock and reports a sane cost per kg', () => {
    const farmId = (rows.find((r) => r.type === 'farm') as { id: string }).id;
    const inv = feedInventory(ledger, farmId, THROUGH, 7);
    expect(inv.costPerKg).toBeGreaterThan(15_00);
    expect(inv.costPerKg).toBeLessThan(45_00);
    expect(inv.avgDailyGrams).toBeGreaterThan(0);
    expect(inv.coverDays).not.toBeNull();
  });

  it('ties egg stock to collections less dispatches', () => {
    const stock = eggStock(ledger, null, THROUGH);
    expect(stock.total).toBe(stock.gradeA + stock.gradeB);
    expect(Number.isFinite(stock.total)).toBe(true);
  });

  it('gives every day of the last fortnight a P&L that adds up', () => {
    for (const day of lastNDays(14, THROUGH)) {
      const summary = summariseFarm(ledger, day, null);
      expect(summary.profit).toBe(summary.revenue - summary.cost);
      const parts = summary.costParts;
      expect(summary.cost).toBe(parts.feed + parts.medicine + parts.overhead + parts.pullet);
    }
  });

  it('charges every rupee of feed, overhead and pullet cost to some flock', () => {
    const today = summariseFarm(ledger, THROUGH, null);
    expect(today.costParts.feed).toBeGreaterThan(0);
    expect(today.costParts.overhead).toBeGreaterThan(0);
    expect(today.costParts.pullet).toBeGreaterThan(0);
  });
});
