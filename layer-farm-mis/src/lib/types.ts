/**
 * The record model.
 *
 * Every row in the app is one `Record<T>`: a domain payload wrapped in the
 * bookkeeping that multi-device, offline-first, multi-tenant work demands —
 * who owns it, who touched it last, whether it has reached the cloud, and
 * enough to decide which of two divergent copies wins.
 *
 * The hierarchy the requirements describe is carried in the payloads
 * themselves: tenant → farm → shed → flock, and every bird, kilogram and
 * rupee lands on a flock so flock P&L is possible.
 */

import type { DayKey } from '@/domain/dates';
import type { EggCount } from '@/domain/production';
import type { Paise } from '@/domain/money';

export type Role = 'owner' | 'manager' | 'supervisor';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  supervisor: 'Supervisor',
};

/** Money and P&L are the owner's business unless the owner says otherwise. */
export const seesMoney = (role: Role): boolean => role !== 'supervisor';

export type SyncState = 'pending' | 'synced' | 'failed';

export interface Meta {
  id: string;
  type: EntityType;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  /** Role of whoever last wrote it — an owner's edit beats a supervisor's. */
  updatedByRole: Role;
  /** Bumped on every local write; breaks ties when two clocks agree. */
  rev: number;
  deletedAt: string | null;
  sync: SyncState;
}

export type Entity<K extends EntityType, P> = Meta & { type: K } & P;

/* ------------------------------------------------------------- masters */

export interface TenantP {
  name: string;
  /** Laying life used for pullet-cost release, per farm default. */
  layingLifeDays: number;
  currency: 'INR';
}

export interface UserP {
  name: string;
  phone: string;
  role: Role;
  /** PBKDF2 of the sign-in PIN; never the PIN itself. */
  pinHash: string;
  pinSalt: string;
  /** Sheds a supervisor is responsible for. Empty for owner and manager. */
  shedIds: string[];
  active: boolean;
}

export interface FarmP {
  name: string;
  location: string;
  /** NECC zone whose rate this farm is quoted against. */
  neccZone: string;
  contact: string;
  /** Per-100-egg adjustment against the zone rate, in paise. */
  farmGateAdjust: Paise;
  /** How much less an under-50 g egg fetches, per 100 eggs. */
  smallEggGap: Paise;
  layingLifeDays: number;
}

export type HousingType = 'a-frame-cage' | 'deep-litter' | 'other';

export interface ShedP {
  farmId: string;
  name: string;
  housing: HousingType;
  capacity: number;
  /** One entry a day, or a morning and an evening. */
  sessionsPerDay: 1 | 2;
  supervisorIds: string[];
}

export type FlockSource = 'own-reared' | 'bought-pullet';
export type FlockPhase = 'rearing' | 'laying' | 'closed';

export interface FlockP {
  farmId: string;
  shedId: string;
  name: string;
  source: FlockSource;
  supplierId: string | null;
  breed: string;
  placedOn: DayKey;
  birdsPlaced: number;
  /** Chick or pullet cost for the whole placement, in paise. */
  placementCost: Paise;
  phase: FlockPhase;
  /** First laying day; set when the flock moves to lay. */
  layFrom: DayKey | null;
  layingLifeDays: number;
  expectedSpentHenValue: Paise;
  /** Set for a farm onboarding with a flock already mid-life. */
  opening: {
    asOf: DayKey;
    liveBirds: number;
    costToDate: Paise;
  } | null;
  closedOn: DayKey | null;
}

export type ItemCategory =
  | 'feed' | 'raw-material' | 'vaccine-medicine' | 'packaging' | 'fuel' | 'spares' | 'manure' | 'other';

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  feed: 'Feed',
  'raw-material': 'Raw material',
  'vaccine-medicine': 'Vaccine or medicine',
  packaging: 'Packaging',
  fuel: 'Diesel or fuel',
  spares: 'Spares',
  manure: 'Manure',
  other: 'Other',
};

export interface ItemP {
  name: string;
  category: ItemCategory;
  /** Which base unit this item is held in. */
  dimension: 'mass' | 'count' | 'volume';
  /** Unit the farm prefers to type in. */
  entryUnit: string;
  active: boolean;
}

export interface UnitP {
  code: string;
  label: string;
  plural: string;
  dimension: 'mass' | 'count' | 'volume';
  factor: number;
  decimals: number;
}

export type PartyKind = 'supplier' | 'customer' | 'vehicle' | 'driver';

export interface PartyP {
  kind: PartyKind;
  name: string;
  phone: string;
  place: string;
  /** Vehicle registration, for vehicles. */
  registration: string;
}

export interface VaccinationTemplateP {
  farmId: string | null;
  name: string;
  rows: {
    id: string;
    ageDays: number;
    vaccine: string;
    route: string;
    notes: string;
  }[];
}

export interface RateP {
  /** NECC zone this rate belongs to. */
  zone: string;
  day: DayKey;
  /** Zone rate per 100 eggs, in paise. */
  ratePer100: Paise;
  /** True when an owner overrode the pulled rate for their own farm. */
  farmId: string | null;
}

export type HeadKind = 'income' | 'expense';

export interface HeadP {
  kind: HeadKind;
  name: string;
  /** Built-in heads cannot be deleted, only hidden. */
  builtIn: boolean;
  active: boolean;
}

export interface ThresholdP {
  farmId: string | null;
  productionDropPoints: number;
  productionBaselineDays: number;
  mortalitySpikePercent: number;
  feedCoverDays: number;
  missedEntryByHour: number;
  vaccinationLeadDays: number;
}

/* -------------------------------------------------------- transactions */

export type Session = 'morning' | 'evening' | 'day';

export interface DailyEntryP {
  farmId: string;
  shedId: string;
  flockId: string;
  day: DayKey;
  session: Session;
  eggs: EggCount;
  died: number;
  culled: number;
  /** Feed used, in grams. */
  feedGrams: number;
  feedItemId: string | null;
  remarks: string;
}

export interface FeedPurchaseP {
  farmId: string;
  day: DayKey;
  supplierId: string | null;
  itemId: string;
  /** Base units. */
  qty: number;
  enteredUnit: string;
  /** Total amount for the purchase, in paise. */
  amount: Paise;
  vehicleId: string | null;
  invoiceNo: string;
  notes: string;
}

export interface FeedBatchP {
  farmId: string;
  day: DayKey;
  inputs: { itemId: string; qty: number; enteredUnit: string }[];
  outputItemId: string;
  outputQty: number;
  outputUnit: string;
  notes: string;
}

export interface FeedIssueP {
  farmId: string;
  shedId: string;
  day: DayKey;
  itemId: string;
  qty: number;
  enteredUnit: string;
}

export interface StockAdjustmentP {
  farmId: string;
  day: DayKey;
  itemId: string;
  countedQty: number;
  enteredUnit: string;
  /** What the app thought was there, kept for the audit trail. */
  systemQty: number;
  reason: string;
}

export interface MedicineIssueP {
  farmId: string;
  shedId: string | null;
  flockId: string | null;
  day: DayKey;
  itemId: string;
  qty: number;
  enteredUnit: string;
  notes: string;
}

export interface VaccinationP {
  farmId: string;
  shedId: string;
  flockId: string;
  vaccine: string;
  route: string;
  dueOn: DayKey;
  givenOn: DayKey | null;
  itemId: string | null;
  notes: string;
}

export interface DispatchLine {
  grade: 'A' | 'B';
  /** Eggs sent. */
  qtySent: number;
  /** Eggs the customer acknowledged. */
  qtyReceived: number;
  /** Rate per 100 eggs, in paise. */
  ratePer100: Paise;
}

export interface DispatchP {
  farmId: string;
  day: DayKey;
  customerId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  lines: DispatchLine[];
  /** Recorded, not deducted from revenue (decision 6). */
  transitBreakage: number;
  notes: string;
}

export interface GateLogP {
  farmId: string;
  day: DayKey;
  vehicleNo: string;
  driver: string;
  purpose: string;
  timeIn: string;
  timeOut: string;
  disinfected: boolean;
  notes: string;
}

export interface ExpenseP {
  farmId: string;
  day: DayKey;
  headId: string;
  amount: Paise;
  /** Inclusive period the expense covers; equal for a one-day cost. */
  from: DayKey;
  to: DayKey;
  shedId: string | null;
  flockId: string | null;
  partyId: string | null;
  notes: string;
}

export interface OtherIncomeP {
  farmId: string;
  day: DayKey;
  headId: string;
  qty: number;
  enteredUnit: string;
  amount: Paise;
  flockId: string | null;
  partyId: string | null;
  notes: string;
}

export type FlockEventKind = 'placement' | 'transfer' | 'phase' | 'closure' | 'opening' | 'bird-sale';

export interface FlockEventP {
  farmId: string;
  flockId: string;
  day: DayKey;
  kind: FlockEventKind;
  fromShedId: string | null;
  toShedId: string | null;
  birds: number;
  amount: Paise;
  notes: string;
}

/* ------------------------------------------------------- the union */

export type EntityMap = {
  tenant: TenantP;
  user: UserP;
  farm: FarmP;
  shed: ShedP;
  flock: FlockP;
  item: ItemP;
  unit: UnitP;
  party: PartyP;
  'vaccination-template': VaccinationTemplateP;
  rate: RateP;
  head: HeadP;
  threshold: ThresholdP;
  'daily-entry': DailyEntryP;
  'feed-purchase': FeedPurchaseP;
  'feed-batch': FeedBatchP;
  'feed-issue': FeedIssueP;
  'stock-adjustment': StockAdjustmentP;
  'medicine-issue': MedicineIssueP;
  vaccination: VaccinationP;
  dispatch: DispatchP;
  'gate-log': GateLogP;
  expense: ExpenseP;
  'other-income': OtherIncomeP;
  'flock-event': FlockEventP;
};

export type EntityType = keyof EntityMap;

export type Row<K extends EntityType = EntityType> = Entity<K, EntityMap[K]>;

export type Tenant = Row<'tenant'>;
export type User = Row<'user'>;
export type Farm = Row<'farm'>;
export type Shed = Row<'shed'>;
export type Flock = Row<'flock'>;
export type Item = Row<'item'>;
export type Unit = Row<'unit'>;
export type Party = Row<'party'>;
export type VaccinationTemplate = Row<'vaccination-template'>;
export type Rate = Row<'rate'>;
export type Head = Row<'head'>;
export type Threshold = Row<'threshold'>;
export type DailyEntry = Row<'daily-entry'>;
export type FeedPurchase = Row<'feed-purchase'>;
export type FeedBatch = Row<'feed-batch'>;
export type FeedIssue = Row<'feed-issue'>;
export type StockAdjustment = Row<'stock-adjustment'>;
export type MedicineIssue = Row<'medicine-issue'>;
export type Vaccination = Row<'vaccination'>;
export type Dispatch = Row<'dispatch'>;
export type GateLog = Row<'gate-log'>;
export type Expense = Row<'expense'>;
export type OtherIncome = Row<'other-income'>;
export type FlockEvent = Row<'flock-event'>;

/* ----------------------------------------------------------- audit */

export interface AuditEntry {
  id: string;
  tenantId: string;
  entityId: string;
  entityType: EntityType;
  action: 'create' | 'update' | 'delete';
  at: string;
  by: string;
  byName: string;
  byRole: Role;
  /** Field-level before and after, so an owner can see exactly what changed. */
  changes: { field: string; from: unknown; to: unknown }[];
}

/* ---------------------------------------------------------- outbox */

export interface OutboxEntry {
  seq: number;
  tenantId: string;
  entityId: string;
  entityType: EntityType;
  op: 'upsert' | 'delete';
  rev: number;
  queuedAt: string;
  attempts: number;
  /** Epoch millis; a failed entry waits, later entries go ahead of it. */
  nextAttemptAt: number;
  lastError: string | null;
  state: 'queued' | 'failed';
}
