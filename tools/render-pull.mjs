// 풀가속 소리 렌더(분석용): 공회전 1초 → 2,000rpm에서 레드라인까지 풀부하로 회전 상승(10초) → 다시 반복(3번)
// 사용: node tools/render-pull.mjs <index.html> <엔진id> <out.wav> [덮어쓸 설정 JSON]
import fs from 'node:fs';
const [,, html, id, out, over] = process.argv;
const js = fs.readFileSync(html, 'utf8').split('<script>')[1].split('</script>')[0];
const W = js.split('const WORKLET = `')[1].split('`;')[0];
const even = (n) => Array.from({length:n}, (_, i) => i * 720 / n);
const ENGINES = eval('({' + js.split('const ENGINES = {')[1].split('\n};')[0] + '})');
const sr = 24000; let Proc; globalThis.sampleRate = sr; globalThis.currentTime = 0;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage:null }; } };
globalThis.registerProcessor = (n, c) => { Proc = c; }; eval(W);
const E = Object.assign({}, ENGINES[id], over ? JSON.parse(fs.readFileSync(over, 'utf8')) : {});
const p = new Proc(); p.port.onmessage({data:{def:E}}); const s = [], N = 128;
for (let t = 0; t < 33; t += N/sr){
  const ph = t % 11; let rpm = E.idle, load = 0;
  if (ph > 1){ rpm = 2000 + (E.redline*0.97 - 2000) * (ph - 1)/10; load = 1; }
  const L = new Float32Array(N); p.process([], [[L]], {rpm:[rpm], load:[load], overrun:[0], boost:[load], pops:[0]}); s.push(...L);
}
let pk = 0; for (const x of s) pk = Math.max(pk, Math.abs(x));
const b = Buffer.alloc(44 + s.length*2);
b.write('RIFF',0); b.writeUInt32LE(36+s.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(s.length*2,40);
s.forEach((x,i)=>b.writeInt16LE(Math.round(x/pk*0.9*32767),44+i*2)); fs.writeFileSync(out, b);
// 정답 rpm(10ms 간격) → 측정기가 rpm 추적 대신 사용
const rpmAt = (t) => { const ph = t % 11; return ph > 1 ? 2000 + (E.redline*0.97 - 2000) * (ph - 1)/10 : E.idle; };
fs.writeFileSync(out + '.rpm.json', JSON.stringify(Array.from({length: 3300}, (_, i) => rpmAt(i/100))));
