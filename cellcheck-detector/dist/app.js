import {QUESTIONS,STATUS,checkGate,expectedValues,validateProfile,assess,resolveStatus,validateInventory} from './engine.js';
import {SEED,loadLocal,saveLocal,connectInventory,sendTest} from './inventory.js';
import {ArduinoSerial,liveReady} from './serial.js';

const $=(q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>[...root.querySelectorAll(q)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={pulse:'M2 12h4l3-8 5 16 3-8h5',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',history:'M3 4v5h5 M3 9a9 9 0 1 1 0 6 M12 7v5l3 2',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',book:'M12 5v16 M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-2-1-6-2-10 1Z',bolt:'m13 2-9 12h7l-1 8 10-13h-7z',usb:'M12 3v15m0-15-3 3m3-3 3 3M12 15l-6-4V8m6 4 6-4V5 M4 6h4v2H4z M16 3h4v2h-4z M12 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4',box:'m12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M8 5l9 5',thermometer:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0 M12 9v9 M12 18h.01',wind:'M2 8h12a3 3 0 1 0-3-3 M2 12h17a3 3 0 1 1-3 3 M2 16h7a3 3 0 1 1-3 3',impact:'m13 2-2 6 7-1-4 6 7 3-8 2-2 5-3-7-7-1 6-4-2-6z',shield:'M12 3 3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 12l3 3 5-6',arrow:'M5 12h14 M14 7l5 5-5 5',check:'m5 12 4 4L19 6',play:'m8 4 12 8-12 8z',stop:'M6 6h12v12H6z',download:'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5 M4 16v5h16v-5',plus:'M12 5v14 M5 12h14',refresh:'M21 3v6h-6 M3 21v-6h6 M3 9a9 9 0 0 1 15-6l3 6 M21 15a9 9 0 0 1-15 6l-3-6',info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',database:'M21 5c0 2-4 4-9 4S3 7 3 5s4-3 9-3 9 1 9 3Z M3 5v7c0 2 4 4 9 4s9-2 9-4V5 M3 12v7c0 2 4 3 9 3s9-1 9-3v-7',clock:'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.info}"/></svg>`;}
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let data,storageError='';
try{data=loadLocal(localStorage);}catch(e){data={batteries:structuredClone(SEED),tests:[]};storageError=`Browser storage could not be read: ${e.message} Changes will stay in memory until you export them.`;}
const state={view:'bench',batteryId:data.batteries[0].id,profile:{...data.batteries[0].profile},answers:{},mode:'arduino',profileConfirmed:false,scenario:'normal',samples:[],result:null,record:null,recording:false,elapsed:0,chart:'voltage',frame:null,serialConnected:false,serialBusy:false,serialError:'',lastSeq:null,lastDeviceMs:null,baseMs:0,basePerf:0,timer:null,api:null,syncing:false};
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function persist(){if(storageError){toast('Browser storage is unavailable. Use Export to keep a copy.');return false;}try{saveLocal(localStorage,data);return true;}catch(e){storageError='Browser storage is unavailable or full. Export your records before closing this page.';toast(storageError);return false;}}
function battery(){return data.batteries.find(b=>b.id===state.batteryId)||data.batteries[0];}
function pill(status){const s=STATUS[status]||STATUS.needs_testing;return `<span class="pill ${s.tone}"><i class="status-dot"></i>${escape(s.label)}</span>`;}
function date(value){const d=new Date(value);return Number.isNaN(d.valueOf())?'Unknown time':d.toLocaleString('en-AU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function fmt(n,dp=2){return Number.isFinite(n)?n.toFixed(dp):'—';}
function resetSession(){state.answers={};state.samples=[];state.result=null;state.record=null;state.elapsed=0;state.profileConfirmed=false;}
function selectBattery(id){if(state.recording)return;state.batteryId=id;state.profile={...battery().profile};resetSession();render();}
function header(title,subtitle,actions=''){return `<div class="page-heading"><div><div class="eyebrow">BATTERY SCREENING WORKSPACE</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;}
function render(){
  $('#nav-count').textContent=data.batteries.length;
  $$('.nav-item[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
  $('#crumb').textContent=({bench:'Test bench',inventory:'Battery inventory',history:'Test history'})[state.view];
  $('#main').innerHTML=(storageError?`<div class="inline-alert">${escape(storageError)}</div>`:'')+(state.view==='bench'?benchHTML():state.view==='inventory'?inventoryHTML():historyHTML());
  bindView();updateConnection();if(state.view==='bench')updateTelemetry();
}
function benchHTML(){
  const b=battery(),p=state.profile,exp=expectedValues(p),gate=checkGate(state.answers,b.status);
  return header('Test bench','Inspect first. Measure next. Keep every decision traceable.',`<button class="button" id="new-session" ${state.recording?'disabled':''}>${icon('plus')}New session</button>`)+`
  <div class="source-bar"><div class="source-left"><div class="source-icon">${icon(state.mode==='arduino'?'usb':'pulse')}</div><div class="source-text" id="source-status">${state.mode==='arduino'?'Arduino data source':'Simulation mode'}<small>${state.mode==='arduino'?'USB serial · actual voltage, current and load':'Generated readings · no physical battery connected'}</small></div></div><div class="source-controls"><div class="mode-toggle" role="group" aria-label="Data source"><button data-mode="arduino" class="${state.mode==='arduino'?'active':''}" ${state.recording?'disabled':''}>Arduino</button><button data-mode="simulation" class="${state.mode==='simulation'?'active':''}" ${state.recording?'disabled':''}>Demo</button></div><button class="button compact" id="connect-arduino" ${state.recording||state.serialBusy?'disabled':''}>${icon('usb')}${state.serialConnected?'Disconnect':'Connect Arduino'}</button></div></div>
  <div class="bench-grid"><div class="main-column">
    <section class="card card-pad"><div class="card-head"><div class="section-title"><span class="section-number">02</span><h2>Test setup</h2></div><span class="pill neutral">Resistive load</span></div>
    <div class="battery-pick"><div class="battery-visual">${icon('bolt')}</div><div class="battery-select-wrap"><label for="battery-select" class="field-label">SELECT BATTERY</label><select class="battery-select" id="battery-select" ${state.recording?'disabled':''}>${data.batteries.map(x=>`<option value="${escape(x.id)}" ${x.id===b.id?'selected':''}>${escape(x.id)} · ${escape(x.name)}</option>`).join('')}</select><div class="battery-meta"><span>${escape(b.chemistry)} · ${b.cells}S</span><span class="meta-divider">/</span><span>${b.capacity.toLocaleString()} mAh</span><span class="meta-divider">/</span><span>${escape(b.location)}</span></div></div></div>
    <div class="profile-grid">${[['voltage','Expected voltage','V',0.1,100,0.01],['resistance','Load resistance','Ω',0.1,10000,0.1],['tolerance','Comparison band','%',0.1,20,0.1],['duration','Record duration','s',5,60,1]].map(([key,label,unit,min,max,step])=>`<div class="field has-unit"><label for="profile-${key}" class="field-label">${label}</label><input id="profile-${key}" data-profile="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}" ${state.recording?'disabled':''}><span class="field-unit">${unit}</span></div>`).join('')}</div>
    <div class="profile-foot"><span>Target under load · I = V/R</span><strong>Expected load power: ${fmt(exp.power)} W</strong></div>
    <div class="live-note">${icon('info')}<span>Illustrative profile values. Use the battery-specific approved procedure for live tests; these bands are not safety limits.</span></div>
    ${state.mode==='arduino'?`<label class="confirm-row"><input id="profile-confirm" type="checkbox" ${state.profileConfirmed?'checked':''} ${state.recording?'disabled':''}><span>I have checked the battery ID, load and profile against the approved test procedure.</span></label>`:`<div class="field" style="margin-top:12px"><label for="scenario" class="field-label">Demo scenario</label><select id="scenario" ${state.recording?'disabled':''}><option value="normal" ${state.scenario==='normal'?'selected':''}>Stable readings</option><option value="sag" ${state.scenario==='sag'?'selected':''}>Voltage sag · further testing</option><option value="current" ${state.scenario==='current'?'selected':''}>Current deviation · further testing</option></select></div>`}
    ${validateProfile(p).length?`<p class="field-error">${escape(validateProfile(p)[0])}</p>`:''}</section>
    <section aria-label="Electrical measurements" class="metrics-grid">
    ${metric('Expected voltage',fmt(p.voltage),'V','Profile target under load','expected-v',true)}
    ${metric('Actual voltage','—','V','Awaiting data','actual-v')}
    ${metric('Expected current',fmt(exp.current),'A','Calculated from V/R','expected-i')}
    ${metric('Actual current','—','A','Awaiting data','actual-i')}
    </section>
    <section class="card card-pad"><div class="card-head chart-head"><div class="section-title"><span class="section-number">03</span><h2>Measurement trace</h2></div><span class="pill neutral" id="recording-pill">Not recording</span></div>
    <div class="chart-controls"><div class="chart-tabs" role="group" aria-label="Chart reading"><button data-chart="voltage" class="${state.chart==='voltage'?'active':''}">Voltage</button><button data-chart="current" class="${state.chart==='current'?'active':''}">Current</button></div><div class="legend"><span><i></i>Actual</span><span><i class="dashed"></i>Expected</span></div></div><div class="chart-box" id="chart"></div>
    <div class="chart-footer"><span id="sample-count">0 samples collected</span><span id="time-readout">0.0 / ${p.duration} s</span></div>
    <div class="load-row"><strong>${icon('bolt')}Applied load <span id="applied-load">—</span></strong><span id="load-state">Waiting for Arduino confirmation</span></div>
    <div class="test-actions"><button class="button primary" id="start-test" disabled>${icon('play')}${state.mode==='arduino'?'Record Arduino test':'Run demo test'}</button><button class="button danger" id="stop-test" ${state.recording?'':'disabled'}>${icon('stop')}Stop recording</button></div><p class="record-note" id="start-reason"></p>
    <div class="live-note">${icon('info')}<span>Recording controls only. Load switching, emergency stop and protective cut-offs belong on the Arduino hardware.</span></div></section>
    <section class="card card-pad" id="inventory-link-card"><div class="card-head" style="margin-bottom:10px"><div class="section-title">${icon('database')}<h2>Linked inventory</h2></div><button class="button ghost compact" id="open-inventory">View inventory ${icon('arrow')}</button></div><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><p style="font-size:12px">${escape(b.id)} <span class="muted">· ${escape(b.name)}</span></p><p class="subtitle" style="font-size:10px">${state.api?`Connected · ${state.api.sandbox?'sandbox':'live'} API`:'Browser inventory · stored on this device'}</p></div>${pill(b.status)}</div></section>
  </div><div class="side-column">
    <section class="card card-pad check-card"><div class="card-head"><div class="section-title"><span class="section-number">01</span><h2>Pre-test inspection</h2></div><span class="count-label">${gate.answered}/5</span></div><p class="check-subtitle">Complete before connecting a load.</p><div class="check-progress"><div style="width:${gate.answered*20}%"></div></div>
    ${QUESTIONS.map(q=>`<div class="question" role="group" aria-labelledby="question-${q.key}"><div class="question-heading"><span class="question-symbol">${icon(q.icon)}</span><div><p class="question-title" id="question-${q.key}">${q.title}</p><p class="question-help">${q.help}</p></div></div><div class="answers">${['no','yes','unsure'].map(a=>`<label class="answer"><input type="radio" name="${q.key}" value="${a}" ${state.answers[q.key]===a?'checked':''} aria-label="${escape(q.title)} ${a}"><span>${a[0].toUpperCase()+a.slice(1)}</span></label>`).join('')}</div></div>`).join('')}
    <div class="gate-message ${gate.outcome==='hold'?'red':gate.outcome==='needs_testing'?'amber':gate.allowed?'teal':''}" role="status"><strong>${gate.title}</strong>${gate.message}</div>
    ${!gate.allowed&&gate.outcome!=='incomplete'?`<button class="button ${gate.outcome==='hold'?'danger':''} wide" id="save-screening">${icon('shield')}Record concern in inventory</button>`:''}
    </section>
    <section class="card card-pad result-card" id="result-panel">${resultHTML()}</section>
  </div></div>`;
}
function metric(label,value,unit,caption,id,featured=false){return `<div class="metric ${featured?'featured':''}"><div class="metric-label">${label}${icon('bolt')}</div><div class="metric-value"><span id="${id}" class="mono">${value}</span><span class="unit">${unit}</span></div><div class="metric-bottom" id="${id}-caption">${featured?'<span class="small-line"></span>':''}${caption}</div></div>`;}
function resultHTML(){const r=state.result;return `<div class="result-intro"><span class="result-icon">${icon(r?'shield':'database')}</span><div><h3>${r?'Screening outcome':'A clear next step'}</h3><p>${r?`${state.samples.length?(state.mode==='simulation'?'Simulated measurement record':'Arduino measurement record'):'Pre-test inspection record'}`:'From the test bench to your inventory'}</p></div></div><div class="result-body">${r?`${pill(r.outcome)}<ul style="margin-top:10px">${r.reasons.map(x=>`<li>${escape(x)}</li>`).join('')}</ul>`:'Complete the inspection and record a test to see the assessment and update the battery’s record.'}</div>${r?`<button class="button primary wide" id="save-result" ${state.record?.saved?'disabled':''}>${icon('database')}${state.record?.saved?'Saved to inventory':'Save to inventory'}</button>${state.record?.saved&&state.api?`<button class="button wide" id="sync-result" ${state.syncing||state.record.synced?'disabled':''}>${icon('refresh')}${state.record.synced?'Synced with inventory':state.syncing?'Syncing…':'Send result to inventory API'}</button>`:''}<p class="result-meta">${state.record?.saved?'Saved locally · ':''}${state.record?.inventoryMessage?escape(state.record.inventoryMessage):'Results always require review before a use decision.'}</p>`:''}<div class="pipeline">${icon('pulse')} Detector<span class="connector"></span>${icon('database')} Inventory<span class="connector"></span>${icon('check')} Review</div>`;}
function updateTelemetry(){if(state.view!=='bench')return;
  const now=performance.now(),fresh=state.frame&&now-state.frame.receivedAt<3000;
  const sample=state.mode==='simulation'?state.samples.at(-1):(fresh&&state.frame.batteryId===state.batteryId?state.frame:null);
  for(const [key,value] of [['actual-v',sample?.voltage],['actual-i',sample?.current]]){$(`#${key}`).textContent=fmt(value);$(`#${key}-caption`).textContent=sample?(state.mode==='simulation'?'Simulated reading':'Live · Arduino USB'):(state.mode==='simulation'?'Run a demo to begin':'No fresh matching data');}
  const applied=state.mode==='simulation'?(state.recording?state.profile.resistance:state.samples.at(-1)?.loadOhm):(fresh&&state.frame?.batteryId===state.batteryId&&state.frame.loadActive?state.frame.loadOhm:null);
  $('#applied-load').textContent=Number.isFinite(applied)?`${fmt(applied)} Ω`:'—';
  $('#load-state').textContent=state.mode==='simulation'?(state.recording?'Simulated load applied':state.samples.length?'Last simulated load':'No simulated load applied'):(fresh&&state.frame.batteryId===state.batteryId?(state.frame.loadActive?`${fmt(state.frame.voltage*state.frame.current)} W measured · device reports ON`:'Device reports load OFF'):'No fresh load confirmation');
  $('#sample-count').textContent=`${state.samples.length} samples collected`;
  $('#time-readout').textContent=`${fmt(state.elapsed,1)} / ${state.profile.duration} s`;
  $('#recording-pill').innerHTML=state.recording?'<i class="status-dot running-indicator"></i>Recording':state.result?'Capture ended':'Not recording';
  $('#recording-pill').className=`pill ${state.recording?'teal':'neutral'}`;
  drawChart();updateStart();updateConnection();
}
function startProblem(){const gate=checkGate(state.answers,battery().status);if(!gate.allowed)return gate.title;if(validateProfile(state.profile).length)return validateProfile(state.profile)[0];if(state.mode==='arduino'){if(!state.profileConfirmed)return 'Confirm the battery ID and approved profile above.';if(!state.serialConnected)return 'Connect Arduino to receive measurements.';if(state.serialError)return state.serialError;return liveReady(state.frame,state.batteryId,state.profile,performance.now());}return '';}
function updateStart(){if(state.view!=='bench')return;const problem=startProblem();$('#start-test').disabled=state.recording||!!problem;$('#start-reason').textContent=state.recording?'Recording measurements. Stopping here does not switch off the physical load.':problem||`Ready to ${state.mode==='simulation'?'simulate':'record'} a ${state.profile.duration}-second test.`;$('#stop-test').disabled=!state.recording;}
function drawChart(){
  const el=$('#chart');if(!el)return;if(validateProfile(state.profile).length){el.innerHTML='<div class="chart-empty">Enter a valid test profile to display the trace.</div>';return;}const isV=state.chart==='voltage',expected=isV?state.profile.voltage:expectedValues(state.profile).current,unit=isV?'V':'A';
  const valid=Number.isFinite(expected)&&expected>0,values=state.samples.map(s=>isV?s.voltage:s.current);
  let low=valid?expected*.84:0,high=valid?expected*1.08:1;for(const v of values){low=Math.min(low,v*.98);high=Math.max(high,v*1.02);}const range=Math.max(high-low,0.001),W=640,H=180,L=43,R=13,T=14,B=27,x=t=>L+Math.min(1,Math.max(0,t/state.profile.duration))*(W-L-R),y=v=>T+(high-v)/range*(H-T-B);
  let grid='';for(let j=0;j<4;j++){const v=high-j*range/3,yy=y(v);grid+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#e9eee2" stroke-dasharray="3 4"/><text x="${L-9}" y="${yy+3}" text-anchor="end" fill="#9ba68e" font-size="9">${v.toFixed(isV?1:2)}</text>`;}
  for(let j=0;j<=5;j++){const t=j*state.profile.duration/5;grid+=`<text x="${x(t)}" y="${H-5}" text-anchor="middle" fill="#9ba68e" font-size="9">${Number.isInteger(t)?t:t.toFixed(1)}s</text>`;}
  const points=state.samples.map(s=>`${x(s.t)},${y(isV?s.voltage:s.current)}`).join(' ');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${isV?'Voltage':'Current'} over time in ${unit}. ${state.samples.length} samples."><defs><linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5c889" stop-opacity=".19"/><stop offset="1" stop-color="#a5c889" stop-opacity="0"/></linearGradient></defs>${grid}${valid?`<line x1="${L}" x2="${W-R}" y1="${y(expected)}" y2="${y(expected)}" stroke="#9eaf8e" stroke-dasharray="5 5" stroke-width="1.2"/>`:''}${points?`<polygon points="${x(state.samples[0].t)},${H-B} ${points} ${x(state.samples.at(-1).t)},${H-B}" fill="url(#trace-fill)"/><polyline points="${points}" fill="none" stroke="#3d8257" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`:''}</svg>${!points?`<div class="chart-empty">${icon('pulse')}<span>Waiting for a recorded test</span><small>${state.mode==='simulation'?'Complete the inspection, then run a demo.':'Connect Arduino and complete the inspection.'}</small></div>`:''}`;
}
function bindView(){
  $('#new-session')?.addEventListener('click',()=>{resetSession();render();});
  $('#battery-select')?.addEventListener('change',e=>selectBattery(e.target.value));
  $$('[data-mode]').forEach(el=>el.addEventListener('click',()=>{if(state.recording)return;state.mode=el.dataset.mode;resetSession();render();}));
  $$('[data-profile]').forEach(el=>el.addEventListener('change',()=>{state.profile[el.dataset.profile]=Number(el.value);state.profileConfirmed=false;state.result=null;state.record=null;state.samples=[];state.elapsed=0;render();}));
  $('#profile-confirm')?.addEventListener('change',e=>{state.profileConfirmed=e.target.checked;updateStart();});
  $('#scenario')?.addEventListener('change',e=>{state.scenario=e.target.value;state.samples=[];state.result=null;state.record=null;state.elapsed=0;render();});
  $$('.answers input').forEach(el=>el.addEventListener('change',()=>{state.answers[el.name]=el.value;if(state.recording&&!checkGate(state.answers,battery().status).allowed)finish(false,'Inspection changed during recording.');else{state.result=null;state.record=null;}render();}));
  $$('[data-chart]').forEach(el=>el.addEventListener('click',()=>{state.chart=el.dataset.chart;$$('[data-chart]').forEach(b=>b.classList.toggle('active',b===el));drawChart();}));
  $('#connect-arduino')?.addEventListener('click',toggleSerial);
  $('#start-test')?.addEventListener('click',startTest);
  $('#stop-test')?.addEventListener('click',()=>finish(false,'Recording stopped by the operator. Physical load state is unchanged.'));
  $('#save-screening')?.addEventListener('click',()=>{finish(false);saveResult();});
  $('#save-result')?.addEventListener('click',saveResult);
  $('#sync-result')?.addEventListener('click',syncResult);
  $('#open-inventory')?.addEventListener('click',()=>setView('inventory'));
  $('#inventory-connect')?.addEventListener('click',connectionModal);
  $('#export-data')?.addEventListener('click',exportData);
  $('#import-data')?.addEventListener('change',importData);
  $('#add-battery')?.addEventListener('click',addBatteryModal);
  $('#search-inventory')?.addEventListener('input',e=>{const term=e.target.value.trim().toLowerCase();let count=0;$$('tbody tr[data-search]').forEach(row=>{row.hidden=!row.dataset.search.includes(term);if(!row.hidden)count++;});$('#inventory-result-count').textContent=`${count} batteries shown`;});
  $$('[data-select-battery]').forEach(el=>el.addEventListener('click',()=>{if(state.recording)return toast('Finish the current recording before changing batteries.');state.view='bench';selectBattery(el.dataset.selectBattery);}));
  $$('[data-test-id]').forEach(el=>el.addEventListener('click',()=>testDetail(el.dataset.testId)));
}
function startTest(){
  const problem=startProblem();if(problem)return toast(problem);
  state.recording=true;state.samples=[];state.result=null;state.record=null;state.elapsed=0;state.basePerf=performance.now();state.baseMs=state.frame?.ms??0;
  if(state.mode==='arduino')state.samples.push({...state.frame,t:0});else generateSample(0);
  state.timer=setInterval(()=>{
    if(!state.recording)return;
    if(state.mode==='simulation'){const elapsed=Math.min(state.profile.duration,(performance.now()-state.basePerf)/1000);generateSample(elapsed);state.elapsed=elapsed;if(elapsed>=state.profile.duration)return finish(true);}
    else if(performance.now()-state.frame.receivedAt>3000)return finish(false,'Arduino data became stale. Recording ended; check the device locally.');
    else if(performance.now()-state.basePerf>(state.profile.duration+4)*1000)return finish(false,'The device did not provide a complete measurement window.');
    updateTelemetry();
  },200);
  render();
}
function generateSample(t){const p=state.profile,ratio=state.scenario==='sag'?1-.12*(t/p.duration):.996+Math.sin(t*1.7)*.003;const voltage=p.voltage*ratio,current=voltage/p.resistance*(state.scenario==='current'?.84:1);state.samples.push({t,voltage,current,loadOhm:p.resistance,loadActive:true});}
function finish(completed,reason=''){
  clearInterval(state.timer);state.timer=null;state.recording=false;
  const result=assess({answers:state.answers,profile:state.profile,samples:state.samples,completed,status:battery().status});
  if(reason)result.reasons.unshift(reason);
  if(state.mode==='arduino')result.reasons=result.reasons.map(x=>x.replaceAll('demonstration','configured'));
  state.result=result;
  state.record={id:crypto.randomUUID(),batteryId:state.batteryId,createdAt:new Date().toISOString(),source:state.mode,kind:state.samples.length?'measurement':'inspection',profile:{...state.profile},answers:{...state.answers},samples:state.samples.map(({t,voltage,current,loadOhm,loadActive,seq,ms})=>({t,voltage,current,loadOhm,loadActive,...(seq!==undefined?{seq,ms}:{})})),completed,...result,saved:false,synced:false,inventoryEndpoint:state.api?.base??null};
  render();
}
function saveResult(){
  if(!state.record||state.record.saved)return;
  const b=data.batteries.find(x=>x.id===state.record.batteryId);
  if(!b)return toast('The battery is no longer in the selected inventory.');
  b.status=resolveStatus(b.status,state.record.outcome);
  if(!validateProfile(state.record.profile).length)b.profile={...state.record.profile};
  state.record.saved=true;data.tests.unshift(state.record);data.tests=data.tests.slice(0,1000);
  const ok=persist();render();toast(ok?'Assessment saved to the battery inventory.':'Recorded in memory. Export to preserve this assessment.');
}
async function syncResult(){
  const record=state.record,api=state.api;if(!record?.saved||!api||state.syncing||record.synced)return;
  if(record.inventoryEndpoint!==api.base)return toast('This record belongs to a different inventory connection.');
  state.syncing=true;render();
  try{const response=await sendTest({endpoint:api.base,token:api.token,record,sandbox:api.sandbox});record.synced=true;record.inventoryStatus=response.status;record.inventoryMessage=response.message||`Inventory response: ${STATUS[response.status].label}`;const b=data.batteries.find(x=>x.id===record.batteryId);
    if(b&&data.tests.find(t=>t.batteryId===record.batteryId)?.id===record.id){let incoming=response.status;if(record.outcome!=='within_range'&&incoming==='approved')incoming=record.outcome;if(record.source==='simulation'&&incoming==='approved')incoming='within_range';b.status=resolveStatus(b.status,incoming);}persist();toast('Inventory acknowledged the test and returned its assessment.');
  }catch(e){toast(e.message);}finally{state.syncing=false;render();}
}
const serial=new ArduinoSerial({onFrame:frame=>{
  const now=performance.now();
  if(state.lastSeq!==null&&(frame.seq<=state.lastSeq||frame.ms<=state.lastDeviceMs)){
    state.serialError='Arduino sequence or clock reset. Disconnect and reconnect before another recording.';if(state.recording&&state.mode==='arduino')finish(false,state.serialError);return;
  }
  if(state.recording&&state.mode==='arduino'&&(frame.seq!==state.lastSeq+1||frame.ms-state.lastDeviceMs>3000||Math.abs((frame.ms-state.baseMs)-(now-state.basePerf))>2000)){
    state.serialError='Missing, delayed or inconsistent Arduino telemetry.';finish(false,state.serialError);
  }
  state.lastSeq=frame.seq;state.lastDeviceMs=frame.ms;state.frame={...frame,receivedAt:now};
  if(state.recording&&state.mode==='arduino'){
    const issue=liveReady(state.frame,state.batteryId,state.profile,now);if(issue)return finish(false,issue);
    const t=(frame.ms-state.baseMs)/1000;state.samples.push({...frame,t});state.elapsed=t;
    if(state.samples.length>5000)return finish(false,'Too many samples. Configure telemetry at approximately 5 Hz.');
    if(t>=state.profile.duration)return finish(true);
  }
  updateConnection();updateTelemetry();
},onError:error=>{state.serialError=`Serial data error: ${error.message}`;if(state.recording&&state.mode==='arduino')finish(false,state.serialError);updateTelemetry();},onClose:()=>{state.serialConnected=false;state.frame=null;if(state.recording&&state.mode==='arduino')finish(false,'Arduino disconnected. Recording is incomplete.');updateConnection();updateTelemetry();}});
async function toggleSerial(){
  if(state.serialBusy||state.recording)return;
  if(state.serialConnected){await serial.disconnect();render();return;}
  state.serialBusy=true;state.serialError='';state.lastSeq=null;state.lastDeviceMs=null;state.frame=null;
  try{await serial.connect(115200);state.serialConnected=!!serial.port;state.mode='arduino';resetSession();toast('USB port connected. Waiting for valid Arduino telemetry.');}
  catch(e){toast(e.name==='NotFoundError'?'No serial port selected.':e.message);}
  finally{state.serialBusy=false;render();}
}
function updateConnection(){
  const connected=state.serialConnected;$('#side-light').classList.toggle('online',connected);
  $('#side-device').innerHTML=connected?'Arduino connected<small>USB serial · 115200 baud</small>':'Arduino disconnected<small>USB serial · read-only</small>';
  const btn=$('#connect-arduino');if(btn){btn.innerHTML=icon('usb')+(state.serialBusy?'Connecting…':connected?'Disconnect':'Connect Arduino');btn.disabled=state.recording||state.serialBusy;}
  const status=$('#source-status');if(status&&state.mode==='arduino'){status.innerHTML=`${connected?'Arduino connected':'Arduino data source'}<small>${escape(state.serialError||(state.frame?(performance.now()-state.frame.receivedAt<3000?`Receiving ${state.frame.batteryId} · seq ${state.frame.seq}`:'Port open · telemetry is stale'):'USB serial · actual voltage, current and load'))}</small>`;}
}
function inventoryHTML(){const counts={total:data.batteries.length,hold:data.batteries.filter(b=>b.status==='hold').length,review:data.batteries.filter(b=>['needs_testing','untested'].includes(b.status)).length,within:data.batteries.filter(b=>['within_range','approved'].includes(b.status)).length};return header('Battery inventory','One record for every battery. One place for the next decision.',`<button class="button" id="inventory-connect">${icon('link')}Connect inventory</button>`)+`
  <div class="inventory-summary">${[['Total batteries',counts.total,''],['Awaiting testing',counts.review,'amber'],['Within range / reviewed',counts.within,'teal'],['On hold',counts.hold,'red']].map(([s,n,c])=>`<div class="summary-stat ${c}"><span>${s}</span><strong>${n.toString().padStart(2,'0')}</strong></div>`).join('')}</div>
  <section class="card"><div class="table-toolbar"><input class="search" id="search-inventory" type="search" placeholder="Search battery, type or location…" aria-label="Search inventory"><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="button compact" id="add-battery" ${state.recording?'disabled':''}>${icon('plus')}Add battery</button><label class="button compact" for="import-data">${icon('upload')}Import<input id="import-data" type="file" accept=".json,application/json" hidden ${state.recording?'disabled':''}></label><button class="button compact" id="export-data">${icon('download')}Export</button></div></div><div class="table-wrap"><table><thead><tr><th>Battery</th><th>Specification</th><th>Location</th><th>Assessment</th><th></th></tr></thead><tbody>${data.batteries.map(b=>`<tr data-search="${escape(`${b.id} ${b.name} ${b.chemistry} ${b.location}`.toLowerCase())}"><td><strong>${escape(b.name)}</strong><small>${escape(b.id)}</small></td><td>${escape(b.chemistry)} · ${b.cells}S<br><small>${b.capacity.toLocaleString()} mAh</small></td><td>${escape(b.location)}</td><td>${pill(b.status)}</td><td><button class="button compact ghost" data-select-battery="${escape(b.id)}" ${state.recording?'disabled':''}>Inspect ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div><div class="table-note" style="display:flex;justify-content:space-between;gap:12px"><span id="inventory-result-count">${data.batteries.length} batteries shown</span><span>${state.api?`${state.api.sandbox?'Sandbox':'Live'} API connected`:'Local browser records · example batteries included'}</span></div></section><p class="live-note">${icon('info')}A “within range” result is a screening observation. Only the responsible reviewer can make a use decision; existing holds are never cleared by retesting.</p>`;}
function historyHTML(){return header('Test history','The readings, inspection and reasoning behind every assessment.',`<button class="button" id="export-data">${icon('download')}Export records</button>`)+(data.tests.length?`<div class="history-list">${data.tests.map(t=>`<article class="card history-item"><div><strong>${escape(t.batteryId)} <span class="muted">· ${escape(data.batteries.find(b=>b.id===t.batteryId)?.name||'Battery record')}</span></strong><p>${date(t.createdAt)} · ${t.kind==='inspection'?'INSPECTION':t.source==='simulation'?'DEMO':'ARDUINO'} · ${t.samples.length} samples · ${t.synced?'API acknowledged':'Saved locally'}</p></div><div class="history-status">${pill(t.outcome)}<button class="button compact ghost" data-test-id="${escape(t.id)}">View record ${icon('arrow')}</button></div></article>`).join('')}</div>`:`<section class="card empty-state">${icon('history')}<h3>Your first test starts at the bench.</h3><p>Saved inspections and measurement records will appear here.</p><button class="button primary" data-select-battery="${escape(state.batteryId)}">Open test bench ${icon('arrow')}</button></section>`);}
function setView(view){state.view=view;render();window.scrollTo({top:0,behavior:'smooth'});}
$$('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
$('.brand').addEventListener('click',e=>{e.preventDefault();setView('bench');});
$('#sidebar-connection').addEventListener('click',connectionModal);
$('#guide-button').addEventListener('click',guideModal);
function modal(title,subtitle,body){$('#modal-content').innerHTML=`<div class="modal-header"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="close-button" id="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>`;$('#close-modal').onclick=()=>$('#modal').close();$('#modal').showModal();}
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
function connectionModal(){
  modal('Inventory connection','Keep battery metadata and test outcomes in sync.',`<div class="connection-box">${icon('database')}<div><strong>${state.api?`${state.api.sandbox?'Sandbox':'Live'} inventory connected`:'Browser inventory is active'}</strong><small>${state.api?escape(state.api.base):'No external service required for a demonstration.'}</small></div></div><p>Connect your team’s inventory API to load battery records and send assessments. The server can return “Needs further testing”, a hold, or an authorised use decision.</p><form id="api-form"><div class="field"><label for="api-url" class="field-label">Inventory API base URL</label><input id="api-url" type="url" placeholder="https://inventory.example.edu/api" required value="${escape(state.api?.base||'')}" ${state.recording||state.syncing?'disabled':''}></div><div class="field"><label for="api-token" class="field-label">Bearer token (optional · kept in memory only)</label><input id="api-token" type="password" autocomplete="off" placeholder="Paste a short-lived API token" ${state.recording||state.syncing?'disabled':''}></div><p style="font-size:10px">Connecting replaces the visible battery list with API records. Test history is retained. Demo results are blocked from production inventories.</p><div class="modal-actions"><button class="button primary" type="submit" ${state.recording||state.syncing?'disabled':''}>${icon('link')}Connect & load records</button>${state.api?`<button class="button" type="button" id="disconnect-api" ${state.recording||state.syncing?'disabled':''}>Use local copy</button>`:''}<a class="button" href="./integration-guide.html" target="_blank" rel="noopener">API guide ${icon('arrow')}</a></div><div id="api-message" role="status"></div></form>`);
  $('#disconnect-api')?.addEventListener('click',()=>{state.api=null;$('#modal').close();render();toast('Disconnected. The local copy is still available.');});
  $('#api-form').addEventListener('submit',async e=>{
    e.preventDefault();if(state.recording||state.syncing)return;const submit=$('#api-form button[type=submit]');submit.disabled=true;submit.textContent='Connecting…';const endpoint=$('#api-url').value.trim(),token=$('#api-token').value;
    try{const connected=await connectInventory({endpoint,token});state.api={base:connected.base,sandbox:connected.sandbox,token};data.batteries=connected.batteries;state.batteryId=data.batteries[0].id;state.profile={...battery().profile};resetSession();persist();$('#modal').close();render();toast(`${data.batteries.length} battery records loaded from the inventory.`);}
    catch(error){$('#api-message').className='modal-message';$('#api-message').textContent=error.message;submit.disabled=false;submit.textContent='Connect & load records';}
  });
}
function guideModal(){modal('Connect the detector','Arduino → USB serial → CellCheck → inventory',`<ol><li>Have the Arduino sketch output one JSON telemetry message per line at <strong>115200 baud</strong>.</li><li>Open this site in a desktop browser with Web Serial support, such as Chrome or Edge. Close the Arduino Serial Monitor first.</li><li>Choose <strong>Connect Arduino</strong> and select the USB port. The message’s battery ID must match the selected inventory record.</li><li>Complete the checklist before applying a load. Confirm your approved test profile, operate the device locally, then start recording.</li><li>Save the assessment and optionally send it to your inventory API.</li></ol><pre>{"type":"telemetry","battery_id":"BAT-001","seq":1,"ms":1000,"voltage":11.91,"current":1.191,"load_ohm":10,"load_active":true}</pre><p>The interface reads measurements only. It cannot stop a load, detect every fault, or verify calibration. The firmware must manage safe load switching and independent cut-offs. Clicking Stop recording does not de-energise hardware.</p><div class="modal-actions"><a class="button primary" href="./integration-guide.html" target="_blank" rel="noopener">Full integration guide ${icon('arrow')}</a><a class="button" href="./CellCheckTelemetry.h" download>${icon('download')}Arduino helper</a></div><p style="font-size:10px">Inspection guidance: <a href="https://www.fire.nsw.gov.au/fire-safety/home-fire-safety/battery-and-charging-safety/what-should-i-do-if-my-battery-is-damaged" target="_blank" rel="noopener">Fire and Rescue NSW</a>. Profile values and comparison bands are illustrative, not published safety limits.</p>`);}
function addBatteryModal(){
  if(state.recording)return;modal('Register a battery','Create a record before connecting the detector.',`<form id="battery-form"><div class="form-two">${[['id','Battery ID','BAT-007','text'],['name','Display name','New project pack','text'],['chemistry','Chemistry','LiPo','text'],['cells','Series cells','3','number'],['capacity','Capacity (mAh)','2200','number'],['location','Location','J18','text']].map(([k,l,placeholder,type])=>`<div class="field"><label class="field-label" for="new-${k}">${l}</label><input id="new-${k}" type="${type}" placeholder="${placeholder}" required ${type==='number'?'min="1" step="1"':''} maxlength="100"></div>`).join('')}</div><p>The initial test profile is illustrative. Update it at the bench to match the approved procedure before recording Arduino data.</p><button class="button primary" type="submit">${icon('plus')}Register battery</button><p id="battery-error" class="field-error" role="alert"></p></form>`);
  $('#battery-form').addEventListener('submit',e=>{e.preventDefault();try{const record={};for(const k of ['id','name','chemistry','location'])record[k]=$(`#new-${k}`).value.trim();for(const k of ['cells','capacity'])record[k]=Number($(`#new-${k}`).value);Object.assign(record,{status:'untested',note:'Operator-created record. Profile requires confirmation.',profile:{voltage:12,resistance:10,tolerance:5,duration:10}});validateInventory({batteries:[...data.batteries,record]});data.batteries.push(record);persist();$('#modal').close();state.view='bench';selectBattery(record.id);toast('Battery registered. Set the correct test profile before proceeding.');}catch(error){$('#battery-error').textContent=error.message;}});
}
function exportData(){download('cellcheck-inventory.json',{schemaVersion:1,exportedAt:new Date().toISOString(),batteries:data.batteries,tests:data.tests});toast('Inventory and test records exported.');}
function download(name,content){const blob=new Blob([JSON.stringify(content,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importData(e){const file=e.target.files[0];if(!file||state.recording)return;try{if(file.size>2*1024*1024)throw new Error('Inventory import is limited to 2 MB.');const batteries=validateInventory(JSON.parse(await file.text()));const merged=new Map(data.batteries.map(b=>[b.id,b]));for(const b of batteries){const old=merged.get(b.id);merged.set(b.id,{...b,status:resolveStatus(old?.status,b.status)});}if(merged.size>500)throw new Error('The combined inventory exceeds 500 records.');data.batteries=[...merged.values()];state.api=null;resetSession();state.profile={...battery().profile};persist();render();toast(`Imported ${batteries.length} battery records. Existing holds were preserved. History was not imported.`);}catch(error){toast(error.message);}finally{e.target.value='';}}
function testDetail(id){const t=data.tests.find(x=>x.id===id);if(!t)return;modal(`${escape(t.batteryId)} · test record`,`${date(t.createdAt)} · ${t.source==='simulation'?'Simulation':'Arduino USB serial'}`,`${pill(t.outcome)}<h3>Assessment</h3><ul>${t.reasons.map(r=>`<li>${escape(r)}</li>`).join('')}</ul><h3>Test conditions</h3><p>${fmt(t.profile?.voltage)} V target · ${fmt(t.profile?.resistance)} Ω load · ${fmt(t.profile?.duration,0)} s window · ±${fmt(t.profile?.tolerance,1)}% band<br>${t.samples.length} samples · ${t.completed?'Full window captured':'Incomplete / inspection only'}</p><h3>Inspection</h3><ul>${QUESTIONS.map(q=>`<li>${q.title} <strong>${escape(t.answers?.[q.key]||'Not answered')}</strong></li>`).join('')}</ul>${t.inventoryMessage?`<h3>Inventory feedback</h3><p>${escape(t.inventoryMessage)}</p>`:''}<button class="button" id="download-test">${icon('download')}Download raw record</button>`);$('#download-test').onclick=()=>download(`cellcheck-${t.batteryId}-${t.id.slice(0,8)}.json`,t);}
window.addEventListener('beforeunload',e=>{if(state.recording){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(state.view==='bench'&&!state.recording)updateTelemetry();},1000);
render();
