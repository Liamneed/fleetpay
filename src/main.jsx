import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import { QRCodeSVG } from 'qrcode.react';
import{Activity,AlertTriangle,ArrowRight,ArrowUpRight,BadgePoundSterling,Banknote,Bell,CalendarDays,CheckCircle2,ChevronRight,Clock3,CreditCard,Database,FileClock,Hash,Home,Info,KeyRound,LayoutDashboard,LogIn,LogOut,Mail,Menu,Phone,PlayCircle,RefreshCw,Search,Send,Settings,ShieldCheck,Smartphone,Users,UserCheck,WalletCards,X,Sun,Moon,Eye,EyeOff}from'lucide-react';
import fleetpayMark from './assets/fleetpay-mark.png';
import'./styles.css';
const money=v=>v==null?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(v);
const dt=v=>v?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Never';

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

function Logo(){return <div className="logo"><div className="logoMark">FP</div><div><b>FleetPay</b><span>Driver Payments</span></div></div>}

function Stat({icon:Icon,label,value,sub}){return <div className="stat"><div className="statIcon"><Icon/></div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>}

function Pill({children,tone='neutral'}){return <span className={`pill ${tone}`}>{children}</span>}


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
 const StepBar=({run,early=false})=>{const steps=early?earlySteps:weeklySteps,idx=stepIndex(run,early);return <div className="demoProcessSteps v23">{steps.map((x,i)=><div key={x[1]} className={`${i<=idx?'done':''} ${i===idx?'current':''}`}><span>{i<idx?'✓':i+1}</span><b>{x[1]}</b></div>)}</div>};
 const Procedure=({early=false})=><div className="operatorProcedure"><div className="procedureTitle"><ShieldCheck/><div><b>{early?'Early payout operator procedure':'Monday weekly operator procedure'}</b><span>{early?'Uses the driver’s current Autocab balance — no Rent Sheets step.':'Always start after Monday Rent Sheets have been completed in Autocab.'}</span></div></div><div className="procedureGrid">{(early?[
  ['1','Sync current balance','Refresh Autocab and confirm the driver still has enough available balance.'],['2','Review requests','Approve/decline every request. Nothing advances with pending decisions.'],['3','Create & lock run','Freeze the approved amounts so they cannot silently change.'],['4','Check Wise cleared funds','Use existing GBP balance first. If short, transfer only the shortfall.'],['5','Release payouts','Blocked until FleetPay confirms cleared Wise balance is sufficient.'],['6','Monitor Wise','Track each driver payment individually. Retry failures only.'],['7','Update Autocab','Only successful bank payouts create the matching Autocab adjustment.'],['8','Reconcile & lock','Wise paid total and Autocab adjustments must match before completion.']
 ]:[
  ['1','Confirm Rent Sheets','Operator confirms Monday Rent Sheets have completed in Autocab.'],['2','Sync Previous Balance','FleetPay refreshes Autocab and captures the post-rent-sheet Previous Balance.'],['3','Review every payout','Approve or exclude every positive balance. Collections remain separate.'],['4','Create & lock run','Approved driver list and values are frozen before funding.'],['5','Fund Wise','FleetPay shows cleared Wise balance, exact shortfall, bank details and run reference.'],['6','Release payouts','Blocked until cleared funds cover the complete approved run.'],['7','Update Autocab','Only each confirmed successful payout is posted back to Autocab.'],['8','Reconcile & lock','Wise + FleetPay + Autocab must agree before the run can close.']
 ]).map(x=><div key={x[0]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</div></div>;
 const Funding=({run,title,early=false})=>{if(!['funding','funding_wait','funded','monitor','complete'].includes(run.stage))return null;const required=Number(run.fundingRequired||paymentTotal(run,early)),top=Number(run.topUpRequired||0),sent=Number(run.fundingTransferAmount||0);return <div className="demoFundingBox v23"><div className="demoFundingHead"><div><span>DEMO WISE FUNDING CONTROL</span><h4>{title}</h4></div><Pill tone={run.stage==='funded'||run.stage==='monitor'||run.stage==='complete'?'good':'warn'}>{run.stage==='funded'||run.stage==='monitor'||run.stage==='complete'?'Cleared funds confirmed':run.stage==='funding_wait'?'Bank transfer sent — awaiting clearance':'Funding check required'}</Pill></div><div className="demoFundingGrid"><div><span>Approved payout total</span><strong>{money(required)}</strong></div><div><span>Cleared demo Wise balance</span><strong>{money(run.wiseBalance||0)}</strong></div><div><span>Shortfall to transfer</span><strong className={top>0?'negative':''}>{money(top)}</strong></div><div><span>Payment run reference</span><strong>{run.reference||'—'}</strong></div></div><div className="demoBankDetails"><div><span>Account name</span><b>{run.wiseAccount?.name}</b></div><div><span>Sort code</span><b>{run.wiseAccount?.sortCode}</b></div><div><span>Account number</span><b>{run.wiseAccount?.accountNumber}</b></div></div>{run.stage==='funding'&&<div className="operatorWarning"><AlertTriangle/><div><b>Funding gate</b><span>{top>0?`Transfer exactly ${money(top)} using reference ${run.reference}. FleetPay must not release any driver payment until Wise reports the money as cleared.`:'The existing Wise balance already covers this run. Check the cleared balance before release.'}</span></div></div>}{run.stage==='funding_wait'&&<div className="operatorWarning blue"><Clock3/><div><b>Waiting for cleared funds</b><span>{money(sent)} has been simulated as sent from the taxi company bank. The payout button stays locked until Wise confirms the credit.</span></div></div>}</div>};
 const StatusTable=({run,early=false})=>!['monitor','complete'].includes(run.stage)?null:<div className="demoMonitor"><div className="panelHead"><div><span className="sectionKicker">PAYMENT + AUTOCAB MONITOR</span><h3>Process each driver to final reconciliation</h3><p>A successful Wise payout is the trigger for the matching Autocab update. Failed bank payments must never reduce the driver’s Autocab balance.</p></div></div><div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Payout</th><th>Wise payment</th><th>Autocab adjustment</th><th>Result</th></tr></thead><tbody>{approved(run,early).map(x=><tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td><b>{money(early?x.netAmount:x.amount)}</b></td><td><Pill tone={tone(x.wiseStatus)}>{String(x.wiseStatus||'not_sent').replaceAll('_',' ')}</Pill></td><td><Pill tone={tone(x.autocabStatus)}>{String(x.autocabStatus||'not_posted').replaceAll('_',' ')}</Pill></td><td>{x.failureReason?<span className="failureText"><AlertTriangle/>{x.failureReason}</span>:x.wiseStatus==='paid'&&x.autocabStatus==='updated'?<span className="successText"><CheckCircle2/>Paid & reconciled</span>:'Waiting'}</td></tr>)}</tbody></table></div></div>;
 const RunCard=({kind,run,early=false})=>{const base=`/api/admin/demo/${kind}`;const title=early?'Early payout — complete operator walkthrough':'Monday weekly payout — complete operator walkthrough';return <section className="panel demoRunV22"><div className="panelHead"><div><span className="sectionKicker">{early?'DEMO EARLY PAYOUT':'DEMO MONDAY RUN'}</span><h3>{title}</h3><p>{early?'Uses the current Autocab balance and the same funding/release/reconciliation controls as Monday.':'This is the exact sequence the live Monday process will follow once Wise is connected.'}</p></div><Pill tone={run.stage==='complete'?'good':run.stage==='monitor'?'warn':'neutral'}>{run.stage==='complete'?'Reconciled':String(run.status||run.stage).replaceAll('_',' ')}</Pill></div><StepBar run={run} early={early}/><Procedure early={early}/>
 {!early&&run.stage==='rentsheets'&&<div className="demoActionStage"><div className="operatorWarning"><AlertTriangle/><div><b>Step 1 — Have Monday Rent Sheets been run?</b><span>Do not continue until Autocab Rent Sheets are complete. FleetPay will use the post-rent-sheet Previous Balance for the weekly settlement.</span></div></div><button className="primary largeAction" onClick={()=>action(`${base}/confirm-rentsheets`,'Confirm that Monday Rent Sheets have finished in Autocab?')}><CheckCircle2/>Confirm Rent Sheets completed</button></div>}
 {!early&&run.stage==='sync'&&<div className="demoActionStage"><div className="operatorWarning blue"><RefreshCw/><div><b>Step 2 — Sync Autocab Previous Balances</b><span>FleetPay now refreshes Autocab and captures the balances used for this run.</span></div></div><button className="primary largeAction" onClick={()=>action(`${base}/sync`,'Simulate a fresh Autocab sync after Rent Sheets?')}><RefreshCw/>Sync Autocab balances</button></div>}
 {early&&run.stage==='balance'&&<div className="demoActionStage"><div className="operatorWarning blue"><RefreshCw/><div><b>Step 1 — Sync current Autocab balances</b><span>No Rent Sheets are required. Early payouts are checked against the driver’s current available balance at the time of the run.</span></div></div><button className="primary largeAction" onClick={()=>action(`${base}/sync`,'Simulate a fresh current-balance sync for the early payout run?')}><RefreshCw/>Sync current balances</button></div>}
 {run.stage==='review'&&<><div className="operatorWarning"><AlertTriangle/><div><b>{early?'Step 2 — Review every early payout':'Step 3 — Review every weekly payout'}</b><span>{early?'Approve or decline every request after checking current balance.':'Approve or exclude every positive Previous Balance. The run cannot be created while any payout is undecided.'}</span></div></div><div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>{early?'Current request':'Previous balance'}</th><th>Fee</th><th>{early?'Driver receives':'Weekly payout'}</th><th>Status</th><th>Operator action</th></tr></thead><tbody>{run.items.map(x=><tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td className={!early&&x.previousBalance<0?'negative':''}>{money(early?x.grossAmount:x.previousBalance)}</td><td>{money(early?x.fee:x.weeklyFee)}</td><td><b>{Number(early?x.netAmount:x.amount)>0?money(early?x.netAmount:x.amount):'—'}</b></td><td><Pill tone={tone(x.status)}>{x.status}</Pill></td><td>{((early&&x.status==='requested')||(!early&&x.status!=='collection'))&&!['paid'].includes(x.status)&&<div className="compactActions"><button className="mini success" onClick={()=>action(`${base}/${x.id}`,'',{status:'approved'})}>Approve</button><button className="mini danger" onClick={()=>action(`${base}/${x.id}`,'',{status:early?'declined':'excluded'})}>{early?'Decline':'Exclude'}</button></div>}</td></tr>)}</tbody></table></div><div className="demoDecisionSummary"><div><span>Approved</span><b>{approved(run,early).length}</b></div><div><span>Still awaiting decision</span><b className={pending(run,early).length?'negative':''}>{pending(run,early).length}</b></div><div><span>Approved payout total</span><b>{money(paymentTotal(run,early))}</b></div></div><div className="demoActions"><button className="secondary" onClick={()=>action(`${base}/approve-all`,`Approve all remaining ${pending(run,early).length} demo payment(s)?`)}>Approve all remaining</button><button className="primary" disabled={pending(run,early).length>0||!approved(run,early).length} onClick={()=>action(`${base}/freeze`,'Final check: are all approved payment amounts correct? This locks the run before funding.')}>Create & lock payment run</button></div></>}
 <Funding run={run} title={early?'Early payout funding':'Monday weekly funding'} early={early}/>
 {run.stage==='funding'&&<div className="demoActions">{Number(run.topUpRequired||0)>0?<button className="primary" onClick={()=>action(`${base}/top-up`,`Simulate sending ${money(run.topUpRequired)} from the taxi company bank to the Wise GBP account? It will NOT be treated as cleared yet.`)}><Banknote/>Simulate bank transfer to Wise</button>:<button className="primary" onClick={()=>action(`${base}/fund`,'Check the demo Wise balance and confirm sufficient cleared funds are available?')}><RefreshCw/>Check cleared Wise funds</button>}</div>}
 {run.stage==='funding_wait'&&<div className="demoActions"><button className="primary successButton" onClick={()=>action(`${base}/fund`,'Simulate Wise confirming the incoming bank transfer has cleared?')}><RefreshCw/>Check Wise — funds now cleared</button></div>}
 {run.stage==='funded'&&<div className="demoActionStage"><div className="operatorWarning green"><CheckCircle2/><div><b>Funding gate passed</b><span>FleetPay has confirmed sufficient cleared Wise funds. Verify the approved count and total one final time before releasing the batch.</span></div></div><button className="primary largeAction" onClick={()=>action(`${base}/release`,`Release ${approved(run,early).length} demo payments totalling ${money(run.fundingRequired)}? In live mode this is the point the Wise batch is funded and money begins leaving.`)}><Send/>Release {early?'early payout':'weekly'} batch</button></div>}
 <StatusTable run={run} early={early}/>
 {run.stage==='monitor'&&<div className="demoActions"><button className="secondary" disabled={!processing(run,early).length} onClick={()=>action(`${base}/refresh-status`,'Simulate Wise completing the processing payments and FleetPay posting the successful Autocab adjustments?')}><RefreshCw/>Refresh Wise + Autocab status</button><button className="secondary dangerOutline" disabled={!failed(run,early).length} onClick={()=>action(`${base}/retry-failed`,'Simulate correcting the failed recipient and retry only that payment?')}><AlertTriangle/>Correct & retry failed ({failed(run,early).length})</button><button className="primary" disabled={failed(run,early).length>0||processing(run,early).length>0} onClick={()=>action(`${base}/reconcile`,'Final check: every approved Wise payment is Paid and every matching Autocab adjustment is Updated. Reconcile and permanently lock this demo run?')}><ShieldCheck/>Reconcile & lock run</button></div>}
 {run.stage==='complete'&&<div className="demoComplete"><CheckCircle2/><div><b>Run reconciled and locked</b><span>{approved(run,early).length} successful payments · {money(paymentTotal(run,early))} · all matching Autocab adjustments confirmed.</span></div></div>}
 </section>};
 return <><section className="demoWarning"><ShieldCheck/><div><b>DEMO MODE — NO REAL MONEY OR AUTOCAB CHANGES</b><span>This is the planned live operator workflow. Demo balances, Wise details and payment results are made-up.</span></div><button className="secondary" onClick={resetDemo}>Reset demo data</button></section><section className="officePageIntro"><div><span>OPERATOR TRAINING</span><h2>FleetPay Payment Process Demo Lab</h2><p>Every operator follows the same gated process. FleetPay will block the next step until the previous control has been completed.</p></div></section>{!demo?<section className="emptyState"><PlayCircle/><h3>Load training scenario</h3><p>Load isolated made-up drivers and balances.</p><button className="primary" onClick={loadDemo}>Load Demo Lab</button></section>:<div className="demoV22Stack"><RunCard kind="monday" run={demo.monday}/><RunCard kind="early" run={demo.early} early/><section className="panel demoComms"><div className="panelHead"><div><span className="sectionKicker">COMMUNICATION TEST</span><h3>Send clearly marked demo messages</h3><p>These are the only Demo Lab actions that can leave FleetPay. Use your own test address or mobile number.</p></div></div><div className="demoCommsGrid"><label>Test email address<input type="email" value={demoEmail} onChange={e=>setDemoEmail(e.target.value)} placeholder="your@email.co.uk"/><button className="secondary" onClick={sendEmail}><Mail/>Send demo email</button></label><label>Test mobile number<input value={demoMobile} onChange={e=>setDemoMobile(e.target.value)} placeholder="07..."/><button className="secondary" onClick={sendSms}><Smartphone/>Send demo SMS</button></label></div></section></div>}</>;
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
  <div className="authHeading"><span>FLEETPAY OFFICE</span><h1>{title}</h1><p>{subtitle}</p></div>
  {err&&<div className="inlineError"><AlertTriangle/>{err}</div>}
  {phase==='password'?<form onSubmit={passwordSubmit}><label>Email<input type="email" autoComplete="username" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label><label>Password<input type="password" autoComplete="current-password" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></label><button className="primary full" disabled={busy}><LogIn/>{busy?'Checking…':'Continue securely'}</button></form>:
   phase==='recovery'?<form onSubmit={completeRecovery}>
    <div className="mfaRecoveryNotice"><Mail/><div><b>Check your office email</b><span>For security, FleetPay will only issue a new authenticator QR after the emailed recovery code is verified. The code expires in 10 minutes.</span></div></div>
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
 const[mondayRuns,setMondayRuns]=useState([]),[sett,setSett]=useState({runs:[],payoutRuns:[],payouts:[],paymentRequests:[],earlyPayoutRequests:[]});
 const[outstanding,setOutstanding]=useState([]),[fees,setFees]=useState({fees:[],summary:{}}),[earlySummary,setEarlySummary]=useState(null);
 const[customerAdmin,setCustomerAdmin]=useState({payments:[],summary:{}}),[customerCreate,setCustomerCreate]=useState({bookingId:'',callsign:'',customerName:'',customerMobile:'',customerEmail:'',pickup:'',destination:'',journeyAt:'',fareAmount:'',taxiCompany:'',notes:''}),[createdCustomerLink,setCreatedCustomerLink]=useState(null),[customerCreateBusy,setCustomerCreateBusy]=useState(false);
 const[driverUsers,setDriverUsers]=useState([]),[staff,setStaff]=useState([]),[securityLogs,setSecurityLogs]=useState([]);
 const[txQ,setTxQ]=useState(''),[txType,setTxType]=useState('all'),[txStatus,setTxStatus]=useState('all');
 const[q,setQ]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null),[selectedTx,setSelectedTx]=useState(null);
 const[mobileNav,setMobileNav]=useState(false),[loading,setLoading]=useState(false),[err,setErr]=useState('');
 const[sessionBooting,setSessionBooting]=useState(Boolean(token));
 const[newStaff,setNewStaff]=useState({name:'',email:'',role:'office',password:''}),[showNewStaff,setShowNewStaff]=useState(false);
 const[manual,setManual]=useState({callsign:'',type:'pay_in',amount:'',reason:''}),[manualBusy,setManualBusy]=useState(false);
 const[testSms,setTestSms]=useState({to:'',message:'FleetPay test SMS – communications are configured correctly.'});
 const[testEmail,setTestEmail]=useState('');
 const[demo,setDemo]=useState(null),[demoEmail,setDemoEmail]=useState(''),[demoMobile,setDemoMobile]=useState('');
 const[resetPhrase,setResetPhrase]=useState(''),[resetDrivers,setResetDrivers]=useState(false);
 const api=(u,o={})=>call(u,o,token);
 function logout(){localStorage.removeItem('fleetpay_admin');setToken('');setMe(null)}
 async function safeLoad(fn){try{return await fn()}catch(e){if(/authentication|office authentication/i.test(e.message))logout();else setErr(e.message)}}
 const loadMe=()=>safeLoad(async()=>setMe(await api('/api/admin/me')));
 const loadOverview=()=>safeLoad(async()=>setOverview(await api('/api/admin/office-overview')));
 const loadTransactions=()=>safeLoad(async()=>{const p=new URLSearchParams({limit:'500',q:txQ,type:txType,status:txStatus});setTransactions((await api(`/api/admin/transactions?${p}`)).transactions||[])});
 const loadDrivers=()=>safeLoad(async()=>{setLoading(true);try{const j=await api('/api/drivers');setDrivers(j.drivers||[]);setMeta(j)}finally{setLoading(false)}});
 const loadSettings=()=>safeLoad(async()=>setSettings(await api('/api/admin/operations-settings')));
 const loadIntegrations=()=>safeLoad(async()=>setIntegrations(await api('/api/admin/integrations')));
 const loadSett=()=>safeLoad(async()=>setSett(await api('/api/admin/settlements')));
 const loadMonday=()=>safeLoad(async()=>setMondayRuns((await api('/api/admin/monday-runs')).runs||[]));
 const loadOutstanding=()=>safeLoad(async()=>setOutstanding((await api('/api/admin/outstanding-payments')).payments||[]));
 const loadFees=()=>safeLoad(async()=>setFees(await api('/api/admin/fees')));
 const loadEarlySummary=()=>safeLoad(async()=>setEarlySummary(await api('/api/admin/early-summary')));
 const loadCustomerAdmin=()=>safeLoad(async()=>setCustomerAdmin(await api('/api/admin/customer-payments')));
 const loadDriverUsers=()=>safeLoad(async()=>setDriverUsers(await api('/api/admin/users')));
 const loadStaff=()=>safeLoad(async()=>setStaff((await api('/api/admin/staff')).staff||[]));
 const loadSecurity=()=>safeLoad(async()=>setSecurityLogs((await api('/api/admin/security')).logs||[]));
 const loadDemo=()=>safeLoad(async()=>setDemo(await api('/api/admin/demo')));
 async function refreshCore(){await Promise.all([loadOverview(),loadTransactions(),loadDrivers(),loadSettings(),loadIntegrations(),loadSett(),loadMonday(),loadOutstanding(),loadFees(),loadEarlySummary(),loadCustomerAdmin()])}
 useEffect(()=>{
  let alive=true;
  if(!token){setSessionBooting(false);return()=>{alive=false}}
  setSessionBooting(true);setErr('');
  (async()=>{
   try{
    const profile=await call('/api/admin/me',{},token);if(!alive)return;setMe(profile);
    await Promise.all([loadOverview(),loadTransactions(),loadDrivers(),loadSettings(),loadIntegrations(),loadSett(),loadMonday(),loadOutstanding(),loadFees(),loadEarlySummary(),loadCustomerAdmin()]);
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

  if(view==='customerPayments'){jobs.push(api('/api/admin/customer-payments').then(setCustomerAdmin));}

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
    status:txStatus
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
 },[token,view,txQ,txType,txStatus]);

 useEffect(()=>{if(token&&view==='transactions')loadTransactions()},[txType,txStatus]);
 const isAdmin=me?.role==='administrator',canMoney=['administrator','finance'].includes(me?.role),canOffice=['administrator','finance','office'].includes(me?.role);
 const nav=[
  ['dashboard',LayoutDashboard,'Dashboard'],['transactions',CreditCard,'Transactions'],['customerPayments',Send,'Customer Payments'],['monday',CalendarDays,'Monday Run'],['early',ArrowUpRight,'Early Payouts'],['outstanding',AlertTriangle,'Outstanding'],['fees',BadgePoundSterling,'Fees & Billing'],['demo',PlayCircle,'Demo Lab'],['drivers',Users,'Drivers'],['access',UserCheck,'Users & Access'],...(isAdmin?[['security',ShieldCheck,'Security'],['settings',Settings,'Settings']]:[])
 ];
 const filtered=useMemo(()=>drivers.filter(d=>{const h=`${d.callsign} ${d.fullName} ${d.mobile} ${d.email} ${d.driverId} ${d.bankAccount?.accountHolder||''} ${d.bankAccount?.accountNumberMasked||''}`.toLowerCase();if(!h.includes(q.toLowerCase()))return false;if(filter==='negative')return(d.currentBalance??0)<0;if(filter==='positive')return(d.currentBalance??0)>0;if(filter==='unmatched')return d.currentBalance==null;if(filter==='bank_ready')return Boolean(d.bankAccount?.ready)&&!d.bankAccount?.changedRecently;if(filter==='bank_missing')return !d.bankAccount?.ready;if(filter==='bank_recent')return Boolean(d.bankAccount?.changedRecently);return true}).sort((a,b)=>String(a.callsign??'').localeCompare(String(b.callsign??''),'en-GB',{numeric:true})),[drivers,q,filter]);
 const bankFor=driverId=>drivers.find(d=>String(d.driverId)===String(driverId))?.bankAccount||{configured:false,ready:false,status:'missing',label:'Bank details missing'};
 const bankTone=b=>!b?.ready?'bad':b?.changedRecently?'warn':'good';
 if(!token)return <AdminLogin onLogin={setToken}/>;
 if(sessionBooting)return <div className="officeBootPage"><div className="officeBootCard"><Logo/><div className="bootSpinner"><RefreshCw/></div><h2>Opening FleetPay Office</h2><p>Securely loading your dashboard and payment controls…</p></div></div>;
 const activeMonday=mondayRuns.find(r=>['draft','approved','batched'].includes(r.status))||null;
 const weeklyItems=activeMonday?.items?.filter(x=>x.action==='payout')||[];
 const weeklyCollections=activeMonday?.items?.filter(x=>x.action==='payment_request')||[];
 const weeklyCarryForward=activeMonday?.items?.filter(x=>x.action==='carry_forward')||[];
 const weeklyPending=weeklyItems.filter(x=>!x.approvalStatus||x.approvalStatus==='pending');
 const weeklyApproved=weeklyItems.filter(x=>x.approvalStatus==='approved');
 const weeklyExcluded=weeklyItems.filter(x=>x.approvalStatus==='excluded');
 const weeklyApprovedTotal=weeklyApproved.reduce((a,x)=>a+Number(x.amount||0),0);
 const weeklyOutstandingTotal=weeklyCollections.reduce((a,x)=>a+Number(x.amount||0),0);
 const weeklyPayoutBeforeFees=weeklyApproved.reduce((a,x)=>a+Math.max(0,Number(x.previousBalance||0)),0);
 const weeklyPayoutFeesCharges=Math.max(0,weeklyPayoutBeforeFees-weeklyApprovedTotal);
 const weeklyIncomingBeforeFees=weeklyCollections.reduce((a,x)=>a+Math.abs(Number(x.previousBalance||0)),0);
 const weeklyIncomingFeesCharges=Math.max(0,weeklyOutstandingTotal-weeklyIncomingBeforeFees);
 const weeklyExcludedBeforeFees=weeklyExcluded.reduce((a,x)=>a+Math.max(0,Number(x.previousBalance||0)),0);
 const activeMondayCancelledBatch=activeMonday?sett.payoutRuns.find(r=>r.runType==='weekly'&&r.status==='cancelled'&&String(r.notes||'').includes(activeMonday.id)):null;
 const openOutstanding=outstanding.filter(x=>x.status==='open'),overdueOutstanding=openOutstanding.filter(x=>x.overdue);
 const dueEarly=earlySummary?.requests?.filter(x=>['requested','approved','batched'].includes(x.status))||[];
 const recentTx=transactions.slice(0,7);
 function go(k){setView(k);setMobileNav(false);setErr('');if(k==='customerPayments')loadCustomerAdmin();if(k==='monday'){loadMonday();loadSett()}if(k==='early'){loadEarlySummary();loadSett()}if(k==='outstanding')loadOutstanding();if(k==='fees')loadFees();if(k==='demo')loadDemo();if(k==='drivers')loadDrivers();if(k==='access'){loadStaff();loadDriverUsers()}if(k==='security')loadSecurity();if(k==='settings'){loadSettings();loadIntegrations()}}
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
 async function syncNow(){setLoading(true);try{await api('/api/admin/sync',{method:'POST'});await refreshCore()}catch(e){alert(e.message)}finally{setLoading(false)}}
 async function createMonday(){if(!confirm('Confirm Autocab Rent Sheets are complete. FleetPay will sync Autocab and create a draft using each driver’s Previous Balance.'))return;try{const j=await api('/api/admin/monday-runs',{method:'POST'});await Promise.all([loadMonday(),loadSett(),loadOutstanding(),loadFees(),loadOverview()]);alert(`Draft created. ${j.items.filter(x=>x.action==='payout').length} positive balances require approval and ${j.items.filter(x=>x.action==='payment_request').length} driver(s) owe above the collection threshold.`)}catch(e){alert(e.message)}}
 async function weeklyDecision(item,status){let reason='';if(status==='excluded'){reason=prompt(`Reason for excluding callsign ${item.callsign}:`)||'';if(!reason.trim())return}try{await api(`/api/admin/monday-runs/${activeMonday.id}/payouts/${item.payoutId}`,{method:'PATCH',body:JSON.stringify({status,reason})});await Promise.all([loadMonday(),loadSett()])}catch(e){alert(e.message)}}
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
 async function saveSettings(){try{const j=await api('/api/admin/operations-settings',{method:'PUT',body:JSON.stringify(settings)});setSettings(j);alert('FleetPay settings saved.')}catch(e){alert(e.message)}}
 async function testSmsNow(){try{await api('/api/admin/communications/test-sms',{method:'POST',body:JSON.stringify(testSms)});alert('Test SMS sent.')}catch(e){alert(e.message)}}
 async function testEmailNow(){try{await api('/api/admin/communications/test-email',{method:'POST',body:JSON.stringify({to:testEmail||settings?.officeNotificationEmail})});alert('Test email sent.')}catch(e){alert(e.message)}}
 async function resendOutstanding(x){try{await api(`/api/admin/outstanding-payments/${x.id}/resend`,{method:'POST'});alert('Payment reminder sent.');await loadOutstanding()}catch(e){alert(e.message)}}
 async function createStripeLink(x){try{const j=await api(`/api/admin/payment-requests/${x.id}/stripe`,{method:'POST'});await loadOutstanding();if(j.paymentUrl)window.open(j.paymentUrl,'_blank')}catch(e){alert(e.message)}}
 async function markFeesInvoiced(){const invoiceRef=prompt('Enter the invoice reference/number:');if(!invoiceRef?.trim())return;try{const j=await api('/api/admin/fees/mark-invoiced',{method:'POST',body:JSON.stringify({invoiceRef})});alert(`${j.count} fee records marked invoiced.`);await loadFees()}catch(e){alert(e.message)}}
 async function downloadFeesCsv(){try{const r=await fetch(`${API_BASE}/api/admin/fees/csv?status=all`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not export fees');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='FleetPay-fees.csv';a.click();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}
 async function createStaff(e){e.preventDefault();try{await api('/api/admin/staff',{method:'POST',body:JSON.stringify(newStaff)});setNewStaff({name:'',email:'',role:'office',password:''});setShowNewStaff(false);await loadStaff()}catch(e){alert(e.message)}}
 async function updateStaff(u,changes){try{await api(`/api/admin/staff/${u.id}`,{method:'PATCH',body:JSON.stringify(changes)});await loadStaff()}catch(e){alert(e.message)}}
 async function setApproval(u,approved){try{await api(`/api/admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({approved})});await loadDriverUsers()}catch(e){alert(e.message)}}
 const statusTone=s=>['paid','completed','approved','sent','invoiced'].includes(String(s))?'good':['failed','declined','overdue','cancelled'].includes(String(s))?'bad':'warn';
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
 async function launchReset(){if(resetPhrase!=='RESET FLEETPAY FOR LIVE LAUNCH')return alert('Type the confirmation phrase exactly.');if(!confirm('FINAL CHECK: create a backup and clear FleetPay operational data for live launch?'))return;try{const j=await api('/api/admin/launch-reset',{method:'POST',body:JSON.stringify({phrase:resetPhrase,includeDriverAccounts:resetDrivers})});setResetPhrase('');alert(`Launch reset complete. Backup: ${j.backupFile}`);await refreshCore()}catch(e){alert(e.message)}}
 const LiveRunCard=({r})=>{const idx=r.status==='ready'?3:r.status==='funding_pending'?4:r.status==='funded'?5:['submitted_sandbox','submitted','processing'].includes(r.status)?6:r.status==='paid'?7:r.status==='cancelled'?-1:3;const steps=r.runType==='weekly'?['Rent Sheets','Sync & approve','Lock run','Funding','Funds cleared','Release','Autocab','Reconciled']:['Sync balance','Approve','Lock run','Funding','Funds cleared','Release','Autocab','Reconciled'];const canCancel=['ready','funding_pending','funded'].includes(r.status)&&!r.providerRef&&!r.releasedAt;return <div className={`liveWorkflowCard ${r.status==='cancelled'?'cancelled':''}`}><div className="liveWorkflowHead"><div><span>{r.runType==='weekly'?'WEEKLY PAYMENT RUN':'EARLY PAYOUT RUN'} · {dt(r.createdAt)}</span><h3>{money(r.totalAmount)}</h3><p>{r.itemCount} drivers · {r.id}</p></div><Pill tone={statusTone(r.status)}>{String(r.status).replaceAll('_',' ')}</Pill></div><div className="liveSteps">{steps.map((x,i)=><div key={x} className={`${idx>=0&&i<=idx?'done':''} ${i===idx?'current':''}`}><span>{i<idx?'✓':i+1}</span><b>{x}</b></div>)}</div>{r.status==='ready'&&<div className="operatorWarning"><AlertTriangle/><div><b>Funding required before release</b><span>Approved drivers are locked into this run. Transfer the required funds, then record that the transfer has been sent.</span></div></div>}{r.status==='funding_pending'&&<div className="operatorWarning blue"><Clock3/><div><b>Waiting for cleared funds</b><span>Do not release the payment run until the funds are visible as cleared in the payout account.</span></div></div>}{r.status==='funded'&&<div className="operatorWarning green"><CheckCircle2/><div><b>Funding gate passed</b><span>Cleared funds have been confirmed. One final operator check is required before release.</span></div></div>}<div className="runCardActions liveRunActions">{canCancel&&canMoney&&<button className="dangerOutline" onClick={()=>cancelPayoutRun(r)}><X/>Cancel run</button>}{r.status==='ready'&&canMoney&&<button className="secondary" onClick={()=>confirmFundingSent(r)}><Banknote/>Funding transfer sent</button>}{r.status==='funding_pending'&&canMoney&&<button className="primary" onClick={()=>confirmFundsCleared(r)}><CheckCircle2/>Confirm funds cleared</button>}{r.status==='funded'&&integrations?.wise?.environment==='sandbox'&&canMoney&&<button className="primary" onClick={()=>sendWiseSandbox(r)}><Send/>Release to Wise sandbox</button>}{r.status==='funded'&&integrations?.wise?.environment!=='sandbox'&&<span className="tinyNote">Live provider release will unlock when Wise production payout API is connected.</span>}{['submitted_sandbox','submitted','processing'].includes(r.status)&&canMoney&&<button className="primary" onClick={()=>markRunPaid(r)}><ShieldCheck/>Confirm paid & update Autocab</button>}</div>{r.status==='paid'&&<div className="demoComplete"><CheckCircle2/><div><b>Run reconciled</b><span>Provider payment confirmed and matching Autocab updates completed.</span></div></div>}{r.status==='cancelled'&&<div className="cancelledRunNote"><X/><span>Cancelled before release. Included drivers were returned to Approved.</span></div>}</div>};
   const txTypes=[['all','All activity'],['customer_payment','Customer payments'],['driver_payment','Driver payments'],['weekly_payout','Weekly payouts'],['early_payout','Early payouts'],['fee','Fees']];
 return <div className="shell officeV2">
  <aside className={`sidebar officeSidebar ${mobileNav?'open':''}`}>
   <div className="sideTop"><Logo/><button className="mobileClose" onClick={()=>setMobileNav(false)}><X/></button></div>
   <div className="officeUserMini"><div className="avatar small">{me?.name?.split(' ').map(x=>x[0]).slice(0,2).join('')||'FP'}</div><div><b>{me?.name||'FleetPay Office'}</b><span>{me?.role||'Secure session'}</span></div></div>
   <nav>{nav.map(([k,I,l])=><button key={k} className={view===k?'active':''} onClick={()=>go(k)}><I/>{l}{k==='outstanding'&&overdueOutstanding.length>0&&<em>{overdueOutstanding.length}</em>}</button>)}</nav>
   <div className="sideStatus"><span className="statusDot"/><div><b>Secure session</b><small>MFA verified</small></div></div>
   <button className="logoutBtn" onClick={logout}><LogOut/>Sign out</button>
  </aside>
  <main className="main officeMain">
   <header className="topbar officeTopbar"><button className="menuBtn" onClick={()=>setMobileNav(true)}><Menu/></button><div><span className="eyebrow">FLEETPAY OFFICE</span><h1>{nav.find(x=>x[0]===view)?.[2]||'Office'}</h1></div><div className="topActions"><span className={`envBadge ${integrations?.stripe?.testMode||integrations?.wise?.environment==='sandbox'?'test':'live'}`}>{integrations?.stripe?.testMode||integrations?.wise?.environment==='sandbox'?'TEST ENVIRONMENT':'LIVE'}</span><button className="iconTextButton" onClick={refreshCore}><RefreshCw className={loading?'spin':''}/>Refresh</button></div></header>
   <div className="content officeContent">
    {err&&<div className="inlineError"><AlertTriangle/>{err}</div>}
    {view==='dashboard'&&<>
     <section className="officeHero premiumHero"><div><span>PAYMENT OPERATIONS</span><h2>Everything that needs attention, in one place.</h2><p>Clear controls for driver balances, payouts, money in, fees and reconciliation. Every money action is traceable.</p></div><div className="heroSync"><Database/><span>Autocab last synced</span><b>{meta.lastSync?dt(meta.lastSync):'Not synced'}</b><button className="mini light" onClick={syncNow}>Sync now</button></div></section>
     <section className="officeStats four"><Stat icon={CreditCard} label="Customer payments today" value={money(overview?.customerPayments?.total||0)} sub={`${overview?.customerPayments?.count||0} payments`}/><Stat icon={ArrowUpRight} label="Payouts today" value={money(overview?.payouts?.total||0)} sub={`${overview?.payouts?.count||0} completed`}/><Stat icon={AlertTriangle} label="Outstanding" value={openOutstanding.length} sub={`${overdueOutstanding.length} overdue`}/><Stat icon={BadgePoundSterling} label="FleetPay fees uninvoiced" value={money(fees?.summary?.uninvoiced||0)} sub={`${money(fees?.summary?.uninvoicedGross||0)} gross fees`}/></section>
     <section className="dashboardGridV2">
      <div className="panel actionPanel"><div className="panelHead"><div><span className="sectionKicker">TODAY'S CONTROL PANEL</span><h3>Operational checklist</h3><p>Work from the top down. FleetPay keeps each stage separate so money cannot be moved accidentally.</p></div></div><div className="taskStack">
       <button onClick={()=>go('monday')}><div className="taskIcon"><CalendarDays/></div><div><b>Monday settlement</b><span>{activeMonday?`${weeklyPending.length} pending approval · ${weeklyApproved.length} approved`:'No active draft'}</span></div><ChevronRight/></button>
       <button onClick={()=>go('early')}><div className="taskIcon"><ArrowUpRight/></div><div><b>Early payouts</b><span>{dueEarly.length} due today · {money(dueEarly.reduce((a,x)=>a+Number(x.netAmount||x.amount||0),0))}</span></div><ChevronRight/></button>
       <button onClick={()=>go('outstanding')}><div className="taskIcon warning"><AlertTriangle/></div><div><b>Outstanding driver payments</b><span>{openOutstanding.length} open · {overdueOutstanding.length} overdue</span></div><ChevronRight/></button>
       <button onClick={()=>go('fees')}><div className="taskIcon"><BadgePoundSterling/></div><div><b>Fees awaiting invoice</b><span>{money(fees?.summary?.uninvoiced||0)} FleetPay share</span></div><ChevronRight/></button>
      </div></div>
      <form className="panel manualPanel" onSubmit={postManual}><div className="panelHead"><div><span className="sectionKicker">MANUAL MONEY MOVEMENT</span><h3>Post directly to Autocab</h3><p>Use for cash paid into the office or a manual payout. Confirmation and audit logging are mandatory.</p></div><ShieldCheck/></div><div className="manualFormGrid"><label>Driver callsign<input required value={manual.callsign} onChange={e=>setManual({...manual,callsign:e.target.value})} placeholder="e.g. 168"/></label><label>Transaction<select value={manual.type} onChange={e=>setManual({...manual,type:e.target.value})}><option value="pay_in">Pay in / money received</option><option value="payout">Payout / money sent</option></select></label><label>Amount<div className="moneyField"><span>£</span><input required type="number" min="0.01" step="0.01" value={manual.amount} onChange={e=>setManual({...manual,amount:e.target.value})}/></div></label><label className="wide">Reason<input value={manual.reason} onChange={e=>setManual({...manual,reason:e.target.value})} placeholder={manual.type==='pay_in'?(settings?.manualPayInReasonDefault||'FleetPay Manual Pay In'):(settings?.manualPayoutReasonDefault||'FleetPay Manual Payout')}/></label></div><button className="primary full" disabled={manualBusy||!canMoney}><Banknote/>{manualBusy?'Posting…':'Review & post to Autocab'}</button><small className="formHint">Autocab writes must be enabled on the server. The transaction is recorded in FleetPay's audit trail.</small></form>
     </section>
     <section className="panel"><div className="panelHead"><div><h3>Recent money movement</h3><p>The latest customer payments, driver payments, payouts and fees.</p></div><button className="mini" onClick={()=>go('transactions')}>View all</button></div><div className="transactionList">{recentTx.map(x=><button key={x.ref} className="txRow" onClick={()=>setSelectedTx(x)}><div className={`txIcon ${x.direction}`}><CreditCard/></div><div className="txMain"><b>{x.typeLabel}</b><span>{x.callsign?`Callsign ${x.callsign}`:'FleetPay'}{x.bookingId?` · Booking ${x.bookingId}`:''}</span></div><div className="txMeta"><b className={x.direction==='out'?'out':''}>{x.direction==='out'?'-':'+'}{money(x.amount)}</b><span>{dt(x.createdAt)}</span></div><Pill tone={statusTone(x.status)}>{x.status}</Pill></button>)}</div></section>
    </>}
    {view==='transactions'&&<><section className="officePageIntro"><div><span>MASTER LEDGER</span><h2>Transaction history</h2><p>One searchable record of every payment, payout and fee recorded by FleetPay.</p></div></section><section className="panel"><div className="transactionTools"><div className="searchBox"><Search/><input value={txQ} onChange={e=>setTxQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadTransactions()} placeholder="Search callsign, driver, booking or reference…"/><button onClick={loadTransactions}>Search</button></div><select value={txType} onChange={e=>setTxType(e.target.value)}>{txTypes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select value={txStatus} onChange={e=>setTxStatus(e.target.value)}><option value="all">All statuses</option><option value="paid">Paid</option><option value="open">Open</option><option value="approved">Approved</option><option value="batched">Batched</option><option value="failed">Failed</option></select></div><div className="transactionList ledgerList">{transactions.map(x=><button key={x.ref} className="txRow" onClick={()=>setSelectedTx(x)}><div className={`txIcon ${x.direction}`}><CreditCard/></div><div className="txMain"><b>{x.typeLabel}</b><span>{x.callsign?`Callsign ${x.callsign}`:'FleetPay'}{x.driverName?` · ${x.driverName}`:''}{x.bookingId?` · Booking ${x.bookingId}`:''}</span></div><div className="txMeta"><b className={x.direction==='out'?'out':''}>{x.direction==='out'?'-':'+'}{money(x.amount)}</b><span>{dt(x.createdAt)}</span></div><Pill tone={statusTone(x.status)}>{x.status}</Pill><ChevronRight/></button>)}</div></section></>}
    {view==='customerPayments'&&<div className="customerPaymentsAdmin">
    <section className="customerPayHero"><div><span className="eyebrow">CUSTOMER PAYMENTS</span><h2>Create and track secure payment links</h2><p>Start manually for testing. FleetPay stores the journey, fare and service-fee breakdown; Autocab automation can be added once this flow is proven.</p></div><div className="customerPayHeroIcon"><CreditCard/></div></section>
    <div className="customerPayStats"><div><span>Total links</span><b>{customerAdmin.summary?.count||0}</b></div><div><span>Awaiting payment</span><b>{customerAdmin.summary?.open||0}</b></div><div><span>Paid</span><b>{customerAdmin.summary?.paid||0}</b></div><div><span>Customer money received</span><b>{money(customerAdmin.summary?.grossPaid||0)}</b></div><div><span>Service fees</span><b>{money(customerAdmin.summary?.feesPaid||0)}</b></div><div><span>FleetPay / taxi split</span><b>{money(customerAdmin.summary?.fleetPayShare||0)} / {money(customerAdmin.summary?.taxiCompanyShare||0)}</b></div></div>
    <div className="customerPayGrid">
     <section className="panel customerCreatePanel"><div className="panelHead"><div><h3>Create payment link</h3><p>Manual test workflow. No Autocab booking is changed by this action.</p></div><Pill tone="warn">Manual</Pill></div>
      <form className="customerCreateForm" onSubmit={createOfficeCustomerPayment}>
       <div className="customerFormGrid"><label>Booking / job reference<input value={customerCreate.bookingId} onChange={e=>setCustomerCreate({...customerCreate,bookingId:e.target.value})} placeholder="e.g. 12345678"/></label><label>Driver callsign <small>optional</small><input value={customerCreate.callsign} onChange={e=>setCustomerCreate({...customerCreate,callsign:e.target.value})} placeholder="e.g. 168"/></label></div>
       <div className="customerFormGrid"><label>Customer name<input value={customerCreate.customerName} onChange={e=>setCustomerCreate({...customerCreate,customerName:e.target.value})} placeholder="Passenger name"/></label><label>Journey date / time<input type="datetime-local" value={customerCreate.journeyAt} onChange={e=>setCustomerCreate({...customerCreate,journeyAt:e.target.value})}/></label></div>
       <div className="customerFormGrid"><label>Customer mobile<input value={customerCreate.customerMobile} onChange={e=>setCustomerCreate({...customerCreate,customerMobile:e.target.value})} placeholder="07..."/></label><label>Customer email<input type="email" value={customerCreate.customerEmail} onChange={e=>setCustomerCreate({...customerCreate,customerEmail:e.target.value})} placeholder="optional@email.com"/></label></div>
       <label>Pickup<input value={customerCreate.pickup} onChange={e=>setCustomerCreate({...customerCreate,pickup:e.target.value})} placeholder="Pickup address / location"/></label>
       <label>Destination<input value={customerCreate.destination} onChange={e=>setCustomerCreate({...customerCreate,destination:e.target.value})} placeholder="Destination address / location"/></label>
       <div className="customerFormGrid"><label>Journey fare (£)<input type="number" inputMode="decimal" min="0.01" step="0.01" required value={customerCreate.fareAmount} onChange={e=>setCustomerCreate({...customerCreate,fareAmount:e.target.value})} placeholder="0.00"/></label><label>Taxi company<input value={customerCreate.taxiCompany} onChange={e=>setCustomerCreate({...customerCreate,taxiCompany:e.target.value})} placeholder={settings?.companyName||'Taxi company'}/></label></div>
       <label>Notes <small>office only</small><textarea rows="3" value={customerCreate.notes} onChange={e=>setCustomerCreate({...customerCreate,notes:e.target.value})} placeholder="Optional notes"/></label>
       <button className="primary full" disabled={customerCreateBusy}>{customerCreateBusy?'Creating…':'Create secure payment link'}</button>
      </form>
      {createdCustomerLink&&<div className="createdPaymentLink"><CheckCircle2/><div><b>Payment link ready</b><span>{createdCustomerLink.paymentUrl}</span></div><button className="secondary" onClick={()=>copyCustomerLink(createdCustomerLink.paymentUrl)}>Copy link</button><button className="secondary" onClick={()=>window.open(createdCustomerLink.paymentUrl,'_blank')}>Preview</button></div>}
     </section>
     <section className="panel customerPaymentListPanel"><div className="panelHead"><div><h3>Payment links</h3><p>Live status, journey value and fee split.</p></div><button className="mini" onClick={loadCustomerAdmin}><RefreshCw/>Refresh</button></div>
      <div className="customerPaymentTable"><div className="customerPaymentTableHead"><span>Payment</span><span>Journey</span><span>Breakdown</span><span>Status</span><span></span></div>{(customerAdmin.payments||[]).length===0?<div className="emptyState">No customer payment links yet.</div>:(customerAdmin.payments||[]).map(x=><div className="customerPaymentAdminRow" key={x.id}><div><b>{x.customerName||x.bookingId||'Customer payment'}</b><span>{x.bookingId?`Booking ${x.bookingId}`:x.id}</span><small>{dt(x.createdAt)}</small></div><div><b>{x.pickup||'Pickup not entered'}</b><span>{x.destination?`→ ${x.destination}`:'Destination not entered'}</span></div><div><b>{money(x.totalAmount)}</b><span>{money(x.fareAmount)} fare + {money(x.feeAmount)} fee</span>{x.status==='paid'&&<small>Split: {money(x.fleetPayFeeShare)} FleetPay · {money(x.taxiCompanyFeeShare)} taxi company</small>}</div><div><Pill tone={x.status==='paid'?'good':x.status==='cancelled'?'bad':'warn'}>{x.status}</Pill></div><div className="customerPaymentRowActions"><button className="mini" onClick={()=>window.open(x.paymentUrl,'_blank')}>Open</button><button className="mini" onClick={()=>copyCustomerLink(x.paymentUrl)}>Copy</button>{x.status==='open'&&<button className="mini danger" onClick={()=>cancelCustomerPayment(x.id)}>Cancel</button>}</div></div>)}</div>
      <div className="customerRefundComing"><ShieldCheck/><div><b>Refund workflow</b><span>The payment data model now reserves refund status/amount fields. Stripe refund controls are the next phase after manual-link testing.</span></div></div>
     </section>
    </div>
   </div>}
   {view==='monday'&&<><section className="officePageIntro"><div><span>WEEKLY SETTLEMENT</span><h2>Monday payment run</h2><p>Run Rent Sheets in Autocab first. FleetPay then syncs and uses <b>Previous Balance</b>, showing both drivers to pay and drivers who owe before any payment run is released.</p></div>{canMoney&&<button className="primary" onClick={createMonday}><PlayCircle/>Create Monday draft</button>}</section>{activeMonday?<><section className="runControlHero"><div><span>{activeMonday.runDate||'Monday run'}</span><h3>{activeMonday.status==='batched'?'Payment batch created':'Monday settlement active'}</h3><p>{activeMonday.id}</p></div><div className="runControlStats">
<div><span>Payout before fees</span><b>{money(weeklyPayoutBeforeFees)}</b><small>{weeklyApproved.length} approved drivers</small></div>
<div><span>Payout fees & charges</span><b>{money(weeklyPayoutFeesCharges)}</b></div>
<div><span>Actual payout</span><b>{money(weeklyApprovedTotal)}</b></div>
<div><span>Incoming before fees</span><b className="negative">{money(weeklyIncomingBeforeFees)}</b><small>{weeklyCollections.length} drivers</small></div>
<div><span>Incoming fees & charges</span><b>{money(weeklyIncomingFeesCharges)}</b></div>
<div><span>Actual collection</span><b className="negative">{money(weeklyOutstandingTotal)}</b></div>
<div><span>Pending payouts</span><b>{weeklyPending.length}</b></div>
<div><span>Carried forward</span><b>{weeklyCarryForward.length}</b></div>
<div><span>Excluded payouts</span><b>{weeklyExcluded.length}</b><small>{money(weeklyExcludedBeforeFees)} before fees</small></div>
</div></section>{activeMondayCancelledBatch&&<div className="operatorWarning blue"><AlertTriangle/><div><b>Previous payment batch cancelled safely</b><span>The payment batch was cancelled before release. The same Monday settlement remains open so the approved drivers can be reviewed, changed and placed into a corrected payment run. No Autocab payout adjustment was posted by the cancellation.</span></div></div>}<section className="panel"><div className="panelHead"><div><h3>Drivers to pay</h3><p>Positive Previous Balances. Only approved drivers are included in the payment run.</p></div><div className="rowActions">{weeklyPending.length>0&&canMoney&&<button className="secondary" onClick={approveAllWeekly}><CheckCircle2/>Approve all pending</button>}{weeklyApproved.length>0&&!activeMonday.payoutRunId&&canMoney&&<button className="primary" onClick={createWeeklyBatch}><Send/>Create payment run</button>}</div></div>{weeklyItems.length?<div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Previous balance</th><th>Weekly fee</th><th>Payout</th><th>Payout account</th><th>Decision</th><th>Actions</th></tr></thead><tbody>{weeklyItems.map(x=><tr key={x.payoutId}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><div><b>{x.driverName}</b><small>Driver {x.driverId}</small></div></div></td><td>{money(x.previousBalance)}</td><td>{money(x.weeklyFee)}</td><td><b>{money(x.amount)}</b></td><td><Pill tone={bankTone(bankFor(x.driverId))}>{bankFor(x.driverId).label}</Pill></td><td><Pill tone={x.approvalStatus==='approved'?'good':x.approvalStatus==='excluded'?'bad':'warn'}>{x.approvalStatus||'pending'}</Pill>{x.exclusionReason&&<small className="reasonText">{x.exclusionReason}</small>}</td><td><div className="compactActions">{canMoney&&!activeMonday.payoutRunId&&<><button className="mini success" onClick={()=>weeklyDecision(x,'approved')}>Approve</button><button className="mini danger" onClick={()=>weeklyDecision(x,'excluded')}>Exclude</button></>}</div></td></tr>)}</tbody></table></div>:<div className="emptyInline">No positive balances in this Monday settlement.</div>}</section><section className="panel"><div className="panelHead"><div><h3>Drivers owing</h3><p>Negative Previous Balances above the configured threshold. These are collection requests, not payout items.</p></div><button className="secondary" onClick={()=>go('outstanding')}>Open full Outstanding view</button></div>{weeklyCollections.length?<div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Previous balance</th><th>Weekly fee</th><th>Amount due</th><th>Due</th><th>Communication</th><th>Status</th></tr></thead><tbody>{weeklyCollections.map(x=>{const req=outstanding.find(o=>o.id===x.requestId);return <tr key={x.requestId||x.driverId}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td className="negative">{money(x.previousBalance)}</td><td>{money(x.weeklyFee)}</td><td><b className="negative">{money(x.amount)}</b></td><td>{req?.dueAt?dt(req.dueAt):'—'}</td><td><div className="compactStatus"><Pill tone={req?.emailSentAt?'good':'warn'}>Email {req?.emailSentAt?'sent':'pending'}</Pill><Pill tone={req?.smsSentAt?'good':'warn'}>SMS {req?.smsSentAt?'sent':'pending'}</Pill></div></td><td><Pill tone={req?.overdue?'bad':statusTone(req?.status||'open')}>{req?.overdue?'overdue':req?.status||'open'}</Pill></td></tr>})}</tbody></table></div>:<div className="emptyInline good"><CheckCircle2/>No drivers are above the outstanding-payment threshold for this run.</div>}{weeklyCarryForward.length>0&&<div className="carryNote"><Info/> {weeklyCarryForward.length} small negative balance{weeklyCarryForward.length===1?' is':'s are'} below the threshold and will be carried forward.</div>}</section></>:<section className="emptyState"><CalendarDays/><h3>No active Monday settlement</h3><p>Once Rent Sheets are complete, create the Monday draft. FleetPay will separate drivers to pay from drivers who owe automatically.</p></section>}<section className="panel"><div className="panelHead"><div><h3>Weekly payment-run history</h3><p>Cancelled runs stay here for audit. They do not represent money sent.</p></div></div><div className="runCards liveRunStack">{sett.payoutRuns.filter(r=>r.runType==='weekly').slice(0,12).map(r=><LiveRunCard key={r.id} r={r}/>)}</div></section></>}
    {view==='early'&&<><section className="officePageIntro"><div><span>DAILY PAYOUT CONTROL</span><h2>Early payouts</h2><p>Approve requests individually, batch only approved payments, then reconcile the paid batch back to Autocab.</p></div><div className="rowActions"><button className="secondary" onClick={sendEarlySummary}><Mail/>Send office summary now</button>{canMoney&&sett.earlyPayoutRequests.some(x=>x.status==='approved')&&<button className="primary" onClick={createEarlyBatch}><Send/>Create approved batch</button>}</div></section><section className="summaryBanner"><div><Clock3/><div><b>Today's cutoff: {earlySummary?.cutoff||settings?.earlyPayoutCutoffTime||'11:00'}</b><span>{earlySummary?.summary?.status==='sent'?`Office email sent ${dt(earlySummary.summary.sent_at)}`:'Automatic office summary will send after cutoff.'}</span></div></div><div className="summaryNumbers"><span>{dueEarly.length} requests</span><b>{money(dueEarly.reduce((a,x)=>a+Number(x.netAmount||x.amount||0),0))}</b></div></section><section className="panel"><div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Requested</th><th>Fee</th><th>Driver receives</th><th>Payout account</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sett.earlyPayoutRequests.map(x=><tr key={x.id}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td>{money(x.grossAmount)}</td><td>{money(x.fee)}</td><td><b>{money(x.netAmount??x.amount)}</b></td><td><Pill tone={bankTone(bankFor(x.driverId))}>{bankFor(x.driverId).label}</Pill></td><td>{x.eligibleRunDate||'—'}</td><td><Pill tone={statusTone(x.status)}>{x.status}</Pill></td><td><div className="compactActions">{x.status==='requested'&&canMoney&&<><button className="mini success" onClick={()=>reviewEarly(x,'approved')}>Approve</button><button className="mini danger" onClick={()=>reviewEarly(x,'declined')}>Decline</button></>}{x.status==='approved'&&<span className="tinyNote">Ready to batch</span>}</div></td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelHead"><div><h3>Early payout payment runs</h3><p>Review, cancel or complete daily payout runs. A run can only be cancelled before it is submitted to the payment provider.</p></div></div><div className="runCards liveRunStack">{sett.payoutRuns.filter(r=>r.runType==='early').slice(0,12).map(r=><LiveRunCard key={r.id} r={r}/>)}</div></section></>}
    {view==='outstanding'&&<><section className="officePageIntro"><div><span>COLLECTIONS</span><h2>Outstanding payments</h2><p>Drivers above the configured threshold receive an app notification, email and SMS. The deadline is shown clearly here.</p></div></section><section className="officeStats three"><Stat icon={AlertTriangle} label="Open" value={openOutstanding.length} sub="Awaiting payment"/><Stat icon={Clock3} label="Overdue" value={overdueOutstanding.length} sub="Past Tuesday deadline"/><Stat icon={CreditCard} label="Amount outstanding" value={money(openOutstanding.reduce((a,x)=>a+Number(x.amount||0),0))} sub="Open payment requests"/></section><section className="panel"><div className="tableWrap proTable"><table><thead><tr><th>Driver</th><th>Amount</th><th>Due</th><th>Email</th><th>SMS</th><th>Status</th><th>Actions</th></tr></thead><tbody>{outstanding.map(x=><tr key={x.id} className={x.overdue?'overdueRow':''}><td><div className="driverCell"><span className="callsign">{x.callsign}</span><b>{x.driverName}</b></div></td><td><b>{money(x.amount)}</b></td><td>{x.dueAt?dt(x.dueAt):'—'}</td><td><Pill tone={x.emailSentAt?'good':'warn'}>{x.emailSentAt?'Sent':'Not sent'}</Pill></td><td><Pill tone={x.smsSentAt?'good':'warn'}>{x.smsSentAt?'Sent':'Not sent'}</Pill></td><td><Pill tone={x.overdue?'bad':statusTone(x.status)}>{x.overdue?'overdue':x.status}</Pill>{x.communicationError&&<small className="reasonText">{x.communicationError}</small>}</td><td><div className="compactActions">{x.status==='open'&&<><button className="mini" onClick={()=>resendOutstanding(x)}>Resend</button><button className="mini" onClick={()=>createStripeLink(x)}>Payment link</button></>}</div></td></tr>)}</tbody></table></div></section></>}
    {view==='fees'&&<><section className="officePageIntro"><div><span>REVENUE & RECONCILIATION</span><h2>Fees & billing</h2><p>Every FleetPay fee is recorded separately so you can invoice the taxi company accurately and see the agreed split.</p></div><div className="rowActions"><button className="secondary" onClick={downloadFeesCsv}>Export CSV</button>{canMoney&&<button className="primary" onClick={markFeesInvoiced}>Mark uninvoiced as invoiced</button>}</div></section><section className="officeStats four"><Stat icon={BadgePoundSterling} label="Gross fees" value={money(fees?.summary?.gross||0)} sub="All recorded fees"/><Stat icon={WalletCards} label="FleetPay share" value={money(fees?.summary?.fleetpay||0)} sub="Your share"/><Stat icon={Users} label="Taxi company share" value={money(fees?.summary?.taxi||0)} sub="Their share"/><Stat icon={FileClock} label="FleetPay uninvoiced" value={money(fees?.summary?.uninvoiced||0)} sub="Ready to invoice"/></section><section className="panel"><div className="tableWrap proTable"><table><thead><tr><th>Date</th><th>Fee</th><th>Driver</th><th>Gross</th><th>FleetPay</th><th>Taxi company</th><th>Status</th><th>Invoice</th></tr></thead><tbody>{fees.fees.map(x=><tr key={x.id}><td>{dt(x.createdAt)}</td><td><b>{String(x.feeType).replaceAll('_',' ')}</b><small>{x.description}</small></td><td>{x.callsign||'—'}</td><td>{money(x.grossFee)}</td><td><b>{money(x.fleetpayShare)}</b></td><td>{money(x.taxiCompanyShare)}</td><td><Pill tone={statusTone(x.status)}>{x.status}</Pill></td><td>{x.invoiceRef||'—'}</td></tr>)}</tbody></table></div></section></>}
    {view==='demo'&&<DemoLab demo={demo} loadDemo={loadDemo} resetDemo={resetDemo} action={demoAction} demoEmail={demoEmail} setDemoEmail={setDemoEmail} demoMobile={demoMobile} setDemoMobile={setDemoMobile} sendEmail={demoSendEmail} sendSms={demoSendSms}/>}
    {view==='drivers'&&<><section className="officePageIntro"><div><span>AUTOCAB + PAYOUT READINESS</span><h2>Driver accounts</h2><p>Balances and payout-bank readiness in one place. Full bank account numbers are never exposed in the normal office view.</p></div><button className="secondary" onClick={syncNow}><RefreshCw className={loading?'spin':''}/>Sync Autocab</button></section><section className="officeStats three"><Stat icon={Banknote} label="Bank ready" value={meta.bankReady??drivers.filter(d=>d.bankAccount?.ready).length} sub="Payout details saved"/><Stat icon={AlertTriangle} label="Missing bank details" value={meta.bankMissing??drivers.filter(d=>!d.bankAccount?.ready).length} sub="Cannot be released for payout"/><Stat icon={Clock3} label="Recently changed" value={meta.bankRecentlyChanged??drivers.filter(d=>d.bankAccount?.changedRecently).length} sub="Changed in the last 7 days"/></section><div className="driverToolbar"><div className="searchBox"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search callsign, name, mobile, email or bank ending…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All drivers</option><option value="bank_ready">Bank ready</option><option value="bank_missing">Missing bank details</option><option value="bank_recent">Recently changed bank</option><option value="positive">Positive balance</option><option value="negative">Negative balance</option><option value="unmatched">Unmatched</option></select></div><section className="panel driverPanel"><div className="tableWrap proTable"><table><thead><tr><th>Callsign</th><th>Driver</th><th>Previous</th><th>Current</th><th>Payout account</th><th>Last processed</th></tr></thead><tbody>{filtered.map(d=>{const b=d.bankAccount||{};return <tr key={d.driverId} onClick={()=>setSelected(d)}><td><span className="callsign">{d.callsign}</span></td><td><b>{d.fullName}</b><small>{d.email||d.mobile||`Driver ${d.driverId}`}</small></td><td>{money(d.previousBalance)}</td><td><b className={(d.currentBalance??0)<0?'negative':''}>{money(d.currentBalance)}</b></td><td><div className="bankTableCell"><Pill tone={bankTone(b)}>{b.label||'Bank details missing'}</Pill>{b.ready&&<small>{b.accountNumberMasked} · {b.sortCodeMasked}</small>}</div></td><td>{dt(d.lastProcessed)}</td></tr>})}</tbody></table></div></section></>}
    {view==='access'&&<><section className="officePageIntro"><div><span>IDENTITY & PERMISSIONS</span><h2>Users & access</h2><p>Office accounts use mandatory authenticator MFA. Roles limit who can move money or change settings.</p></div>{isAdmin&&<button className="primary" onClick={()=>setShowNewStaff(!showNewStaff)}><UserCheck/>Add office user</button>}</section>{isAdmin&&showNewStaff&&<section className="panel"><form className="staffForm" onSubmit={createStaff}><label>Name<input required value={newStaff.name} onChange={e=>setNewStaff({...newStaff,name:e.target.value})}/></label><label>Email<input type="email" required value={newStaff.email} onChange={e=>setNewStaff({...newStaff,email:e.target.value})}/></label><label>Role<select value={newStaff.role} onChange={e=>setNewStaff({...newStaff,role:e.target.value})}><option value="administrator">Administrator</option><option value="finance">Finance</option><option value="office">Office</option><option value="readonly">Read only</option></select></label><label>Temporary password<input type="password" minLength="10" required value={newStaff.password} onChange={e=>setNewStaff({...newStaff,password:e.target.value})}/></label><button className="primary">Create user</button></form></section>}<section className="panel"><div className="panelHead"><div><h3>Office users</h3><p>MFA and role status for each staff account.</p></div><button className="mini" onClick={loadStaff}>Refresh</button></div><div className="tableWrap proTable"><table><thead><tr><th>User</th><th>Role</th><th>MFA</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{staff.map(u=><tr key={u.id}><td><b>{u.name}</b><small>{u.email}</small></td><td><select value={u.role} onChange={e=>updateStaff(u,{role:e.target.value})} disabled={u.id===me?.id}><option value="administrator">Administrator</option><option value="finance">Finance</option><option value="office">Office</option><option value="readonly">Read only</option></select></td><td><Pill tone={u.mfaEnabled?'good':'warn'}>{u.mfaEnabled?'Enabled':'Setup required'}</Pill></td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.active?'good':'bad'}>{u.active?'Active':'Disabled'}</Pill></td><td>{u.id!==me?.id&&<button className="mini" onClick={()=>updateStaff(u,{active:!u.active})}>{u.active?'Disable':'Enable'}</button>}</td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelHead"><div><h3>Driver app accounts</h3><p>Registration remains matched to active Autocab driver details.</p></div><button className="mini" onClick={loadDriverUsers}>Refresh</button></div><div className="tableWrap proTable"><table><thead><tr><th>Callsign</th><th>Email</th><th>Created</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{driverUsers.map(u=><tr key={u.id}><td><span className="callsign">{u.callsign}</span></td><td>{u.email}</td><td>{dt(u.createdAt)}</td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.approved?'good':'warn'}>{u.approved?'Approved':'Pending'}</Pill></td><td>{canOffice&&<button className="mini" onClick={()=>setApproval(u,!u.approved)}>{u.approved?'Suspend':'Approve'}</button>}</td></tr>)}</tbody></table></div></section></>}
    {view==='security'&&isAdmin&&<><section className="officePageIntro"><div><span>SECURITY CENTRE</span><h2>Authentication & audit</h2><p>Office access requires password plus authenticator verification. Sensitive actions are recorded against the signed-in user.</p></div><div className="secureBadge"><ShieldCheck/><div><b>MFA enforced</b><span>{me?.email}</span></div></div></section><section className="securityCards"><div className="securityCard"><ShieldCheck/><div><span>Current session</span><b>MFA verified</b><small>{me?.role}</small></div></div><div className="securityCard"><KeyRound/><div><span>Authentication</span><b>TOTP authenticator</b><small>Required for every office account</small></div></div><div className="securityCard"><Clock3/><div><span>Session lifetime</span><b>12 hours maximum</b><small>Sign out on shared devices</small></div></div></section><section className="panel"><div className="panelHead"><div><h3>Security history</h3><p>Recent login, MFA and security events.</p></div><button className="mini" onClick={loadSecurity}>Refresh</button></div><div className="securityLogList">{securityLogs.map(l=><div className="securityLog" key={l.id}><div className="logIcon"><ShieldCheck/></div><div><b>{String(l.action).replaceAll('_',' ')}</b><span>{l.actorId||'system'} · {dt(l.createdAt)}</span><small>{l.ip||'No IP recorded'}</small></div></div>)}</div></section></>}
    {view==='settings'&&isAdmin&&settings&&<><section className="officePageIntro"><div><span>ADMINISTRATION</span><h2>FleetPay settings</h2><p>Operational rules, payout descriptions, communications and fee splits. Secret values are stored encrypted and are never returned to the browser.</p></div><button className="primary" onClick={saveSettings}><Settings/>Save all settings</button></section><div className="settingsSections">
     <section className="panel settingsCardV2"><div className="settingsHead"><CalendarDays/><div><h3>Settlement & payout rules</h3><p>Controls used for Monday and early payout processing.</p></div></div><div className="formGrid2"><label>Outstanding threshold<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.negativeThreshold??0} onChange={e=>setSettings({...settings,negativeThreshold:e.target.value})}/></div></label><label>Weekly FleetPay fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.weeklyAppFee??0} onChange={e=>setSettings({...settings,weeklyAppFee:e.target.value})}/></div></label><label>Early payout fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.earlyPayoutFee??0} onChange={e=>setSettings({...settings,earlyPayoutFee:e.target.value})}/></div></label><label>Early payout cutoff<input type="time" value={settings.earlyPayoutCutoffTime||'11:00'} onChange={e=>setSettings({...settings,earlyPayoutCutoffTime:e.target.value})}/></label><label>Outstanding payment deadline<input type="time" value={settings.outstandingDueTime||'17:00'} onChange={e=>setSettings({...settings,outstandingDueTime:e.target.value})}/></label><label>Autocab sync interval<input type="number" min="2" max="60" value={settings.syncMinutes||10} onChange={e=>setSettings({...settings,syncMinutes:e.target.value})}/><small>Minutes between automatic syncs.</small></label></div><div className="formGrid1"><label>Weekly payout Autocab description<input value={settings.weeklyPayoutReasonTemplate||''} onChange={e=>setSettings({...settings,weeklyPayoutReasonTemplate:e.target.value})}/><small>Available: {'{date}'} {'{time}'} {'{callsign}'} {'{amount}'}</small></label><label>Early payout Autocab description<input value={settings.earlyPayoutReasonTemplate||''} onChange={e=>setSettings({...settings,earlyPayoutReasonTemplate:e.target.value})}/></label><div className="formGrid2"><label>Manual pay-in default reason<input value={settings.manualPayInReasonDefault||''} onChange={e=>setSettings({...settings,manualPayInReasonDefault:e.target.value})}/></label><label>Manual payout default reason<input value={settings.manualPayoutReasonDefault||''} onChange={e=>setSettings({...settings,manualPayoutReasonDefault:e.target.value})}/></label></div></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><BadgePoundSterling/><div><h3>Fee pricing & split</h3><p>Define the gross fee and how each fee is split between FleetPay and the taxi company.</p></div></div><div className="formGrid2"><label>Customer payment fee type<select value={settings.customerPaymentFeeType||'fixed'} onChange={e=>setSettings({...settings,customerPaymentFeeType:e.target.value})}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label><label>Customer payment fee<div className="moneyField"><span>{settings.customerPaymentFeeType==='percentage'?'%':'£'}</span><input type="number" min="0" step="0.01" value={settings.customerPaymentFeeValue??0} onChange={e=>setSettings({...settings,customerPaymentFeeValue:e.target.value})}/></div></label><label>FleetPay share – customer fees<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.customerFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,customerFeeFleetPayPercent:e.target.value})}/></div><small>Taxi company receives the remaining percentage.</small></label><label>FleetPay share – early payout fee<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.earlyPayoutFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,earlyPayoutFeeFleetPayPercent:e.target.value})}/></div></label><label>FleetPay share – weekly fee<div className="moneyField"><span>%</span><input type="number" min="0" max="100" value={settings.weeklyFeeFleetPayPercent??100} onChange={e=>setSettings({...settings,weeklyFeeFleetPayPercent:e.target.value})}/></div></label></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Smartphone/><div><h3>SMS endpoint</h3><p>Configure the taxi company's SMS API. The authentication value is encrypted at rest.</p></div></div><div className="formGrid2"><label>Endpoint URL<input value={settings.smsEndpoint||''} onChange={e=>setSettings({...settings,smsEndpoint:e.target.value})} placeholder="https://..."/></label><label>HTTP method<select value={settings.smsMethod||'POST'} onChange={e=>setSettings({...settings,smsMethod:e.target.value})}><option>POST</option><option>PUT</option><option>PATCH</option></select></label><label>Authentication header<input value={settings.smsAuthHeader||''} onChange={e=>setSettings({...settings,smsAuthHeader:e.target.value})} placeholder="Authorization"/></label><label>Authentication/API value<input type="password" value={settings.smsAuthValue||''} onChange={e=>setSettings({...settings,smsAuthValue:e.target.value})} placeholder={settings.smsAuthConfigured?'Configured – enter only to replace':'Enter secret value'}/></label></div><label>JSON body template<textarea rows="4" value={settings.smsBodyTemplate||''} onChange={e=>setSettings({...settings,smsBodyTemplate:e.target.value})}/><small>Use {'{mobile}'} and {'{message}'}. The final result must be valid JSON.</small></label><div className="testStrip"><input value={testSms.to} onChange={e=>setTestSms({...testSms,to:e.target.value})} placeholder="Test mobile number"/><input value={testSms.message} onChange={e=>setTestSms({...testSms,message:e.target.value})}/><button className="secondary" onClick={testSmsNow}>Send test SMS</button></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Mail/><div><h3>Email / SMTP</h3><p>SMTP is used for outstanding-payment messages and daily early-payout summaries. Resend remains the fallback if SMTP is blank.</p></div></div><div className="formGrid2"><label>SMTP host<input value={settings.smtpHost||''} onChange={e=>setSettings({...settings,smtpHost:e.target.value})}/></label><label>SMTP port<input type="number" value={settings.smtpPort||587} onChange={e=>setSettings({...settings,smtpPort:e.target.value})}/></label><label>SMTP username<input value={settings.smtpUser||''} onChange={e=>setSettings({...settings,smtpUser:e.target.value})}/></label><label>SMTP password<input type="password" value={settings.smtpPassword||''} onChange={e=>setSettings({...settings,smtpPassword:e.target.value})} placeholder={settings.smtpPasswordConfigured?'Configured – enter only to replace':'Enter password'}/></label><label>From name<input value={settings.smtpFromName||''} onChange={e=>setSettings({...settings,smtpFromName:e.target.value})}/></label><label>From email<input type="email" value={settings.smtpFromEmail||''} onChange={e=>setSettings({...settings,smtpFromEmail:e.target.value})}/></label><label>Office notification email<input type="email" value={settings.officeNotificationEmail||''} onChange={e=>setSettings({...settings,officeNotificationEmail:e.target.value})}/></label><label className="checkLine"><input type="checkbox" checked={Boolean(settings.smtpSecure)} onChange={e=>setSettings({...settings,smtpSecure:e.target.checked})}/>Use secure SMTP (usually port 465)</label></div><div className="testStrip"><input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder={settings.officeNotificationEmail||'Test email address'}/><button className="secondary" onClick={testEmailNow}>Send test email</button></div></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Mail/><div><h3>Outstanding-payment messages</h3><p>Edit the exact wording drivers receive after the Monday run.</p></div></div><label>Email subject<input value={settings.outstandingEmailSubject||''} onChange={e=>setSettings({...settings,outstandingEmailSubject:e.target.value})}/></label><label>Email message<textarea rows="7" value={settings.outstandingEmailBody||''} onChange={e=>setSettings({...settings,outstandingEmailBody:e.target.value})}/></label><label>SMS message<textarea rows="5" value={settings.outstandingSmsTemplate||''} onChange={e=>setSettings({...settings,outstandingSmsTemplate:e.target.value})}/></label><small>Available variables: {'{driver}'}, {'{callsign}'}, {'{amount}'}, {'{dueDate}'}, {'{dueTime}'}, {'{paymentLink}'}</small></section>
     <section className="panel settingsCardV2 dangerZone"><div className="settingsHead"><AlertTriangle/><div><h3>Pre-launch data reset</h3><p>Use once before the live launch. FleetPay creates a timestamped SQLite backup first, then clears operational test data while keeping office users, MFA, settings and integrations.</p></div></div><div className="launchResetInfo"><b>Cleared:</b><span>payments, payout runs, settlement runs, fee records, notifications, communication history, adjustments and demo data.</span></div><label className="checkLine"><input type="checkbox" checked={resetDrivers} onChange={e=>setResetDrivers(e.target.checked)}/>Also clear driver app registrations and push subscriptions</label><label>Confirmation phrase<input value={resetPhrase} onChange={e=>setResetPhrase(e.target.value)} placeholder="RESET FLEETPAY FOR LIVE LAUNCH"/></label><button className="dangerAction" disabled={resetPhrase!=='RESET FLEETPAY FOR LIVE LAUNCH'} onClick={launchReset}><AlertTriangle/>Create backup & reset operational data</button></section>
     <section className="panel settingsCardV2"><div className="settingsHead"><Database/><div><h3>Integration status</h3><p>Secrets from environment variables remain server-side.</p></div></div>{integrations&&<div className="integrationGrid"><div><b>Stripe</b><span>{integrations.stripe.configured?(integrations.stripe.testMode?'Test mode':'Live mode'):'Not configured'}</span><Pill tone={integrations.stripe.configured?'good':'warn'}>{integrations.stripe.configured?'Ready':'Setup'}</Pill></div><div><b>Wise</b><span>{integrations.wise.configured?integrations.wise.environment:'Not configured'}</span><Pill tone={integrations.wise.configured?'good':'warn'}>{integrations.wise.configured?'Ready':'Setup'}</Pill></div><div><b>Autocab writes</b><span>{integrations.autocab.adjustmentsEnabled?'Enabled':'Safe mode'}</span><Pill tone={integrations.autocab.adjustmentsEnabled?'good':'warn'}>{integrations.autocab.adjustmentsEnabled?'Enabled':'Disabled'}</Pill></div></div>}</section>
    </div></>}
   </div>
  </main>
  {selectedTx&&<div className="drawerBack" onClick={()=>setSelectedTx(null)}><aside className="drawer txDrawer" onClick={e=>e.stopPropagation()}><button className="drawerClose" onClick={()=>setSelectedTx(null)}><X/></button><div className="txDrawerHead"><div className={`txIcon large ${selectedTx.direction}`}><CreditCard/></div><div><span>{selectedTx.typeLabel}</span><h2>{selectedTx.direction==='out'?'-':'+'}{money(selectedTx.amount)}</h2><Pill tone={statusTone(selectedTx.status)}>{selectedTx.status}</Pill></div></div><div className="detailList">{[['FleetPay ID',selectedTx.id],['Created',dt(selectedTx.createdAt)],['Completed',selectedTx.completedAt?dt(selectedTx.completedAt):'—'],['Callsign',selectedTx.callsign||'—'],['Driver',selectedTx.driverName||'—'],['Booking',selectedTx.bookingId||'—'],['Fare',selectedTx.fareAmount!=null?money(selectedTx.fareAmount):'—'],['FleetPay fee',selectedTx.feeAmount!=null?money(selectedTx.feeAmount):'—'],['Provider',selectedTx.provider||'—'],['Provider reference',selectedTx.providerRef||'—']].map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div><div className="secureFoot"><ShieldCheck/><span>Transaction detail is read-only. Changes are made through controlled workflows and recorded in the audit trail.</span></div></aside></div>}
  {selected&&<div className="drawerBack" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="drawerClose" onClick={()=>setSelected(null)}><X/></button><div className="driverIdentity"><div className="avatar">{selected.forename?.[0]}{selected.surname?.[0]}</div><div><span>CALLSIGN {selected.callsign}</span><h2>{selected.fullName}</h2><p>Autocab Driver ID {selected.driverId}</p></div></div><div className={`balanceHero ${(selected.currentBalance??0)<0?'red':''}`}><span>Current balance</span><strong>{money(selected.currentBalance)}</strong><small>Previous {money(selected.previousBalance)}</small></div><div className="infoGrid"><div><Phone/><span>Mobile</span><b>{selected.mobile||'Not stored'}</b></div><div><Mail/><span>Email</span><b>{selected.email||'Not stored'}</b></div><div><Clock3/><span>Last processed</span><b>{dt(selected.lastProcessed)}</b></div><div><Hash/><span>Processed by</span><b>{selected.lastProcessedBy||'—'}</b></div></div><div className="payoutAccountCard"><div className="payoutAccountHead"><div className="payoutAccountIcon"><Banknote/></div><div><span>PAYOUT ACCOUNT</span><h3>Driver bank details</h3></div><Pill tone={bankTone(selected.bankAccount)}>{selected.bankAccount?.label||'Bank details missing'}</Pill></div>{selected.bankAccount?.ready?<div className="payoutAccountDetails"><div><span>Account holder</span><b>{selected.bankAccount.accountHolder||'Saved securely'}</b></div><div><span>Sort code</span><b>{selected.bankAccount.sortCodeMasked}</b></div><div><span>Account number</span><b>{selected.bankAccount.accountNumberMasked}</b></div><div><span>Added</span><b>{dt(selected.bankAccount.createdAt)}</b></div><div><span>Last changed</span><b>{dt(selected.bankAccount.updatedAt)}</b></div></div>:<div className="bankMissingNotice"><AlertTriangle/><div><b>No payout bank account</b><span>This driver must add bank details in the FleetPay app before a payout can be released.</span></div></div>} {selected.bankAccount?.changedRecently&&<div className="bankRecentNotice"><Clock3/><div><b>Bank details changed recently</b><span>Changed {dt(selected.bankAccount.updatedAt)}. Confirm the driver expected this change if anything looks unusual.</span></div></div>}<small className="bankSecurityNote"><ShieldCheck/> FleetPay only exposes masked account details to office users. Full bank details remain encrypted.</small></div></aside></div>}
 </div>
}

function CustomerPayPage(){
 const id=window.location.pathname.split('/').filter(Boolean)[1]||'';
 const[payment,setPayment]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stripeReady,setStripeReady]=useState(true);
 async function load(){try{const j=await call(`/api/public/customer-payments/${id}`);setPayment(j.payment);setStripeReady(j.stripeConfigured!==false);setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},4000);return()=>clearInterval(timer)},[id]);
 async function checkout(){setBusy(true);setError('');try{const j=await call(`/api/public/customer-payments/${id}/checkout`,{method:'POST'});window.location.assign(j.checkoutUrl)}catch(e){setError(e.message);setBusy(false)}}
 if(!payment&&!error)return <div className="publicPayPage"><div className="publicPayShell"><div className="publicPayLoading"><RefreshCw className="spin"/><span>Opening secure payment…</span></div></div></div>;
 if(error&&!payment)return <div className="publicPayPage"><div className="publicPayShell"><div className="publicPayBrand"><div className="publicPayLogo">FP</div><b>FleetPay</b></div><div className="publicPayError"><AlertTriangle/><h2>Payment link unavailable</h2><p>{error}</p></div></div></div>;
 const paid=payment.status==='paid';const cancelled=payment.status==='cancelled';
 return <div className="publicPayPage"><div className="publicPayShell">
  <header className="publicPayBrand"><div className="publicPayLogo">FP</div><div><b>FleetPay</b><span>Secure customer payment</span></div><ShieldCheck/></header>
  {paid?<section className="publicPayComplete"><CheckCircle2/><span>PAYMENT RECEIVED</span><h1>{money(payment.totalAmount)}</h1><p>Thank you. Your payment has been received securely.</p>{payment.bookingId&&<small>Reference {payment.bookingId}</small>}</section>:cancelled?<section className="publicPayComplete cancelled"><AlertTriangle/><span>PAYMENT LINK CANCELLED</span><h2>This link is no longer active</h2><p>Please contact the taxi company if you still need to make payment.</p></section>:<>
   <section className="publicPayTotal"><div><span>PAYMENT TOTAL</span><h1>{money(payment.totalAmount)}</h1><p>Review the journey and fee breakdown before continuing.</p></div><CreditCard/></section>
   <section className="publicPayBreakdown">
    <div><span>Business</span><b>{payment.taxiCompany}</b></div>{payment.bookingId&&<div><span>Reference</span><b>{payment.bookingId}</b></div>}
    {payment.customerName&&<div><span>Passenger</span><b>{payment.customerName}</b></div>}
    {(payment.pickup||payment.destination)&&<div className="publicJourney"><span>Journey</span><b>{payment.pickup||'Pickup'}{payment.destination?` → ${payment.destination}`:''}</b></div>}
    {payment.journeyAt&&<div><span>Date / time</span><b>{dt(payment.journeyAt)}</b></div>}
    <div className="publicPayDivider"/><div><span>Journey fare</span><b>{money(payment.fareAmount)}</b></div><div><span>Service fee</span><b>{money(payment.feeAmount)}</b></div><div className="publicPayGrandTotal"><span>Total to pay</span><b>{money(payment.totalAmount)}</b></div>
   </section>
   <div className="publicPayTrust"><ShieldCheck/><div><b>Secure checkout</b><span>Card details are entered on Stripe's secure checkout. FleetPay does not store your card number.</span></div></div>
   {error&&<div className="inlineError"><AlertTriangle/>{error}</div>}
   <button className="publicPayButton" disabled={busy||!stripeReady} onClick={checkout}>{busy?'Opening secure checkout…':`Pay ${money(payment.totalAmount)}`}<ArrowRight/></button>
   <p className="publicPayConsent">By continuing you agree to the payment details above. The service fee is included in the total shown.</p>
  </>}
  <footer className="publicPayFooter">FleetPay · Secure driver payments</footer>
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
  if(!bankForm.password){setErr('Enter your FleetPay password to confirm this change.');return}
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
    setNotice('Payment cancelled. Your amount due is still available to pay in FleetPay.');
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
 async function enablePush(){setErr('');try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Push notifications are not supported on this device/browser.');const cfg=await api('/api/driver/push-config');if(!cfg.enabled)throw new Error('Push notifications are not configured on the FleetPay server.');const reg=await navigator.serviceWorker.register('/fleetpay-sw.js');const perm=await Notification.requestPermission();if(perm!=='granted')throw new Error('Notification permission was not granted.');let sub=await reg.pushManager.getSubscription();if(!sub){const padded=cfg.publicKey.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(cfg.publicKey.length/4)*4,'=');const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes})}await api('/api/driver/push-subscription',{method:'POST',body:JSON.stringify({subscription:sub})});setPushReady(true);setNotice('Push notifications are enabled.');await api('/api/driver/push-test',{method:'POST'})}catch(e){setErr(e.message)}}
 async function payRequest(request){setErr('');setPaymentBusy(true);try{const j=await api(`/api/driver/payment-requests/${request.id}/checkout`,{method:'POST'});window.location.assign(j.paymentUrl)}catch(e){setErr(e.message);setPaymentBusy(false)}}

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
    await navigator.share({title:'FleetPay payment',text:`Taxi fare ${money(x.fareAmount)} · Total ${money(x.totalAmount)}`,url:x.paymentUrl});
   }else{
    await navigator.clipboard.writeText(x.paymentUrl);
    setNotice('Payment link copied.');
   }
  }catch{}
 }

 if(!token)return <div className={`driverAuthPage driverAuthV2 theme-${theme}`} style={{'--driver-text-scale':textScale}}>
  <button className="authThemeToggle" type="button" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="Change appearance">{theme==='dark'?<Sun/>:<Moon/>}</button>
  <div className="driverAuthShell">
   <div className="driverAuthBrand"><div className="authLogoMark branded"><img src={fleetpayMark} alt="FleetPay"/></div><div><b>FleetPay</b><span>Driver Payments</span></div></div>
   <div className="driverAuthCard polishedAuthCard">
    <div className="authIntro"><span className="authKicker">SECURE DRIVER APP</span><h1>{mode==='forgot'?'Reset your password':mode==='register'?'Create your account':'Welcome back'}</h1><p>{mode==='login'?'Manage payments, balances and payouts without the clutter.':'Secure access is matched against your active Autocab driver record.'}</p></div>
    {err&&<div className={`inlineError ${err.startsWith('Password reset')?'success':''}`}>{err}</div>}
    {mode==='login'&&<form onSubmit={login} className="authForm">
      <label>Email address<div className="authField"><Mail/><input type="email" autoComplete="email" placeholder="you@example.com" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></label>
      <label>Password<div className="authField"><KeyRound/><input type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Your password" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/><button type="button" className="passwordToggle" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>
      <div className="authRow"><button className="textBtn" type="button" onClick={()=>{setMode('forgot');setStep(1);setErr('')}}>Forgot password?</button></div>
      <button className="primary full authPrimary">Sign in <ArrowRight/></button>
      <div className="authDivider"><span>New to FleetPay?</span></div>
      <button className="authSecondary full" type="button" onClick={()=>{setMode('register');setStep(1);setErr('')}}>Create driver account</button>
     </form>}
    {mode==='register'&&(step===1?<form onSubmit={startRegister} className="authForm"><div className="secureBanner"><ShieldCheck/><span>We verify your callsign, Autocab email and last 4 mobile digits.</span></div><label>Callsign<div className="authField"><Hash/><input required value={f.callsign} onChange={e=>setF({...f,callsign:e.target.value})}/></div></label><label>Email stored in Autocab<div className="authField"><Mail/><input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></label><label>Last 4 digits of mobile<div className="authField"><Phone/><input inputMode="numeric" maxLength="4" required value={f.mobileLast4} onChange={e=>setF({...f,mobileLast4:e.target.value.replace(/\D/g,'')})}/></div></label><button className="primary full authPrimary">Verify my details <ArrowRight/></button><button className="textBtn centered" type="button" onClick={()=>setMode('login')}>Back to sign in</button></form>:<form onSubmit={finishRegister} className="authForm"><label>6-digit verification code<div className="authField"><ShieldCheck/><input inputMode="numeric" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'')})}/></div></label>{dev&&<div className="devCode">Development code: <b>{dev}</b></div>}<label>Create password<div className="authField"><KeyRound/><input type="password" minLength="8" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></div></label><button className="primary full authPrimary">Create secure account</button></form>)}
    {mode==='forgot'&&(step===1?<form onSubmit={startReset} className="authForm"><div className="secureBanner"><KeyRound/><span>Enter the email used for your FleetPay driver account.</span></div><label>Email<div className="authField"><Mail/><input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div></label><button className="primary full authPrimary">Send reset code <ArrowRight/></button><button className="textBtn centered" type="button" onClick={()=>setMode('login')}>Back to sign in</button></form>:<form onSubmit={finishReset} className="authForm"><label>Reset code<div className="authField"><ShieldCheck/><input inputMode="numeric" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'')})}/></div></label>{dev&&<div className="devCode">Development code: <b>{dev}</b></div>}<label>New password<div className="authField"><KeyRound/><input type="password" minLength="8" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></div></label><button className="primary full authPrimary">Set new password</button></form>)}
    <div className="authTrust"><ShieldCheck/><span>Protected connection · FleetPay Driver</span></div>
   </div>
  </div>
 </div>;

 if(!me)return <div className={`driverAuthPage driverAuthV2 theme-${theme}`} style={{'--driver-text-scale':textScale}}><div className="driverAuthShell"><div className="driverAuthBrand"><div className="authLogoMark branded"><img src={fleetpayMark} alt="FleetPay"/></div><div><b>FleetPay</b><span>Driver Payments</span></div></div><div className="driverAuthCard polishedAuthCard authLoading"><RefreshCw className="spin"/><b>Loading FleetPay</b><span>Preparing your driver account…</span></div></div></div>;

 const d=me.driver;
 const balance=Number(d.currentBalance||0);
 const balanceState=balance>0?'positive':balance<0?'negative':'settled';
 const balanceDisplay=balance>0?`+${money(balance)}`:balance<0?`−${money(Math.abs(balance))}`:money(0);
 const balanceTitle=balance>0?'You are owed':balance<0?'You owe':'All settled';
 const balanceHint=balance>0?'Available for FleetPay payout':balance<0?'Amount currently owed to FleetPay':'Nothing to pay or receive right now';
 const bankAccount=me.bankAccount||{configured:false,status:'missing'};
 const paymentRequests=me.paymentRequests||[];
 const totalDue=paymentRequests.reduce((sum,x)=>sum+Number(x.amount||0),0);
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
 const mondayPriority=isMonday&&paymentRequests.length>0;
 const firstDue=paymentRequests.map(x=>x.dueAt).filter(Boolean).sort()[0]||null;
 const dueWhen=firstDue?new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(firstDue)):'Tuesday 17:00';

 const navItems=[
  ['home',Home,'Home'],
  ['activity',Activity,'Activity'],
  ['pay',CreditCard,'Payments'],
  ['account',UserCheck,'Account']
 ];

 const PaymentDueCard=({hero=false})=>paymentRequests.length>0?<section className={`driverCard paymentDueCard ${hero?'mondayDueHero':''}`}><div className="paymentDueHeader"><div><span className="eyebrow">{hero?'MONDAY SETTLEMENT':'PAYMENT DUE'}</span><h2>{money(totalDue)}</h2></div><Pill tone="warn">Outstanding</Pill></div>{hero?<><h3>Weekly payment requires attention</h3><p>Your Monday settlement is ready to pay. Please complete payment by <b>{dueWhen}</b> to avoid suspension.</p><div className="dueHeroMeta"><div><span>Amount due</span><b>{money(totalDue)}</b></div><div><span>Deadline</span><b>{dueWhen}</b></div></div></>:<p>Securely settle your FleetPay balance.</p>}{paymentRequests.map((r,i)=><div className="dueRequestRow" key={r.id}><div><b>{money(r.amount)}</b><span>{r.dueAt?`Due ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(r.dueAt))}`:dt(r.createdAt)}{paymentRequests.length>1?` · Request ${i+1}`:''}</span></div><button className={`mini ${hero?'heroPayButton':'goodBtn'}`} disabled={paymentBusy||!me.stripeConfigured} onClick={()=>payRequest(r)}>{paymentBusy?'Opening…':'Pay now'}</button></div>)}{hero&&<button className="dueDetailsButton" type="button" onClick={()=>changeTab('pay')}>View payment details <ChevronRight/></button>}</section>:null;

 const CustomerPaymentForm=()=> <section className="driverCard modernPaymentCard"><div className="cardTop"><div><span className="eyebrow">TAKE PAYMENT</span><h2>Customer payment</h2></div><div className="iconBubble"><CreditCard/></div></div><p className="compactCopy">Enter the fare. FleetPay adds the service fee automatically.</p><div className="formStack"><label>Fare<div className="moneyInput modernMoneyInput"><span>£</span><input type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="0.00" value={customerFare} onChange={e=>{setCustomerFare(e.target.value);setCustomerPayment(null)}}/></div></label><label>Booking ID <small>optional</small><input className="modernInput" type="text" placeholder="e.g. 12345678" value={customerBooking} onChange={e=>{setCustomerBooking(e.target.value);setCustomerPayment(null)}}/></label></div>{fareValue>0&&<div className="paymentBreakdown"><div><span>Fare</span><b>{money(fareValue)}</b></div><div><span>Service fee</span><b>{money(feePreview)}</b></div><div className="paymentTotal"><span>Customer pays</span><strong>{money(customerTotal)}</strong></div></div>}{!customerPayment&&<button className="primary full actionButton" disabled={customerPaymentBusy||!me.stripeConfigured||!(fareValue>0)} onClick={createCustomerPayment}>{customerPaymentBusy?'Creating…':'Create payment'}</button>}{customerPayment&&<div className="activePaymentSheet"><div className="activePaymentTop"><div><span>PAYMENT READY</span><strong>{money(customerPayment.totalAmount)}</strong>{customerPayment.bookingId&&<small>Booking {customerPayment.bookingId}</small>}</div><Pill tone="warn">Awaiting</Pill></div><div className="qrPanel"><QRCodeSVG value={customerPayment.paymentUrl} size={210} level="M" includeMargin/><b>Scan to pay</b><span>Secure Stripe checkout</span></div><div className="paymentActions"><button className="primary" type="button" onClick={()=>window.open(customerPayment.paymentUrl,'_blank')}>Open payment link</button><button className="outline" type="button" onClick={()=>sharePayment(customerPayment)}>Share link</button></div><button className="textBtn paymentCancel" type="button" onClick={()=>setCustomerPayment(null)}>Hide payment</button></div>}{!me.stripeConfigured&&<small className="paymentUnavailable">Customer card payments are not configured.</small>}</section>;

 const EarlyPayoutCard=()=> <section className="driverCard"><div className="cardTop"><div><span className="eyebrow">EARLY PAYOUT</span><h2>Request payout</h2></div><div className="iconBubble"><ArrowUpRight/></div></div><div className="availableRow"><span>Available now</span><strong>{money(me.availableForEarlyPayout)}</strong></div>{!bankAccount.configured&&<div className="bankRequiredNotice"><Banknote/><div><b>Bank account required</b><span>Add your payout bank account before requesting money.</span></div><button type="button" className="mini" onClick={()=>changeTab('account')}>Add account</button></div>}{me.reservedForEarlyPayout>0&&<div className="reservedLine"><span>Already reserved</span><b>{money(me.reservedForEarlyPayout)}</b></div>}{me.earlyPayoutAllowed&&<div className={`cutoffNotice ${me.earlyPayoutTiming?.afterCutoff?'afterCutoff':''}`}><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>}{bankAccount.configured&&me.earlyPayoutAllowed&&me.availableForEarlyPayout>me.settings.earlyPayoutFee?<><div className="moneyInput modernMoneyInput"><span>£</span><input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amt} onChange={e=>setAmt(e.target.value)}/></div>{amt&&Number(amt)>0&&<div className="compactPreview"><span>You receive</span><b>{money(Math.max(0,Number(amt)-me.settings.earlyPayoutFee))}</b><small>Includes {money(me.settings.earlyPayoutFee)} fee</small></div>}<button className="primary full actionButton" onClick={payout}>Request payout</button></>:!me.earlyPayoutAllowed?<div className="closed"><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>:null}</section>;

 const HomePage=()=> <div className="driverPageView driverHomeVNext">
  {paymentRequests.length>0
   ? PaymentDueCard({hero:true})
   : <section className={`driverHeroBalance balanceState-${balanceState}`}>
      <div className="balanceMeaning"><span className="balanceMeaningLabel">{balanceTitle}</span><strong>{balanceDisplay}</strong><p>{balanceHint}</p></div>
      <button className="balanceRefresh" type="button" onClick={()=>load(true)} aria-label="Refresh balance"><RefreshCw/></button>
      <div className="balanceStateStrip"><span>{balance>0?'Money due to you':balance<0?'Money you need to pay':'Account clear'}</span><b>{balance>0?`${money(me.availableForEarlyPayout)} available now`:balance<0?'Will carry forward unless requested':'Up to date'}</b></div>
      <div className="heroBalanceActions"><button type="button" onClick={()=>changeTab('pay')}><CreditCard/>Take payment</button>{balance>0&&<button type="button" onClick={()=>changeTab('pay')}><ArrowUpRight/>Early payout</button>}</div>
      <div className="heroBalanceFoot"><span>Updated {dt(d.syncedAt)}</span><span>Callsign {d.callsign}</span></div>
     </section>}
  {paymentRequests.length===0&&!bankAccount.configured&&<section className="driverCard bankSetupPrompt"><div className="bankSetupIcon"><Banknote/></div><div><span className="eyebrow">PAYOUT SETUP</span><h3>Add your bank account</h3><p>FleetPay needs your bank details before we can send you a payout.</p></div><button type="button" className="primary" onClick={()=>changeTab('account')}>Set up</button></section>}
  <div className="homeSectionTitle"><span>AT A GLANCE</span></div>
  <div className="glanceGrid">
   <button className="glanceCard payments" onClick={()=>changeTab('pay')}><CreditCard/><span>Take payment</span><b>QR or secure link</b><small>{openCustomerPayments.length?`${openCustomerPayments.length} link${openCustomerPayments.length===1?'':'s'} open`:'Ready when you are'}</small></button>
   {paymentRequests.length===0&&<button className="glanceCard payout" onClick={()=>changeTab('pay')}><ArrowUpRight/><span>Early payout</span><b>{money(me.availableForEarlyPayout)}</b><small>{me.earlyPayoutAllowed?'Available now':'Check payout window'}</small></button>}
   <button className="glanceCard activity" onClick={()=>changeTab('activity')}><Activity/><span>Activity</span><b>{paidCustomerPayments.length}</b><small>Customer payments received</small></button>
   <button className="glanceCard account" onClick={()=>changeTab('account')}><UserCheck/><span>Account</span><b>Callsign {d.callsign}</b><small>Profile, fees & alerts</small></button>
  </div>
  {pushAvailable&&!pushReady&&<section className="driverCard compactCard"><div className="compactAction"><div className="compactActionIcon"><Smartphone/></div><div><b>Turn on payment alerts</b><span>Get notified when money moves.</span></div><button className="mini" onClick={enablePush}>Enable</button></div></section>}
  {customerPayments.length>0&&<section className="driverCard latestActivityCard"><div className="sectionHeader"><div><span className="eyebrow">LATEST</span><h2>Recent payments</h2></div><button className="linkButton" onClick={()=>changeTab('activity')}>See all</button></div>{customerPayments.slice(0,3).map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><CreditCard/></div><div className="historyMain"><b>{money(x.totalAmount)}</b><span>{x.bookingId?`Booking ${x.bookingId}`:'Customer payment'} · {dt(x.createdAt)}</span></div><Pill tone={x.status==='paid'?'good':'warn'}>{x.status}</Pill></div>)}</section>}
  {me.notifications?.length>0&&<section className="driverCard latestActivityCard"><div className="sectionHeader"><div><span className="eyebrow">UPDATES</span><h2>Notifications</h2></div></div>{me.notifications.slice(0,2).map(n=><div className="cleanNotice" key={n.id}><div className="historyIcon"><Bell/></div><div><b>{n.title}</b><span>{n.message}</span><small>{dt(n.createdAt)}</small></div></div>)}</section>}
 </div>;

 const PayPage=()=> <div className="driverPageView"><div className="pageTitle"><span>PAYMENTS</span><h1>Move money</h1><p>{paymentRequests.length>0?'Pay your outstanding FleetPay balance or take a passenger payment.':'Take passenger payments or request an early payout.'}</p></div>{CustomerPaymentForm()}{paymentRequests.length===0&&EarlyPayoutCard()}{PaymentDueCard({})}</div>;

 const ActivityPage=()=> <div className="driverPageView"><div className="pageTitle"><span>ACTIVITY</span><h1>Your history</h1><p>Customer payments, FleetPay fees and payout requests.</p></div><section className="activitySummary"><div><span>Customer payments</span><b>{paidCustomerPayments.length}</b></div><div><span>Open links</span><b>{openCustomerPayments.length}</b></div></section><section className="driverCard activityCard"><div className="sectionHeader"><div><span className="eyebrow">CUSTOMER PAYMENTS</span><h2>Payment history</h2></div></div>{customerPayments.length===0?<div className="emptyState">No customer payments yet.</div>:customerPayments.map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><CreditCard/></div><div className="historyMain"><b>{money(x.totalAmount)}</b><span>{money(x.fareAmount)} fare{Number(x.feeAmount)>0?` + ${money(x.feeAmount)} fee`:''}</span><small>{x.bookingId?`Booking ${x.bookingId} · `:''}{dt(x.createdAt)}</small>{x.status==='open'&&x.paymentUrl&&<div className="inlineActions"><button onClick={()=>window.open(x.paymentUrl,'_blank')}>Open</button><button onClick={()=>sharePayment(x)}>Share</button></div>}</div><Pill tone={x.status==='paid'?'good':'warn'}>{x.status}</Pill></div>)}</section><section className="driverCard activityCard"><div className="sectionHeader"><div><span className="eyebrow">FLEETPAY</span><h2>Payments & fees</h2></div></div>{me.ledger?.length===0?<div className="emptyState">No account activity recorded yet.</div>:me.ledger?.slice(0,20).map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><WalletCards/></div><div className="historyMain"><b>{x.description}</b><span>{dt(x.createdAt)}{x.feeAmount>0?` · Fee ${money(x.feeAmount)}`:''}</span></div><div className={`historyAmount ${x.direction==='credit'?'pos':'neg'}`}><b>{x.direction==='credit'?'+':'-'}{money(x.amount)}</b><small>{x.status}</small></div></div>)}</section>{me.earlyPayoutRequests?.length>0&&<section className="driverCard activityCard"><div className="sectionHeader"><div><span className="eyebrow">PAYOUTS</span><h2>Request history</h2></div></div>{me.earlyPayoutRequests.slice(0,15).map(x=><div className="cleanHistoryRow" key={x.id}><div className="historyIcon"><ArrowUpRight/></div><div className="historyMain"><b>{money(x.netAmount)}</b><span>{dt(x.createdAt)}{x.declineReason?` · ${x.declineReason}`:''}</span></div><Pill tone={x.status==='approved'||x.status==='paid'?'good':x.status==='declined'?'warn':'neutral'}>{x.status}</Pill></div>)}</section>}</div>;

 const BankAccountCard=()=> <section className={`driverCard bankAccountCard ${bankAccount.configured?'configured':'missing'}`}>
  <div className="sectionHeader bankSectionHeader"><div><span className="eyebrow">PAYOUT BANK ACCOUNT</span><h2>{bankAccount.configured?'Bank account saved':'Add payout account'}</h2></div><div className="iconBubble"><Banknote/></div></div>
  {!bankEditing&&bankAccount.configured&&<><div className="savedBankSummary"><div className="bankLogoTile"><Banknote/></div><div><span>Account ending</span><b>{bankAccount.accountNumberMasked}</b><small>Sort code {bankAccount.sortCodeMasked}</small></div><Pill tone="good">Saved</Pill></div><div className="bankSecurityNote"><ShieldCheck/><span>Full bank details are encrypted and are never shown again in the app.</span></div><button type="button" className="outline full bankChangeButton" onClick={()=>{setBankEditing(true);setErr('')}}>Change bank account</button></>}
  {!bankEditing&&!bankAccount.configured&&<><p className="compactCopy">Add the UK bank account where you want FleetPay payouts sent.</p><div className="bankSecurityNote"><ShieldCheck/><span>Your account number and sort code are encrypted. We only display masked details after saving.</span></div><button type="button" className="primary full actionButton" onClick={()=>{setBankEditing(true);setErr('')}}>Add bank account</button></>}
  {bankEditing&&<form className="bankEditForm" onSubmit={saveBankAccount}><div className="bankWarning"><AlertTriangle/><span>{bankAccount.configured?'Changing these details changes where all future FleetPay payouts will be sent.':'Check these details carefully. Future FleetPay payouts will be sent to this account.'}</span></div><label>Account holder name<input className="modernInput" autoComplete="name" placeholder="Name on the bank account" required value={bankForm.accountHolder} onChange={e=>setBankForm({...bankForm,accountHolder:e.target.value})}/></label><div className="bankFieldGrid"><label>Sort code<input className="modernInput" inputMode="numeric" autoComplete="off" placeholder="12-34-56" maxLength="8" required value={bankForm.sortCode} onChange={e=>{const n=e.target.value.replace(/\D/g,'').slice(0,6);setBankForm({...bankForm,sortCode:n.replace(/(\d{2})(?=\d)/g,'$1-')})}}/></label><label>Account number<input className="modernInput" inputMode="numeric" autoComplete="off" placeholder="12345678" maxLength="8" required value={bankForm.accountNumber} onChange={e=>setBankForm({...bankForm,accountNumber:e.target.value.replace(/\D/g,'').slice(0,8)})}/></label></div><label>Confirm with FleetPay password<div className="authField inlinePasswordField"><KeyRound/><input type="password" autoComplete="current-password" required placeholder="Your FleetPay password" value={bankForm.password} onChange={e=>setBankForm({...bankForm,password:e.target.value})}/></div></label><div className="bankFormActions"><button type="button" className="outline" onClick={()=>{setBankEditing(false);setBankForm({accountHolder:'',sortCode:'',accountNumber:'',password:''})}}>Cancel</button><button type="submit" className="primary" disabled={bankBusy}>{bankBusy?'Saving…':bankAccount.configured?'Save new account':'Save bank account'}</button></div></form>}
  {bankAccount.configured&&<small className="bankUpdated">Last changed {dt(bankAccount.updatedAt)}</small>}
 </section>;

 const AccountPage=()=> <div className="driverPageView"><div className="pageTitle"><span>ACCOUNT</span><h1>{d.fullName}</h1><p>Callsign {d.callsign}</p></div><section className="driverCard profileCard"><div className="profileHero"><div className="profileAvatar">{firstName[0]}{(d.surname||'')[0]||''}</div><div><b>{d.fullName}</b><span>Driver · Callsign {d.callsign}</span></div></div><div className="profileRows"><div><span>Email</span><b>{d.email||f.email||'Not available'}</b></div><div><span>Mobile</span><b>{d.mobile||'Not available'}</b></div><div><span>Last FleetPay sync</span><b>{dt(d.syncedAt)}</b></div></div></section>{BankAccountCard()}<section className="driverCard"><div className="sectionHeader"><div><span className="eyebrow">FEES</span><h2>Your FleetPay fees</h2></div></div><div className="feeRows"><div><span>Weekly app fee</span><b>{money(me.settings.weeklyAppFee)}</b></div><div><span>Early payout fee</span><b>{money(me.settings.earlyPayoutFee)}</b></div><div><span>Customer service fee</span><b>{feeType==='percentage'?`${feeValue}%`:money(feeValue)}</b></div></div></section>{pushAvailable&&<section className="driverCard"><div className="compactAction"><div className="compactActionIcon"><Smartphone/></div><div><b>Payment alerts</b><span>{pushReady?'Notifications are enabled.':'Get updates about payments and payouts.'}</span></div>{!pushReady&&<button className="mini" onClick={enablePush}>Enable</button>}{pushReady&&<Pill tone="good">On</Pill>}</div></section>}<section className="driverCard appearanceCard"><div className="sectionHeader"><div><span className="eyebrow">APPEARANCE</span><h2>Display</h2></div></div><div className="themeOptions"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/><span><b>Light</b><small>Bright and clean</small></span></button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/><span><b>Dark</b><small>Low-light friendly</small></span></button></div><div className="textSizeControl"><div className="textSizeHead"><div><b>Text size</b><span>Adjusts app text without changing the layout.</span></div><strong>{Math.round(textScale*100)}%</strong></div><div className="textSizeSliderRow"><span className="textSizeSmall">A</span><input aria-label="Text size" type="range" min="0.9" max="1.5" step="0.05" value={textScale} onChange={e=>setTextScale(Number(e.target.value))}/><span className="textSizeLarge">A</span></div><div className="textSizePresets" aria-label="Text size presets"><button type="button" className={textScale===0.9?'active':''} onClick={()=>setTextScale(0.9)}>Small</button><button type="button" className={textScale===1?'active':''} onClick={()=>setTextScale(1)}>Standard</button><button type="button" className={textScale===1.2?'active':''} onClick={()=>setTextScale(1.2)}>Large</button><button type="button" className={textScale===1.35?'active':''} onClick={()=>setTextScale(1.35)}>Extra Large</button><button type="button" className={textScale===1.5?'active':''} onClick={()=>setTextScale(1.5)}>Accessibility</button></div><button type="button" className="textSizeReset" onClick={()=>setTextScale(1)}>Reset to standard</button></div></section><button className="accountSignOut" onClick={logout}><LogOut/>Sign out</button><div className="driverFooter">FleetPay · Secure driver payments</div></div>;

 return <div className={`driverApp modernDriverApp driverVNext theme-${theme}`} style={{'--driver-text-scale':textScale}}><header className="driverHeader modernDriverHeader driverVNextHeader"><div className="driverBrandMark"><img src={fleetpayMark} alt=""/></div><div className="driverIdentity"><div className="driverAvatar">{firstName[0]}{(d.surname||'')[0]||''}</div><div><span>FLEETPAY · {d.callsign}</span><b>{driverTab==='home'?`${greeting}, ${firstName}`:driverTab==='activity'?'Activity':driverTab==='pay'?'Payments':'Account'}</b></div></div><div className="driverHeaderActions"><button className="headerRefresh" type="button" onClick={()=>load(true)} aria-label="Refresh"><RefreshCw/></button><button className="headerBell" type="button" onClick={()=>changeTab('activity')} aria-label="Notifications"><Bell/>{me.notifications?.length>0&&<i/>}</button></div></header><main className="modernDriverMain">{notice&&<div className="driverNotice floatingNotice"><CheckCircle2/><span>{notice}</span><button onClick={()=>setNotice('')}><X/></button></div>}{err&&<div className="inlineError driverGlobalError"><AlertTriangle/>{err}</div>}{driverTab==='home'&&HomePage()}{driverTab==='pay'&&PayPage()}{driverTab==='activity'&&ActivityPage()}{driverTab==='account'&&AccountPage()}</main><nav className="driverBottomNav" aria-label="Driver navigation">{navItems.map(([key,Icon,label])=><button key={key} className={driverTab===key?'active':''} onClick={()=>changeTab(key)}><Icon/><span>{label}</span>{key==='pay'&&openCustomerPayments.length>0&&<i>{openCustomerPayments.length}</i>}</button>)}</nav></div>;
}


const isNativeApp = Capacitor.isNativePlatform();
const isPayPage = !isNativeApp && window.location.pathname.startsWith('/pay/');
const isDriver = isNativeApp || window.location.pathname.startsWith('/driver');

createRoot(document.getElementById('root')).render(
  isPayPage ? <CustomerPayPage /> : isDriver ? <DriverApp /> : <AdminApp />
);