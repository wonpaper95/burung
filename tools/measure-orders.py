# 녹음에서 엔진 차수(배음) 지문을 rpm 구간별로 측정
# 사용: python3 -P tools/measure-orders.py <wav(모노)> <실린더수> <최저rpm> <최고rpm> [--json]
# 1) 0.17초 구간마다 '크랭크 회전 주파수(rpm/60)' 후보별로 점화 기본음(실린더수/2 차)과 배음들의 세기 합을 계산
# 2) 구간을 이어서 rpm이 갑자기 두 배·절반으로 튀지 않는 경로를 고름(옥타브 오류 방지, 비터비)
# 3) 가속 중(rpm 상승) + 신호 뚜렷한 구간만, rpm 구간별로 0.5차 간격 배음 세기(점화 기본음 = 0dB) 중앙값
import sys, json, wave, numpy as np
a = [x for x in sys.argv[1:] if not x.startswith('--')]
path, cyl, rlo, rhi = a[0], int(a[1]), float(a[2]), float(a[3]); as_json = '--json' in sys.argv
w = wave.open(path); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
N, hop = 4096, 1024; win = np.hanning(N); fire = cyl / 2
frames = np.array([np.abs(np.fft.rfft(x[o:o + N] * win)) ** 2 for o in range(0, len(x) - N, hop)])
freqs = np.fft.rfftfreq(N, 1 / sr); logP = np.log10(frames + 1e-12)
# 평탄화: 차 안 녹음은 저음(바람·노면)이 원래 커서 낮은 rpm이 유리해짐 → 주변 41칸 평균 대비 '튀어나온 정도'만 사용
k = 41; c = np.cumsum(np.pad(logP, ((0, 0), (k // 2 + 1, k // 2)), mode='edge'), axis=1)
logW = np.clip(logP - (c[:, k:] - c[:, :-k]) / k, 0, None)
grid = np.arange(rlo / 60, rhi / 60, 0.5)                       # 크랭크 회전 주파수 후보(0.5Hz 간격)
def at(order, fr):                                               # 해당 주파수 주변(±1.5%) 최대값 위치
    f = order * fr; lo, hi = np.searchsorted(freqs, f * 0.985), np.searchsorted(freqs, f * 1.015) + 1
    return lo, max(hi, lo + 1)
# 후보별 점수: 점화 기본음 배수 1~6 의 로그 세기 합 − 반 배수(점화음 사이) 세기 (반 배수가 크면 rpm을 반으로 잘못 본 것)
score = np.zeros((len(frames), len(grid)))
for j, fr in enumerate(grid):
    s = 0
    for h in range(1, 7):
        lo, hi = at(h * fire, fr); s = s + logW[:, lo:hi].max(axis=1)
    for h in (0.5, 1.5, 2.5):
        lo, hi = at(h * fire, fr); s = s - 0.6 * logW[:, lo:hi].max(axis=1)
    score[:, j] = s
# 비터비: 구간 사이 rpm 변화는 작게(최대 ±8%), 변화량에 비례해 감점
lg = np.log(grid); cost = score.copy(); back = np.zeros(score.shape, dtype=int)
for t in range(1, len(frames)):
    jump = np.abs(lg[:, None] - lg[None, :]); trans = cost[t - 1][None, :] - 25 * jump - np.where(jump > 0.08, 1e9, 0)
    back[t] = trans.argmax(axis=1); cost[t] = score[t] + trans.max(axis=1)
path_j = np.zeros(len(frames), dtype=int); path_j[-1] = cost[-1].argmax()
for t in range(len(frames) - 1, 0, -1): path_j[t - 1] = back[t, path_j[t]]
fr_t = grid[path_j]; rpm = fr_t * 60
import os
if os.path.exists(path + '.rpm.json'):   # 합성음: 정답 rpm(10ms 간격)이 있으면 그걸 씀
    known = np.array(json.load(open(path + '.rpm.json'))); tc = (np.arange(len(frames)) * hop + N / 2) / sr
    rpm = np.interp(tc * 100, np.arange(len(known)), known); fr_t = rpm / 60
slope = np.gradient(np.convolve(rpm, np.ones(5) / 5, mode='same')) / (hop / sr)   # rpm/초
orders = np.arange(0.5, 40.01, 0.5)
def profile(t):
    fr = fr_t[t]; lo, hi = at(fire, fr); base = frames[t, lo:hi].max()
    out = []
    for o in orders:
        lo, hi = at(o, fr)
        out.append(np.nan if hi >= len(freqs) or o * fr > 10000 else 10 * np.log10(frames[t, lo:hi].max() / base))
    lo, hi = at(fire, fr); band = frames[t, max(1, lo - 30):hi + 30]
    return np.array(out), 10 * np.log10(base / np.median(band))
res = {}
bands = [(0, 3000), (3000, 5000), (5000, 7000), (7000, 99999)]
for b0, b1 in bands:
    ts = [t for t in range(len(frames)) if b0 <= rpm[t] < b1 and slope[t] > 150]
    profs = [(profile(t)) for t in ts]; profs = [p for p, sal in profs if sal > 10]
    if len(profs) < 8: continue
    med = np.nanmedian(np.array(profs), axis=0)
    res[f"{b0}-{b1}"] = {"구간수": len(profs), "차수": {f"{o:g}": round(float(v), 1) for o, v in zip(orders, med) if not np.isnan(v)}}
print(f"rpm 추적: 중앙 {np.median(rpm):.0f}, 상위10% {np.percentile(rpm, 90):.0f}, 최고 {rpm.max():.0f} · 가속 구간 {np.mean(slope > 150) * 100:.0f}%")
for k, v in res.items():
    top = sorted(v["차수"].items(), key=lambda kv: -kv[1])[:12]
    print(f"[{k}rpm 가속중 {v['구간수']}개] " + ", ".join(f"{o}차 {p:+.0f}" for o, p in sorted(top, key=lambda kv: float(kv[0]))))
if as_json: print("JSON " + json.dumps(res, ensure_ascii=False))
if '--track' in sys.argv:   # rpm 흐름 저장(풀가속 구간 찾기용): [시각(초), rpm]
    json.dump([[round(float((t * hop + N / 2) / sr), 3), round(float(r))] for t, r in enumerate(rpm)], open(path + '.track.json', 'w'))
