import { describe, expect, it } from 'vitest';
import { buildLedger, eggStock, feedInventory, flockReport, rateFor, series, summariseFarm, valuedVsInvoiced, dataset } from './report';
import type { EntityMap, EntityType, Row } from './types';
import { totalEggs } from '@/domain/production';

/** Build a stored row without the ceremony the app adds at write time. */
let counter = 0;
function row<K extends EntityType>(type: K, payload: EntityMap[K], id?: string): Row<K> {
  counter++;
  return {
    ...payload,
    id: id ?? `${type}-${counter}`,
    type,
    tenantId: 't1',
    createdAt: '2026-03-01T06:00:00.000Z',
    updatedAt: '2026-03-01T06:00:00.000Z',
    createdBy: 'u1', updatedBy: 'u1', updatedByRole: 'owner',
    rev: 1, deletedAt: null, sync: 'synced',
  } as unknown as Row<K>;
}

/**
 * One farm, one shed, one laying flock, three days.
 *
 * Small enough that every figure below can be checked by hand, which is the
 * point: these assertions are the arithmetic a farmer would do on paper.
 */
function farmFixture() {
  const rows: Row[] = [];

  rows.push(row('farm', {
    name: 'Kadapa', location: 'Kadapa', neccZone: 'Hyderabad', contact: '',
    farmGateAdjust: -15_00, smallEggGap: 60_00, layingLifeDays: 560,
  }, 'F1'));

  rows.push(row('shed', {
    farmId: 'F1', name: 'Shed 1', housing: 'a-frame-cage', capacity: 12_000,
    sessionsPerDay: 1, supervisorIds: [],
  }, 'S1'));

  rows.push(row('flock', {
    farmId: 'F1', shedId: 'S1', name: 'Batch A', source: 'bought-pullet', supplierId: null,
    breed: 'BV300', placedOn: '2025-11-01', birdsPlaced: 10_000,
    placementCost: 280_00 * 10_000, phase: 'laying', layFrom: '2026-03-01',
    layingLifeDays: 560, expectedSpentHenValue: 60_00 * 10_000, opening: null, closedOn: null,
  }, 'L1'));

  rows.push(row('item', { name: 'Layer feed', category: 'feed', dimension: 'mass', entryUnit: 'bag', active: true }, 'I-FEED'));
  rows.push(row('item', { name: 'Maize', category: 'raw-material', dimension: 'mass', entryUnit: 'quintal', active: true }, 'I-MAIZE'));

  // NECC zone rate ₹5.45 per egg from 1 March.
  rows.push(row('rate', { zone: 'Hyderabad', day: '2026-03-01', ratePer100: 545_00, farmId: null }));

  // 20 tonnes of layer feed at ₹28/kg.
  rows.push(row('feed-purchase', {
    farmId: 'F1', day: '2026-03-01', supplierId: null, itemId: 'I-FEED',
    qty: 20_000_000, enteredUnit: 'kg', amount: 28_00 * 20_000,
    vehicleId: null, invoiceNo: '', notes: '',
  }));

  // 4 tonnes moved to the shed.
  rows.push(row('feed-issue', {
    farmId: 'F1', shedId: 'S1', day: '2026-03-01', itemId: 'I-FEED',
    qty: 4_000_000, enteredUnit: 'kg',
  }));

  // Two days of collection: 1,100 kg eaten, 8,500 eggs laid.
  for (const day of ['2026-03-02', '2026-03-03']) {
    rows.push(row('daily-entry', {
      farmId: 'F1', shedId: 'S1', flockId: 'L1', day, session: 'day',
      eggs: { gradeA: 7_000, gradeB: 1_400, broken: 100 },
      died: 12, culled: 3, feedGrams: 1_100_000, feedItemId: 'I-FEED', remarks: '',
    }));
  }

  // ₹31,000 of electricity covering all of March: ₹1,000 a day.
  rows.push(row('head', { kind: 'expense', name: 'Electricity', builtIn: true, active: true }, 'H-ELEC'));
  rows.push(row('expense', {
    farmId: 'F1', day: '2026-03-01', headId: 'H-ELEC', amount: 31_000_00,
    from: '2026-03-01', to: '2026-03-31', shedId: null, flockId: null, partyId: null, notes: '',
  }));

  return rows;
}

describe('buildLedger', () => {
  const rows = farmFixture();
  const ledger = buildLedger(rows, '2026-03-01', '2026-03-05');

  it('carries feed cost from the invoice through the shed to the flock', () => {
    const day = ledger.days.get('2026-03-02')!.get('L1')!;
    // 1,100 kg at ₹28 = ₹30,800.
    expect(day.cost.feed).toBe(28_00 * 1_100);
  });

  it('charges the flock its share of an expense, one day at a time', () => {
    const day = ledger.days.get('2026-03-02')!.get('L1')!;
    // ₹31,000 over 31 days, one flock on the farm.
    expect(day.cost.overhead).toBe(1_000_00);
  });

  it('releases the pullet cost across the laying life', () => {
    const day = ledger.days.get('2026-03-02')!.get('L1')!;
    // (₹280 − ₹60) × 10,000 over 560 days = ₹3,928.57 a day.
    const perDay = (280_00 - 60_00) * 10_000 / 560;
    expect(day.cost.pullet).toBeGreaterThan(perDay - 100);
    expect(day.cost.pullet).toBeLessThan(perDay + 100);
  });

  it('values the day’s lay at the farm-gate rate, and pays nothing for breakages', () => {
    const day = ledger.days.get('2026-03-02')!.get('L1')!;
    // 7,000 at ₹5.30 + 1,400 at ₹4.70; the 100 broken earn nothing.
    expect(day.revenue.eggs).toBe(37_100_00 + 6_580_00);
  });

  it('nets a profit the farmer could check on paper', () => {
    const day = ledger.days.get('2026-03-02')!.get('L1')!;
    const expected = day.revenue.total - (day.cost.feed + day.cost.medicine + day.cost.overhead + day.cost.pullet);
    expect(day.profit).toBe(expected);
    expect(day.costTotal).toBe(day.cost.feed + day.cost.overhead + day.cost.pullet);
  });

  it('counts birds alive at the start of the day, before that day’s deaths', () => {
    expect(ledger.days.get('2026-03-02')!.get('L1')!.liveAtStart).toBe(10_000);
    // 12 died and 3 were culled on the 2nd.
    expect(ledger.days.get('2026-03-03')!.get('L1')!.liveAtStart).toBe(9_985);
    expect(ledger.days.get('2026-03-04')!.get('L1')!.liveAtStart).toBe(9_970);
  });

  it('computes hen-day against the start-of-day count, broken eggs included', () => {
    const day = ledger.days.get('2026-03-02')!.get('L1')!;
    expect(day.henDay).toBeCloseTo(85, 10);
    expect(day.mortality).toBeCloseTo(0.12, 10);
    expect(day.feedPerBird).toBeCloseTo(110, 10);
  });
});

describe('summariseFarm', () => {
  const ledger = buildLedger(farmFixture(), '2026-03-01', '2026-03-05');

  it('adds the flocks up into a farm day', () => {
    const summary = summariseFarm(ledger, '2026-03-02', 'F1');
    expect(totalEggs(summary.eggs)).toBe(8_500);
    expect(summary.liveBirds).toBe(10_000);
    expect(summary.feedGrams).toBe(1_100_000);
    expect(summary.profit).toBe(summary.revenue - summary.cost);
  });

  it('derives ratios from the totals rather than averaging the parts', () => {
    const summary = summariseFarm(ledger, '2026-03-02', 'F1');
    expect(summary.henDay).toBeCloseTo(85, 10);
    expect(summary.costPerEgg).toBeCloseTo(summary.cost / 8_500, 8);
  });

  it('gives an empty day zeros and nulls, not NaN', () => {
    const summary = summariseFarm(ledger, '2026-03-05', 'F1');
    expect(summary.eggs).toEqual({ gradeA: 0, gradeB: 0, broken: 0 });
    expect(summary.henDay).toBe(0); // birds alive, none laid — a real zero
    const empty = summariseFarm(ledger, '2026-03-05', 'no-such-farm');
    expect(empty.henDay).toBeNull();
    expect(empty.costPerEgg).toBeNull();
  });
});

describe('feedInventory', () => {
  const ledger = buildLedger(farmFixture(), '2026-03-01', '2026-03-03');

  it('separates what is at the farm from what is already in the sheds', () => {
    const inv = feedInventory(ledger, 'F1', '2026-03-03', 3);
    // 20 t bought, 4 t issued to the shed, 2.2 t eaten out of that 4 t.
    expect(inv.feedGrams).toBe(16_000_000);
    expect(inv.shedGrams).toBe(4_000_000 - 2_200_000);
    expect(inv.costPerKg).toBe(28_00);
  });

  it('turns stock into days of cover at the current rate of eating', () => {
    const inv = feedInventory(ledger, 'F1', '2026-03-03', 3);
    // 1,100 kg used on two of the three look-back days.
    expect(inv.avgDailyGrams).toBeCloseTo(2_200_000 / 3, 6);
    expect(inv.coverDays).toBeCloseTo((16_000_000 + 1_800_000) / (2_200_000 / 3), 6);
  });

  it('reports no cover figure for a farm that has never used feed', () => {
    const quiet = buildLedger(farmFixture(), '2026-02-01', '2026-02-05');
    expect(feedInventory(quiet, 'F1', '2026-02-05', 7).coverDays).toBeNull();
  });
});

describe('eggStock', () => {
  it('counts sellable eggs in, dispatches out, and never the broken ones', () => {
    const rows = farmFixture();
    rows.push(row('dispatch', {
      farmId: 'F1', day: '2026-03-03', customerId: null, vehicleId: null, driverId: null,
      lines: [
        { grade: 'A', qtySent: 10_000, qtyReceived: 9_980, ratePer100: 530_00 },
        { grade: 'B', qtySent: 2_000, qtyReceived: 2_000, ratePer100: 470_00 },
      ],
      transitBreakage: 20, notes: '',
    }));
    const ledger = buildLedger(rows, '2026-03-01', '2026-03-03');
    const stock = eggStock(ledger, 'F1', '2026-03-03');
    // 2 × 7,000 A collected − 10,000 sent; 2 × 1,400 B − 2,000.
    expect(stock.gradeA).toBe(4_000);
    expect(stock.gradeB).toBe(800);
    expect(stock.total).toBe(4_800);
  });
});

describe('rateFor', () => {
  const ledger = buildLedger(farmFixture(), '2026-03-01', '2026-03-03');
  const farm = ledger.data.farms[0]!;

  it('applies the farm-gate adjustment to the zone rate', () => {
    expect(rateFor(ledger.data, farm, '2026-03-02')).toEqual({
      zoneRatePer100: 545_00, farmGateAdjust: -15_00, smallEggGap: 60_00,
    });
  });

  it('holds the last published rate forward rather than dropping to zero', () => {
    expect(rateFor(ledger.data, farm, '2026-03-20').zoneRatePer100).toBe(545_00);
  });

  it('has no rate before the first one was published', () => {
    expect(rateFor(ledger.data, farm, '2026-02-01').zoneRatePer100).toBe(0);
  });

  it('prefers an owner’s farm override to the zone rate on the same day', () => {
    const rows = farmFixture();
    rows.push(row('rate', { zone: 'Hyderabad', day: '2026-03-01', ratePer100: 560_00, farmId: 'F1' }));
    const withOverride = buildLedger(rows, '2026-03-01', '2026-03-03');
    expect(rateFor(withOverride.data, withOverride.data.farms[0]!, '2026-03-02').zoneRatePer100).toBe(560_00);
  });
});

describe('flockReport', () => {
  const ledger = buildLedger(farmFixture(), '2026-03-01', '2026-03-03');

  it('adds a flock’s days into its life to date', () => {
    const report = flockReport(ledger, 'L1', '2026-03-01', '2026-03-03')!;
    expect(report.days).toHaveLength(3);
    expect(totalEggs(report.totals.eggs)).toBe(17_000);
    expect(report.liveBirds).toBe(9_970);
    // Peak is the second day: the same 8,500 eggs from 15 fewer birds.
    expect(report.peakHenDay).toBeCloseTo(8_500 / 9_985 * 100, 8);
    expect(report.cumulativeMortality).toBeCloseTo(0.3, 8);
  });

  it('returns nothing for a flock that does not exist', () => {
    expect(flockReport(ledger, 'nope', '2026-03-01', '2026-03-03')).toBeNull();
  });
});

describe('valuedVsInvoiced', () => {
  it('compares production valued at rate against what the lorry actually took', () => {
    const rows = farmFixture();
    rows.push(row('dispatch', {
      farmId: 'F1', day: '2026-03-03', customerId: null, vehicleId: null, driverId: null,
      lines: [{ grade: 'A', qtySent: 10_000, qtyReceived: 10_000, ratePer100: 530_00 }],
      transitBreakage: 0, notes: '',
    }));
    const ledger = buildLedger(rows, '2026-03-01', '2026-03-03');
    const { valued, invoiced } = valuedVsInvoiced(ledger, 'F1', '2026-03-01', '2026-03-03');
    expect(valued).toBe(2 * (37_100_00 + 6_580_00));
    expect(invoiced).toBe(53_000_00);
  });
});

describe('series', () => {
  it('gives one summary per day for a trend', () => {
    const ledger = buildLedger(farmFixture(), '2026-03-01', '2026-03-03');
    const trend = series(ledger, ['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(trend.map((d) => totalEggs(d.eggs))).toEqual([0, 8_500, 8_500]);
  });
});

describe('dataset', () => {
  it('sorts rows into their kinds', () => {
    const data = dataset(farmFixture());
    expect(data.farms).toHaveLength(1);
    expect(data.entries).toHaveLength(2);
    expect(data.expenses).toHaveLength(1);
  });
});
