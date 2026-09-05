# Split Ledger

A shared expense ledger for groups — split bills any way they actually
happened, settle up in the fewest payments, and see where the money goes.

Next.js 15 (App Router) · Supabase (Postgres + Auth + row-level security) ·
installable PWA · packaged for Google Play as a Trusted Web Activity.

---

## What is already done, and verified

| | |
|---|---|
| **Money core** | 19 tests green, including 4,000 fuzzed random ledgers. Every split sums exactly to its total, every ledger nets to zero, settle-up always clears in ≤ n−1 payments. `npm test` |
| **Database security** | 15 checks green against a real Postgres. A signed-in stranger cannot read your ledger even knowing its ID, cannot write to it, cannot add themselves. `npm run test:db` |
| **Production build** | Compiles clean, 15 routes, ~103 kB shared JS. `npm run build` |
| **Both themes** | Light and dark, verified rendering |

Two real bugs were caught by those suites while building and are fixed:
a deferred constraint trigger comparing a stale row snapshot (would have
broken **every** expense edit that changed an amount), and a test that could
not observe a deferred constraint at all.

---

## The five things only you can do

Everything below needs your accounts, your money, or your legal identity.
Work through them in order; each takes a few minutes except the last.

### 1. Supabase project — 10 minutes

1. Create a project at supabase.com. Pick the region closest to your users
   (`ap-south-1`, Mumbai, if that is India).
2. **SQL Editor** → run these three files in order:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_rpc.sql`
3. **Project Settings → API** → copy the Project URL and the `anon` key.

> The `anon` key is meant to be public. It grants nothing on its own —
> row-level security decides what each signed-in user can reach, which is what
> the 15 checks above prove. **Never** put the `service_role` key in this app;
> it bypasses every policy.

### 2. Sign-in methods — 15 minutes

In **Authentication → Providers**:

- **Email** — on by default. Set *Confirm email* on. Magic links work
  immediately, though Supabase's built-in mailer is rate-limited to a handful
  per hour; add your own SMTP (Resend, Postmark, SES) before you have real
  users.
- **Google** — create an OAuth client at
  console.cloud.google.com → APIs & Services → Credentials → OAuth client ID →
  Web application. Authorised redirect URI:
  `https://<your-project>.supabase.co/auth/v1/callback`. Paste the client ID
  and secret into Supabase.
- **Phone** — needs an SMS provider (Twilio, MessageBird, Vonage). This one
  costs money per message and is the only part of the stack that does. If you
  want to launch cheaply, leave phone off at first: Google and email cover
  nearly everyone, and the sign-in screen adapts on its own.

Then in **Authentication → URL Configuration**, set *Site URL* to your
deployment and add `https://<your-domain>/auth/callback` to *Redirect URLs*.

### 3. Deploy — 5 minutes

```bash
git init && git add -A && git commit -m "Split Ledger"
# push to GitHub, then import the repo at vercel.com
```

Environment variables in Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_SITE_URL=https://<your-domain>
```

At this point **the app is publicly available**. Anyone can sign up, create a
group, invite people, and install it to their home screen. Everything after
this is only about getting a Play listing.

### 4. Fill in the legal pages — 30 minutes

`src/app/privacy/page.tsx` and `src/app/terms/page.tsx` are drafts written to
match what this code actually does, with `[BRACKETED]` gaps for your details.
Fill them in. Have a lawyer read them if real users are coming — you become
the data controller for other people's financial records the moment you
launch, and India's DPDP Act applies if you are here.

Play **requires** a reachable privacy policy URL and rejects listings whose
Data safety answers disagree with it. `play/store-listing.md` has the exact
answers matching this codebase.

### 5. Google Play — $25, then a fortnight of waiting

```bash
npm i -g @bubblewrap/cli
# edit play/twa-manifest.json: replace every REPLACE_ME with your domain
bubblewrap init --manifest ./play/twa-manifest.json
bubblewrap build          # produces app-release-bundle.aab + android.keystore
```

Back that keystore up somewhere you will still have in five years. Lose it and
you can never update the app under the same listing.

Then:

1. Play Console → create app → upload the `.aab` to a **closed test** track.
2. Setup → App integrity → copy the **SHA-256 of the app signing key**.
3. Add it to Vercel as `ANDROID_CERT_FINGERPRINT` (and
   `ANDROID_PACKAGE_NAME` if you changed it), then redeploy. This is what
   removes the browser address bar — skip it and the app looks half-finished.
   Verify with:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<your-domain>&relation=delegate_permission/common.handle_all_urls`
4. Store listing → paste from `play/store-listing.md`, upload
   `public/icons/play-icon-512.png` and `play-feature-1024x500.png`.
5. Screenshots → `node scripts/screenshots.mjs --url https://<your-domain>`
6. Complete the content rating and Data safety forms.

**Budget the time honestly:** a personal Play developer account must run a
closed test with **at least 12 testers for 14 continuous days** before it can
publish to production. Start that the day you upload your first build; it is
by far the longest part.

---

## Running it locally

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and anon key
npm run dev
```

| Command | |
|---|---|
| `npm test` | money core, including the fuzz suite |
| `npm run test:db` | schema + RLS against a throwaway local Postgres |
| `npm run build` | production build |
| `npm run icons` | regenerate every icon and the Play feature graphic |

---

## How it is put together

```
src/lib/money.ts          the arithmetic. No React, no Supabase, no Next.
src/lib/ledger.ts         loading a group; posting due recurring expenses
src/app/actions.ts        every mutation, server-side
supabase/migrations/      schema, RLS, and the save_expense function
scripts/rls-test.sql      the security suite
```

### Three decisions worth understanding before you change anything

**1. Members are not users.** A `group_members` row is a named slot in a
ledger that *may* be linked to an account. That is what lets you add "Rohan"
tonight and have him sign up next week and inherit three months of history
instead of starting at zero beside a ghost of himself. Expenses point at
member slots, never at users.

**2. The database enforces the zero-sum invariant.** Shares must sum to their
expense, checked by a deferred constraint trigger; members are pinned to their
group by composite foreign key; a member who appears in any expense cannot be
deleted. A client bug cannot corrupt balances, because the client is not
trusted to get it right.

**3. Shares are computed on the server.** `saveExpense` recomputes the split
from the mode and the raw inputs and ignores anything the client claims the
shares are. A tampered request cannot post a split that does not reconcile —
and the database would reject it even if the action let it through.

### Where the security actually lives

Every query runs as the signed-in user through the anon key, so row-level
security is the only thing deciding what is visible — there is no server-side
code path holding a privileged key that could leak across groups by mistake.
`is_group_member()` is a `SECURITY DEFINER` function specifically to avoid
infinite recursion in the `group_members` policy, which is the classic way
Supabase schemas break. `save_expense` is deliberately `SECURITY INVOKER`; the
test suite asserts that a stranger calling it directly is refused.

---

## What is deliberately not here

- **Offline entry.** The service worker caches static assets and an offline
  page, never balances. A stale balance is worse than no balance when someone
  is about to pay it.
- **Multiple payers on one expense.** One payer covers the overwhelming
  majority of cases; the schema would take a `expense_payers` table if you
  want it.
- **Push notifications.** Not needed for a TWA, and adding them means adding
  FCM.
- **iOS.** Apple's guideline 4.2 rejects thin web wrappers. An iOS build needs
  genuine native behaviour, which is a separate piece of work. The PWA still
  installs to an iPhone home screen from Safari today.
