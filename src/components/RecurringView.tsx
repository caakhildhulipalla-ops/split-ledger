'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import SplitEditor, { splitIsValid, type SplitState } from './SplitEditor';
import { saveRecurring, toggleRecurring, deleteRecurring } from '@/app/actions';
import { money, monthLabel, monthOf, todayISO, splitLabel, hueVar, ordinal, plural } from '@/lib/format';
import { CATEGORIES, type GroupData, type RecurringExpense } from '@/lib/types';

export default function RecurringView({ data }: { data: GroupData }) {
  const { group, members, meMemberId } = data;
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const active = members.filter((m) => !m.removed_at);
  const member = (id: string) =>
    members.find((m) => m.id === id) ?? { display_name: 'Removed member', hue: 1 };

  const rows = [...data.recurring].sort((a, b) => a.day_of_month - b.day_of_month);

  return (
    <>
      <div className="sheet">
        <div className="sheet-head">
          <h2>Recurring expenses</h2>
          <span className="sub">
            posted automatically each month — rent, wifi, subscriptions
          </span>
          <span className="grow" />
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add a recurring expense
          </button>
        </div>

        {rows.length ? (
          <div className="tbl-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Posts on</th>
                  <th>Description</th>
                  <th>Paid by</th>
                  <th>Split</th>
                  <th className="r">Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="money meta">
                      {r.day_of_month}
                      {ordinal(r.day_of_month)}
                    </td>
                    <td>
                      <div className="desc">{r.description}</div>
                      <div className="meta">
                        <span className="catchip">{r.category}</span> · since{' '}
                        {monthLabel(r.start_month)}
                      </div>
                    </td>
                    <td>
                      <span className="who">
                        <span
                          className="dot"
                          style={{ background: hueVar(member(r.payer_member_id).hue) }}
                        />
                        {member(r.payer_member_id).display_name}
                      </span>
                    </td>
                    <td className="meta">
                      {splitLabel(r.split_mode)} ·{' '}
                      {plural((r.participants ?? []).length, 'person', 'people')}
                    </td>
                    <td className="r money">{money(r.amount_minor, group.currency)}</td>
                    <td>
                      <span className={`catchip${r.active ? ' on' : ''}`}>
                        {r.active ? 'active' : 'paused'}
                      </span>
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await toggleRecurring(group.id, r.id, !r.active);
                            router.refresh();
                          })
                        }
                      >
                        {r.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            Nothing recurring yet. Rent and the wifi bill are the usual first two.
          </div>
        )}

        <div className="recon">
          <span className="mini">
            A month is posted the first time anyone opens the app on or after its date.
            Editing a template changes future months only — months already posted stay as
            they were entered.
          </span>
        </div>
      </div>

      <RecurringDialog
        key={editing?.id ?? 'new'}
        open={open}
        onClose={() => setOpen(false)}
        groupId={group.id}
        currency={group.currency}
        members={active}
        meMemberId={meMemberId}
        recurring={editing}
      />
    </>
  );
}

function RecurringDialog({
  open,
  onClose,
  groupId,
  currency,
  members,
  meMemberId,
  recurring,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  members: GroupData['members'];
  meMemberId: string | null;
  recurring?: RecurringExpense | null;
}) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [category, setCategory] = useState('Rent');
  const [day, setDay] = useState(1);
  const [startMonth, setStartMonth] = useState(monthOf(todayISO()));
  const [split, setSplit] = useState<SplitState>({ mode: 'equal', participants: [], inputs: {} });
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError('');
    if (recurring) {
      setDescription(recurring.description);
      setAmount((recurring.amount_minor / 100).toFixed(2));
      setPayer(recurring.payer_member_id);
      setCategory(recurring.category);
      setDay(recurring.day_of_month);
      setStartMonth(recurring.start_month);
      setSplit({
        mode: recurring.split_mode,
        participants: recurring.participants ?? [],
        inputs: (recurring.split_input ?? {}) as SplitState['inputs'],
      });
    } else {
      setDescription('');
      setAmount('');
      setPayer(meMemberId ?? members[0]?.id ?? '');
      setCategory('Rent');
      setDay(1);
      setStartMonth(monthOf(todayISO()));
      setSplit({ mode: 'equal', participants: members.map((m) => m.id), inputs: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recurring?.id]);

  const amountMinor = Math.round(Number(amount || 0) * 100);
  const canSave = !!description.trim() && amountMinor > 0 && splitIsValid(amountMinor, split);

  const submit = () =>
    start(async () => {
      setError('');
      const res = await saveRecurring({
        id: recurring?.id ?? null,
        groupId,
        description,
        amount,
        payerMemberId: payer,
        category,
        dayOfMonth: day,
        startMonth,
        splitMode: split.mode,
        participants: split.participants,
        splitInput: split.inputs,
        active: recurring ? recurring.active : true,
      });
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
      title={recurring ? 'Edit recurring expense' : 'New recurring expense'}
      footer={
        <>
          {recurring && (
            <>
              <button
                className="btn btn-danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteRecurring(groupId, recurring.id);
                    onClose();
                    router.refresh();
                  })
                }
              >
                Delete template
              </button>
              <span style={{ flex: '1 1 auto' }} />
            </>
          )}
          <button className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !canSave}>
            {pending ? 'Saving…' : recurring ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="r-desc">Description</label>
        <input
          id="r-desc"
          type="text"
          placeholder="Flat rent"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="r-amt">Amount each month</label>
          <input
            id="r-amt"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="r-day">Posts on day</label>
          <input
            id="r-day"
            type="number"
            min={1}
            max={28}
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="r-payer">Paid by</label>
          <select id="r-payer" value={payer} onChange={(e) => setPayer(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-cat">Category</label>
          <select id="r-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="r-start">First month</label>
        <input
          id="r-start"
          type="month"
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
        />
      </div>

      <SplitEditor
        members={members}
        amountMinor={amountMinor}
        currency={currency}
        value={split}
        onChange={setSplit}
      />

      {error && <p className="hint bad">{error}</p>}
    </Dialog>
  );
}
