export const QUESTIONS = [
  {key:'swollen',title:'Is it swollen or deformed?',help:'Look for bulging, distortion or an expanding casing.',icon:'box'},
  {key:'hot',title:'Is it unusually hot?',help:'Use existing observations or a sensor. Do not touch to check.',icon:'thermometer'},
  {key:'gas',title:'Is it releasing gas or fumes?',help:'Smoke, hissing or a noticed unusual odour. Do not sniff.',icon:'wind'},
  {key:'impact',title:'Has it experienced an impact?',help:'A drop, collision, crushing or other mechanical incident.',icon:'impact'},
  {key:'damage',title:'Any leaks or other damage?',help:'Check for damaged leads, casing, corrosion or liquid exposure.',icon:'shield'}
];
export const STATUS = {
  untested:{label:'Not screened',tone:'neutral'},
  needs_testing:{label:'Needs further testing',tone:'amber'},
  within_range:{label:'Within range · review required',tone:'teal'},
  hold:{label:'Do not test / use',tone:'red'},
  approved:{label:'Approved by inventory',tone:'teal'}
};
export function checkGate(answers={},status='untested') {
  const yes=QUESTIONS.filter(q=>answers[q.key]==='yes');
  const unsure=QUESTIONS.filter(q=>answers[q.key]==='unsure');
  const missing=QUESTIONS.filter(q=>!['no','yes','unsure'].includes(answers[q.key]));
  const urgent=answers.hot==='yes'||answers.gas==='yes';
  if(yes.length) return {allowed:false,outcome:'hold',urgent,title:urgent?'Stop. Do not connect the battery.':'Do not test or use this battery.',message:urgent?'Keep people clear and follow the site emergency procedure. For smoke, fire or immediate danger, leave the area and call 000.':'A warning sign was reported. Keep it out of use and contact the responsible lab supervisor.',answered:5-missing.length};
  if(status==='hold') return {allowed:false,outcome:'hold',urgent:false,title:'This battery is on hold.',message:'A clear checklist cannot remove an existing hold. The responsible person must resolve it in the inventory.',answered:5-missing.length};
  if(unsure.length) return {allowed:false,outcome:'needs_testing',urgent:false,title:'Clarification needed before testing.',message:'An “Unsure” answer requires supervisor review. Do not connect a load until the concern is resolved.',answered:5-missing.length};
  if(missing.length) return {allowed:false,outcome:'incomplete',urgent:false,title:'Complete the inspection to continue.',message:'Answer every question individually. Testing stays locked until all five answers are “No”.',answered:5-missing.length};
  return {allowed:true,outcome:'ready',urgent:false,title:'Pre-test inspection complete.',message:'Ready for the measurement step. This inspection is not a safety certification.',answered:5};
}
export function validateProfile(p) {
  const errors=[];
  for(const [key,min,max] of [['voltage',0.1,100],['resistance',0.1,10000],['tolerance',0.1,20],['duration',5,60]])
    if(typeof p?.[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max) errors.push(`${key} must be between ${min} and ${max}.`);
  if(!Number.isInteger(p?.duration)) errors.push('duration must be a whole number of seconds.');
  return errors;
}
export function expectedValues(profile) {
  if(validateProfile(profile).length) return {current:NaN,power:NaN};
  return {current:profile.voltage/profile.resistance,power:profile.voltage**2/profile.resistance};
}
export function assess({answers,profile,samples=[],completed=false,status='untested'}) {
  const gate=checkGate(answers,status);
  if(!gate.allowed) return {outcome:gate.outcome==='incomplete'?'needs_testing':gate.outcome,reviewRequired:true,reasons:[gate.title]};
  if(validateProfile(profile).length) return {outcome:'needs_testing',reviewRequired:true,reasons:['The test profile is invalid.']};
  if(!completed||samples.length<2||samples[0]?.t!==0||samples.at(-1)?.t<profile.duration)
    return {outcome:'needs_testing',reviewRequired:true,reasons:['Test incomplete. A full measurement window is required.']};
  if(samples.some((s,i)=>!Number.isFinite(s.voltage)||!Number.isFinite(s.current)||!Number.isFinite(s.t)||s.voltage<0||s.current<0||s.t<0||(i>0&&s.t<=samples[i-1].t)))
    return {outcome:'needs_testing',reviewRequired:true,reasons:['Missing or invalid telemetry. Check the measurement chain.']};
  const {current}=expectedValues(profile);
  const vDeviation=Math.max(...samples.map(s=>Math.abs((s.voltage-profile.voltage)/profile.voltage)*100));
  const iDeviation=Math.max(...samples.map(s=>Math.abs((s.current-current)/current)*100));
  const reasons=[];
  if(vDeviation>profile.tolerance+1e-9) reasons.push(`Voltage exceeded the ±${profile.tolerance}% demonstration band.`);
  if(iDeviation>profile.tolerance+1e-9) reasons.push(`Current exceeded the ±${profile.tolerance}% demonstration band.`);
  if(!reasons.length) reasons.push('All captured samples are within the demonstration bands. A responsible person must review before any use decision.');
  return {outcome:reasons.length&&(vDeviation>profile.tolerance+1e-9||iDeviation>profile.tolerance+1e-9)?'needs_testing':'within_range',reviewRequired:true,reasons,vDeviation,iDeviation};
}
export function resolveStatus(existing,incoming) {
  if(existing==='hold'||incoming==='hold') return 'hold';
  return Object.hasOwn(STATUS,incoming)?incoming:'needs_testing';
}
export function validateInventory(payload) {
  if(!payload||!Array.isArray(payload.batteries)||payload.batteries.length<1||payload.batteries.length>500) throw new Error('Inventory must contain 1–500 battery records.');
  const ids=new Set();
  return payload.batteries.map(b=>{
    if(!b||typeof b.id!=='string'||!/^[-A-Za-z0-9_]{1,48}$/.test(b.id)||ids.has(b.id)) throw new Error('Every battery needs a unique ID (letters, numbers, hyphens or underscores).');
    ids.add(b.id);
    if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.chemistry!=='string'||b.chemistry.length>40||!Number.isInteger(b.cells)||b.cells<1||b.cells>24||!Number.isFinite(b.capacity)||b.capacity<=0||!Object.hasOwn(STATUS,b.status)||validateProfile(b.profile).length)
      throw new Error(`Invalid battery metadata or profile for ${b.id}. See the integration guide.`);
    return {id:b.id,name:b.name,chemistry:b.chemistry,cells:b.cells,capacity:b.capacity,status:b.status,location:typeof b.location==='string'?b.location.slice(0,100):'Unassigned',note:typeof b.note==='string'?b.note.slice(0,500):'',profile:{voltage:b.profile.voltage,resistance:b.profile.resistance,tolerance:b.profile.tolerance,duration:b.profile.duration}};
  });
}
