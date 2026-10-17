// Read-only evidence check for the *existing* Autocab payout adjustments.
// Never submits Autocab requests, charges a fee or authorises bank payment.
const toPence = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  const pence = Math.round(number * 100);
  return Number.isFinite(number) && Number.isSafeInteger(pence) && pence >= 0 &&
    Math.abs(number * 100 - pence) < 1e-6 ? pence : null;
};

export function assessModulrAutocabSettlement(db, payout) {
  if (!payout || !/^[\w-]{1,128}$/.test(String(payout.id || '')) ||
      !Number.isSafeInteger(Number(payout.driver_id))) throw Error('Invalid payout identity');
  const blockers = [];
  const fee = toPence(payout.type === 'early' ? payout.fee : payout.weekly_fee);
  const carried = toPence(payout.type === 'weekly' ? payout.carried_charges : 0);
  const sent = toPence(payout.net_amount ?? payout.amount);
  if (fee === null || carried === null || sent === null || sent === 0) {
    return {verified:false,blockers:['invalid_settlement_amount'],feePence:fee,carriedPence:carried};
  }
  const expected = [
    ['fee',fee], ['carried',carried], ['payment',sent]
  ];
  const required = ['event_key','driver_id','amount','is_credit','status','completed_at'];
  const schema = db.prepare("PRAGMA table_info('autocab_adjustments')").all();
  if (!required.every(name => schema.some(column => column.name === name))) {
    return {verified:false,blockers:['autocab_adjustment_evidence_schema_incomplete'],
      feePence:fee,carriedPence:carried,payoutPence:sent,writesPerformed:false};
  }
  const all = db.prepare('SELECT event_key,driver_id,amount,is_credit,status,completed_at FROM autocab_adjustments WHERE event_key LIKE ?')
    .all(`payout:${payout.id}:%`);
  const known = new Set(expected.map(([type])=>`payout:${payout.id}:${type}`));
  if (all.some(a => !known.has(a.event_key))) blockers.push('unexpected_autocab_adjustment');
  for (const [type,pence] of expected) {
    const key = `payout:${payout.id}:${type}`;
    const matching = all.filter(a=>a.event_key===key);
    if (pence===0) {
      if (matching.length) blockers.push(`unexpected_${type}_adjustment`);
      continue;
    }
    if (matching.length!==1) {blockers.push(`missing_or_duplicate_${type}_adjustment`);continue;}
    const a=matching[0];
    if (Number(a.driver_id)!==Number(payout.driver_id) ||
        toPence(a.amount)!==pence || Number(a.is_credit)!==0) blockers.push(`${type}_adjustment_mismatch`);
    if (a.status!=='completed' || !a.completed_at) blockers.push(`${type}_adjustment_not_completed`);
  }
  return {verified:blockers.length===0,blockers,feePence:fee,carriedPence:carried,payoutPence:sent,
    autocabAdjustmentCount:all.length, writesPerformed:false};
}
