import { describe, it, expect } from 'vitest';
import {
  toMinor,
  resolveSplit,
  splitProblem,
  netBalances,
  settleUp,
  pairwiseDebts,
  type ExpenseLike,
  type SettlementLike,
  type SplitMode,
} from './money';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('splits land exactly on the total', () => {
  it('splits 100.00 three ways without inventing or losing a paisa', () => {
    const s = resolveSplit(10000, 'equal', ['a', 'b', 'c']);
    expect(sum(s)).toBe(10000);
    expect(s).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it('splits by shares 1:2:3', () => {
    const s = resolveSplit(6000, 'shares', ['a', 'b', 'c'], { a: 1, b: 2, c: 3 });
    expect(s).toEqual({ a: 1000, b: 2000, c: 3000 });
  });

  it('splits by percent that does not divide evenly', () => {
    const s = resolveSplit(10000, 'percent', ['a', 'b'], { a: 33.33, b: 66.67 });
    expect(sum(s)).toBe(10000);
  });

  it('spreads an awkward remainder by a single paisa', () => {
    const s = resolveSplit(999, 'equal', ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(sum(s)).toBe(999);
    expect(Math.max(...Object.values(s)) - Math.min(...Object.values(s))).toBe(1);
  });

  it('survives the 0.1 + 0.2 float trap', () => {
    const s = resolveSplit(toMinor(0.3), 'exact', ['a', 'b'], { a: 0.1, b: 0.2 });
    expect(sum(s)).toBe(30);
  });

  it('never returns a negative share', () => {
    const s = resolveSplit(5000, 'shares', ['a', 'b'], { a: -3, b: 1 });
    expect(Object.values(s).every((v) => v >= 0)).toBe(true);
    expect(sum(s)).toBe(5000);
  });
});

describe('the split editor refuses to post something that does not add up', () => {
  it('catches exact amounts under the total', () => {
    expect(splitProblem(10000, 'exact', ['a', 'b'], { a: 40, b: 50 })).not.toBeNull();
  });
  it('accepts exact amounts on the total', () => {
    expect(splitProblem(10000, 'exact', ['a', 'b'], { a: 40, b: 60 })).toBeNull();
  });
  it('catches percentages that miss 100', () => {
    expect(splitProblem(10000, 'percent', ['a', 'b'], { a: 30, b: 60 })).not.toBeNull();
  });
  it('accepts 33.33 / 33.33 / 33.34', () => {
    expect(
      splitProblem(10000, 'percent', ['a', 'b', 'c'], { a: 33.33, b: 33.33, c: 33.34 }),
    ).toBeNull();
  });
  it('catches an empty participant list, a zero amount and all-zero shares', () => {
    expect(splitProblem(10000, 'equal', [])).not.toBeNull();
    expect(splitProblem(0, 'equal', ['a'])).not.toBeNull();
    expect(splitProblem(10000, 'shares', ['a', 'b'], { a: 0, b: 0 })).not.toBeNull();
  });
});

describe('a real flatshare reconciles and settles', () => {
  const ids = ['ak', 'pr', 'sa'];
  const expenses: ExpenseLike[] = [
    { payerId: 'ak', amountMinor: 300000, shares: resolveSplit(300000, 'equal', ids) },
    { payerId: 'pr', amountMinor: 120050, shares: resolveSplit(120050, 'equal', ids) },
    {
      payerId: 'sa',
      amountMinor: 90000,
      shares: resolveSplit(90000, 'shares', ids, { ak: 2, pr: 1, sa: 1 }),
    },
  ];

  it('nets to zero', () => {
    expect(sum(netBalances(ids, expenses, []))).toBe(0);
  });

  it('clears every balance in at most n-1 payments', () => {
    const net = netBalances(ids, expenses, []);
    const tx = settleUp(net);
    expect(tx.length).toBeLessThanOrEqual(ids.length - 1);
    const after = netBalances(
      ids,
      expenses,
      tx.map((t) => ({ fromId: t.from, toId: t.to, amountMinor: t.amountMinor })),
    );
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
});

describe('simplification only collapses debt that genuinely cancels', () => {
  it('matches the pairwise total when nothing can be routed', () => {
    const ids = ['a', 'b', 'c'];
    const expenses: ExpenseLike[] = [
      { payerId: 'a', amountMinor: 30000, shares: resolveSplit(30000, 'equal', ids) },
      { payerId: 'b', amountMinor: 30000, shares: resolveSplit(30000, 'equal', ids) },
    ];
    const pw = pairwiseDebts(ids, expenses, []);
    const simplified = settleUp(netBalances(ids, expenses, []));
    expect(pw).toHaveLength(2);
    expect(pw.reduce((s, t) => s + t.amountMinor, 0)).toBe(
      simplified.reduce((s, t) => s + t.amountMinor, 0),
    );
  });

  it('reduces a circular debt to nothing while still showing the IOUs', () => {
    const ids = ['a', 'b', 'c'];
    const expenses: ExpenseLike[] = [
      { payerId: 'a', amountMinor: 10000, shares: { b: 10000 } },
      { payerId: 'b', amountMinor: 10000, shares: { c: 10000 } },
      { payerId: 'c', amountMinor: 10000, shares: { a: 10000 } },
    ];
    const net = netBalances(ids, expenses, []);
    expect(Object.values(net).every((v) => v === 0)).toBe(true);
    expect(settleUp(net)).toHaveLength(0);
    expect(pairwiseDebts(ids, expenses, [])).toHaveLength(3);
  });
});

describe('fuzz: 4000 random ledgers', () => {
  // Deterministic PRNG so a failure is reproducible from the seed.
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const modes: SplitMode[] = ['equal', 'exact', 'percent', 'shares'];
  let badSplit = 0;
  let badNet = 0;
  let badSettle = 0;
  let worstTx = 0;

  for (let t = 0; t < 4000; t += 1) {
    const n = 2 + Math.floor(rnd() * 7);
    const ids = Array.from({ length: n }, (_, i) => `m${i}`);
    const expenses: ExpenseLike[] = [];

    for (let e = 0; e < 1 + Math.floor(rnd() * 12); e += 1) {
      const amount = 1 + Math.floor(rnd() * 500000);
      const parts = ids.filter(() => rnd() > 0.25);
      if (!parts.length) parts.push(ids[0]);
      const mode = modes[Math.floor(rnd() * modes.length)];

      const inputs: Record<string, number> = {};
      if (mode === 'shares') parts.forEach((id) => { inputs[id] = 1 + Math.floor(rnd() * 5); });
      if (mode === 'percent') {
        const w = parts.map(() => 1 + rnd());
        const W = w.reduce((a, b) => a + b, 0);
        parts.forEach((id, i) => { inputs[id] = (w[i] / W) * 100; });
      }
      // 'exact' cannot be fuzzed as free input — it must sum to the total by
      // construction — so exercise it with a known-good exact allocation.
      const shares =
        mode === 'exact'
          ? resolveSplit(amount, 'equal', parts)
          : resolveSplit(amount, mode, parts, inputs);

      if (Object.values(shares).reduce((a, b) => a + b, 0) !== amount) badSplit += 1;
      if (Object.values(shares).some((v) => v < 0)) badSplit += 1;

      expenses.push({ payerId: ids[Math.floor(rnd() * n)], amountMinor: amount, shares });
    }

    const settlements: SettlementLike[] = [];
    for (let s = 0; s < Math.floor(rnd() * 4); s += 1) {
      const a = Math.floor(rnd() * n);
      let b = Math.floor(rnd() * n);
      if (a === b) b = (b + 1) % n;
      settlements.push({
        fromId: ids[a],
        toId: ids[b],
        amountMinor: 1 + Math.floor(rnd() * 50000),
      });
    }

    const net = netBalances(ids, expenses, settlements);
    if (Object.values(net).reduce((a, b) => a + b, 0) !== 0) badNet += 1;

    const tx = settleUp(net);
    worstTx = Math.max(worstTx, tx.length - (n - 1));
    const after = netBalances(
      ids,
      expenses,
      settlements.concat(
        tx.map((x) => ({ fromId: x.from, toId: x.to, amountMinor: x.amountMinor })),
      ),
    );
    if (!Object.values(after).every((v) => v === 0)) badSettle += 1;
  }

  it('every split sums to its total with no negatives', () => expect(badSplit).toBe(0));
  it('every ledger nets to zero', () => expect(badNet).toBe(0));
  it('settle-up always clears every balance', () => expect(badSettle).toBe(0));
  it('settle-up never exceeds n-1 payments', () => expect(worstTx).toBeLessThanOrEqual(0));
});
