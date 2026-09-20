# Layer Farm MIS

Every day, a layer farmer needs four numbers: how many eggs were produced, how
much feed was used, how much feed is left, and whether the day made or lost
money. This app answers those four on a phone, in a shed, with no signal.

Built for medium layer farms in South India producing 5,000 to 5,00,000 eggs a
day — one shed and one person, or three farms with a supervisor on each shed.

**Next.js 15 (static export) · Capacitor 8 → Android · IndexedDB, local-first ·
Supabase (Postgres + row-level security) when you want it · 201 tests**

---

## What is built, and verified

| | |
|---|---|
| **Costing engine** | 132 tests over the arithmetic: weighted-average feed cost, mixing batches, expense allocation, pullet capitalisation, daily P&L. Includes 20,000 fuzzed allocations proving no rupee is ever lost, and 2,000 fuzzed stock histories proving value is conserved. |
| **Offline data layer** | 33 tests over conflict resolution, edit windows and the sync queue — an owner's edit beats a supervisor's, a failed upload never blocks the ones behind it. |
| **Reporting** | 36 tests building a farm from records and checking the figures tie out end to end, including a generated 120-day two-farm demo. |
| **Build** | 11 static routes, ~130 kB first load. `npm run build` |
| **Both themes** | Light and dark, and the dark theme is the one that works at 5 a.m. |

```bash
npm install
npm test          # 201 tests
npm run build     # static export to out/
npm run dev       # http://localhost:3000
```

---

## The four numbers

The dashboard opens on these, in this order, before anything else:

- **Feed consumption** — kg today, and grams per bird per day
- **Egg production %** — hen-day, with a seven-day trend
- **Feed inventory** — kg at the farm and in the sheds, and days of cover
- **Per-day P&L** — revenue less every cost, with cost per egg

Each drills down from all farms, to a farm, to a shed, to a flock.

---

## How the money works

Three decisions drive everything else, and all three are visible in the code.

**Revenue is recognised on production, not on dispatch.** A trader's lorry comes
on Tuesday and Friday; booking revenue on those days would make Monday look like
a disaster and Tuesday like a windfall, for reasons that have nothing to do with
how the farm ran. Eggs are valued the day they are laid, at that day's NECC zone
rate plus the farm's own adjustment. The Money screen shows production-valued
against actually-invoiced side by side, so a rate card that has drifted cannot
hide. (`src/domain/costing.ts`)

**Rearing cost is capitalised, not expensed.** A flock reared from chick eats for
four months before laying anything. Expensing that as it happens shows
catastrophic losses every rearing week and fictitious profits afterwards, and
teaches the owner nothing. Instead it becomes one pullet cost, released a day at
a time across the laying life, net of expected spent-hen value, and trued up when
the flock closes. (`src/domain/pullet.ts`)

**Every rupee lands on a flock.** An electricity bill covering 1–30 June is not a
30 June cost; it is a thirtieth of a cost on each of thirty days, and on each of
those days it belongs to the sheds in proportion to the birds actually alive in
them. A flock placed mid-month carries only the half it was there for.
(`src/domain/allocation.ts`)

All three lean on one function, `distribute`, which splits an amount by weights
*exactly* — the parts always sum back to the whole, for every input including
negative amounts and all-zero weights. An owner who adds thirty daily P&Ls gets
the month's expenses to the paisa. It is fuzz-tested over 20,000 random
allocations. (`src/domain/money.ts`)

Money is integer paise throughout. Feed is integer grams. Nothing in this app
touches a floating-point rupee.

---

## Offline first, genuinely

The device database is the source of truth. Every screen works with the radio
off, and the app cold-starts and records the morning collection with no network
at all.

- **Writes go three places**: memory (the screen updates now), IndexedDB (it
  survives the app being killed), and an outbox (it reaches the cloud
  eventually). Only the third needs a network, and nothing waits for it.
- **Conflicts**: an owner's edit beats a supervisor's; otherwise the latest edit
  wins; exact ties break deterministically so every phone in the fleet converges
  rather than ping-ponging. Both versions stay in the audit trail.
- **A failed upload never blocks the queue.** It parks with a growing backoff and
  the queue walks on — a queue that stops at its first failure is a queue that
  loses a week of data because one record upset the server on Monday.
- **Repeat edits collapse.** Correcting the same entry four times before finding
  signal costs one upload, not four.
- **Edit windows**: a supervisor may change an entry on the day it was made, plus
  24 hours from when it was actually created — so an entry made at 23:50 offline
  and synced at 00:05 is still theirs to fix. Owners edit anything, any time.
- **One entry per shed, per date, per session**, enforced both in the app and by
  a unique index in Postgres, because two phones can be offline at once.

---

## Roles

| Role | Does | Sees |
|---|---|---|
| **Owner** | Everything: masters, purchases, rates, expenses, corrections at any time | All farms, all figures |
| **Manager** | Purchases, mixing, dispatch, expenses, stock counts | Assigned farms, with money |
| **Supervisor** | Daily shed entry, feed issue, vaccination, gate log | Own sheds only — **no prices, no P&L** |

Sign-in is a PIN on the device: a shed supervisor does not carry an email
address to work, and SMS OTP costs money per message. PINs are stored as
PBKDF2-SHA-256 over a per-user salt, never as the PIN itself.

---

## The twelve entry screens

Shed daily entry · feed purchase · feed mixing batch · feed issue to shed ·
stock adjustment · medicine and vaccine issue · vaccination done · egg dispatch ·
gate vehicle log · expense · other income · flock event.

The daily entry is the one used twice a day, so it opens with everything already
decided that can be — the supervisor's shed, today's date, the session not yet
recorded — leaving six numbers. It computes hen-day % and feed per bird live as
you type: someone who has keyed 85,000 eggs instead of 8,500 sees 850% before
they save, which catches more than any amount of validation afterwards.

---

## Try it without typing anything

On first run, choose **Create it with a demo farm**. You get a generated
two-farm business with four months of history: four flocks at different ages
(including one still rearing, which lays nothing and still costs money), weekly
raw-material purchases, mixing batches, feed issues, twice-weekly dispatches,
monthly expenses, and a wandering NECC rate. The dashboard, the trends and the
flock P&L all have something real to show. Clear it later from **More**.

The demo is deterministic — the same on every phone — which is also how it gets
tested.

---

## Running on a phone

The APK is built in the cloud; nobody needs Android Studio.

1. Push to `main`, or run the **Android build** workflow by hand.
2. Download the `layer-farm-mis-debug-apk` artifact from the run.
3. Copy it to an Android phone and install it (allow "install unknown apps").

For a Play Store bundle, add four repository secrets —
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` — and run the workflow with **release** ticked. Without
them the release build is simply unsigned, which is what a fork should produce.

Locally, with Android Studio installed:

```bash
npm run android:apk    # builds android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open   # opens the project in Android Studio
```

---

## Adding the cloud (optional)

The app is complete without it. Add Supabase when you want several phones on one
farm to share data.

1. Create a project at supabase.com — pick `ap-south-1` (Mumbai) for India.
2. **SQL Editor** → run `supabase/migrations/0001_schema.sql`, then
   `0002_rls.sql`.
3. **Project Settings → API** → copy the Project URL and the `anon` key into
   `.env` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The `anon` key is meant to be public; it grants nothing on its own, because
row-level security decides what each signed-in user can reach. **Never** put the
`service_role` key in this app — it bypasses every policy.

Twenty-four entity types share one `records` table discriminated by `type`, with
the entity's own fields in a JSONB payload. Twenty-four tables would mean
twenty-four sets of security policies to keep in step, and those policies are the
only thing standing between one farm's books and another's — so they are written
once and reviewed once. The conflict rule is implemented a second time as a
Postgres trigger, because without it the last device to sync would always win
regardless of who outranked whom.

---

## Layout

```
src/domain/     Pure arithmetic, no React, no storage. Every file has tests.
  money.ts        Paise, and exact distribution by weights
  units.ts        bag ⇄ kg, tray ⇄ eggs, without floating point
  production.ts   Hen-day %, mortality %, feed per bird, feed per dozen
  stock.ts        Weighted-average value pools, per item, per location
  mixing.ts       Raw materials in, finished feed out, at cost
  allocation.ts   Expenses over days, then across flocks by live birds
  pullet.ts       Rearing capitalisation and daily release
  costing.ts      Rates, revenue, the four cost parts, daily P&L
  alerts.ts       The five triggers and their thresholds
  dates.ts        Farm days, immune to timezones and clock changes

src/lib/        Storage, sync and the bridge to the domain
  types.ts        The 24 entity types
  db.ts           IndexedDB, with an in-memory fallback
  store.tsx       The reactive mirror every screen reads
  merge.ts        Conflict resolution and edit windows
  outbox.ts       The sync queue
  sync.ts         Supabase transport, inert when unconfigured
  report.ts       Records → ledger → the dashboard's figures
  seed.ts         Master data defaults, and the demo farm

src/app/        The screens
supabase/       Schema and row-level security
```

---

## What is deliberately not here

Out of scope for v1, by decision: Tally/WhatsApp/SMS/UPI integrations, weighing
scales and IoT sensors, customer ledgers and receivables, GST invoicing and
e-way bills, payroll and depreciation, full double-entry books, treatment and
disease logs, batch and expiry tracking, breed-standard benchmarking, and
per-cage-row entry. The data model leaves room for them; no screens are built.

Ration formulation is not included either — feed is tracked for purchase,
consumption and stock, not formulated.
