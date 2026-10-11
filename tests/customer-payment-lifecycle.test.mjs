import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';

const source=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
const beginning=source.indexOf('function autocabCustomerPaymentValues(booking){');
const end=source.indexOf("app.post(['/api/webhooks/autocab/booking-complete'",beginning);
assert.ok(beginning>0 && end>beginning,'Payment guard implementation must exist');
const actualFunctions=source.slice(beginning,end);

function fixture({stripeFails=false}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE customer_payments (
  id TEXT PRIMARY KEY, booking_id TEXT, source TEXT, status TEXT,
  payment_status TEXT,driver_settlement_status TEXT,driver_settlement_note TEXT,updated_at TEXT,
  provider_session_id TEXT
 )`);
 const expired=[];
 const stripe={checkout:{sessions:{expire:async id=>{
  expired.push(id);
  if(stripeFails)throw new Error('simulated Stripe failure');
 }}}};
 const context={db,Date,console:{warn:()=>{},error:()=>{}},audit:()=>{},getStripeClient:()=>stripe};
 const functions=vm.runInNewContext(actualFunctions+'\n({autocabCustomerPaymentValues,customerPaymentCashEligible,invalidateUnpaidBookingPayments})',context);
 const add=(id,source,status='open',paymentStatus='open')=>db.prepare(`INSERT INTO customer_payments
  (id,booking_id,source,status,payment_status,provider_session_id)
  VALUES (?,?,?,?,?,?)`).run(id,'B123',source,status,paymentStatus,`stripe_${id}`);
 return {db,expired,add,...functions};
}

test('payment method requires unambiguous Cash in both Autocab fields',()=>{
 const f=fixture();
 assert.equal(f.customerPaymentCashEligible({PaymentType:'Cash',PaymentMethod:'Cash'}),true);
 assert.equal(f.customerPaymentCashEligible({PaymentType:'Cash',PaymentMethod:'Card'}),false);
 assert.equal(f.customerPaymentCashEligible({PaymentType:'Account'}),false);
 assert.equal(f.customerPaymentCashEligible({}),false);
 f.db.close();
});

test('invalidates unpaid records for both sources and preserves paid payment',async()=>{
 const f=fixture();
 f.add('a','autocab_booking_created');
 f.add('b','driver_live_booking');
 f.add('c','office_manual');
 f.add('d','driver_live_booking','paid','paid');
 assert.equal(await f.invalidateUnpaidBookingPayments('B123','test'),2);
 assert.equal(f.db.prepare("SELECT status FROM customer_payments WHERE id='a'").get().status,'cancelled');
 assert.equal(f.db.prepare("SELECT status FROM customer_payments WHERE id='b'").get().status,'cancelled');
 assert.equal(f.db.prepare("SELECT status FROM customer_payments WHERE id='c'").get().status,'open');
 assert.equal(f.db.prepare("SELECT status FROM customer_payments WHERE id='d'").get().status,'paid');
 assert.deepEqual(f.expired.sort(),['stripe_a','stripe_b']);
 f.db.close();
});

test('duplicate invalidation is idempotent',async()=>{
 const f=fixture();f.add('a','driver_live_booking');
 assert.equal(await f.invalidateUnpaidBookingPayments('B123','first'),1);
 assert.equal(await f.invalidateUnpaidBookingPayments('B123','duplicate'),0);
 assert.deepEqual(f.expired,['stripe_a']);f.db.close();
});

test('Stripe failure leaves link locally blocked rather than reopening',async()=>{
 const f=fixture({stripeFails:true});f.add('a','driver_live_booking');
 assert.equal(await f.invalidateUnpaidBookingPayments('B123','stripe_fails'),1);
 assert.equal(f.db.prepare("SELECT status FROM customer_payments WHERE id='a'").get().status,'cancelled');
 assert.equal(f.expired.length,1);
 assert.equal(f.db.prepare("SELECT driver_settlement_status FROM customer_payments WHERE id='a'").get().driver_settlement_status,'review');
 f.db.close();
});
