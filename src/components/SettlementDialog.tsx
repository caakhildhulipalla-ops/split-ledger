'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { saveSettlement } from '@/app/actions';
import { todayISO } from '@/lib/format';
import type { GroupMember } from '@/lib/types';

export interface PrefilledPayment {
  from: string;
  to: string;
  amountMinor: number;
}

export default function SettlementDialog({
  open,
  onClose,
  groupId,
  members,
  meMemberId,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMember[];
  meMemberId: string | null;
  prefill?: PrefilledPayment | null;
}) {
  const router = useRouter();
  const active = members.filter((m) => !m.removed_at);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError('');
    setDate(todayISO());
    setNote('');
    setFrom(prefill?.from ?? meMemberId ?? active[0]?.id ?? '');
    setTo(prefill?.to ?? '');
    setAmount(prefill ? (prefill.amountMinor / 100).toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.from, prefill?.to, prefill?.amountMinor]);

  const problem =
    from && to && from === to
      ? 'Pick two different people.'
      : !(Number(amount) > 0)
        ? 'Enter an amount greater than zero.'
        : null;

  const submit = () =>
    start(async () => {
      setError('');
      const res = await saveSettlement(groupId, from, to, amount, date, note);
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
      title="Record a payment"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={pending || !!problem || !from || !to}
          >
            {pending ? 'Recording…' : 'Record payment'}
          </button>
        </>
      }
    >
      <p className="mini" style={{ marginTop: 0 }}>
        Money that actually changed hands — a transfer, cash, a UPI payment. It reduces
        what one person owes another.
      </p>

      <div className="row2">
        <div className="field">
          <label htmlFor="p-from">From</label>
          <select id="p-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-to">To</label>
          <select id="p-to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="p-amt">Amount</label>
          <input
            id="p-amt"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-date">Date</label>
          <input
            id="p-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="p-note">
          Note <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
        </label>
        <input
          id="p-note"
          type="text"
          placeholder="UPI, cash, bank transfer"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {(problem || error) && <p className="hint bad">{error || problem}</p>}
    </Dialog>
  );
}
