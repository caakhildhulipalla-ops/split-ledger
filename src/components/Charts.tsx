'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { moneyAxis, money, money0 } from '@/lib/format';

/* --------------------------------------------------------------------------
   Shared plumbing
   -------------------------------------------------------------------------- */

/** Measure the container so SVG text renders at true size rather than scaled. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

let tipEl: HTMLDivElement | null = null;
function tip() {
  if (typeof document === 'undefined') return null;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function useTip() {
  const show = useCallback((html: string, ev: React.MouseEvent) => {
    const el = tip();
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('on');
    const r = el.getBoundingClientRect();
    let x = ev.clientX + 14;
    let y = ev.clientY - r.height - 10;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 18;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, []);
  const hide = useCallback(() => tip()?.classList.remove('on'), []);
  useEffect(() => hide, [hide]);
  return { show, hide };
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

/** Trim a label to the width reserved for it — clipping is a bug, not a style. */
function fitLabel(s: string, px: number, perChar = 6.6) {
  const max = Math.max(4, Math.floor((px - 12) / perChar));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

const AX = { fontFamily: 'var(--sans)', fontSize: 11, fill: 'var(--ink-3)' } as const;
const AXV = { fontFamily: 'var(--mono)', fontSize: 11, fill: 'var(--ink-3)' } as const;

export interface Row {
  label: string;
  value: number;
  note?: string;
}

/* --------------------------------------------------------------------------
   Chart card: title, table twin, and the caption that qualifies the figure
   -------------------------------------------------------------------------- */

export function ChartCard({
  title,
  caption,
  legend,
  table,
  children,
}: {
  title: string;
  caption: string;
  legend?: { label: string; color: string }[];
  table: { cols: string[]; rows: string[][] };
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="sheet">
      <div className="sheet-head">
        <h2>{title}</h2>
        <span className="grow" />
        <button className="btn btn-sm btn-ghost" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      <div className="sheet-body" style={{ padding: '12px 8px 4px' }}>
        <div className={`chart-host${showTable ? ' off' : ''}`}>{children}</div>
        <div className={`tblview${showTable ? ' on' : ''}`}>
          <div className="tbl-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  {table.cols.map((c, i) => (
                    <th key={c} className={i ? 'r' : ''}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={j ? 'r money' : ''}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {legend && (
        <div className="legend">
          {legend.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      <div className="recon">
        <span className="mini">{caption}</span>
      </div>
    </div>
  );
}

const Empty = ({ children }: { children: string }) => <div className="empty">{children}</div>;

/* --------------------------------------------------------------------------
   Ranked horizontal bars — one hue. These categories have no natural order,
   so colouring by size would just re-encode the bar length.
   -------------------------------------------------------------------------- */

export function HBar({
  rows,
  currency,
  color = 'var(--s1)',
  aria,
}: {
  rows: Row[];
  currency: string;
  color?: string;
  aria: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { show, hide } = useTip();
  const W = Math.max(width || 460, 300);

  if (!rows.length)
    return (
      <div ref={ref}>
        <Empty>Nothing in this period yet.</Empty>
      </div>
    );

  const labelW = Math.min(
    Math.max(...rows.map((r) => r.label.length)) * 6.6 + 10,
    Math.max(96, W * 0.34),
  );
  const rowH = 26;
  const padT = 8;
  const padB = 26;
  const padR = 74;
  const H = padT + rows.length * rowH + padB;
  const plotW = W - labelW - padR;
  const max = niceMax(Math.max(...rows.map((r) => r.value)));

  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        {[0, 1, 2, 3, 4].map((i) => {
          const gx = labelW + (plotW * i) / 4;
          return (
            <g key={i}>
              <line
                x1={gx}
                y1={padT}
                x2={gx}
                y2={padT + rows.length * rowH}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text x={gx} y={H - 9} textAnchor="middle" style={AXV}>
                {moneyAxis((max * i) / 4, currency)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const y = padT + i * rowH;
          const bh = 13;
          const w = Math.max((r.value / max) * plotW, r.value > 0 ? 2 : 0);
          return (
            <g key={r.label + i}>
              <text x={labelW - 9} y={y + bh + 2} textAnchor="end" style={AX}>
                {fitLabel(r.label, labelW)}
              </text>
              <rect
                x={labelW}
                y={y + 3}
                width={w}
                height={bh}
                rx={3}
                fill={color}
                onMouseMove={(e) =>
                  show(
                    `<div class="t-k">${r.label}</div><div class="t-v">${money(r.value, currency)}</div>${
                      r.note ? `<div class="t-k">${r.note}</div>` : ''
                    }`,
                    e,
                  )
                }
                onMouseLeave={hide}
              />
              <text x={labelW + w + 8} y={y + bh + 2} style={{ ...AXV, fill: 'var(--ink-2)' }}>
                {money0(r.value, currency)}
              </text>
            </g>
          );
        })}
        <line
          x1={labelW}
          y1={padT}
          x2={labelW}
          y2={padT + rows.length * rowH}
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Zero-centred diverging bars. The sign is carried by side, colour AND the
   word on the tooltip — colour is never the only channel.
   -------------------------------------------------------------------------- */

export function DivBar({ rows, currency }: { rows: Row[]; currency: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { show, hide } = useTip();
  const W = Math.max(width || 460, 300);

  if (!rows.length)
    return (
      <div ref={ref}>
        <Empty>No members yet.</Empty>
      </div>
    );

  const labelW = Math.min(
    Math.max(...rows.map((r) => r.label.length)) * 6.8 + 12,
    Math.max(88, W * 0.3),
  );
  const rowH = 30;
  const padT = 8;
  const padB = 26;
  const padR = 78;
  const H = padT + rows.length * rowH + padB;
  const plotW = W - labelW - padR;
  const mid = labelW + plotW / 2;
  const half = plotW / 2;
  const max = niceMax(Math.max(1, ...rows.map((r) => Math.abs(r.value))));

  return (
    <div ref={ref}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Net balance per member"
      >
        {[-2, -1, 0, 1, 2].map((i) => {
          const gx = mid + (half * i) / 2;
          return (
            <g key={i}>
              <line
                x1={gx}
                y1={padT}
                x2={gx}
                y2={padT + rows.length * rowH}
                stroke={i === 0 ? 'var(--rule-strong)' : 'var(--grid)'}
                strokeWidth={1}
              />
              <text x={gx} y={H - 9} textAnchor="middle" style={AXV}>
                {i === 0 ? '0' : moneyAxis(Math.abs((max * i) / 2), currency)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const y = padT + i * rowH + 5;
          const bh = 14;
          const w = (Math.abs(r.value) / max) * half;
          const pos = r.value > 0;
          const x0 = pos ? mid : mid - w;
          const word = r.value === 0 ? 'settled' : pos ? 'is owed' : 'owes';
          return (
            <g key={r.label + i}>
              <text
                x={labelW - 10}
                y={y + bh - 2}
                textAnchor="end"
                style={{ ...AX, fill: 'var(--ink-2)' }}
              >
                {fitLabel(r.label, labelW, 6.8)}
              </text>
              {r.value !== 0 ? (
                <>
                  <rect
                    x={x0}
                    y={y}
                    width={Math.max(w, 2)}
                    height={bh}
                    rx={3}
                    fill={pos ? 'var(--credit)' : 'var(--debit)'}
                    onMouseMove={(e) =>
                      show(
                        `<div class="t-k">${r.label} ${word}</div><div class="t-v">${money(
                          Math.abs(r.value),
                          currency,
                        )}</div>`,
                        e,
                      )
                    }
                    onMouseLeave={hide}
                  />
                  <text
                    x={pos ? x0 + Math.max(w, 2) + 7 : x0 - 7}
                    y={y + bh - 2}
                    textAnchor={pos ? 'start' : 'end'}
                    style={{ ...AXV, fill: pos ? 'var(--credit)' : 'var(--debit)' }}
                  >
                    {money0(Math.abs(r.value), currency)}
                  </text>
                </>
              ) : (
                <text x={mid + 7} y={y + bh - 2} style={AX}>
                  settled
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------- columns --- */

export function ColChart({
  rows,
  currency,
  color = 'var(--s1)',
  aria,
}: {
  rows: Row[];
  currency: string;
  color?: string;
  aria: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { show, hide } = useTip();
  const W = Math.max(width || 460, 300);

  if (!rows.length)
    return (
      <div ref={ref}>
        <Empty>Nothing in this period yet.</Empty>
      </div>
    );

  const padL = 52;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const plotH = 168;
  const H = padT + plotH + padB;
  const plotW = W - padL - padR;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.value)));
  const step = plotW / rows.length;
  const bw = Math.max(6, Math.min(38, step - 8));

  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        {[0, 1, 2, 3, 4].map((i) => {
          const gy = padT + plotH - (plotH * i) / 4;
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={gy}
                x2={W - padR}
                y2={gy}
                stroke={i === 0 ? 'var(--rule-strong)' : 'var(--grid)'}
                strokeWidth={1}
              />
              <text x={padL - 8} y={gy + 4} textAnchor="end" style={AXV}>
                {moneyAxis((max * i) / 4, currency)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const cx = padL + step * i + step / 2;
          const h = (r.value / max) * plotH;
          return (
            <g key={r.label + i}>
              {r.value > 0 && (
                <rect
                  x={cx - bw / 2}
                  y={padT + plotH - h}
                  width={bw}
                  height={Math.max(h, 2)}
                  rx={3}
                  fill={color}
                  onMouseMove={(e) =>
                    show(
                      `<div class="t-k">${r.label}</div><div class="t-v">${money(r.value, currency)}</div>`,
                      e,
                    )
                  }
                  onMouseLeave={hide}
                />
              )}
              {(rows.length <= 14 || i % 2 === 0) && (
                <text x={cx} y={H - 12} textAnchor="middle" style={AX}>
                  {r.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------------- line --- */

export function LineChart({
  rows,
  currency,
  color = 'var(--s1)',
  aria,
}: {
  rows: Row[];
  currency: string;
  color?: string;
  aria: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { show, hide } = useTip();
  const W = Math.max(width || 460, 300);

  if (rows.length < 2)
    return (
      <div ref={ref}>
        <Empty>Two months of history are needed for a trend.</Empty>
      </div>
    );

  const padL = 52;
  const padR = 30;
  const padT = 20;
  const padB = 34;
  const plotH = 150;
  const H = padT + plotH + padB;
  const plotW = W - padL - padR;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.value)));
  const X = (i: number) => padL + (plotW * i) / (rows.length - 1);
  const Y = (v: number) => padT + plotH - (v / max) * plotH;
  const band = plotW / (rows.length - 1);

  const d = rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(r.value).toFixed(1)}`).join(' ');
  const area = `${d} L${X(rows.length - 1).toFixed(1)} ${padT + plotH} L${X(0).toFixed(1)} ${padT + plotH} Z`;

  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        {[0, 1, 2, 3].map((i) => {
          const gy = padT + plotH - (plotH * i) / 3;
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={gy}
                x2={W - padR}
                y2={gy}
                stroke={i === 0 ? 'var(--rule-strong)' : 'var(--grid)'}
                strokeWidth={1}
              />
              <text x={padL - 8} y={gy + 4} textAnchor="end" style={AXV}>
                {moneyAxis((max * i) / 3, currency)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={color} opacity={0.1} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          const anchor = last ? 'end' : i === 0 ? 'start' : 'middle';
          const lx = last ? X(i) + 8 : i === 0 ? X(i) - 8 : X(i);
          return (
            <g key={r.label + i}>
              {last && (
                <>
                  <circle cx={X(i)} cy={Y(r.value)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
                  <text
                    x={X(i) - 8}
                    y={Math.max(Y(r.value) - 13, 12)}
                    textAnchor="end"
                    style={{ ...AXV, fill: 'var(--ink-2)' }}
                  >
                    {money0(r.value, currency)}
                  </text>
                </>
              )}
              <rect
                x={X(i) - band / 2}
                y={padT}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseMove={(e) =>
                  show(
                    `<div class="t-k">${r.label}</div><div class="t-v">${money(r.value, currency)}</div>`,
                    e,
                  )
                }
                onMouseLeave={hide}
              />
              {(rows.length <= 14 || i % 2 === 0) && (
                <text x={lx} y={H - 12} textAnchor={anchor} style={AX}>
                  {r.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------- grouped bars --- */

export interface GroupedRow {
  label: string;
  paid: number;
  share: number;
}

export function GroupedBar({ rows, currency }: { rows: GroupedRow[]; currency: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { show, hide } = useTip();
  const W = Math.max(width || 460, 300);

  if (!rows.length)
    return (
      <div ref={ref}>
        <Empty>Nothing in this period yet.</Empty>
      </div>
    );

  const series = [
    { key: 'paid' as const, label: 'Cash fronted', color: 'var(--s1)' },
    { key: 'share' as const, label: 'Their share of spending', color: 'var(--s2)' },
  ];
  const padL = 52;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const plotH = 168;
  const H = padT + plotH + padB;
  const plotW = W - padL - padR;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.paid, r.share])));
  const step = plotW / rows.length;
  const bw = Math.max(5, Math.min(20, (step - 14) / 2));

  return (
    <div ref={ref}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cash fronted versus share of spending"
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const gy = padT + plotH - (plotH * i) / 4;
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={gy}
                x2={W - padR}
                y2={gy}
                stroke={i === 0 ? 'var(--rule-strong)' : 'var(--grid)'}
                strokeWidth={1}
              />
              <text x={padL - 8} y={gy + 4} textAnchor="end" style={AXV}>
                {moneyAxis((max * i) / 4, currency)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const cx = padL + step * i + step / 2;
          return (
            <g key={r.label + i}>
              {series.map((s, k) => {
                const v = r[s.key];
                const h = (v / max) * plotH;
                // 2px gap between the pair, per the mark spec.
                const x = cx - bw - 1 + k * (bw + 2);
                return v > 0 ? (
                  <rect
                    key={s.key}
                    x={x}
                    y={padT + plotH - h}
                    width={bw}
                    height={Math.max(h, 2)}
                    rx={3}
                    fill={s.color}
                    onMouseMove={(e) =>
                      show(
                        `<div class="t-k">${r.label} — ${s.label}</div><div class="t-v">${money(v, currency)}</div>`,
                        e,
                      )
                    }
                    onMouseLeave={hide}
                  />
                ) : null;
              })}
              <text x={cx} y={H - 12} textAnchor="middle" style={AX}>
                {fitLabel(r.label, step)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
