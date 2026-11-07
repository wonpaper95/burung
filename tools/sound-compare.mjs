// 앱의 실제 합성 코드로 엔진별 소리를 만들고 스펙트럼(음색 지문)을 비교한다.
// 1) 같은 rpm(5000)·풀부하에서 각 엔진 1초 → 로그 주파수 대역 에너지(60~10kHz, 48개)
// 2) 엔진끼리 상관계수(1=완전 같음) → 평균·최대
// 3) 소리 특성: 밝기(스펙트럼 중심), 클리핑 정도(crest factor)
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
function render(E, rpm, load, sec){ const p = new Proc(); p.port.onmessage({data:{def:E}}); const N = 128, out = [];
  for (let t = 0; t < sec; t += N/sr){ const L = new Float32Array(N); p.process([], [[L]], {rpm:[rpm], load:[load], overrun:[0], boost:[0], pops:[0]}); out.push(...L); } return out.slice(sr*0.3); }
function fft(re, im){ const n = re.length; for (let i = 1, j = 0; i < n; i++){ let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j){ [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1){ const a = -2*Math.PI/len; for (let i = 0; i < n; i += len) for (let k = 0; k < len/2; k++){ const c = Math.cos(a*k), s = Math.sin(a*k), xr = re[i+k+len/2]*c - im[i+k+len/2]*s, xi = re[i+k+len/2]*s + im[i+k+len/2]*c; re[i+k+len/2] = re[i+k]-xr; im[i+k+len/2] = im[i+k]-xi; re[i+k] += xr; im[i+k] += xi; } } }
function spectrum(x){ const n = 8192, P = new Float64Array(n/2); let frames = 0;
  for (let o = 0; o + n <= x.length; o += n/2){ const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = x[o+i] * (0.5 - 0.5*Math.cos(2*Math.PI*i/n)); fft(re, im); for (let k = 0; k < n/2; k++) P[k] += re[k]**2 + im[k]**2; frames++; }
  const bands = 48, lo = Math.log(60), hi = Math.log(10000), e = new Array(bands).fill(1e-12);
  for (let k = 1; k < n/2; k++){ const f = k*sr/n; if (f < 60 || f >= 10000) continue; e[Math.floor((Math.log(f)-lo)/(hi-lo)*bands)] += P[k]; }
  let c = 0, tot = 0; for (let k = 1; k < n/2; k++){ c += k*sr/n*P[k]; tot += P[k]; }
  return {db: e.map(v => 10*Math.log10(v)), centroid: c/tot}; }
const corr = (a, b) => { const ma = a.reduce((s,v)=>s+v,0)/a.length, mb = b.reduce((s,v)=>s+v,0)/b.length; let n=0, da=0, db=0; a.forEach((v,i)=>{ n+=(v-ma)*(b[i]-mb); da+=(v-ma)**2; db+=(b[i]-mb)**2; }); return n/Math.sqrt(da*db); };
const ids = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(ENGINES);
const S = {}, info = {};
for (const id of ids){ const E = ENGINES[id], x = render(E, Math.min(5000, E.redline*0.8), 1, 1.5); S[id] = spectrum(x);
  let pk = 0, rms = 0; for (const v of x){ pk = Math.max(pk, Math.abs(v)); rms += v*v; } rms = Math.sqrt(rms/x.length);
  info[id] = `밝기 ${Math.round(S[id].centroid)}Hz, 크레스트 ${(20*Math.log10(pk/rms)).toFixed(1)}dB`; }
const pairs = []; for (let i = 0; i < ids.length; i++) for (let j = i+1; j < ids.length; j++) pairs.push([ids[i]+'~'+ids[j], corr(S[ids[i]].db, S[ids[j]].db)]);
pairs.sort((a,b) => b[1]-a[1]);
console.log('엔진 음색 상관(1=같음) 평균', (pairs.reduce((s,p)=>s+p[1],0)/pairs.length).toFixed(3));
console.log('가장 비슷한 쌍:', pairs.slice(0,6).map(p => p[0]+' '+p[1].toFixed(3)).join(', '));
console.log('가장 다른 쌍:', pairs.slice(-3).map(p => p[0]+' '+p[1].toFixed(3)).join(', '));
for (const id of ids) console.log(id.padEnd(6), info[id]);
