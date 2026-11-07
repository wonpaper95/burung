// 엔진 모음 데모: 엔진마다 [공회전 1초 → 풀가속 3.5초(레드라인 근처까지 회전 상승) → 페달 뗌 2초] + 쉼 0.6초, 한 파일로
import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const js = html.split('<script>')[1].split('</script>')[0];
const W = js.split('const WORKLET = `')[1].split('`;')[0];
const even = (n) => Array.from({length:n}, (_, i) => i * 720 / n);
const ENGINES = eval('({' + js.split('const ENGINES = {')[1].split('\n};')[0] + '})');
const sr = 48000; let Proc; globalThis.sampleRate = sr; globalThis.currentTime = 0;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage:null }; } };
globalThis.registerProcessor = (n, c) => { Proc = c; }; eval(W);
const ids = process.argv.slice(4), out = [], N = 128, marks = [];
for (const id of ids){
  const E = ENGINES[id], p = new Proc(); p.port.onmessage({data:{def:E}}); marks.push(`${(out.length/sr).toFixed(1)}s ${E.name}`);
  for (let t = 0; t < 6.5; t += N/sr){
    let rpm, load = 0, ov = 0;
    if (t < 1) rpm = E.idle;
    else if (t < 4.5){ const u = (t-1)/3.5; rpm = E.idle*1.5 + (E.redline*0.95 - E.idle*1.5) * Math.pow(u, 0.8); load = 1; }
    else { rpm = E.redline*0.95 - (t-4.5)*E.redline*0.25; ov = 0.7; }
    const L = new Float32Array(N); p.process([], [[L]], {rpm:[rpm], load:[load], overrun:[ov], boost:[load ? Math.min(1,(t-1)/2) : 0], pops:[1]}); out.push(...L);
  }
  for (let i = 0; i < sr*0.6; i++) out.push(0);
}
// 엔진별 소리 크기를 비슷하게(앱에선 압축기가 맞춰 줌) → 전체 최대값으로 정규화
let pk = 0; for (const x of out) pk = Math.max(pk, Math.abs(x));
const b = Buffer.alloc(44 + out.length*2);
b.write('RIFF',0); b.writeUInt32LE(36+out.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(out.length*2,40);
out.forEach((x,i)=>b.writeInt16LE(Math.round(x/pk*0.9*32767),44+i*2)); fs.writeFileSync(process.argv[3], b);
console.log(marks.join('\n'));
