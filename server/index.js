import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import Stripe from 'stripe';
import webpush from 'web-push';

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.AUTOCAB_API_KEY || '';
const COMPANY_IDS = String(process.env.AUTOCAB_COMPANY_IDS || process.env.AUTOCAB_COMPANY_ID || '1')
  .split(',')
  .map(x => Number(x.trim()))
  .filter(Number.isFinite);
const BASE_URL = 'https://autocab-api.azure-api.net';
const TOKEN_SECRET = process.env.PORTAL_TOKEN_SECRET || 'change-me-in-production';
const SETTINGS_ENCRYPTION_SECRET = process.env.SETTINGS_ENCRYPTION_KEY || TOKEN_SECRET;
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@fleetpay.local').toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'ChangeMe123!');
const APP_ENV_LABEL = String(process.env.APP_ENV_LABEL || 'LOCAL').trim().toUpperCase();
const DEV_AUTH_CODES = String(process.env.DEV_AUTH_CODES || 'true').toLowerCase() === 'true';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'FaivoPay <payments@example.com>';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || '';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'FaivoPay';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || `http://localhost:5173`).replace(/\/$/, '');
const AUTOCAB_ADJUSTMENTS_ENABLED = String(process.env.AUTOCAB_ADJUSTMENTS_ENABLED || 'false').toLowerCase()==='true';

const AUTOCAB_FLEETPAY_CUSTOMER_ID = Number(process.env.AUTOCAB_FLEETPAY_CUSTOMER_ID || 2203);
const AUTOCAB_FLEETPAY_CUSTOMER_NAME = String(process.env.AUTOCAB_FLEETPAY_CUSTOMER_NAME || 'FleetPay UK');
const AUTOCAB_FLEETPAY_ACCOUNT_CODE = String(process.env.AUTOCAB_FLEETPAY_ACCOUNT_CODE || 'Fleet');
const AUTOCAB_FLEETPAY_CAPABILITY_ID = Number(process.env.AUTOCAB_FLEETPAY_CAPABILITY_ID || 39);
const WISE_API_TOKEN = process.env.WISE_API_TOKEN || '';
const WISE_ENV = String(process.env.WISE_ENV || 'sandbox').toLowerCase();
const WISE_PROFILE_ID = process.env.WISE_PROFILE_ID || '';
const WISE_BASE_URL = WISE_ENV==='production' ? 'https://api.wise.com' : 'https://api.wise-sandbox.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
if(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY){ webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY); }
// Stripe client is resolved dynamically from company configuration with env fallback.
const DATA_DIR = path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'fleetpay.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS driver_users (
 id TEXT PRIMARY KEY, driver_id INTEGER UNIQUE NOT NULL, callsign TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_challenges (
 id TEXT PRIMARY KEY, type TEXT NOT NULL, driver_id INTEGER, callsign TEXT, email TEXT NOT NULL,
 code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settlement_runs (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL, settings_json TEXT NOT NULL, items_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
 id TEXT PRIMARY KEY, run_id TEXT, driver_id INTEGER NOT NULL, callsign TEXT, driver_name TEXT,
 gross_balance REAL, weekly_fee REAL DEFAULT 0, carried_charges REAL DEFAULT 0, gross_amount REAL, fee REAL DEFAULT 0,
 net_amount REAL, amount REAL, type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_requests (
 id TEXT PRIMARY KEY, run_id TEXT, driver_id INTEGER NOT NULL, callsign TEXT, driver_name TEXT,
 balance REAL, weekly_fee REAL DEFAULT 0, carried_charges REAL DEFAULT 0, amount REAL NOT NULL,
 status TEXT NOT NULL, payment_url TEXT, created_at TEXT NOT NULL, updated_at TEXT
);


CREATE TABLE IF NOT EXISTS driver_payment_plans (
 id TEXT PRIMARY KEY,
 driver_id INTEGER NOT NULL,
 callsign TEXT,
 driver_name TEXT,

 source_payment_request_id TEXT NOT NULL,

 original_amount REAL NOT NULL,
 plan_amount REAL NOT NULL,
 paid_amount REAL NOT NULL DEFAULT 0,
 remaining_amount REAL NOT NULL,

 frequency TEXT NOT NULL DEFAULT 'weekly',
 instalment_amount REAL NOT NULL,

 start_date TEXT NOT NULL,
 next_due_at TEXT,

 status TEXT NOT NULL DEFAULT 'draft',

 notes TEXT,

 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_by TEXT,
 updated_at TEXT,

 activated_at TEXT,
 paused_at TEXT,
 completed_at TEXT,
 cancelled_at TEXT,
 defaulted_at TEXT,

 cancellation_reason TEXT,
 pause_reason TEXT,
 default_reason TEXT,

 FOREIGN KEY(source_payment_request_id) REFERENCES payment_requests(id)
);

CREATE TABLE IF NOT EXISTS driver_payment_plan_instalments (
 id TEXT PRIMARY KEY,
 plan_id TEXT NOT NULL,
 driver_id INTEGER NOT NULL,
 callsign TEXT,

 instalment_number INTEGER NOT NULL,
 amount REAL NOT NULL,
 paid_amount REAL NOT NULL DEFAULT 0,
 due_at TEXT NOT NULL,

 status TEXT NOT NULL DEFAULT 'scheduled',

 payment_request_id TEXT,

 provider TEXT,
 provider_session_id TEXT,
 provider_payment_intent_id TEXT,
 payment_url TEXT,

 paid_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT,

 FOREIGN KEY(plan_id) REFERENCES driver_payment_plans(id),
 FOREIGN KEY(payment_request_id) REFERENCES payment_requests(id)
);

CREATE TABLE IF NOT EXISTS driver_payment_plan_events (
 id TEXT PRIMARY KEY,
 plan_id TEXT NOT NULL,
 driver_id INTEGER NOT NULL,

 event_type TEXT NOT NULL,
 description TEXT,

 actor_type TEXT NOT NULL,
 actor_id TEXT,

 metadata_json TEXT,

 created_at TEXT NOT NULL,

 FOREIGN KEY(plan_id) REFERENCES driver_payment_plans(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_plan_active_source
ON driver_payment_plans(source_payment_request_id)
WHERE status IN ('draft','active','paused','defaulted');

CREATE INDEX IF NOT EXISTS idx_payment_plans_driver
ON driver_payment_plans(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_plans_status
ON driver_payment_plans(status, next_due_at);

CREATE INDEX IF NOT EXISTS idx_payment_plan_instalments_plan
ON driver_payment_plan_instalments(plan_id, instalment_number);

CREATE INDEX IF NOT EXISTS idx_payment_plan_instalments_due
ON driver_payment_plan_instalments(status, due_at);

CREATE INDEX IF NOT EXISTS idx_payment_plan_events_plan
ON driver_payment_plan_events(plan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_payments (
 id TEXT PRIMARY KEY,
 driver_id INTEGER,
 callsign TEXT,
 driver_name TEXT,
 booking_id TEXT,
 fare_amount REAL NOT NULL,
 fee_amount REAL NOT NULL DEFAULT 0,
 total_amount REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',
 payment_status TEXT NOT NULL DEFAULT 'open',
 job_status TEXT NOT NULL DEFAULT 'awaiting_payment',
 driver_settlement_status TEXT NOT NULL DEFAULT 'not_ready',
 driver_settlement_amount REAL,
 driver_settlement_note TEXT,
 driver_settlement_reviewed_by TEXT,
 driver_settlement_reviewed_at TEXT,
 provider TEXT,
 provider_session_id TEXT,
 payment_url TEXT,
 stripe_payment_intent_id TEXT,
 payment_method TEXT,
 autocab_release_status TEXT NOT NULL DEFAULT 'not_required',
 autocab_release_attempts INTEGER NOT NULL DEFAULT 0,
 autocab_release_error TEXT,
 autocab_released_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT,
 paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_driver
ON customer_payments(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_payments_booking
ON customer_payments(booking_id);

CREATE TABLE IF NOT EXISTS customer_refunds (
 id TEXT PRIMARY KEY,
 customer_payment_id TEXT NOT NULL,
 booking_id TEXT,
 stripe_refund_id TEXT NOT NULL UNIQUE,
 stripe_payment_intent_id TEXT,
 amount REAL NOT NULL,
 currency TEXT NOT NULL DEFAULT 'gbp',
 status TEXT NOT NULL,
 reason TEXT,
 source TEXT NOT NULL,
 processed_by TEXT,
 stripe_created_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_refunds_payment
ON customer_refunds(customer_payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_refunds_booking
ON customer_refunds(booking_id, created_at DESC);
CREATE TABLE IF NOT EXISTS autocab_booking_webhooks (
 id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL,
 booking_id TEXT,
 company_id INTEGER,
 row_version INTEGER,
 passenger_name TEXT,
 passenger_mobile TEXT,
 passenger_email TEXT,
 pickup TEXT,
 destination TEXT,
 pickup_due_time TEXT,
 driver_cost REAL,
 office_price REAL,
 payment_method TEXT,
 capabilities_json TEXT,
 has_payment_capability INTEGER NOT NULL DEFAULT 0,
 raw_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'received',
 received_at TEXT NOT NULL,
 processed_at TEXT,
 error TEXT
);

CREATE INDEX IF NOT EXISTS idx_autocab_booking_webhooks_booking
ON autocab_booking_webhooks(booking_id, received_at DESC);

CREATE TABLE IF NOT EXISTS carried_charges (driver_id INTEGER PRIMARY KEY, amount REAL NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS driver_weekly_activity (
 driver_id INTEGER NOT NULL,
 week_start TEXT NOT NULL,
 worked INTEGER NOT NULL DEFAULT 0,
 first_seen_at TEXT,
 last_seen_at TEXT,
 max_all_jobs_total REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(driver_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_driver_weekly_activity_week
ON driver_weekly_activity(week_start, driver_id);

CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT,
 action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, details_json TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_driver ON payouts(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_driver ON payment_requests(driver_id, created_at DESC);
CREATE TABLE IF NOT EXISTS driver_cache (
 driver_id INTEGER PRIMARY KEY, callsign TEXT, forename TEXT, surname TEXT, full_name TEXT, mobile TEXT, email TEXT,
 active INTEGER, suspended INTEGER, previous_balance REAL, current_balance REAL, last_processed TEXT, last_processed_by TEXT,
 notes TEXT, totals_json TEXT, synced_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS driver_notifications (
 id TEXT PRIMARY KEY, driver_id INTEGER NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL,
 reference_id TEXT, read_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS driver_ledger (
 id TEXT PRIMARY KEY, driver_id INTEGER NOT NULL, entry_type TEXT NOT NULL, direction TEXT NOT NULL, amount REAL NOT NULL,
 fee_amount REAL NOT NULL DEFAULT 0, description TEXT NOT NULL, reference_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_callsign ON driver_cache(callsign);
CREATE INDEX IF NOT EXISTS idx_notifications_driver ON driver_notifications(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_driver ON driver_ledger(driver_id, created_at DESC);
CREATE TABLE IF NOT EXISTS payout_runs (
 id TEXT PRIMARY KEY, run_type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT,
 scheduled_for TEXT, total_amount REAL NOT NULL DEFAULT 0, item_count INTEGER NOT NULL DEFAULT 0,
 provider TEXT, provider_ref TEXT, notes TEXT, paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payout_runs_created ON payout_runs(created_at DESC);
CREATE TABLE IF NOT EXISTS autocab_adjustments (
 id TEXT PRIMARY KEY, event_key TEXT UNIQUE NOT NULL, driver_id INTEGER NOT NULL, callsign TEXT, amount REAL NOT NULL,
 is_credit INTEGER NOT NULL, description TEXT NOT NULL, adjustment_reason TEXT, status TEXT NOT NULL, response_json TEXT,
 created_at TEXT NOT NULL, completed_at TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY, driver_id INTEGER NOT NULL, endpoint TEXT UNIQUE NOT NULL, subscription_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adjustments_driver ON autocab_adjustments(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_driver ON push_subscriptions(driver_id);

CREATE TABLE IF NOT EXISTS driver_bank_accounts (
 driver_id INTEGER PRIMARY KEY,
 account_holder_enc TEXT NOT NULL,
 sort_code_enc TEXT NOT NULL,
 account_number_enc TEXT NOT NULL,
 sort_code_last2 TEXT NOT NULL,
 account_number_last4 TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'saved',
 provider_recipient_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_driver_bank_status ON driver_bank_accounts(status);

CREATE TABLE IF NOT EXISTS staff_users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'office',
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 mfa_secret TEXT,
 mfa_enabled INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 last_login_at TEXT
);


CREATE INDEX IF NOT EXISTS idx_staff_email ON staff_users(email);

CREATE TABLE IF NOT EXISTS platform_admins (
 staff_id TEXT PRIMARY KEY,
 granted_at TEXT NOT NULL,
 granted_by TEXT NOT NULL DEFAULT 'bootstrap',
 FOREIGN KEY(staff_id) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS companies (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 slug TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'draft',
 primary_domain TEXT,
 support_email TEXT,
 support_phone TEXT,
 timezone TEXT NOT NULL DEFAULT 'Europe/London',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_settings (
 company_id TEXT NOT NULL,
 key TEXT NOT NULL,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(company_id,key),
 FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS company_secure_settings (
 company_id TEXT NOT NULL,
 key TEXT NOT NULL,
 value_enc TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(company_id,key),
 FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_company_settings_company ON company_settings(company_id);


CREATE TABLE IF NOT EXISTS secure_settings (
 key TEXT PRIMARY KEY,
 value_enc TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_ledger (
 id TEXT PRIMARY KEY, fee_type TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
 driver_id INTEGER, callsign TEXT, description TEXT, gross_fee REAL NOT NULL, fleetpay_share REAL NOT NULL, taxi_company_share REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'uninvoiced', invoice_ref TEXT, created_at TEXT NOT NULL, invoiced_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_source ON fee_ledger(fee_type,source_type,source_id);
CREATE INDEX IF NOT EXISTS idx_fee_created ON fee_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS payment_plan_settlement_allocations (
 id TEXT PRIMARY KEY,

 run_id TEXT NOT NULL,
 payout_id TEXT,
 driver_id INTEGER NOT NULL,
 callsign TEXT,

 plan_id TEXT NOT NULL,
 instalment_id TEXT NOT NULL,
 payment_request_id TEXT,

 scheduled_amount REAL NOT NULL,
 allocated_amount REAL NOT NULL,

 status TEXT NOT NULL DEFAULT 'pending',

 autocab_event_key TEXT NOT NULL,
 error TEXT,

 created_at TEXT NOT NULL,
 updated_at TEXT,
 applied_at TEXT,

 FOREIGN KEY(run_id) REFERENCES settlement_runs(id),
 FOREIGN KEY(payout_id) REFERENCES payouts(id),
 FOREIGN KEY(plan_id) REFERENCES driver_payment_plans(id),
 FOREIGN KEY(instalment_id) REFERENCES driver_payment_plan_instalments(id),
 FOREIGN KEY(payment_request_id) REFERENCES payment_requests(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_settlement_allocation_run_instalment
 ON payment_plan_settlement_allocations(run_id,instalment_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_settlement_allocation_autocab_event
 ON payment_plan_settlement_allocations(autocab_event_key);

CREATE INDEX IF NOT EXISTS idx_plan_settlement_allocation_status
 ON payment_plan_settlement_allocations(status);

CREATE TABLE IF NOT EXISTS communications_log (
 id TEXT PRIMARY KEY, channel TEXT NOT NULL, recipient TEXT, template_key TEXT, entity_type TEXT, entity_id TEXT,
 status TEXT NOT NULL, provider_ref TEXT, error TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comms_created ON communications_log(created_at DESC);

CREATE TABLE IF NOT EXISTS early_summary_notifications (
 run_date TEXT PRIMARY KEY, request_count INTEGER NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0,
 sent_at TEXT, status TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS demo_state (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
`);

for (const sql of [
  'ALTER TABLE payouts ADD COLUMN decline_reason TEXT',
  'ALTER TABLE payouts ADD COLUMN decision_at TEXT',
  'ALTER TABLE payouts ADD COLUMN decision_by TEXT',
  'ALTER TABLE payouts ADD COLUMN payout_run_id TEXT',
  'ALTER TABLE payouts ADD COLUMN paid_at TEXT',
  'ALTER TABLE payouts ADD COLUMN eligible_run_date TEXT',
  'ALTER TABLE payouts ADD COLUMN submitted_after_cutoff INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE payment_requests ADD COLUMN provider TEXT',
  'ALTER TABLE payment_requests ADD COLUMN provider_session_id TEXT',
  'ALTER TABLE payment_requests ADD COLUMN provider_payment_intent_id TEXT',
  'ALTER TABLE payment_requests ADD COLUMN paid_at TEXT',
  'ALTER TABLE payment_requests ADD COLUMN payment_plan_id TEXT',
  'ALTER TABLE payment_requests ADD COLUMN payment_plan_instalment_id TEXT',
  'ALTER TABLE payment_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT \'standard\''
,
  'ALTER TABLE driver_payment_plan_instalments ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0',
  'ALTER TABLE payment_plan_settlement_allocations ADD COLUMN payout_id TEXT',
  'ALTER TABLE driver_cache ADD COLUMN payout_excluded INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE driver_cache ADD COLUMN payout_exclusion_reason TEXT',
  "ALTER TABLE customer_payments ADD COLUMN autocab_release_status TEXT NOT NULL DEFAULT 'not_required'",
  'ALTER TABLE customer_payments ADD COLUMN autocab_release_attempts INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE customer_payments ADD COLUMN autocab_release_error TEXT',
  'ALTER TABLE customer_payments ADD COLUMN autocab_released_at TEXT',
  'ALTER TABLE payment_requests ADD COLUMN due_at TEXT',
  'ALTER TABLE payment_requests ADD COLUMN email_sent_at TEXT',
  'ALTER TABLE payment_requests ADD COLUMN sms_sent_at TEXT',
  'ALTER TABLE payment_requests ADD COLUMN communication_error TEXT',
  'ALTER TABLE customer_payments ADD COLUMN payment_status TEXT NOT NULL DEFAULT \'open\'',
  'ALTER TABLE customer_payments ADD COLUMN job_status TEXT NOT NULL DEFAULT \'awaiting_payment\'',
  'ALTER TABLE customer_payments ADD COLUMN driver_settlement_status TEXT NOT NULL DEFAULT \'not_ready\'',
  'ALTER TABLE customer_payments ADD COLUMN driver_settlement_amount REAL',
  'ALTER TABLE customer_payments ADD COLUMN driver_settlement_note TEXT',
  'ALTER TABLE customer_payments ADD COLUMN driver_settlement_reviewed_by TEXT',
  'ALTER TABLE customer_payments ADD COLUMN driver_settlement_reviewed_at TEXT',
  'ALTER TABLE customer_payments ADD COLUMN customer_name TEXT',
  'ALTER TABLE customer_payments ADD COLUMN customer_mobile TEXT',
  'ALTER TABLE customer_payments ADD COLUMN customer_email TEXT',
  'ALTER TABLE customer_payments ADD COLUMN pickup TEXT',
  'ALTER TABLE customer_payments ADD COLUMN destination TEXT',
  'ALTER TABLE customer_payments ADD COLUMN journey_at TEXT',
  'ALTER TABLE customer_payments ADD COLUMN taxi_company TEXT',
  'ALTER TABLE customer_payments ADD COLUMN notes TEXT',
  'ALTER TABLE customer_payments ADD COLUMN source TEXT',
  'ALTER TABLE customer_payments ADD COLUMN created_by TEXT',
  'ALTER TABLE customer_payments ADD COLUMN provider_checkout_url TEXT',
  'ALTER TABLE customer_payments ADD COLUMN refund_status TEXT',
  'ALTER TABLE customer_payments ADD COLUMN refunded_amount REAL NOT NULL DEFAULT 0',
  'ALTER TABLE customer_payments ADD COLUMN refunded_at TEXT',
  'ALTER TABLE settlement_runs ADD COLUMN run_date TEXT',
  'ALTER TABLE settlement_runs ADD COLUMN created_by TEXT',
  'ALTER TABLE settlement_runs ADD COLUMN approved_at TEXT',
  'ALTER TABLE settlement_runs ADD COLUMN payout_run_id TEXT',
  'ALTER TABLE payout_runs ADD COLUMN funding_status TEXT',
  'ALTER TABLE payout_runs ADD COLUMN funding_required REAL',
  'ALTER TABLE payout_runs ADD COLUMN funding_sent_at TEXT',
  'ALTER TABLE payout_runs ADD COLUMN funds_cleared_at TEXT',
  'ALTER TABLE payout_runs ADD COLUMN released_at TEXT',
  'ALTER TABLE payout_runs ADD COLUMN reconciled_at TEXT'
]) { try { db.exec(sql); } catch {} }

// Existing databases created before automated Autocab customer payments
// required driver_id and callsign. Make those columns nullable once.
{
 const cols=db.prepare("PRAGMA table_info(customer_payments)").all();
 const driverId=cols.find(c=>c.name==='driver_id');
 const callsign=cols.find(c=>c.name==='callsign');

 if(driverId?.notnull || callsign?.notnull){
  db.exec(`
   BEGIN IMMEDIATE;

   ALTER TABLE customer_payments
   RENAME TO customer_payments_before_nullable_driver;

   CREATE TABLE customer_payments (
    id TEXT PRIMARY KEY,
    driver_id INTEGER,
    callsign TEXT,
    driver_name TEXT,
    booking_id TEXT,
    fare_amount REAL NOT NULL,
    fee_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    payment_status TEXT NOT NULL DEFAULT 'open',
    job_status TEXT NOT NULL DEFAULT 'awaiting_payment',
    driver_settlement_status TEXT NOT NULL DEFAULT 'not_ready',
    provider TEXT,
    provider_session_id TEXT,
    payment_url TEXT,
    stripe_payment_intent_id TEXT,
    payment_method TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    paid_at TEXT,
    customer_name TEXT,
    customer_mobile TEXT,
    customer_email TEXT,
    pickup TEXT,
    destination TEXT,
    journey_at TEXT,
    taxi_company TEXT,
    notes TEXT,
    source TEXT,
    created_by TEXT,
    provider_checkout_url TEXT,
    refund_status TEXT,
    refunded_amount REAL NOT NULL DEFAULT 0,
    refunded_at TEXT
   );

   INSERT INTO customer_payments(
    id,driver_id,callsign,driver_name,booking_id,
    fare_amount,fee_amount,total_amount,status,
    payment_status,job_status,driver_settlement_status,
    provider,provider_session_id,payment_url,
    stripe_payment_intent_id,payment_method,
    created_at,updated_at,paid_at,
    customer_name,customer_mobile,customer_email,
    pickup,destination,journey_at,taxi_company,
    notes,source,created_by,provider_checkout_url,
    refund_status,refunded_amount,refunded_at
   )
   SELECT
    id,driver_id,callsign,driver_name,booking_id,
    fare_amount,fee_amount,total_amount,status,
    payment_status,job_status,driver_settlement_status,
    provider,provider_session_id,payment_url,
    stripe_payment_intent_id,payment_method,
    created_at,updated_at,paid_at,
    customer_name,customer_mobile,customer_email,
    pickup,destination,journey_at,taxi_company,
    notes,source,created_by,provider_checkout_url,
    refund_status,refunded_amount,refunded_at
   FROM customer_payments_before_nullable_driver;

   DROP TABLE customer_payments_before_nullable_driver;

   CREATE INDEX idx_customer_payments_driver
   ON customer_payments(driver_id, created_at DESC);

   CREATE INDEX idx_customer_payments_booking
   ON customer_payments(booking_id);

   COMMIT;
  `);
 }
}


db.exec(`
UPDATE customer_payments
SET payment_status =
 CASE
  WHEN status='paid' THEN 'paid'
  WHEN status='cancelled' THEN 'cancelled'
  WHEN status='refunded' THEN 'refunded'
  ELSE 'open'
 END
WHERE payment_status IS NULL
   OR payment_status=''
   OR (
    payment_status='open'
    AND status IN ('paid','cancelled','refunded')
   );

UPDATE customer_payments
SET job_status =
 CASE
  WHEN source='autocab_booking_created'
   AND payment_status='paid'
   THEN 'release_pending'
  WHEN source='autocab_booking_created'
   THEN 'awaiting_payment'
  ELSE 'manual'
 END
WHERE job_status IS NULL
   OR job_status=''
   OR job_status='awaiting_payment';

UPDATE customer_payments
SET driver_settlement_status='not_ready'
WHERE driver_settlement_status IS NULL
   OR driver_settlement_status='';
`);

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_payments_autocab_booking
ON customer_payments(booking_id)
WHERE source='autocab_booking_created';
`);

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_payments_driver_live_booking
ON customer_payments(booking_id)
WHERE source='driver_live_booking';
`);

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_payments_autocab_linked_booking
ON customer_payments(booking_id)
WHERE source IN ('autocab_booking_created','driver_live_booking');
`);

const defaultSettings = {
 negativeThreshold: 20,
 minimumPayoutThreshold: 0,
 chargeWeeklyFeeWhenInactive: true,
 weeklyAppFee: 2.5,
 earlyPayoutFee: 1.5,

 customerPaymentFeeType: 'fixed',
 customerPaymentFeeValue: 0.50,
 customerPaymentSmsTemplate: 'FaivoPay: Your taxi journey payment is £{total}. Pay securely here: {paymentLink}',
 customerPaymentEmailSubject: 'Your taxi journey payment – £{total}',
 customerPaymentEmailBody: 'Hello {customer},\n\nYour taxi journey payment is ready.\n\nJourney fare: £{fare}\nFaivoPay service fee: £{fee}\nTotal to pay: £{total}\n\nPay securely here: {paymentLink}\n\nBooking reference: {bookingId}',

 earlyPayoutCutoffTime: '11:00',
 earlyPayoutCutoffHour: 11,

 syncMinutes: 10,
 requireAdminApproval: false,
 companyName: 'Need-A-Cab',
 productName: 'FaivoPay',
 weeklyPayoutReasonTemplate: 'FaivoPay Weekly Payout {date} {time}',
 earlyPayoutReasonTemplate: 'FaivoPay Early Payout {date} {time}',
 manualPayInReasonDefault: 'FaivoPay Manual Pay In',
 manualPayoutReasonDefault: 'FaivoPay Manual Payout',
 outstandingDueTime: '17:00',
 outstandingSmsTemplate: 'FaivoPay: £{amount} is outstanding on your driver account. Payment is due by {dueTime} on {dueDate} to avoid suspension. Open FaivoPay to pay securely.',
 outstandingEmailSubject: 'FaivoPay payment due – £{amount}',
 outstandingEmailBody: 'Hello {driver},\n\nYour FaivoPay account has an outstanding commission payment of £{amount}. Payment is due by {dueTime} on {dueDate} to avoid suspension.\n\nPlease open FaivoPay to pay securely.\n\nFaivoPay',
 smsEndpoint: '',
 smsMethod: 'POST',
 smsAuthHeader: 'Authorization',
 smsBodyTemplate: '{"to":"{mobile}","message":"{message}"}',

 twilioEnabled: true,
 orionEnabled: true,
 paymentSmsProvider: 'twilio',
 generalSmsProvider: 'orion',
 smsFallbackEnabled: true,
 twilioLowBalanceAlertsEnabled: true,
 twilioLowBalanceThreshold: 20,
 twilioLowBalanceEmail: 'office@needacab247.com',

 smtpHost: '',
 smtpPort: 587,
 smtpSecure: false,
 smtpUser: '',
 smtpFromName: 'FaivoPay',
 smtpFromEmail: '',
 officeNotificationEmail: 'office@needacab247.com',
 customerFeeFleetPayPercent: 100,
 earlyPayoutFeeFleetPayPercent: 100,
 weeklyFeeFleetPayPercent: 100
};
for (const [k,v] of Object.entries(defaultSettings)) {
 db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, JSON.stringify(v));
}

app.use(cors());
app.post('/api/stripe/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  const stripeClient=getStripeClient();
  const stripeWebhookSecret=getStripeWebhookSecret();

  if(!stripeClient || !stripeWebhookSecret){
    return res.status(503).send('Stripe webhook not configured');
  }

  let event;

  try{
    event=stripeClient.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      stripeWebhookSecret
    );
  }catch(e){
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try{
    /*
     * STRIPE REFUND RECONCILIATION
     *
     * Refund events may originate in FaivoPay or directly in Stripe.
     * Stripe remains the authority for the final refund status and amount.
     */
    if([
      'refund.created',
      'refund.updated',
      'refund.failed'
    ].includes(event.type)){
      const refund=event.data.object;

      const paymentIntentId=String(
       refund?.payment_intent||''
      ).trim();

      if(paymentIntentId){
       const item=db.prepare(`
        SELECT *
        FROM customer_payments
        WHERE stripe_payment_intent_id=?
        LIMIT 1
       `).get(paymentIntentId);

       if(item){
        /*
         * Always re-read all refunds for this PaymentIntent. A single
         * webhook event only describes one refund, while FaivoPay's
         * current-state fields represent the cumulative Stripe outcome.
         */
        const stripeRefunds=await stripeClient.refunds.list({
         payment_intent:paymentIntentId,
         limit:100
        });

        const refundRows=stripeRefunds.data||[];

        syncStripeRefundsToLedger(
         item,
         refundRows
        );

        const succeededRows=refundRows.filter(
         r=>String(r.status||'')==='succeeded'
        );

        const pendingRows=refundRows.filter(
         r=>[
          'pending',
          'requires_action'
         ].includes(String(r.status||''))
        );

        const succeededPence=succeededRows.reduce(
         (sum,r)=>sum+Number(r.amount||0),
         0
        );

        const pendingPence=pendingRows.reduce(
         (sum,r)=>sum+Number(r.amount||0),
         0
        );

        const refundedAmount=
         Math.round((succeededPence/100)*100)/100;

        const pendingAmount=
         Math.round((pendingPence/100)*100)/100;

        const total=
         Math.round(Number(item.total_amount||0)*100)/100;

        const refundableAmount=
         Math.round(Number(item.fare_amount||0)*100)/100;

        const refundStatus=
         pendingAmount>0
          ? 'pending'
          : refundedAmount>=refundableAmount
          ? 'full'
          : refundedAmount>0
          ? 'partial'
          : 'none';

        const latestSucceededAt=succeededRows
         .map(r=>Number(r.created||0))
         .filter(Boolean)
         .sort((a,b)=>b-a)[0];

        const refundedAt=
         latestSucceededAt
          ? new Date(latestSucceededAt*1000).toISOString()
          : item.refunded_at||null;

        const now=new Date().toISOString();

        db.prepare(`
         UPDATE customer_payments
         SET refund_status=?,
             refunded_amount=?,
             refunded_at=?,
             updated_at=?
         WHERE id=?
        `).run(
         refundStatus,
         refundedAmount,
         refundedAt,
         now,
         item.id
        );

        console.log(
         '[FaivoPay] Stripe refund reconciled',
         {
          eventType:event.type,
          paymentId:item.id,
          bookingId:item.booking_id||null,
          paymentIntentId,
          stripeRefundId:refund?.id||null,
          refundStatus,
          refundedAmount,
          pendingAmount
         }
        );
       }
      }
    }

    if(
      event.type==='checkout.session.completed' ||
      event.type==='checkout.session.async_payment_succeeded'
    ){
      const session=event.data.object;

      /*
       * CUSTOMER PAYMENT
       */
      const customerPaymentId=
        session.metadata?.fleetpay_customer_payment_id;

      if(customerPaymentId){
        const item=db.prepare(
          'SELECT * FROM customer_payments WHERE id=?'
        ).get(customerPaymentId);

        if(item && item.status==='open'){
          const now=new Date().toISOString();

          db.prepare(`
            UPDATE customer_payments
            SET status=?,
                payment_status='paid',
                job_status=CASE
                 WHEN source IN ('autocab_booking_created','driver_live_booking')
                 THEN 'release_pending'
                 ELSE job_status
                END,
                autocab_release_status=CASE
                 WHEN source IN ('autocab_booking_created','driver_live_booking')
                 THEN 'pending'
                 ELSE autocab_release_status
                END,
                autocab_release_error=NULL,
                provider=?,
                provider_session_id=?,
                stripe_payment_intent_id=?,
                paid_at=?,
                updated_at=?
            WHERE id=?
          `).run(
            'paid',
            'stripe',
            session.id,
            String(session.payment_intent||''),
            now,
            now,
            item.id
          );

          recordFee({feeType:'customer_payment',sourceType:'customer_payment',sourceId:item.id,driverId:item.driver_id,callsign:item.callsign,description:item.booking_id?`Customer payment fee · Booking ${item.booking_id}`:'Customer payment fee',amount:Number(item.fee_amount||0),createdAt:now});

          if(Number(item.driver_id)>0) notify(
            item.driver_id,
            'Customer payment received',
            `Customer payment received. Fare £${Number(item.fare_amount).toFixed(2)} plus £${Number(item.fee_amount).toFixed(2)} FaivoPay service fee.`,
            'success',
            item.id
          );

          audit(
            null,
            'system',
            'stripe',
            'customer_payment_received',
            'customer_payment',
            item.id,
            {
              callsign:item.callsign,
              bookingId:item.booking_id||null,
              fareAmount:Number(item.fare_amount),
              feeAmount:Number(item.fee_amount),
              totalAmount:Number(item.total_amount),
              sessionId:session.id,
              paymentIntentId:String(session.payment_intent||'')
            }
          );
        }

        /*
         * If this is an Autocab-created payment, release the booking
         * after Stripe payment has been durably recorded.
         *
         * This also allows a duplicate Stripe webhook to retry a
         * booking that is still sitting in release_pending.
         */
        const releaseItem=db.prepare(
          'SELECT * FROM customer_payments WHERE id=?'
        ).get(customerPaymentId);

        if(
          releaseItem &&
          ['autocab_booking_created','driver_live_booking'].includes(
           String(releaseItem.source||'')
          ) &&
          releaseItem.payment_status==='paid' &&
          releaseItem.job_status==='release_pending'
        ){
          try{
            const releaseResult=await releaseFleetPayBooking(customerPaymentId);

            audit(
              null,
              'system',
              'autocab',
              'customer_payment_booking_released',
              'customer_payment',
              customerPaymentId,
              releaseResult
            );
          }catch(e){
            console.error(
              `FaivoPay Autocab release failed for payment ${customerPaymentId}:`,
              e.message
            );

            db.prepare(`
              UPDATE customer_payments
              SET autocab_release_status='failed',
                  autocab_release_error=?,
                  updated_at=?
              WHERE id=?
                AND job_status='release_pending'
            `).run(
              String(e.message||'Autocab release failed').slice(0,1000),
              new Date().toISOString(),
              customerPaymentId
            );

            audit(
              null,
              'system',
              'autocab',
              'customer_payment_booking_release_failed',
              'customer_payment',
              customerPaymentId,
              {
                bookingId:releaseItem.booking_id||null,
                error:e.message
              }
            );

            /*
             * Payment remains PAID and job remains RELEASE_PENDING.
             * Throw so Stripe retries the webhook.
             */
            throw e;
          }
        }
      }

      /*
       * EXISTING DRIVER BALANCE PAYMENT
       */
      const requestId=
        session.metadata?.fleetpay_request_id;

      if(requestId){
        const item=db.prepare(
          'SELECT * FROM payment_requests WHERE id=?'
        ).get(requestId);

        if(item && item.status==='open'){
          const now=new Date().toISOString();

          db.prepare(`
            UPDATE payment_requests
            SET status=?,
                provider=?,
                provider_session_id=?,
                provider_payment_intent_id=?,
                paid_at=?,
                updated_at=?
            WHERE id=?
          `).run(
            'paid',
            'stripe',
            session.id,
            String(session.payment_intent||''),
            now,
            now,
            item.id
          );

          ledger(
            item.driver_id,
            'payment_received',
            'debit',
            Number(item.amount||0),
            0,
            'Payment received by Stripe',
            item.id,
            'paid'
          );

          notify(
            item.driver_id,
            'Payment received',
            `We have received your payment of £${Number(item.amount||0).toFixed(2)}.`,
            'success',
            item.id
          );

          const isPaymentPlanInstalment=
            Boolean(
              item.payment_plan_id &&
              item.payment_plan_instalment_id
            );
          const isPaymentPlanExtra=Boolean(
            item.payment_plan_id &&
            item.request_type==='payment_plan_extra'
          );

          if(!isPaymentPlanInstalment&&!isPaymentPlanExtra){
            try{
              await settlePaymentRequestInAutocab(item);

              audit(
                null,
                'system',
                'stripe',
                'autocab_payment_adjusted',
                'payment_request',
                item.id,
                {
                  callsign:item.callsign,
                  amount:item.amount
                }
              );
            }catch(e){
              audit(
                null,
                'system',
                'stripe',
                'autocab_adjustment_failed',
                'payment_request',
                item.id,
                {
                  callsign:item.callsign,
                  error:e.message
                }
              );
            }
          }

          audit(
            null,
            'system',
            'stripe',
            'stripe_payment_received',
            'payment_request',
            item.id,
            {
              callsign:item.callsign,
              amount:item.amount,
              sessionId:session.id
            }
          );

          /*
           * PAYMENT PLAN PROGRESSION
           *
           * Ordinary payment requests have no payment_plan_id and are
           * ignored. Instalment requests update their plan and create
           * the next payment request automatically.
           */
          if(isPaymentPlanInstalment||isPaymentPlanExtra){
            try{
              /*
               * Reload the request so the helper receives the Stripe
               * provider/session/payment-intent values just written
               * above.
               */
              const paidPlanRequest=db.prepare(`
                SELECT *
                FROM payment_requests
                WHERE id=?
              `).get(item.id);

              const progression=isPaymentPlanExtra
                ?applyPaymentPlanExtraPayment(paidPlanRequest,now)
                :progressPaymentPlanAfterPayment(paidPlanRequest,now);

              audit(
                null,
                'system',
                'stripe',
                isPaymentPlanExtra
                  ?'payment_plan_extra_payment_applied'
                  :progression?.completed
                   ?'payment_plan_completed'
                   :'payment_plan_instalment_paid',
                'driver_payment_plan',
                item.payment_plan_id,
                progression||{
                  paymentRequestId:item.id
                }
              );

            }catch(e){
              /*
               * The card payment is already genuinely paid at Stripe.
               * Never undo that state because plan bookkeeping failed.
               * Record the failure prominently for office recovery.
               */
              audit(
                null,
                'system',
                'stripe',
                'payment_plan_progression_failed',
                'driver_payment_plan',
                item.payment_plan_id,
                {
                  paymentRequestId:item.id,
                  instalmentId:
                    item.payment_plan_instalment_id,
                  error:e.message
                }
              );

              console.error(
                `FaivoPay payment plan progression failed for ${item.payment_plan_id}:`,
                e
              );
            }
          }
        }
      }
    }

    res.json({received:true});

  }catch(e){
    res.status(500).json({error:e.message});
  }
});

app.use(express.json());

function autocabBookingPayload(body){
 if(!body||typeof body!=='object')return {};
 return body.booking || body.data?.booking || body.data || body;
}

function autocabCapabilityText(cap){
 if(typeof cap==='string')return cap.trim();
 if(!cap||typeof cap!=='object')return '';
 return String(
  cap.ShortCode ??
  cap.shortCode ??
  cap.Code ??
  cap.code ??
  cap.Name ??
  cap.name ??
  cap.Description ??
  cap.description ??
  cap.Descriptor ??
  cap.descriptor ??
  cap.shortName ??
  cap.value ??
  ''
 ).trim();
}

function hasFleetPayCapability(capabilities){
 return Array.isArray(capabilities) &&
  capabilities.some(cap=>autocabCapabilityText(cap)==='+');
}

app.post(['/api/webhooks/autocab/booking-created','/created'],async(req,res)=>{
 try{
  const raw=req.body||{};
  const b=autocabBookingPayload(raw);
  const pricing=b.Pricing||b.pricing||{};
  const pickup=b.Pickup||b.pickup||{};
  const destination=b.Destination||b.destination||{};
  const capabilities=Array.isArray(b.Capabilities)
   ?b.Capabilities
   :(Array.isArray(b.capabilities)?b.capabilities:[]);

  const bookingId=String(
   b.Id ??
   b.id ??
   b.BookingId ??
   b.bookingId ??
   b.bookingID ??
   raw.BookingId ??
   raw.bookingId ??
   raw.bookingID ??
   ''
  ).trim();

  const receivedAt=new Date().toISOString();
  const webhookId=id('autocab_booking');

  db.prepare(`
   INSERT INTO autocab_booking_webhooks(
    id,event_type,booking_id,company_id,row_version,
    passenger_name,passenger_mobile,passenger_email,
    pickup,destination,pickup_due_time,
    driver_cost,office_price,payment_method,
    capabilities_json,has_payment_capability,
    raw_json,status,received_at
   )
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   webhookId,
   'BookingCreated',
   bookingId||null,
   Number(b.Company?.Id??b.companyId??0)||null,
   Number(b.RowVersion??b.rowVersion??0)||null,
   String(b.Name||b.name||b.passengerName||'').trim(),
   String(b.TelephoneNumber||b.telephoneNumber||b.mobile||b.passengerMobile||'').trim(),
   String(b.CustomerEmail||b.customerEmail||b.email||'').trim(),
   String(pickup.Address||pickup.address||pickup.text||pickup.addressText||'').trim(),
   String(destination.Address||destination.address||destination.text||destination.addressText||'').trim(),
   b.PickupDueTimeUtc||b.pickupDueTimeUtc||b.PickupDueTime||b.pickupDueTime||null,
   Number(pricing.Cost??pricing.cost??0),
   Number(pricing.Price??pricing.price??0),
   String(b.PaymentMethod||b.paymentMethod||b.PaymentType||b.paymentType||'').trim(),
   JSON.stringify(capabilities),
   hasFleetPayCapability(capabilities)?1:0,
   JSON.stringify(raw),
   'received',
   receivedAt
  );

  if(hasFleetPayCapability(capabilities) && bookingId){
   const fareAmount=Number(pricing.Price??pricing.price??0);

   if(Number.isFinite(fareAmount) && fareAmount>0){
    const feeAmount=customerPaymentFeeFor(fareAmount);
    const totalAmount=Math.round((fareAmount+feeAmount)*100)/100;
    const paymentId=id('customerpay');

    db.prepare(`
     INSERT OR IGNORE INTO customer_payments(
      id,
      driver_id,
      callsign,
      driver_name,
      booking_id,
      fare_amount,
      fee_amount,
      total_amount,
      status,
      payment_url,
      payment_method,
      customer_name,
      customer_mobile,
      customer_email,
      pickup,
      destination,
      journey_at,
      taxi_company,
      source,
      created_by,
      created_at,
      updated_at
     )
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
     paymentId,
     null,
     null,
     null,
     bookingId,
     fareAmount,
     feeAmount,
     totalAmount,
     'open',
     `${PUBLIC_BASE_URL}/pay/${paymentId}`,
     String(b.PaymentMethod||b.paymentMethod||b.PaymentType||b.paymentType||'').trim()||null,
     String(b.Name||b.name||b.passengerName||'').trim()||null,
     String(b.TelephoneNumber||b.telephoneNumber||b.mobile||b.passengerMobile||'').trim()||null,
     String(b.CustomerEmail||b.customerEmail||b.email||'').trim()||null,
     String(pickup.Address||pickup.address||pickup.text||pickup.addressText||'').trim()||null,
     String(destination.Address||destination.address||destination.text||destination.addressText||'').trim()||null,
     b.PickupDueTimeUtc||b.pickupDueTimeUtc||b.PickupDueTime||b.pickupDueTime||null,
     getSettings().companyName||'Need-A-Cab',
     'autocab_booking_created',
     'autocab_webhook',
     receivedAt,
     receivedAt
    );

    if(getStripeClient()){
     const item=db.prepare(`
      SELECT *
      FROM customer_payments
      WHERE booking_id=?
        AND source='autocab_booking_created'
      LIMIT 1
     `).get(bookingId);

     if(item){
      await createStripeCustomerPayment(item);

      const updatedItem=db.prepare(`
       SELECT *
       FROM customer_payments
       WHERE id=?
       LIMIT 1
      `).get(item.id);

      if(updatedItem){
       await sendCustomerPaymentCommunications(updatedItem);
      }
     }
    }
   }
  }

  console.log(
   `[FaivoPay] Autocab BookingCreated received`,
   {
    bookingId:bookingId||null,
    companyId:b.Company?.Id??b.companyId??null,
    rowVersion:b.RowVersion??b.rowVersion??null,
    cost:pricing.Cost??pricing.cost??null,
    price:pricing.Price??pricing.price??null,
    capabilities:capabilities.map(autocabCapabilityText)
   }
  );

  res.status(200).json({
   ok:true,
   received:true,
   webhookId,
   bookingId:bookingId||null
  });

 }catch(e){
  console.error('[FaivoPay] BookingCreated webhook error',e);
  res.status(500).json({ok:false,error:'Webhook could not be stored'});
 }
});


/*
 * AUTOCAB BOOKING MODIFIED
 *
 * Keep an existing FaivoPay customer payment aligned with the latest
 * operational booking details. Booking ID is the permanent join key.
 *
 * Important:
 * - Creates a payment only if BookingCreated arrived before pricing
 *   and no payment exists yet.
 * - Never creates a duplicate payment for the same Autocab booking.
 * - Does NOT alter fare/fee/total once a payment already exists because
 *   a Stripe Checkout session may already have been created.
 * - Does NOT alter an existing payment/Stripe status.
 */
app.post(['/api/webhooks/autocab/booking-modified','/modified'],async(req,res)=>{
 try{
  const raw=req.body||{};
  const b=autocabBookingPayload(raw);

  const pickup=b.Pickup||b.pickup||{};
  const destination=b.Destination||b.destination||{};
  const driver=
   b.DriverDetails?.Driver ||
   b.driverDetails?.driver ||
   b.Driver ||
   b.driver ||
   b.AssignedDriver ||
   b.assignedDriver ||
   {};

  const bookingId=String(
   b.Id ??
   b.id ??
   b.BookingId ??
   b.bookingId ??
   b.bookingID ??
   raw.BookingId ??
   raw.bookingId ??
   raw.bookingID ??
   ''
  ).trim();

  const receivedAt=new Date().toISOString();
  const webhookId=id('autocab_booking');

  const passengerName=String(
   b.Name ??
   b.name ??
   b.PassengerName ??
   b.passengerName ??
   ''
  ).trim();

  const passengerMobile=String(
   b.TelephoneNumber ??
   b.telephoneNumber ??
   b.Mobile ??
   b.mobile ??
   b.PassengerMobile ??
   b.passengerMobile ??
   ''
  ).trim();

  const passengerEmail=String(
   b.CustomerEmail ??
   b.customerEmail ??
   b.Email ??
   b.email ??
   ''
  ).trim();

  const pickupText=String(
   pickup.Address ??
   pickup.address ??
   pickup.text ??
   pickup.addressText ??
   ''
  ).trim();

  const destinationText=String(
   destination.Address ??
   destination.address ??
   destination.text ??
   destination.addressText ??
   ''
  ).trim();

  const journeyAt=
   b.PickupDueTimeUtc ??
   b.pickupDueTimeUtc ??
   b.PickupDueTime ??
   b.pickupDueTime ??
   null;

  const paymentMethod=String(
   b.PaymentMethod ??
   b.paymentMethod ??
   b.PaymentType ??
   b.paymentType ??
   ''
  ).trim();

  const driverIdRaw=
   driver.Id ??
   driver.id ??
   driver.DriverId ??
   driver.driverId ??
   b.DriverId ??
   b.driverId ??
   null;

  let driverId=Number(driverIdRaw);
  if(!Number.isFinite(driverId) || driverId<=0) driverId=null;

  let callsign=String(
   driver.Callsign ??
   driver.callsign ??
   driver.CallSign ??
   driver.callSign ??
   b.DriverCallsign ??
   b.driverCallsign ??
   b.Callsign ??
   b.callsign ??
   ''
  ).trim();

  let driverName=String(
   driver.FullName ??
   driver.fullName ??
   driver.Name ??
   driver.name ??
   (
    `${driver.Forename ?? driver.forename ?? ''} ${driver.Surname ?? driver.surname ?? ''}`.trim()
   ) ??
   b.DriverName ??
   b.driverName ??
   ''
  ).trim();

  // Resolve missing driver details from FaivoPay's Autocab driver cache.
  let cached=null;

  if(driverId){
   cached=cachedDriver(driverId);
  }

  if(!cached && callsign){
   cached=cacheRows().find(x=>String(x.callsign)===callsign)||null;
  }

  if(cached){
   driverId=Number(cached.driverId)||driverId;
   callsign=callsign||String(cached.callsign||'');
   driverName=driverName||String(cached.fullName||'');
  }

  const pricing=b.Pricing||b.pricing||{};
  const capabilities=Array.isArray(b.Capabilities)
   ? b.Capabilities
   : (Array.isArray(b.capabilities)?b.capabilities:[]);

  // Keep a complete audit copy of the modified webhook.
  db.prepare(`
   INSERT INTO autocab_booking_webhooks(
    id,event_type,booking_id,company_id,row_version,
    passenger_name,passenger_mobile,passenger_email,
    pickup,destination,pickup_due_time,
    driver_cost,office_price,payment_method,
    capabilities_json,has_payment_capability,
    raw_json,status,received_at
   )
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   webhookId,
   'BookingModified',
   bookingId||null,
   Number(b.Company?.Id??b.companyId??0)||null,
   Number(b.RowVersion??b.rowVersion??0)||null,
   passengerName,
   passengerMobile,
   passengerEmail,
   pickupText,
   destinationText,
   journeyAt,
   Number(pricing.Cost??pricing.cost??0),
   Number(pricing.Price??pricing.price??0),
   paymentMethod,
   JSON.stringify(capabilities),
   hasFleetPayCapability(capabilities)?1:0,
   JSON.stringify(raw),
   'received',
   receivedAt
  );

  let updated=0;

  if(bookingId){
   let payment=db.prepare(`
    SELECT *
    FROM customer_payments
    WHERE booking_id=?
      AND source='autocab_booking_created'
    ORDER BY created_at DESC
    LIMIT 1
   `).get(bookingId);

   /*
    * A BookingCreated webhook can arrive before Autocab has populated
    * the final price. If a later BookingModified contains a valid price
    * and the FaivoPay + capability is still present, create the missing
    * customer payment here.
    */
   if(!payment && hasFleetPayCapability(capabilities)){
    const fareAmount=Number(pricing.Price??pricing.price??0);

    if(Number.isFinite(fareAmount) && fareAmount>0){
     const feeAmount=customerPaymentFeeFor(fareAmount);
     const totalAmount=Math.round((fareAmount+feeAmount)*100)/100;
     const paymentId=id('customerpay');

     db.prepare(`
      INSERT OR IGNORE INTO customer_payments(
       id,
       driver_id,
       callsign,
       driver_name,
       booking_id,
       fare_amount,
       fee_amount,
       total_amount,
       status,
       payment_url,
       payment_method,
       customer_name,
       customer_mobile,
       customer_email,
       pickup,
       destination,
       journey_at,
       taxi_company,
       source,
       created_by,
       created_at,
       updated_at
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     `).run(
      paymentId,
      driverId,
      callsign||null,
      driverName||null,
      bookingId,
      fareAmount,
      feeAmount,
      totalAmount,
      'open',
      `${PUBLIC_BASE_URL}/pay/${paymentId}`,
      paymentMethod||null,
      passengerName||null,
      passengerMobile||null,
      passengerEmail||null,
      pickupText||null,
      destinationText||null,
      journeyAt,
      getSettings().companyName||'Need-A-Cab',
      'autocab_booking_created',
      'autocab_webhook_modified',
      receivedAt,
      receivedAt
     );

     payment=db.prepare(`
      SELECT *
      FROM customer_payments
      WHERE booking_id=?
        AND source='autocab_booking_created'
      ORDER BY created_at DESC
      LIMIT 1
     `).get(bookingId);

     if(payment && getStripeClient() && !payment.provider_session_id){
      await createStripeCustomerPayment(payment);

      const updatedItem=db.prepare(`
       SELECT *
       FROM customer_payments
       WHERE id=?
       LIMIT 1
      `).get(payment.id);

      if(updatedItem){
       await sendCustomerPaymentCommunications(updatedItem);
       payment=updatedItem;
      }
     }
    }
   }

   /*
    * If the payment row exists but Stripe Checkout creation previously
    * failed, retry it while the payment is still open.
    */
   if(
    payment &&
    getStripeClient() &&
    payment.status==='open' &&
    !payment.provider_session_id
   ){
    await createStripeCustomerPayment(payment);

    const refreshedPayment=db.prepare(`
     SELECT *
     FROM customer_payments
     WHERE id=?
     LIMIT 1
    `).get(payment.id);

    if(refreshedPayment){
     await sendCustomerPaymentCommunications(refreshedPayment);
     payment=refreshedPayment;
    }
   }

   if(payment){
    const result=db.prepare(`
     UPDATE customer_payments
     SET
      driver_id=CASE
       WHEN ? IS NOT NULL THEN ?
       ELSE driver_id
      END,
      callsign=CASE
       WHEN ?<>'' THEN ?
       ELSE callsign
      END,
      driver_name=CASE
       WHEN ?<>'' THEN ?
       ELSE driver_name
      END,
      customer_name=CASE
       WHEN ?<>'' THEN ?
       ELSE customer_name
      END,
      customer_mobile=CASE
       WHEN ?<>'' THEN ?
       ELSE customer_mobile
      END,
      customer_email=CASE
       WHEN ?<>'' THEN ?
       ELSE customer_email
      END,
      pickup=CASE
       WHEN ?<>'' THEN ?
       ELSE pickup
      END,
      destination=CASE
       WHEN ?<>'' THEN ?
       ELSE destination
      END,
      journey_at=COALESCE(?,journey_at),
      payment_method=CASE
       WHEN ?<>'' THEN ?
       ELSE payment_method
      END,
      updated_at=?
     WHERE id=?
    `).run(
     driverId,driverId,
     callsign,callsign,
     driverName,driverName,
     passengerName,passengerName,
     passengerMobile,passengerMobile,
     passengerEmail,passengerEmail,
     pickupText,pickupText,
     destinationText,destinationText,
     journeyAt,
     paymentMethod,paymentMethod,
     receivedAt,
     payment.id
    );

    updated=Number(result.changes||0);

    const bookingType=String(
     b.BookingType ??
     b.bookingType ??
     ''
    ).toLowerCase();

    if(
     bookingType==='dispatched' ||
     driverId ||
     callsign
    ){
     db.prepare(`
      UPDATE customer_payments
      SET job_status='dispatched',
          updated_at=?
      WHERE id=?
     `).run(receivedAt,payment.id);
    }
   }
  }

  console.log(
   '[FaivoPay] Autocab BookingModified received',
   {
    bookingId:bookingId||null,
    driverId:driverId||null,
    callsign:callsign||null,
    driverName:driverName||null,
    updated
   }
  );

  res.status(200).json({
   ok:true,
   received:true,
   webhookId,
   bookingId:bookingId||null,
   updated
  });

 }catch(e){
  console.error('[FaivoPay] BookingModified webhook error',e);
  res.status(500).json({
   ok:false,
   error:'Modified booking webhook could not be processed'
  });
 }
});



function storeAutocabJobEvent(raw,eventType){
 const b=autocabBookingPayload(raw);
 const pricing=b.Pricing||b.pricing||{};
 const pickup=b.Pickup||b.pickup||{};
 const destination=b.Destination||b.destination||{};
 const capabilities=Array.isArray(b.Capabilities)
  ? b.Capabilities
  : (Array.isArray(b.capabilities)?b.capabilities:[]);

 const bookingId=String(
  b.OriginalBookingId ??
  b.originalBookingId ??
  b.OriginalBookingID ??
  b.Id ??
  b.id ??
  b.BookingId ??
  b.bookingId ??
  b.bookingID ??
  raw.OriginalBookingId ??
  raw.originalBookingId ??
  raw.BookingId ??
  raw.bookingId ??
  raw.bookingID ??
  ''
 ).trim();

 const receivedAt=new Date().toISOString();
 const webhookId=id('autocab_booking');

 db.prepare(`
  INSERT INTO autocab_booking_webhooks(
   id,event_type,booking_id,company_id,row_version,
   passenger_name,passenger_mobile,passenger_email,
   pickup,destination,pickup_due_time,
   driver_cost,office_price,payment_method,
   capabilities_json,has_payment_capability,
   raw_json,status,received_at
  )
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  webhookId,
  eventType,
  bookingId||null,
  Number(b.Company?.Id??b.companyId??0)||null,
  Number(b.RowVersion??b.rowVersion??0)||null,
  String(b.Name||b.name||b.passengerName||'').trim(),
  String(b.TelephoneNumber||b.telephoneNumber||b.mobile||b.passengerMobile||'').trim(),
  String(b.CustomerEmail||b.customerEmail||b.email||'').trim(),
  String(pickup.Address||pickup.address||pickup.text||pickup.addressText||'').trim(),
  String(destination.Address||destination.address||destination.text||destination.addressText||'').trim(),
  b.PickupDueTimeUtc||b.pickupDueTimeUtc||b.PickupDueTime||b.pickupDueTime||null,
  Number(pricing.Cost??pricing.cost??0),
  Number(pricing.Price??pricing.price??0),
  String(b.PaymentMethod||b.paymentMethod||b.PaymentType||b.paymentType||'').trim(),
  JSON.stringify(capabilities),
  hasFleetPayCapability(capabilities)?1:0,
  JSON.stringify(raw),
  'received',
  receivedAt
 );

 return {bookingId,webhookId,receivedAt,b};
}


function autocabTerminalDriver(b){
 const driver=
  b?.DriverDetails?.Driver ||
  b?.driverDetails?.driver ||
  b?.Driver ||
  b?.driver ||
  {};

 let driverId=Number(
  driver.Id ??
  driver.id ??
  driver.DriverId ??
  driver.driverId ??
  0
 );

 if(!Number.isFinite(driverId) || driverId<=0) driverId=null;

 let callsign=String(
  driver.Callsign ??
  driver.callsign ??
  driver.CallSign ??
  driver.callSign ??
  ''
 ).trim();

 let driverName=String(
  driver.FullName ??
  driver.fullName ??
  driver.Name ??
  driver.name ??
  `${driver.Forename ?? driver.forename ?? ''} ${driver.Surname ?? driver.surname ?? ''}`.trim() ??
  ''
 ).trim();

 let cached=null;

 if(driverId){
  cached=cachedDriver(driverId);
 }

 if(!cached && callsign){
  cached=cacheRows().find(x=>String(x.callsign)===callsign)||null;
 }

 if(cached){
  driverId=Number(cached.driverId)||driverId;
  callsign=callsign||String(cached.callsign||'');
  driverName=driverName||String(cached.fullName||'');
 }

 return {driverId,callsign,driverName};
}

function applyCustomerJobState(bookingId,b,jobStatus){
 if(!bookingId)return null;

 const row=db.prepare(`
  SELECT *
  FROM customer_payments
  WHERE booking_id=?
    AND source='autocab_booking_created'
  ORDER BY created_at DESC
  LIMIT 1
 `).get(bookingId);

 if(!row)return null;

 const now=new Date().toISOString();
 const driver=autocabTerminalDriver(b);

 const paymentStatus=
  row.payment_status ||
  row.status ||
  'open';

 let settlementStatus='not_ready';

 if(jobStatus==='completed'){
  settlementStatus=
   paymentStatus==='paid'
    ? 'approved'
    : 'held';
 }

 if(jobStatus==='no_fare' || jobStatus==='cancelled'){
  settlementStatus=
   paymentStatus==='paid'
    ? 'review'
    : 'held';
 }

 let legacyStatus=row.status;

 // An unpaid cancelled booking must not remain payable.
 if(jobStatus==='cancelled' && paymentStatus!=='paid'){
  legacyStatus='cancelled';
 }

 db.prepare(`
  UPDATE customer_payments
  SET
   status=?,
   payment_status=CASE
    WHEN ?='cancelled' AND payment_status<>'paid'
    THEN 'cancelled'
    ELSE payment_status
   END,
   job_status=?,
   driver_settlement_status=?,
   driver_id=CASE
    WHEN ? IS NOT NULL THEN ?
    ELSE driver_id
   END,
   callsign=CASE
    WHEN ?<>'' THEN ?
    ELSE callsign
   END,
   driver_name=CASE
    WHEN ?<>'' THEN ?
    ELSE driver_name
   END,
   updated_at=?
  WHERE id=?
 `).run(
  legacyStatus,
  jobStatus,
  jobStatus,
  settlementStatus,
  driver.driverId,
  driver.driverId,
  driver.callsign,
  driver.callsign,
  driver.driverName,
  driver.driverName,
  now,
  row.id
 );

 return db.prepare(`
  SELECT *
  FROM customer_payments
  WHERE id=?
 `).get(row.id);
}

async function expireUnpaidCustomerCheckout(row){
 if(!row || !getStripeClient())return;

 const paymentStatus=
  row.payment_status ||
  row.status ||
  'open';

 if(paymentStatus==='paid')return;
 if(!row.provider_session_id)return;

 try{
  await getStripeClient().checkout.sessions.expire(row.provider_session_id);
 }catch(e){
  console.warn(
   '[FaivoPay] Stripe checkout expiry skipped/failed',
   {
    paymentId:row.id,
    bookingId:row.booking_id,
    error:e.message
   }
  );
 }
}

app.post(['/api/webhooks/autocab/booking-complete','/complete'],async(req,res)=>{
 try{
  const x=storeAutocabJobEvent(req.body||{},'BookingComplete');
  const payment=applyCustomerJobState(
   x.bookingId,
   x.b,
   'completed'
  );

  console.log('[FaivoPay] Autocab BookingComplete received',{
   bookingId:x.bookingId||null
  });

  res.status(200).json({
   ok:true,
   received:true,
   eventType:'BookingComplete',
   webhookId:x.webhookId,
   bookingId:x.bookingId||null
  });
 }catch(e){
  console.error('[FaivoPay] BookingComplete webhook error',e);
  res.status(500).json({ok:false,error:'BookingComplete webhook could not be stored'});
 }
});

app.post(['/api/webhooks/autocab/booking-nofare','/nofare'],async(req,res)=>{
 try{
  const x=storeAutocabJobEvent(req.body||{},'NoFare');
  const payment=applyCustomerJobState(
   x.bookingId,
   x.b,
   'no_fare'
  );

  console.log('[FaivoPay] Autocab NoFare received',{
   bookingId:x.bookingId||null
  });

  res.status(200).json({
   ok:true,
   received:true,
   eventType:'NoFare',
   webhookId:x.webhookId,
   bookingId:x.bookingId||null
  });
 }catch(e){
  console.error('[FaivoPay] NoFare webhook error',e);
  res.status(500).json({ok:false,error:'NoFare webhook could not be stored'});
 }
});

app.post(['/api/webhooks/autocab/booking-cancelled','/cancelled'],async(req,res)=>{
 try{
  const x=storeAutocabJobEvent(req.body||{},'BookingCancelled');

  const existing=x.bookingId
   ? db.prepare(`
      SELECT *
      FROM customer_payments
      WHERE booking_id=?
        AND source='autocab_booking_created'
      ORDER BY created_at DESC
      LIMIT 1
     `).get(x.bookingId)
   : null;

  const payment=applyCustomerJobState(
   x.bookingId,
   x.b,
   'cancelled'
  );

  if(existing){
   await expireUnpaidCustomerCheckout(existing);
  }

  console.log('[FaivoPay] Autocab BookingCancelled received',{
   bookingId:x.bookingId||null
  });

  res.status(200).json({
   ok:true,
   received:true,
   eventType:'BookingCancelled',
   webhookId:x.webhookId,
   bookingId:x.bookingId||null
  });
 }catch(e){
  console.error('[FaivoPay] BookingCancelled webhook error',e);
  res.status(500).json({ok:false,error:'BookingCancelled webhook could not be stored'});
 }
});


/*
 * Temporary Autocab Docket Modified webhook capture.
 *
 * This deliberately does NOT update customer payments, driver balances,
 * settlement state or docket state. It only records the raw webhook so
 * we can establish Autocab's exact payload contract before using it.
 */
db.exec(`
 CREATE TABLE IF NOT EXISTS autocab_docket_webhooks(
  id TEXT PRIMARY KEY,
  docket_id TEXT,
  docket_number TEXT,
  booking_id TEXT,
  event_type TEXT NOT NULL DEFAULT 'DocketModified',
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL
 )
`);

app.post(
 ['/api/webhooks/autocab/docket-modified','/dockets'],
 (req,res)=>{
  try{
   const raw=req.body||{};

   /*
    * We do not yet know Autocab's exact Docket Modified envelope,
    * so these are capture-only convenience fields. The full payload
    * is always retained in raw_json.
    */
   const d=
    raw.Docket ??
    raw.docket ??
    raw.Data ??
    raw.data ??
    raw;

   const docketId=String(
    d?.Id ??
    d?.id ??
    raw?.DocketId ??
    raw?.docketId ??
    ''
   ).trim();

   const docketNumber=String(
    d?.DocketNumber ??
    d?.docketNumber ??
    raw?.DocketNumber ??
    raw?.docketNumber ??
    ''
   ).trim();

   const bookingId=String(
    d?.BookingId ??
    d?.bookingId ??
    raw?.BookingId ??
    raw?.bookingId ??
    ''
   ).trim();

   const webhookId=id('docketwh');
   const receivedAt=new Date().toISOString();

   db.prepare(`
    INSERT INTO autocab_docket_webhooks(
     id,
     docket_id,
     docket_number,
     booking_id,
     event_type,
     raw_json,
     received_at
    )
    VALUES(?,?,?,?,?,?,?)
   `).run(
    webhookId,
    docketId||null,
    docketNumber||null,
    bookingId||null,
    'DocketModified',
    JSON.stringify(raw),
    receivedAt
   );

   console.log(
    '[FaivoPay] Autocab DocketModified received',
    {
     webhookId,
     docketId:docketId||null,
     docketNumber:docketNumber||null,
     bookingId:bookingId||null
    }
   );

   console.log(
    '[FaivoPay] Autocab DocketModified RAW\n'+
    JSON.stringify(raw,null,2)
   );

   res.status(200).json({
    ok:true,
    received:true,
    eventType:'DocketModified',
    webhookId
   });

  }catch(e){
   console.error(
    '[FaivoPay] DocketModified webhook capture error',
    e
   );

   res.status(500).json({
    ok:false,
    error:'DocketModified webhook could not be captured'
   });
  }
 }
);


/*
 * Temporary Autocab Vehicle Data / Vehicle Tracks webhook capture.
 *
 * Capture only. These routes deliberately do not update bookings,
 * payments, driver state, balances or settlements.
 */
db.exec(`
 CREATE TABLE IF NOT EXISTS autocab_vehicle_webhooks(
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  driver_id TEXT,
  vehicle_id TEXT,
  booking_id TEXT,
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL
 )
`);

db.exec(`
 CREATE TABLE IF NOT EXISTS driver_live_state(
  driver_id INTEGER PRIMARY KEY,
  driver_callsign TEXT,
  vehicle_id INTEGER,
  vehicle_callsign TEXT,
  vehicle_status TEXT,
  booking_id INTEGER,
  track_timestamp TEXT NOT NULL,
  updated_at TEXT NOT NULL
 )
`);

db.exec(`
 CREATE INDEX IF NOT EXISTS idx_driver_live_state_booking
 ON driver_live_state(booking_id)
`);


function updateDriverLiveStateFromTracks(raw){
 const tracks=Array.isArray(raw?.VehicleTracks)
  ? raw.VehicleTracks
  : (Array.isArray(raw?.vehicleTracks)?raw.vehicleTracks:[]);

 if(!tracks.length)return {processed:0,updated:0};

 const receivedAt=new Date().toISOString();

 const upsert=db.prepare(`
  INSERT INTO driver_live_state(
   driver_id,
   driver_callsign,
   vehicle_id,
   vehicle_callsign,
   vehicle_status,
   booking_id,
   track_timestamp,
   updated_at
  )
  VALUES(?,?,?,?,?,?,?,?)
  ON CONFLICT(driver_id) DO UPDATE SET
   driver_callsign=excluded.driver_callsign,
   vehicle_id=excluded.vehicle_id,
   vehicle_callsign=excluded.vehicle_callsign,
   vehicle_status=excluded.vehicle_status,
   booking_id=excluded.booking_id,
   track_timestamp=excluded.track_timestamp,
   updated_at=excluded.updated_at
  WHERE excluded.track_timestamp >= driver_live_state.track_timestamp
 `);

 let processed=0;
 let updated=0;

 for(const track of tracks){
  const driver=track?.Driver ?? track?.driver ?? {};
  const vehicle=track?.Vehicle ?? track?.vehicle ?? {};

  const driverId=Number(
   driver?.Id ??
   driver?.id ??
   driver?.DriverId ??
   driver?.driverId ??
   0
  );

  if(!Number.isFinite(driverId) || driverId<=0)continue;

  const driverCallsign=String(
   driver?.Callsign ??
   driver?.callsign ??
   ''
  ).trim();

  const vehicleId=Number(
   vehicle?.Id ??
   vehicle?.id ??
   0
  );

  const vehicleCallsign=String(
   vehicle?.Callsign ??
   vehicle?.callsign ??
   ''
  ).trim();

  const vehicleStatus=String(
   track?.VehicleStatus ??
   track?.vehicleStatus ??
   ''
  ).trim();

  const rawBookingId=Number(
   track?.BookingId ??
   track?.bookingId ??
   0
  );

  const bookingId=
   Number.isFinite(rawBookingId) && rawBookingId>0
    ? rawBookingId
    : null;

  const rawTimestamp=
   track?.Timestamp ??
   track?.timestamp ??
   receivedAt;

  const parsedTimestamp=new Date(rawTimestamp);

  const trackTimestamp=
   Number.isNaN(parsedTimestamp.getTime())
    ? receivedAt
    : parsedTimestamp.toISOString();

  processed++;

  const result=upsert.run(
   driverId,
   driverCallsign||null,
   Number.isFinite(vehicleId) && vehicleId>0 ? vehicleId : null,
   vehicleCallsign||null,
   vehicleStatus||null,
   bookingId,
   trackTimestamp,
   receivedAt
  );

  updated+=Number(result.changes||0);
 }

 return {processed,updated};
}


let vehicleTrackCleanupCounter=0;

function cleanupOldVehicleTrackWebhooks(){
 vehicleTrackCleanupCounter++;

 // VehicleTracksChanged can arrive roughly every second.
 // Clean only periodically so we do not run a DELETE per webhook.
 if(vehicleTrackCleanupCounter<300)return;

 vehicleTrackCleanupCounter=0;

 const cutoff=new Date(Date.now()-(15*60*1000)).toISOString();

 db.prepare(`
  DELETE FROM autocab_vehicle_webhooks
  WHERE event_type='VehicleTracksChanged'
    AND received_at<?
 `).run(cutoff);
}

function captureAutocabVehicleWebhook(eventType,raw){
 const payload=
  raw?.Vehicle ??
  raw?.vehicle ??
  raw?.Track ??
  raw?.track ??
  raw?.Data ??
  raw?.data ??
  raw ??
  {};

 const driver=
  payload?.Driver ??
  payload?.driver ??
  payload?.DriverDetails?.Driver ??
  payload?.driverDetails?.driver ??
  {};

 const driverId=String(
  driver?.Id ??
  driver?.id ??
  driver?.DriverId ??
  driver?.driverId ??
  payload?.DriverId ??
  payload?.driverId ??
  raw?.DriverId ??
  raw?.driverId ??
  ''
 ).trim();

 const vehicleId=String(
  payload?.VehicleId ??
  payload?.vehicleId ??
  payload?.Id ??
  payload?.id ??
  raw?.VehicleId ??
  raw?.vehicleId ??
  ''
 ).trim();

 const bookingId=String(
  payload?.BookingId ??
  payload?.bookingId ??
  payload?.CurrentBookingId ??
  payload?.currentBookingId ??
  raw?.BookingId ??
  raw?.bookingId ??
  ''
 ).trim();

 const webhookId=id('vehiclewh');
 const receivedAt=new Date().toISOString();

 db.prepare(`
  INSERT INTO autocab_vehicle_webhooks(
   id,event_type,driver_id,vehicle_id,booking_id,raw_json,received_at
  )
  VALUES(?,?,?,?,?,?,?)
 `).run(
  webhookId,
  eventType,
  driverId||null,
  vehicleId||null,
  bookingId||null,
  JSON.stringify(raw),
  receivedAt
 );

 console.log(`[FaivoPay] Autocab ${eventType} received`,{
  webhookId,
  driverId:driverId||null,
  vehicleId:vehicleId||null,
  bookingId:bookingId||null
 });

 return {webhookId,driverId,vehicleId,bookingId};
}

app.post(
 ['/api/webhooks/autocab/vehicle-data','/data'],
 (req,res)=>{
  try{
   const x=captureAutocabVehicleWebhook('VehicleDataChanged',req.body||{});
   res.status(200).json({ok:true,received:true,eventType:'VehicleDataChanged',webhookId:x.webhookId});
  }catch(e){
   console.error('[FaivoPay] VehicleDataChanged capture error',e);
   res.status(500).json({ok:false,error:'Vehicle data webhook could not be captured'});
  }
 }
);

app.post(
 ['/api/webhooks/autocab/vehicle-tracks','/track'],
 (req,res)=>{
  try{
   const raw=req.body||{};
   const x=captureAutocabVehicleWebhook('VehicleTracksChanged',raw);
   const liveState=updateDriverLiveStateFromTracks(raw);
   cleanupOldVehicleTrackWebhooks();

   res.status(200).json({
    ok:true,
    received:true,
    eventType:'VehicleTracksChanged',
    webhookId:x.webhookId,
    liveStateProcessed:liveState.processed
   });
  }catch(e){
   console.error('[FaivoPay] VehicleTracksChanged capture error',e);
   res.status(500).json({ok:false,error:'Vehicle tracks webhook could not be captured'});
  }
 }
);

function getSettings(){
 const rows=db.prepare('SELECT key,value FROM settings').all(); const out={...defaultSettings};
 for(const r of rows){ try{out[r.key]=JSON.parse(r.value)}catch{out[r.key]=r.value} } return out;
}
function setSettings(obj){
 const st=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
 for(const [k,v] of Object.entries(obj)) st.run(k, JSON.stringify(v)); return getSettings();
}
function id(prefix){return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`}

const SECURE_KEY=crypto.createHash('sha256').update(String(SETTINGS_ENCRYPTION_SECRET)).digest();
const LEGACY_SECURE_KEY=crypto.createHash('sha256').update(String(TOKEN_SECRET)).digest();

function encryptSecretWithKey(value,key){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(String(value||''),'utf8'),cipher.final()]),tag=cipher.getAuthTag();
 return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptSecretWithKey(value,key){
 try{
  const [a,b,c]=String(value||'').split('.');
  if(!a||!b||!c)return '';
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(a,'base64url'));
  decipher.setAuthTag(Buffer.from(b,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(c,'base64url')),decipher.final()]).toString('utf8');
 }catch{return ''}
}
function encryptSecret(value){return encryptSecretWithKey(value,SECURE_KEY)}
function decryptSecret(value){
 const current=decryptSecretWithKey(value,SECURE_KEY);
 if(current)return current;
 if(!SECURE_KEY.equals(LEGACY_SECURE_KEY))return decryptSecretWithKey(value,LEGACY_SECURE_KEY);
 return '';
}
function setSecureSetting(key,value){
 if(value===undefined||value===null||value==='')return;
 db.prepare('INSERT INTO secure_settings(key,value_enc,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_enc=excluded.value_enc,updated_at=excluded.updated_at').run(key,encryptSecret(value),new Date().toISOString());
}
function getSecureSetting(key){const r=db.prepare('SELECT value_enc FROM secure_settings WHERE key=?').get(key);return r?decryptSecret(r.value_enc):''}

function templateText(input,vars={}){return String(input||'').replace(/\{([a-zA-Z0-9_]+)\}/g,(_,k)=>vars[k]??'')}
function dateTimeVars(extra={}){const now=new Date();return {date:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'}).format(now),time:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).format(now),...extra}}
function feeSplitPercent(type,settings=getSettings()){
 if(type==='customer_payment')return Math.min(100,Math.max(0,Number(settings.customerFeeFleetPayPercent??100)));
 if(type==='early_payout')return Math.min(100,Math.max(0,Number(settings.earlyPayoutFeeFleetPayPercent??100)));
 return Math.min(100,Math.max(0,Number(settings.weeklyFeeFleetPayPercent??100)));
}
function recordFee({feeType,sourceType,sourceId,driverId=null,callsign='',description='',amount=0,createdAt=null}){
 const gross=Math.max(0,Number(amount||0));if(gross<=0)return null;const pct=feeSplitPercent(feeType),fleet=Number((gross*pct/100).toFixed(2)),taxi=Number((gross-fleet).toFixed(2));
 const existing=db.prepare('SELECT * FROM fee_ledger WHERE fee_type=? AND source_type=? AND source_id=?').get(feeType,sourceType,String(sourceId));if(existing)return existing;
 const rowId=id('fee'),at=createdAt||new Date().toISOString();db.prepare('INSERT INTO fee_ledger(id,fee_type,source_type,source_id,driver_id,callsign,description,gross_fee,fleetpay_share,taxi_company_share,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(rowId,feeType,sourceType,String(sourceId),driverId,callsign||'',description||'',gross,fleet,taxi,'uninvoiced',at);return db.prepare('SELECT * FROM fee_ledger WHERE id=?').get(rowId)
}
function logCommunication({channel,recipient='',templateKey='',entityType='',entityId='',status='sent',providerRef='',error=''}){db.prepare('INSERT INTO communications_log(id,channel,recipient,template_key,entity_type,entity_id,status,provider_ref,error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id('comm'),channel,recipient,templateKey,entityType,entityId?String(entityId):'',status,providerRef||'',error||'',new Date().toISOString())}
function safeEmail(v=''){return String(v).trim().toLowerCase()}
function last4(v=''){return String(v).replace(/\D/g,'').slice(-4)}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')}}
function verifyPassword(password,salt,hash){try{return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hash,'hex'))}catch{return false}}
function base32Encode(buffer){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out='';
 for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}}
 if(bits>0)out+=alphabet[(value<<(5-bits))&31];return out;
}
function base32Decode(value){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,acc=0;const out=[];
 for(const ch of String(value||'').toUpperCase().replace(/=|\s/g,'')){const i=alphabet.indexOf(ch);if(i<0)continue;acc=(acc<<5)|i;bits+=5;if(bits>=8){out.push((acc>>>(bits-8))&255);bits-=8}}
 return Buffer.from(out);
}
function totpCode(secret,time=Date.now(),stepOffset=0){
 const counter=Math.floor(time/30000)+stepOffset,b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));
 const h=crypto.createHmac('sha1',base32Decode(secret)).update(b).digest(),off=h[h.length-1]&15;
 const n=(h.readUInt32BE(off)&0x7fffffff)%1000000;return String(n).padStart(6,'0');
}
function verifyTotp(secret,code){const c=String(code||'').replace(/\D/g,'');if(c.length!==6)return false;return [-1,0,1].some(o=>{const expected=totpCode(secret,Date.now(),o);return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(c))})}
function newMfaSecret(){return base32Encode(crypto.randomBytes(20))}
function isPlatformAdmin(staffId){
 if(!staffId)return false;
 return Boolean(db.prepare('SELECT 1 FROM platform_admins WHERE staff_id=?').get(staffId));
}
function ensurePlatformAdminGrant(staffId,grantedBy='bootstrap'){
 if(!staffId)return;
 db.prepare('INSERT OR IGNORE INTO platform_admins(staff_id,granted_at,granted_by) VALUES(?,?,?)')
  .run(staffId,new Date().toISOString(),grantedBy);
}
function staffSafe(u){return {id:u.id,email:u.email,name:u.name,role:u.role,platformAdmin:isPlatformAdmin(u.id),mfaEnabled:Boolean(u.mfa_enabled),active:Boolean(u.active),createdAt:u.created_at,updatedAt:u.updated_at,lastLoginAt:u.last_login_at}}
function makeOtpAuth(email,secret){
 const issuer=`FaivoPay ${APP_ENV_LABEL}`;
 const label=`${issuer}:${email}`;
 return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
function ensureBootstrapAdmin(){
 const email=safeEmail(ADMIN_EMAIL);if(!email||!ADMIN_PASSWORD)return;
 const existing=db.prepare('SELECT id FROM staff_users WHERE email=?').get(email);
 if(existing){
  ensurePlatformAdminGrant(existing.id,'bootstrap');
  return;
 }
 const hp=hashPassword(ADMIN_PASSWORD),now=new Date().toISOString(),staffId=id('staff');
 db.prepare('INSERT INTO staff_users(id,email,name,role,password_hash,password_salt,mfa_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(staffId,email,'FaivoPay Administrator','administrator',hp.hash,hp.salt,0,1,now,now);
 ensurePlatformAdminGrant(staffId,'bootstrap');
}

function signToken(payload,hours=24*30){const body=Buffer.from(JSON.stringify({...payload,exp:Date.now()+hours*3600000})).toString('base64url');const sig=crypto.createHmac('sha256',TOKEN_SECRET).update(body).digest('base64url');return `${body}.${sig}`}
function verifyToken(token){try{const [b,s]=String(token||'').split('.');if(!b||!s)return null;const e=crypto.createHmac('sha256',TOKEN_SECRET).update(b).digest('base64url');if(s.length!==e.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e)))return null;const p=JSON.parse(Buffer.from(b,'base64url').toString());return p.exp>Date.now()?p:null}catch{return null}}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function adminAuth(req,res,next){const p=verifyToken(bearer(req));if(p?.role!=='admin'||p?.mfa!==true)return res.status(401).json({error:'Office authentication required'});req.auth=p;next()}
const staffRoleRank={readonly:1,office:2,finance:3,administrator:4};
function requireStaffRole(...roles){return (req,res,next)=>{if(!roles.includes(req.auth?.staffRole))return res.status(403).json({error:'You do not have permission for this action'});next()}}

function requirePlatformAdmin(req,res,next){
 const u=req.auth?.staffId?db.prepare('SELECT id,active,role FROM staff_users WHERE id=?').get(req.auth.staffId):null;
 if(!u||!u.active||u.role!=='administrator'||!isPlatformAdmin(u.id)){
  return res.status(403).json({error:'Platform Administrator access is required'});
 }
 next();
}

function companySlug(value){
 return String(value||'company').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'company';
}
function companyPublic(row){
 if(!row)return null;
 return {
  id:row.id,
  name:row.name,
  slug:row.slug,
  status:row.status,
  primaryDomain:row.primary_domain||'',
  supportEmail:row.support_email||'',
  supportPhone:row.support_phone||'',
  timezone:row.timezone||'Europe/London',
  createdAt:row.created_at,
  updatedAt:row.updated_at
 };
}
function getCompanySetting(companyId,key,fallback=''){
 const r=db.prepare('SELECT value FROM company_settings WHERE company_id=? AND key=?').get(companyId,key);
 if(!r)return fallback;
 try{return JSON.parse(r.value)}catch{return r.value}
}
function setCompanySetting(companyId,key,value){
 db.prepare(`INSERT INTO company_settings(company_id,key,value,updated_at)
 VALUES(?,?,?,?)
 ON CONFLICT(company_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
  .run(companyId,key,JSON.stringify(value),new Date().toISOString());
}
function getCompanySecureSetting(companyId,key){
 const r=db.prepare('SELECT value_enc FROM company_secure_settings WHERE company_id=? AND key=?').get(companyId,key);
 return r?decryptSecret(r.value_enc):'';
}
function setCompanySecureSetting(companyId,key,value){
 if(value===undefined||value===null||String(value)==='')return;
 db.prepare(`INSERT INTO company_secure_settings(company_id,key,value_enc,updated_at)
 VALUES(?,?,?,?)
 ON CONFLICT(company_id,key) DO UPDATE SET value_enc=excluded.value_enc,updated_at=excluded.updated_at`)
  .run(companyId,key,encryptSecret(value),new Date().toISOString());
}
function companySecretConfigured(companyId,key){
 return Boolean(db.prepare('SELECT 1 FROM company_secure_settings WHERE company_id=? AND key=?').get(companyId,key));
}
function ensureDefaultCompany(){
 const count=Number(db.prepare('SELECT COUNT(*) count FROM companies').get()?.count||0);
 if(count)return;
 const settings=getSettings(),now=new Date().toISOString();
 let domain='';
 try{domain=new URL(PUBLIC_BASE_URL).hostname}catch{}
 const name=String(settings.companyName||'Need-A-Cab').trim()||'Need-A-Cab';
 db.prepare(`INSERT INTO companies(
  id,name,slug,status,primary_domain,support_email,support_phone,timezone,created_at,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
  'company_primary',
  name,
  companySlug(name),
  'active',
  domain,
  safeEmail(settings.officeNotificationEmail||ADMIN_EMAIL),
  '',
  'Europe/London',
  now,
  now
 );
}

function runtimeCompanyId(){
 const row=db.prepare(`
  SELECT id
  FROM companies
  WHERE status IN ('active','live')
  ORDER BY CASE WHEN id='company_primary' THEN 0 ELSE 1 END, created_at
  LIMIT 1
 `).get();
 return row?.id||'';
}

function runtimeCompanySetting(key,fallback=''){
 const companyId=runtimeCompanyId();
 if(!companyId)return fallback;

 const value=getCompanySetting(companyId,key,undefined);
 return value===undefined||value===null||value===''?fallback:value;
}

function runtimeCompanySecret(key,fallback=''){
 const companyId=runtimeCompanyId();
 if(!companyId)return fallback;

 return getCompanySecureSetting(companyId,key)||fallback;
}

function getAutocabApiKey(){
 return String(runtimeCompanySecret('autocabApiKey',API_KEY)||'').trim();
}

function getAutocabCompanyIds(){
 const configured=String(runtimeCompanySetting('autocabCompanyIds','')||'').trim();

 if(!configured)return COMPANY_IDS;

 const ids=configured
  .split(',')
  .map(x=>Number(String(x).trim()))
  .filter(Number.isFinite)
  .filter(x=>x>0);

 return ids.length?ids:COMPANY_IDS;
}

function getStripeSecretKey(){
 return String(runtimeCompanySecret('stripeSecretKey',STRIPE_SECRET_KEY)||'').trim();
}

function getStripeWebhookSecret(){
 return String(runtimeCompanySecret('stripeWebhookSecret',STRIPE_WEBHOOK_SECRET)||'').trim();
}

let stripeClientCacheKey='';
let stripeClientCache=null;

function getStripeClient(){
 const key=getStripeSecretKey();

 if(!key)return null;

 if(stripeClientCache && stripeClientCacheKey===key){
  return stripeClientCache;
 }

 stripeClientCacheKey=key;
 stripeClientCache=new Stripe(key);

 return stripeClientCache;
}

function getSendGridConfig(){
 return {
  apiKey:String(runtimeCompanySecret('sendgridApiKey',SENDGRID_API_KEY)||'').trim(),
  fromEmail:String(runtimeCompanySetting('sendgridFromEmail',SENDGRID_FROM_EMAIL)||'').trim(),
  fromName:String(runtimeCompanySetting('sendgridFromName',SENDGRID_FROM_NAME)||'FaivoPay').trim()||'FaivoPay'
 };
}

function getTwilioConfig(){
 return {
  accountSid:String(runtimeCompanySetting('twilioAccountSid',TWILIO_ACCOUNT_SID)||'').trim(),
  authToken:String(runtimeCompanySecret('twilioAuthToken',TWILIO_AUTH_TOKEN)||'').trim(),
  messagingServiceSid:String(runtimeCompanySetting('twilioMessagingServiceSid',TWILIO_MESSAGING_SERVICE_SID)||'').trim(),
  fromNumber:String(runtimeCompanySetting('twilioFromNumber',TWILIO_FROM_NUMBER)||'').trim()
 };
}


function driverAuth(req,res,next){const p=verifyToken(bearer(req));if(!p?.driverId)return res.status(401).json({error:'Authentication required'});req.auth=p;next()}
function audit(req,actorType,actorId,action,entityType=null,entityId=null,details={}){let displayActor=String(actorId||'');if(actorType==='driver'){const d=cachedDriver(Number(actorId));if(d?.callsign)displayActor=d.callsign}db.prepare('INSERT INTO audit_logs(created_at,actor_type,actor_id,action,entity_type,entity_id,details_json,ip) VALUES(?,?,?,?,?,?,?,?)').run(new Date().toISOString(),actorType,displayActor,action,entityType,entityId?String(entityId):null,JSON.stringify(details||{}),req?.ip||'')}

const headers=()=>({'Content-Type':'application/json','Cache-Control':'no-cache','Ocp-Apim-Subscription-Key':getAutocabApiKey()});
async function putJson(url,body){if(!getAutocabApiKey())throw new Error('AUTOCAB_API_KEY is not configured');const r=await fetch(url,{method:'PUT',headers:headers(),body:JSON.stringify(body)});const text=await r.text();if(!r.ok)throw new Error(`Autocab ${r.status}: ${text.slice(0,500)}`);try{return text?JSON.parse(text):{ok:true}}catch{return {ok:true,raw:text}}}
async function postJson(url,body){if(!getAutocabApiKey())throw new Error('AUTOCAB_API_KEY is not configured');const r=await fetch(url,{method:'POST',headers:headers(),body:JSON.stringify(body)});if(!r.ok)throw new Error(`Autocab ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json()}

async function getJson(url){
 if(!getAutocabApiKey())throw new Error('AUTOCAB_API_KEY is not configured');
 const r=await fetch(url,{method:'GET',headers:headers()});
 const text=await r.text();
 if(!r.ok)throw new Error(`Autocab ${r.status}: ${text.slice(0,500)}`);
 try{return text?JSON.parse(text):{}}
 catch{throw new Error(`Autocab returned invalid JSON: ${text.slice(0,300)}`)}
}

async function releaseFleetPayBooking(paymentId){
 const item=db.prepare('SELECT * FROM customer_payments WHERE id=?').get(paymentId);
 if(!item)throw new Error(`Customer payment ${paymentId} not found`);

 if(
  !['autocab_booking_created','driver_live_booking']
   .includes(String(item.source||''))
 ){
  return {ok:true,skipped:true,reason:'not_autocab'};
 }

 if(item.payment_status!=='paid' && item.status!=='paid'){
  return {ok:true,skipped:true,reason:'not_paid'};
 }

 if(['completed','cancelled','no_fare'].includes(String(item.job_status||''))){
  return {ok:true,skipped:true,reason:`terminal_${item.job_status}`};
 }

 if(item.job_status==='ready' || item.job_status==='dispatched'){
  return {ok:true,skipped:true,reason:item.job_status};
 }

 const bookingId=String(item.booking_id||'').trim();
 if(!bookingId)throw new Error(`Customer payment ${paymentId} has no Autocab booking ID`);

 const fareAmount=Math.round(Number(item.fare_amount||0)*100)/100;
 if(!Number.isFinite(fareAmount) || fareAmount<=0){
  throw new Error(`Invalid fare amount for booking ${bookingId}: ${item.fare_amount}`);
 }

 const attemptAt=new Date().toISOString();

 db.prepare(`
  UPDATE customer_payments
  SET autocab_release_status='pending',
      autocab_release_attempts=COALESCE(autocab_release_attempts,0)+1,
      autocab_release_error=NULL,
      updated_at=?
  WHERE id=?
 `).run(attemptAt,item.id);

 const url=`${BASE_URL}/booking/v1/booking/${encodeURIComponent(bookingId)}`;
 const booking=await getJson(url);

 if(!booking || typeof booking!=='object'){
  throw new Error(`Autocab booking ${bookingId} returned no booking object`);
 }

 if(!booking.pricing || typeof booking.pricing!=='object'){
  throw new Error(`Autocab booking ${bookingId} has no pricing object`);
 }

 /*
  * FaivoPay service fee is NOT written to Autocab.
  * Autocab receives the journey fare only.
  */
 booking.customerId=AUTOCAB_FLEETPAY_CUSTOMER_ID;
 booking.customerDisplayName=AUTOCAB_FLEETPAY_CUSTOMER_NAME;
 booking.accountCode=AUTOCAB_FLEETPAY_ACCOUNT_CODE;
 booking.hasSpecialAccount=false;
 booking.paymentType='Account';
 booking.paymentMethod='Cash';

 /*
  * fareAmount is the driver's Autocab Cost.
  *
  * Preserve Autocab's existing Price. Cost and Price are not guaranteed
  * to be the same and FaivoPay must not collapse the two values.
  *
  * The journey is moved to the FaivoPay account for the driver's cost
  * only. The FaivoPay customer service fee never enters Autocab.
  */
 booking.pricing.cost=fareAmount;
 booking.pricing.accountAmount=fareAmount;
 booking.pricing.cardAmount=0;
 booking.pricing.cashAmount=0;

 booking.capabilities=(booking.capabilities||[]).filter(cap=>{
  const capabilityId=Number(cap?.id ?? cap?.Id ?? cap);
  return capabilityId!==AUTOCAB_FLEETPAY_CAPABILITY_ID;
 });

 const response=await postJson(url,booking);

 /*
  * A terminal webhook may have arrived while the Autocab request
  * was in flight, so only promote release_pending -> ready.
  */
 const now=new Date().toISOString();
 const result=db.prepare(`
  UPDATE customer_payments
  SET job_status='ready',
      autocab_release_status='completed',
      autocab_release_error=NULL,
      autocab_released_at=?,
      updated_at=?
  WHERE id=?
    AND payment_status='paid'
    AND job_status='release_pending'
 `).run(now,now,item.id);

 return {
  ok:true,
  bookingId,
  fareAmount,
  autocabResponse:response,
  markedReady:Number(result.changes||0)>0
 };
}

async function getActiveDrivers(){
 const groups=await Promise.all(getAutocabCompanyIds().map(async companyId=>{
  const drivers=await postJson(`${BASE_URL}/driver/v1/drivers/active`,{CompanyId:companyId,ActiveStatusType:'Active'});
  return (drivers||[]).map(d=>({...d,companyId}));
 }));
 const byId=new Map();
 for(const d of groups.flat())byId.set(Number(d.id),d);
 return [...byId.values()];
}
async function getDriverAccounts(){return postJson(`${BASE_URL}/accounts/v1/DriversAccounts?pageno=1&pagesize=1000`,{companyId:null,driverId:null})}
function mergeDrivers(drivers,accountsResponse){const accounts=accountsResponse?.summaries||[];const byId=new Map(accounts.map(a=>[Number(a.driverId),a]));return (drivers||[]).map(d=>{const a=byId.get(Number(d.id));return {driverId:d.id,callsign:d.callsign,forename:d.forename,surname:d.surname,fullName:d.fullName||`${d.forename||''} ${d.surname||''}`.trim(),mobile:d.mobile||d.telephone||'',email:d.email||'',active:Boolean(d.active),suspended:Boolean(d.suspended),previousBalance:a?.previousBalance??null,currentBalance:a?.currentBalance??null,lastProcessed:a?.lastProcessed??null,lastProcessedBy:a?.lastProcessedBy??null,notes:a?.notes??'',totals:a?{allJobsTotal:a.allJobsTotal??0,cashJobsTotal:a.cashJobsTotal??0,accountJobsTotal:a.accountJobsTotal??0,cardJobsTotal:a.cardJobsTotal??0,driverTransactionsTotal:a.driverTransactionsTotal??0,groupTransactionsTotal:a.groupTransactionsTotal??0,pendingTransactionsTotal:a.pendingTransactionsTotal??0,paidInTotal:a.paidInTotal??0,paidOutTotal:a.paidOutTotal??0,vatAmount:a.vatAmount??0,allJobsCommission:a.allJobsCommission??0}:null}})}
async function getMergedDrivers(){const [d,a]=await Promise.all([getActiveDrivers(),getDriverAccounts()]);return mergeDrivers(d,a)}
function cacheRows(){return db.prepare('SELECT * FROM driver_cache ORDER BY CAST(callsign AS INTEGER), callsign').all().map(r=>({driverId:r.driver_id,callsign:r.callsign,forename:r.forename,surname:r.surname,fullName:r.full_name,mobile:r.mobile,email:r.email,active:Boolean(r.active),suspended:Boolean(r.suspended),previousBalance:r.previous_balance,currentBalance:r.current_balance,lastProcessed:r.last_processed,lastProcessedBy:r.last_processed_by,notes:r.notes,totals:r.totals_json?JSON.parse(r.totals_json):null,syncedAt:r.synced_at,payoutExcluded:Boolean(r.payout_excluded),payoutExclusionReason:r.payout_exclusion_reason||''}))}
function cachedDriver(driverId){const r=db.prepare('SELECT * FROM driver_cache WHERE driver_id=?').get(driverId);if(!r)return null;return {driverId:r.driver_id,callsign:r.callsign,forename:r.forename,surname:r.surname,fullName:r.full_name,mobile:r.mobile,email:r.email,active:Boolean(r.active),suspended:Boolean(r.suspended),previousBalance:r.previous_balance,currentBalance:r.current_balance,lastProcessed:r.last_processed,lastProcessedBy:r.last_processed_by,notes:r.notes,totals:r.totals_json?JSON.parse(r.totals_json):null,syncedAt:r.synced_at,payoutExcluded:Boolean(r.payout_excluded),payoutExclusionReason:r.payout_exclusion_reason||''}}
let syncInFlight=null;
async function syncAutocab(){if(syncInFlight)return syncInFlight;syncInFlight=(async()=>{const drivers=await getMergedDrivers(),now=new Date().toISOString(),weekStart=mondayWeekStart();const st=db.prepare(`INSERT INTO driver_cache(driver_id,callsign,forename,surname,full_name,mobile,email,active,suspended,previous_balance,current_balance,last_processed,last_processed_by,notes,totals_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(driver_id) DO UPDATE SET callsign=excluded.callsign,forename=excluded.forename,surname=excluded.surname,full_name=excluded.full_name,mobile=excluded.mobile,email=excluded.email,active=excluded.active,suspended=excluded.suspended,previous_balance=excluded.previous_balance,current_balance=excluded.current_balance,last_processed=excluded.last_processed,last_processed_by=excluded.last_processed_by,notes=excluded.notes,totals_json=excluded.totals_json,synced_at=excluded.synced_at`);const activity=db.prepare(`INSERT INTO driver_weekly_activity(driver_id,week_start,worked,first_seen_at,last_seen_at,max_all_jobs_total) VALUES(?,?,?,?,?,?) ON CONFLICT(driver_id,week_start) DO UPDATE SET worked=1,last_seen_at=excluded.last_seen_at,max_all_jobs_total=MAX(driver_weekly_activity.max_all_jobs_total,excluded.max_all_jobs_total)`);for(const d of drivers){st.run(d.driverId,d.callsign,d.forename,d.surname,d.fullName,d.mobile,d.email,d.active?1:0,d.suspended?1:0,d.previousBalance,d.currentBalance,d.lastProcessed,d.lastProcessedBy,d.notes,JSON.stringify(d.totals||null),now);const jobs=Number(d.totals?.allJobsTotal||0);if(jobs>0)activity.run(d.driverId,weekStart,1,now,now,jobs)}return {drivers,syncedAt:now}})();try{return await syncInFlight}finally{syncInFlight=null}}
function notify(driverId,title,message,type='info',referenceId=null){db.prepare('INSERT INTO driver_notifications(id,driver_id,title,message,type,reference_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id('note'),driverId,title,message,type,referenceId,new Date().toISOString());sendPush(driverId,title,message).catch(()=>{})}

async function postAutocabAdjustment({driverId,callsign,amount,isCredit,description,adjustmentReason,eventKey,force=false}){
 if(!AUTOCAB_ADJUSTMENTS_ENABLED && !force) throw new Error('Autocab adjustments are disabled. Set AUTOCAB_ADJUSTMENTS_ENABLED=true to enable writes.');
 const existing=db.prepare('SELECT * FROM autocab_adjustments WHERE event_key=?').get(eventKey);
 if(existing?.status==='completed') return {duplicate:true,existing};
 const adjustmentId=existing?.id||id('adj'),now=new Date().toISOString();
 if(!existing) db.prepare('INSERT INTO autocab_adjustments(id,event_key,driver_id,callsign,amount,is_credit,description,adjustment_reason,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(adjustmentId,eventKey,driverId,callsign,Number(amount),isCredit?1:0,description,adjustmentReason||'', 'pending', now);
 try{
  const response=await putJson(`${BASE_URL}/driver/v1/accounts/driveraccounts/${driverId}/adjustment`,{amount:Number(amount),description,isCredit:Boolean(isCredit),adjustmentReason:adjustmentReason||'FleetPay'});
  const completedAt=new Date().toISOString();
  db.prepare('UPDATE autocab_adjustments SET status=?,response_json=?,completed_at=?,error=NULL WHERE id=?').run('completed',JSON.stringify(response||{}),completedAt,adjustmentId);
  db.prepare('UPDATE driver_cache SET current_balance=COALESCE(current_balance,0)+?,synced_at=? WHERE driver_id=?').run(isCredit?Number(amount):-Number(amount),completedAt,driverId);
  return {ok:true,id:adjustmentId,response,completedAt};
 }catch(e){db.prepare('UPDATE autocab_adjustments SET status=?,error=? WHERE id=?').run('failed',e.message,adjustmentId);throw e}
}

async function postAutocabAdjustmentSafelyOnce(args){
 const eventKey=String(args?.eventKey||'').trim();

 if(!eventKey){
  throw new Error(
   'A unique Autocab event key is required for a safe one-time adjustment'
  );
 }

 const existing=db.prepare(`
  SELECT *
  FROM autocab_adjustments
  WHERE event_key=?
 `).get(eventKey);

 if(existing?.status==='completed'){
  return {
   duplicate:true,
   existing
  };
 }

 if(existing){
  throw new Error(
   `Autocab adjustment ${eventKey} is ${existing.status}. `+
   'FaivoPay will not resend it automatically because the previous Autocab outcome may be uncertain. Review the adjustment before retrying.'
  );
 }

 return postAutocabAdjustment(args);
}

async function settlePaymentPlanActivationInAutocab(plan,source){
 const d=cachedDriver(plan.driver_id);
 const callsign=plan.callsign||source.callsign||d?.callsign||String(plan.driver_id);
 const adjustments=[];

 const fee=Number(source.weekly_fee||0);
 const carried=Number(source.carried_charges||0);
 const principal=Number(plan.plan_amount||0);

 if(fee>0){
  adjustments.push(
   await postAutocabAdjustmentSafelyOnce({
    driverId:plan.driver_id,
    callsign,
    amount:fee,
    isCredit:false,
    description:'FaivoPay weekly app fee',
    adjustmentReason:'FleetPay Fee',
    eventKey:`plan:${plan.id}:activation:fee`
   })
  );
 }

 if(carried>0){
  adjustments.push(
   await postAutocabAdjustmentSafelyOnce({
    driverId:plan.driver_id,
    callsign,
    amount:carried,
    isCredit:false,
    description:'FaivoPay carried charge',
    adjustmentReason:'FleetPay Carried Charge',
    eventKey:`plan:${plan.id}:activation:carried`
   })
  );
 }

 if(principal>0){
  adjustments.push(
   await postAutocabAdjustmentSafelyOnce({
    driverId:plan.driver_id,
    callsign,
    amount:principal,
    isCredit:true,
    description:'FaivoPay payment plan activated',
    adjustmentReason:'FleetPay Payment Plan',
    eventKey:`plan:${plan.id}:activation:principal`
   })
  );
 }

 return adjustments;
}

async function settlePayoutInAutocab(item){
 const d=cachedDriver(item.driver_id); const callsign=item.callsign||d?.callsign||String(item.driver_id),settings=getSettings();
 const adjustments=[];
 const fee=Number(item.type==='early'?item.fee:item.weekly_fee||0); const carried=Number(item.type==='weekly'?item.carried_charges||0:0); const paid=Number(item.net_amount||item.amount||0);
 if(fee>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:fee,isCredit:false,description:item.type==='early'?'FaivoPay early payout fee':'FaivoPay weekly app fee',adjustmentReason:'FleetPay Fee',eventKey:`payout:${item.id}:fee`}));
 if(carried>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:carried,isCredit:false,description:'FaivoPay carried charge',adjustmentReason:'FleetPay Carried Charge',eventKey:`payout:${item.id}:carried`}));
 if(paid>0){const vars=dateTimeVars({callsign,amount:paid.toFixed(2)}),description=templateText(item.type==='early'?settings.earlyPayoutReasonTemplate:settings.weeklyPayoutReasonTemplate,vars)||`${item.type==='early'?'FaivoPay Early Payout':'FaivoPay Weekly Payout'} ${vars.date} ${vars.time}`;adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:paid,isCredit:false,description,adjustmentReason:item.type==='early'?'FleetPay Early Payout':'FleetPay Weekly Payout',eventKey:`payout:${item.id}:payment`}))}
 return adjustments;
}
async function settlePaymentRequestInAutocab(item){
 const d=cachedDriver(item.driver_id); const callsign=item.callsign||d?.callsign||String(item.driver_id); const adjustments=[];
 const fee=Number(item.weekly_fee||0),carried=Number(item.carried_charges||0),received=Number(item.amount||0);
 if(fee>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:fee,isCredit:false,description:'FaivoPay weekly app fee',adjustmentReason:'FleetPay Fee',eventKey:`request:${item.id}:fee`}));
 if(carried>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:carried,isCredit:false,description:'FaivoPay carried charge',adjustmentReason:'FleetPay Carried Charge',eventKey:`request:${item.id}:carried`}));
 if(received>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:received,isCredit:true,description:'FaivoPay payment received',adjustmentReason:'FleetPay Payment',eventKey:`request:${item.id}:payment`}));
 return adjustments;
}
async function sendPush(driverId,title,message,url='/driver'){
 if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)return;
 const rows=db.prepare('SELECT * FROM push_subscriptions WHERE driver_id=?').all(driverId);
 const payload=JSON.stringify({title,message,url});
 for(const r of rows){try{await webpush.sendNotification(JSON.parse(r.subscription_json),payload)}catch(e){if([404,410].includes(e.statusCode))db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(r.id)}}
}
async function testWiseConnection(){
 if(!WISE_API_TOKEN) throw new Error('WISE_API_TOKEN is not configured');
 const paths=WISE_PROFILE_ID?[`/v2/profiles/${WISE_PROFILE_ID}`,`/v1/profiles`]:['/v1/profiles'];
 let lastErr=null;
 for(const pathName of paths){try{const r=await fetch(`${WISE_BASE_URL}${pathName}`,{headers:{Authorization:`Bearer ${WISE_API_TOKEN}`,Accept:'application/json'}});const text=await r.text();if(!r.ok)throw new Error(`Wise ${r.status}: ${text.slice(0,300)}`);let data;try{data=JSON.parse(text)}catch{data=text}return {ok:true,environment:WISE_ENV,baseUrl:WISE_BASE_URL,data}}catch(e){lastErr=e}}
 throw lastErr||new Error('Wise connection failed');
}

function ledger(driverId,entryType,direction,amount,feeAmount,description,referenceId,status='completed'){
 db.prepare(
   'INSERT INTO driver_ledger(id,driver_id,entry_type,direction,amount,fee_amount,description,reference_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
 ).run(
   id('ledger'),
   driverId,
   entryType,
   direction,
   Number(amount||0),
   Number(feeAmount||0),
   description,
   referenceId,
   status,
   new Date().toISOString()
 );
}

async function createStripePaymentRequest(item){
 if(!getStripeClient()) return null;

 if(item.payment_url && item.provider_session_id){
   let existingSession;

   try{
    existingSession=
     await getStripeClient().checkout.sessions.retrieve(
      item.provider_session_id
     );
   }catch(e){
    throw new Error(
     `FaivoPay could not verify the existing Stripe payment link: ${e.message}`
    );
   }

   if(existingSession?.status==='open'){
    return {
     id:item.provider_session_id,
     url:item.payment_url,
     reused:true
    };
   }

   if(existingSession?.status==='complete'){
    throw new Error(
     'This Stripe payment has already completed. Refresh FaivoPay and allow the payment confirmation to finish before creating another payment link.'
    );
   }

   /*
    * Expired Checkout sessions must never be reused.
    * Clear the stale Stripe reference and create a fresh session below.
    */
   if(existingSession?.status==='expired'){
    db.prepare(`
     UPDATE payment_requests
     SET payment_url=NULL,
         provider_session_id=NULL,
         updated_at=?
     WHERE id=?
    `).run(
     new Date().toISOString(),
     item.id
    );

    item={
     ...item,
     payment_url:null,
     provider_session_id:null
    };
   }else{
    throw new Error(
     `Stripe payment link is not available for reuse. Session status: ${existingSession?.status||'unknown'}`
    );
   }
 }

 const d=cachedDriver(item.driver_id);

 const session=await getStripeClient().checkout.sessions.create({
   mode:'payment',
   client_reference_id:item.id,
   customer_email:d?.email||undefined,

   success_url:`${PUBLIC_BASE_URL}/driver?payment=success`,
   cancel_url:`${PUBLIC_BASE_URL}/driver?payment=cancelled`,

   metadata:{
     fleetpay_request_id:item.id,
     callsign:String(item.callsign||'')
   },

   payment_intent_data:{
     metadata:{
       fleetpay_request_id:item.id,
       callsign:String(item.callsign||'')
     }
   },

   line_items:[
     {
       quantity:1,
       price_data:{
         currency:'gbp',
         unit_amount:Math.round(Number(item.amount)*100),
         product_data:{
           name:`FaivoPay balance payment – Callsign ${item.callsign}`,
           description:'FaivoPay weekly driver account payment request'
         }
       }
     }
   ]
 });

 db.prepare(`
   UPDATE payment_requests
   SET payment_url=?,
       provider=?,
       provider_session_id=?,
       updated_at=?
   WHERE id=?
 `).run(
   session.url,
   'stripe',
   session.id,
   new Date().toISOString(),
   item.id
 );

 return session;
}

async function createStripeCustomerPayment(item){
 if(!getStripeClient()) return null;

 if(item.provider_checkout_url && item.provider_session_id){
   return {
     id:item.provider_session_id,
     url:item.provider_checkout_url,
     reused:true
   };
 }

 const lineItems=[
   {
     quantity:1,
     price_data:{
       currency:'gbp',
       unit_amount:Math.round(Number(item.fare_amount)*100),
       product_data:{
         name:'Taxi fare',
         description:item.booking_id
           ? `Booking ${item.booking_id}`
           : `FaivoPay taxi fare – Callsign ${item.callsign}`
       }
     }
   }
 ];

 if(Number(item.fee_amount)>0){
   lineItems.push({
     quantity:1,
     price_data:{
       currency:'gbp',
       unit_amount:Math.round(Number(item.fee_amount)*100),
       product_data:{
         name:'FaivoPay service fee'
       }
     }
   });
 }

 const session=await getStripeClient().checkout.sessions.create({
  mode:'payment',
  client_reference_id:item.id,

  success_url:`${PUBLIC_BASE_URL}/pay/${item.id}?status=success`,
  cancel_url:`${PUBLIC_BASE_URL}/pay/${item.id}?status=cancelled`,

   metadata:{
     fleetpay_customer_payment_id:item.id,
     callsign:String(item.callsign||''),
     booking_id:String(item.booking_id||''),
     fare_amount:String(item.fare_amount),
     service_fee:String(item.fee_amount)
   },

   payment_intent_data:{
     metadata:{
       fleetpay_customer_payment_id:item.id,
       callsign:String(item.callsign||''),
       booking_id:String(item.booking_id||'')
     }
   },

   line_items:lineItems
 });

 db.prepare(`
   UPDATE customer_payments
   SET provider=?,
       provider_session_id=?,
       provider_checkout_url=?,
       updated_at=?
   WHERE id=?
 `).run(
   'stripe',
   session.id,
   session.url,
   new Date().toISOString(),
   item.id
 );

 return session;
}
function serializePayoutRun(r){return {id:r.id,runType:r.run_type,status:r.status,createdAt:r.created_at,createdBy:r.created_by,scheduledFor:r.scheduled_for,totalAmount:r.total_amount,itemCount:r.item_count,provider:r.provider,providerRef:r.provider_ref,notes:r.notes,paidAt:r.paid_at,fundingStatus:r.funding_status||'not_started',fundingRequired:Number(r.funding_required??r.total_amount??0),fundingSentAt:r.funding_sent_at,fundsClearedAt:r.funds_cleared_at,releasedAt:r.released_at,reconciledAt:r.reconciled_at}}
async function markPayoutPaid(item, req, source='manual'){
 if(item.status==='paid') return;
 const now=new Date().toISOString();
 db.prepare('UPDATE payouts SET status=?,paid_at=?,updated_at=? WHERE id=?').run('paid',now,now,item.id);
 ledger(item.driver_id,item.type==='early'?'early_payout':'weekly_payout','credit',Number(item.net_amount||item.amount||0),Number(item.fee||0),item.type==='early'?'Early payout paid':'Weekly payout paid',item.id,'paid');
 if(Number(item.fee||0)>0){ledger(item.driver_id,'early_payout_fee','debit',Number(item.fee||0),Number(item.fee||0),'Early payout fee',item.id,'charged');recordFee({feeType:'early_payout',sourceType:'payout',sourceId:item.id,driverId:item.driver_id,callsign:item.callsign,description:'Early payout fee',amount:Number(item.fee||0),createdAt:now})}
 notify(item.driver_id,'Payment sent',`£${Number(item.net_amount||item.amount||0).toFixed(2)} has been paid to your assigned bank account.`,'success',item.id);
 try{await settlePayoutInAutocab(item);audit(req,'system','autocab','autocab_payout_adjusted','payout',item.id,{callsign:item.callsign});}catch(e){audit(req,'system','autocab','autocab_adjustment_failed','payout',item.id,{callsign:item.callsign,error:e.message});}
 audit(req,'admin',req?.auth?.email||source,'payout_paid','payout',item.id,{callsign:item.callsign,amount:Number(item.net_amount||item.amount||0),source});
}
async function sendEmail(to,subject,html){
 const sendgridConfig=getSendGridConfig();

 if(sendgridConfig.apiKey && sendgridConfig.fromEmail){
  try{
   const mod=await import('@sendgrid/mail');
   const sendgrid=mod.default||mod;
   sendgrid.setApiKey(sendgridConfig.apiKey);

   const [response]=await sendgrid.send({
    to,
    from:{
     email:sendgridConfig.fromEmail,
     name:sendgridConfig.fromName
    },
    subject,
    html
   });

   return {
    sent:true,
    provider:'sendgrid',
    id:response?.headers?.['x-message-id']||''
   };
  }catch(e){
   throw new Error(`SendGrid email failed: ${e.message}`);
  }
 }

 const settings=getSettings(),smtpHost=String(settings.smtpHost||'').trim(),smtpUser=String(settings.smtpUser||'').trim(),smtpPassword=getSecureSetting('smtpPassword');
 if(smtpHost){
  try{const nodemailer=await import('nodemailer');const transporter=nodemailer.default.createTransport({host:smtpHost,port:Number(settings.smtpPort||587),secure:Boolean(settings.smtpSecure),auth:smtpUser?{user:smtpUser,pass:smtpPassword}:undefined});const info=await transporter.sendMail({from:`${settings.smtpFromName||'FaivoPay'} <${settings.smtpFromEmail||smtpUser}>`,to,subject,html});return {sent:true,provider:'smtp',id:info.messageId||''}}catch(e){throw new Error(`SMTP email failed: ${e.message}. If nodemailer is not installed, run npm install nodemailer.`)}
 }
 if(!RESEND_API_KEY||!RESEND_FROM_EMAIL)return {sent:false,provider:'none'};const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:RESEND_FROM_EMAIL,to:[to],subject,html})});if(!r.ok)throw new Error(`Email provider error ${r.status}`);const out=await r.json().catch(()=>({}));return {sent:true,provider:'resend',id:out.id||''}
}
let twilioClientPromise=null;
let twilioClientCacheKey='';

async function getTwilioClient(){
 const cfg=getTwilioConfig();

 if(!cfg.accountSid||!cfg.authToken)return null;

 const cacheKey=`${cfg.accountSid}:${cfg.authToken}`;

 if(!twilioClientPromise || twilioClientCacheKey!==cacheKey){
  twilioClientCacheKey=cacheKey;
  twilioClientPromise=(async()=>{
   const mod=await import('twilio');
   const twilio=mod.default||mod;
   return twilio(cfg.accountSid,cfg.authToken);
  })();
 }

 return twilioClientPromise;
}

async function getTwilioBalance(){
 const client=await getTwilioClient();
 if(!client)return {configured:false,balance:null,currency:null};

 const balance=await client.balance.fetch();
 return {
  configured:true,
  balance:Number(balance.balance),
  currency:String(balance.currency||'').toUpperCase()
 };
}

function normaliseSmsNumber(value=''){
 let n=String(value||'').trim().replace(/[\s()-]/g,'');
 if(n.startsWith('00'))n='+'+n.slice(2);
 if(n.startsWith('0'))n='+44'+n.slice(1);
 return n;
}

async function sendTwilioSms(to,message,{templateKey='',entityType='',entityId=''}={}){
 const client=await getTwilioClient();
 if(!client)throw new Error('Twilio is not configured');

 const recipient=normaliseSmsNumber(to);
 if(!recipient.startsWith('+'))throw new Error('SMS recipient must be a valid international number');

 const payload={
  to:recipient,
  body:String(message||''),
  statusCallback:`${PUBLIC_BASE_URL}/api/webhooks/twilio/sms-status`
 };

 const twilioConfig=getTwilioConfig();

 if(twilioConfig.messagingServiceSid){
  payload.messagingServiceSid=twilioConfig.messagingServiceSid;
 }else if(twilioConfig.fromNumber){
  payload.from=twilioConfig.fromNumber;
 }else{
  throw new Error('Twilio Messaging Service SID or From Number is required');
 }

 try{
  const result=await client.messages.create(payload);

  logCommunication({
   channel:'sms',
   recipient,
   templateKey,
   entityType,
   entityId,
   status:'sent',
   providerRef:result.sid||''
  });

  return {
   sent:true,
   provider:'twilio',
   sid:result.sid||'',
   status:result.status||'queued'
  };
 }catch(e){
  logCommunication({
   channel:'sms',
   recipient,
   templateKey,
   entityType,
   entityId,
   status:'failed',
   error:`Twilio: ${e.message}`
  });
  throw e;
 }
}

async function sendConfiguredSms(to,message,{templateKey='',entityType='',entityId=''}={}){
 const settings=getSettings(),endpoint=String(settings.smsEndpoint||'').trim();if(!endpoint)throw new Error('SMS endpoint is not configured');const authValue=getSecureSetting('smsAuthValue');const headers={'Content-Type':'application/json'};if(settings.smsAuthHeader&&authValue)headers[String(settings.smsAuthHeader)]=authValue;let bodyText=templateText(settings.smsBodyTemplate||'{"to":"{mobile}","message":"{message}"}',{mobile:to,message});let body;try{body=JSON.stringify(JSON.parse(bodyText))}catch{throw new Error('SMS body template must produce valid JSON')};try{const r=await fetch(endpoint,{method:String(settings.smsMethod||'POST').toUpperCase(),headers,body});const text=await r.text();if(!r.ok)throw new Error(`SMS endpoint ${r.status}: ${text.slice(0,240)}`);logCommunication({channel:'sms',recipient:to,templateKey,entityType,entityId,status:'sent',providerRef:text.slice(0,120)});return {sent:true,response:text}}catch(e){logCommunication({channel:'sms',recipient:to,templateKey,entityType,entityId,status:'failed',error:e.message});throw e}
}

async function sendSmsByRoute(to,message,{category='general',templateKey='',entityType='',entityId=''}={}){
 const settings=getSettings();

 const preferred=String(
  category==='payment'
   ? settings.paymentSmsProvider||'twilio'
   : settings.generalSmsProvider||'orion'
 ).toLowerCase();

 const fallbackEnabled=Boolean(settings.smsFallbackEnabled);

 const providers={
  twilio:async()=>{
   if(!settings.twilioEnabled)throw new Error('Twilio SMS is disabled');
   return sendTwilioSms(to,message,{templateKey,entityType,entityId});
  },
  orion:async()=>{
   if(!settings.orionEnabled)throw new Error('Orion SMS is disabled');
   return sendConfiguredSms(to,message,{templateKey,entityType,entityId});
  }
 };

 const order=
  preferred==='orion'
   ? ['orion','twilio']
   : ['twilio','orion'];

 let firstError=null;

 for(let i=0;i<order.length;i++){
  if(i>0&&!fallbackEnabled)break;

  const provider=order[i];

  try{
   const result=await providers[provider]();
   return {...result,provider};
  }catch(e){
   if(!firstError)firstError=e;
  }
 }

 throw firstError||new Error('No SMS provider is available');
}

async function sendCustomerPaymentCommunications(item){
 const settings=getSettings();
 const vars={
  customer:item.customer_name||'Customer',
  fare:Number(item.fare_amount||0).toFixed(2),
  fee:Number(item.fee_amount||0).toFixed(2),
  total:Number(item.total_amount||0).toFixed(2),
  paymentLink:item.payment_url||`${PUBLIC_BASE_URL}/pay/${item.id}`,
  bookingId:item.booking_id||''
 };
 const errors=[];

 const alreadySent=(channel)=>Boolean(
  db.prepare(`
   SELECT 1
   FROM communications_log
   WHERE channel=?
     AND template_key='customer_payment_link'
     AND entity_type='customer_payment'
     AND entity_id=?
     AND status IN ('sent','delivered')
   LIMIT 1
  `).get(channel,String(item.id))
 );

 if(item.customer_email && !alreadySent('email')){
  try{
   const subject=templateText(settings.customerPaymentEmailSubject,vars);
   const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const pickup=esc(item.pickup||'');
   const destination=esc(item.destination||'');
   const bookingId=esc(vars.bookingId);
   const customer=esc(vars.customer);
   const paymentLink=esc(vars.paymentLink);
   const fare=esc(vars.fare);
   const fee=esc(vars.fee);
   const total=esc(vars.total);

   const html=`
    <div style="margin:0;padding:32px 12px;background:#f2f5f4;font-family:Arial,Helvetica,sans-serif;color:#172033">
     <div style="max-width:620px;margin:0 auto">

      <div style="background:#173b32;border-radius:20px 20px 0 0;padding:26px 30px;color:#ffffff">
       <table role="presentation" style="width:100%;border-collapse:collapse">
        <tr>
         <td style="vertical-align:middle">
          <div style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;border-radius:10px;background:#ffffff;color:#173b32;font-size:22px;font-weight:800">F</div>
         </td>
         <td style="vertical-align:middle;padding-left:12px;width:100%">
          <div style="font-size:18px;font-weight:800;letter-spacing:.2px">FaivoPay</div>
          <div style="font-size:12px;opacity:.75;margin-top:2px">Secure taxi payments</div>
         </td>
        </tr>
       </table>

       <div style="margin-top:24px;font-size:12px;font-weight:700;letter-spacing:1.2px;opacity:.75">
        PAYMENT REQUEST
       </div>
       <div style="font-size:27px;line-height:1.25;font-weight:800;margin-top:6px">
        Your taxi payment is ready
       </div>
      </div>

      <div style="background:#ffffff;border:1px solid #e1e7e4;border-top:0;border-radius:0 0 20px 20px;padding:30px">

       <p style="margin:0 0 22px;font-size:16px;line-height:1.6">
        Hello ${customer},
       </p>

       <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4e5d58">
        Your journey is ready to pay securely online.
       </p>

       <div style="background:#f4f8f6;border:1px solid #dce7e2;border-radius:16px;padding:22px;margin-bottom:24px;text-align:center">
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#687770">
         TOTAL TO PAY
        </div>
        <div style="font-size:40px;line-height:1.15;font-weight:800;color:#173b32;margin-top:7px">
         £${total}
        </div>
       </div>

       ${(pickup||destination)?`
       <div style="border:1px solid #e5eae8;border-radius:14px;padding:18px 20px;margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#687770;margin-bottom:14px">
         YOUR JOURNEY
        </div>

        ${pickup?`
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:${destination?'14px':'0'}">
         <tr>
          <td style="width:48px;vertical-align:top;color:#687770;font-size:13px;font-weight:700">FROM</td>
          <td style="vertical-align:top;font-size:15px;line-height:1.45;color:#172033">${pickup}</td>
         </tr>
        </table>`:''}

        ${destination?`
        <table role="presentation" style="width:100%;border-collapse:collapse">
         <tr>
          <td style="width:48px;vertical-align:top;color:#687770;font-size:13px;font-weight:700">TO</td>
          <td style="vertical-align:top;font-size:15px;line-height:1.45;color:#172033">${destination}</td>
         </tr>
        </table>`:''}
       </div>`:''}

       <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:26px">
        <tr>
         <td style="padding:11px 0;border-bottom:1px solid #edf0ef;color:#687770">
          Journey fare
         </td>
         <td style="padding:11px 0;border-bottom:1px solid #edf0ef;text-align:right;font-weight:700">
          £${fare}
         </td>
        </tr>

        <tr>
         <td style="padding:11px 0;border-bottom:1px solid #edf0ef;color:#687770">
          FaivoPay service fee
         </td>
         <td style="padding:11px 0;border-bottom:1px solid #edf0ef;text-align:right;font-weight:700">
          £${fee}
         </td>
        </tr>

        <tr>
         <td style="padding:14px 0 0;font-size:16px;font-weight:800;color:#173b32">
          Total
         </td>
         <td style="padding:14px 0 0;text-align:right;font-size:18px;font-weight:800;color:#173b32">
          £${total}
         </td>
        </tr>
       </table>

       <div style="text-align:center;margin:30px 0 20px">
        <a href="${paymentLink}"
           style="display:inline-block;background:#24845b;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;padding:16px 34px;border-radius:11px">
         Pay £${total} securely
        </a>
       </div>

       <div style="text-align:center;font-size:12px;line-height:1.5;color:#71807a;margin-bottom:24px">
        🔒 Secure card payment
       </div>

       ${bookingId?`
       <div style="background:#fafbfb;border-radius:10px;padding:12px 16px;text-align:center;font-size:12px;color:#71807a;margin-bottom:22px">
        Booking reference&nbsp; <strong style="color:#394842">${bookingId}</strong>
       </div>`:''}

       <div style="border-top:1px solid #edf0ef;padding-top:20px">
        <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#7b8883;text-align:center">
         If the button above does not work, copy and paste this secure link into your browser:
        </p>
        <p style="margin:0;font-size:11px;line-height:1.5;text-align:center;word-break:break-all">
         <a href="${paymentLink}" style="color:#24845b;text-decoration:none">${paymentLink}</a>
        </p>
       </div>

       <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#7b8883;text-align:center">
        Payment securely processed through FaivoPay.<br>
        If you were not expecting this request, please contact your taxi provider.
       </p>

      </div>

      <div style="padding:18px;text-align:center;font-size:11px;color:#87938f">
       © FaivoPay · Secure payments for taxi journeys
      </div>

     </div>
    </div>`;

   const out=await sendEmail(
    item.customer_email,
    subject,
    html
   );
   if(out.sent){
    logCommunication({
     channel:'email',
     recipient:item.customer_email,
     templateKey:'customer_payment_link',
     entityType:'customer_payment',
     entityId:item.id,
     status:'sent',
     providerRef:out.id||out.provider||''
    });
   }
  }catch(e){
   errors.push(`Email: ${e.message}`);
   logCommunication({
    channel:'email',
    recipient:item.customer_email,
    templateKey:'customer_payment_link',
    entityType:'customer_payment',
    entityId:item.id,
    status:'failed',
    error:e.message
   });
  }
 }

 if(item.customer_mobile && !alreadySent('sms')){
  try{
   const message=templateText(settings.customerPaymentSmsTemplate,vars);
   await sendSmsByRoute(
    item.customer_mobile,
    message,
    {
     category:'payment',
     templateKey:'customer_payment_link',
     entityType:'customer_payment',
     entityId:item.id
    }
   );
  }catch(e){
   errors.push(`SMS: ${e.message}`);
  }
 }

 return {errors};
}

function londonWindow(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return {weekday:v.weekday,hour:Number(v.hour),minute:Number(v.minute),date:`${v.year}-${v.month}-${v.day}`}}
function mondayWeekStart(dateStr=londonWindow().date){const d=new Date(`${dateStr}T12:00:00Z`),day=d.getUTCDay(),offset=day===0?6:day-1;d.setUTCDate(d.getUTCDate()-offset);return d.toISOString().slice(0,10)}
function previousMondayWeekStart(dateStr=londonWindow().date){const d=new Date(`${mondayWeekStart(dateStr)}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-7);return d.toISOString().slice(0,10)}
function cutoffParts(settings){const raw=String(settings?.earlyPayoutCutoffTime||`${String(settings?.earlyPayoutCutoffHour??11).padStart(2,'0')}:00`);const m=raw.match(/^(\d{1,2}):(\d{2})$/);const hour=Math.min(23,Math.max(0,Number(m?.[1]??11))),minute=Math.min(59,Math.max(0,Number(m?.[2]??0)));return {hour,minute,label:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`}}
function addBusinessDays(dateStr,days=1){let d=new Date(`${dateStr}T12:00:00Z`),left=days;while(left>0){d.setUTCDate(d.getUTCDate()+1);const wd=d.getUTCDay();if(wd!==0&&wd!==6)left--;}return d.toISOString().slice(0,10)}
function formatRunDate(dateStr){return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'short'}).format(new Date(`${dateStr}T12:00:00Z`))}
function earlyPayoutTiming(settings){const now=londonWindow(),cut=cutoffParts(settings),requestDayAllowed=['Tue','Wed','Thu','Fri'].includes(now.weekday);const beforeCutoff=now.hour<cut.hour||(now.hour===cut.hour&&now.minute<=cut.minute);let runDate=now.date;if(!beforeCutoff)runDate=addBusinessDays(now.date,1);return {requestDayAllowed,beforeCutoff,afterCutoff:!beforeCutoff,runDate,cutoff:cut.label,runLabel:formatRunDate(runDate)}}
function earlyPayoutWindowMessage(settings){const t=earlyPayoutTiming(settings);if(!t.requestDayAllowed)return `Early payout requests are available Tuesday to Friday. The same-day cutoff is ${t.cutoff}.`;if(t.beforeCutoff)return `Request by ${t.cutoff} for today's payment run, subject to approval. Requests after ${t.cutoff} are accepted and queued for the next business-day run.`;return `Today's ${t.cutoff} cutoff has passed. You can still request now; if approved, it will be queued for the ${t.runLabel} payment run.`}

app.post('/api/webhooks/twilio/sms-status',express.urlencoded({extended:false}),async(req,res)=>{
 try{
  const twilioWebhookConfig=getTwilioConfig();

  if(twilioWebhookConfig.authToken){
   const mod=await import('twilio');
   const twilio=mod.default||mod;
   const signature=String(req.headers['x-twilio-signature']||'');
   const callbackUrl=`${PUBLIC_BASE_URL}${req.originalUrl}`;

   const valid=twilio.validateRequest(
    twilioWebhookConfig.authToken,
    signature,
    callbackUrl,
    req.body||{}
   );

   if(!valid){
    console.warn('[FaivoPay] Rejected invalid Twilio SMS status signature');
    return res.status(403).end();
   }
  }

  const sid=String(req.body.MessageSid||req.body.SmsSid||'').trim();
  const status=String(req.body.MessageStatus||req.body.SmsStatus||'').trim();
  const errorCode=String(req.body.ErrorCode||'').trim();
  const errorMessage=String(req.body.ErrorMessage||'').trim();

  if(sid){
   const comm=db.prepare(`
    SELECT *
    FROM communications_log
    WHERE provider_ref=?
      AND channel='sms'
    ORDER BY created_at DESC
    LIMIT 1
   `).get(sid);

   if(comm){
    const mappedStatus=
     status==='delivered' ? 'delivered' :
     ['failed','undelivered'].includes(status) ? 'failed' :
     ['queued','accepted','sending','sent'].includes(status) ? 'sent' :
     comm.status;

    db.prepare(`
     UPDATE communications_log
     SET status=?,
         error=?
     WHERE id=?
    `).run(
     mappedStatus,
     errorCode||errorMessage
      ?`Twilio ${errorCode||''}${errorCode&&errorMessage?': ':''}${errorMessage||''}`
      :'',
     comm.id
    );
   }
  }

  res.status(204).end();
 }catch(e){
  console.error('[FaivoPay] Twilio SMS status webhook error',e);
  res.status(204).end();
 }
});

app.get('/api/admin/twilio/balance',adminAuth,async(req,res)=>{
 try{
  const result=await getTwilioBalance();

  if(!result.configured){
   return res.json({
    configured:false,
    balance:null,
    currency:null
   });
  }

  res.json(result);
 }catch(e){
  console.error('[FaivoPay] Twilio balance error',e);
  res.status(502).json({
   error:'Unable to retrieve Twilio balance'
  });
 }
});

app.get('/api/health',(_q,res)=>res.json({ok:true,configured:Boolean(getAutocabApiKey()),database:'sqlite',databasePath:'data/fleetpay.sqlite'}));
ensureBootstrapAdmin();
ensureDefaultCompany();

app.post('/api/admin/login',(req,res)=>{
 const email=safeEmail(req.body.email),pass=String(req.body.password||''),u=db.prepare('SELECT * FROM staff_users WHERE email=?').get(email);
 if(!u||!u.active||!verifyPassword(pass,u.password_salt,u.password_hash)){audit(req,'staff',email,'office_login_failed');return res.status(401).json({error:'Incorrect email or password'})}
 if(!u.mfa_enabled){
  const secret=u.mfa_secret||newMfaSecret();if(!u.mfa_secret)db.prepare('UPDATE staff_users SET mfa_secret=?,updated_at=? WHERE id=?').run(secret,new Date().toISOString(),u.id);
  audit(req,'staff',email,'office_mfa_setup_required','staff_user',u.id);
  return res.json({mfaSetupRequired:true,setupToken:signToken({role:'admin_mfa_setup',staffId:u.id,email:u.email},0.17),secret,otpauthUri:makeOtpAuth(u.email,secret),staff:staffSafe(u)});
 }
 audit(req,'staff',email,'office_password_verified','staff_user',u.id);
 res.json({mfaRequired:true,mfaToken:signToken({role:'admin_mfa',staffId:u.id,email:u.email},0.17),staff:staffSafe(u)});
});

app.post('/api/admin/login/mfa',(req,res)=>{
 const p=verifyToken(String(req.body.mfaToken||''));if(p?.role!=='admin_mfa')return res.status(401).json({error:'Login verification expired. Sign in again.'});
 const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(p.staffId);if(!u||!u.active||!u.mfa_enabled||!verifyTotp(u.mfa_secret,req.body.code)){audit(req,'staff',p.email,'office_mfa_failed','staff_user',p.staffId);return res.status(401).json({error:'Incorrect authenticator code'})}
 const now=new Date().toISOString();db.prepare('UPDATE staff_users SET last_login_at=?,updated_at=? WHERE id=?').run(now,now,u.id);audit(req,'staff',u.email,'office_login_success','staff_user',u.id,{role:u.role});
 res.json({token:signToken({role:'admin',mfa:true,staffId:u.id,email:u.email,name:u.name,staffRole:u.role},12),staff:staffSafe({...u,last_login_at:now})});
});

app.post('/api/admin/mfa/enable',(req,res)=>{
 const p=verifyToken(String(req.body.setupToken||''));if(p?.role!=='admin_mfa_setup')return res.status(401).json({error:'MFA setup expired. Sign in again.'});
 const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(p.staffId);if(!u||!u.active||!u.mfa_secret||!verifyTotp(u.mfa_secret,req.body.code))return res.status(401).json({error:'Incorrect authenticator code'});
 const now=new Date().toISOString();db.prepare('UPDATE staff_users SET mfa_enabled=1,last_login_at=?,updated_at=? WHERE id=?').run(now,now,u.id);audit(req,'staff',u.email,'office_mfa_enabled','staff_user',u.id,{role:u.role});
 res.json({token:signToken({role:'admin',mfa:true,staffId:u.id,email:u.email,name:u.name,staffRole:u.role},12),staff:staffSafe({...u,mfa_enabled:1,last_login_at:now})});
});

// Authenticator recovery: password login has already succeeded and produced mfaToken.
// A one-time code sent to the office user's registered email is required before a new TOTP secret is issued.
app.post('/api/admin/mfa/recovery/start',async(req,res)=>{
 try{
  const p=verifyToken(String(req.body.mfaToken||''));
  if(p?.role!=='admin_mfa')return res.status(401).json({error:'Login verification expired. Sign in again.'});
  const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(p.staffId);
  if(!u||!u.active)return res.status(404).json({error:'Office user not found'});
  const code=String(Math.floor(100000+Math.random()*900000));
  const challenge=id('mfarecover');
  const expires=Date.now()+10*60000;
  db.prepare("DELETE FROM auth_challenges WHERE type='office_mfa_recovery' AND email=?").run(u.email);
  db.prepare('INSERT INTO auth_challenges(id,type,driver_id,callsign,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(challenge,'office_mfa_recovery',null,null,u.email,crypto.createHash('sha256').update(code).digest('hex'),expires,new Date().toISOString());
  const sent=await sendEmail(u.email,'FaivoPay authenticator recovery code',`<div style="font-family:Arial,sans-serif;max-width:560px"><h2>FaivoPay authenticator recovery</h2><p>Your one-time recovery code is:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request this, do not share the code.</p></div>`);
  if(!sent?.sent){db.prepare('DELETE FROM auth_challenges WHERE id=?').run(challenge);return res.status(503).json({error:'Office recovery email is not configured. Ask an administrator to reset MFA.'})}
  audit(req,'staff',u.email,'office_mfa_recovery_started','staff_user',u.id,{provider:sent.provider||''});
  res.json({challengeId:challenge,emailHint:u.email.replace(/^(.{1,2}).*(@.*)$/,'$1••••$2'),message:'Recovery code sent'});
 }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/admin/mfa/recovery/complete',(req,res)=>{
 const p=verifyToken(String(req.body.mfaToken||''));
 if(p?.role!=='admin_mfa')return res.status(401).json({error:'Login verification expired. Sign in again.'});
 const c=db.prepare("SELECT * FROM auth_challenges WHERE id=? AND type='office_mfa_recovery'").get(String(req.body.challengeId||''));
 if(!c||c.expires_at<Date.now()||safeEmail(c.email)!==safeEmail(p.email))return res.status(400).json({error:'Recovery code expired or invalid'});
 const codeHash=crypto.createHash('sha256').update(String(req.body.code||'')).digest('hex');
 if(codeHash!==c.code_hash)return res.status(400).json({error:'Incorrect recovery code'});
 const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(p.staffId);
 if(!u||!u.active)return res.status(404).json({error:'Office user not found'});
 const secret=newMfaSecret(),now=new Date().toISOString();
 db.prepare('UPDATE staff_users SET mfa_secret=?,mfa_enabled=0,updated_at=? WHERE id=?').run(secret,now,u.id);
 db.prepare('DELETE FROM auth_challenges WHERE id=?').run(c.id);
 audit(req,'staff',u.email,'office_mfa_recovery_completed','staff_user',u.id);
 res.json({mfaSetupRequired:true,setupToken:signToken({role:'admin_mfa_setup',staffId:u.id,email:u.email},0.17),secret,otpauthUri:makeOtpAuth(u.email,secret),staff:staffSafe({...u,mfa_secret:secret,mfa_enabled:0})});
});



function companyIntegrationPayload(companyId){
 return {
  autocab:{
   companyIds:getCompanySetting(companyId,'autocabCompanyIds',''),
   adjustmentsEnabled:Boolean(getCompanySetting(companyId,'autocabAdjustmentsEnabled',false)),
   apiKeyConfigured:companySecretConfigured(companyId,'autocabApiKey')
  },
  stripe:{
   secretKeyConfigured:companySecretConfigured(companyId,'stripeSecretKey'),
   webhookSecretConfigured:companySecretConfigured(companyId,'stripeWebhookSecret')
  },
  sendgrid:{
   fromEmail:getCompanySetting(companyId,'sendgridFromEmail',''),
   fromName:getCompanySetting(companyId,'sendgridFromName','FaivoPay'),
   apiKeyConfigured:companySecretConfigured(companyId,'sendgridApiKey')
  },
  twilio:{
   accountSid:getCompanySetting(companyId,'twilioAccountSid',''),
   messagingServiceSid:getCompanySetting(companyId,'twilioMessagingServiceSid',''),
   fromNumber:getCompanySetting(companyId,'twilioFromNumber',''),
   authTokenConfigured:companySecretConfigured(companyId,'twilioAuthToken')
  },
  branding:{
   productName:getCompanySetting(companyId,'productName','FaivoPay'),
   supportEmail:getCompanySetting(companyId,'supportEmail',''),
   supportPhone:getCompanySetting(companyId,'supportPhone','')
  },
  features:{
   paymentPlans:Boolean(getCompanySetting(companyId,'featurePaymentPlans',true)),
   earlyPayouts:Boolean(getCompanySetting(companyId,'featureEarlyPayouts',true)),
   customerPayments:Boolean(getCompanySetting(companyId,'featureCustomerPayments',true)),
   driverPayouts:Boolean(getCompanySetting(companyId,'featureDriverPayouts',true)),
   demoLab:Boolean(getCompanySetting(companyId,'featureDemoLab',true))
  }
 };
}

function saveCompanyConfiguration(companyId,input={}){
 const row=db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
 if(!row)throw new Error('Company not found');

 const general=input.general||{};
 const autocab=input.autocab||{};
 const stripeCfg=input.stripe||{};
 const sendgrid=input.sendgrid||{};
 const twilioCfg=input.twilio||{};
 const branding=input.branding||{};
 const features=input.features||{};

 const name=String(general.name??row.name).trim()||row.name;
 const domain=String(general.primaryDomain??row.primary_domain??'').trim().toLowerCase();
 const supportEmail=safeEmail(general.supportEmail??row.support_email);
 const supportPhone=String(general.supportPhone??row.support_phone??'').trim();
 const timezone=String(general.timezone??row.timezone??'Europe/London').trim()||'Europe/London';

 db.prepare(`UPDATE companies
  SET name=?,primary_domain=?,support_email=?,support_phone=?,timezone=?,updated_at=?
  WHERE id=?`).run(
   name,domain,supportEmail,supportPhone,timezone,new Date().toISOString(),companyId
 );

 if('companyIds' in autocab)setCompanySetting(companyId,'autocabCompanyIds',String(autocab.companyIds||'').trim());
 if('adjustmentsEnabled' in autocab)setCompanySetting(companyId,'autocabAdjustmentsEnabled',Boolean(autocab.adjustmentsEnabled));
 if(String(autocab.apiKey||'').trim())setCompanySecureSetting(companyId,'autocabApiKey',String(autocab.apiKey).trim());

 if(String(stripeCfg.secretKey||'').trim())setCompanySecureSetting(companyId,'stripeSecretKey',String(stripeCfg.secretKey).trim());
 if(String(stripeCfg.webhookSecret||'').trim())setCompanySecureSetting(companyId,'stripeWebhookSecret',String(stripeCfg.webhookSecret).trim());

 if('fromEmail' in sendgrid)setCompanySetting(companyId,'sendgridFromEmail',safeEmail(sendgrid.fromEmail));
 if('fromName' in sendgrid)setCompanySetting(companyId,'sendgridFromName',String(sendgrid.fromName||'').trim());
 if(String(sendgrid.apiKey||'').trim())setCompanySecureSetting(companyId,'sendgridApiKey',String(sendgrid.apiKey).trim());

 if('accountSid' in twilioCfg)setCompanySetting(companyId,'twilioAccountSid',String(twilioCfg.accountSid||'').trim());
 if('messagingServiceSid' in twilioCfg)setCompanySetting(companyId,'twilioMessagingServiceSid',String(twilioCfg.messagingServiceSid||'').trim());
 if('fromNumber' in twilioCfg)setCompanySetting(companyId,'twilioFromNumber',String(twilioCfg.fromNumber||'').trim());
 if(String(twilioCfg.authToken||'').trim())setCompanySecureSetting(companyId,'twilioAuthToken',String(twilioCfg.authToken).trim());

 if('productName' in branding)setCompanySetting(companyId,'productName',String(branding.productName||'FaivoPay').trim()||'FaivoPay');
 if('supportEmail' in branding)setCompanySetting(companyId,'supportEmail',safeEmail(branding.supportEmail));
 if('supportPhone' in branding)setCompanySetting(companyId,'supportPhone',String(branding.supportPhone||'').trim());

 for(const [inputKey,settingKey] of [
  ['paymentPlans','featurePaymentPlans'],
  ['earlyPayouts','featureEarlyPayouts'],
  ['customerPayments','featureCustomerPayments'],
  ['driverPayouts','featureDriverPayouts'],
  ['demoLab','featureDemoLab']
 ]){
  if(inputKey in features)setCompanySetting(companyId,settingKey,Boolean(features[inputKey]));
 }

 return db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
}

function companyConfigurationPayload(row){
 return {
  company:companyPublic(row),
  config:companyIntegrationPayload(row.id)
 };
}

app.get('/api/admin/platform/companies',adminAuth,requirePlatformAdmin,(req,res)=>{
 ensureDefaultCompany();
 const companies=db.prepare('SELECT * FROM companies ORDER BY created_at,name').all().map(companyPublic);
 res.json({companies});
});

app.get('/api/admin/platform/companies/:id',adminAuth,requirePlatformAdmin,(req,res)=>{
 ensureDefaultCompany();
 const row=db.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);
 if(!row)return res.status(404).json({error:'Company not found'});
 res.json(companyConfigurationPayload(row));
});

app.put('/api/admin/platform/companies/:id',adminAuth,requirePlatformAdmin,(req,res)=>{
 try{
  const row=saveCompanyConfiguration(req.params.id,req.body||{});
  audit(req,'staff',req.auth.email,'platform_company_configuration_updated','company',row.id,{
   sections:Object.keys(req.body||{}),
   secretsChanged:{
    autocab:Boolean(String(req.body?.autocab?.apiKey||'').trim()),
    stripeSecret:Boolean(String(req.body?.stripe?.secretKey||'').trim()),
    stripeWebhook:Boolean(String(req.body?.stripe?.webhookSecret||'').trim()),
    sendgrid:Boolean(String(req.body?.sendgrid?.apiKey||'').trim()),
    twilio:Boolean(String(req.body?.twilio?.authToken||'').trim())
   }
  });
  res.json(companyConfigurationPayload(row));
 }catch(e){
  res.status(e.message==='Company not found'?404:400).json({error:e.message});
 }
});

app.post('/api/admin/platform/companies/:id/status',adminAuth,requirePlatformAdmin,(req,res)=>{
 const row=db.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);
 if(!row)return res.status(404).json({error:'Company not found'});
 const status=String(req.body?.status||'').trim();
 if(!['draft','configuration_incomplete','ready_for_testing','live'].includes(status)){
  return res.status(400).json({error:'Invalid company status'});
 }
 db.prepare('UPDATE companies SET status=?,updated_at=? WHERE id=?')
  .run(status,new Date().toISOString(),row.id);
 audit(req,'staff',req.auth.email,'platform_company_status_changed','company',row.id,{from:row.status,to:status});
 res.json({company:companyPublic(db.prepare('SELECT * FROM companies WHERE id=?').get(row.id))});
});

app.post('/api/admin/platform/companies',adminAuth,requirePlatformAdmin,(req,res)=>{
 const name=String(req.body?.name||'').trim();
 if(!name)return res.status(400).json({error:'Company name is required'});
 let slug=companySlug(req.body?.slug||name);
 const exists=db.prepare('SELECT id FROM companies WHERE slug=?').get(slug);
 if(exists)return res.status(409).json({error:'A company with this name/slug already exists'});
 const now=new Date().toISOString(),companyId=id('company');
 db.prepare(`INSERT INTO companies(
  id,name,slug,status,primary_domain,support_email,support_phone,timezone,created_at,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
  companyId,
  name,
  slug,
  'draft',
  String(req.body?.primaryDomain||'').trim().toLowerCase(),
  safeEmail(req.body?.supportEmail),
  String(req.body?.supportPhone||'').trim(),
  String(req.body?.timezone||'Europe/London'),
  now,
  now
 );
 audit(req,'staff',req.auth.email,'platform_company_created','company',companyId,{name,slug,status:'draft'});
 res.status(201).json({company:companyPublic(db.prepare('SELECT * FROM companies WHERE id=?').get(companyId))});
});

app.get('/api/admin/me',adminAuth,(req,res)=>{const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(req.auth.staffId);if(!u)return res.status(404).json({error:'Office user not found'});res.json(staffSafe(u))});
app.get('/api/admin/staff',adminAuth,requireStaffRole('administrator'),(req,res)=>res.json({staff:db.prepare('SELECT * FROM staff_users ORDER BY name,email').all().map(staffSafe)}));
app.post('/api/admin/staff',adminAuth,requireStaffRole('administrator'),async(req,res)=>{
 try{
  const email=safeEmail(req.body.email);
  const name=String(req.body.name||'').trim();
  const role=String(req.body.role||'office');
  const password=String(req.body.password||'');

  if(!email||!name||password.length<10){
   return res.status(400).json({error:'Name, email and a password of at least 10 characters are required'});
  }

  if(!['administrator','finance','office','readonly'].includes(role)){
   return res.status(400).json({error:'Invalid role'});
  }

  if(db.prepare('SELECT id FROM staff_users WHERE email=?').get(email)){
   return res.status(409).json({error:'An office user already exists with this email'});
  }

  const hp=hashPassword(password);
  const now=new Date().toISOString();
  const staffId=id('staff');

  db.prepare(`
   INSERT INTO staff_users(
    id,email,name,role,password_hash,password_salt,
    mfa_enabled,active,created_at,updated_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run(
   staffId,email,name,role,hp.hash,hp.salt,
   0,1,now,now
  );

  audit(
   req,
   'staff',
   req.auth.email,
   'office_user_created',
   'staff_user',
   staffId,
   {email,name,role}
  );

  let inviteEmail={sent:false};

  try{
   const html=`
    <div style="margin:0;padding:28px 14px;background:#f3f6f5;font-family:Arial,Helvetica,sans-serif;color:#172033">
     <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4e9e7">
      <div style="background:#173b32;padding:24px 28px;color:#ffffff">
       <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;opacity:.8">FAIVOPAY</div>
       <div style="font-size:25px;font-weight:700;margin-top:7px">Your FaivoPay account is ready</div>
      </div>

      <div style="padding:28px">
       <p style="margin:0 0 18px;font-size:16px;line-height:1.6">Hello ${String(name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},</p>

       <p style="font-size:15px;line-height:1.65;color:#40504a">
        An administrator has created a FaivoPay Office account for you.
       </p>

       <div style="background:#f7f9f8;border:1px solid #e7ece9;border-radius:14px;padding:18px;margin:22px 0">
        <div style="font-size:13px;color:#66736f;margin-bottom:6px">ACCOUNT EMAIL</div>
        <div style="font-size:16px;font-weight:700">${email}</div>
       </div>

       <p style="font-size:15px;line-height:1.65;color:#40504a">
        Use the temporary password provided to you separately by your administrator.
        For security, your temporary password is not included in this email.
       </p>

       <p style="font-size:15px;line-height:1.65;color:#40504a">
        When you first sign in, FaivoPay will require you to set up authenticator-based multi-factor authentication.
       </p>

       <div style="text-align:center;margin:28px 0">
        <a href="${PUBLIC_BASE_URL}" style="display:inline-block;background:#24845b;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 26px;border-radius:10px">
         Sign in to FaivoPay
        </a>
       </div>

       <p style="margin:24px 0 0;font-size:12px;line-height:1.55;color:#7a8581;text-align:center">
        If you were not expecting this account, please contact your FaivoPay administrator.
       </p>
      </div>
     </div>
    </div>`;

   const out=await sendEmail(
    email,
    'Your FaivoPay Office account is ready',
    html
   );

   if(out.sent){
    inviteEmail={sent:true,provider:out.provider||'',id:out.id||''};

    logCommunication({
     channel:'email',
     recipient:email,
     templateKey:'office_user_welcome',
     entityType:'staff_user',
     entityId:staffId,
     status:'sent',
     providerRef:out.id||out.provider||''
    });
   }
  }catch(e){
   inviteEmail={sent:false,error:e.message};

   logCommunication({
    channel:'email',
    recipient:email,
    templateKey:'office_user_welcome',
    entityType:'staff_user',
    entityId:staffId,
    status:'failed',
    error:e.message
   });

   console.error('[FaivoPay] Office welcome email failed',e);
  }

  res.json({
   staff:staffSafe(db.prepare('SELECT * FROM staff_users WHERE id=?').get(staffId)),
   inviteEmail
  });
 }catch(e){
  res.status(500).json({error:e.message});
 }
});
app.patch('/api/admin/staff/:id',adminAuth,requireStaffRole('administrator'),(req,res)=>{const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'Office user not found'});const role='role'in req.body?String(req.body.role):u.role,active='active'in req.body?(req.body.active?1:0):u.active;if(!['administrator','finance','office','readonly'].includes(role))return res.status(400).json({error:'Invalid role'});if(u.id===req.auth.staffId&&!active)return res.status(400).json({error:'You cannot disable your own account'});db.prepare('UPDATE staff_users SET role=?,active=?,updated_at=? WHERE id=?').run(role,active,new Date().toISOString(),u.id);audit(req,'staff',req.auth.email,'office_user_updated','staff_user',u.id,{role,active:Boolean(active)});res.json({staff:staffSafe(db.prepare('SELECT * FROM staff_users WHERE id=?').get(u.id))})});



app.get('/api/admin/office-overview',adminAuth,(req,res)=>{
 refreshPaymentPlanStatuses();

 const today=londonWindow().date;

 const customerRows=db.prepare(
  "SELECT * FROM customer_payments WHERE status='paid' AND substr(paid_at,1,10)=?"
 ).all(today);

 const customer={
  c:customerRows.length,
  total:Number(
   customerRows.reduce(
    (a,x)=>a+Number(x.total_amount||0),
    0
   ).toFixed(2)
  ),
  fees:Number(
   customerRows.reduce(
    (a,x)=>a+Number(x.fee_amount||0),
    0
   ).toFixed(2)
  )
 };

 const payouts=db.prepare(`
  SELECT
   COUNT(*) c,
   COALESCE(SUM(COALESCE(net_amount,amount)),0) total
  FROM payouts
  WHERE status='paid'
   AND substr(paid_at,1,10)=?
 `).get(today);

 /*
  * Paylinks created today.
  * Paid value is kept separate from created value because a link may
  * be created on one day and paid on another.
  */
 const paylinks=db.prepare(`
  SELECT
   COUNT(*) created,
   COALESCE(SUM(total_amount),0) created_value,
   SUM(CASE
    WHEN COALESCE(NULLIF(payment_status,''),status)='open'
    THEN 1 ELSE 0
   END) open,
   SUM(CASE
    WHEN COALESCE(NULLIF(payment_status,''),status)='paid'
    THEN 1 ELSE 0
   END) paid
  FROM customer_payments
  WHERE substr(created_at,1,10)=?
 `).get(today);

 const refunds=db.prepare(`
  SELECT
   COUNT(*) c,
   COALESCE(SUM(amount),0) total
  FROM customer_refunds
  WHERE status='succeeded'
   AND substr(COALESCE(stripe_created_at,created_at),1,10)=?
 `).get(today);

 const earlyToday=db.prepare(`
  SELECT
   COUNT(*) requested,
   COALESCE(SUM(COALESCE(net_amount,amount)),0) requested_total,
   SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved,
   COALESCE(SUM(CASE
    WHEN status='approved'
    THEN COALESCE(net_amount,amount)
    ELSE 0
   END),0) approved_total,
   SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) paid,
   COALESCE(SUM(CASE
    WHEN status='paid'
    THEN COALESCE(net_amount,amount)
    ELSE 0
   END),0) paid_total
  FROM payouts
  WHERE type='early'
   AND substr(created_at,1,10)=?
 `).get(today);

 const customerAttention=db.prepare(`
  SELECT
   SUM(CASE
    WHEN driver_settlement_status='review'
    THEN 1 ELSE 0
   END) settlement_review,
   SUM(CASE
    WHEN autocab_release_status='failed'
    THEN 1 ELSE 0
   END) release_failed,
   SUM(CASE
    WHEN refund_status='pending'
    THEN 1 ELSE 0
   END) refund_pending
  FROM customer_payments
 `).get();

 const openRequests=db.prepare(`
  SELECT
   COUNT(*) open,
   COALESCE(SUM(amount),0) total
  FROM payment_requests
  WHERE status='open'
 `).get();

 const outstandingNow=new Date().toISOString().slice(0,16);

 const overdueRequests=db.prepare(`
  SELECT
   COUNT(*) overdue,
   COALESCE(SUM(amount),0) total
  FROM payment_requests
  WHERE status='open'
   AND due_at IS NOT NULL
   AND substr(due_at,1,16)<?
 `).get(outstandingNow);

 const failedAdjustments=Number(
  db.prepare(
   "SELECT COUNT(*) c FROM autocab_adjustments WHERE status='failed'"
  ).get().c
 );

 const paymentPlanAttention=db.prepare(`
  SELECT
   SUM(CASE WHEN status='defaulted' THEN 1 ELSE 0 END) defaulted,
   SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END) paused
  FROM driver_payment_plans
 `).get();

 const activity=db.prepare(`
  SELECT
   SUM(CASE
    WHEN job_status='completed'
    THEN 1 ELSE 0
   END) completed,
   SUM(CASE
    WHEN job_status='cancelled'
    THEN 1 ELSE 0
   END) cancelled,
   SUM(CASE
    WHEN job_status='no_fare'
    THEN 1 ELSE 0
   END) no_fare,
   SUM(CASE
    WHEN autocab_release_status='released'
    THEN 1 ELSE 0
   END) released
  FROM customer_payments
  WHERE substr(COALESCE(updated_at,created_at),1,10)=?
 `).get(today);

 const sevenDayCustomer=db.prepare(`
  SELECT
   COUNT(*) c,
   COALESCE(SUM(total_amount),0) total,
   COALESCE(SUM(fee_amount),0) fees
  FROM customer_payments
  WHERE status='paid'
   AND substr(paid_at,1,10)>=date(?,'-6 days')
   AND substr(paid_at,1,10)<=?
 `).get(today,today);

 const sevenDayRefunds=db.prepare(`
  SELECT
   COUNT(*) c,
   COALESCE(SUM(amount),0) total
  FROM customer_refunds
  WHERE status='succeeded'
   AND substr(COALESCE(stripe_created_at,created_at),1,10)>=date(?,'-6 days')
   AND substr(COALESCE(stripe_created_at,created_at),1,10)<=?
 `).get(today,today);

 const actionNeeded=
  Number(customerAttention.settlement_review||0)+
  Number(customerAttention.release_failed||0)+
  Number(customerAttention.refund_pending||0)+
  Number(overdueRequests.overdue||0)+
  Number(paymentPlanAttention.defaulted||0)+
  Number(paymentPlanAttention.paused||0)+
  failedAdjustments;

 res.json({
  today,

  customerPayments:{
   count:Number(customer.c),
   total:Number(customer.total),
   fees:Number(customer.fees)
  },

  payouts:{
   count:Number(payouts.c||0),
   total:Number(Number(payouts.total||0).toFixed(2))
  },

  paylinks:{
   created:Number(paylinks.created||0),
   createdValue:Number(Number(paylinks.created_value||0).toFixed(2)),
   open:Number(paylinks.open||0),
   paid:Number(paylinks.paid||0)
  },

  refunds:{
   count:Number(refunds.c||0),
   total:Number(Number(refunds.total||0).toFixed(2))
  },

  early:{
   requested:Number(earlyToday.requested||0),
   requestedTotal:Number(Number(earlyToday.requested_total||0).toFixed(2)),
   approved:Number(earlyToday.approved||0),
   approvedTotal:Number(Number(earlyToday.approved_total||0).toFixed(2)),
   paid:Number(earlyToday.paid||0),
   paidTotal:Number(Number(earlyToday.paid_total||0).toFixed(2))
  },

  attention:{
   total:actionNeeded,
   settlementReview:Number(customerAttention.settlement_review||0),
   releaseFailed:Number(customerAttention.release_failed||0),
   refundPending:Number(customerAttention.refund_pending||0),
   openPaymentRequests:Number(openRequests.open||0),
   openPaymentRequestTotal:Number(Number(openRequests.total||0).toFixed(2)),
   overduePaymentRequests:Number(overdueRequests.overdue||0),
   overduePaymentRequestTotal:Number(Number(overdueRequests.total||0).toFixed(2)),
   defaultedPaymentPlans:Number(paymentPlanAttention.defaulted||0),
   pausedPaymentPlans:Number(paymentPlanAttention.paused||0),
   paymentPlans:
    Number(paymentPlanAttention.defaulted||0)+
    Number(paymentPlanAttention.paused||0),
   failedAdjustments
  },

  activity:{
   completed:Number(activity.completed||0),
   cancelled:Number(activity.cancelled||0),
   noFare:Number(activity.no_fare||0),
   released:Number(activity.released||0)
  },

  sevenDay:{
   customerPayments:{
    count:Number(sevenDayCustomer.c||0),
    total:Number(Number(sevenDayCustomer.total||0).toFixed(2)),
    fees:Number(Number(sevenDayCustomer.fees||0).toFixed(2))
   },
   refunds:{
    count:Number(sevenDayRefunds.c||0),
    total:Number(Number(sevenDayRefunds.total||0).toFixed(2))
   }
  },

  actionNeeded,
  failedAdjustments
 });
});

function officeTransactions(limit=250){
 const rows=[];

 for(const x of db.prepare(
  'SELECT * FROM customer_payments ORDER BY created_at DESC LIMIT ?'
 ).all(limit)){
  rows.push({
   id:x.id,
   ref:`customer_payment:${x.id}`,
   type:'customer_payment',
   typeLabel:'Customer payment',
   direction:'in',
   driverId:x.driver_id||null,
   driverId:x.driver_id||null,
   callsign:x.callsign,
   driverName:x.driver_name,
   bookingId:x.booking_id,
   amount:Number(x.total_amount||0),
   originalAmount:Number(x.total_amount||0),
   refundedAmount:Number(x.refunded_amount||0),
   refundStatus:x.refund_status||null,
   fareAmount:Number(x.fare_amount||0),
   feeAmount:Number(x.fee_amount||0),
   originalFeeAmount:Number(x.fee_amount||0),
   status:x.status,
   provider:x.provider||'stripe',
   providerRef:
    x.stripe_payment_intent_id||
    x.provider_session_id||
    '',
   createdAt:x.paid_at||x.created_at,
   completedAt:x.paid_at
  });
 }

 const refundRows=db.prepare(`
  SELECT
   r.*,
   cp.driver_id,
   cp.callsign,
   cp.driver_name,
   cp.booking_id,
   cp.total_amount,
   cp.fee_amount
  FROM customer_refunds r
  JOIN customer_payments cp
   ON cp.id=r.customer_payment_id
  WHERE r.status='succeeded'
  ORDER BY COALESCE(r.stripe_created_at,r.created_at) DESC
  LIMIT ?
 `).all(limit);

 for(const x of refundRows){
  rows.push({
   id:x.id,
   ref:`customer_refund:${x.id}`,
   type:'customer_refund',
   typeLabel:'Customer refund',
   direction:'out',
   callsign:x.callsign,
   driverName:x.driver_name,
   bookingId:x.booking_id,
   amount:Number(x.amount||0),
   originalAmount:Number(x.total_amount||0),
   refundedAmount:Number(x.amount||0),
   refundStatus:'succeeded',
   fareAmount:0,
   feeAmount:0,
   originalFeeAmount:Number(x.fee_amount||0),
   status:'succeeded',
   provider:'stripe',
   providerRef:x.stripe_refund_id||'',
   createdAt:
    x.stripe_created_at||
    x.created_at,
   completedAt:
    x.stripe_created_at||
    x.updated_at||
    x.created_at,
   refundSource:x.source||null,
   processedBy:x.processed_by||null
  });
 }

 for(const x of db.prepare(
  'SELECT * FROM payment_requests ORDER BY created_at DESC LIMIT ?'
 ).all(limit)){
  rows.push({
   id:x.id,
   ref:`payment_request:${x.id}`,
   type:'driver_payment',
   typeLabel:'Driver payment',
   direction:'in',
   driverId:x.driver_id||null,
   callsign:x.callsign,
   driverName:x.driver_name,
   amount:Number(x.amount),
   feeAmount:
    Number(x.weekly_fee||0)+
    Number(x.carried_charges||0),
   status:x.status,
   provider:x.provider||'manual',
   providerRef:
    x.provider_payment_intent_id||
    x.provider_session_id||
    '',
   requestType:x.request_type||'standard',
   paymentPlanId:x.payment_plan_id||null,
   paymentPlanInstalmentId:x.payment_plan_instalment_id||null,
   dueAt:x.due_at||null,
   createdAt:x.created_at,
   completedAt:x.paid_at
  });
 }

 for(const x of db.prepare(
  'SELECT * FROM payouts ORDER BY created_at DESC LIMIT ?'
 ).all(limit)){
  rows.push({
   id:x.id,
   ref:`payout:${x.id}`,
   type:x.type==='early'
    ? 'early_payout'
    : 'weekly_payout',
   typeLabel:x.type==='early'
    ? 'Early payout'
    : 'Weekly payout',
   direction:'out',
   driverId:x.driver_id||null,
   callsign:x.callsign,
   driverName:x.driver_name,
   amount:Number(x.net_amount||x.amount||0),
   feeAmount:Number(
    x.type==='early'
     ? x.fee
     : x.weekly_fee||0
   ),
   status:x.status,
   provider:x.payout_run_id
    ? 'payment_run'
    : 'manual',
   providerRef:x.payout_run_id||'',
   createdAt:x.created_at,
   completedAt:x.paid_at
  });
 }

 const feeRows=db.prepare(`
  SELECT
   f.*,
   c.full_name,
   cp.fare_amount customerFareAmount,
   cp.fee_amount customerFeeAmount,
   cp.total_amount customerTotalAmount,
   cp.refunded_amount customerRefundedAmount
  FROM fee_ledger f
  LEFT JOIN driver_cache c
   ON c.driver_id=f.driver_id
  LEFT JOIN customer_payments cp
   ON f.fee_type='customer_payment'
   AND f.source_type='customer_payment'
   AND cp.id=f.source_id
  ORDER BY f.created_at DESC
  LIMIT ?
 `).all(limit);

 for(const x of feeRows){
  let effectiveFee=Number(x.gross_fee||0);

  if(
   x.status==='uninvoiced' &&
   x.fee_type==='customer_payment' &&
   x.source_type==='customer_payment' &&
   x.customerTotalAmount!==null
  ){
   effectiveFee=customerPaymentNetAmounts({
    fare_amount:x.customerFareAmount,
    fee_amount:x.customerFeeAmount,
    total_amount:x.customerTotalAmount,
    refunded_amount:x.customerRefundedAmount
   }).netFee;
  }

  rows.push({
   id:x.id,
   ref:`fee:${x.id}`,
   type:'fee',
   typeLabel:
    String(x.fee_type)==='customer_payment'
     ? 'Customer payment fee'
     : String(x.fee_type)==='early_payout'
     ? 'Early payout fee'
     : 'Weekly FaivoPay fee',
   direction:'in',
   driverId:x.driver_id||null,
   callsign:x.callsign,
   driverName:x.full_name,
   amount:Number(effectiveFee.toFixed(2)),
   feeAmount:Number(effectiveFee.toFixed(2)),
   originalAmount:Number(x.gross_fee||0),
   status:x.status,
   provider:'FaivoPay',
   providerRef:x.source_id||'',
   createdAt:x.created_at,
   completedAt:x.invoiced_at||x.created_at
  });
 }

 for(const x of db.prepare(
  "SELECT a.*,c.full_name FROM autocab_adjustments a LEFT JOIN driver_cache c ON c.driver_id=a.driver_id WHERE a.event_key LIKE 'manual:%' ORDER BY a.created_at DESC LIMIT ?"
 ).all(limit)){
  rows.push({
   id:x.id,
   ref:`manual:${x.id}`,
   type:'manual_adjustment',
   typeLabel:x.is_credit
    ? 'Manual pay in'
    : 'Manual payout',
   direction:x.is_credit?'in':'out',
   driverId:x.driver_id||null,
   callsign:x.callsign,
   driverName:x.full_name,
   amount:Number(x.amount),
   feeAmount:0,
   status:x.status,
   provider:'Autocab',
   providerRef:x.event_key||'',
   createdAt:x.created_at,
   completedAt:x.completed_at
  });
 }

 return rows.sort(
  (a,b)=>new Date(b.createdAt)-new Date(a.createdAt)
 );
}
function transactionLondonDate(value){
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/London',
  year:'numeric',
  month:'2-digit',
  day:'2-digit'
 }).formatToParts(d).map(x=>[x.type,x.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}

app.get('/api/admin/transactions',adminAuth,(req,res)=>{
 const limit=Math.min(1000,Math.max(25,Number(req.query.limit||300)));
 const q=String(req.query.q||'').trim().toLowerCase();
 const type=String(req.query.type||'all');
 const status=String(req.query.status||'all');
 const category=String(req.query.category||'all');
 const driverId=String(req.query.driverId||'').trim();
 const dateFrom=String(req.query.dateFrom||'').trim();
 const dateTo=String(req.query.dateTo||'').trim();

 let rows=officeTransactions(limit);

 if(driverId)rows=rows.filter(x=>
  String(x.driverId||'')===driverId
 );

 if(category==='driver_in')rows=rows.filter(x=>
  x.type==='driver_payment' ||
  (x.type==='manual_adjustment' && x.direction==='in')
 );

 if(category==='driver_out')rows=rows.filter(x=>
  x.type==='weekly_payout' ||
  x.type==='early_payout' ||
  (x.type==='manual_adjustment' && x.direction==='out')
 );

 if(category==='customer')rows=rows.filter(x=>
  x.type==='customer_payment' ||
  x.type==='customer_refund'
 );
 if(category==='fees')rows=rows.filter(x=>x.type==='fee');

 if(type!=='all')rows=rows.filter(x=>x.type===type);
 if(status!=='all')rows=rows.filter(x=>x.status===status);

 if(dateFrom)rows=rows.filter(x=>transactionLondonDate(x.createdAt)>=dateFrom);
 if(dateTo)rows=rows.filter(x=>transactionLondonDate(x.createdAt)<=dateTo);

 if(q)rows=rows.filter(x=>
  `${x.id} ${x.callsign||''} ${x.driverName||''} ${x.bookingId||''} ${x.providerRef||''} ${x.typeLabel}`
   .toLowerCase()
   .includes(q)
 );

 res.json({
  transactions:rows.slice(0,limit),
  count:rows.length,
  filters:{category,type,status,dateFrom,dateTo}
 });
});

function officeCsvEscape(value){
 let out=value;
 if(out!==null && typeof out==='object'){
  try{out=JSON.stringify(out)}catch{out=String(out)}
 }
 out=String(out??'');
 if(/^[=+\-@]/.test(out))out=`'${out}`;
 return `"${out.replaceAll('"','""')}"`;
}

function sendOfficeCsv(res,filename,rows,columns=null){
 const safeRows=Array.isArray(rows)?rows:[];
 const keys=columns?.length
  ?columns
  :[...new Set(safeRows.flatMap(row=>Object.keys(row||{})))];
 const csv=[
  keys.map(officeCsvEscape).join(','),
  ...safeRows.map(row=>keys.map(key=>officeCsvEscape(row?.[key])).join(','))
 ].join('\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');
 res.setHeader('Content-Disposition',`attachment; filename=${filename}`);
 res.send(csv);
}

app.get('/api/admin/exports/:dataset.csv',adminAuth,requireStaffRole('administrator','finance','office','readonly'),(req,res)=>{
 try{
  const dataset=String(req.params.dataset||'').trim().toLowerCase();
  let rows=[],filename=`FaivoPay-${dataset}.csv`;

  switch(dataset){
   case 'transactions':
    rows=officeTransactions(10000);
    break;

   case 'customer-payments':
    rows=db.prepare(`
     SELECT id,driver_id driverId,callsign,driver_name driverName,
      booking_id bookingId,customer_name customerName,customer_mobile customerMobile,
      customer_email customerEmail,pickup,destination,journey_at journeyAt,
      fare_amount fareAmount,fee_amount feeAmount,total_amount totalAmount,
      refunded_amount refundedAmount,refund_status refundStatus,status,
      payment_status paymentStatus,job_status jobStatus,
      driver_settlement_status driverSettlementStatus,
      driver_settlement_amount driverSettlementAmount,
      driver_settlement_note driverSettlementNote,provider,
      provider_session_id providerSessionId,
      stripe_payment_intent_id stripePaymentIntentId,payment_method paymentMethod,
      autocab_release_status autocabReleaseStatus,
      autocab_release_attempts autocabReleaseAttempts,
      autocab_release_error autocabReleaseError,source,created_by createdBy,
      created_at createdAt,updated_at updatedAt,paid_at paidAt
     FROM customer_payments ORDER BY created_at DESC
    `).all();
    break;

   case 'monday-settlements':
    rows=db.prepare(`
     SELECT id,run_date runDate,status,created_by createdBy,created_at createdAt,
      approved_at approvedAt,payout_run_id payoutRunId
     FROM settlement_runs WHERE run_date IS NOT NULL ORDER BY created_at DESC
    `).all();
    break;

   case 'early-payouts':
    rows=db.prepare(`SELECT * FROM payouts WHERE type='early' ORDER BY created_at DESC`).all();
    break;

   case 'outstanding':
    rows=db.prepare(`
     SELECT id,run_id runId,driver_id driverId,callsign,driver_name driverName,
      balance,weekly_fee weeklyFee,carried_charges carriedCharges,amount,status,
      provider,provider_session_id providerSessionId,
      provider_payment_intent_id providerPaymentIntentId,paid_at paidAt,due_at dueAt,
      email_sent_at emailSentAt,sms_sent_at smsSentAt,
      communication_error communicationError,payment_plan_id paymentPlanId,
      payment_plan_instalment_id paymentPlanInstalmentId,request_type requestType,
      created_at createdAt,updated_at updatedAt
     FROM payment_requests
     WHERE status NOT IN ('paid','cancelled')
     ORDER BY created_at DESC
    `).all();
    break;

   case 'payment-requests':
    rows=db.prepare(`
     SELECT id,run_id runId,driver_id driverId,callsign,driver_name driverName,
      balance,weekly_fee weeklyFee,carried_charges carriedCharges,amount,status,
      provider,provider_session_id providerSessionId,
      provider_payment_intent_id providerPaymentIntentId,paid_at paidAt,due_at dueAt,
      email_sent_at emailSentAt,sms_sent_at smsSentAt,
      communication_error communicationError,payment_plan_id paymentPlanId,
      payment_plan_instalment_id paymentPlanInstalmentId,request_type requestType,
      created_at createdAt,updated_at updatedAt
     FROM payment_requests ORDER BY created_at DESC
    `).all();
    break;

   case 'payouts':
    rows=db.prepare(`SELECT * FROM payouts ORDER BY created_at DESC`).all();
    break;

   case 'payout-runs':
    rows=db.prepare(`SELECT * FROM payout_runs ORDER BY created_at DESC`).all();
    break;

   case 'drivers':
    rows=cacheRows().map(x=>({
     driverId:x.driverId,callsign:x.callsign,fullName:x.fullName,forename:x.forename,
     surname:x.surname,mobile:x.mobile,email:x.email,active:x.active,suspended:x.suspended,
     previousBalance:x.previousBalance,currentBalance:x.currentBalance,
     payoutExcluded:x.payoutExcluded,payoutExclusionReason:x.payoutExclusionReason,
     lastProcessed:x.lastProcessed,lastProcessedBy:x.lastProcessedBy,syncedAt:x.syncedAt
    }));
    break;

   case 'access':{
    const staffRows=db.prepare(`
     SELECT id,name,email,role,mfa_enabled mfaEnabled,active,
      created_at createdAt,updated_at updatedAt,last_login_at lastLoginAt
     FROM staff_users ORDER BY name,email
    `).all().map(x=>({
     recordType:'staff',id:x.id,driverId:'',callsign:'',name:x.name,email:x.email,
     role:x.role,status:x.active?'active':'disabled',mfaEnabled:Boolean(x.mfaEnabled),
     createdAt:x.createdAt,updatedAt:x.updatedAt,lastLoginAt:x.lastLoginAt
    }));
    const driverRows=db.prepare(`
     SELECT id,driver_id driverId,callsign,email,approved,
      created_at createdAt,updated_at updatedAt,last_login_at lastLoginAt
     FROM driver_users ORDER BY callsign
    `).all().map(x=>({
     recordType:'driver',id:x.id,driverId:x.driverId,callsign:x.callsign,name:'',
     email:x.email,role:'driver',status:x.approved?'approved':'suspended',mfaEnabled:'',
     createdAt:x.createdAt,updatedAt:x.updatedAt,lastLoginAt:x.lastLoginAt
    }));
    rows=[...staffRows,...driverRows];
    break;
   }

   case 'security':
   case 'audit':
    rows=db.prepare(`
     SELECT id,created_at createdAt,actor_type actorType,actor_id actorId,action,
      entity_type entityType,entity_id entityId,details_json detailsJson,ip
     FROM audit_logs ORDER BY id DESC
    `).all();
    filename='FaivoPay-audit.csv';
    break;

   case 'refunds':
    rows=db.prepare(`SELECT * FROM customer_refunds ORDER BY created_at DESC`).all();
    break;

   case 'adjustments':
    rows=db.prepare(`SELECT * FROM autocab_adjustments ORDER BY created_at DESC`).all();
    break;

   case 'communications':
    rows=db.prepare(`SELECT * FROM communications_log ORDER BY created_at DESC`).all();
    break;

   case 'plan-allocations':
    rows=db.prepare(`SELECT * FROM payment_plan_settlement_allocations ORDER BY created_at DESC`).all();
    break;

   default:
    return res.status(404).json({error:'Unknown export dataset'});
  }

  sendOfficeCsv(res,filename,rows);
 }catch(e){
  res.status(500).json({error:e.message});
 }
});

app.get('/api/admin/security',adminAuth,requireStaffRole('administrator'),(req,res)=>{const logs=db.prepare("SELECT id,created_at createdAt,actor_type actorType,actor_id actorId,action,entity_type entityType,entity_id entityId,details_json detailsJson,ip FROM audit_logs WHERE action LIKE 'office_%' OR action LIKE '%login%' OR action LIKE '%mfa%' ORDER BY id DESC LIMIT 300").all().map(r=>({...r,details:JSON.parse(r.detailsJson||'{}')}));res.json({logs})});


function customerPaymentFeeFor(fareAmount,settings=getSettings()){
 let fee=0;
 if(settings.customerPaymentFeeType==='percentage')fee=Number(fareAmount)*(Number(settings.customerPaymentFeeValue||0)/100);
 else fee=Number(settings.customerPaymentFeeValue||0);
 return Math.round(Math.max(0,fee)*100)/100;
}
function publicCustomerPayment(row){
 if(!row)return null;
 return {
  id:row.id,bookingId:row.booking_id||'',customerName:row.customer_name||'',pickup:row.pickup||'',destination:row.destination||'',journeyAt:row.journey_at||null,
  taxiCompany:row.taxi_company||getSettings().companyName||'Taxi company',fareAmount:Number(row.fare_amount||0),feeAmount:Number(row.fee_amount||0),totalAmount:Number(row.total_amount||0),
  status:row.status,
  paymentStatus:row.payment_status||row.status||'open',
  jobStatus:row.job_status||'awaiting_payment',
  driverSettlementStatus:row.driver_settlement_status||'not_ready',
  driverSettlementAmount:
   row.driver_settlement_amount===null || row.driver_settlement_amount===undefined
    ? null
    : Number(row.driver_settlement_amount),
  driverSettlementNote:row.driver_settlement_note||'',
  driverSettlementReviewedBy:row.driver_settlement_reviewed_by||null,
  driverSettlementReviewedAt:row.driver_settlement_reviewed_at||null,
  autocabReleaseStatus:row.autocab_release_status||'not_required',
  autocabReleaseAttempts:Number(row.autocab_release_attempts||0),
  autocabReleaseError:row.autocab_release_error||null,
  autocabReleasedAt:row.autocab_released_at||null,
  createdAt:row.created_at,
  paidAt:row.paid_at||null,
  refundStatus:row.refund_status||null,
  refundedAmount:Number(row.refunded_amount||0)
 };
}
app.get('/api/public/customer-payments/:id',(req,res)=>{
 const row=db.prepare('SELECT * FROM customer_payments WHERE id=?').get(req.params.id);
 if(!row)return res.status(404).json({error:'Payment link not found'});
 res.json({payment:publicCustomerPayment(row),stripeConfigured:Boolean(getStripeClient())});
});
app.post('/api/public/customer-payments/:id/checkout',async(req,res)=>{
 try{
  if(!getStripeClient())return res.status(400).json({error:'Card payments are not currently available.'});
  const row=db.prepare('SELECT * FROM customer_payments WHERE id=?').get(req.params.id);
  if(!row)return res.status(404).json({error:'Payment link not found'});
  if(row.status==='paid')return res.status(400).json({error:'This payment has already been completed.'});
  if(row.status==='cancelled')return res.status(400).json({error:'This payment link has been cancelled.'});
  const session=await createStripeCustomerPayment(row);
  res.json({ok:true,checkoutUrl:session.url});
 }catch(e){res.status(500).json({error:e.message})}
});
function customerPaymentNetAmounts(payment){
 const fare=Math.max(0,Number(payment?.fareAmount??payment?.fare_amount??0));
 const fee=Math.max(0,Number(payment?.feeAmount??payment?.fee_amount??0));
 const total=Math.max(0,Number(payment?.totalAmount??payment?.total_amount??0));
 const refunded=Math.min(
  total,
  Math.max(0,Number(payment?.refundedAmount??payment?.refunded_amount??0))
 );

 // Refund fare first. Only the portion above fare reduces the service fee.
 const feeRefunded=Math.min(
  fee,
  Math.max(0,refunded-fare)
 );

 const netFee=Math.max(0,fee-feeRefunded);
 const netReceived=Math.max(0,total-refunded);

 return {
  refunded:Number(refunded.toFixed(2)),
  feeRefunded:Number(feeRefunded.toFixed(2)),
  netFee:Number(netFee.toFixed(2)),
  netReceived:Number(netReceived.toFixed(2))
 };
}

app.get('/api/admin/customer-payments',adminAuth,(req,res)=>{
 const rows=db.prepare(`SELECT cp.*,fl.fleetpay_share,fl.taxi_company_share,fl.gross_fee
  FROM customer_payments cp LEFT JOIN fee_ledger fl ON fl.source_type='customer_payment' AND fl.source_id=cp.id
  ORDER BY cp.created_at DESC LIMIT 500`).all();
 const payments=rows.map(r=>({...publicCustomerPayment(r),driverId:r.driver_id,callsign:r.callsign,driverName:r.driver_name,customerMobile:r.customer_mobile||'',customerEmail:r.customer_email||'',notes:r.notes||'',source:r.source||'driver',createdBy:r.created_by||'',paymentUrl:r.payment_url||`${PUBLIC_BASE_URL}/pay/${r.id}`,provider:r.provider||'stripe',providerRef:r.stripe_payment_intent_id||r.provider_session_id||'',fleetPayFeeShare:Number(r.fleetpay_share||0),taxiCompanyFeeShare:Number(r.taxi_company_share||0),grossFee:Number(r.gross_fee||r.fee_amount||0)}));
 const paid=payments.filter(
  x=>x.paymentStatus==='paid'||x.status==='paid'
 );

 const open=payments.filter(
  x=>x.paymentStatus==='open'||x.status==='open'
 );

 const needsReview=payments.filter(
  x=>
   x.driverSettlementStatus==='review' ||
   x.autocabReleaseStatus==='failed'
 );

 const releaseFailed=payments.filter(
  x=>x.autocabReleaseStatus==='failed'
 );

 res.json({
  payments,
  summary:{
   count:payments.length,
   open:open.length,
   paid:paid.length,
   needsReview:needsReview.length,
   releaseFailed:releaseFailed.length,
   grossPaid:Number(
    paid.reduce(
     (a,x)=>a+customerPaymentNetAmounts(x).netReceived,
     0
    ).toFixed(2)
   ),
   refunded:Number(
    paid.reduce(
     (a,x)=>a+customerPaymentNetAmounts(x).refunded,
     0
    ).toFixed(2)
   ),
   feesPaid:Number(
    paid.reduce(
     (a,x)=>a+customerPaymentNetAmounts(x).netFee,
     0
    ).toFixed(2)
   ),
   fleetPayShare:Number(
    paid.reduce((a,x)=>{
     const originalFee=Number(x.grossFee||x.feeAmount||0);
     if(originalFee<=0)return a;

     const ratio=Number(x.fleetPayFeeShare||0)/originalFee;
     return a+(customerPaymentNetAmounts(x).netFee*ratio);
    },0).toFixed(2)
   ),
   taxiCompanyShare:Number(
    paid.reduce((a,x)=>{
     const originalFee=Number(x.grossFee||x.feeAmount||0);
     if(originalFee<=0)return a;

     const ratio=Number(x.taxiCompanyFeeShare||0)/originalFee;
     return a+(customerPaymentNetAmounts(x).netFee*ratio);
    },0).toFixed(2)
   )
  }
 });
});
app.post('/api/admin/customer-payments',adminAuth,requireStaffRole('administrator','finance','office'),(req,res)=>{
 try{
  const fareAmount=Number(req.body.fareAmount||0);
  if(!Number.isFinite(fareAmount)||fareAmount<=0)return res.status(400).json({error:'Enter a valid journey fare.'});
  const bookingId=String(req.body.bookingId||'').trim();
  const customerName=String(req.body.customerName||'').trim();
  const customerMobile=String(req.body.customerMobile||'').trim();
  const customerEmail=safeEmail(req.body.customerEmail||'');
  const pickup=String(req.body.pickup||'').trim();
  const destination=String(req.body.destination||'').trim();
  const journeyAt=String(req.body.journeyAt||'').trim()||null;
  const notes=String(req.body.notes||'').trim();
  const taxiCompany=String(req.body.taxiCompany||getSettings().companyName||'Taxi company').trim();
  const callsign=String(req.body.callsign||'').trim();
  let driverId=0,driverName='Office payment';
  if(callsign){const d=cacheRows().find(x=>String(x.callsign)===callsign);if(!d)return res.status(400).json({error:`Callsign ${callsign} was not found in the FaivoPay driver cache.`});driverId=d.driverId;driverName=d.fullName||`Callsign ${callsign}`;}
  const feeAmount=customerPaymentFeeFor(fareAmount);
  const totalAmount=Math.round((fareAmount+feeAmount)*100)/100;
  const paymentId=id('customerpay'),now=new Date().toISOString(),paymentUrl=`${PUBLIC_BASE_URL}/pay/${paymentId}`;
  db.prepare(`INSERT INTO customer_payments(id,driver_id,callsign,driver_name,booking_id,fare_amount,fee_amount,total_amount,status,payment_url,customer_name,customer_mobile,customer_email,pickup,destination,journey_at,taxi_company,notes,source,created_by,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(paymentId,driverId,callsign||'OFFICE',driverName,bookingId||null,fareAmount,feeAmount,totalAmount,'open',paymentUrl,customerName,customerMobile,customerEmail,pickup,destination,journeyAt,taxiCompany,notes,'office_manual',req.auth.email,now,now);
  audit(req,'admin',req.auth.email,'customer_payment_link_created','customer_payment',paymentId,{bookingId:bookingId||null,callsign:callsign||null,fareAmount,feeAmount,totalAmount});
  res.json({ok:true,payment:publicCustomerPayment(db.prepare('SELECT * FROM customer_payments WHERE id=?').get(paymentId)),paymentUrl});
 }catch(e){res.status(500).json({error:e.message})}
});
app.post('/api/admin/customer-payments/:id/cancel',adminAuth,requireStaffRole('administrator','finance','office'),(req,res)=>{
 const row=db.prepare('SELECT * FROM customer_payments WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Payment not found'});if(row.status==='paid')return res.status(400).json({error:'Paid payments cannot be cancelled. Use the refund workflow when enabled.'});
 db.prepare('UPDATE customer_payments SET status=?,updated_at=? WHERE id=?').run('cancelled',new Date().toISOString(),row.id);audit(req,'admin',req.auth.email,'customer_payment_cancelled','customer_payment',row.id,{});res.json({ok:true});
});


function syncStripeRefundsToLedger(paymentRow,refundRows=[]){
 const now=new Date().toISOString();

 for(const refund of refundRows||[]){
  const stripeRefundId=String(refund?.id||'').trim();

  if(!stripeRefundId)continue;

  const amount=
   Math.round((Number(refund?.amount||0)/100)*100)/100;

  const stripeCreatedAt=
   Number(refund?.created||0)>0
    ? new Date(Number(refund.created)*1000).toISOString()
    : now;

  const fleetPayCreated=
   String(
    refund?.metadata?.fleetpay_customer_payment_id||''
   )===String(paymentRow.id);

  const source=
   fleetPayCreated
    ? 'fleetpay'
    : 'stripe_external';

  const processedBy=
   String(refund?.metadata?.processed_by||'').trim()||null;

  db.prepare(`
   INSERT INTO customer_refunds(
    id,
    customer_payment_id,
    booking_id,
    stripe_refund_id,
    stripe_payment_intent_id,
    amount,
    currency,
    status,
    reason,
    source,
    processed_by,
    stripe_created_at,
    created_at,
    updated_at
   )
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(stripe_refund_id)
   DO UPDATE SET
    status=excluded.status,
    updated_at=excluded.updated_at
  `).run(
   `customerrefund_${stripeRefundId}`,
   paymentRow.id,
   paymentRow.booking_id||null,
   stripeRefundId,
   refund?.payment_intent
    ? String(refund.payment_intent)
    : String(paymentRow.stripe_payment_intent_id||'')||null,
   amount,
   String(refund?.currency||'gbp').toLowerCase(),
   String(refund?.status||'unknown'),
   refund?.reason ? String(refund.reason) : null,
   source,
   processedBy,
   stripeCreatedAt,
   stripeCreatedAt,
   now
  );
 }
}


app.post(
 '/api/admin/customer-payments/:id/refund',
 adminAuth,
 requireStaffRole('administrator','finance','office'),
 async(req,res)=>{
  try{
   if(!getStripeClient()){
    return res.status(400).json({
     error:'Stripe refunds are not currently available.'
    });
   }

   const row=db.prepare(
    'SELECT * FROM customer_payments WHERE id=?'
   ).get(req.params.id);

   if(!row){
    return res.status(404).json({error:'Payment not found'});
   }

   const paymentStatus=
    row.payment_status ||
    row.status ||
    'open';

   if(paymentStatus!=='paid'){
    return res.status(400).json({
     error:'Only successfully paid customer payments can be refunded.'
    });
   }

   if(!['no_fare','cancelled'].includes(String(row.job_status||''))){
    return res.status(400).json({
     error:'Customer refunds are currently available for No Fare or Cancelled jobs only.'
    });
   }

   const paymentIntentId=String(
    row.stripe_payment_intent_id||''
   ).trim();

   if(!paymentIntentId){
    return res.status(400).json({
     error:'This payment does not have a Stripe Payment Intent to refund.'
    });
   }

   const decision=String(req.body.decision||'').trim();
   const total=Math.round(Number(row.total_amount||0)*100)/100;
   const fare=Math.round(Number(row.fare_amount||0)*100)/100;
   const fee=Math.round(Number(row.fee_amount||0)*100)/100;
   const refundableAmount=fare;

   /*
    * Read Stripe first so Stripe remains the authority for how much
    * has actually been refunded. This protects against duplicate clicks
    * or a previous refund succeeding before FaivoPay saved its state.
    */
   const stripeRefunds=await getStripeClient().refunds.list({
    payment_intent:paymentIntentId,
    limit:100
   });

   const stripeRefundRows=stripeRefunds.data||[];

   syncStripeRefundsToLedger(
    row,
    stripeRefundRows
   );

   const refundedPence=stripeRefundRows
    .filter(r=>String(r.status||'')==='succeeded')
    .reduce((sum,r)=>sum+Number(r.amount||0),0);

   const pendingRefundPence=stripeRefundRows
    .filter(r=>['pending','requires_action'].includes(String(r.status||'')))
    .reduce((sum,r)=>sum+Number(r.amount||0),0);

   const alreadyRefunded=
    Math.round((refundedPence/100)*100)/100;

   const pendingRefundAmount=
    Math.round((pendingRefundPence/100)*100)/100;

   if(decision==='none'){
    if(alreadyRefunded>0 || pendingRefundAmount>0){
     return res.status(400).json({
      error:
       pendingRefundAmount>0
        ? 'A Stripe refund is currently pending for this payment.'
        : 'A Stripe refund has already been issued for this payment.'
     });
    }

    const now=new Date().toISOString();

    db.prepare(`
     UPDATE customer_payments
     SET refund_status='none',
         refunded_amount=0,
         refunded_at=NULL,
         updated_at=?
     WHERE id=?
    `).run(now,row.id);

    audit(
     req,
     'admin',
     req.auth.email,
     'customer_payment_refund_declined',
     'customer_payment',
     row.id,
     {
      bookingId:row.booking_id||null,
      totalAmount:total
     }
    );

    return res.json({
     ok:true,
     decision:'none',
     payment:publicCustomerPayment(
      db.prepare(
       'SELECT * FROM customer_payments WHERE id=?'
      ).get(row.id)
     )
    });
   }

   let targetRefund;

   if(decision==='full'){
    targetRefund=refundableAmount;

   }else if(decision==='partial'){
    targetRefund=
     Math.round(Number(req.body.amount||0)*100)/100;

    if(
     !Number.isFinite(targetRefund) ||
     targetRefund<=0 ||
     targetRefund>refundableAmount
    ){
     return res.status(400).json({
      error:
       `Enter a refund amount between £0.01 and £${refundableAmount.toFixed(2)}. `+
       `The £${fee.toFixed(2)} FaivoPay service fee is non-refundable.`
     });
    }

   }else{
    return res.status(400).json({
     error:'Choose full, partial or no refund.'
    });
   }

   if(targetRefund<alreadyRefunded){
    return res.status(400).json({
     error:
      `£${alreadyRefunded.toFixed(2)} has already been refunded. `+
      `The new total refund cannot be lower than that amount.`
    });
   }

   if(pendingRefundAmount>0){
    return res.status(409).json({
     error:
      `A Stripe refund of £${pendingRefundAmount.toFixed(2)} is still pending. `+
      `Wait for Stripe to complete or fail that refund before trying again.`
    });
   }

   const additionalRefund=
    Math.round((targetRefund-alreadyRefunded)*100)/100;

   let stripeRefund=null;

   if(additionalRefund>0){
    stripeRefund=await getStripeClient().refunds.create(
     {
      payment_intent:paymentIntentId,
      amount:Math.round(additionalRefund*100),
      metadata:{
       fleetpay_customer_payment_id:String(row.id),
       booking_id:String(row.booking_id||''),
       processed_by:String(req.auth.email||'')
      }
     },
     {
      idempotencyKey:
       `fleetpay-refund-${row.id}-${Math.round(targetRefund*100)}`
     }
    );
   }

   /*
    * Re-read Stripe after the operation rather than assuming the
    * requested amount was accepted.
    */
   const verifiedRefunds=await getStripeClient().refunds.list({
    payment_intent:paymentIntentId,
    limit:100
   });

   const verifiedRefundRows=verifiedRefunds.data||[];

   syncStripeRefundsToLedger(
    row,
    verifiedRefundRows
   );

   const verifiedPence=verifiedRefundRows
    .filter(r=>String(r.status||'')==='succeeded')
    .reduce((sum,r)=>sum+Number(r.amount||0),0);

   const verifiedPendingPence=verifiedRefundRows
    .filter(r=>['pending','requires_action'].includes(String(r.status||'')))
    .reduce((sum,r)=>sum+Number(r.amount||0),0);

   const verifiedAmount=
    Math.round((verifiedPence/100)*100)/100;

   const verifiedPendingAmount=
    Math.round((verifiedPendingPence/100)*100)/100;

   const refundStatus=
    verifiedPendingAmount>0
     ? 'pending'
     : verifiedAmount>=refundableAmount
     ? 'full'
     : verifiedAmount>0
     ? 'partial'
     : 'none';

   const now=new Date().toISOString();

   db.prepare(`
    UPDATE customer_payments
    SET refund_status=?,
        refunded_amount=?,
        refunded_at=CASE
         WHEN ?>0 THEN ?
         ELSE refunded_at
        END,
        updated_at=?
    WHERE id=?
   `).run(
    refundStatus,
    verifiedAmount,
    verifiedAmount,
    now,
    now,
    row.id
   );

   audit(
    req,
    'admin',
    req.auth.email,
    'customer_payment_refunded',
    'customer_payment',
    row.id,
    {
     bookingId:row.booking_id||null,
     decision,
     previousRefundedAmount:alreadyRefunded,
     additionalRefundAmount:additionalRefund,
     refundedAmount:verifiedAmount,
     pendingRefundAmount:verifiedPendingAmount,
     totalAmount:total,
     refundableAmount,
     retainedFeeAmount:fee,
     stripeRefundId:stripeRefund?.id||null,
     stripeRefundStatus:stripeRefund?.status||null
    }
   );

   res.json({
    ok:true,
    decision,
    additionalRefundAmount:additionalRefund,
    refundedAmount:verifiedAmount,
    pendingRefundAmount:verifiedPendingAmount,
    refundStatus,
    payment:publicCustomerPayment(
     db.prepare(
      'SELECT * FROM customer_payments WHERE id=?'
     ).get(row.id)
    )
   });

  }catch(e){
   console.error('[FaivoPay] customer refund failed',e);

   res.status(500).json({
    error:e.message||'Customer refund could not be processed.'
   });
  }
 }
);

async function findFleetPayUnpostedDocket(row){
 const bookingId=String(row?.booking_id||'').trim();
 if(!bookingId)throw new Error('Customer payment has no Autocab booking ID.');

 const anchorRaw=row.journey_at||row.created_at||new Date().toISOString();
 const anchor=new Date(anchorRaw);

 if(Number.isNaN(anchor.getTime())){
  throw new Error(`Invalid journey date for booking ${bookingId}.`);
 }

 const from=new Date(anchor);
 from.setUTCDate(from.getUTCDate()-1);
 from.setUTCHours(0,0,0,0);

 const to=new Date(anchor);
 to.setUTCDate(to.getUTCDate()+2);
 to.setUTCHours(23,59,59,999);

 const driverId=Number(row.driver_id||0);

 const response=await postJson(
  `${BASE_URL}/accounts/v1/DocketsChecksPostings?pageno=1&pagesize=1000`,
  {
   from:from.toISOString(),
   to:to.toISOString(),
   invoiceDate:anchor.toISOString(),
   companyId:null,
   driverId:driverId>0?driverId:null,
   vehicleId:null,
   accountId:null
  }
 );

 const dockets=Array.isArray(response?.docketsPage)
  ? response.docketsPage
  : [];

 const matchingDockets=dockets.filter(
  d=>String(d?.bookingId||'').trim()===bookingId
 );

 if(matchingDockets.length>1){
  throw new Error(
   `Autocab returned more than one unposted docket for booking ${bookingId}. `+
   `Settlement was stopped for manual review.`
  );
 }

 const docket=matchingDockets[0];

 if(!docket){
  throw new Error(
   `Autocab unposted docket for booking ${bookingId} was not found. `+
   `It may already have been posted or may not yet have reached Dockets Checks & Postings.`
  );
 }

 const docketCustomerId=Number(
  docket.customerId ??
  docket.customer?.id ??
  0
 );

 const docketAccountCode=String(
  docket.accountCode ??
  docket.customer?.accountCode ??
  ''
 ).trim();

 if(
  docketCustomerId!==AUTOCAB_FLEETPAY_CUSTOMER_ID &&
  docketAccountCode!==AUTOCAB_FLEETPAY_ACCOUNT_CODE
 ){
  throw new Error(
   `Autocab docket ${docket.docketNumber||docket.id} does not belong to the FaivoPay account.`
  );
 }

 return docket;
}

async function applyFleetPaySettlementToAutocab(row,amount){
 const bookingId=String(row.booking_id||'').trim();
 const roundedAmount=Math.round(Number(amount||0)*100)/100;

 if(!Number.isFinite(roundedAmount) || roundedAmount<0){
  throw new Error(`Invalid Autocab docket Cost for booking ${bookingId}.`);
 }

 const docket=await findFleetPayUnpostedDocket(row);

 if(!docket.pricing || typeof docket.pricing!=='object'){
  throw new Error(
   `Autocab docket ${docket.docketNumber||docket.id} has no pricing object.`
  );
 }

 const existingCost=Math.round(
  Number(docket.pricing.cost||0)*100
 )/100;

 /*
  * Idempotency/recovery:
  * if a previous attempt already updated and approved the docket,
  * accept that state when the Cost matches the requested amount.
  */
 if(docket.approved){
  if(existingCost!==roundedAmount){
   throw new Error(
    `Autocab docket ${docket.docketNumber||docket.id} is already approved `+
    `with Cost £${existingCost.toFixed(2)}, not £${roundedAmount.toFixed(2)}.`
   );
  }

  if(docket.manualEnteredFare!==true){
   throw new Error(
    `Autocab docket ${docket.docketNumber||docket.id} is already approved, `+
    `but it was not marked as a manual fare override. Settlement was stopped for review.`
   );
  }

  return {
   bookingId,
   docketId:Number(docket.id),
   docketNumber:docket.docketNumber||null,
   source:docket.source||null,
   cost:existingCost,
   price:Math.round(Number(docket.pricing.price||0)*100)/100,
   approved:true,
   manualEnteredFare:Boolean(docket.manualEnteredFare),
   posted:false,
   recovered:true
  };
 }

 const originalPrice=Math.round(Number(docket.pricing.price||0)*100)/100;

 docket.pricing.cost=roundedAmount;
 docket.manualEnteredFare=true;

 /*
  * Mirrors the Autocab UI option to keep corresponding docket data aligned.
  * We deliberately do NOT alter pricing.price.
  */
 docket.copyToOtherDockets=true;

 const updated=await putJson(
  `${BASE_URL}/accounts/v1/dockets/${encodeURIComponent(docket.id)}`,
  docket
 );

 const returnedCost=Math.round(Number(updated?.pricing?.cost||0)*100)/100;
 const returnedPrice=Math.round(Number(updated?.pricing?.price||0)*100)/100;

 if(returnedCost!==roundedAmount){
  throw new Error(
   `Autocab did not accept the driver Cost change for booking ${bookingId}. `+
   `Expected £${roundedAmount.toFixed(2)}, received £${returnedCost.toFixed(2)}.`
  );
 }

 if(returnedPrice!==originalPrice){
  throw new Error(
   `Autocab unexpectedly changed the customer Price for booking ${bookingId} `+
   `from £${originalPrice.toFixed(2)} to £${returnedPrice.toFixed(2)}.`
  );
 }

 if(updated?.manualEnteredFare!==true){
  throw new Error(
   `Autocab did not retain manualEnteredFare for booking ${bookingId}.`
  );
 }

 const approval=await postJson(
  `${BASE_URL}/accounts/v1/approveDockets`,
  {Ids:[Number(docket.id)]}
 );

 const approvedIds=Array.isArray(approval?.approvedDockets)
  ? approval.approvedDockets.map(Number)
  : [];

 if(!approvedIds.includes(Number(docket.id))){
  throw new Error(
   `Autocab did not confirm approval of docket ${docket.docketNumber||docket.id}.`
  );
 }

 /*
  * Re-read the Checks & Postings copy. We do NOT post it here.
  */
 const verified=await findFleetPayUnpostedDocket(row);

 const verifiedCost=Math.round(
  Number(verified?.pricing?.cost||0)*100
 )/100;

 if(!verified.approved || verifiedCost!==roundedAmount){
  throw new Error(
   `Autocab docket verification failed for booking ${bookingId}.`
  );
 }

 return {
  bookingId,
  docketId:Number(verified.id),
  docketNumber:verified.docketNumber||null,
  source:verified.source||null,
  cost:verifiedCost,
  price:Math.round(Number(verified?.pricing?.price||0)*100)/100,
  approved:Boolean(verified.approved),
  manualEnteredFare:Boolean(verified.manualEnteredFare),
  posted:false
 };
}

app.post(
 '/api/admin/customer-payments/:id/settlement-review',
 adminAuth,
 requireStaffRole('administrator','finance','office'),
 async(req,res)=>{
  try{
   const row=db.prepare(
    'SELECT * FROM customer_payments WHERE id=?'
   ).get(req.params.id);

   if(!row)return res.status(404).json({error:'Payment not found'});

   if(row.payment_status!=='paid' && row.status!=='paid'){
    return res.status(400).json({
     error:'Only paid customer payments can be reviewed.'
    });
   }

   if(!['no_fare','cancelled'].includes(String(row.job_status||''))){
    return res.status(400).json({
     error:'Settlement review is only available for paid No Fare or Cancelled jobs.'
    });
   }

   if(row.source!=='autocab_booking_created'){
    return res.status(400).json({
     error:'This settlement workflow requires an Autocab-created customer payment.'
    });
   }

   const decision=String(req.body.decision||'').trim();
   const note=String(req.body.note||'').trim();
   const fare=Math.round(Number(row.fare_amount||0)*100)/100;

   let amount=null;
   let nextStatus='review';

   if(decision==='full'){
    amount=fare;
    nextStatus='approved';

   }else if(decision==='reduced'){
    amount=Math.round(Number(req.body.amount||0)*100)/100;

    if(!Number.isFinite(amount) || amount<0 || amount>fare){
     return res.status(400).json({
      error:`Enter a driver payment between £0.00 and £${fare.toFixed(2)}.`
     });
    }

    nextStatus=amount>0?'approved':'held';

   }else if(decision==='hold'){
    amount=0;
    nextStatus='held';

   }else{
    return res.status(400).json({
     error:'Choose full, reduced or hold.'
    });
   }

   if((decision==='reduced'||decision==='hold') && !note){
    return res.status(400).json({
     error:'Enter an office note explaining this settlement decision.'
    });
   }

   /*
    * Autocab remains the source of truth for driver accounting.
    * Update and approve the unposted docket BEFORE recording the
    * FaivoPay settlement decision. No driver_ledger credit is created.
    */
   let autocabSettlement;

   try{
    autocabSettlement=await applyFleetPaySettlementToAutocab(row,amount);
   }catch(e){
    audit(
     req,
     'admin',
     req.auth.email,
     'customer_payment_settlement_autocab_failed',
     'customer_payment',
     row.id,
     {
      bookingId:row.booking_id||null,
      decision,
      approvedDriverAmount:amount,
      error:e.message
     }
    );

    return res.status(502).json({
     error:`Autocab settlement update failed: ${e.message}`
    });
   }

   const now=new Date().toISOString();

   db.prepare(`
    UPDATE customer_payments
    SET driver_settlement_status=?,
        driver_settlement_amount=?,
        driver_settlement_note=?,
        driver_settlement_reviewed_by=?,
        driver_settlement_reviewed_at=?,
        updated_at=?
    WHERE id=?
   `).run(
    nextStatus,
    amount,
    note||null,
    req.auth.email,
    now,
    now,
    row.id
   );

   audit(
    req,
    'admin',
    req.auth.email,
    'customer_payment_settlement_reviewed',
    'customer_payment',
    row.id,
    {
     bookingId:row.booking_id||null,
     jobStatus:row.job_status,
     decision,
     fareAmount:fare,
     approvedDriverAmount:amount,
     settlementStatus:nextStatus,
     note:note||null,
     autocabSettlement
    }
   );

   const updated=db.prepare(
    'SELECT * FROM customer_payments WHERE id=?'
   ).get(row.id);

   res.json({
    ok:true,
    payment:publicCustomerPayment(updated),
    autocabSettlement
   });

  }catch(e){
   res.status(500).json({error:e.message});
  }
 }
);

app.post(
 '/api/admin/customer-payments/:id/retry-autocab-release',
 adminAuth,
 requireStaffRole('administrator','finance','office'),
 async(req,res)=>{
  const row=db.prepare(
   'SELECT * FROM customer_payments WHERE id=?'
  ).get(req.params.id);

  if(!row)return res.status(404).json({error:'Payment not found'});

  if(row.source!=='autocab_booking_created'){
   return res.status(400).json({error:'This payment was not created from an Autocab booking.'});
  }

  if(row.payment_status!=='paid' && row.status!=='paid'){
   return res.status(400).json({error:'The customer payment has not been paid.'});
  }

  if(row.job_status!=='release_pending'){
   return res.status(400).json({
    error:`Autocab release cannot be retried while the job status is ${row.job_status||'unknown'}.`
   });
  }

  try{
   const result=await releaseFleetPayBooking(row.id);

   audit(
    req,
    'admin',
    req.auth.email,
    'customer_payment_booking_release_retried',
    'customer_payment',
    row.id,
    {
     bookingId:row.booking_id||null,
     result
    }
   );

   const updated=db.prepare(
    'SELECT * FROM customer_payments WHERE id=?'
   ).get(row.id);

   return res.json({
    ok:true,
    result,
    payment:publicCustomerPayment(updated)
   });

  }catch(e){
   const now=new Date().toISOString();
   const message=String(
    e.message||'Autocab release failed'
   ).slice(0,1000);

   db.prepare(`
    UPDATE customer_payments
    SET autocab_release_status='failed',
        autocab_release_error=?,
        updated_at=?
    WHERE id=?
      AND job_status='release_pending'
   `).run(message,now,row.id);

   audit(
    req,
    'admin',
    req.auth.email,
    'customer_payment_booking_release_retry_failed',
    'customer_payment',
    row.id,
    {
     bookingId:row.booking_id||null,
     error:message
    }
   );

   return res.status(502).json({
    error:`Autocab release failed: ${message}`
   });
  }
 }
);

app.get('/api/admin/autocab-booking-webhooks',adminAuth,requireStaffRole('administrator','finance','office'),(req,res)=>{
 const rows=db.prepare(`
  SELECT
   id,
   event_type eventType,
   booking_id bookingId,
   company_id companyId,
   row_version rowVersion,
   passenger_name passengerName,
   passenger_mobile passengerMobile,
   passenger_email passengerEmail,
   pickup,
   destination,
   pickup_due_time pickupDueTime,
   driver_cost driverCost,
   office_price officePrice,
   payment_method paymentMethod,
   capabilities_json capabilitiesJson,
   has_payment_capability hasPaymentCapability,
   status,
   received_at receivedAt,
   processed_at processedAt,
   error
  FROM autocab_booking_webhooks
  ORDER BY received_at DESC
  LIMIT 100
 `).all().map(x=>({
  ...x,
  hasPaymentCapability:Boolean(x.hasPaymentCapability),
  capabilities:(()=>{try{return JSON.parse(x.capabilitiesJson||'[]')}catch{return []}})()
 }));
 res.json({webhooks:rows});
});

app.get('/api/admin/integrations',adminAuth,(req,res)=>{
 const stripeKey=getStripeSecretKey();

 res.json({
  stripe:{
   configured:Boolean(stripeKey),
   testMode:stripeKey.startsWith('sk_test_')
  },
  wise:{
   configured:Boolean(WISE_API_TOKEN),
   environment:WISE_ENV,
   profileId:WISE_PROFILE_ID||null
  },
  autocab:{
   configured:Boolean(getAutocabApiKey()),
   adjustmentsEnabled:AUTOCAB_ADJUSTMENTS_ENABLED
  },
  push:{
   configured:Boolean(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY),
   publicKey:VAPID_PUBLIC_KEY||null
  }
 });
});
app.post('/api/admin/integrations/wise/test',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{try{const out=await testWiseConnection();audit(req,'admin',req.auth.email,'wise_connection_test','integration','wise',{environment:WISE_ENV});res.json(out)}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/autocab/test-adjustment',adminAuth,requireStaffRole('administrator'),async(req,res)=>{try{const callsign=String(req.body.callsign||'').trim();const d=cacheRows().find(x=>String(x.callsign)===callsign);if(!d)return res.status(404).json({error:'Callsign not found in FaivoPay cache'});const amount=Number(req.body.amount||0);if(!(amount>0))return res.status(400).json({error:'Amount must be greater than zero'});const result=await postAutocabAdjustment({driverId:d.driverId,callsign:d.callsign,amount,isCredit:Boolean(req.body.isCredit),description:String(req.body.description||'FaivoPay test adjustment'),adjustmentReason:String(req.body.adjustmentReason||'FleetPay Test'),eventKey:`test:${Date.now()}:${d.driverId}`,force:true});audit(req,'admin',req.auth.email,'autocab_test_adjustment','driver',d.callsign,{callsign:d.callsign,amount,isCredit:Boolean(req.body.isCredit)});setTimeout(()=>syncAutocab().catch(()=>{}),500);res.json({ok:true,driver:{driverId:d.driverId,callsign:d.callsign,fullName:d.fullName},result})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/autocab/adjustments',adminAuth,(req,res)=>{const rows=db.prepare('SELECT id,event_key eventKey,driver_id driverId,callsign,amount,is_credit isCredit,description,adjustment_reason adjustmentReason,status,created_at createdAt,completed_at completedAt,error FROM autocab_adjustments ORDER BY created_at DESC LIMIT 250').all().map(x=>({...x,isCredit:Boolean(x.isCredit)}));res.json({adjustments:rows})});
app.get('/api/admin/dashboard',adminAuth,(req,res)=>{const drivers=cacheRows();const matched=drivers.filter(d=>d.currentBalance!==null).length;const owedOut=drivers.reduce((s,d)=>s+Math.max(0,Number(d.currentBalance||0)),0),owedIn=drivers.reduce((s,d)=>s+Math.max(0,-Number(d.currentBalance||0)),0);const stats={count:drivers.length,matched,unmatched:drivers.length-matched,owedOut,owedIn,openPaymentRequests:Number(db.prepare("SELECT COUNT(*) c FROM payment_requests WHERE status='open'").get().c),queuedPayouts:Number(db.prepare("SELECT COUNT(*) c FROM payouts WHERE status IN ('queued','requested','approved','batched')").get().c),pendingUsers:Number(db.prepare('SELECT COUNT(*) c FROM driver_users WHERE approved=0').get().c)};const lastSync=db.prepare('SELECT MAX(synced_at) lastSync FROM driver_cache').get()?.lastSync||null;res.json({fetchedAt:new Date().toISOString(),lastSync,stats,drivers})});
app.get('/api/drivers',adminAuth,(req,res)=>{const drivers=cacheRows().map(d=>({...d,bankAccount:adminBankAccountInfo(d.driverId)}));const matched=drivers.filter(d=>d.currentBalance!==null).length;const lastSync=db.prepare('SELECT MAX(synced_at) lastSync FROM driver_cache').get()?.lastSync||null;const bankReady=drivers.filter(d=>d.bankAccount?.ready).length,bankMissing=drivers.length-bankReady,bankRecentlyChanged=drivers.filter(d=>d.bankAccount?.changedRecently).length;res.json({fetchedAt:new Date().toISOString(),lastSync,count:drivers.length,matched,unmatched:drivers.length-matched,bankReady,bankMissing,bankRecentlyChanged,drivers})});

app.patch('/api/admin/drivers/:driverId/payout-exclusion',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const driverId=Number(req.params.driverId),excluded=Boolean(req.body.excluded),reason=String(req.body.reason||'').trim();
 const d=cachedDriver(driverId);
 if(!d)return res.status(404).json({error:'Driver not found'});
 if(excluded&&!reason)return res.status(400).json({error:'Enter a reason for excluding this driver from payouts'});
 db.prepare('UPDATE driver_cache SET payout_excluded=?,payout_exclusion_reason=? WHERE driver_id=?').run(excluded?1:0,excluded?reason:null,driverId);
 audit(req,'staff',req.auth.email,excluded?'driver_payout_excluded':'driver_payout_enabled','driver',d.callsign,{driverId,callsign:d.callsign,reason:excluded?reason:''});
 res.json({ok:true,driverId,payoutExcluded:excluded,payoutExclusionReason:excluded?reason:''});
});
app.post('/api/admin/sync',adminAuth,requireStaffRole('administrator','finance','office'),async(req,res)=>{try{const out=await syncAutocab();audit(req,'admin',req.auth.email,'autocab_sync','driver_cache','all',{count:out.drivers.length});res.json({ok:true,count:out.drivers.length,syncedAt:out.syncedAt})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/settings',adminAuth,(req,res)=>res.json(getSettings()));
app.put('/api/settings',adminAuth,requireStaffRole('administrator'),(req,res)=>{const cur=getSettings(),s=req.body||{};let cutoff=String(s.earlyPayoutCutoffTime??cur.earlyPayoutCutoffTime??`${String(cur.earlyPayoutCutoffHour??11).padStart(2,'0')}:00`);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff))cutoff='11:00';const next={negativeThreshold:Math.max(0,Number(s.negativeThreshold??cur.negativeThreshold)),minimumPayoutThreshold:Math.max(0,Number(s.minimumPayoutThreshold??cur.minimumPayoutThreshold??0)),chargeWeeklyFeeWhenInactive:Boolean(s.chargeWeeklyFeeWhenInactive??cur.chargeWeeklyFeeWhenInactive??true),weeklyAppFee:Math.max(0,Number(s.weeklyAppFee??cur.weeklyAppFee)),earlyPayoutFee:Math.max(0,Number(s.earlyPayoutFee??cur.earlyPayoutFee)),customerPaymentFeeType:['fixed','percentage'].includes(String(s.customerPaymentFeeType||cur.customerPaymentFeeType))?String(s.customerPaymentFeeType||cur.customerPaymentFeeType):'fixed',customerPaymentFeeValue:Math.max(0,Number(s.customerPaymentFeeValue??cur.customerPaymentFeeValue)),earlyPayoutCutoffTime:cutoff,earlyPayoutCutoffHour:Number(cutoff.split(':')[0]),syncMinutes:Math.min(60,Math.max(2,Number(s.syncMinutes??cur.syncMinutes))),requireAdminApproval:Boolean(s.requireAdminApproval),companyName:String(s.companyName||cur.companyName),productName:'FaivoPay'};setSettings(next);audit(req,'admin',req.auth.email,'settings_updated','settings','global',next);res.json(next)});

app.get('/api/admin/users',adminAuth,(req,res)=>{res.json(db.prepare('SELECT id,driver_id as driverId,callsign,email,approved,created_at as createdAt,last_login_at as lastLoginAt FROM driver_users ORDER BY CAST(callsign AS INTEGER), callsign').all().map(x=>({...x,approved:Boolean(x.approved)})))});
app.patch('/api/admin/users/:id',adminAuth,requireStaffRole('administrator','office'),(req,res)=>{const u=db.prepare('SELECT * FROM driver_users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'User not found'});const approved='approved'in req.body?(req.body.approved?1:0):u.approved;db.prepare('UPDATE driver_users SET approved=?,updated_at=? WHERE id=?').run(approved,new Date().toISOString(),u.id);audit(req,'admin',req.auth.email,approved?'driver_user_approved':'driver_user_suspended','driver_user',u.id,{driverId:u.driver_id,callsign:u.callsign});res.json({ok:true})});

app.get('/api/admin/settlements',adminAuth,(req,res)=>{const runs=db.prepare('SELECT * FROM settlement_runs ORDER BY created_at DESC').all().map(r=>({id:r.id,createdAt:r.created_at,status:r.status,settings:JSON.parse(r.settings_json),items:JSON.parse(r.items_json)}));const payouts=db.prepare('SELECT *, driver_id driverId, driver_name driverName, gross_balance grossBalance, weekly_fee weeklyFee, carried_charges carriedCharges, gross_amount grossAmount, net_amount netAmount, payout_run_id payoutRunId, created_at createdAt, updated_at updatedAt, paid_at paidAt, decline_reason declineReason, eligible_run_date eligibleRunDate, submitted_after_cutoff submittedAfterCutoff FROM payouts ORDER BY created_at DESC').all();const paymentRequests=db.prepare('SELECT *, driver_id driverId, driver_name driverName, weekly_fee weeklyFee, carried_charges carriedCharges, payment_url paymentUrl, provider_session_id providerSessionId, created_at createdAt, updated_at updatedAt, paid_at paidAt FROM payment_requests ORDER BY created_at DESC').all();const payoutRuns=db.prepare('SELECT * FROM payout_runs ORDER BY created_at DESC').all().map(serializePayoutRun);res.json({runs,payoutRuns,payouts,paymentRequests,earlyPayoutRequests:payouts.filter(x=>x.type==='early')})});
app.post('/api/admin/settlements/monday',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{try{const settings=getSettings(),sync=await syncAutocab(),drivers=sync.drivers,runId=id('run'),createdAt=new Date().toISOString(),items=[];const insP=db.prepare('INSERT INTO payouts(id,run_id,driver_id,callsign,driver_name,gross_balance,weekly_fee,carried_charges,amount,type,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');const insR=db.prepare('INSERT INTO payment_requests(id,run_id,driver_id,callsign,driver_name,balance,weekly_fee,carried_charges,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');for(const d of drivers){if(d.currentBalance==null)continue;const row=db.prepare('SELECT amount FROM carried_charges WHERE driver_id=?').get(d.driverId);const carried=Number(row?.amount||0),fee=Number(settings.weeklyAppFee||0),adjusted=Number(d.currentBalance)-fee-carried;let action='none',amount=0;if(adjusted>0.00001){action='payout';amount=adjusted;insP.run(id('payout'),runId,d.driverId,d.callsign,d.fullName,d.currentBalance,fee,carried,amount,'weekly','queued',createdAt);db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}else if(adjusted<-0.00001){const due=Math.abs(adjusted);amount=due;if(due>=Number(settings.negativeThreshold||0)){action='payment_request';const requestId=id('request');insR.run(requestId,runId,d.driverId,d.callsign,d.fullName,d.currentBalance,fee,carried,due,'open',createdAt);notify(d.driverId,'Payment due',`Your Monday FaivoPay settlement has an amount due of £${due.toFixed(2)}. Open FaivoPay to pay securely by card.`,'warning',requestId);db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}else{action='carry_forward';db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,?) ON CONFLICT(driver_id) DO UPDATE SET amount=excluded.amount').run(d.driverId,due)}}else{db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}if(fee>0)ledger(d.driverId,'weekly_fee','debit',fee,fee,'Weekly FaivoPay fee',runId,'charged');items.push({driverId:d.driverId,callsign:d.callsign,driverName:d.fullName,currentBalance:d.currentBalance,previousBalance:d.previousBalance,weeklyFee:fee,carriedCharges:carried,adjustedBalance:adjusted,action,amount})}db.prepare('INSERT INTO settlement_runs(id,created_at,status,settings_json,items_json) VALUES(?,?,?,?,?)').run(runId,createdAt,'completed',JSON.stringify(settings),JSON.stringify(items));audit(req,'admin',req.auth.email,'monday_settlement_run','settlement_run',runId,{drivers:items.length,payouts:items.filter(x=>x.action==='payout').length,paymentRequests:items.filter(x=>x.action==='payment_request').length});res.json({id:runId,createdAt,status:'completed',settings,items})}catch(e){res.status(500).json({error:e.message})}});
app.patch('/api/admin/payouts/:id',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{const item=db.prepare('SELECT * FROM payouts WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payout not found'});const status=String(req.body.status||item.status),reason=String(req.body.reason||'').trim(),now=new Date().toISOString();if(status==='declined'&&!reason)return res.status(400).json({error:'A decline reason is required'});db.prepare('UPDATE payouts SET status=?,decline_reason=?,decision_at=?,decision_by=?,updated_at=? WHERE id=?').run(status,status==='declined'?reason:null,['approved','declined'].includes(status)?now:item.decision_at,['approved','declined'].includes(status)?req.auth.email:item.decision_by,now,item.id);if(item.type==='early'&&status==='approved'&&item.status!=='approved'){const runDate=item.eligible_run_date||londonWindow().date;const today=londonWindow().date;const timing=runDate===today?'Payment will be made to your assigned bank account by midday today.':`It has been approved for the ${formatRunDate(runDate)} payment run.`;notify(item.driver_id,'Early payout approved',`Your early payout of £${Number(item.net_amount||item.amount||0).toFixed(2)} has been approved. ${timing}`,'success',item.id)}if(item.type==='early'&&status==='declined'&&item.status!=='declined'){notify(item.driver_id,'Early payout declined',`Your early payout request was declined. Reason: ${reason}`,'warning',item.id)}if(status==='paid'&&item.status!=='paid'){await markPayoutPaid(item,req)}audit(req,'admin',req.auth.email,'payout_status_changed','payout',item.id,{from:item.status,to:status,reason});res.json({ok:true,status,reason})});

app.post('/api/admin/payout-runs',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const runType=String(req.body.runType||'early');if(!['early','weekly'].includes(runType))return res.status(400).json({error:'runType must be early or weekly'});
 const today=londonWindow().date;const eligible=runType==='early'?db.prepare("SELECT * FROM payouts WHERE type='early' AND status='approved' AND payout_run_id IS NULL AND (eligible_run_date IS NULL OR eligible_run_date<=?) ORDER BY COALESCE(eligible_run_date,substr(created_at,1,10)),created_at").all(today):db.prepare("SELECT * FROM payouts WHERE type='weekly' AND status='queued' AND payout_run_id IS NULL ORDER BY created_at").all();
 if(!eligible.length)return res.status(400).json({error:`No ${runType} payouts are ready to batch`});
 const runId=id('payrun'),now=new Date().toISOString(),total=eligible.reduce((s,x)=>s+Number(x.net_amount||x.amount||0),0);
 db.prepare('INSERT INTO payout_runs(id,run_type,status,created_at,created_by,scheduled_for,total_amount,item_count,provider,notes,funding_status,funding_required) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(runId,runType,'ready',now,req.auth.email,now,total,eligible.length,String(req.body.provider||'manual'),String(req.body.notes||''),'not_started',total);
 const upd=db.prepare("UPDATE payouts SET payout_run_id=?,status='batched',updated_at=? WHERE id=?");for(const x of eligible)upd.run(runId,now,x.id);
 audit(req,'admin',req.auth.email,'payout_run_created','payout_run',runId,{runType,itemCount:eligible.length,totalAmount:total,callsigns:eligible.map(x=>x.callsign)});
 res.json({run:serializePayoutRun(db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId)),items:eligible.map(x=>({id:x.id,callsign:x.callsign,driverName:x.driver_name,amount:Number(x.net_amount||x.amount||0)}))});
});
app.patch('/api/admin/payout-runs/:id',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});const status=String(req.body.status||run.status),now=new Date().toISOString();
 if(status==='paid'&&run.status!=='paid'){if(!['submitted_sandbox','submitted','processing'].includes(run.status))return res.status(400).json({error:'This run must be released to the payment provider before it can be confirmed paid.'});const items=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(run.id);for(const item of items)await markPayoutPaid(item,req,'payout_run');db.prepare('UPDATE payout_runs SET status=?,paid_at=?,reconciled_at=? WHERE id=?').run('paid',now,now,run.id);audit(req,'admin',req.auth.email,'payout_run_paid','payout_run',run.id,{runType:run.run_type,itemCount:items.length,totalAmount:run.total_amount,callsigns:items.map(x=>x.callsign)});}else db.prepare('UPDATE payout_runs SET status=? WHERE id=?').run(status,run.id);
 res.json({ok:true});
});

app.post('/api/admin/payout-runs/:id/cancel',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});
 if(run.status==='cancelled')return res.json({ok:true,alreadyCancelled:true});
 const cancellable=['ready','funding_pending','funded'];
 if(!cancellable.includes(run.status))return res.status(400).json({error:`This payment run cannot be cancelled at the ${run.status} stage. Cancellation is allowed only before payments are released.`});
 if(run.provider_ref||run.released_at)return res.status(400).json({error:'This payment run has already been released to the payment provider and cannot be cancelled safely.'});
 const reason=String(req.body?.reason||'').trim();if(!reason)return res.status(400).json({error:'A cancellation reason is required'});
 const now=new Date().toISOString();
 const items=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(run.id);
 db.exec('BEGIN IMMEDIATE');
 try{
  const restore=db.prepare("UPDATE payouts SET payout_run_id=NULL,status='approved',updated_at=? WHERE id=? AND status='batched'");
  for(const item of items)restore.run(now,item.id);
  if(run.run_type==='weekly'){
   const settlement=db.prepare('SELECT * FROM settlement_runs WHERE payout_run_id=?').get(run.id);
   if(settlement)db.prepare("UPDATE settlement_runs SET status='approved',payout_run_id=NULL WHERE id=?").run(settlement.id);
  }
  db.prepare("UPDATE payout_runs SET status='cancelled',notes=TRIM(COALESCE(notes,'') || CASE WHEN COALESCE(notes,'')='' THEN '' ELSE ' | ' END || ? ) WHERE id=?").run(`Cancelled ${now} by ${req.auth.email}: ${reason}`,run.id);
  db.exec('COMMIT');
 }catch(e){
  try{db.exec('ROLLBACK')}catch{}
  throw e;
 }
 audit(req,'staff',req.auth.email,'payout_run_cancelled','payout_run',run.id,{runType:run.run_type,itemCount:items.length,totalAmount:run.total_amount,reason,callsigns:items.map(x=>x.callsign)});
 res.json({ok:true,status:'cancelled',restoredItems:items.filter(x=>x.status==='batched').length});
});


app.post('/api/admin/payout-runs/:id/funding-sent',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});
 if(run.status!=='ready')return res.status(400).json({error:'Funding can only be started from a ready payment run.'});
 const now=new Date().toISOString();db.prepare("UPDATE payout_runs SET status='funding_pending',funding_status='awaiting_clearance',funding_required=COALESCE(funding_required,total_amount),funding_sent_at=? WHERE id=?").run(now,run.id);
 audit(req,'staff',req.auth.email,'payout_run_funding_sent','payout_run',run.id,{runType:run.run_type,totalAmount:run.total_amount});
 res.json({ok:true,run:serializePayoutRun(db.prepare('SELECT * FROM payout_runs WHERE id=?').get(run.id))});
});
app.post('/api/admin/payout-runs/:id/funds-cleared',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});
 if(!['ready','funding_pending'].includes(run.status))return res.status(400).json({error:'Cleared funds can only be confirmed before the payment run is released.'});
 const now=new Date().toISOString();db.prepare("UPDATE payout_runs SET status='funded',funding_status='cleared',funding_required=COALESCE(funding_required,total_amount),funds_cleared_at=? WHERE id=?").run(now,run.id);
 audit(req,'staff',req.auth.email,'payout_run_funds_cleared','payout_run',run.id,{runType:run.run_type,totalAmount:run.total_amount,manualConfirmation:true});
 res.json({ok:true,run:serializePayoutRun(db.prepare('SELECT * FROM payout_runs WHERE id=?').get(run.id))});
});

app.post('/api/admin/payout-runs/:id/wise-sandbox',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{try{
 if(WISE_ENV!=='sandbox')return res.status(400).json({error:'WISE_ENV must be sandbox for demo submission'});
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});
 if(run.status!=='funded')return res.status(400).json({error:'FaivoPay will not release this run until cleared funds have been confirmed.'});
 const payoutItems=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(run.id);
 const bankIssues=payoutBankIssues(payoutItems);
 if(bankIssues.length)return res.status(400).json({error:`Payout release blocked: ${bankIssues.length} driver${bankIssues.length===1?' is':'s are'} missing payout bank details (${bankIssues.map(x=>x.item.callsign).join(', ')}).`});
 const wise=await testWiseConnection();const ref=`wise_sandbox_${Date.now()}`,releasedAt=new Date().toISOString();
 db.prepare('UPDATE payout_runs SET status=?,provider=?,provider_ref=?,released_at=? WHERE id=?').run('submitted_sandbox','wise_sandbox',ref,releasedAt,run.id);
 audit(req,'admin',req.auth.email,'wise_sandbox_run_submitted','payout_run',run.id,{runType:run.run_type,itemCount:run.item_count,totalAmount:run.total_amount,providerRef:ref});
 res.json({ok:true,demo:true,message:'Wise sandbox demo submission recorded. No real money moved.',providerRef:ref,wiseEnvironment:wise.environment});
 }catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/payout-runs/:id/csv',adminAuth,(req,res)=>{const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});const items=db.prepare('SELECT callsign,driver_name,net_amount,amount,type,status FROM payouts WHERE payout_run_id=? ORDER BY CAST(callsign AS INTEGER),callsign').all(run.id);const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;const csv=['Callsign,Driver,Amount,Type,Status',...items.map(x=>[esc(x.callsign),esc(x.driver_name),Number(x.net_amount||x.amount||0).toFixed(2),x.type,x.status].join(','))].join('\n');res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition',`attachment; filename=FaivoPay-${run.run_type}-${run.id}.csv`);res.send(csv)});

app.post('/api/admin/payment-requests/:id/stripe',adminAuth,requireStaffRole('administrator','finance','office'),async(req,res)=>{try{if(!getStripeClient())return res.status(400).json({error:'Stripe is not configured. Add STRIPE_SECRET_KEY to .env'});const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payment request not found'});if(item.status==='paid')return res.status(400).json({error:'This payment request is already paid'});if(item.payment_plan_id&&item.request_type==='payment_plan_instalment'){const pendingExtra=db.prepare(`SELECT * FROM payment_requests WHERE payment_plan_id=? AND request_type='payment_plan_extra' AND status='open' ORDER BY created_at DESC LIMIT 1`).get(item.payment_plan_id);if(pendingExtra){await safelyExpirePlanPaymentSession(pendingExtra);db.prepare(`UPDATE payment_requests SET status='cancelled',payment_url=NULL,provider=NULL,provider_session_id=NULL,provider_payment_intent_id=NULL,updated_at=? WHERE id=? AND status='open'`).run(new Date().toISOString(),pendingExtra.id);audit(req,'staff',req.auth.email,'payment_plan_extra_payment_cancelled','driver_payment_plan',item.payment_plan_id,{paymentRequestId:pendingExtra.id,reason:'scheduled_instalment_checkout_started'})}}const session=await createStripePaymentRequest(item);audit(req,'admin',req.auth.email,'stripe_payment_request_created','payment_request',item.id,{callsign:item.callsign,amount:item.amount,sessionId:session.id});res.json({ok:true,paymentUrl:session.url})}catch(e){res.status(500).json({error:e.message})}});
app.patch('/api/admin/payment-requests/:id',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{
 const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payment request not found'});
 const status='status'in req.body?String(req.body.status):item.status,url='paymentUrl'in req.body?(req.body.paymentUrl?String(req.body.paymentUrl):null):item.payment_url,now=new Date().toISOString();
 db.prepare("UPDATE payment_requests SET status=?,payment_url=?,paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END,updated_at=? WHERE id=?").run(status,url,status,now,now,item.id);
 if(status==='paid'&&item.status!=='paid'){
  ledger(item.driver_id,'payment_received','debit',Number(item.amount||0),0,'Payment received',item.id,'paid');notify(item.driver_id,'Payment received',`We have received your payment of £${Number(item.amount||0).toFixed(2)}.`,'success',item.id);
  const isPaymentPlanInstalment=Boolean(item.payment_plan_id&&item.payment_plan_instalment_id),isPaymentPlanExtra=Boolean(item.payment_plan_id&&item.request_type==='payment_plan_extra');
  if(isPaymentPlanInstalment||isPaymentPlanExtra){
   db.prepare("UPDATE payment_requests SET provider=COALESCE(provider,'manual') WHERE id=?").run(item.id);const paidPlanRequest=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(item.id);
   const progression=isPaymentPlanExtra?applyPaymentPlanExtraPayment(paidPlanRequest,now,{actorId:req.auth.email}):progressPaymentPlanAfterPayment(paidPlanRequest,now,{actorId:req.auth.email});
   audit(req,'staff',req.auth.email,isPaymentPlanExtra?'payment_plan_extra_payment_applied':progression?.completed?'payment_plan_completed':'payment_plan_instalment_paid','driver_payment_plan',item.payment_plan_id,progression||{paymentRequestId:item.id,source:'manual'});
  }else{try{await settlePaymentRequestInAutocab(item);audit(req,'system','autocab','autocab_payment_adjusted','payment_request',item.id,{callsign:item.callsign,amount:item.amount})}catch(e){audit(req,'system','autocab','autocab_adjustment_failed','payment_request',item.id,{callsign:item.callsign,error:e.message})}}
 }
 audit(req,'admin',req.auth.email,'payment_request_updated','payment_request',item.id,{status,paymentUrl:Boolean(url)});res.json({ok:true,status,paymentUrl:url});
});

app.get('/api/admin/logs',adminAuth,(req,res)=>{const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));const rows=db.prepare('SELECT id,created_at as createdAt,actor_type as actorType,actor_id as actorId,action,entity_type as entityType,entity_id as entityId,details_json as detailsJson,ip FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit).map(r=>{const details=JSON.parse(r.detailsJson||'{}');let actorId=r.actorId;if(r.actorType==='driver'&&/^\d+$/.test(String(actorId||''))){actorId=cachedDriver(Number(actorId))?.callsign||actorId}return {...r,actorId,details}});res.json({logs:rows})});


/* =========================
   FaivoPay Office V2 workflow
   ========================= */
function nextTuesdayDueLabel(){
 const now=londonWindow();let d=new Date(`${now.date}T12:00:00Z`);do{d.setUTCDate(d.getUTCDate()+1)}while(d.getUTCDay()!==2);const date=d.toISOString().slice(0,10);return {date,dueAt:`${date}T${String(getSettings().outstandingDueTime||'17:00')}:00`,label:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00Z`))}
}
async function sendOutstandingCommunications(item,d){
 const settings=getSettings(),due=nextTuesdayDueLabel(),vars={driver:d?.fullName||item.driver_name||`Callsign ${item.callsign}`,callsign:item.callsign,amount:Number(item.amount||0).toFixed(2),dueDate:due.label,dueTime:String(settings.outstandingDueTime||'17:00'),paymentLink:`${PUBLIC_BASE_URL}/driver`};let emailSentAt=null,smsSentAt=null,errors=[];
 if(d?.email){try{const subject=templateText(settings.outstandingEmailSubject,vars),body=templateText(settings.outstandingEmailBody,vars),out=await sendEmail(d.email,subject,`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033">${body.split('\n').map(x=>x?`<p>${x}</p>`:'').join('')}</div>`);if(out.sent){emailSentAt=new Date().toISOString();logCommunication({channel:'email',recipient:d.email,templateKey:'outstanding_payment',entityType:'payment_request',entityId:item.id,status:'sent',providerRef:out.id||out.provider||''})}}catch(e){errors.push(`Email: ${e.message}`);logCommunication({channel:'email',recipient:d.email,templateKey:'outstanding_payment',entityType:'payment_request',entityId:item.id,status:'failed',error:e.message})}}
 if(d?.mobile&&String(settings.smsEndpoint||'').trim()){try{const message=templateText(settings.outstandingSmsTemplate,vars);await sendConfiguredSms(d.mobile,message,{templateKey:'outstanding_payment',entityType:'payment_request',entityId:item.id});smsSentAt=new Date().toISOString()}catch(e){errors.push(`SMS: ${e.message}`)}}
 db.prepare('UPDATE payment_requests SET due_at=?,email_sent_at=COALESCE(?,email_sent_at),sms_sent_at=COALESCE(?,sms_sent_at),communication_error=?,updated_at=? WHERE id=?').run(due.dueAt,emailSentAt,smsSentAt,errors.join(' | ')||null,new Date().toISOString(),item.id);
 return {emailSentAt,smsSentAt,errors,dueAt:due.dueAt};
}
function updateRunItem(runId,payoutId,approvalStatus,reason=''){
 const run=db.prepare('SELECT * FROM settlement_runs WHERE id=?').get(runId);if(!run)return null;let items=JSON.parse(run.items_json||'[]');const payout=db.prepare('SELECT * FROM payouts WHERE id=? AND run_id=?').get(payoutId,runId);if(!payout)return null;items=items.map(x=>x.payoutId===payoutId?{...x,approvalStatus,exclusionReason:reason||'',decisionAt:new Date().toISOString()}:x);db.prepare('UPDATE settlement_runs SET items_json=? WHERE id=?').run(JSON.stringify(items),runId);return items
}
function officeSettingsPayload(){const s=getSettings();return {...s,smsAuthConfigured:Boolean(getSecureSetting('smsAuthValue')),smtpPasswordConfigured:Boolean(getSecureSetting('smtpPassword')),smsAuthValue:'',smtpPassword:''}}

app.get('/api/admin/operations-settings',adminAuth,(req,res)=>res.json(officeSettingsPayload()));
app.put('/api/admin/operations-settings',adminAuth,requireStaffRole('administrator'),(req,res)=>{
 const cur=getSettings(),x=req.body||{},num=(k,min=0,max=Infinity)=>Math.min(max,Math.max(min,Number(x[k]??cur[k]??0))),str=k=>String(x[k]??cur[k]??'');let cutoff=str('earlyPayoutCutoffTime');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff))cutoff='11:00';let dueTime=str('outstandingDueTime');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))dueTime='17:00';
 const next={...cur,negativeThreshold:num('negativeThreshold'),minimumPayoutThreshold:num('minimumPayoutThreshold'),chargeWeeklyFeeWhenInactive:Boolean(x.chargeWeeklyFeeWhenInactive??cur.chargeWeeklyFeeWhenInactive??true),weeklyAppFee:num('weeklyAppFee'),earlyPayoutFee:num('earlyPayoutFee'),customerPaymentFeeType:['fixed','percentage'].includes(str('customerPaymentFeeType'))?str('customerPaymentFeeType'):'fixed',customerPaymentFeeValue:num('customerPaymentFeeValue'),earlyPayoutCutoffTime:cutoff,earlyPayoutCutoffHour:Number(cutoff.split(':')[0]),syncMinutes:num('syncMinutes',2,60),weeklyPayoutReasonTemplate:str('weeklyPayoutReasonTemplate'),earlyPayoutReasonTemplate:str('earlyPayoutReasonTemplate'),manualPayInReasonDefault:str('manualPayInReasonDefault'),manualPayoutReasonDefault:str('manualPayoutReasonDefault'),outstandingDueTime:dueTime,outstandingSmsTemplate:str('outstandingSmsTemplate'),outstandingEmailSubject:str('outstandingEmailSubject'),outstandingEmailBody:str('outstandingEmailBody'),customerPaymentSmsTemplate:str('customerPaymentSmsTemplate'),customerPaymentEmailSubject:str('customerPaymentEmailSubject'),smsEndpoint:str('smsEndpoint'),smsMethod:['POST','PUT','PATCH'].includes(str('smsMethod').toUpperCase())?str('smsMethod').toUpperCase():'POST',smsAuthHeader:str('smsAuthHeader'),smsBodyTemplate:str('smsBodyTemplate'),twilioEnabled:Boolean(x.twilioEnabled??cur.twilioEnabled),orionEnabled:Boolean(x.orionEnabled??cur.orionEnabled),paymentSmsProvider:['twilio','orion'].includes(str('paymentSmsProvider').toLowerCase())?str('paymentSmsProvider').toLowerCase():'twilio',generalSmsProvider:['twilio','orion'].includes(str('generalSmsProvider').toLowerCase())?str('generalSmsProvider').toLowerCase():'orion',smsFallbackEnabled:Boolean(x.smsFallbackEnabled??cur.smsFallbackEnabled),twilioLowBalanceAlertsEnabled:Boolean(x.twilioLowBalanceAlertsEnabled??cur.twilioLowBalanceAlertsEnabled),twilioLowBalanceThreshold:num('twilioLowBalanceThreshold',0),twilioLowBalanceEmail:safeEmail(str('twilioLowBalanceEmail')),smtpHost:str('smtpHost'),smtpPort:num('smtpPort',1,65535),smtpSecure:Boolean(x.smtpSecure??cur.smtpSecure),smtpUser:str('smtpUser'),smtpFromName:str('smtpFromName'),smtpFromEmail:str('smtpFromEmail'),officeNotificationEmail:safeEmail(str('officeNotificationEmail')),customerFeeFleetPayPercent:num('customerFeeFleetPayPercent',0,100),earlyPayoutFeeFleetPayPercent:num('earlyPayoutFeeFleetPayPercent',0,100),weeklyFeeFleetPayPercent:num('weeklyFeeFleetPayPercent',0,100),requireAdminApproval:Boolean(x.requireAdminApproval??cur.requireAdminApproval),companyName:str('companyName')||cur.companyName,productName:'FaivoPay'};
 setSettings(next);if(String(x.smsAuthValue||'').trim())setSecureSetting('smsAuthValue',String(x.smsAuthValue));if(String(x.smtpPassword||'').trim())setSecureSetting('smtpPassword',String(x.smtpPassword));audit(req,'staff',req.auth.email,'operations_settings_updated','settings','operations',{...next,smsAuthValue:undefined,smtpPassword:undefined});res.json(officeSettingsPayload())
});
app.post('/api/admin/communications/test-sms',adminAuth,requireStaffRole('administrator'),async(req,res)=>{try{const to=String(req.body.to||'').trim();if(!to)return res.status(400).json({error:'Enter a mobile number'});const message=String(req.body.message||'FaivoPay test SMS – communications are configured correctly.');const out=await sendConfiguredSms(to,message,{templateKey:'test_sms',entityType:'settings',entityId:'communications'});audit(req,'staff',req.auth.email,'test_sms_sent','settings','communications',{to});res.json({ok:true,out})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/communications/test-email',adminAuth,requireStaffRole('administrator'),async(req,res)=>{try{const to=safeEmail(req.body.to||getSettings().officeNotificationEmail);if(!to)return res.status(400).json({error:'Enter an email address'});const out=await sendEmail(to,'FaivoPay test email','<div style="font-family:Arial,sans-serif"><h2>FaivoPay communications test</h2><p>Your FaivoPay office email settings are working.</p></div>');if(!out.sent)throw new Error('No email provider is configured');logCommunication({channel:'email',recipient:to,templateKey:'test_email',entityType:'settings',entityId:'communications',status:'sent',providerRef:out.id||out.provider||''});audit(req,'staff',req.auth.email,'test_email_sent','settings','communications',{to});res.json({ok:true,provider:out.provider})}catch(e){res.status(500).json({error:e.message})}});

app.post('/api/admin/manual-payment',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{try{const callsign=String(req.body.callsign||'').trim(),type=String(req.body.type||'pay_in'),amount=Number(req.body.amount||0),reason=String(req.body.reason||'').trim();if(!callsign||!(amount>0)||!['pay_in','payout'].includes(type))return res.status(400).json({error:'Callsign, payment type and amount are required'});const d=cacheRows().find(x=>String(x.callsign)===callsign);if(!d)return res.status(404).json({error:'Callsign not found in FaivoPay cache'});const settings=getSettings(),finalReason=reason||(type==='pay_in'?settings.manualPayInReasonDefault:settings.manualPayoutReasonDefault),eventKey=`manual:${Date.now()}:${d.driverId}:${crypto.randomBytes(3).toString('hex')}`;const result=await postAutocabAdjustment({driverId:d.driverId,callsign:d.callsign,amount,isCredit:type==='pay_in',description:finalReason,adjustmentReason:type==='pay_in'?'FleetPay Manual Pay In':'FleetPay Manual Payout',eventKey});audit(req,'staff',req.auth.email,'manual_autocab_payment','driver',d.callsign,{driverId:d.driverId,callsign:d.callsign,type,amount,reason:finalReason});setTimeout(()=>syncAutocab().catch(()=>{}),500);res.json({ok:true,driver:{driverId:d.driverId,callsign:d.callsign,fullName:d.fullName},type,amount,reason:finalReason,result})}catch(e){res.status(500).json({error:e.message})}});

app.post('/api/admin/monday-runs',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{try{
 const today=londonWindow().date,existing=db.prepare("SELECT * FROM settlement_runs WHERE run_date=? AND status IN ('draft','approved','batched') ORDER BY created_at DESC LIMIT 1").get(today);if(existing)return res.status(409).json({error:'A Monday draft already exists for today. Open Monday Run to continue it.',runId:existing.id});const settings=getSettings(),sync=await syncAutocab(),drivers=sync.drivers,runId=id('run'),createdAt=new Date().toISOString(),items=[],allocationRows=[];const insP=db.prepare('INSERT INTO payouts(id,run_id,driver_id,callsign,driver_name,gross_balance,weekly_fee,carried_charges,gross_amount,net_amount,amount,type,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');const insR=db.prepare('INSERT INTO payment_requests(id,run_id,driver_id,callsign,driver_name,balance,weekly_fee,carried_charges,amount,status,created_at,due_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');const due=nextTuesdayDueLabel(),settledWeekStart=previousMondayWeekStart(today);
 for(const d of drivers){if(d.previousBalance==null)continue;const row=db.prepare('SELECT amount FROM carried_charges WHERE driver_id=?').get(d.driverId),activityRow=db.prepare('SELECT worked FROM driver_weekly_activity WHERE driver_id=? AND week_start=?').get(d.driverId,settledWeekStart),workedThisWeek=Boolean(activityRow?.worked),configuredWeeklyFee=Number(settings.weeklyAppFee||0),chargeInactive=settings.chargeWeeklyFeeWhenInactive!==false,fee=chargeInactive||workedThisWeek?configuredWeeklyFee:0,weeklyFeeWaivedInactive=!chargeInactive&&!workedThisWeek&&configuredWeeklyFee>0,carried=Number(row?.amount||0),base=Number(d.previousBalance||0),adjusted=Number((base-fee-carried).toFixed(2)),planSettlement=adjusted>0.00001?paymentPlanSettlementCandidate(d.driverId,adjusted):null,planAllocation=Number(planSettlement?.allocatedAmount||0),payoutAvailable=Number(Math.max(0,adjusted-planAllocation).toFixed(2));let action='none',amount=0,payoutId=null,requestId=null,approvalStatus=null;if(adjusted>0.00001){const payoutThreshold=Number(settings.minimumPayoutThreshold||0);if(payoutAvailable<=0.00001){action='plan_allocation';amount=0;db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,?) ON CONFLICT(driver_id) DO UPDATE SET amount=excluded.amount').run(d.driverId,Number((carried+fee).toFixed(2)))}else if(payoutAvailable+0.00001<payoutThreshold){action='payout_carry_forward';amount=payoutAvailable;db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,?) ON CONFLICT(driver_id) DO UPDATE SET amount=excluded.amount').run(d.driverId,Number((carried+fee).toFixed(2)))}else{action='payout';amount=payoutAvailable;payoutId=id('payout');const cached=cachedDriver(d.driverId),persistentlyExcluded=Boolean(cached?.payoutExcluded),persistentReason=cached?.payoutExclusionReason||'';approvalStatus=persistentlyExcluded?'excluded':'pending';insP.run(payoutId,runId,d.driverId,d.callsign,d.fullName,base,fee,carried,adjusted,payoutAvailable,payoutAvailable,'weekly',persistentlyExcluded?'declined':'pending_approval',createdAt);if(persistentlyExcluded)db.prepare('UPDATE payouts SET decline_reason=?,decision_at=?,decision_by=? WHERE id=?').run(persistentReason,new Date().toISOString(),'persistent_driver_setting',payoutId);db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}}else if(adjusted<-0.00001){const owing=Math.abs(adjusted);amount=owing;if(owing>=Number(settings.negativeThreshold||0)){action='payment_request';requestId=id('request');insR.run(requestId,runId,d.driverId,d.callsign,d.fullName,base,fee,carried,owing,'open',createdAt,due.dueAt);notify(d.driverId,'Payment due',`Your Monday FaivoPay settlement has an amount due of £${owing.toFixed(2)}. Payment is due by ${settings.outstandingDueTime||'17:00'} on ${due.label}.`,'warning',requestId);db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId);setTimeout(()=>{const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(requestId);sendOutstandingCommunications(item,d).catch(()=>{})},50)}else{action='carry_forward';db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,?) ON CONFLICT(driver_id) DO UPDATE SET amount=excluded.amount').run(d.driverId,owing)}}else{action='carry_forward';amount=0;db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,?) ON CONFLICT(driver_id) DO UPDATE SET amount=excluded.amount').run(d.driverId,Number((carried+fee).toFixed(2)))}if(fee>0){ledger(d.driverId,'weekly_fee','debit',fee,fee,'Weekly FaivoPay fee',runId,'charged');recordFee({feeType:'weekly',sourceType:'settlement',sourceId:`${runId}:${d.driverId}`,driverId:d.driverId,callsign:d.callsign,description:'Weekly FaivoPay fee',amount:fee,createdAt})}items.push({driverId:d.driverId,callsign:d.callsign,driverName:d.fullName,currentBalance:d.currentBalance,previousBalance:base,weeklyFee:fee,configuredWeeklyFee,workedThisWeek,weeklyFeeWaivedInactive,settledWeekStart,carriedCharges:carried,adjustedBalance:adjusted,planAllocation,payoutAvailable,planId:planSettlement?.plan?.id||null,planInstalmentId:planSettlement?.instalment?.id||null,planInstalmentScheduledAmount:Number(planSettlement?.scheduledAmount||0),planInstalmentPaidAmount:Number(planSettlement?.alreadyPaidAmount||0),planInstalmentRemaining:Number(planSettlement?.instalmentRemaining||0),planRemainingAmount:Number(planSettlement?.planRemaining||0),action,amount,payoutId,requestId,approvalStatus,persistentPayoutExclusion:Boolean(cachedDriver(d.driverId)?.payoutExcluded),exclusionReason:approvalStatus==='excluded'?(cachedDriver(d.driverId)?.payoutExclusionReason||'Persistent payout exclusion'):''});if(planSettlement&&planAllocation>0.00001){allocationRows.push({id:id('planalloc'),runId,payoutId,driverId:d.driverId,callsign:d.callsign,planId:planSettlement.plan.id,instalmentId:planSettlement.instalment.id,paymentRequestId:planSettlement.paymentRequestId||null,scheduledAmount:Number(planSettlement.scheduledAmount||0),allocatedAmount:planAllocation,autocabEventKey:`plan:${planSettlement.plan.id}:monday:${runId}:${planSettlement.instalment.id}`,createdAt})}}
 db.prepare('INSERT INTO settlement_runs(id,created_at,status,settings_json,items_json,run_date,created_by) VALUES(?,?,?,?,?,?,?)').run(runId,createdAt,'draft',JSON.stringify(settings),JSON.stringify(items),today,req.auth.email);const insA=db.prepare(`INSERT INTO payment_plan_settlement_allocations(id,run_id,payout_id,driver_id,callsign,plan_id,instalment_id,payment_request_id,scheduled_amount,allocated_amount,status,autocab_event_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);for(const a of allocationRows){insA.run(a.id,a.runId,a.payoutId,a.driverId,a.callsign,a.planId,a.instalmentId,a.paymentRequestId,a.scheduledAmount,a.allocatedAmount,'pending',a.autocabEventKey,a.createdAt)}audit(req,'staff',req.auth.email,'monday_draft_created','settlement_run',runId,{runDate:today,drivers:items.length,payouts:items.filter(x=>x.action==='payout').length,paymentRequests:items.filter(x=>x.action==='payment_request').length,sourceBalance:'previousBalance'});res.json({id:runId,createdAt,status:'draft',runDate:today,items})
 }catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/monday-runs',adminAuth,(req,res)=>{const runs=db.prepare("SELECT * FROM settlement_runs WHERE run_date IS NOT NULL ORDER BY created_at DESC LIMIT 40").all().map(r=>({id:r.id,createdAt:r.created_at,status:r.status,runDate:r.run_date,createdBy:r.created_by,approvedAt:r.approved_at,payoutRunId:r.payout_run_id,settings:JSON.parse(r.settings_json||'{}'),items:JSON.parse(r.items_json||'[]')}));res.json({runs})});

app.get(
 '/api/admin/monday-runs/:runId/plan-allocations',
 adminAuth,
 requireStaffRole('administrator','finance','office'),
 (req,res)=>{
  const run=db.prepare(`
   SELECT *
   FROM settlement_runs
   WHERE id=?
  `).get(req.params.runId);

  if(!run){
   return res.status(404).json({
    error:'Monday run not found'
   });
  }

  const allocations=db.prepare(`
   SELECT *
   FROM payment_plan_settlement_allocations
   WHERE run_id=?
   ORDER BY CAST(callsign AS INTEGER), callsign, created_at
  `).all(req.params.runId).map(x=>({
   id:x.id,
   runId:x.run_id,
   payoutId:x.payout_id||null,
   driverId:x.driver_id,
   callsign:x.callsign,
   planId:x.plan_id,
   instalmentId:x.instalment_id,
   paymentRequestId:x.payment_request_id||null,
   scheduledAmount:Number(x.scheduled_amount||0),
   allocatedAmount:Number(x.allocated_amount||0),
   status:x.status,
   autocabEventKey:x.autocab_event_key,
   error:x.error||null,
   createdAt:x.created_at,
   updatedAt:x.updated_at||null,
   appliedAt:x.applied_at||null
  }));

  res.json({
   runId:run.id,
   runDate:run.run_date,
   runStatus:run.status,
   allocations
  });
 }
);


app.post(
 '/api/admin/monday-runs/:runId/plan-allocations/:allocationId/apply',
 adminAuth,
 requireStaffRole('administrator','finance'),
 async(req,res)=>{
  try{
   const run=db.prepare(`
    SELECT *
    FROM settlement_runs
    WHERE id=?
   `).get(req.params.runId);

   if(!run){
    return res.status(404).json({
     error:'Monday run not found'
    });
   }

   if(run.status==='batched' || run.payout_run_id){
    return res.status(409).json({
     error:'Payment-plan deductions cannot be changed after the Monday run has been batched.'
    });
   }

   const allocation=db.prepare(`
    SELECT *
    FROM payment_plan_settlement_allocations
    WHERE id=?
      AND run_id=?
   `).get(
    req.params.allocationId,
    req.params.runId
   );

   if(!allocation){
    return res.status(404).json({
     error:'Payment-plan allocation not found for this Monday run'
    });
   }

   const result=await applyMondayPlanSettlementAllocation(
    allocation.id
   );

   const updated=db.prepare(`
    SELECT *
    FROM payment_plan_settlement_allocations
    WHERE id=?
   `).get(allocation.id);

   const unresolvedAllocations=db.prepare(`
    SELECT COUNT(*) count
    FROM payment_plan_settlement_allocations
    WHERE run_id=?
      AND status!='applied'
   `).get(run.id)?.count||0;

   const weeklyPayoutCount=db.prepare(`
    SELECT COUNT(*) count
    FROM payouts
    WHERE run_id=?
      AND type='weekly'
   `).get(run.id)?.count||0;

   if(
    unresolvedAllocations===0 &&
    weeklyPayoutCount===0
   ){
    db.prepare(`
     UPDATE settlement_runs
     SET status='completed'
     WHERE id=?
       AND status IN ('draft','approved')
    `).run(run.id);
   }

   audit(
    req,
    'staff',
    req.auth.email,
    'monday_payment_plan_allocation_applied',
    'driver_payment_plan',
    allocation.plan_id,
    {
     runId:allocation.run_id,
     allocationId:allocation.id,
     instalmentId:allocation.instalment_id,
     callsign:allocation.callsign,
     amount:Number(allocation.allocated_amount||0),
     duplicate:Boolean(result?.duplicate)
    }
   );

   res.json({
    ok:true,
    result,
    allocation:{
     id:updated.id,
     runId:updated.run_id,
     payoutId:updated.payout_id||null,
     driverId:updated.driver_id,
     callsign:updated.callsign,
     planId:updated.plan_id,
     instalmentId:updated.instalment_id,
     paymentRequestId:updated.payment_request_id||null,
     allocatedAmount:Number(updated.allocated_amount||0),
     status:updated.status,
     error:updated.error||null,
     updatedAt:updated.updated_at||null,
     appliedAt:updated.applied_at||null
    }
   });

  }catch(e){
   audit(
    req,
    'staff',
    req.auth.email,
    'monday_payment_plan_allocation_failed',
    'payment_plan_settlement_allocation',
    req.params.allocationId,
    {
     runId:req.params.runId,
     error:e.message
    }
   );

   res.status(409).json({
    error:e.message
   });
  }
 }
);

app.patch('/api/admin/monday-runs/:runId/payouts/:payoutId',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const status=String(req.body.status||''),reason=String(req.body.reason||'').trim();if(!['approved','excluded','pending'].includes(status))return res.status(400).json({error:'Invalid approval status'});if(status==='excluded'&&!reason)return res.status(400).json({error:'Enter a reason for excluding this driver'});const pmt=db.prepare('SELECT * FROM payouts WHERE id=? AND run_id=? AND type=\'weekly\'').get(req.params.payoutId,req.params.runId);if(!pmt)return res.status(404).json({error:'Weekly payout not found'});if(pmt.payout_run_id)return res.status(400).json({error:'This payout is already locked into a payment run'});const driver=cachedDriver(pmt.driver_id);if(status==='approved'&&driver?.payoutExcluded)return res.status(400).json({error:`Callsign ${pmt.callsign} is permanently excluded from payouts. Enable payouts on the Drivers page first.`});const dbStatus=status==='approved'?'approved':status==='excluded'?'declined':'pending_approval';db.prepare('UPDATE payouts SET status=?,decline_reason=?,decision_at=?,decision_by=?,updated_at=? WHERE id=?').run(dbStatus,status==='excluded'?reason:null,status==='pending'?null:new Date().toISOString(),status==='pending'?null:req.auth.email,new Date().toISOString(),pmt.id);const items=updateRunItem(req.params.runId,pmt.id,status,reason);audit(req,'staff',req.auth.email,'weekly_payout_approval_changed','payout',pmt.id,{runId:req.params.runId,callsign:pmt.callsign,status,reason});res.json({ok:true,items})});
app.post('/api/admin/monday-runs/:runId/approve-all',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const rows=db.prepare("SELECT * FROM payouts WHERE run_id=? AND type='weekly' AND status='pending_approval' AND payout_run_id IS NULL").all(req.params.runId),now=new Date().toISOString();const up=db.prepare("UPDATE payouts SET status='approved',decision_at=?,decision_by=?,updated_at=? WHERE id=?");for(const r of rows){up.run(now,req.auth.email,now,r.id);updateRunItem(req.params.runId,r.id,'approved','')}db.prepare("UPDATE settlement_runs SET status='approved',approved_at=? WHERE id=?").run(now,req.params.runId);audit(req,'staff',req.auth.email,'weekly_payouts_approved_all','settlement_run',req.params.runId,{count:rows.length});res.json({ok:true,count:rows.length})});
app.post('/api/admin/monday-runs/:runId/create-payout-run',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const settlement=db.prepare('SELECT * FROM settlement_runs WHERE id=?').get(req.params.runId);if(!settlement)return res.status(404).json({error:'Monday run not found'});if(settlement.payout_run_id)return res.status(409).json({error:'A payout batch has already been created for this Monday run',payoutRunId:settlement.payout_run_id});const unresolvedPlanAllocations=db.prepare("SELECT COUNT(*) count FROM payment_plan_settlement_allocations WHERE run_id=? AND status!='applied'").get(req.params.runId)?.count||0;if(unresolvedPlanAllocations>0)return res.status(409).json({error:`Apply the ${unresolvedPlanAllocations} pending payment-plan deduction${unresolvedPlanAllocations===1?'':'s'} before creating the payout batch.`,pendingPlanAllocations:unresolvedPlanAllocations});const eligible=db.prepare("SELECT * FROM payouts WHERE run_id=? AND type='weekly' AND status='approved' AND payout_run_id IS NULL ORDER BY CAST(callsign AS INTEGER),callsign").all(req.params.runId);if(!eligible.length)return res.status(400).json({error:'No approved weekly payouts are ready'});const runId=id('payrun'),now=new Date().toISOString(),total=eligible.reduce((a,x)=>a+Number(x.net_amount||x.amount||0),0);db.prepare('INSERT INTO payout_runs(id,run_type,status,created_at,created_by,scheduled_for,total_amount,item_count,provider,notes,funding_status,funding_required) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(runId,'weekly','ready',now,req.auth.email,now,total,eligible.length,String(req.body.provider||'wise'),`Monday run ${settlement.id}`,'not_started',total);const up=db.prepare("UPDATE payouts SET payout_run_id=?,status='batched',updated_at=? WHERE id=?");for(const x of eligible)up.run(runId,now,x.id);db.prepare("UPDATE settlement_runs SET status='batched',payout_run_id=? WHERE id=?").run(runId,settlement.id);audit(req,'staff',req.auth.email,'weekly_payout_run_created','payout_run',runId,{settlementRunId:settlement.id,itemCount:eligible.length,totalAmount:total,callsigns:eligible.map(x=>x.callsign)});res.json({run:serializePayoutRun(db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId)),items:eligible.map(x=>({id:x.id,callsign:x.callsign,driverName:x.driver_name,amount:Number(x.net_amount||x.amount||0)}))})});


/* ============================================================
 * PHASE 3 — DRIVER PAYMENT PLANS
 * Draft plan creation and inspection.
 * Creating a draft does NOT alter the source debt, create a
 * Stripe payment, communicate with the driver or post to Autocab.
 * ============================================================ */

function paymentPlanDateOnly(value){
 const v=String(value||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;

 const [y,m,d]=v.split('-').map(Number);
 const test=new Date(Date.UTC(y,m-1,d));

 if(
  test.getUTCFullYear()!==y ||
  test.getUTCMonth()!==m-1 ||
  test.getUTCDate()!==d
 ) return null;

 return v;
}

function paymentPlanAddDate(startDate,step,frequency){
 const [year,month,day]=startDate.split('-').map(Number);

 if(frequency==='weekly' || frequency==='fortnightly'){
  const days=(frequency==='fortnightly'?14:7)*step;
  const d=new Date(Date.UTC(year,month-1,day+days));
  return d.toISOString().slice(0,10);
 }

 if(frequency==='monthly'){
  const targetMonth=(month-1)+step;
  const targetYear=year+Math.floor(targetMonth/12);
  const monthIndex=((targetMonth%12)+12)%12;

  const lastDay=new Date(
   Date.UTC(targetYear,monthIndex+1,0)
  ).getUTCDate();

  const safeDay=Math.min(day,lastDay);

  return new Date(
   Date.UTC(targetYear,monthIndex,safeDay)
  ).toISOString().slice(0,10);
 }

 throw new Error('Unsupported payment-plan frequency');
}


function paymentPlanSettlementCandidate(driverId,availableAmount){
 const available=
  Number(
   Math.max(
    0,
    Number(availableAmount||0)
   ).toFixed(2)
  );

 if(available<=0.00001){
  return null;
 }

 const plan=db.prepare(`
  SELECT *
  FROM driver_payment_plans
  WHERE driver_id=?
    AND status IN ('active','defaulted')
  ORDER BY created_at DESC
  LIMIT 1
 `).get(driverId);

 if(!plan){
  return null;
 }

 const instalment=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE plan_id=?
    AND status IN ('due','overdue')
  ORDER BY instalment_number
  LIMIT 1
 `).get(plan.id);

 if(!instalment){
  return null;
 }

 const scheduledAmount=Number(instalment.amount||0);
 const alreadyPaidAmount=Number(instalment.paid_amount||0);

 const instalmentRemaining=
  Number(
   Math.max(
    0,
    scheduledAmount-alreadyPaidAmount
   ).toFixed(2)
  );

 const planRemaining=
  Number(
   Math.max(
    0,
    Number(plan.remaining_amount||0)
   ).toFixed(2)
  );

 const allocatedAmount=
  Number(
   Math.min(
    available,
    instalmentRemaining,
    planRemaining
   ).toFixed(2)
  );

 if(allocatedAmount<=0.00001){
  return null;
 }

 return {
  plan,
  instalment,
  paymentRequestId:instalment.payment_request_id||null,
  scheduledAmount,
  alreadyPaidAmount,
  instalmentRemaining,
  planRemaining,
  allocatedAmount
 };
}




async function applyMondayPlanSettlementAllocation(allocationId){
 let allocation=db.prepare(`
  SELECT *
  FROM payment_plan_settlement_allocations
  WHERE id=?
 `).get(allocationId);

 if(!allocation){
  throw new Error(
   `Payment-plan settlement allocation ${allocationId} was not found`
  );
 }

 if(allocation.status==='applied'){
  return {
   duplicate:true,
   allocationId:allocation.id,
   planId:allocation.plan_id,
   instalmentId:allocation.instalment_id,
   allocatedAmount:Number(allocation.allocated_amount||0)
  };
 }

 if(!['pending','applying'].includes(allocation.status)){
  throw new Error(
   `Payment-plan settlement allocation cannot be applied from status ${allocation.status}`
  );
 }

 const plan=db.prepare(`
  SELECT *
  FROM driver_payment_plans
  WHERE id=?
 `).get(allocation.plan_id);

 if(!plan){
  throw new Error(
   `Payment plan ${allocation.plan_id} was not found`
  );
 }

 if(!['active','defaulted'].includes(plan.status)){
  throw new Error(
   `Payment plan is no longer available for Monday allocation: ${plan.status}`
  );
 }

 const instalment=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE id=?
    AND plan_id=?
 `).get(
  allocation.instalment_id,
  plan.id
 );

 if(!instalment){
  throw new Error(
   'Payment-plan instalment could not be found'
  );
 }

 if(!['due','overdue'].includes(instalment.status)){
  throw new Error(
   `Payment-plan instalment is no longer due: ${instalment.status}`
  );
 }

 const currentDue=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE plan_id=?
    AND status IN ('due','overdue')
  ORDER BY instalment_number
  LIMIT 1
 `).get(plan.id);

 if(!currentDue || currentDue.id!==instalment.id){
  throw new Error(
   'The Monday allocation is stale because this is no longer the current payment-plan instalment'
  );
 }

 const scheduledAmount=Number(instalment.amount||0);
 const alreadyPaidAmount=Number(instalment.paid_amount||0);

 const instalmentRemaining=Number(
  Math.max(
   0,
   scheduledAmount-alreadyPaidAmount
  ).toFixed(2)
 );

 const planRemaining=Number(
  Math.max(
   0,
   Number(plan.remaining_amount||0)
  ).toFixed(2)
 );

 const allocatedAmount=Number(
  Number(allocation.allocated_amount||0).toFixed(2)
 );

 if(allocatedAmount<=0.00001){
  throw new Error(
   'Payment-plan settlement allocation amount must be greater than zero'
  );
 }

 if(
  allocatedAmount-instalmentRemaining>0.00001 ||
  allocatedAmount-planRemaining>0.00001
 ){
  throw new Error(
   'The Monday allocation is stale because the payment-plan balance has changed'
  );
 }

 let currentRequest=null;

 if(instalment.payment_request_id){
  currentRequest=db.prepare(`
   SELECT *
   FROM payment_requests
   WHERE id=?
  `).get(instalment.payment_request_id);
 }

 if(!currentRequest){
  throw new Error(
   'The current payment-plan instalment has no payment request. Review the plan before applying the Monday deduction.'
  );
 }

 if(currentRequest.status==='paid'){
  throw new Error(
   'The current payment request is already paid. Refresh the Monday run before applying this deduction.'
  );
 }

 if(currentRequest){
  await safelyExpirePlanPaymentSession(currentRequest);
 }

 const now=new Date().toISOString();

 if(allocation.status==='pending'){
  const claimed=db.prepare(`
   UPDATE payment_plan_settlement_allocations
   SET status='applying',
       error=NULL,
       updated_at=?
   WHERE id=?
     AND status='pending'
  `).run(
   now,
   allocation.id
  );

  if(Number(claimed.changes||0)!==1){
   throw new Error(
    `Payment-plan settlement allocation ${allocation.id} could not be claimed for processing`
   );
  }

  allocation=db.prepare(`
   SELECT *
   FROM payment_plan_settlement_allocations
   WHERE id=?
  `).get(allocation.id);
 }

 try{
  await postAutocabAdjustmentSafelyOnce({
   driverId:allocation.driver_id,
   callsign:allocation.callsign||plan.callsign||String(allocation.driver_id),
   amount:allocatedAmount,
   isCredit:false,
   description:'FaivoPay Monday payment plan deduction',
   adjustmentReason:'FleetPay Payment Plan',
   eventKey:allocation.autocab_event_key
  });

  const latestPlan=db.prepare(`
   SELECT *
   FROM driver_payment_plans
   WHERE id=?
  `).get(plan.id);

  const latestInstalment=db.prepare(`
   SELECT *
   FROM driver_payment_plan_instalments
   WHERE id=?
     AND plan_id=?
  `).get(
   instalment.id,
   plan.id
  );

  if(
   !latestPlan ||
   !latestInstalment ||
   !['active','defaulted'].includes(latestPlan.status) ||
   !['due','overdue'].includes(latestInstalment.status)
  ){
   throw new Error(
    'Autocab deduction completed but the payment plan changed before FaivoPay progression. Manual review is required.'
   );
  }

  const latestRemaining=Number(
   Math.max(
    0,
    Number(latestInstalment.amount||0)-
    Number(latestInstalment.paid_amount||0)
   ).toFixed(2)
  );

  let progression;

  if(allocatedAmount+0.00001<latestRemaining){
   progression=await applyPartialMondayPlanAllocation(
    allocation
   );
  }else{
   const request=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(latestInstalment.payment_request_id);

   if(!request){
    throw new Error(
     'Autocab deduction completed but the payment request is missing. Manual review is required.'
    );
   }

   progression=progressPaymentPlanAfterPayment(
    {
     ...request,
     amount:latestRemaining,
     provider:'monday_settlement',
     provider_session_id:null,
     provider_payment_intent_id:null,
     payment_url:null
    },
    now,
    {
     allocationId:allocation.id,
     actorId:'monday_settlement'
    }
   );
  }

  return {
   ok:true,
   allocationId:allocation.id,
   allocatedAmount,
   progression
  };

 }catch(e){
  const latest=db.prepare(`
   SELECT *
   FROM payment_plan_settlement_allocations
   WHERE id=?
  `).get(allocation.id);

  if(latest?.status!=='applied'){
   db.prepare(`
    UPDATE payment_plan_settlement_allocations
    SET error=?,
        updated_at=?
    WHERE id=?
   `).run(
    e.message,
    new Date().toISOString(),
    allocation.id
   );
  }

  throw e;
 }
}

async function applyPartialMondayPlanAllocation(allocation){
 const plan=db.prepare(`
  SELECT *
  FROM driver_payment_plans
  WHERE id=?
 `).get(allocation.plan_id);

 if(!plan){
  throw new Error(`Payment plan ${allocation.plan_id} was not found`);
 }

 if(!['active','defaulted'].includes(plan.status)){
  throw new Error(
   `Payment plan is not available for Monday allocation: ${plan.status}`
  );
 }

 const instalment=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE id=?
    AND plan_id=?
 `).get(
  allocation.instalment_id,
  plan.id
 );

 if(!instalment){
  throw new Error('Payment plan instalment could not be found');
 }

 if(!['due','overdue'].includes(instalment.status)){
  throw new Error(
   `Payment plan instalment is no longer due: ${instalment.status}`
  );
 }

 const scheduledAmount=Number(instalment.amount||0);
 const alreadyPaidAmount=Number(instalment.paid_amount||0);
 const instalmentRemaining=Number(
  Math.max(0,scheduledAmount-alreadyPaidAmount).toFixed(2)
 );

 const requestedAmount=Number(allocation.allocated_amount||0);
 const paidAmount=Number(
  Math.min(
   requestedAmount,
   instalmentRemaining,
   Number(plan.remaining_amount||0)
  ).toFixed(2)
 );

 if(paidAmount<=0.00001){
  throw new Error('No payment-plan balance remains to allocate');
 }

 if(paidAmount+0.00001>=instalmentRemaining){
  throw new Error(
   'Partial Monday allocation helper received a full instalment payment'
  );
 }

 let currentRequest=null;

 if(instalment.payment_request_id){
  currentRequest=db.prepare(`
   SELECT *
   FROM payment_requests
   WHERE id=?
  `).get(instalment.payment_request_id);
 }

 if(currentRequest){
  await safelyExpirePlanPaymentSession(currentRequest);
 }

 const newInstalmentPaidAmount=Number(
  (alreadyPaidAmount+paidAmount).toFixed(2)
 );

 const newPlanPaidAmount=Number(
  Math.min(
   Number(plan.plan_amount||0),
   Number(plan.paid_amount||0)+paidAmount
  ).toFixed(2)
 );

 const newPlanRemaining=Number(
  Math.max(
   0,
   Number(plan.plan_amount||0)-newPlanPaidAmount
  ).toFixed(2)
 );

 const requestAmount=Number(
  Math.max(
   0,
   scheduledAmount-newInstalmentPaidAmount
  ).toFixed(2)
 );

 const now=new Date().toISOString();
 const requestId=currentRequest?.id||id('request');

 db.exec('BEGIN IMMEDIATE');

 try{
  db.prepare(`
   UPDATE driver_payment_plan_instalments
   SET paid_amount=?,
       payment_request_id=?,
       payment_url=NULL,
       provider=NULL,
       provider_session_id=NULL,
       provider_payment_intent_id=NULL,
       updated_at=?
   WHERE id=?
     AND status IN ('due','overdue')
  `).run(
   newInstalmentPaidAmount,
   requestId,
   now,
   instalment.id
  );

  if(currentRequest){
   db.prepare(`
    UPDATE payment_requests
    SET balance=?,
        amount=?,
        weekly_fee=0,
        carried_charges=0,
        status='open',
        payment_url=NULL,
        provider=NULL,
        provider_session_id=NULL,
        provider_payment_intent_id=NULL,
        updated_at=?
    WHERE id=?
   `).run(
    -newPlanRemaining,
    requestAmount,
    now,
    requestId
   );
  }else{
   db.prepare(`
    INSERT INTO payment_requests(
     id,
     run_id,
     driver_id,
     callsign,
     driver_name,
     balance,
     weekly_fee,
     carried_charges,
     amount,
     status,
     payment_url,
     created_at,
     updated_at,
     due_at,
     payment_plan_id,
     payment_plan_instalment_id,
     request_type
    )
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   `).run(
    requestId,
    null,
    plan.driver_id,
    plan.callsign,
    plan.driver_name,
    -newPlanRemaining,
    0,
    0,
    requestAmount,
    'open',
    null,
    now,
    now,
    instalment.due_at,
    plan.id,
    instalment.id,
    'payment_plan_instalment'
   );
  }

  db.prepare(`
   UPDATE driver_payment_plans
   SET paid_amount=?,
       remaining_amount=?,
       updated_at=?
   WHERE id=?
  `).run(
   newPlanPaidAmount,
   newPlanRemaining,
   now,
   plan.id
  );

  db.prepare(`
   INSERT INTO driver_payment_plan_events(
    id,
    plan_id,
    driver_id,
    event_type,
    description,
    actor_type,
    actor_id,
    metadata_json,
    created_at
   )
   VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
   id('planevent'),
   plan.id,
   plan.driver_id,
   'monday_partial_allocation',
   `£${paidAmount.toFixed(2)} applied from Monday settlement`,
   'system',
   'monday_settlement',
   JSON.stringify({
    allocationId:allocation.id,
    instalmentId:instalment.id,
    paymentRequestId:requestId,
    amount:paidAmount,
    instalmentPaidAmount:newInstalmentPaidAmount,
    instalmentRemaining:requestAmount,
    planPaidAmount:newPlanPaidAmount,
    planRemainingAmount:newPlanRemaining
   }),
   now
  );

  const allocationUpdate=db.prepare(`
   UPDATE payment_plan_settlement_allocations
   SET status='applied',
       payment_request_id=?,
       error=NULL,
       updated_at=?,
       applied_at=?
   WHERE id=?
     AND status='applying'
  `).run(
   requestId,
   now,
   now,
   allocation.id
  );

  if(Number(allocationUpdate.changes||0)!==1){
   throw new Error(
    `Payment-plan allocation ${allocation.id} is not in applying state`
   );
  }

  db.exec('COMMIT');

 }catch(e){
  try{db.exec('ROLLBACK')}catch{}
  throw e;
 }

 notify(
  plan.driver_id,
  'Payment plan payment applied',
  `£${paidAmount.toFixed(2)} from your Monday FaivoPay balance has been applied to your payment plan. £${requestAmount.toFixed(2)} remains due on this instalment.`,
  'success',
  plan.id
 );

 return {
  completed:false,
  partial:true,
  planId:plan.id,
  instalmentId:instalment.id,
  paymentRequestId:requestId,
  allocatedAmount:paidAmount,
  instalmentPaidAmount:newInstalmentPaidAmount,
  instalmentRemaining:requestAmount,
  planPaidAmount:newPlanPaidAmount,
  planRemainingAmount:newPlanRemaining
 };
}

function progressPaymentPlanAfterPayment(paymentRequest,paidAt,options={}){
 if(
  !paymentRequest?.payment_plan_id ||
  !paymentRequest?.payment_plan_instalment_id
 ){
  return null;
 }

 const plan=db.prepare(`
  SELECT *
  FROM driver_payment_plans
  WHERE id=?
 `).get(paymentRequest.payment_plan_id);

 if(!plan){
  throw new Error(
   `Payment plan ${paymentRequest.payment_plan_id} was not found`
  );
 }

 const instalment=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE id=?
    AND plan_id=?
 `).get(
  paymentRequest.payment_plan_instalment_id,
  plan.id
 );

 if(!instalment){
  throw new Error(
   'Payment plan instalment could not be found'
  );
 }

 /*
  * Idempotency:
  * Stripe can send the same completion event more than once.
  * If this instalment has already been processed, do nothing.
  */
 if(instalment.status==='paid'){
  return {
   duplicate:true,
   planId:plan.id,
   instalmentId:instalment.id
  };
 }

 if(!['active','paused','defaulted'].includes(plan.status)){
  throw new Error(
   `Payment plan is not in a payable state: ${plan.status}`
  );
 }

 const scheduledAmount=Number(instalment.amount||0);
 const alreadyPaidAmount=Number(instalment.paid_amount||0);
 const instalmentRemaining=
  Number(
   Math.max(
    0,
    scheduledAmount-alreadyPaidAmount
   ).toFixed(2)
  );

 const paidAmount=
  Number(
   Math.min(
    instalmentRemaining,
    Number(paymentRequest.amount||0)
   ).toFixed(2)
  );

 const newInstalmentPaidAmount=
  Number(
   Math.min(
    scheduledAmount,
    alreadyPaidAmount+paidAmount
   ).toFixed(2)
  );

 if(newInstalmentPaidAmount+0.00001<scheduledAmount){
  throw new Error(
   `Payment of £${paidAmount.toFixed(2)} does not fully satisfy the remaining £${instalmentRemaining.toFixed(2)} instalment balance`
  );
 }

 const newPaidAmount=
  Number(
   Math.min(
    Number(plan.plan_amount||0),
    Number(plan.paid_amount||0)+paidAmount
   ).toFixed(2)
  );

 const newRemaining=
  Number(
   Math.max(
    0,
    Number(plan.plan_amount||0)-newPaidAmount
   ).toFixed(2)
  );

 const now=paidAt||new Date().toISOString();
 const progressionActorId=String(options?.actorId||'stripe');

 const next=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE plan_id=?
    AND instalment_number>?
    AND status='scheduled'
  ORDER BY instalment_number
  LIMIT 1
 `).get(
  plan.id,
  instalment.instalment_number
 );

 let nextPaymentRequestId=null;

 db.exec('BEGIN IMMEDIATE');

 try{
  if(options?.allocationId){
   db.prepare(`
    UPDATE payment_requests
    SET status='paid',
        provider=?,
        provider_session_id=NULL,
        provider_payment_intent_id=NULL,
        payment_url=NULL,
        paid_at=?,
        updated_at=?
    WHERE id=?
      AND payment_plan_id=?
      AND payment_plan_instalment_id=?
   `).run(
    progressionActorId,
    now,
    now,
    paymentRequest.id,
    plan.id,
    instalment.id
   );
  }

  db.prepare(`
   UPDATE driver_payment_plan_instalments
   SET status='paid',
       paid_amount=?,
       provider=?,
       provider_session_id=?,
       provider_payment_intent_id=?,
       payment_url=?,
       paid_at=?,
       updated_at=?
   WHERE id=?
     AND status!='paid'
  `).run(
   newInstalmentPaidAmount,
   options?.allocationId
    ?progressionActorId
    :(paymentRequest.provider||'stripe'),
   paymentRequest.provider_session_id||null,
   paymentRequest.provider_payment_intent_id||null,
   paymentRequest.payment_url||null,
   now,
   now,
   instalment.id
  );

  /*
   * Final instalment: close the plan and the original source debt.
   */
  if(newRemaining<=0.00001){
   db.prepare(`
    UPDATE driver_payment_plans
    SET paid_amount=?,
        remaining_amount=0,
        next_due_at=NULL,
        status='completed',
        completed_at=?,
        updated_at=?
    WHERE id=?
   `).run(
    Number(plan.plan_amount||0),
    now,
    now,
    plan.id
   );

   db.prepare(`
    UPDATE payment_requests
    SET status='paid',
        paid_at=?,
        updated_at=?
    WHERE id=?
      AND status='on_plan'
   `).run(
    now,
    now,
    plan.source_payment_request_id
   );

   db.prepare(`
    INSERT INTO driver_payment_plan_events(
     id,
     plan_id,
     driver_id,
     event_type,
     description,
     actor_type,
     actor_id,
     metadata_json,
     created_at
    )
    VALUES(?,?,?,?,?,?,?,?,?)
   `).run(
    id('planevent'),
    plan.id,
    plan.driver_id,
    'plan_completed',
    'Payment plan completed',
    'system',
    progressionActorId,
    JSON.stringify({
     finalInstalmentId:instalment.id,
     finalPaymentRequestId:paymentRequest.id,
     amount:paidAmount,
     totalPaid:Number(plan.plan_amount||0)
    }),
    now
   );

  }else if(!next){
    /*
     * The Stripe payment is genuine and has already been recorded.
     * If the schedule unexpectedly ends while money is still owed,
     * preserve the remaining debt and put the plan into Attention
     * Required rather than silently writing the balance off.
     */
    db.prepare(`
     UPDATE driver_payment_plans
     SET paid_amount=?,
         remaining_amount=?,
         next_due_at=NULL,
         status='defaulted',
         defaulted_at=COALESCE(defaulted_at,?),
         default_reason='Payment-plan schedule ended before balance reached zero',
         updated_at=?
     WHERE id=?
    `).run(
     newPaidAmount,
     newRemaining,
     now,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,
      plan_id,
      driver_id,
      event_type,
      description,
      actor_type,
      actor_id,
      metadata_json,
      created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'schedule_exhausted',
     'Payment received but payment-plan schedule ended with a remaining balance',
     'system',
     progressionActorId,
     JSON.stringify({
      instalmentId:instalment.id,
      paymentRequestId:paymentRequest.id,
      amount:paidAmount,
      paidAmount:newPaidAmount,
      remainingAmount:newRemaining
     }),
     now
    );

   }else{
   /*
    * Create the next normal FaivoPay payment request.
    *
    * Weekly fee and carried charges are deliberately ZERO here.
    * They were attached only to the first instalment during plan
    * activation and must never be charged again.
    */
   nextPaymentRequestId=id('request');

   db.prepare(`
    INSERT INTO payment_requests(
     id,
     run_id,
     driver_id,
     callsign,
     driver_name,
     balance,
     weekly_fee,
     carried_charges,
     amount,
     status,
     payment_url,
     created_at,
     updated_at,
     due_at,
     payment_plan_id,
     payment_plan_instalment_id,
     request_type
    )
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   `).run(
    nextPaymentRequestId,
    paymentRequest.run_id||null,
    plan.driver_id,
    plan.callsign,
    plan.driver_name,
    -newRemaining,
    0,
    0,
    Number(next.amount||0),
    'open',
    null,
    now,
    now,
    next.due_at,
    plan.id,
    next.id,
    'payment_plan_instalment'
   );

   db.prepare(`
    UPDATE driver_payment_plan_instalments
    SET status='due',
        payment_request_id=?,
        updated_at=?
    WHERE id=?
      AND status='scheduled'
   `).run(
    nextPaymentRequestId,
    now,
    next.id
   );

   db.prepare(`
    UPDATE driver_payment_plans
    SET paid_amount=?,
        remaining_amount=?,
        next_due_at=?,
        status='active',
        updated_at=?
    WHERE id=?
   `).run(
    newPaidAmount,
    newRemaining,
    next.due_at,
    now,
    plan.id
   );

   db.prepare(`
    INSERT INTO driver_payment_plan_events(
     id,
     plan_id,
     driver_id,
     event_type,
     description,
     actor_type,
     actor_id,
     metadata_json,
     created_at
    )
    VALUES(?,?,?,?,?,?,?,?,?)
   `).run(
    id('planevent'),
    plan.id,
    plan.driver_id,
    'instalment_paid',
    `Instalment ${instalment.instalment_number} paid`,
    'system',
    progressionActorId,
    JSON.stringify({
     instalmentId:instalment.id,
     paymentRequestId:paymentRequest.id,
     amount:paidAmount,
     paidAmount:newPaidAmount,
     remainingAmount:newRemaining,
     nextInstalmentId:next.id,
     nextPaymentRequestId,
     nextAmount:Number(next.amount||0),
     nextDueAt:next.due_at
    }),
    now
   );
  }

  if(options?.allocationId){
   const allocationUpdate=db.prepare(`
    UPDATE payment_plan_settlement_allocations
    SET status='applied',
        payment_request_id=?,
        error=NULL,
        updated_at=?,
        applied_at=?
    WHERE id=?
      AND status='applying'
   `).run(
    paymentRequest.id,
    now,
    now,
    options.allocationId
   );

   if(Number(allocationUpdate.changes||0)!==1){
    throw new Error(
     `Payment-plan allocation ${options.allocationId} is not in applying state`
    );
   }
  }

  db.exec('COMMIT');

 }catch(e){
  try{db.exec('ROLLBACK')}catch{}
  throw e;
 }

 if(newRemaining<=0.00001){
  notify(
   plan.driver_id,
   'Payment plan completed',
   `Your FaivoPay payment plan has been completed. All £${Number(plan.plan_amount||0).toFixed(2)} has now been paid.`,
   'success',
   plan.id
  );

  return {
   completed:true,
   planId:plan.id,
   instalmentId:instalment.id,
   paidAmount:Number(plan.plan_amount||0),
   remainingAmount:0
  };
 }

 if(!next){
  notify(
   plan.driver_id,
   'Payment plan requires review',
   `Your payment of £${paidAmount.toFixed(2)} has been received. £${newRemaining.toFixed(2)} remains on your payment plan, but there are no further scheduled instalments. FaivoPay will review the remaining balance.`,
   'warning',
   plan.id
  );

  return {
   completed:false,
   defaulted:true,
   planId:plan.id,
   instalmentId:instalment.id,
   paidAmount:newPaidAmount,
   remainingAmount:newRemaining,
   nextInstalmentId:null,
   nextPaymentRequestId:null
  };
 }

 notify(
  plan.driver_id,
  'Payment received',
  `Thank you. Your payment of £${paidAmount.toFixed(2)} has been received. £${newRemaining.toFixed(2)} remains on your payment plan. Your next payment of £${Number(next.amount||0).toFixed(2)} is due ${next.due_at}.`,
  'success',
  plan.id
 );

 return {
  completed:false,
  planId:plan.id,
  instalmentId:instalment.id,
  paidAmount:newPaidAmount,
  remainingAmount:newRemaining,
  nextInstalmentId:next.id,
  nextPaymentRequestId,
  nextAmount:Number(next.amount||0),
  nextDueAt:next.due_at
 };
}


function applyPaymentPlanExtraPayment(paymentRequest,paidAt,options={}){
 if(!paymentRequest?.payment_plan_id || String(paymentRequest?.request_type||'')!=='payment_plan_extra')return null;
 const plan=db.prepare(`SELECT * FROM driver_payment_plans WHERE id=?`).get(paymentRequest.payment_plan_id);
 if(!plan)throw new Error(`Payment plan ${paymentRequest.payment_plan_id} was not found`);
 if(!['active','paused','defaulted'].includes(plan.status))throw new Error(`Payment plan is not in a payable state: ${plan.status}`);
 const prior=db.prepare(`SELECT metadata_json FROM driver_payment_plan_events WHERE plan_id=? AND event_type='extra_payment_applied' ORDER BY created_at DESC`).all(plan.id).find(row=>{try{return JSON.parse(row.metadata_json||'{}').paymentRequestId===paymentRequest.id}catch{return false}});
 if(prior)return {duplicate:true,planId:plan.id,paymentRequestId:paymentRequest.id,remainingAmount:Number(plan.remaining_amount||0)};
 const current=db.prepare(`SELECT * FROM driver_payment_plan_instalments WHERE plan_id=? AND status IN ('due','overdue') ORDER BY instalment_number LIMIT 1`).get(plan.id);
 if(!current)throw new Error('No current payment-plan instalment could be found');
 const currentRemaining=Number(Math.max(0,Number(current.amount||0)-Number(current.paid_amount||0)).toFixed(2));
 const planRemaining=Number(plan.remaining_amount||0);
 const maxExtra=Number(Math.max(0,planRemaining-currentRemaining).toFixed(2));
 const paidAmount=Number(paymentRequest.amount||0);
 if(!(paidAmount>0))throw new Error('Extra payment amount must be greater than zero');
 if(paidAmount>maxExtra+0.00001)throw new Error(`Extra payment of £${paidAmount.toFixed(2)} exceeds the £${maxExtra.toFixed(2)} principal currently available for an extra payment. Manual review is required.`);
 const newPaidAmount=Number(Math.min(Number(plan.plan_amount||0),Number(plan.paid_amount||0)+paidAmount).toFixed(2));
 const newRemaining=Number(Math.max(0,planRemaining-paidAmount).toFixed(2));
 const now=paidAt||new Date().toISOString(),actorId=String(options?.actorId||'stripe'),actorType=String(options?.actorType||'system');
 const future=db.prepare(`SELECT * FROM driver_payment_plan_instalments WHERE plan_id=? AND instalment_number>? AND status='scheduled' ORDER BY instalment_number DESC`).all(plan.id,current.instalment_number);
 let reduction=paidAmount;
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const inst of future){
   if(reduction<=0.00001)break;
   const amount=Number(inst.amount||0);
   if(reduction+0.00001>=amount){db.prepare(`UPDATE driver_payment_plan_instalments SET status='cancelled',updated_at=? WHERE id=? AND status='scheduled'`).run(now,inst.id);reduction=Number(Math.max(0,reduction-amount).toFixed(2));}
   else{db.prepare(`UPDATE driver_payment_plan_instalments SET amount=?,updated_at=? WHERE id=? AND status='scheduled'`).run(Number((amount-reduction).toFixed(2)),now,inst.id);reduction=0;}
  }
  if(reduction>0.00001)throw new Error(`Payment-plan future schedule is short by £${reduction.toFixed(2)}. Extra payment was received but automatic plan progression requires manual review.`);
  db.prepare(`UPDATE driver_payment_plans SET paid_amount=?,remaining_amount=?,updated_at=? WHERE id=?`).run(newPaidAmount,newRemaining,now,plan.id);
  db.prepare(`INSERT INTO driver_payment_plan_events(id,plan_id,driver_id,event_type,description,actor_type,actor_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(id('planevent'),plan.id,plan.driver_id,'extra_payment_applied',`Extra principal payment of £${paidAmount.toFixed(2)} applied`,actorType,actorId,JSON.stringify({paymentRequestId:paymentRequest.id,amount:paidAmount,paidAmount:newPaidAmount,remainingAmount:newRemaining,currentInstalmentId:current.id,currentInstalmentRemaining:currentRemaining,autocabAdjusted:false}),now);
  db.exec('COMMIT');
 }catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
 notify(plan.driver_id,'Extra payment applied',`Your extra payment of £${paidAmount.toFixed(2)} has reduced your FaivoPay payment-plan balance to £${newRemaining.toFixed(2)}. Your current instalment remains £${currentRemaining.toFixed(2)}.`,'success',plan.id);
 return {completed:false,extraPayment:true,planId:plan.id,paymentRequestId:paymentRequest.id,amount:paidAmount,paidAmount:newPaidAmount,remainingAmount:newRemaining,currentInstalmentId:current.id,currentInstalmentRemaining:currentRemaining,autocabAdjusted:false};
}

function refreshPaymentPlanStatuses(){
 const today=londonWindow().date;
 const now=new Date().toISOString();

 /*
  * Only the currently issued instalment can become overdue.
  * Future scheduled instalments remain untouched.
  */
 const overdue=db.prepare(`
  SELECT
   i.id,
   i.plan_id,
   i.driver_id,
   i.instalment_number,
   i.amount,
   i.due_at,
   p.callsign,
   p.status plan_status
  FROM driver_payment_plan_instalments i
  JOIN driver_payment_plans p
    ON p.id=i.plan_id
  WHERE i.status='due'
    AND i.due_at<?
    AND p.status IN ('active','defaulted')
 `).all(today);

 if(!overdue.length){
  return {
   overdueInstalments:0,
   defaultedPlans:0
  };
 }

 const newlyDefaulted=[];

 db.exec('BEGIN IMMEDIATE');

 try{
  const markOverdue=db.prepare(`
   UPDATE driver_payment_plan_instalments
   SET status='overdue',
       updated_at=?
   WHERE id=?
     AND status='due'
  `);

  const defaultPlan=db.prepare(`
   UPDATE driver_payment_plans
   SET status='defaulted',
       defaulted_at=COALESCE(defaulted_at,?),
       default_reason=COALESCE(
        default_reason,
        'Scheduled instalment missed'
       ),
       updated_at=?
   WHERE id=?
     AND status='active'
  `);

  const addEvent=db.prepare(`
   INSERT INTO driver_payment_plan_events(
    id,
    plan_id,
    driver_id,
    event_type,
    description,
    actor_type,
    actor_id,
    metadata_json,
    created_at
   )
   VALUES(?,?,?,?,?,?,?,?,?)
  `);

  for(const item of overdue){
   const changed=markOverdue.run(
    now,
    item.id
   );

   if(!changed.changes)continue;

   if(item.plan_status==='active'){
    const planChanged=defaultPlan.run(
     now,
     now,
     item.plan_id
    );

    if(planChanged.changes){
     newlyDefaulted.push(item);

     addEvent.run(
      id('planevent'),
      item.plan_id,
      item.driver_id,
      'instalment_overdue',
      `Instalment ${item.instalment_number} became overdue`,
      'system',
      'fleetpay',
      JSON.stringify({
       instalmentId:item.id,
       instalmentNumber:item.instalment_number,
       amount:Number(item.amount||0),
       dueAt:item.due_at
      }),
      now
     );
    }
   }
  }

  db.exec('COMMIT');

 }catch(e){
  try{db.exec('ROLLBACK')}catch{}
  throw e;
 }

 /*
  * Notifications are outside the transaction so a notification
  * problem cannot undo the financial status update.
  */
 for(const item of newlyDefaulted){
  try{
   notify(
    item.driver_id,
    'Payment plan needs attention',
    `Your payment-plan instalment of £${Number(item.amount||0).toFixed(2)} due ${item.due_at} is overdue. Please make the payment in FaivoPay or contact the office.`,
    'warning',
    item.plan_id
   );
  }catch{}
 }

 return {
  overdueInstalments:overdue.length,
  defaultedPlans:newlyDefaulted.length
 };
}

function serializePaymentPlan(row,{instalments=true,events=false}={}){
 if(!row) return null;

 const earlySettlementRequested=Boolean(
  db.prepare(`
   SELECT 1
   FROM driver_payment_plan_events
   WHERE plan_id=?
     AND event_type='early_settlement_requested'
   LIMIT 1
  `).get(row.id)
 );

 const out={
  id:row.id,
  driverId:Number(row.driver_id),
  callsign:row.callsign,
  driverName:row.driver_name,

  sourcePaymentRequestId:row.source_payment_request_id,

  originalAmount:Number(row.original_amount||0),
  planAmount:Number(row.plan_amount||0),
  paidAmount:Number(row.paid_amount||0),
  remainingAmount:Number(row.remaining_amount||0),

  frequency:row.frequency,
  instalmentAmount:Number(row.instalment_amount||0),

  startDate:row.start_date,
  nextDueAt:row.next_due_at,

  status:row.status,
  notes:row.notes||'',
  earlySettlementRequested,

  createdBy:row.created_by,
  createdAt:row.created_at,
  updatedBy:row.updated_by,
  updatedAt:row.updated_at,

  activatedAt:row.activated_at,
  pausedAt:row.paused_at,
  completedAt:row.completed_at,
  cancelledAt:row.cancelled_at,
  defaultedAt:row.defaulted_at,

  cancellationReason:row.cancellation_reason,
  pauseReason:row.pause_reason,
  defaultReason:row.default_reason
 };

 if(instalments){
  out.instalments=db.prepare(`
   SELECT
    *,
    plan_id planId,
    driver_id driverId,
    instalment_number instalmentNumber,
    payment_request_id paymentRequestId,
    provider_session_id providerSessionId,
    provider_payment_intent_id providerPaymentIntentId,
    payment_url paymentUrl,
    due_at dueAt,
    paid_at paidAt,
    created_at createdAt,
    updated_at updatedAt
   FROM driver_payment_plan_instalments
   WHERE plan_id=?
   ORDER BY instalment_number
  `).all(row.id).map(x=>({
   ...x,
   amount:Number(x.amount||0)
  }));
 }

 if(events){
  out.events=db.prepare(`
   SELECT
    *,
    plan_id planId,
    driver_id driverId,
    event_type eventType,
    actor_type actorType,
    actor_id actorId,
    metadata_json metadataJson,
    created_at createdAt
   FROM driver_payment_plan_events
   WHERE plan_id=?
   ORDER BY created_at DESC
  `).all(row.id).map(x=>{
   let metadata=null;
   try{
    metadata=x.metadata_json
     ?JSON.parse(x.metadata_json)
     :null;
   }catch{}

   let actorName=null;
   let actorRole=null;

   if(x.actor_type==='staff'&&x.actor_id){
    const staff=db.prepare(`
     SELECT name,role
     FROM staff_users
     WHERE lower(email)=lower(?)
     LIMIT 1
    `).get(x.actor_id);

    actorName=staff?.name||null;
    actorRole=staff?.role||null;
   }

   return {
    ...x,
    metadata,
    actorName,
    actorRole
   };
  });
 }

 return out;
}

app.get(
 '/api/admin/payment-plans/csv',
 adminAuth,
 requireStaffRole('administrator','finance','office','readonly'),
 (req,res)=>{
  refreshPaymentPlanStatuses();

  const rows=db.prepare(`
   SELECT
    p.*,
    (
     SELECT COUNT(*)
     FROM driver_payment_plan_instalments i
     WHERE i.plan_id=p.id
       AND i.status='overdue'
    ) overdue_instalments
   FROM driver_payment_plans p
   ORDER BY
    CASE p.status
     WHEN 'defaulted' THEN 0
     WHEN 'active' THEN 1
     WHEN 'paused' THEN 2
     WHEN 'draft' THEN 3
     ELSE 4
    END,
    p.created_at DESC
  `).all();

  const esc=v=>{
   let value=String(v??'');

   if(/^[=+\-@]/.test(value)){
    value=`'${value}`;
   }

   return `"${value.replaceAll('"','""')}"`;
  };

  const csv=[
   [
    'Plan ID',
    'Driver ID',
    'Callsign',
    'Driver Name',
    'Status',
    'Original Amount',
    'Plan Amount',
    'Paid Amount',
    'Remaining Amount',
    'Frequency',
    'Instalment Amount',
    'Start Date',
    'Next Due',
    'Overdue Instalments',
    'Created By',
    'Created At',
    'Updated By',
    'Updated At',
    'Default Reason',
    'Pause Reason',
    'Cancellation Reason'
   ].join(','),
   ...rows.map(x=>[
    esc(x.id),
    Number(x.driver_id||0),
    esc(x.callsign),
    esc(x.driver_name),
    esc(x.status),
    Number(x.original_amount||0).toFixed(2),
    Number(x.plan_amount||0).toFixed(2),
    Number(x.paid_amount||0).toFixed(2),
    Number(x.remaining_amount||0).toFixed(2),
    esc(x.frequency),
    Number(x.instalment_amount||0).toFixed(2),
    esc(x.start_date),
    esc(x.next_due_at),
    Number(x.overdue_instalments||0),
    esc(x.created_by),
    esc(x.created_at),
    esc(x.updated_by),
    esc(x.updated_at),
    esc(x.default_reason),
    esc(x.pause_reason),
    esc(x.cancellation_reason)
   ].join(','))
  ].join('\n');

  res.setHeader('Content-Type','text/csv');
  res.setHeader(
   'Content-Disposition',
   'attachment; filename=FaivoPay-payment-plans.csv'
  );
  res.send(csv);
 }
);

app.get(
 '/api/admin/payment-plans',
 adminAuth,
 requireStaffRole('administrator','finance','office','readonly'),
 (req,res)=>{
  refreshPaymentPlanStatuses();

  const rows=db.prepare(`
   SELECT *
   FROM driver_payment_plans
   ORDER BY
    CASE status
     WHEN 'defaulted' THEN 0
     WHEN 'active' THEN 1
     WHEN 'paused' THEN 2
     WHEN 'draft' THEN 3
     ELSE 4
    END,
    created_at DESC
  `).all();

  const plans=rows.map(
   row=>serializePaymentPlan(row,{instalments:true,events:false})
  );

  const summary=plans.reduce((a,x)=>{
   a.total++;
   a[x.status]=(a[x.status]||0)+1;

   if(['active','paused','defaulted'].includes(x.status)){
    a.outstanding+=Number(x.remainingAmount||0);
   }

   return a;
  },{
   total:0,
   draft:0,
   active:0,
   paused:0,
   completed:0,
   cancelled:0,
   defaulted:0,
   outstanding:0
  });

  res.json({plans,summary});
 }
);

app.get(
 '/api/admin/payment-plans/:id',
 adminAuth,
 requireStaffRole('administrator','finance','office','readonly'),
 (req,res)=>{
  refreshPaymentPlanStatuses();

  const row=db.prepare(`
   SELECT *
   FROM driver_payment_plans
   WHERE id=?
  `).get(req.params.id);

  if(!row){
   return res.status(404).json({
    error:'Payment plan not found'
   });
  }

  res.json({
   plan:serializePaymentPlan(
    row,
    {instalments:true,events:true}
   )
  });
 }
);

app.post(
 '/api/admin/payment-plans/:id/extra-payment/manual',
 adminAuth,
 requireStaffRole('administrator','finance'),
 async(req,res)=>{
  try{
   refreshPaymentPlanStatuses();
   const plan=db.prepare(`SELECT * FROM driver_payment_plans WHERE id=?`).get(req.params.id);
   if(!plan)return res.status(404).json({error:'Payment plan not found'});
   if(!['active','defaulted'].includes(plan.status)){
    return res.status(409).json({error:'Manual extra payments can be recorded only while the plan is active or needs attention.'});
   }

   const current=db.prepare(`
    SELECT * FROM driver_payment_plan_instalments
    WHERE plan_id=? AND status IN ('due','overdue')
    ORDER BY instalment_number LIMIT 1
   `).get(plan.id);
   if(!current)return res.status(409).json({error:'No current payment-plan instalment could be found.'});

   const currentRemaining=Number(Math.max(0,Number(current.amount||0)-Number(current.paid_amount||0)).toFixed(2));
   const planRemaining=Number(plan.remaining_amount||0);
   const maxExtra=Number(Math.max(0,planRemaining-currentRemaining).toFixed(2));
   const amount=Number(req.body.amount||0);

   if(!(amount>0))return res.status(400).json({error:'Enter an extra payment amount greater than zero.'});
   if(maxExtra<=0.00001)return res.status(409).json({error:'There is no future principal available for an extra payment. Pay the current instalment or use settle early.'});
   if(amount>maxExtra+0.00001)return res.status(400).json({error:`Extra payment cannot exceed £${maxExtra.toFixed(2)} while the current £${currentRemaining.toFixed(2)} instalment remains due.`});

   /*
    * Pre-flight the future schedule before recording money as received.
    * This prevents an inconsistent schedule leaving a paid request behind
    * that cannot then be applied to plan principal.
    */
   const futurePrincipal=Number(
    db.prepare(`
     SELECT COALESCE(SUM(amount),0) total
     FROM driver_payment_plan_instalments
     WHERE plan_id=?
       AND instalment_number>?
       AND status='scheduled'
    `).get(plan.id,current.instalment_number)?.total||0
   );

   if(amount>futurePrincipal+0.00001){
    return res.status(409).json({
     error:`The payment-plan schedule contains only £${futurePrincipal.toFixed(2)} of future principal. No payment has been recorded. Review the plan before continuing.`
    });
   }

   const existing=db.prepare(`
    SELECT * FROM payment_requests
    WHERE payment_plan_id=? AND request_type='payment_plan_extra' AND status='open'
    ORDER BY created_at DESC LIMIT 1
   `).get(plan.id);

   if(existing){
    await safelyExpirePlanPaymentSession(existing);
    db.prepare(`
     UPDATE payment_requests
     SET status='cancelled',payment_url=NULL,provider=NULL,
      provider_session_id=NULL,provider_payment_intent_id=NULL,updated_at=?
     WHERE id=? AND status='open'
    `).run(new Date().toISOString(),existing.id);
    audit(req,'staff',req.auth.email,'payment_plan_extra_payment_cancelled','driver_payment_plan',plan.id,{paymentRequestId:existing.id,reason:'office_manual_extra_payment_recorded'});
   }

   const now=new Date().toISOString(),today=londonWindow().date,requestId=id('request');

   db.prepare(`
    INSERT INTO payment_requests(
     id,run_id,driver_id,callsign,driver_name,balance,weekly_fee,carried_charges,
     amount,status,payment_url,created_at,updated_at,due_at,payment_plan_id,
     payment_plan_instalment_id,request_type,provider,paid_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   `).run(
    requestId,null,plan.driver_id,plan.callsign,plan.driver_name,-planRemaining,0,0,
    amount,'paid',null,now,now,today,plan.id,null,'payment_plan_extra','manual_office',now
   );

   db.prepare(`
    INSERT INTO driver_payment_plan_events(
     id,plan_id,driver_id,event_type,description,actor_type,actor_id,metadata_json,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)
   `).run(
    id('planevent'),plan.id,plan.driver_id,'extra_payment_requested',
    `Manual extra principal payment of £${amount.toFixed(2)} recorded`,
    'staff',req.auth.email,
    JSON.stringify({paymentRequestId:requestId,amount,maxExtra,currentInstalmentRemaining:currentRemaining,source:'office_manual'}),
    now
   );

   ledger(plan.driver_id,'payment_received','debit',amount,0,'Manual extra payment received',requestId,'paid');
   notify(plan.driver_id,'Payment received',`We have received your extra payment of £${amount.toFixed(2)}.`,'success',requestId);

   const paidRequest=db.prepare(`SELECT * FROM payment_requests WHERE id=?`).get(requestId);
   const progression=applyPaymentPlanExtraPayment(paidRequest,now,{actorId:req.auth.email,actorType:'staff'});

   audit(req,'staff',req.auth.email,'payment_plan_manual_extra_payment_applied','driver_payment_plan',plan.id,{
    paymentRequestId:requestId,amount,maxExtra,currentInstalmentRemaining:currentRemaining,
    remainingAmount:progression?.remainingAmount,autocabAdjusted:false
   });

   const updated=db.prepare(`SELECT * FROM driver_payment_plans WHERE id=?`).get(plan.id);
   res.json({ok:true,paymentRequestId:requestId,maxExtra,progression,plan:serializePaymentPlan(updated,{instalments:true,events:true})});
  }catch(e){
   res.status(409).json({error:e.message});
  }
 }
);


app.post(
 '/api/admin/payment-plans',
 adminAuth,
 requireStaffRole('administrator','finance'),
 (req,res)=>{
  try{
   const paymentRequestId=
    String(req.body.paymentRequestId||'').trim();

   const frequency=
    String(req.body.frequency||'weekly').trim();

   const instalmentAmount=
    Number(req.body.instalmentAmount||0);

   const startDate=
    paymentPlanDateOnly(req.body.startDate);

   const notes=
    String(req.body.notes||'').trim();

   if(!paymentRequestId){
    return res.status(400).json({
     error:'Payment request is required'
    });
   }

   if(!['weekly','fortnightly','monthly'].includes(frequency)){
    return res.status(400).json({
     error:'Frequency must be weekly, fortnightly or monthly'
    });
   }

   if(!Number.isFinite(instalmentAmount) || instalmentAmount<=0){
    return res.status(400).json({
     error:'Instalment amount must be greater than zero'
    });
   }

   if(!startDate){
    return res.status(400).json({
     error:'A valid start date is required'
    });
   }

   const source=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(paymentRequestId);

   if(!source){
    return res.status(404).json({
     error:'Outstanding payment request not found'
    });
   }

   if(source.status!=='open'){
    return res.status(409).json({
     error:`Only open outstanding balances can be placed on a payment plan. Current status: ${source.status}`
    });
   }

   const originalAmount=
    Number(Number(source.amount||0).toFixed(2));

   if(
    !Number.isFinite(originalAmount) ||
    originalAmount<=0
   ){
    return res.status(400).json({
     error:'Outstanding balance has no valid amount'
    });
   }

   if(instalmentAmount>originalAmount){
    return res.status(400).json({
     error:'Instalment amount cannot exceed the outstanding balance'
    });
   }

   const existing=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE source_payment_request_id=?
      AND status IN ('draft','active','paused','defaulted')
    LIMIT 1
   `).get(paymentRequestId);

   if(existing){
    return res.status(409).json({
     error:'This outstanding balance already has a payment plan',
     plan:serializePaymentPlan(
      existing,
      {instalments:true,events:false}
     )
    });
   }

   const schedule=[];
   let remaining=originalAmount;
   let number=1;

   while(remaining>0.00001){
    if(number>104){
     return res.status(400).json({
      error:'This payment plan would exceed 104 instalments. Increase the instalment amount.'
     });
    }

    const amount=
     Number(
      Math.min(instalmentAmount,remaining).toFixed(2)
     );

    schedule.push({
     instalmentNumber:number,
     amount,
     dueAt:paymentPlanAddDate(
      startDate,
      number-1,
      frequency
     )
    });

    remaining=
     Number((remaining-amount).toFixed(2));

    number++;
   }

   const planId=id('plan');
   const now=new Date().toISOString();

   db.exec('BEGIN IMMEDIATE');

   try{
    db.prepare(`
     INSERT INTO driver_payment_plans(
      id,
      driver_id,
      callsign,
      driver_name,
      source_payment_request_id,
      original_amount,
      plan_amount,
      paid_amount,
      remaining_amount,
      frequency,
      instalment_amount,
      start_date,
      next_due_at,
      status,
      notes,
      created_by,
      created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
     planId,
     source.driver_id,
     source.callsign,
     source.driver_name,
     source.id,
     originalAmount,
     originalAmount,
     0,
     originalAmount,
     frequency,
     Number(instalmentAmount.toFixed(2)),
     startDate,
     schedule[0]?.dueAt||null,
     'draft',
     notes,
     req.auth.email,
     now
    );

    const insertInstalment=db.prepare(`
     INSERT INTO driver_payment_plan_instalments(
      id,
      plan_id,
      driver_id,
      callsign,
      instalment_number,
      amount,
      due_at,
      status,
      created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `);

    for(const item of schedule){
     insertInstalment.run(
      id('instalment'),
      planId,
      source.driver_id,
      source.callsign,
      item.instalmentNumber,
      item.amount,
      item.dueAt,
      'scheduled',
      now
     );
    }

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,
      plan_id,
      driver_id,
      event_type,
      description,
      actor_type,
      actor_id,
      metadata_json,
      created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     planId,
     source.driver_id,
     'plan_created',
     'Payment plan draft created',
     'staff',
     req.auth.email,
     JSON.stringify({
      sourcePaymentRequestId:source.id,
      originalAmount,
      frequency,
      instalmentAmount:
       Number(instalmentAmount.toFixed(2)),
      instalments:schedule.length,
      startDate
     }),
     now
    );

    db.exec('COMMIT');
   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_created',
    'driver_payment_plan',
    planId,
    {
     driverId:source.driver_id,
     callsign:source.callsign,
     sourcePaymentRequestId:source.id,
     originalAmount,
     frequency,
     instalmentAmount:
      Number(instalmentAmount.toFixed(2)),
     instalments:schedule.length,
     startDate
    }
   );

   const created=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(planId);

   res.status(201).json({
    ok:true,
    plan:serializePaymentPlan(
     created,
     {instalments:true,events:true}
    )
   });

  }catch(e){
   res.status(500).json({
    error:e.message
   });
  }
 }
);


app.post(
 '/api/admin/payment-plans/:id/activate',
 adminAuth,
 requireStaffRole('administrator','finance'),
 async(req,res)=>{
  try{
   const plan=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(req.params.id);

   if(!plan){
    return res.status(404).json({
     error:'Payment plan not found'
    });
   }

   if(plan.status!=='draft'){
    return res.status(409).json({
     error:`Only draft plans can be activated. Current status: ${plan.status}`
    });
   }

   const source=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(plan.source_payment_request_id);

   if(!source){
    return res.status(404).json({
     error:'Original outstanding payment request could not be found'
    });
   }

   if(source.status!=='open'){
    return res.status(409).json({
     error:`The original outstanding request is no longer open. Current status: ${source.status}`
    });
   }

   const firstInstalment=db.prepare(`
    SELECT *
    FROM driver_payment_plan_instalments
    WHERE plan_id=?
      AND status='scheduled'
    ORDER BY instalment_number
    LIMIT 1
   `).get(plan.id);

   if(!firstInstalment){
    return res.status(400).json({
     error:'This payment plan has no scheduled instalments'
    });
   }

   /*
    * If the original full-balance demand already has a live Stripe
    * Checkout session, expire it before moving the debt onto the plan.
    * This prevents the driver paying both the full balance and an
    * instalment.
    */
   if(
    getStripeClient() &&
    source.provider==='stripe' &&
    source.provider_session_id
   ){
    try{
     const stripeSession=
      await getStripeClient().checkout.sessions.retrieve(
       source.provider_session_id
      );

     if(stripeSession?.status==='complete'){
      return res.status(409).json({
       error:
        'The existing full-balance Stripe payment has already completed. The payment plan has not been activated. Refresh FaivoPay and allow the Stripe payment confirmation to finish.'
      });
     }

     if(stripeSession?.status==='open'){
      await getStripeClient().checkout.sessions.expire(
       source.provider_session_id
      );
     }else if(stripeSession?.status!=='expired'){
      return res.status(409).json({
       error:
        `FaivoPay cannot safely activate this payment plan because the existing Stripe session is ${stripeSession?.status||'unknown'}.`
      });
     }
    }catch(e){
     return res.status(409).json({
      error:
       'FaivoPay could not safely close the existing full-balance Stripe payment link. The payment plan has not been activated.',
      detail:e.message
     });
    }
   }

   /*
    * Check again immediately before activation in case another action
    * changed the source request while Stripe was being checked.
    */
   const freshSource=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(source.id);

   if(!freshSource || freshSource.status!=='open'){
    return res.status(409).json({
     error:'The original outstanding request changed before activation. Refresh and try again.'
    });
   }

   /*
    * Move the complete plan debt out of Autocab before FaivoPay takes
    * ownership of it. Each adjustment uses an idempotent event key, so
    * retries cannot post the same activation movement twice.
    */
   try{
    await settlePaymentPlanActivationInAutocab(
     plan,
     freshSource
    );
   }catch(e){
    return res.status(409).json({
     error:
      'FaivoPay could not move this balance out of Autocab. The payment plan has not been activated.',
     detail:e.message
    });
   }

   const now=new Date().toISOString();
   const instalmentRequestId=id('request');

   db.exec('BEGIN IMMEDIATE');

   try{
    /*
     * Freeze the original full-balance demand.
     * It remains in the database for audit but can no longer be paid
     * through the normal checkout endpoint.
     */
    db.prepare(`
     UPDATE payment_requests
     SET status='on_plan',
         payment_url=NULL,
         provider_session_id=NULL,
         updated_at=?
     WHERE id=?
       AND status='open'
    `).run(
     now,
     freshSource.id
    );

    /*
     * Create the first real instalment as a normal payment_request.
     *
     * The original weekly fee and carried charges have already been
     * settled into Autocab during plan activation. From this point on,
     * the plan balance is owned by FaivoPay and instalment payments must
     * not create further Autocab fee/carried-charge movements.
     */
    db.prepare(`
     INSERT INTO payment_requests(
      id,
      run_id,
      driver_id,
      callsign,
      driver_name,
      balance,
      weekly_fee,
      carried_charges,
      amount,
      status,
      payment_url,
      created_at,
      updated_at,
      due_at,
      payment_plan_id,
      payment_plan_instalment_id,
      request_type
     )
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
     instalmentRequestId,
     freshSource.run_id,
     freshSource.driver_id,
     freshSource.callsign,
     freshSource.driver_name,
     freshSource.balance,
     0,
     0,
     Number(firstInstalment.amount||0),
     'open',
     null,
     now,
     now,
     firstInstalment.due_at,
     plan.id,
     firstInstalment.id,
     'payment_plan_instalment'
    );

    db.prepare(`
     UPDATE driver_payment_plan_instalments
     SET status='due',
         payment_request_id=?,
         updated_at=?
     WHERE id=?
    `).run(
     instalmentRequestId,
     now,
     firstInstalment.id
    );

    db.prepare(`
     UPDATE driver_payment_plans
     SET status='active',
         activated_at=?,
         next_due_at=?,
         updated_by=?,
         updated_at=?
     WHERE id=?
       AND status='draft'
    `).run(
     now,
     firstInstalment.due_at,
     req.auth.email,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,
      plan_id,
      driver_id,
      event_type,
      description,
      actor_type,
      actor_id,
      metadata_json,
      created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'plan_activated',
     'Payment plan activated',
     'staff',
     req.auth.email,
     JSON.stringify({
      sourcePaymentRequestId:freshSource.id,
      firstInstalmentId:firstInstalment.id,
      firstPaymentRequestId:instalmentRequestId,
      firstAmount:Number(firstInstalment.amount||0),
      firstDueAt:firstInstalment.due_at
     }),
     now
    );

    db.exec('COMMIT');

   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   notify(
    plan.driver_id,
    'Payment plan active',
    `Your FaivoPay payment plan is now active. Your first payment of £${Number(firstInstalment.amount||0).toFixed(2)} is due ${firstInstalment.due_at}.`,
    'info',
    plan.id
   );

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_activated',
    'driver_payment_plan',
    plan.id,
    {
     driverId:plan.driver_id,
     callsign:plan.callsign,
     sourcePaymentRequestId:freshSource.id,
     firstInstalmentId:firstInstalment.id,
     firstPaymentRequestId:instalmentRequestId,
     amount:Number(firstInstalment.amount||0),
     dueAt:firstInstalment.due_at
    }
   );

   const activated=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(plan.id);

   res.json({
    ok:true,
    plan:serializePaymentPlan(
     activated,
     {instalments:true,events:true}
    )
   });

  }catch(e){
   res.status(500).json({
    error:e.message
   });
  }
 }
);



async function safelyExpirePlanPaymentSession(item){
 if(!item?.provider_session_id)return;

 if(item.provider && item.provider!=='stripe')return;

 if(!getStripeClient()){
  throw new Error(
   'FaivoPay cannot safely change this plan because an existing Stripe payment link is present but Stripe is not configured.'
  );
 }

 const session=await getStripeClient().checkout.sessions.retrieve(
  item.provider_session_id
 );

 if(session?.status==='complete'){
  throw new Error(
   'This payment has already completed at Stripe. Refresh FaivoPay and allow the payment confirmation to finish before changing the plan.'
  );
 }

 if(session?.status==='open'){
  await getStripeClient().checkout.sessions.expire(
   item.provider_session_id
  );
 }
}


/* ============================================================
   PAYMENT PLAN — PAUSE
   ============================================================ */

app.post(
 '/api/admin/payment-plans/:id/pause',
 adminAuth,
 requireStaffRole('administrator','finance'),
 async(req,res)=>{
  try{
   const reason=String(req.body.reason||'').trim();

   const plan=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(req.params.id);

   if(!plan){
    return res.status(404).json({
     error:'Payment plan not found'
    });
   }

   if(!['active','defaulted'].includes(plan.status)){
    return res.status(409).json({
     error:`Only active or defaulted plans can be paused. Current status: ${plan.status}`
    });
   }

   const current=db.prepare(`
    SELECT
     i.*,
     r.provider,
     r.provider_session_id,
     r.status payment_request_status
    FROM driver_payment_plan_instalments i
    LEFT JOIN payment_requests r
     ON r.id=i.payment_request_id
    WHERE i.plan_id=?
      AND i.status IN ('due','overdue')
    ORDER BY i.instalment_number
    LIMIT 1
   `).get(plan.id);

   if(current?.payment_request_id){
    const request=db.prepare(`
     SELECT *
     FROM payment_requests
     WHERE id=?
    `).get(current.payment_request_id);

    await safelyExpirePlanPaymentSession(request);
   }

   const now=new Date().toISOString();

   db.exec('BEGIN IMMEDIATE');

   try{
    if(current?.payment_request_id){
     db.prepare(`
      UPDATE payment_requests
      SET status='plan_paused',
          payment_url=NULL,
          provider_session_id=NULL,
          updated_at=?
      WHERE id=?
        AND status='open'
     `).run(
      now,
      current.payment_request_id
     );
    }

    db.prepare(`
     UPDATE driver_payment_plans
     SET status='paused',
         paused_at=?,
         pause_reason=?,
         updated_by=?,
         updated_at=?
     WHERE id=?
    `).run(
     now,
     reason||'Paused by Finance',
     req.auth.email,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,plan_id,driver_id,event_type,description,
      actor_type,actor_id,metadata_json,created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'plan_paused',
     'Payment plan paused',
     'staff',
     req.auth.email,
     JSON.stringify({
      reason:reason||null,
      instalmentId:current?.id||null,
      paymentRequestId:current?.payment_request_id||null
     }),
     now
    );

    db.exec('COMMIT');

   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   notify(
    plan.driver_id,
    'Payment plan paused',
    'Your FaivoPay payment plan has been paused. No plan payment is currently required while the arrangement is paused.',
    'info',
    plan.id
   );

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_paused',
    'driver_payment_plan',
    plan.id,
    {reason:reason||null}
   );

   const updated=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(plan.id);

   res.json({
    ok:true,
    plan:serializePaymentPlan(
     updated,
     {instalments:true,events:true}
    )
   });

  }catch(e){
   res.status(409).json({error:e.message});
  }
 }
);


/* ============================================================
   PAYMENT PLAN — RESUME
   ============================================================ */

app.post(
 '/api/admin/payment-plans/:id/resume',
 adminAuth,
 requireStaffRole('administrator','finance'),
 (req,res)=>{
  try{
   const plan=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(req.params.id);

   if(!plan){
    return res.status(404).json({
     error:'Payment plan not found'
    });
   }

   if(plan.status!=='paused'){
    return res.status(409).json({
     error:`Only paused plans can be resumed. Current status: ${plan.status}`
    });
   }

   const current=db.prepare(`
    SELECT *
    FROM driver_payment_plan_instalments
    WHERE plan_id=?
      AND status IN ('due','overdue')
    ORDER BY instalment_number
    LIMIT 1
   `).get(plan.id);

   const today=new Date().toISOString().slice(0,10);
   const now=new Date().toISOString();

   const overdue=Boolean(
    current &&
    (
     current.status==='overdue' ||
     String(current.due_at||'')<today
    )
   );

   const newStatus=overdue?'defaulted':'active';

   db.exec('BEGIN IMMEDIATE');

   try{
    if(current?.payment_request_id){
     db.prepare(`
      UPDATE payment_requests
      SET status='open',
          payment_url=NULL,
          provider_session_id=NULL,
          updated_at=?
      WHERE id=?
        AND status='plan_paused'
     `).run(
      now,
      current.payment_request_id
     );
    }

    db.prepare(`
     UPDATE driver_payment_plans
     SET status=?,
         paused_at=NULL,
         pause_reason=NULL,
         defaulted_at=CASE
          WHEN ?='defaulted'
           THEN COALESCE(defaulted_at,?)
          ELSE defaulted_at
         END,
         updated_by=?,
         updated_at=?
     WHERE id=?
    `).run(
     newStatus,
     newStatus,
     now,
     req.auth.email,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,plan_id,driver_id,event_type,description,
      actor_type,actor_id,metadata_json,created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'plan_resumed',
     overdue
      ?'Payment plan resumed with overdue instalment'
      :'Payment plan resumed',
     'staff',
     req.auth.email,
     JSON.stringify({
      status:newStatus,
      instalmentId:current?.id||null,
      paymentRequestId:current?.payment_request_id||null
     }),
     now
    );

    db.exec('COMMIT');

   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   notify(
    plan.driver_id,
    overdue
     ?'Payment plan resumed – payment overdue'
     :'Payment plan resumed',
    overdue
     ?'Your FaivoPay payment plan has been resumed. The current instalment is overdue and is available to pay now.'
     :'Your FaivoPay payment plan has been resumed.',
    overdue?'warning':'info',
    plan.id
   );

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_resumed',
    'driver_payment_plan',
    plan.id,
    {status:newStatus}
   );

   const updated=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(plan.id);

   res.json({
    ok:true,
    plan:serializePaymentPlan(
     updated,
     {instalments:true,events:true}
    )
   });

  }catch(e){
   res.status(500).json({error:e.message});
  }
 }
);


/* ============================================================
   PAYMENT PLAN — CANCEL
   Remaining debt returns to normal Outstanding.
   ============================================================ */

app.post(
 '/api/admin/payment-plans/:id/cancel',
 adminAuth,
 requireStaffRole('administrator','finance'),
 async(req,res)=>{
  try{
   const reason=String(req.body.reason||'').trim();

   if(!reason){
    return res.status(400).json({
     error:'Enter a reason for cancelling the payment plan'
    });
   }

   const plan=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(req.params.id);

   if(!plan){
    return res.status(404).json({
     error:'Payment plan not found'
    });
   }

   if(!['active','paused','defaulted','draft'].includes(plan.status)){
    return res.status(409).json({
     error:`This payment plan cannot be cancelled from status ${plan.status}`
    });
   }

   const remaining=Number(plan.remaining_amount||0);

   if(remaining<=0){
    return res.status(409).json({
     error:'This payment plan has no remaining balance'
    });
   }

   const source=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(plan.source_payment_request_id);

   if(!source){
    return res.status(404).json({
     error:'Original payment request could not be found'
    });
   }

   const current=db.prepare(`
    SELECT *
    FROM driver_payment_plan_instalments
    WHERE plan_id=?
      AND payment_request_id IS NOT NULL
      AND status IN ('due','overdue')
    ORDER BY instalment_number
    LIMIT 1
   `).get(plan.id);

   if(current?.payment_request_id){
    const request=db.prepare(`
     SELECT *
     FROM payment_requests
     WHERE id=?
    `).get(current.payment_request_id);

    await safelyExpirePlanPaymentSession(request);
   }

   /*
    * Once activated, the payment-plan debt is owned by FaivoPay rather
    * than Autocab. Cancelling the plan returns only the unpaid remainder
    * to the driver's Autocab account.
    *
    * Draft plans were never transferred out of Autocab, so cancelling a
    * draft must not create an Autocab adjustment.
    */
   if(plan.status!=='draft'){
    try{
     await postAutocabAdjustmentSafelyOnce({
      driverId:plan.driver_id,
      callsign:plan.callsign||source.callsign||String(plan.driver_id),
      amount:remaining,
      isCredit:false,
      description:'FaivoPay payment plan cancelled',
      adjustmentReason:'FleetPay Payment Plan',
      eventKey:`plan:${plan.id}:cancel:return`
     });
    }catch(e){
     return res.status(409).json({
      error:
       'FaivoPay could not return the remaining payment-plan balance to Autocab. The plan has not been cancelled.',
      detail:e.message
     });
    }
   }

   const now=new Date().toISOString();

   db.exec('BEGIN IMMEDIATE');

   try{
    /*
     * Cancel all unpaid plan instalments and their payable request.
     */
    db.prepare(`
     UPDATE driver_payment_plan_instalments
     SET status='cancelled',
         updated_at=?
     WHERE plan_id=?
       AND status IN ('scheduled','due','overdue')
    `).run(
     now,
     plan.id
    );

    db.prepare(`
     UPDATE payment_requests
     SET status='cancelled',
         payment_url=NULL,
         provider_session_id=NULL,
         updated_at=?
     WHERE payment_plan_id=?
       AND status IN ('open','plan_paused')
    `).run(
     now,
     plan.id
    );

    /*
     * Reopen only the unpaid balance.
     *
     * Draft plans were never transferred out of Autocab, so their
     * original fee/carried-charge fields remain intact.
     *
     * Activated plans already settled those charges into Autocab during
     * activation, so they must not be charged again after cancellation.
     */
    db.prepare(`
     UPDATE payment_requests
     SET status='open',
         amount=?,
         weekly_fee=?,
         carried_charges=?,
         payment_url=NULL,
         provider=NULL,
         provider_session_id=NULL,
         provider_payment_intent_id=NULL,
         paid_at=NULL,
         updated_at=?
     WHERE id=?
    `).run(
     remaining,
     plan.status==='draft'
      ?Number(source.weekly_fee||0)
      :0,
     plan.status==='draft'
      ?Number(source.carried_charges||0)
      :0,
     now,
     source.id
    );

    db.prepare(`
     UPDATE driver_payment_plans
     SET status='cancelled',
         cancelled_at=?,
         cancellation_reason=?,
         next_due_at=NULL,
         updated_by=?,
         updated_at=?
     WHERE id=?
    `).run(
     now,
     reason,
     req.auth.email,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,plan_id,driver_id,event_type,description,
      actor_type,actor_id,metadata_json,created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'plan_cancelled',
     'Payment plan cancelled',
     'staff',
     req.auth.email,
     JSON.stringify({
      reason,
      remainingAmount:remaining,
      reopenedPaymentRequestId:source.id
     }),
     now
    );

    db.exec('COMMIT');

   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   notify(
    plan.driver_id,
    'Payment plan cancelled',
    `Your FaivoPay payment plan has been cancelled. The remaining balance of £${remaining.toFixed(2)} is now shown as an outstanding payment.`,
    'warning',
    source.id
   );

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_cancelled',
    'driver_payment_plan',
    plan.id,
    {
     reason,
     remainingAmount:remaining,
     paymentRequestId:source.id
    }
   );

   const updated=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(plan.id);

   res.json({
    ok:true,
    plan:serializePaymentPlan(
     updated,
     {instalments:true,events:true}
    ),
    reopenedPaymentRequestId:source.id
   });

  }catch(e){
   res.status(409).json({error:e.message});
  }
 }
);


/* ============================================================
   PAYMENT PLAN — SETTLE EARLY
   Makes the current payable request equal the full remainder.
   ============================================================ */

app.post(
 '/api/admin/payment-plans/:id/settle-early',
 adminAuth,
 requireStaffRole('administrator','finance'),
 async(req,res)=>{
  try{
   const plan=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(req.params.id);

   if(!plan){
    return res.status(404).json({
     error:'Payment plan not found'
    });
   }

   if(!['active','paused','defaulted'].includes(plan.status)){
    return res.status(409).json({
     error:`This payment plan cannot be settled early from status ${plan.status}`
    });
   }

   const remaining=Number(plan.remaining_amount||0);

   if(remaining<=0){
    return res.status(409).json({
     error:'This payment plan has no remaining balance'
    });
   }

   const source=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(plan.source_payment_request_id);

   if(!source){
    return res.status(404).json({
     error:'Original payment request could not be found'
    });
   }

   let current=db.prepare(`
    SELECT *
    FROM driver_payment_plan_instalments
    WHERE plan_id=?
      AND status IN ('due','overdue')
    ORDER BY instalment_number
    LIMIT 1
   `).get(plan.id);

   if(!current){
    current=db.prepare(`
     SELECT *
     FROM driver_payment_plan_instalments
     WHERE plan_id=?
       AND status='scheduled'
     ORDER BY instalment_number
     LIMIT 1
    `).get(plan.id);
   }

   if(!current){
    return res.status(409).json({
     error:'No unpaid payment-plan instalment could be found'
    });
   }

   let currentRequest=current.payment_request_id
    ?db.prepare(`
      SELECT *
      FROM payment_requests
      WHERE id=?
     `).get(current.payment_request_id)
    :null;

   /*
    * Idempotency:
    * If this plan has already been converted into one final settlement
    * request, return that existing request rather than rebuilding it,
    * sending another notification, or writing another settlement event.
    */
   const futureScheduledCount=Number(
    db.prepare(`
     SELECT COUNT(*) count
     FROM driver_payment_plan_instalments
     WHERE plan_id=?
       AND instalment_number>?
       AND status='scheduled'
    `).get(
     plan.id,
     current.instalment_number
    )?.count||0
   );

   const alreadyFinalSettlement=
    Boolean(currentRequest) &&
    ['open','plan_paused'].includes(currentRequest.status) &&
    Math.abs(Number(current.amount||0)-remaining)<0.00001 &&
    Math.abs(Number(currentRequest.amount||0)-remaining)<0.00001 &&
    futureScheduledCount===0;

   if(alreadyFinalSettlement){
    return res.json({
     ok:true,
     alreadySettled:true,
     plan:serializePaymentPlan(
      plan,
      {instalments:true,events:true}
     ),
     paymentRequestId:currentRequest.id
    });
   }

   if(currentRequest){
    await safelyExpirePlanPaymentSession(currentRequest);
   }

   const now=new Date().toISOString();
   const today=now.slice(0,10);

   let requestId=currentRequest?.id||id('request');

   db.exec('BEGIN IMMEDIATE');

   try{
    /*
     * Future instalments are no longer required.
     */
    db.prepare(`
     UPDATE driver_payment_plan_instalments
     SET status='cancelled',
         updated_at=?
     WHERE plan_id=?
       AND instalment_number>?
       AND status='scheduled'
    `).run(
     now,
     plan.id,
     current.instalment_number
    );

    /*
     * Current instalment becomes the settlement instalment.
     */
    db.prepare(`
     UPDATE driver_payment_plan_instalments
     SET amount=?,
         due_at=?,
         status='due',
         payment_request_id=?,
         payment_url=NULL,
         provider=NULL,
         provider_session_id=NULL,
         provider_payment_intent_id=NULL,
         updated_at=?
     WHERE id=?
    `).run(
     remaining,
     today,
     requestId,
     now,
     current.id
    );

    if(currentRequest){
     db.prepare(`
      UPDATE payment_requests
      SET amount=?,
          weekly_fee=0,
          carried_charges=0,
          status='open',
          due_at=?,
          payment_url=NULL,
          provider=NULL,
          provider_session_id=NULL,
          provider_payment_intent_id=NULL,
          updated_at=?
      WHERE id=?
     `).run(
      remaining,
      today,
      now,
      requestId
     );

    }else{
     /*
      * Normally the current instalment already has a payment request.
      * This fallback safely creates one if required.
      */
     db.prepare(`
      INSERT INTO payment_requests(
       id,
       run_id,
       driver_id,
       callsign,
       driver_name,
       balance,
       weekly_fee,
       carried_charges,
       amount,
       status,
       payment_url,
       created_at,
       updated_at,
       due_at,
       payment_plan_id,
       payment_plan_instalment_id,
       request_type
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     `).run(
      requestId,
      source.run_id,
      plan.driver_id,
      plan.callsign,
      plan.driver_name,
      -remaining,
      0,
      0,
      remaining,
      'open',
      null,
      now,
      now,
      today,
      plan.id,
      current.id,
      'payment_plan_instalment'
     );
    }

    db.prepare(`
     UPDATE driver_payment_plans
     SET status='active',
         next_due_at=?,
         paused_at=NULL,
         pause_reason=NULL,
         updated_by=?,
         updated_at=?
     WHERE id=?
    `).run(
     today,
     req.auth.email,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,plan_id,driver_id,event_type,description,
      actor_type,actor_id,metadata_json,created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'early_settlement_requested',
     'Early settlement requested',
     'staff',
     req.auth.email,
     JSON.stringify({
      remainingAmount:remaining,
      instalmentId:current.id,
      paymentRequestId:requestId
     }),
     now
    );

    db.exec('COMMIT');

   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   notify(
    plan.driver_id,
    'Payment plan – settle remaining balance',
    `Your remaining FaivoPay payment-plan balance of £${remaining.toFixed(2)} is now available to pay in full.`,
    'info',
    requestId
   );

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_early_settlement_requested',
    'driver_payment_plan',
    plan.id,
    {
     remainingAmount:remaining,
     paymentRequestId:requestId
    }
   );

   const updated=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(plan.id);

   res.json({
    ok:true,
    plan:serializePaymentPlan(
     updated,
     {instalments:true,events:true}
    ),
    paymentRequestId:requestId
   });

  }catch(e){
   res.status(409).json({error:e.message});
  }
 }
);


/*
 * ============================================================
 * PAYMENT PLAN AMENDMENT
 *
 * Draft:
 *   - Rebuild the complete proposed schedule.
 *
 * Paused:
 *   - Preserve paid instalments.
 *   - Replace only the unpaid remainder.
 *   - Keep the replacement current request paused until Resume.
 *
 * Active/defaulted plans must be paused before amendment so an
 * active Stripe obligation is never changed underneath a driver.
 * ============================================================
 */
app.post(
 '/api/admin/payment-plans/:id/amend',
 adminAuth,
 requireStaffRole('administrator','finance'),
 (req,res)=>{
  try{
   const plan=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(req.params.id);

   if(!plan){
    return res.status(404).json({
     error:'Payment plan not found'
    });
   }

   if(!['draft','paused'].includes(plan.status)){
    return res.status(409).json({
     error:
      'Only draft or paused payment plans can be amended. Pause an active plan first.'
    });
   }

   const frequency=
    String(req.body.frequency||plan.frequency||'weekly').trim();

   const instalmentAmount=
    Number(req.body.instalmentAmount||0);

   const startDate=
    paymentPlanDateOnly(req.body.startDate);

   const notes=
    req.body.notes===undefined
     ?String(plan.notes||'')
     :String(req.body.notes||'').trim();

   if(!['weekly','fortnightly','monthly'].includes(frequency)){
    return res.status(400).json({
     error:'Frequency must be weekly, fortnightly or monthly'
    });
   }

   if(
    !Number.isFinite(instalmentAmount) ||
    instalmentAmount<=0
   ){
    return res.status(400).json({
     error:'Instalment amount must be greater than zero'
    });
   }

   if(!startDate){
    return res.status(400).json({
     error:'A valid next payment date is required'
    });
   }

   const remaining=
    Number(
     (
      plan.status==='draft'
       ?Number(plan.plan_amount||0)
       :Number(plan.remaining_amount||0)
     ).toFixed(2)
    );

   if(!Number.isFinite(remaining) || remaining<=0){
    return res.status(409).json({
     error:'This payment plan has no remaining balance to amend'
    });
   }

   if(instalmentAmount>remaining){
    return res.status(400).json({
     error:'Instalment amount cannot exceed the remaining balance'
    });
   }

   const paidRows=db.prepare(`
    SELECT *
    FROM driver_payment_plan_instalments
    WHERE plan_id=?
      AND status='paid'
    ORDER BY instalment_number
   `).all(plan.id);

   const lastPaidNumber=
    paidRows.reduce(
     (max,row)=>Math.max(max,Number(row.instalment_number||0)),
     0
    );

   const schedule=[];
   let scheduleRemaining=remaining;
   let scheduleIndex=0;

   while(scheduleRemaining>0.00001){
    const instalmentNumber=
     lastPaidNumber+scheduleIndex+1;

    if(instalmentNumber>104){
     return res.status(400).json({
      error:
       'This amendment would exceed 104 total instalments. Increase the instalment amount.'
     });
    }

    const amount=
     Number(
      Math.min(
       instalmentAmount,
       scheduleRemaining
      ).toFixed(2)
     );

    schedule.push({
     instalmentNumber,
     amount,
     dueAt:paymentPlanAddDate(
      startDate,
      scheduleIndex,
      frequency
     )
    });

    scheduleRemaining=
     Number(
      (scheduleRemaining-amount).toFixed(2)
     );

    scheduleIndex++;
   }

   if(!schedule.length){
    return res.status(400).json({
     error:'Could not create amended payment schedule'
    });
   }

   const source=db.prepare(`
    SELECT *
    FROM payment_requests
    WHERE id=?
   `).get(plan.source_payment_request_id);

   if(!source){
    return res.status(404).json({
     error:'Original outstanding payment request could not be found'
    });
   }

   const now=new Date().toISOString();
   const today=now.slice(0,10);

   const previous={
    frequency:plan.frequency,
    instalmentAmount:Number(plan.instalment_amount||0),
    startDate:plan.start_date,
    nextDueAt:plan.next_due_at,
    remainingAmount:Number(plan.remaining_amount||0),
    status:plan.status
   };

   let replacementRequestId=null;

   db.exec('BEGIN IMMEDIATE');

   try{
    /*
     * Any unpaid requests belonging to a paused plan have already had
     * their Stripe session safely expired by the Pause workflow.
     * Retire those request rows before rebuilding the unpaid schedule.
     */
    if(plan.status==='paused'){
     db.prepare(`
      UPDATE payment_requests
      SET status='cancelled',
          payment_url=NULL,
          provider_session_id=NULL,
          payment_plan_instalment_id=NULL,
          updated_at=?
      WHERE payment_plan_id=?
        AND request_type='payment_plan_instalment'
        AND status IN ('plan_paused','open')
     `).run(
      now,
      plan.id
     );
    }

    db.prepare(`
     DELETE FROM driver_payment_plan_instalments
     WHERE plan_id=?
       AND status!='paid'
    `).run(plan.id);

    const insertInstalment=db.prepare(`
     INSERT INTO driver_payment_plan_instalments(
      id,
      plan_id,
      driver_id,
      callsign,
      instalment_number,
      amount,
      due_at,
      status,
      payment_request_id,
      created_at,
      updated_at
     )
     VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `);

    const inserted=[];

    for(let i=0;i<schedule.length;i++){
     const item=schedule[i];
     const instalmentId=id('instalment');

     let status='scheduled';

     /*
      * A paused plan still needs one identifiable current instalment
      * so Resume can reactivate the existing payment workflow.
      */
     if(plan.status==='paused' && i===0){
      status=
       item.dueAt<today
        ?'overdue'
        :'due';
     }

     insertInstalment.run(
      instalmentId,
      plan.id,
      plan.driver_id,
      plan.callsign,
      item.instalmentNumber,
      item.amount,
      item.dueAt,
      status,
      null,
      now,
      now
     );

     inserted.push({
      ...item,
      id:instalmentId,
      status
     });
    }

    /*
     * Draft plans have no live/current payment request.
     * Paused plans get a fresh paused request linked to the newly
     * amended first unpaid instalment.
     */
    if(plan.status==='paused'){
     const first=inserted[0];

     replacementRequestId=id('request');

     db.prepare(`
      INSERT INTO payment_requests(
       id,
       run_id,
       driver_id,
       callsign,
       driver_name,
       balance,
       weekly_fee,
       carried_charges,
       amount,
       status,
       payment_url,
       created_at,
       updated_at,
       due_at,
       payment_plan_id,
       payment_plan_instalment_id,
       request_type
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     `).run(
      replacementRequestId,
      source.run_id||null,
      plan.driver_id,
      plan.callsign,
      plan.driver_name,
      -remaining,
      0,
      0,
      Number(first.amount||0),
      'plan_paused',
      null,
      now,
      now,
      first.dueAt,
      plan.id,
      first.id,
      'payment_plan_instalment'
     );

     db.prepare(`
      UPDATE driver_payment_plan_instalments
      SET payment_request_id=?,
          updated_at=?
      WHERE id=?
     `).run(
      replacementRequestId,
      now,
      first.id
     );
    }

    db.prepare(`
     UPDATE driver_payment_plans
     SET frequency=?,
         instalment_amount=?,
         start_date=?,
         next_due_at=?,
         notes=?,
         updated_by=?,
         updated_at=?
     WHERE id=?
    `).run(
     frequency,
     Number(instalmentAmount.toFixed(2)),
     startDate,
     schedule[0].dueAt,
     notes,
     req.auth.email,
     now,
     plan.id
    );

    db.prepare(`
     INSERT INTO driver_payment_plan_events(
      id,
      plan_id,
      driver_id,
      event_type,
      description,
      actor_type,
      actor_id,
      metadata_json,
      created_at
     )
     VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
     id('planevent'),
     plan.id,
     plan.driver_id,
     'plan_amended',
     plan.status==='draft'
      ?'Draft payment plan amended'
      :'Paused payment plan amended',
     'staff',
     req.auth.email,
     JSON.stringify({
      previous,
      amended:{
       frequency,
       instalmentAmount:Number(instalmentAmount.toFixed(2)),
       startDate,
       nextDueAt:schedule[0].dueAt,
       remainingAmount:remaining,
       instalments:schedule.length,
       replacementRequestId
      }
     }),
     now
    );

    db.exec('COMMIT');

   }catch(e){
    try{db.exec('ROLLBACK')}catch{}
    throw e;
   }

   if(plan.status==='paused'){
    notify(
     plan.driver_id,
     'Payment plan amended',
     `Your payment plan has been amended. Remaining balance £${remaining.toFixed(2)}. New instalment £${Number(instalmentAmount).toFixed(2)} ${frequency}. Next payment date ${startDate}. The plan remains paused until FaivoPay resumes it.`,
     'info',
     plan.id
    );
   }

   audit(
    req,
    'staff',
    req.auth.email,
    'payment_plan_amended',
    'driver_payment_plan',
    plan.id,
    {
     callsign:plan.callsign,
     previous,
     frequency,
     instalmentAmount:Number(instalmentAmount.toFixed(2)),
     startDate,
     remainingAmount:remaining,
     instalments:schedule.length,
     status:plan.status
    }
   );

   const updated=db.prepare(`
    SELECT *
    FROM driver_payment_plans
    WHERE id=?
   `).get(plan.id);

   res.json({
    ok:true,
    plan:serializePaymentPlan(
     updated,
     {instalments:true,events:true}
    )
   });

  }catch(e){
   res.status(500).json({
    error:e.message
   });
  }
 }
);


app.get('/api/admin/outstanding-payments',adminAuth,(req,res)=>{refreshPaymentPlanStatuses();const now=new Date().toISOString().slice(0,16),rows=db.prepare("SELECT *,driver_id driverId,driver_name driverName,weekly_fee weeklyFee,carried_charges carriedCharges,payment_url paymentUrl,created_at createdAt,updated_at updatedAt,paid_at paidAt,due_at dueAt,email_sent_at emailSentAt,sms_sent_at smsSentAt,communication_error communicationError FROM payment_requests ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,created_at DESC").all().map(x=>({...x,overdue:x.status==='open'&&x.dueAt&&String(x.dueAt).slice(0,16)<now}));res.json({payments:rows})});
app.post('/api/admin/outstanding-payments/:id/resend',adminAuth,requireStaffRole('administrator','finance','office'),async(req,res)=>{try{const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payment request not found'});const d=cachedDriver(item.driver_id);const out=await sendOutstandingCommunications(item,d);audit(req,'staff',req.auth.email,'outstanding_message_resent','payment_request',item.id,{callsign:item.callsign});res.json({ok:true,...out})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/admin/fees',adminAuth,(req,res)=>{
 const rawRows=db.prepare(`
  SELECT
   fl.*,
   fl.fee_type feeType,
   fl.source_type sourceType,
   fl.source_id sourceId,
   fl.driver_id driverId,
   fl.gross_fee grossFee,
   fl.fleetpay_share fleetpayShare,
   fl.taxi_company_share taxiCompanyShare,
   fl.invoice_ref invoiceRef,
   fl.created_at createdAt,
   fl.invoiced_at invoicedAt,
   cp.fare_amount customerFareAmount,
   cp.fee_amount customerFeeAmount,
   cp.total_amount customerTotalAmount,
   cp.refunded_amount customerRefundedAmount
  FROM fee_ledger fl
  LEFT JOIN customer_payments cp
   ON fl.fee_type='customer_payment'
   AND fl.source_type='customer_payment'
   AND cp.id=fl.source_id
  ORDER BY fl.created_at DESC
  LIMIT 3000
 `).all();

 const rows=rawRows.map(x=>{
  const originalGross=Number(x.grossFee||0);
  const originalFleet=Number(x.fleetpayShare||0);
  const originalTaxi=Number(x.taxiCompanyShare||0);

  let gross=originalGross;
  let fleet=originalFleet;
  let taxi=originalTaxi;

  if(
   x.status==='uninvoiced' &&
   x.feeType==='customer_payment' &&
   x.sourceType==='customer_payment' &&
   x.customerTotalAmount!==null
  ){
   const net=customerPaymentNetAmounts({
    fare_amount:x.customerFareAmount,
    fee_amount:x.customerFeeAmount,
    total_amount:x.customerTotalAmount,
    refunded_amount:x.customerRefundedAmount
   });

   gross=Math.min(originalGross,net.netFee);

   const fleetRatio=
    originalGross>0
     ? originalFleet/originalGross
     : 0;

   fleet=Number((gross*fleetRatio).toFixed(2));
   taxi=Number((gross-fleet).toFixed(2));
  }

  return {
   ...x,
   originalGrossFee:originalGross,
   originalFleetpayShare:originalFleet,
   originalTaxiCompanyShare:originalTaxi,
   grossFee:Number(gross.toFixed(2)),
   fleetpayShare:Number(fleet.toFixed(2)),
   taxiCompanyShare:Number(taxi.toFixed(2)),
   refundAdjusted:
    x.status==='uninvoiced' &&
    Number(gross.toFixed(2))!==Number(originalGross.toFixed(2))
  };
 });

 const summary=rows.reduce((a,x)=>{
  a.gross+=Number(x.grossFee||0);
  a.fleetpay+=Number(x.fleetpayShare||0);
  a.taxi+=Number(x.taxiCompanyShare||0);

  if(x.status==='uninvoiced'){
   a.uninvoiced+=Number(x.fleetpayShare||0);
   a.uninvoicedGross+=Number(x.grossFee||0);
  }

  return a;
 },{
  gross:0,
  fleetpay:0,
  taxi:0,
  uninvoiced:0,
  uninvoicedGross:0
 });

 for(const key of Object.keys(summary)){
  summary[key]=Number(summary[key].toFixed(2));
 }

 res.json({fees:rows,summary});
});
app.post('/api/admin/fees/mark-invoiced',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const invoiceRef=String(req.body.invoiceRef||'').trim();if(!invoiceRef)return res.status(400).json({error:'Invoice reference is required'});const ids=Array.isArray(req.body.ids)?req.body.ids.filter(Boolean):[];const now=new Date().toISOString();let info;if(ids.length){const placeholders=ids.map(()=>'?').join(',');info=db.prepare(`UPDATE fee_ledger SET status='invoiced',invoice_ref=?,invoiced_at=? WHERE id IN (${placeholders}) AND status='uninvoiced'`).run(invoiceRef,now,...ids)}else info=db.prepare("UPDATE fee_ledger SET status='invoiced',invoice_ref=?,invoiced_at=? WHERE status='uninvoiced'").run(invoiceRef,now);audit(req,'staff',req.auth.email,'fees_marked_invoiced','fee_ledger',invoiceRef,{count:Number(info.changes||0)});res.json({ok:true,count:Number(info.changes||0)})});
app.get('/api/admin/fees/csv',adminAuth,(req,res)=>{
 const status=String(req.query.status||'all');

 const rawRows=db.prepare(`
  SELECT
   fl.*,
   cp.fare_amount customerFareAmount,
   cp.fee_amount customerFeeAmount,
   cp.total_amount customerTotalAmount,
   cp.refunded_amount customerRefundedAmount
  FROM fee_ledger fl
  LEFT JOIN customer_payments cp
   ON fl.fee_type='customer_payment'
   AND fl.source_type='customer_payment'
   AND cp.id=fl.source_id
  ${status==='uninvoiced'?"WHERE fl.status='uninvoiced'":''}
  ORDER BY fl.created_at
 `).all();

 const rows=rawRows.map(x=>{
  let gross=Number(x.gross_fee||0);
  let fleet=Number(x.fleetpay_share||0);
  let taxi=Number(x.taxi_company_share||0);

  if(
   x.status==='uninvoiced' &&
   x.fee_type==='customer_payment' &&
   x.source_type==='customer_payment' &&
   x.customerTotalAmount!==null
  ){
   const net=customerPaymentNetAmounts({
    fare_amount:x.customerFareAmount,
    fee_amount:x.customerFeeAmount,
    total_amount:x.customerTotalAmount,
    refunded_amount:x.customerRefundedAmount
   });

   const originalGross=gross;
   gross=Math.min(originalGross,net.netFee);

   const fleetRatio=
    originalGross>0
     ? fleet/originalGross
     : 0;

   fleet=Number((gross*fleetRatio).toFixed(2));
   taxi=Number((gross-fleet).toFixed(2));
  }

  return {
   ...x,
   effectiveGrossFee:gross,
   effectiveFleetpayShare:fleet,
   effectiveTaxiCompanyShare:taxi
  };
 });

 const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;

 const csv=[
  'Date,Fee Type,Callsign,Description,Gross Fee,FaivoPay Share,Taxi Company Share,Status,Invoice Ref',
  ...rows.map(x=>[
   esc(x.created_at),
   esc(x.fee_type),
   esc(x.callsign),
   esc(x.description),
   Number(x.effectiveGrossFee).toFixed(2),
   Number(x.effectiveFleetpayShare).toFixed(2),
   Number(x.effectiveTaxiCompanyShare).toFixed(2),
   esc(x.status),
   esc(x.invoice_ref)
  ].join(','))
 ].join('\n');

 res.setHeader('Content-Type','text/csv');
 res.setHeader(
  'Content-Disposition',
  'attachment; filename=FaivoPay-fees.csv'
 );
 res.send(csv);
});

async function sendEarlyPayoutOfficeSummary({force=false}={}){
 const settings=getSettings(),now=londonWindow(),cut=cutoffParts(settings);if(!force){if(!['Tue','Wed','Thu','Fri'].includes(now.weekday))return {skipped:true,reason:'not_request_day'};if(now.hour<cut.hour||(now.hour===cut.hour&&now.minute<cut.minute))return {skipped:true,reason:'before_cutoff'};const prior=db.prepare("SELECT * FROM early_summary_notifications WHERE run_date=?").get(now.date);if(prior?.status==='sent')return {skipped:true,reason:'already_sent'};if(prior?.status==='failed'&&prior.sent_at&&Date.now()-new Date(prior.sent_at).getTime()<15*60000)return {skipped:true,reason:'retry_cooldown'}}const to=safeEmail(settings.officeNotificationEmail);if(!to)throw new Error('Office notification email is not configured');const rows=db.prepare("SELECT * FROM payouts WHERE type='early' AND eligible_run_date=? AND status!='declined' ORDER BY CAST(callsign AS INTEGER),callsign").all(now.date),count=rows.length,total=rows.reduce((a,x)=>a+Number(x.net_amount||x.amount||0),0),has=count>0,color=has?'#d97706':'#16a34a',title=has?'Early payouts require action':'No early payouts today',summary=has?`${count} early payout request${count===1?'':'s'} due today · £${total.toFixed(2)} total`:`No early payout requests were received before today's ${cut.label} cutoff.`,list=has?`<table style="width:100%;border-collapse:collapse;margin-top:18px">${rows.map(x=>`<tr><td style="padding:9px;border-bottom:1px solid #e5e7eb">${x.callsign}</td><td style="padding:9px;border-bottom:1px solid #e5e7eb">${x.driver_name||''}</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;text-align:right"><b>£${Number(x.net_amount||x.amount||0).toFixed(2)}</b></td></tr>`).join('')}</table>`:'';const html=`<div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:24px"><div style="max-width:680px;margin:auto;background:#fff;border-radius:14px;overflow:hidden"><div style="background:${color};color:#fff;padding:24px"><div style="font-size:13px;font-weight:700;letter-spacing:.08em">FAIVOPAY OFFICE</div><h2 style="margin:8px 0 0">${title}</h2></div><div style="padding:24px"><p style="font-size:17px">${summary}</p>${list}</div></div></div>`;try{const out=await sendEmail(to,`FaivoPay early payout summary – ${now.date}`,html);if(!out.sent)throw new Error('No email provider is configured');db.prepare("INSERT INTO early_summary_notifications(run_date,request_count,total_amount,sent_at,status,error) VALUES(?,?,?,?,?,NULL) ON CONFLICT(run_date) DO UPDATE SET request_count=excluded.request_count,total_amount=excluded.total_amount,sent_at=excluded.sent_at,status=excluded.status,error=NULL").run(now.date,count,total,new Date().toISOString(),'sent');logCommunication({channel:'email',recipient:to,templateKey:'early_payout_summary',entityType:'payout_run',entityId:now.date,status:'sent',providerRef:out.id||out.provider||''});return {sent:true,count,total,to}}catch(e){db.prepare("INSERT INTO early_summary_notifications(run_date,request_count,total_amount,sent_at,status,error) VALUES(?,?,?,?,?,?) ON CONFLICT(run_date) DO UPDATE SET request_count=excluded.request_count,total_amount=excluded.total_amount,sent_at=excluded.sent_at,status=excluded.status,error=excluded.error").run(now.date,count,total,new Date().toISOString(),'failed',e.message);logCommunication({channel:'email',recipient:to,templateKey:'early_payout_summary',entityType:'payout_run',entityId:now.date,status:'failed',error:e.message});throw e}
}
app.get('/api/admin/early-summary',adminAuth,(req,res)=>{const now=londonWindow(),row=db.prepare('SELECT * FROM early_summary_notifications WHERE run_date=?').get(now.date),requests=db.prepare("SELECT *,driver_id driverId,driver_name driverName,gross_amount grossAmount,net_amount netAmount,eligible_run_date eligibleRunDate,submitted_after_cutoff submittedAfterCutoff FROM payouts WHERE type='early' AND eligible_run_date=? ORDER BY created_at DESC").all(now.date);res.json({today:now.date,cutoff:cutoffParts(getSettings()).label,summary:row||null,requests})});
app.post('/api/admin/early-summary/send',adminAuth,requireStaffRole('administrator','finance'),async(req,res)=>{try{const out=await sendEarlyPayoutOfficeSummary({force:true});audit(req,'staff',req.auth.email,'early_summary_sent','communications','early_summary',out);res.json({ok:true,...out})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/communications-log',adminAuth,(req,res)=>res.json({messages:db.prepare('SELECT * FROM communications_log ORDER BY created_at DESC LIMIT 500').all()}));

/* =========================
   FaivoPay Office V2.1 Demo Lab + launch reset
   Demo state is isolated from all live payout/Autocab tables.
   ========================= */
function demoStamp(){return new Date().toISOString()}
function demoRunId(prefix){const d=new Date();return `${prefix}-${d.toISOString().slice(0,10).replaceAll('-','')}-01`}
function freshDemoState(){
 const now=demoStamp();
 return {
  updatedAt:now,
  monday:{
   stage:'rentsheets',status:'awaiting_rentsheets',syncAt:null,locked:false,runId:null,reference:null,wiseAccount:{name:'FaivoPay Demo GBP',sortCode:'12-34-56',accountNumber:'12345678'},startingWiseBalance:50,wiseBalance:50,fundingRequired:0,topUpRequired:0,fundingTransferSentAt:null,fundingTransferAmount:0,fundsReceivedAt:null,releasedAt:null,reconciledAt:null,
   items:[
    {id:'dm101',callsign:'101',driverName:'James Carter',previousBalance:126.42,weeklyFee:2.50,amount:123.92,status:'pending',wiseStatus:'not_sent',autocabStatus:'not_posted'},
    {id:'dm114',callsign:'114',driverName:'Sarah Wilson',previousBalance:84.10,weeklyFee:2.50,amount:81.60,status:'pending',wiseStatus:'not_sent',autocabStatus:'not_posted'},
    {id:'dm207',callsign:'207',driverName:'David Smith',previousBalance:-32.50,weeklyFee:2.50,amount:0,status:'collection',wiseStatus:'not_applicable',autocabStatus:'not_applicable'},
    {id:'dm245',callsign:'245',driverName:'Emma Jones',previousBalance:61.75,weeklyFee:2.50,amount:59.25,status:'pending',wiseStatus:'not_sent',autocabStatus:'not_posted'},
    {id:'dm301',callsign:'301',driverName:'Michael Brown',previousBalance:-12.30,weeklyFee:2.50,amount:0,status:'collection',wiseStatus:'not_applicable',autocabStatus:'not_applicable'}
   ]
  },
  early:{
   stage:'balance',status:'awaiting_balance_sync',locked:false,runId:null,reference:null,wiseAccount:{name:'FaivoPay Demo GBP',sortCode:'12-34-56',accountNumber:'12345678'},startingWiseBalance:100,wiseBalance:100,fundingRequired:0,topUpRequired:0,fundingTransferSentAt:null,fundingTransferAmount:0,fundsReceivedAt:null,releasedAt:null,reconciledAt:null,
   items:[
    {id:'de401',callsign:'401',driverName:'Olivia Taylor',grossAmount:150,fee:2.50,netAmount:147.50,status:'requested',wiseStatus:'not_sent',autocabStatus:'not_posted'},
    {id:'de417',callsign:'417',driverName:'Noah Evans',grossAmount:95,fee:2.50,netAmount:92.50,status:'requested',wiseStatus:'not_sent',autocabStatus:'not_posted'},
    {id:'de422',callsign:'422',driverName:'Amelia Green',grossAmount:210,fee:2.50,netAmount:207.50,status:'approved',wiseStatus:'not_sent',autocabStatus:'not_posted'}
   ]
  },
  paymentPlan:{
   schemaVersion:2,
   stage:'draft',
   status:'draft',
   locked:false,
   planId:'DPP-001',
   callsign:'550',
   driverName:'Demo Driver',
   originalDebt:500,
   planAmount:500,
   remainingAmount:500,
   paidAmount:0,
   instalmentAmount:50,
   frequency:'weekly',
   startDate:new Date().toISOString().slice(0,10),
   instalmentsTotal:10,
   instalmentsPaid:0,
   nextDueAmount:50,
   nextDueDate:new Date().toISOString().slice(0,10),

   sourceRequest:{
    id:'DREQ-001',
    amount:500,
    status:'open',
    paymentUrl:'demo://full-balance',
    provider:'demo',
    note:'Demo-only source outstanding balance.'
   },

   currentPaymentRequest:null,

   instalments:Array.from({length:10},(_,i)=>({
    id:`DINST-${String(i+1).padStart(3,'0')}`,
    instalmentNumber:i+1,
    amount:50,
    paidAmount:0,
    dueAt:paymentPlanAddDate(
     new Date().toISOString().slice(0,10),
     i,
     'weekly'
    ),
    status:'scheduled',
    paymentRequestId:null,
    paidAt:null
   })),

   autocab:{
    balanceBefore:500,
    balanceAfter:500,
    transferred:false,
    note:'Demo simulation only — no Autocab request is made.'
   },

   paused:false,
   defaulted:false,
   completed:false,
   cancelled:false,
   activatedAt:null,
   pausedAt:null,
   resumedAt:null,
   completedAt:null,
   cancelledAt:null,

   communications:[],

   events:[
    {
     type:'plan_created',
     amount:500,
     at:now,
     note:'Demo payment plan draft created — no live records changed.'
    }
   ]
  }
 };
}
function readDemoState(){
 const row=db.prepare("SELECT value_json FROM demo_state WHERE key='office_demo'").get();

 if(row){
  try{
   const x=JSON.parse(row.value_json);

   if(x?.monday?.stage&&x?.early?.stage){
    const fresh=freshDemoState();

    /*
     * Demo-only schema migration.
     * Preserve existing Monday/Early demo progress, but replace an older
     * payment-plan demo structure with the current isolated model.
     */
    const paymentPlanCurrent=
     x?.paymentPlan?.schemaVersion===2 &&
     x?.paymentPlan?.sourceRequest &&
     Array.isArray(x?.paymentPlan?.instalments) &&
     x?.paymentPlan?.autocab &&
     Array.isArray(x?.paymentPlan?.events) &&
     Array.isArray(x?.paymentPlan?.communications);

    if(!paymentPlanCurrent){
     x.paymentPlan=fresh.paymentPlan;
     writeDemoState(x);
    }

    return x;
   }
  }catch{}
 }

 const state=freshDemoState();
 writeDemoState(state);
 return state;
}

function writeDemoState(state){state.updatedAt=demoStamp();db.prepare("INSERT INTO demo_state(key,value_json,updated_at) VALUES('office_demo',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at").run(JSON.stringify(state),state.updatedAt);return state}
function demoApproved(run,isEarly=false){return run.items.filter(x=>x.status==='approved'||x.status==='paid').filter(x=>isEarly?Number(x.netAmount)>0:Number(x.amount)>0)}
function demoPending(run,isEarly=false){return run.items.filter(x=>isEarly?x.status==='requested':x.status==='pending')}
function demoTotal(run,isEarly=false){return demoApproved(run,isEarly).reduce((a,x)=>a+Number(isEarly?x.netAmount:x.amount||0),0)}
function demoFunding(run,isEarly=false){run.fundingRequired=Number(demoTotal(run,isEarly).toFixed(2));run.topUpRequired=Number(Math.max(0,run.fundingRequired-Number(run.wiseBalance||0)).toFixed(2));return run}
function demoPaidItem(x){x.wiseStatus='paid';x.autocabStatus='updated';x.paidAt=demoStamp();x.autocabAt=demoStamp();}
function demoCanReconcile(run,isEarly=false){const approved=demoApproved(run,isEarly);return approved.length>0&&approved.every(x=>x.wiseStatus==='paid'&&x.autocabStatus==='updated')}

app.get('/api/admin/demo',adminAuth,(req,res)=>res.json(readDemoState()));
app.post('/api/admin/demo/reset',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=writeDemoState(freshDemoState());audit(req,'staff',req.auth.email,'demo_data_reset','demo','office_demo');res.json(state)});

/* Demo payment plan: isolated state only — never writes live payment-plan or Autocab data */
app.post('/api/admin/demo/payment-plan/activate',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(p.status!=='draft'){
  return res.status(400).json({error:`Only a draft demo payment plan can be activated. Current status: ${p.status}`});
 }

 if(p.sourceRequest?.status!=='open'){
  return res.status(400).json({error:'The demo source outstanding balance is no longer open.'});
 }

 const first=p.instalments?.find(x=>x.status==='scheduled');

 if(!first){
  return res.status(400).json({error:'The demo payment plan has no scheduled instalment to activate.'});
 }

 const now=demoStamp();
 const requestId='DREQ-INST-001';

 /*
  * Simulate the production activation movement.
  * This changes demo_state only. No Autocab function is called.
  */
 p.autocab.balanceAfter=0;
 p.autocab.transferred=true;
 p.autocab.transferredAt=now;

 p.sourceRequest.status='on_plan';
 p.sourceRequest.paymentUrl=null;
 p.sourceRequest.provider=null;

 first.status='due';
 first.paymentRequestId=requestId;

 p.currentPaymentRequest={
  id:requestId,
  amount:Number(first.amount||0),
  status:'open',
  dueAt:first.dueAt,
  paymentPlanId:p.planId,
  instalmentId:first.id,
  requestType:'payment_plan_instalment',
  paymentUrl:null,
  provider:null
 };

 p.stage='active';
 p.status='active';
 p.activatedAt=now;
 p.nextDueAmount=Number(first.amount||0);
 p.nextDueDate=first.dueAt;
 p.paused=false;
 p.defaulted=false;
 p.completed=false;
 p.cancelled=false;

 p.events.push({
  type:'plan_activated',
  amount:Number(p.planAmount||0),
  at:now,
  note:`Demo payment plan activated. Instalment 1 of £${Number(first.amount||0).toFixed(2)} is now due.`
 });

 p.communications.push({
  type:'notification',
  title:'Payment plan active',
  message:`Your FaivoPay payment plan is now active. Your first payment of £${Number(first.amount||0).toFixed(2)} is due ${first.dueAt}.`,
  at:now
 });

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/pay-instalment',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(!['active','paused','defaulted'].includes(p.status)){
  return res.status(400).json({error:`The demo payment plan is not in a payable state. Current status: ${p.status}`});
 }

 const current=p.instalments?.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  return res.status(400).json({error:'No due demo payment-plan instalment could be found.'});
 }

 if(!p.currentPaymentRequest || p.currentPaymentRequest.instalmentId!==current.id){
  return res.status(400).json({error:'The current demo instalment does not have a matching payment request.'});
 }

 const scheduledAmount=Number(current.amount||0);
 const alreadyPaid=Number(current.paidAmount||0);
 const amount=Number(Math.max(0,scheduledAmount-alreadyPaid).toFixed(2));

 if(amount<=0){
  return res.status(400).json({error:'The current demo instalment has already been paid.'});
 }

 const now=demoStamp();

 current.paidAmount=scheduledAmount;
 current.status='paid';
 current.paidAt=now;

 p.currentPaymentRequest.status='paid';
 p.currentPaymentRequest.provider='demo_manual';
 p.currentPaymentRequest.paidAt=now;

 p.paidAmount=Number(
  Math.min(
   Number(p.planAmount||0),
   Number(p.paidAmount||0)+amount
  ).toFixed(2)
 );

 p.remainingAmount=Number(
  Math.max(
   0,
   Number(p.planAmount||0)-Number(p.paidAmount||0)
  ).toFixed(2)
 );

 p.instalmentsPaid=
  p.instalments.filter(x=>x.status==='paid').length;

 if(p.remainingAmount<=0.00001){
  p.remainingAmount=0;
  p.status='completed';
  p.stage='completed';
  p.completed=true;
  p.completedAt=now;
  p.nextDueAmount=0;
  p.nextDueDate=null;
  p.currentPaymentRequest=null;
  p.sourceRequest.status='paid';

  p.events.push({
   type:'plan_completed',
   amount,
   at:now,
   note:`Demo payment plan completed. £${Number(p.planAmount||0).toFixed(2)} paid in total.`
  });

  p.communications.push({
   type:'notification',
   title:'Payment plan completed',
   message:`Your FaivoPay payment plan has been completed. All £${Number(p.planAmount||0).toFixed(2)} has now been paid.`,
   at:now
  });

 }else{
  const next=p.instalments
   .filter(x=>x.status==='scheduled')
   .sort((a,b)=>a.instalmentNumber-b.instalmentNumber)[0];

  if(!next){
   p.status='defaulted';
   p.stage='defaulted';
   p.defaulted=true;
   p.nextDueAmount=0;
   p.nextDueDate=null;
   p.currentPaymentRequest=null;

   p.events.push({
    type:'schedule_exhausted',
    amount,
    at:now,
    note:`Demo payment received but £${p.remainingAmount.toFixed(2)} remains with no scheduled instalment.`
   });

   p.communications.push({
    type:'notification',
    title:'Payment plan requires review',
    message:`Your payment of £${amount.toFixed(2)} has been received. £${p.remainingAmount.toFixed(2)} remains on your payment plan, but there are no further scheduled instalments.`,
    at:now
   });

  }else{
   const requestId=`DREQ-INST-${String(next.instalmentNumber).padStart(3,'0')}`;

   next.status='due';
   next.paymentRequestId=requestId;

   p.status='active';
   p.stage='active';
   p.paused=false;
   p.defaulted=false;
   p.nextDueAmount=Number(next.amount||0);
   p.nextDueDate=next.dueAt;

   p.currentPaymentRequest={
    id:requestId,
    amount:Number(next.amount||0),
    status:'open',
    dueAt:next.dueAt,
    paymentPlanId:p.planId,
    instalmentId:next.id,
    requestType:'payment_plan_instalment',
    paymentUrl:null,
    provider:null
   };

   p.events.push({
    type:'instalment_paid',
    amount,
    at:now,
    note:`Demo instalment ${current.instalmentNumber} paid. £${p.remainingAmount.toFixed(2)} remains.`
   });

   p.communications.push({
    type:'notification',
    title:'Payment received',
    message:`Thank you. Your payment of £${amount.toFixed(2)} has been received. £${p.remainingAmount.toFixed(2)} remains on your payment plan. Your next payment of £${Number(next.amount||0).toFixed(2)} is due ${next.dueAt}.`,
    at:now
   });
  }
 }

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/monday-partial',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(!['active','defaulted'].includes(p.status)){
  return res.status(400).json({error:`Monday payment-plan allocation is unavailable while the demo plan is ${p.status}.`});
 }

 const current=p.instalments?.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  return res.status(400).json({error:'No due demo payment-plan instalment could be found.'});
 }

 if(!p.currentPaymentRequest || p.currentPaymentRequest.instalmentId!==current.id){
  return res.status(400).json({error:'The current demo instalment does not have a matching payment request.'});
 }

 const scheduledAmount=Number(current.amount||0);
 const alreadyPaid=Number(current.paidAmount||0);

 const instalmentRemaining=Number(
  Math.max(0,scheduledAmount-alreadyPaid).toFixed(2)
 );

 const planRemaining=Number(
  Math.max(0,Number(p.remainingAmount||0)).toFixed(2)
 );

 const requestedAmount=Number(req.body.amount||0);

 if(!Number.isFinite(requestedAmount) || requestedAmount<=0){
  return res.status(400).json({error:'Enter a positive demo Monday allocation amount.'});
 }

 const amount=Number(
  Math.min(
   requestedAmount,
   instalmentRemaining,
   planRemaining
  ).toFixed(2)
 );

 if(amount<=0.00001){
  return res.status(400).json({error:'No demo payment-plan balance remains to allocate.'});
 }

 if(amount+0.00001>=instalmentRemaining){
  return res.status(400).json({
   error:`This route is for partial Monday deductions only. The current instalment has £${instalmentRemaining.toFixed(2)} remaining.`
  });
 }

 const now=demoStamp();

 current.paidAmount=Number(
  (alreadyPaid+amount).toFixed(2)
 );

 p.paidAmount=Number(
  Math.min(
   Number(p.planAmount||0),
   Number(p.paidAmount||0)+amount
  ).toFixed(2)
 );

 p.remainingAmount=Number(
  Math.max(
   0,
   Number(p.planAmount||0)-Number(p.paidAmount||0)
  ).toFixed(2)
 );

 const remainingOnInstalment=Number(
  Math.max(
   0,
   scheduledAmount-Number(current.paidAmount||0)
  ).toFixed(2)
 );

 p.currentPaymentRequest.amount=remainingOnInstalment;
 p.currentPaymentRequest.status='open';
 p.currentPaymentRequest.provider=null;
 p.currentPaymentRequest.paymentUrl=null;

 p.nextDueAmount=remainingOnInstalment;
 p.nextDueDate=current.dueAt;

 p.events.push({
  type:'monday_partial_allocation',
  amount,
  at:now,
  note:`£${amount.toFixed(2)} applied from the demo Monday settlement. £${remainingOnInstalment.toFixed(2)} remains on instalment ${current.instalmentNumber}.`
 });

 p.communications.push({
  type:'notification',
  title:'Payment plan payment applied',
  message:`£${amount.toFixed(2)} from your Monday FaivoPay balance has been applied to your payment plan. £${remainingOnInstalment.toFixed(2)} remains due on this instalment.`,
  at:now
 });

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/monday-full',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(!['active','defaulted'].includes(p.status)){
  return res.status(400).json({error:`Monday payment-plan allocation is unavailable while the demo plan is ${p.status}.`});
 }

 const current=p.instalments?.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  return res.status(400).json({error:'No due demo payment-plan instalment could be found.'});
 }

 if(!p.currentPaymentRequest || p.currentPaymentRequest.instalmentId!==current.id){
  return res.status(400).json({error:'The current demo instalment does not have a matching payment request.'});
 }

 const scheduledAmount=Number(current.amount||0);
 const alreadyPaid=Number(current.paidAmount||0);

 const instalmentRemaining=Number(
  Math.max(0,scheduledAmount-alreadyPaid).toFixed(2)
 );

 const availableAmount=Number(req.body.amount||0);

 if(!Number.isFinite(availableAmount) || availableAmount<=0){
  return res.status(400).json({error:'Enter the positive demo Monday balance available for allocation.'});
 }

 if(availableAmount+0.00001<instalmentRemaining){
  return res.status(400).json({
   error:`The demo Monday balance only covers £${availableAmount.toFixed(2)} of the £${instalmentRemaining.toFixed(2)} remaining instalment. Use the partial allocation action instead.`
  });
 }

 const amount=Number(
  Math.min(
   instalmentRemaining,
   Number(p.remainingAmount||0)
  ).toFixed(2)
 );

 if(amount<=0.00001){
  return res.status(400).json({error:'No demo payment-plan balance remains to allocate.'});
 }

 const now=demoStamp();

 current.paidAmount=scheduledAmount;
 current.status='paid';
 current.paidAt=now;

 p.currentPaymentRequest.status='paid';
 p.currentPaymentRequest.provider='demo_monday_settlement';
 p.currentPaymentRequest.paidAt=now;
 p.currentPaymentRequest.paymentUrl=null;

 p.paidAmount=Number(
  Math.min(
   Number(p.planAmount||0),
   Number(p.paidAmount||0)+amount
  ).toFixed(2)
 );

 p.remainingAmount=Number(
  Math.max(
   0,
   Number(p.planAmount||0)-Number(p.paidAmount||0)
  ).toFixed(2)
 );

 p.instalmentsPaid=
  p.instalments.filter(x=>x.status==='paid').length;

 if(p.remainingAmount<=0.00001){
  p.remainingAmount=0;
  p.status='completed';
  p.stage='completed';
  p.completed=true;
  p.completedAt=now;
  p.nextDueAmount=0;
  p.nextDueDate=null;
  p.currentPaymentRequest=null;
  p.sourceRequest.status='paid';

  p.events.push({
   type:'plan_completed',
   amount,
   at:now,
   note:`Final £${amount.toFixed(2)} applied from the demo Monday settlement. Payment plan completed.`
  });

  p.communications.push({
   type:'notification',
   title:'Payment plan completed',
   message:`Your FaivoPay payment plan has been completed. All £${Number(p.planAmount||0).toFixed(2)} has now been paid.`,
   at:now
  });

 }else{
  const next=p.instalments
   .filter(x=>x.status==='scheduled')
   .sort((a,b)=>a.instalmentNumber-b.instalmentNumber)[0];

  if(!next){
   p.status='defaulted';
   p.stage='defaulted';
   p.defaulted=true;
   p.nextDueAmount=0;
   p.nextDueDate=null;
   p.currentPaymentRequest=null;

   p.events.push({
    type:'schedule_exhausted',
    amount,
    at:now,
    note:`Demo Monday allocation applied, but £${p.remainingAmount.toFixed(2)} remains with no scheduled instalment.`
   });

  }else{
   const requestId=`DREQ-INST-${String(next.instalmentNumber).padStart(3,'0')}`;

   next.status='due';
   next.paymentRequestId=requestId;

   p.status='active';
   p.stage='active';
   p.defaulted=false;
   p.nextDueAmount=Number(next.amount||0);
   p.nextDueDate=next.dueAt;

   p.currentPaymentRequest={
    id:requestId,
    amount:Number(next.amount||0),
    status:'open',
    dueAt:next.dueAt,
    paymentPlanId:p.planId,
    instalmentId:next.id,
    requestType:'payment_plan_instalment',
    paymentUrl:null,
    provider:null
   };

   p.events.push({
    type:'monday_full_allocation',
    amount,
    at:now,
    note:`£${amount.toFixed(2)} applied from the demo Monday settlement. Instalment ${current.instalmentNumber} paid in full.`
   });

   p.communications.push({
    type:'notification',
    title:'Payment plan payment applied',
    message:`£${amount.toFixed(2)} from your Monday FaivoPay balance has been applied to your payment plan. £${p.remainingAmount.toFixed(2)} remains. Your next payment of £${Number(next.amount||0).toFixed(2)} is due ${next.dueAt}.`,
    at:now
   });
  }
 }

 writeDemoState(state);
 res.json({
  ...state,
  demoMondayAllocation:{
   allocatedAmount:amount,
   availableAmount,
   payoutRemaining:Number(Math.max(0,availableAmount-amount).toFixed(2))
  }
 });
});


app.post('/api/admin/demo/payment-plan/pause',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(!['active','defaulted'].includes(p.status)){
  return res.status(400).json({error:`The demo payment plan cannot be paused from status ${p.status}.`});
 }

 const current=p.instalments?.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  return res.status(400).json({error:'No current demo instalment could be found to pause.'});
 }

 const now=demoStamp();

 p.status='paused';
 p.stage='paused';
 p.paused=true;
 p.pausedAt=now;

 if(p.currentPaymentRequest){
  p.currentPaymentRequest.previousStatus=p.currentPaymentRequest.status;
  p.currentPaymentRequest.status='plan_paused';
  p.currentPaymentRequest.paymentUrl=null;
  p.currentPaymentRequest.provider=null;
 }

 p.events.push({
  type:'plan_paused',
  amount:Number(p.remainingAmount||0),
  at:now,
  note:'Demo payment plan paused.'
 });

 p.communications.push({
  type:'notification',
  title:'Payment plan paused',
  message:'Your FaivoPay payment plan has been paused. No plan payment is currently required while the arrangement is paused.',
  at:now
 });

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/resume',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(p.status!=='paused'){
  return res.status(400).json({error:`Only a paused demo payment plan can be resumed. Current status: ${p.status}`});
 }

 const current=p.instalments?.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  return res.status(400).json({error:'No current demo instalment could be found to resume.'});
 }

 const now=demoStamp();
 const today=new Date().toISOString().slice(0,10);
 const overdue=String(current.dueAt||'')<today;

 if(overdue){
  current.status='overdue';
 }else{
  current.status='due';
 }

 p.status='active';
 p.stage='active';
 p.paused=false;
 p.resumedAt=now;
 p.nextDueDate=current.dueAt;
 p.nextDueAmount=Number(
  Math.max(
   0,
   Number(current.amount||0)-Number(current.paidAmount||0)
  ).toFixed(2)
 );

 if(p.currentPaymentRequest){
  p.currentPaymentRequest.status='open';
  p.currentPaymentRequest.amount=p.nextDueAmount;
  p.currentPaymentRequest.dueAt=current.dueAt;
 }

 p.events.push({
  type:'plan_resumed',
  amount:Number(p.remainingAmount||0),
  at:now,
  note:overdue
   ?'Demo payment plan resumed with the current instalment overdue.'
   :'Demo payment plan resumed.'
 });

 p.communications.push({
  type:'notification',
  title:'Payment plan resumed',
  message:overdue
   ?'Your FaivoPay payment plan has been resumed. The current instalment is overdue and is available to pay now.'
   :'Your FaivoPay payment plan has been resumed.',
  at:now
 });

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/cancel',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(!['active','paused','defaulted'].includes(p.status)){
  return res.status(400).json({error:`The demo payment plan cannot be cancelled from status ${p.status}.`});
 }

 const reason=String(req.body.reason||'').trim();

 if(!reason){
  return res.status(400).json({error:'Enter a reason for cancelling the demo payment plan.'});
 }

 const remaining=Number(
  Math.max(0,Number(p.remainingAmount||0)).toFixed(2)
 );

 if(remaining<=0.00001){
  return res.status(400).json({error:'The demo payment plan has no remaining balance.'});
 }

 const now=demoStamp();

 /*
  * Demo simulation of returning the remaining debt to Autocab.
  * No Autocab helper or live table is called here.
  */
 p.autocab.balanceAfter=remaining;
 p.autocab.returnedAmount=remaining;
 p.autocab.returnedAt=now;
 p.autocab.returned=true;
 p.autocab.note='Demo cancellation simulation — remaining balance returned to simulated Autocab only.';

 for(const instalment of p.instalments){
  if(['scheduled','due','overdue'].includes(instalment.status)){
   instalment.status='cancelled';
  }
 }

 if(p.currentPaymentRequest){
  p.currentPaymentRequest.status='cancelled';
  p.currentPaymentRequest.cancelledAt=now;
  p.currentPaymentRequest.paymentUrl=null;
 }

 p.sourceRequest.status='open';
 p.sourceRequest.amount=remaining;
 p.sourceRequest.paymentUrl=null;
 p.sourceRequest.provider=null;

 p.status='cancelled';
 p.stage='cancelled';
 p.cancelled=true;
 p.cancelledAt=now;
 p.cancelReason=reason;
 p.paused=false;
 p.defaulted=false;
 p.nextDueAmount=0;
 p.nextDueDate=null;
 p.currentPaymentRequest=null;

 p.events.push({
  type:'plan_cancelled',
  amount:remaining,
  at:now,
  note:`Demo payment plan cancelled. £${remaining.toFixed(2)} returned to the simulated outstanding balance. Reason: ${reason}`
 });

 p.communications.push({
  type:'notification',
  title:'Payment plan cancelled',
  message:`Your FaivoPay payment plan has been cancelled. The remaining balance of £${remaining.toFixed(2)} is now shown as an outstanding payment.`,
  at:now
 });

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/extra-payment',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!['active','defaulted'].includes(p.status)){
  return res.status(400).json({error:'Demo extra payments are available only while the plan is active or defaulted.'});
 }

 const current=p.instalments.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  return res.status(400).json({error:'No current demo instalment is payable.'});
 }

 const currentRemaining=Number(
  Math.max(
   0,
   Number(current.amount||0)-Number(current.paidAmount||0)
  ).toFixed(2)
 );

 const maxExtra=Number(
  Math.max(
   0,
   Number(p.remainingAmount||0)-currentRemaining
  ).toFixed(2)
 );

 const amount=Number(req.body.amount||0);

 if(!(amount>0)){
  return res.status(400).json({error:'Enter a positive demo extra payment.'});
 }

 if(amount>maxExtra+0.00001){
  return res.status(400).json({
   error:`Demo extra payment cannot exceed £${maxExtra.toFixed(2)} while the current instalment remains due.`
  });
 }

 const future=p.instalments
  .filter(
   x=>
    x.instalmentNumber>current.instalmentNumber &&
    x.status==='scheduled'
  )
  .sort((a,b)=>b.instalmentNumber-a.instalmentNumber);

 const futurePrincipal=Number(
  future.reduce(
   (total,x)=>total+Number(x.amount||0),
   0
  ).toFixed(2)
 );

 if(amount>futurePrincipal+0.00001){
  return res.status(400).json({
   error:`The demo schedule contains only £${futurePrincipal.toFixed(2)} of future principal. No payment has been recorded.`
  });
 }

 let reduction=Number(amount.toFixed(2));

 for(const inst of future){
  if(reduction<=0.00001)break;

  const value=Number(inst.amount||0);

  if(reduction+0.00001>=value){
   inst.status='cancelled';
   reduction=Number(
    Math.max(0,reduction-value).toFixed(2)
   );
  }else{
   inst.amount=Number((value-reduction).toFixed(2));
   reduction=0;
  }
 }

 if(reduction>0.00001){
  return res.status(400).json({
   error:'Demo schedule could not absorb the extra payment.'
  });
 }

 const now=demoStamp();

 p.paidAmount=Number(
  (Number(p.paidAmount||0)+amount).toFixed(2)
 );

 p.remainingAmount=Number(
  (Number(p.remainingAmount||0)-amount).toFixed(2)
 );

 p.events.push({
  type:'extra_payment_applied',
  amount,
  at:now,
  note:`Demo extra principal payment applied. Remaining plan balance £${p.remainingAmount.toFixed(2)}. Autocab unchanged.`
 });

 p.communications.push({
  title:'Extra payment applied',
  message:`Your extra payment of £${amount.toFixed(2)} reduced your payment-plan balance to £${p.remainingAmount.toFixed(2)}.`,
  at:now
 });

 writeDemoState(state);
 res.json(state);
});

app.post('/api/admin/demo/payment-plan/settle-early',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable. Reset Demo Lab and try again.'});
 }

 if(!['active','paused','defaulted'].includes(p.status)){
  return res.status(400).json({error:`The demo payment plan cannot be settled early from status ${p.status}.`});
 }

 const remaining=Number(
  Math.max(0,Number(p.remainingAmount||0)).toFixed(2)
 );

 if(remaining<=0.00001){
  return res.status(400).json({error:'The demo payment plan has no remaining balance.'});
 }

 let current=p.instalments?.find(x=>['due','overdue'].includes(x.status));

 if(!current){
  current=p.instalments
   ?.filter(x=>x.status==='scheduled')
   .sort((a,b)=>a.instalmentNumber-b.instalmentNumber)[0];
 }

 if(!current){
  return res.status(400).json({error:'No unpaid demo payment-plan instalment could be found.'});
 }

 const now=demoStamp();
 const today=new Date().toISOString().slice(0,10);
 const requestId=
  p.currentPaymentRequest?.id ||
  `DREQ-INST-${String(current.instalmentNumber).padStart(3,'0')}`;

 /*
  * Production settle-early does not complete the plan here.
  * It converts the current instalment into one final request for
  * the full remaining FaivoPay-owned balance.
  */

 for(const instalment of p.instalments){
  if(
   instalment.instalmentNumber>current.instalmentNumber &&
   instalment.status==='scheduled'
  ){
   instalment.status='cancelled';
  }
 }

 current.amount=remaining;
 current.dueAt=today;
 current.status='due';
 current.paymentRequestId=requestId;

 p.currentPaymentRequest={
  id:requestId,
  amount:remaining,
  status:'open',
  dueAt:today,
  paymentPlanId:p.planId,
  instalmentId:current.id,
  requestType:'payment_plan_instalment',
  paymentUrl:null,
  provider:null
 };

 p.status='active';
 p.stage='active';
 p.paused=false;
 p.defaulted=false;
 p.nextDueAmount=remaining;
 p.nextDueDate=today;

 p.settleEarlyRequested=true;
 p.settleEarlyRequestedAt=now;
 p.settleEarlyRequestAmount=remaining;

 /*
  * The debt stays owned by FaivoPay.
  * No Autocab credit or live helper is called.
  */
 p.autocab.balanceAfter=0;
 p.autocab.note='Demo early settlement requested inside FaivoPay — no Autocab credit posted.';

 p.events.push({
  type:'early_settlement_requested',
  amount:remaining,
  at:now,
  note:`Demo early settlement requested. Final payment of £${remaining.toFixed(2)} is now due.`
 });

 p.communications.push({
  type:'notification',
  title:'Payment plan – settle remaining balance',
  message:`Your remaining FaivoPay payment-plan balance of £${remaining.toFixed(2)} is now available to pay in full.`,
  at:now
 });

 writeDemoState(state);

 res.json({
  ...state,
  demoEarlySettlement:{
   remainingAmount:remaining,
   paymentRequestId:requestId
  }
 });
});


app.post('/api/admin/demo/payment-plan/amend',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 if(!p){
  return res.status(400).json({error:'Demo payment-plan state is unavailable.'});
 }

 if(!['draft','paused'].includes(p.status)){
  return res.status(400).json({
   error:'Only a draft or paused demo payment plan can be amended. Pause an active plan first.'
  });
 }

 const frequency=String(req.body.frequency||p.frequency||'weekly').trim();
 const instalmentAmount=Number(req.body.instalmentAmount||0);
 const startDate=paymentPlanDateOnly(req.body.startDate);

 if(!['weekly','fortnightly','monthly'].includes(frequency)){
  return res.status(400).json({error:'Frequency must be weekly, fortnightly or monthly.'});
 }

 if(!Number.isFinite(instalmentAmount) || instalmentAmount<=0){
  return res.status(400).json({error:'Instalment amount must be greater than zero.'});
 }

 if(!startDate){
  return res.status(400).json({error:'A valid next payment date is required.'});
 }

 const remaining=Number(
  (
   p.status==='draft'
    ?Number(p.planAmount||0)
    :Number(p.remainingAmount||0)
  ).toFixed(2)
 );

 if(remaining<=0){
  return res.status(400).json({error:'This demo payment plan has no remaining balance to amend.'});
 }

 if(instalmentAmount>remaining){
  return res.status(400).json({error:'Instalment amount cannot exceed the remaining balance.'});
 }

 const paid=p.instalments
  .filter(x=>x.status==='paid')
  .sort((a,b)=>a.instalmentNumber-b.instalmentNumber);

 const lastPaidNumber=paid.reduce(
  (max,x)=>Math.max(max,Number(x.instalmentNumber||0)),
  0
 );

 const schedule=[];
 let scheduleRemaining=remaining;
 let i=0;

 while(scheduleRemaining>0.00001){
  const instalmentNumber=lastPaidNumber+i+1;

  if(instalmentNumber>104){
   return res.status(400).json({
    error:'This amendment would exceed 104 total instalments. Increase the instalment amount.'
   });
  }

  const amount=Number(
   Math.min(instalmentAmount,scheduleRemaining).toFixed(2)
  );

  schedule.push({
   id:`DINST-${String(instalmentNumber).padStart(3,'0')}`,
   instalmentNumber,
   amount,
   paidAmount:0,
   dueAt:paymentPlanAddDate(startDate,i,frequency),
   status:'scheduled',
   paymentRequestId:null,
   paidAt:null
  });

  scheduleRemaining=Number(
   (scheduleRemaining-amount).toFixed(2)
  );

  i++;
 }

 const now=demoStamp();
 const today=new Date().toISOString().slice(0,10);

 if(p.status==='draft'){
  p.instalments=schedule;
  p.currentPaymentRequest=null;

 }else{
  const first=schedule[0];

  first.status=
   first.dueAt<today
    ?'overdue'
    :'due';

  const requestId=`DREQ-INST-${String(first.instalmentNumber).padStart(3,'0')}`;

  first.paymentRequestId=requestId;

  p.instalments=[...paid,...schedule];

  p.currentPaymentRequest={
   id:requestId,
   amount:Number(first.amount||0),
   status:'plan_paused',
   dueAt:first.dueAt,
   paymentPlanId:p.planId,
   instalmentId:first.id,
   requestType:'payment_plan_instalment',
   paymentUrl:null,
   provider:null
  };

  p.communications.push({
   type:'notification',
   title:'Payment plan amended',
   message:`Your payment plan has been amended. Remaining balance £${remaining.toFixed(2)}. New instalment £${instalmentAmount.toFixed(2)} ${frequency}. Next payment date ${startDate}. The plan remains paused until FaivoPay resumes it.`,
   at:now
  });
 }

 p.frequency=frequency;
 p.instalmentAmount=Number(instalmentAmount.toFixed(2));
 p.startDate=startDate;
 p.instalmentsTotal=p.instalments.length;
 p.instalmentsPaid=paid.length;
 p.nextDueAmount=Number(schedule[0].amount||0);
 p.nextDueDate=schedule[0].dueAt;

 p.events.push({
  type:'plan_amended',
  amount:remaining,
  at:now,
  note:`Demo payment plan amended to £${instalmentAmount.toFixed(2)} ${frequency}.`
 });

 writeDemoState(state);
 res.json(state);
});


app.get('/api/admin/demo/payment-plan/early-payout-status',adminAuth,(req,res)=>{
 const state=readDemoState();
 const p=state.paymentPlan;

 const blocked=Boolean(
  p && ['active','paused','defaulted'].includes(p.status)
 );

 res.json({
  blocked,
  planStatus:p?.status||null,
  reason:blocked
   ?'Early payouts are unavailable while the demo driver has an active payment plan.'
   :null
 });
});


/* Demo Monday: Sync -> Review -> Freeze -> Fund -> Release -> Monitor -> Reconcile */
app.post('/api/admin/demo/monday/confirm-rentsheets',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(r.locked)return res.status(400).json({error:'This demo run is locked. Reset Demo Lab to start again.'});if(r.stage!=='rentsheets')return res.status(400).json({error:'Rent Sheets have already been confirmed for this demo run.'});r.rentSheetsConfirmedAt=demoStamp();r.stage='sync';r.status='ready_to_sync';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/sync',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState();const r=state.monday;if(r.locked)return res.status(400).json({error:'This demo run is locked. Reset Demo Lab to start again.'});if(r.stage!=='sync')return res.status(400).json({error:'Confirm Monday Rent Sheets before syncing balances.'});r.stage='review';r.status='review';r.syncAt=demoStamp();writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/approve-all',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(r.stage!=='review')return res.status(400).json({error:'Sync balances first, then review the payout list.'});for(const x of r.items){if(x.status==='pending')x.status='approved'}writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/freeze',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;const pending=demoPending(r);if(r.stage!=='review')return res.status(400).json({error:'Complete the Review & Approve stage first.'});if(pending.length)return res.status(400).json({error:`${pending.length} positive payout${pending.length===1?' is':'s are'} still pending. Approve or exclude every payout before creating the payment run.`});const approved=demoApproved(r);if(!approved.length)return res.status(400).json({error:'No approved payouts are available for this run.'});r.stage='funding';r.status='frozen';r.runId=demoRunId('FP-WEEKLY');r.reference=`FP${new Date().toISOString().slice(2,10).replaceAll('-','')}01`;demoFunding(r);writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/top-up',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(r.stage!=='funding')return res.status(400).json({error:'Create and lock the weekly run before funding Wise.'});demoFunding(r);if(r.topUpRequired<=0)return res.status(400).json({error:'No top-up is required; the demo Wise balance already covers the run.'});r.fundingTransferAmount=r.topUpRequired;r.fundingTransferSentAt=demoStamp();r.stage='funding_wait';r.status='awaiting_cleared_funds';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/fund',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(!['funding','funding_wait'].includes(r.stage))return res.status(400).json({error:'Create and lock the demo payment run before checking cleared funds.'});demoFunding(r);if(r.stage==='funding_wait'&&Number(r.fundingTransferAmount||0)>0)r.wiseBalance=Number((Number(r.wiseBalance)+Number(r.fundingTransferAmount)).toFixed(2));demoFunding(r);if(r.topUpRequired>0)return res.status(400).json({error:'Cleared Wise balance is still below the required weekly payout total.'});r.topUpRequired=0;r.fundsReceivedAt=demoStamp();r.stage='funded';r.status='funded';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/release',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;demoFunding(r);if(r.stage!=='funded')return res.status(400).json({error:'Funding must be confirmed before payments can be released.'});if(Number(r.wiseBalance)<Number(r.fundingRequired))return res.status(400).json({error:'Demo Wise balance is below the required payout total. Add funds before release.'});const a=demoApproved(r);r.wiseBalance=Number((Number(r.wiseBalance)-Number(r.fundingRequired)).toFixed(2));a.forEach((x,i)=>{if(i===0)demoPaidItem(x);else if(i===a.length-1){x.wiseStatus='failed';x.failureReason='Recipient bank details rejected';x.autocabStatus='not_posted'}else{x.wiseStatus='processing';x.autocabStatus='waiting'}});r.releasedAt=demoStamp();r.stage='monitor';r.status='processing';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/refresh-status',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(r.stage!=='monitor')return res.status(400).json({error:'Release the demo payments before monitoring their status.'});for(const x of demoApproved(r)){if(x.wiseStatus==='processing')demoPaidItem(x)}writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/retry-failed',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(r.stage!=='monitor')return res.status(400).json({error:'There is no released demo run to retry.'});const failed=demoApproved(r).filter(x=>x.wiseStatus==='failed');if(!failed.length)return res.status(400).json({error:'There are no failed demo payments to retry.'});failed.forEach(x=>{delete x.failureReason;demoPaidItem(x)});writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/reconcile',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday;if(r.stage!=='monitor')return res.status(400).json({error:'Complete payment monitoring before reconciliation.'});if(!demoCanReconcile(r))return res.status(400).json({error:'Reconciliation cannot complete yet. Every approved payment must show Wise Paid and Autocab Updated.'});r.stage='complete';r.status='reconciled';r.reconciledAt=demoStamp();r.locked=true;for(const x of demoApproved(r))x.status='paid';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/monday/:id',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.monday,status=String(req.body.status||'');if(r.stage!=='review')return res.status(400).json({error:'Individual approvals can only be changed during Review & Approve.'});if(!['approved','excluded','pending'].includes(status))return res.status(400).json({error:'Invalid demo status'});const item=r.items.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Demo driver not found'});if(item.status==='collection')return res.status(400).json({error:'Collection items are not part of the payout approval list'});item.status=status;item.reason=status==='excluded'?String(req.body.reason||'Demo exclusion'):'';writeDemoState(state);res.json(state)});

/* Demo Early payout: Current balance sync -> Review -> Freeze -> Funding -> Release -> Monitor -> Reconcile */
app.post('/api/admin/demo/early/sync',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(r.locked)return res.status(400).json({error:'This demo run is locked. Reset Demo Lab to start again.'});if(r.stage!=='balance')return res.status(400).json({error:'Current balances have already been synced for this demo run.'});r.balanceSyncAt=demoStamp();r.stage='review';r.status='review';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/approve-all',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(r.stage!=='review')return res.status(400).json({error:'Early payout decisions can only be changed during Review & Approve.'});for(const x of r.items){if(x.status==='requested')x.status='approved'}writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/freeze',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;const pending=demoPending(r,true);if(r.stage!=='review')return res.status(400).json({error:'Complete the early payout Review & Approve stage first.'});if(pending.length)return res.status(400).json({error:`${pending.length} early payout request${pending.length===1?' is':'s are'} still awaiting a decision. Approve or decline every request first.`});const approved=demoApproved(r,true);if(!approved.length)return res.status(400).json({error:'No approved early payouts are available.'});r.stage='funding';r.status='frozen';r.runId=demoRunId('FP-EARLY');r.reference=`EFP${new Date().toISOString().slice(2,10).replaceAll('-','')}01`;demoFunding(r,true);writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/top-up',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(r.stage!=='funding')return res.status(400).json({error:'Create and lock the early payout run before funding Wise.'});demoFunding(r,true);if(r.topUpRequired<=0)return res.status(400).json({error:'No top-up is required; the demo Wise balance already covers the early payout run.'});r.fundingTransferAmount=r.topUpRequired;r.fundingTransferSentAt=demoStamp();r.stage='funding_wait';r.status='awaiting_cleared_funds';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/fund',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(!['funding','funding_wait'].includes(r.stage))return res.status(400).json({error:'Create and lock the early payout run before checking cleared funds.'});demoFunding(r,true);if(r.stage==='funding_wait'&&Number(r.fundingTransferAmount||0)>0)r.wiseBalance=Number((Number(r.wiseBalance)+Number(r.fundingTransferAmount)).toFixed(2));demoFunding(r,true);if(r.topUpRequired>0)return res.status(400).json({error:'Cleared Wise balance is still below the required early payout total.'});r.topUpRequired=0;r.fundsReceivedAt=demoStamp();r.stage='funded';r.status='funded';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/release',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;demoFunding(r,true);if(r.stage!=='funded')return res.status(400).json({error:'Confirm available funds before releasing early payouts.'});if(Number(r.wiseBalance)<Number(r.fundingRequired))return res.status(400).json({error:'Demo Wise balance is below the early payout total.'});const a=demoApproved(r,true);r.wiseBalance=Number((Number(r.wiseBalance)-Number(r.fundingRequired)).toFixed(2));a.forEach((x,i)=>{if(i===0)demoPaidItem(x);else if(i===a.length-1){x.wiseStatus='failed';x.failureReason='Demo recipient validation failed';x.autocabStatus='not_posted'}else{x.wiseStatus='processing';x.autocabStatus='waiting'}});r.releasedAt=demoStamp();r.stage='monitor';r.status='processing';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/refresh-status',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(r.stage!=='monitor')return res.status(400).json({error:'Release the demo early payouts before monitoring status.'});for(const x of demoApproved(r,true)){if(x.wiseStatus==='processing')demoPaidItem(x)}writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/retry-failed',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(r.stage!=='monitor')return res.status(400).json({error:'There is no released early payout run to retry.'});const failed=demoApproved(r,true).filter(x=>x.wiseStatus==='failed');if(!failed.length)return res.status(400).json({error:'There are no failed demo early payouts to retry.'});failed.forEach(x=>{delete x.failureReason;demoPaidItem(x)});writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/reconcile',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early;if(r.stage!=='monitor')return res.status(400).json({error:'Complete early payout monitoring before reconciliation.'});if(!demoCanReconcile(r,true))return res.status(400).json({error:'Reconciliation cannot complete yet. Every approved early payout must show Wise Paid and Autocab Updated.'});r.stage='complete';r.status='reconciled';r.reconciledAt=demoStamp();r.locked=true;for(const x of demoApproved(r,true))x.status='paid';writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/early/:id',adminAuth,requireStaffRole('administrator','finance'),(req,res)=>{const state=readDemoState(),r=state.early,status=String(req.body.status||'');if(r.stage!=='review')return res.status(400).json({error:'Early payout decisions can only be changed during Review & Approve.'});if(!['approved','declined','requested'].includes(status))return res.status(400).json({error:'Invalid demo status'});const item=r.items.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Demo request not found'});item.status=status;writeDemoState(state);res.json(state)});
app.post('/api/admin/demo/test-email',adminAuth,requireStaffRole('administrator'),async(req,res)=>{try{const to=safeEmail(req.body.to||getSettings().officeNotificationEmail);if(!to)return res.status(400).json({error:'Enter a test email address'});const state=readDemoState(),approved=state.early.items.filter(x=>['approved','paid'].includes(x.status)),total=approved.reduce((a,x)=>a+Number(x.netAmount||0),0);const html=`<div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px"><div style="max-width:680px;margin:auto;background:#fff;border-radius:14px;overflow:hidden"><div style="background:#7c3aed;color:white;padding:24px"><b>FAIVOPAY DEMO · TEST MESSAGE</b><h2 style="margin:8px 0 0">Early payout demonstration</h2></div><div style="padding:24px"><p>This is a demonstration only. No real payment is due.</p><p><b>${approved.length} demo requests · £${total.toFixed(2)}</b></p></div></div></div>`;const out=await sendEmail(to,'FaivoPay DEMO – early payout summary',html);if(!out.sent)throw new Error('No email provider is configured');logCommunication({channel:'email',recipient:to,templateKey:'demo_email',entityType:'demo',entityId:'office_demo',status:'sent',providerRef:out.id||out.provider||''});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/demo/test-sms',adminAuth,requireStaffRole('administrator'),async(req,res)=>{try{const to=String(req.body.to||'').trim();if(!to)return res.status(400).json({error:'Enter a test mobile number'});const out=await sendConfiguredSms(to,'FAIVOPAY DEMO – Test message only. No payment or action is required.',{templateKey:'demo_sms',entityType:'demo',entityId:'office_demo'});res.json({ok:true,out})}catch(e){res.status(500).json({error:e.message})}});

app.post('/api/admin/launch-reset',adminAuth,requireStaffRole('administrator'),(req,res)=>{
 const phrase=String(req.body.phrase||'');if(phrase!=='RESET FAIVOPAY FOR LIVE LAUNCH')return res.status(400).json({error:'Confirmation phrase does not match'});
 const includeDrivers=Boolean(req.body.includeDriverAccounts),stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupPath=path.join(DATA_DIR,`fleetpay-prelaunch-${stamp}.sqlite`);
 try{
  db.exec(`VACUUM INTO '${backupPath.replaceAll("'","''")}'`);
  db.exec('BEGIN IMMEDIATE');
  for(const table of [
   'payment_plan_settlement_allocations',
   'driver_payment_plan_events',
   'driver_payment_plan_instalments',
   'driver_payment_plans',
   'customer_payments',
   'settlement_runs',
   'payouts',
   'payment_requests',
   'carried_charges',
   'driver_weekly_activity',
   'driver_notifications',
   'driver_ledger',
   'payout_runs',
   'autocab_adjustments',
   'fee_ledger',
   'communications_log',
   'early_summary_notifications',
   'auth_challenges',
   'demo_state',
   'driver_cache',
   'audit_logs'
  ])db.exec(`DELETE FROM ${table}`);
  if(includeDrivers){db.exec('DELETE FROM push_subscriptions');db.exec('DELETE FROM driver_users')}
  db.exec('COMMIT');
  audit(req,'staff',req.auth.email,'live_launch_reset','system','launch_reset',{includeDriverAccounts:includeDrivers,backupPath:path.basename(backupPath)});
  res.json({ok:true,backupFile:path.basename(backupPath),driverAccountsCleared:includeDrivers});
 }catch(e){try{db.exec('ROLLBACK')}catch{}res.status(500).json({error:e.message})}
});

app.post('/api/driver/register/start',async(req,res)=>{try{const callsign=String(req.body.callsign||'').trim(),email=safeEmail(req.body.email),mobileLast4=String(req.body.mobileLast4||'').replace(/\D/g,'');if(!callsign||!email||mobileLast4.length!==4)return res.status(400).json({error:'Callsign, Autocab email and last 4 mobile digits are required'});let drivers=cacheRows();if(!drivers.length){try{await syncAutocab();drivers=cacheRows()}catch{}}const d=drivers.find(x=>String(x.callsign).trim().toLowerCase()===callsign.toLowerCase());if(!d||safeEmail(d.email)!==email||last4(d.mobile)!==mobileLast4)return res.status(400).json({error:'Details do not match the active Autocab driver record'});if(db.prepare('SELECT id FROM driver_users WHERE driver_id=?').get(d.driverId))return res.status(409).json({error:'This driver account has already been registered'});const code=String(Math.floor(100000+Math.random()*900000)),challenge=id('verify'),expires=Date.now()+10*60000;db.prepare('DELETE FROM auth_challenges WHERE driver_id=? OR expires_at<?').run(d.driverId,Date.now());db.prepare('INSERT INTO auth_challenges(id,type,driver_id,callsign,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(challenge,'register',d.driverId,d.callsign,email,crypto.createHash('sha256').update(code).digest('hex'),expires,new Date().toISOString());await sendEmail(email,'Your FaivoPay verification code',`<p>Your FaivoPay verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`);audit(req,'driver',d.driverId,'registration_started','driver',d.driverId,{callsign:d.callsign});res.json({challengeId:challenge,message:'Verification code sent to the email stored in Autocab',...(DEV_AUTH_CODES?{devCode:code}:{})})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/register/complete',(req,res)=>{const c=db.prepare('SELECT * FROM auth_challenges WHERE id=? AND type=?').get(req.body.challengeId,'register');if(!c||c.expires_at<Date.now())return res.status(400).json({error:'Verification code expired or invalid'});const h=crypto.createHash('sha256').update(String(req.body.code||'')).digest('hex');if(h!==c.code_hash)return res.status(400).json({error:'Incorrect verification code'});const password=String(req.body.password||'');if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const p=hashPassword(password),now=new Date().toISOString(),approved=getSettings().requireAdminApproval?0:1,userId=id('user');db.prepare('INSERT INTO driver_users(id,driver_id,callsign,email,password_hash,password_salt,approved,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(userId,c.driver_id,c.callsign,c.email,p.hash,p.salt,approved,now,now);db.prepare('DELETE FROM auth_challenges WHERE id=?').run(c.id);audit(req,'driver',c.driver_id,'registration_completed','driver_user',userId,{approved:Boolean(approved)});if(!approved)return res.json({pendingApproval:true});res.json({token:signToken({driverId:c.driver_id,userId}),callsign:c.callsign})});
app.post('/api/driver/login',(req,res)=>{const email=safeEmail(req.body.email),u=db.prepare('SELECT * FROM driver_users WHERE email=?').get(email);if(!u||!verifyPassword(String(req.body.password||''),u.password_salt,u.password_hash)){audit(req,'driver',email,'login_failed');return res.status(401).json({error:'Incorrect email or password'})}if(!u.approved)return res.status(403).json({error:'Your account is waiting for administrator approval'});db.prepare('UPDATE driver_users SET last_login_at=?,updated_at=? WHERE id=?').run(new Date().toISOString(),new Date().toISOString(),u.id);audit(req,'driver',u.driver_id,'login_success','driver_user',u.id);res.json({token:signToken({driverId:u.driver_id,userId:u.id}),callsign:u.callsign})});
app.post('/api/driver/forgot-password/start',async(req,res)=>{const email=safeEmail(req.body.email),u=db.prepare('SELECT * FROM driver_users WHERE email=?').get(email);if(!u)return res.json({message:'If that email is registered, a reset code has been sent.'});const code=String(Math.floor(100000+Math.random()*900000)),challenge=id('reset');db.prepare("DELETE FROM auth_challenges WHERE type='reset' AND email=?").run(email);db.prepare('INSERT INTO auth_challenges(id,type,driver_id,callsign,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(challenge,'reset',u.driver_id,u.callsign,email,crypto.createHash('sha256').update(code).digest('hex'),Date.now()+10*60000,new Date().toISOString());await sendEmail(email,'FaivoPay password reset code',`<p>Your FaivoPay password reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`);audit(req,'driver',u.driver_id,'password_reset_started','driver_user',u.id);res.json({challengeId:challenge,message:'If that email is registered, a reset code has been sent.',...(DEV_AUTH_CODES?{devCode:code}:{})})});
app.post('/api/driver/forgot-password/complete',(req,res)=>{const c=db.prepare("SELECT * FROM auth_challenges WHERE id=? AND type='reset'").get(req.body.challengeId);if(!c||c.expires_at<Date.now())return res.status(400).json({error:'Reset code expired or invalid'});if(crypto.createHash('sha256').update(String(req.body.code||'')).digest('hex')!==c.code_hash)return res.status(400).json({error:'Incorrect reset code'});const password=String(req.body.password||'');if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const p=hashPassword(password);db.prepare('UPDATE driver_users SET password_hash=?,password_salt=?,updated_at=? WHERE driver_id=?').run(p.hash,p.salt,new Date().toISOString(),c.driver_id);db.prepare('DELETE FROM auth_challenges WHERE id=?').run(c.id);audit(req,'driver',c.driver_id,'password_reset_completed','driver_user',c.driver_id);res.json({ok:true})});


app.get('/api/driver/push-config',driverAuth,(req,res)=>res.json({enabled:Boolean(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY),publicKey:VAPID_PUBLIC_KEY||null}));
app.post('/api/driver/push-subscription',driverAuth,(req,res)=>{try{const sub=req.body.subscription;if(!sub?.endpoint)return res.status(400).json({error:'Invalid push subscription'});const now=new Date().toISOString();db.prepare('INSERT INTO push_subscriptions(id,driver_id,endpoint,subscription_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET driver_id=excluded.driver_id,subscription_json=excluded.subscription_json,updated_at=excluded.updated_at').run(id('push'),req.auth.driverId,sub.endpoint,JSON.stringify(sub),now,now);audit(req,'driver',req.auth.driverId,'push_notifications_enabled','driver',req.auth.driverId);res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/push-test',driverAuth,async(req,res)=>{const d=cachedDriver(req.auth.driverId);await sendPush(req.auth.driverId,'FaivoPay test notification',`Push notifications are working for callsign ${d?.callsign||''}.`);res.json({ok:true})});
app.post('/api/driver/payment-plans/:id/extra-payment',driverAuth,async(req,res)=>{
 try{
  const plan=db.prepare(`SELECT * FROM driver_payment_plans WHERE id=? AND driver_id=?`).get(req.params.id,req.auth.driverId);
  if(!plan)return res.status(404).json({error:'Payment plan not found'});
  if(!['active','defaulted'].includes(plan.status))return res.status(409).json({error:'Extra payments are available only while the payment plan is active or needs attention.'});
  const existing=db.prepare(`SELECT * FROM payment_requests WHERE payment_plan_id=? AND request_type='payment_plan_extra' AND status='open' ORDER BY created_at DESC LIMIT 1`).get(plan.id);
  if(existing)return res.json({ok:true,reused:true,paymentRequest:{id:existing.id,amount:Number(existing.amount||0),status:existing.status,requestType:existing.request_type,paymentPlanId:existing.payment_plan_id}});
  const current=db.prepare(`SELECT * FROM driver_payment_plan_instalments WHERE plan_id=? AND status IN ('due','overdue') ORDER BY instalment_number LIMIT 1`).get(plan.id);
  if(!current)return res.status(409).json({error:'No current payment-plan instalment could be found.'});
  const currentRemaining=Number(Math.max(0,Number(current.amount||0)-Number(current.paid_amount||0)).toFixed(2)),maxExtra=Number(Math.max(0,Number(plan.remaining_amount||0)-currentRemaining).toFixed(2)),amount=Number(req.body.amount||0);
  if(!(amount>0))return res.status(400).json({error:'Enter an extra payment amount greater than zero.'});
  if(maxExtra<=0.00001)return res.status(409).json({error:'There is no future principal available for an extra payment. Pay the current instalment or use settle early.'});
  if(amount>maxExtra+0.00001)return res.status(400).json({error:`Extra payment cannot exceed £${maxExtra.toFixed(2)} while the current £${currentRemaining.toFixed(2)} instalment remains due.`});
  const currentRequest=current.payment_request_id?db.prepare('SELECT * FROM payment_requests WHERE id=?').get(current.payment_request_id):null;
  if(currentRequest?.provider_session_id){await safelyExpirePlanPaymentSession(currentRequest);db.prepare(`UPDATE payment_requests SET payment_url=NULL,provider=NULL,provider_session_id=NULL,provider_payment_intent_id=NULL,updated_at=? WHERE id=?`).run(new Date().toISOString(),currentRequest.id)}
  const requestId=id('request'),now=new Date().toISOString(),today=londonWindow().date;
  db.prepare(`INSERT INTO payment_requests(id,run_id,driver_id,callsign,driver_name,balance,weekly_fee,carried_charges,amount,status,payment_url,created_at,updated_at,due_at,payment_plan_id,payment_plan_instalment_id,request_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(requestId,currentRequest?.run_id||null,plan.driver_id,plan.callsign,plan.driver_name,-Number(plan.remaining_amount||0),0,0,amount,'open',null,now,now,today,plan.id,null,'payment_plan_extra');
  db.prepare(`INSERT INTO driver_payment_plan_events(id,plan_id,driver_id,event_type,description,actor_type,actor_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(id('planevent'),plan.id,plan.driver_id,'extra_payment_requested',`Extra principal payment of £${amount.toFixed(2)} requested`,'driver',String(plan.driver_id),JSON.stringify({paymentRequestId:requestId,amount,maxExtra,currentInstalmentRemaining:currentRemaining}),now);
  audit(req,'driver',plan.driver_id,'payment_plan_extra_payment_requested','driver_payment_plan',plan.id,{paymentRequestId:requestId,amount,maxExtra,currentInstalmentRemaining:currentRemaining});
  res.json({ok:true,maxExtra,paymentRequest:{id:requestId,amount,status:'open',dueAt:today,requestType:'payment_plan_extra',paymentPlanId:plan.id}});
 }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/driver/payment-requests/:id/checkout',driverAuth,async(req,res)=>{try{if(!getStripeClient())return res.status(400).json({error:'Card payments are not currently available. Please contact the office.'});const item=db.prepare('SELECT * FROM payment_requests WHERE id=? AND driver_id=?').get(req.params.id,req.auth.driverId);if(!item)return res.status(404).json({error:'Payment request not found'});if(item.status!=='open'){
 return res.status(400).json({
  error:item.status==='paid'
   ?'This payment has already been received'
   :item.status==='on_plan'
    ?'This balance is now being managed through a FaivoPay payment plan'
    :'This payment request is not currently available for payment'
 });
}
if(item.payment_plan_id&&item.request_type==='payment_plan_instalment'){
 const pendingExtra=db.prepare(`SELECT * FROM payment_requests WHERE payment_plan_id=? AND request_type='payment_plan_extra' AND status='open' ORDER BY created_at DESC LIMIT 1`).get(item.payment_plan_id);
 if(pendingExtra){
  await safelyExpirePlanPaymentSession(pendingExtra);
  db.prepare(`UPDATE payment_requests SET status='cancelled',payment_url=NULL,provider=NULL,provider_session_id=NULL,provider_payment_intent_id=NULL,updated_at=? WHERE id=? AND status='open'`).run(new Date().toISOString(),pendingExtra.id);
  audit(req,'driver',req.auth.driverId,'payment_plan_extra_payment_cancelled','driver_payment_plan',item.payment_plan_id,{paymentRequestId:pendingExtra.id,reason:'scheduled_instalment_checkout_started'});
 }
}
const session=await createStripePaymentRequest(item);audit(req,'driver',req.auth.driverId,'stripe_checkout_started','payment_request',item.id,{callsign:item.callsign,amount:item.amount,sessionId:session.id});res.json({ok:true,paymentUrl:session.url})}catch(e){res.status(500).json({error:e.message})}});


function driverLiveStateFreshness(row){
 if(!row){
  return {
   globalFeedFresh:false,
   driverStateFresh:false,
   globalFeedAgeMs:null,
   driverStateAgeMs:null
  };
 }

 const latestTrack=db.prepare(`
  SELECT received_at
  FROM autocab_vehicle_webhooks
  WHERE event_type='VehicleTracksChanged'
  ORDER BY received_at DESC
  LIMIT 1
 `).get();

 const globalFeedAgeMs=latestTrack?.received_at
  ? Date.now()-new Date(latestTrack.received_at).getTime()
  : NaN;

 const driverStateAgeMs=row.updated_at
  ? Date.now()-new Date(row.updated_at).getTime()
  : NaN;

 return {
  globalFeedFresh:
   Number.isFinite(globalFeedAgeMs) &&
   globalFeedAgeMs<=30000,

  driverStateFresh:
   Number.isFinite(driverStateAgeMs) &&
   driverStateAgeMs<=15*60*1000,

  globalFeedAgeMs:
   Number.isFinite(globalFeedAgeMs)?globalFeedAgeMs:null,

  driverStateAgeMs:
   Number.isFinite(driverStateAgeMs)?driverStateAgeMs:null
 };
}

app.get('/api/driver/live-state',driverAuth,(req,res)=>{
 try{
  const driverId=Number(req.auth.driverId);

  const row=db.prepare(`
   SELECT
    driver_id,
    driver_callsign,
    vehicle_id,
    vehicle_callsign,
    vehicle_status,
    booking_id,
    track_timestamp,
    updated_at
   FROM driver_live_state
   WHERE driver_id=?
   LIMIT 1
  `).get(driverId);

  if(!row){
   return res.json({
    ok:true,
    available:false,
    current:false,
    hasBooking:false,
    stale:true,
    state:null
   });
  }

  const freshness=driverLiveStateFreshness(row);
  const stale=
   !freshness.globalFeedFresh ||
   !freshness.driverStateFresh;

  const bookingId=Number(row.booking_id||0);

  res.json({
   ok:true,
   available:true,
   current:!stale,
   hasBooking:!stale && bookingId>0,
   stale,
   freshness:{
    globalFeedFresh:freshness.globalFeedFresh,
    driverStateFresh:freshness.driverStateFresh,
    globalFeedAgeSeconds:
     freshness.globalFeedAgeMs==null
      ?null
      :Math.round(freshness.globalFeedAgeMs/1000),
    driverStateAgeSeconds:
     freshness.driverStateAgeMs==null
      ?null
      :Math.round(freshness.driverStateAgeMs/1000)
   },
   state:{
    driverId:Number(row.driver_id),
    callsign:row.driver_callsign||'',
    vehicleId:row.vehicle_id==null?null:Number(row.vehicle_id),
    vehicleCallsign:row.vehicle_callsign||'',
    vehicleStatus:row.vehicle_status||'',
    bookingId:!stale && bookingId>0?bookingId:null,
    trackTimestamp:row.track_timestamp||null,
    updatedAt:row.updated_at||null
   }
  });
 }catch(e){
  res.status(500).json({error:e.message});
 }
});


app.get('/api/driver/customer-payment/preview',driverAuth,async(req,res)=>{
 try{
  if(!getStripeClient()){
   return res.status(400).json({
    error:'Customer card payments are not currently available.'
   });
  }

  const driverId=Number(req.auth.driverId);
  const driver=cachedDriver(driverId);

  if(!driver){
   return res.status(404).json({
    error:'Driver not found in FaivoPay cache'
   });
  }

  const live=db.prepare(`
   SELECT
    driver_id,
    driver_callsign,
    vehicle_status,
    booking_id,
    track_timestamp,
    updated_at
   FROM driver_live_state
   WHERE driver_id=?
   LIMIT 1
  `).get(driverId);

  if(!live){
   return res.status(409).json({
    error:'No current Autocab driver state is available.'
   });
  }

  const freshness=driverLiveStateFreshness(live);

  if(!freshness.globalFeedFresh){
   return res.status(409).json({
    error:'Live Autocab vehicle updates are temporarily unavailable. Please try again.'
   });
  }

  /*
   * VehicleTracksChanged is a change feed, not a per-driver heartbeat.
   * A driver may legitimately remain unchanged on the same booking for
   * well over 15 minutes. The fresh Autocab booking GET below is the
   * authority for assignment, payment type and current Cost.
   */
  const bookingId=Number(live.booking_id||0);

  if(!Number.isFinite(bookingId) || bookingId<=0){
   return res.status(409).json({
    error:'You do not currently have an active booking.'
   });
  }

  /*
   * The webhook cache identifies the likely current booking.
   * Autocab remains authoritative at payment time.
   * This is the only Autocab API request required for the preview.
   */
  const booking=await getJson(
   `${BASE_URL}/booking/v1/booking/${encodeURIComponent(bookingId)}`
  );

  if(!booking || typeof booking!=='object'){
   return res.status(502).json({
    error:'Autocab did not return the current booking.'
   });
  }

  const assignedDriver=
   booking.driver ??
   booking.Driver ??
   booking.driverDetails?.driver ??
   booking.DriverDetails?.Driver ??
   booking.assignedDriver ??
   booking.AssignedDriver ??
   {};

  const assignedDriverId=Number(
   assignedDriver.id ??
   assignedDriver.Id ??
   assignedDriver.driverId ??
   assignedDriver.DriverId ??
   booking.driverId ??
   booking.DriverId ??
   0
  );

  if(
   !Number.isFinite(assignedDriverId) ||
   assignedDriverId<=0 ||
   assignedDriverId!==driverId
  ){
   return res.status(409).json({
    error:'This booking is no longer assigned to you.'
   });
  }

  const paymentValues=[
   booking.paymentType ?? booking.PaymentType,
   booking.paymentMethod ?? booking.PaymentMethod
  ]
   .filter(v=>v!==null && v!==undefined && String(v).trim()!=='')
   .map(v=>String(v).trim().toLowerCase());

  const isCash=
   paymentValues.length>0 &&
   paymentValues.every(v=>v==='cash');

  if(!isCash){
   return res.status(409).json({
    error:'FaivoPay customer payment is only available for cash bookings.'
   });
  }

  const pricing=booking.pricing ?? booking.Pricing ?? {};

  const fareAmount=Math.round(
   Number(pricing.cost ?? pricing.Cost ?? 0)*100
  )/100;

  if(!Number.isFinite(fareAmount) || fareAmount<=0){
   return res.status(409).json({
    error:'The current Autocab driver cost is not available yet.'
   });
  }

  const feeAmount=customerPaymentFeeFor(fareAmount);
  const totalAmount=Math.round((fareAmount+feeAmount)*100)/100;

  audit(
   req,
   'driver',
   driverId,
   'customer_payment_previewed',
   'booking',
   bookingId,
   {
    callsign:driver.callsign,
    vehicleStatus:live.vehicle_status||null,
    fareSource:'autocab_pricing_cost',
    fareAmount,
    feeAmount,
    totalAmount
   }
  );

  res.json({
   ok:true,
   eligible:true,
   bookingId,
   callsign:driver.callsign,
   vehicleStatus:live.vehicle_status||'',
   paymentType:String(
    booking.paymentType ??
    booking.PaymentType ??
    ''
   ),
   paymentMethod:String(
    booking.paymentMethod ??
    booking.PaymentMethod ??
    ''
   ),
   fareAmount,
   feeAmount,
   totalAmount,
   fareSource:'autocab_pricing_cost'
  });

 }catch(e){
  console.error('[FaivoPay] Driver customer payment preview error',e);
  res.status(500).json({
   error:'Unable to verify the current booking for payment.'
  });
 }
});


app.post('/api/driver/customer-payment/live',driverAuth,async(req,res)=>{
 try{
  if(!getStripeClient()){
   return res.status(400).json({
    error:'Customer card payments are not currently available.'
   });
  }

  const driverId=Number(req.auth.driverId);
  const driver=cachedDriver(driverId);

  if(!driver){
   return res.status(404).json({
    error:'Driver not found in FaivoPay cache'
   });
  }

  const live=db.prepare(`
   SELECT
    driver_id,
    driver_callsign,
    vehicle_status,
    booking_id,
    track_timestamp,
    updated_at
   FROM driver_live_state
   WHERE driver_id=?
   LIMIT 1
  `).get(driverId);

  if(!live){
   return res.status(409).json({
    error:'No current Autocab driver state is available.'
   });
  }

  const freshness=driverLiveStateFreshness(live);

  if(!freshness.globalFeedFresh){
   return res.status(409).json({
    error:'Live Autocab vehicle updates are temporarily unavailable. Please try again.'
   });
  }

  /*
   * VehicleTracksChanged is a change feed, not a per-driver heartbeat.
   * A driver may legitimately remain unchanged on the same booking for
   * well over 15 minutes. The fresh Autocab booking GET below is the
   * authority for assignment, payment type and current Cost.
   */
  const bookingId=Number(live.booking_id||0);

  if(!Number.isFinite(bookingId) || bookingId<=0){
   return res.status(409).json({
    error:'You do not currently have an active booking.'
   });
  }

  /*
   * Autocab is authoritative at the point the payment is created.
   * The webhook cache only identifies the candidate booking.
   */
  const booking=await getJson(
   `${BASE_URL}/booking/v1/booking/${encodeURIComponent(bookingId)}`
  );

  if(!booking || typeof booking!=='object'){
   return res.status(502).json({
    error:'Autocab did not return the current booking.'
   });
  }

  const assignedDriver=
   booking.driver ??
   booking.Driver ??
   booking.driverDetails?.driver ??
   booking.DriverDetails?.Driver ??
   booking.assignedDriver ??
   booking.AssignedDriver ??
   {};

  const assignedDriverId=Number(
   assignedDriver.id ??
   assignedDriver.Id ??
   assignedDriver.driverId ??
   assignedDriver.DriverId ??
   booking.driverId ??
   booking.DriverId ??
   0
  );

  if(
   !Number.isFinite(assignedDriverId) ||
   assignedDriverId<=0 ||
   assignedDriverId!==driverId
  ){
   return res.status(409).json({
    error:'This booking is no longer assigned to you.'
   });
  }

  const paymentValues=[
   booking.paymentType ?? booking.PaymentType,
   booking.paymentMethod ?? booking.PaymentMethod
  ]
   .filter(v=>v!==null && v!==undefined && String(v).trim()!=='')
   .map(v=>String(v).trim().toLowerCase());

  const isCash=
   paymentValues.length>0 &&
   paymentValues.every(v=>v==='cash');

  if(!isCash){
   return res.status(409).json({
    error:'FaivoPay customer payment is only available for cash bookings.'
   });
  }

  const pricing=booking.pricing ?? booking.Pricing ?? {};

  const fareAmount=Math.round(
   Number(pricing.cost ?? pricing.Cost ?? 0)*100
  )/100;

  if(!Number.isFinite(fareAmount) || fareAmount<=0){
   return res.status(409).json({
    error:'The current Autocab driver cost is not available yet.'
   });
  }

  const feeAmount=customerPaymentFeeFor(fareAmount);
  const totalAmount=Math.round((fareAmount+feeAmount)*100)/100;

  /*
   * Prevent two FaivoPay payments being created for the same Autocab
   * booking, including bookings already created by the legacy
   * BookingCreated + capability flow.
   */
  const existing=db.prepare(`
   SELECT *
   FROM customer_payments
   WHERE booking_id=?
     AND source IN ('autocab_booking_created','driver_live_booking')
   ORDER BY created_at DESC
   LIMIT 1
  `).get(String(bookingId));

  if(existing){
   if(
    existing.payment_status==='paid' ||
    existing.status==='paid'
   ){
    return res.json({
     ok:true,
     alreadyPaid:true,
     reused:true,
     id:existing.id,
     bookingId,
     fareAmount:Number(existing.fare_amount||0),
     feeAmount:Number(existing.fee_amount||0),
     totalAmount:Number(existing.total_amount||0),
     paymentUrl:existing.payment_url||`${PUBLIC_BASE_URL}/pay/${existing.id}`
    });
   }

   if(existing.status!=='open'){
    return res.status(409).json({
     error:'A previous FaivoPay payment already exists for this booking and cannot be reused safely.'
    });
   }

   const existingFare=
    Math.round(Number(existing.fare_amount||0)*100)/100;

   const existingFee=
    Math.round(Number(existing.fee_amount||0)*100)/100;

   if(
    existingFare!==fareAmount ||
    existingFee!==feeAmount
   ){
    return res.status(409).json({
     error:
      'An existing payment link for this booking has a different amount. '+
      'FaivoPay has not changed it automatically.'
    });
   }

   return res.json({
    ok:true,
    reused:true,
    id:existing.id,
    bookingId,
    fareAmount,
    feeAmount,
    totalAmount,
    paymentUrl:
     existing.payment_url||
     `${PUBLIC_BASE_URL}/pay/${existing.id}`
   });
  }

  const pickup=booking.pickup ?? booking.Pickup ?? {};
  const destination=booking.destination ?? booking.Destination ?? {};

  const passengerName=String(
   booking.name ??
   booking.Name ??
   booking.passengerName ??
   booking.PassengerName ??
   ''
  ).trim();

  const passengerMobile=String(
   booking.telephoneNumber ??
   booking.TelephoneNumber ??
   booking.mobile ??
   booking.Mobile ??
   booking.passengerMobile ??
   booking.PassengerMobile ??
   ''
  ).trim();

  const passengerEmail=String(
   booking.customerEmail ??
   booking.CustomerEmail ??
   booking.email ??
   booking.Email ??
   ''
  ).trim();

  const pickupText=String(
   pickup.address ??
   pickup.Address ??
   pickup.text ??
   pickup.addressText ??
   ''
  ).trim();

  const destinationText=String(
   destination.address ??
   destination.Address ??
   destination.text ??
   destination.addressText ??
   ''
  ).trim();

  const journeyAt=
   booking.pickupDueTimeUtc ??
   booking.PickupDueTimeUtc ??
   booking.pickupDueTime ??
   booking.PickupDueTime ??
   null;

  const paymentMethod=String(
   booking.paymentMethod ??
   booking.PaymentMethod ??
   booking.paymentType ??
   booking.PaymentType ??
   'Cash'
  ).trim();

  const paymentId=id('customerpay');
  const now=new Date().toISOString();
  const paymentUrl=`${PUBLIC_BASE_URL}/pay/${paymentId}`;

  db.prepare(`
   INSERT INTO customer_payments(
    id,
    driver_id,
    callsign,
    driver_name,
    booking_id,
    fare_amount,
    fee_amount,
    total_amount,
    status,
    payment_url,
    payment_method,
    customer_name,
    customer_mobile,
    customer_email,
    pickup,
    destination,
    journey_at,
    taxi_company,
    source,
    created_by,
    created_at,
    updated_at
   )
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   paymentId,
   driverId,
   driver.callsign,
   driver.fullName,
   String(bookingId),
   fareAmount,
   feeAmount,
   totalAmount,
   'open',
   paymentUrl,
   paymentMethod||'Cash',
   passengerName||null,
   passengerMobile||null,
   passengerEmail||null,
   pickupText||null,
   destinationText||null,
   journeyAt,
   getSettings().companyName||'Need-A-Cab',
   'driver_live_booking',
   'driver_live_booking',
   now,
   now
  );

  audit(
   req,
   'driver',
   driverId,
   'live_customer_payment_created',
   'customer_payment',
   paymentId,
   {
    bookingId,
    callsign:driver.callsign,
    vehicleStatus:live.vehicle_status||null,
    fareSource:'autocab_pricing_cost',
    fareAmount,
    feeAmount,
    totalAmount
   }
  );

  res.json({
   ok:true,
   reused:false,
   id:paymentId,
   bookingId,
   fareAmount,
   feeAmount,
   totalAmount,
   paymentUrl,
   fareSource:'autocab_pricing_cost'
  });

 }catch(e){
  console.error('[FaivoPay] Live customer payment creation error',e);
  res.status(500).json({
   error:'Unable to create the customer payment.'
  });
 }
});

app.post('/api/driver/customer-payment',driverAuth,async(req,res)=>{
  try{
    if(!getStripeClient()){
      return res.status(400).json({
        error:'Customer card payments are not currently available.'
      });
    }

    const d=cachedDriver(req.auth.driverId);

    if(!d){
      return res.status(404).json({
        error:'Driver not found in FaivoPay cache'
      });
    }

    const fareAmount=Number(req.body.amount||0);
    const bookingId=String(req.body.bookingId||'').trim();

    if(!Number.isFinite(fareAmount) || fareAmount<=0){
      return res.status(400).json({
        error:'Enter a valid fare amount'
      });
    }

    const settings=getSettings();

    let feeAmount=0;

    if(settings.customerPaymentFeeType==='percentage'){
      feeAmount=fareAmount*(Number(settings.customerPaymentFeeValue||0)/100);
    }else{
      feeAmount=Number(settings.customerPaymentFeeValue||0);
    }

    feeAmount=Math.round(feeAmount*100)/100;

    const totalAmount=Math.round((fareAmount+feeAmount)*100)/100;
    const paymentId=id('customerpay');
    const now=new Date().toISOString();

    db.prepare(`
      INSERT INTO customer_payments(
        id,
        driver_id,
        callsign,
        driver_name,
        booking_id,
        fare_amount,
        fee_amount,
        total_amount,
        status,
        created_at,
        updated_at
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      paymentId,
      d.driverId,
      d.callsign,
      d.fullName,
      bookingId||null,
      fareAmount,
      feeAmount,
      totalAmount,
      'open',
      now,
      now
    );

    const item=db.prepare(
      'SELECT * FROM customer_payments WHERE id=?'
    ).get(paymentId);

    const publicPaymentUrl=`${PUBLIC_BASE_URL}/pay/${paymentId}`;
    db.prepare('UPDATE customer_payments SET payment_url=?,updated_at=? WHERE id=?').run(publicPaymentUrl,now,paymentId);

    audit(
      req,
      'driver',
      d.driverId,
      'customer_payment_created',
      'customer_payment',
      paymentId,
      {
        callsign:d.callsign,
        bookingId:bookingId||null,
        fareAmount,
        feeAmount,
        totalAmount,
        paymentUrl:publicPaymentUrl
      }
    );

    res.json({
      ok:true,
      id:paymentId,
      bookingId:bookingId||null,
      fareAmount,
      feeAmount,
      totalAmount,
      paymentUrl:publicPaymentUrl
    });

  }catch(e){
    res.status(500).json({
      error:e.message
    });
  }
});
function maskedBankAccount(driverId){
 const row=db.prepare('SELECT driver_id,status,sort_code_last2,account_number_last4,created_at,updated_at FROM driver_bank_accounts WHERE driver_id=?').get(driverId);
 if(!row)return {configured:false,status:'missing'};
 return {
  configured:true,
  status:row.status||'saved',
  sortCodeMasked:`••-••-${row.sort_code_last2}`,
  accountNumberMasked:`••••${row.account_number_last4}`,
  createdAt:row.created_at,
  updatedAt:row.updated_at
 };
}
function adminBankAccountInfo(driverId){
 const row=db.prepare('SELECT account_holder_enc,status,provider_recipient_id,sort_code_last2,account_number_last4,created_at,updated_at FROM driver_bank_accounts WHERE driver_id=?').get(driverId);
 if(!row)return {configured:false,ready:false,status:'missing',label:'Bank details missing',changedRecently:false};
 let accountHolder='Saved securely';
 try{accountHolder=decryptSecret(row.account_holder_enc)||accountHolder}catch{}
 const changed=Boolean(row.updated_at&&row.created_at&&row.updated_at!==row.created_at);
 const changedRecently=changed&&(Date.now()-new Date(row.updated_at).getTime())<(7*24*60*60*1000);
 const providerVerified=Boolean(row.provider_recipient_id)&&String(row.status||'').toLowerCase()==='verified';
 return {
  configured:true,ready:true,status:providerVerified?'verified':changedRecently?'recently_changed':'saved',
  label:providerVerified?'Provider verified':changedRecently?'Changed recently':'Bank ready',
  accountHolder,sortCodeMasked:`••-••-${row.sort_code_last2}`,accountNumberMasked:`••••${row.account_number_last4}`,
  changedRecently,providerVerified,createdAt:row.created_at,updatedAt:row.updated_at
 };
}
function payoutBankIssues(items){
 return (items||[]).map(x=>({item:x,bank:adminBankAccountInfo(x.driver_id)})).filter(x=>!x.bank.ready);
}

app.put('/api/driver/bank-account',driverAuth,async(req,res)=>{
 try{
  const accountHolder=String(req.body.accountHolder||'').trim().replace(/\s+/g,' ');
  const sortCode=String(req.body.sortCode||'').replace(/\D/g,'');
  const accountNumber=String(req.body.accountNumber||'').replace(/\D/g,'');
  const password=String(req.body.password||'');
  if(accountHolder.length<2||accountHolder.length>100)return res.status(400).json({error:'Enter the account holder name exactly as shown on the bank account.'});
  if(sortCode.length!==6)return res.status(400).json({error:'Enter a valid 6-digit UK sort code.'});
  if(accountNumber.length!==8)return res.status(400).json({error:'Enter a valid 8-digit UK account number.'});
  const user=db.prepare('SELECT id,email,password_hash,password_salt FROM driver_users WHERE driver_id=?').get(req.auth.driverId);
  if(!user||!verifyPassword(password,user.password_salt,user.password_hash))return res.status(401).json({error:'Your FaivoPay password is required to change payout bank details.'});
  const existing=db.prepare('SELECT driver_id FROM driver_bank_accounts WHERE driver_id=?').get(req.auth.driverId);
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO driver_bank_accounts(driver_id,account_holder_enc,sort_code_enc,account_number_enc,sort_code_last2,account_number_last4,status,provider_recipient_id,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,NULL,?,?)
   ON CONFLICT(driver_id) DO UPDATE SET account_holder_enc=excluded.account_holder_enc,sort_code_enc=excluded.sort_code_enc,account_number_enc=excluded.account_number_enc,sort_code_last2=excluded.sort_code_last2,account_number_last4=excluded.account_number_last4,status='saved',provider_recipient_id=NULL,updated_at=excluded.updated_at`)
   .run(req.auth.driverId,encryptSecret(accountHolder),encryptSecret(sortCode),encryptSecret(accountNumber),sortCode.slice(-2),accountNumber.slice(-4),'saved',now,now);
  audit(req,'driver',req.auth.driverId,existing?'bank_account_changed':'bank_account_added','driver_bank_account',String(req.auth.driverId),{maskedAccount:`••••${accountNumber.slice(-4)}`,maskedSortCode:`••-••-${sortCode.slice(-2)}`});
  notify(req.auth.driverId,existing?'Payout bank account changed':'Payout bank account added',existing?'Your payout bank details were changed. Future FaivoPay payouts will use the new account.':'Your payout bank details were saved securely.','info',String(req.auth.driverId));
  const d=cachedDriver(req.auth.driverId);
  const email=safeEmail(d?.email||user.email);
  if(email){sendEmail(email,existing?'FaivoPay payout bank details changed':'FaivoPay payout bank details added',`<p>Your FaivoPay payout bank details ${existing?'were changed':'have been added'}.</p><p>Account ending <strong>${accountNumber.slice(-4)}</strong> · Sort code ending <strong>${sortCode.slice(-2)}</strong>.</p><p>If you did not make this change, contact the FaivoPay office immediately.</p>`).catch(()=>{});}
  res.json({ok:true,bankAccount:maskedBankAccount(req.auth.driverId)});
 }catch(e){res.status(500).json({error:e.message})}
});

app.get('/api/driver/me',driverAuth,(req,res)=>{
  try{
    refreshPaymentPlanStatuses();

    const d=cachedDriver(req.auth.driverId);

    if(!d){
      return res.status(404).json({
        error:'Driver record is not yet available. Please try again after the next FaivoPay sync.'
      });
    }

    const settings=getSettings();

    const paymentRequests=db.prepare(`
      SELECT
       id,
       amount,
       status,
       provider,
       due_at dueAt,
       created_at createdAt,
       request_type requestType,
       payment_plan_id paymentPlanId,
       payment_plan_instalment_id paymentPlanInstalmentId
      FROM payment_requests
      WHERE driver_id=?
        AND status IN ('open','pending')
      ORDER BY created_at DESC
    `).all(d.driverId);

    const paymentPlans=db.prepare(`
      SELECT *
      FROM driver_payment_plans
      WHERE driver_id=?
        AND status IN ('active','paused','defaulted','completed')
      ORDER BY
       CASE status
        WHEN 'active' THEN 0
        WHEN 'defaulted' THEN 1
        WHEN 'paused' THEN 2
        ELSE 3
       END,
       created_at DESC
      LIMIT 10
    `).all(d.driverId).map(
      row=>serializePaymentPlan(
       row,
       {instalments:true,events:false}
      )
    );
    const customerPayments=db.prepare(`
  SELECT
    id,
    booking_id bookingId,
    fare_amount fareAmount,
    fee_amount feeAmount,
    total_amount totalAmount,
    status,
    provider,
    payment_url paymentUrl,
    created_at createdAt,
    paid_at paidAt
  FROM customer_payments
  WHERE driver_id=?
  ORDER BY created_at DESC
  LIMIT 20
`).all(d.driverId);

    const early=db.prepare(
      "SELECT id,gross_amount grossAmount,fee,net_amount netAmount,status,decline_reason declineReason,decision_at decisionAt,eligible_run_date eligibleRunDate,submitted_after_cutoff submittedAfterCutoff,created_at createdAt FROM payouts WHERE driver_id=? AND type='early' ORDER BY created_at DESC"
    ).all(d.driverId);

    const reserved=early
      .filter(x=>['requested','approved','batched'].includes(x.status))
      .reduce((s,x)=>s+Number(x.grossAmount||0),0);

    const available=Math.max(
      0,
      Number(d.currentBalance||0)-reserved
    );

    const ledgerRows=db.prepare(
      'SELECT id,entry_type entryType,direction,amount,fee_amount feeAmount,description,reference_id referenceId,status,created_at createdAt FROM driver_ledger WHERE driver_id=? ORDER BY created_at DESC LIMIT 100'
    ).all(d.driverId);

    const notifications=db.prepare(
      'SELECT id,title,message,type,read_at readAt,created_at createdAt FROM driver_notifications WHERE driver_id=? ORDER BY created_at DESC LIMIT 20'
    ).all(d.driverId);

    const livePaymentPlan=
      paymentPlans.find(
        x=>['active','paused','defaulted'].includes(x.status)
      )||null;

    const earlyTiming=earlyPayoutTiming(settings);

    res.json({
      driver:{
        driverId:d.driverId,
        callsign:d.callsign,
        fullName:d.fullName,
        email:d.email,
        mobile:d.mobile,
        currentBalance:d.currentBalance,
        previousBalance:d.previousBalance,
        lastProcessed:d.lastProcessed,
        syncedAt:d.syncedAt
      },

      bankAccount:maskedBankAccount(d.driverId),

      settings:{
        weeklyAppFee:settings.weeklyAppFee,
        earlyPayoutFee:settings.earlyPayoutFee,
        earlyPayoutCutoffTime:cutoffParts(settings).label,
        customerPaymentFeeType:settings.customerPaymentFeeType,
        customerPaymentFeeValue:settings.customerPaymentFeeValue
      },

      paymentRequests,
    paymentPlans,
      customerPayments,
      earlyPayoutRequests:early,
      ledger:ledgerRows,
      notifications,
      stripeConfigured:Boolean(getStripeClient()),
      reservedForEarlyPayout:reserved,
      earlyPayoutAllowed:
        !livePaymentPlan &&
        earlyTiming.requestDayAllowed,
      earlyPayoutBlockedReason:
        livePaymentPlan
          ?'Early payouts are unavailable while you have an active payment plan.'
          :null,
      earlyPayoutTiming:earlyTiming,
      earlyPayoutWindowMessage:
        livePaymentPlan
          ?'Early payouts are unavailable while you have an active payment plan.'
          :earlyPayoutWindowMessage(settings),
      availableForEarlyPayout:
        livePaymentPlan
          ?0
          :available
    });

  }catch(e){
    res.status(500).json({
      error:e.message
    });
  }
});app.post('/api/driver/early-payout',driverAuth,(req,res)=>{try{const settings=getSettings(),timing=earlyPayoutTiming(settings);if(!timing.requestDayAllowed)return res.status(400).json({error:earlyPayoutWindowMessage(settings)});const d=cachedDriver(req.auth.driverId);if(!d)return res.status(404).json({error:'Driver not found in FaivoPay cache'});const livePlan=db.prepare("SELECT id,status FROM driver_payment_plans WHERE driver_id=? AND status IN ('active','paused','defaulted') ORDER BY created_at DESC LIMIT 1").get(d.driverId);if(livePlan)return res.status(409).json({error:'Early payouts are unavailable while you have an active payment plan.'});const early=db.prepare("SELECT gross_amount,status FROM payouts WHERE driver_id=? AND type='early'").all(d.driverId);const reserved=early.filter(x=>['requested','approved','batched'].includes(x.status)).reduce((s,x)=>s+Number(x.gross_amount||0),0),available=Math.max(0,Number(d.currentBalance||0)-reserved),gross=Number(req.body.amount||0),fee=Number(settings.earlyPayoutFee||0);if(gross<=fee)return res.status(400).json({error:`Requested amount must be greater than the £${fee.toFixed(2)} fee`});if(gross>available+0.00001)return res.status(400).json({error:'Requested amount exceeds your available current balance'});const itemId=id('early'),now=new Date().toISOString();db.prepare('INSERT INTO payouts(id,driver_id,callsign,driver_name,gross_amount,fee,net_amount,amount,type,status,created_at,eligible_run_date,submitted_after_cutoff) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(itemId,d.driverId,d.callsign,d.fullName,gross,fee,gross-fee,gross-fee,'early','requested',now,timing.runDate,timing.afterCutoff?1:0);const timingText=timing.beforeCutoff?'It is eligible for today\'s payment run if approved.':`Today's ${timing.cutoff} cutoff has passed, so it is queued for the ${timing.runLabel} payment run if approved.`;notify(d.driverId,'Payout request received',`Your request for £${(gross-fee).toFixed(2)} after the £${fee.toFixed(2)} fee is awaiting approval. ${timingText}`,'info',itemId);audit(req,'driver',d.driverId,'early_payout_requested','payout',itemId,{gross,fee,net:gross-fee,eligibleRunDate:timing.runDate,submittedAfterCutoff:timing.afterCutoff});res.json({id:itemId,grossAmount:gross,fee,netAmount:gross-fee,status:'requested',createdAt:now,eligibleRunDate:timing.runDate,submittedAfterCutoff:timing.afterCutoff,message:timingText})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/notifications/read',driverAuth,(req,res)=>{db.prepare('UPDATE driver_notifications SET read_at=? WHERE driver_id=? AND read_at IS NULL').run(new Date().toISOString(),req.auth.driverId);res.json({ok:true})});

app.get('/payment-success',(_req,res)=>{
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Payment successful</title>
      </head>
      <body style="font-family:Arial,sans-serif;background:#f4f7fb;margin:0;padding:24px;">
        <div style="max-width:520px;margin:80px auto;background:white;padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08);">
          <h1 style="margin-top:0;">Payment successful</h1>
          <p>Your payment has been received successfully.</p>
          <p>You can now close this page.</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/payment-cancelled',(_req,res)=>{
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Payment cancelled</title>
      </head>
      <body style="font-family:Arial,sans-serif;background:#f4f7fb;margin:0;padding:24px;">
        <div style="max-width:520px;margin:80px auto;background:white;padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08);">
          <h1 style="margin-top:0;">Payment cancelled</h1>
          <p>No payment has been taken.</p>
          <p>You can close this page and ask the driver to try again.</p>
        </div>
      </body>
    </html>
  `);
});

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename),dist=path.resolve(__dirname,'../dist');app.use(express.static(dist));app.get('*',(req,res,next)=>{if(req.path.startsWith('/api'))return next();res.sendFile(path.join(dist,'index.html'),e=>e&&next())});
function scheduleSync(){if(!getAutocabApiKey())return;const minutes=Math.max(2,Number(getSettings().syncMinutes||10));setTimeout(async()=>{try{const r=await syncAutocab();console.log(`FaivoPay scheduled sync: ${r.drivers.length} drivers`)}catch(e){console.error('Scheduled Autocab sync failed:',e.message)}finally{scheduleSync()}},minutes*60000)}
function scheduleEarlySummary(){setTimeout(async()=>{try{await sendEarlyPayoutOfficeSummary()}catch(e){console.error('Early payout office summary failed:',e.message)}finally{scheduleEarlySummary()}},60000)}
function schedulePaymentPlanStatusRefresh(){setTimeout(()=>{try{const r=refreshPaymentPlanStatuses();if(r.overdueInstalments||r.defaultedPlans)console.log(`FaivoPay payment plan refresh: ${r.overdueInstalments} overdue instalment(s), ${r.defaultedPlans} newly defaulted plan(s)`)}catch(e){console.error('Payment plan status refresh failed:',e.message)}finally{schedulePaymentPlanStatusRefresh()}},15*60000)}
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FaivoPay server running on port ${PORT} · DB ${DB_PATH}`);

  if (getAutocabApiKey()) {
    syncAutocab()
      .then(r => console.log(`FaivoPay initial Autocab sync: ${r.drivers.length} drivers`))
      .catch(e => console.error('Initial Autocab sync failed:', e.message))
      .finally(scheduleSync);
  }
  scheduleEarlySummary();
  schedulePaymentPlanStatusRefresh();
});
