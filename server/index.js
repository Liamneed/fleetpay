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
const COMPANY_ID = Number(process.env.AUTOCAB_COMPANY_ID || 1);
const BASE_URL = 'https://autocab-api.azure-api.net';
const TOKEN_SECRET = process.env.PORTAL_TOKEN_SECRET || 'change-me-in-production';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@fleetpay.local').toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'ChangeMe123!');
const DEV_AUTH_CODES = String(process.env.DEV_AUTH_CODES || 'true').toLowerCase() === 'true';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'FleetPay <payments@example.com>';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || `http://localhost:5173`).replace(/\/$/, '');
const AUTOCAB_ADJUSTMENTS_ENABLED = String(process.env.AUTOCAB_ADJUSTMENTS_ENABLED || 'false').toLowerCase()==='true';
const WISE_API_TOKEN = process.env.WISE_API_TOKEN || '';
const WISE_ENV = String(process.env.WISE_ENV || 'sandbox').toLowerCase();
const WISE_PROFILE_ID = process.env.WISE_PROFILE_ID || '';
const WISE_BASE_URL = WISE_ENV==='production' ? 'https://api.wise.com' : 'https://api.wise-sandbox.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
if(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY){ webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY); }
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
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
CREATE TABLE IF NOT EXISTS carried_charges (driver_id INTEGER PRIMARY KEY, amount REAL NOT NULL DEFAULT 0);
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
  'ALTER TABLE payment_requests ADD COLUMN paid_at TEXT'
]) { try { db.exec(sql); } catch {} }

const defaultSettings = {
 negativeThreshold: 20, weeklyAppFee: 2.5, earlyPayoutFee: 1.5, earlyPayoutCutoffTime: '11:00', earlyPayoutCutoffHour: 11,
 syncMinutes: 10, requireAdminApproval: false, companyName: 'Need-A-Cab', productName: 'FleetPay'
};
for (const [k,v] of Object.entries(defaultSettings)) {
 db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, JSON.stringify(v));
}

app.use(cors());
app.post('/api/stripe/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  if(!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook not configured');
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET); }
  catch(e){ return res.status(400).send(`Webhook Error: ${e.message}`); }
  try {
    if(event.type==='checkout.session.completed' || event.type==='checkout.session.async_payment_succeeded'){
      const session=event.data.object, requestId=session.metadata?.fleetpay_request_id || session.client_reference_id;
      if(requestId){
        const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(requestId);
        if(item && item.status!=='paid'){
          const now=new Date().toISOString();
          db.prepare('UPDATE payment_requests SET status=?,provider=?,provider_session_id=?,provider_payment_intent_id=?,paid_at=?,updated_at=? WHERE id=?').run('paid','stripe',session.id,String(session.payment_intent||''),now,now,item.id);
          ledger(item.driver_id,'payment_received','debit',Number(item.amount||0),0,'Payment received by Stripe',item.id,'paid');
          notify(item.driver_id,'Payment received',`We have received your payment of £${Number(item.amount||0).toFixed(2)}.`,'success',item.id);
          try{await settlePaymentRequestInAutocab(item);audit(null,'system','stripe','autocab_payment_adjusted','payment_request',item.id,{callsign:item.callsign,amount:item.amount});}catch(e){audit(null,'system','stripe','autocab_adjustment_failed','payment_request',item.id,{callsign:item.callsign,error:e.message});}
          audit(null,'system','stripe','stripe_payment_received','payment_request',item.id,{callsign:item.callsign,amount:item.amount,sessionId:session.id});
        }
      }
    }
    res.json({received:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.use(express.json());

function getSettings(){
 const rows=db.prepare('SELECT key,value FROM settings').all(); const out={...defaultSettings};
 for(const r of rows){ try{out[r.key]=JSON.parse(r.value)}catch{out[r.key]=r.value} } return out;
}
function setSettings(obj){
 const st=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
 for(const [k,v] of Object.entries(obj)) st.run(k, JSON.stringify(v)); return getSettings();
}
function id(prefix){return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`}
function safeEmail(v=''){return String(v).trim().toLowerCase()}
function last4(v=''){return String(v).replace(/\D/g,'').slice(-4)}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')}}
function verifyPassword(password,salt,hash){try{return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hash,'hex'))}catch{return false}}
function signToken(payload,hours=24*30){const body=Buffer.from(JSON.stringify({...payload,exp:Date.now()+hours*3600000})).toString('base64url');const sig=crypto.createHmac('sha256',TOKEN_SECRET).update(body).digest('base64url');return `${body}.${sig}`}
function verifyToken(token){try{const [b,s]=String(token||'').split('.');if(!b||!s)return null;const e=crypto.createHmac('sha256',TOKEN_SECRET).update(b).digest('base64url');if(s.length!==e.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e)))return null;const p=JSON.parse(Buffer.from(b,'base64url').toString());return p.exp>Date.now()?p:null}catch{return null}}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function adminAuth(req,res,next){const p=verifyToken(bearer(req));if(p?.role!=='admin')return res.status(401).json({error:'Admin authentication required'});req.auth=p;next()}
function driverAuth(req,res,next){const p=verifyToken(bearer(req));if(!p?.driverId)return res.status(401).json({error:'Authentication required'});req.auth=p;next()}
function audit(req,actorType,actorId,action,entityType=null,entityId=null,details={}){let displayActor=String(actorId||'');if(actorType==='driver'){const d=cachedDriver(Number(actorId));if(d?.callsign)displayActor=d.callsign}db.prepare('INSERT INTO audit_logs(created_at,actor_type,actor_id,action,entity_type,entity_id,details_json,ip) VALUES(?,?,?,?,?,?,?,?)').run(new Date().toISOString(),actorType,displayActor,action,entityType,entityId?String(entityId):null,JSON.stringify(details||{}),req?.ip||'')}

const headers=()=>({'Content-Type':'application/json','Cache-Control':'no-cache','Ocp-Apim-Subscription-Key':API_KEY});
async function putJson(url,body){if(!API_KEY)throw new Error('AUTOCAB_API_KEY is not configured');const r=await fetch(url,{method:'PUT',headers:headers(),body:JSON.stringify(body)});const text=await r.text();if(!r.ok)throw new Error(`Autocab ${r.status}: ${text.slice(0,500)}`);try{return text?JSON.parse(text):{ok:true}}catch{return {ok:true,raw:text}}}
async function postJson(url,body){if(!API_KEY)throw new Error('AUTOCAB_API_KEY is not configured');const r=await fetch(url,{method:'POST',headers:headers(),body:JSON.stringify(body)});if(!r.ok)throw new Error(`Autocab ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json()}
async function getActiveDrivers(){return postJson(`${BASE_URL}/driver/v1/drivers/active`,{CompanyId:COMPANY_ID,ActiveStatusType:'Active'})}
async function getDriverAccounts(){return postJson(`${BASE_URL}/accounts/v1/DriversAccounts?pageno=1&pagesize=1000`,{companyId:null,driverId:null})}
function mergeDrivers(drivers,accountsResponse){const accounts=accountsResponse?.summaries||[];const byId=new Map(accounts.map(a=>[Number(a.driverId),a]));return (drivers||[]).map(d=>{const a=byId.get(Number(d.id));return {driverId:d.id,callsign:d.callsign,forename:d.forename,surname:d.surname,fullName:d.fullName||`${d.forename||''} ${d.surname||''}`.trim(),mobile:d.mobile||d.telephone||'',email:d.email||'',active:Boolean(d.active),suspended:Boolean(d.suspended),previousBalance:a?.previousBalance??null,currentBalance:a?.currentBalance??null,lastProcessed:a?.lastProcessed??null,lastProcessedBy:a?.lastProcessedBy??null,notes:a?.notes??'',totals:a?{allJobsTotal:a.allJobsTotal??0,cashJobsTotal:a.cashJobsTotal??0,accountJobsTotal:a.accountJobsTotal??0,cardJobsTotal:a.cardJobsTotal??0,driverTransactionsTotal:a.driverTransactionsTotal??0,groupTransactionsTotal:a.groupTransactionsTotal??0,pendingTransactionsTotal:a.pendingTransactionsTotal??0,paidInTotal:a.paidInTotal??0,paidOutTotal:a.paidOutTotal??0,vatAmount:a.vatAmount??0,allJobsCommission:a.allJobsCommission??0}:null}})}
async function getMergedDrivers(){const [d,a]=await Promise.all([getActiveDrivers(),getDriverAccounts()]);return mergeDrivers(d,a)}
function cacheRows(){return db.prepare('SELECT * FROM driver_cache ORDER BY CAST(callsign AS INTEGER), callsign').all().map(r=>({driverId:r.driver_id,callsign:r.callsign,forename:r.forename,surname:r.surname,fullName:r.full_name,mobile:r.mobile,email:r.email,active:Boolean(r.active),suspended:Boolean(r.suspended),previousBalance:r.previous_balance,currentBalance:r.current_balance,lastProcessed:r.last_processed,lastProcessedBy:r.last_processed_by,notes:r.notes,totals:r.totals_json?JSON.parse(r.totals_json):null,syncedAt:r.synced_at}))}
function cachedDriver(driverId){const r=db.prepare('SELECT * FROM driver_cache WHERE driver_id=?').get(driverId);if(!r)return null;return {driverId:r.driver_id,callsign:r.callsign,forename:r.forename,surname:r.surname,fullName:r.full_name,mobile:r.mobile,email:r.email,active:Boolean(r.active),suspended:Boolean(r.suspended),previousBalance:r.previous_balance,currentBalance:r.current_balance,lastProcessed:r.last_processed,lastProcessedBy:r.last_processed_by,notes:r.notes,totals:r.totals_json?JSON.parse(r.totals_json):null,syncedAt:r.synced_at}}
let syncInFlight=null;
async function syncAutocab(){if(syncInFlight)return syncInFlight;syncInFlight=(async()=>{const drivers=await getMergedDrivers(),now=new Date().toISOString();const st=db.prepare(`INSERT INTO driver_cache(driver_id,callsign,forename,surname,full_name,mobile,email,active,suspended,previous_balance,current_balance,last_processed,last_processed_by,notes,totals_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(driver_id) DO UPDATE SET callsign=excluded.callsign,forename=excluded.forename,surname=excluded.surname,full_name=excluded.full_name,mobile=excluded.mobile,email=excluded.email,active=excluded.active,suspended=excluded.suspended,previous_balance=excluded.previous_balance,current_balance=excluded.current_balance,last_processed=excluded.last_processed,last_processed_by=excluded.last_processed_by,notes=excluded.notes,totals_json=excluded.totals_json,synced_at=excluded.synced_at`);for(const d of drivers)st.run(d.driverId,d.callsign,d.forename,d.surname,d.fullName,d.mobile,d.email,d.active?1:0,d.suspended?1:0,d.previousBalance,d.currentBalance,d.lastProcessed,d.lastProcessedBy,d.notes,JSON.stringify(d.totals||null),now);return {drivers, syncedAt:now}})();try{return await syncInFlight}finally{syncInFlight=null}}
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
async function settlePayoutInAutocab(item){
 const d=cachedDriver(item.driver_id); const callsign=item.callsign||d?.callsign||String(item.driver_id);
 const adjustments=[];
 const fee=Number(item.type==='early'?item.fee:item.weekly_fee||0); const carried=Number(item.type==='weekly'?item.carried_charges||0:0); const paid=Number(item.net_amount||item.amount||0);
 if(fee>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:fee,isCredit:false,description:item.type==='early'?'FleetPay early payout fee':'FleetPay weekly app fee',adjustmentReason:'FleetPay Fee',eventKey:`payout:${item.id}:fee`}));
 if(carried>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:carried,isCredit:false,description:'FleetPay carried charge',adjustmentReason:'FleetPay Carried Charge',eventKey:`payout:${item.id}:carried`}));
 if(paid>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:paid,isCredit:false,description:item.type==='early'?'FleetPay early payout sent':'FleetPay weekly payout sent',adjustmentReason:'FleetPay Payout',eventKey:`payout:${item.id}:payment`}));
 return adjustments;
}
async function settlePaymentRequestInAutocab(item){
 const d=cachedDriver(item.driver_id); const callsign=item.callsign||d?.callsign||String(item.driver_id); const adjustments=[];
 const fee=Number(item.weekly_fee||0),carried=Number(item.carried_charges||0),received=Number(item.amount||0);
 if(fee>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:fee,isCredit:false,description:'FleetPay weekly app fee',adjustmentReason:'FleetPay Fee',eventKey:`request:${item.id}:fee`}));
 if(carried>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:carried,isCredit:false,description:'FleetPay carried charge',adjustmentReason:'FleetPay Carried Charge',eventKey:`request:${item.id}:carried`}));
 if(received>0) adjustments.push(await postAutocabAdjustment({driverId:item.driver_id,callsign,amount:received,isCredit:true,description:'FleetPay payment received',adjustmentReason:'FleetPay Payment',eventKey:`request:${item.id}:payment`}));
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

function ledger(driverId,entryType,direction,amount,feeAmount,description,referenceId,status='completed'){db.prepare('INSERT INTO driver_ledger(id,driver_id,entry_type,direction,amount,fee_amount,description,reference_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id('ledger'),driverId,entryType,direction,Number(amount||0),Number(feeAmount||0),description,referenceId,status,new Date().toISOString())}
async function createStripePaymentRequest(item){
 if(!stripe) return null;
 if(item.payment_url&&item.provider_session_id)return {id:item.provider_session_id,url:item.payment_url,reused:true};
 const d=cachedDriver(item.driver_id);
 const session=await stripe.checkout.sessions.create({
   mode:'payment',
   client_reference_id:item.id,
   customer_email:d?.email||undefined,
   success_url:`${PUBLIC_BASE_URL}/driver?payment=success`,
   cancel_url:`${PUBLIC_BASE_URL}/driver?payment=cancelled`,
   metadata:{fleetpay_request_id:item.id,callsign:String(item.callsign||'')},
   payment_intent_data:{metadata:{fleetpay_request_id:item.id,callsign:String(item.callsign||'')}},
   line_items:[{quantity:1,price_data:{currency:'gbp',unit_amount:Math.round(Number(item.amount)*100),product_data:{name:`FleetPay balance payment – Callsign ${item.callsign}`,description:'FleetPay weekly driver account payment request'}}}]
 });
 db.prepare('UPDATE payment_requests SET payment_url=?,provider=?,provider_session_id=?,updated_at=? WHERE id=?').run(session.url,'stripe',session.id,new Date().toISOString(),item.id);
 return session;
}
function serializePayoutRun(r){return {id:r.id,runType:r.run_type,status:r.status,createdAt:r.created_at,createdBy:r.created_by,scheduledFor:r.scheduled_for,totalAmount:r.total_amount,itemCount:r.item_count,provider:r.provider,providerRef:r.provider_ref,notes:r.notes,paidAt:r.paid_at}}
async function markPayoutPaid(item, req, source='manual'){
 if(item.status==='paid') return;
 const now=new Date().toISOString();
 db.prepare('UPDATE payouts SET status=?,paid_at=?,updated_at=? WHERE id=?').run('paid',now,now,item.id);
 ledger(item.driver_id,item.type==='early'?'early_payout':'weekly_payout','credit',Number(item.net_amount||item.amount||0),Number(item.fee||0),item.type==='early'?'Early payout paid':'Weekly payout paid',item.id,'paid');
 if(Number(item.fee||0)>0) ledger(item.driver_id,'early_payout_fee','debit',Number(item.fee||0),Number(item.fee||0),'Early payout fee',item.id,'charged');
 notify(item.driver_id,'Payment sent',`£${Number(item.net_amount||item.amount||0).toFixed(2)} has been paid to your assigned bank account.`,'success',item.id);
 try{await settlePayoutInAutocab(item);audit(req,'system','autocab','autocab_payout_adjusted','payout',item.id,{callsign:item.callsign});}catch(e){audit(req,'system','autocab','autocab_adjustment_failed','payout',item.id,{callsign:item.callsign,error:e.message});}
 audit(req,'admin',req?.auth?.email||source,'payout_paid','payout',item.id,{callsign:item.callsign,amount:Number(item.net_amount||item.amount||0),source});
}
async function sendEmail(to,subject,html){if(!RESEND_API_KEY||!RESEND_FROM_EMAIL)return {sent:false};const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:RESEND_FROM_EMAIL,to:[to],subject,html})});if(!r.ok)throw new Error(`Email provider error ${r.status}`);return {sent:true}}
function londonWindow(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return {weekday:v.weekday,hour:Number(v.hour),minute:Number(v.minute),date:`${v.year}-${v.month}-${v.day}`}}
function cutoffParts(settings){const raw=String(settings?.earlyPayoutCutoffTime||`${String(settings?.earlyPayoutCutoffHour??11).padStart(2,'0')}:00`);const m=raw.match(/^(\d{1,2}):(\d{2})$/);const hour=Math.min(23,Math.max(0,Number(m?.[1]??11))),minute=Math.min(59,Math.max(0,Number(m?.[2]??0)));return {hour,minute,label:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`}}
function addBusinessDays(dateStr,days=1){let d=new Date(`${dateStr}T12:00:00Z`),left=days;while(left>0){d.setUTCDate(d.getUTCDate()+1);const wd=d.getUTCDay();if(wd!==0&&wd!==6)left--;}return d.toISOString().slice(0,10)}
function formatRunDate(dateStr){return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'short'}).format(new Date(`${dateStr}T12:00:00Z`))}
function earlyPayoutTiming(settings){const now=londonWindow(),cut=cutoffParts(settings),requestDayAllowed=['Tue','Wed','Thu','Fri'].includes(now.weekday);const beforeCutoff=now.hour<cut.hour||(now.hour===cut.hour&&now.minute<=cut.minute);let runDate=now.date;if(!beforeCutoff)runDate=addBusinessDays(now.date,1);return {requestDayAllowed,beforeCutoff,afterCutoff:!beforeCutoff,runDate,cutoff:cut.label,runLabel:formatRunDate(runDate)}}
function earlyPayoutWindowMessage(settings){const t=earlyPayoutTiming(settings);if(!t.requestDayAllowed)return `Early payout requests are available Tuesday to Friday. The same-day cutoff is ${t.cutoff}.`;if(t.beforeCutoff)return `Request by ${t.cutoff} for today's payment run, subject to approval. Requests after ${t.cutoff} are accepted and queued for the next business-day run.`;return `Today's ${t.cutoff} cutoff has passed. You can still request now; if approved, it will be queued for the ${t.runLabel} payment run.`}

app.get('/api/health',(_q,res)=>res.json({ok:true,configured:Boolean(API_KEY),database:'sqlite',databasePath:'data/fleetpay.sqlite'}));
app.post('/api/admin/login',(req,res)=>{const email=safeEmail(req.body.email),pass=String(req.body.password||'');if(email!==ADMIN_EMAIL||pass!==ADMIN_PASSWORD){audit(req,'admin',email,'login_failed');return res.status(401).json({error:'Incorrect admin email or password'})}audit(req,'admin',email,'login_success');res.json({token:signToken({role:'admin',email},12),email})});


app.get('/api/admin/integrations',adminAuth,(req,res)=>{res.json({stripe:{configured:Boolean(STRIPE_SECRET_KEY),testMode:STRIPE_SECRET_KEY.startsWith('sk_test_')},wise:{configured:Boolean(WISE_API_TOKEN),environment:WISE_ENV,profileId:WISE_PROFILE_ID||null},autocab:{configured:Boolean(API_KEY),adjustmentsEnabled:AUTOCAB_ADJUSTMENTS_ENABLED},push:{configured:Boolean(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY),publicKey:VAPID_PUBLIC_KEY||null}})});
app.post('/api/admin/integrations/wise/test',adminAuth,async(req,res)=>{try{const out=await testWiseConnection();audit(req,'admin',req.auth.email,'wise_connection_test','integration','wise',{environment:WISE_ENV});res.json(out)}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/autocab/test-adjustment',adminAuth,async(req,res)=>{try{const callsign=String(req.body.callsign||'').trim();const d=cacheRows().find(x=>String(x.callsign)===callsign);if(!d)return res.status(404).json({error:'Callsign not found in FleetPay cache'});const amount=Number(req.body.amount||0);if(!(amount>0))return res.status(400).json({error:'Amount must be greater than zero'});const result=await postAutocabAdjustment({driverId:d.driverId,callsign:d.callsign,amount,isCredit:Boolean(req.body.isCredit),description:String(req.body.description||'FleetPay test adjustment'),adjustmentReason:String(req.body.adjustmentReason||'FleetPay Test'),eventKey:`test:${Date.now()}:${d.driverId}`,force:true});audit(req,'admin',req.auth.email,'autocab_test_adjustment','driver',d.callsign,{callsign:d.callsign,amount,isCredit:Boolean(req.body.isCredit)});setTimeout(()=>syncAutocab().catch(()=>{}),500);res.json({ok:true,driver:{driverId:d.driverId,callsign:d.callsign,fullName:d.fullName},result})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/autocab/adjustments',adminAuth,(req,res)=>{const rows=db.prepare('SELECT id,event_key eventKey,driver_id driverId,callsign,amount,is_credit isCredit,description,adjustment_reason adjustmentReason,status,created_at createdAt,completed_at completedAt,error FROM autocab_adjustments ORDER BY created_at DESC LIMIT 250').all().map(x=>({...x,isCredit:Boolean(x.isCredit)}));res.json({adjustments:rows})});
app.get('/api/admin/dashboard',adminAuth,(req,res)=>{const drivers=cacheRows();const matched=drivers.filter(d=>d.currentBalance!==null).length;const owedOut=drivers.reduce((s,d)=>s+Math.max(0,Number(d.currentBalance||0)),0),owedIn=drivers.reduce((s,d)=>s+Math.max(0,-Number(d.currentBalance||0)),0);const stats={count:drivers.length,matched,unmatched:drivers.length-matched,owedOut,owedIn,openPaymentRequests:Number(db.prepare("SELECT COUNT(*) c FROM payment_requests WHERE status='open'").get().c),queuedPayouts:Number(db.prepare("SELECT COUNT(*) c FROM payouts WHERE status IN ('queued','requested','approved','batched')").get().c),pendingUsers:Number(db.prepare('SELECT COUNT(*) c FROM driver_users WHERE approved=0').get().c)};const lastSync=db.prepare('SELECT MAX(synced_at) lastSync FROM driver_cache').get()?.lastSync||null;res.json({fetchedAt:new Date().toISOString(),lastSync,stats,drivers})});
app.get('/api/drivers',adminAuth,(req,res)=>{const drivers=cacheRows();const matched=drivers.filter(d=>d.currentBalance!==null).length;const lastSync=db.prepare('SELECT MAX(synced_at) lastSync FROM driver_cache').get()?.lastSync||null;res.json({fetchedAt:new Date().toISOString(),lastSync,count:drivers.length,matched,unmatched:drivers.length-matched,drivers})});
app.post('/api/admin/sync',adminAuth,async(req,res)=>{try{const out=await syncAutocab();audit(req,'admin',req.auth.email,'autocab_sync','driver_cache','all',{count:out.drivers.length});res.json({ok:true,count:out.drivers.length,syncedAt:out.syncedAt})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/settings',adminAuth,(req,res)=>res.json(getSettings()));
app.put('/api/settings',adminAuth,(req,res)=>{const cur=getSettings(),s=req.body||{};let cutoff=String(s.earlyPayoutCutoffTime??cur.earlyPayoutCutoffTime??`${String(cur.earlyPayoutCutoffHour??11).padStart(2,'0')}:00`);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff))cutoff='11:00';const next={negativeThreshold:Math.max(0,Number(s.negativeThreshold??cur.negativeThreshold)),weeklyAppFee:Math.max(0,Number(s.weeklyAppFee??cur.weeklyAppFee)),earlyPayoutFee:Math.max(0,Number(s.earlyPayoutFee??cur.earlyPayoutFee)),earlyPayoutCutoffTime:cutoff,earlyPayoutCutoffHour:Number(cutoff.split(':')[0]),syncMinutes:Math.min(60,Math.max(2,Number(s.syncMinutes??cur.syncMinutes))),requireAdminApproval:Boolean(s.requireAdminApproval),companyName:String(s.companyName||cur.companyName),productName:'FleetPay'};setSettings(next);audit(req,'admin',req.auth.email,'settings_updated','settings','global',next);res.json(next)});

app.get('/api/admin/users',adminAuth,(req,res)=>{res.json(db.prepare('SELECT id,driver_id as driverId,callsign,email,approved,created_at as createdAt,last_login_at as lastLoginAt FROM driver_users ORDER BY CAST(callsign AS INTEGER), callsign').all().map(x=>({...x,approved:Boolean(x.approved)})))});
app.patch('/api/admin/users/:id',adminAuth,(req,res)=>{const u=db.prepare('SELECT * FROM driver_users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'User not found'});const approved='approved'in req.body?(req.body.approved?1:0):u.approved;db.prepare('UPDATE driver_users SET approved=?,updated_at=? WHERE id=?').run(approved,new Date().toISOString(),u.id);audit(req,'admin',req.auth.email,approved?'driver_user_approved':'driver_user_suspended','driver_user',u.id,{driverId:u.driver_id,callsign:u.callsign});res.json({ok:true})});

app.get('/api/admin/settlements',adminAuth,(req,res)=>{const runs=db.prepare('SELECT * FROM settlement_runs ORDER BY created_at DESC').all().map(r=>({id:r.id,createdAt:r.created_at,status:r.status,settings:JSON.parse(r.settings_json),items:JSON.parse(r.items_json)}));const payouts=db.prepare('SELECT *, driver_id driverId, driver_name driverName, gross_balance grossBalance, weekly_fee weeklyFee, carried_charges carriedCharges, gross_amount grossAmount, net_amount netAmount, payout_run_id payoutRunId, created_at createdAt, updated_at updatedAt, paid_at paidAt, decline_reason declineReason, eligible_run_date eligibleRunDate, submitted_after_cutoff submittedAfterCutoff FROM payouts ORDER BY created_at DESC').all();const paymentRequests=db.prepare('SELECT *, driver_id driverId, driver_name driverName, weekly_fee weeklyFee, carried_charges carriedCharges, payment_url paymentUrl, provider_session_id providerSessionId, created_at createdAt, updated_at updatedAt, paid_at paidAt FROM payment_requests ORDER BY created_at DESC').all();const payoutRuns=db.prepare('SELECT * FROM payout_runs ORDER BY created_at DESC').all().map(serializePayoutRun);res.json({runs,payoutRuns,payouts,paymentRequests,earlyPayoutRequests:payouts.filter(x=>x.type==='early')})});
app.post('/api/admin/settlements/monday',adminAuth,async(req,res)=>{try{const settings=getSettings(),sync=await syncAutocab(),drivers=sync.drivers,runId=id('run'),createdAt=new Date().toISOString(),items=[];const insP=db.prepare('INSERT INTO payouts(id,run_id,driver_id,callsign,driver_name,gross_balance,weekly_fee,carried_charges,amount,type,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');const insR=db.prepare('INSERT INTO payment_requests(id,run_id,driver_id,callsign,driver_name,balance,weekly_fee,carried_charges,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');for(const d of drivers){if(d.currentBalance==null)continue;const row=db.prepare('SELECT amount FROM carried_charges WHERE driver_id=?').get(d.driverId);const carried=Number(row?.amount||0),fee=Number(settings.weeklyAppFee||0),adjusted=Number(d.currentBalance)-fee-carried;let action='none',amount=0;if(adjusted>0.00001){action='payout';amount=adjusted;insP.run(id('payout'),runId,d.driverId,d.callsign,d.fullName,d.currentBalance,fee,carried,amount,'weekly','queued',createdAt);db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}else if(adjusted<-0.00001){const due=Math.abs(adjusted);amount=due;if(due>=Number(settings.negativeThreshold||0)){action='payment_request';const requestId=id('request');insR.run(requestId,runId,d.driverId,d.callsign,d.fullName,d.currentBalance,fee,carried,due,'open',createdAt);notify(d.driverId,'Payment due',`Your Monday FleetPay settlement has an amount due of £${due.toFixed(2)}. Open FleetPay to pay securely by card.`,'warning',requestId);db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}else{action='carry_forward';db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,?) ON CONFLICT(driver_id) DO UPDATE SET amount=excluded.amount').run(d.driverId,due)}}else{db.prepare('INSERT INTO carried_charges(driver_id,amount) VALUES(?,0) ON CONFLICT(driver_id) DO UPDATE SET amount=0').run(d.driverId)}if(fee>0)ledger(d.driverId,'weekly_fee','debit',fee,fee,'Weekly FleetPay fee',runId,'charged');items.push({driverId:d.driverId,callsign:d.callsign,driverName:d.fullName,currentBalance:d.currentBalance,previousBalance:d.previousBalance,weeklyFee:fee,carriedCharges:carried,adjustedBalance:adjusted,action,amount})}db.prepare('INSERT INTO settlement_runs(id,created_at,status,settings_json,items_json) VALUES(?,?,?,?,?)').run(runId,createdAt,'completed',JSON.stringify(settings),JSON.stringify(items));audit(req,'admin',req.auth.email,'monday_settlement_run','settlement_run',runId,{drivers:items.length,payouts:items.filter(x=>x.action==='payout').length,paymentRequests:items.filter(x=>x.action==='payment_request').length});res.json({id:runId,createdAt,status:'completed',settings,items})}catch(e){res.status(500).json({error:e.message})}});
app.patch('/api/admin/payouts/:id',adminAuth,async(req,res)=>{const item=db.prepare('SELECT * FROM payouts WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payout not found'});const status=String(req.body.status||item.status),reason=String(req.body.reason||'').trim(),now=new Date().toISOString();if(status==='declined'&&!reason)return res.status(400).json({error:'A decline reason is required'});db.prepare('UPDATE payouts SET status=?,decline_reason=?,decision_at=?,decision_by=?,updated_at=? WHERE id=?').run(status,status==='declined'?reason:null,['approved','declined'].includes(status)?now:item.decision_at,['approved','declined'].includes(status)?req.auth.email:item.decision_by,now,item.id);if(item.type==='early'&&status==='approved'&&item.status!=='approved'){const runDate=item.eligible_run_date||londonWindow().date;const today=londonWindow().date;const timing=runDate===today?'Payment will be made to your assigned bank account by midday today.':`It has been approved for the ${formatRunDate(runDate)} payment run.`;notify(item.driver_id,'Early payout approved',`Your early payout of £${Number(item.net_amount||item.amount||0).toFixed(2)} has been approved. ${timing}`,'success',item.id)}if(item.type==='early'&&status==='declined'&&item.status!=='declined'){notify(item.driver_id,'Early payout declined',`Your early payout request was declined. Reason: ${reason}`,'warning',item.id)}if(status==='paid'&&item.status!=='paid'){await markPayoutPaid(item,req)}audit(req,'admin',req.auth.email,'payout_status_changed','payout',item.id,{from:item.status,to:status,reason});res.json({ok:true,status,reason})});

app.post('/api/admin/payout-runs',adminAuth,(req,res)=>{
 const runType=String(req.body.runType||'early');if(!['early','weekly'].includes(runType))return res.status(400).json({error:'runType must be early or weekly'});
 const today=londonWindow().date;const eligible=runType==='early'?db.prepare("SELECT * FROM payouts WHERE type='early' AND status='approved' AND payout_run_id IS NULL AND (eligible_run_date IS NULL OR eligible_run_date<=?) ORDER BY COALESCE(eligible_run_date,substr(created_at,1,10)),created_at").all(today):db.prepare("SELECT * FROM payouts WHERE type='weekly' AND status='queued' AND payout_run_id IS NULL ORDER BY created_at").all();
 if(!eligible.length)return res.status(400).json({error:`No ${runType} payouts are ready to batch`});
 const runId=id('payrun'),now=new Date().toISOString(),total=eligible.reduce((s,x)=>s+Number(x.net_amount||x.amount||0),0);
 db.prepare('INSERT INTO payout_runs(id,run_type,status,created_at,created_by,scheduled_for,total_amount,item_count,provider,notes) VALUES(?,?,?,?,?,?,?,?,?,?)').run(runId,runType,'ready',now,req.auth.email,now,total,eligible.length,String(req.body.provider||'manual'),String(req.body.notes||''));
 const upd=db.prepare("UPDATE payouts SET payout_run_id=?,status='batched',updated_at=? WHERE id=?");for(const x of eligible)upd.run(runId,now,x.id);
 audit(req,'admin',req.auth.email,'payout_run_created','payout_run',runId,{runType,itemCount:eligible.length,totalAmount:total,callsigns:eligible.map(x=>x.callsign)});
 res.json({run:serializePayoutRun(db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId)),items:eligible.map(x=>({id:x.id,callsign:x.callsign,driverName:x.driver_name,amount:Number(x.net_amount||x.amount||0)}))});
});
app.patch('/api/admin/payout-runs/:id',adminAuth,async(req,res)=>{
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});const status=String(req.body.status||run.status),now=new Date().toISOString();
 if(status==='paid'&&run.status!=='paid'){const items=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(run.id);for(const item of items)await markPayoutPaid(item,req,'payout_run');db.prepare('UPDATE payout_runs SET status=?,paid_at=? WHERE id=?').run('paid',now,run.id);audit(req,'admin',req.auth.email,'payout_run_paid','payout_run',run.id,{runType:run.run_type,itemCount:items.length,totalAmount:run.total_amount,callsigns:items.map(x=>x.callsign)});}else db.prepare('UPDATE payout_runs SET status=? WHERE id=?').run(status,run.id);
 res.json({ok:true});
});

app.post('/api/admin/payout-runs/:id/wise-sandbox',adminAuth,async(req,res)=>{try{
 if(WISE_ENV!=='sandbox')return res.status(400).json({error:'WISE_ENV must be sandbox for demo submission'});
 const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});
 const wise=await testWiseConnection();const ref=`wise_sandbox_${Date.now()}`;
 db.prepare('UPDATE payout_runs SET status=?,provider=?,provider_ref=? WHERE id=?').run('submitted_sandbox','wise_sandbox',ref,run.id);
 audit(req,'admin',req.auth.email,'wise_sandbox_run_submitted','payout_run',run.id,{runType:run.run_type,itemCount:run.item_count,totalAmount:run.total_amount,providerRef:ref});
 res.json({ok:true,demo:true,message:'Wise sandbox demo submission recorded. No real money moved.',providerRef:ref,wiseEnvironment:wise.environment});
 }catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/payout-runs/:id/csv',adminAuth,(req,res)=>{const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(req.params.id);if(!run)return res.status(404).json({error:'Payout run not found'});const items=db.prepare('SELECT callsign,driver_name,net_amount,amount,type,status FROM payouts WHERE payout_run_id=? ORDER BY CAST(callsign AS INTEGER),callsign').all(run.id);const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;const csv=['Callsign,Driver,Amount,Type,Status',...items.map(x=>[esc(x.callsign),esc(x.driver_name),Number(x.net_amount||x.amount||0).toFixed(2),x.type,x.status].join(','))].join('\n');res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition',`attachment; filename=FleetPay-${run.run_type}-${run.id}.csv`);res.send(csv)});

app.post('/api/admin/payment-requests/:id/stripe',adminAuth,async(req,res)=>{try{if(!stripe)return res.status(400).json({error:'Stripe is not configured. Add STRIPE_SECRET_KEY to .env'});const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payment request not found'});if(item.status==='paid')return res.status(400).json({error:'This payment request is already paid'});const session=await createStripePaymentRequest(item);audit(req,'admin',req.auth.email,'stripe_payment_request_created','payment_request',item.id,{callsign:item.callsign,amount:item.amount,sessionId:session.id});res.json({ok:true,paymentUrl:session.url})}catch(e){res.status(500).json({error:e.message})}});
app.patch('/api/admin/payment-requests/:id',adminAuth,async(req,res)=>{const item=db.prepare('SELECT * FROM payment_requests WHERE id=?').get(req.params.id);if(!item)return res.status(404).json({error:'Payment request not found'});const status='status'in req.body?String(req.body.status):item.status,url='paymentUrl'in req.body?(req.body.paymentUrl?String(req.body.paymentUrl):null):item.payment_url;const now=new Date().toISOString();db.prepare('UPDATE payment_requests SET status=?,payment_url=?,paid_at=CASE WHEN ?=\'paid\' THEN ? ELSE paid_at END,updated_at=? WHERE id=?').run(status,url,status,now,now,item.id);if(status==='paid'&&item.status!=='paid'){ledger(item.driver_id,'payment_received','debit',Number(item.amount||0),0,'Payment received',item.id,'paid');notify(item.driver_id,'Payment received',`We have received your payment of £${Number(item.amount||0).toFixed(2)}.`,'success',item.id);try{await settlePaymentRequestInAutocab(item);audit(req,'system','autocab','autocab_payment_adjusted','payment_request',item.id,{callsign:item.callsign,amount:item.amount})}catch(e){audit(req,'system','autocab','autocab_adjustment_failed','payment_request',item.id,{callsign:item.callsign,error:e.message})}}audit(req,'admin',req.auth.email,'payment_request_updated','payment_request',item.id,{status,paymentUrl:Boolean(url)});res.json({ok:true,status,paymentUrl:url})});

app.get('/api/admin/logs',adminAuth,(req,res)=>{const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));const rows=db.prepare('SELECT id,created_at as createdAt,actor_type as actorType,actor_id as actorId,action,entity_type as entityType,entity_id as entityId,details_json as detailsJson,ip FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit).map(r=>{const details=JSON.parse(r.detailsJson||'{}');let actorId=r.actorId;if(r.actorType==='driver'&&/^\d+$/.test(String(actorId||''))){actorId=cachedDriver(Number(actorId))?.callsign||actorId}return {...r,actorId,details}});res.json({logs:rows})});

app.post('/api/driver/register/start',async(req,res)=>{try{const callsign=String(req.body.callsign||'').trim(),email=safeEmail(req.body.email),mobileLast4=String(req.body.mobileLast4||'').replace(/\D/g,'');if(!callsign||!email||mobileLast4.length!==4)return res.status(400).json({error:'Callsign, Autocab email and last 4 mobile digits are required'});let drivers=cacheRows();if(!drivers.length){try{await syncAutocab();drivers=cacheRows()}catch{}}const d=drivers.find(x=>String(x.callsign).trim().toLowerCase()===callsign.toLowerCase());if(!d||safeEmail(d.email)!==email||last4(d.mobile)!==mobileLast4)return res.status(400).json({error:'Details do not match the active Autocab driver record'});if(db.prepare('SELECT id FROM driver_users WHERE driver_id=?').get(d.driverId))return res.status(409).json({error:'This driver account has already been registered'});const code=String(Math.floor(100000+Math.random()*900000)),challenge=id('verify'),expires=Date.now()+10*60000;db.prepare('DELETE FROM auth_challenges WHERE driver_id=? OR expires_at<?').run(d.driverId,Date.now());db.prepare('INSERT INTO auth_challenges(id,type,driver_id,callsign,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(challenge,'register',d.driverId,d.callsign,email,crypto.createHash('sha256').update(code).digest('hex'),expires,new Date().toISOString());await sendEmail(email,'Your FleetPay verification code',`<p>Your FleetPay verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`);audit(req,'driver',d.driverId,'registration_started','driver',d.driverId,{callsign:d.callsign});res.json({challengeId:challenge,message:'Verification code sent to the email stored in Autocab',...(DEV_AUTH_CODES?{devCode:code}:{})})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/register/complete',(req,res)=>{const c=db.prepare('SELECT * FROM auth_challenges WHERE id=? AND type=?').get(req.body.challengeId,'register');if(!c||c.expires_at<Date.now())return res.status(400).json({error:'Verification code expired or invalid'});const h=crypto.createHash('sha256').update(String(req.body.code||'')).digest('hex');if(h!==c.code_hash)return res.status(400).json({error:'Incorrect verification code'});const password=String(req.body.password||'');if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const p=hashPassword(password),now=new Date().toISOString(),approved=getSettings().requireAdminApproval?0:1,userId=id('user');db.prepare('INSERT INTO driver_users(id,driver_id,callsign,email,password_hash,password_salt,approved,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(userId,c.driver_id,c.callsign,c.email,p.hash,p.salt,approved,now,now);db.prepare('DELETE FROM auth_challenges WHERE id=?').run(c.id);audit(req,'driver',c.driver_id,'registration_completed','driver_user',userId,{approved:Boolean(approved)});if(!approved)return res.json({pendingApproval:true});res.json({token:signToken({driverId:c.driver_id,userId}),callsign:c.callsign})});
app.post('/api/driver/login',(req,res)=>{const email=safeEmail(req.body.email),u=db.prepare('SELECT * FROM driver_users WHERE email=?').get(email);if(!u||!verifyPassword(String(req.body.password||''),u.password_salt,u.password_hash)){audit(req,'driver',email,'login_failed');return res.status(401).json({error:'Incorrect email or password'})}if(!u.approved)return res.status(403).json({error:'Your account is waiting for administrator approval'});db.prepare('UPDATE driver_users SET last_login_at=?,updated_at=? WHERE id=?').run(new Date().toISOString(),new Date().toISOString(),u.id);audit(req,'driver',u.driver_id,'login_success','driver_user',u.id);res.json({token:signToken({driverId:u.driver_id,userId:u.id}),callsign:u.callsign})});
app.post('/api/driver/forgot-password/start',async(req,res)=>{const email=safeEmail(req.body.email),u=db.prepare('SELECT * FROM driver_users WHERE email=?').get(email);if(!u)return res.json({message:'If that email is registered, a reset code has been sent.'});const code=String(Math.floor(100000+Math.random()*900000)),challenge=id('reset');db.prepare("DELETE FROM auth_challenges WHERE type='reset' AND email=?").run(email);db.prepare('INSERT INTO auth_challenges(id,type,driver_id,callsign,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(challenge,'reset',u.driver_id,u.callsign,email,crypto.createHash('sha256').update(code).digest('hex'),Date.now()+10*60000,new Date().toISOString());await sendEmail(email,'FleetPay password reset code',`<p>Your FleetPay password reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`);audit(req,'driver',u.driver_id,'password_reset_started','driver_user',u.id);res.json({challengeId:challenge,message:'If that email is registered, a reset code has been sent.',...(DEV_AUTH_CODES?{devCode:code}:{})})});
app.post('/api/driver/forgot-password/complete',(req,res)=>{const c=db.prepare("SELECT * FROM auth_challenges WHERE id=? AND type='reset'").get(req.body.challengeId);if(!c||c.expires_at<Date.now())return res.status(400).json({error:'Reset code expired or invalid'});if(crypto.createHash('sha256').update(String(req.body.code||'')).digest('hex')!==c.code_hash)return res.status(400).json({error:'Incorrect reset code'});const password=String(req.body.password||'');if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const p=hashPassword(password);db.prepare('UPDATE driver_users SET password_hash=?,password_salt=?,updated_at=? WHERE driver_id=?').run(p.hash,p.salt,new Date().toISOString(),c.driver_id);db.prepare('DELETE FROM auth_challenges WHERE id=?').run(c.id);audit(req,'driver',c.driver_id,'password_reset_completed','driver_user',c.driver_id);res.json({ok:true})});


app.get('/api/driver/push-config',driverAuth,(req,res)=>res.json({enabled:Boolean(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY),publicKey:VAPID_PUBLIC_KEY||null}));
app.post('/api/driver/push-subscription',driverAuth,(req,res)=>{try{const sub=req.body.subscription;if(!sub?.endpoint)return res.status(400).json({error:'Invalid push subscription'});const now=new Date().toISOString();db.prepare('INSERT INTO push_subscriptions(id,driver_id,endpoint,subscription_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET driver_id=excluded.driver_id,subscription_json=excluded.subscription_json,updated_at=excluded.updated_at').run(id('push'),req.auth.driverId,sub.endpoint,JSON.stringify(sub),now,now);audit(req,'driver',req.auth.driverId,'push_notifications_enabled','driver',req.auth.driverId);res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/push-test',driverAuth,async(req,res)=>{const d=cachedDriver(req.auth.driverId);await sendPush(req.auth.driverId,'FleetPay test notification',`Push notifications are working for callsign ${d?.callsign||''}.`);res.json({ok:true})});
app.post('/api/driver/payment-requests/:id/checkout',driverAuth,async(req,res)=>{try{if(!stripe)return res.status(400).json({error:'Card payments are not currently available. Please contact the office.'});const item=db.prepare('SELECT * FROM payment_requests WHERE id=? AND driver_id=?').get(req.params.id,req.auth.driverId);if(!item)return res.status(404).json({error:'Payment request not found'});if(item.status==='paid')return res.status(400).json({error:'This payment has already been received'});const session=await createStripePaymentRequest(item);audit(req,'driver',req.auth.driverId,'stripe_checkout_started','payment_request',item.id,{callsign:item.callsign,amount:item.amount,sessionId:session.id});res.json({ok:true,paymentUrl:session.url})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/driver/me',driverAuth,(req,res)=>{try{const d=cachedDriver(req.auth.driverId);if(!d)return res.status(404).json({error:'Driver record is not yet available. Please try again after the next FleetPay sync.'});const settings=getSettings();const paymentRequests=db.prepare("SELECT id,amount,status,provider,created_at createdAt FROM payment_requests WHERE driver_id=? AND status IN ('open','pending') ORDER BY created_at DESC").all(d.driverId);const early=db.prepare("SELECT id,gross_amount grossAmount,fee,net_amount netAmount,status,decline_reason declineReason,decision_at decisionAt,eligible_run_date eligibleRunDate,submitted_after_cutoff submittedAfterCutoff,created_at createdAt FROM payouts WHERE driver_id=? AND type='early' ORDER BY created_at DESC").all(d.driverId);const reserved=early.filter(x=>['requested','approved','batched'].includes(x.status)).reduce((s,x)=>s+Number(x.grossAmount||0),0),available=Math.max(0,Number(d.currentBalance||0)-reserved);const ledgerRows=db.prepare('SELECT id,entry_type entryType,direction,amount,fee_amount feeAmount,description,reference_id referenceId,status,created_at createdAt FROM driver_ledger WHERE driver_id=? ORDER BY created_at DESC LIMIT 100').all(d.driverId);const notifications=db.prepare('SELECT id,title,message,type,read_at readAt,created_at createdAt FROM driver_notifications WHERE driver_id=? ORDER BY created_at DESC LIMIT 20').all(d.driverId);res.json({driver:{driverId:d.driverId,callsign:d.callsign,fullName:d.fullName,email:d.email,mobile:d.mobile,currentBalance:d.currentBalance,previousBalance:d.previousBalance,lastProcessed:d.lastProcessed,syncedAt:d.syncedAt},settings:{weeklyAppFee:settings.weeklyAppFee,earlyPayoutFee:settings.earlyPayoutFee,earlyPayoutCutoffTime:cutoffParts(settings).label},paymentRequests,earlyPayoutRequests:early,ledger:ledgerRows,notifications,stripeConfigured:Boolean(stripe),reservedForEarlyPayout:reserved,earlyPayoutAllowed:earlyPayoutTiming(settings).requestDayAllowed,earlyPayoutTiming:earlyPayoutTiming(settings),earlyPayoutWindowMessage:earlyPayoutWindowMessage(settings),availableForEarlyPayout:available})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/early-payout',driverAuth,(req,res)=>{try{const settings=getSettings(),timing=earlyPayoutTiming(settings);if(!timing.requestDayAllowed)return res.status(400).json({error:earlyPayoutWindowMessage(settings)});const d=cachedDriver(req.auth.driverId);if(!d)return res.status(404).json({error:'Driver not found in FleetPay cache'});const early=db.prepare("SELECT gross_amount,status FROM payouts WHERE driver_id=? AND type='early'").all(d.driverId);const reserved=early.filter(x=>['requested','approved','batched'].includes(x.status)).reduce((s,x)=>s+Number(x.gross_amount||0),0),available=Math.max(0,Number(d.currentBalance||0)-reserved),gross=Number(req.body.amount||0),fee=Number(settings.earlyPayoutFee||0);if(gross<=fee)return res.status(400).json({error:`Requested amount must be greater than the £${fee.toFixed(2)} fee`});if(gross>available+0.00001)return res.status(400).json({error:'Requested amount exceeds your available current balance'});const itemId=id('early'),now=new Date().toISOString();db.prepare('INSERT INTO payouts(id,driver_id,callsign,driver_name,gross_amount,fee,net_amount,amount,type,status,created_at,eligible_run_date,submitted_after_cutoff) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(itemId,d.driverId,d.callsign,d.fullName,gross,fee,gross-fee,gross-fee,'early','requested',now,timing.runDate,timing.afterCutoff?1:0);const timingText=timing.beforeCutoff?'It is eligible for today\'s payment run if approved.':`Today's ${timing.cutoff} cutoff has passed, so it is queued for the ${timing.runLabel} payment run if approved.`;notify(d.driverId,'Payout request received',`Your request for £${(gross-fee).toFixed(2)} after the £${fee.toFixed(2)} fee is awaiting approval. ${timingText}`,'info',itemId);audit(req,'driver',d.driverId,'early_payout_requested','payout',itemId,{gross,fee,net:gross-fee,eligibleRunDate:timing.runDate,submittedAfterCutoff:timing.afterCutoff});res.json({id:itemId,grossAmount:gross,fee,netAmount:gross-fee,status:'requested',createdAt:now,eligibleRunDate:timing.runDate,submittedAfterCutoff:timing.afterCutoff,message:timingText})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/driver/notifications/read',driverAuth,(req,res)=>{db.prepare('UPDATE driver_notifications SET read_at=? WHERE driver_id=? AND read_at IS NULL').run(new Date().toISOString(),req.auth.driverId);res.json({ok:true})});

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename),dist=path.resolve(__dirname,'../dist');app.use(express.static(dist));app.get('*',(req,res,next)=>{if(req.path.startsWith('/api'))return next();res.sendFile(path.join(dist,'index.html'),e=>e&&next())});
function scheduleSync(){if(!API_KEY)return;const minutes=Math.max(2,Number(getSettings().syncMinutes||10));setTimeout(async()=>{try{const r=await syncAutocab();console.log(`FleetPay scheduled sync: ${r.drivers.length} drivers`)}catch(e){console.error('Scheduled Autocab sync failed:',e.message)}finally{scheduleSync()}},minutes*60000)}
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FleetPay server running on port ${PORT} · DB ${DB_PATH}`);

  if (API_KEY) {
    syncAutocab()
      .then(r => console.log(`FleetPay initial Autocab sync: ${r.drivers.length} drivers`))
      .catch(e => console.error('Initial Autocab sync failed:', e.message))
      .finally(scheduleSync);
  }
});