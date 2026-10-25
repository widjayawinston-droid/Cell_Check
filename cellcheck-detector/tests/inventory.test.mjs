import test from 'node:test';
import assert from 'node:assert/strict';
import {SEED,loadLocal,saveLocal,connectInventory,sendTest,validateEndpoint} from '../dist/inventory.js';
test('local inventory survives a storage round trip',()=>{
  const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  const data=loadLocal(storage);data.batteries[0].status='needs_testing';saveLocal(storage,data);
  assert.equal(loadLocal(storage).batteries[0].status,'needs_testing');
});
test('invalid local data is not silently treated as a clean inventory',()=>{
  assert.throws(()=>loadLocal({getItem:()=>'{bad'}));
});
test('inventory API loads validated data with an explicit environment',async()=>{
  const requests=[];
  const response=await connectInventory({endpoint:'https://example.edu/api/',token:'test-token',fetcher:async(url,init)=>{requests.push({url,init});return {ok:true,json:async()=>({sandbox:true,batteries:SEED})};}});
  assert.equal(response.batteries.length,6);assert.equal(requests[0].url,'https://example.edu/api/batteries');
  assert.equal(requests[0].init.headers.Authorization,'Bearer test-token');assert.equal(requests[0].init.redirect,'error');
});
test('simulation cannot pollute a production inventory',async()=>{
  await assert.rejects(()=>sendTest({endpoint:'https://example.edu',record:{source:'simulation'},sandbox:false,fetcher:()=>assert.fail('must not call network')}),/Simulated tests/);
});
test('test upload verifies returned test identity and assessment',async()=>{
  const record={id:'test-1',batteryId:'BAT-001',source:'arduino'};
  let sent;
  const result=await sendTest({endpoint:'https://example.edu',sandbox:false,record,fetcher:async(url,init)=>{sent={url,...init};return {ok:true,json:async()=>({sandbox:false,testId:'test-1',batteryId:'BAT-001',status:'needs_testing',message:'Review load response'})};}});
  assert.equal(sent.method,'POST');assert.equal(JSON.parse(sent.body).test.id,'test-1');assert.equal(result.status,'needs_testing');
  await assert.rejects(()=>sendTest({endpoint:'https://example.edu',record,fetcher:async()=>({ok:true,json:async()=>({sandbox:true,testId:'wrong',batteryId:'BAT-001',status:'approved'})})}),/acknowledgement/);
});
test('network errors and unsafe endpoint formats fail explicitly',async()=>{
  for(const url of ['http://example.edu','https://user:password@example.edu','https://example.edu?secret=token','https://example.edu#part'])assert.throws(()=>validateEndpoint(url));
  await assert.rejects(()=>connectInventory({endpoint:'https://example.edu',fetcher:async()=>({ok:false,status:401})}),/401/);
});
