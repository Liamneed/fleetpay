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

function LiveTestLab({
 liveTest,
 liveTestEvents,
 liveTestSnapshot,
 liveTestSimulation,
 loadLiveTest,
 addDriver,
 toggleDriver,
 toggleLiveWrites,
 snapshotDriver,
 snapshotBusyDriver,
 simulateMonday,
 simulationBusyDriver,
 liveTestWritePreview,
 previewAutocabWrite,
 writePreviewBusyDriver,
 writePreviewBalance,
 setWritePreviewBalance,
 liveCreditPreview,
 prepareLiveCredit,
 executeLiveCredit,
 liveCreditBusy,
 liveCreditResult,
 liveReversalPreview,
 prepareLiveReversal,
 executeLiveReversal,
 liveReversalBusy,
 liveReversalResult,
 busy
}){
 const[search,setSearch]=useState('');
 const[selectedDriverId,setSelectedDriverId]=useState('');

 const candidates=liveTest?.candidates||[];
 const allowList=liveTest?.allowList||[];
 const events=liveTestEvents||[];

 const armedLiveTestDriver=allowList.find(
  x=>
   String(x.driverId)==='1112' &&
   String(x.callsign)==='9997' &&
   x.enabled &&
   x.liveWriteEnabled
 )||null;

 const completedCreditEvent=events.find(
  x=>
   x.action==='live_credit_completed' &&
   x.status==='completed' &&
   String(x.driverId)==='1112'
 )||null;

 const completedReversalEvent=events.find(
  x=>
   x.action==='live_reversal_completed' &&
   x.status==='completed' &&
   String(x.driverId)==='1112'
 )||null;

 const visibleEvents=events
  .filter(x=>[
   'live_account_snapshot_completed',
   'live_account_snapshot_failed',
   'monday_simulation_completed',
   'monday_simulation_failed',
   'autocab_write_preview_completed',
   'live_writes_enabled',
   'live_writes_disabled',
   'live_credit_preview_completed',
   'live_credit_requested',
   'live_credit_completed',
   'live_credit_completed_unverified',
   'live_credit_failed',
   'live_credit_verification_failed',
   'live_reversal_preview_completed',
   'live_reversal_requested',
   'live_reversal_completed',
   'live_reversal_completed_unverified',
   'live_reversal_failed',
   'live_reversal_verification_failed'
  ].includes(x.action))
  .slice(0,25);

 const filteredCandidates=useMemo(()=>{
  const term=String(search||'').trim().toLowerCase();

  return candidates
   .filter(x=>!x.allowListed)
   .filter(x=>{
    if(!term)return true;
    return [
     x.callsign,
     x.driverName,
     x.driverId
    ].some(v=>String(v||'').toLowerCase().includes(term));
   })
   .slice(0,80);
 },[candidates,search]);

 const selectedCandidate=candidates.find(
  x=>String(x.driverId)===String(selectedDriverId)
 );

 async function submit(e){
  e.preventDefault();

  if(!selectedDriverId)return;

  await addDriver(selectedDriverId);
  setSelectedDriverId('');
  setSearch('');
 }

 return <>
  <section className={`liveTestSafetyBanner ${armedLiveTestDriver?'armed':''}`}>
   {armedLiveTestDriver?<AlertTriangle/>:<ShieldCheck/>}
   <div>
    <b>
     {armedLiveTestDriver
      ?'LIVE AUTOCAB WRITE GATE ARMED — TEST DRIVER 9997 ONLY'
      :'LIVE WRITES DISABLED'}
    </b>
    <span>
     {armedLiveTestDriver
      ?'A controlled £1 Autocab test write can now be prepared for driver 9997 / ID 1112. No transaction is sent until the separate execution step is explicitly confirmed.'
      :'Live Autocab reads, simulations and previews are available. No Autocab balance can be changed until the designated test driver is deliberately armed.'}
    </span>
   </div>
   <Pill tone={armedLiveTestDriver?'bad':'good'}>
    {armedLiveTestDriver?'ARMED':'READ ONLY'}
   </Pill>
  </section>

  <section className="officePageIntro liveTestIntro">
   <div>
    <span>CONTROLLED LIVE-DATA TESTING</span>
    <h2>Live Data Test Lab</h2>
    <p>
     Use real Autocab driver records inside a tightly restricted
     test allow-list. Enabled test drivers can be checked against
     fresh read-only Autocab account data without changing live systems.
    </p>
   </div>

   <button
    className="secondary"
    onClick={loadLiveTest}
    disabled={busy}
   >
    <RefreshCw className={busy?'spin':''}/>
    Refresh
   </button>
  </section>

  {!liveTest
   ?<section className="emptyState">
     <Database/>
     <h3>Load Live Data Test Lab</h3>
     <p>
      Load the current test-driver allow-list and cached Autocab driver
      records. No Autocab request is triggered by opening this page.
     </p>
     <button
      className="primary"
      onClick={loadLiveTest}
      disabled={busy}
     >
      <ShieldCheck/>
      {busy?'Loading…':'Load test controls'}
     </button>
    </section>

   :<div className="liveTestStack">

     <section className="liveTestSummaryGrid">
      <div>
       <span>Company</span>
       <b>{liveTest.company?.name||'—'}</b>
       <small>{liveTest.company?.id||'No company selected'}</small>
      </div>

      <div>
       <span>Mode</span>
       <b>Simulation</b>
       <small>Real driver data · no live mutations</small>
      </div>

      <div>
       <span>Enabled test drivers</span>
       <b>{allowList.filter(x=>x.enabled).length}</b>
       <small>{allowList.length} total allow-list record{allowList.length===1?'':'s'}</small>
      </div>

      <div>
       <span>Live writes</span>
       <b className="liveTestSafeText">Disabled</b>
       <small>Server-enforced · Phase 2A read-only</small>
      </div>
     </section>

     <section className="panel liveTestAddPanel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">TEST DRIVER ALLOW-LIST</span>
        <h3>Add a controlled test driver</h3>
        <p>
         Search the existing FaivoPay Autocab cache. Adding a driver
         only places that driver on the test allow-list.
        </p>
       </div>
       <Pill tone="good">Live writes off</Pill>
      </div>

      <form className="liveTestPicker" onSubmit={submit}>
       <div className="searchBox">
        <Search/>
        <input
         value={search}
         onChange={e=>setSearch(e.target.value)}
         placeholder="Search callsign, driver name or Autocab driver ID…"
        />
       </div>

       <select
        value={selectedDriverId}
        onChange={e=>setSelectedDriverId(e.target.value)}
       >
        <option value="">
         {filteredCandidates.length
          ?'Select test driver…'
          :'No matching drivers'}
        </option>

        {filteredCandidates.map(x=>
         <option key={x.driverId} value={x.driverId}>
          {x.callsign} · {x.driverName||`Driver ${x.driverId}`} · ID {x.driverId}
         </option>
        )}
       </select>

       <button
        className="primary"
        disabled={!selectedDriverId||busy}
       >
        <ShieldCheck/>
        {busy?'Saving…':'Add to test allow-list'}
       </button>
      </form>

      {selectedCandidate&&
       <div className="liveTestCandidatePreview">
        <div>
         <span className="callsign">{selectedCandidate.callsign}</span>
         <div>
          <b>{selectedCandidate.driverName||`Driver ${selectedCandidate.driverId}`}</b>
          <small>Autocab driver ID {selectedCandidate.driverId}</small>
         </div>
        </div>

        <div>
         <span>Previous balance</span>
         <b>{money(selectedCandidate.previousBalance)}</b>
        </div>

        <div>
         <span>Current balance</span>
         <b>{money(selectedCandidate.currentBalance)}</b>
        </div>

        <div>
         <span>Cache synced</span>
         <b>{dt(selectedCandidate.syncedAt)}</b>
        </div>
       </div>
      }
     </section>

     <section className="panel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">CONTROLLED DRIVERS</span>
        <h3>Live Test Lab allow-list</h3>
        <p>
         Disabled drivers remain in the history but cannot participate
         in test actions.
        </p>
       </div>
      </div>

      {allowList.length
       ?<div className="tableWrap proTable">
         <table>
          <thead>
           <tr>
            <th>Driver</th>
            <th>Cached balance</th>
            <th>Cache status</th>
            <th>Test access</th>
            <th>Live writes</th>
            <th>Added</th>
            <th>Action</th>
           </tr>
          </thead>

          <tbody>
           {allowList.map(x=>
            <tr key={`${x.companyId}-${x.driverId}`}>
             <td>
              <div className="driverCell">
               <span className="callsign">{x.callsign||'—'}</span>
               <div>
                <b>{x.driverName||`Driver ${x.driverId}`}</b>
                <small>Autocab ID {x.driverId}</small>
               </div>
              </div>
             </td>

             <td>
              <div className="liveTestBalanceCell">
               <span>Previous {money(x.cached?.previousBalance)}</span>
               <b>Current {money(x.cached?.currentBalance)}</b>
              </div>
             </td>

             <td>
              {x.cached
               ?<>
                 <Pill tone={x.cached.suspended?'warn':x.cached.active?'good':'neutral'}>
                  {x.cached.suspended?'Suspended':x.cached.active?'Active':'Inactive'}
                 </Pill>
                 <small>{dt(x.cached.syncedAt)}</small>
                </>
               :<Pill tone="warn">Not in cache</Pill>
              }
             </td>

             <td>
              <Pill tone={x.enabled?'good':'neutral'}>
               {x.enabled?'Enabled':'Disabled'}
              </Pill>
             </td>

             <td>
              <Pill tone={x.liveWriteEnabled?'bad':'good'}>
               {x.liveWriteEnabled?'ENABLED':'Disabled'}
              </Pill>
             </td>

             <td>
              <div className="liveTestAddedCell">
               <span>{dt(x.addedAt)}</span>
               <small>{x.addedBy||'Administrator'}</small>
              </div>
             </td>

             <td>
              <div className="compactActions liveTestActions">
               <button
                className="mini success"
                disabled={
                 busy||
                 !x.enabled||
                 x.liveWriteEnabled||
                 snapshotBusyDriver===String(x.driverId)
                }
                onClick={()=>snapshotDriver(x)}
               >
                <RefreshCw
                 className={
                  snapshotBusyDriver===String(x.driverId)
                   ?'spin'
                   :''
                 }
                />
                {snapshotBusyDriver===String(x.driverId)
                 ?'Reading…'
                 :'Live snapshot'}
               </button>

               <button
                className="mini"
                disabled={
                 busy||
                 !x.enabled||
                 x.liveWriteEnabled||
                 snapshotBusyDriver===String(x.driverId)||
                 simulationBusyDriver===String(x.driverId)
                }
                onClick={()=>simulateMonday(x)}
               >
                <CalendarDays
                 className={
                  simulationBusyDriver===String(x.driverId)
                   ?'spin'
                   :''
                 }
                />
                {simulationBusyDriver===String(x.driverId)
                 ?'Calculating…'
                 :'Simulate Monday'}
               </button>

               <button
                className="mini"
                disabled={
                 busy||
                 !x.enabled||
                 x.liveWriteEnabled||
                 snapshotBusyDriver===String(x.driverId)||
                 simulationBusyDriver===String(x.driverId)||
                 writePreviewBusyDriver===String(x.driverId)
                }
                onClick={()=>previewAutocabWrite(x)}
               >
                <Search/>
                {writePreviewBusyDriver===String(x.driverId)
                 ?'Previewing…'
                 :'Autocab preview'}
               </button>

               {String(x.driverId)==='1112'&&
                String(x.callsign)==='9997'&&
                x.liveWriteEnabled&&
                !completedCreditEvent&&
                <button
                 className="mini danger"
                 disabled={
                  busy||
                  liveCreditBusy===String(x.driverId)
                 }
                 onClick={()=>prepareLiveCredit(x)}
                >
                 <AlertTriangle/>
                 {liveCreditBusy===String(x.driverId)
                  ?'Preparing…'
                  :'Prepare £1 credit test'}
                </button>
               }

               {String(x.driverId)==='1112'&&
                String(x.callsign)==='9997'&&
                x.liveWriteEnabled&&
                completedCreditEvent&&
                !completedReversalEvent&&
                <button
                 className="mini danger"
                 disabled={
                  busy||
                  liveReversalBusy===String(x.driverId)
                 }
                 onClick={()=>prepareLiveReversal(x)}
                >
                 <AlertTriangle/>
                 {liveReversalBusy===String(x.driverId)
                  ?'Preparing…'
                  :'Prepare £1 reversal'}
                </button>
               }

               <button
                className={`mini ${x.liveWriteEnabled?'danger':'warn'}`}
                disabled={
                 busy||
                 !x.enabled||
                 String(x.driverId)!=='1112'||
                 String(x.callsign)!=='9997'
                }
                onClick={()=>toggleLiveWrites(x,!x.liveWriteEnabled)}
               >
                {x.liveWriteEnabled
                 ?'Disable live writes'
                 :'Enable live writes'}
               </button>

               <button
                className={`mini ${x.enabled?'danger':'success'}`}
                disabled={
                 busy||
                 snapshotBusyDriver===String(x.driverId)
                }
                onClick={()=>toggleDriver(x,!x.enabled)}
               >
                {x.enabled?'Disable':'Enable'}
               </button>
              </div>
             </td>
            </tr>
           )}
          </tbody>
         </table>
        </div>

       :<div className="emptyState compact">
         <ShieldCheck/>
         <h3>No test drivers selected</h3>
         <p>
          Add only drivers that are intentionally approved for controlled
          testing.
         </p>
        </div>
      }
     </section>

     {(liveCreditPreview||liveCreditResult)&&
      <section className="panel liveTestCreditPanel">
       <div className="panelHead">
        <div>
         <span className="sectionKicker">
          CONTROLLED LIVE AUTOCAB TEST
         </span>
         <h3>£1 credit · Callsign 9997</h3>
         <p>
          Fixed test transaction for Autocab driver ID 1112.
          Driver, amount and direction cannot be edited.
         </p>
        </div>

        <Pill tone={liveCreditResult?'good':'warn'}>
         {liveCreditResult?'Completed':'Awaiting execution'}
        </Pill>
       </div>

       {liveCreditPreview&&!liveCreditResult&&<>
        <div className="liveTestCreditWarning">
         <AlertTriangle/>
         <div>
          <b>REAL AUTOCAB WRITE — REVIEW BEFORE EXECUTING</b>
          <span>
           The preview itself is read-only. The execution button below
           will send one £1.00 credit to Autocab if the live balance
           still matches this preview.
          </span>
         </div>
        </div>

        <div className="liveTestCreditFacts">
         <div>
          <span>Driver</span>
          <b>
           {liveCreditPreview.driver?.callsign||'9997'}
           {' / '}
           {liveCreditPreview.driver?.driverId||'1112'}
          </b>
         </div>

         <div>
          <span>Direction</span>
          <b>CREDIT</b>
         </div>

         <div>
          <span>Amount</span>
          <b>{money(liveCreditPreview.proposed?.payload?.amount||1)}</b>
         </div>

         <div>
          <span>Current balance before</span>
          <b>{money(liveCreditPreview.before?.currentBalance)}</b>
         </div>

         <div>
          <span>Expected balance after</span>
          <b>
           {money(
            liveCreditPreview.proposed?.expectedCurrentBalanceAfter
           )}
          </b>
         </div>

         <div>
          <span>Preview expires</span>
          <b>{dt(liveCreditPreview.expiresAt)}</b>
         </div>
        </div>

        <div className="liveTestCreditPayload">
         <div>
          <span>Description sent to Autocab</span>
          <b>
           {liveCreditPreview.proposed?.payload?.description||
            'FaivoPay Live Test Credit'}
          </b>
         </div>

         <div>
          <span>Autocab reason</span>
          <b>
           {liveCreditPreview.proposed?.payload?.adjustmentReason||
            'FaivoPay Live Test'}
          </b>
         </div>

         <div>
          <span>isCredit</span>
          <b>
           {String(
            Boolean(liveCreditPreview.proposed?.payload?.isCredit)
           )}
          </b>
         </div>
        </div>

        <div className="liveTestCreditExecute">
         <div>
          <b>Final execution step</b>
          <span>
           FaivoPay will perform another live Autocab read immediately
           before the write. If the Current Balance has changed, the
           server refuses the transaction.
          </span>
         </div>

         <button
          className="danger"
          disabled={Boolean(liveCreditBusy)}
          onClick={()=>executeLiveCredit(liveCreditPreview)}
         >
          <AlertTriangle/>
          {liveCreditBusy
           ?'Executing…'
           :'Execute £1 live credit'}
         </button>
        </div>
       </>}

       {liveCreditResult&&
        <div className="liveTestCreditResult">
         <div className="liveTestCreditResultHead">
          <ShieldCheck/>
          <div>
           <b>
            {liveCreditResult.verification?.verified
             ?'Autocab write verified'
             :'Autocab write completed — verification requires review'}
           </b>
           <span>
            The live-write gate has been automatically disabled.
           </span>
          </div>
         </div>

         <div className="liveTestCreditFacts">
          <div>
           <span>Before Current Balance</span>
           <b>{money(liveCreditResult.before?.currentBalance)}</b>
          </div>

          <div>
           <span>Expected after</span>
           <b>
            {money(
             liveCreditResult.verification?.expectedCurrentBalance
            )}
           </b>
          </div>

          <div>
           <span>Actual after</span>
           <b>{money(liveCreditResult.after?.currentBalance)}</b>
          </div>

          <div>
           <span>Verification</span>
           <b>
            {liveCreditResult.verification?.verified
             ?'MATCHED'
             :'REVIEW'}
           </b>
          </div>
         </div>

         <div className="liveTestCreditPayload">
          <div>
           <span>Description</span>
           <b>{liveCreditResult.adjustment?.description||'—'}</b>
          </div>

          <div>
           <span>Amount</span>
           <b>{money(liveCreditResult.adjustment?.amount)}</b>
          </div>

          <div>
           <span>Adjustment ID</span>
           <b>{liveCreditResult.adjustment?.id||'—'}</b>
          </div>
         </div>

         <p className="liveTestCreditNextStep">
          Do not run another live write yet. Inspect the Autocab
          rent/credit sheet for callsign 9997 before preparing the
          compensating £1 debit.
         </p>
        </div>
       }
      </section>
     }

     {(liveReversalPreview||liveReversalResult)&&
      <section className="panel liveTestCreditPanel">
       <div className="panelHead">
        <div>
         <span className="sectionKicker">
          CONTROLLED LIVE AUTOCAB REVERSAL
         </span>
         <h3>£1 debit reversal · Callsign 9997</h3>
         <p>
          Compensating transaction for the previously verified £1
          Live Test credit on Autocab driver ID 1112.
         </p>
        </div>

        <Pill tone={liveReversalResult?'good':'warn'}>
         {liveReversalResult?'Completed':'Awaiting execution'}
        </Pill>
       </div>

       {liveReversalPreview&&!liveReversalResult&&<>
        <div className="liveTestCreditWarning">
         <AlertTriangle/>
         <div>
          <b>REAL AUTOCAB DEBIT — REVIEW BEFORE EXECUTING</b>
          <span>
           The preview is read-only. Execution will send one £1.00
           debit only if the live balance is still exactly the same
           as this preview.
          </span>
         </div>
        </div>

        <div className="liveTestCreditFacts">
         <div>
          <span>Driver</span>
          <b>
           {liveReversalPreview.driver?.callsign||'9997'}
           {' / '}
           {liveReversalPreview.driver?.driverId||'1112'}
          </b>
         </div>

         <div>
          <span>Direction</span>
          <b>DEBIT</b>
         </div>

         <div>
          <span>Amount</span>
          <b>
           {money(
            liveReversalPreview.proposed?.payload?.amount||1
           )}
          </b>
         </div>

         <div>
          <span>Current balance before</span>
          <b>
           {money(liveReversalPreview.before?.currentBalance)}
          </b>
         </div>

         <div>
          <span>Expected balance after</span>
          <b>
           {money(
            liveReversalPreview.proposed?.expectedCurrentBalanceAfter
           )}
          </b>
         </div>

         <div>
          <span>Preview expires</span>
          <b>{dt(liveReversalPreview.expiresAt)}</b>
         </div>
        </div>

        <div className="liveTestCreditPayload">
         <div>
          <span>Description sent to Autocab</span>
          <b>
           {liveReversalPreview.proposed?.payload?.description||
            'FaivoPay Live Test Reversal'}
          </b>
         </div>

         <div>
          <span>Autocab reason</span>
          <b>
           {liveReversalPreview.proposed?.payload?.adjustmentReason||
            'FaivoPay Live Test'}
          </b>
         </div>

         <div>
          <span>isCredit</span>
          <b>
           {String(
            Boolean(
             liveReversalPreview.proposed?.payload?.isCredit
            )
           )}
          </b>
         </div>
        </div>

        <div className="liveTestCreditExecute">
         <div>
          <b>Final compensating debit</b>
          <span>
           FaivoPay will perform another fresh Autocab read before
           sending the reversal. The server requires the live Current
           Balance to still be £1.00.
          </span>
         </div>

         <button
          className="danger"
          disabled={Boolean(liveReversalBusy)}
          onClick={()=>executeLiveReversal(liveReversalPreview)}
         >
          <AlertTriangle/>
          {liveReversalBusy
           ?'Executing…'
           :'Execute £1 debit reversal'}
         </button>
        </div>
       </>}

       {liveReversalResult&&
        <div className="liveTestCreditResult">
         <div className="liveTestCreditResultHead">
          <ShieldCheck/>
          <div>
           <b>
            {liveReversalResult.verification?.verified
             ?'Autocab reversal verified'
             :'Autocab reversal completed — verification requires review'}
           </b>
           <span>
            The live-write gate has been automatically disabled.
           </span>
          </div>
         </div>

         <div className="liveTestCreditFacts">
          <div>
           <span>Before Current Balance</span>
           <b>
            {money(liveReversalResult.before?.currentBalance)}
           </b>
          </div>

          <div>
           <span>Expected after</span>
           <b>
            {money(
             liveReversalResult.verification?.expectedCurrentBalance
            )}
           </b>
          </div>

          <div>
           <span>Actual after</span>
           <b>
            {money(liveReversalResult.after?.currentBalance)}
           </b>
          </div>

          <div>
           <span>Verification</span>
           <b>
            {liveReversalResult.verification?.verified
             ?'MATCHED'
             :'REVIEW'}
           </b>
          </div>
         </div>

         <div className="liveTestCreditPayload">
          <div>
           <span>Description</span>
           <b>
            {liveReversalResult.adjustment?.description||'—'}
           </b>
          </div>

          <div>
           <span>Amount</span>
           <b>{money(liveReversalResult.adjustment?.amount)}</b>
          </div>

          <div>
           <span>Adjustment ID</span>
           <b>{liveReversalResult.adjustment?.id||'—'}</b>
          </div>
         </div>

         <p className="liveTestCreditNextStep">
          The compensating Live Test transaction is complete.
          Confirm the Autocab credit sheet shows the £1 reversal in
          Debits and the New Balance has returned to £0.00.
         </p>
        </div>
       }
      </section>
     }

     {liveTestSimulation&&
      <section className="panel liveTestSimulationPanel">
       <div className="panelHead">
        <div>
         <span className="sectionKicker">MONDAY RUN SIMULATION</span>
         <h3>
          Callsign {liveTestSimulation.driver?.callsign||'—'}
         </h3>
         <p>
          This uses a fresh live Autocab Previous Balance and the current
          FaivoPay Monday rules. It has not created or changed any financial records.
         </p>
        </div>
        <Pill tone="good">Nothing changed</Pill>
       </div>

       <div className="liveTestSimulationSafety">
        <ShieldCheck/>
        <div>
         <b>SIMULATION ONLY — NOTHING WAS CHANGED</b>
         <span>
          No Autocab adjustment, payout, payment request, carried-charge update,
          payment-plan change, provider payment or notification was created.
         </span>
        </div>
       </div>

       <div className="liveTestSimulationMeta">
        <span>
         Simulated run date
         <b>{liveTestSimulation.simulation?.runDate||'—'}</b>
        </span>

        <span>
         Settled activity week
         <b>{liveTestSimulation.simulation?.settledWeekStart||'—'}</b>
        </span>

        <span>
         Live balance fetched
         <b>{dt(liveTestSimulation.simulation?.live?.fetchedAt)}</b>
        </span>

        <span>
         Proposed action
         <b>
          {String(
           liveTestSimulation.simulation?.outcome?.action||'none'
          ).replaceAll('_',' ')}
         </b>
        </span>
       </div>

       <div className="liveTestMondayFlow">
        <div>
         <span>Live Previous Balance</span>
         <b>
          {money(
           liveTestSimulation.simulation?.calculation?.previousBalance
          )}
         </b>
        </div>

        <div>
         <span>Less weekly fee</span>
         <b>
          -{money(
           liveTestSimulation.simulation?.calculation?.lessWeeklyFee
          )}
         </b>
        </div>

        <div>
         <span>Less carried charges</span>
         <b>
          -{money(
           liveTestSimulation.simulation?.calculation?.lessCarriedCharges
          )}
         </b>
        </div>

        <div>
         <span>Balance before plan</span>
         <b>
          {money(
           liveTestSimulation.simulation?.calculation?.adjustedBalance
          )}
         </b>
        </div>

        <div>
         <span>Less plan allocation</span>
         <b>
          -{money(
           liveTestSimulation.simulation?.calculation?.lessPlanAllocation
          )}
         </b>
         <small>
          {liveTestSimulation.simulation?.paymentPlan?.applies
           ?'Due payment-plan instalment'
           :'No payment-plan deduction'}
         </small>
        </div>

        <div className="liveTestMondayOutcome">
         <span>Available after deductions</span>
         <b>
          {money(
           liveTestSimulation.simulation?.calculation?.payoutAvailable
          )}
         </b>
        </div>
       </div>

       <div className="liveTestOutcomeGrid">
        <div>
         <span>Proposed action</span>
         <b>
          {String(
           liveTestSimulation.simulation?.outcome?.action||'none'
          ).replaceAll('_',' ')}
         </b>
        </div>

        <div>
         <span>Action amount</span>
         <b>
          {money(
           liveTestSimulation.simulation?.outcome?.amount
          )}
         </b>
        </div>

        <div>
         <span>Proposed carried charges</span>
         <b>
          {money(
           liveTestSimulation.simulation?.outcome?.proposedCarryForward
          )}
         </b>
        </div>

        <div>
         <span>Minimum payout</span>
         <b>
          {money(
           liveTestSimulation.simulation?.inputs?.minimumPayoutThreshold
          )}
         </b>
        </div>

        <div>
         <span>Negative threshold</span>
         <b>
          {money(
           liveTestSimulation.simulation?.inputs?.negativeThreshold
          )}
         </b>
        </div>

        <div>
         <span>Worked in settled week</span>
         <b>
          {liveTestSimulation.simulation?.inputs?.workedThisWeek
           ?'Yes'
           :'No'}
         </b>
        </div>
       </div>

       {liveTestSimulation.simulation?.paymentPlan?.applies&&
        <div className="liveTestPlanSimulation">
         <div>
          <span>Plan scheduled</span>
          <b>
           {money(
            liveTestSimulation.simulation?.paymentPlan?.scheduledAmount
           )}
          </b>
         </div>

         <div>
          <span>Instalment remaining</span>
          <b>
           {money(
            liveTestSimulation.simulation?.paymentPlan?.instalmentRemaining
           )}
          </b>
         </div>

         <div>
          <span>Plan remaining</span>
          <b>
           {money(
            liveTestSimulation.simulation?.paymentPlan?.planRemainingAmount
           )}
          </b>
         </div>

         <div>
          <span>Would allocate Monday</span>
          <b>
           {money(
            liveTestSimulation.simulation?.paymentPlan?.allocatedAmount
           )}
          </b>
         </div>
        </div>
       }
      </section>
     }

     {liveTestWritePreview&&
      <section className="panel liveTestWritePreviewPanel">
       <div className="panelHead liveTestWritePreviewHead">
        <div>
         <span className="sectionKicker">AUTOCAB WRITE PREVIEW</span>
         <h3>
          Callsign {liveTestWritePreview.driver?.callsign||'—'}
         </h3>
         <p>
          What FaivoPay would place on the driver's Autocab account
          after this weekly payout is confirmed paid.
         </p>
        </div>

        <Pill tone="good">Preview only</Pill>
       </div>

       <div className="liveTestPreviewSafety">
        <ShieldCheck/>
        <div>
         <b>Nothing has been sent to Autocab</b>
         <span>
          This is a calculation and payload preview only.
         </span>
        </div>
       </div>

       <div className="liveTestPreviewTop">
        <label className="liveTestPreviewBalanceInput">
         <span>Test Previous Balance</span>
         <input
          type="number"
          step="0.01"
          value={writePreviewBalance}
          onChange={e=>setWritePreviewBalance(e.target.value)}
          placeholder="Use live balance"
         />
         <small>
          Blank = live balance. Use 41.00 to model this payout.
         </small>
        </label>

        <div className="liveTestPreviewFacts">
         <div>
          <span>Live balance</span>
          <b>
           {money(
            liveTestWritePreview.source?.livePreviousBalance
           )}
          </b>
         </div>

         <div>
          <span>Balance tested</span>
          <b>
           {money(
            liveTestWritePreview.source?.usedPreviousBalance
           )}
          </b>
         </div>

         <div>
          <span>Monday outcome</span>
          <b className="capitalize">
           {String(
            liveTestWritePreview.preview?.simulatedAction||'none'
           ).replaceAll('_',' ')}
          </b>
         </div>

         <div className="liveTestPreviewDebitTotal">
          <span>Total Autocab debit</span>
          <b>
           {money(
            liveTestWritePreview.preview?.totals?.totalDebit
           )}
          </b>
         </div>
        </div>
       </div>

       {liveTestWritePreview.preview?.adjustments?.length
        ?<div className="liveTestPreviewTransactions">
          {liveTestWritePreview.preview.adjustments.map((x,i)=>
           <div
            className="liveTestPreviewTransaction"
            key={`${x.purpose}-${i}`}
           >
            <div className="liveTestPreviewTransactionMain">
             <div className="liveTestPreviewTransactionIdentity">
              <span className="liveTestPreviewDebitBadge">
               DEBIT
              </span>

              <div>
               <b>
                {String(x.purpose||'')
                 .replaceAll('_',' ')
                 .replace(/\b\w/g,c=>c.toUpperCase())}
               </b>

               <span>
                {x.payload?.description||'—'}
               </span>
              </div>
             </div>

             <strong>
              {money(x.payload?.amount)}
             </strong>
            </div>

            <details className="liveTestPreviewTechnical">
             <summary>Technical details</summary>

             <div className="liveTestPreviewTechnicalGrid">
              <span>
               Autocab column
               <b>{x.expectedRentSheetColumn||'—'}</b>
              </span>

              <span>
               Method
               <b>{x.method||'—'}</b>
              </span>

              <span>
               isCredit
               <b>{String(Boolean(x.payload?.isCredit))}</b>
              </span>

              <span>
               Autocab reason
               <b>{x.payload?.adjustmentReason||'—'}</b>
              </span>
             </div>

             <code>{x.endpoint||'—'}</code>
            </details>
           </div>
          )}
         </div>

        :<div className="emptyState compact">
          <ShieldCheck/>
          <h3>No Autocab transaction for this outcome</h3>
          <p>
           {liveTestWritePreview.preview?.expected?.description||
            'This result would not send a weekly payout reconciliation.'}
          </p>
         </div>
       }

       <div className="liveTestPreviewFooter">
        <div>
         <span>Transactions</span>
         <b>
          {liveTestWritePreview.preview?.totals?.adjustmentCount||0}
         </b>
        </div>

        <div>
         <span>Total debit</span>
         <b>
          {money(
           liveTestWritePreview.preview?.totals?.totalDebit
          )}
         </b>
        </div>

        <div>
         <span>Autocab balance movement</span>
         <b>
          {money(
           liveTestWritePreview.preview?.totals?.netAutocabMovement
          )}
         </b>
        </div>

        <div>
         <span>Rent sheet</span>
         <b>
          {liveTestWritePreview.preview?.expected?.rentSheetColumn||
           'None'}
         </b>
        </div>
       </div>
      </section>
     }

     {liveTestSnapshot&&
      <section className="panel liveTestSnapshotPanel">
       <div className="panelHead">
        <div>
         <span className="sectionKicker">LATEST READ-ONLY SNAPSHOT</span>
         <h3>
          Callsign {liveTestSnapshot.driver?.callsign||'—'}
         </h3>
         <p>
          Fresh Autocab account values compared with the existing
          FaivoPay cache. This read does not update the cache.
         </p>
        </div>
        <Pill tone="good">No writes</Pill>
       </div>

       <div className="liveTestComparisonGrid">
        <div>
         <span>Previous balance · cached</span>
         <b>
          {money(
           liveTestSnapshot.snapshot?.comparison
            ?.previousBalance?.cached
          )}
         </b>
        </div>

        <div>
         <span>Previous balance · live</span>
         <b>
          {money(
           liveTestSnapshot.snapshot?.comparison
            ?.previousBalance?.live
          )}
         </b>
         <small>
          {liveTestSnapshot.snapshot?.comparison
            ?.previousBalance?.changed
           ?'Changed since cache'
           :'Matches cache'}
         </small>
        </div>

        <div>
         <span>Current balance · cached</span>
         <b>
          {money(
           liveTestSnapshot.snapshot?.comparison
            ?.currentBalance?.cached
          )}
         </b>
        </div>

        <div>
         <span>Current balance · live</span>
         <b>
          {money(
           liveTestSnapshot.snapshot?.comparison
            ?.currentBalance?.live
          )}
         </b>
         <small>
          {liveTestSnapshot.snapshot?.comparison
            ?.currentBalance?.changed
           ?'Changed since cache'
           :'Matches cache'}
         </small>
        </div>
       </div>

       <div className="liveTestSnapshotTimes">
        <span>
         Cache synced
         <b>
          {dt(
           liveTestSnapshot.snapshot?.comparison
            ?.cacheSyncedAt
          )}
         </b>
        </span>

        <span>
         Live fetched
         <b>
          {dt(
           liveTestSnapshot.snapshot?.comparison
            ?.liveFetchedAt
          )}
         </b>
        </span>

        <span>
         Autocab changed
         <b>No</b>
        </span>

        <span>
         FaivoPay cache changed
         <b>No</b>
        </span>
       </div>
      </section>
     }

     <section className="panel liveTestHistoryPanel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">IMMUTABLE TEST HISTORY</span>
        <h3>Recent Live Test activity</h3>
        <p>
         Read-only checks, simulations, previews and controlled test
         controls are recorded against the signed-in administrator.
        </p>
       </div>
       <Pill tone="good">{visibleEvents.length} shown</Pill>
      </div>

      {visibleEvents.length
       ?<div className="tableWrap proTable">
         <table>
          <thead>
           <tr>
            <th>Driver</th>
            <th>Activity</th>
            <th>Result</th>
            <th>Details</th>
            <th>Administrator</th>
            <th>Time</th>
           </tr>
          </thead>

          <tbody>
           {visibleEvents.map(x=>{
            const failed=
             String(x.action||'').endsWith('_failed')||
             x.status==='failed';

            const labels={
             live_account_snapshot_completed:'Live snapshot',
             live_account_snapshot_failed:'Live snapshot',
             monday_simulation_completed:'Monday simulation',
             monday_simulation_failed:'Monday simulation',
             autocab_write_preview_completed:'Autocab write preview',
             live_writes_enabled:'Live writes enabled',
             live_writes_disabled:'Live writes disabled',
             live_credit_preview_completed:'£1 credit preview',
             live_credit_requested:'£1 credit requested',
             live_credit_completed:'£1 credit completed',
             live_credit_completed_unverified:'£1 credit completed',
             live_credit_failed:'£1 credit failed',
             live_credit_verification_failed:'£1 credit verification',
             live_reversal_preview_completed:'£1 reversal preview',
             live_reversal_requested:'£1 reversal requested',
             live_reversal_completed:'£1 reversal completed',
             live_reversal_completed_unverified:'£1 reversal completed',
             live_reversal_failed:'£1 reversal failed',
             live_reversal_verification_failed:'£1 reversal verification'
            };

            const activity=
             labels[x.action]||
             String(x.action||'Activity').replaceAll('_',' ');

            let details='';

            if(x.action==='live_account_snapshot_completed'){
             const cached=x.before?.currentBalance;
             const live=x.result?.live?.currentBalance;

             details=
              `Current ${cached==null?'—':money(cached)} → `+
              `${live==null?'—':money(live)}`;

            }else if(x.action==='monday_simulation_completed'){
             details=
              `${String(
               x.result?.simulation?.outcome?.action||'none'
              ).replaceAll('_',' ')} · `+
              `${money(
               x.result?.simulation?.outcome?.amount||0
              )}`;

            }else if(x.action==='autocab_write_preview_completed'){
             details=
              `${x.proposed?.totals?.adjustmentCount||0} adjustments · `+
              `${money(x.proposed?.totals?.totalDebit||0)} debit`;

            }else if(x.action==='live_writes_enabled'){
             details='Armed for controlled Autocab test writes';

            }else if(x.action==='live_writes_disabled'){
             details='Live Autocab test writes disarmed';

            }else if(x.action==='live_credit_preview_completed'){
             details=
              `£1 credit preview · Current `+
              `${money(x.before?.currentBalance)}`;

            }else if(x.action==='live_credit_requested'){
             details='£1 live Autocab credit requested';

            }else if(
             x.action==='live_credit_completed'||
             x.action==='live_credit_completed_unverified'
            ){
             details=
              `Current ${money(x.result?.beforeCurrentBalance)} → `+
              `${money(x.result?.afterCurrentBalance)}`;

            }else if(
             x.action==='live_credit_failed'||
             x.action==='live_credit_verification_failed'
            ){
             details=x.result?.error||'Controlled write requires review';

            }else if(x.action==='live_reversal_preview_completed'){
             details=
              `£1 debit preview · Current `+
              `${money(x.before?.currentBalance)}`;

            }else if(x.action==='live_reversal_requested'){
             details='£1 compensating Autocab debit requested';

            }else if(
             x.action==='live_reversal_completed'||
             x.action==='live_reversal_completed_unverified'
            ){
             details=
              `Current ${money(x.result?.beforeCurrentBalance)} → `+
              `${money(x.result?.afterCurrentBalance)}`;

            }else if(
             x.action==='live_reversal_failed'||
             x.action==='live_reversal_verification_failed'
            ){
             details=x.result?.error||'Reversal requires review';

            }else if(failed){
             details=x.result?.error||'Failed';
            }

            return <tr key={x.id}>
             <td>
              <div className="driverCell">
               <span className="callsign">
                {x.callsign||'—'}
               </span>
               <div>
                <b>Driver {x.driverId||'—'}</b>
                <small>{x.id}</small>
               </div>
              </div>
             </td>

             <td>
              <b className="capitalize">{activity}</b>
             </td>

             <td>
              <Pill tone={failed?'bad':'good'}>
               {failed?'Failed':'Recorded'}
              </Pill>
             </td>

             <td>{details||'—'}</td>

             <td>
              <b>{x.actorName||x.actorEmail||'Administrator'}</b>
              {x.actorEmail&&
               <small>{x.actorEmail}</small>
              }
             </td>

             <td>{dt(x.createdAt)}</td>
            </tr>
           })}
          </tbody>
         </table>
        </div>

       :<div className="emptyState compact">
         <FileClock/>
         <h3>No Live Test activity yet</h3>
         <p>
          Run a snapshot, simulation or preview against an enabled test driver.
         </p>
        </div>
      }

     </section>

     <section className="liveTestPhaseNotice">
      <Info/>
      <div>
       <b>Phase 2A boundary</b>
       <span>
        Live Test Lab may now make an explicit read-only Autocab
        driver-account query for an enabled allow-listed driver.
        It cannot make Autocab adjustments, change the driver cache,
        release payouts, contact payment providers or send messages.
       </span>
      </div>
     </section>

    </div>
  }
 </>;
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
 const[drivers,setDrivers]=useState([]),[meta,setMeta]=useState({}),[settings,setSettings]=useState(null),[integrations,setIntegrations]=useState(null);
 const[companyFinance,setCompanyFinance]=useState(null),[integrationStatus,setIntegrationStatus]=useState(null),[companyFinanceBusy,setCompanyFinanceBusy]=useState(false);
 const[mondayRuns,setMondayRuns]=useState([]),[sett,setSett]=useState({runs:[],payoutRuns:[],payouts:[],paymentRequests:[],earlyPayoutRequests:[]});
 const[planAllocations,setPlanAllocations]=useState([]);
 const[outstanding,setOutstanding]=useState([]),[fees,setFees]=useState({fees:[],summary:{}}),[earlySummary,setEarlySummary]=useState(null);
 const[feeInvoices,setFeeInvoices]=useState([]),[feeInvoiceBusy,setFeeInvoiceBusy]=useState(false);
 const[feeInvoicePreview,setFeeInvoicePreview]=useState(null),[feeInvoicePreviewBusy,setFeeInvoicePreviewBusy]=useState(false),[feeInvoiceDraftPdfBusy,setFeeInvoiceDraftPdfBusy]=useState(false);
 const[feeInvoiceSendBusy,setFeeInvoiceSendBusy]=useState(null),[feeInvoiceTestEmailBusy,setFeeInvoiceTestEmailBusy]=useState(false);
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
 const[liveTest,setLiveTest]=useState(null),[liveTestBusy,setLiveTestBusy]=useState(false);
 const[liveTestEvents,setLiveTestEvents]=useState([]),[liveTestSnapshot,setLiveTestSnapshot]=useState(null),[liveTestSnapshotBusy,setLiveTestSnapshotBusy]=useState('');
 const[liveTestSimulation,setLiveTestSimulation]=useState(null),[liveTestSimulationBusy,setLiveTestSimulationBusy]=useState('');
 const[liveTestWritePreview,setLiveTestWritePreview]=useState(null),[liveTestWritePreviewBusy,setLiveTestWritePreviewBusy]=useState(''),[liveTestWritePreviewBalance,setLiveTestWritePreviewBalance]=useState('');
 const[liveTestCreditPreview,setLiveTestCreditPreview]=useState(null),[liveTestCreditBusy,setLiveTestCreditBusy]=useState(''),[liveTestCreditResult,setLiveTestCreditResult]=useState(null);
 const[liveTestReversalPreview,setLiveTestReversalPreview]=useState(null),[liveTestReversalBusy,setLiveTestReversalBusy]=useState(''),[liveTestReversalResult,setLiveTestReversalResult]=useState(null);
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
 const loadCompanyFinance=()=>safeLoad(async()=>setCompanyFinance(await api('/api/admin/company-finance-settings')));
 const loadIntegrationStatus=()=>safeLoad(async()=>setIntegrationStatus(await api('/api/admin/integration-status')));
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
 const loadFeeInvoices=()=>safeLoad(async()=>{
  const j=await api('/api/admin/fee-invoices');
  setFeeInvoices(j.invoices||[]);
 });
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
 const loadLiveTest=()=>safeLoad(async()=>{
  setLiveTestBusy(true);
  try{
   const [lab,history]=await Promise.all([
    api('/api/admin/live-test'),
    api('/api/admin/live-test/events')
   ]);

   setLiveTest(lab);
   setLiveTestEvents(history.events||[]);
  }finally{
   setLiveTestBusy(false);
  }
 });

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

 async function refreshCore(){await Promise.all([loadOverview(),loadTransactions(),loadDrivers(),loadSettings(),loadIntegrations(),loadCompanyFinance(),loadIntegrationStatus(),loadSett(),loadMonday(),loadOutstanding(),loadFees(),loadFeeInvoices(),loadEarlySummary(),loadCustomerAdmin()])}
 useEffect(()=>{
  let alive=true;
  if(!token){setSessionBooting(false);return()=>{alive=false}}
  setSessionBooting(true);setErr('');
  (async()=>{
   try{
    const profile=await call('/api/admin/me',{},token);if(!alive)return;setMe(profile);
    await Promise.all([loadOverview(),loadTransactions(),loadDrivers(),loadSettings(),loadIntegrations(),loadCompanyFinance(),loadIntegrationStatus(),loadSett(),loadMonday(),loadOutstanding(),loadFees(),loadFeeInvoices(),loadEarlySummary(),loadCustomerAdmin()]);
   }catch(e){if(alive){if(/authentication|office authentication/i.test(e.message))logout();else setErr(e.message)}}
   finally{if(alive)setSessionBooting(false)}
  })();
  return()=>{alive=false};
 },[token]);

 async function saveCompanyFinance(){
  if(!companyFinance?.weeklyInvoicing)return;

  setCompanyFinanceBusy(true);

  try{
   const result=await api('/api/admin/company-finance-settings',{
    method:'PUT',
    body:JSON.stringify({
     companyId:companyFinance.company?.id||'',
     weeklyInvoicingEnabled:Boolean(
      companyFinance.weeklyInvoicing.enabled
     ),
     weeklyInvoicingEmail:
      companyFinance.weeklyInvoicing.billingEmail||''
    })
   });

   setCompanyFinance(result);
   alert('Weekly invoicing settings saved.');
  }catch(e){
   alert(e.message);
  }finally{
   setCompanyFinanceBusy(false);
  }
 }

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
   jobs.push(
    api('/api/admin/fees').then(setFees),
    api('/api/admin/fee-invoices').then(j=>setFeeInvoices(j.invoices||[]))
   );
  }

  if(view==='settings'){
   jobs.push(
    api('/api/admin/integration-status').then(setIntegrationStatus),
    api('/api/admin/company-finance-settings').then(setCompanyFinance)
   );
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
  ['dashboard',LayoutDashboard,'Dashboard'],
  ['transactions',CreditCard,'Transactions'],
  ['customerPayments',Send,'Customer Payments'],
  ['monday',CalendarDays,'Monday Run'],
  ['early',ArrowUpRight,'Early Payouts'],
  ['outstanding',AlertTriangle,'Outstanding'],
  ['paymentPlans',CalendarDays,'Payment Plans'],
  ['fees',BadgePoundSterling,'Fees & Billing'],
  ...(isPlatformAdmin?[
   ['demo',PlayCircle,'Demo Lab'],
   ['liveTest',Database,'Live Test Lab']
  ]:[]),
  ['drivers',Users,'Drivers'],
  ['access',UserCheck,'Users & Access'],
  ...(isPlatformAdmin?[['platform',KeyRound,'Super Admin']]:[]),
  ...(isAdmin?[['security',ShieldCheck,'Security'],['settings',Settings,'Settings']]:[])
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

 /*
  * Proposed Monday outgoing:
  * Includes pending + approved payouts.
  * Excluded drivers are removed from the proposed payable position.
  */
 const weeklyProposed=weeklyItems.filter(
  x=>x.approvalStatus!=='excluded'
 );

 const weeklyProposedTotal=weeklyProposed.reduce(
  (a,x)=>a+Number(x.amount||0),
  0
 );

 const weeklyProposedBeforeFees=weeklyProposed.reduce(
  (a,x)=>a+Math.max(0,Number(x.previousBalance||0)),
  0
 );

 const weeklyProposedWeeklyFees=weeklyProposed.reduce(
  (a,x)=>a+Number(x.weeklyFee||0),
  0
 );

 const weeklyProposedCarriedCharges=weeklyProposed.reduce(
  (a,x)=>a+Number(x.carriedCharges||0),
  0
 );

 const weeklyProposedPlanDeductions=weeklyProposed.reduce(
  (a,x)=>a+Number(x.planAllocation||0),
  0
 );

 /*
  * Approved Monday outgoing:
  * Used for payment-run creation and actual approved cash exposure.
  */
 const weeklyApprovedTotal=weeklyApproved.reduce(
  (a,x)=>a+Number(x.amount||0),
  0
 );

 const weeklyPayoutBeforeFees=weeklyApproved.reduce(
  (a,x)=>a+Math.max(0,Number(x.previousBalance||0)),
  0
 );

 const weeklyPayoutWeeklyFees=weeklyApproved.reduce(
  (a,x)=>a+Number(x.weeklyFee||0),
  0
 );

 const weeklyPayoutCarriedCharges=weeklyApproved.reduce(
  (a,x)=>a+Number(x.carriedCharges||0),
  0
 );

 const weeklyPayoutPlanDeductions=weeklyApproved.reduce(
  (a,x)=>a+Number(x.planAllocation||0),
  0
 );

 const weeklyPayoutFeesCharges=
  weeklyPayoutWeeklyFees+
  weeklyPayoutCarriedCharges;

 /*
  * Monday incoming:
  * settlement_run.items records what became due.
  * payment_requests is authoritative for whether money was actually
  * received. An OPEN request is a receivable, not cleared cash.
  */
 const mondayPaymentRequestsById=new Map(
  (sett.paymentRequests||[]).map(x=>[String(x.id),x])
 );

 const weeklyCollectionStatus=weeklyCollections.map(item=>{
  const request=item.requestId
   ?mondayPaymentRequestsById.get(String(item.requestId))
   :null;

  return {
   item,
   request,
   status:String(request?.status||'open')
  };
 });

 const weeklyActiveCollections=weeklyCollectionStatus.filter(
  x=>x.status!=='cancelled'
 );

 const weeklyPaidCollections=weeklyActiveCollections.filter(
  x=>x.status==='paid'
 );

 const weeklyUnpaidCollections=weeklyActiveCollections.filter(
  x=>x.status!=='paid'
 );

 const weeklyIncomingDueTotal=weeklyActiveCollections.reduce(
  (a,x)=>a+Number(x.request?.amount??x.item.amount??0),
  0
 );

 const weeklyIncomingClearedTotal=weeklyPaidCollections.reduce(
  (a,x)=>a+Number(x.request?.amount??x.item.amount??0),
  0
 );

 const weeklyIncomingOutstandingTotal=weeklyUnpaidCollections.reduce(
  (a,x)=>a+Number(x.request?.amount??x.item.amount??0),
  0
 );

 const weeklyIncomingBeforeFees=weeklyActiveCollections.reduce(
  (a,x)=>a+Math.abs(Number(x.item.previousBalance||0)),
  0
 );

 const weeklyIncomingWeeklyFees=weeklyActiveCollections.reduce(
  (a,x)=>a+Number(x.item.weeklyFee||0),
  0
 );

 const weeklyIncomingCarriedCharges=weeklyActiveCollections.reduce(
  (a,x)=>a+Number(x.item.carriedCharges||0),
  0
 );

 const weeklyIncomingFeesCharges=
  weeklyIncomingWeeklyFees+
  weeklyIncomingCarriedCharges;

 const weeklyExcludedBeforeFees=weeklyExcluded.reduce(
  (a,x)=>a+Math.max(0,Number(x.previousBalance||0)),
  0
 );
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
 function go(k){setView(k);setMobileNav(false);setErr('');if(k==='customerPayments')loadCustomerAdmin();if(k==='monday'){loadMonday();loadSett()}if(k==='early'){loadEarlySummary();loadSett()}if(k==='outstanding'){loadOutstanding();loadPaymentPlans();}if(k==='paymentPlans')loadPaymentPlans();if(k==='fees')loadFees();if(k==='demo')loadDemo();if(k==='liveTest')loadLiveTest();if(k==='drivers')loadDrivers();if(k==='access'){loadStaff();loadDriverUsers()}if(k==='security')loadSecurity();if(k==='platform'){loadPlatformCompanies();setPlatformCompany(null)}if(k==='settings'){loadSettings();loadIntegrations()}}
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
 async function previewWeeklyFeeInvoice(periodMode='auto'){
  const billingEmail=
   companyFinance?.weeklyInvoicing?.billingEmail||
   companyFinance?.company?.supportEmail||
   '';

  setFeeInvoicePreviewBusy(true);

  try{
   const j=await api('/api/admin/fee-invoices/preview',{
    method:'POST',
    body:JSON.stringify({
     companyId:companyFinance?.company?.id||'',
     billingEmail,
     periodMode
    })
   });

   setFeeInvoicePreview(j.preview);
  }catch(e){
   setFeeInvoicePreview(null);
   alert(e.message);
  }finally{
   setFeeInvoicePreviewBusy(false);
  }
 }

 async function createWeeklyFeeInvoice(){
  const preview=feeInvoicePreview;

  if(!preview){
   return alert('Preview the draft invoice before creating the final invoice.');
  }

  if(!preview.finalInvoiceEligible){
   return alert(
    'This is a current week draft only. The final invoice can be created after the week has fully completed.'
   );
  }

  if(!confirm(
   `Create the FINAL invoice for ${preview.periodStart} to ${preview.periodEnd}?\n\n`+
   `${preview.feeCount} fee records\n`+
   `Gross fees: ${money(preview.grossFeeTotal)}\n`+
   `FaivoPay due: ${money(preview.faivopayShareTotal)}\n`+
   `Taxi company share: ${money(preview.taxiCompanyShareTotal)}\n\n`+
   'This will allocate the reviewed fee records to an official invoice number.\n\n'+
   'No email will be sent yet.'
  ))return;

  setFeeInvoiceBusy(true);

  try{
   const j=await api('/api/admin/fee-invoices/manual-create',{
    method:'POST',
    body:JSON.stringify({
     companyId:companyFinance?.company?.id||'',
     periodStart:preview.periodStart,
     periodEnd:preview.periodEnd,
     billingEmail:preview.billingEmail,
     previewKey:preview.previewKey
    })
   });

   setFeeInvoicePreview(null);

   await Promise.all([
    loadFees(),
    loadFeeInvoices()
   ]);

   if(j.alreadyExists){
    alert(
     `Invoice ${j.invoice.invoiceNumber} already exists for ${j.invoice.periodStart} to ${j.invoice.periodEnd}.\n\n`+
     'No duplicate invoice was created.'
    );
   }else{
    alert(
     `Invoice ${j.invoice.invoiceNumber} created successfully.\n\n`+
     `${j.invoice.feeCount} fee records\n`+
     `FaivoPay amount: ${money(j.invoice.faivopayShareTotal)}\n\n`+
     'No email has been sent.'
    );
   }
  }catch(e){
   if(/draft has changed/i.test(e.message)){
    setFeeInvoicePreview(null);
   }

   alert(e.message);
  }finally{
   setFeeInvoiceBusy(false);
  }
 }

 async function downloadDraftFeeInvoicePdf(){
  const preview=feeInvoicePreview;

  if(!preview){
   return alert('Preview the draft invoice first.');
  }

  setFeeInvoiceDraftPdfBusy(true);

  try{
   const r=await fetch(
    `${API_BASE}/api/admin/fee-invoices/preview/pdf`,
    {
     method:'POST',
     headers:{
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json'
     },
     body:JSON.stringify({
      companyId:companyFinance?.company?.id||'',
      periodStart:preview.periodStart,
      periodEnd:preview.periodEnd,
      billingEmail:preview.billingEmail,
      previewKey:preview.previewKey
     })
    }
   );

   if(!r.ok){
    let message='Could not download draft invoice PDF';

    try{
     const j=await r.json();
     message=j.error||message;
    }catch{}

    if(/draft has changed/i.test(message)){
     setFeeInvoicePreview(null);
    }

    throw new Error(message);
   }

   const blob=await r.blob();
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');

   a.href=url;
   a.download=`FaivoPay-DRAFT-${preview.periodStart}-${preview.periodEnd}.pdf`;
   a.click();

   URL.revokeObjectURL(url);
  }catch(e){
   alert(e.message);
  }finally{
   setFeeInvoiceDraftPdfBusy(false);
  }
 }

 async function downloadFeeInvoicePdf(invoice){
  try{
   const r=await fetch(
    `${API_BASE}/api/admin/fee-invoices/${invoice.id}/pdf`,
    {
     headers:{
      Authorization:`Bearer ${token}`
     }
    }
   );

   if(!r.ok){
    let message='Could not download invoice PDF';

    try{
     const j=await r.json();
     message=j.error||message;
    }catch{}

    throw new Error(message);
   }

   const blob=await r.blob();
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');

   a.href=url;
   a.download=`${invoice.invoiceNumber}.pdf`;
   a.click();

   URL.revokeObjectURL(url);
  }catch(e){
   alert(e.message);
  }
 }
 async function sendDraftInvoiceTestEmail(){
  const preview=feeInvoicePreview;

  if(!preview){
   return alert('Preview the draft invoice first.');
  }

  const testEmail=prompt(
   'Enter the email address to receive the TEST draft invoice:',
   me?.email||''
  );

  if(testEmail===null)return;

  const recipient=String(testEmail||'').trim();

  if(!recipient || !recipient.includes('@')){
   return alert('Enter a valid test email address.');
  }

  if(!confirm(
   `Send TEST draft invoice email?\n\n`+
   `To: ${recipient}\n`+
   `Period: ${preview.periodStart} to ${preview.periodEnd}\n`+
   `FaivoPay amount: ${money(preview.faivopayShareTotal)}\n\n`+
   'This will NOT create a final invoice, mark fee records invoiced or send anything to the billing email.'
  ))return;

  setFeeInvoiceTestEmailBusy(true);

  try{
   const j=await api(
    '/api/admin/fee-invoices/preview/test-email',
    {
     method:'POST',
     body:JSON.stringify({
      companyId:companyFinance?.company?.id||'',
      periodStart:preview.periodStart,
      periodEnd:preview.periodEnd,
      billingEmail:preview.billingEmail,
      previewKey:preview.previewKey,
      testEmail:recipient
     })
    }
   );

   alert(
    `Test invoice email sent successfully to ${j.recipient}.\n\nNo final invoice was created.`
   );
  }catch(e){
   if(/draft has changed/i.test(e.message)){
    setFeeInvoicePreview(null);
   }
   alert(e.message);
  }finally{
   setFeeInvoiceTestEmailBusy(false);
  }
 }

 async function sendFeeInvoice(invoice){
  if(!invoice?.id)return;

  if(invoice.emailStatus==='sent'){
   return alert(
    `Invoice ${invoice.invoiceNumber} has already been emailed.`
   );
  }

  if(invoice.emailStatus==='failed'){
   return alert(
    'The previous email attempt failed. Retry is intentionally blocked until the failed delivery has been reviewed.'
   );
  }

  const recipient=invoice.billingEmail||'';

  if(!recipient){
   return alert('This invoice has no billing email.');
  }

  if(!confirm(
   `Send invoice ${invoice.invoiceNumber}?\n\n`+
   `To: ${recipient}\n`+
   `Period: ${invoice.periodStart} to ${invoice.periodEnd}\n`+
   `Amount due: ${money(invoice.faivopayShareTotal)}\n\n`+
   'The final invoice PDF will be attached.\n\n'+
   'This action will be recorded and the same invoice cannot be sent again accidentally.'
  ))return;

  setFeeInvoiceSendBusy(invoice.id);

  try{
   const j=await api(
    `/api/admin/fee-invoices/${invoice.id}/send`,
    {
     method:'POST',
     body:JSON.stringify({
      companyId:companyFinance?.company?.id||''
     })
    }
   );

   await loadFeeInvoices();

   alert(
    `Invoice ${j.invoice.invoiceNumber} was sent successfully to ${j.invoice.billingEmail}.`
   );
  }catch(e){
   await loadFeeInvoices();
   alert(e.message);
  }finally{
   setFeeInvoiceSendBusy(null);
  }
 }

 async function downloadFeesCsv(){try{const r=await fetch(`${API_BASE}/api/admin/fees/csv?status=all`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not export fees');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='FaivoPay-fees.csv';a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}
 async function downloadPaymentPlansCsv(){try{const r=await fetch(`${API_BASE}/api/admin/payment-plans/csv`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not export payment plans');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='FaivoPay-payment-plans.csv';a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}
 async function downloadOfficeCsv(dataset,filename,query=null){try{const qs=query?`?${new URLSearchParams(query).toString()}`:'';const r=await fetch(`${API_BASE}/api/admin/exports/${dataset}.csv${qs}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){let message='Could not export CSV';try{const j=await r.json();message=j.error||message}catch{}throw new Error(message)}const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=filename||`FaivoPay-${dataset}.csv`;a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}

 async function downloadPayoutRunCsv(run){try{const r=await fetch(`${API_BASE}/api/admin/payout-runs/${run.id}/csv`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not export payment run');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`FaivoPay-${run.runType||'payout'}-${run.id}.csv`;a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}

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
 async function updateSuperAdmin(u,enabled){
  const action=enabled?'grant':'revoke';
  if(!confirm(`${enabled?'Grant':'Revoke'} Super Admin access for ${u.name} (${u.email})?`))return;
  try{
   await api(`/api/admin/staff/${u.id}/super-admin`,{
    method:'PATCH',
    body:JSON.stringify({enabled})
   });
   await loadStaff();
  }catch(e){
   alert(e.message);
  }
 }
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
 async function addLiveTestDriver(driverId){
  if(!driverId)return;

  setLiveTestBusy(true);

  try{
   await api('/api/admin/live-test/drivers',{
    method:'POST',
    body:JSON.stringify({driverId:String(driverId)})
   });

   setLiveTest(await api('/api/admin/live-test'));
  }catch(e){
   alert(e.message);
  }finally{
   setLiveTestBusy(false);
  }
 }

 async function toggleLiveTestDriver(driver,enabled){
  if(!driver?.driverId)return;

  const verb=enabled?'enable':'disable';

  if(!confirm(
   `${enabled?'Enable':'Disable'} callsign ${driver.callsign||driver.driverId} for Live Data Test Lab?\n\n`+
   'Live Autocab writes will remain disabled.'
  ))return;

  setLiveTestBusy(true);

  try{
   await api(`/api/admin/live-test/drivers/${driver.driverId}`,{
    method:'PATCH',
    body:JSON.stringify({enabled:Boolean(enabled)})
   });

   setLiveTest(await api('/api/admin/live-test'));
  }catch(e){
   alert(`Could not ${verb} test driver: ${e.message}`);
  }finally{
   setLiveTestBusy(false);
  }
 }

 async function toggleLiveTestWrites(driver,enabled){
  if(!driver?.driverId)return;

  if(
   String(driver.driverId)!=='1112'||
   String(driver.callsign)!=='9997'
  ){
   alert(
    'Live writes are restricted to callsign 9997 / Autocab ID 1112.'
   );
   return;
  }

  if(enabled){
   const phrase=prompt(
    'ARM LIVE AUTOCAB WRITES\n\n'+
    'This does NOT send a transaction. It only arms the controlled test gate for driver 9997.\n\n'+
    'Type exactly:\nENABLE LIVE WRITES 9997'
   );

   if(phrase!=='ENABLE LIVE WRITES 9997'){
    if(phrase!==null){
     alert('Confirmation phrase did not match.');
    }
    return;
   }
  }else{
   if(!confirm(
    'Disable live Autocab writes for callsign 9997?'
   ))return;
  }

  setLiveTestBusy(true);

  try{
   await api(
    `/api/admin/live-test/drivers/${driver.driverId}`,
    {
     method:'PATCH',
     body:JSON.stringify({
      liveWriteEnabled:Boolean(enabled)
     })
    }
   );

   setLiveTest(await api('/api/admin/live-test'));

   const history=
    await api('/api/admin/live-test/events');

   setLiveTestEvents(history.events||[]);

  }catch(e){
   alert(
    `Could not ${enabled?'enable':'disable'} live writes: ${e.message}`
   );
  }finally{
   setLiveTestBusy(false);
  }
 }

 async function snapshotLiveTestDriver(driver){
  if(!driver?.driverId || !driver?.enabled)return;

  if(!confirm(
   `Run a read-only live Autocab snapshot for callsign ${driver.callsign||driver.driverId}?\n\n`+
   'This sends one driver-account read request to Autocab. '+
   'It will not change Autocab, FaivoPay balances, the driver cache or any payment records.'
  ))return;

  setLiveTestSnapshotBusy(String(driver.driverId));

  try{
   const result=await api(
    `/api/admin/live-test/drivers/${driver.driverId}/snapshot`,
    {method:'POST'}
   );

   setLiveTestSnapshot(result);

   const history=await api('/api/admin/live-test/events');
   setLiveTestEvents(history.events||[]);
  }catch(e){
   alert(`Live snapshot failed: ${e.message}`);

   try{
    const history=await api('/api/admin/live-test/events');
    setLiveTestEvents(history.events||[]);
   }catch{}
  }finally{
   setLiveTestSnapshotBusy('');
  }
 }

 async function simulateLiveTestMonday(driver){
  if(!driver?.driverId || !driver?.enabled)return;

  if(!confirm(
   `Simulate the Monday Run for callsign ${driver.callsign||driver.driverId}?\n\n`+
   'FaivoPay will fetch one fresh read-only Autocab driver-account record and '+
   'calculate what the Monday Run would propose using current FaivoPay settings.\n\n'+
   'NO payout, payment request, Autocab adjustment, payment-plan change or notification will be created.'
  ))return;

  setLiveTestSimulationBusy(String(driver.driverId));

  try{
   const result=await api(
    `/api/admin/live-test/drivers/${driver.driverId}/simulate-monday`,
    {method:'POST'}
   );

   setLiveTestSimulation(result);

   const history=await api('/api/admin/live-test/events');
   setLiveTestEvents(history.events||[]);
  }catch(e){
   alert(`Monday simulation failed: ${e.message}`);

   try{
    const history=await api('/api/admin/live-test/events');
    setLiveTestEvents(history.events||[]);
   }catch{}
  }finally{
   setLiveTestSimulationBusy('');
  }
 }

 async function previewLiveTestAutocabWrite(driver){
  if(!driver?.driverId || !driver?.enabled)return;

  const entered=
   String(liveTestWritePreviewBalance||'').trim();

  const hypothetical=
   entered===''?null:Number(entered);

  if(
   entered!=='' &&
   !Number.isFinite(hypothetical)
  ){
   alert(
    'Enter a valid hypothetical Previous Balance or leave it blank.'
   );
   return;
  }

  const balanceText=
   entered===''
    ?'the fresh live Autocab Previous Balance'
    :`a hypothetical Previous Balance of £${hypothetical.toFixed(2)}`;

  if(!confirm(
   `Preview the exact Autocab write for callsign ${driver.callsign||driver.driverId}?\n\n`+
   `FaivoPay will use ${balanceText} and calculate the Monday outcome.\n\n`+
   'PREVIEW ONLY — no Autocab adjustment, payout, cache change, provider payment or notification will be created.'
  ))return;

  setLiveTestWritePreviewBusy(String(driver.driverId));

  try{
   const result=await api(
    `/api/admin/live-test/drivers/${driver.driverId}/autocab-write-preview`,
    {
     method:'POST',
     body:JSON.stringify({
      previousBalance:
       entered===''?null:hypothetical
     })
    }
   );

   setLiveTestWritePreview(result);

   const history=
    await api('/api/admin/live-test/events');

   setLiveTestEvents(history.events||[]);

  }catch(e){
   alert(`Autocab write preview failed: ${e.message}`);

   try{
    const history=
     await api('/api/admin/live-test/events');

    setLiveTestEvents(history.events||[]);
   }catch{}

  }finally{
   setLiveTestWritePreviewBusy('');
  }
 }

 async function prepareLiveTestCredit(driver){
  if(
   !driver?.enabled||
   !driver?.liveWriteEnabled||
   String(driver.driverId)!=='1112'||
   String(driver.callsign)!=='9997'
  ){
   alert(
    'The controlled £1 credit can only be prepared while live writes are armed for callsign 9997 / Autocab ID 1112.'
   );
   return;
  }

  if(!confirm(
   'Prepare the controlled £1 live-credit preview for callsign 9997?\n\n'+
   'This step performs a fresh READ ONLY Autocab account lookup. '+
   'It does not change any Autocab balance.'
  ))return;

  setLiveTestCreditBusy(String(driver.driverId));
  setLiveTestCreditResult(null);

  try{
   const result=await api(
    `/api/admin/live-test/drivers/${driver.driverId}/live-credit-preview`,
    {method:'POST'}
   );

   setLiveTestCreditPreview(result);

   const history=
    await api('/api/admin/live-test/events');

   setLiveTestEvents(history.events||[]);

  }catch(e){
   alert(`Could not prepare £1 credit test: ${e.message}`);

   try{
    const history=
     await api('/api/admin/live-test/events');

    setLiveTestEvents(history.events||[]);
   }catch{}

  }finally{
   setLiveTestCreditBusy('');
  }
 }

 async function executeLiveTestCredit(preview){
  if(!preview?.previewEventId){
   alert('A valid controlled live-credit preview is required.');
   return;
  }

  const phrase=prompt(
   'FINAL LIVE AUTOCAB WRITE CONFIRMATION\n\n'+
   'This will send a REAL £1.00 CREDIT to Autocab driver 9997 / ID 1112.\n\n'+
   'FaivoPay will re-read the live balance and refuse the write if it has changed.\n\n'+
   'Type exactly:\nCREDIT £1 TO 9997'
  );

  if(phrase!=='CREDIT £1 TO 9997'){
   if(phrase!==null){
    alert('Confirmation phrase did not match. Nothing was sent.');
   }
   return;
  }

  if(!confirm(
   'FINAL CHECK\n\n'+
   'Send ONE £1.00 credit to Autocab driver 9997 now?\n\n'+
   'This is a real Autocab balance adjustment.'
  ))return;

  setLiveTestCreditBusy('1112');

  try{
   const result=await api(
    '/api/admin/live-test/drivers/1112/live-credit-execute',
    {
     method:'POST',
     body:JSON.stringify({
      previewEventId:preview.previewEventId,
      confirmation:'CREDIT £1 TO 9997'
     })
    }
   );

   setLiveTestCreditResult(result);
   setLiveTestCreditPreview(null);

   setLiveTest(await api('/api/admin/live-test'));

   const history=
    await api('/api/admin/live-test/events');

   setLiveTestEvents(history.events||[]);

  }catch(e){
   alert(
    'Controlled live-credit attempt stopped:\n\n'+
    e.message+
    '\n\nDo not retry automatically. Review Live Test history and Autocab before taking another action.'
   );

   setLiveTestCreditPreview(null);

   try{
    setLiveTest(await api('/api/admin/live-test'));

    const history=
     await api('/api/admin/live-test/events');

    setLiveTestEvents(history.events||[]);
   }catch{}

  }finally{
   setLiveTestCreditBusy('');
  }
 }

 async function prepareLiveTestReversal(driver){
  if(
   !driver?.enabled||
   !driver?.liveWriteEnabled||
   String(driver.driverId)!=='1112'||
   String(driver.callsign)!=='9997'
  ){
   alert(
    'The £1 reversal can only be prepared while live writes are armed for callsign 9997 / Autocab ID 1112.'
   );
   return;
  }

  if(!confirm(
   'Prepare the compensating £1 debit preview for callsign 9997?\n\n'+
   'This step performs a fresh READ ONLY Autocab lookup and verifies '+
   'that the original £1 credit was completed.\n\n'+
   'Nothing will be debited during this preview.'
  ))return;

  setLiveTestReversalBusy(String(driver.driverId));
  setLiveTestReversalResult(null);

  try{
   const result=await api(
    `/api/admin/live-test/drivers/${driver.driverId}/live-reversal-preview`,
    {method:'POST'}
   );

   setLiveTestReversalPreview(result);

   const history=
    await api('/api/admin/live-test/events');

   setLiveTestEvents(history.events||[]);

  }catch(e){
   alert(`Could not prepare £1 reversal: ${e.message}`);

   try{
    const history=
     await api('/api/admin/live-test/events');

    setLiveTestEvents(history.events||[]);
   }catch{}

  }finally{
   setLiveTestReversalBusy('');
  }
 }

 async function executeLiveTestReversal(preview){
  if(!preview?.previewEventId){
   alert('A valid controlled reversal preview is required.');
   return;
  }

  const phrase=prompt(
   'FINAL LIVE AUTOCAB REVERSAL CONFIRMATION\n\n'+
   'This will send a REAL £1.00 DEBIT to Autocab driver 9997 / ID 1112.\n\n'+
   'It compensates for the verified £1 Live Test credit.\n\n'+
   'Type exactly:\nDEBIT £1 FROM 9997'
  );

  if(phrase!=='DEBIT £1 FROM 9997'){
   if(phrase!==null){
    alert('Confirmation phrase did not match. Nothing was sent.');
   }
   return;
  }

  if(!confirm(
   'FINAL CHECK\n\n'+
   'Send ONE £1.00 debit to Autocab driver 9997 now?\n\n'+
   'Expected Current Balance: £1.00 → £0.00'
  ))return;

  setLiveTestReversalBusy('1112');

  try{
   const result=await api(
    '/api/admin/live-test/drivers/1112/live-reversal-execute',
    {
     method:'POST',
     body:JSON.stringify({
      previewEventId:preview.previewEventId,
      confirmation:'DEBIT £1 FROM 9997'
     })
    }
   );

   setLiveTestReversalResult(result);
   setLiveTestReversalPreview(null);

   setLiveTest(await api('/api/admin/live-test'));

   const history=
    await api('/api/admin/live-test/events');

   setLiveTestEvents(history.events||[]);

  }catch(e){
   alert(
    'Controlled Live Test reversal stopped:\n\n'+
    e.message+
    '\n\nDo not retry automatically. Review Live Test history and Autocab before taking another action.'
   );

   setLiveTestReversalPreview(null);

   try{
    setLiveTest(await api('/api/admin/live-test'));

    const history=
     await api('/api/admin/live-test/events');

    setLiveTestEvents(history.events||[]);
   }catch{}

  }finally{
   setLiveTestReversalBusy('');
  }
 }

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
     <button className="secondary" onClick={()=>downloadPayoutRunCsv(r)}><FileClock/>Export run CSV</button>
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
   const adminDataExports=[
    ['Transactions','transactions','FaivoPay-transactions.csv'],
    ['Customer payments','customer-payments','FaivoPay-customer-payments.csv'],
    ['Monday settlements','monday-settlements','FaivoPay-monday-settlements.csv'],
    ['Early payouts','early-payouts','FaivoPay-early-payouts.csv'],
    ['Outstanding payments','outstanding','FaivoPay-outstanding.csv'],
    ['All payment requests','payment-requests','FaivoPay-payment-requests.csv'],
    ['All payouts','payouts','FaivoPay-payouts.csv'],
    ['Payout runs','payout-runs','FaivoPay-payout-runs.csv'],
    ['Drivers','drivers','FaivoPay-drivers.csv'],
    ['Weekly invoices','fee-invoices','FaivoPay-weekly-invoices.csv'],
    ['Weekly invoice items','fee-invoice-items','FaivoPay-weekly-invoice-items.csv'],
    ['Refunds','refunds','FaivoPay-refunds.csv'],
    ['Autocab adjustments','adjustments','FaivoPay-autocab-adjustments.csv'],
    ['Communications','communications','FaivoPay-communications.csv'],
    ['Payment-plan allocations','plan-allocations','FaivoPay-plan-allocations.csv'],
    ['Users & access','access','FaivoPay-access.csv'],
    ['Audit log','audit','FaivoPay-audit.csv']
   ];

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
        <div>
         <span>Proposed gross outgoing</span>
         <b>{money(weeklyProposedBeforeFees)}</b>
         <small>Pending + approved drivers before deductions</small>
        </div>

        <div>
         <span>Proposed FaivoPay fees</span>
         <b>{money(weeklyProposedWeeklyFees)}</b>
         <small>Weekly fees on proposed payouts</small>
        </div>

        <div>
         <span>Other deductions</span>
         <b>{money(weeklyProposedCarriedCharges)}</b>
         <small>Proposed carried charges</small>
        </div>

        <div>
         <span>Plan deductions</span>
         <b>{money(weeklyProposedPlanDeductions)}</b>
         <small>Proposed repayment-plan deductions</small>
        </div>

        <div>
         <span>Proposed net outgoing</span>
         <b>{money(weeklyProposedTotal)}</b>
         <small>Pending + approved driver payouts</small>
        </div>

        <div>
         <span>Drivers to pay</span>
         <b>{weeklyProposed.length}</b>
         <small>{weeklyPending.length} pending · {weeklyApproved.length} approved</small>
        </div>

        <div>
         <span>Incoming due</span>
         <b>{money(weeklyIncomingDueTotal)}</b>
         <small>{weeklyActiveCollections.length} driver{weeklyActiveCollections.length===1?'':'s'} billed</small>
        </div>

        <div>
         <span>Incoming cleared</span>
         <b>{money(weeklyIncomingClearedTotal)}</b>
         <small>{weeklyPaidCollections.length} payment{weeklyPaidCollections.length===1?'':'s'} received</small>
        </div>

        <div>
         <span>Outstanding incoming</span>
         <b>{money(weeklyIncomingOutstandingTotal)}</b>
         <small>{weeklyUnpaidCollections.length} unpaid request{weeklyUnpaidCollections.length===1?'':'s'}</small>
        </div>

        <div>
         <span>Incoming before fees</span>
         <b>{money(weeklyIncomingBeforeFees)}</b>
         <small>Driver balances before added charges</small>
        </div>

        <div>
         <span>Incoming fees & charges</span>
         <b>{money(weeklyIncomingFeesCharges)}</b>
         <small>
          {money(weeklyIncomingWeeklyFees)} fees · {money(weeklyIncomingCarriedCharges)} carried
         </small>
        </div>

        <div>
         <span>Net cash position</span>
         <b>{money(weeklyIncomingClearedTotal-weeklyApprovedTotal)}</b>
         <small>Cleared incoming less approved outgoing</small>
        </div>
       </div>
      </section>

      {activeMondayCancelledBatch&&<div className="operatorWarning blue"><AlertTriangle/><div><b>Previous payment batch cancelled safely</b><span>The batch was cancelled before release. This Monday settlement remains open so the approved drivers can be reviewed and placed into a corrected payment run.</span></div></div>}

      {mondayWizardIndex===2&&<section className="panel wizardStageCard">
       <div className="panelHead"><div><span className="sectionKicker">STEP 3</span><h3>Payment-plan deductions</h3><p>Apply amounts reserved from positive Monday balances before driver payouts.</p></div><div className="rowActions"><button className="secondary" onClick={()=>downloadOfficeCsv('monday-plan-deductions',null,{runId:activeMonday.id})}><FileClock/>Export CSV</button><div className="compactStatus"><Pill tone={pendingPlanAllocations.length?'warn':'good'}>{pendingPlanAllocations.length} pending</Pill>{applyingPlanAllocations.length>0&&<Pill tone="warn">{applyingPlanAllocations.length} applying</Pill>}{failedPlanAllocations.length>0&&<Pill tone="bad">{failedPlanAllocations.length} review</Pill>}<Pill tone="good">{appliedPlanAllocations.length} applied</Pill></div></div></div>
       {mondayPlanAllocations.length?<><div className="mondayFinanceOther"><div><span>Total deductions</span><b>{money(mondayPlanAllocationTotal)}</b></div><div><span>Applied</span><b>{money(mondayPlanAllocationAppliedTotal)}</b></div><div><span>Remaining</span><b>{money(Math.max(0,mondayPlanAllocationTotal-mondayPlanAllocationAppliedTotal))}</b></div></div>
       <div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Instalment</th><th>Monday deduction</th><th>Status</th><th>Details</th><th>Action</th></tr></thead><tbody>{mondayPlanAllocations.map(x=>{const driver=drivers.find(d=>String(d.driverId)===String(x.driverId));return <tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><div><b>{driver?.fullName||`Driver ${x.driverId}`}</b><small>Payment plan</small></div></div></td><td>{money(x.scheduledAmount)}</td><td><b>{money(x.allocatedAmount)}</b></td><td><Pill tone={x.status==='applied'?'good':x.error?'bad':'warn'}>{x.status}</Pill></td><td>{x.error?<small className="reasonText">{x.error}</small>:x.status==='applied'?<small className="reasonText">Applied to payment plan</small>:x.status==='applying'?<small className="reasonText">Processing or manual review required</small>:<small className="reasonText">Awaiting application</small>}</td><td><div className="compactActions">{canMoney&&!activeMonday.payoutRunId&&x.status==='pending'&&<button className="mini success" disabled={Boolean(planAllocationBusy)} onClick={()=>applyMondayPlanAllocation(x)}>{planAllocationBusy===x.id?'Applying…':'Apply deduction'}</button>}{x.status==='applied'&&<span className="tinyNote">Complete</span>}{x.status==='applying'&&<span className="tinyNote">Review</span>}</div></td></tr>})}</tbody></table></div></>:<div className="emptyInline good"><CheckCircle2/>No payment-plan deductions are required.</div>}
      </section>}

      {[3,4].includes(mondayWizardIndex)&&<>
       <section className="panel wizardStageCard">
        <div className="panelHead">
         <div><span className="sectionKicker">{mondayWizardIndex===3?'STEP 4':'STEP 5'}</span><h3>{mondayWizardIndex===3?'Review driver payouts':'Create payment run'}</h3><p>{mondayWizardIndex===3?'Approve or exclude the drivers to be paid.':'Review the final approved list and create the locked payment run.'}</p></div>
         <div className="rowActions">
          <button className="secondary" onClick={()=>downloadOfficeCsv('monday-drivers-to-pay',null,{runId:activeMonday.id})}><FileClock/>Export payouts</button>
          <button className="secondary" onClick={()=>downloadOfficeCsv('monday-carry-forward',null,{runId:activeMonday.id})}><FileClock/>Export carry forward</button>
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
        <div className="panelHead"><div><h3>Drivers owing</h3><p>Collection requests created from negative Previous Balances.</p></div><div className="rowActions"><button className="secondary" onClick={()=>downloadOfficeCsv('monday-drivers-owing',null,{runId:activeMonday.id})}><FileClock/>Export CSV</button><button className="secondary" onClick={()=>go('outstanding')}>Open Outstanding</button></div></div>
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
         <div className="rowActions">
          <button className="secondary" onClick={()=>downloadOfficeCsv('early-payout-requests','FaivoPay-Early-Payout-Requests.csv')}><FileClock/>Export CSV</button>
          {canMoney&&sett.earlyPayoutRequests.some(x=>x.status==='approved')&&<button className="primary" onClick={createEarlyBatch}><Send/>Create approved payment run</button>}
         </div>
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

{view==='fees'&&<>
     <section className="officePageIntro">
      <div>
       <span>REVENUE & RECONCILIATION</span>
       <h2>Fees & billing</h2>
       <p>
        Every FaivoPay fee is recorded separately and invoiced through
        a durable weekly invoice so fee records cannot be billed twice.
       </p>
      </div>

      <div className="rowActions">
       <button className="secondary" onClick={downloadFeesCsv}>
        Export CSV
       </button>

       {canMoney&&
        <button
         className="primary"
         disabled={
          feeInvoicePreviewBusy||
          feeInvoiceBusy||
          Number(fees?.summary?.uninvoiced||0)<=0
         }
         onClick={()=>previewWeeklyFeeInvoice('auto')}
        >
         <FileClock/>
         {feeInvoicePreviewBusy
          ?'Preparing draft…'
          :feeInvoicePreview
           ?'Refresh draft'
           :'Preview draft invoice'}
        </button>
       }
      </div>
     </section>

     <section className="officeStats four">
      <Stat
       icon={BadgePoundSterling}
       label="Gross fees"
       value={money(fees?.summary?.gross||0)}
       sub="All recorded fees"
      />
      <Stat
       icon={WalletCards}
       label="FaivoPay share"
       value={money(fees?.summary?.fleetpay||0)}
       sub="Your share"
      />
      <Stat
       icon={Users}
       label="Taxi company share"
       value={money(fees?.summary?.taxi||0)}
       sub="Their share"
      />
      <Stat
       icon={FileClock}
       label="FaivoPay uninvoiced"
       value={money(fees?.summary?.uninvoiced||0)}
       sub="Eligible fees not yet invoiced"
      />
     </section>

     <section className="panel invoiceControlPanel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">WEEKLY INVOICING</span>
        <h3>Invoice control</h3>
        <p>
         Preview the completed week first. Final creation is only available
         after the exact fee totals have been reviewed.
        </p>
       </div>
       <Pill tone="warn">Manual mode</Pill>
      </div>

      <div className="invoiceControlGrid">
       <div>
        <span>Billing company</span>
        <b>{companyFinance?.company?.name||'—'}</b>
       </div>
       <div>
        <span>Billing email</span>
        <b>{companyFinance?.weeklyInvoicing?.billingEmail||'Not configured'}</b>
       </div>
       <div>
        <span>Automation</span>
        <b>Not active</b>
       </div>
       <div>
        <span>Email delivery</span>
        <b>Not active</b>
       </div>
      </div>

      <div className="operatorWarning blue">
       <Info/>
       <div>
        <b>Safe validation mode</b>
        <span>
         Drafts do not create an invoice, allocate fee records or send email.
         Final creation remains a separate confirmed action.
        </span>
       </div>
      </div>

      {feeInvoicePreview&&
       <div className="invoiceDraftReview">
        <div className="invoiceDraftHead">
         <div>
          <span className="sectionKicker">DRAFT REVIEW</span>
          <h3>
           {feeInvoicePreview.finalInvoiceEligible
            ?'Completed week'
            :'Current week draft'}
          </h3>
          <p>
           {feeInvoicePreview.periodStart} to {feeInvoicePreview.periodEnd}
          </p>
         </div>

         <Pill tone="warn">
          {feeInvoicePreview.finalInvoiceEligible
           ?'DRAFT — READY FOR FINAL REVIEW'
           :'CURRENT WEEK DRAFT — NOT FINAL'}
         </Pill>
        </div>

        <div className="invoiceDraftMetrics">
         <div>
          <span>Fee records</span>
          <b>{feeInvoicePreview.feeCount}</b>
         </div>
         <div>
          <span>Gross fees</span>
          <b>{money(feeInvoicePreview.grossFeeTotal)}</b>
         </div>
         <div>
          <span>FaivoPay due</span>
          <b>{money(feeInvoicePreview.faivopayShareTotal)}</b>
         </div>
         <div>
          <span>Taxi company share</span>
          <b>{money(feeInvoicePreview.taxiCompanyShareTotal)}</b>
         </div>
        </div>

        <div className="invoiceDraftDetails">
         <div>
          <span>Billing company</span>
          <b>{companyFinance?.company?.name||'—'}</b>
         </div>
         <div>
          <span>Billing email</span>
          <b>{feeInvoicePreview.billingEmail||'—'}</b>
         </div>
        </div>

        <div className="operatorWarning">
         <Info/>
         <div>
          <b>No accounting records have changed</b>
          <span>
           {feeInvoicePreview.finalInvoiceEligible
            ?'If a fee or refund changes after this preview, FaivoPay will block final creation and require a fresh draft.'
            :'This draft includes the current week-to-date only. Final invoice creation remains blocked until the week is fully completed.'}
          </span>
         </div>
        </div>

        <div className="invoiceDraftActions">
         <button
          className="secondary"
          disabled={
           feeInvoiceDraftPdfBusy||
           feeInvoiceBusy||
           feeInvoiceTestEmailBusy
          }
          onClick={downloadDraftFeeInvoicePdf}
         >
          <FileClock/>
          {feeInvoiceDraftPdfBusy?'Preparing PDF…':'Download draft PDF'}
         </button>

         {canMoney&&
          <button
           className="secondary"
           disabled={
            feeInvoiceTestEmailBusy||
            feeInvoiceDraftPdfBusy||
            feeInvoiceBusy
           }
           onClick={sendDraftInvoiceTestEmail}
          >
           <Mail/>
           {feeInvoiceTestEmailBusy
            ?'Sending test…'
            :'Send test email'}
          </button>
         }

         {feeInvoicePreview.completePeriod&&
          <button
           className="secondary"
           disabled={
            feeInvoicePreviewBusy||
            feeInvoiceDraftPdfBusy||
            feeInvoiceBusy||
            feeInvoiceTestEmailBusy
           }
           onClick={()=>previewWeeklyFeeInvoice('current')}
          >
           <CalendarDays/>
           View current week draft
          </button>
         }

         {canMoney&&
          <button
           className="primary"
           disabled={
            feeInvoiceBusy||
            feeInvoiceDraftPdfBusy||
            !feeInvoicePreview.finalInvoiceEligible
           }
           onClick={createWeeklyFeeInvoice}
          >
           <ShieldCheck/>
           {feeInvoiceBusy
            ?'Creating final invoice…'
            :feeInvoicePreview.finalInvoiceEligible
             ?'Create final invoice'
             :'Final invoice available after week close'}
          </button>
         }
        </div>
       </div>
      }
     </section>

     <section className="panel invoiceHistoryPanel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">INVOICE HISTORY</span>
        <h3>Weekly fee invoices</h3>
        <p>
         Each invoice contains an immutable snapshot of the fee records
         included when it was created.
        </p>
       </div>

       <button className="mini" onClick={loadFeeInvoices}>
        <RefreshCw/>
        Refresh
       </button>
      </div>

      {feeInvoices.length
       ?<div className="tableWrap proTable">
         <table>
          <thead>
           <tr>
            <th>Invoice</th>
            <th>Period</th>
            <th>Fee records</th>
            <th>Gross fees</th>
            <th>FaivoPay due</th>
            <th>Taxi company</th>
            <th>Status</th>
            <th>Email</th>
            <th>PDF</th>
           </tr>
          </thead>
          <tbody>
           {feeInvoices.map(invoice=>
            <tr key={invoice.id}>
             <td>
              <b>{invoice.invoiceNumber}</b>
              <small>{dt(invoice.createdAt)}</small>
             </td>
             <td>
              <b>{invoice.periodStart}</b>
              <small>to {invoice.periodEnd}</small>
             </td>
             <td>{invoice.feeCount}</td>
             <td><b>{money(invoice.grossFeeTotal)}</b></td>
             <td><b>{money(invoice.faivopayShareTotal)}</b></td>
             <td>{money(invoice.taxiCompanyShareTotal)}</td>
             <td>
              <Pill tone={statusTone(invoice.status)}>
               {String(invoice.status||'created').replaceAll('_',' ')}
              </Pill>
             </td>
             <td>
              <div className="bankTableCell">
               <Pill
                tone={
                 invoice.emailStatus==='sent'
                  ?'good'
                  :invoice.emailStatus==='failed'
                   ?'bad'
                   :invoice.emailStatus==='sending'
                    ?'warn'
                    :'neutral'
                }
               >
                {String(invoice.emailStatus||'not_sent').replaceAll('_',' ')}
               </Pill>

               {invoice.emailedAt&&
                <small>{dt(invoice.emailedAt)}</small>
               }

               {canMoney&&invoice.emailStatus==='not_sent'&&
                <button
                 className="mini"
                 disabled={feeInvoiceSendBusy===invoice.id}
                 onClick={()=>sendFeeInvoice(invoice)}
                >
                 <Send/>
                 {feeInvoiceSendBusy===invoice.id
                  ?'Sending…'
                  :'Send invoice'}
                </button>
               }

               {invoice.emailStatus==='failed'&&
                <small>Retry blocked pending review</small>
               }
              </div>
             </td>
             <td>
              <button
               className="mini"
               onClick={()=>downloadFeeInvoicePdf(invoice)}
              >
               <FileClock/>
               Download
              </button>
             </td>
            </tr>
           )}
          </tbody>
         </table>
        </div>
       :<div className="emptyState compact invoiceEmptyState">
         <FileClock/>
         <h3>No invoices created yet</h3>
         <p>
          Create the first weekly invoice when you are ready to test
          the invoice workflow.
         </p>
        </div>
      }
     </section>

     <section className="panel">
      <div className="panelHead">
       <div>
        <span className="sectionKicker">FEE LEDGER</span>
        <h3>Fee transactions</h3>
        <p>Source fee records and their invoice allocation.</p>
       </div>
      </div>

      <div className="tableWrap proTable">
       <table>
        <thead>
         <tr>
          <th>Date</th>
          <th>Fee</th>
          <th>Driver</th>
          <th>Gross</th>
          <th>FaivoPay</th>
          <th>Taxi company</th>
          <th>Status</th>
          <th>Invoice</th>
         </tr>
        </thead>
        <tbody>
         {fees.fees.map(x=>
          <tr key={x.id}>
           <td>{dt(x.createdAt)}</td>
           <td>
            <b>{String(x.feeType).replaceAll('_',' ')}</b>
            <small>{x.description}</small>
           </td>
           <td>{x.callsign||'—'}</td>
           <td>{money(x.grossFee)}</td>
           <td><b>{money(x.fleetpayShare)}</b></td>
           <td>{money(x.taxiCompanyShare)}</td>
           <td>
            <Pill tone={statusTone(x.status)}>{x.status}</Pill>
           </td>
           <td>{x.invoiceRef||'—'}</td>
          </tr>
         )}
        </tbody>
       </table>
      </div>
     </section>
    </>}
    {view==='demo'&&isPlatformAdmin&&<DemoLab demo={demo} loadDemo={loadDemo} resetDemo={resetDemo} action={demoAction} demoEmail={demoEmail} setDemoEmail={setDemoEmail} demoMobile={demoMobile} setDemoMobile={setDemoMobile} sendEmail={demoSendEmail} sendSms={demoSendSms}/>}
    {view==='liveTest'&&isPlatformAdmin&&<LiveTestLab liveTest={liveTest} liveTestEvents={liveTestEvents} liveTestSnapshot={liveTestSnapshot} liveTestSimulation={liveTestSimulation} loadLiveTest={loadLiveTest} addDriver={addLiveTestDriver} toggleDriver={toggleLiveTestDriver} toggleLiveWrites={toggleLiveTestWrites} snapshotDriver={snapshotLiveTestDriver} snapshotBusyDriver={liveTestSnapshotBusy} simulateMonday={simulateLiveTestMonday} simulationBusyDriver={liveTestSimulationBusy} liveTestWritePreview={liveTestWritePreview} previewAutocabWrite={previewLiveTestAutocabWrite} writePreviewBusyDriver={liveTestWritePreviewBusy} writePreviewBalance={liveTestWritePreviewBalance} setWritePreviewBalance={setLiveTestWritePreviewBalance} liveCreditPreview={liveTestCreditPreview} prepareLiveCredit={prepareLiveTestCredit} executeLiveCredit={executeLiveTestCredit} liveCreditBusy={liveTestCreditBusy} liveCreditResult={liveTestCreditResult} liveReversalPreview={liveTestReversalPreview} prepareLiveReversal={prepareLiveTestReversal} executeLiveReversal={executeLiveTestReversal} liveReversalBusy={liveTestReversalBusy} liveReversalResult={liveTestReversalResult} busy={liveTestBusy}/>}
    {view==='drivers'&&<><section className="officePageIntro"><div><span>AUTOCAB + PAYOUT READINESS</span><h2>Driver accounts</h2><p>Balances and payout-bank readiness in one place. Full bank account numbers are never exposed in the normal office view.</p></div><button className="secondary" onClick={syncNow}><RefreshCw className={loading?'spin':''}/>Sync Autocab</button></section><section className="officeStats three"><Stat icon={Banknote} label="Bank ready" value={meta.bankReady??drivers.filter(d=>d.bankAccount?.ready).length} sub="Payout details saved"/><Stat icon={AlertTriangle} label="Missing bank details" value={meta.bankMissing??drivers.filter(d=>!d.bankAccount?.ready).length} sub="Cannot be released for payout"/><Stat icon={Clock3} label="Recently changed" value={meta.bankRecentlyChanged??drivers.filter(d=>d.bankAccount?.changedRecently).length} sub="Changed in the last 7 days"/></section><div className="driverToolbar"><div className="searchBox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search callsign, name, mobile, email or bank ending…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All drivers</option><option value="bank_ready">Bank ready</option><option value="bank_missing">Missing bank details</option><option value="bank_recent">Recently changed bank</option><option value="payout_excluded">Payout excluded</option><option value="positive">Positive balance</option><option value="negative">Negative balance</option><option value="unmatched">Unmatched</option></select></div><section className="panel driverPanel"><div className="tableWrap proTable"><table><thead><tr><th>Callsign</th><th>Driver</th><th>Previous</th><th>Current</th><th>Payout account</th><th>Payout status</th><th>Last processed</th></tr></thead><tbody>{filtered.map(d=>{const b=d.bankAccount||{};return <tr key={d.driverId} onClick={()=>setSelected(d)}><td><span className="callsign">{d.callsign}</span></td><td><b>{d.fullName}</b><small>{d.email||d.mobile||`Driver ${d.driverId}`}</small></td><td>{money(d.previousBalance)}</td><td><b className={(d.currentBalance??0)<0?'negative':''}>{money(d.currentBalance)}</b></td><td><div className="bankTableCell"><Pill tone={bankTone(b)}>{b.label||'Bank details missing'}</Pill>{b.ready&&<small>{b.accountNumberMasked} · {b.sortCodeMasked}</small>}</div></td><td><div className="bankTableCell"><Pill tone={d.payoutExcluded?'bad':'good'}>{d.payoutExcluded?'Excluded':'Enabled'}</Pill>{d.payoutExcluded&&<small>{d.payoutExclusionReason||'Persistent exclusion'}</small>}</div></td><td>{dt(d.lastProcessed)}</td></tr>})}</tbody></table></div></section></>}
    {view==='access'&&<><section className="officePageIntro"><div><span>IDENTITY & PERMISSIONS</span><h2>Users & access</h2><p>Office accounts use mandatory authenticator MFA. Roles limit who can move money or change settings.</p></div>{isAdmin&&<button className="primary" onClick={()=>setShowNewStaff(!showNewStaff)}><UserCheck/>Add office user</button>}</section>{isAdmin&&showNewStaff&&<section className="panel"><form className="staffForm" onSubmit={createStaff}><label>Name<input required value={newStaff.name} onChange={e=>setNewStaff({...newStaff,name:e.target.value})}/></label><label>Email<input type="email" required value={newStaff.email} onChange={e=>setNewStaff({...newStaff,email:e.target.value})}/></label><label>Role<select value={newStaff.role} onChange={e=>setNewStaff({...newStaff,role:e.target.value})}><option value="administrator">Administrator</option><option value="finance">Finance</option><option value="office">Office</option><option value="readonly">Read only</option></select></label><label>Temporary password<input type="password" minLength="10" required value={newStaff.password} onChange={e=>setNewStaff({...newStaff,password:e.target.value})}/></label><button className="primary">Create user</button></form></section>}<section className="panel"><div className="panelHead"><div><h3>Office users</h3><p>MFA and role status for each staff account.</p></div><button className="mini" onClick={loadStaff}>Refresh</button></div><div className="tableWrap proTable"><table><thead><tr><th>User</th><th>Role</th><th>Super Admin</th><th>MFA</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{staff.map(u=><tr key={u.id}><td><b>{u.name}</b><small>{u.email}</small></td><td><select value={u.role} onChange={e=>updateStaff(u,{role:e.target.value})} disabled={u.id===me?.id||u.platformAdmin}><option value="administrator">Administrator</option><option value="finance">Finance</option><option value="office">Office</option><option value="readonly">Read only</option></select></td><td><div className="bankTableCell"><Pill tone={u.platformAdmin?'good':'neutral'}>{u.platformAdmin?'Super Admin':'Standard'}</Pill>{isPlatformAdmin&&u.role==='administrator'&&u.active&&u.id!==me?.id&&<button className="mini" onClick={()=>updateSuperAdmin(u,!u.platformAdmin)}>{u.platformAdmin?'Revoke':'Grant'}</button>}</div></td><td><Pill tone={u.mfaEnabled?'good':'warn'}>{u.mfaEnabled?'Enabled':'Setup required'}</Pill></td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.active?'good':'bad'}>{u.active?'Active':'Disabled'}</Pill></td><td>{u.id!==me?.id&&<button className="mini" disabled={u.platformAdmin} onClick={()=>updateStaff(u,{active:!u.active})}>{u.active?'Disable':'Enable'}</button>}</td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelHead"><div><h3>Driver app accounts</h3><p>Registration remains matched to active Autocab driver details.</p></div><button className="mini" onClick={loadDriverUsers}>Refresh</button></div><div className="tableWrap proTable"><table><thead><tr><th>Callsign</th><th>Email</th><th>Created</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{driverUsers.map(u=><tr key={u.id}><td><span className="callsign">{u.callsign}</span></td><td>{u.email}</td><td>{dt(u.createdAt)}</td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.approved?'good':'warn'}>{u.approved?'Approved':'Pending'}</Pill></td><td>{canOffice&&<button className="mini" onClick={()=>setApproval(u,!u.approved)}>{u.approved?'Suspend':'Approve'}</button>}</td></tr>)}</tbody></table></div></section></>}

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

    {view==='security'&&isAdmin&&<><section className="officePageIntro"><div><span>SECURITY CENTRE</span><h2>Authentication & audit</h2><p>Office access requires password plus authenticator verification. Sensitive actions are recorded against the signed-in user.</p></div><div className="secureBadge"><ShieldCheck/><div><b>MFA enforced</b><span>{me?.email}</span></div></div></section><section className="securityCards"><div className="securityCard"><ShieldCheck/><div><span>Current session</span><b>MFA verified</b><small>{me?.role}</small></div></div><div className="securityCard"><KeyRound/><div><span>Authentication</span><b>TOTP authenticator</b><small>Required for every office account</small></div></div><div className="securityCard"><Clock3/><div><span>Session lifetime</span><b>12 hours maximum</b><small>Sign out on shared devices</small></div></div></section><section className="panel"><div className="panelHead"><div><h3>Security history</h3><p>Recent login, MFA and security events.</p></div><button className="mini" onClick={loadSecurity}>Refresh</button></div><div className="securityLogList">{securityLogs.map(l=><div className="securityLog" key={l.id}><div className="logIcon"><ShieldCheck/></div><div><b>{String(l.action).replaceAll('_',' ')}</b><span>{l.actorName||l.actorId||'system'} · {dt(l.createdAt)}</span><small>{[l.actorEmail,l.actorRawId,l.ip].filter(Boolean).join(' · ')||'No additional identity data'}</small></div></div>)}</div></section></>}
    {view==='settings'&&isAdmin&&settings&&<><section className="officePageIntro"><div><span>ADMINISTRATION</span><h2>FaivoPay settings</h2><p>Company configuration, driver and customer payments, invoicing, communications, testing and integrations. Secret values remain encrypted and are never returned to the browser.</p></div><button className="primary" onClick={saveSettings}><Settings/>Save all settings</button></section><div className="settingsSections">

     <section className="panel settingsCardV2 integrationStatusPrimary">
      <div className="settingsHead">
       <Database/>
       <div>
        <span className="sectionKicker">INTEGRATION STATUS</span>
        <h3>Connected services</h3>
        <p>Live status of payment, messaging and Autocab services used by FaivoPay.</p>
       </div>
      </div>

      <div className="integrationGrid">
       <div>
        <b>Autocab</b>
        <span>{integrations?.autocab?.adjustmentsEnabled?'Writes enabled':'Safe mode'}</span>
        <Pill tone={integrations?.autocab?.adjustmentsEnabled?'good':'warn'}>
         {integrations?.autocab?.adjustmentsEnabled?'Connected':'Protected'}
        </Pill>
       </div>

       <div>
        <b>Stripe</b>
        <span>{
         integrations?.stripe?.configured
          ?(integrations.stripe.testMode?'Test mode':'Live mode')
          :'Not configured'
        }</span>
        <Pill tone={integrations?.stripe?.configured?'good':'warn'}>
         {integrations?.stripe?.configured?'Connected':'Setup'}
        </Pill>
       </div>

       <div>
        <b>Wise</b>
        <span>{integrations?.wise?.configured?integrations.wise.environment:'Not configured'}</span>
        <Pill tone={integrations?.wise?.configured?'good':'warn'}>
         {integrations?.wise?.configured?'Connected':'Setup'}
        </Pill>
       </div>

       <div className={integrationStatus?.twilio?.lowBalance?'integrationLowBalance':''}>
        <b>Twilio</b>

        <strong>
         {
          integrationStatus?.twilio?.balance!=null
           ?`${integrationStatus.twilio.currency==='GBP'?'£':''}${Number(integrationStatus.twilio.balance).toFixed(2)}`
           :integrationStatus?.twilio?.configured
            ?'Balance unavailable'
            :'Not configured'
         }
        </strong>

        <span>
         {
          integrationStatus?.twilio?.balance!=null
           ?`${integrationStatus.twilio.currency||''} account balance`
           :integrationStatus?.twilio?.configured
            ?'Account configured'
            :'SMS account requires setup'
         }
        </span>

        <Pill tone={
         integrationStatus?.twilio?.lowBalance
          ?'bad'
          :integrationStatus?.twilio?.connected
           ?'good'
           :'warn'
        }>
         {
          integrationStatus?.twilio?.lowBalance
           ?'Low balance'
           :integrationStatus?.twilio?.connected
            ?'Connected'
            :'Setup'
         }
        </Pill>

        <small>
         Sender: {integrationStatus?.twilio?.sender||'Not configured'}
        </small>

        <small>
         Warning level: {money(Number(integrationStatus?.twilio?.lowBalanceThreshold||0))}
         {' · '}
         Alerts {integrationStatus?.twilio?.lowBalanceAlertsEnabled?'on':'off'}
        </small>

        <small>
         SMS sending {integrationStatus?.twilio?.enabled?'enabled':'disabled'}
        </small>
       </div>
      </div>

      {integrationStatus?.twilio?.lowBalance&&
       <div className="operatorWarning">
        <AlertTriangle/>
        <div>
         <b>Twilio balance is low</b>
         <span>
          Current balance is below the configured warning level of {money(Number(integrationStatus.twilio.lowBalanceThreshold||0))}.
         </span>
        </div>
       </div>
      }
     </section>

     <div className="settingsSectionLabel">
      <span>COMPANY</span>
      <b>{companyFinance?.company?.name||settings.companyName||'Company settings'}</b>
     </div>

     <section className="panel settingsCardV2 companyProfileCard">
      <div className="settingsHead">
       <Settings/>
       <div>
        <h3>Company profile</h3>
        <p>Company identity and operating context used throughout FaivoPay.</p>
       </div>
      </div>

      <div className="settingsInlineMeta">
       <span>Company</span>
       <b>{companyFinance?.company?.name||settings.companyName||'—'}</b>

       <span>Timezone</span>
       <b>{companyFinance?.weeklyInvoicing?.timezone||'Europe/London'}</b>
      </div>
     </section>

     <div className="settingsSectionLabel">
      <span>DRIVER PAYMENTS</span>
      <b>Settlement, payout and fee rules</b>
     </div>

     <section className="panel settingsCardV2 settlementRulesCard"><div className="settingsHead"><CalendarDays/><div><h3>Settlement & payout rules</h3><p>Controls used for Monday and early payout processing.</p></div></div><div className="formGrid2"><label>Outstanding threshold<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.negativeThreshold??0} onChange={e=>setSettings({...settings,negativeThreshold:e.target.value})}/></div><small>Amounts owed below this are carried forward.</small></label><label>Minimum payout threshold<div className="moneyField"><span>£</span><input type="number" min="0" step="0.01" value={settings.minimumPayoutThreshold??0} onChange={e=>setSettings({...settings,minimumPayoutThreshold:e.target.value})}/></div><small>Positive balances below this remain on the driver account until a future settlement.</small></label><label>Weekly FaivoPay fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.weeklyAppFee??0} onChange={e=>setSettings({...settings,weeklyAppFee:e.target.value})}/></div></label><label className="toggleRow"><span className="toggleCopy"><b>Charge weekly fee when no work is recorded</b><small>Turn this off to waive the weekly fee for drivers with no recorded work during the week being settled.</small></span><span className="toggleSwitch"><input type="checkbox" checked={settings.chargeWeeklyFeeWhenInactive!==false} onChange={e=>setSettings({...settings,chargeWeeklyFeeWhenInactive:e.target.checked})}/><span className="toggleSlider"/></span></label><label>Early payout fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.earlyPayoutFee??0} onChange={e=>setSettings({...settings,earlyPayoutFee:e.target.value})}/></div></label><label>Early payout cutoff<input type="time" value={settings.earlyPayoutCutoffTime||'11:00'} onChange={e=>setSettings({...settings,earlyPayoutCutoffTime:e.target.value})}/></label><label>Outstanding payment deadline<input type="time" value={settings.outstandingDueTime||'17:00'} onChange={e=>setSettings({...settings,outstandingDueTime:e.target.value})}/></label><label>Autocab sync interval<input type="number" min="2" max="60" value={settings.syncMinutes||10} onChange={e=>setSettings({...settings,syncMinutes:e.target.value})}/><small>Minutes between automatic syncs.</small></label></div><div className="formGrid1"><label>Weekly payout Autocab description<input value={settings.weeklyPayoutReasonTemplate||''} onChange={e=>setSettings({...settings,weeklyPayoutReasonTemplate:e.target.value})}/><small>Available: {'{date}'} {'{time}'} {'{callsign}'} {'{amount}'}</small></label><label>Early payout Autocab description<input value={settings.earlyPayoutReasonTemplate||''} onChange={e=>setSettings({...settings,earlyPayoutReasonTemplate:e.target.value})}/></label><div className="formGrid2"><label>Manual pay-in default reason<input value={settings.manualPayInReasonDefault||''} onChange={e=>setSettings({...settings,manualPayInReasonDefault:e.target.value})}/></label><label>Manual payout default reason<input value={settings.manualPayoutReasonDefault||''} onChange={e=>setSettings({...settings,manualPayoutReasonDefault:e.target.value})}/></label></div></div></section>
     <div className="settingsSectionLabel">
      <span>CUSTOMER PAYMENTS</span>
      <b>Card-payment fees and revenue split</b>
     </div>

     <section className="panel settingsCardV2 feePricingCard"><div className="settingsHead"><BadgePoundSterling/><div><h3>Fee pricing & split</h3><p>Define the gross fee and how each fee is split between FaivoPay and the taxi company.</p></div></div><div className="formGrid2"><label>Customer payment fee type<select value={settings.customerPaymentFeeType||'fixed'} onChange={e=>setSettings({...settings,customerPaymentFeeType:e.target.value})}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label><label>Customer payment fee<div className="moneyField"><span>{settings.customerPaymentFeeType==='percentage'?'%':'£'}</span><input type="number" min="0" step="0.01" value={settings.customerPaymentFeeValue??0} onChange={e=>setSettings({...settings,customerPaymentFeeValue:e.target.value})}/></div></label><label>FaivoPay share – customer fees<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.customerFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,customerFeeFleetPayPercent:e.target.value})}/></div><small>Taxi company receives the remaining percentage.</small></label><label>FaivoPay share – early payout fee<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.earlyPayoutFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,earlyPayoutFeeFleetPayPercent:e.target.value})}/></div></label><label>FaivoPay share – weekly fee<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.weeklyFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,weeklyFeeFleetPayPercent:e.target.value})}/></div></label></div></section>
     <div className="settingsSectionLabel">
      <span>WEEKLY INVOICING</span>
      <b>FaivoPay service-fee billing</b>
     </div>

     <section className="panel settingsCardV2 companyInvoiceCard">
      <div className="settingsHead">
       <BadgePoundSterling/>
       <div>
        <span className="sectionKicker">WEEKLY INVOICING</span>
        <h3>Automatic FaivoPay fee invoice</h3>
        <p>FaivoPay can create and send weekly service-fee invoices from recorded uninvoiced fees. Manual invoicing has been validated; automatic scheduling remains disabled until explicitly enabled.</p>
       </div>
      </div>

      {companyFinance?.weeklyInvoicing
       ?<>
        <div className="formGrid2">
         <label className="toggleRow">
          <span className="toggleCopy">
           <b>Enable weekly invoicing</b>
           <small>Company-level switch for weekly invoicing. Automatic scheduling will only run after the platform scheduler is explicitly enabled.</small>
          </span>
          <span className="toggleSwitch">
           <input
            type="checkbox"
            checked={Boolean(companyFinance.weeklyInvoicing.enabled)}
            onChange={e=>setCompanyFinance({
             ...companyFinance,
             weeklyInvoicing:{
              ...companyFinance.weeklyInvoicing,
              enabled:e.target.checked
             }
            })}
           />
           <span className="toggleSlider"/>
          </span>
         </label>

         <label>
          Billing email
          <input
           type="email"
           value={companyFinance.weeklyInvoicing.billingEmail||''}
           onChange={e=>setCompanyFinance({
            ...companyFinance,
            weeklyInvoicing:{
             ...companyFinance.weeklyInvoicing,
             billingEmail:e.target.value
            }
           })}
           placeholder="office@needacab247.com"
          />
          <small>Invoices and PDF copies will be sent here.</small>
         </label>
        </div>

        <div className="settingsInlineMeta">
         <span>Company</span>
         <b>{companyFinance.company?.name||'—'}</b>
         <span>Timezone</span>
         <b>{companyFinance.weeklyInvoicing.timezone||'Europe/London'}</b>
        </div>

        <button
         className="secondary"
         disabled={companyFinanceBusy}
         onClick={saveCompanyFinance}
        >
         <Settings/>
         {companyFinanceBusy?'Saving…':'Save weekly invoicing'}
        </button>
       </>
       :<div className="operatorWarning blue">
        <Info/>
        <div>
         <b>Company settings unavailable</b>
         <span>FaivoPay could not safely resolve a single company for these settings.</span>
        </div>
       </div>
      }
     </section>

     <div className="settingsSectionLabel">
      <span>COMMUNICATIONS</span>
      <b>SMS, email and customer messaging</b>
     </div>

     <section className="panel settingsCardV2"><div className="settingsHead"><Smartphone/><div><h3>SMS providers</h3><p>Choose how FaivoPay routes payment and general messages between Twilio and the taxi-company gateway.</p></div></div><div className="formGrid2"><label className="toggleRow"><span className="toggleCopy"><b>Enable Twilio</b><small>Allow FaivoPay to send SMS through Twilio.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.twilioEnabled)} onChange={e=>setSettings({...settings,twilioEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label><label className="toggleRow"><span className="toggleCopy"><b>Enable Orion gateway</b><small>Allow FaivoPay to send SMS through the taxi-company gateway.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.orionEnabled)} onChange={e=>setSettings({...settings,orionEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label><label>Payment-link SMS provider<select value={settings.paymentSmsProvider||'twilio'} onChange={e=>setSettings({...settings,paymentSmsProvider:e.target.value})}><option value="twilio">Twilio</option><option value="orion">Orion gateway</option></select></label><label>General SMS provider<select value={settings.generalSmsProvider||'orion'} onChange={e=>setSettings({...settings,generalSmsProvider:e.target.value})}><option value="orion">Orion gateway</option><option value="twilio">Twilio</option></select></label><label className="toggleRow"><span className="toggleCopy"><b>Use fallback SMS provider</b><small>Try the secondary provider automatically if the primary provider fails.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.smsFallbackEnabled)} onChange={e=>setSettings({...settings,smsFallbackEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label></div><div className="formGrid2"><label>Low Twilio balance warning (£)<input type="number" min="0" step="1" value={settings.twilioLowBalanceThreshold??20} onChange={e=>setSettings({...settings,twilioLowBalanceThreshold:e.target.value})}/></label><label>Low balance email<input type="email" value={settings.twilioLowBalanceEmail||''} onChange={e=>setSettings({...settings,twilioLowBalanceEmail:e.target.value})}/></label><label className="toggleRow"><span className="toggleCopy"><b>Enable low-balance alerts</b><small>Email a warning when the Twilio balance falls below the configured threshold.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.twilioLowBalanceAlertsEnabled)} onChange={e=>setSettings({...settings,twilioLowBalanceAlertsEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label></div><div className="formGrid2"><label>Orion endpoint URL<input value={settings.smsEndpoint||''} onChange={e=>setSettings({...settings,smsEndpoint:e.target.value})} placeholder="https://..."/></label><label>HTTP method<select value={settings.smsMethod||'POST'} onChange={e=>setSettings({...settings,smsMethod:e.target.value})}><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label>Authentication header<input value={settings.smsAuthHeader||''} onChange={e=>setSettings({...settings,smsAuthHeader:e.target.value})} placeholder="Authorization"/></label><label>Authentication/API value<input type="password" value={settings.smsAuthValue||''} onChange={e=>setSettings({...settings,smsAuthValue:e.target.value})} placeholder={settings.smsAuthConfigured?'Configured – enter only to replace':'Enter secret value'}/></label></div><label>Orion JSON body template<textarea rows="4" value={settings.smsBodyTemplate||''} onChange={e=>setSettings({...settings,smsBodyTemplate:e.target.value})}/><small>Use {'{mobile}'} and {'{message}'}. The final result must be valid JSON.</small></label><div className="testStrip"><input value={testSms.to} onChange={e=>setTestSms({...testSms,to:e.target.value})} placeholder="Test mobile number"/><input value={testSms.message} onChange={e=>setTestSms({...testSms,message:e.target.value})}/><button className="secondary" onClick={testSmsNow}>Send test SMS</button></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Mail/><div><h3>Email / SMTP</h3><p>SMTP is used for outstanding-payment messages and daily early-payout summaries. Resend remains the fallback if SMTP is blank.</p></div></div><div className="formGrid2"><label>SMTP host<input value={settings.smtpHost||''} onChange={e=>setSettings({...settings,smtpHost:e.target.value})}/></label><label>SMTP port<input type="number" value={settings.smtpPort||587} onChange={e=>setSettings({...settings,smtpPort:e.target.value})}/></label><label>SMTP username<input value={settings.smtpUser||''} onChange={e=>setSettings({...settings,smtpUser:e.target.value})}/></label><label>SMTP password<input type="password" value={settings.smtpPassword||''} onChange={e=>setSettings({...settings,smtpPassword:e.target.value})} placeholder={settings.smtpPasswordConfigured?'Configured – enter only to replace':'Enter password'}/></label><label>From name<input value={settings.smtpFromName||''} onChange={e=>setSettings({...settings,smtpFromName:e.target.value})}/></label><label>From email<input type="email" value={settings.smtpFromEmail||''} onChange={e=>setSettings({...settings,smtpFromEmail:e.target.value})}/></label><label>Office notification email<input type="email" value={settings.officeNotificationEmail||''} onChange={e=>setSettings({...settings,officeNotificationEmail:e.target.value})}/></label><label className="toggleRow"><span className="toggleCopy"><b>Use secure SMTP</b><small>Enable TLS immediately on connection, normally when using port 465.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.smtpSecure)} onChange={e=>setSettings({...settings,smtpSecure:e.target.checked})}/><span className="toggleSlider"/></span></label></div><div className="testStrip"><input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder={settings.officeNotificationEmail||'Test email address'}/><button className="secondary" onClick={testEmailNow}>Send test email</button></div></section>
     <section className="panel settingsCardV2">
      <div className="settingsHead"><Send/><div><h3>Customer payment messages</h3><p>Edit the wording customers receive with their secure payment link.</p></div></div>
      <label>SMS message<textarea rows="4" value={settings.customerPaymentSmsTemplate||''} onChange={e=>setSettings({...settings,customerPaymentSmsTemplate:e.target.value})}/></label>
      <small>Available variables: {'{customer}'}, {'{fare}'}, {'{fee}'}, {'{total}'}, {'{paymentLink}'}, {'{bookingId}'}</small>
      <label>Email subject<input value={settings.customerPaymentEmailSubject||''} onChange={e=>setSettings({...settings,customerPaymentEmailSubject:e.target.value})}/></label>
      <small>The branded email layout is controlled by FaivoPay; this field changes the email subject only.</small>
     </section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Mail/><div><h3>Outstanding-payment messages</h3><p>Control and edit the messages drivers receive after the Monday run.</p></div></div><label className="toggleRow"><span className="toggleCopy"><b>Automatic outstanding email & SMS</b><small>Send payment-demand email and SMS automatically when a Monday payment request is created. Keep this OFF during development and testing.</small></span><span className="toggleSwitch"><input type="checkbox" checked={Boolean(settings.outstandingExternalCommunicationsEnabled)} onChange={e=>setSettings({...settings,outstandingExternalCommunicationsEnabled:e.target.checked})}/><span className="toggleSlider"/></span></label><label>Email subject<input value={settings.outstandingEmailSubject||''} onChange={e=>setSettings({...settings,outstandingEmailSubject:e.target.value})}/></label><label>Email message<textarea rows="7" value={settings.outstandingEmailBody||''} onChange={e=>setSettings({...settings,outstandingEmailBody:e.target.value})}/></label><label>SMS message<textarea rows="5" value={settings.outstandingSmsTemplate||''} onChange={e=>setSettings({...settings,outstandingSmsTemplate:e.target.value})}/></label><small>Available variables: {'{driver}'}, {'{callsign}'}, {'{amount}'}, {'{dueDate}'}, {'{dueTime}'}, {'{paymentLink}'}</small></section>
     {isPlatformAdmin&&<>
     <div className="settingsSectionLabel">
      <span>TEST & DEMO</span>
      <b>Training and controlled live-data testing</b>
     </div>

     <section className="panel settingsCardV2 testDemoSettingsCard">
      <div className="settingsHead">
       <ShieldCheck/>
       <div>
        <h3>Testing environments</h3>
        <p>
         Demo Lab provides isolated operator training. Live Data Test Lab
         provides controlled, allow-listed validation against real Autocab data.
        </p>
       </div>
      </div>

      <div className="settingsInlineMeta">
       <span>Demo Lab</span>
       <b>Isolated training data</b>

       <span>Live Test Lab</span>
       <b>Controlled real-data testing</b>
      </div>
     </section>

     <div className="settingsSectionLabel">
      <span>ADVANCED / INTEGRATIONS</span>
      <b>Administrative and launch controls</b>
     </div>

     <section className="panel settingsCardV2 dangerZone"><div className="settingsHead"><AlertTriangle/><div><h3>Pre-launch data reset</h3><p>Use once before the live launch. FaivoPay creates a timestamped SQLite backup first, then clears operational test data while keeping office users, MFA, settings and integrations.</p></div></div><div className="launchResetInfo"><b>Cleared:</b><span>payments, payment plans, payout runs, settlement runs, fee records, notifications, communication history, adjustments and demo data.</span></div><label className="toggleRow"><span className="toggleCopy"><b>Also clear driver app registrations</b><small>Include driver logins and push subscriptions in the pre-launch reset.</small></span><span className="toggleSwitch"><input type="checkbox" checked={resetDrivers} onChange={e=>setResetDrivers(e.target.checked)}/><span className="toggleSlider"/></span></label><label>Confirmation phrase<input value={resetPhrase} onChange={e=>setResetPhrase(e.target.value)} placeholder="RESET FAIVOPAY FOR LIVE LAUNCH"/></label><button className="dangerAction" disabled={resetPhrase!=='RESET FAIVOPAY FOR LIVE LAUNCH'} onClick={launchReset}><AlertTriangle/>Create backup & reset operational data</button></section>
     </>}

     <div className="settingsSectionLabel">
      <span>DATA & AUDIT</span>
      <b>Operational exports</b>
     </div>

     <section className="panel settingsCardV2 dataExportCard">
      <div className="settingsHead">
       <FileClock/>
       <div>
        <h3>Data exports</h3>
        <p>
         Download FaivoPay operational and accounting records as CSV.
         Secrets, passwords and encrypted credentials are never included.
        </p>
       </div>
      </div>

      <div
       className="rowActions"
       style={{flexWrap:'wrap',gap:10}}
      >
       <button
        className="secondary"
        onClick={downloadPaymentPlansCsv}
       >
        <FileClock/>
        Payment plans
       </button>

       <button
        className="secondary"
        onClick={downloadFeesCsv}
       >
        <FileClock/>
        Fee ledger
       </button>

       {adminDataExports.map(([label,dataset,filename])=>
        <button
         key={dataset}
         className="secondary"
         onClick={()=>downloadOfficeCsv(dataset,filename)}
        >
         <FileClock/>
         {label}
        </button>
       )}
      </div>

      <small>
       CSV values are escaped to prevent spreadsheet formula execution.
       Weekly invoice exports are restricted to the selected company.
      </small>
     </section>



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
 const returnStatus=new URLSearchParams(window.location.search).get('status')||'';
 const[payment,setPayment]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stripeReady,setStripeReady]=useState(true),[termsAccepted,setTermsAccepted]=useState(false);

 async function load(){
  try{
   const j=await call(`/api/public/customer-payments/${id}`);
   setPayment(j.payment);
   setStripeReady(j.stripeConfigured!==false);
   setError('');
  }catch(e){setError(e.message)}
 }

 useEffect(()=>{
  load();
  const timer=setInterval(()=>{
   if(document.visibilityState==='visible')load()
  },4000);
  return()=>clearInterval(timer)
 },[id]);

 async function checkout(){
  if(!termsAccepted){
   setError('Please agree to the payment and cancellation terms before continuing.');
   return;
  }
  setBusy(true);
  setError('');
  try{
   const j=await call(`/api/public/customer-payments/${id}/checkout`,{method:'POST'});
   window.location.assign(j.checkoutUrl)
  }catch(e){
   setError(e.message);
   setBusy(false)
  }
 }

 const Brand=()=>(
  <header className="publicPayBrandV2">
   <div className="publicPayLogoV2"><img src={faivopayMark} alt="FaivoPay"/></div>
   <div className="publicPayBrandWords">
    <b>FaivoPay</b>
    <span>Secure taxi payments</span>
   </div>
   <div className="publicPaySafe"><ShieldCheck/><span>Safe. Secure.</span></div>
  </header>
 );

 if(!payment&&!error)return(
  <div className="publicPayPage publicPayV2">
   <div className="publicPayShellV2">
    <Brand/>
    <div className="publicPayStateCard">
     <RefreshCw className="spin"/>
     <h2>Opening secure payment</h2>
     <p>Please wait while we load your journey.</p>
    </div>
   </div>
  </div>
 );

 if(error&&!payment)return(
  <div className="publicPayPage publicPayV2">
   <div className="publicPayShellV2">
    <Brand/>
    <div className="publicPayStateCard unavailable">
     <div className="publicPayStateIcon"><AlertTriangle/></div>
     <span>PAYMENT UNAVAILABLE</span>
     <h1>We couldn't open this payment</h1>
     <p>{error}</p>
     <small>Please contact the taxi company if you still need to make payment.</small>
    </div>
    <footer className="publicPayFooterV2"><ShieldCheck/> Secure payments by FaivoPay</footer>
   </div>
  </div>
 );

 const paid=payment.status==='paid';
 const cancelled=payment.status==='cancelled';
 const returnedCancelled=returnStatus==='cancelled'&&!paid&&!cancelled;
 const successPending=returnStatus==='success'&&!paid&&!cancelled;

 if(paid)return(
  <div className="publicPayPage publicPayV2">
   <div className="publicPayShellV2">
    <Brand/>
    <div className="publicPayStateCard success">
     <div className="publicPayStateIcon"><CheckCircle2/></div>
     <span>PAYMENT COMPLETE</span>
     <h1>{money(payment.totalAmount)}</h1>
     <p>Your payment has been received successfully.</p>
     <div className="publicPayReceipt">
      {payment.bookingId&&<div><span>Booking reference</span><b>{payment.bookingId}</b></div>}
      {payment.journeyAt&&<div><span>Journey</span><b>{dt(payment.journeyAt)}</b></div>}
      <div><span>Status</span><b>Paid securely</b></div>
     </div>
     <strong className="publicPayClose">You can now close this page.</strong>
    </div>
    <footer className="publicPayFooterV2"><ShieldCheck/> Secure payments by FaivoPay</footer>
   </div>
  </div>
 );

 if(cancelled)return(
  <div className="publicPayPage publicPayV2">
   <div className="publicPayShellV2">
    <Brand/>
    <div className="publicPayStateCard cancelled">
     <div className="publicPayStateIcon"><AlertTriangle/></div>
     <span>PAYMENT LINK CANCELLED</span>
     <h1>This payment is no longer available</h1>
     <p>The payment link has been cancelled. Please contact the taxi company if you still need to make payment.</p>
    </div>
    <footer className="publicPayFooterV2"><ShieldCheck/> Secure payments by FaivoPay</footer>
   </div>
  </div>
 );

 if(successPending)return(
  <div className="publicPayPage publicPayV2">
   <div className="publicPayShellV2">
    <Brand/>
    <div className="publicPayStateCard processing">
     <div className="publicPayProcessingIcon"><RefreshCw className="spin"/></div>
     <span>FINALISING PAYMENT</span>
     <h1>Almost done</h1>
     <p>We're confirming your payment securely. Please keep this page open for a moment.</p>
     <div className="publicPayProgress">
      <div className="done"><CheckCircle2/><span>Card payment submitted</span></div>
      <div><RefreshCw className="spin"/><span>Confirming payment</span></div>
     </div>
    </div>
    <footer className="publicPayFooterV2"><ShieldCheck/> Secure payments by FaivoPay</footer>
   </div>
  </div>
 );

 return(
  <div className="publicPayPage publicPayV2">
   <div className="publicPayShellV2">
    <Brand/>

    {returnedCancelled&&
     <div className="publicPayCancelNotice">
      <AlertTriangle/>
      <div>
       <b>Payment cancelled</b>
       <span>No payment was taken. You can try again below.</span>
      </div>
     </div>
    }

    <section className="publicPayIntro">
     <span>YOUR TAXI JOURNEY PAYMENT</span>
     <h1>{money(payment.totalAmount)}</h1>
     <p>Amount due</p>
    </section>

    <section className="publicPayCardV2">
     <div className="publicPaySectionTitle">
      <div>
       <span>JOURNEY</span>
       <h2>Journey details</h2>
      </div>
      <CreditCard/>
     </div>

     {(payment.pickup||payment.destination)&&
      <div className="publicJourneyV2">
       {payment.pickup&&
        <div>
         <i/>
         <span>Pickup</span>
         <b>{payment.pickup}</b>
        </div>
       }
       {payment.destination&&
        <div>
         <i/>
         <span>Destination</span>
         <b>{payment.destination}</b>
        </div>
       }
      </div>
     }

     <div className="publicPayMeta">
      <div><span>Business</span><b>{payment.taxiCompany}</b></div>
      {payment.bookingId&&<div><span>Booking reference</span><b>{payment.bookingId}</b></div>}
      {payment.customerName&&<div><span>Passenger</span><b>{payment.customerName}</b></div>}
      {payment.journeyAt&&<div><span>Date & time</span><b>{dt(payment.journeyAt)}</b></div>}
     </div>
    </section>

    <section className="publicPayCardV2 publicPaySummaryV2">
     <div className="publicPaySectionTitle">
      <div>
       <span>PAYMENT</span>
       <h2>Payment summary</h2>
      </div>
     </div>
     <div className="publicPayPriceRow"><span>Journey fare</span><b>{money(payment.fareAmount)}</b></div>
     <div className="publicPayPriceRow">
      <span>FaivoPay service fee <small>non-refundable*</small></span>
      <b>{money(payment.feeAmount)}</b>
     </div>
     <div className="publicPayPriceTotal">
      <span>Total to pay</span>
      <b>{money(payment.totalAmount)}</b>
     </div>
    </section>

    <section className="publicPayTermsV2">
     <div className="publicPayTermsHead">
      <ShieldCheck/>
      <div><b>Important payment terms</b><span>Please review before paying</span></div>
     </div>

     <ul>
      <li>Cancellation before dispatch may incur a cancellation charge.</li>
      <li>After dispatch, the journey fare is non-refundable if the booking is cancelled, except where required by law.</li>
      <li>No-shows are non-refundable after the permitted waiting period, except where required by law.</li>
      <li>The FaivoPay service fee is non-refundable once payment has been processed, except where required by law.</li>
     </ul>

     <details className="publicPayFullTerms">
      <summary>View full terms & conditions</summary>
      <div>
       <h3>Cancellation before dispatch</h3>
       <p>A cancellation charge may apply where a booking is cancelled before a vehicle is dispatched.</p>

       <h3>Cancellation after dispatch</h3>
       <p>Once a vehicle has been dispatched, the journey fare is non-refundable if the booking is cancelled, except where required by law.</p>

       <h3>No-shows</h3>
       <p>If the passenger is not available at the agreed pickup point within the permitted waiting period, the booking may be treated as a no-show and the journey fare will be non-refundable, except where required by law.</p>

       <h3>Waiting time and journey changes</h3>
       <p>Additional waiting time, stops, route changes or other journey changes may alter the final fare where applicable.</p>

       <h3>FaivoPay service fee</h3>
       <p>The FaivoPay service fee covers the secure payment service and is non-refundable once payment has been processed, except where required by law.</p>

       <h3>Refunds</h3>
       <p>Where a refund is approved, any refundable amount will be returned to the original payment method. Card-provider processing times may vary.</p>

       <h3>Statutory rights</h3>
       <p>Nothing in these terms affects any consumer rights that cannot legally be excluded or restricted.</p>
      </div>
     </details>

     <label className="publicPayAgree">
      <input type="checkbox" checked={termsAccepted} onChange={e=>{setTermsAccepted(e.target.checked);if(e.target.checked)setError('')}}/>
      <span>I agree to the payment, cancellation and no-show terms above.</span>
     </label>
    </section>

    {error&&<div className="publicPayInlineError"><AlertTriangle/><span>{error}</span></div>}

    <div className="publicPayActionDock">
     <button className="publicPayButtonV2" disabled={busy||!stripeReady||!termsAccepted} onClick={checkout}>
      <ShieldCheck/>
      <span>{busy?'Opening secure checkout…':`Pay ${money(payment.totalAmount)} securely`}</span>
      {!busy&&<ArrowRight/>}
     </button>
     <small>Secure card payment powered by Stripe</small>
    </div>

    <p className="publicPayLegalNote">*Service fee is non-refundable once payment has been processed, except where required by law.</p>
    <footer className="publicPayFooterV2">FaivoPay · Secure taxi payments</footer>
   </div>
  </div>
 );
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
 const[livePaymentPreview,setLivePaymentPreview]=useState(null);
 const[livePaymentPreviewBusy,setLivePaymentPreviewBusy]=useState(false);
 const[liveFareEdit,setLiveFareEdit]=useState({
  bookingId:'',
  value:''
 });
 const[showManualPayment,setShowManualPayment]=useState(false);
 const[activityFilter,setActivityFilter]=useState('account-work');
 const[activityDateFilter,setActivityDateFilter]=useState('this-week');
 const[accountWork,setAccountWork]=useState(null);
 const[accountWorkLoading,setAccountWorkLoading]=useState(true);
 const[accountWorkError,setAccountWorkError]=useState('');
 const[lastLivePreview,setLastLivePreview]=useState(null);
 const[lastLivePaid,setLastLivePaid]=useState(null);
 const[driverTab,setDriverTab]=useState('home');
 const[theme,setTheme]=useState(()=>localStorage.getItem('fleetpay_theme')||((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'));
 const[textScale,setTextScale]=useState(()=>{const saved=Number(localStorage.getItem('fleetpay_text_scale'));return Number.isFinite(saved)&&saved>=0.9&&saved<=1.5?saved:1});
 const[showPassword,setShowPassword]=useState(false);
 const[showNotifications,setShowNotifications]=useState(false);
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
   setLastLivePaid({payment:matched,preview:lastLivePreview||livePaymentPreview});
   setNotice(`Customer payment of ${money(matched.totalAmount)} received successfully.`);
   setCustomerPayment(null);
   setCustomerFare('');
   setCustomerBooking('');
  }
 },[customerPayment,me?.customerPayments]);

 useEffect(()=>{
  if(
   !livePaymentPreview?.ok ||
   !livePaymentPreview?.bookingId
  )return;

  const bookingId=String(livePaymentPreview.bookingId);

  setLiveFareEdit(current=>{
   if(current.bookingId===bookingId)return current;

   const fare=Number(livePaymentPreview.fareAmount||0);

   return {
    bookingId,
    value:
     Number.isFinite(fare)&&fare>0
      ?fare.toFixed(2)
      :''
   };
  });
 },[
  livePaymentPreview?.bookingId,
  livePaymentPreview?.ok
 ]);


 function driverActivityRange(key){
  const now=new Date();

  const startOfDay=d=>{
   const x=new Date(d);
   x.setHours(0,0,0,0);
   return x;
  };

  const addDays=(d,n)=>{
   const x=new Date(d);
   x.setDate(x.getDate()+n);
   return x;
  };

  const startOfWeek=d=>{
   const x=startOfDay(d);
   const day=x.getDay();
   x.setDate(x.getDate()+(day===0?-6:1-day));
   return x;
  };

  let from;
  let to;

  if(key==='today'){
   from=startOfDay(now);
   to=addDays(from,1);

  }else if(key==='yesterday'){
   to=startOfDay(now);
   from=addDays(to,-1);

  }else if(key==='last-week'){
   to=startOfWeek(now);
   from=addDays(to,-7);

  }else if(key==='all'){
   from=new Date('2020-01-01T00:00:00');
   to=addDays(startOfDay(now),1);

  }else{
   from=startOfWeek(now);
   to=addDays(startOfDay(now),1);
  }

  return {
   from:from.toISOString(),
   to:to.toISOString()
  };
 }

 function driverActivityInRange(value,range){
  if(!value)return false;

  const t=Date.parse(value);

  return Number.isFinite(t) &&
   t>=Date.parse(range.from) &&
   t<Date.parse(range.to);
 }

 async function loadAccountWorkForRange(key=activityDateFilter){
  if(!token)return;

  const range=driverActivityRange(key);

  setAccountWorkLoading(true);
  setAccountWorkError('');

  try{
   const p=new URLSearchParams({
    from:range.from,
    to:range.to
   });

   const result=await api(
    `/api/driver/account-work?${p.toString()}`
   );

   setAccountWork(result);

  }catch(e){
   setAccountWorkError(
    e?.message||'Account work is temporarily unavailable.'
   );

  }finally{
   setAccountWorkLoading(false);
  }
 }

 async function load(force=false){
  if(!token||loadingDriver.current)return;
  if(!force&&me&&Date.now()-lastLoadAt.current<15000)return;
  loadingDriver.current=true;
  try{
   const activityRange=driverActivityRange(activityDateFilter);

   const workParams=new URLSearchParams({
    from:activityRange.from,
    to:activityRange.to
   });

   const [meResult,workResult]=await Promise.allSettled([
    api('/api/driver/me'),
    api(`/api/driver/account-work?${workParams.toString()}`)
   ]);

   if(meResult.status!=='fulfilled'){
    throw meResult.reason;
   }

   setMe(meResult.value);
   lastLoadAt.current=Date.now();

   if(workResult.status==='fulfilled'){
    setAccountWork(workResult.value);
    setAccountWorkError('');
   }else{
    setAccountWorkError(
     workResult.reason?.message||'Account work is temporarily unavailable.'
    );
   }
  }catch{
   localStorage.removeItem('fleetpay_driver');setToken('');setMe(null);
  }finally{
   setAccountWorkLoading(false);
   loadingDriver.current=false;
  }
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
  if(!token)return;

  loadAccountWorkForRange(activityDateFilter);
 },[token,activityDateFilter]);

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


 async function testLivePaymentPreview({silent=false}={}){
  if(!silent){
   setLivePaymentPreviewBusy(true);
   setErr('');
  }

  const previousBookingId=
   livePaymentPreview?.ok
    ?String(livePaymentPreview.bookingId||'')
    :String(livePaymentPreview?.previousBookingId||'');

  try{
   const j=await api('/api/driver/customer-payment/preview');

   const nextBookingId=String(j?.bookingId||'');

   if(
    previousBookingId &&
    nextBookingId &&
    previousBookingId!==nextBookingId
   ){
    setCustomerPayment(current=>{
     if(
      current &&
      String(current.bookingId||'')===previousBookingId
     ){
      return null;
     }
     return current;
    });
   }

   setLivePaymentPreview(j);
   if(j?.ok){
    setLastLivePreview(j);
    if(lastLivePaid && String(lastLivePaid?.payment?.bookingId||'')!==String(j.bookingId||'')){
     setLastLivePaid(null);
    }
   }
  }catch(e){
   const message=String(e?.message||'Unable to check the current booking.');

   setLivePaymentPreview({
    ok:false,
    error:message,
    previousBookingId:previousBookingId||null
   });

   /*
    * If the current booking is no longer eligible, never leave
    * an old live-payment QR/action visible in the app.
    */
   if(
    /account|no longer cash|not cash|only available for cash bookings|payment method|no active booking|no active|no longer assigned|assigned to/i.test(
     message
    )
   ){
    setCustomerPayment(current=>{
     if(
      current &&
      previousBookingId &&
      String(current.bookingId||'')===previousBookingId
     ){
      return null;
     }
     return current;
    });
   }
  }finally{
   if(!silent){
    setLivePaymentPreviewBusy(false);
   }
  }
 }

 async function createLiveCustomerPayment(){
  if(!livePaymentPreview?.ok)return;

  const bookingId=String(
   livePaymentPreview.bookingId||''
  );

  const fareAmount=
   liveFareEdit.bookingId===bookingId
    ?Math.round(Number(liveFareEdit.value||0)*100)/100
    :Math.round(Number(livePaymentPreview.fareAmount||0)*100)/100;

  if(!Number.isFinite(fareAmount) || fareAmount<=0){
   setErr('Enter a valid final journey fare.');
   return;
  }

  const feeAmount=Math.round(
   (
    feeType==='percentage'
     ?fareAmount*(feeValue/100)
     :feeValue
   )*100
  )/100;

  const totalAmount=Math.round(
   (fareAmount+feeAmount)*100
  )/100;

  setCustomerPaymentBusy(true);
  setErr('');

  try{
   const j=await api(
    '/api/driver/customer-payment/live',
    {
     method:'POST',
     body:JSON.stringify({fareAmount})
    }
   );

   setCustomerPayment(j);

   if(j.alreadyPaid){
    setNotice('This booking has already been paid.');
   }else if(j.reused){
    setNotice('Existing payment link reopened.');
   }else{
    setNotice('Live customer payment created.');
   }
  }catch(e){
   setErr(e.message);
  }finally{
   setCustomerPaymentBusy(false);
  }
 }

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
  setToken('');setMe(null);setErr('');setNotice('');setAmt('');setMode('login');setStep(1);setChallenge('');setDev('');setPushReady(false);setPushAvailable(false);setPaymentBusy(false);setCustomerPayment(null);setCustomerFare('');setCustomerBooking('');setLiveFareEdit({bookingId:'',value:''});setDriverTab('home');setBankEditing(false);setBankBusy(false);setBankForm({accountHolder:'',sortCode:'',accountNumber:'',password:''});
  setF({callsign:'',email:'',mobileLast4:'',code:'',password:''});
 }

 function changeTab(tab){
  setDriverTab(tab);
  setErr('');
  requestAnimationFrame(()=>document.querySelector('.driverApp')?.scrollTo({top:0,behavior:'smooth'}));
 }

 async function markAccountWorkSeen(){
  if(!token)return;

  if(Number(me?.accountWorkActivity?.newCount||0)<=0)return;

  try{
   const result=await api(
    '/api/driver/account-work/read',
    {method:'POST'}
   );

   setMe(current=>current?{
    ...current,
    accountWorkActivity:{
     ...(current.accountWorkActivity||{}),
     accountWorkSeenAt:
      result.accountWorkSeenAt||new Date().toISOString(),
     newCount:0
    }
   }:current);

  }catch{}
 }

 useEffect(()=>{
  if(
   driverTab==='activity' &&
   activityFilter==='account-work' &&
   Number(me?.accountWorkActivity?.newCount||0)>0
  ){
   markAccountWorkSeen();
  }
 },[
  driverTab,
  activityFilter,
  me?.accountWorkActivity?.newCount
 ]);

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

 useEffect(()=>{
  if(!token || !['home','pay'].includes(driverTab))return;

  let stopped=false;
  let appListener=null;

  const refresh=()=>{
   if(stopped)return;
   testLivePaymentPreview({silent:true});
  };

  testLivePaymentPreview({silent:driverTab==='home'});

  const timer=setInterval(refresh,driverTab==='pay'?10000:30000);

  if(Capacitor.isNativePlatform()){
   App.addListener(
    'appStateChange',
    ({isActive})=>{
     if(isActive)refresh();
    }
   ).then(handle=>{
    appListener=handle;
   });
  }else{
   const onVisibility=()=>{
    if(document.visibilityState==='visible')refresh();
   };

   document.addEventListener('visibilitychange',onVisibility);

   return()=>{
    stopped=true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange',onVisibility);
   };
  }

  return()=>{
   stopped=true;
   clearInterval(timer);
   appListener?.remove();
  };
 },[token,driverTab]);

 if(!token)return <div className={`driverAuthPage driverAuthV2 theme-${theme}`} style={{'--driver-text-scale':textScale}}>
  <button className="authThemeToggle" type="button" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="Change appearance">{theme==='dark'?<Sun/>:<Moon/>}</button>
  <div className="driverAuthShell">
   <div className="driverAuthBrand driverAuthBrandImage"><img src={faivopayMark} alt="FaivoPay"/></div>
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

 if(!me)return <div className={`driverAuthPage driverAuthV2 theme-${theme}`} style={{'--driver-text-scale':textScale}}><div className="driverAuthShell"><div className="driverAuthBrand driverAuthBrandImage"><img src={faivopayMark} alt="FaivoPay"/></div><div className="driverAuthCard polishedAuthCard authLoading"><RefreshCw className="spin"/><b>Loading FaivoPay</b><span>Preparing your driver account…</span></div></div></div>;

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

 const livePaymentBookingId=
  livePaymentPreview?.bookingId ||
  livePaymentPreview?.previousBookingId ||
  customerPayment?.bookingId ||
  lastLivePaid?.payment?.bookingId ||
  null;

 const matchingLivePayment=
  livePaymentBookingId
   ?(
     customerPayment &&
     String(customerPayment.bookingId||'')===String(livePaymentBookingId)
      ?customerPayment
      :customerPayments.find(
        x=>String(x.bookingId||'')===String(livePaymentBookingId)
       )||null
    )
   :null;

 const livePaymentAvailable=Boolean(
  livePaymentPreview?.ok &&
  !matchingLivePayment
 );

 const livePaymentReady=Boolean(
  matchingLivePayment?.status==='open'
 );

 const livePaymentPaid=Boolean(
  matchingLivePayment?.status==='paid'
 );

 const livePaymentPreviewError=String(livePaymentPreview?.error||'');

 const livePaymentAccountBooking=Boolean(
  livePaymentPreview &&
  !livePaymentPreview.ok &&
  (
   livePaymentPreview.bookingType==='account' ||
   /already on account|account booking/i.test(livePaymentPreviewError)
  )
 );

 const livePaymentCardBooking=Boolean(
  livePaymentPreview &&
  !livePaymentPreview.ok &&
  (
   livePaymentPreview.bookingType==='card' ||
   /card booking/i.test(livePaymentPreviewError)
  )
 );

 const livePaymentPreviousBookingId=
  livePaymentPreview?.bookingId||
  livePaymentPreview?.previousBookingId||
  null;

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


 const weeklyPayouts=me.weeklyPayouts||[];
 const weeklyPaymentRequests=me.weeklyPaymentRequests||[];
 const planSettlementAllocations=me.planSettlementAllocations||[];
 const notifications=me.notifications||[];
 const unreadNotifications=notifications.filter(x=>!x.readAt);

 const mondayStart=(()=>{
  const now=new Date();
  const start=new Date(now);
  const days=(start.getDay()+6)%7;
  start.setDate(start.getDate()-days);
  start.setHours(0,0,0,0);
  return start;
 })();

 const thisWeekRecord=x=>{
  if(!x?.createdAt)return false;
  const t=new Date(x.createdAt);
  return !Number.isNaN(t.getTime())&&t>=mondayStart;
 };

 const latestWeeklyPayout=
  weeklyPayouts.find(thisWeekRecord)||null;

 const latestWeeklyPaymentRequest=
  weeklyPaymentRequests.find(thisWeekRecord)||null;

 const mondayPreviousBalance=Number(d.previousBalance||0);
 const liveCurrentBalance=Number(d.currentBalance||0);

 const mondayPlanAllocation=latestWeeklyPayout
  ?planSettlementAllocations
   .filter(x=>
    String(x.payoutId||'')===String(latestWeeklyPayout.id||'')||
    (
     latestWeeklyPayout.runId&&
     String(x.runId||'')===String(latestWeeklyPayout.runId)
    )
   )
   .reduce((sum,x)=>sum+Number(x.allocatedAmount||0),0)
  :0;

 const weeklyPayoutStatus=String(latestWeeklyPayout?.status||'');

 const weeklyPayoutPaid=
  weeklyPayoutStatus==='paid'||
  Boolean(latestWeeklyPayout?.paidAt);

 const weeklyPayoutProcessing=[
  'submitted',
  'submitted_sandbox',
  'processing',
  'batched'
 ].includes(weeklyPayoutStatus);

 const weeklyPayoutScheduled=[
  'requested',
  'approved',
  'ready',
  'funding_pending',
  'funded'
 ].includes(weeklyPayoutStatus);

 const mondayDebtPaid=
  latestWeeklyPaymentRequest?.status==='paid'||
  Boolean(latestWeeklyPaymentRequest?.paidAt);

 const mondayDebtOutstanding=Boolean(
  latestWeeklyPaymentRequest&&
  ['open','pending'].includes(latestWeeklyPaymentRequest.status)
 );

 const mondayDueLabel=latestWeeklyPaymentRequest?.dueAt
  ?new Intl.DateTimeFormat(
    'en-GB',
    {
     weekday:'long',
     day:'numeric',
     month:'short',
     hour:'2-digit',
     minute:'2-digit'
    }
   ).format(new Date(latestWeeklyPaymentRequest.dueAt))
  :`Tuesday ${me.settings?.outstandingDueTime||'17:00'}`;

 const weeklyPayoutAmount=Number(
  latestWeeklyPayout?.netAmount ??
  latestWeeklyPayout?.amount ??
  0
 );

 const accountWeekSummary=accountWork?.summary||{
  jobs:0,
  totalDriverCost:0
 };

 const recentOfficeActivity=(me.ledger||[]).slice(0,3);

 const accountWorkNewCount=
  Number(me?.accountWorkActivity?.newCount||0);

 async function openNotifications(){
  setShowNotifications(true);

  if(!unreadNotifications.length)return;

  try{
   await api('/api/driver/notifications/read',{method:'POST'});

   setMe(current=>current?{
    ...current,
    notifications:(current.notifications||[]).map(x=>({
     ...x,
     readAt:x.readAt||new Date().toISOString()
    }))
   }:current);
  }catch{}
 }

 const navItems=[
  ['home',Home,'Home'],
  ['pay',CreditCard,'Payments'],
  ['activity',Activity,'Transactions'],
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

 const CustomerPaymentForm=()=> <section className="driverCard modernPaymentCard"><div className="cardTop"><div><span className="eyebrow">TAKE PAYMENT</span><h2>Customer payment</h2></div><div className="iconBubble"><CreditCard/></div></div><p className="compactCopy">Enter the fare. FaivoPay adds the service fee automatically.</p><div className="formStack"><label>Fare<div className="moneyInput modernMoneyInput"><span>£</span><input type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="0.00" value={customerFare} onChange={e=>{setCustomerFare(e.target.value);setCustomerPayment(null)}}/></div></label><label>Booking ID <small>optional</small><input className="modernInput" type="text" placeholder="e.g. 12345678" value={customerBooking} onChange={e=>{setCustomerBooking(e.target.value);setCustomerPayment(null)}}/></label></div>{fareValue>0&&<div className="paymentBreakdown"><div><span>Fare</span><b>{money(fareValue)}</b></div><div><span>Service fee</span><b>{money(feePreview)}</b></div><div className="paymentTotal"><span>Customer pays</span><strong>{money(customerTotal)}</strong></div></div>}{!customerPayment&&<button className="primary full actionButton" disabled={customerPaymentBusy||!me.stripeConfigured||!(fareValue>0)} onClick={createCustomerPayment}>{customerPaymentBusy?'Creating…':'Create payment'}</button>}{customerPayment &&
 !(livePaymentPreview?.ok &&
   String(customerPayment.bookingId||'')===String(livePaymentPreview.bookingId||'')) &&
 <div className="activePaymentSheet"><div className="activePaymentTop"><div><span>PAYMENT READY</span><strong>{money(customerPayment.totalAmount)}</strong>{customerPayment.bookingId&&<small>Booking {customerPayment.bookingId}</small>}</div><Pill tone="warn">Awaiting</Pill></div><div className="qrPanel"><QRCodeSVG value={customerPayment.paymentUrl} size={210} level="M" includeMargin/><b>Scan to pay</b><span>Secure Stripe checkout</span></div><div className="paymentActions"><button className="primary" type="button" onClick={()=>window.open(customerPayment.paymentUrl,'_blank')}>Open payment link</button><button className="outline" type="button" onClick={()=>sharePayment(customerPayment)}>Share link</button></div><button className="textBtn paymentCancel" type="button" onClick={()=>setCustomerPayment(null)}>Hide payment</button></div>}{!me.stripeConfigured&&<small className="paymentUnavailable">Customer card payments are not configured.</small>}</section>;

 const EarlyPayoutCard=()=> <section className="driverCard"><div className="cardTop"><div><span className="eyebrow">EARLY PAYOUT</span><h2>Request payout</h2></div><div className="iconBubble"><ArrowUpRight/></div></div><div className="availableRow"><span>Available now</span><strong>{money(me.availableForEarlyPayout)}</strong></div>{!bankAccount.configured&&<div className="bankRequiredNotice"><Banknote/><div><b>Bank account required</b><span>Add your payout bank account before requesting money.</span></div><button type="button" className="mini" onClick={()=>changeTab('account')}>Add account</button></div>}{me.reservedForEarlyPayout>0&&<div className="reservedLine"><span>Already reserved</span><b>{money(me.reservedForEarlyPayout)}</b></div>}{me.earlyPayoutAllowed&&<div className={`cutoffNotice ${me.earlyPayoutTiming?.afterCutoff?'afterCutoff':''}`}><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>}{bankAccount.configured&&me.earlyPayoutAllowed&&me.availableForEarlyPayout>me.settings.earlyPayoutFee?<><div className="moneyInput modernMoneyInput"><span>£</span><input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amt} onChange={e=>setAmt(e.target.value)}/></div>{amt&&Number(amt)>0&&<div className="compactPreview"><span>You receive</span><b>{money(Math.max(0,Number(amt)-me.settings.earlyPayoutFee))}</b><small>Includes {money(me.settings.earlyPayoutFee)} fee</small></div>}<button className="primary full actionButton" onClick={payout}>Request payout</button></>:!me.earlyPayoutAllowed?<div className="closed"><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>:null}</section>;

 const routeLine=(preview)=>{
  const pickup=String(preview?.pickup||'').trim();
  const destination=String(preview?.destination||'').trim();
  return {pickup,destination};
 };

 const bookingSnapshot=
  livePaymentPreview?.ok
   ?livePaymentPreview
   :(
     lastLivePreview &&
     livePaymentBookingId &&
     String(lastLivePreview.bookingId||'')===String(livePaymentBookingId)
      ?lastLivePreview
      :livePaymentPreview?.bookingId
      ?livePaymentPreview
      :lastLivePreview
    );
 const bookingRoute=routeLine(bookingSnapshot);
 const noActiveBooking=Boolean(
  livePaymentPreview &&
  !livePaymentPreview.ok &&
  /no active booking|do not currently have an active booking/i.test(livePaymentPreviewError)
 );
 const paidLiveView=Boolean(
  lastLivePaid?.payment &&
  bookingSnapshot &&
  String(lastLivePaid.payment.bookingId||'')===String(bookingSnapshot.bookingId||'')
 );
 const todayKey=new Date().toISOString().slice(0,10);
 const todaysPaidPayments=paidCustomerPayments.filter(x=>String(x.paidAt||x.createdAt||'').slice(0,10)===todayKey);
 const todaysPaidTotal=todaysPaidPayments.reduce((sum,x)=>sum+Number(x.fareAmount||0),0);

 const MockRoute=({preview})=>{
  const {pickup,destination}=routeLine(preview);
  if(!pickup&&!destination)return null;
  return <div className="mockRoute">
   {pickup&&<div><i className="mockRouteDot pickup"/><div><b>{pickup.split(',')[0]}</b><span>{pickup}</span></div></div>}
   {destination&&<div><i className="mockRouteDot destination"/><div><b>{destination.split(',')[0]}</b><span>{destination}</span></div></div>}
  </div>;
 };

 const HomePage=()=> <div className="driverPageView mockHomePage financeHomePage">
  <div className="mockWelcome financeWelcome">
   <div>
    <h1>Good {greeting.toLowerCase()},<br/>{firstName}</h1>
    <p>{isMonday?'Your weekly settlement position':'Your live office balance this week'}</p>
   </div>
  </div>

  <section className={`financeHero ${
   isMonday
    ?mondayPreviousBalance<0?'negative':mondayPreviousBalance>0?'positive':'settled'
    :liveCurrentBalance<0?'negative':liveCurrentBalance>0?'positive':'settled'
  }`}>
   <div className="financeHeroTop">
    <div>
     <span className="financeEyebrow">
      {isMonday?'MONDAY · PREVIOUS BALANCE':'CURRENT BALANCE'}
     </span>

     <strong>
      {money(
       Math.abs(
        isMonday
         ?mondayPreviousBalance
         :liveCurrentBalance
       )
      )}
     </strong>

     <p>
      {isMonday
       ?mondayPreviousBalance>0
        ?'Your completed weekly balance before payout.'
        :mondayPreviousBalance<0
        ?'Your completed weekly balance owed to the office.'
        :'Your previous week is fully settled.'
       :liveCurrentBalance>0
        ?'Your running balance currently due to you.'
        :liveCurrentBalance<0
        ?'Your running balance currently due to the office.'
        :'Your live office balance is currently clear.'
      }
     </p>
    </div>

    <button
     type="button"
     className="financeHeroRefresh"
     onClick={()=>load(true)}
     aria-label="Refresh balance"
    >
     <RefreshCw/>
    </button>
   </div>

   {isMonday&&mondayPreviousBalance>0&&
    <div className="financeSettlementState">
     <span>WEEKLY PAYOUT</span>

     <b>
      {weeklyPayoutPaid
       ?'Paid'
       :weeklyPayoutProcessing
       ?'Processing'
       :weeklyPayoutScheduled
       ?'Scheduled'
       :latestWeeklyPayout
       ?String(latestWeeklyPayout.status||'Pending').replaceAll('_',' ')
       :'Awaiting Monday run'
      }
     </b>

     <small>
      {latestWeeklyPayout
       ?weeklyPayoutPaid
        ?`${money(weeklyPayoutAmount)} paid to your bank`
        :`${money(weeklyPayoutAmount)} ${
          weeklyPayoutProcessing?'being processed':'due for payout'
         }`
       :'Your payout will appear here when the Monday run is prepared.'
      }
     </small>
    </div>
   }

   {isMonday&&mondayPreviousBalance<0&&
    <div className={`financeSettlementState ${mondayDebtPaid?'paid':'due'}`}>
     <span>PAYMENT TO OFFICE</span>

     <b>
      {mondayDebtPaid
       ?'Payment received'
       :mondayDebtOutstanding
       ?`Due ${mondayDueLabel}`
       :'Awaiting Monday run'
      }
     </b>

     <small>
      {mondayDebtPaid
       ?`${money(
         latestWeeklyPaymentRequest?.amount||
         Math.abs(mondayPreviousBalance)
        )} cleared`
       :mondayDebtOutstanding
       ?`${money(
         latestWeeklyPaymentRequest?.amount||
         Math.abs(mondayPreviousBalance)
        )} outstanding`
       :'Your secure payment request will appear after the Monday run.'
      }
     </small>
    </div>
   }

   {isMonday&&mondayPlanAllocation>0&&
    <div className="financeDeductionRow">
     <span>Payment plan instalment</span>
     <b>−{money(mondayPlanAllocation)}</b>
    </div>
   }

   {!isMonday&&
    <button
     type="button"
     className="financeEarlyPayout"
     onClick={()=>changeTab('pay')}
    >
     <span>
      <b>Available for early payout</b>
      <small>
       {me.earlyPayoutAllowed
        ?'Request funds before the weekly settlement'
        :me.earlyPayoutBlockedReason||
         me.earlyPayoutWindowMessage||
         'Currently unavailable'
       }
      </small>
     </span>

     <strong>{money(me.availableForEarlyPayout||0)}</strong>
     <ChevronRight/>
    </button>
   }

   {isMonday&&mondayDebtOutstanding&&
    <button
     type="button"
     className="financePrimaryAction"
     onClick={()=>changeTab('pay')}
    >
     Pay amount due
     <ChevronRight/>
    </button>
   }
  </section>

  {activePaymentPlan&&PaymentPlanCard({compact:true})}

  {(()=>{
   const jobState=
    livePaymentPaid
     ?'paid'
     :livePaymentReady
     ?'ready'
     :livePaymentPreview?.ok
     ?'cash'
     :livePaymentAccountBooking
     ?'account'
     :livePaymentCardBooking
     ?'card'
     :'clear';

   const active=jobState!=='clear';

   const payment=
    matchingLivePayment||
    lastLivePaid?.payment||
    null;

   const fare=Number(
    payment?.fareAmount||
    bookingSnapshot?.fareAmount||
    0
   );

   const total=Number(
    payment?.totalAmount||
    bookingSnapshot?.totalAmount||
    0
   );

   const detail=
    jobState==='cash'
     ?`Cash · ${money(fare)}`
     :jobState==='ready'
     ?`Payment ready · ${money(total)}`
     :jobState==='paid'
     ?`Payment received · ${money(total)}`
     :jobState==='account'
     ?'Account · No payment required'
     :jobState==='card'
     ?'Card · Payment already arranged'
     :'No active customer payment';

   const bookingId=
    bookingSnapshot?.bookingId||
    livePaymentPreviousBookingId||
    null;

   return <button
    className={`mockJobStatus job-${jobState} ${active?'live':'clear'}`}
    type="button"
    onClick={()=>changeTab('pay')}
   >
    <span className="mockJobStatusDot"><i/></span>

    <span className="mockJobStatusCopy">
     <b>{active?'Live booking':'No active booking'}</b>
     <small>{detail}</small>
    </span>

    {bookingId&&
     <span className="mockJobStatusRef">
      #{bookingId}
     </span>
    }

    <ChevronRight/>
   </button>;
  })()}

  <button
   type="button"
   className="mockWhiteCard financeAccountWorkSummary"
   onClick={()=>changeTab('activity')}
  >
   <span className="mockRoundIcon indigo"><WalletCards/></span>

   <span>
    <b>Account work this week</b>
    <small>
     {Number(accountWeekSummary.jobs||0)} posted {
      Number(accountWeekSummary.jobs||0)===1?'job':'jobs'
     }
    </small>
   </span>

   <strong>{money(accountWeekSummary.totalDriverCost||0)}</strong>
   <ChevronRight/>
  </button>

  {recentOfficeActivity.length>0&&
   <section className="mockWhiteCard mockRecentCard financeRecentActivity">
    <div className="mockSectionHead">
     <div>
      <span>RECENT</span>
      <h2>Office activity</h2>
     </div>
     <button onClick={()=>changeTab('activity')}>See all</button>
    </div>

    {recentOfficeActivity.map(x=>
     <div className="mockTransactionRow" key={x.id}>
      <span className={`mockRoundIcon ${x.direction==='credit'?'blue':'amber'}`}>
       {x.direction==='credit'?<ArrowDownLeft/>:<ArrowUpRight/>}
      </span>

      <div>
       <b>{x.description||String(x.entryType||'Office transaction').replaceAll('_',' ')}</b>
       <small>{dt(x.createdAt)}</small>
      </div>

      <strong>
       {x.direction==='credit'?'+':'−'}
       {money(Math.abs(Number(x.amount||0)))}
      </strong>
     </div>
    )}
   </section>
  }

  {!bankAccount.configured&&
   <button
    className="mockWhiteCard mockActionRow"
    type="button"
    onClick={()=>changeTab('account')}
   >
    <span className="mockRoundIcon blue"><Banknote/></span>
    <span>
     <b>Add payout bank account</b>
     <small>Required before FaivoPay can send payouts.</small>
    </span>
    <ChevronRight/>
   </button>
  }
 </div>;

 const PayPage=()=>{
  const display=bookingSnapshot;
  const accountState=
   livePaymentAccountBooking &&
   !paidLiveView &&
   !livePaymentReady;

  const cardState=
   livePaymentCardBooking &&
   !paidLiveView &&
   !livePaymentReady;

  const readyPayment=livePaymentReady?matchingLivePayment:null;

  const state=
   paidLiveView || livePaymentPaid
    ?'paid'
    :readyPayment
    ?'ready'
    :livePaymentAvailable
    ?'cash'
    :accountState
    ?'account'
    :cardState
    ?'card'
    :'empty';

  const bookingStatusTitle=
   state==='account'
    ?'Account booking'
    :state==='card'
    ?'Card booking'
    :state==='empty'
    ?'No payment required'
    :state==='cash'
    ?'Cash booking'
    :state==='ready'
    ?'Payment ready'
    :'Payment received';

  const cashFareAmount=
   state==='cash'
    ?(
      liveFareEdit.bookingId===
      String(display?.bookingId||'')
       ?Math.round(Number(liveFareEdit.value||0)*100)/100
       :Math.round(Number(display?.fareAmount||0)*100)/100
     )
    :0;

  const cashFeeAmount=
   state==='cash' && Number.isFinite(cashFareAmount)
    ?Math.round(
      (
       feeType==='percentage'
        ?cashFareAmount*(feeValue/100)
        :feeValue
      )*100
     )/100
    :0;

  const cashTotalAmount=
   Math.round((cashFareAmount+cashFeeAmount)*100)/100;

  const bookingStatusText=
   state==='account'
    ?'Already on account — customer payment is disabled.'
    :state==='card'
    ?'Card payment is already being handled for this booking.'
    :state==='empty'
    ?'An eligible Cash booking will appear here automatically.'
    :state==='cash'
    ?'Customer payment is available for this booking.'
    :state==='ready'
    ?'Secure payment link ready for the customer.'
    :'Customer payment received successfully.';

  return <div className={`driverPageView mockPaymentsPage financePaymentsPage payment-state-${state}`}>
   <div className="financePaymentsIntro compact">
    <span>YOUR MONEY</span>
    <h2>Payments</h2>
    <p>Manage amounts due, payment plans and early payouts.</p>
   </div>

   <button
    type="button"
    className={`financeBookingStatus state-${state}`}
    onClick={()=>state==='empty'?testLivePaymentPreview():null}
   >
    <span className={`financeBookingDot ${state}`}/>
    <span className="financeBookingCopy">
     <b>{bookingStatusTitle}</b>
     <small>{bookingStatusText}</small>
    </span>

    {(state==='cash'||state==='ready'||state==='paid'||state==='account'||state==='card')&&
     <span className="financeBookingRef">
      #{display?.bookingId||livePaymentPreviousBookingId||'—'}
     </span>
    }

    {state==='empty'&&<RefreshCw/>}
   </button>

   {(standardPaymentRequests.length>0||activePaymentPlan)&&
    <section className="financePaymentsPriority">
     {standardPaymentRequests.length>0&&PaymentDueCard({hero:true})}
     {activePaymentPlan&&PaymentPlanCard()}
    </section>
   }

   {standardPaymentRequests.length===0&&!activePaymentPlan&&
    <div className="mockSecondaryStack financeEarlySection">
     {EarlyPayoutCard()}
    </div>
   }

   {(state==='account'||state==='card')&&
    <section className="financeCustomerPaymentSection">
     <div className="financeSectionHeading">
      <div>
       <span>CURRENT BOOKING</span>
       <h3>Customer payment</h3>
      </div>
      <small>{state==='account'?'Account':'Card'} booking</small>
     </div>

     <section className={`mockPaymentSurface state-${state} nonPayableBooking`}>
      <div className="mockPaymentStatusRow">
       <span className={`mockBookingBadge ${state}`}>
        {state==='account'?'▣ ACCOUNT BOOKING':'💳 CARD BOOKING'}
       </span>

       <small>
        Booking #{livePaymentPreview?.bookingId||livePaymentPreviousBookingId||'—'}
       </small>
      </div>

      <div className={`mockAccountNotice ${state}`}>
       <CreditCard/>
       <div>
        <b>
         {state==='account'
          ?'No customer payment required'
          :'Payment already arranged'}
        </b>
        <span>
         {state==='account'
          ?'This booking is already on account, so the driver cannot take another payment through FaivoPay.'
          :'This booking is already set to Card. FaivoPay will not allow the driver to create a second customer payment.'}
        </span>
       </div>
      </div>
     </section>
    </section>
   }

   {(state==='cash'||state==='ready'||state==='paid')&&
    <section className="financeCustomerPaymentSection">
     <div className="financeSectionHeading">
      <div>
       <span>CURRENT BOOKING</span>
       <h3>Customer payment</h3>
      </div>
      <small>Cash booking</small>
     </div>

     <section className={`mockPaymentSurface state-${state}`}>
      <div className="mockPaymentStatusRow">
       <span className={`mockBookingBadge ${state}`}>
        {state==='cash'
         ?'⚡ LIVE CASH BOOKING'
         :state==='ready'
         ?'🔗 PAYMENT READY'
         :'✓ PAYMENT RECEIVED'
        }
       </span>

       <small>
        Booking #{display?.bookingId||livePaymentPreviousBookingId||'—'}
       </small>
      </div>

      {display&&<>
       {state==='cash'
        ?<div className="mockFareEditor">
          <div className="mockFareEditorHead">
           <div>
            <span>FINAL JOURNEY FARE</span>
            <small>
             Change this if waiting, an extra stop or another adjustment changed the final fare.
            </small>
           </div>

           <span className="mockFareSource">
            Autocab {money(display?.fareAmount||0)}
           </span>
          </div>

          <label className="mockFareInput">
           <span>£</span>
           <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={
             liveFareEdit.bookingId===
             String(display?.bookingId||'')
              ?liveFareEdit.value
              :Number(display?.fareAmount||0).toFixed(2)
            }
            onChange={e=>
             setLiveFareEdit({
              bookingId:String(display?.bookingId||''),
              value:e.target.value
             })
            }
            aria-label="Final journey fare"
           />
          </label>
         </div>
        :<div className="mockDriverFare">
          <strong>
           {money(
            readyPayment?.fareAmount||
            lastLivePaid?.payment?.fareAmount||
            matchingLivePayment?.fareAmount||
            display?.fareAmount||
            0
           )}
          </strong>
          <span>Journey fare</span>
         </div>
       }

       <MockRoute preview={display}/>
      </>}

      {state==='cash'&&<>
       <div className="mockCustomerTotal">
        <span>Customer pays</span>
        <strong>{money(cashTotalAmount)}</strong>
        <small>
         {money(cashFareAmount)} journey + {
          money(cashFeeAmount)
         } FaivoPay fee
        </small>
       </div>

       <button
        type="button"
        className="mockTakePayment"
        disabled={customerPaymentBusy}
        onClick={createLiveCustomerPayment}
       >
        <CreditCard/>
        <b>{customerPaymentBusy?'Creating payment…':'Take payment'}</b>
       </button>
      </>}

      {state==='ready'&&readyPayment&&<>
       <div className="mockCustomerTotal">
        <span>Customer pays</span>
        <strong>{money(readyPayment.totalAmount)}</strong>
        <small>
         {money(readyPayment.fareAmount)} journey + {
          money(readyPayment.feeAmount)
         } FaivoPay fee
        </small>
       </div>

       <div className="mockQrBox">
        <QRCodeSVG
         value={readyPayment.paymentUrl}
         size={174}
         level="M"
         includeMargin
        />
       </div>

       <button
        className="mockPrimaryNavy"
        type="button"
        onClick={()=>sharePayment(readyPayment)}
       >
        <Send/>
        Share payment link
       </button>

       <button
        className="mockOutlineAction"
        type="button"
        onClick={async()=>{
         try{
          await navigator.clipboard.writeText(readyPayment.paymentUrl);
          setNotice('Payment link copied.');
         }catch{}
        }}
       >
        <Hash/>
        Copy link
       </button>
      </>}

      {state==='paid'&&(()=>{
       const paidPayment=
        lastLivePaid?.payment||
        matchingLivePayment;

       if(!paidPayment)return null;

       return <div className="mockPaidPanel">
        <div>
         <span>Customer paid</span>
         <strong>{money(paidPayment.totalAmount)}</strong>
         <small>
          {money(paidPayment.fareAmount)} journey + {
           money(paidPayment.feeAmount)
          } FaivoPay fee
         </small>

         {paidPayment.paidAt&&
          <small>
           <Clock3/> Paid {dt(paidPayment.paidAt)}
          </small>
         }

         <small className="mockPaidConfirmed">
          ✓ Booking payment updated in FaivoPay
         </small>
        </div>

        <CheckCircle2/>
       </div>;
      })()}
     </section>
    </section>
   }
  </div>;
 };

 const ActivityPage=()=>{
  const showAccountWork=activityFilter==='account-work';
  const showLedger=activityFilter==='ledger';
  const showPayouts=activityFilter==='payouts';

  const activityRange=driverActivityRange(activityDateFilter);

  /*
   * The API already receives the selected period, but keep the rendered
   * jobs constrained here as well so a slower response from a previous
   * period cannot repopulate the current view.
   */
  const jobs=(accountWork?.jobs||[]).filter(
   x=>driverActivityInRange(x.postedAt||x.completedAt,activityRange)
  );

  const summary={
   jobs:jobs.length,
   totalDriverCost:Math.round(
    jobs.reduce((sum,x)=>sum+Number(x.driverCost||0),0)*100
   )/100,
   totalWaitingCost:Math.round(
    jobs.reduce((sum,x)=>sum+Number(x.waitingTimeCost||0),0)*100
   )/100,
   totalExtraCost:Math.round(
    jobs.reduce((sum,x)=>sum+Number(x.extraCost||0),0)*100
   )/100
  };

  const filteredLedger=(me.ledger||[]).filter(
   x=>driverActivityInRange(x.createdAt,activityRange)
  );

  const filteredPayoutActivity=(me.earlyPayoutRequests||[]).filter(
   x=>driverActivityInRange(
    x.createdAt||x.updatedAt||x.paidAt,
    activityRange
   )
  );

  const activityPeriodLabel={
   'today':'Today',
   'yesterday':'Yesterday',
   'this-week':'This week',
   'last-week':'Last week',
   'all':'All'
  }[activityDateFilter]||'This week';

  return <div className="driverPageView mockTransactionsPage">
   <section className="driverActivityFilters">
    <div className="driverActivityFilterGroup">
     <span className="driverActivityFilterLabel">View</span>
     <div className="mockSegmented mockTransactionsTabs" role="tablist">
      {[
       ['account-work','Account Work'],
       ['ledger','Adjustments'],
       ['payouts','Payouts']
      ].map(([key,label])=>
       <button
        type="button"
        key={key}
        className={activityFilter===key?'active':''}
        onClick={()=>setActivityFilter(key)}
       >
        {label}
       </button>
      )}
     </div>
    </div>

    <div className="driverActivityFilterGroup">
     <span className="driverActivityFilterLabel">Period</span>
     <div className="driverActivityDateFilters" aria-label="Activity date range">
      {[
       ['today','Today'],
       ['yesterday','Yesterday'],
       ['this-week','This week'],
       ['last-week','Last week'],
       ['all','All']
      ].map(([key,label])=>
       <button
        key={key}
        type="button"
        className={activityDateFilter===key?'active':''}
        onClick={()=>setActivityDateFilter(key)}
       >
        {label}
       </button>
      )}
     </div>
    </div>
   </section>

   {showAccountWork&&<>
    <section className="mockAccountWorkSummary">
     <div>
      <span>POSTED · {activityPeriodLabel.toUpperCase()}</span>
      {accountWorkLoading
       ?<>
         <strong className="mockAccountWorkLoading">Loading…</strong>
         <small>Checking your posted account work</small>
        </>
       :<>
         <strong>{money(summary.totalDriverCost||0)}</strong>
         <small>
          {Number(summary.jobs||0)} posted {Number(summary.jobs||0)===1?'job':'jobs'}
         </small>
        </>
      }
     </div>
     <span className="mockRoundIcon indigo"><WalletCards/></span>
    </section>

    <section className="mockWhiteCard mockLedgerCard mockAccountWorkCard">
     <div className="mockSectionHead">
      <div>
       <span>ACCOUNT WORK</span>
       <h2>Posted jobs</h2>
      </div>
      <small>Final office-posted amounts</small>
     </div>

     {accountWorkError&&
      <div className="mockEmptyList">{accountWorkError}</div>
     }

     {accountWorkLoading&&
      <div className="mockEmptyList">Loading posted account work…</div>
     }

     {!accountWorkLoading&&!accountWorkError&&jobs.length===0&&
      <div className="mockEmptyList">
       No account work has been posted for {activityPeriodLabel.toLowerCase()}.
      </div>
     }

     {!accountWorkLoading&&!accountWorkError&&jobs.map(x=>
      <details className="mockAccountWorkRow" key={`aw-${x.autocabDocketId}`}>
       <summary>
        <span className="mockRoundIcon blue"><Banknote/></span>

        <span className="mockAccountWorkMain">
         <span className="mockAccountWorkTitle">
          <b>Booking {x.bookingId}</b>
          {x.source&&
           <i className={`mockAccountWorkStatus ${
            String(x.source).toLowerCase()==='completed'
             ?'completed'
             :String(x.source).toLowerCase()==='nofare'
             ?'nofare'
             :String(x.source).toLowerCase()==='cancelled'
             ?'cancelled'
             :''
           }`}>
            {String(x.source).toLowerCase()==='nofare'
             ?'No Fare'
             :x.source
            }
           </i>
          }
         </span>
         <span>{
          String(x.accountName||'').trim().toLowerCase()==='fleetpay uk'
           ?'FaivoPay'
           :x.accountName||x.accountCode||'Account job'
         }</span>
         {(Number(x.waitingTimeCost||0)>0||Number(x.extraCost||0)>0)&&
          <span className="mockAccountWorkFlags">
           {Number(x.waitingTimeCost||0)>0&&
            <i>
             Waiting
             {Number(x.waitingTime||0)>0?` ${Number(x.waitingTime)} min`:''}
             {' · '}{money(x.waitingTimeCost)}
            </i>
           }
           {Number(x.extraCost||0)>0&&
            <i>Extras · {money(x.extraCost)}</i>
           }
          </span>
         }
         <small>{dt(x.completedAt||x.postedAt)}</small>
        </span>

        <span className="mockAccountWorkAmount">
         <strong>{money(x.driverCost)}</strong>
         <ChevronRight/>
        </span>
       </summary>

       <div className="mockAccountWorkDetail">
        <div className="mockJourney">
         <div>
          <span>Pickup</span>
          <b>{x.pickup||'Not recorded'}</b>
         </div>
         {(x.vias||[]).map((via,index)=>
          <div key={`via-${x.autocabDocketId}-${index}`}>
           <span>{(x.vias||[]).length===1?'Via':`Via ${index+1}`}</span>
           <b>{via}</b>
          </div>
         )}
         <div>
          <span>Destination</span>
          <b>{x.destination||'Not recorded'}</b>
         </div>
        </div>

        <div className="mockAccountWorkBreakdown">

         <div>
          <span>Waiting</span>
          <b>
           {Number(x.waitingTime||0)>0
            ?`${Number(x.waitingTime)} min · ${money(x.waitingTimeCost||0)}`
            :money(x.waitingTimeCost||0)
           }
          </b>
         </div>

         <div>
          <span>Extras</span>
          <b>{money(x.extraCost||0)}</b>
         </div>

         <div className="mockAccountWorkTotal">
          <span>Total</span>
          <strong>{money(x.driverCost)}</strong>
         </div>
        </div>

        <div className="mockAccountWorkMeta">
         <div>
          <span>Docket</span>
          <b>{x.docketNumber||'—'}</b>
         </div>
         <div>
          <span>Posted</span>
          <b>{dt(x.postedAt)}</b>
         </div>
         {x.accountCode&&
          <div>
           <span>Account code</span>
           <b>{x.accountCode}</b>
          </div>
         }
        </div>

        <div className="mockAccountWorkNote">
         <ShieldCheck/>
         <span>
          Total is the final amount posted by the office. Waiting and extras are shown where applied.</span>
        </div>
       </div>
      </details>
     )}
    </section>
   </>}

   {showLedger&&
    <section className="mockWhiteCard mockLedgerCard">
     <div className="mockSectionHead">
      <div>
       <span>ACCOUNT</span>
       <h2>Account adjustments</h2>
      </div>
     </div>

     {filteredLedger.length===0
      ?<div className="mockEmptyList">No account adjustments for {activityPeriodLabel.toLowerCase()}.</div>
      :filteredLedger.slice(0,30).map(x=>
       <div className="mockTransactionRow" key={`lg-${x.id}`}>
        <span className="mockRoundIcon slate"><WalletCards/></span>
        <div>
         <b>{x.description}</b>
         <small>
          {dt(x.createdAt)}
          {x.feeAmount>0?` · Fee ${money(x.feeAmount)}`:''}
         </small>
        </div>
        <strong className={x.direction==='credit'?'mockPos':'mockNeg'}>
         {x.direction==='credit'?'+':'-'}{money(x.amount)}
        </strong>
       </div>
      )
     }
    </section>
   }

   {showPayouts&&
    <section className="mockWhiteCard mockLedgerCard">
     <div className="mockSectionHead">
      <div>
       <span>PAYOUTS</span>
       <h2>Payout history</h2>
      </div>
     </div>

     {filteredPayoutActivity.length===0
      ?<div className="mockEmptyList">No payouts for {activityPeriodLabel.toLowerCase()}.</div>
      :filteredPayoutActivity.slice(0,20).map(x=>
       <div className="mockTransactionRow" key={`po-${x.id}`}>
        <span className="mockRoundIcon amber"><ArrowUpRight/></span>
        <div>
         <b>{money(x.netAmount)}</b>
         <small>
          {dt(x.createdAt)}
          {x.declineReason?` · ${x.declineReason}`:''}
         </small>
        </div>
        <Pill tone={
         x.status==='approved'||x.status==='paid'
          ?'good'
          :x.status==='declined'
           ?'bad'
           :'neutral'
        }>
         {x.status}
        </Pill>
       </div>
      )
     }
    </section>
   }
  </div>;
 };

 const BankAccountCard=()=> <section className={`driverCard bankAccountCard ${bankAccount.configured?'configured':'missing'}`}>
  <div className="sectionHeader bankSectionHeader"><div><span className="eyebrow">PAYOUT BANK ACCOUNT</span><h2>{bankAccount.configured?'Bank account saved':'Add payout account'}</h2></div><div className="iconBubble"><Banknote/></div></div>
  {!bankEditing&&bankAccount.configured&&<><div className="savedBankSummary"><div className="bankLogoTile"><Banknote/></div><div><span>Account ending</span><b>{bankAccount.accountNumberMasked}</b><small>Sort code {bankAccount.sortCodeMasked}</small></div><Pill tone="good">Saved</Pill></div><div className="bankSecurityNote"><ShieldCheck/><span>Full bank details are encrypted and are never shown again in the app.</span></div><button type="button" className="outline full bankChangeButton" onClick={()=>{setBankEditing(true);setErr('')}}>Change bank account</button></>}
  {!bankEditing&&!bankAccount.configured&&<><p className="compactCopy">Add the UK bank account where you want FaivoPay payouts sent.</p><div className="bankSecurityNote"><ShieldCheck/><span>Your account number and sort code are encrypted. We only display masked details after saving.</span></div><button type="button" className="primary full actionButton" onClick={()=>{setBankEditing(true);setErr('')}}>Add bank account</button></>}
  {bankEditing&&<form className="bankEditForm" onSubmit={saveBankAccount}><div className="bankWarning"><AlertTriangle/><span>{bankAccount.configured?'Changing these details changes where all future FaivoPay payouts will be sent.':'Check these details carefully. Future FaivoPay payouts will be sent to this account.'}</span></div><label>Account holder name<input className="modernInput" autoComplete="name" placeholder="Name on the bank account" required value={bankForm.accountHolder} onChange={e=>setBankForm({...bankForm,accountHolder:e.target.value})}/></label><div className="bankFieldGrid"><label>Sort code<input className="modernInput" inputMode="numeric" autoComplete="off" placeholder="12-34-56" maxLength="8" required value={bankForm.sortCode} onChange={e=>{const n=e.target.value.replace(/\D/g,'').slice(0,6);setBankForm({...bankForm,sortCode:n.replace(/(\d{2})(?=\d)/g,'$1-')})}}/></label><label>Account number<input className="modernInput" inputMode="numeric" autoComplete="off" placeholder="12345678" maxLength="8" required value={bankForm.accountNumber} onChange={e=>setBankForm({...bankForm,accountNumber:e.target.value.replace(/\D/g,'').slice(0,8)})}/></label></div><label>Confirm with FaivoPay password<div className="authField inlinePasswordField"><KeyRound/><input type="password" autoComplete="current-password" required placeholder="Your FaivoPay password" value={bankForm.password} onChange={e=>setBankForm({...bankForm,password:e.target.value})}/></div></label><div className="bankFormActions"><button type="button" className="outline" onClick={()=>{setBankEditing(false);setBankForm({accountHolder:'',sortCode:'',accountNumber:'',password:''})}}>Cancel</button><button type="submit" className="primary" disabled={bankBusy}>{bankBusy?'Saving…':bankAccount.configured?'Save new account':'Save bank account'}</button></div></form>}
  {bankAccount.configured&&<small className="bankUpdated">Last changed {dt(bankAccount.updatedAt)}</small>}
 </section>;


 const NotificationDrawer=()=> <div
  className="driverNotificationLayer"
  onClick={()=>setShowNotifications(false)}
 >
  <section
   className="driverNotificationSheet"
   onClick={e=>e.stopPropagation()}
  >
   <div className="driverNotificationHead">
    <div>
     <span>NOTIFICATIONS</span>
     <h2>Updates & actions</h2>
    </div>

    <button
     type="button"
     onClick={()=>setShowNotifications(false)}
     aria-label="Close notifications"
    >
     <X/>
    </button>
   </div>

   {notifications.length===0
    ?<div className="driverNotificationEmpty">
      <Bell/>
      <b>You're all caught up</b>
      <span>Payment and payout updates will appear here.</span>
     </div>
    :<div className="driverNotificationList">
      {notifications.map(x=>
       <div
        className={`driverNotificationItem ${x.readAt?'read':'unread'} ${x.type||''}`}
        key={x.id}
       >
        <span className="driverNotificationIcon">
         {x.type==='success'
          ?<CheckCircle2/>
          :x.type==='warning'
          ?<AlertTriangle/>
          :<Info/>
         }
        </span>

        <div>
         <b>{x.title}</b>
         <span>{x.message}</span>
         <small>{dt(x.createdAt)}</small>
        </div>
       </div>
      )}
     </div>
   }
  </section>
 </div>;

 const AccountPage=()=> <div className="driverPageView mockAccountPage">
  <section className="mockWhiteCard mockProfileSummary">
   <div className="mockProfileAvatar">{firstName[0]}{(d.surname||'')[0]||''}</div>
   <div><b>{d.fullName}</b><span>Driver ID: {d.callsign}</span></div>
   <ChevronRight/>
  </section>

  <details className="mockAccountDisclosure">
   <summary><span className="mockRoundIcon indigo"><Banknote/></span><span><b>Bank account & payouts</b><small>Manage your bank details and early payouts</small></span><ChevronRight/></summary>
   <div className="mockDisclosureBody">{BankAccountCard()}<div className="mockAccountInner">{EarlyPayoutCard()}</div></div>
  </details>

  <details className="mockAccountDisclosure">
   <summary><span className="mockRoundIcon blue"><Settings/></span><span><b>App preferences</b><small>Notifications, appearance and app settings</small></span><ChevronRight/></summary>
   <div className="mockDisclosureBody">
    {pushAvailable&&<section className="driverCard"><div className="compactAction"><div className="compactActionIcon"><Smartphone/></div><div><b>Payment alerts</b><span>{pushReady?'Notifications are enabled.':'Get updates about payments and payouts.'}</span></div>{!pushReady&&<button className="mini" onClick={enablePush}>Enable</button>}{pushReady&&<Pill tone="good">On</Pill>}</div></section>}
    <section className="driverCard appearanceCard"><div className="sectionHeader"><div><span className="eyebrow">APPEARANCE</span><h2>Display</h2></div></div><div className="themeOptions"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/><span><b>Light</b><small>Bright and clean</small></span></button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/><span><b>Dark</b><small>Low-light friendly</small></span></button></div><div className="textSizeControl"><div className="textSizeHead"><div><b>Text size</b><span>Choose a comfortable reading size.</span></div><strong>{Math.round(textScale*100)}%</strong></div><div className="textSizeSliderRow"><span className="textSizeSmall">A</span><input aria-label="Text size" type="range" min="0.9" max="1.5" step="0.05" value={textScale} onChange={e=>setTextScale(Number(e.target.value))}/><span className="textSizeLarge">A</span></div><div className="textSizePresets" aria-label="Text size presets"><button type="button" className={textScale===0.9?'active':''} onClick={()=>setTextScale(0.9)}>Small</button><button type="button" className={textScale===1?'active':''} onClick={()=>setTextScale(1)}>Standard</button><button type="button" className={textScale===1.2?'active':''} onClick={()=>setTextScale(1.2)}>Large</button><button type="button" className={textScale===1.35?'active':''} onClick={()=>setTextScale(1.35)}>Extra Large</button><button type="button" className={textScale===1.5?'active':''} onClick={()=>setTextScale(1.5)}>Maximum</button></div><button type="button" className="textSizeReset" onClick={()=>setTextScale(1)}>Reset to standard</button></div></section>
    <section className="driverCard"><div className="sectionHeader"><div><span className="eyebrow">FEES</span><h2>Your FaivoPay fees</h2></div></div><div className="feeRows"><div><span>Weekly app fee</span><b>{money(me.settings.weeklyAppFee)}</b></div><div><span>Early payout fee</span><b>{money(me.settings.earlyPayoutFee)}</b></div><div><span>Customer service fee</span><b>{feeType==='percentage'?`${feeValue}%`:money(feeValue)}</b></div></div></section>
   </div>
  </details>

  <details className="mockAccountDisclosure">
   <summary><span className="mockRoundIcon blue"><Info/></span><span><b>Help & support</b><small>FAQs, support and driver information</small></span><ChevronRight/></summary>
   <div className="mockDisclosureText"><p>For help with your FaivoPay driver account, payments, payouts or payment plan, contact your operator support team.</p></div>
  </details>

  <details className="mockAccountDisclosure">
   <summary><span className="mockRoundIcon blue"><Info/></span><span><b>About FaivoPay</b><small>Secure driver and customer payments</small></span><ChevronRight/></summary>
   <div className="mockDisclosureText"><p>FaivoPay securely manages driver balances, customer card payments, payouts and payment-plan activity.</p><small>Last sync {dt(d.syncedAt)}</small></div>
  </details>

  <button className="mockLogoutRow" type="button" onClick={logout}><LogOut/><span>Log out</span></button>
 </div>;

 return <div className={`driverApp modernDriverApp driverVNext mockDriverApp theme-${theme}`} style={{'--driver-text-scale':textScale}}>
  <header className="mockAppHeader">
   <div className="mockHeaderTop">
    <div className="mockBrandLockup">
     <div className="mockWordmark mockWordmarkImage"><img src={faivopayMark} alt="FaivoPay"/></div>
     <div className="mockBrandWords">
      <b>FaivoPay</b>
      <span>Fairer, faster and simpler payments</span>
     </div>
    </div>
    <button className="mockHeaderBell" type="button" onClick={openNotifications} aria-label="Notifications"><Bell/>{unreadNotifications.length>0&&<i/>}</button>
   </div>
   <div className="mockHeaderTitle">
    <h1>{driverTab==='home'?`${greeting}, ${firstName}`:driverTab==='activity'?'Transactions':driverTab==='pay'?'Payments':'Account'}</h1>
    {driverTab!=='home'&&<button type="button" onClick={()=>load(true)} aria-label="Refresh"><RefreshCw/></button>}
   </div>
  </header>

  {showNotifications&&NotificationDrawer()}

  <main className="modernDriverMain mockDriverMain">
   {notice&&<div className="driverNotice floatingNotice"><CheckCircle2/><span>{notice}</span><button onClick={()=>setNotice('')}><X/></button></div>}
   {err&&<div className="inlineError driverGlobalError"><AlertTriangle/>{err}</div>}
   {driverTab==='home'&&HomePage()}
   {driverTab==='pay'&&PayPage()}
   {driverTab==='activity'&&ActivityPage()}
   {driverTab==='account'&&AccountPage()}
  </main>

  <nav className="driverBottomNav mockBottomNav" aria-label="Driver navigation">
   {navItems.map(([key,Icon,label])=><button key={key} className={driverTab===key?'active':''} onClick={()=>changeTab(key)}>
    <span className="mockNavIcon"><Icon/>{key==='pay'&&livePaymentAvailable&&<i className="livePayPulse" aria-label="Customer payment available"/>}{key==='pay'&&!livePaymentAvailable&&paymentRequests.length>0&&<i className="mockNavCount">{paymentRequests.length}</i>}{key==='activity'&&accountWorkNewCount>0&&<i className="mockNavCount" aria-label={`${accountWorkNewCount} new account work ${accountWorkNewCount===1?'docket':'dockets'}`}>{accountWorkNewCount>99?'99+':accountWorkNewCount}</i>}</span>
    <span>{label}</span>
   </button>)}
  </nav>
 </div>;
}


const isNativeApp = Capacitor.isNativePlatform();
const isPayPage = !isNativeApp && window.location.pathname.startsWith('/pay/');
const isDriver = isNativeApp || window.location.pathname.startsWith('/driver');

createRoot(document.getElementById('root')).render(
  isPayPage ? <CustomerPayPage /> : isDriver ? <DriverApp /> : <AdminApp />
);
