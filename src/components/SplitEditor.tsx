'use client';

import { resolveSplit, splitProblem, type SplitMode, type SplitInput } from '@/lib/money';
import { money, hueVar } from '@/lib/format';
import type { GroupMember } from '@/lib/types';

export interface SplitState {
  mode: SplitMode;
  participants: string[];
  inputs: SplitInput;
}

const MODES: [SplitMode, string][] = [
  ['equal', 'Equally'],
  ['exact', 'Exact'],
  ['percent', 'Percent'],
  ['shares', 'Shares'],
];

/**
 * The split editor. Shows what each person ends up owing as the numbers are
 * typed, and refuses to let an expense be saved until the parts account for
 * the whole — the arithmetic here is the same module the server re-runs, so
 * the preview is never a promise the server then breaks.
 */
export default function SplitEditor({
  members,
  amountMinor,
  currency,
  value,
  onChange,
}: {
  members: GroupMember[];
  amountMinor: number;
  currency: string;
  value: SplitState;
  onChange: (next: SplitState) => void;
}) {
  const fmt = (m: number) => money(m, currency);
  const shares = resolveSplit(amountMinor, value.mode, value.participants, value.inputs);
  const problem = splitProblem(
    amountMinor,
    value.mode,
    value.participants,
    value.inputs,
    fmt,
  );

  const setMode = (mode: SplitMode) => {
    const inputs: SplitInput = { ...value.inputs };
    if (mode === 'percent' && !Object.keys(inputs).length && value.participants.length) {
      const each = Math.floor(10000 / value.participants.length) / 100;
      value.participants.forEach((id) => {
        inputs[id] = each;
      });
      const drift = Math.round((100 - each * value.participants.length) * 100) / 100;
      if (drift) inputs[value.participants[0]] = Math.round((each + drift) * 100) / 100;
    }
    if (mode === 'shares' && !Object.keys(inputs).length) {
      value.participants.forEach((id) => {
        inputs[id] = 1;
      });
    }
    onChange({ ...value, mode, inputs });
  };

  const toggle = (id: string, on: boolean) =>
    onChange({
      ...value,
      participants: on
        ? [...value.participants, id]
        : value.participants.filter((p) => p !== id),
    });

  return (
    <div className="field">
      <label>Split</label>

      <div className="seg">
        {MODES.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.mode === k}
            onClick={() => setMode(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="split-list" style={{ marginTop: 9 }}>
        {members.map((m) => {
          const on = value.participants.includes(m.id);
          const needsInput = on && value.mode !== 'equal';
          return (
            <div className="split-row" key={m.id}>
              <input
                type="checkbox"
                checked={on}
                aria-label={`Include ${m.display_name}`}
                onChange={(e) => toggle(m.id, e.target.checked)}
              />
              <span className="who">
                <span className="dot" style={{ background: hueVar(m.hue) }} />
                {m.display_name}
              </span>
              {needsInput ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder={
                    value.mode === 'percent' ? '%' : value.mode === 'shares' ? 'shares' : '0.00'
                  }
                  value={value.inputs[m.id] ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      inputs: { ...value.inputs, [m.id]: e.target.value },
                    })
                  }
                />
              ) : (
                <span className="owed">{on ? fmt(shares[m.id] ?? 0) : '—'}</span>
              )}
            </div>
          );
        })}
      </div>

      {problem ? (
        <p className="hint bad">{problem}</p>
      ) : (
        <p className="hint good">
          {value.mode === 'equal'
            ? `${fmt(amountMinor)} split ${value.participants.length} ${
                value.participants.length === 1 ? 'way' : 'ways'
              } — about ${fmt(
                Math.round(amountMinor / Math.max(value.participants.length, 1)),
              )} each.`
            : `Adds up exactly: ${value.participants
                .map((id) => {
                  const m = members.find((x) => x.id === id);
                  return `${m?.display_name ?? '—'} ${fmt(shares[id] ?? 0)}`;
                })
                .join(' · ')}`}
        </p>
      )}
    </div>
  );
}

export const splitIsValid = (
  amountMinor: number,
  s: SplitState,
): boolean => splitProblem(amountMinor, s.mode, s.participants, s.inputs) === null;
