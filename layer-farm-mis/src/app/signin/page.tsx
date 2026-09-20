'use client';

/**
 * Sign in, and the very first run.
 *
 * Two things shape this screen. A shed supervisor does not carry an email
 * address to work, and SMS OTP costs money per message — so the owner creates
 * the accounts and everyone signs in with a PIN on the device. And a farmer
 * evaluating the app at 9 p.m. should be able to see what it does without
 * typing in four months of history, so the demo farm is one tap away.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Field, Icon, TextInput } from '@/components/ui';
import { useData } from '@/lib/store';
import { hashPin, isValidPin, newSalt, verifyPin } from '@/lib/pin';
import { newId } from '@/lib/id';
import { demoFarm, masterData, seedRow, type SeedContext } from '@/lib/seed';
import { ROLE_LABEL, type Row, type User } from '@/lib/types';
import { tap } from '@/lib/native';

type Stage = 'loading' | 'setup' | 'pick' | 'pin';

export default function SignInPage() {
  const { ready, session, list, importRows, signIn } = useData();
  const router = useRouter();

  const users = list('user').filter((u) => u.active);
  const tenants = list('tenant');

  const [stage, setStage] = useState<Stage>('loading');
  const [picked, setPicked] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) { router.replace('/'); return; }
    if (!ready) return;
    setStage(tenants.length === 0 || users.length === 0 ? 'setup' : 'pick');
  }, [ready, session, tenants.length, users.length, router]);

  /* ------------------------------------------------------------- pin in */

  const submitPin = async (value: string) => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const ok = await verifyPin(value, picked.pinSalt, picked.pinHash);
    setBusy(false);
    if (!ok) {
      setPin('');
      setError('That PIN does not match. Try again.');
      return;
    }
    void tap();
    await signIn({
      userId: picked.id,
      userName: picked.name,
      tenantId: picked.tenantId,
      role: picked.role,
      shedIds: picked.shedIds,
    });
    router.replace('/');
  };

  const pressDigit = (digit: string) => {
    if (busy) return;
    setError(null);
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    // Four digits is the usual length, so it submits itself. A longer PIN
    // keeps going and is submitted with the button below.
    if (next.length === 4) void submitPin(next);
  };

  if (stage === 'loading') {
    return <div className="auth"><div className="muted small center">Opening…</div></div>;
  }

  if (stage === 'setup') {
    return <Setup onDone={() => setStage('pick')} importRows={importRows} />;
  }

  if (stage === 'pick') {
    return (
      <div className="auth">
        <Brand sub={tenants[0]?.name ?? 'Layer Farm MIS'} />
        <div>
          <div className="section-title">Who is signing in?</div>
          <div className="card list" style={{ padding: 0 }}>
            {users.map((user) => (
              <button
                key={user.id}
                className="item"
                onClick={() => { setPicked(user); setPin(''); setError(null); setStage('pin'); }}
              >
                <div className="grow">
                  <div className="title">{user.name}</div>
                  <div className="meta">{ROLE_LABEL[user.role]}{user.phone ? ` · ${user.phone}` : ''}</div>
                </div>
                <Icon.chevron size={17} className="chev" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <Brand sub={picked ? `${picked.name} · ${ROLE_LABEL[picked.role]}` : ''} />

      <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => <i key={i} data-on={i < pin.length} />)}
      </div>

      {error && <div className="banner bad small">{error}</div>}

      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => pressDigit(d)}>{d}</button>
        ))}
        <button className="wide" onClick={() => { setPicked(null); setPin(''); setStage('pick'); }}>Back</button>
        <button onClick={() => pressDigit('0')}>0</button>
        <button className="wide" onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete">⌫</button>
      </div>

      {pin.length >= 4 && (
        <button className="btn primary block lg" disabled={busy} onClick={() => void submitPin(pin)}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      )}
    </div>
  );
}

function Brand({ sub }: { sub: string }) {
  return (
    <div className="brand">
      <div className="brand-mark"><Icon.egg size={24} /></div>
      <div>
        <h1>Layer Farm MIS</h1>
        <div className="small muted">{sub}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- setup */

function Setup({ onDone, importRows }: {
  onDone: () => void;
  importRows: (rows: readonly Row[], opts?: { queue?: boolean }) => Promise<void>;
}) {
  const [business, setBusiness] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = useMemo(() => {
    if (!business.trim()) return 'Give the business a name.';
    if (!name.trim()) return 'Enter your name.';
    if (!isValidPin(pin)) return 'The PIN must be 4 to 6 digits.';
    if (pin !== confirm) return 'The two PINs do not match.';
    return null;
  }, [business, name, pin, confirm]);

  const build = async (withDemo: boolean) => {
    if (problems) { setError(problems); return; }
    setBusy(true);
    setError(null);
    try {
      const tenantId = newId();
      const userId = newId();
      const ctx: SeedContext = { tenantId, userId, role: 'owner' };

      const salt = newSalt();
      const owner = seedRow(ctx, 'user', {
        name: name.trim(),
        phone: phone.trim(),
        role: 'owner',
        pinHash: await hashPin(pin, salt),
        pinSalt: salt,
        shedIds: [],
        active: true,
      }, userId);

      const rows: Row[] = [...masterData(ctx, business.trim()), owner];
      if (withDemo) rows.push(...demoFarm(ctx));

      await importRows(rows, { queue: true });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish setting up.');
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <Brand sub="Set up your farm business" />

      <Banner tone="info">
        Everything you record stays on this phone and works without a signal.
        Add other phones later; nothing here needs an internet connection.
      </Banner>

      <div className="stack">
        <Field label="Business name" hint="How your farms are known — this is the account.">
          <TextInput value={business} onChange={setBusiness} placeholder="Sri Venkateswara Poultry" autoFocus />
        </Field>
        <Field label="Your name">
          <TextInput value={name} onChange={setName} placeholder="Owner's name" />
        </Field>
        <Field label="Phone" hint="Optional. Used only to tell people apart.">
          <TextInput value={phone} onChange={setPhone} placeholder="98480 00000" type="tel" />
        </Field>
        <div className="grid-2">
          <Field label="Set a PIN">
            <input className="input num" inputMode="numeric" value={pin} maxLength={6}
                   onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </Field>
          <Field label="Confirm PIN">
            <input className="input num" inputMode="numeric" value={confirm} maxLength={6}
                   onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </Field>
        </div>
      </div>

      {error && <div className="banner bad small">{error}</div>}

      <div className="stack-sm">
        <button className="btn primary block lg" disabled={busy} onClick={() => void build(false)}>
          {busy ? 'Setting up…' : 'Create my account'}
        </button>
        <button className="btn block" disabled={busy} onClick={() => void build(true)}>
          Create it with a demo farm
        </button>
        <p className="tiny muted center" style={{ lineHeight: 1.5 }}>
          The demo farm fills the app with four months of a two-farm business so
          you can see every screen working. You can clear it later from More.
        </p>
      </div>
    </div>
  );
}
