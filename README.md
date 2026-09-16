# FleetPay v6.3 — Demo & Integration Build

FleetPay v6.3 adds the complete demo path for Autocab account adjustments, Stripe test collections, Wise Business sandbox payout-run demos, and Web Push driver notifications.

## Important security note
The Autocab subscription key previously pasted into chat should be rotated. Put only the replacement key in `.env`; never put it in React/browser code or GitHub.

## 1. Install
```bash
npm install
cp .env.example .env
```

Edit `.env`, then run:
```bash
npm run dev
```

Admin: `http://localhost:5173/`
Driver app: `http://localhost:5173/driver`

## 2. Autocab writes
FleetPay uses:
`PUT /driver/v1/accounts/driveraccounts/{driverId}/adjustment`

Rules used by FleetPay:
- Driver payment received = `isCredit: true`
- Payout sent to driver = `isCredit: false`
- FleetPay fee = `isCredit: false`

Each production adjustment has a unique FleetPay event key in `autocab_adjustments`, preventing the same Stripe webhook or payout from posting twice.

### Safe test first
Leave:
```env
AUTOCAB_ADJUSTMENTS_ENABLED=false
```

In Admin > Settings > Integrations & demo mode, use **Autocab test adjustment**. Start with a known test callsign and £0.01. The test action explicitly confirms before making the real Autocab adjustment.

After confirming credit/debit behave exactly as expected in your Autocab account screen, enable automatic posting:
```env
AUTOCAB_ADJUSTMENTS_ENABLED=true
```
Restart FleetPay.

When enabled:
- Stripe payment received posts weekly fee/carried charge debits and payment credit to Autocab.
- A paid weekly payout posts fees/carried charges and the payout as Autocab debits.
- A paid early payout posts the early-payout fee and net payout as Autocab debits.

The local FleetPay cache updates immediately after a successful Autocab adjustment, so the driver does not need to wait for the next scheduled sync.

## 3. Stripe test mode
Create/use Stripe test keys and set:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_BASE_URL=http://localhost:5173
```

For local webhooks, install/login to Stripe CLI and run (adjust port if FleetPay uses another backend port):
```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```
Copy the returned `whsec_...` value to `STRIPE_WEBHOOK_SECRET` and restart FleetPay.

Demo successful card:
- Card: `4242 4242 4242 4242`
- Expiry: any future date
- CVC: any 3 digits

A successful Stripe Checkout webhook automatically:
1. marks the correct FleetPay request paid,
2. timestamps it,
3. adds the driver ledger entry,
4. creates a driver notification/push,
5. posts the matching Autocab adjustments if automatic writes are enabled.

## 4. Wise Business sandbox demo
Create a Wise sandbox account/token and set:
```env
WISE_ENV=sandbox
WISE_API_TOKEN=...
WISE_PROFILE_ID=...
```

Admin > Settings > Integrations has **Test Wise**.

Payout runs also expose **Send to Wise Sandbox** when sandbox is configured. In v6 this intentionally records a sandbox demo submission after validating the Wise connection; it does **not** pretend to create live transfers or move real money. Real transfer creation needs verified recipient IDs/bank destinations and the final production Wise funding model.

## 5. Push notifications
Install dependencies, then generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

Put them in `.env`:
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```
Restart FleetPay.

In the driver app, sign in and press **Enable push notifications**. FleetPay registers the service worker, stores the subscription against that driver, and sends a test notification.

Push is used for payment requests, early-payout approval/decline, and payment sent/received events. Production must use HTTPS; localhost is suitable for development testing.

## 6. Demo flow
Recommended end-to-end demo:
1. Sync Autocab.
2. Register a test driver in `/driver` and approve them if admin approval is enabled.
3. Enable push notifications on the test driver's device/browser.
4. In Settings, send a £0.01 Autocab test credit/debit and verify the Autocab account changed in the expected direction.
5. Keep Stripe in test mode and run a Monday settlement.
6. Open the driver's Stripe payment request and pay with `4242 4242 4242 4242`.
7. Observe the Stripe webhook, FleetPay ledger, push notification, timestamped audit entry, and (when enabled) Autocab account adjustment.
8. Approve an early payout, create the daily payout run, and press **Send to Wise Sandbox** to demonstrate the payout-run workflow without real money.
9. Mark the sandbox/demo payout run paid to demonstrate driver ledger, push notification and Autocab adjustment flow.

## Database additions
v6 adds:
- `autocab_adjustments` — idempotent Autocab write ledger
- `push_subscriptions` — Web Push subscriptions by driver

Existing `data/fleetpay.sqlite` can be copied from v5; the new tables are created automatically.


## Early payout cutoff behaviour (v6.1)
The cutoff is now a processing cutoff, not a request lockout. Drivers can request Tuesday-Friday after the configured cutoff. Requests before the cutoff are eligible for that day's early payout run; requests after it are stored with the next business-day eligible run date (Friday late requests roll to Monday). The cutoff supports HH:MM values in Admin Settings.


## v6.2 payment run reporting

Monday settlement history now shows the exact amount **owed out**, **owed in**, FleetPay fees and carried-forward total for every run. Use **View run** to inspect every callsign and amount included in a settlement.

Requests & Payouts continues to hold the executable payout batches. Every Daily Early Payout Run and Monday Payout Run shows its driver count, total amount, status and timestamps, and **View run** opens the full callsign-by-callsign breakdown. CSV export remains available for payout batches.


## v6.3 UX changes

- Driver push state is restored from the browser service-worker subscription after refresh. Once enabled, the enable-notifications card disappears.
- Monday payment requests are completed from the FleetPay driver app. The driver taps **Pay securely now**, FleetPay creates a Stripe Checkout session for that specific request, and the Stripe webhook records the payment automatically. No payment link needs to be emailed or manually created by an admin.
- The driver balance card always remains visible and now shows available balance and any amount reserved by pending early-payout requests.
- Requests & Payouts now has two simple run-builder cards showing the number and total value ready for the Daily Early Payout run and Monday Weekly Payout run.
- Payment activity clearly labels open collections as **Driver pays in app**, with **Mark received** retained only as an admin fallback.
