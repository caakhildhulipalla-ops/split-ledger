'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isNative } from '@/lib/native';

type Method = 'email' | 'google' | 'phone';

const NATIVE_CALLBACK = 'app.splitledger://auth/callback';

export default function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [method, setMethod] = useState<Method>('email');
  const [native, setNative] = useState(false);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');

  useEffect(() => setNative(isNative()), []);

  const callbackUrl = () => {
    const q = `?next=${encodeURIComponent(next)}`;
    return isNative()
      ? `${NATIVE_CALLBACK}${q}`
      : `${window.location.origin}/auth/callback${q}`;
  };

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const reset = (m: Method) => {
    setMethod(m);
    setError('');
    setNotice('');
    setCode('');
    setPhoneCodeSent(false);
    setLinkSent(false);
  };

  const signInGoogle = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
    });

  const sendMagicLink = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
      });
      if (error) throw error;
      setLinkSent(true);
      setNotice(`Check ${email.trim()} and tap the sign-in link.`);
    });

  const sendSms = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) throw error;
      setPhoneCodeSent(true);
      setNotice(`We sent a code to ${phone.trim()}.`);
    });

  const verifySms = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: code.trim(),
        type: 'sms',
      });
      if (error) throw error;
      router.push(next);
      router.refresh();
    });

  const tabs: [Method, string][] = native
    ? [
        ['email', 'Email'],
        ['phone', 'Phone'],
      ]
    : [
        ['email', 'Email'],
        ['google', 'Google'],
        ['phone', 'Phone'],
      ];

  return (
    <div className="sheet">
      <div className="sheet-head">
        <h2>Sign in</h2>
        <span className="sub">or create an account — it is the same step</span>
      </div>

      <div className="sheet-body">
        <div className="seg" style={{ marginBottom: 18, width: '100%' }}>
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              style={{ flex: '1 1 0' }}
              aria-pressed={method === k}
              onClick={() => reset(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {method === 'google' && (
          <div className="stack">
            <p className="mini" style={{ marginTop: 0 }}>
              One tap, nothing to remember, and no password for anyone to lose.
            </p>
            <button className="btn btn-primary btn-lg" onClick={signInGoogle} disabled={busy}>
              {busy ? 'Opening Google…' : 'Continue with Google'}
            </button>
          </div>
        )}

        {method === 'email' && !linkSent && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              sendMagicLink();
            }}
          >
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            <p className="mini">No password. The link lasts an hour and signs you in once.</p>
          </form>
        )}

        {method === 'email' && linkSent && (
          <div className="stack">
            <p className="hint good" style={{ marginTop: 0 }}>
              {notice}
            </p>
            <p className="mini">
              Open it on this {native ? 'phone' : 'device'} — it brings you straight back
              here, signed in.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setLinkSent(false);
                setNotice('');
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        {method === 'phone' && !phoneCodeSent && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              sendSms();
            }}
          >
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="phone">Mobile number</label>
              <input
                id="phone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy || !phone.trim()}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
            <p className="mini">Include the country code, like +91 for India.</p>
          </form>
        )}

        {method === 'phone' && phoneCodeSent && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              verifySms();
            }}
          >
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="code">Six-digit code</label>
              <input
                id="code"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="······"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Verify and sign in'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPhoneCodeSent(false);
                setCode('');
                setNotice('');
              }}
            >
              Use a different number
            </button>
          </form>
        )}

        {notice && !error && !linkSent && <p className="hint good">{notice}</p>}
        {error && <p className="hint bad">{error}</p>}
      </div>

      <div className="recon">
        <span className="mini">
          By signing in you agree to the <a href="/terms">terms</a> and{' '}
          <a href="/privacy">privacy policy</a>.
        </span>
      </div>
    </div>
  );
}
