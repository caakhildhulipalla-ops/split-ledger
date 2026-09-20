# Decisions, and where they live in the code

The v1 requirements left nineteen decisions open, each with an assumed default.
This is what was built for each, and the file to change if you want it
different.

## Answered by the requirements

| # | Decision | Built as | Where |
|---|---|---|---|
| 1 | Who enters purchases and expenses | Three roles: Owner, Manager, Supervisor. Manager has per-farm access to purchases, mixing, dispatch and expenses. | `src/lib/types.ts`, `src/lib/hooks.ts` |
| 2 | Supervisor across several sheds; seeing prices | A supervisor may hold several sheds. Prices and P&L are hidden — the Money tab is not in their navigation, and the flock report omits cost. | `src/components/Nav.tsx`, `seesMoney()` |
| 3 | How long a supervisor can edit | The day the entry is *for*, plus 24 hours from creation. Owners any time. | `canEdit()` in `src/lib/merge.ts` |
| 4 | Where eggs are graded | At the shed, at collection — the daily entry takes both grades. | `src/app/entry/page.tsx` |
| 5 | Broken and cracked eggs | A separate count beside the two grades. Counts towards hen-day % (the bird laid it), earns nothing, never enters sellable stock. | `EggCount` in `src/domain/production.ts` |
| 6 | Pricing and transit breakage | Rate per 100 per grade, farm-gate adjustment against the NECC zone. Breakage is recorded, not deducted. | `RateCard` in `src/domain/costing.ts` |
| 7 | Rearing cost | Capitalised into pullet cost, released daily across the laying life net of expected spent-hen value, trued up at closure. | `src/domain/pullet.ts` |
| 8 | Basis of daily revenue | Production valued at that day's rate; the difference against invoiced dispatches is reported as a true-up rather than hidden. | `salesTrueUp()`, Money → P&L |
| 9 | Overheads with no payroll | Each expense spread evenly over the days it covers, then allocated to flocks by live-bird share that day. | `src/domain/allocation.ts` |
| 10 | Cost of in-house feed | Weighted-average cost per kg of raw materials; a batch moves exactly that value into the finished feed. | `src/domain/mixing.ts` |
| 11 | Medicines and vaccines | Simple issue to shed or flock. No diagnosis fields. | `medicine-issue` |
| 12 | FCR with two weight classes | Feed per dozen eggs, shown instead of FCR. | `feedPerDozenKg()` |
| 13 | All-farms total | A farm switcher with "All farms" first; per-farm drill-down below. | `src/app/dashboard/page.tsx` |
| 14 | Alert channel | Push only. Implemented as Capacitor local notifications, so alerts work offline and cost nothing. | `src/lib/native.ts` |
| 15 | Source of NECC rates | A `rate` record per zone per day, entered by the owner or (later) published centrally in `zone_rates`. An owner can override per farm; the most recent rate on or before a day applies. | `rateFor()` in `src/lib/report.ts` |
| 16 | Customer onboarding | Guided first-run setup, with an optional generated demo farm. Flocks accept an opening state (as-of date, live birds, cost to date). | `src/app/signin/page.tsx`, `FlockP.opening` |
| 17 | Vehicle log | A separate gate log: vehicle, driver, purpose, in, out, disinfected. | Flocks → Gate log |
| 18 | Entry synced after midnight | The edit window runs from the entry's date *and* 24 hours from creation, so a late-synced entry stays editable. | `canEdit()` |
| 19 | Supervisor replaces a phone | Entries are tied to the shed, never the device. The owner re-links by assigning the shed to the new sign-in. | `ShedP.supervisorIds` |

## Judgement calls made while building

These were not in the list, but had to be decided.

**Feed cost is carried per location, not per farm.** Feed bought sits at the
farm; feed issued to a shed moves there at the farm's average cost; the feed a
flock eats is drawn from the shed's pool. Without the second pool, a shed issued
expensive feed in March and cheap feed in April would price March's consumption
at April's rate.

**Rates are held per 1,000 base units, not per unit.** Feed costs about 2.8 paise
per gram. A rate rounded to whole paise per gram would price a tonne of feed ₹200
wrong — larger than the margin on the eggs it produces. This was caught by a test
before it reached a screen.

**Ratios are recomputed from totals, never averaged.** A farm's hen-day % is the
farm's eggs over the farm's birds, not the mean of its sheds' percentages. The
two differ whenever sheds are different sizes.

**A missing denominator gives `null`, not zero.** An empty shed has no hen-day
percentage; it does not have one of zero. Showing 0% would trip the
production-drop alert every morning on a shed awaiting placement.

**Over-issue is allowed and flagged.** Recording more feed eaten than the records
show in stock is permitted — a supervisor's count is evidence, and an app that
refuses it teaches people to write the wrong number. The shortfall is reported
instead.

**Physical counts never invent profit.** A stock count moves quantity and moves
value with it at the pool's own average, so recounting cannot create a gain.
