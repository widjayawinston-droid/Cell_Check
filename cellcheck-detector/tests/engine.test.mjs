import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGate, expectedValues, assess, validateProfile, validateInventory, resolveStatus} from '../dist/engine.js';

const clear = {swollen:'no',hot:'no',gas:'no',impact:'no',damage:'no'};
const profile = {voltage:12,resistance:10,tolerance:5,duration:10};
test('resistive load uses V/R for current and V²/R for power',()=>{
  assert.deepEqual(expectedValues(profile),{current:1.2,power:14.4});
});
test('all questions must be answered no to allow screening',()=>{
  assert.equal(checkGate({}).allowed,false);
  assert.equal(checkGate({...clear,impact:'unsure'}).allowed,false);
  assert.equal(checkGate(clear).allowed,true);
});
test('every hazard blocks screening; heat and gas take emergency priority',()=>{
  for(const key of Object.keys(clear)) assert.equal(checkGate({...clear,[key]:'yes'}).allowed,false);
  assert.equal(checkGate({...clear,gas:'yes'}).urgent,true);
  assert.equal(checkGate({...clear,hot:'yes'}).urgent,true);
  assert.equal(checkGate({...clear,swollen:'yes'}).urgent,false);
});
test('a held battery stays blocked despite a clear new checklist',()=>{
  assert.equal(checkGate(clear,'hold').allowed,false);
  assert.equal(resolveStatus('hold','within_range'), 'hold');
  assert.equal(resolveStatus('hold','approved'), 'hold');
});
test('invalid profiles cannot become valid load tests',()=>{
  for(const delta of [{resistance:0},{voltage:NaN},{duration:-1},{tolerance:0},{voltage:Infinity}])
    assert.ok(validateProfile({...profile,...delta}).length);
});
test('normal sample stays review-required, not approved',()=>{
  const result=assess({answers:clear,profile,samples:[{t:0,voltage:11.95,current:1.195},{t:10,voltage:11.9,current:1.19}],completed:true});
  assert.equal(result.outcome,'within_range');
  assert.equal(result.reviewRequired,true);
});
test('an intermediate excursion is not hidden by a normal last reading',()=>{
  assert.equal(assess({answers:clear,profile,samples:[{t:0,voltage:10,current:1},{t:10,voltage:12,current:1.2}],completed:true}).outcome,'needs_testing');
});
test('aborted, short, empty and invalid measurements cannot pass',()=>{
  for(const opts of [
    {samples:[{t:0,voltage:12,current:1.2},{t:10,voltage:12,current:1.2}],completed:false},
    {samples:[{t:0,voltage:12,current:1.2},{t:2,voltage:12,current:1.2}],completed:true},
    {samples:[],completed:true},
    {samples:[{t:0,voltage:12,current:1.2},{t:10,voltage:NaN,current:1.2}],completed:true}
  ]) assert.notEqual(assess({answers:clear,profile,...opts}).outcome,'within_range');
});
test('physical hazard always dominates electrical readings',()=>{
  assert.equal(assess({answers:{...clear,impact:'yes'},profile,samples:[{t:0,voltage:12,current:1.2},{t:10,voltage:12,current:1.2}],completed:true}).outcome,'hold');
});
test('inventory validates identifiers, duplicates, numeric profiles and status',()=>{
  const record={id:'BAT-001',name:'Test pack',chemistry:'LiPo',cells:3,capacity:2200,status:'needs_testing',profile};
  assert.equal(validateInventory({batteries:[record]}).length,1);
  for(const batteries of [[record,record],[{...record,status:'made-up'}],[{...record,profile:{...profile,resistance:0}}],[{...record,id:'bad/id'}]])
    assert.throws(()=>validateInventory({batteries}));
});
