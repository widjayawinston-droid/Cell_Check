import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTelemetry,createLineParser,liveReady,ArduinoSerial} from '../dist/serial.js';
const message={type:'telemetry',battery_id:'BAT-001',seq:5,ms:1000,voltage:11.91,current:1.191,load_ohm:10,load_active:true};
test('Arduino telemetry preserves measured values, load and identity',()=>{
  assert.deepEqual(parseTelemetry(JSON.stringify(message)),{batteryId:'BAT-001',seq:5,ms:1000,voltage:11.91,current:1.191,loadOhm:10,loadActive:true});
});
test('partial USB chunks and CRLF lines reassemble correctly',()=>{
  const frames=[],errors=[],feed=createLineParser(x=>frames.push(x),e=>errors.push(e));
  const payload=JSON.stringify(message)+'\r\n'+JSON.stringify({...message,seq:6,ms:1200})+'\n';
  for(let i=0;i<payload.length;i+=7)feed(payload.slice(i,i+7));
  assert.equal(frames.length,2);assert.equal(errors.length,0);assert.equal(frames[1].seq,6);
});
test('invalid, nonnumeric and incomplete messages cannot become measurements',()=>{
  for(const change of [{current:'1.2'},{voltage:null},{voltage:-1},{load_ohm:0},{load_active:'true'},{seq:2.5},{battery_id:''},{ms:-1}])
    assert.throws(()=>parseTelemetry(JSON.stringify({...message,...change})));
});
test('oversized lines are rejected and the parser recovers at newline',()=>{
  const frames=[],errors=[],feed=createLineParser(x=>frames.push(x),e=>errors.push(e));
  feed('a'.repeat(10000)+'\n'+JSON.stringify(message)+'\n');
  assert.equal(errors.length,1);assert.equal(frames.length,1);
});
test('fresh data must match the selected battery and active resistance',()=>{
  const f={...parseTelemetry(JSON.stringify(message)),receivedAt:5000},p={resistance:10};
  assert.equal(liveReady(f,'BAT-001',p,6000),'');
  for(const [frame,id,now] of [[f,'BAT-002',6000],[f,'BAT-001',9000],[{...f,loadActive:false},'BAT-001',6000],[{...f,loadOhm:20},'BAT-001',6000]])
    assert.notEqual(liveReady(frame,id,p,now),'');
});
test('real ReadableStream adapter delivers frames and releases the port',async()=>{
  let closed=false,received=[],end;
  const port={readable:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(message)+'\n'));c.close();}}),async close(){closed=true;}};
  const serial=new ArduinoSerial({onFrame:f=>received.push(f),onError:e=>assert.fail(e.message),onClose:()=>{end=true;}});
  serial.port=port;serial.running=true;await serial.readLoop();
  assert.equal(received.length,1);assert.equal(closed,true);assert.equal(end,true);assert.equal(serial.port,null);assert.equal(port.readable.locked,false);
});
