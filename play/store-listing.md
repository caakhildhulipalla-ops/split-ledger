# Google Play — store listing

Copy for each Play Console field, written to its character limit. Character
counts are given so you can edit without overrunning.

---

## App name (max 30)

```
Split Ledger
```
*(12 characters)*

## Short description (max 80)

```
Share expenses with flatmates and friends. Settle up in the fewest payments.
```
*(75 characters)*

## Full description (max 4000)

```
Split Ledger keeps the shared money straight — rent, groceries, the trip
everyone still owes for — and tells you the shortest way to square up.

SPLIT IT HOWEVER IT ACTUALLY HAPPENED
Not everything divides evenly. Split equally, by exact amounts, by
percentage, or by shares when one person took the bigger room or skipped the
meal. The split has to account for every last paisa before it will save, so
totals never quietly drift.

SETTLE UP IN THE FEWEST PAYMENTS
Six tangled IOUs usually collapse into two or three transfers. Split Ledger
works out the minimum set of payments that clears everyone, and shows you the
direct debts instead if you would rather not route your money through someone
else.

ADD PEOPLE BEFORE THEY JOIN
Add a flatmate by name tonight and send them an invite whenever. When they
sign up they inherit the history already recorded against their name, rather
than arriving with a blank balance next to a ghost of themselves.

RENT AND BILLS POST THEMSELVES
Set rent, wifi, or a subscription once and it appears every month on the day
you choose, split the way you set it.

SEE WHERE THE MONEY GOES
A real dashboard, not a number on a card: who owes whom, spend by category,
month-by-month totals, the per-person average, your largest expenses, and who
is quietly fronting the group's cash flow. Every chart has a table view.

NOTHING GOES MISSING
Every change is recorded — who added, edited or deleted what, and when.
Deleted expenses go to a recovery list instead of vanishing, and a
reconciliation line proves the ledger balances to zero.

WORKS FOR
Flatmates and house shares · trips and holidays · couples · families ·
regular groups of friends · anyone tired of a notes app and mental arithmetic

MULTIPLE CURRENCIES
Rupees, dollars, euros, pounds, dirhams and more, with proper local
formatting — including lakh and crore grouping for INR.

PRIVATE BY DESIGN
Your ledger is visible to the members of your group and nobody else. Access is
enforced in the database itself, row by row. No ads, no trackers, and we never
sell your data.

Split Ledger records what is owed. It does not move money, and it is not
connected to any bank or payment service.
```
*(≈1,760 characters)*

---

## Graphics

| Asset | Requirement | File |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `public/icons/play-icon-512.png` |
| Feature graphic | 1024×500 PNG | `public/icons/play-feature-1024x500.png` |
| Phone screenshots | 2–8, 9:16, min 320px | run `node scripts/screenshots.mjs` after deploying |

Play rejects a feature graphic that is just a shrunken screenshot, and crops
its edges on some layouts — the supplied one keeps all text well inside.

## Categorisation

- **App category:** Finance
- **Tags:** Budgeting, Expense tracker, Personal finance
- **Contact email:** *(yours)*
- **Website:** your deployment URL
- **Privacy policy:** `https://<your-domain>/privacy`

## Content rating questionnaire

Answer honestly; for this app the answers are all "no": no violence, no
sexual content, no profanity, no controlled substances, no gambling, no user-
generated content shared publicly (group content is private to invited
members), no location sharing. Expect a **PEGI 3 / Everyone** rating.

## Data safety form

This must agree with `/privacy` or Play will reject it. For this codebase:

**Data collected and linked to the user**
| Type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Name | Yes | No | App functionality | No |
| Email address | Yes (if signing in by email/Google) | No | App functionality, Account management | No |
| Phone number | Yes (if signing in by phone) | No | App functionality, Account management | No |
| User-generated content (expense descriptions and notes) | Yes | No | App functionality | No |
| Other financial info (amounts you enter) | Yes | No | App functionality | No |

**Not collected:** location, contacts, photos, files, calendar, health,
messages, payment info, purchase history, browsing history, device IDs for
advertising, crash logs, analytics.

**Security practices**
- Data is encrypted in transit: **Yes**
- Users can request that data be deleted: **Yes** (email route, documented in
  `/privacy`)
- Committed to the Play Families Policy: not applicable (not aimed at children)
- Independent security review: **No**

> Answer "Payment info: No" deliberately. Split Ledger records that a payment
> happened between two people; it never handles card, bank or UPI credentials
> and touches no payment network. Claiming otherwise would fail review.

## Before you submit — the things that actually get apps rejected

1. **Privacy policy URL must load** with no sign-in and no redirect. Test it
   in a private window.
2. **Data safety must match the privacy policy.** Reviewers do compare them.
3. **Digital Asset Links must verify** or your app opens with a browser
   address bar. Check with
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://YOUR-DOMAIN&relation=delegate_permission/common.handle_all_urls`
4. **Financial-app scrutiny.** Play applies extra checks to the Finance
   category. Split Ledger is a record-keeping tool, not a lending or payment
   app — say so plainly if asked. Do not use words like "loan", "credit" or
   "instant money" anywhere in the listing.
5. **A closed test with at least 12 testers for 14 days** is required before a
   personal developer account can go to production. Start that clock early —
   it is the longest pole in this whole process.
