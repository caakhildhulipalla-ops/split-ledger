import type { SplitMode, Minor } from './money';

export type { SplitMode, Minor };

export interface Profile {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  created_by: string;
  created_at: string;
  archived_at: string | null;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  hue: number;
  role: 'owner' | 'member';
  joined_at: string;
  removed_at: string | null;
}

export interface ExpenseShare {
  expense_id: string;
  member_id: string;
  group_id: string;
  amount_minor: number;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount_minor: number;
  payer_member_id: string;
  category: string;
  spent_on: string;
  notes: string;
  split_mode: SplitMode;
  split_input: Record<string, number>;
  recurring_id: string | null;
  recurring_period: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  expense_shares: ExpenseShare[];
}

export interface Settlement {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_minor: number;
  settled_on: string;
  note: string;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface RecurringExpense {
  id: string;
  group_id: string;
  description: string;
  amount_minor: number;
  payer_member_id: string;
  category: string;
  day_of_month: number;
  start_month: string;
  split_mode: SplitMode;
  split_input: Record<string, number>;
  participants: string[];
  active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  code: string;
  member_id: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
}

/** Everything one group screen needs, loaded in one pass. */
export interface GroupData {
  group: Group;
  members: GroupMember[];
  expenses: Expense[];
  settlements: Settlement[];
  recurring: RecurringExpense[];
  meMemberId: string | null;
  userId: string;
}

export const CATEGORIES = [
  'Rent',
  'Groceries',
  'Food & drink',
  'Utilities',
  'Transport',
  'Household',
  'Entertainment',
  'Health',
  'Travel',
  'Other',
] as const;

export const CURRENCIES: Record<string, { sym: string; locale: string; name: string }> = {
  INR: { sym: '₹', locale: 'en-IN', name: 'Indian rupee' },
  USD: { sym: '$', locale: 'en-US', name: 'US dollar' },
  EUR: { sym: '€', locale: 'de-DE', name: 'Euro' },
  GBP: { sym: '£', locale: 'en-GB', name: 'Pound sterling' },
  AED: { sym: 'د.إ', locale: 'en-AE', name: 'UAE dirham' },
  SGD: { sym: 'S$', locale: 'en-SG', name: 'Singapore dollar' },
  AUD: { sym: 'A$', locale: 'en-AU', name: 'Australian dollar' },
  CAD: { sym: 'C$', locale: 'en-CA', name: 'Canadian dollar' },
  JPY: { sym: '¥', locale: 'ja-JP', name: 'Japanese yen' },
  CHF: { sym: 'Fr', locale: 'de-CH', name: 'Swiss franc' },
};
