'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import SplitEditor, { splitIsValid, type SplitState } from './SplitEditor';
import { saveExpense, deleteExpense } from '@/app/actions';
import { CATEGORIES, type Expense, type GroupMember } from '@/lib/types';
import { todayISO } from '@/lib/format';

export default function ExpenseDialog({
  open,
  onClose,
  groupId,
  currency,
  members,
  meMemberId,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  members: GroupMember[];
  meMemberId: string | null;
  expense?: Expense | null;
}) {
  const router = useRouter();
  const active = members.filter((m) => !m.removed_at);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [category, setCategory] = useState<string>('Food & drink');
  const [spentOn, setSpentOn] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [split, setSplit] = useState<SplitState>({
    mode: 'equal',
    participants: [],
    inputs: {},
  });
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  // Reset the form each time the dialog opens, so an edit never inherits the
  // previous expense's values.
  useEffect(() => {
    if (!open) return;
    setError('');
    if (expense) {
      setDescription(expense.description);
      setAmount((expense.amount_minor / 100).toFixed(2));
      setPayer(expense.payer_member_id);
      setCategory(expense.category);
      setSpentOn(expense.spent_on);
      setNotes(expense.notes ?? '');
      setSplit({
        mode: expense.split_mode,
        participants: (expense.expense_shares ?? []).map((s) => s.member_id),
        inputs: (expense.split_input ?? {}) as SplitState['inputs'],
      });
    } else {
      setDescription('');
      setAmount('');
      setPayer(meMemberId ?? active[0]?.id ?? '');
      setCategory('Food & drink');
      setSpentOn(todayISO());
      setNotes('');
      setSplit({ mode: 'equal', participants: active.map((m) => m.id), inputs: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const amountMinor = Math.round(Number(amount || 0) * 100);
  const canSave =
    !!description.trim() && amountMinor > 0 && splitIsValid(amountMinor, split) && !!payer;

  const submit = () =>
    start(async () => {
      setError('');
      const res = await saveExpense({
        id: expense?.id ?? null,
        groupId,
        description,
        amount,
        payerMemberId: payer,
        category,
        spentOn,
        notes,
        splitMode: split.mode,
        participants: split.participants,
        splitInput: split.inputs,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!expense) return;
      const res = await deleteExpense(groupId, expense.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add an expense'}
      footer={
        <>
          {expense && (
            <>
              <button className="btn btn-danger" onClick={remove} disabled={pending}>
                Delete
              </button>
              <span style={{ flex: '1 1 auto' }} />
            </>
          )}
          <button className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !canSave}>
            {pending ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="e-desc">Description</label>
        <input
          id="e-desc"
          type="text"
          placeholder="Dinner at Bawarchi"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="e-amt">Amount</label>
          <input
            id="e-amt"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="e-date">Date</label>
          <input
            id="e-date"
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
          />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="e-payer">Paid by</label>
          <select id="e-payer" value={payer} onChange={(e) => setPayer(e.target.value)}>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="e-cat">Category</label>
          <select id="e-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SplitEditor
        members={active}
        amountMinor={amountMinor}
        currency={currency}
        value={split}
        onChange={setSplit}
      />

      <div className="field">
        <label htmlFor="e-note">
          Note <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
        </label>
        <textarea
          id="e-note"
          placeholder="Anything worth remembering when this is questioned in three months"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="hint bad">{error}</p>}
    </Dialog>
  );
}
