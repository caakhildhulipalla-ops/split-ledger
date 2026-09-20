'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, dayKey, daysBetween, lastNDays, today, type DayKey } from '@/domain/dates';
import {
  DEFAULT_THRESHOLDS, lowFeed, missedEntry, mortalitySpike, productionDrop,
  sortAlerts, vaccinationDue, visibleTo, type Alert, type AlertThresholds,
} from '@/domain/alerts';
import { DEFAULT_UNITS, unitTable, type UnitDef, type UnitTable } from '@/domain/units';
import { buildLedger, feedInventory, summariseFarm, type Ledger } from './report';
import { useData } from './store';
import { seesMoney, type Farm, type Flock, type Row, type Shed } from './types';

/**
 * The ledger for a window of days.
 *
 * Rebuilt whenever any record changes, which is the point: an owner who
 * corrects last week's feed invoice watches every dependent figure move.
 * The window bounds the output only — stock and pullet costs always replay
 * from the beginning of the farm's history.
 */
export function useLedger(from: DayKey, to: DayKey): Ledger {
  const { rows } = useData();
  const list = useMemo(() => [...rows.values()] as Row[], [rows]);
  return useMemo(() => buildLedger(list, from, to), [list, from, to]);
}

/** The usual window: a fortnight back, so trends have something to draw. */
export function useRecentLedger(days = 14, to: DayKey = today()): Ledger {
  return useLedger(addDays(to, -(days - 1)), to);
}

/* --------------------------------------------------------------- scope */

const SCOPE_KEY = 'lfm.farm';

/** Which farm the owner is looking at; null means all of them. */
export function useFarmScope(): [string | null, (id: string | null) => void] {
  const [farmId, setFarmId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SCOPE_KEY);
      if (saved) setFarmId(saved === 'all' ? null : saved);
    } catch {
      /* private mode; the default is fine */
    }
  }, []);

  const set = useCallback((id: string | null) => {
    setFarmId(id);
    try {
      window.localStorage.setItem(SCOPE_KEY, id ?? 'all');
    } catch {
      /* nothing to persist to */
    }
  }, []);

  return [farmId, set];
}

/* ---------------------------------------------------------- permissions */

export interface Permissions {
  role: 'owner' | 'manager' | 'supervisor';
  /** Prices, costs and P&L are hidden from supervisors (decision 2). */
  money: boolean;
  masters: boolean;
  purchases: boolean;
  /** Sheds this user may record against; empty means all of them. */
  shedIds: string[];
  allows: (shedId: string) => boolean;
}

export function usePermissions(): Permissions {
  const { session } = useData();
  const role = session?.role ?? 'supervisor';
  const shedIds = session?.shedIds ?? [];
  return useMemo(() => ({
    role,
    money: seesMoney(role),
    masters: role === 'owner',
    purchases: role !== 'supervisor',
    shedIds,
    allows: (shedId: string) => shedIds.length === 0 || shedIds.includes(shedId),
  }), [role, shedIds]);
}

/* --------------------------------------------------------------- units */

/** The farm's own unit table, falling back to the shipped defaults. */
export function useUnits(): UnitTable {
  const { list } = useData();
  const stored = list('unit');
  return useMemo(() => {
    if (stored.length === 0) return unitTable(DEFAULT_UNITS);
    const defs: UnitDef[] = stored.map((u) => ({
      code: u.code, label: u.label, plural: u.plural,
      dimension: u.dimension, factor: u.factor, decimals: u.decimals,
      editable: ['bag', 'quintal', 'tray', 'box'].includes(u.code),
    }));
    return unitTable(defs);
  }, [stored]);
}

/** Units offered for an item, its own entry unit first. */
export function unitOptions(table: UnitTable, dimension: 'mass' | 'count' | 'volume', preferred?: string) {
  const all = [...table.values()].filter((u) => u.dimension === dimension);
  const sorted = preferred ? [...all].sort((a, b) => (a.code === preferred ? -1 : b.code === preferred ? 1 : 0)) : all;
  return sorted.map((u) => ({ value: u.code, label: u.label }));
}

/* ------------------------------------------------------------- masters */

export interface Masters {
  farms: Farm[];
  sheds: Shed[];
  flocks: Flock[];
  shedsOf: (farmId: string | null) => Shed[];
  flockIn: (shedId: string) => Flock | null;
  farmOf: (farmId: string | null | undefined) => Farm | null;
  shedOf: (shedId: string | null | undefined) => Shed | null;
}

export function useMasters(): Masters {
  const { list, find } = useData();
  const farms = list('farm');
  const sheds = list('shed');
  const flocks = list('flock');

  return useMemo(() => ({
    farms: [...farms].sort((a, b) => a.name.localeCompare(b.name)),
    sheds: [...sheds].sort((a, b) => a.name.localeCompare(b.name)),
    flocks,
    shedsOf: (farmId) => sheds.filter((s) => !farmId || s.farmId === farmId).sort((a, b) => a.name.localeCompare(b.name)),
    // The flock currently in a shed: open, and placed most recently.
    flockIn: (shedId) => flocks
      .filter((f) => f.shedId === shedId && f.phase !== 'closed')
      .sort((a, b) => (a.placedOn < b.placedOn ? 1 : -1))[0] ?? null,
    farmOf: (farmId) => find('farm', farmId ?? null),
    shedOf: (shedId) => find('shed', shedId ?? null),
  }), [farms, sheds, flocks, find]);
}

/* -------------------------------------------------------------- alerts */

export function useThresholds(farmId: string | null): AlertThresholds {
  const { list } = useData();
  const rows = list('threshold');
  return useMemo(() => {
    const forFarm = rows.find((t) => t.farmId === farmId);
    const fallback = rows.find((t) => t.farmId === null);
    const source = forFarm ?? fallback;
    if (!source) return DEFAULT_THRESHOLDS;
    return {
      productionDropPoints: source.productionDropPoints,
      productionBaselineDays: source.productionBaselineDays,
      mortalitySpikePercent: source.mortalitySpikePercent,
      feedCoverDays: source.feedCoverDays,
      missedEntryByHour: source.missedEntryByHour,
      vaccinationLeadDays: source.vaccinationLeadDays,
    };
  }, [rows, farmId]);
}

/**
 * Everything the farm should be told about today.
 *
 * Computed from the same ledger the dashboard renders, so an alert can never
 * disagree with the screen it points at.
 */
export function useAlerts(ledger: Ledger, farmId: string | null): Alert[] {
  const thresholds = useThresholds(farmId);
  const { role } = usePermissions();
  const { sheds, flocks, farms } = useMasters();
  const now = new Date();
  const day = dayKey(now);

  return useMemo(() => {
    const alerts: Alert[] = [];
    const inScope = <T extends { farmId: string }>(x: T) => !farmId || x.farmId === farmId;
    const shedName = new Map(sheds.map((s) => [s.id, s.name]));

    for (const flock of flocks.filter(inScope)) {
      if (flock.phase === 'closed') continue;
      const name = shedName.get(flock.shedId) ?? 'Shed';
      const todayRow = ledger.days.get(day)?.get(flock.id);

      if (todayRow) {
        const baseline = lastNDays(thresholds.productionBaselineDays + 1, addDays(day, -1))
          .reverse()
          .map((d) => ledger.days.get(d)?.get(flock.id)?.henDay ?? null);

        const drop = productionDrop({
          day, shedId: flock.shedId, shedName: name, farmId: flock.farmId, flockId: flock.id,
          henDayToday: todayRow.henDay, baseline,
        }, thresholds);
        if (drop) alerts.push(drop);

        const spike = mortalitySpike({
          day, shedId: flock.shedId, shedName: name, farmId: flock.farmId, flockId: flock.id,
          died: todayRow.died, liveAtStart: todayRow.liveAtStart,
        }, thresholds);
        if (spike) alerts.push(spike);
      }
    }

    for (const shed of sheds.filter(inScope)) {
      const recorded = ledger.data.entries.filter((e) => e.shedId === shed.id && e.day === day).length;
      const missed = missedEntry({
        day, shedId: shed.id, shedName: shed.name, farmId: shed.farmId,
        sessionsExpected: shed.sessionsPerDay, sessionsRecorded: recorded, hourNow: now.getHours(),
      }, thresholds);
      if (missed) alerts.push(missed);
    }

    for (const farm of farms.filter((f) => !farmId || f.id === farmId)) {
      const inventory = feedInventory(ledger, farm.id, day, 7);
      const alert = lowFeed({
        day, farmId: farm.id, farmName: farm.name,
        coverDays: inventory.coverDays, stockKg: (inventory.feedGrams + inventory.shedGrams) / 1000,
      }, thresholds);
      if (alert) alerts.push(alert);
    }

    for (const vaccination of ledger.data.vaccinations) {
      if (farmId && vaccination.farmId !== farmId) continue;
      const alert = vaccinationDue({
        today: day, dueOn: vaccination.dueOn, vaccine: vaccination.vaccine,
        shedId: vaccination.shedId, shedName: shedName.get(vaccination.shedId) ?? 'Shed',
        farmId: vaccination.farmId, flockId: vaccination.flockId,
        done: vaccination.givenOn !== null,
        daysAway: daysBetween(day, vaccination.dueOn),
      }, thresholds);
      if (alert) alerts.push(alert);
    }

    return sortAlerts(visibleTo(alerts, role === 'supervisor'));
    // `now` is intentionally excluded: re-deriving on every render would make
    // the list flicker without telling the farmer anything new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, farmId, thresholds, role, sheds, flocks, farms, day]);
}

/* -------------------------------------------------------------- totals */

/** Today's headline figures for a farm, plus yesterday's for comparison. */
export function useTodayAndYesterday(ledger: Ledger, farmId: string | null, day: DayKey = today()) {
  return useMemo(() => ({
    today: summariseFarm(ledger, day, farmId),
    yesterday: summariseFarm(ledger, addDays(day, -1), farmId),
  }), [ledger, farmId, day]);
}
