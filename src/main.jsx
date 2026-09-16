import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import React,{useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import { QRCodeSVG } from 'qrcode.react';
import{Activity,AlertTriangle,ArrowRight,ArrowUpRight,BadgePoundSterling,Banknote,CalendarDays,CheckCircle2,ChevronRight,Clock3,CreditCard,Database,FileClock,Hash,KeyRound,LayoutDashboard,LogIn,LogOut,Mail,Menu,Phone,PlayCircle,RefreshCw,Search,Send,Settings,ShieldCheck,Smartphone,Users,UserCheck,WalletCards,X}from'lucide-react';
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

function AdminLogin({onLogin}){const[f,setF]=useState({email:'',password:''});const[e,setE]=useState('');const[s,setS]=useState(false);async function submit(ev){ev.preventDefault();setS(true);setE('');try{const j=await call('/api/admin/login',{method:'POST',body:JSON.stringify(f)});localStorage.setItem('fleetpay_admin',j.token);onLogin(j.token)}catch(x){setE(x.message)}finally{setS(false)}}return <div className="authPage"><div className="authPanel"><Logo/><div className="authHeading"><span>ADMIN PORTAL</span><h1>Secure access to FleetPay</h1><p>Manage driver balances, settlements, payout requests and audit history.</p></div>{e&&<div className="inlineError"><AlertTriangle/>{e}</div>}<form onSubmit={submit}><label>Email<input type="email" required value={f.email} onChange={x=>setF({...f,email:x.target.value})}/></label><label>Password<input type="password" required value={f.password} onChange={x=>setF({...f,password:x.target.value})}/></label><button className="primary full" disabled={s}><LogIn/>{s?'Signing in…':'Sign in securely'}</button></form><div className="authSecurity"><ShieldCheck/><span>Admin access is protected and all key actions are audit logged.</span></div></div></div>}

function AdminApp(){
 const[token,setToken]=useState(localStorage.getItem('fleetpay_admin')||'');
 const[view,setView]=useState('drivers');
 const[drivers,setDrivers]=useState([]);
 const[meta,setMeta]=useState({});
 const[settings,setSettings]=useState(null);
 const[sett,setSett]=useState({runs:[],payoutRuns:[],payouts:[],paymentRequests:[],earlyPayoutRequests:[]});
 const[logs,setLogs]=useState([]);
 const[users,setUsers]=useState([]);
 const[integrations,setIntegrations]=useState(null);
 const[adjLogs,setAdjLogs]=useState([]);
 const[testAdj,setTestAdj]=useState({callsign:'',amount:'0.01',isCredit:true,description:'FleetPay test adjustment',adjustmentReason:'FleetPay Test'});
 const[q,setQ]=useState('');
 const[filter,setFilter]=useState('all');
 const[selected,setSelected]=useState(null);
 const[selectedRun,setSelectedRun]=useState(null);
 const[loading,setLoading]=useState(false);
 const[mobileNav,setMobileNav]=useState(false);
 const[err,setErr]=useState('');

 const loadDrivers=async()=>{setLoading(true);setErr('');try{const j=await call('/api/drivers',{},token);setDrivers(j.drivers||[]);setMeta(j)}catch(e){if(e.message.includes('authentication'))logout();else setErr(e.message)}finally{setLoading(false)}};
 const loadSettings=async()=>setSettings(await call('/api/settings',{},token));
 const loadIntegrations=async()=>{setIntegrations(await call('/api/admin/integrations',{},token));setAdjLogs((await call('/api/admin/autocab/adjustments',{},token)).adjustments||[])};
 const loadSett=async()=>setSett(await call('/api/admin/settlements',{},token));
 const loadLogs=async()=>setLogs((await call('/api/admin/logs?limit=250',{},token)).logs||[]);
 const loadUsers=async()=>setUsers(await call('/api/admin/users',{},token));

 useEffect(()=>{if(token){loadDrivers();loadSettings();loadSett();loadUsers();loadIntegrations()}},[token]);
 function logout(){localStorage.removeItem('fleetpay_admin');setToken('')}

 const filtered=useMemo(()=>drivers.filter(d=>{const h=`${d.callsign} ${d.fullName} ${d.mobile} ${d.email} ${d.driverId}`.toLowerCase();if(!h.includes(q.toLowerCase()))return false;if(filter==='negative')return(d.currentBalance??0)<0;if(filter==='positive')return(d.currentBalance??0)>0;if(filter==='unmatched')return d.currentBalance==null;return true}).sort((a,b)=>String(a.callsign??'').localeCompare(String(b.callsign??''),'en-GB',{numeric:true})),[drivers,q,filter]);

 const settlementTotals=r=>(r?.items||[]).reduce((a,x)=>{const amount=Number(x.amount||0),fee=Number(x.weeklyFee||0);a.fees+=fee;if(x.action==='payout'){a.out+=amount;a.payouts++}else if(x.action==='payment_request'){a.in+=amount;a.requests++}else if(x.action==='carry_forward'){a.carried+=amount;a.carries++}return a},{out:0,in:0,fees:0,carried:0,payouts:0,requests:0,carries:0});

 const payoutRunItems=r=>sett.payouts.filter(x=>x.payoutRunId===r?.id).sort((a,b)=>String(a.callsign??'').localeCompare(String(b.callsign??''),'en-GB',{numeric:true}));

 if(!token)return <AdminLogin onLogin={setToken}/>;

 async function saveSettings(){try{setSettings(await call('/api/settings',{method:'PUT',body:JSON.stringify(settings)},token));alert('Settings saved')}catch(e){alert(e.message)}}

 async function runMonday(){if(!confirm('Confirm Autocab Rent Sheets are complete and run the Monday settlement now?'))return;try{const j=await call('/api/admin/settlements/monday',{method:'POST'},token);await loadSett();setView('runs');alert(`Settlement complete: ${j.items.filter(x=>x.action==='payout').length} payouts, ${j.items.filter(x=>x.action==='payment_request').length} payment requests.`)}catch(e){alert(e.message)}}

 async function setApproval(u,approved){await call(`/api/admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({approved})},token);loadUsers()}

 async function syncNow(){setLoading(true);try{await call('/api/admin/sync',{method:'POST'},token);await loadDrivers()}catch(e){alert(e.message)}finally{setLoading(false)}}

 async function reviewPayout(x,status){let reason='';if(status==='declined'){reason=prompt('Reason for declining this payout request:')||'';if(!reason.trim())return}try{await call(`/api/admin/payouts/${x.id}`,{method:'PATCH',body:JSON.stringify({status,reason})},token);await loadSett()}catch(e){alert(e.message)}}

 async function markPaymentReceived(x){if(!confirm(`Mark ${money(x.amount)} received from callsign ${x.callsign}?`))return;try{await call(`/api/admin/payment-requests/${x.id}`,{method:'PATCH',body:JSON.stringify({status:'paid'})},token);await loadSett()}catch(e){alert(e.message)}}

 async function createStripeLink(x){try{await call(`/api/admin/payment-requests/${x.id}/stripe`,{method:'POST'},token);await loadSett()}catch(e){alert(e.message)}}

 async function createPayoutRun(runType){const label=runType==='early'?'approved early payouts':'queued Monday payouts';if(!confirm(`Create one payment run containing all ${label}?`))return;try{const j=await call('/api/admin/payout-runs',{method:'POST',body:JSON.stringify({runType})},token);await loadSett();alert(`${runType==='early'?'Daily':'Monday'} payout run created: ${j.run.itemCount} drivers, ${money(j.run.totalAmount)}.`)}catch(e){alert(e.message)}}

 async function markPayoutRunPaid(r){if(!confirm(`Mark payout run ${r.id} paid? This will mark all ${r.itemCount} driver payments as paid.`))return;try{await call(`/api/admin/payout-runs/${r.id}`,{method:'PATCH',body:JSON.stringify({status:'paid'})},token);await loadSett()}catch(e){alert(e.message)}}

 async function testWise(){try{const j=await call('/api/admin/integrations/wise/test',{method:'POST'},token);alert(`Wise ${j.environment} connection successful.`);await loadIntegrations()}catch(e){alert(e.message)}}

 async function testAutocabAdjustment(){if(!testAdj.callsign||!Number(testAdj.amount))return alert('Enter a callsign and test amount');const side=testAdj.isCredit?'CREDIT (money received)':'DEBIT (money paid/fee)';if(!confirm(`LIVE AUTOCAB TEST: post ${money(Number(testAdj.amount))} ${side} to callsign ${testAdj.callsign}?`))return;try{await call('/api/admin/autocab/test-adjustment',{method:'POST',body:JSON.stringify({...testAdj,amount:Number(testAdj.amount)})},token);alert('Autocab adjustment sent successfully.');await loadIntegrations();await loadDrivers()}catch(e){alert(e.message)}}

 async function sendWiseSandbox(r){if(!confirm(`Submit ${r.itemCount} payouts (${money(r.totalAmount)}) to the FleetPay Wise Sandbox demo? No real money will move.`))return;try{const j=await call(`/api/admin/payout-runs/${r.id}/wise-sandbox`,{method:'POST'},token);alert(j.message);await loadSett();await loadIntegrations()}catch(e){alert(e.message)}}

 const nav=[['drivers',LayoutDashboard,'Drivers'],['runs',CalendarDays,'Monday Runs'],['payments',WalletCards,'Requests & Payouts'],['users',UserCheck,'Driver Accounts'],['logs',FileClock,'Audit Logs'],['settings',Settings,'Settings']];

 return <div className="shell"><aside className={`sidebar ${mobileNav?'open':''}`}><div className="sideTop"><Logo/><button className="mobileClose" onClick={()=>setMobileNav(false)}><X/></button></div><nav>{nav.map(([k,I,l])=><button key={k} className={view===k?'active':''} onClick={()=>{setView(k);setMobileNav(false);if(k==='payments'||k==='runs')loadSett();if(k==='logs')loadLogs();if(k==='users')loadUsers()}}><I/>{l}</button>)}</nav><div className="sideStatus"><span className="statusDot"/><div><b>FleetPay online</b><small>SQLite database enabled</small></div></div><button className="logoutBtn" onClick={logout}><LogOut/>Sign out</button></aside><main className="main"><header className="topbar"><button className="menuBtn" onClick={()=>setMobileNav(true)}><Menu/></button><div><span className="eyebrow">FLEETPAY CONTROL CENTRE</span><h1>{nav.find(x=>x[0]===view)?.[2]}</h1></div><div className="topActions">{view==='drivers'&&<button className="secondary" onClick={syncNow}><RefreshCw className={loading?'spin':''}/>Sync Autocab</button>}{view==='runs'&&<button className="primary" onClick={runMonday}><PlayCircle/>Run Monday Settlement</button>}</div></header><div className="content">{err&&<div className="inlineError"><AlertTriangle/>{err}</div>}

 {view==='drivers'&&<><div className="heroStrip"><div><span>LIVE AUTOCAB POSITION</span><h2>Driver balances at a glance</h2><p>Served from FleetPay's local cache. Autocab sync runs automatically in the background.</p></div><div className="heroBadge"><Database/>Last sync<br/><b>{meta.lastSync?dt(meta.lastSync):'Not synced'}</b></div></div><section className="statsGrid"><Stat icon={Users} label="Active drivers" value={meta.count??drivers.length} sub={`${meta.matched??0} account matches`}/><Stat icon={Banknote} label="Total owed out" value={money(drivers.reduce((s,d)=>s+Math.max(0,Number(d.currentBalance||0)),0))} sub="Positive driver balances"/><Stat icon={CreditCard} label="Total owed in" value={money(drivers.reduce((s,d)=>s+Math.max(0,-Number(d.currentBalance||0)),0))} sub="Negative driver balances"/><Stat icon={UserCheck} label="Unmatched" value={meta.unmatched??0} sub="Requires review"/></section><section className="panel"><div className="panelToolbar"><div className="search"><Search/><input placeholder="Search callsign, driver, phone or email" value={q} onChange={e=>setQ(e.target.value)}/></div><div className="segmented">{[['all','All'],['negative','Negative'],['positive','Positive'],['unmatched','Unmatched']].map(([k,l])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{l}</button>)}</div></div><div className="tableWrap"><table><thead><tr><th>Callsign</th><th>Driver</th><th>Contact</th><th>Previous</th><th>Current</th><th>Last processed</th><th/></tr></thead><tbody>{filtered.map(d=><tr key={d.driverId} onClick={()=>setSelected(d)}><td><span className="callsign">{d.callsign}</span></td><td><b>{d.fullName}</b><small>ID {d.driverId}</small></td><td><span>{d.mobile||'—'}</span><small>{d.email||'—'}</small></td><td>{money(d.previousBalance)}</td><td><b className={(d.currentBalance??0)<0?'neg':'pos'}>{money(d.currentBalance)}</b></td><td>{d.lastProcessed?dt(d.lastProcessed):'No match'}</td><td><ChevronRight/></td></tr>)}</tbody></table></div></section></>}

 {view==='runs'&&<><div className="notice"><ShieldCheck/><div><b>Controlled Monday settlement</b><p>Run only after Rent Sheets are complete in Autocab. FleetPay snapshots balances, applies the weekly fee, queues positive payouts and creates payment requests above your threshold.</p></div></div>{sett.runs[0]&&(()=>{const t=settlementTotals(sett.runs[0]);return <section className="statsGrid"><Stat icon={Banknote} label="Latest run · owed out" value={money(t.out)} sub={`${t.payouts} driver payouts`}/><Stat icon={CreditCard} label="Latest run · owed in" value={money(t.in)} sub={`${t.requests} payment requests`}/><Stat icon={BadgePoundSterling} label="FleetPay fees" value={money(t.fees)} sub="Weekly fees applied"/><Stat icon={CalendarDays} label="Carried forward" value={money(t.carried)} sub={`${t.carries} balances below threshold`}/></section>})()}<section className="statsGrid three"><Stat icon={BadgePoundSterling} label="Payment threshold" value={money(settings?.negativeThreshold)} sub="Minimum negative collection"/><Stat icon={Smartphone} label="Weekly app fee" value={money(settings?.weeklyAppFee)} sub="Applied each Monday"/><Stat icon={ArrowUpRight} label="Early payout fee" value={money(settings?.earlyPayoutFee)} sub="Per requested payout"/></section><section className="panel"><div className="panelHead"><div><h3>Monday settlement history</h3><p>Every run shows the exact financial totals calculated from the Autocab snapshot.</p></div><span>{sett.runs.length} runs</span></div><div className="tableWrap"><table><thead><tr><th>Date & time</th><th>Drivers</th><th>Owed out</th><th>Owed in</th><th>Fees</th><th>Carried</th><th>Status</th><th/></tr></thead><tbody>{sett.runs.map(r=>{const t=settlementTotals(r);return <tr key={r.id}><td>{dt(r.createdAt)}</td><td>{r.items.length}</td><td><b className="pos">{money(t.out)}</b><small>{t.payouts} payouts</small></td><td><b className="neg">{money(t.in)}</b><small>{t.requests} requests</small></td><td>{money(t.fees)}</td><td>{money(t.carried)}<small>{t.carries} drivers</small></td><td><Pill tone="good">Completed</Pill></td><td><button className="mini" onClick={()=>setSelectedRun({kind:'settlement',...r})}>View run</button></td></tr>})}</tbody></table></div></section></>}

 {view==='payments'&&(()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));const today=`${parts.year}-${parts.month}-${parts.day}`;const readyEarly=sett.earlyPayoutRequests.filter(x=>x.status==='approved'&&!x.payoutRunId&&(!x.eligibleRunDate||x.eligibleRunDate<=today));const readyWeekly=sett.payouts.filter(x=>x.type==='weekly'&&x.status==='queued'&&!x.payoutRunId);const earlyTotal=readyEarly.reduce((a,x)=>a+Number(x.netAmount||x.amount||0),0);const weeklyTotal=readyWeekly.reduce((a,x)=>a+Number(x.netAmount||x.amount||0),0);return <><section className="statsGrid three"><Stat icon={Send} label="Open payment requests" value={sett.paymentRequests.filter(x=>x.status==='open').length} sub="Drivers pay securely in the app"/><Stat icon={Banknote} label="Weekly payouts ready" value={money(weeklyTotal)} sub={`${readyWeekly.length} drivers ready to batch`}/><Stat icon={ArrowUpRight} label="Early payouts ready" value={money(earlyTotal)} sub={`${readyEarly.length} approved and due`}/></section><section className="runBuilderGrid"><div className="runBuilderCard"><div className="runBuilderIcon"><ArrowUpRight/></div><div><span>DAILY PAYMENT RUN</span><h3>Early payouts</h3><p>{readyEarly.length?`${readyEarly.length} approved payouts are due · ${money(earlyTotal)}`:'No approved early payouts are due for the current run.'}</p></div><button className="primary" disabled={!readyEarly.length} onClick={()=>createPayoutRun('early')}>Create daily run</button></div><div className="runBuilderCard"><div className="runBuilderIcon"><CalendarDays/></div><div><span>MONDAY PAYMENT RUN</span><h3>Weekly payouts</h3><p>{readyWeekly.length?`${readyWeekly.length} queued payouts · ${money(weeklyTotal)}`:'No weekly payouts are waiting to be batched.'}</p></div><button className="secondary" disabled={!readyWeekly.length} onClick={()=>createPayoutRun('weekly')}>Create Monday run</button></div></section><section className="panel"><div className="panelHead"><div><h3>Payment runs</h3><p>Each run is a locked batch with its own total, driver list, status and audit trail.</p></div><span>{sett.payoutRuns?.length||0} runs</span></div><div className="tableWrap"><table><thead><tr><th>Run</th><th>Created</th><th>Drivers</th><th>Total</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sett.payoutRuns?.map(r=><tr key={r.id}><td><b>{r.id}</b></td><td>{dt(r.createdAt)}</td><td>{r.itemCount}</td><td><b>{money(r.totalAmount)}</b></td><td>{r.runType==='early'?'Daily early payouts':'Monday weekly payouts'}</td><td><Pill tone={r.status==='paid'?'good':'warn'}>{r.status}</Pill>{r.paidAt&&<small>Paid {dt(r.paidAt)}</small>}</td><td><div className="actionRow"><button className="mini" onClick={()=>setSelectedRun({kind:'payout',...r})}>View</button><button className="mini" onClick={()=>fetch(`${API_BASE}/api/admin/payout-runs/${r.id}/csv`,{headers:{Authorization:`Bearer ${token}`}}).then(x=>x.blob()).then(b=>{const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`FleetPay-${r.runType}-${r.id}.csv`;a.click();URL.revokeObjectURL(u)})}>CSV</button>{r.status!=='paid'&&integrations?.wise?.configured&&integrations?.wise?.environment==='sandbox'&&r.status!=='submitted_sandbox'&&<button className="mini" onClick={()=>sendWiseSandbox(r)}>Wise Sandbox</button>}{r.status!=='paid'&&<button className="mini goodBtn" onClick={()=>markPayoutRunPaid(r)}>Mark paid</button>}</div></td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelHead"><div><h3>Early payout approvals</h3><p>Approve or decline requests. Approved requests automatically become eligible for the correct daily run.</p></div></div><div className="tableWrap"><table><thead><tr><th>Callsign</th><th>Driver</th><th>Requested</th><th>Fee</th><th>Driver receives</th><th>Requested</th><th>Run date</th><th>Status</th><th>Action</th></tr></thead><tbody>{sett.earlyPayoutRequests.filter(x=>['requested','approved','declined','batched','paid'].includes(x.status)).map(x=><tr key={x.id}><td><span className="callsign">{x.callsign}</span></td><td>{x.driverName}</td><td>{money(x.grossAmount)}</td><td>{money(x.fee)}</td><td><b>{money(x.netAmount)}</b></td><td>{dt(x.createdAt)}</td><td><b>{x.eligibleRunDate?new Date(`${x.eligibleRunDate}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}):'Next run'}</b>{x.submittedAfterCutoff?<small>After cutoff</small>:<small>Same-day eligible</small>}</td><td><Pill tone={x.status==='approved'||x.status==='batched'||x.status==='paid'?'good':x.status==='declined'?'warn':'neutral'}>{x.status}</Pill>{x.declineReason&&<small>{x.declineReason}</small>}{x.paidAt&&<small>Paid {dt(x.paidAt)}</small>}</td><td>{x.status==='requested'?<div className="actionRow"><button className="mini goodBtn" onClick={()=>reviewPayout(x,'approved')}>Approve</button><button className="mini dangerBtn" onClick={()=>reviewPayout(x,'declined')}>Decline</button></div>:null}</td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelHead"><div><h3>Payment activity</h3><p>Drivers complete Monday payment requests inside FleetPay. Manual receipt remains available as a fallback.</p></div><span>Timestamped</span></div><div className="tableWrap"><table><thead><tr><th>Type</th><th>Callsign</th><th>Driver</th><th>Amount</th><th>Created</th><th>Completed / updated</th><th>Status</th><th>Action</th></tr></thead><tbody>{[...sett.paymentRequests.map(x=>({...x,kind:'Payment request',recordType:'request'})),...sett.payouts.map(x=>({...x,kind:x.type==='early'?'Early payout':'Weekly payout',recordType:'payout'}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,150).map(x=><tr key={x.id}><td>{x.kind}</td><td><span className="callsign">{x.callsign}</span></td><td>{x.driverName}</td><td>{money(x.amount??x.netAmount)}</td><td>{dt(x.createdAt)}</td><td>{x.paidAt?dt(x.paidAt):x.updatedAt?dt(x.updatedAt):'—'}</td><td><Pill tone={['paid','completed','approved','batched'].includes(x.status)?'good':x.status==='open'?'warn':'neutral'}>{x.status}</Pill></td><td>{x.recordType==='request'&&x.status==='open'?<div className="actionRow"><span className="driverPaysTag">Driver pays in app</span><button className="mini" onClick={()=>markPaymentReceived(x)}>Mark received</button></div>:null}</td></tr>)}</tbody></table></div></section></>})()}

 {view==='users'&&<section className="panel"><div className="panelHead"><div><h3>Driver app accounts</h3><p>Registration is tied to the email and mobile held in Autocab.</p></div><span>{users.length} accounts</span></div><div className="tableWrap"><table><thead><tr><th>Callsign</th><th>Email</th><th>Created</th><th>Last login</th><th>Status</th><th/></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><span className="callsign">{u.callsign}</span></td><td>{u.email}</td><td>{dt(u.createdAt)}</td><td>{dt(u.lastLoginAt)}</td><td><Pill tone={u.approved?'good':'warn'}>{u.approved?'Approved':'Pending'}</Pill></td><td><button className="tinyBtn" onClick={()=>setApproval(u,!u.approved)}>{u.approved?'Suspend':'Approve'}</button></td></tr>)}</tbody></table></div></section>}

 {view==='logs'&&<section className="panel"><div className="panelHead"><div><h3>Full audit trail</h3><p>Authentication, settings, settlements, payouts and account changes.</p></div><button className="secondary" onClick={loadLogs}><RefreshCw/>Refresh</button></div><div className="logList">{logs.map(l=><div className="logItem" key={l.id}><div className="logIcon"><Activity/></div><div><b>{l.action.replaceAll('_',' ')}</b><span>{l.actorType==='driver'?'Callsign':'Actor'} {l.actorId||'system'} · {dt(l.createdAt)}</span><small>{l.entityType?`${l.entityType} ${l.entityId||''}`:''}</small></div></div>)}</div></section>}

 {view==='settings'&&settings&&<div className="settingsGrid"><section className="panel settingsCard"><div className="panelHead"><div><h3>Settlement rules</h3><p>Controls used in Monday and early payout processing.</p></div></div><label>Negative payment threshold<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.negativeThreshold} onChange={e=>setSettings({...settings,negativeThreshold:e.target.value})}/></div></label><label>Weekly FleetPay fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.weeklyAppFee} onChange={e=>setSettings({...settings,weeklyAppFee:e.target.value})}/></div></label><label>Early payout fee<div className="moneyField"><span>£</span><input type="number" step="0.01" value={settings.earlyPayoutFee} onChange={e=>setSettings({...settings,earlyPayoutFee:e.target.value})}/></div></label><label>Daily early payout cutoff time<input type="time" value={settings.earlyPayoutCutoffTime||`${String(settings.earlyPayoutCutoffHour??11).padStart(2,'0')}:00`} onChange={e=>setSettings({...settings,earlyPayoutCutoffTime:e.target.value})}/><small>Requests before this time are eligible for today's run. Later requests are accepted and automatically queued for the next business-day payment run.</small></label><label>Autocab sync interval (minutes)<input type="number" min="2" max="60" value={settings.syncMinutes} onChange={e=>setSettings({...settings,syncMinutes:e.target.value})}/><small>FleetPay caches balances locally so the driver app loads instantly.</small></label><label className="toggleRow"><input type="checkbox" checked={settings.requireAdminApproval} onChange={e=>setSettings({...settings,requireAdminApproval:e.target.checked})}/><span><b>Require admin approval</b><small>Verified drivers must be approved before first sign-in.</small></span></label><button className="primary" onClick={saveSettings}>Save settings</button></section><section className="panel settingsCard"><div className="panelHead"><div><h3>Integrations & demo mode</h3><p>Verify Stripe, Wise sandbox, Autocab writes and driver push notifications.</p></div></div>{integrations&&<><div className="integrationLine"><div><b>Stripe</b><span>{integrations.stripe.configured?(integrations.stripe.testMode?'Test mode configured':'Live key configured'):'Not configured'}</span></div><Pill tone={integrations.stripe.configured?'good':'warn'}>{integrations.stripe.configured?'Ready':'Setup'}</Pill></div><div className="integrationLine"><div><b>Wise</b><span>{integrations.wise.configured?`${integrations.wise.environment} configured`:'Not configured'}</span></div><button className="mini" onClick={testWise}>Test Wise</button></div><div className="integrationLine"><div><b>Push notifications</b><span>{integrations.push.configured?'VAPID configured':'Generate VAPID keys first'}</span></div><Pill tone={integrations.push.configured?'good':'warn'}>{integrations.push.configured?'Ready':'Setup'}</Pill></div><div className="integrationLine"><div><b>Autocab account writes</b><span>{integrations.autocab.adjustmentsEnabled?'Automatic adjustments enabled':'Automatic writes disabled'}</span></div><Pill tone={integrations.autocab.adjustmentsEnabled?'good':'warn'}>{integrations.autocab.adjustmentsEnabled?'Enabled':'Safe mode'}</Pill></div></>}<div className="testBox"><b>Autocab test adjustment</b><small>This makes a real account adjustment using the configured Autocab API. Start with £0.01 on a test callsign.</small><div className="testGrid"><label>Callsign<input value={testAdj.callsign} onChange={e=>setTestAdj({...testAdj,callsign:e.target.value})}/></label><label>Amount<div className="moneyField"><span>£</span><input type="number" step="0.01" value={testAdj.amount} onChange={e=>setTestAdj({...testAdj,amount:e.target.value})}/></div></label></div><label>Adjustment type<select value={testAdj.isCredit?'credit':'debit'} onChange={e=>setTestAdj({...testAdj,isCredit:e.target.value==='credit'})}><option value="credit">Credit — payment received from driver</option><option value="debit">Debit — payout/fee charged</option></select></label><button className="secondary" onClick={testAutocabAdjustment}>Send test adjustment</button></div><div className="testCard"><b>Stripe demo card</b><span>4242 4242 4242 4242 · any future expiry · any CVC</span></div>{adjLogs.length>0&&<div className="miniLog"><b>Recent Autocab adjustments</b>{adjLogs.slice(0,6).map(a=><div key={a.id}><span>Callsign {a.callsign} · {a.isCredit?'Credit':'Debit'} {money(a.amount)} · {dt(a.createdAt)}</span><Pill tone={a.status==='completed'?'good':'warn'}>{a.status}</Pill></div>)}</div>}</section><section className="panel settingsCard"><div className="panelHead"><div><h3>Security & data</h3><p>Production-readiness checks.</p></div></div><div className="checkLine"><CheckCircle2/><div><b>SQLite persistent database</b><span>Users, runs, requests and logs survive restarts.</span></div></div><div className="checkLine"><CheckCircle2/><div><b>Server-side Autocab credentials</b><span>No subscription key is exposed to the browser.</span></div></div><div className="checkLine"><CheckCircle2/><div><b>Password reset</b><span>Drivers can recover access using their registered email.</span></div></div><div className="checkLine"><CheckCircle2/><div><b>Audit logging</b><span>Critical actions are timestamped and attributed.</span></div></div></section></div>}

 </div></main>

 {selected&&<div className="drawerBack" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="drawerClose" onClick={()=>setSelected(null)}><X/></button><div className="driverIdentity"><div className="avatar">{selected.forename?.[0]}{selected.surname?.[0]}</div><div><span>CALLSIGN {selected.callsign}</span><h2>{selected.fullName}</h2><p>Autocab Driver ID {selected.driverId}</p></div></div><div className={`balanceHero ${(selected.currentBalance??0)<0?'red':''}`}><span>Current balance</span><strong>{money(selected.currentBalance)}</strong><small>Previous {money(selected.previousBalance)}</small></div><div className="infoGrid"><div><Phone/><span>Mobile</span><b>{selected.mobile||'Not stored'}</b></div><div><Mail/><span>Email</span><b>{selected.email||'Not stored'}</b></div><div><Clock3/><span>Last processed</span><b>{dt(selected.lastProcessed)}</b></div><div><Hash/><span>Processed by</span><b>{selected.lastProcessedBy||'—'}</b></div></div>{selected.totals&&<div className="breakdown"><h3>Account breakdown</h3>{[['All jobs',selected.totals.allJobsTotal],['Cash jobs',selected.totals.cashJobsTotal],['Account jobs',selected.totals.accountJobsTotal],['Card jobs',selected.totals.cardJobsTotal],['Driver transactions',selected.totals.driverTransactionsTotal],['Pending transactions',selected.totals.pendingTransactionsTotal]].map(([l,v])=><div key={l}><span>{l}</span><b>{money(v)}</b></div>)}</div>}</aside></div>}

 {selectedRun&&<div className="drawerBack" onClick={()=>setSelectedRun(null)}><aside className="drawer runDrawer" onClick={e=>e.stopPropagation()}><button className="drawerClose" onClick={()=>setSelectedRun(null)}><X/></button>{selectedRun.kind==='settlement'?(()=>{const t=settlementTotals(selectedRun);return <><div className="driverIdentity"><div className="avatar"><CalendarDays/></div><div><span>MONDAY SETTLEMENT</span><h2>{dt(selectedRun.createdAt)}</h2><p>Run {selectedRun.id}</p></div></div><div className="runSummaryGrid"><div><span>Owed out</span><b className="pos">{money(t.out)}</b></div><div><span>Owed in</span><b className="neg">{money(t.in)}</b></div><div><span>FleetPay fees</span><b>{money(t.fees)}</b></div><div><span>Carried forward</span><b>{money(t.carried)}</b></div></div><h3>Drivers in this settlement</h3><div className="runItemList">{selectedRun.items.filter(x=>x.action!=='none').sort((a,b)=>String(a.callsign??'').localeCompare(String(b.callsign??''),'en-GB',{numeric:true})).map(x=><div className="runItem" key={`${x.driverId}-${x.action}`}><div><span className="callsign">{x.callsign}</span><b>{x.driverName}</b><small>{x.action==='payout'?'Payout':x.action==='payment_request'?'Payment request':'Carried forward'} · Fee {money(x.weeklyFee)}</small></div><strong className={x.action==='payout'?'pos':x.action==='payment_request'?'neg':''}>{money(x.amount)}</strong></div>)}</div></>}):(()=>{const items=payoutRunItems(selectedRun);return <><div className="driverIdentity"><div className="avatar"><Send/></div><div><span>{selectedRun.runType==='early'?'DAILY EARLY PAYOUT RUN':'MONDAY PAYOUT RUN'}</span><h2>{money(selectedRun.totalAmount)}</h2><p>{dt(selectedRun.createdAt)} · {selectedRun.itemCount} drivers</p></div></div><div className="runSummaryGrid"><div><span>Total payout</span><b className="pos">{money(selectedRun.totalAmount)}</b></div><div><span>Drivers</span><b>{selectedRun.itemCount}</b></div><div><span>Status</span><b>{selectedRun.status}</b></div><div><span>Provider</span><b>{selectedRun.provider||'manual'}</b></div></div>{selectedRun.paidAt&&<div className="notice"><CheckCircle2/><div><b>Paid</b><p>{dt(selectedRun.paidAt)}</p></div></div>}<h3>Payments in this run</h3><div className="runItemList">{items.map(x=><div className="runItem" key={x.id}><div><span className="callsign">{x.callsign}</span><b>{x.driverName}</b><small>{x.type==='early'?'Early payout':'Weekly payout'} · {x.status}</small></div><strong>{money(x.netAmount??x.amount)}</strong></div>)}</div></>})()}</aside></div>}

 </div>
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

 const api=(u,o={})=>call(u,o,token);

 useEffect(()=>{
  if(!Capacitor.isNativePlatform()) return;

  let listener;

  App.addListener('appUrlOpen',({url})=>{
    try{
      const parsed=new URL(url);
      const payment =
        parsed.hostname==='payment'
          ? parsed.pathname.replace('/','')
          : parsed.searchParams.get('payment');

      if(payment==='success'){
        setPaymentBusy(false);
        setNotice('Payment received successfully.');
        setTimeout(load,500);
      }

      if(payment==='cancelled'){
        setPaymentBusy(false);
        setNotice('Payment cancelled. Your amount due is still available to pay.');
        setTimeout(load,500);
      }
    }catch{}
  }).then(handle=>{
    listener=handle;
  });

  return()=>{
    listener?.remove();
  };
},[token]);

useEffect(()=>{
  if(!token) return;

  let appListener;

  const refresh=()=>{
    load();
  };

  if(Capacitor.isNativePlatform()){
    App.addListener('appStateChange',({isActive})=>{
      if(isActive){
        refresh();
      }
    }).then(handle=>{
      appListener=handle;
    });
  }

  const onVisibility=()=>{
    if(document.visibilityState==='visible'){
      refresh();
    }
  };

  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',onVisibility);

  return()=>{
    appListener?.remove();
    window.removeEventListener('focus',refresh);
    document.removeEventListener('visibilitychange',onVisibility);
  };
},[token]);

useEffect(()=>{
  if(!token || !me?.customerPayments?.some(x=>x.status==='open')) return;

  const timer=setInterval(()=>{
    load();
  },3000);

  return()=>clearInterval(timer);
},[token,me?.customerPayments]);

 async function load(){if(!token)return;try{setMe(await api('/api/driver/me'))}catch{localStorage.removeItem('fleetpay_driver');setToken('');setMe(null)}}

 async function checkPush(){if(!token||!('serviceWorker'in navigator)||!('PushManager'in window)){setPushAvailable(false);return}try{const cfg=await api('/api/driver/push-config');setPushAvailable(Boolean(cfg.enabled));if(!cfg.enabled)return;const reg=await navigator.serviceWorker.register('/fleetpay-sw.js');const sub=await reg.pushManager.getSubscription();setPushReady(Boolean(sub)&&Notification.permission==='granted')}catch{setPushAvailable(false)}}

useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const payment=params.get('payment');

  // Stripe has returned into Safari/Chrome.
  // Hand the result back to the installed FleetPay app.
  if(!Capacitor.isNativePlatform() && (payment==='success' || payment==='cancelled')){
    window.location.href=`fleetpay://payment/${payment}`;
    return;
  }

  if(token){
    load();
    checkPush();

    if(payment==='success'){
      setPaymentBusy(false);
      setNotice('Payment received successfully.');
      window.history.replaceState({},'',window.location.pathname);
      setTimeout(load,900);
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
  setErr('');
  setNotice('');

  const amount=Number(customerFare);

  if(!Number.isFinite(amount) || amount<=0){
    setErr('Enter a valid fare amount.');
    return;
  }

  setCustomerPaymentBusy(true);

  try{
    const j=await api('/api/driver/customer-payment',{
      method:'POST',
      body:JSON.stringify({
        amount,
        bookingId:customerBooking.trim()
      })
    });

    setCustomerPayment(j);

  }catch(e){
    setErr(e.message);
  }finally{
    setCustomerPaymentBusy(false);
  }
}

 function logout(){
  localStorage.removeItem('fleetpay_driver');
  setToken('');
  setMe(null);
  setErr('');
  setNotice('');
  setAmt('');
  setMode('login');
  setStep(1);
  setChallenge('');
  setDev('');
  setPushReady(false);
  setPushAvailable(false);
  setPaymentBusy(false);
  setF({callsign:'',email:'',mobileLast4:'',code:'',password:''});
 }

 if(!token)return <div className="driverAuthPage"><div className="driverAuthCard"><Logo/><div className="driverWelcome"><span>DRIVER APP</span><h1>{mode==='forgot'?'Reset your password':mode==='register'?'Create your FleetPay account':'Welcome back'}</h1><p>{mode==='login'?'Your balance, payments and payout requests in one place.':'Secure access is matched against your active Autocab driver record.'}</p></div>{err&&<div className={`inlineError ${err.startsWith('Password reset')?'success':''}`}>{err}</div>}{mode==='login'&&<form onSubmit={login}><label>Email<input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label><label>Password<input type="password" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></label><button className="textBtn" type="button" onClick={()=>{setMode('forgot');setStep(1);setErr('')}}>Forgot password?</button><button className="primary full">Sign in <ArrowRight/></button><button className="outline full" type="button" onClick={()=>{setMode('register');setStep(1);setErr('')}}>Create driver account</button></form>}{mode==='register'&&(step===1?<form onSubmit={startRegister}><div className="secureBanner"><ShieldCheck/><span>We verify your callsign, Autocab email and last 4 mobile digits.</span></div><label>Callsign<input required value={f.callsign} onChange={e=>setF({...f,callsign:e.target.value})}/></label><label>Email stored in Autocab<input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label><label>Last 4 digits of mobile<input inputMode="numeric" maxLength="4" required value={f.mobileLast4} onChange={e=>setF({...f,mobileLast4:e.target.value.replace(/\D/g,'')})}/></label><button className="primary full">Verify my details</button><button className="textBtn" type="button" onClick={()=>setMode('login')}>Back to sign in</button></form>:<form onSubmit={finishRegister}><label>6-digit verification code<input inputMode="numeric" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'')})}/></label>{dev&&<div className="devCode">Development code: <b>{dev}</b></div>}<label>Create password<input type="password" minLength="8" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></label><button className="primary full">Create secure account</button></form>)}{mode==='forgot'&&(step===1?<form onSubmit={startReset}><div className="secureBanner"><KeyRound/><span>Enter the email used for your FleetPay driver account.</span></div><label>Email<input type="email" required value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label><button className="primary full">Send reset code</button><button className="textBtn" type="button" onClick={()=>setMode('login')}>Back to sign in</button></form>:<form onSubmit={finishReset}><label>Reset code<input inputMode="numeric" maxLength="6" required value={f.code} onChange={e=>setF({...f,code:e.target.value.replace(/\D/g,'')})}/></label>{dev&&<div className="devCode">Development code: <b>{dev}</b></div>}<label>New password<input type="password" minLength="8" required value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></label><button className="primary full">Set new password</button></form>)}</div></div>;

 if(!me)return <div className="driverAuthPage"><div className="driverAuthCard"><Logo/><p>Loading your FleetPay account…</p></div></div>;

 const d=me.driver,totalDue=(me.paymentRequests||[]).reduce((sum,x)=>sum+Number(x.amount||0),0);

 return <div className="driverApp"><header className="driverHeader"><Logo/><button type="button" className="driverSignOut" onClick={logout}><LogOut/><span>Sign out</span></button></header><main><div className="driverHello"><span>CALLSIGN {d.callsign}</span><h1>Hi {d.fullName.split(' ')[0]}</h1><p>Your FleetPay account</p></div>{notice&&<div className="driverNotice"><CheckCircle2/><span>{notice}</span></div>}<section className={`mobileBalance ${(d.currentBalance??0)<0?'negative':''}`}><span>Current FleetPay balance</span><strong>{money(d.currentBalance)}</strong><small>Autocab processed {dt(d.lastProcessed)} · FleetPay synced {dt(d.syncedAt)}</small>{(d.currentBalance??0)>0&&<div className="balanceFoot"><div><span>Available now</span><b>{money(me.availableForEarlyPayout)}</b></div>{me.reservedForEarlyPayout>0&&<div><span>Reserved for payout</span><b>{money(me.reservedForEarlyPayout)}</b></div>}</div>}</section>{pushAvailable&&!pushReady&&<section className="driverCard compactCard"><div className="cardTop"><div><span className="eyebrow">OPTIONAL</span><h2>Payment alerts</h2></div><Smartphone/></div><p>Get an alert when a payment is due, a payout is approved or money is sent.</p><button className="outline full" onClick={enablePush}>Enable notifications</button></section>}{me.paymentRequests?.length>0&&<section className="driverCard paymentDueCard"><div className="paymentDueHeader"><div><span className="eyebrow">MONDAY SETTLEMENT</span><h2>Payment due</h2></div><Pill tone="warn">Action needed</Pill></div><div className="dueAmount">{money(totalDue)}</div><p>Pay securely from FleetPay. Each payment is matched automatically to callsign {d.callsign} and recorded when Stripe confirms it.</p>{me.paymentRequests.map((r,i)=><div className="dueRequestRow" key={r.id}><div><b>{money(r.amount)}</b><span>{dt(r.createdAt)}{me.paymentRequests.length>1?` · Request ${i+1}`:''}</span></div><button className="mini goodBtn" disabled={paymentBusy||!me.stripeConfigured} onClick={()=>payRequest(r)}>{paymentBusy?'Opening…':'Pay now'}</button></div>)}{!me.stripeConfigured&&<small className="paymentUnavailable">Card payment is not configured. Please contact the office.</small>}</section>}
{me.customerPayments?.length>0&&
<section className="driverCard">
  <div className="cardTop">
    <div>
      <span className="eyebrow">CUSTOMER PAYMENTS</span>
      <h2>Payment history</h2>
    </div>
    <CreditCard/>
  </div>

  {me.customerPayments.slice(0,10).map(x=>
    <div className="historyRow" key={x.id}>
      <div>
        <b>{money(x.fareAmount)} fare</b>
        <span>
          {x.bookingId?`Booking ${x.bookingId} · `:''}
          Fee {money(x.feeAmount)} ·
          Total {money(x.totalAmount)} ·
          {dt(x.createdAt)}
        </span>

        {x.status==='open'&&x.paymentUrl&&
          <div className="actionRow" style={{marginTop:'8px'}}>
            <button
              className="mini"
              type="button"
              onClick={()=>window.open(x.paymentUrl,'_blank')}
            >
              Open
            </button>

            <button
              className="mini"
              type="button"
              onClick={async()=>{
                try{
                  if(navigator.share){
                    await navigator.share({
                      title:'FleetPay payment',
                      text:`Taxi fare ${money(x.fareAmount)} · Total ${money(x.totalAmount)}`,
                      url:x.paymentUrl
                    });
                  }else{
                    await navigator.clipboard.writeText(x.paymentUrl);
                    setNotice('Payment link copied.');
                  }
                }catch{}
              }}
            >
              Share
            </button>
          </div>
        }
      </div>

      <Pill tone={x.status==='paid'?'good':'warn'}>
        {x.status}
      </Pill>
    </div>
  )}
</section>
}

<section className="driverCard">
  <div className="cardTop">
    <div>
      <span className="eyebrow">CUSTOMER PAYMENT</span>
      <h2>Take a payment</h2>
    </div>
    <CreditCard/>
  </div>

  <p>
    Enter the taxi fare and optional booking ID. FleetPay adds the configured
    service fee and creates a secure Stripe payment link for the customer.
  </p>

  <label>
    Fare amount
    <div className="moneyInput">
      <span>£</span>
      <input
        type="number"
        step="0.01"
        min="0.01"
        placeholder="0.00"
        value={customerFare}
        onChange={e=>{
          setCustomerFare(e.target.value);
          setCustomerPayment(null);
        }}
      />
    </div>
  </label>

  <label>
    Booking ID
    <input
      type="text"
      placeholder="Optional"
      value={customerBooking}
      onChange={e=>{
        setCustomerBooking(e.target.value);
        setCustomerPayment(null);
      }}
    />
  </label>

  {customerFare && Number(customerFare)>0 && (
    <div className="netPreview">
      <div>
        <span>Taxi fare</span>
        <b>{money(Number(customerFare))}</b>
      </div>

      <div>
        <span>FleetPay service fee</span>
        <b>
          {money(
            me.settings.customerPaymentFeeType==='percentage'
              ? Number(customerFare) *
                (Number(me.settings.customerPaymentFeeValue||0)/100)
              : Number(me.settings.customerPaymentFeeValue||0)
          )}
        </b>
      </div>

      <div>
        <span>Customer pays</span>
        <b>
          {money(
            Number(customerFare) +
            (
              me.settings.customerPaymentFeeType==='percentage'
                ? Number(customerFare) *
                  (Number(me.settings.customerPaymentFeeValue||0)/100)
                : Number(me.settings.customerPaymentFeeValue||0)
            )
          )}
        </b>
      </div>
    </div>
  )}

  {!customerPayment && (
    <button
      className="primary full"
      disabled={
        customerPaymentBusy ||
        !me.stripeConfigured ||
        !(Number(customerFare)>0)
      }
      onClick={createCustomerPayment}
    >
      {customerPaymentBusy ? 'Creating payment…' : 'Create customer payment'}
    </button>
  )}

  {customerPayment && (
    <div className="noticeItem success">
      <b>Payment ready</b>

      <p>
        Fare {money(customerPayment.fareAmount)}
        {' · '}
        FleetPay fee {money(customerPayment.feeAmount)}
        {' · '}
        Customer pays {money(customerPayment.totalAmount)}
      </p>

      {customerPayment.bookingId && (
        <small>Booking {customerPayment.bookingId}</small>
      )}
      <div style={{
  display:'flex',
  flexDirection:'column',
  alignItems:'center',
  gap:'12px',
  padding:'16px',
  marginTop:'12px',
  marginBottom:'12px',
  background:'#fff',
  borderRadius:'14px'
}}>
  <QRCodeSVG
    value={customerPayment.paymentUrl}
    size={220}
    level="M"
    includeMargin
  />

  <div style={{textAlign:'center'}}>
    <b>Scan to pay</b>
    <p style={{margin:'4px 0 0'}}>
      Customer pays {money(customerPayment.totalAmount)}
    </p>
  </div>
</div>

      <button
        className="primary full"
        type="button"
        onClick={()=>window.open(customerPayment.paymentUrl,'_blank')}
      >
        Open payment link
      </button>
      <button
  className="outline full"
  type="button"
  onClick={async()=>{
    try{
      if(navigator.share){
        await navigator.share({
          title:'FleetPay payment',
          text:`Taxi fare ${money(customerPayment.fareAmount)} · Total ${money(customerPayment.totalAmount)}`,
          url:customerPayment.paymentUrl
        });
      }else{
        await navigator.clipboard.writeText(customerPayment.paymentUrl);
        setNotice('Payment link copied.');
      }
    }catch{}
  }}
>
  Share payment link
</button>
    </div>
  )}

  {!me.stripeConfigured && (
    <small className="paymentUnavailable">
      Customer card payments are not configured.
    </small>
  )}
</section>

{me.notifications?.length>0&&<section className="driverCard"><div className="cardTop"><h2>Updates</h2><Activity/></div>{me.notifications.slice(0,3).map(n=><div className={`noticeItem ${n.type}`} key={n.id}><b>{n.title}</b><p>{n.message}</p><small>{dt(n.createdAt)}</small></div>)}</section>}<section className="driverCard"><div className="cardTop"><div><span className="eyebrow">EARLY PAYOUT</span><h2>Request a payout</h2></div><div className="iconBubble"><ArrowUpRight/></div></div><p>Request from your positive FleetPay balance Tuesday to Friday. Requests after {me.settings.earlyPayoutCutoffTime} are accepted and automatically move to the next business-day payment run.</p><div className="availableRow"><span>Available to request</span><strong>{money(me.availableForEarlyPayout)}</strong></div>{me.reservedForEarlyPayout>0&&<div className="reservedLine"><span>Already reserved in pending payouts</span><b>{money(me.reservedForEarlyPayout)}</b></div>}{me.earlyPayoutAllowed&&<div className={`cutoffNotice ${me.earlyPayoutTiming?.afterCutoff?'afterCutoff':''}`}><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>}{me.earlyPayoutAllowed&&me.availableForEarlyPayout>me.settings.earlyPayoutFee?<><div className="moneyInput"><span>£</span><input type="number" step="0.01" placeholder="0.00" value={amt} onChange={e=>setAmt(e.target.value)}/></div>{amt&&Number(amt)>0&&<div className="netPreview"><span>You receive after {money(me.settings.earlyPayoutFee)} fee</span><b>{money(Math.max(0,Number(amt)-me.settings.earlyPayoutFee))}</b></div>}<button className="primary full" onClick={payout}>Request payout</button></>:!me.earlyPayoutAllowed?<div className="closed"><Clock3/><span>{me.earlyPayoutWindowMessage}</span></div>:null}{err&&<div className="inlineError"><AlertTriangle/>{err}</div>}</section><section className="driverCard"><div className="cardTop"><div><span className="eyebrow">ACCOUNT ACTIVITY</span><h2>Payments & fees</h2></div><Activity/></div>{me.ledger?.length===0?<div className="emptyState">No account activity recorded yet.</div>:me.ledger?.slice(0,10).map(x=><div className="historyRow" key={x.id}><div><b>{x.description}</b><span>{dt(x.createdAt)}{x.feeAmount>0?` · Fee ${money(x.feeAmount)}`:''}</span></div><div className={x.direction==='credit'?'pos':'neg'}><b>{x.direction==='credit'?'+':'-'}{money(x.amount)}</b><small>{x.status}</small></div></div>)}</section>{me.earlyPayoutRequests.length>0&&<section className="driverCard"><div className="cardTop"><div><span className="eyebrow">REQUEST HISTORY</span><h2>Early payouts</h2></div><ArrowUpRight/></div>{me.earlyPayoutRequests.slice(0,6).map(x=><div className="historyRow" key={x.id}><div><b>{money(x.netAmount)}</b><span>{dt(x.createdAt)}{x.eligibleRunDate?` · Run ${new Date(`${x.eligibleRunDate}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}`:''}{x.declineReason?` · ${x.declineReason}`:''}</span></div><Pill tone={x.status==='approved'||x.status==='paid'?'good':x.status==='declined'?'warn':'neutral'}>{x.status}</Pill></div>)}</section>}<div className="driverFooter">Weekly FleetPay fee {money(me.settings.weeklyAppFee)} · Early payout fee {money(me.settings.earlyPayoutFee)}</div></main></div>
}

const isNativeApp = Capacitor.isNativePlatform();
const isDriver = isNativeApp || window.location.pathname.startsWith('/driver');

createRoot(document.getElementById('root')).render(
  isDriver ? <DriverApp /> : <AdminApp />
);