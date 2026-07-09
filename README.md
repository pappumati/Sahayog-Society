# Sahyog Society — Setup Guide

A Progressive Web App (installs like an Android app) for running a
cooperative credit society: share collection, compound-interest loans,
Hindi reminders, reports, and year-end profit distribution.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com → **Add project** → name it
   e.g. `sahyog-society`.
2. **Build → Authentication → Get started → Email/Password** → enable it.
3. **Build → Firestore Database → Create database** → start in
   **production mode** (the rules file below handles access control).
4. **Project settings (gear icon) → General → Your apps → Web (</>)** →
   register an app → copy the `firebaseConfig` object shown.

## 2. Plug in your config

Open `js/firebase-config.js` and replace the placeholder values with the
config you copied in step 1.

## 3. Deploy Firestore rules

In the Firebase Console → Firestore Database → **Rules** tab, paste the
contents of `firestore.rules` from this folder and click **Publish**.

## 4. Deploy the app (Netlify, same flow as Gurukrupa Library)

1. Push this folder to a new GitHub repo (e.g. `sahyog-society-app`).
2. On https://app.netlify.com → **Add new site → Import an existing
   project** → pick the repo → no build command needed, publish
   directory is `/` (root) → Deploy.
3. Every commit to the repo auto-deploys, same as your library app.

## 5. First login

- Open the deployed site (or install it: on Android Chrome, menu →
  **Add to Home screen**, which installs it like a native app via the
  manifest + service worker already included).
- The **very first time** the app loads, it silently creates the
  default admin account in Firebase Auth + Firestore.
- Log in with **admin / admin123**.
- Go to **Settings → Change My Password** to set your own password —
  the `admin` login itself is protected in the UI and can't be deleted,
  but you should still change the password immediately after first use.
- Add more staff logins from **Settings → Staff Accounts → + Add**.

## How the numbers work

- **Shares**: ₹200/share. A member's monthly due = shares × ₹200.
- **Loans**: each month a loan is left unpaid, 3% interest is added
  **on the current outstanding balance** (principal + any earlier
  unpaid interest) — true compound interest, exactly like you
  described. Use **Loans → Run** once a month to apply interest to all
  active loans, then record payments against each month's ledger line.
- **Society year**: Oct 1 → Sep 30. All reports and the year-end
  screen are scoped to this tenure automatically.
- **Year-end**: Reports → pick the year to see collections; Year-End
  tab totals interest + penalty income (+ any other income you enter,
  minus expenses), suggests a profit/share, and lets you enter the
  **final approved rate** before generating each member's payout.
- **Reminders**: on/after the 3rd of the month, the Reminders tab
  lists everyone who hasn't paid, with a ready Hindi WhatsApp message
  and a direct WhatsApp link (needs the member's phone number saved).
  I've also added a recurring calendar reminder on your phone for the
  3rd of every month.

## Themes

Settings → Theme gives you 5 palettes (Bahi Khata, Harvest Gold, Peepal
Green, Diya Saffron, and a dark Night Ledger). The pick is remembered
per device.

## What's a placeholder / next steps

- App icons in `/icons` are simple generated placeholders — swap them
  for your own artwork any time (same 192×192 / 512×512 sizes).
- WhatsApp send uses `wa.me` links (opens WhatsApp with the message
  pre-filled) rather than an automated API, same approach as your
  library app's reminder flow — no WhatsApp Business API needed.
- Loan interest currently needs the admin to tap **Run** once a month;
  say the word if you'd like this automated with a scheduled Firebase
  Cloud Function instead (needs Firebase's paid Blaze plan, still
  free at this usage level).
