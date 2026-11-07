// 앱의 실제 합성 코드(WORKLET)를 Node에서 돌려 데모 WAV를 만든다: 공회전 → 풀가속(변속) → 페달 뗌(팝콘) → 공회전
import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const js = html.split('<script>')[1].split('</script>')[0];
const W = js.split('const WORKLET = `')[1].split('`;')[0];
const engSrc = js.split('const ENGINES = {')[1].split('\n};')[0];
const even = (n) => Array.from({length:n}, (_, i) => i * 720 / n);
const ENGINES = eval('({' + engSrc + '})');
const sr = 48000; let Proc;
globalThis.sampleRate = sr; globalThis.currentTime = 0;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage:null }; } };
globalThis.registerProcessor = (n, c) => { Proc = c; };
eval(W);
function wav(path, data){ const b = Buffer.alloc(44 + data.length*2);
  b.write('RIFF',0); b.writeUInt32LE(36+data.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(data.length*2,40);
  data.forEach((x,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2)); fs.writeFileSync(path,b); }
for (const id of process.argv.slice(4)){
  const E = ENGINES[id], p = new Proc(); p.port.onmessage({data:{def:E}});
  const gearV = (E.gearKmh || []).map(k => k/3.6*Math.min(1, 201*1.25/E.vmax));
  const N = 128, out = []; let v = 0, gear = 0, cut = 0, t = 0;
  const total = 13;
  while (t < total){
    const dt = N/sr; let load = 0, ov = 0, rpm;
    if (t < 1.5){ rpm = E.idle; }
    else if (t < 7.5){ const a = Math.min(7, 0.8*340000/(2268*Math.max(v,1)))*0.85; v += a*dt; load = 1;
      rpm = Math.max(E.redline * v / gearV[gear], E.idle + (E.redline*0.38 - E.idle));
      if (rpm > E.redline*0.95 && gear < gearV.length-1){ gear++; cut = E.shiftCutS || .13; if (E.shiftBang) p.port.onmessage({data:{bang:1}}); rpm = E.redline * v / gearV[gear]; } }
    else if (t < 11.5){ v = Math.max(0, v - 1.6*dt); ov = 0.6; rpm = Math.max(E.idle, E.redline * v / gearV[gear]); }
    else { rpm = E.idle; }
    if (cut > 0){ cut -= dt; load = 0.1; ov = Math.max(ov, 0.7); }
    const L = new Float32Array(N), params = { rpm:[rpm], load:[load], overrun:[ov], boost:[0], pops:[1] };
    globalThis.currentTime = t; p.process([], [[L]], params);
    for (const x of L) out.push(x); t += dt;
  }
  let pk = 0; for (const x of out) pk = Math.max(pk, Math.abs(x));
  wav(`${process.argv[3]}/${id}.wav`, out.map(x => x/pk*0.9));
  console.log(id, 'ok', (out.length/sr).toFixed(1)+'s', 'peak', pk.toFixed(2));
}
