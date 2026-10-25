import {validateInventory,STATUS} from './engine.js';
export const STORAGE_KEY='cellcheck.prototype.v1';
export const SEED=[
  {id:'BAT-001',name:'Robotics pack A',chemistry:'LiPo',cells:3,capacity:2200,status:'untested',location:'J18 · Cabinet A',note:'Example battery. All profile values are for demonstration.',profile:{voltage:12,resistance:10,tolerance:5,duration:10}},
  {id:'BAT-002',name:'Drone pack B',chemistry:'LiPo',cells:4,capacity:5000,status:'needs_testing',location:'J18 · Cabinet A',note:'Example review request: verify pack condition before next project session.',profile:{voltage:15.2,resistance:15,tolerance:5,duration:10}},
  {id:'BAT-003',name:'Sensor module',chemistry:'Li-ion',cells:1,capacity:2600,status:'untested',location:'J18 · Cabinet B',note:'Example record.',profile:{voltage:3.8,resistance:5,tolerance:5,duration:10}},
  {id:'BAT-004',name:'Rover pack C',chemistry:'LiPo',cells:3,capacity:3300,status:'hold',location:'J18 · Review pending',note:'Demonstration hold: impact reported. No testing or use until resolved by the responsible person.',profile:{voltage:12,resistance:10,tolerance:5,duration:10}},
  {id:'BAT-005',name:'Prototype pack D',chemistry:'LiPo',cells:2,capacity:1800,status:'untested',location:'J18 · Cabinet B',note:'Example record.',profile:{voltage:7.6,resistance:10,tolerance:5,duration:10}},
  {id:'BAT-006',name:'Robotics pack E',chemistry:'LiPo',cells:3,capacity:2200,status:'needs_testing',location:'J18 · Cabinet A',note:'Example record awaiting a new screening.',profile:{voltage:12,resistance:10,tolerance:5,duration:10}}
];
export function loadLocal(storage) {
  const raw=storage.getItem(STORAGE_KEY);
  if(!raw) return {batteries:structuredClone(SEED),tests:[]};
  const data=JSON.parse(raw);
  const batteries=validateInventory(data);
  if(!Array.isArray(data.tests)||data.tests.length>1000||data.tests.some(t=>!t||typeof t.id!=='string'||typeof t.batteryId!=='string'||typeof t.createdAt!=='string'||!['simulation','arduino'].includes(t.source)||!Object.hasOwn(STATUS,t.outcome)||!Array.isArray(t.reasons)||t.reasons.some(r=>typeof r!=='string')||!Array.isArray(t.samples)||t.samples.some(s=>!Number.isFinite(s.t)||!Number.isFinite(s.voltage)||!Number.isFinite(s.current)))) throw new Error('Saved test history is invalid. Export or clear browser data to recover.');
  return {batteries,tests:data.tests};
}
export function saveLocal(storage,data) {storage.setItem(STORAGE_KEY,JSON.stringify(data));}
export function validateEndpoint(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw new Error('Use an HTTPS base URL without credentials, query parameters or fragments.');
  return url.href.replace(/\/$/,'');
}
async function request(url,{token,method='GET',body,fetcher=fetch}={}) {
  const response=await fetcher(url,{method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000),credentials:'omit',redirect:'error'});
  if(!response.ok) throw new Error(`Inventory returned HTTP ${response.status}. Nothing has been marked as synced.`);
  return response.json();
}
export async function connectInventory({endpoint,token='',fetcher=fetch}) {
  const base=validateEndpoint(endpoint);
  const data=await request(`${base}/batteries`,{token,fetcher});
  if(typeof data.sandbox!=='boolean') throw new Error('Inventory must declare sandbox: true or false.');
  return {base,sandbox:data.sandbox,batteries:validateInventory(data)};
}
export async function sendTest({endpoint,token='',record,sandbox=true,fetcher=fetch}) {
  const base=validateEndpoint(endpoint);
  if(!sandbox&&record.source==='simulation') throw new Error('Simulated tests cannot be sent to a production inventory.');
  const data=await request(`${base}/tests`,{token,method:'POST',body:{sandbox,test:record},fetcher});
  if(data.sandbox!==sandbox||data.testId!==record.id||data.batteryId!==record.batteryId||!Object.hasOwn(STATUS,data.status)) throw new Error('Inventory acknowledgement is invalid. Retry using the same test ID.');
  return {status:data.status,message:typeof data.message==='string'?data.message.slice(0,500):''};
}
