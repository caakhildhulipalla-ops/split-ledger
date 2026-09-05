# Building & shipping the Android app

The app is a static web bundle (`out/`) wrapped by Capacitor (`android/`).
This machine has no Android toolchain, so builds run in GitHub Actions.

## One-time setup

1. **Create a GitHub repo** (private is fine) and push:
   ```bash
   git remote add origin git@github.com:<you>/split-ledger.git
   git push -u origin main
   ```

2. **Add build-time web env as repo secrets**
   (Settings → Secrets and variables → Actions → New repository secret):
   | Secret | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://gjwoctzzdzcjlpgegbfn.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
   | `NEXT_PUBLIC_SITE_URL` | your web deployment URL (see below) |

3. **Create the upload keystore** — Actions tab → "Create upload keystore (one time)"
   → Run workflow. When it finishes, open the run summary, then:
   - download the `upload-keystore` artifact and store `upload-keystore.jks`
     somewhere permanent (password manager / offline backup)
   - add the four `ANDROID_*` secrets it lists
   - delete that workflow run (the passwords are in its summary)

## Every build

- **Debug APK** (sideload onto a phone to test): push to `main`, or run
  "Android build" manually. Download the `split-expense-debug-apk` artifact.
- **Release AAB** (upload to Play): run "Android build" manually with
  **release = true**. Download `split-expense-release-aab`.

`versionName` is `1.0.<run number>` and `versionCode` is the run number, so
every build is monotonic and Play-acceptable.

## Play Console

- Create the app, enable **Play App Signing** (default).
- First upload goes to a **Closed testing** track. A personal developer
  account must run closed testing with **≥12 testers for 14 continuous days**
  before it can promote to production — start this the day you have a build.
- Store listing copy: `play/store-listing.md`. Icons: `public/icons/`.
- Data safety form must match `src/app/privacy/page.tsx`.

## Web deployment (needed for invite links)

Invite links point at `NEXT_PUBLIC_SITE_URL`. Even though the product is the
Android app, that URL must serve the web build so links open somewhere. Deploy
`out/` to any static host (Vercel, Netlify, Cloudflare Pages):

```bash
npm run build   # produces out/
```

Set the same three `NEXT_PUBLIC_*` values there, and add
`https://<that-domain>/**` to Supabase → Authentication → URL Configuration →
Redirect URLs.
