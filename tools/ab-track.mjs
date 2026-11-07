// A/B: 실제 녹음 구간 → 쉼 → 같은 rpm 흐름(측정기가 추적한 rpm)을 그대로 따라가는 합성음
// 사용: node tools/ab-track.mjs <index.html> <엔진id> <실제.wav(24k 모노)> <시작초> <길이초> <track.json> <out.wav>
import fs from 'node:fs';
const [,, html, id, realPath, st, du, trackPath, out] = process.argv; const start = +st, dur = +du;
const js = fs.readFileSync(html, 'utf8').split('<script>')[1].split('</script>')[0];
const W = js.split('const WORKLET = `')[1].split('`;')[0];
const even = (n) => Array.from({length:n}, (_, i) => i * 720 / n);
const ENGINES = eval('({' + js.split('const ENGINES = {')[1].split('\n};')[0] + '})');
const sr = 24000; let Proc; globalThis.sampleRate = sr; globalThis.currentTime = 0;
globalThis.AudioWorkletProcessor = class { constructor(){ this.port = { postMessage(){}, onmessage:null }; } };
globalThis.registerProcessor = (n, c) => { Proc = c; }; eval(W);
const rb = fs.readFileSync(realPath); const real = [];
for (let i = Math.round(start*sr); i < Math.round((start+dur)*sr); i++) real.push(rb.readInt16LE(44 + i*2) / 32768);
const tr = JSON.parse(fs.readFileSync(trackPath, 'utf8'));
const rpmAt = (t) => { let k = tr.findIndex(p => p[0] >= t); if (k <= 0) return tr[Math.max(0,k)][1]; const [t0, r0] = tr[k-1], [t1, r1] = tr[k]; return r0 + (r1 - r0)*(t - t0)/(t1 - t0); };
const E = ENGINES[id], p = new Proc(); p.port.onmessage({data:{def:E}}); const syn = [], N = 128;
for (let t = 0; t < dur; t += N/sr){
  const r = rpmAt(start + t), slope = (rpmAt(start + t + 0.15) - rpmAt(start + t - 0.15)) / 0.3;
  const L = new Float32Array(N); p.process([], [[L]], {rpm:[r], load:[slope > -200 ? 1 : 0], overrun:[slope < -800 ? 0.6 : 0], boost:[1], pops:[1]}); syn.push(...L);
}
const norm = (a) => { let s = 0; for (const x of a) s += x*x; const rms = Math.sqrt(s/a.length); return a.map(x => Math.max(-1, Math.min(1, x/rms*0.18))); };   // 같은 평균 크기로
const all = [...norm(real), ...new Array(Math.round(sr*0.8)).fill(0), ...norm(syn)];
const b = Buffer.alloc(44 + all.length*2);
b.write('RIFF',0); b.writeUInt32LE(36+all.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(all.length*2,40);
all.forEach((x,i)=>b.writeInt16LE(Math.round(x*32767),44+i*2)); fs.writeFileSync(out, b);
