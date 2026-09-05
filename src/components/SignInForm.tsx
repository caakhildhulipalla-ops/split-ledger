'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Method = 'google' | 'email' | 'phone';

export default function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [method, setMethod] = useState<Method>('google');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [sent, setSent] = useState('');

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

  const signInGoogle = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo() },
      });
      if (error) throw error;
    });

  const sendMagicLink = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      setSent(`Check ${email.trim()} — the link signs you straight in.`);
    });

  const sendSms = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) throw error;
      setOtpSent(true);
      setSent(`Code sent to ${phone.trim()}.`);
    });

  const verifySms = () =>
    withBusy(async () => {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: 'sms',
      });
      if (error) throw error;
      router.push(next);
      router.refresh();
    });

  return (
    <div className="sheet">
      <div className="sheet-head">
        <h2>Sign in</h2>
        <span className="sub">or create an account — it is the same step</span>
      </div>

      <div className="sheet-body">
        <div className="seg" style={{ marginBottom: 18, width: '100%' }}>
          {(
            [
              ['google', 'Google'],
              ['email', 'Email'],
              ['phone', 'Phone'],
            ] as [Method, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              style={{ flex: '1 1 0' }}
              aria-pressed={method === k}
              onClick={() => {
                setMethod(k);
                setError('');
                setSent('');
                setOtpSent(false);
              }}
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

        {method === 'email' && (
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

        {method === 'phone' && !otpSent && (
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

        {method === 'phone' && otpSent && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              verifySms();
            }}
          >
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="otp">Six-digit code</label>
              <input
                id="otp"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="······"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy || otp.length < 4}>
              {busy ? 'Checking…' : 'Verify and sign in'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOtpSent(false);
                setOtp('');
                setSent('');
              }}
            >
              Use a different number
            </button>
          </form>
        )}

        {sent && !error && <p className="hint good">{sent}</p>}
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
