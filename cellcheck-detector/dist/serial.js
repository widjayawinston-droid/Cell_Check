export function parseTelemetry(line) {
  const f=JSON.parse(line);
  if(!f||f.type!=='telemetry'||typeof f.battery_id!=='string'||!/^[-A-Za-z0-9_]{1,48}$/.test(f.battery_id)||!Number.isSafeInteger(f.seq)||f.seq<0||!Number.isSafeInteger(f.ms)||f.ms<0||typeof f.load_active!=='boolean') throw new Error('Invalid telemetry envelope.');
  for(const k of ['voltage','current']) if(typeof f[k]!=='number'||!Number.isFinite(f[k])||f[k]<0||f[k]>10000) throw new Error(`Invalid ${k}.`);
  if(f.load_active&&(typeof f.load_ohm!=='number'||!Number.isFinite(f.load_ohm)||f.load_ohm<=0)) throw new Error('Active load requires a positive load_ohm.');
  if(!f.load_active&&f.load_ohm!==null&&(typeof f.load_ohm!=='number'||!Number.isFinite(f.load_ohm)||f.load_ohm<=0)) throw new Error('Inactive load_ohm must be null or positive.');
  return {batteryId:f.battery_id,seq:f.seq,ms:f.ms,voltage:f.voltage,current:f.current,loadOhm:f.load_ohm,loadActive:f.load_active};
}
export function createLineParser(onFrame,onError) {
  let buffer='',discard=false;
  return chunk=>{
    for(const char of chunk) {
      if(char==='\n') {
        if(!discard&&buffer.trim()) {try{onFrame(parseTelemetry(buffer.trim()));}catch(error){onError(error);}}
        buffer='';discard=false;
      } else if(!discard) {
        buffer+=char;
        if(buffer.length>4096){buffer='';discard=true;onError(new Error('Serial message exceeded 4096 characters.'));}
      }
    }
  };
}
export function liveReady(frame,batteryId,profile,now) {
  if(!frame||now-frame.receivedAt>3000) return 'Waiting for fresh Arduino data.';
  if(frame.batteryId!==batteryId) return `Arduino reports ${frame.batteryId}; select the matching inventory record.`;
  if(!frame.loadActive) return 'Arduino reports the load is off. Start the approved test on the device.';
  if(Math.abs(frame.loadOhm-profile.resistance)>profile.resistance*0.01) return 'Reported load does not match the configured load (±1% agreement required).';
  return '';
}
export class ArduinoSerial {
  constructor({onFrame,onError,onClose}){Object.assign(this,{onFrame,onError,onClose});this.port=null;this.reader=null;this.running=false;this.closing=null;}
  async connect(baudRate=115200) {
    if(!globalThis.navigator?.serial) throw new Error('USB serial is unavailable here. Open this site in desktop Chrome or Edge over HTTPS.');
    if(this.port) throw new Error('A serial port is already open.');
    const port=await navigator.serial.requestPort();
    await port.open({baudRate});
    this.port=port;this.running=true;
    this.loop=this.readLoop();
  }
  async readLoop(){
    const decoder=new TextDecoder();
    const feed=createLineParser(this.onFrame,this.onError);
    try {
      if(!this.port.readable) throw new Error('Serial port is not readable.');
      this.reader=this.port.readable.getReader();
      while(this.running){const {value,done}=await this.reader.read();if(done) break;if(value)feed(decoder.decode(value,{stream:true}));}
    } catch(error){if(this.running)this.onError(error);}
    finally {
      this.running=false;
      this.reader?.releaseLock();this.reader=null;
      try{await this.port?.close();}catch{}
      this.port=null;this.onClose();
    }
  }
  async disconnect(){this.running=false;await this.reader?.cancel();await this.loop;}
}
