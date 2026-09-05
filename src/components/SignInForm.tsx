'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isNative } from '@/lib/native';

type Method = 'email' | 'google' | 'phone';

export default function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [method, setMethod] = useState<Method>('email');
  const [native, setNative] = useState(false);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false); // an OTP has been sent, show the code field
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');

  useEffect(() => setNative(isNative()), []);

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

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
    setCodeSent(false);
  };

  const signInGoogle = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo() },
      });
      if (error) throw error;
    });

  const sendEmailCode = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setCodeSent(true);
      setNotice(`We sent a 6-digit code to ${email.trim()}.`);
    });

  const sendSms = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) throw error;
      setCodeSent(true);
      setNotice(`We sent a code to ${phone.trim()}.`);
    });

  const verify = () =>
    withBusy(async () => {
      const { error } =
        method === 'phone'
          ? await supabase.auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: 'sms' })
          : await supabase.auth.verifyOtp({
              email: email.trim(),
              token: code.trim(),
              type: 'email',
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

        {method === 'email' && !codeSent && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              sendEmailCode();
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
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            <p className="mini">No password. The code lasts an hour and signs you in once.</p>
          </form>
        )}

        {method === 'phone' && !codeSent && (
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

        {(method === 'email' || method === 'phone') && codeSent && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
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
                setCodeSent(false);
                setCode('');
                setNotice('');
              }}
            >
              {method === 'phone' ? 'Use a different number' : 'Use a different email'}
            </button>
          </form>
        )}

        {notice && !error && <p className="hint good">{notice}</p>}
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
