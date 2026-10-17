// Read-only verification of the real FaivoPay ledger; not authority to mark paid.
const cents = value => {
 const n = Number(value), c = Math.round(n*100);
 return Number.isFinite(n) && Number.isSafeInteger(c) && c>0 && Math.abs(n*100-c)<0.000001 ? c : null;
};
export function inspectModulrPayoutLedger(db, payout) {
 if(!payout || typeof payout.id!=='string' || !Number.isSafeInteger(payout.driver_id))
  throw Error('Invalid payout identity');
 const rows=db.prepare('SELECT driver_id,entry_type,direction,amount,status FROM driver_ledger WHERE reference_id=?').all(payout.id);
 const type=payout.type==='weekly'?'weekly_payout':payout.type==='early'?'early_payout':null;
 const expected=cents(payout.net_amount??payout.amount);
 const sent=rows.filter(r=>r.entry_type===type && r.direction==='credit' && r.status==='sent');
 const reasons=[];
 if(!type || expected===null) reasons.push('invalid_payout_type_or_amount');
 if(['sent','returned'].includes(payout.status) && sent.length!==1) reasons.push('missing_or_duplicate_sent_ledger');
 if(['batched','approved','queued'].includes(payout.status) && sent.length) reasons.push('premature_sent_ledger');
 if(sent.some(r=>r.driver_id!==payout.driver_id || cents(r.amount)!==expected)) reasons.push('sent_ledger_identity_or_amount_mismatch');
 if(rows.some(r=>r.entry_type===type && (r.direction!=='credit' || !['sent'].includes(r.status)))) reasons.push('conflicting_payout_ledger');
 return {matchingSent:sent.length===1 && !reasons.length, sentEntries:sent.length, blockers:reasons};
}
