'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/lib/router-compat';
import Dialog from './Dialog';
import { createGroup } from '@/lib/mutations';
import { CURRENCIES } from '@/lib/types';
import { hueVar } from '@/lib/format';

export default function NewGroupDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [names, setNames] = useState<string[]>(['', '']);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const reset = () => {
    setName('');
    setCurrency('INR');
    setNames(['', '']);
    setError('');
  };

  const submit = () =>
    start(async () => {
      setError('');
      const res = await createGroup(name, currency, names);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
      if (res.id) router.push(`/g?id=${res.id}`);
    });

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        New group
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New group"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={pending || !name.trim()}
            >
              {pending ? 'Creating…' : 'Create group'}
            </button>
          </>
        }
      >
        <div className="row2">
          <div className="field">
            <label htmlFor="g-name">Group name</label>
            <input
              id="g-name"
              type="text"
              placeholder="Flat 302"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="g-cur">Currency</label>
            <select
              id="g-cur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {code} {c.sym} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Who else is in it?</label>
          <div className="split-list">
            <div className="split-row" style={{ gridTemplateColumns: '22px 1fr' }}>
              <span className="dot" style={{ background: hueVar(1), width: 12, height: 12 }} />
              <span className="meta">You — added automatically</span>
            </div>
            {names.map((n, i) => (
              <div
                key={i}
                className="split-row"
                style={{ gridTemplateColumns: '22px 1fr auto' }}
              >
                <span
                  className="dot"
                  style={{ background: hueVar(i + 2), width: 12, height: 12 }}
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={n}
                  onChange={(e) => {
                    const copy = [...names];
                    copy[i] = e.target.value;
                    setNames(copy);
                  }}
                  style={{
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 5,
                    padding: '5px 8px',
                    background: 'var(--surface)',
                    width: '100%',
                    fontSize: 15,
                  }}
                />
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => setNames(names.filter((_, j) => j !== i))}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 9 }}
            onClick={() => setNames([...names, ''])}
            type="button"
          >
            Add another
          </button>
          <p className="hint">
            Add people by name now — they do not need an account yet. Send them an
            invite link later and their history comes with them.
          </p>
          {error && <p className="hint bad">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
