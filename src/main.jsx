import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import { QRCodeSVG } from 'qrcode.react';
import{Activity,AlertTriangle,ArrowDownLeft,ArrowRight,ArrowUpRight,BadgePoundSterling,Banknote,Bell,CalendarDays,CheckCircle2,ChevronRight,Clock3,CreditCard,Database,FileClock,Hash,Home,Info,KeyRound,LayoutDashboard,LogIn,LogOut,Mail,Menu,Phone,PlayCircle,RefreshCw,Search,Send,Settings,ShieldCheck,Smartphone,Users,UserCheck,WalletCards,X,Sun,Moon,Eye,EyeOff,Pencil}from'lucide-react';
import faivopayMark from './assets/faivopay-mark.png';
import'./styles.css';
const money=v=>v==null?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(v);
const dt=v=>v?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Never';
const dateOnly=v=>v?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(v)):'—';

const paymentPlanEventMeta=type=>({
 plan_created:{label:'Created',tone:'neutral'},
 plan_activated:{label:'Activated',tone:'good'},
 instalment_paid:{label:'Payment received',tone:'good'},
 instalment_overdue:{label:'Payment overdue',tone:'bad'},
 plan_completed:{label:'Completed',tone:'good'},
 plan_paused:{label:'Paused',tone:'warn'},
 plan_resumed:{label:'Resumed',tone:'good'},
 plan_cancelled:{label:'Cancelled',tone:'bad'},
 early_settlement_requested:{label:'Early settlement',tone:'warn'},
 plan_amended:{label:'Amended',tone:'neutral'},
 extra_payment_requested:{label:'Extra payment requested',tone:'neutral'},
 extra_payment_applied:{label:'Extra payment applied',tone:'good'},
 schedule_exhausted:{label:'Schedule exhausted',tone:'bad'}
})[type]||{
 label:String(type||'Plan event').replaceAll('_',' '),
 tone:'neutral'
};

const API_BASE = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_NATIVE_API_BASE_URL || 'http://127.0.0.1:3001')
  : '';

async function call(url, opts = {}, token = '') {
  const requestUrl = url.startsWith('/api') ? `${API_BASE}${url}` : url;

  const r = await fetch(requestUrl, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });

  let j = {};

  try {
    j = await r.json();
  } catch {}

  if (!r.ok) {
    throw new Error(j.error || 'Request failed');
  }

  return j;
}

function Logo(){return <div className="logo"><div className="logoMark branded"><img src={faivopayMark} alt="" aria-hidden="true"/></div><div><b>FaivoPay</b><span>Driver Payments</span></div></div>}

function Stat({icon:Icon,label,value,sub,onClick,active=false}){
 const interactive=typeof onClick==='function';

 function onKeyDown(e){
  if(!interactive)return;
  if(e.key==='Enter'||e.key===' '){
   e.preventDefault();
   onClick();
  }
 }

 return <div
  className={`stat${interactive?' clickable':''}${active?' active':''}`}
  onClick={onClick}
  onKeyDown={onKeyDown}
  role={interactive?'button':undefined}
  tabIndex={interactive?0:undefined}
 >
  <div className="statIcon"><Icon/></div>
  <div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>
 </div>
}

function Pill({children,tone='neutral'}){return <span className={`pill ${tone}`}>{children}</span>}

function WizardSteps({steps,currentIndex=0}){
 return <div className="liveSteps wizardSteps">
  {steps.map((label,i)=><div key={label} className={`${i<=currentIndex?'done':''} ${i===currentIndex?'current':''}`}>
   <span>{i<currentIndex?'✓':i+1}</span>
   <b>{label}</b>
  </div>)}
 </div>
}


function DemoLab({demo,loadDemo,resetDemo,action,demoEmail,setDemoEmail,demoMobile,setDemoMobile,sendEmail,sendSms}){
 const tone=v=>['paid','updated','approved','reconciled','funded','cleared'].includes(String(v))?'good':['failed','excluded','declined','collection','not_posted'].includes(String(v))?'bad':['processing','waiting','requested','pending','frozen','funding_wait'].includes(String(v))?'warn':'neutral';
 const approved=(r,early=false)=>r?.items?.filter(x=>['approved','paid'].includes(x.status)&&Number(early?x.netAmount:x.amount)>0)||[];
 const failed=(r,early=false)=>approved(r,early).filter(x=>x.wiseStatus==='failed');
 const processing=(r,early=false)=>approved(r,early).filter(x=>x.wiseStatus==='processing');
 const pending=(r,early=false)=>r?.items?.filter(x=>early?x.status==='requested':x.status==='pending')||[];
 const paymentTotal=(r,early=false)=>approved(r,early).reduce((a,x)=>a+Number(early?x.netAmount:x.amount||0),0);
 const weeklySteps=[['rentsheets','Confirm Rent Sheets'],['sync','Sync Autocab'],['review','Review & approve'],['funding','Create run'],['funding_wait','Fund Wise'],['funded','Release payouts'],['monitor','Update Autocab'],['complete','Reconcile']];
 const earlySteps=[['balance','Sync current balance'],['review','Review requests'],['funding','Create run'],['funding_wait','Check Wise funds'],['funded','Release payouts'],['monitor','Update Autocab'],['complete','Reconcile']];
 const stepIndex=(run,early)=>{const steps=early?earlySteps:weeklySteps;const i=steps.findIndex(x=>x[0]===run?.stage);if(run?.stage==='funding'&&Number(run?.topUpRequired||0)<=0)return 3;return Math.max(0,i)};
 const StepBar=({run,early=false})=>{const steps=(early?earlySteps:weeklySteps).map(x=>x[1]),idx=stepIndex(run,early);return <WizardSteps steps={steps} currentIndex={idx}/>};
 const Procedure=({early=false})=><div className="operatorProcedure"><div className="procedureTitle"><ShieldCheck/><div><b>{early?'Early payout operator procedure':'Monday weekly operator procedure'}</b><span>{early?'Uses the driver’s current Autocab balance — no Rent Sheets step.':'Always start after Monday Rent Sheets have been completed in Autocab.'}</span></div></div><div className="procedureGrid">{(early?[
  ['1','Sync current balance','Refresh Autocab and confirm the driver still has enough available balance.'],['2','Review requests','Approve/decline every request. Nothing advances with pending decisions.'],['3','Create & lock run','Freeze the approved amounts so they cannot silently change.'],['4','Check Wise cleared funds','Use existing GBP balance first. If short, transfer only the shortfall.'],['5','Release payouts','Blocked until FaivoPay confirms cleared Wise balance is sufficient.'],['6','Monitor Wise','Track each driver payment individually. Retry failures only.'],['7','Update Autocab','Only successful bank payouts create the matching Autocab adjustment.'],['8','Reconcile & lock','Wise paid total and Autocab adjustments must match before completion.']
 ]:[
  ['1','Confirm Rent Sheets','Operator confirms Monday Rent Sheets have completed in Autocab.'],['2','Sync Previous Balance','FaivoPay refreshes Autocab and captures the post-rent-sheet Previous Balance.'],['3','Review every payout','Approve or exclude every positive balance. Collections remain separate.'],['4','Create & lock run','Approved driver list and values are frozen before funding.'],['5','Fund Wise','FaivoPay shows cleared Wise balance, exact shortfall, bank details and run reference.'],['6','Release payouts','Blocked until cleared funds cover the complete approved run.'],['7','Update Autocab','Only each confirmed successful payout is posted back to Autocab.'],['8','Reconcile & lock','Wise + FaivoPay + Autocab must agree before the run can close.']
 ]).map(x=><div key={x[0]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</div></div>;
 const Funding=({run,title,early=false})=>{if(!['funding','funding_wait','funded','monitor','complete'].includes(run.stage))return null;const required=Number(run.fundingRequired||paymentTotal(run,early)),top=Number(run.topUpRequired||0),sent=Number(run.fundingTransferAmount||0);return <div className="demoFundingBox v23"><div className="demoFundingHead"><div><span>DEMO WISE FUNDING CONTROL</span><h4>{title}</h4></div><Pill tone={run.stage==='funded'||run.stage==='monitor'||run.stage==='complete'?'good':'warn'}>{run.stage==='funded'||run.stage==='monitor'||run.stage==='complete'?'Cleared funds confirmed':run.stage==='funding_wait'?'Bank transfer sent — awaiting clearance':'Funding check required'}</Pill></div><div className="demoFundingGrid"><div><span>Approved payout total</span><strong>{money(required)}</strong></div><div><span>Cleared demo Wise balance</span><strong>{money(run.wiseBalance||0)}</strong></div><div><span>Shortfall to transfer</span><strong className={top>0?'negative':''}>{money(top)}</strong></div><div><span>Payment run reference</span><strong>{run.reference||'—'}</strong></div></div><div className="demoBankDetails"><div><span>Account name</span><b>{run.wiseAccount?.name}</b></div><div><span>Sort code</span><b>{run.wiseAccount?.sortCode}</b></div><div><span>Account number</span><b>{run.wiseAccount?.accountNumber}</b></div></div>{run.stage==='funding'&&<div className="operatorWarning"><AlertTriangle/><div><b>Funding gate</b><span>{top>0?`Transfer exactly ${money(top)} using reference ${run.reference}. FaivoPay must not release any driver payment until Wise reports the money as cleared.`:'The existing Wise balance already covers this run. Check the cleared balance before release.'}</span></div></div>}{run.stage==='funding_wait'&&<div className="operatorWarning blue"><Clock3/><div><b>Waiting for cleared funds</b><span>{money(sent)} has been simulated as sent from the taxi company bank. The payout button stays locked until Wise confirms the credit.</span></div></div>}</div>};
 const StatusTable=({run,early=false})=>!['monitor','complete'].includes(run.stage)?null:<div className="demoMonitor"><div className="panelHead"><div><span className="sectionKicker">PAYMENT + AUTOCAB MONITOR</span><h3>Process each driver to final reconciliation</h3><p>A successful Wise payout is the trigger for the matching Autocab update. Failed bank payments must never reduce the driver’s Autocab balance.</p></div></div><div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Payout</th><th>Wise payment</th><th>Autocab adjustment</th><th>Result</th></tr></thead><tbody>{approved(run,early).map(x=><tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td><b>{money(early?x.netAmount:x.amount)}</b></td><td><Pill tone={tone(x.wiseStatus)}>{String(x.wiseStatus||'not_sent').replaceAll('_',' ')}</Pill></td><td><Pill tone={tone(x.autocabStatus)}>{String(x.autocabStatus||'not_posted').replaceAll('_',' ')}</Pill></td><td>{x.failureReason?<span className="failureText"><AlertTriangle/>{x.failureReason}</span>:x.wiseStatus==='paid'&&x.autocabStatus==='updated'?<span className="successText"><CheckCircle2/>Paid & reconciled</span>:'Waiting'}</td></tr>)}</tbody></table></div></div>;
 const RunCard=({kind,run,early=false})=>{
  const base=`/api/admin/demo/${kind}`;
  const title=early?'Early payout':'Monday weekly payout';
  const steps=early
   ?['Review requests','Create run','Funding','Funds cleared','Release payouts','Processing','Update Autocab','Reconcile']
   :['Rent Sheets','Sync balances','Plan deductions','Review payouts','Create run','Funding','Release','Reconcile'];

  const idx=early
   ?run.stage==='balance'?0
    :run.stage==='review'?0
    :run.stage==='funding'?2
    :run.stage==='funding_wait'?3
    :run.stage==='funded'?4
    :run.stage==='monitor'?(processing(run,early).length>0?5:6)
    :run.stage==='complete'?7
    :0
   :run.stage==='rentsheets'?0
    :run.stage==='sync'?1
    :run.stage==='review'?3
    :run.stage==='funding'?5
    :run.stage==='funding_wait'?5
    :run.stage==='funded'?6
    :run.stage==='monitor'?6
    :run.stage==='complete'?7
    :0;

  return <section className="liveWorkflowCard wizardFlowCard demoRunV22">
   <div className="liveWorkflowHead">
    <div>
     <span>{early?'DEMO EARLY PAYOUT':'DEMO MONDAY RUN'}</span>
     <h3>{title}</h3>
     <p>{early?'Guided early-payout process using isolated Demo Lab data.':'Guided Monday settlement using isolated Demo Lab data.'}</p>
    </div>
    <Pill tone={run.stage==='complete'?'good':run.stage==='monitor'?'warn':'neutral'}>
     {run.stage==='complete'?'Reconciled':String(run.status||run.stage).replaceAll('_',' ')}
    </Pill>
   </div>

   <WizardSteps steps={steps} currentIndex={idx}/>

   <div className="wizardStageBody">
    {!early&&run.stage==='rentsheets'&&<div className="demoActionStage">
     <div className="operatorWarning"><AlertTriangle/><div><b>Confirm Monday Rent Sheets</b><span>Do not continue until Autocab Rent Sheets are complete. FaivoPay will use the post-rent-sheet Previous Balance.</span></div></div>
     <button className="primary largeAction" onClick={()=>action(`${base}/confirm-rentsheets`,'Confirm that Monday Rent Sheets have finished in Autocab?')}><CheckCircle2/>Confirm Rent Sheets completed</button>
    </div>}

    {!early&&run.stage==='sync'&&<div className="demoActionStage">
     <div className="operatorWarning blue"><RefreshCw/><div><b>Sync Autocab Previous Balances</b><span>Refresh the balances that will be used for this Monday settlement.</span></div></div>
     <button className="primary largeAction" onClick={()=>action(`${base}/sync`,'Simulate a fresh Autocab sync after Rent Sheets?')}><RefreshCw/>Sync Autocab balances</button>
    </div>}

    {early&&run.stage==='balance'&&<div className="demoActionStage">
     <div className="operatorWarning blue"><RefreshCw/><div><b>Sync current Autocab balances</b><span>Early payouts are checked against the driver's current available balance.</span></div></div>
     <button className="primary largeAction" onClick={()=>action(`${base}/sync`,'Simulate a fresh current-balance sync for the early payout run?')}><RefreshCw/>Sync current balances</button>
    </div>}

    {run.stage==='review'&&<>
     <div className="operatorWarning"><AlertTriangle/><div><b>{early?'Review every early payout request':'Review every weekly payout'}</b><span>{early?'Approve or decline every request after checking current balance.':'Approve or exclude the positive Previous Balances before creating the payment run.'}</span></div></div>
     <div className="tableWrap proTable"><table>
      <thead><tr><th>Driver</th><th>{early?'Current request':'Previous balance'}</th><th>Fee</th><th>{early?'Driver receives':'Weekly payout'}</th><th>Status</th><th>Operator action</th></tr></thead>
      <tbody>{run.items.map(x=><tr key={x.id}>
       <td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td>
       <td className={!early&&x.previousBalance<0?'negative':''}>{money(early?x.grossAmount:x.previousBalance)}</td>
       <td>{money(early?x.fee:x.weeklyFee)}</td>
       <td><b>{Number(early?x.netAmount:x.amount)>0?money(early?x.netAmount:x.amount):'—'}</b></td>
       <td><Pill tone={tone(x.status)}>{x.status}</Pill></td>
       <td>{((early&&x.status==='requested')||(!early&&x.status!=='collection'))&&!['paid'].includes(x.status)&&<div className="compactActions">
        <button className="mini success" onClick={()=>action(`${base}/${x.id}`,'',{status:'approved'})}>Approve</button>
        <button className="mini danger" onClick={()=>action(`${base}/${x.id}`,'',{status:early?'declined':'excluded'})}>{early?'Decline':'Exclude'}</button>
       </div>}</td>
      </tr>)}</tbody>
     </table></div>

     <div className="demoDecisionSummary">
      <div><span>Approved</span><b>{approved(run,early).length}</b></div>
      <div><span>Awaiting decision</span><b className={pending(run,early).length?'negative':''}>{pending(run,early).length}</b></div>
      <div><span>Approved payout total</span><b>{money(paymentTotal(run,early))}</b></div>
     </div>

     <div className="demoActions">
      <button className="secondary" onClick={()=>action(`${base}/approve-all`,`Approve all remaining ${pending(run,early).length} demo payment(s)?`)}>Approve all remaining</button>
      <button className="primary" disabled={pending(run,early).length>0||!approved(run,early).length} onClick={()=>action(`${base}/freeze`,'Final check: are all approved payment amounts correct? This locks the run before funding.')}>Create & lock payment run</button>
     </div>
    </>}

    <Funding run={run} title={early?'Early payout funding':'Monday weekly funding'} early={early}/>

    {run.stage==='funding'&&<div className="demoActions">
     {Number(run.topUpRequired||0)>0
      ?<button className="primary" onClick={()=>action(`${base}/top-up`,`Simulate sending ${money(run.topUpRequired)} from the taxi company bank to the Wise GBP account? It will NOT be treated as cleared yet.`)}><Banknote/>Simulate bank transfer to Wise</button>
      :<button className="primary" onClick={()=>action(`${base}/fund`,'Check the demo Wise balance and confirm sufficient cleared funds are available?')}><RefreshCw/>Check cleared Wise funds</button>}
    </div>}

    {run.stage==='funding_wait'&&<div className="demoActions">
     <button className="primary successButton" onClick={()=>action(`${base}/fund`,'Simulate Wise confirming the incoming bank transfer has cleared?')}><RefreshCw/>Check Wise — funds now cleared</button>
    </div>}

    {run.stage==='funded'&&<div className="demoActionStage">
     <div className="operatorWarning green"><CheckCircle2/><div><b>Funds cleared — review before release</b><span>Verify the approved count and total one final time before payouts are released.</span></div></div>
     <button className="primary largeAction" onClick={()=>action(`${base}/release`,`Release ${approved(run,early).length} demo payments totalling ${money(run.fundingRequired)}?`)}><Send/>Release {early?'early payout':'weekly'} batch</button>
    </div>}

    <StatusTable run={run} early={early}/>

    {run.stage==='monitor'&&<div className="demoActions">
     <button className="secondary" disabled={!processing(run,early).length} onClick={()=>action(`${base}/refresh-status`,'Simulate Wise completing the processing payments and FaivoPay posting the successful Autocab adjustments?')}><RefreshCw/>Refresh Wise + Autocab status</button>
     <button className="secondary dangerOutline" disabled={!failed(run,early).length} onClick={()=>action(`${base}/retry-failed`,'Simulate correcting the failed recipient and retry only that payment?')}><AlertTriangle/>Correct & retry failed ({failed(run,early).length})</button>
     <button className="primary" disabled={failed(run,early).length>0||processing(run,early).length>0} onClick={()=>action(`${base}/reconcile`,'Final check: every approved Wise payment is Paid and every matching Autocab adjustment is Updated. Reconcile and permanently lock this demo run?')}><ShieldCheck/>Reconcile & lock run</button>
    </div>}

    {run.stage==='complete'&&<div className="demoComplete"><CheckCircle2/><div><b>Run reconciled and locked</b><span>{approved(run,early).length} successful payments · {money(paymentTotal(run,early))} · all matching Autocab adjustments confirmed.</span></div></div>}
   </div>
  </section>
 };

 const PaymentPlanCard=({plan})=>{
  if(!plan)return null;

  const status=String(plan.status||'draft');
  const live=['active','paused','defaulted'].includes(status);
  const canActivate=status==='draft';
  const canPay=['active','paused','defaulted'].includes(status)&&!!plan.currentPaymentRequest;
  const canPause=['active','defaulted'].includes(status);
  const canResume=status==='paused';
  const canCancel=['active','paused','defaulted'].includes(status);
  const canSettle=['active','paused','defaulted'].includes(status);
  const canAmend=['draft','paused'].includes(status);
  const earlyBlocked=['active','paused','defaulted'].includes(status);

  const current=plan.instalments?.find(x=>['due','overdue'].includes(x.status));
  const events=[...(plan.events||[])].slice().reverse();
  const comms=[...(plan.communications||[])].slice().reverse();

  const askAmount=(label,initial='')=>{
   const v=prompt(label,initial);
   if(v===null)return null;
   const n=Number(v);
   if(!Number.isFinite(n)||n<=0){
    alert('Enter a positive amount.');
    return null;
   }
   return n;
  };

  const mondayPartial=()=>{
   const amount=askAmount(
    'Demo Monday balance to apply partially to the current instalment:',
    current?String(Math.max(1,Number(current.amount||0)-Number(current.paidAmount||0)-1)):''
   );
   if(amount===null)return;
   action(
    '/api/admin/demo/payment-plan/monday-partial',
    `Apply ${money(amount)} from the demo Monday settlement to this payment plan?`,
    {amount}
   );
  };

  const mondayFull=()=>{
   const amount=askAmount(
    'Demo positive Monday balance available before payout:',
    current?String(Number(current.amount||0)-Number(current.paidAmount||0)):''
   );
   if(amount===null)return;
   action(
    '/api/admin/demo/payment-plan/monday-full',
    `Use up to the current instalment from ${money(amount)} of demo Monday balance, then leave the remainder available for payout?`,
    {amount}
   );
  };

  const amend=()=>{
   const frequency=prompt(
    'Frequency: weekly, fortnightly or monthly',
    plan.frequency||'weekly'
   );
   if(frequency===null)return;

   const instalmentAmount=askAmount(
    'New instalment amount:',
    String(plan.instalmentAmount||50)
   );
   if(instalmentAmount===null)return;

   const startDate=prompt(
    'Next payment date (YYYY-MM-DD):',
    plan.nextDueDate||plan.startDate||new Date().toISOString().slice(0,10)
   );
   if(startDate===null||!startDate.trim())return;

   action(
    '/api/admin/demo/payment-plan/amend',
    'Apply this amendment to the isolated demo payment plan?',
    {frequency:frequency.trim(),instalmentAmount,startDate:startDate.trim()}
   );
  };

  const extraPayment=()=>{
   const currentRemaining=current?Number(current.amount||0)-Number(current.paidAmount||0):0;
   const maxExtra=Math.max(0,Number(plan.remainingAmount||0)-currentRemaining);
   const amount=askAmount(`Extra principal payment (maximum ${money(maxExtra)}):`,maxExtra>0?String(Math.min(100,maxExtra)):'');
   if(amount===null)return;
   action('/api/admin/demo/payment-plan/extra-payment',`Apply ${money(amount)} as an extra principal payment? The current instalment stays unchanged and simulated Autocab stays at ${money(plan.autocab?.balanceAfter||0)}.`,{amount});
  };

  const cancel=()=>{
   const reason=prompt('Reason for cancelling this demo payment plan:');
   if(reason===null||!reason.trim())return;

   action(
    '/api/admin/demo/payment-plan/cancel',
    `Cancel the demo plan and return ${money(plan.remainingAmount)} to the simulated Autocab balance?`,
    {reason:reason.trim()}
   );
  };

  return <section className="panel demoRunV22">
   <div className="panelHead">
    <div>
     <span className="sectionKicker">DEMO PAYMENT PLAN</span>
     <h3>Payment-plan lifecycle walkthrough</h3>
     <p>Completely isolated demo state. No live payment-plan records, real driver messages or Autocab requests are changed.</p>
    </div>
    <Pill tone={status==='completed'?'good':status==='cancelled'?'bad':status==='paused'||status==='defaulted'?'warn':'neutral'}>
     {status.replaceAll('_',' ')}
    </Pill>
   </div>

   <div className="demoDecisionSummary">
    <div><span>Original debt</span><b>{money(plan.originalDebt)}</b></div>
    <div><span>Paid</span><b>{money(plan.paidAmount)}</b></div>
    <div><span>Remaining</span><b>{money(plan.remainingAmount)}</b></div>
   </div>

   <div className="demoDecisionSummary">
    <div><span>Instalment</span><b>{money(plan.instalmentAmount)} · {plan.frequency}</b></div>
    <div><span>Next due</span><b>{plan.nextDueDate||'—'}</b></div>
    <div><span>Current amount due</span><b>{money(plan.nextDueAmount||0)}</b></div>
   </div>

   <div className={`operatorWarning ${plan.autocab?.transferred?'green':'blue'}`}>
    {plan.autocab?.transferred?<CheckCircle2/>:<RefreshCw/>}
    <div>
     <b>Simulated Autocab position</b>
     <span>
      Before: {money(plan.autocab?.balanceBefore||0)} ·
      Current: {money(plan.autocab?.balanceAfter||0)} ·
      {plan.autocab?.transferred?' Debt transferred to FaivoPay in demo':' Draft only — debt not transferred'}
     </span>
    </div>
   </div>

   <div className={`operatorWarning ${earlyBlocked?'':'green'}`}>
    {earlyBlocked?<AlertTriangle/>:<CheckCircle2/>}
    <div>
     <b>Early payout</b>
     <span>
      {earlyBlocked
       ?`Blocked while payment plan status is ${status}.`
       :'Available — no active, paused or defaulted payment plan blocks it.'}
     </span>
    </div>
   </div>

   <div className="demoActions">
    {canActivate&&
     <button className="primary" onClick={()=>action(
      '/api/admin/demo/payment-plan/activate',
      'Activate this demo payment plan? The simulated £500 debt will move out of Autocab and instalment 1 will become due.'
     )}>
      Activate plan
     </button>
    }

    {canPay&&
     <button className="primary" onClick={()=>action(
      '/api/admin/demo/payment-plan/pay-instalment',
      `Simulate paying the current ${money(plan.currentPaymentRequest?.amount||0)} instalment in full?`
     )}>
      Pay current instalment
     </button>
    }

    {['active','defaulted'].includes(status)&&current&&
     <button className="secondary" onClick={extraPayment}>Extra principal payment</button>
    }

    {live&&current&&
     <button className="secondary" onClick={mondayPartial}>
      Monday partial deduction
     </button>
    }

    {live&&current&&
     <button className="secondary" onClick={mondayFull}>
      Monday full deduction
     </button>
    }

    {canPause&&
     <button className="secondary" onClick={()=>action(
      '/api/admin/demo/payment-plan/pause',
      'Pause this demo payment plan?'
     )}>
      Pause
     </button>
    }

    {canResume&&
     <button className="secondary" onClick={()=>action(
      '/api/admin/demo/payment-plan/resume',
      'Resume this demo payment plan?'
     )}>
      Resume
     </button>
    }

    {canAmend&&
     <button className="secondary" onClick={amend}>
      Amend schedule
     </button>
    }

    {canSettle&&
     <button className="secondary" onClick={()=>action(
      '/api/admin/demo/payment-plan/settle-early',
      `Convert the remaining ${money(plan.remainingAmount)} into one final payment request due now?`
     )}>
      Settle early
     </button>
    }

    {canCancel&&
     <button className="secondary dangerOutline" onClick={cancel}>
      Cancel plan
     </button>
    }
   </div>

   <div className="tableWrap proTable">
    <table>
     <thead>
      <tr>
       <th>#</th>
       <th>Due date</th>
       <th>Amount</th>
       <th>Paid</th>
       <th>Status</th>
      </tr>
     </thead>
     <tbody>
      {(plan.instalments||[]).map(x=><tr key={x.id}>
       <td>{x.instalmentNumber}</td>
       <td>{x.dueAt||'—'}</td>
       <td>{money(x.amount||0)}</td>
       <td>{money(x.paidAmount||0)}</td>
       <td><Pill tone={tone(x.status)}>{String(x.status||'').replaceAll('_',' ')}</Pill></td>
      </tr>)}
     </tbody>
    </table>
   </div>

   <div className="demoFundingGrid">
    <div>
     <span>Source request</span>
     <strong>{plan.sourceRequest?.status||'—'}</strong>
    </div>
    <div>
     <span>Current request</span>
     <strong>{plan.currentPaymentRequest?money(plan.currentPaymentRequest.amount):'None'}</strong>
    </div>
    <div>
     <span>Instalments paid</span>
     <strong>{plan.instalmentsPaid||0} / {plan.instalmentsTotal||0}</strong>
    </div>
    <div>
     <span>Plan ID</span>
     <strong>{plan.planId}</strong>
    </div>
   </div>

   <div className="panelHead">
    <div>
     <span className="sectionKicker">DEMO HISTORY</span>
     <h3>Events & driver communications</h3>
    </div>
   </div>

   <div className="tableWrap proTable">
    <table>
     <thead>
      <tr>
       <th>Time</th>
       <th>Event</th>
       <th>Amount</th>
       <th>Detail</th>
      </tr>
     </thead>
     <tbody>
      {events.slice(0,12).map((x,i)=><tr key={`${x.at}-${i}`}>
       <td>{x.at?new Date(x.at).toLocaleString('en-GB'):'—'}</td>
       <td>{String(x.type||'').replaceAll('_',' ')}</td>
       <td>{x.amount===undefined?'—':money(x.amount)}</td>
       <td>{x.note||'—'}</td>
      </tr>)}
     </tbody>
    </table>
   </div>

   {comms.length>0&&<div className="demoComms">
    {comms.slice(0,8).map((x,i)=><div className="operatorWarning blue" key={`${x.at}-${i}`}>
     <Mail/>
     <div>
      <b>{x.title}</b>
      <span>{x.message}</span>
     </div>
    </div>)}
   </div>}
  </section>;
 };

 return <><section className="demoWarning"><ShieldCheck/><div><b>DEMO MODE — NO REAL MONEY OR AUTOCAB CHANGES</b><span>This is the planned live operator workflow. Demo balances, Wise details and payment results are made-up.</span></div><button className="secondary" onClick={resetDemo}>Reset demo data</button></section><section className="officePageIntro"><div><span>OPERATOR TRAINING</span><h2>FaivoPay Payment Process Demo Lab</h2><p>Every operator follows the same gated process. FaivoPay will block the next step until the previous control has been completed.</p></div></section>{!demo?<section className="emptyState"><PlayCircle/><h3>Load training scenario</h3><p>Load isolated made-up drivers and balances.</p><button className="primary" onClick={loadDemo}>Load Demo Lab</button></section>:<div className="demoV22Stack"><PaymentPlanCard plan={demo.paymentPlan}/><RunCard kind="monday" run={demo.monday}/><RunCard kind="early" run={demo.early} early/><section className="panel demoComms"><div className="panelHead"><div><span className="sectionKicker">COMMUNICATION TEST</span><h3>Send clearly marked demo messages</h3><p>These are the only Demo Lab actions that can leave FaivoPay. Use your own test address or mobile number.</p></div></div><div className="demoCommsGrid"><label>Test email address<input type="email" value={demoEmail} onChange={e=>setDemoEmail(e.target.value)} placeholder="your@email.co.uk"/><button className="secondary" onClick={sendEmail}><Mail/>Send demo email</button></label><label>Test mobile number<input value={demoMobile} onChange={e=>setDemoMobile(e.target.value)} placeholder="07..."/><button className="secondary" onClick={sendSms}><Smartphone/>Send demo SMS</button></label></div></section></div>}</>;
}
function AdminLogin({onLogin}){
 const[phase,setPhase]=useState('password');
 const[f,setF]=useState({email:'',password:'',code:''});
 const[err,setErr]=useState('');
 const[busy,setBusy]=useState(false);
 const[mfaToken,setMfaToken]=useState('');
 const[setupToken,setSetupToken]=useState('');
 const[setup,setSetup]=useState(null);
 const[recovery,setRecovery]=useState({challengeId:'',emailHint:''});
 async function passwordSubmit(e){
  e.preventDefault();setBusy(true);setErr('');
  try{
   const j=await call('/api/admin/login',{method:'POST',body:JSON.stringify({email:f.email,password:f.password})});
   if(j.mfaSetupRequired){setSetupToken(j.setupToken);setSetup(j);setPhase('setup');setF(x=>({...x,code:''}));return}
   if(j.mfaRequired){setMfaToken(j.mfaToken);setPhase('mfa');setF(x=>({...x,code:''}));return}
   if(j.token){localStorage.setItem('fleetpay_admin',j.token);onLogin(j.token)}
  }catch(x){setErr(x.message)}finally{setBusy(false)}
 }
 async function codeSubmit(e){
  e.preventDefault();setBusy(true);setErr('');
  try{
   const url=phase==='setup'?'/api/admin/mfa/enable':'/api/admin/login/mfa';
   const body=phase==='setup'?{setupToken,code:f.code}:{mfaToken,code:f.code};
   const j=await call(url,{method:'POST',body:JSON.stringify(body)});
   localStorage.setItem('fleetpay_admin',j.token);onLogin(j.token);
  }catch(x){setErr(x.message)}finally{setBusy(false)}
 }
 async function startRecovery(){
  setBusy(true);setErr('');
  try{
   const j=await call('/api/admin/mfa/recovery/start',{method:'POST',body:JSON.stringify({mfaToken})});
   setRecovery({challengeId:j.challengeId,emailHint:j.emailHint||''});
   setF(x=>({...x,code:''}));setPhase('recovery');
  }catch(x){setErr(x.message)}finally{setBusy(false)}
 }
 async function completeRecovery(e){
  e.preventDefault();setBusy(true);setErr('');
  try{
   const j=await call('/api/admin/mfa/recovery/complete',{method:'POST',body:JSON.stringify({mfaToken,challengeId:recovery.challengeId,code:f.code})});
   setSetupToken(j.setupToken);setSetup(j);setF(x=>({...x,code:''}));setPhase('setup');
  }catch(x){setErr(x.message)}finally{setBusy(false)}
 }
 function backToPassword(){setPhase('password');setErr('');setRecovery({challengeId:'',emailHint:''});setSetup(null);setF(x=>({...x,password:'',code:''}))}
 const title=phase==='password'?'Secure office access':phase==='setup'?'Protect your account':phase==='recovery'?'Recover authenticator':'Authenticator check';
 const subtitle=phase==='password'?'Payments, settlements, transactions and driver accounts in one secure workspace.':phase==='setup'?'Scan the QR code with your authenticator app, then enter the 6-digit code to finish setup.':phase==='recovery'?`Enter the 6-digit recovery code sent to ${recovery.emailHint||'your office email'}.`:'Enter the current 6-digit code from your authenticator app.';
 return <div className="authPage officeAuth"><div className="authPanel officeLoginCard"><Logo/>
  <div className="authHeading"><span>FAIVOPAY OFFICE</span><h1>{title}</h1><p>{subtitle}</p></div>
  {err&&<div className="inlineError"><AlertTriangle/>{err}</div>}
  {phase==='password'?<form onSubmit={passwordSubmit}><label>Email<input type="email" autoComplete="username" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label><label>Password<input type="password" autoComplete="current-password" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></label><button className="primary full" disabled={busy}><LogIn/>{busy?'Checking…':'Continue securely'}</button></form>:
   phase==='recovery'?<form onSubmit={completeRecovery}>
    <div className="mfaRecoveryNotice"><Mail/><div><b>Check your office email</b><span>For security, FaivoPay will only issue a new authenticator QR after the emailed recovery code is verified. The code expires in 10 minutes.</span></div></div>
    <label>6-digit recovery code<input className="mfaCode" inputMode="numeric" autoComplete="one-time-code" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'').slice(0,6)})}/></label>
    <button className="primary full" disabled={busy||f.code.length!==6}><KeyRound/>{busy?'Checking…':'Verify recovery code'}</button>
    <button type="button" className="textBtn" disabled={busy} onClick={startRecovery}>Send a new recovery code</button>
    <button type="button" className="textBtn" onClick={backToPassword}>Back to sign in</button>
   </form>:
   <form onSubmit={codeSubmit}>
    {phase==='setup'&&setup&&<div className="mfaSetup"><div className="mfaQr"><QRCodeSVG value={setup.otpauthUri} size={190} level="M" includeMargin/></div><div><b>Authenticator app setup</b><span>Scan this new QR code with Microsoft Authenticator, Google Authenticator, 1Password or another TOTP app.</span><small>Manual key: <code>{setup.secret}</code></small></div></div>}
    <label>6-digit authenticator code<input className="mfaCode" inputMode="numeric" autoComplete="one-time-code" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'').slice(0,6)})}/></label>
    <button className="primary full" disabled={busy||f.code.length!==6}><ShieldCheck/>{busy?'Verifying…':phase==='setup'?'Enable MFA & sign in':'Verify & sign in'}</button>
    {phase==='mfa'&&<button type="button" className="mfaLostButton" disabled={busy} onClick={startRecovery}><KeyRound/>Lost access to authenticator?</button>}
    <button type="button" className="textBtn" onClick={backToPassword}>Back to sign in</button>
   </form>}
  <div className="authSecurity"><ShieldCheck/><span>Office access requires password + authenticator verification. Security-sensitive actions are audit logged.</span></div>
 </div></div>
}
function AdminApp(){
 const[token,setToken]=useState(localStorage.getItem('fleetpay_admin')||'');
 const[view,setView]=useState('dashboard');
 const[me,setMe]=useState(null),[overview,setOverview]=useState(null),[transactions,setTransactions]=useState([]);
 const[drivers,setDrivers]=useState([]),[meta,setMeta]=useState({}),[settings,setSettings]=useState(null),[integrations,setIntegrations]=useState(null),[twilioBalance,setTwilioBalance]=useState(null);
 const[mondayRuns,setMondayRuns]=useState([]),[sett,setSett]=useState({runs:[],payoutRuns:[],payouts:[],paymentRequests:[],earlyPayoutRequests:[]});
 const[planAllocations,setPlanAllocations]=useState([]);
 const[outstanding,setOutstanding]=useState([]),[fees,setFees]=useState({fees:[],summary:{}}),[earlySummary,setEarlySummary]=useState(null);
 const[paymentPlans,setPaymentPlans]=useState({plans:[],summary:{}}),[selectedPaymentPlan,setSelectedPaymentPlan]=useState(null);
 const[paymentPlanQ,setPaymentPlanQ]=useState(''),[paymentPlanStatus,setPaymentPlanStatus]=useState('all');
 const[planCreateSource,setPlanCreateSource]=useState(null),[planCreate,setPlanCreate]=useState({frequency:'weekly',instalmentAmount:'',startDate:'',notes:''}),[planCreateBusy,setPlanCreateBusy]=useState(false),[planActivateBusy,setPlanActivateBusy]=useState(false),[planActionBusy,setPlanActionBusy]=useState(false);
 const[planAmendTarget,setPlanAmendTarget]=useState(null),[planAmend,setPlanAmend]=useState({frequency:'weekly',instalmentAmount:'',startDate:'',notes:''}),[planAmendBusy,setPlanAmendBusy]=useState(false);
 const[customerAdmin,setCustomerAdmin]=useState({payments:[],summary:{}}),[customerCreate,setCustomerCreate]=useState({bookingId:'',callsign:'',customerName:'',customerMobile:'',customerEmail:'',pickup:'',destination:'',journeyAt:'',fareAmount:'',taxiCompany:'',notes:''}),[createdCustomerLink,setCreatedCustomerLink]=useState(null),[customerCreateBusy,setCustomerCreateBusy]=useState(false);
 const[customerPayQ,setCustomerPayQ]=useState(''),[customerPayStatus,setCustomerPayStatus]=useState('needs_review'),[showCustomerCreate,setShowCustomerCreate]=useState(false),[selectedCustomerPayment,setSelectedCustomerPayment]=useState(null),[customerReleaseRetryBusy,setCustomerReleaseRetryBusy]=useState(false);
 const[customerSettlementReview,setCustomerSettlementReview]=useState({decision:'full',amount:'',note:''}),[customerSettlementReviewBusy,setCustomerSettlementReviewBusy]=useState(false);
 const[customerRefundReview,setCustomerRefundReview]=useState({decision:'full',amount:''}),[customerRefundBusy,setCustomerRefundBusy]=useState(false);
 const[driverUsers,setDriverUsers]=useState([]),[staff,setStaff]=useState([]),[securityLogs,setSecurityLogs]=useState([]);
 const[txQ,setTxQ]=useState(''),[txType,setTxType]=useState('all'),[txStatus,setTxStatus]=useState('all'),[txCategory,setTxCategory]=useState('all'),[txDateFrom,setTxDateFrom]=useState(''),[txDateTo,setTxDateTo]=useState('');
 const[q,setQ]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null),[selectedTx,setSelectedTx]=useState(null);
 const[driverDrawerTab,setDriverDrawerTab]=useState('overview');
 const[driverTxFilter,setDriverTxFilter]=useState('all');
 const[driverTransactions,setDriverTransactions]=useState([]);
 const[driverTransactionsLoading,setDriverTransactionsLoading]=useState(false);
 const[selectedWeeklyPayouts,setSelectedWeeklyPayouts]=useState([]);
 const[planAllocationBusy,setPlanAllocationBusy]=useState(null);
 const[mobileNav,setMobileNav]=useState(false),[loading,setLoading]=useState(false),[err,setErr]=useState('');
 const[sessionBooting,setSessionBooting]=useState(Boolean(token));
 const[newStaff,setNewStaff]=useState({name:'',email:'',role:'office',password:''}),[showNewStaff,setShowNewStaff]=useState(false);
 const[platformCompanies,setPlatformCompanies]=useState([]);
 const[platformCompany,setPlatformCompany]=useState(null);
 const[platformWizardOpen,setPlatformWizardOpen]=useState(false);
 const[platformWizardStep,setPlatformWizardStep]=useState(0);
 const[platformWizard,setPlatformWizard]=useState({
  general:{name:'',primaryDomain:'',supportEmail:'',supportPhone:'',timezone:'Europe/London'},
  autocab:{companyIds:'',adjustmentsEnabled:false,apiKey:''},
  stripe:{secretKey:'',webhookSecret:''},
  sendgrid:{fromEmail:'',fromName:'FaivoPay',apiKey:''},
  twilio:{accountSid:'',messagingServiceSid:'',fromNumber:'',authToken:''},
  branding:{productName:'FaivoPay',supportEmail:'',supportPhone:''},
  features:{paymentPlans:true,earlyPayouts:true,customerPayments:true,driverPayouts:true,demoLab:true}
 });
 const[manual,setManual]=useState({callsign:'',type:'pay_in',amount:'',reason:''}),[manualBusy,setManualBusy]=useState(false);
 const[testSms,setTestSms]=useState({to:'',message:'FaivoPay test SMS – communications are configured correctly.'});
 const[testEmail,setTestEmail]=useState('');
 const[demo,setDemo]=useState(null),[demoEmail,setDemoEmail]=useState(''),[demoMobile,setDemoMobile]=useState('');
 const[resetPhrase,setResetPhrase]=useState(''),[resetDrivers,setResetDrivers]=useState(false);
 const api=(u,o={})=>call(u,o,token);
 function logout(){localStorage.removeItem('fleetpay_admin');setToken('');setMe(null)}
 async function safeLoad(fn){try{return await fn()}catch(e){if(/authentication|office authentication/i.test(e.message))logout();else setErr(e.message)}}
 const loadMe=()=>safeLoad(async()=>setMe(await api('/api/admin/me')));
 const loadOverview=()=>safeLoad(async()=>setOverview(await api('/api/admin/office-overview')));
 const loadTransactions=()=>safeLoad(async()=>{
 const p=new URLSearchParams({
  limit:'500',
  q:txQ,
  type:txType,
  status:txStatus,
  category:txCategory,
  dateFrom:txDateFrom,
  dateTo:txDateTo
 });
 setTransactions((await api(`/api/admin/transactions?${p}`)).transactions||[])
});
 const loadDrivers=()=>safeLoad(async()=>{setLoading(true);try{const j=await api('/api/drivers');setDrivers(j.drivers||[]);setMeta(j)}finally{setLoading(false)}});

 const loadDriverTransactions=driverId=>safeLoad(async()=>{
  setDriverTransactionsLoading(true);
  try{
   const p=new URLSearchParams({
    limit:'500',
    driverId:String(driverId)
   });
   const j=await api(`/api/admin/transactions?${p}`);
   setDriverTransactions(j.transactions||[]);
  }finally{
   setDriverTransactionsLoading(false);
  }
 });

 const loadSettings=()=>safeLoad(async()=>setSettings(await api('/api/admin/operations-settings')));
 const loadIntegrations=()=>safeLoad(async()=>setIntegrations(await api('/api/admin/integrations')));
 const loadTwilioBalance=()=>safeLoad(async()=>setTwilioBalance(await api('/api/admin/twilio/balance')));
 const loadSett=()=>safeLoad(async()=>setSett(await api('/api/admin/settlements')));
 const loadMonday=()=>safeLoad(async()=>{
  const j=await api('/api/admin/monday-runs');
  const runs=j.runs||[];

  setMondayRuns(runs);

  const active=runs.find(
   r=>['draft','approved','batched'].includes(r.status)
  );

  if(!active){
   setPlanAllocations([]);
   return;
  }

  const allocations=await api(
   `/api/admin/monday-runs/${active.id}/plan-allocations`
  );

  setPlanAllocations(allocations.allocations||[]);
 });

 const loadOutstanding=()=>safeLoad(async()=>setOutstanding((await api('/api/admin/outstanding-payments')).payments||[]));

 const loadPaymentPlans=()=>safeLoad(async()=>setPaymentPlans(await api('/api/admin/payment-plans')));
 const loadFees=()=>safeLoad(async()=>setFees(await api('/api/admin/fees')));
 const loadEarlySummary=()=>safeLoad(async()=>setEarlySummary(await api('/api/admin/early-summary')));
 const applyCustomerAdminData=j=>{
  setCustomerAdmin(j);
  setSelectedCustomerPayment(prev=>{
   if(!prev)return prev;
   return (j?.payments||[]).find(x=>String(x.id)===String(prev.id))||prev;
  });
 };
 const loadCustomerAdmin=()=>safeLoad(async()=>applyCustomerAdminData(await api('/api/admin/customer-payments')));
 const loadDriverUsers=()=>safeLoad(async()=>setDriverUsers(await api('/api/admin/users')));
 const loadStaff=()=>safeLoad(async()=>setStaff((await api('/api/admin/staff')).staff||[]));
 const loadSecurity=()=>safeLoad(async()=>setSecurityLogs((await api('/api/admin/security')).logs||[]));
 const loadPlatformCompanies=()=>safeLoad(async()=>{
  const j=await api('/api/admin/platform/companies');
  setPlatformCompanies(j.companies||[]);
 });
 const openPlatformCompany=async id=>{
  try{
   const j=await api(`/api/admin/platform/companies/${id}`);
   setPlatformCompany(j);
   setPlatformWizardOpen(false);
  }catch(e){alert(e.message)}
 };
 const loadDemo=()=>safeLoad(async()=>setDemo(await api('/api/admin/demo')));

 useEffect(()=>{
  if(!selected?.driverId){
   setDriverTransactions([]);
   setDriverDrawerTab('overview');
   return;
  }

  setDriverDrawerTab('overview');
  setDriverTxFilter('all');
  setDriverTransactions([]);
  loadDriverTransactions(selected.driverId);
 },[selected?.driverId]);

 async function refreshCore(){await Promise.all([loadOverview(),loadTransactions(),loadDrivers(),loadSettings(),loadIntegrations(),loadTwilioBalance(),loadSett(),loadMonday(),loadOutstanding(),loadFees(),loadEarlySummary(),loadCustomerAdmin()])}
 useEffect(()=>{
  let alive=true;
  if(!token){setSessionBooting(false);return()=>{alive=false}}
  setSessionBooting(true);setErr('');
  (async()=>{
   try{
    const profile=await call('/api/admin/me',{},token);if(!alive)return;setMe(profile);
    await Promise.all([loadOverview(),loadTransactions(),loadDrivers(),loadSettings(),loadIntegrations(),loadTwilioBalance(),loadSett(),loadMonday(),loadOutstanding(),loadFees(),loadEarlySummary(),loadCustomerAdmin()]);
   }catch(e){if(alive){if(/authentication|office authentication/i.test(e.message))logout();else setErr(e.message)}}
   finally{if(alive)setSessionBooting(false)}
  })();
  return()=>{alive=false};
 },[token]);

 async function silentOfficeRefresh(){
  if(!token)return;

  const jobs=[
   api('/api/admin/office-overview').then(setOverview),
   api('/api/drivers').then(j=>{
    const nextDrivers=j.drivers||[];
    setDrivers(nextDrivers);
    setMeta(j);

    setSelected(prev=>{
     if(!prev?.driverId)return prev;
     return nextDrivers.find(d=>String(d.driverId)===String(prev.driverId))||prev;
    });
   })
  ];

  if(view==='customerPayments'){jobs.push(api('/api/admin/customer-payments').then(applyCustomerAdminData));}

  if(view==='monday'){
   jobs.push(
    api('/api/admin/monday-runs').then(j=>setMondayRuns(j.runs||[])),
    api('/api/admin/settlements').then(setSett)
   );
  }

  if(view==='early'){
   jobs.push(
    api('/api/admin/early-summary').then(setEarlySummary),
    api('/api/admin/settlements').then(setSett)
   );
  }

  if(view==='outstanding'){
   jobs.push(
    api('/api/admin/outstanding-payments').then(j=>setOutstanding(j.payments||[])),
    api('/api/admin/payment-plans').then(setPaymentPlans)
   );
  }

  if(view==='paymentPlans'){
   jobs.push(
    api('/api/admin/payment-plans').then(setPaymentPlans),
    api('/api/admin/outstanding-payments').then(j=>setOutstanding(j.payments||[]))
   );
  }

  if(view==='fees'){
   jobs.push(api('/api/admin/fees').then(setFees));
  }

  if(view==='transactions'){
   const p=new URLSearchParams({
    limit:'500',
    q:txQ,
    type:txType,
    status:txStatus,
    category:txCategory,
    dateFrom:txDateFrom,
    dateTo:txDateTo
   });
   jobs.push(
    api('/api/admin/transactions?'+p.toString()).then(j=>setTransactions(j.transactions||[]))
   );
  }

  await Promise.allSettled(jobs);
 }

 useEffect(()=>{
  if(!token)return;

  let stopped=false;

  const refresh=()=>{
   if(stopped)return;
   if(document.visibilityState!=='visible')return;
   silentOfficeRefresh();
  };

  const timer=setInterval(refresh,10000);

  const onVisibility=()=>{
   if(document.visibilityState==='visible')refresh();
  };

  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',onVisibility);

  return()=>{
   stopped=true;
   clearInterval(timer);
   window.removeEventListener('focus',refresh);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[token,view,txQ,txType,txStatus,txCategory,txDateFrom,txDateTo]);

 useEffect(()=>{if(token&&view==='transactions')loadTransactions()},[txType,txStatus,txCategory,txDateFrom,txDateTo]);
 const isAdmin=me?.role==='administrator',isPlatformAdmin=Boolean(me?.platformAdmin),canMoney=['administrator','finance'].includes(me?.role),canOffice=['administrator','finance','office'].includes(me?.role);
 const nav=[
  ['dashboard',LayoutDashboard,'Dashboard'],['transactions',CreditCard,'Transactions'],['customerPayments',Send,'Customer Payments'],['monday',CalendarDays,'Monday Run'],['early',ArrowUpRight,'Early Payouts'],['outstanding',AlertTriangle,'Outstanding'],['paymentPlans',CalendarDays,'Payment Plans'],['fees',BadgePoundSterling,'Fees & Billing'],['demo',PlayCircle,'Demo Lab'],['drivers',Users,'Drivers'],['access',UserCheck,'Users & Access'],...(isPlatformAdmin?[['platform',KeyRound,'Platform Admin']]:[]),...(isAdmin?[['security',ShieldCheck,'Security'],['settings',Settings,'Settings']]:[])
 ];
 const filtered=useMemo(()=>drivers.filter(d=>{const h=`${d.callsign} ${d.fullName} ${d.mobile} ${d.email} ${d.driverId} ${d.bankAccount?.accountHolder||''} ${d.bankAccount?.accountNumberMasked||''}`.toLowerCase();if(!h.includes(q.toLowerCase()))return false;if(filter==='negative')return(d.currentBalance??0)<0;if(filter==='positive')return(d.currentBalance??0)>0;if(filter==='unmatched')return d.currentBalance==null;if(filter==='bank_ready')return Boolean(d.bankAccount?.ready)&&!d.bankAccount?.changedRecently;if(filter==='bank_missing')return !d.bankAccount?.ready;if(filter==='bank_recent')return Boolean(d.bankAccount?.changedRecently);if(filter==='payout_excluded')return Boolean(d.payoutExcluded);return true}).sort((a,b)=>String(a.callsign??'').localeCompare(String(b.callsign??''),'en-GB',{numeric:true})),[drivers,q,filter]);

 const filteredPaymentPlans=useMemo(()=>{
  const needle=paymentPlanQ.trim().toLowerCase();

  return (paymentPlans?.plans||[]).filter(plan=>{
   const haystack=`${plan.callsign||''} ${plan.driverName||''}`.toLowerCase();

   if(needle&&!haystack.includes(needle))return false;

   if(
    paymentPlanStatus==='attention'&&
    !['paused','defaulted'].includes(plan.status)
   )return false;

   if(
    paymentPlanStatus==='live'&&
    !['active','paused','defaulted'].includes(plan.status)
   )return false;

   if(
    !['all','attention','live'].includes(paymentPlanStatus)&&
    plan.status!==paymentPlanStatus
   )return false;

   return true;
  });
 },[paymentPlans,paymentPlanQ,paymentPlanStatus]);

 const bankFor=driverId=>drivers.find(d=>String(d.driverId)===String(driverId))?.bankAccount||{configured:false,ready:false,status:'missing',label:'Bank details missing'};
 const bankTone=b=>!b?.ready?'bad':b?.changedRecently?'warn':'good';
 if(!token)return <AdminLogin onLogin={setToken}/>;
 if(sessionBooting)return <div className="officeBootPage"><div className="officeBootCard"><Logo/><div className="bootSpinner"><RefreshCw/></div><h2>Opening FaivoPay Office</h2><p>Securely loading your dashboard and payment controls…</p></div></div>;
 const activeMonday=mondayRuns.find(r=>['draft','approved','batched'].includes(r.status))||null;
 const mondayPlanAllocations=activeMonday
  ?planAllocations.filter(x=>String(x.runId)===String(activeMonday.id))
  :[];
 const pendingPlanAllocations=mondayPlanAllocations.filter(
  x=>x.status==='pending'
 );
 const applyingPlanAllocations=mondayPlanAllocations.filter(
  x=>x.status==='applying'
 );
 const appliedPlanAllocations=mondayPlanAllocations.filter(
  x=>x.status==='applied'
 );
 const failedPlanAllocations=mondayPlanAllocations.filter(
  x=>x.error&&x.status!=='applied'
 );
 const mondayPlanAllocationTotal=mondayPlanAllocations.reduce(
  (total,x)=>total+Number(x.allocatedAmount||0),
  0
 );
 const mondayPlanAllocationAppliedTotal=appliedPlanAllocations.reduce(
  (total,x)=>total+Number(x.allocatedAmount||0),
  0
 );

 const weeklyItems=activeMonday?.items?.filter(x=>x.action==='payout')||[];
 const weeklyCollections=activeMonday?.items?.filter(x=>x.action==='payment_request')||[];
 const weeklyCarryForward=activeMonday?.items?.filter(x=>x.action==='carry_forward')||[];
 const weeklyPayoutCarryForward=activeMonday?.items?.filter(x=>x.action==='payout_carry_forward')||[];
 const weeklyPending=weeklyItems.filter(x=>!x.approvalStatus||x.approvalStatus==='pending');
 const weeklyApproved=weeklyItems.filter(x=>x.approvalStatus==='approved');
 const weeklyExcluded=weeklyItems.filter(x=>x.approvalStatus==='excluded');
 const weeklyApprovedTotal=weeklyApproved.reduce((a,x)=>a+Number(x.amount||0),0);
 const weeklyOutstandingTotal=weeklyCollections.reduce((a,x)=>a+Number(x.amount||0),0);
 const weeklyPayoutBeforeFees=weeklyApproved.reduce((a,x)=>a+Math.max(0,Number(x.previousBalance||0)),0);
 const weeklyPayoutPlanDeductions=weeklyApproved.reduce((a,x)=>a+Number(x.planAllocation||0),0);
 const weeklyPayoutFeesCharges=Math.max(0,weeklyPayoutBeforeFees-weeklyPayoutPlanDeductions-weeklyApprovedTotal);
 const weeklyIncomingBeforeFees=weeklyCollections.reduce((a,x)=>a+Math.abs(Number(x.previousBalance||0)),0);
 const weeklyIncomingFeesCharges=Math.max(0,weeklyOutstandingTotal-weeklyIncomingBeforeFees);
 const weeklyExcludedBeforeFees=weeklyExcluded.reduce((a,x)=>a+Math.max(0,Number(x.previousBalance||0)),0);
 const activeMondayCancelledBatch=activeMonday?sett.payoutRuns.find(r=>r.runType==='weekly'&&r.status==='cancelled'&&String(r.notes||'').includes(activeMonday.id)):null;

 const activeWeeklyPayoutRun=activeMonday?.payoutRunId
  ?sett.payoutRuns.find(r=>String(r.id)===String(activeMonday.payoutRunId))||null
  :null;

 const activeEarlyPayoutRun=sett.payoutRuns.find(
  r=>r.runType==='early'&&!['paid','cancelled'].includes(r.status)
 )||null;

 const mondayWizardSteps=[
  'Rent Sheets',
  'Sync balances',
  'Plan deductions',
  'Review payouts',
  'Create run',
  'Funding',
  'Release',
  'Reconcile'
 ];

 const mondayWizardIndex=(()=>{
  if(!activeMonday)return 0;

  if(
   pendingPlanAllocations.length||
   applyingPlanAllocations.length||
   failedPlanAllocations.length
  )return 2;

  if(!activeMonday.payoutRunId){
   if(weeklyPending.length>0)return 3;
   return 4;
  }

  const r=activeWeeklyPayoutRun;
  if(!r)return 4;

  if(['ready','funding_pending'].includes(r.status))return 5;
  if(r.status==='funded')return 6;
  if(['submitted_sandbox','submitted','processing','paid'].includes(r.status))return 7;

  return 4;
 })();

 const earlyWizardSteps=[
  'Review requests',
  'Create run',
  'Funding',
  'Funds cleared',
  'Release payouts',
  'Processing',
  'Update Autocab',
  'Reconcile'
 ];

 const earlyWizardIndex=(()=>{
  const r=activeEarlyPayoutRun;

  if(!r){
   return sett.earlyPayoutRequests.some(x=>x.status==='approved')?1:0;
  }

  if(r.status==='ready')return 2;
  if(r.status==='funding_pending')return 3;
  if(r.status==='funded')return 4;
  if(['submitted_sandbox','submitted'].includes(r.status))return 5;
  if(r.status==='processing')return 6;

  return 0;
 })();
 const standardOutstanding=outstanding.filter(
  x=>x.status==='open'&&x.request_type!=='payment_plan_instalment'
 );
 const planInstalmentsDue=outstanding.filter(
  x=>x.status==='open'&&x.request_type==='payment_plan_instalment'
 );
 const onPlanOutstanding=outstanding.filter(
  x=>x.status==='on_plan'
 );
 const openOutstanding=[
  ...standardOutstanding,
  ...planInstalmentsDue
 ];
 const overdueOutstanding=openOutstanding.filter(x=>x.overdue);
 const collectibleOutstandingTotal=openOutstanding.reduce(
  (a,x)=>a+Number(x.amount||0),
  0
 );
 const dueEarly=earlySummary?.requests?.filter(x=>['requested','approved','batched'].includes(x.status))||[];
 const recentTx=transactions.slice(0,7);
 function go(k){setView(k);setMobileNav(false);setErr('');if(k==='customerPayments')loadCustomerAdmin();if(k==='monday'){loadMonday();loadSett()}if(k==='early'){loadEarlySummary();loadSett()}if(k==='outstanding'){loadOutstanding();loadPaymentPlans();}if(k==='paymentPlans')loadPaymentPlans();if(k==='fees')loadFees();if(k==='demo')loadDemo();if(k==='drivers')loadDrivers();if(k==='access'){loadStaff();loadDriverUsers()}if(k==='security')loadSecurity();if(k==='platform'){loadPlatformCompanies();setPlatformCompany(null)}if(k==='settings'){loadSettings();loadIntegrations()}}
 async function createOfficeCustomerPayment(e){
  e?.preventDefault();setCustomerCreateBusy(true);
  try{
   const j=await api('/api/admin/customer-payments',{method:'POST',body:JSON.stringify({...customerCreate,fareAmount:Number(customerCreate.fareAmount||0)})});
   setCreatedCustomerLink(j);
   setCustomerCreate({...customerCreate,bookingId:'',customerName:'',customerMobile:'',customerEmail:'',pickup:'',destination:'',journeyAt:'',fareAmount:'',notes:''});
   await loadCustomerAdmin();
  }catch(e){alert(e.message)}finally{setCustomerCreateBusy(false)}
 }
 async function copyCustomerLink(url){try{await navigator.clipboard.writeText(url);alert('Payment link copied.')}catch{prompt('Copy this payment link:',url)}}
 async function cancelCustomerPayment(id){if(!confirm('Cancel this unpaid payment link?'))return;try{await api(`/api/admin/customer-payments/${id}/cancel`,{method:'POST'});await loadCustomerAdmin()}catch(e){alert(e.message)}}
 async function submitCustomerRefund(payment){
  if(!payment?.id)return;

  const decision=customerRefundReview.decision;
  const amount=Number(customerRefundReview.amount||0);
  const total=Number(payment.totalAmount||0);
  const fare=Number(payment.fareAmount||0);
  const fee=Number(payment.feeAmount||0);

  if(decision==='partial'){
   if(!Number.isFinite(amount)||amount<=0||amount>fare){
    return alert(
     `Enter a refund amount between £0.01 and ${money(fare)}. `+
     `The ${money(fee)} FaivoPay service fee is non-refundable.`
    );
   }
  }

  const wording=
   decision==='full'
    ? `Refund the full fare of ${money(fare)}? `+
      `The ${money(fee)} FaivoPay service fee will be retained.`
    : decision==='partial'
    ? `Refund ${money(amount)} to the customer? `+
      `The ${money(fee)} FaivoPay service fee will be retained.`
    : 'Continue without refunding the customer?';

  if(!confirm(wording))return;

  setCustomerRefundBusy(true);

  try{
   const j=await api(
    `/api/admin/customer-payments/${payment.id}/refund`,
    {
     method:'POST',
     body:JSON.stringify({
      decision,
      amount:decision==='partial'?amount:undefined
     })
    }
   );

   setSelectedCustomerPayment(prev=>(
    prev?.id===payment.id
     ? {...prev,...j.payment}
     : prev
   ));

   await loadCustomerAdmin();

   if(decision==='none'){
    alert('Saved: no customer refund.');
   }else if(j.refundStatus==='pending'){
    alert(
     'Refund submitted to Stripe and is currently pending. '+
     'FaivoPay will not treat the refund as completed until Stripe confirms it.'
    );
   }else{
    alert(
     `Refund processed successfully: ${money(j.refundedAmount||0)} refunded in total.`
    );
   }

  }catch(e){
   alert(e.message);
  }finally{
   setCustomerRefundBusy(false);
  }
 }

 async function submitCustomerSettlementReview(payment){
  if(!payment?.id)return;

  const decision=customerSettlementReview.decision;
  const amount=Number(customerSettlementReview.amount||0);
  const note=customerSettlementReview.note.trim();

  if(decision==='reduced'){
   if(!Number.isFinite(amount)||amount<0||amount>Number(payment.fareAmount||0)){
    return alert(`Enter an amount between £0.00 and ${money(payment.fareAmount)}.`);
   }
   if(!note)return alert('Enter an office note explaining the reduced payment.');
  }

  if(decision==='hold'&&!note){
   return alert('Enter an office note explaining why the driver payment is being held.');
  }

  const wording=
   decision==='full'
    ? `Approve the full fare of ${money(payment.fareAmount)} for the driver?`
    : decision==='reduced'
    ? `Approve ${money(amount)} for the driver instead of the full ${money(payment.fareAmount)} fare?`
    : `Hold this driver settlement at £0.00?`;

  if(!confirm(wording))return;

  setCustomerSettlementReviewBusy(true);

  try{
   const j=await api(
    `/api/admin/customer-payments/${payment.id}/settlement-review`,
    {
     method:'POST',
     body:JSON.stringify({
      decision,
      amount:decision==='reduced'?amount:undefined,
      note
     })
    }
   );

   setSelectedCustomerPayment(prev=>(
    prev?.id===payment.id
     ? {...prev,...j.payment}
     : prev
   ));

   setCustomerSettlementReview({
    decision:'full',
    amount:'',
    note:''
   });

   await loadCustomerAdmin();

  }catch(e){
   alert(e.message);
  }finally{
   setCustomerSettlementReviewBusy(false);
  }
 }

 async function retryCustomerAutocabRelease(payment){
  if(!payment?.id)return;

  if(!confirm(
   `Retry Autocab release for booking ${payment.bookingId||'unknown'}?\n\n`+
   `The customer payment is already marked paid. This will only retry the Autocab booking update.`
  ))return;

  setCustomerReleaseRetryBusy(true);

  try{
   await api(
    `/api/admin/customer-payments/${payment.id}/retry-autocab-release`,
    {method:'POST'}
   );

   await loadCustomerAdmin();

   alert('Autocab release completed successfully.');
  }catch(e){
   await loadCustomerAdmin();
   alert(e.message);
  }finally{
   setCustomerReleaseRetryBusy(false);
  }
 }
 async function syncNow(){setLoading(true);try{await api('/api/admin/sync',{method:'POST'});await refreshCore()}catch(e){alert(e.message)}finally{setLoading(false)}}
 async function setDriverPayoutExclusion(driver){
  const excluding=!driver.payoutExcluded;
  let reason='';
  if(excluding){
   reason=prompt(`Reason for permanently excluding callsign ${driver.callsign} from payouts:`)||'';
   if(!reason.trim())return;
   if(!confirm(`Exclude callsign ${driver.callsign} from all future payouts?\n\nThey will remain visible on Monday runs but will not be included in payment batches.`))return;
  }else{
   if(!confirm(`Re-enable payouts for callsign ${driver.callsign}?\n\nFuture eligible payouts can then be approved normally.`))return;
  }
  try{
   await api(`/api/admin/drivers/${driver.driverId}/payout-exclusion`,{
    method:'PATCH',
    body:JSON.stringify({excluded:excluding,reason})
   });
   const j=await api('/api/drivers');
   setDrivers(j.drivers||[]);
   setMeta(j);
   const refreshed=(j.drivers||[]).find(x=>x.driverId===driver.driverId);
   if(refreshed)setSelected(refreshed);
  }catch(e){alert(e.message)}
 }
 async function createMonday(){if(!confirm('Confirm Autocab Rent Sheets are complete. FaivoPay will sync Autocab and create a draft using each driver’s Previous Balance.'))return;try{const j=await api('/api/admin/monday-runs',{method:'POST'});await Promise.all([loadMonday(),loadSett(),loadOutstanding(),loadFees(),loadOverview()]);alert(`Draft created. ${j.items.filter(x=>x.action==='payout').length} positive balances require approval and ${j.items.filter(x=>x.action==='payment_request').length} driver(s) owe above the collection threshold.`)}catch(e){alert(e.message)}}
 async function weeklyDecision(item,status){let reason='';if(status==='excluded'){reason=prompt(`Reason for excluding callsign ${item.callsign}:`)||'';if(!reason.trim())return}try{await api(`/api/admin/monday-runs/${activeMonday.id}/payouts/${item.payoutId}`,{method:'PATCH',body:JSON.stringify({status,reason})});setSelectedWeeklyPayouts(x=>x.filter(id=>id!==item.payoutId));await Promise.all([loadMonday(),loadSett()])}catch(e){alert(e.message)}}
 function toggleWeeklyPayout(id){
  setSelectedWeeklyPayouts(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);
 }
 function toggleAllWeeklyPayouts(){
  const ids=weeklyItems.map(x=>x.payoutId);
  setSelectedWeeklyPayouts(ids.length&&ids.every(id=>selectedWeeklyPayouts.includes(id))?[]:ids);
 }
 async function excludeSelectedWeekly(){
  if(!selectedWeeklyPayouts.length)return;
  const reason=prompt(`Reason for excluding ${selectedWeeklyPayouts.length} selected driver${selectedWeeklyPayouts.length===1?'':'s'}:`)||'';
  if(!reason.trim())return;
  if(!confirm(`Exclude ${selectedWeeklyPayouts.length} selected driver${selectedWeeklyPayouts.length===1?'':'s'} from this payment run?`))return;
  try{
   for(const payoutId of selectedWeeklyPayouts){
    await api(`/api/admin/monday-runs/${activeMonday.id}/payouts/${payoutId}`,{method:'PATCH',body:JSON.stringify({status:'excluded',reason:reason.trim()})});
   }
   setSelectedWeeklyPayouts([]);
   await Promise.all([loadMonday(),loadSett()]);
  }catch(e){
   await Promise.all([loadMonday(),loadSett()]);
   alert(e.message);
  }
 }

 async function applyMondayPlanAllocation(allocation){
  if(!activeMonday||!allocation?.id)return;

  const driver=drivers.find(
   d=>String(d.driverId)===String(allocation.driverId)
  );

  const name=driver?.fullName||`Driver ${allocation.driverId}`;

  if(
   !confirm(
    `Apply ${money(allocation.allocatedAmount)} from callsign ${allocation.callsign} (${name}) to their payment plan?\n\n`+
    `This will post a REAL debit to Autocab and reduce the FaivoPay payment-plan balance.\n\n`+
    `Only continue if the Monday settlement figures have been checked.`
   )
  )return;

  setPlanAllocationBusy(allocation.id);

  try{
   await api(
    `/api/admin/monday-runs/${activeMonday.id}/plan-allocations/${allocation.id}/apply`,
    {method:'POST'}
   );

   await Promise.all([
    loadMonday(),
    loadSett(),
    loadOutstanding(),
    loadPaymentPlans(),
    loadOverview()
   ]);

   alert(
    `${money(allocation.allocatedAmount)} has been applied to callsign ${allocation.callsign}'s payment plan.`
   );

  }catch(e){
   await Promise.all([
    loadMonday(),
    loadSett(),
    loadOutstanding(),
    loadPaymentPlans(),
    loadOverview()
   ]);

   alert(e.message);

  }finally{
   setPlanAllocationBusy(null);
  }
 }

 async function approveAllWeekly(){if(!activeMonday||!weeklyPending.length)return;if(!confirm(`Approve all ${weeklyPending.length} pending weekly payouts?`))return;try{await api(`/api/admin/monday-runs/${activeMonday.id}/approve-all`,{method:'POST'});await Promise.all([loadMonday(),loadSett()])}catch(e){alert(e.message)}}
 async function createWeeklyBatch(){if(!activeMonday||!weeklyApproved.length)return;if(!confirm(`Create the Wise payment batch for ${weeklyApproved.length} approved drivers totalling ${money(weeklyApprovedTotal)}? Excluded and pending drivers will not be included.`))return;try{const j=await api(`/api/admin/monday-runs/${activeMonday.id}/create-payout-run`,{method:'POST',body:JSON.stringify({provider:'wise'})});await Promise.all([loadMonday(),loadSett(),loadOverview()]);alert(`Payment batch created: ${j.run.itemCount} drivers · ${money(j.run.totalAmount)}.`)}catch(e){alert(e.message)}}
 async function sendWiseSandbox(r){if(!confirm(`Submit ${r.itemCount} payouts (${money(r.totalAmount)}) to Wise Sandbox? No real money will move.`))return;try{const j=await api(`/api/admin/payout-runs/${r.id}/wise-sandbox`,{method:'POST'});alert(j.message);await loadSett()}catch(e){alert(e.message)}}
 async function confirmFundingSent(r){if(!confirm(`Confirm the funding transfer for ${money(r.totalAmount)} has been sent to the payout account?\n\nThis does NOT mark the money as cleared.`))return;try{await api(`/api/admin/payout-runs/${r.id}/funding-sent`,{method:'POST'});await loadSett()}catch(e){alert(e.message)}}
 async function confirmFundsCleared(r){if(!confirm(`Confirm cleared funds of at least ${money(r.totalAmount)} are available for this run?\n\nUntil Wise API balance monitoring is connected, this is a manual control and must be checked against the provider account.`))return;try{await api(`/api/admin/payout-runs/${r.id}/funds-cleared`,{method:'POST'});await loadSett()}catch(e){alert(e.message)}}
 async function markRunPaid(r){if(!confirm(`Confirm payout run ${r.id} is paid? This will mark all ${r.itemCount} items paid and post the configured payout adjustments to Autocab.`))return;try{await api(`/api/admin/payout-runs/${r.id}`,{method:'PATCH',body:JSON.stringify({status:'paid'})});await refreshCore()}catch(e){alert(e.message)}}
 async function cancelPayoutRun(r){const label=r.runType==='weekly'?'weekly':'early payout';const reason=prompt(`Cancel this ${label} payment run?\n\nNo money must have been released to Wise or another provider.\n\nEnter a reason for cancelling:`);if(!reason?.trim())return;if(!confirm(`FINAL CHECK\n\nCancel ${r.id} for ${money(r.totalAmount)}?\n\nThe included drivers will be returned to Approved so a corrected payment run can be created.`))return;try{await api(`/api/admin/payout-runs/${r.id}/cancel`,{method:'POST',body:JSON.stringify({reason:reason.trim()})});await Promise.all([loadMonday(),loadSett(),loadEarlySummary(),loadOverview()]);alert('Payment run cancelled. No provider payment or Autocab adjustment was made. The payouts have been returned to Approved.')}catch(e){alert(e.message)}}
 async function reviewEarly(x,status){let reason='';if(status==='declined'){reason=prompt(`Reason for declining callsign ${x.callsign}:`)||'';if(!reason.trim())return}try{await api(`/api/admin/payouts/${x.id}`,{method:'PATCH',body:JSON.stringify({status,reason})});await Promise.all([loadSett(),loadEarlySummary(),loadOverview()])}catch(e){alert(e.message)}}
 async function createEarlyBatch(){if(!confirm('Create a payment run containing all approved early payouts due today?'))return;try{const j=await api('/api/admin/payout-runs',{method:'POST',body:JSON.stringify({runType:'early',provider:'wise'})});await loadSett();alert(`Early payout batch created: ${j.run.itemCount} drivers · ${money(j.run.totalAmount)}.`)}catch(e){alert(e.message)}}
 async function sendEarlySummary(){try{const j=await api('/api/admin/early-summary/send',{method:'POST'});alert(`Office summary sent: ${j.count} request(s), ${money(j.total)}.`);await loadEarlySummary()}catch(e){alert(e.message)}}
 async function postManual(e){e.preventDefault();if(!confirm(`${manual.type==='pay_in'?'Pay in':'Payout'} ${money(Number(manual.amount))} for callsign ${manual.callsign}? This posts directly to Autocab.`))return;setManualBusy(true);try{const j=await api('/api/admin/manual-payment',{method:'POST',body:JSON.stringify({...manual,amount:Number(manual.amount)})});alert(`${j.type==='pay_in'?'Pay in':'Payout'} posted for ${j.driver.fullName}.`);setManual({callsign:'',type:'pay_in',amount:'',reason:''});await refreshCore()}catch(e){alert(e.message)}finally{setManualBusy(false)}}
 async function saveSettings(){try{const j=await api('/api/admin/operations-settings',{method:'PUT',body:JSON.stringify(settings)});setSettings(j);alert('FaivoPay settings saved.')}catch(e){alert(e.message)}}
 async function testSmsNow(){try{await api('/api/admin/communications/test-sms',{method:'POST',body:JSON.stringify(testSms)});alert('Test SMS sent.')}catch(e){alert(e.message)}}
 async function testEmailNow(){try{await api('/api/admin/communications/test-email',{method:'POST',body:JSON.stringify({to:testEmail||settings?.officeNotificationEmail})});alert('Test email sent.')}catch(e){alert(e.message)}}

 function openPaymentPlanCreate(x){
  const today=new Date().toISOString().slice(0,10);

  setPlanCreateSource(x);
  setPlanCreate({
   frequency:'weekly',
   instalmentAmount:'',
   startDate:today,
   notes:''
  });
 }

 async function createPaymentPlan(e){
  e?.preventDefault();

  if(!planCreateSource)return;

  const amount=Number(planCreate.instalmentAmount||0);

  if(!Number.isFinite(amount)||amount<=0){
   alert('Enter a valid instalment amount.');
   return;
  }

  setPlanCreateBusy(true);

  try{
   const j=await api('/api/admin/payment-plans',{
    method:'POST',
    body:JSON.stringify({
     paymentRequestId:planCreateSource.id,
     frequency:planCreate.frequency,
     instalmentAmount:amount,
     startDate:planCreate.startDate,
     notes:planCreate.notes
    })
   });

   setPlanCreateSource(null);
   setSelectedPaymentPlan(j.plan);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

   setView('paymentPlans');

  }catch(e){
   alert(e.message);
  }finally{
   setPlanCreateBusy(false);
  }
 }

 async function activatePaymentPlan(plan){
  if(
   !confirm(
    `Activate this payment plan for callsign ${plan.callsign}?\n\n`+
    `${money(plan.planAmount)} total · ${money(plan.instalmentAmount)} ${plan.frequency}\n\n`+
    `The existing full-balance payment request will be closed and the first instalment will become payable.`
   )
  )return;

  setPlanActivateBusy(true);

  try{
   const j=await api(
    `/api/admin/payment-plans/${plan.id}/activate`,
    {method:'POST'}
   );

   setSelectedPaymentPlan(j.plan);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

   alert('Payment plan activated.');

  }catch(e){
   alert(e.message);
  }finally{
   setPlanActivateBusy(false);
  }
 }


 async function openPaymentPlanDetails(plan){
  if(!plan?.id)return;

  setSelectedPaymentPlan(plan);

  try{
   const j=await api(`/api/admin/payment-plans/${plan.id}`);

   setSelectedPaymentPlan(current=>
    String(current?.id)===String(plan.id)
     ?j.plan
     :current
   );
  }catch(e){
   setErr(e.message);
  }
 }

 async function refreshSelectedPaymentPlan(planId){
  const j=await api(`/api/admin/payment-plans/${planId}`);

  setSelectedPaymentPlan(j.plan);

  await Promise.all([
   loadPaymentPlans(),
   loadOutstanding()
  ]);

  return j.plan;
 }

 async function pausePaymentPlan(plan){
  const reason=prompt(
   'Why is this payment plan being paused?\n\nThis note will be recorded in the audit history.',
   ''
  );

  if(reason===null)return;

  if(
   !confirm(
    `Pause the payment plan for callsign ${plan.callsign}?\n\n`+
    `The driver will not be able to make the current plan payment until the plan is resumed.`
   )
  )return;

  setPlanActionBusy(true);

  try{
   const j=await api(
    `/api/admin/payment-plans/${plan.id}/pause`,
    {
     method:'POST',
     body:JSON.stringify({reason})
    }
   );

   setSelectedPaymentPlan(j.plan);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

   alert('Payment plan paused.');

  }catch(e){
   alert(e.message);
  }finally{
   setPlanActionBusy(false);
  }
 }

 async function resumePaymentPlan(plan){
  if(
   !confirm(
    `Resume the payment plan for callsign ${plan.callsign}?\n\n`+
    `The current instalment will become payable again.`
   )
  )return;

  setPlanActionBusy(true);

  try{
   const j=await api(
    `/api/admin/payment-plans/${plan.id}/resume`,
    {method:'POST'}
   );

   setSelectedPaymentPlan(j.plan);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

   alert(
    j.plan.status==='defaulted'
     ?'Payment plan resumed. The current instalment remains overdue.'
     :'Payment plan resumed.'
   );

  }catch(e){
   alert(e.message);
  }finally{
   setPlanActionBusy(false);
  }
 }

 function openPaymentPlanAmend(plan){
  if(!['draft','paused'].includes(plan.status)){
   alert('Pause this payment plan before amending it.');
   return;
  }

  const defaultDate=
   plan.status==='draft'
    ?plan.startDate
    :plan.nextDueAt;

  setPlanAmendTarget(plan);
  setPlanAmend({
   frequency:plan.frequency||'weekly',
   instalmentAmount:Number(plan.instalmentAmount||0).toFixed(2),
   startDate:defaultDate||new Date().toISOString().slice(0,10),
   notes:plan.notes||''
  });
 }

 async function submitPaymentPlanAmend(e){
  e?.preventDefault();

  if(!planAmendTarget)return;

  const instalmentAmount=Number(planAmend.instalmentAmount||0);
  const remaining=Number(planAmendTarget.remainingAmount||0);

  if(!['weekly','fortnightly','monthly'].includes(planAmend.frequency)){
   alert('Choose a valid payment frequency.');
   return;
  }

  if(!Number.isFinite(instalmentAmount)||instalmentAmount<=0){
   alert('Enter a valid instalment amount greater than zero.');
   return;
  }

  if(instalmentAmount>remaining){
   alert('Instalment amount cannot exceed the remaining balance.');
   return;
  }

  if(!/^\d{4}-\d{2}-\d{2}$/.test(planAmend.startDate||'')){
   alert('Choose a valid payment date.');
   return;
  }

  setPlanAmendBusy(true);

  try{
   const j=await api(
    `/api/admin/payment-plans/${planAmendTarget.id}/amend`,
    {
     method:'POST',
     body:JSON.stringify({
      frequency:planAmend.frequency,
      instalmentAmount,
      startDate:planAmend.startDate,
      notes:planAmend.notes.trim()
     })
    }
   );

   setSelectedPaymentPlan(j.plan);
   setPlanAmendTarget(null);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

  }catch(e){
   alert(e.message);
  }finally{
   setPlanAmendBusy(false);
  }
 }

 function isPaymentPlanFinalSettlement(plan){
  if(!plan)return false;

  return (
   Boolean(plan.earlySettlementRequested) &&
   Number(plan.remainingAmount||0)>0
  );
 }

 async function recordManualExtraPlanPayment(plan){
  const current=plan?.instalments?.find(x=>['due','overdue'].includes(x.status));
  if(!current)return alert('No current payment-plan instalment could be found.');

  const currentRemaining=Math.max(0,Number(current.amount||0)-Number(current.paidAmount||0));
  const maxExtra=Math.max(0,Number(plan.remainingAmount||0)-currentRemaining);

  if(maxExtra<=0.00001){
   return alert('There is no future principal available for an extra payment. Pay the current instalment or use Settle early.');
  }

  const raw=prompt(
   `Record an extra payment already received?\n\nMaximum extra payment: ${money(maxExtra)}\nCurrent instalment remaining: ${money(currentRemaining)}\n\nThis reduces future plan principal only.`,
   ''
  );
  if(raw===null)return;

  const amount=Number(raw);
  if(!Number.isFinite(amount)||amount<=0)return alert('Enter a valid extra payment amount.');
  if(amount>maxExtra+0.00001)return alert(`Extra payment cannot exceed ${money(maxExtra)}.`);

  if(!confirm(
   `FINAL CHECK\n\nRecord ${money(amount)} as money already received from callsign ${plan.callsign}?\n\n`+
   `This will reduce the FaivoPay payment-plan principal.\n`+
   `It will NOT post another adjustment to Autocab.\n`+
   `The current ${money(currentRemaining)} instalment remains due.`
  ))return;

  setPlanActionBusy(true);
  try{
   const j=await api(`/api/admin/payment-plans/${plan.id}/extra-payment/manual`,{
    method:'POST',
    body:JSON.stringify({amount})
   });
   setSelectedPaymentPlan(j.plan);
   await Promise.all([loadPaymentPlans(),loadOutstanding(),loadOverview()]);
   alert(`${money(amount)} extra payment recorded. Remaining plan balance: ${money(j.plan.remainingAmount)}.`);
  }catch(e){
   alert(e.message);
  }finally{
   setPlanActionBusy(false);
  }
 }

 async function settlePaymentPlanEarly(plan){
  const remaining=Number(plan.remainingAmount||0);

  if(isPaymentPlanFinalSettlement(plan)){
   return;
  }

  if(
   !confirm(
    `Settle this payment plan early?\n\n`+
    `Remaining balance: ${money(remaining)}\n\n`+
    `Future instalments will be cancelled and the driver will be asked to pay the full remaining balance in one payment.`
   )
  )return;

  setPlanActionBusy(true);

  try{
   const j=await api(
    `/api/admin/payment-plans/${plan.id}/settle-early`,
    {method:'POST'}
   );

   setSelectedPaymentPlan(j.plan);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

  }catch(e){
   alert(e.message);
  }finally{
   setPlanActionBusy(false);
  }
 }

 async function cancelPaymentPlan(plan){
  const reason=prompt(
   'Enter the reason for cancelling this payment plan.\n\nThe remaining balance will return to normal Outstanding.',
   ''
  );

  if(reason===null)return;

  if(!reason.trim()){
   alert('A cancellation reason is required.');
   return;
  }

  const remaining=Number(plan.remainingAmount||0);

  if(
   !confirm(
    `Cancel this payment plan for callsign ${plan.callsign}?\n\n`+
    `Remaining balance: ${money(remaining)}\n\n`+
    `The remaining balance will return to normal Outstanding and can be paid in full or placed onto a new plan.`
   )
  )return;

  setPlanActionBusy(true);

  try{
   const j=await api(
    `/api/admin/payment-plans/${plan.id}/cancel`,
    {
     method:'POST',
     body:JSON.stringify({
      reason:reason.trim()
     })
    }
   );

   setSelectedPaymentPlan(j.plan);

   await Promise.all([
    loadPaymentPlans(),
    loadOutstanding()
   ]);

   alert(
    `Payment plan cancelled. ${money(remaining)} has returned to Outstanding.`
   );

  }catch(e){
   alert(e.message);
  }finally{
   setPlanActionBusy(false);
  }
 }

async function resendOutstanding(x){try{await api(`/api/admin/outstanding-payments/${x.id}/resend`,{method:'POST'});alert('Payment reminder sent.');await loadOutstanding()}catch(e){alert(e.message)}}
 async function createStripeLink(x){try{const j=await api(`/api/admin/payment-requests/${x.id}/stripe`,{method:'POST'});await loadOutstanding();if(j.paymentUrl)window.open(j.paymentUrl,'_blank')}catch(e){alert(e.message)}}
 async function markFeesInvoiced(){const invoiceRef=prompt('Enter the invoice reference/number:');if(!invoiceRef?.trim())return;try{const j=await api('/api/admin/fees/mark-invoiced',{method:'POST',body:JSON.stringify({invoiceRef})});alert(`${j.count} fee records marked invoiced.`);await loadFees()}catch(e){alert(e.message)}}
 async function downloadFeesCsv(){try{const r=await fetch(`${API_BASE}/api/admin/fees/csv?status=all`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not export fees');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='FaivoPay-fees.csv';a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}
 async function downloadPaymentPlansCsv(){try{const r=await fetch(`${API_BASE}/api/admin/payment-plans/csv`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not export payment plans');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='FaivoPay-payment-plans.csv';a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}
 async function downloadOfficeCsv(dataset,filename){try{const r=await fetch(`${API_BASE}/api/admin/exports/${dataset}.csv`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){let message='Could not export CSV';try{const j=await r.json();message=j.error||message}catch{}throw new Error(message)}const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=filename||`FaivoPay-${dataset}.csv`;a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}

 async function startCompanyWizard(){
  setPlatformCompany(null);
  setPlatformWizardStep(0);
  setPlatformWizard({
   general:{name:'',primaryDomain:'',supportEmail:'',supportPhone:'',timezone:'Europe/London'},
   autocab:{companyIds:'',adjustmentsEnabled:false,apiKey:''},
   stripe:{secretKey:'',webhookSecret:''},
   sendgrid:{fromEmail:'',fromName:'FaivoPay',apiKey:''},
   twilio:{accountSid:'',messagingServiceSid:'',fromNumber:'',authToken:''},
   branding:{productName:'FaivoPay',supportEmail:'',supportPhone:''},
   features:{paymentPlans:true,earlyPayouts:true,customerPayments:true,driverPayouts:true,demoLab:true}
  });
  setPlatformWizardOpen(true);
 }

 async function createPlatformCompany(){
  const g=platformWizard.general;
  if(!String(g.name||'').trim())return alert('Enter the company name first.');
  try{
   const created=await api('/api/admin/platform/companies',{
    method:'POST',
    body:JSON.stringify(g)
   });
   const companyId=created.company.id;
   const saved=await api(`/api/admin/platform/companies/${companyId}`,{
    method:'PUT',
    body:JSON.stringify(platformWizard)
   });
   setPlatformWizardOpen(false);
   setPlatformWizardStep(0);
   setPlatformCompany(saved);
   await loadPlatformCompanies();
   alert(`${created.company.name} has been created as a draft company. No live integrations have been switched.`);
  }catch(e){alert(e.message)}
 }

 async function savePlatformCompany(){
  if(!platformCompany?.company?.id)return;
  try{
   const saved=await api(`/api/admin/platform/companies/${platformCompany.company.id}`,{
    method:'PUT',
    body:JSON.stringify({
     general:platformCompany.company,
     autocab:platformCompany.config?.autocab||{},
     stripe:platformCompany.config?.stripe||{},
     sendgrid:platformCompany.config?.sendgrid||{},
     twilio:platformCompany.config?.twilio||{},
     branding:platformCompany.config?.branding||{},
     features:platformCompany.config?.features||{}
    })
   });
   setPlatformCompany(saved);
   await loadPlatformCompanies();
   alert('Company configuration saved. Live integration behaviour is unchanged.');
  }catch(e){alert(e.message)}
 }

 function updatePlatformConfig(section,key,value){
  setPlatformCompany(cur=>({
   ...cur,
   config:{
    ...cur.config,
    [section]:{...(cur.config?.[section]||{}),[key]:value}
   }
  }));
 }

async function createStaff(e){e.preventDefault();try{await api('/api/admin/staff',{method:'POST',body:JSON.stringify(newStaff)});setNewStaff({name:'',email:'',role:'office',password:''});setShowNewStaff(false);await loadStaff()}catch(e){alert(e.message)}}
 async function updateStaff(u,changes){try{await api(`/api/admin/staff/${u.id}`,{method:'PATCH',body:JSON.stringify(changes)});await loadStaff()}catch(e){alert(e.message)}}
 async function setApproval(u,approved){try{await api(`/api/admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({approved})});await loadDriverUsers()}catch(e){alert(e.message)}}
 const statusTone=s=>['paid','completed','approved','sent','invoiced'].includes(String(s))?'good':['failed','declined','overdue','cancelled','defaulted'].includes(String(s))?'bad':['on_plan','active','paused'].includes(String(s))?'warn':'warn';

 const customerPaymentStatus=x=>x?.paymentStatus||x?.status||'open';
 const customerJobStatus=x=>x?.jobStatus||'';
 const customerSettlementStatus=x=>x?.driverSettlementStatus||'not_ready';

 const customerPaymentLabel=s=>({
  open:'Awaiting payment',
  paid:'Paid',
  cancelled:'Cancelled',
  refunded:'Refunded'
 }[s]||String(s||'').replaceAll('_',' '));

 const customerJobLabel=s=>({
  awaiting_payment:'Awaiting payment',
  release_pending:'Release pending',
  ready:'Ready',
  dispatched:'Dispatched',
  completed:'Completed',
  no_fare:'No Fare',
  cancelled:'Cancelled',
  manual:'Manual'
 }[s]||String(s||'').replaceAll('_',' '));

 const customerSettlementLabel=s=>({
  not_ready:'Not ready',
  review:'Review required',
  approved:'Approved',
  paid:'Paid',
  held:'Held'
 }[s]||String(s||'').replaceAll('_',' '));

 const customerJobTone=s=>
  s==='completed'||s==='ready'?'good':
  s==='cancelled'||s==='no_fare'?'bad':
  s==='dispatched'?'neutral':
  'warn';

 const customerSettlementTone=s=>
  s==='approved'||s==='paid'?'good':
  s==='review'||s==='held'?'warn':
  'neutral';
 async function resetDemo(){if(!confirm('Reset Demo Lab back to its original made-up data?'))return;try{setDemo(await api('/api/admin/demo/reset',{method:'POST'}))}catch(e){alert(e.message)}}
 async function demoMondayDecision(x,status){try{setDemo(await api(`/api/admin/demo/monday/${x.id}`,{method:'POST',body:JSON.stringify({status,reason:status==='excluded'?'Excluded during demonstration':''})}))}catch(e){alert(e.message)}}
 async function demoApproveAll(){try{setDemo(await api('/api/admin/demo/monday/approve-all',{method:'POST'}))}catch(e){alert(e.message)}}
 async function demoMondayBatch(){try{setDemo(await api('/api/admin/demo/monday/batch',{method:'POST'}))}catch(e){alert(e.message)}}
 async function demoMondayPay(){try{setDemo(await api('/api/admin/demo/monday/pay',{method:'POST'}))}catch(e){alert(e.message)}}
 async function demoEarlyDecision(x,status){try{setDemo(await api(`/api/admin/demo/early/${x.id}`,{method:'POST',body:JSON.stringify({status})}))}catch(e){alert(e.message)}}
 async function demoEarlyBatch(){try{setDemo(await api('/api/admin/demo/early/batch',{method:'POST'}))}catch(e){alert(e.message)}}
 async function demoEarlyPay(){try{setDemo(await api('/api/admin/demo/early/pay',{method:'POST'}))}catch(e){alert(e.message)}}
 async function demoSendEmail(){try{await api('/api/admin/demo/test-email',{method:'POST',body:JSON.stringify({to:demoEmail})});alert('Demo email sent.')}catch(e){alert(e.message)}}
 async function demoSendSms(){try{await api('/api/admin/demo/test-sms',{method:'POST',body:JSON.stringify({to:demoMobile})});alert('Demo SMS sent.')}catch(e){alert(e.message)}}
 async function demoAction(path,confirmText='',body={}){if(confirmText&&!confirm(confirmText))return;try{setDemo(await api(path,{method:'POST',body:JSON.stringify(body)}))}catch(e){alert(e.message)}}
 async function launchReset(){if(resetPhrase!=='RESET FAIVOPAY FOR LIVE LAUNCH')return alert('Type the confirmation phrase exactly.');if(!confirm('FINAL CHECK: create a backup and clear FaivoPay operational data for live launch?'))return;try{const j=await api('/api/admin/launch-reset',{method:'POST',body:JSON.stringify({phrase:resetPhrase,includeDriverAccounts:resetDrivers})});setResetPhrase('');alert(`Launch reset complete. Backup: ${j.backupFile}`);await refreshCore()}catch(e){alert(e.message)}}
 const LiveRunCard=({r,showSteps=true})=>{
  const idx=r.status==='ready'?3:r.status==='funding_pending'?4:r.status==='funded'?5:['submitted_sandbox','submitted','processing'].includes(r.status)?6:r.status==='paid'?7:r.status==='cancelled'?-1:3;
  const steps=r.runType==='weekly'
   ?['Rent Sheets','Sync & approve','Lock run','Funding','Funds cleared','Release','Autocab','Reconciled']
   :['Review requests','Create run','Funding','Funds cleared','Review payouts','Release','Processing','Complete'];
  const canCancel=['ready','funding_pending','funded'].includes(r.status)&&!r.providerRef&&!r.releasedAt;

  return <div className={`liveWorkflowCard wizardFlowCard ${r.status==='cancelled'?'cancelled':''}`}>
   <div className="liveWorkflowHead">
    <div>
     <span>{r.runType==='weekly'?'WEEKLY PAYMENT RUN':'EARLY PAYOUT RUN'} · {dt(r.createdAt)}</span>
     <h3>{money(r.totalAmount)}</h3>
     <p>{r.itemCount} drivers · {r.id}</p>
    </div>
    <Pill tone={statusTone(r.status)}>{String(r.status).replaceAll('_',' ')}</Pill>
   </div>

   {showSteps&&<WizardSteps steps={steps} currentIndex={idx}/>}

   <div className="wizardStageBody">
    {r.status==='ready'&&<div className="operatorWarning"><AlertTriangle/><div><b>Funding required</b><span>The payment run is locked. Transfer the required funds, then record that the transfer has been sent.</span></div></div>}

    {r.status==='funding_pending'&&<div className="operatorWarning blue"><Clock3/><div><b>Funding transfer sent</b><span>Cancellation is still available. Do not release payouts until the funds are visibly cleared in the payout account.</span></div></div>}

    {r.status==='funded'&&<div className="operatorWarning green"><CheckCircle2/><div><b>Funds cleared — final review</b><span>Check the driver count and total before releasing payouts. Cancellation remains available until release.</span></div></div>}

    {['submitted_sandbox','submitted','processing'].includes(r.status)&&<div className="operatorWarning blue"><Clock3/><div><b>Payouts processing</b><span>The run has been released to the payment provider. Cancellation is no longer available.</span></div></div>}

    <div className="runCardActions liveRunActions">
     {canCancel&&canMoney&&<button className="dangerOutline" onClick={()=>cancelPayoutRun(r)}><X/>Cancel payment run</button>}
     {r.status==='ready'&&canMoney&&<button className="primary" onClick={()=>confirmFundingSent(r)}><Banknote/>Funding transfer sent</button>}
     {r.status==='funding_pending'&&canMoney&&<button className="primary" onClick={()=>confirmFundsCleared(r)}><CheckCircle2/>Confirm funds cleared</button>}
     {r.status==='funded'&&integrations?.wise?.environment==='sandbox'&&canMoney&&<button className="primary" onClick={()=>sendWiseSandbox(r)}><Send/>Release payouts to Wise sandbox</button>}
     {r.status==='funded'&&integrations?.wise?.environment!=='sandbox'&&<span className="tinyNote">Live provider release will unlock when Wise production payout API is connected.</span>}
     {['submitted_sandbox','submitted','processing'].includes(r.status)&&canMoney&&<button className="primary" onClick={()=>markRunPaid(r)}><ShieldCheck/>Confirm paid & update Autocab</button>}
    </div>

    {r.status==='paid'&&<div className="demoComplete"><CheckCircle2/><div><b>Run reconciled</b><span>Provider payment confirmed and matching Autocab updates completed.</span></div></div>}
    {r.status==='cancelled'&&<div className="cancelledRunNote"><X/><span>Cancelled before release. Included drivers were returned to Approved.</span></div>}
   </div>
  </div>
 };
   const txTypes=[['all','All activity'],['customer_payment','Customer payments'],['customer_refund','Customer refunds'],['driver_payment','Driver payments'],['weekly_payout','Weekly payouts'],['early_payout','Early payouts'],['fee','Fees']];
   const transactionKind=x=>
    x?.requestType==='payment_plan_instalment'?'Plan instalment':
    x?.requestType==='payment_plan_extra'?'Extra plan payment':
    x?.typeLabel||String(x?.type||'Transaction').replaceAll('_',' ');
   const transactionKindTone=x=>
    x?.requestType==='payment_plan_extra'?'good':
    x?.requestType==='payment_plan_instalment'?'warn':
    x?.type==='customer_refund'?'bad':
    x?.type==='customer_payment'?'good':
    x?.type==='weekly_payout'||x?.type==='early_payout'?'neutral':
    x?.type==='fee'?'warn':'neutral';
   const transactionSummary={
    count:transactions.length,
    incoming:transactions.filter(x=>x.direction!=='out').reduce((a,x)=>a+Number(x.amount||0),0),
    outgoing:transactions.filter(x=>x.direction==='out').reduce((a,x)=>a+Number(x.amount||0),0)
   };
   transactionSummary.net=transactionSummary.incoming-transactionSummary.outgoing;
   const officeExportByView={
    transactions:{dataset:'transactions',filename:'FaivoPay-transactions.csv'},
    customerPayments:{dataset:'customer-payments',filename:'FaivoPay-customer-payments.csv'},
    monday:{dataset:'monday-settlements',filename:'FaivoPay-monday-settlements.csv'},
    early:{dataset:'early-payouts',filename:'FaivoPay-early-payouts.csv'},
    outstanding:{dataset:'outstanding',filename:'FaivoPay-outstanding.csv'},
    drivers:{dataset:'drivers',filename:'FaivoPay-drivers.csv'},
    access:{dataset:'access',filename:'FaivoPay-access.csv'},
    security:{dataset:'audit',filename:'FaivoPay-audit.csv'}
   };
   const currentOfficeExport=officeExportByView[view]||null;
   const exportCurrentOfficeView=()=>{
    if(view==='paymentPlans')return downloadPaymentPlansCsv();
    if(view==='fees')return downloadFeesCsv();
    if(currentOfficeExport)return downloadOfficeCsv(currentOfficeExport.dataset,currentOfficeExport.filename);
   };
   const canExportCurrentView=Boolean(currentOfficeExport)||view==='paymentPlans'||view==='fees';
 return <div className="shell officeV2">
  <aside className={`sidebar officeSidebar ${mobileNav?'open':''}`}>
   <div className="sideTop"><Logo/><button className="mobileClose" onClick={()=>setMobileNav(false)}><X/></button></div>
   <div className="officeUserMini"><div className="avatar small">{me?.name?.split(' ').map(x=>x[0]).slice(0,2).join('')||'FP'}</div><div><b>{me?.name||'FaivoPay Office'}</b><span>{me?.role||'Secure session'}</span></div></div>
   <nav>{nav.map(([k,I,l])=><button key={k} className={view===k?'active':''} onClick={()=>go(k)}><I/>{l}{k==='outstanding'&&overdueOutstanding.length>0&&<em>{overdueOutstanding.length}</em>}</button>)}</nav>
   <div className="sideStatus"><span className="statusDot"/><div><b>Secure session</b><small>MFA verified</small></div></div>
   <button className="logoutBtn" onClick={logout}><LogOut/>Sign out</button>
  </aside>
  <main className="main officeMain">
   <header className="topbar officeTopbar"><button className="menuBtn" onClick={()=>setMobileNav(true)}><Menu/></button><div><span className="eyebrow">FAIVOPAY OFFICE</span><h1>{nav.find(x=>x[0]===view)?.[2]||'Office'}</h1></div><div className="topActions"><span className={`envBadge ${integrations?.stripe?.testMode||integrations?.wise?.environment==='sandbox'?'test':'live'}`}>{integrations?.stripe?.testMode||integrations?.wise?.environment==='sandbox'?'TEST ENVIRONMENT':'LIVE'}</span>{canExportCurrentView&&<button className="iconTextButton" onClick={exportCurrentOfficeView}><FileClock/>Export CSV</button>}<button className="iconTextButton" onClick={refreshCore}><RefreshCw className={loading?'spin':''}/>Refresh</button></div></header>
   <div className="content officeContent">
    {err&&<div className="inlineError"><AlertTriangle/>{err}</div>}
    {view==='dashboard'&&<>
     <section className="dashboardHeroV3">
      <div className="dashboardHeroMain">
       <span className="dashboardEyebrow">TODAY AT A GLANCE</span>
       <h2>FaivoPay operations</h2>
       <p>
        {new Intl.DateTimeFormat('en-GB',{
         weekday:'long',
         day:'numeric',
         month:'long'
        }).format(new Date())}
        {' · '}
        Everything requiring attention today, in one place.
       </p>
      </div>

      <div className="dashboardHeroStatus">
       <div>
        <Database/>
        <span>Autocab sync</span>
        <b>{meta.lastSync?dt(meta.lastSync):'Not synced'}</b>
       </div>
       <button className="mini light" onClick={syncNow}>
        <RefreshCw/>
        Sync now
       </button>
      </div>
     </section>

     <section className="dashboardKpis">

      <button className="dashboardKpi" onClick={()=>go('customerPayments')}>
       <div className="dashboardKpiIcon"><CreditCard/></div>
       <div>
        <span>Customer payments</span>
        <strong>{money(overview?.customerPayments?.total||0)}</strong>
        <small>{overview?.customerPayments?.count||0} paid today</small>
       </div>
      </button>

      <button className="dashboardKpi" onClick={()=>go('customerPayments')}>
       <div className="dashboardKpiIcon"><CreditCard/></div>
       <div>
        <span>Paylinks today</span>
        <strong>{overview?.paylinks?.created||0}</strong>
        <small>
         {overview?.paylinks?.paid||0} paid · {overview?.paylinks?.open||0} open · {money(overview?.paylinks?.createdValue||0)}
        </small>
       </div>
      </button>

      <button className="dashboardKpi" onClick={()=>go('early')}>
       <div className="dashboardKpiIcon"><ArrowUpRight/></div>
       <div>
        <span>Early payout requests</span>
        <strong>{overview?.early?.requested||0}</strong>
        <small>{money(overview?.early?.requestedTotal||0)} requested today</small>
       </div>
      </button>

      <button className="dashboardKpi" onClick={()=>go('fees')}>
       <div className="dashboardKpiIcon"><BadgePoundSterling/></div>
       <div>
        <span>FaivoPay fees today</span>
        <strong>{money(overview?.customerPayments?.fees||0)}</strong>
        <small>From today's customer payments</small>
       </div>
      </button>

     </section>

     <section className="dashboardMainGrid">

      <div className="dashboardPrimaryColumn">

       {new Date(
        `${overview?.today||new Date().toISOString().slice(0,10)}T12:00:00`
       ).getDay()===1

        ? <section className="panel dashboardFeatureCard mondayFeature">

           <div className="dashboardFeatureHead">
            <div>
             <span className="sectionKicker">MONDAY PAYMENT RUN</span>
             <h3>Weekly settlement</h3>
             <p>
              Review today's Monday run, approvals and payment progress.
             </p>
            </div>

            <Pill tone={activeMonday?'warn':'neutral'}>
             {activeMonday
              ? String(activeMonday.status||'active').replaceAll('_',' ')
              : 'Not started'}
            </Pill>
           </div>

           <div className="dashboardFeatureAmount">
            <span>Approved for payout</span>
            <strong>
             {money(
              weeklyApproved.reduce(
               (a,x)=>a+Number(x.amount||0),
               0
              )
             )}
            </strong>
           </div>

           <div className="dashboardFeatureStats">
            <div>
             <span>Approved</span>
             <b>{weeklyApproved.length}</b>
            </div>

            <div>
             <span>Awaiting decision</span>
             <b className={weeklyPending.length?'attentionText':''}>
              {weeklyPending.length}
             </b>
            </div>

            <div>
             <span>Run status</span>
             <b>
              {activeMonday
               ? String(activeMonday.status||'active').replaceAll('_',' ')
               : 'Not started'}
             </b>
            </div>
           </div>

           <button
            className="dashboardFeatureAction"
            onClick={()=>go('monday')}
           >
            Open Monday Run
            <ChevronRight/>
           </button>

          </section>

        : <section className="panel dashboardFeatureCard earlyFeature">

           <div className="dashboardFeatureHead">
            <div>
             <span className="sectionKicker">TODAY'S EARLY PAYOUTS</span>
             <h3>Early payout overview</h3>
             <p>
              Requests received today and their current approval position.
             </p>
            </div>

            <Pill tone={(dueEarly.length||overview?.early?.requested)?'warn':'good'}>
             {dueEarly.length||overview?.early?.requested
              ? 'Action'
              : 'Clear'}
            </Pill>
           </div>

           <div className="dashboardFeatureAmount">
            <span>Requested today</span>
            <strong>{money(overview?.early?.requestedTotal||0)}</strong>
           </div>

           <div className="dashboardFeatureStats">
            <div>
             <span>Requests</span>
             <b>{overview?.early?.requested||0}</b>
            </div>

            <div>
             <span>Approved</span>
             <b>{overview?.early?.approved||0}</b>
            </div>

            <div>
             <span>Paid</span>
             <b>{overview?.early?.paid||0}</b>
            </div>
           </div>

           <button
            className="dashboardFeatureAction"
            onClick={()=>go('early')}
           >
            Open Early Payouts
            <ChevronRight/>
           </button>

          </section>
       }

       <section
        className={`panel dashboardAttention ${
         Number(overview?.attention?.total||0)>0
          ? 'hasAttention'
          : 'allClear'
        }`}
       >

        <div className="panelHead">
         <div>
          <span className="sectionKicker">ATTENTION REQUIRED</span>
          <h3>
           {Number(overview?.attention?.total||0)>0
            ? `${overview.attention.total} item${
               Number(overview.attention.total)===1?'':'s'
              } need attention`
            : 'Everything is under control'}
          </h3>
          <p>
           Exceptions and outstanding work that may need an office decision.
          </p>
         </div>

         <div className="dashboardAttentionBadge">
          {overview?.attention?.total||0}
         </div>
        </div>

        <div className="attentionGrid">

         <button onClick={()=>go('customerPayments')}>
          <span>Settlement reviews</span>
          <b>{overview?.attention?.settlementReview||0}</b>
         </button>

         <button onClick={()=>go('customerPayments')}>
          <span>Autocab release failures</span>
          <b>{overview?.attention?.releaseFailed||0}</b>
         </button>

         <button onClick={()=>go('customerPayments')}>
          <span>Refunds pending</span>
          <b>{overview?.attention?.refundPending||0}</b>
         </button>

         <button onClick={()=>go('outstanding')}>
          <span>Overdue driver payments</span>
          <b>{overview?.attention?.overduePaymentRequests||0}</b>
         </button>

         <button onClick={()=>go('paymentPlans')}>
          <span>Payment plans</span>
          <b>{overview?.attention?.paymentPlans||0}</b>
         </button>

         <button onClick={()=>go('transactions')}>
          <span>Failed adjustments</span>
          <b>{overview?.attention?.failedAdjustments||0}</b>
         </button>

        </div>
       </section>

      </div>

      <div className="dashboardSideColumn">

       <section className="panel dashboardMoneyCard">
        <div className="panelHead">
         <div>
          <span className="sectionKicker">MONEY TODAY</span>
          <h3>Financial movement</h3>
         </div>
        </div>

        <div className="dashboardMoneyRows">

         <div>
          <span>Customer payments</span>
          <div>
           <b>{money(overview?.customerPayments?.total||0)}</b>
           <small>{overview?.customerPayments?.count||0} payments</small>
          </div>
         </div>

         <div>
          <span>Customer refunds</span>
          <div>
           <b className={Number(overview?.refunds?.total||0)>0?'negative':''}>
            {Number(overview?.refunds?.total||0)>0?'-':''}
            {money(overview?.refunds?.total||0)}
           </b>
           <small>{overview?.refunds?.count||0} refunds</small>
          </div>
         </div>

         <div>
          <span>Driver payouts</span>
          <div>
           <b className={Number(overview?.payouts?.total||0)>0?'negative':''}>
            {Number(overview?.payouts?.total||0)>0?'-':''}
            {money(overview?.payouts?.total||0)}
           </b>
           <small>{overview?.payouts?.count||0} completed</small>
          </div>
         </div>

         <div>
          <span>FaivoPay fees</span>
          <div>
           <b>{money(overview?.customerPayments?.fees||0)}</b>
           <small>Generated today</small>
          </div>
         </div>

        </div>
       </section>

       <section className="panel dashboardQuickCard">
        <div className="panelHead">
         <div>
          <span className="sectionKicker">QUICK ACTIONS</span>
          <h3>Go straight to work</h3>
         </div>
        </div>

        <div className="dashboardQuickActions">

         <button onClick={()=>go('customerPayments')}>
          <CreditCard/>
          <span>Create / manage paylinks</span>
          <ChevronRight/>
         </button>

         <button onClick={()=>go('transactions')}>
          <Banknote/>
          <span>View transactions</span>
          <ChevronRight/>
         </button>

         <button onClick={()=>go('early')}>
          <ArrowUpRight/>
          <span>Review early payouts</span>
          <ChevronRight/>
         </button>

         <button onClick={()=>go('fees')}>
          <BadgePoundSterling/>
          <span>Fees & billing</span>
          <ChevronRight/>
         </button>

        </div>
       </section>

      </div>

     </section>

     <section className="panel dashboardTransactions">

      <div className="panelHead">
       <div>
        <span className="sectionKicker">LATEST ACTIVITY</span>
        <h3>Recent transactions</h3>
        <p>The latest money movements across FaivoPay.</p>
       </div>

       <button
        className="mini"
        onClick={()=>go('transactions')}
       >
        View all transactions
       </button>
      </div>

      <div className="tableWrap proTable">
       <table>
        <thead>
         <tr>
          <th>Time</th>
          <th>Type</th>
          <th>Reference</th>
          <th>Driver / Booking</th>
          <th>Amount</th>
          <th>Status</th>
         </tr>
        </thead>

        <tbody>

         {recentTx.slice(0,7).map(x=>
          <tr
           key={x.ref}
           onClick={()=>setSelectedTx(x)}
          >
           <td>{dt(x.createdAt)}</td>

           <td>
            <b>{x.typeLabel}</b>
           </td>

           <td>
            {x.bookingId
             ? `Booking ${x.bookingId}`
             : x.type==='driver_payment'
             ? 'Payment request'
             : x.type==='early_payout'
             ? 'Early payout'
             : x.type==='weekly_payout'
             ? 'Weekly payout'
             : x.type==='fee'
             ? 'FaivoPay fee'
             : 'FaivoPay'}
           </td>

           <td>
            {x.callsign
             ? `Callsign ${x.callsign}`
             : 'FaivoPay'}
            {x.bookingId
             ? ` · ${x.bookingId}`
             : ''}
           </td>

           <td className={x.direction==='out'?'negative':''}>
            <b>
             {x.direction==='out'?'-':'+'}
             {money(x.amount)}
            </b>
           </td>

           <td>
            <Pill tone={statusTone(x.status)}>
             {x.status}
            </Pill>
           </td>
          </tr>
         )}

         {!recentTx.length&&
          <tr>
           <td
            colSpan="6"
            className="dashboardEmptyCell"
           >
            No recent transactions.
           </td>
          </tr>
         }

        </tbody>
       </table>
      </div>

     </section>

     <section className="dashboardBottomGrid">

      <section className="panel dashboardActivityCard">
       <div className="panelHead">
        <div>
         <span className="sectionKicker">TODAY'S ACTIVITY</span>
         <h3>Customer payment operations</h3>
        </div>
       </div>

       <div className="activityMetrics">

        <div>
         <span>Paylinks created</span>
         <b>{overview?.paylinks?.created||0}</b>
        </div>

        <div>
         <span>Paylinks paid</span>
         <b>{overview?.paylinks?.paid||0}</b>
        </div>

        <div>
         <span>Paylinks open</span>
         <b>{overview?.paylinks?.open||0}</b>
        </div>

        <div>
         <span>Refunds processed</span>
         <b>{overview?.refunds?.count||0}</b>
        </div>

        <div>
         <span>Released to Autocab</span>
         <b>{overview?.activity?.released||0}</b>
        </div>

        <div>
         <span>Completed</span>
         <b>{overview?.activity?.completed||0}</b>
        </div>

        <div>
         <span>Cancelled</span>
         <b>{overview?.activity?.cancelled||0}</b>
        </div>

        <div>
         <span>No Fare</span>
         <b>{overview?.activity?.noFare||0}</b>
        </div>

       </div>
      </section>

      <section className="panel dashboardSevenDay">
       <div className="panelHead">
        <div>
         <span className="sectionKicker">LAST 7 DAYS</span>
         <h3>Short-term snapshot</h3>
        </div>
       </div>

       <div className="sevenDayHero">
        <span>Customer payments</span>
        <strong>
         {money(overview?.sevenDay?.customerPayments?.total||0)}
        </strong>
        <small>
         {overview?.sevenDay?.customerPayments?.count||0} payments
        </small>
       </div>

       <div className="sevenDayRows">
        <div>
         <span>FaivoPay fees</span>
         <b>
          {money(overview?.sevenDay?.customerPayments?.fees||0)}
         </b>
        </div>

        <div>
         <span>Refunds</span>
         <b>
          {money(overview?.sevenDay?.refunds?.total||0)}
         </b>
        </div>
       </div>

      </section>

     </section>
    </>}

    {view==='transactions'&&<div className="transactionsWorkspace">
 <section className="officePageIntro transactionPageIntro">
  <div>
   <span>MASTER LEDGER</span>
   <h2>Transactions</h2>
   <p>One operational view of money moving into and out of FaivoPay. Search by driver, callsign, booking or provider reference, then open any row for the full audit detail.</p>
  </div>
  <div className="transactionPageMeta">
   <span>Showing</span>
   <b>{transactions.length}</b>
   <small>up to 500 matching records</small>
  </div>
 </section>

 <section className="transactionSummaryGrid">
  <div><span>Records</span><b>{transactionSummary.count}</b><small>Current filtered result</small></div>
  <div className="incoming"><span>Incoming</span><b>{money(transactionSummary.incoming)}</b><small>Money received</small></div>
  <div className="outgoing"><span>Outgoing</span><b>{money(transactionSummary.outgoing)}</b><small>Money paid or refunded</small></div>
  <div className={transactionSummary.net<0?'outgoing':'incoming'}><span>Net movement</span><b>{transactionSummary.net<0?'-':''}{money(Math.abs(transactionSummary.net))}</b><small>Incoming less outgoing</small></div>
 </section>

 <section className="transactionCategoryTabs transactionCategoryTabsV2">
  {[
   ['all','All transactions'],
   ['driver_in','Driver pay-ins'],
   ['driver_out','Driver payouts'],
   ['customer','Customer activity'],
   ['fees','Fees']
  ].map(([v,l])=><button key={v} className={txCategory===v?'active':''} onClick={()=>setTxCategory(v)}>{l}</button>)}
 </section>

 <section className="panel transactionPanel transactionPanelV2">
  <div className="transactionFilterGrid transactionFilterGridV2">
   <div className="searchBox transactionSearch">
    <Search/>
    <input
     value={txQ}
     onChange={e=>setTxQ(e.target.value)}
     onKeyDown={e=>e.key==='Enter'&&loadTransactions()}
     placeholder="Search callsign, driver, booking or provider reference…"
    />
    {txQ&&<button type="button" className="transactionSearchClear" onClick={()=>setTxQ('')} aria-label="Clear search"><X/></button>}
    <button className="transactionSearchSubmit" onClick={loadTransactions}>Search</button>
   </div>

   <label>From
    <input type="date" value={txDateFrom} onChange={e=>setTxDateFrom(e.target.value)}/>
   </label>

   <label>To
    <input type="date" value={txDateTo} onChange={e=>setTxDateTo(e.target.value)}/>
   </label>

   <label>Status
    <select value={txStatus} onChange={e=>setTxStatus(e.target.value)}>
     <option value="all">All statuses</option>
     <option value="paid">Paid</option>
     <option value="open">Open</option>
     <option value="approved">Approved</option>
     <option value="batched">Batched</option>
     <option value="pending_approval">Pending approval</option>
     <option value="declined">Declined</option>
     <option value="cancelled">Cancelled</option>
     <option value="failed">Failed</option>
     <option value="completed">Completed</option>
     <option value="succeeded">Succeeded</option>
     <option value="uninvoiced">Uninvoiced</option>
     <option value="invoiced">Invoiced</option>
    </select>
   </label>

   <label>Type
    <select value={txType} onChange={e=>setTxType(e.target.value)}>
     {txTypes.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
   </label>

   <button className="secondary clearTransactionFilters" onClick={()=>{
    setTxQ('');
    setTxType('all');
    setTxStatus('all');
    setTxCategory('all');
    setTxDateFrom('');
    setTxDateTo('');
   }}>Clear filters</button>
  </div>

  <div className="transactionResultHead transactionResultHeadV2">
   <div>
    <h3>{transactions.length} transaction{transactions.length===1?'':'s'}</h3>
    <p>Newest first · select a row for payment, provider and linked-record details.</p>
   </div>
   <button className="mini" onClick={loadTransactions}><RefreshCw/>Refresh results</button>
  </div>

  <div className="tableWrap transactionTableWrap transactionTableWrapV2">
   <table className="transactionTable transactionTableV2">
    <thead>
     <tr>
      <th>Date / time</th>
      <th>Payment type</th>
      <th>Driver / customer</th>
      <th>Linked record</th>
      <th className="txAmountColumn">Amount</th>
      <th>Status</th>
      <th>Provider</th>
      <th></th>
     </tr>
    </thead>
    <tbody>
     {transactions.map(x=><tr key={x.ref||x.id} onClick={()=>setSelectedTx(x)}>
      <td className="transactionDateCell">
       <b>{dt(x.createdAt)}</b>
       <small>{x.completedAt?`Completed ${dt(x.completedAt)}`:'Created'}</small>
      </td>
      <td>
       <span className={`transactionTypeBadge ${transactionKindTone(x)}`}>{transactionKind(x)}</span>
       {x.requestType&&x.requestType!=='standard'&&
        <small>{String(x.requestType).replaceAll('_',' ')}</small>
       }
      </td>
      <td>
       <div className="transactionPartyCell">
        {x.callsign&&<span className="callsign txCallsign">{x.callsign}</span>}
        <div>
         <b>{x.driverName||(!x.callsign&&x.bookingId?'Customer payment':'FaivoPay')}</b>
         <small>{x.callsign?`Driver callsign ${x.callsign}`:(x.bookingId?`Booking ${x.bookingId}`:'System transaction')}</small>
        </div>
       </div>
      </td>
      <td>
       <span className="transactionRef">{x.bookingId?`Booking ${x.bookingId}`:(x.paymentPlanId?`Plan ${x.paymentPlanId}`:(x.providerRef||x.id))}</span>
       {x.paymentPlanInstalmentId&&<small>Instalment {x.paymentPlanInstalmentId}</small>}
      </td>
      <td className="txAmountColumn">
       <b className={x.direction==='out'?'transactionAmountOut':'transactionAmountIn'}>
        {x.direction==='out'?'-':'+'}{money(x.amount)}
       </b>
       <small>{x.direction==='out'?'Outgoing':'Incoming'}</small>
       {x.type==='customer_payment'&&Number(x.refundedAmount||0)>0&&<small>Refunded: {money(x.refundedAmount)}</small>}
       {x.type==='customer_refund'&&<small>Original: {money(x.originalAmount)}</small>}
      </td>
      <td><Pill tone={statusTone(x.status)}>{String(x.status||'').replaceAll('_',' ')}</Pill></td>
      <td>
       <b className="transactionProvider">{x.provider||'—'}</b>
       {x.providerRef&&<small className="transactionProviderRef">{x.providerRef}</small>}
      </td>
      <td className="transactionChevron"><ChevronRight/></td>
     </tr>)}
     {!transactions.length&&<tr><td colSpan="8"><div className="emptyTransactionState"><CreditCard/><b>No transactions found</b><span>Try clearing one or more filters, or search for a different driver, booking or reference.</span></div></td></tr>}
    </tbody>
   </table>
  </div>
 </section>
</div>}
    {view==='customerPayments'&&<div className="customerPaymentsAdmin customerPaymentsV2">

     <section className="officePageIntro customerPaymentsHeader">
      <div>
       <span>CUSTOMER PAYMENTS</span>
       <h2>Customer payments</h2>
       <p>Track payments against the booking, passenger, journey and driver from one operational view.</p>
      </div>

      <div className="rowActions">
       <button
        className="primary"
        onClick={()=>{
         setCreatedCustomerLink(null);
         setShowCustomerCreate(true);
        }}
       >
        <CreditCard/>New payment
       </button>
      </div>
     </section>


     <section className="customerPaymentStatsV2">
      <button
       type="button"
       className="customerPaymentStatButton"
       onClick={()=>setCustomerPayStatus('needs_review')}
      >
       <span>Needs review</span>
       <b>{customerAdmin.summary?.needsReview||0}</b>
      </button>

      <button
       type="button"
       className="customerPaymentStatButton"
       onClick={()=>setCustomerPayStatus('release_failed')}
      >
       <span>Release failed</span>
       <b>{customerAdmin.summary?.releaseFailed||0}</b>
      </button>

      <div>
       <span>Awaiting payment</span>
       <b>{customerAdmin.summary?.open||0}</b>
      </div>

      <div>
       <span>Paid</span>
       <b>{customerAdmin.summary?.paid||0}</b>
      </div>

      <div>
       <span>Money received</span>
       <b>{money(customerAdmin.summary?.grossPaid||0)}</b>
      </div>
     </section>


     <section className="panel customerPaymentsMainPanel">

      <div className="customerPaymentsToolbar">

       <div className="searchBox customerPaymentsSearch">
        <Search/>

        <input
         value={customerPayQ}
         onChange={e=>setCustomerPayQ(e.target.value)}
         placeholder="Search Autocab booking ID, customer, mobile, pickup, destination or driver…"
        />

        {customerPayQ&&
         <button
          type="button"
          className="customerSearchClear"
          onClick={()=>setCustomerPayQ('')}
          aria-label="Clear search"
         >
          <X/>
         </button>
        }
       </div>

       <select
        value={customerPayStatus}
        onChange={e=>setCustomerPayStatus(e.target.value)}
       >
        <option value="needs_review">Needs review</option>
        <option value="release_failed">Release failed</option>
        <option value="all">All statuses</option>
        <option value="open">Awaiting payment</option>
        <option value="paid">Paid</option>
        <option value="release_pending">Release pending</option>
        <option value="ready">Ready</option>
        <option value="dispatched">Dispatched</option>
        <option value="completed">Completed</option>
        <option value="approved">Approved</option>
        <option value="no_fare">No Fare</option>
        <option value="cancelled">Cancelled</option>
        <option value="review">Settlement review</option>
        <option value="held">Held</option>
        <option value="refunded">Refunded</option>
       </select>

      </div>


      <div className="tableWrap proTable customerPaymentsTableV2">
       <table>

        <thead>
         <tr>
          <th>Date</th>
          <th>Autocab Booking ID</th>
          <th>Customer</th>
          <th>Journey</th>
          <th>Driver</th>
          <th>Fare</th>
          <th>Total</th>
          <th>Status</th>
          <th></th>
         </tr>
        </thead>

        <tbody>

         {(customerAdmin.payments||[])
          .filter(x=>{

           if(customerPayStatus==='needs_review'){
            const needsReview=
             customerSettlementStatus(x)==='review' ||
             x.autocabReleaseStatus==='failed';

            if(!needsReview){
             return false;
            }

           }else if(customerPayStatus==='release_failed'){
            if(x.autocabReleaseStatus!=='failed'){
             return false;
            }

           }else if(customerPayStatus!=='all'){
            const lifecycleStatuses=[
             x.status,
             customerPaymentStatus(x),
             customerJobStatus(x),
             customerSettlementStatus(x)
            ].filter(Boolean);

            if(!lifecycleStatuses.includes(customerPayStatus)){
             return false;
            }
           }

           const search=customerPayQ.trim().toLowerCase();

           if(!search)return true;

           return [
            x.bookingId,
            x.customerName,
            x.customerMobile,
            x.customerEmail,
            x.pickup,
            x.destination,
            x.callsign,
            x.driverName,
            x.id
           ]
           .filter(Boolean)
           .some(v=>
            String(v).toLowerCase().includes(search)
           );

          })
          .map(x=>

           <tr
            key={x.id}
            className="customerPaymentRowV2"
            onClick={()=>setSelectedCustomerPayment(x)}
           >

            <td>
             <b>
              {x.journeyAt
               ? dt(x.journeyAt)
               : dt(x.createdAt)}
             </b>

             <small>
              {x.journeyAt?'Journey':'Created'}
             </small>
            </td>


            <td className="customerBookingCell">
             {x.bookingId
              ? <>
                 <b>{x.bookingId}</b>
                 <small>
                  {x.source==='autocab_booking_created'
                   ? 'Autocab booking'
                   : x.source==='office_manual'
                   ? 'Manual reference'
                   : 'Booking reference'}
                 </small>
                </>
              : <>
                 <b>Manual payment</b>
                 <small>{x.id}</small>
                </>
             }
            </td>


            <td>
             <b>
              {x.customerName||'Customer not entered'}
             </b>

             <small>
              {x.customerMobile||
               x.customerEmail||
               'No contact details'}
             </small>
            </td>


            <td className="customerJourneyV2">
             <b>
              {x.pickup||'Pickup not entered'}
             </b>

             <small>
              {x.destination
               ? `→ ${x.destination}`
               : 'Destination not entered'}
             </small>
            </td>


            <td>
             <b>
              {x.callsign&&x.callsign!=='OFFICE'
               ? `Callsign ${x.callsign}`
               : 'Office'}
             </b>

             <small>
              {x.driverName||'No driver assigned'}
             </small>
            </td>


            <td>
             <b>{money(x.fareAmount)}</b>

             <small>
              + {money(x.feeAmount)} fee
             </small>
            </td>


            <td>
             <b className="customerTotalV2">
              {money(x.totalAmount)}
             </b>
            </td>


            <td>
             <div className="customerLifecycleBadges">

              <span
               className={`customerStatusBadge payment ${String(
                customerPaymentStatus(x)
               ).replaceAll('_','-')}`}
              >
               <i/>
               {customerPaymentLabel(customerPaymentStatus(x))}
              </span>

              {customerJobStatus(x) &&
               customerJobStatus(x)!=='manual' &&
               customerJobStatus(x)!==customerPaymentStatus(x) &&
               !(
                customerPaymentStatus(x)==='open' &&
                customerJobStatus(x)==='awaiting_payment'
               ) &&
               <span
                className={`customerStatusBadge job ${String(
                 customerJobStatus(x)
                ).replaceAll('_','-')}`}
               >
                <i/>
                {customerJobLabel(customerJobStatus(x))}
               </span>
              }

              {['review','held'].includes(customerSettlementStatus(x))&&
               <span
                className={`customerStatusBadge settlement ${String(
                 customerSettlementStatus(x)
                ).replaceAll('_','-')}`}
               >
                <i/>
                {customerSettlementStatus(x)==='review'
                 ? 'Review'
                 : customerSettlementLabel(customerSettlementStatus(x))}
               </span>
              }

             </div>
            </td>


            <td className="customerChevronV2">
             <ChevronRight/>
            </td>

           </tr>

          )}


         {(customerAdmin.payments||[])
          .filter(x=>{

           if(customerPayStatus==='needs_review'){
            const needsReview=
             customerSettlementStatus(x)==='review' ||
             x.autocabReleaseStatus==='failed';

            if(!needsReview){
             return false;
            }

           }else if(customerPayStatus==='release_failed'){
            if(x.autocabReleaseStatus!=='failed'){
             return false;
            }

           }else if(customerPayStatus!=='all'){
            const lifecycleStatuses=[
             x.status,
             customerPaymentStatus(x),
             customerJobStatus(x),
             customerSettlementStatus(x)
            ].filter(Boolean);

            if(!lifecycleStatuses.includes(customerPayStatus)){
             return false;
            }
           }

           const search=customerPayQ.trim().toLowerCase();

           if(!search)return true;

           return [
            x.bookingId,
            x.customerName,
            x.customerMobile,
            x.customerEmail,
            x.pickup,
            x.destination,
            x.callsign,
            x.driverName,
            x.id
           ]
           .filter(Boolean)
           .some(v=>
            String(v).toLowerCase().includes(search)
           );

          }).length===0&&

          <tr>
           <td colSpan="9">
            <div className="emptyTransactionState">
             No customer payments match the selected filters.
            </div>
           </td>
          </tr>
         }

        </tbody>

       </table>
      </div>

     </section>


     {showCustomerCreate&&
      <div
       className="customerModalBack"
       onMouseDown={e=>{
        if(e.target===e.currentTarget){
         setShowCustomerCreate(false);
        }
       }}
      >

       <section className="customerModal">

        <div className="customerModalHead">

         <div>
          <span>NEW CUSTOMER PAYMENT</span>
          <h2>Create payment link</h2>
          <p>
           Enter the booking and journey information.
           Creating the link does not alter the Autocab booking.
          </p>
         </div>

         <button
          type="button"
          className="customerModalClose"
          onClick={()=>setShowCustomerCreate(false)}
         >
          <X/>
         </button>

        </div>


        <form
         className="customerCreateForm customerCreateFormV2"
         onSubmit={createOfficeCustomerPayment}
        >

         <div className="customerFormGrid">

          <label>
           Booking / job reference

           <input
            value={customerCreate.bookingId}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             bookingId:e.target.value
            })}
            placeholder="e.g. 12345678"
           />
          </label>


          <label>
           Driver callsign <small>optional</small>

           <input
            value={customerCreate.callsign}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             callsign:e.target.value
            })}
            placeholder="e.g. 168"
           />
          </label>

         </div>


         <div className="customerFormGrid">

          <label>
           Customer name

           <input
            value={customerCreate.customerName}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             customerName:e.target.value
            })}
            placeholder="Passenger name"
           />
          </label>


          <label>
           Journey date / time

           <input
            type="datetime-local"
            value={customerCreate.journeyAt}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             journeyAt:e.target.value
            })}
           />
          </label>

         </div>


         <div className="customerFormGrid">

          <label>
           Customer mobile

           <input
            value={customerCreate.customerMobile}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             customerMobile:e.target.value
            })}
            placeholder="07..."
           />
          </label>


          <label>
           Customer email

           <input
            type="email"
            value={customerCreate.customerEmail}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             customerEmail:e.target.value
            })}
            placeholder="optional@email.com"
           />
          </label>

         </div>


         <label>
          Pickup

          <input
           value={customerCreate.pickup}
           onChange={e=>setCustomerCreate({
            ...customerCreate,
            pickup:e.target.value
           })}
           placeholder="Pickup address / location"
          />
         </label>


         <label>
          Destination

          <input
           value={customerCreate.destination}
           onChange={e=>setCustomerCreate({
            ...customerCreate,
            destination:e.target.value
           })}
           placeholder="Destination address / location"
          />
         </label>


         <div className="customerFormGrid">

          <label>
           Journey fare (£)

           <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={customerCreate.fareAmount}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             fareAmount:e.target.value
            })}
            placeholder="0.00"
           />
          </label>


          <label>
           Taxi company

           <input
            value={customerCreate.taxiCompany}
            onChange={e=>setCustomerCreate({
             ...customerCreate,
             taxiCompany:e.target.value
            })}
            placeholder={
             settings?.companyName||'Taxi company'
            }
           />
          </label>

         </div>


         <label>
          Notes <small>office only</small>

          <textarea
           rows="3"
           value={customerCreate.notes}
           onChange={e=>setCustomerCreate({
            ...customerCreate,
            notes:e.target.value
           })}
           placeholder="Optional notes"
          />
         </label>


         {createdCustomerLink&&
          <div className="createdPaymentLink customerCreatedV2">

           <CheckCircle2/>

           <div>
            <b>Payment link ready</b>
            <span>
             {createdCustomerLink.paymentUrl}
            </span>
           </div>

           <button
            type="button"
            className="secondary"
            onClick={()=>
             copyCustomerLink(
              createdCustomerLink.paymentUrl
             )
            }
           >
            Copy
           </button>

           <button
            type="button"
            className="secondary"
            onClick={()=>
             window.open(
              createdCustomerLink.paymentUrl,
              '_blank'
             )
            }
           >
            Open
           </button>

          </div>
         }


         <div className="customerModalActions">

          <button
           type="button"
           className="secondary"
           onClick={()=>setShowCustomerCreate(false)}
          >
           Close
          </button>

          <button
           className="primary"
           disabled={customerCreateBusy}
          >
           {customerCreateBusy
            ? 'Creating…'
            : 'Create secure payment link'}
          </button>

         </div>

        </form>

       </section>

      </div>
     }


     {selectedCustomerPayment&&
      <div
       className="drawerBack"
       onClick={()=>setSelectedCustomerPayment(null)}
      >

       <aside
        className="drawer customerPaymentDrawer"
        onClick={e=>e.stopPropagation()}
       >

        <button
         className="drawerClose"
         onClick={()=>setSelectedCustomerPayment(null)}
        >
         <X/>
        </button>


        <div className="customerPaymentDrawerHead">

         <div className="customerPaymentDrawerIcon">
          <CreditCard/>
         </div>

         <div>
          <span>CUSTOMER PAYMENT</span>

          <h2>
           {selectedCustomerPayment.bookingId
            ? `Booking ${selectedCustomerPayment.bookingId}`
            : 'Manual payment'}
          </h2>

          <div className="customerDrawerLifecycleBadges">

           <span
            className={`customerStatusBadge payment ${String(
             customerPaymentStatus(selectedCustomerPayment)
            ).replaceAll('_','-')}`}
           >
            <i/>
            {customerPaymentLabel(
             customerPaymentStatus(selectedCustomerPayment)
            )}
           </span>

           {customerJobStatus(selectedCustomerPayment)&&
            customerJobStatus(selectedCustomerPayment)!=='manual'&&
            customerJobStatus(selectedCustomerPayment)!==customerPaymentStatus(selectedCustomerPayment)&&
            <span
             className={`customerStatusBadge job ${String(
              customerJobStatus(selectedCustomerPayment)
             ).replaceAll('_','-')}`}
            >
             <i/>
             {customerJobLabel(
              customerJobStatus(selectedCustomerPayment)
             )}
            </span>
           }

           <span
            className={`customerStatusBadge settlement ${String(
             customerSettlementStatus(selectedCustomerPayment)
            ).replaceAll('_','-')}`}
           >
            <i/>
            {customerSettlementLabel(
             customerSettlementStatus(selectedCustomerPayment)
            )}
           </span>

           {selectedCustomerPayment.autocabReleaseStatus==='failed'&&
            <span className="customerStatusBadge autocab-failed">
             <i/>
             Release failed
            </span>
           }

          </div>
         </div>

        </div>


        <div className="customerDrawerAmount">

         <span>Customer total</span>

         <strong>
          {money(selectedCustomerPayment.totalAmount)}
         </strong>

         <small>
          {money(selectedCustomerPayment.fareAmount)}
          {' fare + '}
          {money(selectedCustomerPayment.feeAmount)}
          {' service fee'}
         </small>

        </div>


        {selectedCustomerPayment.autocabReleaseStatus==='failed'&&
         <div className="customerAutocabReleaseWarning">
          <AlertTriangle/>
          <div>
           <b>Autocab release failed — action required</b>
           <span>
            The customer payment is safely recorded as paid, but the booking
            has not yet been released in Autocab.
           </span>

           {selectedCustomerPayment.autocabReleaseError&&
            <small>
             {selectedCustomerPayment.autocabReleaseError}
            </small>
           }

           <em>
            Attempt{Number(selectedCustomerPayment.autocabReleaseAttempts||0)===1?'':'s'}: {
             Number(selectedCustomerPayment.autocabReleaseAttempts||0)
            }
           </em>
          </div>
         </div>
        }

        {customerSettlementStatus(selectedCustomerPayment)==='review'&&
         ['paid'].includes(customerPaymentStatus(selectedCustomerPayment))&&
         ['no_fare','cancelled'].includes(customerJobStatus(selectedCustomerPayment))&&
         <div className="customerSettlementReviewCard">

          <div className="customerSettlementReviewHead">
           <AlertTriangle/>
           <div>
            <b>Customer refund decision</b>
            <span>
             The customer has paid {money(selectedCustomerPayment.totalAmount)}.
             Up to {money(selectedCustomerPayment.fareAmount)} fare can be refunded.
             The {money(selectedCustomerPayment.feeAmount||0)} FaivoPay service fee is retained.
            </span>
           </div>
          </div>

          {selectedCustomerPayment.refundStatus==='pending'&&
           <div className="customerSettlementDecision held">
            <Clock3/>
            <div>
             <b>Customer refund pending</b>
             <span>
              Stripe is still processing this refund. FaivoPay will not reduce
              financial totals until Stripe confirms it has succeeded.
             </span>
            </div>
           </div>
          }

          {selectedCustomerPayment.refundStatus==='full'&&
           <div className="customerSettlementDecision approved">
            <ShieldCheck/>
            <div>
             <b>
              Full fare refund completed: {money(selectedCustomerPayment.refundedAmount)}
             </b>
             <span>
              {Number(selectedCustomerPayment.refundedAmount||0)>
               Number(selectedCustomerPayment.fareAmount||0)
               ? `This historical refund included ${money(
                  Math.max(
                   0,
                   Number(selectedCustomerPayment.refundedAmount||0)-
                   Number(selectedCustomerPayment.fareAmount||0)
                  )
                 )} of the service fee.`
               : `The ${money(selectedCustomerPayment.feeAmount||0)} FaivoPay service fee has been retained.`
              }
             </span>
            </div>
           </div>
          }

          {selectedCustomerPayment.refundStatus==='partial'&&
           <div className="customerSettlementDecision approved">
            <ShieldCheck/>
            <div>
             <b>
              Partial refund completed: {money(selectedCustomerPayment.refundedAmount)}
             </b>
             <span>
              {money(
               Math.max(
                0,
                Number(selectedCustomerPayment.fareAmount||0)-
                Math.min(
                 Number(selectedCustomerPayment.refundedAmount||0),
                 Number(selectedCustomerPayment.fareAmount||0)
                )
               )
              )} of the fare remains refundable. The {money(
               selectedCustomerPayment.feeAmount||0
              )} FaivoPay service fee is retained.
             </span>
            </div>
           </div>
          }

          {selectedCustomerPayment.refundStatus==='none'&&
           <div className="customerSettlementDecision held">
            <ShieldCheck/>
            <div>
             <b>No customer refund</b>
             <span>
              The office has chosen to continue without refunding this payment.
             </span>
            </div>
           </div>
          }

          {!['pending','full'].includes(selectedCustomerPayment.refundStatus)&&
           <>
            <div className="customerSettlementChoices">

             <button
              type="button"
              className={customerRefundReview.decision==='full'?'active':''}
              onClick={()=>setCustomerRefundReview(x=>({
               ...x,
               decision:'full'
              }))}
             >
              <b>Full fare refund</b>
              <span>
               {money(selectedCustomerPayment.fareAmount)}
               {' · '}
               {money(selectedCustomerPayment.feeAmount||0)} fee retained
              </span>
             </button>

             <button
              type="button"
              className={customerRefundReview.decision==='partial'?'active':''}
              onClick={()=>setCustomerRefundReview(x=>({
               ...x,
               decision:'partial'
              }))}
             >
              <b>Partial refund</b>
              <span>
               {selectedCustomerPayment.refundStatus==='partial'
                ? 'Change total refund'
                : 'Enter amount'}
              </span>
             </button>

             <button
              type="button"
              className={customerRefundReview.decision==='none'?'active danger':''}
              onClick={()=>setCustomerRefundReview(x=>({
               ...x,
               decision:'none'
              }))}
             >
              <b>No refund</b>
              <span>£0.00</span>
             </button>

            </div>

            {customerRefundReview.decision==='partial'&&
             <label className="customerSettlementAmount">
              {selectedCustomerPayment.refundStatus==='partial'
               ? 'Total customer refund'
               : 'Customer refund'}
              <div>
               <span>£</span>
               <input
                type="number"
                min="0.01"
                max={Number(selectedCustomerPayment.fareAmount||0)}
                step="0.01"
                value={customerRefundReview.amount}
                onChange={e=>setCustomerRefundReview(x=>({
                 ...x,
                 amount:e.target.value
                }))}
                placeholder="0.00"
               />
              </div>
              <small>
               {selectedCustomerPayment.refundStatus==='partial'
                ? `Enter the new total fare refund, not an additional amount. Already refunded: ${money(selectedCustomerPayment.refundedAmount)}. `
                : ''
               }
               Maximum refundable fare: {money(selectedCustomerPayment.fareAmount)}.
               {' '}FaivoPay service fee retained: {money(selectedCustomerPayment.feeAmount||0)}.
              </small>
             </label>
            }

            {!selectedCustomerPayment.driverId&&
             Number(selectedCustomerPayment.refundedAmount||0)===0&&
             !selectedCustomerPayment.refundStatus&&
             <small>
              No driver is assigned to this booking. A full fare refund is selected by default.
              The FaivoPay service fee is retained, and you can choose another option before processing.
             </small>
            }

            <button
             type="button"
             className="customerSettlementApproveButton"
             disabled={customerRefundBusy}
             onClick={()=>submitCustomerRefund(selectedCustomerPayment)}
            >
             <ShieldCheck/>
             {customerRefundBusy
              ? 'Processing…'
              : customerRefundReview.decision==='none'
              ? 'Continue without refund'
              : selectedCustomerPayment.refundStatus==='partial'
              ? 'Update customer refund'
              : 'Process customer refund'}
            </button>
           </>
          }

         </div>
        }

        {customerSettlementStatus(selectedCustomerPayment)==='review'&&
         <div className="customerSettlementReviewCard">

          <div className="customerSettlementReviewHead">
           <AlertTriangle/>
           <div>
            <b>Driver settlement review required</b>
            <span>
             The customer has paid, but this job ended as {
              customerJobLabel(customerJobStatus(selectedCustomerPayment))
             }. Decide what amount should be released to the driver.
            </span>
           </div>
          </div>

          <div className="customerSettlementChoices">

           <button
            type="button"
            className={customerSettlementReview.decision==='full'?'active':''}
            onClick={()=>setCustomerSettlementReview(x=>({
             ...x,
             decision:'full'
            }))}
           >
            <b>Full fare</b>
            <span>{money(selectedCustomerPayment.fareAmount)}</span>
           </button>

           <button
            type="button"
            className={customerSettlementReview.decision==='reduced'?'active':''}
            onClick={()=>setCustomerSettlementReview(x=>({
             ...x,
             decision:'reduced'
            }))}
           >
            <b>Reduced</b>
            <span>Enter amount</span>
           </button>

           <button
            type="button"
            className={customerSettlementReview.decision==='hold'?'active danger':''}
            onClick={()=>setCustomerSettlementReview(x=>({
             ...x,
             decision:'hold'
            }))}
           >
            <b>Hold</b>
            <span>£0.00</span>
           </button>

          </div>

          {customerSettlementReview.decision==='reduced'&&
           <label className="customerSettlementAmount">
            Driver payment
            <div>
             <span>£</span>
             <input
              type="number"
              min="0"
              max={Number(selectedCustomerPayment.fareAmount||0)}
              step="0.01"
              value={customerSettlementReview.amount}
              onChange={e=>setCustomerSettlementReview(x=>({
               ...x,
               amount:e.target.value
              }))}
              placeholder="0.00"
             />
            </div>
           </label>
          }

          {(customerSettlementReview.decision==='reduced'||
            customerSettlementReview.decision==='hold')&&
           <label className="customerSettlementNote">
            Office note
            <textarea
             rows="3"
             value={customerSettlementReview.note}
             onChange={e=>setCustomerSettlementReview(x=>({
              ...x,
              note:e.target.value
             }))}
             placeholder="Explain the settlement decision…"
            />
           </label>
          }

          <button
           type="button"
           className="customerSettlementApproveButton"
           disabled={customerSettlementReviewBusy}
           onClick={()=>submitCustomerSettlementReview(selectedCustomerPayment)}
          >
           <ShieldCheck/>
           {customerSettlementReviewBusy
            ? 'Saving decision…'
            : customerSettlementReview.decision==='hold'
            ? 'Hold driver payment'
            : 'Approve driver payment'}
          </button>

         </div>
        }

        {['approved','held'].includes(customerSettlementStatus(selectedCustomerPayment))&&
         selectedCustomerPayment.driverSettlementAmount!==null&&
         <div className={`customerSettlementDecision ${customerSettlementStatus(selectedCustomerPayment)}`}>
          <ShieldCheck/>
          <div>
           <b>
            {customerSettlementStatus(selectedCustomerPayment)==='held'
             ? 'Driver payment held'
             : `Driver payment approved: ${money(selectedCustomerPayment.driverSettlementAmount)}`}
           </b>

           {selectedCustomerPayment.driverSettlementNote&&
            <span>{selectedCustomerPayment.driverSettlementNote}</span>
           }

           {selectedCustomerPayment.driverSettlementReviewedAt&&
            <small>
             Reviewed {
              dt(selectedCustomerPayment.driverSettlementReviewedAt)
             }{
              selectedCustomerPayment.driverSettlementReviewedBy
               ? ` · ${selectedCustomerPayment.driverSettlementReviewedBy}`
               : ''
             }
            </small>
           }
          </div>
         </div>
        }

        <div className="customerDetailSection">
         <span className="customerDetailTitle">
          BOOKING & JOURNEY
         </span>

         <div className="detailList">

          <div>
           <span>Booking / job</span>
           <b>
            {selectedCustomerPayment.bookingId||'—'}
           </b>
          </div>

          <div>
           <span>Journey date / time</span>
           <b>
            {selectedCustomerPayment.journeyAt
             ? dt(selectedCustomerPayment.journeyAt)
             : '—'}
           </b>
          </div>

          <div>
           <span>Pickup</span>
           <b>
            {selectedCustomerPayment.pickup||'—'}
           </b>
          </div>

          <div>
           <span>Destination</span>
           <b>
            {selectedCustomerPayment.destination||'—'}
           </b>
          </div>

         </div>
        </div>


        <div className="customerDetailSection">
         <span className="customerDetailTitle">
          CUSTOMER
         </span>

         <div className="detailList">

          <div>
           <span>Name</span>
           <b>
            {selectedCustomerPayment.customerName||'—'}
           </b>
          </div>

          <div>
           <span>Mobile</span>
           <b>
            {selectedCustomerPayment.customerMobile||'—'}
           </b>
          </div>

          <div>
           <span>Email</span>
           <b>
            {selectedCustomerPayment.customerEmail||'—'}
           </b>
          </div>

         </div>
        </div>


        <div className="customerDetailSection customerLifecycleSection">
         <span className="customerDetailTitle">
          STATUS & SETTLEMENT
         </span>

         <div className="detailList">
          <div>
           <span>Payment status</span>
           <b>{customerPaymentLabel(customerPaymentStatus(selectedCustomerPayment))}</b>
          </div>

          <div>
           <span>Job status</span>
           <b>
            {customerJobStatus(selectedCustomerPayment)
             ? customerJobLabel(customerJobStatus(selectedCustomerPayment))
             : '—'}
           </b>
          </div>

          <div>
           <span>Driver settlement</span>
           <b>
            {customerSettlementLabel(customerSettlementStatus(selectedCustomerPayment))}
           </b>
          </div>
         </div>
        </div>

        <div className="customerDetailSection">
         <span className="customerDetailTitle">
          DRIVER & PAYMENT
         </span>

         <div className="detailList">

          <div>
           <span>Callsign</span>
           <b>
            {selectedCustomerPayment.callsign||'—'}
           </b>
          </div>

          <div>
           <span>Driver</span>
           <b>
            {selectedCustomerPayment.driverName||'—'}
           </b>
          </div>

          <div>
           <span>Journey fare</span>
           <b>
            {money(selectedCustomerPayment.fareAmount)}
           </b>
          </div>

          <div>
           <span>Service fee</span>
           <b>
            {money(selectedCustomerPayment.feeAmount)}
           </b>
          </div>

          <div>
           <span>Customer paid</span>
           <b>
            {money(selectedCustomerPayment.totalAmount)}
           </b>
          </div>

          {selectedCustomerPayment.status==='paid'&&
           <div>
            <span>FaivoPay fee share</span>
            <b>
             {money(
              selectedCustomerPayment.fleetPayFeeShare||0
             )}
            </b>
           </div>
          }

          {selectedCustomerPayment.status==='paid'&&
           <div>
            <span>Taxi company fee share</span>
            <b>
             {money(
              selectedCustomerPayment.taxiCompanyFeeShare||0
             )}
            </b>
           </div>
          }

          <div>
           <span>Created</span>
           <b>
            {dt(selectedCustomerPayment.createdAt)}
           </b>
          </div>

          <div>
           <span>Source</span>
           <b>
            {selectedCustomerPayment.source||
             'FaivoPay'}
           </b>
          </div>

          <div>
           <span>FaivoPay ID</span>
           <b>
            {selectedCustomerPayment.id}
           </b>
          </div>

         </div>
        </div>


        {selectedCustomerPayment.notes&&
         <div className="customerDrawerNotes">
          <span>OFFICE NOTES</span>
          <p>{selectedCustomerPayment.notes}</p>
         </div>
        }


        <div className="customerDrawerActions">

         {selectedCustomerPayment.autocabReleaseStatus==='failed'&&
          customerJobStatus(selectedCustomerPayment)==='release_pending'&&
          <button
           className="customerRetryAutocabButton"
           disabled={customerReleaseRetryBusy}
           onClick={()=>retryCustomerAutocabRelease(selectedCustomerPayment)}
          >
           <RefreshCw className={customerReleaseRetryBusy?'spin':''}/>
           {customerReleaseRetryBusy
            ? 'Retrying Autocab…'
            : 'Retry Autocab release'}
          </button>
         }

         {selectedCustomerPayment.paymentUrl&&
          <button
           className="secondary"
           onClick={()=>
            copyCustomerLink(
             selectedCustomerPayment.paymentUrl
            )
           }
          >
           Copy payment link
          </button>
         }


         {selectedCustomerPayment.paymentUrl&&
          <button
           className="secondary"
           onClick={()=>
            window.open(
             selectedCustomerPayment.paymentUrl,
             '_blank'
            )
           }
          >
           Open payment
          </button>
         }


         {selectedCustomerPayment.status==='open'&&
          <button
           className="dangerAction"
           onClick={async()=>{

            await cancelCustomerPayment(
             selectedCustomerPayment.id
            );

            setSelectedCustomerPayment(null);

           }}
          >
           Cancel payment
          </button>
         }

        </div>

       </aside>

      </div>
     }

    </div>}

   {view==='monday'&&<>
    <section className="officePageIntro">
     <div>
      <span>WEEKLY SETTLEMENT</span>
      <h2>Monday payment run</h2>
      <p>Complete the settlement in order from Rent Sheets through to reconciliation.</p>
     </div>
     {canMoney&&!activeMonday&&<button className="primary" onClick={createMonday}><PlayCircle/>Start Monday run</button>}
    </section>

    <section className="panel wizardOverview">
     <div className="panelHead">
      <div><span className="sectionKicker">MONDAY PAYMENT WIZARD</span><h3>Guided weekly settlement</h3><p>Only the current working stage is shown below.</p></div>
      <Pill tone={activeMonday?'warn':'neutral'}>{activeMonday?'In progress':'Not started'}</Pill>
     </div>
     <WizardSteps steps={mondayWizardSteps} currentIndex={mondayWizardIndex}/>
    </section>

    {!activeMonday
     ?<section className="liveWorkflowCard wizardStageCard">
       <div className="liveWorkflowHead"><div><span>STEP 1</span><h3>Confirm Rent Sheets & sync balances</h3><p>Run Monday Rent Sheets in Autocab first. Starting the run then captures the fresh Previous Balance for each driver.</p></div><Pill tone="neutral">Ready</Pill></div>
       <div className="operatorWarning"><AlertTriangle/><div><b>Before you continue</b><span>Confirm Autocab Rent Sheets have completed. FaivoPay will immediately create the Monday settlement from the fresh balances.</span></div></div>
       {canMoney&&<div className="runCardActions"><button className="primary" onClick={createMonday}><PlayCircle/>Confirm & start Monday run</button></div>}
      </section>
     :<>
      <section className="panel wizardFinancePanel">
       <div className="panelHead"><div><span className="sectionKicker">{activeMonday.runDate||'MONDAY RUN'}</span><h3>Settlement summary</h3><p>{activeMonday.id}</p></div><Pill tone="warn">{String(activeMonday.status||'active').replaceAll('_',' ')}</Pill></div>
       <div className="mondayFinanceSummary">
        <div><span>Payout before fees</span><b>{money(weeklyPayoutBeforeFees)}</b></div>
        <div><span>Fees & charges</span><b>{money(weeklyPayoutFeesCharges)}</b></div>
        <div><span>Plan deductions</span><b>{money(weeklyPayoutPlanDeductions)}</b></div>
        <div><span>Actual payout</span><b>{money(weeklyApprovedTotal)}</b></div>
        <div><span>Drivers to pay</span><b>{weeklyApproved.length}</b></div>
        <div><span>Collections</span><b>{money(weeklyOutstandingTotal)}</b></div>
        <div><span>Drivers owing</span><b>{weeklyCollections.length}</b></div>
        <div><span>Pending decisions</span><b>{weeklyPending.length}</b></div>
       </div>
      </section>

      {activeMondayCancelledBatch&&<div className="operatorWarning blue"><AlertTriangle/><div><b>Previous payment batch cancelled safely</b><span>The batch was cancelled before release. This Monday settlement remains open so the approved drivers can be reviewed and placed into a corrected payment run.</span></div></div>}

      {mondayWizardIndex===2&&<section className="panel wizardStageCard">
       <div className="panelHead"><div><span className="sectionKicker">STEP 3</span><h3>Payment-plan deductions</h3><p>Apply amounts reserved from positive Monday balances before driver payouts.</p></div><div className="compactStatus"><Pill tone={pendingPlanAllocations.length?'warn':'good'}>{pendingPlanAllocations.length} pending</Pill>{applyingPlanAllocations.length>0&&<Pill tone="warn">{applyingPlanAllocations.length} applying</Pill>}{failedPlanAllocations.length>0&&<Pill tone="bad">{failedPlanAllocations.length} review</Pill>}<Pill tone="good">{appliedPlanAllocations.length} applied</Pill></div></div>
       {mondayPlanAllocations.length?<><div className="mondayFinanceOther"><div><span>Total deductions</span><b>{money(mondayPlanAllocationTotal)}</b></div><div><span>Applied</span><b>{money(mondayPlanAllocationAppliedTotal)}</b></div><div><span>Remaining</span><b>{money(Math.max(0,mondayPlanAllocationTotal-mondayPlanAllocationAppliedTotal))}</b></div></div>
       <div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Instalment</th><th>Monday deduction</th><th>Status</th><th>Details</th><th>Action</th></tr></thead><tbody>{mondayPlanAllocations.map(x=>{const driver=drivers.find(d=>String(d.driverId)===String(x.driverId));return <tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><div><b>{driver?.fullName||`Driver ${x.driverId}`}</b><small>Payment plan</small></div></div></td><td>{money(x.scheduledAmount)}</td><td><b>{money(x.allocatedAmount)}</b></td><td><Pill tone={x.status==='applied'?'good':x.error?'bad':'warn'}>{x.status}</Pill></td><td>{x.error?<small className="reasonText">{x.error}</small>:x.status==='applied'?<small className="reasonText">Applied to payment plan</small>:x.status==='applying'?<small className="reasonText">Processing or manual review required</small>:<small className="reasonText">Awaiting application</small>}</td><td><div className="compactActions">{canMoney&&!activeMonday.payoutRunId&&x.status==='pending'&&<button className="mini success" disabled={Boolean(planAllocationBusy)} onClick={()=>applyMondayPlanAllocation(x)}>{planAllocationBusy===x.id?'Applying…':'Apply deduction'}</button>}{x.status==='applied'&&<span className="tinyNote">Complete</span>}{x.status==='applying'&&<span className="tinyNote">Review</span>}</div></td></tr>})}</tbody></table></div></>:<div className="emptyInline good"><CheckCircle2/>No payment-plan deductions are required.</div>}
      </section>}

      {[3,4].includes(mondayWizardIndex)&&<>
       <section className="panel wizardStageCard">
        <div className="panelHead">
         <div><span className="sectionKicker">{mondayWizardIndex===3?'STEP 4':'STEP 5'}</span><h3>{mondayWizardIndex===3?'Review driver payouts':'Create payment run'}</h3><p>{mondayWizardIndex===3?'Approve or exclude the drivers to be paid.':'Review the final approved list and create the locked payment run.'}</p></div>
         <div className="rowActions">
          {weeklyPending.length>0&&canMoney&&<button className="secondary" onClick={approveAllWeekly}><CheckCircle2/>Approve all pending</button>}
          {selectedWeeklyPayouts.length>0&&!activeMonday.payoutRunId&&canMoney&&<button className="dangerAction" onClick={excludeSelectedWeekly}>Exclude selected ({selectedWeeklyPayouts.length})</button>}
          {weeklyApproved.length>0&&!activeMonday.payoutRunId&&canMoney&&<button className="primary" onClick={createWeeklyBatch}><Send/>Create payment run</button>}
         </div>
        </div>

        {mondayWizardIndex===4&&<div className="operatorWarning green"><CheckCircle2/><div><b>Ready to create payment run</b><span>{weeklyApproved.length} approved drivers totalling {money(weeklyApprovedTotal)}. Creating the run locks these payouts before funding.</span></div></div>}

        {weeklyItems.length?<div className="tableWrap proTable"><table><thead><tr><th className="selectCol"><input type="checkbox" aria-label="Select all payouts" disabled={Boolean(activeMonday.payoutRunId)} checked={weeklyItems.length>0&&weeklyItems.every(x=>selectedWeeklyPayouts.includes(x.payoutId))} onChange={toggleAllWeeklyPayouts}/></th><th>Driver</th><th>Previous balance</th><th>Weekly fee</th><th>Payout</th><th>Payout account</th><th>Decision</th><th>Actions</th></tr></thead><tbody>{weeklyItems.map(x=><tr key={x.payoutId} className={selectedWeeklyPayouts.includes(x.payoutId)?'selectedPayoutRow':''}><td className="selectCol"><input type="checkbox" aria-label={`Select callsign ${x.callsign}`} disabled={Boolean(activeMonday.payoutRunId)} checked={selectedWeeklyPayouts.includes(x.payoutId)} onChange={()=>toggleWeeklyPayout(x.payoutId)}/></td><td><div className="driverCell"><span className="callsign">{x.callsign}</span><div><b>{x.driverName}</b><small>Driver {x.driverId}</small></div></div></td><td>{money(x.previousBalance)}</td><td>{x.weeklyFeeWaivedInactive?<div><b>{money(0)}</b><small className="reasonText">Fee waived · no work recorded</small></div>:money(x.weeklyFee)}</td><td><b>{money(x.amount)}</b></td><td><Pill tone={bankTone(bankFor(x.driverId))}>{bankFor(x.driverId).label}</Pill></td><td><Pill tone={x.approvalStatus==='approved'?'good':x.approvalStatus==='excluded'?'bad':'warn'}>{x.approvalStatus||'pending'}</Pill>{x.exclusionReason&&<small className="reasonText">{x.exclusionReason}</small>}</td><td><div className="compactActions">{canMoney&&!activeMonday.payoutRunId&&<><button className="mini success" onClick={()=>weeklyDecision(x,'approved')}>Approve</button><button className="mini danger" onClick={()=>weeklyDecision(x,'excluded')}>Exclude</button></>}</div></td></tr>)}</tbody></table></div>:<div className="emptyInline">No payouts are above the minimum payout threshold.</div>}

        {weeklyPayoutCarryForward.length>0&&<div className="carryNote"><Info/> {weeklyPayoutCarryForward.length} positive balance{weeklyPayoutCarryForward.length===1?' is':'s are'} below the minimum payout threshold and will remain on the driver account.</div>}
       </section>

       <section className="panel wizardSecondaryPanel">
        <div className="panelHead"><div><h3>Drivers owing</h3><p>Collection requests created from negative Previous Balances.</p></div><button className="secondary" onClick={()=>go('outstanding')}>Open Outstanding</button></div>
        {weeklyCollections.length?<div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Previous balance</th><th>Weekly fee</th><th>Amount due</th><th>Due</th><th>Communication</th><th>Status</th></tr></thead><tbody>{weeklyCollections.map(x=>{const req=outstanding.find(o=>o.id===x.requestId);return <tr key={x.requestId||x.driverId}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td className="negative">{money(x.previousBalance)}</td><td>{x.weeklyFeeWaivedInactive?<div><b>{money(0)}</b><small className="reasonText">Fee waived · no work recorded</small></div>:money(x.weeklyFee)}</td><td><b className="negative">{money(x.amount)}</b></td><td>{req?.dueAt?dt(req.dueAt):'—'}</td><td><div className="compactStatus"><Pill tone={req?.emailSentAt?'good':'warn'}>Email {req?.emailSentAt?'sent':'pending'}</Pill><Pill tone={req?.smsSentAt?'good':'warn'}>SMS {req?.smsSentAt?'sent':'pending'}</Pill></div></td><td><Pill tone={req?.overdue?'bad':statusTone(req?.status||'open')}>{req?.overdue?'overdue':req?.status||'open'}</Pill></td></tr>})}</tbody></table></div>:<div className="emptyInline good"><CheckCircle2/>No drivers are above the outstanding-payment threshold.</div>}
        {weeklyCarryForward.length>0&&<div className="carryNote"><Info/> {weeklyCarryForward.length} small negative balance{weeklyCarryForward.length===1?' is':'s are'} below the threshold and will be carried forward.</div>}
       </section>
      </>}

      {mondayWizardIndex>=5&&activeWeeklyPayoutRun&&<section className="wizardActiveRun"><LiveRunCard r={activeWeeklyPayoutRun} showSteps={false}/></section>}
     </>}

    <section className="panel">
     <div className="panelHead"><div><h3>Weekly payment-run history</h3><p>Completed and cancelled runs remain here for audit.</p></div></div>
     <div className="runCards liveRunStack">{sett.payoutRuns.filter(r=>r.runType==='weekly'&&String(r.id)!==String(activeWeeklyPayoutRun?.id||'')).slice(0,12).map(r=><LiveRunCard key={r.id} r={r}/>)}</div>
    </section>
   </>}
    {view==='early'&&<>
     <section className="officePageIntro">
      <div><span>DAILY PAYOUT CONTROL</span><h2>Early payouts</h2><p>Review requests, create the payment run, fund it, release payouts and reconcile the result.</p></div>
      <button className="secondary" onClick={sendEarlySummary}><Mail/>Send office summary now</button>
     </section>

     <section className="panel wizardOverview">
      <div className="panelHead"><div><span className="sectionKicker">EARLY PAYOUT WIZARD</span><h3>Guided daily payout run</h3><p>The same payment-run controls and cancellation boundary are used as Monday.</p></div><Pill tone={activeEarlyPayoutRun?'warn':'neutral'}>{activeEarlyPayoutRun?'In progress':'Review'}</Pill></div>
      <WizardSteps steps={earlyWizardSteps} currentIndex={earlyWizardIndex}/>
     </section>

     {!activeEarlyPayoutRun
      ?<>
       <section className="summaryBanner"><div><Clock3/><div><b>Today's cutoff: {earlySummary?.cutoff||settings?.earlyPayoutCutoffTime||'11:00'}</b><span>{earlySummary?.summary?.status==='sent'?`Office email sent ${dt(earlySummary.summary.sent_at)}`:'Automatic office summary will send after cutoff.'}</span></div></div><div className="summaryNumbers"><span>{dueEarly.length} requests</span><b>{money(dueEarly.reduce((a,x)=>a+Number(x.netAmount||x.amount||0),0))}</b></div></section>

       <section className="panel wizardStageCard">
        <div className="panelHead">
         <div><span className="sectionKicker">{earlyWizardIndex===1?'STEP 2':'STEP 1'}</span><h3>{earlyWizardIndex===1?'Create approved payment run':'Review early payout requests'}</h3><p>{earlyWizardIndex===1?'Approved requests are ready to be locked into a payment run.':'Approve or decline each request before batching.'}</p></div>
         {canMoney&&sett.earlyPayoutRequests.some(x=>x.status==='approved')&&<button className="primary" onClick={createEarlyBatch}><Send/>Create approved payment run</button>}
        </div>

        {earlyWizardIndex===1&&<div className="operatorWarning green"><CheckCircle2/><div><b>Approved requests ready</b><span>Creating the payment run locks the approved values before funding.</span></div></div>}

        <div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Requested</th><th>Fee</th><th>Driver receives</th><th>Payout account</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sett.earlyPayoutRequests.map(x=><tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td>{money(x.grossAmount)}</td><td>{money(x.fee)}</td><td><b>{money(x.netAmount??x.amount)}</b></td><td><Pill tone={bankTone(bankFor(x.driverId))}>{bankFor(x.driverId).label}</Pill></td><td>{x.eligibleRunDate||'—'}</td><td><Pill tone={statusTone(x.status)}>{x.status}</Pill></td><td><div className="compactActions">{x.status==='requested'&&canMoney&&<><button className="mini success" onClick={()=>reviewEarly(x,'approved')}>Approve</button><button className="mini danger" onClick={()=>reviewEarly(x,'declined')}>Decline</button></>}{x.status==='approved'&&<span className="tinyNote">Ready to batch</span>}</div></td></tr>)}</tbody></table></div>
       </section>
      </>
      :<section className="wizardActiveRun"><LiveRunCard r={activeEarlyPayoutRun} showSteps={false}/></section>}

     <section className="panel">
      <div className="panelHead"><div><h3>Early payout payment-run history</h3><p>Completed and cancelled runs remain here for audit.</p></div></div>
      <div className="runCards liveRunStack">{sett.payoutRuns.filter(r=>r.runType==='early'&&String(r.id)!==String(activeEarlyPayoutRun?.id||'')).slice(0,12).map(r=><LiveRunCard key={r.id} r={r}/>)}</div>
     </section>
    </>}
    {view==='outstanding'&&<>

     <section className="officePageIntro">
      <div>
       <span>COLLECTIONS</span>
       <h2>Outstanding payments</h2>
       <p>Only balances currently due for collection are counted here. Drivers already on an agreed payment plan remain visible separately without double-counting the original debt.</p>
      </div>
     </section>

     <section className="officeStats four">
      <Stat
       icon={AlertTriangle}
       label="Standard outstanding"
       value={standardOutstanding.length}
       sub="Normal payment requests"
      />

      <Stat
       icon={CalendarDays}
       label="Plan instalments due"
       value={planInstalmentsDue.length}
       sub="Current instalments payable"
      />

      <Stat
       icon={Clock3}
       label="Overdue"
       value={overdueOutstanding.length}
       sub="Past payment deadline"
      />

      <Stat
       icon={CreditCard}
       label="Collect now"
       value={money(collectibleOutstandingTotal)}
       sub="No payment-plan double counting"
      />
     </section>

     <section className="panel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">ACTION REQUIRED</span>
        <h3>Payments currently due</h3>
        <p>These are the balances a driver can pay now.</p>
       </div>
       <span>{openOutstanding.length} due</span>
      </div>

      {openOutstanding.length
       ?<div className="tableWrap proTable">
        <table>
         <thead>
          <tr>
           <th>Driver</th>
           <th>Type</th>
           <th>Amount</th>
           <th>Due</th>
           <th>Email</th>
           <th>SMS</th>
           <th>Status</th>
           <th>Actions</th>
          </tr>
         </thead>

         <tbody>
          {openOutstanding.map(x=>{
           const isPlanInstalment=
            x.request_type==='payment_plan_instalment';

           return <tr
            key={x.id}
            className={x.overdue?'overdueRow':''}
           >
            <td>
             <div className="driverCell">
              <span className="callsign">{x.callsign}</span>
              <div>
               <b>{x.driverName}</b>
               {isPlanInstalment&&
                <small>Payment plan instalment</small>
               }
              </div>
             </div>
            </td>

            <td>
             <Pill tone={isPlanInstalment?'warn':'good'}>
              {isPlanInstalment
               ?'Plan instalment'
               :'Standard balance'}
             </Pill>
            </td>

            <td>
             <b>{money(x.amount)}</b>
            </td>

            <td>
             {x.dueAt?dt(x.dueAt):'—'}
            </td>

            <td>
             {isPlanInstalment
              ?<span className="mutedText">Plan managed</span>
              :<Pill tone={x.emailSentAt?'good':'warn'}>
               {x.emailSentAt?'Sent':'Not sent'}
              </Pill>
             }
            </td>

            <td>
             {isPlanInstalment
              ?<span className="mutedText">Plan managed</span>
              :<Pill tone={x.smsSentAt?'good':'warn'}>
               {x.smsSentAt?'Sent':'Not sent'}
              </Pill>
             }
            </td>

            <td>
             <Pill tone={x.overdue?'bad':statusTone(x.status)}>
              {x.overdue?'overdue':'open'}
             </Pill>

             {x.communicationError&&
              <small className="reasonText">
               {x.communicationError}
              </small>
             }
            </td>

            <td>
             <div className="compactActions">

              {!isPlanInstalment&&
               <button
                className="mini"
                onClick={()=>resendOutstanding(x)}
               >
                Resend
               </button>
              }

              <button
               className="mini"
               onClick={()=>createStripeLink(x)}
              >
               Payment link
              </button>

              {canMoney&&!isPlanInstalment&&
               <button
                className="mini"
                onClick={()=>openPaymentPlanCreate(x)}
               >
                Payment plan
               </button>
              }

              {isPlanInstalment&&x.payment_plan_id&&
               <button
                className="mini"
                onClick={()=>{
                 const plan=paymentPlans?.plans?.find(
                  p=>p.id===x.payment_plan_id
                 );

                 if(plan){
                  openPaymentPlanDetails(plan);
                  setView('paymentPlans');
                 }else{
                  go('paymentPlans');
                 }
                }}
               >
                View plan
               </button>
              }

             </div>
            </td>
           </tr>
          })}
         </tbody>
        </table>
       </div>

       :<div className="emptyState compact">
        <CheckCircle2/>
        <h3>No payments currently due</h3>
        <p>There are no standard balances or payment-plan instalments awaiting payment.</p>
       </div>
      }
     </section>

     <section className="panel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">AGREED ARRANGEMENTS</span>
        <h3>Balances on payment plans</h3>
        <p>The original debt stays here for audit, but it is not included in the collectible total above.</p>
       </div>
       <span>{onPlanOutstanding.length} balances</span>
      </div>

      {onPlanOutstanding.length
       ?<div className="tableWrap proTable">
        <table>
         <thead>
          <tr>
           <th>Driver</th>
           <th>Original balance</th>
           <th>Plan</th>
           <th>Remaining</th>
           <th>Next due</th>
           <th>Status</th>
           <th>Actions</th>
          </tr>
         </thead>

         <tbody>
          {onPlanOutstanding.map(x=>{
           const plan=paymentPlans?.plans?.find(
            p=>p.id===x.payment_plan_id ||
               p.sourcePaymentRequestId===x.id
           );

           return <tr key={x.id}>
            <td>
             <div className="driverCell">
              <span className="callsign">{x.callsign}</span>
              <b>{x.driverName}</b>
             </div>
            </td>

            <td>
             <b>{money(x.amount)}</b>
            </td>

            <td>
             {plan
              ?<>
               <b>{money(plan.instalmentAmount)}</b>
               <small>{plan.frequency}</small>
              </>
              :'—'
             }
            </td>

            <td>
             <b>
              {plan
               ?money(plan.remainingAmount)
               :'—'}
             </b>
            </td>

            <td>
             {plan?.nextDueAt
              ?dateOnly(plan.nextDueAt)
              :'—'}
            </td>

            <td>
             <Pill tone={
              plan?.status==='defaulted'
               ?'bad'
               :['active','completed'].includes(plan?.status)
                ?'good'
                :plan?.status==='paused'
                 ?'warn'
                 :'neutral'
             }>
              {plan?.status
               ?String(plan.status).replaceAll('_',' ')
               :'on plan'}
             </Pill>
            </td>

            <td>
             <div className="compactActions">
              <button
               className="mini"
               onClick={()=>{
                if(plan){
                 openPaymentPlanDetails(plan);
                 setView('paymentPlans');
                }else{
                 go('paymentPlans');
                }
               }}
              >
               View plan
              </button>
             </div>
            </td>
           </tr>
          })}
         </tbody>
        </table>
       </div>

       :<div className="emptyState compact">
        <CalendarDays/>
        <h3>No active payment-plan balances</h3>
        <p>Drivers with agreed plans will appear here after activation.</p>
       </div>
      }
     </section>

     <section className="panel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">HISTORY</span>
        <h3>Resolved payment requests</h3>
        <p>Paid and closed requests remain available for reconciliation and audit.</p>
       </div>
      </div>

      <div className="tableWrap proTable">
       <table>
        <thead>
         <tr>
          <th>Driver</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Paid</th>
         </tr>
        </thead>

        <tbody>
         {outstanding
          .filter(x=>!['open','on_plan'].includes(x.status))
          .slice(0,100)
          .map(x=>
           <tr key={x.id}>
            <td>
             <div className="driverCell">
              <span className="callsign">{x.callsign}</span>
              <b>{x.driverName}</b>
             </div>
            </td>

            <td>
             {x.request_type==='payment_plan_instalment'
              ?'Plan instalment'
              :'Standard balance'}
            </td>

            <td>
             <b>{money(x.amount)}</b>
            </td>

            <td>
             <Pill tone={statusTone(x.status)}>
              {String(x.status||'').replaceAll('_',' ')}
             </Pill>
            </td>

            <td>
             {x.paidAt?dt(x.paidAt):'—'}
            </td>
           </tr>
          )
         }
        </tbody>
       </table>
      </div>
     </section>

    </>}

    {view==='paymentPlans'&&<>

     <section className="officePageIntro">
      <div>
       <span>DRIVER COLLECTION AGREEMENTS</span>
       <h2>Payment plans</h2>
       <p>Manage agreed instalment plans for outstanding driver balances. FaivoPay tracks payments, remaining balances and the next instalment automatically.</p>
      </div>
      <div className="rowActions">
       <button
        className="secondary"
        disabled={!paymentPlans?.plans?.length}
        onClick={downloadPaymentPlansCsv}
       >
        Export CSV
       </button>
       <button className="secondary" onClick={loadPaymentPlans}>
        <RefreshCw/>Refresh
       </button>
      </div>
     </section>

     <section className="officeStats four">
      <Stat
       icon={CalendarDays}
       label="Active plans"
       value={paymentPlans?.summary?.active||0}
       sub="Currently being repaid"
       onClick={()=>setPaymentPlanStatus('active')}
       active={paymentPlanStatus==='active'}
      />
      <Stat
       icon={Clock3}
       label="Draft plans"
       value={paymentPlans?.summary?.draft||0}
       sub="Awaiting activation"
       onClick={()=>setPaymentPlanStatus('draft')}
       active={paymentPlanStatus==='draft'}
      />
      <Stat
       icon={AlertTriangle}
       label="Needs attention"
       value={
        Number(paymentPlans?.summary?.defaulted||0)+
        Number(paymentPlans?.summary?.paused||0)
       }
       sub="Paused or defaulted"
       onClick={()=>setPaymentPlanStatus('attention')}
       active={paymentPlanStatus==='attention'}
      />
      <Stat
       icon={CreditCard}
       label="Remaining"
       value={money(paymentPlans?.summary?.outstanding||0)}
       sub="Across live plans"
       onClick={()=>setPaymentPlanStatus('live')}
       active={paymentPlanStatus==='live'}
      />
     </section>

     <section className="panel">
      <div className="panelHead">
       <div>
        <h3>Driver payment plans</h3>
        <p>Each plan keeps the original debt, instalment history and remaining balance fully traceable.</p>
       </div>
       <span>
        {filteredPaymentPlans.length}
        {filteredPaymentPlans.length!==(paymentPlans?.plans?.length||0)
         ?` of ${paymentPlans?.plans?.length||0}`
         :''
        } plans
       </span>
      </div>

      {paymentPlans?.plans?.length
       ?<>
        <div className="driverToolbar">
         <div className="searchBox">
          <Search/>
          <input
           value={paymentPlanQ}
           onChange={e=>setPaymentPlanQ(e.target.value)}
           placeholder="Search callsign or driver name…"
          />
         </div>

         <select
          value={paymentPlanStatus}
          onChange={e=>setPaymentPlanStatus(e.target.value)}
         >
          <option value="all">All statuses</option>
          <option value="live">Live plans</option>
          <option value="attention">Needs attention</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="defaulted">Defaulted</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
         </select>
        </div>

        <div className="tableWrap proTable">
        <table>
         <thead>
          <tr>
           <th>Driver</th>
           <th>Plan</th>
           <th>Paid</th>
           <th>Remaining</th>
           <th>Next payment</th>
           <th>Progress</th>
           <th>Status</th>
           <th>Actions</th>
          </tr>
         </thead>

         <tbody>
          {filteredPaymentPlans.map(plan=>{
           const total=Number(plan.planAmount||0);
           const paid=Number(plan.paidAmount||0);
           const percent=total>0
            ?Math.min(100,Math.round((paid/total)*100))
            :0;

           const nextInstalment=
            plan.instalments?.find(
             x=>['due','scheduled','overdue'].includes(x.status)
            );

           const isOverdue=
            nextInstalment?.status==='overdue';

           const needsAttention=
            ['paused','defaulted'].includes(plan.status)||
            isOverdue;

           const attentionText=
            plan.status==='defaulted'
             ?plan.defaultReason||(
               nextInstalment?.status==='overdue'
                ?`Overdue ${money(nextInstalment.amount)} · due ${dateOnly(nextInstalment.dueAt)}`
                :'Payment plan needs review'
              )
             :plan.status==='paused'
              ?plan.pauseReason||'Payment plan paused'
              :nextInstalment?.status==='overdue'
               ?`Overdue ${money(nextInstalment.amount)} · due ${dateOnly(nextInstalment.dueAt)}`
               :'';

           return <tr
            key={plan.id}
            className={needsAttention?'overdueRow':''}
           >
            <td>
             <div className="driverCell">
              <span className="callsign">{plan.callsign}</span>
              <div>
               <b>{plan.driverName}</b>
               <small>{plan.frequency} plan</small>
               {attentionText&&
                <small className="paymentPlanAttentionSummary">
                 {attentionText}
                </small>
               }
              </div>
             </div>
            </td>

            <td>
             <b>{money(plan.planAmount)}</b>
             <small>{money(plan.instalmentAmount)} {plan.frequency}</small>
            </td>

            <td>
             <b className="pos">{money(plan.paidAmount)}</b>
            </td>

            <td>
             <b>{money(plan.remainingAmount)}</b>
            </td>

            <td>
             {plan.status==='completed'
              ?<span>Completed</span>
              :<>
               <b>{nextInstalment?money(nextInstalment.amount):'—'}</b>
               <small className={isOverdue?'negative':''}>
                {isOverdue?'Overdue · ':''}
                {dateOnly(plan.nextDueAt||nextInstalment?.dueAt)}
               </small>
              </>
             }
            </td>

            <td>
             <div className="planProgressCell">
              <div className="planProgressTrack">
               <span style={{width:`${percent}%`}}/>
              </div>
              <small>{percent}% · {plan.instalments?.filter(x=>x.status==='paid').length||0}/{plan.instalments?.length||0} paid</small>
             </div>
            </td>

            <td>
             <Pill tone={
              plan.status==='completed'
               ?'good'
               :['defaulted','cancelled'].includes(plan.status)
                ?'bad'
                :'warn'
             }>
              {String(plan.status||'').replaceAll('_',' ')}
             </Pill>
            </td>

            <td>
             <div className="compactActions">
              <button
               className="mini"
               onClick={()=>openPaymentPlanDetails(plan)}
              >
               {plan.status==='defaulted'
                ?'Review overdue'
                :plan.status==='paused'
                 ?'Review paused'
                 :'View'}
              </button>

              {canMoney&&plan.status==='draft'&&
               <button
                className="mini success"
                disabled={planActivateBusy}
                onClick={()=>activatePaymentPlan(plan)}
               >
                Activate
               </button>
              }

              {canMoney&&plan.status==='active'&&
               <button
                className="mini"
                disabled={planActionBusy}
                onClick={()=>pausePaymentPlan(plan)}
               >
                Pause
               </button>
              }

              {canMoney&&plan.status==='paused'&&
               <button
                className="mini success"
                disabled={planActionBusy}
                onClick={()=>resumePaymentPlan(plan)}
               >
                Resume
               </button>
              }

              {canMoney&&plan.status==='defaulted'&&
               <button
                className="mini danger"
                disabled={planActionBusy}
                onClick={()=>pausePaymentPlan(plan)}
               >
                Pause
               </button>
              }
             </div>
            </td>
           </tr>
          })}

          {!filteredPaymentPlans.length&&
           <tr>
            <td colSpan="8">
             <div className="emptyState compact">
              <Search/>
              <h3>No matching payment plans</h3>
              <p>Try changing the search or status filter.</p>
             </div>
            </td>
           </tr>
          }
         </tbody>
        </table>
       </div>
       </>
       :<div className="emptyState compact">
        <CalendarDays/>
        <h3>No payment plans yet</h3>
        <p>Create a plan from an open balance in Outstanding payments.</p>
        <button className="secondary" onClick={()=>go('outstanding')}>
         Open Outstanding
        </button>
       </div>
      }
     </section>
    </>}

{view==='fees'&&<><section className="officePageIntro"><div><span>REVENUE & RECONCILIATION</span><h2>Fees & billing</h2><p>Every FaivoPay fee is recorded separately so you can invoice the taxi company accurately and see the agreed split.</p></div><div className="rowActions"><button className="secondary" onClick={downloadFeesCsv}>Export CSV</button>{canMoney&&<button className="primary" onClick={markFeesInvoiced}>Mark uninvoiced as invoiced</button>}</div></section><section className="officeStats four"><Stat icon={BadgePoundSterling} label="Gross fees" value={money(fees?.summary?.gross||0)} sub="All recorded fees"/><Stat icon={WalletCards} label="FaivoPay share" value={money(fees?.summary?.fleetpay||0)} sub="Your share"/><Stat icon={Users} label="Taxi company share" value={money(fees?.summary?.taxi||0)} sub="Their share"/><Stat icon={FileClock} label="FaivoPay uninvoiced" value={money(fees?.summary?.uninvoiced||0)} sub="Ready to invoice"/></section><section className="panel"><div className="tableWrap proTable"><table><thead><tr><th>Date</th><th>Fee</th><th>Driver</th><th>Gross</th><th>FaivoPay</th><th>Taxi company</th><th>Status</th><th>Invoice</th></tr></thead><tbody>{fees.fees.map(x=><tr key={x.id}><td>{dt(x.createdAt)}</td><td><b>{String(x.feeType).replaceAll('_',' ')}</b><small>{x.description}</small></td><td>{x.callsign||'—'}</td><td>{money(x.grossFee)}</td><td><b>{money(x.fleetpayShare)}</b></td><td>{money(x.taxiCompanyShare)}</td><td><Pill tone={statusTone(x.status)}>{x.status}</Pill></td><td>{x.invoiceRef||'—'}</td></tr>)}</tbody></table></div></section></>}
    {view==='demo'&&<DemoLab demo={demo} loadDemo={loadDemo} resetDemo={resetDemo} action={demoAction} demoEmail={demoEmail} setDemoEmail={setDemoEmail} demoMobile={demoMobile} setDemoMobile={setDemoMobile} sendEmail={demoSendEmail} sendSms={demoSendSms}/>}
    {view==='drivers'&&<><section className="officePageIntro"><div><span>AUTOCAB + PAYOUT READINESS</span><h2>Driver accounts</h2><p>Balances and payout-bank readiness in one place. Full bank account numbers are never exposed in the normal office view.</p></div><button className="secondary" onClick={syncNow}><RefreshCw className={loading?'spin':''}/>Sync Autocab</button></section><section className="officeStats three"><Stat icon={Banknote} label="Bank ready" value={meta.bankReady??drivers.filter(d=>d.bankAccount?.ready).length} sub="Payout details saved"/><Stat icon={AlertTriangle} label="Missing bank details" value={meta.bankMissing??drivers.filter(d=>!d.bankAccount?.ready).length} sub="Cannot be released for payout"/><Stat icon={Clock3} label="Recently changed" value={meta.bankRecentlyChanged??drivers.filter(d=>d.bankAccount?.changedRecently).length} sub="Changed in the last 7 days"/></section><div className="driverToolbar"><div className="searchBox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search callsign, name, mobile, email or bank ending…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All drivers</option><option value="bank_ready">Bank ready</option><option value="bank_missing">Missing bank details</option><option value="bank_recent">Recently changed bank</option><option value="payout_excluded">Payout excluded</option><option value="positive">Positive balance</option><option value="negative">Negative balance</option><option value="unmatched">Unmatched</option></select></div><section className="panel driverPanel"><div className="tableWrap proTable"><table><thead><tr><th>Callsign</th><th>Driver</th><th>Previous</th><th>Current</th><th>Payout account</th><th>Payout status</th><th>Last processed</th></tr></thead><tbody>{filtered.map(d=>{const b=d.bankAccount||{};return <tr key={d.driverId} onClick={()=>setSelected(d)}><td><span className="callsign">{d.callsign}</span></td><td><b>{d.fullName}</b><small>{d.email||d.mobile||`Driver ${d.driverId}`}</small></td><td>{money(d.previousBalance)}</td><td><b className={(d.currentBalance??0)<0?'negative':''}>{money(d.currentBalance)}</b></td><td><div className="bankTableCell"><Pill tone={bankTone(b)}>{b.label||'Bank details missing'}</Pill>{b.ready&&<small>{b.accountNumberMasked} · {b.sortCodeMasked}</small>}</div></td><td><div className="bankTableCell"><Pill tone={d.payoutExcluded?'bad':'good'}>{d.payoutExcluded?'Excluded':'Enabled'}</Pill>{d.payoutExcluded&&<small>{d.payoutExclusionReason||'Persistent exclusion'}</small>}</div></td><td>{dt(d.lastProcessed)}</td></tr>})}</tbody></table></div></section></>}
    {view==='access'&&<><section className="officePageIntro"><div><span>IDENTITY & PERMISSIONS</span><h2>Users & access</h2><p>Office accounts use mandatory authenticator MFA. Roles limit who can move money or change settings.</p></div>{isAdmin&&<button className="primary" onClick={()=>setShowNewStaff(!showNewStaff)}><UserCheck/>Add office user</button>}</section>{isAdmin&&showNewStaff&&<section className="panel"><form className="staffForm" onSubmit={createStaff}><label>Name<input required value={newStaff.name} onChange={e=>setNewStaff({...newStaff,name:e.target.value})}/></label><label>Email<input type="email" required value={newStaff.email} onChange={e=>setNewStaff({...newStaff,email:e.target.value})}/></label><label>Role<select value={newStaff.role} onChange={e=>setNewStaff({...newStaff,role:e.target.value})}><option value="administrator">Administrator</option><option value="finance">Finance</option><option value="office">Office</option><option value="readonly">Read only</option></select></label><label>Temporary password<input type="password" minLength="10" required value={newStaff.password} onChange={e=>setNewStaff({...newStaff,password:e.target.value})}/></label><button className="primary">Create user</button></form></section>}<section className="panel"><div className="panelHead"><div><h3>Office users</h3><p>MFA and role status for each staff account.</p></div><button className="mini" onClick={loadStaff}>Refresh</button></div><div className="tableWrap proTable"><table><thead><tr><th>User</th><th>Role</th><th>MFA</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{staff.map(u=><tr key={u.id}><td><b>{u.name}</b><small>{u.email}</small></td><td><select value={u.role} onChange={e=>updateStaff(u,{role:e.target.value})} disabled={u.id===me?.id}><option value="administrator">Administrator</option><option value="finance">Finance</option><option value="office">Office</option><option value="readonly">Read only</option></select></td><td><Pill tone={u.mfaEnabled?'good':'warn'}>{u.mfaEnabled?'Enabled':'Setup required'}</Pill></td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.active?'good':'bad'}>{u.active?'Active':'Disabled'}</Pill></td><td>{u.id!==me?.id&&<button className="mini" onClick={()=>updateStaff(u,{active:!u.active})}>{u.active?'Disable':'Enable'}</button>}</td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelHead"><div><h3>Driver app accounts</h3><p>Registration remains matched to active Autocab driver details.</p></div><button className="mini" onClick={loadDriverUsers}>Refresh</button></div><div className="tableWrap proTable"><table><thead><tr><th>Callsign</th><th>Email</th><th>Created</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{driverUsers.map(u=><tr key={u.id}><td><span className="callsign">{u.callsign}</span></td><td>{u.email}</td><td>{dt(u.createdAt)}</td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.approved?'good':'warn'}>{u.approved?'Approved':'Pending'}</Pill></td><td>{canOffice&&<button className="mini" onClick={()=>setApproval(u,!u.approved)}>{u.approved?'Suspend':'Approve'}</button>}</td></tr>)}</tbody></table></div></section></>}

    {view==='platform'&&isPlatformAdmin&&<>
     <section className="officePageIntro">
      <div>
       <span>PLATFORM ADMINISTRATION</span>
       <h2>Companies & onboarding</h2>
       <p>Configure operators, integrations and features without changing the live environment until each company is explicitly migrated and tested.</p>
      </div>
      <button className="primary" onClick={startCompanyWizard}><UserCheck/>New company</button>
     </section>

     <section className="platformSummaryGrid">
      <div className="platformMetric"><span>Companies</span><b>{platformCompanies.length}</b><small>Configured on this FaivoPay platform</small></div>
      <div className="platformMetric"><span>Live</span><b>{platformCompanies.filter(x=>x.status==='live'||x.status==='active').length}</b><small>Currently marked active/live</small></div>
      <div className="platformMetric"><span>Draft</span><b>{platformCompanies.filter(x=>x.status==='draft'||x.status==='configuration_incomplete').length}</b><small>Still being configured</small></div>
     </section>

     {!platformWizardOpen&&!platformCompany&&
      <section className="panel">
       <div className="panelHead">
        <div><h3>Companies</h3><p>Select a company to review its platform configuration.</p></div>
        <button className="mini" onClick={loadPlatformCompanies}>Refresh</button>
       </div>
       <div className="platformCompanyList">
        {platformCompanies.map(c=>
         <button className="platformCompanyRow" key={c.id} onClick={()=>openPlatformCompany(c.id)}>
          <div><b>{c.name}</b><span>{c.primaryDomain||'No domain configured'}</span></div>
          <div><Pill tone={['live','active'].includes(c.status)?'good':c.status==='ready_for_testing'?'warn':'muted'}>{String(c.status||'draft').replaceAll('_',' ')}</Pill><small>{c.supportEmail||'No support email'}</small></div>
         </button>
        )}
        {!platformCompanies.length&&<div className="emptyState">No companies have been created yet.</div>}
       </div>
      </section>
     }

     {platformWizardOpen&&
      <section className="panel platformWizard">
       <div className="panelHead">
        <div><h3>New company setup</h3><p>Create the company as a safe draft. Credentials are stored but are not used by live integrations yet.</p></div>
        <button className="mini" onClick={()=>setPlatformWizardOpen(false)}>Cancel</button>
       </div>

       <div className="platformWizardSteps">
        {['Company','Autocab','Stripe','SendGrid','Twilio','Features','Review'].map((x,i)=>
         <button key={x} className={platformWizardStep===i?'active':''} onClick={()=>setPlatformWizardStep(i)}>
          <span>{i+1}</span>{x}
         </button>
        )}
       </div>

       {platformWizardStep===0&&<div className="formGrid2 platformWizardBody">
        <label>Company name<input value={platformWizard.general.name} onChange={e=>setPlatformWizard({...platformWizard,general:{...platformWizard.general,name:e.target.value}})}/></label>
        <label>Primary domain<input placeholder="example.faivopay.app" value={platformWizard.general.primaryDomain} onChange={e=>setPlatformWizard({...platformWizard,general:{...platformWizard.general,primaryDomain:e.target.value}})}/></label>
        <label>Support email<input type="email" value={platformWizard.general.supportEmail} onChange={e=>setPlatformWizard({...platformWizard,general:{...platformWizard.general,supportEmail:e.target.value}})}/></label>
        <label>Support phone<input value={platformWizard.general.supportPhone} onChange={e=>setPlatformWizard({...platformWizard,general:{...platformWizard.general,supportPhone:e.target.value}})}/></label>
        <label>Timezone<input value={platformWizard.general.timezone} onChange={e=>setPlatformWizard({...platformWizard,general:{...platformWizard.general,timezone:e.target.value}})}/></label>
       </div>}

       {platformWizardStep===1&&<div className="formGrid2 platformWizardBody">
        <label>Autocab company ID(s)<input placeholder="1,2" value={platformWizard.autocab.companyIds} onChange={e=>setPlatformWizard({...platformWizard,autocab:{...platformWizard.autocab,companyIds:e.target.value}})}/></label>
        <label>Autocab API key<input type="password" autoComplete="new-password" value={platformWizard.autocab.apiKey} onChange={e=>setPlatformWizard({...platformWizard,autocab:{...platformWizard.autocab,apiKey:e.target.value}})}/><small>Never displayed again after saving.</small></label>
        <label className="toggleRow"><span className="toggleCopy"><b>Allow Autocab adjustments</b><small>Leave disabled during onboarding.</small></span><span className="toggleSwitch"><input type="checkbox" checked={platformWizard.autocab.adjustmentsEnabled} onChange={e=>setPlatformWizard({...platformWizard,autocab:{...platformWizard.autocab,adjustmentsEnabled:e.target.checked}})}/><span className="toggleSlider"/></span></label>
       </div>}

       {platformWizardStep===2&&<div className="formGrid2 platformWizardBody">
        <label>Stripe secret key<input type="password" autoComplete="new-password" value={platformWizard.stripe.secretKey} onChange={e=>setPlatformWizard({...platformWizard,stripe:{...platformWizard.stripe,secretKey:e.target.value}})}/></label>
        <label>Stripe webhook secret<input type="password" autoComplete="new-password" value={platformWizard.stripe.webhookSecret} onChange={e=>setPlatformWizard({...platformWizard,stripe:{...platformWizard.stripe,webhookSecret:e.target.value}})}/></label>
       </div>}

       {platformWizardStep===3&&<div className="formGrid2 platformWizardBody">
        <label>From name<input value={platformWizard.sendgrid.fromName} onChange={e=>setPlatformWizard({...platformWizard,sendgrid:{...platformWizard.sendgrid,fromName:e.target.value}})}/></label>
        <label>From email<input type="email" value={platformWizard.sendgrid.fromEmail} onChange={e=>setPlatformWizard({...platformWizard,sendgrid:{...platformWizard.sendgrid,fromEmail:e.target.value}})}/></label>
        <label>SendGrid API key<input type="password" autoComplete="new-password" value={platformWizard.sendgrid.apiKey} onChange={e=>setPlatformWizard({...platformWizard,sendgrid:{...platformWizard.sendgrid,apiKey:e.target.value}})}/></label>
       </div>}

       {platformWizardStep===4&&<div className="formGrid2 platformWizardBody">
        <label>Twilio Account SID<input value={platformWizard.twilio.accountSid} onChange={e=>setPlatformWizard({...platformWizard,twilio:{...platformWizard.twilio,accountSid:e.target.value}})}/></label>
        <label>Messaging Service SID<input value={platformWizard.twilio.messagingServiceSid} onChange={e=>setPlatformWizard({...platformWizard,twilio:{...platformWizard.twilio,messagingServiceSid:e.target.value}})}/></label>
        <label>Fallback From number<input value={platformWizard.twilio.fromNumber} onChange={e=>setPlatformWizard({...platformWizard,twilio:{...platformWizard.twilio,fromNumber:e.target.value}})}/></label>
        <label>Twilio Auth Token<input type="password" autoComplete="new-password" value={platformWizard.twilio.authToken} onChange={e=>setPlatformWizard({...platformWizard,twilio:{...platformWizard.twilio,authToken:e.target.value}})}/></label>
       </div>}

       {platformWizardStep===5&&<div className="platformFeatureGrid platformWizardBody">
        {[
         ['paymentPlans','Payment plans'],
         ['earlyPayouts','Early payouts'],
         ['customerPayments','Customer payments'],
         ['driverPayouts','Driver payouts'],
         ['demoLab','Demo Lab']
        ].map(([key,label])=>
         <label className="toggleRow" key={key}>
          <span className="toggleCopy"><b>{label}</b><small>Available to this company when the tenant is activated.</small></span>
          <span className="toggleSwitch"><input type="checkbox" checked={platformWizard.features[key]} onChange={e=>setPlatformWizard({...platformWizard,features:{...platformWizard.features,[key]:e.target.checked}})}/><span className="toggleSlider"/></span>
         </label>
        )}
       </div>}

       {platformWizardStep===6&&<div className="platformReview">
        <div><span>Company</span><b>{platformWizard.general.name||'Not entered'}</b></div>
        <div><span>Domain</span><b>{platformWizard.general.primaryDomain||'Not entered'}</b></div>
        <div><span>Autocab</span><b>{platformWizard.autocab.companyIds?`Company ${platformWizard.autocab.companyIds}`:'Not configured'}</b></div>
        <div><span>Stripe</span><b>{platformWizard.stripe.secretKey?'Credentials entered':'Not configured'}</b></div>
        <div><span>SendGrid</span><b>{platformWizard.sendgrid.fromEmail||'Not configured'}</b></div>
        <div><span>Twilio</span><b>{platformWizard.twilio.accountSid?'Credentials entered':'Not configured'}</b></div>
        <div className="platformReviewNotice"><ShieldCheck/><div><b>This creates a draft only</b><span>No live FaivoPay integration will start using these values yet.</span></div></div>
       </div>}

       <div className="platformWizardActions">
        <button className="mini" disabled={platformWizardStep===0} onClick={()=>setPlatformWizardStep(x=>Math.max(0,x-1))}>Back</button>
        {platformWizardStep<6
         ?<button className="primary" onClick={()=>setPlatformWizardStep(x=>Math.min(6,x+1))}>Continue</button>
         :<button className="primary" onClick={createPlatformCompany}>Create draft company</button>}
       </div>
      </section>
     }

     {!platformWizardOpen&&platformCompany&&
      <>
       <section className="panel">
        <div className="panelHead">
         <div><h3>{platformCompany.company.name}</h3><p>{platformCompany.company.primaryDomain||'No domain configured'} · {String(platformCompany.company.status||'draft').replaceAll('_',' ')}</p></div>
         <div className="inlineActions"><button className="mini" onClick={()=>setPlatformCompany(null)}>Back</button><button className="primary" onClick={savePlatformCompany}>Save configuration</button></div>
        </div>
        <div className="formGrid2">
         <label>Company name<input value={platformCompany.company.name||''} onChange={e=>setPlatformCompany({...platformCompany,company:{...platformCompany.company,name:e.target.value}})}/></label>
         <label>Primary domain<input value={platformCompany.company.primaryDomain||''} onChange={e=>setPlatformCompany({...platformCompany,company:{...platformCompany.company,primaryDomain:e.target.value}})}/></label>
         <label>Support email<input value={platformCompany.company.supportEmail||''} onChange={e=>setPlatformCompany({...platformCompany,company:{...platformCompany.company,supportEmail:e.target.value}})}/></label>
         <label>Support phone<input value={platformCompany.company.supportPhone||''} onChange={e=>setPlatformCompany({...platformCompany,company:{...platformCompany.company,supportPhone:e.target.value}})}/></label>
        </div>
       </section>

       <div className="settingsSections">
        <section className="panel settingsCardV2">
         <div className="settingsHead"><Settings/><div><h3>Autocab</h3><p>Operator connection. Current live runtime is still using environment configuration.</p></div></div>
         <div className="formGrid2">
          <label>Company ID(s)<input value={platformCompany.config?.autocab?.companyIds||''} onChange={e=>updatePlatformConfig('autocab','companyIds',e.target.value)}/></label>
          <label>Replace API key<input type="password" autoComplete="new-password" value={platformCompany.config?.autocab?.apiKey||''} onChange={e=>updatePlatformConfig('autocab','apiKey',e.target.value)}/><small>{platformCompany.config?.autocab?.apiKeyConfigured?'A key is securely stored. Leave blank to keep it.':'No company-specific key stored.'}</small></label>
         </div>
        </section>

        <section className="panel settingsCardV2">
         <div className="settingsHead"><CreditCard/><div><h3>Stripe</h3><p>Payment credentials are masked and never returned to the browser.</p></div></div>
         <div className="formGrid2">
          <label>Replace secret key<input type="password" autoComplete="new-password" value={platformCompany.config?.stripe?.secretKey||''} onChange={e=>updatePlatformConfig('stripe','secretKey',e.target.value)}/><small>{platformCompany.config?.stripe?.secretKeyConfigured?'Secret key stored':'No company-specific key stored'}</small></label>
          <label>Replace webhook secret<input type="password" autoComplete="new-password" value={platformCompany.config?.stripe?.webhookSecret||''} onChange={e=>updatePlatformConfig('stripe','webhookSecret',e.target.value)}/><small>{platformCompany.config?.stripe?.webhookSecretConfigured?'Webhook secret stored':'No company-specific webhook secret stored'}</small></label>
         </div>
        </section>

        <section className="panel settingsCardV2">
         <div className="settingsHead"><Send/><div><h3>SendGrid</h3><p>Email identity and API credentials.</p></div></div>
         <div className="formGrid2">
          <label>From name<input value={platformCompany.config?.sendgrid?.fromName||''} onChange={e=>updatePlatformConfig('sendgrid','fromName',e.target.value)}/></label>
          <label>From email<input value={platformCompany.config?.sendgrid?.fromEmail||''} onChange={e=>updatePlatformConfig('sendgrid','fromEmail',e.target.value)}/></label>
          <label>Replace API key<input type="password" autoComplete="new-password" value={platformCompany.config?.sendgrid?.apiKey||''} onChange={e=>updatePlatformConfig('sendgrid','apiKey',e.target.value)}/><small>{platformCompany.config?.sendgrid?.apiKeyConfigured?'API key stored':'No company-specific key stored'}</small></label>
         </div>
        </section>

        <section className="panel settingsCardV2">
         <div className="settingsHead"><Send/><div><h3>Twilio</h3><p>SMS account and Messaging Service configuration.</p></div></div>
         <div className="formGrid2">
          <label>Account SID<input value={platformCompany.config?.twilio?.accountSid||''} onChange={e=>updatePlatformConfig('twilio','accountSid',e.target.value)}/></label>
          <label>Messaging Service SID<input value={platformCompany.config?.twilio?.messagingServiceSid||''} onChange={e=>updatePlatformConfig('twilio','messagingServiceSid',e.target.value)}/></label>
          <label>Fallback From number<input value={platformCompany.config?.twilio?.fromNumber||''} onChange={e=>updatePlatformConfig('twilio','fromNumber',e.target.value)}/></label>
          <label>Replace Auth Token<input type="password" autoComplete="new-password" value={platformCompany.config?.twilio?.authToken||''} onChange={e=>updatePlatformConfig('twilio','authToken',e.target.value)}/><small>{platformCompany.config?.twilio?.authTokenConfigured?'Auth token stored':'No company-specific token stored'}</small></label>
         </div>
        </section>
       </div>
      </>
     }
    </>}

    {view==='security'&&isAdmin&&<><section className="officePageIntro"><div><span>SECURITY CENTRE</span><h2>Authentication & audit</h2><p>Office access requires password plus authenticator verification. Sensitive actions are recorded against the signed-in user.</p></div><div className="secureBadge"><ShieldCheck/><div><b>MFA enforced</b><span>{me?.email}</span></div></div></section><section className="securityCards"><div className="securityCard"><ShieldCheck/><div><span>Current session</span><b>MFA verified</b><small>{me?.role}</small></div></div><div className="securityCard"><KeyRound/><div><span>Authentication</span><b>TOTP authenticator</b><small>Required for every office account</small></div></div><div className="securityCard"><Clock3/><div><span>Session lifetime</span><b>12 hours maximum</b><small>Sign out on shared devices</small></div></div></section><section className="panel"><div className="panelHead"><div><h3>Security history</h3><p>Recent login, MFA and security events.</p></div><button className="mini" onClick={loadSecurity}>Refresh</button></div><div className="securityLogList">{securityLogs.map(l=><div className="securityLog" key={l.id}><div className="logIcon"><ShieldCheck/></div><div><b>{String(l.action).replaceAll('_',' ')}</b><span>{l.actorId||'system'} · {dt(l.createdAt)}</span><small>{l.ip||'No IP recorded'}</small></div></div>)}</div></section></>}
    {view==='settings'&&isAdmin&&settings&&<><section className="officePageIntro"><div><span>ADMINISTRATION</span><h2>FaivoPay settings</h2><p>Operational rules, payout descriptions, communications and fee splits. Secret values are stored encrypted and are never returned to the browser.</p></div><button className="primary" onClick={saveSettings}><Settings/>Save all settings</button></section><div className="settingsSections">
     <section className="panel settingsCardV2"><div className="settingsHead"><CalendarDays/><div><h3>Settlement & payout rules</h3><p>Controls used for Monday and early payout processing.</p></div></div><div className="formGrid2"><label>Outstanding threshold<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.negativeThreshold??0} onChange={e=>setSettings({...settings,negativeThreshold:e.target.value})}/></div><small>Amounts owed below this are carried forward.</small></label><label>Minimum payout threshold<div className="moneyField"><span>£</span><input type="number" min="0" step="0.01" value={settings.minimumPayoutThreshold??0} onChange={e=>setSettings({...settings,minimumPayoutThreshold:e.target.value})}/></div><small>Positive balances below this remain on the driver account until a future settlement.</small></label><label>Weekly FaivoPay fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.weeklyAppFee??0} onChange={e=>setSettings({...settings,weeklyAppFee:e.target.value})}/></div></label><label className="toggleRow"><span className="toggleCopy"><b>Charge weekly fee when no work is recorded</b><small>Turn this off to waive the weekly fee for drivers with no recorded work during the week being settled.</small></span><span className="toggleSwitch"><input type="checkbox" checked={settings.chargeWeeklyFeeWhenInactive!==false} onChange={e=>setSettings({...settings,chargeWeeklyFeeWhenInactive:e.target.checked})}/><span className="toggleSlider"/></span></label><label>Early payout fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.earlyPayoutFee??0} onChange={e=>setSettings({...settings,earlyPayoutFee:e.target.value})}/></div></label><label>Early payout cutoff<input type="time" value={settings.earlyPayoutCutoffTime||'11:00'} onChange={e=>setSettings({...settings,earlyPayoutCutoffTime:e.target.value})}/></label><label>Outstanding payment deadline<input type="time" value={settings.outstandingDueTime||'17:00'} onChange={e=>setSettings({...settings,outstandingDueTime:e.target.value})}/></label><label>Autocab sync interval<input type="number" min="2" max="60" value={settings.syncMinutes||10} onChange={e=>setSettings({...settings,syncMinutes:e.target.value})}/><small>Minutes between automatic syncs.</small></label></div><div className="formGrid1"><label>Weekly payout Autocab description<input value={settings.weeklyPayoutReasonTemplate||''} onChange={e=>setSettings({...settings,weeklyPayoutReasonTemplate:e.target.value})}/><small>Available: {'{date}'} {'{time}'} {'{callsign}'} {'{amount}'}</small></label><label>Early payout Autocab description<input value={settings.earlyPayoutReasonTemplate||''} onChange={e=>setSettings({...settings,earlyPayoutReasonTemplate:e.target.value})}/></label><div className="formGrid2"><label>Manual pay-in default reason<input value={settings.manualPayInReasonDefault||''} onChange={e=>setSettings({...settings,manualPayInReasonDefault:e.target.value})}/></label><label>Manual payout default reason<input value={settings.manualPayoutReasonDefault||''} onChange={e=>setSettings({...settings,manualPayoutReasonDefault:e.target.value})}/></label></div></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><BadgePoundSterling/><div><h3>Fee pricing & split</h3><p>Define the gross fee and how each fee is split between FaivoPay and the taxi company.</p></div></div><div className="formGrid2"><label>Customer payment fee type<select value={settings.customerPaymentFeeType||'fixed'} onChange={e=>setSettings({...settings,customerPaymentFeeType:e.target.value})}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label><label>Customer payment fee<div className="moneyField"><span>{settings.customerPaymentFeeType==='percentage'?'%':'£'}</span><input type="number" min="0" step="0.01" value={settings.customerPaymentFeeValue??0} onChange={e=>setSettings({...settings,customerPaymentFeeValue:e.target.value})}/></div></label><label>FaivoPay share – customer fees<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.customerFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,customerFeeFleetPayPercent:e.target.value})}/></div><small>Taxi company receives the remaining percentage.</small></label><label>FaivoPay share – early payout fee<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.earlyPayoutFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,earlyPayoutFeeFleetPayPercent:e.target.value})}/></div></label><label>FaivoPay share – weekly fee<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.weeklyFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,weeklyFeeFleetPayPercent:e.target.value})}/></div></label></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Smartphone/><div><h3>SMS providers</h3><p>Choose how FaivoPay routes payment and general messages between Twilio and the taxi-company gateway.</p></div></div><div className="formGrid2"><label className="toggleRow"><span className="toggleCopy"><b>Enable Twilio</b><small>Allow FaivoPay to send SMS through Twilio.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.twilioEnabled)} onChange={e=>setSettings({...settings,twilioEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label><label className="toggleRow"><span className="toggleCopy"><b>Enable Orion gateway</b><small>Allow FaivoPay to send SMS through the taxi-company gateway.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.orionEnabled)} onChange={e=>setSettings({...settings,orionEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label><label>Payment-link SMS provider<select value={settings.paymentSmsProvider||'twilio'} onChange={e=>setSettings({...settings,paymentSmsProvider:e.target.value})}><option value="twilio">Twilio</option><option value="orion">Orion gateway</option></select></label><label>General SMS provider<select value={settings.generalSmsProvider||'orion'} onChange={e=>setSettings({...settings,generalSmsProvider:e.target.value})}><option value="orion">Orion gateway</option><option value="twilio">Twilio</option></select></label><label className="toggleRow"><span className="toggleCopy"><b>Use fallback SMS provider</b><small>Try the secondary provider automatically if the primary provider fails.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.smsFallbackEnabled)} onChange={e=>setSettings({...settings,smsFallbackEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label></div><div className="formGrid2"><label>Low Twilio balance warning (£)<input type="number" min="0" step="1" value={settings.twilioLowBalanceThreshold??20} onChange={e=>setSettings({...settings,twilioLowBalanceThreshold:e.target.value})}/></label><label>Low balance email<input type="email" value={settings.twilioLowBalanceEmail||''} onChange={e=>setSettings({...settings,twilioLowBalanceEmail:e.target.value})}/></label><label className="toggleRow"><span className="toggleCopy"><b>Enable low-balance alerts</b><small>Email a warning when the Twilio balance falls below the configured threshold.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.twilioLowBalanceAlertsEnabled)} onChange={e=>setSettings({...settings,twilioLowBalanceAlertsEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label></div><div className="formGrid2"><label>Orion endpoint URL<input value={settings.smsEndpoint||''} onChange={e=>setSettings({...settings,smsEndpoint:e.target.value})} placeholder="https://..."/></label><label>HTTP method<select value={settings.smsMethod||'POST'} onChange={e=>setSettings({...settings,smsMethod:e.target.value})}><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label>Authentication header<input value={settings.smsAuthHeader||''} onChange={e=>setSettings({...settings,smsAuthHeader:e.target.value})} placeholder="Authorization"/></label><label>Authentication/API value<input type="password" value={settings.smsAuthValue||''} onChange={e=>setSettings({...settings,smsAuthValue:e.target.value})} placeholder={settings.smsAuthConfigured?'Configured – enter only to replace':'Enter secret value'}/></label></div><label>Orion JSON body template<textarea rows="4" value={settings.smsBodyTemplate||''} onChange={e=>setSettings({...settings,smsBodyTemplate:e.target.value})}/><small>Use {'{mobile}'} and {'{message}'}. The final result must be valid JSON.</small></label><div className="testStrip"><input value={testSms.to} onChange={e=>setTestSms({...testSms,to:e.target.value})} placeholder="Test mobile number"/><input value={testSms.message} onChange={e=>setTestSms({...testSms,message:e.target.value})}/><button className="secondary" onClick={testSmsNow}>Send test SMS</button></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Mail/><div><h3>Email / SMTP</h3><p>SMTP is used for outstanding-payment messages and daily early-payout summaries. Resend remains the fallback if SMTP is blank.</p></div></div><div className="formGrid2"><label>SMTP host<input value={settings.smtpHost||''} onChange={e=>setSettings({...settings,smtpHost:e.target.value})}/></label><label>SMTP port<input type="number" value={settings.smtpPort||587} onChange={e=>setSettings({...settings,smtpPort:e.target.value})}/></label><label>SMTP username<input value={settings.smtpUser||''} onChange={e=>setSettings({...settings,smtpUser:e.target.value})}/></label><label>SMTP password<input type="password" value={settings.smtpPassword||''} onChange={e=>setSettings({...settings,smtpPassword:e.target.value})} placeholder={settings.smtpPasswordConfigured?'Configured – enter only to replace':'Enter password'}/></label><label>From name<input value={settings.smtpFromName||''} onChange={e=>setSettings({...settings,smtpFromName:e.target.value})}/></label><label>From email<input type="email" value={settings.smtpFromEmail||''} onChange={e=>setSettings({...settings,smtpFromEmail:e.target.value})}/></label><label>Office notification email<input type="email" value={settings.officeNotificationEmail||''} onChange={e=>setSettings({...settings,officeNotificationEmail:e.target.value})}/></label><label className="toggleRow"><span className="toggleCopy"><b>Use secure SMTP</b><small>Enable TLS immediately on connection, normally when using port 465.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.smtpSecure)} onChange={e=>setSettings({...settings,smtpSecure:e.target.checked})}/><span className="toggleSlider"/></span></label></div><div className="testStrip"><input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder={settings.officeNotificationEmail||'Test email address'}/><button className="secondary" onClick={testEmailNow}>Send test email</button></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Mail/><div><h3>Outstanding-payment messages</h3><p>Edit the exact wording drivers receive after the Monday run.</p></div></div><label>Email subject<input value={settings.outstandingEmailSubject||''} onChange={e=>setSettings({...settings,outstandingEmailSubject:e.target.value})}/></label><label>Email message<textarea rows="7" value={settings.outstandingEmailBody||''} onChange={e=>setSettings({...settings,outstandingEmailBody:e.target.value})}/></label><label>SMS message<textarea rows="5" value={settings.outstandingSmsTemplate||''} onChange={e=>setSettings({...settings,outstandingSmsTemplate:e.target.value})}/></label><small>Available variables: {'{driver}'}, {'{callsign}'}, {'{amount}'}, {'{dueDate}'}, {'{dueTime}'}, {'{paymentLink}'}</small></section>
     <section className="panel settingsCardV2 dangerZone"><div className="settingsHead"><AlertTriangle/><div><h3>Pre-launch data reset</h3><p>Use once before the live launch. FaivoPay creates a timestamped SQLite backup first, then clears operational test data while keeping office users, MFA, settings and integrations.</p></div></div><div className="launchResetInfo"><b>Cleared:</b><span>payments, payment plans, payout runs, settlement runs, fee records, notifications, communication history, adjustments and demo data.</span></div><label className="toggleRow"><span className="toggleCopy"><b>Also clear driver app registrations</b><small>Include driver logins and push subscriptions in the pre-launch reset.</small></span><span className="toggleSwitch"><input type="checkbox" checked={resetDrivers} onChange={e=>setResetDrivers(e.target.checked)}/><span className="toggleSlider"/></span></label><label>Confirmation phrase<input value={resetPhrase} onChange={e=>setResetPhrase(e.target.value)} placeholder="RESET FAIVOPAY FOR LIVE LAUNCH"/></label><button className="dangerAction" disabled={resetPhrase!=='RESET FAIVOPAY FOR LIVE LAUNCH'} onClick={launchReset}><AlertTriangle/>Create backup & reset operational data</button></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Database/><div><h3>Integration status</h3><p>Secrets from environment variables remain server-side.</p></div></div>{integrations&&<div className="integrationGrid"><div><b>Stripe</b><span>{integrations.stripe.configured?(integrations.stripe.testMode?'Test mode':'Live mode'):'Not configured'}</span><Pill tone={integrations.stripe.configured?'good':'warn'}>{integrations.stripe.configured?'Ready':'Setup'}</Pill></div><div><b>Wise</b><span>{integrations.wise.configured?integrations.wise.environment:'Not configured'}</span><Pill tone={integrations.wise.configured?'good':'warn'}>{integrations.wise.configured?'Ready':'Setup'}</Pill></div><div><b>Autocab writes</b><span>{integrations.autocab.adjustmentsEnabled?'Enabled':'Safe mode'}</span><Pill tone={integrations.autocab.adjustmentsEnabled?'good':'warn'}>{integrations.autocab.adjustmentsEnabled?'Enabled':'Disabled'}</Pill></div><div><b>Twilio SMS</b><span>{twilioBalance?.configured?`${twilioBalance.currency==='GBP'?'£':''}${Number(twilioBalance.balance||0).toFixed(2)} ${twilioBalance.currency||''}`:'Not configured'}</span><Pill tone={twilioBalance?.configured?'good':'warn'}>{twilioBalance?.configured?'Ready':'Setup'}</Pill></div></div>}</section>
    </div></>}
   </div>
  </main>

   {planCreateSource&&
    <div
     className="drawerBack paymentPlanModalLayer"
     onClick={()=>!planCreateBusy&&setPlanCreateSource(null)}
    >
     <div
      className="paymentPlanModal"
      onClick={e=>e.stopPropagation()}
     >
      <button
       className="drawerClose"
       disabled={planCreateBusy}
       onClick={()=>setPlanCreateSource(null)}
      >
       <X/>
      </button>

      <div className="paymentPlanModalHead">
       <span>NEW PAYMENT PLAN</span>
       <h2>Agree an instalment schedule</h2>
       <p>The original balance stays unchanged until this draft is explicitly activated.</p>
      </div>

      <div className="paymentPlanDriver">
       <span className="callsign">{planCreateSource.callsign}</span>
       <div>
        <b>{planCreateSource.driverName}</b>
        <span>Outstanding balance</span>
       </div>
       <strong>{money(planCreateSource.amount)}</strong>
      </div>

      <form onSubmit={createPaymentPlan} className="paymentPlanForm">

       <div className="formGrid2">
        <label>
         Frequency
         <select
          value={planCreate.frequency}
          onChange={e=>setPlanCreate({
           ...planCreate,
           frequency:e.target.value
          })}
         >
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
          <option value="monthly">Monthly</option>
         </select>
        </label>

        <label>
         Instalment amount
         <div className="moneyField">
          <span>£</span>
          <input
           type="number"
           step="0.01"
           min="0.01"
           max={planCreateSource.amount}
           required
           value={planCreate.instalmentAmount}
           onChange={e=>setPlanCreate({
            ...planCreate,
            instalmentAmount:e.target.value
           })}
          />
         </div>
        </label>

        <label>
         First payment date
         <input
          type="date"
          required
          value={planCreate.startDate}
          onChange={e=>setPlanCreate({
           ...planCreate,
           startDate:e.target.value
          })}
         />
        </label>
       </div>

       {Number(planCreate.instalmentAmount)>0&&
        <div className="paymentPlanPreview">
         <div>
          <span>Outstanding</span>
          <b>{money(planCreateSource.amount)}</b>
         </div>

         <div>
          <span>Regular payment</span>
          <b>{money(Number(planCreate.instalmentAmount||0))}</b>
         </div>

         <div>
          <span>Approx. instalments</span>
          <b>{
           Math.ceil(
            Number(planCreateSource.amount||0)/
            Number(planCreate.instalmentAmount||1)
           )
          }</b>
         </div>
        </div>
       }

       <label>
        Office notes
        <textarea
         rows="3"
         value={planCreate.notes}
         onChange={e=>setPlanCreate({
          ...planCreate,
          notes:e.target.value
         })}
         placeholder="Reason for plan, agreed arrangement or other internal note"
        />
       </label>

       <div className="operatorWarning blue">
        <Info/>
        <div>
         <b>This creates a draft only</b>
         <span>No payment request, Stripe transaction or Autocab adjustment occurs until Finance activates the plan.</span>
        </div>
       </div>

       <div className="paymentPlanModalActions">
        <button
         type="button"
         className="secondary"
         disabled={planCreateBusy}
         onClick={()=>setPlanCreateSource(null)}
        >
         Cancel
        </button>

        <button
         className="primary"
         disabled={planCreateBusy}
        >
         {planCreateBusy?'Creating…':'Create draft plan'}
        </button>
       </div>
      </form>
     </div>
    </div>
   }

   {planAmendTarget&&
    <div
     className="drawerBack paymentPlanModalLayer"
     onClick={()=>!planAmendBusy&&setPlanAmendTarget(null)}
    >
     <div
      className="paymentPlanModal"
      onClick={e=>e.stopPropagation()}
     >
      <button
       className="drawerClose"
       disabled={planAmendBusy}
       onClick={()=>setPlanAmendTarget(null)}
      >
       <X/>
      </button>

      <div className="paymentPlanModalHead">
       <span>AMEND PAYMENT PLAN</span>
       <h2>Update the instalment schedule</h2>
       <p>
        {planAmendTarget.status==='paused'
         ?'Update the remaining arrangement before resuming the plan.'
         :'Update this draft arrangement before it is activated.'}
       </p>
      </div>

      <div className="paymentPlanDriver">
       <span className="callsign">{planAmendTarget.callsign}</span>
       <div>
        <b>{planAmendTarget.driverName}</b>
        <span>Remaining balance</span>
       </div>
       <strong>{money(planAmendTarget.remainingAmount)}</strong>
      </div>

      <form onSubmit={submitPaymentPlanAmend} className="paymentPlanForm">

       <div className="formGrid2">
        <label>
         Frequency
         <select
          value={planAmend.frequency}
          onChange={e=>setPlanAmend({
           ...planAmend,
           frequency:e.target.value
          })}
         >
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
          <option value="monthly">Monthly</option>
         </select>
        </label>

        <label>
         Instalment amount
         <div className="moneyField">
          <span>£</span>
          <input
           type="number"
           step="0.01"
           min="0.01"
           max={planAmendTarget.remainingAmount}
           required
           value={planAmend.instalmentAmount}
           onChange={e=>setPlanAmend({
            ...planAmend,
            instalmentAmount:e.target.value
           })}
          />
         </div>
        </label>

        <label>
         {planAmendTarget.status==='paused'
          ?'Next payment date'
          :'First payment date'}
         <input
          type="date"
          required
          value={planAmend.startDate}
          onChange={e=>setPlanAmend({
           ...planAmend,
           startDate:e.target.value
          })}
         />
        </label>
       </div>

       {Number(planAmend.instalmentAmount)>0&&
        <div className="paymentPlanPreview">
         <div>
          <span>Remaining</span>
          <b>{money(planAmendTarget.remainingAmount)}</b>
         </div>

         <div>
          <span>Regular payment</span>
          <b>{money(Number(planAmend.instalmentAmount||0))}</b>
         </div>

         <div>
          <span>Approx. instalments</span>
          <b>{
           Math.ceil(
            Number(planAmendTarget.remainingAmount||0)/
            Number(planAmend.instalmentAmount||1)
           )
          }</b>
         </div>
        </div>
       }

       <label>
        Office notes
        <textarea
         rows="3"
         value={planAmend.notes}
         onChange={e=>setPlanAmend({
          ...planAmend,
          notes:e.target.value
         })}
         placeholder="Reason for plan, agreed arrangement or other internal note"
        />
       </label>

       <div className="operatorWarning blue">
        <Info/>
        <div>
         <b>
          {planAmendTarget.status==='paused'
           ?'Paid instalments are protected'
           :'Draft schedule only'}
         </b>
         <span>
          {planAmendTarget.status==='paused'
           ?'Completed payments remain unchanged. Only the unpaid balance is rescheduled, and the plan stays paused until you resume it.'
           :'No money moves when this draft is amended. The revised schedule only becomes payable after activation.'}
         </span>
        </div>
       </div>

       <div className="paymentPlanModalActions">
        <button
         type="button"
         className="secondary"
         disabled={planAmendBusy}
         onClick={()=>setPlanAmendTarget(null)}
        >
         Cancel
        </button>

        <button
         className="primary"
         disabled={planAmendBusy}
        >
         {planAmendBusy?'Saving…':'Save changes'}
        </button>
       </div>
      </form>
     </div>
    </div>
   }

   {selectedPaymentPlan&&
    <div
     className="drawerBack transactionDetailLayer"
     onClick={()=>setSelectedPaymentPlan(null)}
    >
     <aside
      className="drawer paymentPlanDrawer"
      onClick={e=>e.stopPropagation()}
     >
      <button
       className="drawerClose"
       onClick={()=>setSelectedPaymentPlan(null)}
      >
       <X/>
      </button>

      <div className="paymentPlanDrawerHead">
       <span>PAYMENT PLAN</span>
       <h2>Callsign {selectedPaymentPlan.callsign}</h2>
       <p>{selectedPaymentPlan.driverName}</p>
      </div>

      <div className="paymentPlanBalanceGrid">
       <div>
        <span>Original</span>
        <b>{money(selectedPaymentPlan.originalAmount)}</b>
       </div>
       <div>
        <span>Paid</span>
        <b className="pos">{money(selectedPaymentPlan.paidAmount)}</b>
       </div>
       <div>
        <span>Remaining</span>
        <b>{money(selectedPaymentPlan.remainingAmount)}</b>
       </div>
      </div>

      <div className="paymentPlanDrawerMeta">
       <div><span>Status</span><Pill tone={selectedPaymentPlan.status==='completed'?'good':['cancelled','defaulted'].includes(selectedPaymentPlan.status)?'bad':'warn'}>{String(selectedPaymentPlan.status||'').replaceAll('_',' ')}</Pill></div>
       <div><span>Frequency</span><b>{selectedPaymentPlan.frequency}</b></div>
       <div><span>Instalment</span><b>{money(selectedPaymentPlan.instalmentAmount)}</b></div>
       <div><span>Start date</span><b>{dateOnly(selectedPaymentPlan.startDate)}</b></div>
       <div><span>Next due</span><b>{dateOnly(selectedPaymentPlan.nextDueAt)}</b></div>
      </div>

      <div className="paymentPlanNotes">
       <span>Audit details</span>
       <div className="detailList">
        <div>
         <span>Created</span>
         <b>{selectedPaymentPlan.createdAt?dt(selectedPaymentPlan.createdAt):'—'}</b>
        </div>
        <div>
         <span>Created by</span>
         <b>{selectedPaymentPlan.createdBy||'FaivoPay'}</b>
        </div>
        <div>
         <span>Last updated</span>
         <b>{selectedPaymentPlan.updatedAt?dt(selectedPaymentPlan.updatedAt):'—'}</b>
        </div>
        <div>
         <span>Updated by</span>
         <b>{selectedPaymentPlan.updatedBy||'FaivoPay'}</b>
        </div>
       </div>
      </div>

      {selectedPaymentPlan.status==='defaulted'&&
       <div className="paymentPlanNotice danger">
        <AlertTriangle/>
        <div>
         <b>Payment plan needs attention</b>
         <span>
          {selectedPaymentPlan.defaultReason||'A scheduled instalment has been missed.'}
          {selectedPaymentPlan.defaultedAt
           ?` Defaulted ${dt(selectedPaymentPlan.defaultedAt)}.`
           :''}
         </span>
        </div>
       </div>
      }

      {selectedPaymentPlan.status==='paused'&&
       <div className="paymentPlanNotice warning">
        <Clock3/>
        <div>
         <b>Payment plan paused</b>
         <span>
          {selectedPaymentPlan.pauseReason||'This payment plan has been paused.'}
          {selectedPaymentPlan.pausedAt
           ?` Paused ${dt(selectedPaymentPlan.pausedAt)}.`
           :''}
         </span>
        </div>
       </div>
      }

      {selectedPaymentPlan.status==='cancelled'&&
       <div className="paymentPlanNotice neutral">
        <X/>
        <div>
         <b>Payment plan cancelled</b>
         <span>
          {selectedPaymentPlan.cancellationReason||'This payment plan has been cancelled.'}
          {selectedPaymentPlan.cancelledAt
           ?` Cancelled ${dt(selectedPaymentPlan.cancelledAt)}.`
           :''}
         </span>
        </div>
       </div>
      }

      {selectedPaymentPlan.notes&&
       <div className="paymentPlanNotes">
        <span>Office notes</span>
        <p>{selectedPaymentPlan.notes}</p>
       </div>
      }

      {isPaymentPlanFinalSettlement(selectedPaymentPlan)&&
       <div className="paymentPlanNotes">
        <span>Final settlement</span>
        <p>
         {money(selectedPaymentPlan.remainingAmount)} is due now as the final payment.
         Future instalments have been cancelled.
        </p>
       </div>
      }

      <div className="paymentPlanSchedule">
       <div className="panelHead">
        <div>
         <h3>Instalment schedule</h3>
         <p>Every scheduled and completed payment.</p>
        </div>
       </div>

       {selectedPaymentPlan.instalments?.map(x=>
        <div className="paymentPlanScheduleRow" key={x.id}>
         <div className="paymentPlanInstalmentNo">
          {x.instalmentNumber}
         </div>

         <div>
          <b>{money(x.amount)}</b>
          <span>Due {dateOnly(x.dueAt)}</span>
         </div>

         <Pill tone={
          x.status==='paid'
           ?'good'
           :x.status==='overdue'
            ?'bad'
            :'warn'
         }>
          {x.status}
         </Pill>
        </div>
       )}
      </div>

      {Array.isArray(selectedPaymentPlan.events)&&selectedPaymentPlan.events.length>0&&
       <div className="paymentPlanActivity">
        <div className="panelHead">
         <div>
          <h3>Plan activity</h3>
          <p>Recorded changes and payment-plan events.</p>
         </div>
        </div>

        <div className="paymentPlanTimeline">
         {selectedPaymentPlan.events.map(event=>
          <div className="paymentPlanTimelineRow" key={event.id}>
           <div className="paymentPlanTimelineMark"></div>

           <div className="paymentPlanTimelineBody">
            <div className="paymentPlanTimelineHead">
             <div className="paymentPlanTimelineTitle">
              <Pill tone={paymentPlanEventMeta(event.eventType).tone}>
               {paymentPlanEventMeta(event.eventType).label}
              </Pill>
              <b>{event.description||paymentPlanEventMeta(event.eventType).label}</b>
             </div>
             <span>{dt(event.createdAt)}</span>
            </div>

            <small>
             {event.actorType==='system'
              ?event.actorId==='stripe'
               ?'Stripe'
               :'FaivoPay system'
              :event.actorType==='staff'
               ?[
                 event.actorName||event.actorId||'FaivoPay staff',
                 event.actorRole
                  ?String(event.actorRole)
                    .replaceAll('_',' ')
                    .replace(/\b\w/g,c=>c.toUpperCase())
                  :''
                ].filter(Boolean).join(' · ')
               :event.actorId||event.actorType||'FaivoPay'}
            </small>
           </div>
          </div>
         )}
        </div>
       </div>
      }

      {canMoney&&
       <div className="paymentPlanLifecycleActions">

        {selectedPaymentPlan.status==='draft'&&
         <button
          className="primary full"
          disabled={planActivateBusy||planActionBusy}
          onClick={()=>activatePaymentPlan(selectedPaymentPlan)}
         >
          <CheckCircle2/>
          {planActivateBusy?'Activating…':'Activate payment plan'}
         </button>
        }

        {['draft','paused'].includes(selectedPaymentPlan.status)&&
         <button
          className="secondary full"
          disabled={planActionBusy||planActivateBusy}
          onClick={()=>openPaymentPlanAmend(selectedPaymentPlan)}
         >
          <Pencil/>
          {planActionBusy?'Working…':'Amend plan'}
         </button>
        }

        {['active','defaulted'].includes(selectedPaymentPlan.status)&&
         <button
          className="secondary full"
          disabled={planActionBusy}
          onClick={()=>pausePaymentPlan(selectedPaymentPlan)}
         >
          <Clock3/>
          {planActionBusy?'Working…':'Pause plan'}
         </button>
        }

        {selectedPaymentPlan.status==='paused'&&
         <button
          className="primary full"
          disabled={planActionBusy}
          onClick={()=>resumePaymentPlan(selectedPaymentPlan)}
         >
          <CheckCircle2/>
          {planActionBusy?'Working…':'Resume plan'}
         </button>
        }

        {['active','defaulted'].includes(selectedPaymentPlan.status)&&
         <button className="secondary full" disabled={planActionBusy} onClick={()=>recordManualExtraPlanPayment(selectedPaymentPlan)}>
          <Banknote/>
          {planActionBusy?'Working…':'Record extra payment'}
         </button>
        }

        {['active','paused','defaulted'].includes(selectedPaymentPlan.status)&&
         (
          isPaymentPlanFinalSettlement(selectedPaymentPlan)
           ?<button
             className="secondary full paymentPlanSettleButton"
             disabled
            >
             <CheckCircle2/>
             {`Final settlement · ${money(selectedPaymentPlan.remainingAmount)} due`}
            </button>
           :<button
             className="secondary full paymentPlanSettleButton"
             disabled={planActionBusy}
             onClick={()=>settlePaymentPlanEarly(selectedPaymentPlan)}
            >
             <CreditCard/>
             {planActionBusy
              ?'Working…'
              :`Settle early · ${money(selectedPaymentPlan.remainingAmount)}`}
            </button>
         )
        }

        {['draft','active','paused','defaulted'].includes(selectedPaymentPlan.status)&&
         <button
          className="paymentPlanCancelButton full"
          disabled={planActionBusy||planActivateBusy}
          onClick={()=>cancelPaymentPlan(selectedPaymentPlan)}
         >
          <X/>
          Cancel payment plan
         </button>
        }

       </div>
      }
     </aside>
    </div>
   }

{selectedTx&&<div className="drawerBack transactionDetailLayer" onClick={()=>setSelectedTx(null)}>
 <aside className="drawer txDrawer txDrawerV2" onClick={e=>e.stopPropagation()}>
  <button className="drawerClose" onClick={()=>setSelectedTx(null)}><X/></button>

  <div className="txDrawerHead txDrawerHeadV2">
   <div className={`txIcon large ${selectedTx.direction}`}><CreditCard/></div>
   <div>
    <span>{transactionKind(selectedTx)}</span>
    <h2>{selectedTx.direction==='out'?'-':'+'}{money(selectedTx.amount)}</h2>
    <div className="txDrawerBadges">
     <Pill tone={statusTone(selectedTx.status)}>{String(selectedTx.status||'').replaceAll('_',' ')}</Pill>
     <Pill tone={selectedTx.direction==='out'?'bad':'good'}>{selectedTx.direction==='out'?'Outgoing':'Incoming'}</Pill>
    </div>
    {selectedTx.type==='customer_payment'&&Number(selectedTx.refundedAmount||0)>0&&<small>{money(selectedTx.refundedAmount)} refunded separately</small>}
    {selectedTx.type==='customer_refund'&&<small>Refund issued to customer</small>}
   </div>
  </div>

  <section className="txDetailSection">
   <div className="txDetailSectionHead"><span>TRANSACTION</span><b>Core details</b></div>
   <div className="detailList txDetailList">
    {[
     ['FaivoPay ID',selectedTx.id],
     ['Created',dt(selectedTx.createdAt)],
     ['Completed',selectedTx.completedAt?dt(selectedTx.completedAt):'—'],
     ['Payment type',transactionKind(selectedTx)],
     ...(selectedTx.requestType?[['Request type',String(selectedTx.requestType).replaceAll('_',' ')]]:[])
    ].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}
   </div>
  </section>

  <section className="txDetailSection">
   <div className="txDetailSectionHead"><span>LINKED RECORDS</span><b>Driver, booking & plan</b></div>
   <div className="detailList txDetailList">
    {[
     ['Callsign',selectedTx.callsign||'—'],
     ['Driver',selectedTx.driverName||'—'],
     ['Booking',selectedTx.bookingId||'—'],
     ...(selectedTx.paymentPlanId?[['Payment plan',selectedTx.paymentPlanId]]:[]),
     ...(selectedTx.paymentPlanInstalmentId?[['Plan instalment',selectedTx.paymentPlanInstalmentId]]:[])
    ].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}
   </div>
  </section>

  {(selectedTx.fareAmount!=null||selectedTx.feeAmount!=null||selectedTx.originalAmount!=null||selectedTx.refundedAmount!=null)&&
   <section className="txDetailSection">
    <div className="txDetailSectionHead"><span>MONEY</span><b>Amount breakdown</b></div>
    <div className="detailList txDetailList">
     {[
      ...(selectedTx.type==='customer_payment'&&Number(selectedTx.refundedAmount||0)>0
       ?[['Originally received',money(selectedTx.originalAmount)],['Refunded separately',money(selectedTx.refundedAmount)]]
       :[]
      ),
      ...(selectedTx.type==='customer_refund'
       ?[
         ['Original customer payment',money(selectedTx.originalAmount)],
         ['Refund amount',money(selectedTx.amount)],
         ['Refund source',selectedTx.refundSource==='fleetpay'?'FaivoPay':selectedTx.refundSource==='stripe_external'?'Stripe dashboard / external':selectedTx.refundSource||'—'],
         ['Processed by',selectedTx.processedBy||'—']
        ]
       :[]
      ),
      ['Fare',selectedTx.fareAmount!=null?money(selectedTx.fareAmount):'—'],
      ['FaivoPay fee',selectedTx.feeAmount!=null?money(selectedTx.feeAmount):'—'],
      ...(selectedTx.originalFeeAmount!=null&&Number(selectedTx.originalFeeAmount)!==Number(selectedTx.feeAmount)
       ?[['Original FaivoPay fee',money(selectedTx.originalFeeAmount)]]
       :[]
      )
     ].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}
    </div>
   </section>
  }

  <section className="txDetailSection">
   <div className="txDetailSectionHead"><span>PROVIDER</span><b>Processing reference</b></div>
   <div className="detailList txDetailList">
    {[
     ['Provider',selectedTx.provider||'—'],
     ['Provider reference',selectedTx.providerRef||'—']
    ].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}
   </div>
  </section>

  <div className="secureFoot"><ShieldCheck/><span>Read-only audit view. Financial changes must use the controlled FaivoPay workflow and are recorded separately.</span></div>
 </aside>
</div>}
  {selected&&<div className="drawerBack" onClick={()=>setSelected(null)}>
   <aside className="drawer driverFinanceDrawer" onClick={e=>e.stopPropagation()}>
    <button className="drawerClose" onClick={()=>setSelected(null)}><X/></button>

    <div className="driverIdentity">
     <div className="avatar">{selected.forename?.[0]}{selected.surname?.[0]}</div>
     <div>
      <span>CALLSIGN {selected.callsign}</span>
      <h2>{selected.fullName}</h2>
      <p>Autocab Driver ID {selected.driverId}</p>
     </div>
    </div>

    <div className={`balanceHero ${(selected.currentBalance??0)<0?'red':''}`}>
     <span>Current balance</span>
     <strong>{money(selected.currentBalance)}</strong>
     <small>Previous {money(selected.previousBalance)}</small>
    </div>

    <div className="driverDrawerTabs">
     <button
      className={driverDrawerTab==='overview'?'active':''}
      onClick={()=>setDriverDrawerTab('overview')}
     >
      Overview
     </button>
     <button
      className={driverDrawerTab==='transactions'?'active':''}
      onClick={()=>setDriverDrawerTab('transactions')}
     >
      Transactions
      {driverTransactions.length>0&&<span>{driverTransactions.length}</span>}
     </button>
    </div>

    {driverDrawerTab==='overview'&&<>
     <div className="infoGrid">
      <div><Phone/><span>Mobile</span><b>{selected.mobile||'Not stored'}</b></div>
      <div><Mail/><span>Email</span><b>{selected.email||'Not stored'}</b></div>
      <div><Clock3/><span>Last processed</span><b>{dt(selected.lastProcessed)}</b></div>
      <div><Hash/><span>Processed by</span><b>{selected.lastProcessedBy||'—'}</b></div>
     </div>

     <div className="payoutAccountCard">
      <div className="payoutAccountHead">
       <div className="payoutAccountIcon"><Banknote/></div>
       <div><span>PAYOUT ACCOUNT</span><h3>Driver bank details</h3></div>
       <Pill tone={bankTone(selected.bankAccount)}>
        {selected.bankAccount?.label||'Bank details missing'}
       </Pill>
      </div>

      {selected.bankAccount?.ready
       ?<div className="payoutAccountDetails">
         <div><span>Account holder</span><b>{selected.bankAccount.accountHolder||'Saved securely'}</b></div>
         <div><span>Sort code</span><b>{selected.bankAccount.sortCodeMasked}</b></div>
         <div><span>Account number</span><b>{selected.bankAccount.accountNumberMasked}</b></div>
         <div><span>Added</span><b>{dt(selected.bankAccount.createdAt)}</b></div>
         <div><span>Last changed</span><b>{dt(selected.bankAccount.updatedAt)}</b></div>
        </div>
       :<div className="bankMissingNotice">
         <AlertTriangle/>
         <div>
          <b>No payout bank account</b>
          <span>This driver must add bank details in the FaivoPay app before a payout can be released.</span>
         </div>
        </div>
      }

      {selected.bankAccount?.changedRecently&&
       <div className="bankRecentNotice">
        <Clock3/>
        <div>
         <b>Bank details changed recently</b>
         <span>Changed {dt(selected.bankAccount.updatedAt)}. Confirm the driver expected this change if anything looks unusual.</span>
        </div>
       </div>
      }

      <small className="bankSecurityNote">
       <ShieldCheck/> FaivoPay only exposes masked account details to office users. Full bank details remain encrypted.
      </small>
     </div>

     <div className={`payoutControlCard ${selected.payoutExcluded?'excluded':''}`}>
      <div>
       <span>PAYOUT ELIGIBILITY</span>
       <h3>{selected.payoutExcluded?'Excluded from payouts':'Payouts enabled'}</h3>
       <p>
        {selected.payoutExcluded
         ?(selected.payoutExclusionReason||'This driver is permanently excluded from FaivoPay payouts.')
         :'This driver can be included in eligible FaivoPay payout runs.'}
       </p>
      </div>

      {canMoney&&<button
       className={selected.payoutExcluded?'secondary':'dangerAction'}
       onClick={()=>setDriverPayoutExclusion(selected)}
      >
       {selected.payoutExcluded?'Enable payouts':'Exclude from payouts'}
      </button>}
     </div>
    </>}

    {driverDrawerTab==='transactions'&&
     <div className="driverTransactionsPane">

      <div className="driverTxHead">
       <div>
        <span>FINANCIAL HISTORY</span>
        <h3>Driver transactions</h3>
        <p>Payments, payouts, fees and manual adjustments recorded by FaivoPay.</p>
       </div>
       <button
        className="mini"
        disabled={driverTransactionsLoading}
        onClick={()=>loadDriverTransactions(selected.driverId)}
       >
        <RefreshCw className={driverTransactionsLoading?'spin':''}/>
        Refresh
       </button>
      </div>

      <div className="driverTxFilters">
       {[
        ['all','All'],
        ['payments','Payments'],
        ['payouts','Payouts'],
        ['fees','Fees'],
        ['adjustments','Adjustments']
       ].map(([key,label])=>
        <button
         key={key}
         className={driverTxFilter===key?'active':''}
         onClick={()=>setDriverTxFilter(key)}
        >
         {label}
        </button>
       )}
      </div>

      {driverTransactionsLoading&&driverTransactions.length===0
       ?<div className="driverTxEmpty">
         <RefreshCw className="spin"/>
         <b>Loading financial history…</b>
        </div>
       :(()=>{
        const rows=driverTransactions.filter(x=>{
         if(driverTxFilter==='all')return true;
         if(driverTxFilter==='payments')
          return x.type==='driver_payment'||
                 x.type==='customer_payment'||
                 x.type==='customer_refund';
         if(driverTxFilter==='payouts')
          return x.type==='weekly_payout'||x.type==='early_payout';
         if(driverTxFilter==='fees')return x.type==='fee';
         if(driverTxFilter==='adjustments')return x.type==='manual_adjustment';
         return true;
        });

        return rows.length
         ?<div className="driverTxList">
           {rows.map(x=>
            <button
             type="button"
             className="driverTxRow"
             key={`${x.type}:${x.id}`}
             onClick={()=>setSelectedTx(x)}
            >
             <div className={`driverTxIcon ${x.direction==='out'?'out':'in'}`}>
              {x.direction==='out'?<ArrowUpRight/>:<ArrowDownLeft/>}
             </div>

             <div className="driverTxMain">
              <div>
               <b>{x.typeLabel}</b>
               <Pill tone={statusTone(x.status)}>{String(x.status||'recorded').replaceAll('_',' ')}</Pill>
              </div>
              <span>
               {dt(x.createdAt)}
               {x.bookingId?` · Booking ${x.bookingId}`:''}
              </span>
              <small>
               {x.bookingId
                ?`Booking ${x.bookingId}`
                :x.type==='driver_payment'
                ?'Driver payment'
                :x.type==='weekly_payout'
                ?'Weekly payout'
                :x.type==='early_payout'
                ?'Early payout'
                :x.type==='fee'
                ?'FaivoPay fee'
                :x.type==='manual_adjustment'
                ?'Manual adjustment'
                :'FaivoPay transaction'}
              </small>
             </div>

             <div className={`driverTxAmount ${x.direction==='out'?'out':''}`}>
              <b>
               {x.direction==='out'?'-':''}{money(x.amount||0)}
              </b>
              {Number(x.feeAmount||0)>0&&
               <small>Fee {money(x.feeAmount)}</small>
              }
             </div>
            </button>
           )}
          </div>
         :<div className="driverTxEmpty">
           <Banknote/>
           <b>No transactions found</b>
           <span>No records match this filter for this driver.</span>
          </div>;
       })()
      }

      <div className="driverTxFoot">
       <ShieldCheck/>
       <span>Financial history is read-only here. Money movements are made through controlled FaivoPay workflows.</span>
      </div>
     </div>
    }

   </aside>
  </div>}
 </div>
}

function CustomerPayPage(){
 const id=window.location.pathname.split('/').filter(Boolean)[1]||'';
 const[payment,setPayment]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stripeReady,setStripeReady]=useState(true);
 async function load(){try{const j=await call(`/api/public/customer-payments/${id}`);setPayment(j.payment);setStripeReady(j.stripeConfigured!==false);setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},4000);return()=>clearInterval(timer)},[id]);
 async function checkout(){setBusy(true);setError('');try{const j=await call(`/api/public/customer-payments/${id}/checkout`,{method:'POST'});window.location.assign(j.checkoutUrl)}catch(e){setError(e.message);setBusy(false)}}
 if(!payment&&!error)return <div className="publicPayPage"><div className="publicPayShell"><div className="publicPayLoading"><RefreshCw className="spin"/><span>Opening secure payment…</span></div></div></div>;
 if(error&&!payment)return <div className="publicPayPage"><div className="publicPayShell"><div className="publicPayBrand"><div className="publicPayLogo"><img src={faivopayMark} alt="" aria-hidden="true"/></div><b>FaivoPay</b></div><div className="publicPayError"><AlertTriangle/><h2>Payment link unavailable</h2><p>{error}</p></div></div></div>;
 const paid=payment.status==='paid';const cancelled=payment.status==='cancelled';
 return <div className="publicPayPage"><div className="publicPayShell">
  <header className="publicPayBrand"><div className="publicPayLogo"><img src={faivopayMark} alt="" aria-hidden="true"/></div><div><b>FaivoPay</b><span>Secure customer payment</span></div><ShieldCheck/></header>
  {paid?<section className="publicPayComplete"><CheckCircle2/><span>PAYMENT RECEIVED</span><h1>{money(payment.totalAmount)}</h1><p>Thank you. Your payment has been received securely.</p>{payment.bookingId&&<small>Reference {payment.bookingId}</small>}</section>:cancelled?<section className="publicPayComplete cancelled"><AlertTriangle/><span>PAYMENT LINK CANCELLED</span><h2>This link is no longer active</h2><p>Please contact the taxi company if you still need to make payment.</p></section>:<>
   <section className="publicPayTotal"><div><span>PAYMENT TOTAL</span><h1>{money(payment.totalAmount)}</h1><p>Review the journey and fee breakdown before continuing.</p></div><CreditCard/></section>
   <section className="publicPayBreakdown">
    <div><span>Business</span><b>{payment.taxiCompany}</b></div>{payment.bookingId&&<div><span>Reference</span><b>{payment.bookingId}</b></div>}
    {payment.customerName&&<div><span>Passenger</span><b>{payment.customerName}</b></div>}
    {(payment.pickup||payment.destination)&&<div className="publicJourney"><span>Journey</span><b>{payment.pickup||'Pickup'}{payment.destination?` → ${payment.destination}`:''}</b></div>}
    {payment.journeyAt&&<div><span>Date / time</span><b>{dt(payment.journeyAt)}</b></div>}
    <div className="publicPayDivider"/><div><span>Journey fare</span><b>{money(payment.fareAmount)}</b></div><div><span>Service fee</span><b>{money(payment.feeAmount)}</b></div><div className="publicPayGrandTotal"><span>Total to pay</span><b>{money(payment.totalAmount)}</b></div>
   </section>
   <div className="publicPayTrust"><ShieldCheck/><div><b>Secure checkout</b><span>Card details are entered on Stripe's secure checkout. FaivoPay does not store your card number.</span></div></div>
   {error&&<div className="inlineError"><AlertTriangle/>{error}</div>}
   <button className="publicPayButton" disabled={busy||!stripeReady} onClick={checkout}>{busy?'Opening secure checkout…':`Pay ${money(payment.totalAmount)}`}<ArrowRight/></button>
   <p className="publicPayConsent">By continuing you agree to the payment details above. The service fee is included in the total shown.</p>
  </>}
  <footer className="publicPayFooter">FaivoPay · Secure driver payments</footer>
 </div></div>;
}

function DriverApp(){
 const[token,setToken]=useState(localStorage.getItem('fleetpay_driver')||'');
 const[mode,setMode]=useState('login');
 const[step,setStep]=useState(1);
 const[challenge,setChallenge]=useState('');
 const[dev,setDev]=useState('');
 const[f,setF]=useState({callsign:'',email:'',mobileLast4:'',code:'',password:''});
 const[me,setMe]=useState(null);
 const[err,setErr]=useState('');
 const[notice,setNotice]=useState('');
 const[amt,setAmt]=useState('');
 const[pushReady,setPushReady]=useState(false);
 const[pushAvailable,setPushAvailable]=useState(false);
 const[paymentBusy,setPaymentBusy]=useState(false);
 const[customerFare,setCustomerFare]=useState('');
 const[customerBooking,setCustomerBooking]=useState('');
 const[customerPayment,setCustomerPayment]=useState(null);
 const[customerPaymentBusy,setCustomerPaymentBusy]=useState(false);
 const[driverTab,setDriverTab]=useState('home');
 const[theme,setTheme]=useState(()=>localStorage.getItem('fleetpay_theme')||((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'));
 const[textScale,setTextScale]=useState(()=>{const saved=Number(localStorage.getItem('fleetpay_text_scale'));return Number.isFinite(saved)&&saved>=0.9&&saved<=1.5?saved:1});
 const[showPassword,setShowPassword]=useState(false);
 const[bankEditing,setBankEditing]=useState(false);
 const[bankBusy,setBankBusy]=useState(false);
 const[bankForm,setBankForm]=useState({accountHolder:'',sortCode:'',accountNumber:'',password:''});
 const lastLoadAt=useRef(0);
 const loadingDriver=useRef(false);

 const api=(u,o={})=>call(u,o,token);

 async function saveBankAccount(e){
  e?.preventDefault();setErr('');setNotice('');
  const sortCode=bankForm.sortCode.replace(/\D/g,'');
  const accountNumber=bankForm.accountNumber.replace(/\D/g,'');
  if(!bankForm.accountHolder.trim()){setErr('Enter the account holder name.');return}
  if(sortCode.length!==6){setErr('Enter a 6-digit sort code.');return}
  if(accountNumber.length!==8){setErr('Enter an 8-digit account number.');return}
  if(!bankForm.password){setErr('Enter your FaivoPay password to confirm this change.');return}
  setBankBusy(true);
  try{
   await api('/api/driver/bank-account',{method:'PUT',body:JSON.stringify({accountHolder:bankForm.accountHolder.trim(),sortCode,accountNumber,password:bankForm.password})});
   setBankForm({accountHolder:'',sortCode:'',accountNumber:'',password:''});
   setBankEditing(false);
   setNotice('Payout bank account saved securely.');
   await load(true);
  }catch(x){setErr(x.message)}finally{setBankBusy(false)}
 }

 useEffect(()=>{localStorage.setItem('fleetpay_theme',theme);document.documentElement.style.colorScheme=theme},[theme]);
 useEffect(()=>{localStorage.setItem('fleetpay_text_scale',String(textScale))},[textScale]);

 useEffect(()=>{
  if(!Capacitor.isNativePlatform()) return;
  let listener;
  App.addListener('appUrlOpen',({url})=>{
   try{
    const parsed=new URL(url);
    const payment=parsed.hostname==='payment'?parsed.pathname.replace('/',''):parsed.searchParams.get('payment');
    if(payment==='success'){
     setPaymentBusy(false);
     setNotice('Payment received successfully.');
     setTimeout(()=>load(true),500);
    }
    if(payment==='cancelled'){
     setPaymentBusy(false);
     setNotice('Payment cancelled. Your amount due is still available to pay.');
     setTimeout(()=>load(true),500);
    }
   }catch{}
  }).then(handle=>{listener=handle});
  return()=>{listener?.remove()};
 },[token]);

 useEffect(()=>{
  if(!token) return;
  let appListener;
  const refreshIfStale=()=>{
   if(Date.now()-lastLoadAt.current<15000) return;
   load(false);
  };
  if(Capacitor.isNativePlatform()){
   App.addListener('appStateChange',({isActive})=>{if(isActive)refreshIfStale()}).then(handle=>{appListener=handle});
  }else{
   const onVisibility=()=>{if(document.visibilityState==='visible')refreshIfStale()};
   document.addEventListener('visibilitychange',onVisibility);
   return()=>document.removeEventListener('visibilitychange',onVisibility);
  }
  return()=>{appListener?.remove()};
 },[token]);

 useEffect(()=>{
  if(!token || !customerPayment) return;
  const timer=setInterval(()=>{
   const tag=document.activeElement?.tagName;
   if(['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
   load(true);
  },7000);
  return()=>clearInterval(timer);
 },[token,customerPayment?.id]);

 useEffect(()=>{
  if(!customerPayment || !me?.customerPayments?.length) return;
  const matched=me.customerPayments.find(x=>x.id===customerPayment.id);
  if(matched?.status==='paid'){
   setNotice(`Customer payment of ${money(matched.totalAmount)} received successfully.`);
   setCustomerPayment(null);
   setCustomerFare('');
   setCustomerBooking('');
  }
 },[customerPayment,me?.customerPayments]);

 async function load(force=false){
  if(!token||loadingDriver.current)return;
  if(!force&&me&&Date.now()-lastLoadAt.current<15000)return;
  loadingDriver.current=true;
  try{
   const next=await api('/api/driver/me');
   setMe(next);
   lastLoadAt.current=Date.now();
  }catch{
   localStorage.removeItem('fleetpay_driver');setToken('');setMe(null);
  }finally{loadingDriver.current=false}
 }

 async function checkPush(){
  if(!token||!('serviceWorker'in navigator)||!('PushManager'in window)){setPushAvailable(false);return}
  try{
   const cfg=await api('/api/driver/push-config');
   setPushAvailable(Boolean(cfg.enabled));
   if(!cfg.enabled)return;
   const reg=await navigator.serviceWorker.register('/fleetpay-sw.js');
   const sub=await reg.pushManager.getSubscription();
   setPushReady(Boolean(sub)&&Notification.permission==='granted');
  }catch{setPushAvailable(false)}
 }

 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const payment=params.get('payment');
  if(!Capacitor.isNativePlatform() && (payment==='success'||payment==='cancelled')){
   window.location.href=`fleetpay://payment/${payment}`;
   return;
  }
  if(token){
   load(true);
   checkPush();
   if(payment==='success'){
    setPaymentBusy(false);
    setNotice('Payment received successfully.');
    window.history.replaceState({},'',window.location.pathname);
    setTimeout(()=>load(true),900);
   }else if(payment==='cancelled'){
    setPaymentBusy(false);
    setNotice('Payment cancelled. Your amount due is still available to pay in FaivoPay.');
    window.history.replaceState({},'',window.location.pathname);
   }
  }
 },[token]);

 async function login(e){e.preventDefault();setErr('');try{const j=await call('/api/driver/login',{method:'POST',body:JSON.stringify({email:f.email,password:f.password})});localStorage.setItem('fleetpay_driver',j.token);setToken(j.token)}catch(x){setErr(x.message)}}
 async function startRegister(e){e.preventDefault();setErr('');try{const j=await call('/api/driver/register/start',{method:'POST',body:JSON.stringify(f)});setChallenge(j.challengeId);setDev(j.devCode||'');setStep(2)}catch(x){setErr(x.message)}}
 async function finishRegister(e){e.preventDefault();setErr('');try{const j=await call('/api/driver/register/complete',{method:'POST',body:JSON.stringify({challengeId:challenge,code:f.code,password:f.password})});if(j.pendingApproval)return setErr('Your account is verified and waiting for administrator approval.');localStorage.setItem('fleetpay_driver',j.token);setToken(j.token)}catch(x){setErr(x.message)}}
 async function startReset(e){e.preventDefault();setErr('');try{const j=await call('/api/driver/forgot-password/start',{method:'POST',body:JSON.stringify({email:f.email})});setChallenge(j.challengeId||'');setDev(j.devCode||'');setStep(2)}catch(x){setErr(x.message)}}
 async function finishReset(e){e.preventDefault();setErr('');try{await call('/api/driver/forgot-password/complete',{method:'POST',body:JSON.stringify({challengeId:challenge,code:f.code,password:f.password})});setMode('login');setStep(1);setErr('Password reset. You can now sign in.')}catch(x){setErr(x.message)}}
 async function payout(){setErr('');setNotice('');try{const j=await api('/api/driver/early-payout',{method:'POST',body:JSON.stringify({amount:Number(amt)})});setAmt('');setNotice(`Payout request received. ${j.message}`);await load()}catch(x){setErr(x.message)}}
 async function enablePush(){setErr('');try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Push notifications are not supported on this device/browser.');const cfg=await api('/api/driver/push-config');if(!cfg.enabled)throw new Error('Push notifications are not configured on the FaivoPay server.');const reg=await navigator.serviceWorker.register('/fleetpay-sw.js');const perm=await Notification.requestPermission();if(perm!=='granted')throw new Error('Notification permission was not granted.');let sub=await reg.pushManager.getSubscription();if(!sub){const padded=cfg.publicKey.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(cfg.publicKey.length/4)*4,'=');const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes})}await api('/api/driver/push-subscription',{method:'POST',body:JSON.stringify({subscription:sub})});setPushReady(true);setNotice('Push notifications are enabled.');await api('/api/driver/push-test',{method:'POST'})}catch(e){setErr(e.message)}}
 async function payRequest(request){setErr('');setPaymentBusy(true);try{const j=await api(`/api/driver/payment-requests/${request.id}/checkout`,{method:'POST'});window.location.assign(j.paymentUrl)}catch(e){setErr(e.message);setPaymentBusy(false)}}
 async function createExtraPlanPayment(plan,maxExtra){setErr('');setNotice('');if(currentExtraPlanPayment)return payRequest(currentExtraPlanPayment);const raw=prompt(`How much extra would you like to pay?\n\nMaximum extra payment: ${money(maxExtra)}\nYour current instalment remains due separately.`,'');if(raw===null)return;const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0){setErr('Enter a valid extra payment amount.');return}if(amount>maxExtra+0.00001){setErr(`Extra payment cannot exceed ${money(maxExtra)}.`);return}setPaymentBusy(true);try{const j=await api(`/api/driver/payment-plans/${plan.id}/extra-payment`,{method:'POST',body:JSON.stringify({amount})});await payRequest(j.paymentRequest)}catch(e){setErr(e.message);setPaymentBusy(false)}}

 async function createCustomerPayment(){
  setErr('');setNotice('');
  const amount=Number(customerFare);
  if(!Number.isFinite(amount)||amount<=0){setErr('Enter a valid fare amount.');return}
  setCustomerPaymentBusy(true);
  try{
   const j=await api('/api/driver/customer-payment',{method:'POST',body:JSON.stringify({amount,bookingId:customerBooking.trim()})});
   setCustomerPayment(j);
  }catch(e){setErr(e.message)}finally{setCustomerPaymentBusy(false)}
 }

 function logout(){
  localStorage.removeItem('fleetpay_driver');
  setToken('');setMe(null);setErr('');setNotice('');setAmt('');setMode('login');setStep(1);setChallenge('');setDev('');setPushReady(false);setPushAvailable(false);setPaymentBusy(false);setCustomerPayment(null);setCustomerFare('');setCustomerBooking('');setDriverTab('home');setBankEditing(false);setBankBusy(false);setBankForm({accountHolder:'',sortCode:'',accountNumber:'',password:''});
  setF({callsign:'',email:'',mobileLast4:'',code:'',password:''});
 }

 function changeTab(tab){
  setDriverTab(tab);
  setErr('');
  requestAnimationFrame(()=>document.querySelector('.driverApp')?.scrollTo({top:0,behavior:'smooth'}));
 }

 async function sharePayment(x){
  try{
   if(navigator.share){
    await navigator.share({title:'FaivoPay payment',text:`Taxi fare ${money(x.fareAmount)} · Total ${money(x.totalAmount)}`,url:x.paymentUrl});
   }else{
    await navigator.clipboard.writeText(x.paymentUrl);
    setNotice('Payment link copied.');
   }
  }catch{}
 }

 if(!token)return <div className={`driverAuthPage driverAuthV2 theme-${theme}`} style={{'--driver-text-scale':textScale}}>
  <button className="authThemeToggle" type="button" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="Change appearance">{theme==='dark'?<Sun/>:<Moon/>}</button>
  <div className="driverAuthShell">
   <div className="driverAuthBrand"><div className="authLogoMark branded"><img src={faivopayMark} alt="FaivoPay"/></div><div><b>FaivoPay</b><span>Driver Payments</span></div></div>
   <div className="driverAuthCard polishedAuthCard">
    <div className="authIntro"><span className="authKicker">SECURE DRIVER APP</span><h1>{mode==='forgot'?'Reset your password':mode==='register'?'Create your account':'Welcome back'}</h1><p>{mode==='login'?'Manage payments, balances and payouts without the clutter.':'Secure access is matched against your active Autocab driver record.'}</p></div>
    {err&&<div className={`inlineError ${err.startsWith('Password reset')?'success':''}`}>{err}</div>}
    {mode==='login'&&<form onSubmit={login} className="authForm">
      <label>Email address<div className="authField"><Mail/><input type="email" autoComplete="email" placeholder="you@example.com" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></label>
      <label>Password<div className="authField"><KeyRound/><input type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Your password" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/><button type="button" className="passwordToggle" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>
      <div className="authRow"><button className="textBtn" type="button" onClick={()=>{setMode('forgot');setStep(1);setErr('')}}>Forgot password?</button></div>
      <button className="primary full authPrimary">Sign in <ArrowRight/></button>
      <div className="authDivider"><span>New to FaivoPay?</span></div>
      <button className="authSecondary full" type="button" onClick={()=>{setMode('register');setStep(1);setErr('')}}>Create driver account</button>
     </form>}
    {mode==='register'&&(step===1?<form onSubmit={startRegister} className="authForm"><div className="secureBanner"><ShieldCheck/><span>We verify your callsign, Autocab email and last 4 mobile digits.</span></div><label>Callsign<div className="authField"><Hash/><input required value={f.callsign} onChange={e=>setF({...f,callsign:e.target.value})}/></div></label><label>Email stored in Autocab<div className="authField"><Mail/><input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></label><label>Last 4 digits of mobile<div className="authField"><Phone/><input inputMode="numeric" maxLength="4" required value={f.mobileLast4} onChange={e=>setF({...f,mobileLast4:e.target.value.replace(/\D/g,'')})}/></div></label><button className="primary full authPrimary">Verify my details <ArrowRight/></button><button className="textBtn centered" type="button" onClick={()=>setMode('login')}>Back to sign in</button></form>:<form onSubmit={finishRegister} className="authForm"><label>6-digit verification code<div className="authField"><ShieldCheck/><input inputMode="numeric" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'')})}/></div></label>{dev&&<div className="devCode">Development code: <b>{dev}</b></div>}<label>Create password<div className="authField"><KeyRound/><input type="password" minLength="8" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></div></label><button className="primary full authPrimary">Create secure account</button></form>)}
    {mode==='forgot'&&(step===1?<form onSubmit={startReset} className="authForm"><div className="secureBanner"><KeyRound/><span>Enter the email used for your FaivoPay driver account.</span></div><label>Email<div className="authField"><Mail/><input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></label><button className="primary full authPrimary">Send reset code <ArrowRight/></button><button className="textBtn centered" type="button" onClick={()=>setMode('login')}>Back to sign in</button></form>:<form onSubmit={finishReset} className="authForm"><label>Reset code<div className="authField"><ShieldCheck/><input inputMode="numeric" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'')})}/></div></label>{dev&&<div className="devCode">Development code: <b>{dev}</b></div>}<label>New password<div className="authField"><KeyRound/><input type="password" minLength="8" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></div></label><button className="primary full authPrimary">Set new password</button></form>)}
    <div className="authTrust"><ShieldCheck/><span>Protected connection · FaivoPay Driver</span></div>
   </div>
  </div>
 </div>;

 if(!me)return <div className={`driverAuthPage driverAuthV2 theme-${theme}`} style={{'--driver-text-scale':textScale}}><div className="driverAuthShell"><div className="driverAuthBrand"><div className="authLogoMark branded"><img src={faivopayMark} alt="FaivoPay"/></div><div><b>FaivoPay</b><span>Driver Payments</span></div></div><div className="driverAuthCard polishedAuthCard authLoading"><RefreshCw className="spin"/><b>Loading FaivoPay</b><span>Preparing your driver account…</span></div></div></div>;

 const d=me.driver;
 const balance=Number(d.currentBalance||0);
 const balanceState=balance>0?'positive':balance<0?'negative':'settled';
 const balanceDisplay=balance>0?`+${money(balance)}`:balance<0?`−${money(Math.abs(balance))}`:money(0);
 const balanceTitle=balance>0?'You are owed':balance<0?'You owe':'All settled';
 const balanceHint=balance>0?'Available for FaivoPay payout':balance<0?'Amount currently owed to FaivoPay':'Nothing to pay or receive right now';
 const bankAccount=me.bankAccount||{configured:false,status:'missing'};
 const paymentRequests=me.paymentRequests||[];
 const standardPaymentRequests=paymentRequests.filter(
  x=>!['payment_plan_instalment','payment_plan_extra'].includes(x.requestType)
 );
 const planPaymentRequests=paymentRequests.filter(
  x=>x.requestType==='payment_plan_instalment'
 );
 const extraPlanPaymentRequests=paymentRequests.filter(x=>x.requestType==='payment_plan_extra');
 const paymentPlans=me.paymentPlans||[];
 const activePaymentPlan=paymentPlans.find(
  x=>['active','paused','defaulted'].includes(x.status)
 )||null;
 const currentPlanPayment=activePaymentPlan
  ?planPaymentRequests.find(x=>x.paymentPlanId===activePaymentPlan.id)||null
  :null;
 const currentExtraPlanPayment=activePaymentPlan
  ?extraPlanPaymentRequests.find(x=>x.paymentPlanId===activePaymentPlan.id)||null
  :null;
 const totalDue=standardPaymentRequests.reduce(
  (sum,x)=>sum+Number(x.amount||0),
  0
 );
 const customerPayments=me.customerPayments||[];
 const paidCustomerPayments=customerPayments.filter(x=>x.status==='paid');
 const openCustomerPayments=customerPayments.filter(x=>x.status==='open');
 const feeType=me.settings?.customerPaymentFeeType||'fixed';
 const feeValue=Number(me.settings?.customerPaymentFeeValue||0);
 const fareValue=Number(customerFare||0);
 const feePreview=feeType==='percentage'?fareValue*(feeValue/100):feeValue;
 const customerTotal=fareValue+feePreview;
 const firstName=(d.fullName||'Driver').split(' ')[0];
 const hour=new Date().getHours();
 const greeting=hour<12?'Morning':hour<18?'Afternoon':'Evening';
 const isMonday=new Date().getDay()===1;
 const mondayPriority=isMonday&&standardPaymentRequests.length>0;
 const firstDue=standardPaymentRequests
  .map(x=>x.dueAt)
  .filter(Boolean)
  .sort()[0]||null;
 const dueWhen=firstDue?new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(firstDue)):'Tuesday 17:00';

 const navItems=[
  ['home',Home,'Home'],
  ['activity',Activity,'Activity'],
  ['pay',CreditCard,'Payments'],
  ['account',UserCheck,'Account']
 ];

 const PaymentDueCard=({hero=false})=>standardPaymentRequests.length>0?<section className={`driverCard paymentDueCard ${hero?'mondayDueHero':''}`}><div className="paymentDueHeader"><div><span className="eyebrow">{hero?'MONDAY SETTLEMENT':'PAYMENT DUE'}</span><h2>{money(totalDue)}</h2></div><Pill tone="warn">Outstanding</Pill></div>{hero?<><h3>Weekly payment requires attention</h3><p>Your Monday settlement is ready to pay. Please complete payment by <b>{dueWhen}</b> to avoid suspension.</p><div className="dueHeroMeta"><div><span>Amount due</span><b>{money(totalDue)}</b></div><div><span>Deadline</span><b>{dueWhen}</b></div></div></>:<p>Securely settle your FaivoPay balance.</p>}{standardPaymentRequests.map((r,i)=><div className="dueRequestRow" key={r.id}><div><b>{money(r.amount)}</b><span>{r.dueAt?`Due ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(r.dueAt))}`:dt(r.createdAt)}{standardPaymentRequests.length>1?` · Request ${i+1}`:''}</span></div><button className={`mini ${hero?'heroPayButton':'goodBtn'}`} disabled={paymentBusy||!me.stripeConfigured} onClick={()=>payRequest(r)}>{paymentBusy?'Opening…':'Pay now'}</button></div>)}{hero&&<button className="dueDetailsButton" type="button" onClick={()=>changeTab('pay')}>View payment details <ChevronRight/></button>}</section>:null;


 const PaymentPlanCard=({compact=false}={})=>{
  if(!activePaymentPlan)return null;

  const plan=activePaymentPlan;
  const total=Number(plan.planAmount||0);
  const paid=Number(plan.paidAmount||0);
  const remaining=Number(plan.remainingAmount||0);

  const progress=total>0
   ?Math.min(100,Math.round((paid/total)*100))
   :0;

  const paidCount=
   plan.instalments?.filter(x=>x.status==='paid').length||0;

  const nextInstalment=
   plan.instalments?.find(
    x=>['due','overdue','scheduled'].includes(x.status)
   )||null;

  const nextAmount=currentPlanPayment
   ?Number(currentPlanPayment.amount||0)
   :Number(nextInstalment?.amount||0);

  const nextDue=
   currentPlanPayment?.dueAt||
   plan.nextDueAt||
   nextInstalment?.dueAt||
   null;
  const currentInstalment=plan.instalments?.find(x=>['due','overdue'].includes(x.status))||null;
  const currentInstalmentRemaining=currentInstalment?Math.max(0,Number(currentInstalment.amount||0)-Number(currentInstalment.paid_amount??currentInstalment.paidAmount??0)):0;
  const maxExtraPayment=Math.max(0,Number((remaining-currentInstalmentRemaining).toFixed(2)));

  const planStatusLabel={
   active:'Active',
   paused:'Paused',
   defaulted:'Needs attention',
   completed:'Completed'
  }[plan.status]||plan.status;

  if(compact){
   return <section className="driverCard driverPlanCompact">
    <div className="driverPlanCompactTop">
     <div>
      <span className="eyebrow">PAYMENT PLAN</span>
      <h2>{money(remaining)} remaining</h2>
     </div>

     <Pill tone={plan.status==='defaulted'?'bad':'warn'}>
      {planStatusLabel}
     </Pill>
    </div>

    <div className="driverPlanProgress">
     <span style={{width:`${progress}%`}}/>
    </div>

    <div className="driverPlanCompactMeta">
     <span>{money(paid)} paid</span>
     <span>{paidCount}/{plan.instalments?.length||0} instalments</span>
    </div>

    {currentPlanPayment&&plan.status!=='paused'&&
     <div className="driverPlanNextCompact">
      <div>
       <span>Next payment</span>
       <b>{money(nextAmount)}</b>
      </div>

      <button
       className="mini goodBtn"
       disabled={paymentBusy||!me.stripeConfigured}
       onClick={()=>payRequest(currentPlanPayment)}
      >
       {paymentBusy?'Opening…':'Pay instalment'}
      </button>
     </div>
    }

    <button
     type="button"
     className="dueDetailsButton"
     onClick={()=>changeTab('pay')}
    >
     View payment plan <ChevronRight/>
    </button>
   </section>;
  }

  return <section className="driverCard driverPaymentPlanCard">

   <div className="driverPlanHeader">
    <div>
     <span className="eyebrow">PAYMENT PLAN</span>
     <h2>Your repayment plan</h2>
    </div>

    <Pill tone={
     plan.status==='defaulted'
      ?'bad'
      :plan.status==='completed'
       ?'good'
       :'warn'
    }>
     {planStatusLabel}
    </Pill>
   </div>

   <p className="driverPlanIntro">
    Your original FaivoPay balance is being repaid by agreed instalments.
   </p>

   <div className="driverPlanMoneyGrid">
    <div>
     <span>Original</span>
     <b>{money(plan.originalAmount)}</b>
    </div>

    <div>
     <span>Paid</span>
     <b className="pos">{money(paid)}</b>
    </div>

    <div>
     <span>Remaining</span>
     <b>{money(remaining)}</b>
    </div>
   </div>

   <div className="driverPlanProgressBlock">
    <div className="driverPlanProgressLabels">
     <span>Plan progress</span>
     <b>{progress}%</b>
    </div>

    <div className="driverPlanProgress large">
     <span style={{width:`${progress}%`}}/>
    </div>

    <small>
     {paidCount} of {plan.instalments?.length||0} instalments paid
    </small>
   </div>

   {plan.status==='paused'&&
    <div className="driverPlanNotice warning">
     <Clock3/>
     <div>
      <b>Payment plan paused</b>
      <span>Please contact the office if you need more information.</span>
     </div>
    </div>
   }

   {plan.status==='defaulted'&&
    <div className="driverPlanNotice danger">
     <AlertTriangle/>
     <div>
      <b>Payment plan needs attention</b>
      <span>Please contact the office about your repayment arrangement.</span>
     </div>
    </div>
   }

   {currentPlanPayment&&plan.status!=='paused'&&
    <div className="driverPlanNextPayment">
     <div className="driverPlanNextTop">
      <div>
       <span>NEXT PAYMENT</span>
       <strong>{money(nextAmount)}</strong>
      </div>

      <Pill tone="warn">Due</Pill>
     </div>

     <div className="driverPlanNextMeta">
      <span>Due date</span>
      <b>
       {nextDue
        ?new Intl.DateTimeFormat(
          'en-GB',
          {
           weekday:'short',
           day:'numeric',
           month:'short',
           year:'numeric'
          }
         ).format(new Date(nextDue))
        :'—'}
      </b>
     </div>

     <button
      className="primary full actionButton"
      disabled={paymentBusy||!me.stripeConfigured}
      onClick={()=>payRequest(currentPlanPayment)}
     >
      <CreditCard/>
      {paymentBusy
       ?'Opening secure payment…'
       :`Pay ${money(nextAmount)} instalment`}
     </button>
    </div>
   }

   {['active','defaulted'].includes(plan.status)&&maxExtraPayment>0&&
    <div className="driverPlanNotice"><Banknote/><div><b>Pay extra off your plan</b><span>An extra payment reduces future principal. Your current {money(currentInstalmentRemaining)} instalment stays due separately.</span></div><button className="mini goodBtn" disabled={paymentBusy||!me.stripeConfigured} onClick={()=>createExtraPlanPayment(plan,maxExtraPayment)}>{currentExtraPlanPayment?'Continue extra payment':'Make extra payment'}</button></div>
   }

   {!currentPlanPayment&&plan.status==='active'&&remaining>0&&
    <div className="driverPlanNotice">
     <CheckCircle2/>
     <div>
      <b>No instalment currently due</b>
      <span>Your next payment will appear here when it becomes payable.</span>
     </div>
    </div>
   }

   <div className="driverPlanSchedule">
    <div className="sectionHeader">
     <div>
      <span className="eyebrow">SCHEDULE</span>
      <h2>Instalments</h2>
     </div>
    </div>

    {plan.instalments?.map(x=>
     <div
      className={`driverPlanScheduleRow ${x.status}`}
      key={x.id}
     >
      <div className="driverPlanScheduleNo">
       {x.status==='paid'
        ?<CheckCircle2/>
        :x.instalmentNumber}
      </div>

      <div className="driverPlanScheduleMain">
       <b>{money(x.amount)}</b>
       <span>
        {x.dueAt
         ?new Intl.DateTimeFormat(
          'en-GB',
          {
           day:'numeric',
           month:'short',
           year:'numeric'
          }
         ).format(new Date(x.dueAt))
         :'—'}
       </span>
      </div>

      <Pill tone={
       x.status==='paid'
        ?'good'
        :x.status==='overdue'
         ?'bad'
         :'warn'
      }>
       {x.status==='scheduled'
        ?'Upcoming'
        :x.status}
      </Pill>
     </div>
    )}
   </div>

  </section>;
 };

 const CustomerPaymentForm=()=> <section className="driverCard modernPaymentCard"><div className="cardTop"><div><span className="eyebrow">TAKE PAYMENT</span><h2>Customer payment</h2></div><div className="iconBubble"><CreditCard/></div></div><p className="compactCopy">Enter the fare. FaivoPay adds the service fee automatically.</p><div className="formStack"><label>Fare<div className="moneyInput modernMoneyInput"><span>£</span><input type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="0.00" value={customerFare} onChange={e=>{setCustomerFare(e.target.value);setCustomerPayment(null)}}/></div></label><label>Booking ID <small>optional</small><input className="modernInput" type="text" placeholder="e.g. 12345678" value={customerBooking} onChange={e=>{setCustomerBooking(e.target.value);setCustomerPayment(null)}}/></label></div>{fareValue>0&&<div className="paymentBreakdown"><div><span>Fare</span><b>{money(fareValue)}</b></div><div><span>Service fee</span><b>{money(feePreview)}</b></div><div className="paymentTotal"><span>Customer pays</span><strong>{money(customerTotal)}</strong></div></div>}{!customerPayment&&<button className="primary full actionButton" disabled={customerPaymentBusy||!me.stripeConfigured||!(fareValue>0)} onClick={createCustomerPayment}>{customerPaymentBusy?'Creating…':'Create payment'}</button>}{customerPayment&&<div className="activePaymentSheet"><div className="activePaymentTop"><div><span>PAYMENT READY</span><strong>{money(customerPayment.totalAmount)}</strong>{customerPayment.bookingId&&<small>Booking {customerPayment.bookingId}</small>}</div><Pill tone="warn">Awaiting</Pill></div><div className="qrPanel"><QRCodeSVG value={customerPayment.paymentUrl} size={210} level="M" includeMargin/><b>Scan to pay</b><span>Secure Stripe checkout</span></div><div className="paymentActions"><button className="primary" type="button" onClick={()=>window.open(customerPayment.paymentUrl,'_blank')}>Open payment link</button><button className="outline" type="button" onClick={()=>sharePayment(customerPayment)}>Share link</button></div><button className="textBtn paymentCancel" type="button" onClick={()=>setCustomerPayment(null)}>Hide payment</button></div>}{!me.stripeConfigured&&<small className="paymentUnavailable">Customer card payments are not configured.</small>}</section>;

 const EarlyPayoutCard=()=> <section className="driverCard"><div className="cardTop"><div><span className="eyebrow">EARLY PAYOUT</span><h2>Request payout</h2></div><div className="iconBubble"><ArrowUpRight/></div></div><div className="availableRow"><span>Available now</span><strong>{money(me.availableForEarlyPayout)}</strong></div>{!bankAccount.configured&&<div className="bankRequiredNotice"><Banknote/><div><b>Bank account required</b><span>Add your payout bank account before requesting money.</span></div><button type="button" className="mini" onClick={()=>changeTab('account')}>Add account</button></div>}{me.reservedForEarlyPayout>0&&<div className="reservedLine"><span>Already reserved</span><b>{money(me.reservedForEarlyPayout)}</b></div>}{me.earlyPayoutAllowed&&<div className={`cutoffNotice ${me.earlyPayoutTiming?.afterCutoff?'afterCutoff':''}`}><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>}{bankAccount.configured&&me.earlyPayoutAllowed&&me.availableForEarlyPayout>me.settings.earlyPayoutFee?<><div className="moneyInput modernMoneyInput"><span>£</span><input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amt} onChange={e=>setAmt(e.target.value)}/></div>{amt&&Number(amt)>0&&<div className="compactPreview"><span>You receive</span><b>{money(Math.max(0,Number(amt)-me.settings.earlyPayoutFee))}</b><small>Includes {money(me.settings.earlyPayoutFee)} fee</small></div>}<button className="primary full actionButton" onClick={payout}>Request payout</button></>:!me.earlyPayoutAllowed?<div className="closed"><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>:null}</section>;

 const HomePage=()=> <div className="driverPageView driverHomeVNext">
  {activePaymentPlan
   ? PaymentPlanCard({compact:true})
   : standardPaymentRequests.length>0
    ? PaymentDueCard({hero:true})
    : <section className={`driverHeroBalance balanceState-${balanceState}`}>
      <div className="balanceMeaning"><span className="balanceMeaningLabel">{balanceTitle}</span><strong>{balanceDisplay}</strong><p>{balanceHint}</p></div>
      <button className="balanceRefresh" type="button" onClick={()=>load(true)} aria-label="Refresh balance"><RefreshCw/></button>
      <div className="balanceStateStrip"><span>{balance>0?'Money due to you':balance<0?'Money you need to pay':'Account clear'}</span><b>{balance>0?`${money(me.availableForEarlyPayout)} available now`:balance<0?'Will carry forward unless requested':'Up to date'}</b></div>
      <div className="heroBalanceActions"><button type="button" onClick={()=>changeTab('pay')}><CreditCard/>Take payment</button>{balance>0&&<button type="button" onClick={()=>changeTab('pay')}><ArrowUpRight/>Early payout</button>}</div>
      <div className="heroBalanceFoot"><span>Updated {dt(d.syncedAt)}</span><span>Callsign {d.callsign}</span></div>
     </section>}
  {paymentRequests.length===0&&!activePaymentPlan&&!bankAccount.configured&&<section className="driverCard bankSetupPrompt"><div className="bankSetupIcon"><Banknote/></div><div><span className="eyebrow">PAYOUT SETUP</span><h3>Add your bank account</h3><p>FaivoPay needs your bank details before we can send you a payout.</p></div><button type="button" className="primary" onClick={()=>changeTab('account')}>Set up</button></section>}
  <div className="homeSectionTitle"><span>AT A GLANCE</span></div>
  <div className="glanceGrid">
   <button className="glanceCard payments" onClick={()=>changeTab('pay')}><CreditCard/><span>Take payment</span><b>QR or secure link</b><small>{openCustomerPayments.length?`${openCustomerPayments.length} link${openCustomerPayments.length===1?'':'s'} open`:'Ready when you are'}</small></button>
   {paymentRequests.length===0&&!activePaymentPlan&&<button className="glanceCard payout" onClick={()=>changeTab('pay')}><ArrowUpRight/><span>Early payout</span><b>{money(me.availableForEarlyPayout)}</b><small>{me.earlyPayoutAllowed?'Available now':'Check payout window'}</small></button>}
   <button className="glanceCard activity" onClick={()=>changeTab('activity')}><Activity/><span>Activity</span><b>{paidCustomerPayments.length}</b><small>Customer payments received</small></button>
   <button className="glanceCard account" onClick={()=>changeTab('account')}><UserCheck/><span>Account</span><b>Callsign {d.callsign}</b><small>Profile, fees & alerts</small></button>
  </div>
  {pushAvailable&&!pushReady&&<section className="driverCard compactCard"><div className="compactAction"><div className="compactActionIcon"><Smartphone/></div><div><b>Turn on payment alerts</b><span>Get notified when money moves.</span></div><button className="mini" onClick={enablePush}>Enable</button></div></section>}
  {customerPayments.length>0&&<section className="driverCard latestActivityCard"><div className="sectionHeader"><div><span className="eyebrow">LATEST</span><h2>Recent payments</h2></div><button className="linkButton" onClick={()=>changeTab('activity')}>See all</button></div>{customerPayments.slice(0,3).map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><CreditCard/></div><div className="historyMain"><b>{money(x.totalAmount)}</b><span>{x.bookingId?`Booking ${x.bookingId}`:'Customer payment'} · {dt(x.createdAt)}</span></div><Pill tone={x.status==='paid'?'good':'warn'}>{x.status}</Pill></div>)}</section>}
  {me.notifications?.length>0&&<section className="driverCard latestActivityCard"><div className="sectionHeader"><div><span className="eyebrow">UPDATES</span><h2>Notifications</h2></div></div>{me.notifications.slice(0,2).map(n=><div className="cleanNotice" key={n.id}><div className="historyIcon"><Bell/></div><div><b>{n.title}</b><span>{n.message}</span><small>{dt(n.createdAt)}</small></div></div>)}</section>}
 </div>;

 const PayPage=()=> <div className="driverPageView">
  <div className="pageTitle">
   <span>PAYMENTS</span>
   <h1>Move money</h1>
   <p>{
    activePaymentPlan
     ?'View your payment plan, make the current instalment or take a passenger payment.'
     :standardPaymentRequests.length>0
      ?'Pay your outstanding FaivoPay balance or take a passenger payment.'
      :'Take passenger payments or request an early payout.'
   }</p>
  </div>

  {PaymentPlanCard()}
  {PaymentDueCard({})}
  {CustomerPaymentForm()}

  {standardPaymentRequests.length===0&&
   !activePaymentPlan&&
   EarlyPayoutCard()
  }
 </div>;

 const ActivityPage=()=> <div className="driverPageView"><div className="pageTitle"><span>ACTIVITY</span><h1>Your history</h1><p>Customer payments, FaivoPay fees and payout requests.</p></div><section className="activitySummary"><div><span>Customer payments</span><b>{paidCustomerPayments.length}</b></div><div><span>Open links</span><b>{openCustomerPayments.length}</b></div></section><section className="driverCard activityCard"><div className="sectionHeader"><div><span className="eyebrow">CUSTOMER PAYMENTS</span><h2>Payment history</h2></div></div>{customerPayments.length===0?<div className="emptyState">No customer payments yet.</div>:customerPayments.map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><CreditCard/></div><div className="historyMain"><b>{money(x.totalAmount)}</b><span>{money(x.fareAmount)} fare{Number(x.feeAmount)>0?` + ${money(x.feeAmount)} fee`:''}</span><small>{x.bookingId?`Booking ${x.bookingId} · `:''}{dt(x.createdAt)}</small>{x.status==='open'&&x.paymentUrl&&<div className="inlineActions"><button onClick={()=>window.open(x.paymentUrl,'_blank')}>Open</button><button onClick={()=>sharePayment(x)}>Share</button></div>}</div><Pill tone={x.status==='paid'?'good':'warn'}>{x.status}</Pill></div>)}</section><section className="driverCard activityCard"><div className="sectionHeader"><div><span className="eyebrow">FAIVOPAY</span><h2>Payments & fees</h2></div></div>{me.ledger?.length===0?<div className="emptyState">No account activity recorded yet.</div>:me.ledger?.slice(0,20).map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><WalletCards/></div><div className="historyMain"><b>{x.description}</b><span>{dt(x.createdAt)}{x.feeAmount>0?` · Fee ${money(x.feeAmount)}`:''}</span></div><div className={`historyAmount ${x.direction==='credit'?'pos':'neg'}`}><b>{x.direction==='credit'?'+':'-'}{money(x.amount)}</b><small>{x.status}</small></div></div>)}</section>{me.earlyPayoutRequests?.length>0&&<section className="driverCard activityCard"><div className="sectionHeader"><div><span className="eyebrow">PAYOUTS</span><h2>Request history</h2></div></div>{me.earlyPayoutRequests.slice(0,15).map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><ArrowUpRight/></div><div className="historyMain"><b>{money(x.netAmount)}</b><span>{dt(x.createdAt)}{x.declineReason?` · ${x.declineReason}`:''}</span></div><Pill tone={x.status==='approved'||x.status==='paid'?'good':x.status==='declined'?'warn':'neutral'}>{x.status}</Pill></div>)}</section>}</div>;

 const BankAccountCard=()=> <section className={`driverCard bankAccountCard ${bankAccount.configured?'configured':'missing'}`}>
  <div className="sectionHeader bankSectionHeader"><div><span className="eyebrow">PAYOUT BANK ACCOUNT</span><h2>{bankAccount.configured?'Bank account saved':'Add payout account'}</h2></div><div className="iconBubble"><Banknote/></div></div>
  {!bankEditing&&bankAccount.configured&&<><div className="savedBankSummary"><div className="bankLogoTile"><Banknote/></div><div><span>Account ending</span><b>{bankAccount.accountNumberMasked}</b><small>Sort code {bankAccount.sortCodeMasked}</small></div><Pill tone="good">Saved</Pill></div><div className="bankSecurityNote"><ShieldCheck/><span>Full bank details are encrypted and are never shown again in the app.</span></div><button type="button" className="outline full bankChangeButton" onClick={()=>{setBankEditing(true);setErr('')}}>Change bank account</button></>}
  {!bankEditing&&!bankAccount.configured&&<><p className="compactCopy">Add the UK bank account where you want FaivoPay payouts sent.</p><div className="bankSecurityNote"><ShieldCheck/><span>Your account number and sort code are encrypted. We only display masked details after saving.</span></div><button type="button" className="primary full actionButton" onClick={()=>{setBankEditing(true);setErr('')}}>Add bank account</button></>}
  {bankEditing&&<form className="bankEditForm" onSubmit={saveBankAccount}><div className="bankWarning"><AlertTriangle/><span>{bankAccount.configured?'Changing these details changes where all future FaivoPay payouts will be sent.':'Check these details carefully. Future FaivoPay payouts will be sent to this account.'}</span></div><label>Account holder name<input className="modernInput" autoComplete="name" placeholder="Name on the bank account" required value={bankForm.accountHolder} onChange={e=>setBankForm({...bankForm,accountHolder:e.target.value})}/></label><div className="bankFieldGrid"><label>Sort code<input className="modernInput" inputMode="numeric" autoComplete="off" placeholder="12-34-56" maxLength="8" required value={bankForm.sortCode} onChange={e=>{const n=e.target.value.replace(/\D/g,'').slice(0,6);setBankForm({...bankForm,sortCode:n.replace(/(\d{2})(?=\d)/g,'$1-')})}}/></label><label>Account number<input className="modernInput" inputMode="numeric" autoComplete="off" placeholder="12345678" maxLength="8" required value={bankForm.accountNumber} onChange={e=>setBankForm({...bankForm,accountNumber:e.target.value.replace(/\D/g,'').slice(0,8)})}/></label></div><label>Confirm with FaivoPay password<div className="authField inlinePasswordField"><KeyRound/><input type="password" autoComplete="current-password" required placeholder="Your FaivoPay password" value={bankForm.password} onChange={e=>setBankForm({...bankForm,password:e.target.value})}/></div></label><div className="bankFormActions"><button type="button" className="outline" onClick={()=>{setBankEditing(false);setBankForm({accountHolder:'',sortCode:'',accountNumber:'',password:''})}}>Cancel</button><button type="submit" className="primary" disabled={bankBusy}>{bankBusy?'Saving…':bankAccount.configured?'Save new account':'Save bank account'}</button></div></form>}
  {bankAccount.configured&&<small className="bankUpdated">Last changed {dt(bankAccount.updatedAt)}</small>}
 </section>;

 const AccountPage=()=> <div className="driverPageView"><div className="pageTitle"><span>ACCOUNT</span><h1>{d.fullName}</h1><p>Callsign {d.callsign}</p></div><section className="driverCard profileCard"><div className="profileHero"><div className="profileAvatar">{firstName[0]}{(d.surname||'')[0]||''}</div><div><b>{d.fullName}</b><span>Driver · Callsign {d.callsign}</span></div></div><div className="profileRows"><div><span>Email</span><b>{d.email||f.email||'Not available'}</b></div><div><span>Mobile</span><b>{d.mobile||'Not available'}</b></div><div><span>Last FaivoPay sync</span><b>{dt(d.syncedAt)}</b></div></div></section>{BankAccountCard()}<section className="driverCard"><div className="sectionHeader"><div><span className="eyebrow">FEES</span><h2>Your FaivoPay fees</h2></div></div><div className="feeRows"><div><span>Weekly app fee</span><b>{money(me.settings.weeklyAppFee)}</b></div><div><span>Early payout fee</span><b>{money(me.settings.earlyPayoutFee)}</b></div><div><span>Customer service fee</span><b>{feeType==='percentage'?`${feeValue}%`:money(feeValue)}</b></div></div></section>{pushAvailable&&<section className="driverCard"><div className="compactAction"><div className="compactActionIcon"><Smartphone/></div><div><b>Payment alerts</b><span>{pushReady?'Notifications are enabled.':'Get updates about payments and payouts.'}</span></div>{!pushReady&&<button className="mini" onClick={enablePush}>Enable</button>}{pushReady&&<Pill tone="good">On</Pill>}</div></section>}<section className="driverCard appearanceCard"><div className="sectionHeader"><div><span className="eyebrow">APPEARANCE</span><h2>Display</h2></div></div><div className="themeOptions"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/><span><b>Light</b><small>Bright and clean</small></span></button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/><span><b>Dark</b><small>Low-light friendly</small></span></button></div><div className="textSizeControl"><div className="textSizeHead"><div><b>Text size</b><span>Adjusts app text without changing the layout.</span></div><strong>{Math.round(textScale*100)}%</strong></div><div className="textSizeSliderRow"><span className="textSizeSmall">A</span><input aria-label="Text size" type="range" min="0.9" max="1.5" step="0.05" value={textScale} onChange={e=>setTextScale(Number(e.target.value))}/><span className="textSizeLarge">A</span></div><div className="textSizePresets" aria-label="Text size presets"><button type="button" className={textScale===0.9?'active':''} onClick={()=>setTextScale(0.9)}>Small</button><button type="button" className={textScale===1?'active':''} onClick={()=>setTextScale(1)}>Standard</button><button type="button" className={textScale===1.2?'active':''} onClick={()=>setTextScale(1.2)}>Large</button><button type="button" className={textScale===1.35?'active':''} onClick={()=>setTextScale(1.35)}>Extra Large</button><button type="button" className={textScale===1.5?'active':''} onClick={()=>setTextScale(1.5)}>Accessibility</button></div><button type="button" className="textSizeReset" onClick={()=>setTextScale(1)}>Reset to standard</button></div></section><button className="accountSignOut" onClick={logout}><LogOut/>Sign out</button><div className="driverFooter">FaivoPay · Secure driver payments</div></div>;

 return <div className={`driverApp modernDriverApp driverVNext theme-${theme}`} style={{'--driver-text-scale':textScale}}><header className="driverHeader modernDriverHeader driverVNextHeader"><div className="driverBrandMark"><img src={faivopayMark} alt=""/></div><div className="driverIdentity"><div className="driverAvatar">{firstName[0]}{(d.surname||'')[0]||''}</div><div><span>FAIVOPAY · {d.callsign}</span><b>{driverTab==='home'?`${greeting}, ${firstName}`:driverTab==='activity'?'Activity':driverTab==='pay'?'Payments':'Account'}</b></div></div><div className="driverHeaderActions"><button className="headerRefresh" type="button" onClick={()=>load(true)} aria-label="Refresh"><RefreshCw/></button><button className="headerBell" type="button" onClick={()=>changeTab('activity')} aria-label="Notifications"><Bell/>{me.notifications?.length>0&&<i/>}</button></div></header><main className="modernDriverMain">{notice&&<div className="driverNotice floatingNotice"><CheckCircle2/><span>{notice}</span><button onClick={()=>setNotice('')}><X/></button></div>}{err&&<div className="inlineError driverGlobalError"><AlertTriangle/>{err}</div>}{driverTab==='home'&&HomePage()}{driverTab==='pay'&&PayPage()}{driverTab==='activity'&&ActivityPage()}{driverTab==='account'&&AccountPage()}</main><nav className="driverBottomNav" aria-label="Driver navigation">{navItems.map(([key,Icon,label])=><button key={key} className={driverTab===key?'active':''} onClick={()=>changeTab(key)}><Icon/><span>{label}</span>{key==='pay'&&(openCustomerPayments.length+paymentRequests.length)>0&&<i>{openCustomerPayments.length+paymentRequests.length}</i>}</button>)}</nav></div>;
}


const isNativeApp = Capacitor.isNativePlatform();
const isPayPage = !isNativeApp && window.location.pathname.startsWith('/pay/');
const isDriver = isNativeApp || window.location.pathname.startsWith('/driver');

createRoot(document.getElementById('root')).render(
  isPayPage ? <CustomerPayPage /> : isDriver ? <DriverApp /> : <AdminApp />
);
