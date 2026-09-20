'use client';

/**
 * The shared pieces every screen is built from.
 *
 * Three rules run through all of them, and they come from the room the app is
 * used in rather than from taste: touch targets are at least 48 px because the
 * phone is held in one hand; every figure is tabular so a column of numbers
 * reads as a column; and numeric fields open a numeric keypad, because a shed
 * supervisor entering eleven values twice a day should never see a QWERTY
 * keyboard.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { formatRupees, parseRupees, type Paise } from '@/domain/money';

/* ---------------------------------------------------------------- icons */

type IconProps = { size?: number; className?: string };
const svg = (path: ReactNode, { size = 20, className }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {path}
  </svg>
);

export const Icon = {
  dashboard: (p: IconProps = {}) => svg(<><path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-5H3zM13 8h8V3h-8z" /></>, p),
  entry: (p: IconProps = {}) => svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>, p),
  feed: (p: IconProps = {}) => svg(<><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z" /><path d="M9 8V5a3 3 0 0 1 6 0v3" /></>, p),
  money: (p: IconProps = {}) => svg(<><path d="M6 4h12M6 9h12M9 4c3.5 0 5.5 1.6 5.5 4.4S12.5 13 9 13h-.5l6 7" /></>, p),
  more: (p: IconProps = {}) => svg(<><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>, p),
  back: (p: IconProps = {}) => svg(<path d="M15 18l-6-6 6-6" />, p),
  chevron: (p: IconProps = {}) => svg(<path d="M9 18l6-6-6-6" />, p),
  close: (p: IconProps = {}) => svg(<><path d="M18 6 6 18M6 6l12 12" /></>, p),
  plus: (p: IconProps = {}) => svg(<><path d="M12 5v14M5 12h14" /></>, p),
  check: (p: IconProps = {}) => svg(<path d="M20 6 9 17l-5-5" />, p),
  alert: (p: IconProps = {}) => svg(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>, p),
  egg: (p: IconProps = {}) => svg(<path d="M12 22c-3.9 0-6.5-2.6-6.5-6.4C5.5 10.8 8.5 2 12 2s6.5 8.8 6.5 13.6c0 3.8-2.6 6.4-6.5 6.4z" />, p),
  shed: (p: IconProps = {}) => svg(<><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-6h6v6" /></>, p),
  sync: (p: IconProps = {}) => svg(<><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" /><path d="M21 4v5h-5M3 20v-5h5" /></>, p),
  trash: (p: IconProps = {}) => svg(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>, p),
  flock: (p: IconProps = {}) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, p),
};

/* --------------------------------------------------------------- shells */

export function TopBar({ title, sub, onBack, right }: {
  title: string;
  sub?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      {onBack && (
        <button className="btn ghost sm" onClick={onBack} aria-label="Back" style={{ marginLeft: -8, minHeight: 40, padding: '0 6px' }}>
          <Icon.back size={22} />
        </button>
      )}
      <div className="grow">
        <h1 className="truncate">{title}</h1>
        {sub && <div className="sub truncate">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export const Card = ({ children, className = '', pad = true }: { children: ReactNode; className?: string; pad?: boolean }) => (
  <div className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</div>
);

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="row-between" style={{ alignItems: 'baseline' }}>
    <div className="section-title">{children}</div>
    {action}
  </div>
);

export function Item({ title, meta, value, sub, onClick, leading, chevron = true }: {
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  leading?: ReactNode;
  chevron?: boolean;
}) {
  const body = (
    <>
      {leading}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title truncate">{title}</div>
        {meta && <div className="meta truncate">{meta}</div>}
      </div>
      {value !== undefined && (
        <div className="value">
          <div className="num strong">{value}</div>
          {sub && <div className="tiny muted">{sub}</div>}
        </div>
      )}
      {onClick && chevron && <Icon.chevron size={17} className="chev" />}
    </>
  );
  return onClick
    ? <button className="item" onClick={onClick}>{body}</button>
    : <div className="item">{body}</div>;
}

export const Pill = ({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' | 'accent' }) => (
  <span className={`pill ${tone === 'default' ? '' : tone}`}>{children}</span>
);

export const Banner = ({ tone = 'info', title, children }: {
  tone?: 'info' | 'warn' | 'bad' | 'good';
  title?: ReactNode;
  children: ReactNode;
}) => (
  <div className={`banner ${tone}`}>
    <div>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  </div>
);

export const Empty = ({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) => (
  <div className="empty">
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action && <div className="mt">{action}</div>}
  </div>
);

/* ---------------------------------------------------------------- sheet */

export function Sheet({ open, onClose, title, sub, children, actions }: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div className="grow">
            <h2 className="truncate">{title}</h2>
            {sub && <div className="small muted truncate">{sub}</div>}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close size={20} /></button>
        </div>
        {children}
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- forms */

export function Field({ label, hint, error, children }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? <div className="error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text', invalid, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      data-invalid={invalid ? 'true' : undefined}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * A numeric field that opens a number pad.
 *
 * `inputMode="decimal"` rather than `type="number"`: a number input on Android
 * rejects a stray comma silently and its spinner arrows are a hazard under a
 * thumb, while a text field with a decimal keypad accepts exactly what people
 * type and leaves the parsing to code that has been tested.
 */
export function NumberInput({ value, onChange, placeholder, suffix, invalid, autoFocus, decimal = true }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: ReactNode;
  invalid?: boolean;
  autoFocus?: boolean;
  decimal?: boolean;
}) {
  const input = (
    <input
      className="input num"
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      value={value}
      placeholder={placeholder ?? '0'}
      data-invalid={invalid ? 'true' : undefined}
      autoFocus={autoFocus}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.\-]/g, ''))}
    />
  );
  if (!suffix) return input;
  return (
    <div className="qty">
      {input}
      <div className="select" style={{ display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
        {suffix}
      </div>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, placeholder }: {
  value: T | '';
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export const TextArea = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <textarea className="textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);

/** A quantity and the unit it is being typed in, side by side. */
export function QtyInput({ value, onChange, unit, onUnitChange, units, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  onUnitChange: (u: string) => void;
  units: readonly { value: string; label: string }[];
  autoFocus?: boolean;
}) {
  return (
    <div className="qty">
      <input
        className="input num"
        inputMode="decimal"
        value={value}
        placeholder="0"
        autoFocus={autoFocus}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      />
      <select className="select" value={unit} onChange={(e) => onUnitChange(e.target.value)} aria-label="Unit">
        {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
    </div>
  );
}

/** Rupees in, paise out. Shows the parsed amount back so there is no doubt. */
export function MoneyInput({ value, onChange, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const paise = parseRupees(value);
  return (
    <div className="stack-sm">
      <div className="qty">
        <div className="select" style={{ width: 46, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--ink-2)' }}>₹</div>
        <input
          className="input num"
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          autoFocus={autoFocus}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        />
      </div>
      {paise !== null && paise > 0 && <div className="hint num">{formatRupees(paise)}</div>}
    </div>
  );
}

export function DayInput({ value, onChange, max, min }: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
  min?: string;
}) {
  return (
    <input className="input num" type="date" value={value} max={max} min={min} onChange={(e) => onChange(e.target.value)} />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="row" style={{ gap: 12, padding: '10px 0', cursor: 'pointer' }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
      />
      <span className="grow">{label}</span>
    </label>
  );
}

export function Chips<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          className="chip"
          role="tab"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- charts */

/**
 * A sparkline over a run of daily values.
 *
 * Gaps are real: a day with no entry is `null`, and the line breaks rather
 * than drawing straight through as if production had been steady.
 */
export function Spark({ values, tone = 'accent', height = 34 }: {
  values: readonly (number | null)[];
  tone?: 'accent' | 'good' | 'bad';
  height?: number;
}) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return <div className="spark" style={{ height }} />;

  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const stepX = 100 / Math.max(1, values.length - 1);

  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    const x = (i * stepX).toFixed(2);
    const y = (100 - ((v - min) / span) * 100).toFixed(2);
    current.push(`${current.length === 0 ? 'M' : 'L'}${x},${y}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const stroke = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--accent)';

  return (
    <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      {segments.map((d, i) => <path key={i} d={d} stroke={stroke} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/** A short bar chart, for daily figures where the shape matters more than the line. */
export function Bars({ values, height = 46 }: { values: readonly number[]; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bars" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <i key={i} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} data-hot={i === values.length - 1} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- tiles */

export function Tile({ label, figure, unit, foot, tone, onClick, children }: {
  label: ReactNode;
  figure: ReactNode;
  unit?: ReactNode;
  foot?: ReactNode;
  tone?: 'good' | 'bad';
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={`figure num ${tone ?? ''}`}>
        {figure}
        {unit && <span className="unit"> {unit}</span>}
      </div>
      {children}
      {foot && <div className="foot">{foot}</div>}
    </>
  );
  return onClick
    ? <button className="tile" onClick={onClick}>{body}</button>
    : <div className="tile">{body}</div>;
}

/** A change against a baseline, rendered with its direction. */
export function Delta({ value, suffix = '', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="delta flat">—</span>;
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const good = invert ? rounded < 0 : rounded > 0;
  const tone = rounded === 0 ? 'flat' : good ? 'up' : 'down';
  const arrow = rounded === 0 ? '' : rounded > 0 ? '▲' : '▼';
  return <span className={`delta ${tone}`}>{arrow} {Math.abs(rounded).toFixed(1)}{suffix}</span>;
}

/* -------------------------------------------------------------- helpers */

export const KeyValue = ({ rows }: { rows: readonly { k: ReactNode; v: ReactNode }[] }) => (
  <div className="kv">
    {rows.map((r, i) => (
      <div key={i}>
        <span className="k">{r.k}</span>
        <span className="v">{r.v}</span>
      </div>
    ))}
  </div>
);

export const Money = ({ paise, short = false, sign = false }: { paise: Paise; short?: boolean; sign?: boolean }) => (
  <span className="num">{short ? shortMoney(paise) : formatRupees(paise, { paise: false, sign })}</span>
);

function shortMoney(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  const prefix = paise < 0 ? '−₹' : '₹';
  if (rupees >= 1_00_00_000) return `${prefix}${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (rupees >= 1_00_000) return `${prefix}${(rupees / 1_00_000).toFixed(2)}L`;
  if (rupees >= 1_000) return `${prefix}${(rupees / 1_000).toFixed(1)}k`;
  return `${prefix}${Math.round(rupees)}`;
}

export const num = (n: number, decimals = 0): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** '—' for a ratio with no denominator, rather than a misleading zero. */
export const ratio = (value: number | null, decimals = 1, suffix = ''): string =>
  value === null ? '—' : `${value.toFixed(decimals)}${suffix}`;
