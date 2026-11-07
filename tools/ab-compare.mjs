// A/B: 실제 녹음(24kHz mono wav) 뒤에 같은 식으로 레브하는 합성음을 이어 붙임
import fs from 'node:fs';
const [,, html, real, id, out] = process.argv;
const js = fs.readFileSync(html, 'utf8').split('<script>')[1].split('</script>')[0];
const W = js.split('const WORKLET = `')[1].split('`;')[0];
const even = (n) => Array.from({length:n}, (_, i) => i * 720 / n);
const ENGINES = eval('({' + js.split('const ENGINES = {')[1].split('\n};')[0] + '})');
const sr = 24000; let Proc; globalThis.sampleRate = sr; globalThis.currentTime = 0;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage:null }; } };
globalThis.registerProcessor = (n, c) => { Proc = c; }; eval(W);
const rb = fs.readFileSync(real); const realS = []; for (let i = 44; i + 1 < rb.length; i += 2) realS.push(rb.readInt16LE(i)/32768);
const E = ENGINES[id], p = new Proc(); p.port.onmessage({data:{def:E}}); const syn = [], N = 128;
for (let t = 0; t < 5.3; t += N/sr){   // 공회전 → 레브 2번(녹음처럼) 
  const ph = t % 2.6; let rpm = E.idle, load = 0, ov = 0;
  if (ph > 0.6 && ph < 1.3){ rpm = E.idle + (E.redline*0.55 - E.idle) * (ph-0.6)/0.7; load = 1; }
  else if (ph >= 1.3 && ph < 2.3){ rpm = E.redline*0.55 - (E.redline*0.55 - E.idle) * (ph-1.3); ov = 0.6; }
  const L = new Float32Array(N); p.process([], [[L]], {rpm:[rpm], load:[load], overrun:[ov], boost:[0], pops:[1]}); syn.push(...L); }
const norm = (a) => { let pk = 0; for (const x of a) pk = Math.max(pk, Math.abs(x)); return a.map(x => x/pk*0.85); };
const all = [...norm(realS), ...new Array(sr*0.8).fill(0), ...norm(syn)];
const b = Buffer.alloc(44 + all.length*2);
b.write('RIFF',0); b.writeUInt32LE(36+all.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(all.length*2,40);
all.forEach((x,i)=>b.writeInt16LE(Math.round(x*32767),44+i*2)); fs.writeFileSync(out, b);
console.log(`실제 ${(realS.length/sr).toFixed(1)}초 → 합성 ${(syn.length/sr).toFixed(1)}초`);
