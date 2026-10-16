import crypto from 'node:crypto';

// Isolated accounting test utility.
// Never accepts a file-backed database.
export function testModulrFeeAccounting(
  db,
  { gross=100, fee=1.5, fleetPercent=75,
    failAfterFee=false }={}
) {
  if (
    process.env.MODULR_ENV !== 'sandbox' ||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true'
  ) {
    throw new Error('Accounting test safety gate closed.');
  }

  const databases=db.prepare('PRAGMA database_list').all();

  if (
    databases.length!==1 ||
    databases[0].name!=='main' ||
    databases[0].file!=='' ||
    db.isTransaction
  ) {
    throw new Error('In-memory isolated database required.');
  }

  const validMoney=x=>
    typeof x==='number' &&
    Number.isFinite(x) &&
    x>=0 &&
    Number.isSafeInteger(Math.round(x*100)) &&
    Math.abs(x*100-Math.round(x*100))<1e-7;

  if (
    !validMoney(gross) ||
    !validMoney(fee) ||
    gross<=fee ||
    !Number.isFinite(fleetPercent) ||
    fleetPercent<0 ||
    fleetPercent>100
  ) {
    throw new Error('Invalid financial inputs.');
  }

  const grossMinor=Math.round(gross*100);
  const feeMinor=Math.round(fee*100);
  const netMinor=grossMinor-feeMinor;
  const fleetMinor=Math.round(feeMinor*fleetPercent/100);
  const companyMinor=feeMinor-fleetMinor;

  const payoutId='modulr_fee_accounting_test';
  const now=new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');

  try {
    const existing=db.prepare(
      'SELECT id FROM payouts WHERE id=?'
    ).get(payoutId);

    if(existing){
      throw new Error('Payout already exists.');
    }

    db.prepare(`
      INSERT INTO payouts (
        id,driver_id,callsign,
        gross_amount,fee,net_amount,amount,
        type,status,created_at,updated_at,paid_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      payoutId,999999,'TEST',
      grossMinor/100,feeMinor/100,
      netMinor/100,netMinor/100,
      'early','paid',now,now,now
    );

    db.prepare(`
      INSERT INTO driver_ledger (
        id,driver_id,entry_type,direction,
        amount,fee_amount,description,
        reference_id,status,created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      crypto.randomUUID(),999999,
      'early_payout','credit',
      netMinor/100,feeMinor/100,
      'Isolated early payout accounting test',
      payoutId,'paid',now
    );

    if(feeMinor>0){
      db.prepare(`
        INSERT INTO driver_ledger (
          id,driver_id,entry_type,direction,
          amount,fee_amount,description,
          reference_id,status,created_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        crypto.randomUUID(),999999,
        'early_payout_fee','debit',
        feeMinor/100,feeMinor/100,
        'Isolated early payout fee test',
        payoutId,'charged',now
      );

      db.prepare(`
        INSERT INTO fee_ledger (
          id,fee_type,source_type,source_id,
          driver_id,callsign,description,
          gross_fee,fleetpay_share,taxi_company_share,
          status,created_at,service_date
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        crypto.randomUUID(),
        'early_payout','payout',payoutId,
        999999,'TEST','Isolated early payout fee',
        feeMinor/100,
        fleetMinor/100,
        companyMinor/100,
        'uninvoiced',now,
        now.slice(0,10)
      );
    }

    if(failAfterFee){
      throw new Error('Simulated accounting failure.');
    }

    db.prepare(`
      INSERT INTO audit_logs (
        created_at,actor_type,actor_id,
        action,entity_type,entity_id,
        details_json,ip
      )
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      now,'system','modulr_accounting_test',
      'isolated_fee_accounting_test',
      'payout',payoutId,
      JSON.stringify({
        gross: grossMinor/100,
        fee: feeMinor/100,
        net: netMinor/100,
        fleetShare: fleetMinor/100,
        companyShare: companyMinor/100
      }),
      ''
    );

    db.exec('COMMIT');

    return {
      ok:true,
      testOnly:true,
      payoutId,
      gross:grossMinor/100,
      fee:feeMinor/100,
      net:netMinor/100,
      fleetShare:fleetMinor/100,
      companyShare:companyMinor/100
    };

  }catch(error){
    try{db.exec('ROLLBACK')}catch{}
    throw error;
  }
}
