# 녹음에서 엔진 차수(배음) 지문 측정
# 사용: python3 -I orders.py <wav> <실린더수> <최저rpm> <최고rpm>
# 1) 짧은 구간마다 '크랭크 회전 주파수'(rpm/60)를 찾음: 점화 기본음(실린더수/2 차)과 그 배음들의 합이 가장 큰 후보
# 2) 그 rpm에서 0.5차 간격으로 각 차수의 세기를 잼 (점화 기본음 = 0dB 기준)
# 3) 신호가 뚜렷한 구간들의 중앙값 → 이 엔진 소리의 '차수 지문'
import sys, wave, numpy as np
path, cyl, rlo, rhi = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
w = wave.open(path); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
N, hop = 8192, 2048; win = np.hanning(N); fire = cyl / 2
orders = np.arange(0.5, 40.01, 0.5)
def amp_at(P, f):
    k = f * N / sr
    if k >= len(P) - 3: return np.nan
    i = int(round(k)); return P[max(0, i - 2): i + 3].max()      # ±2빈(±6Hz) 안 최대값
rows = []
for o in range(0, len(x) - N, hop):
    seg = x[o:o + N]
    if np.sqrt(np.mean(seg ** 2)) < 1e-3: continue
    P = np.abs(np.fft.rfft(seg * win)) ** 2
    cands = np.arange(rlo / 60, rhi / 60, 0.25); best, bestf = -1e9, None
    for fr in cands:
        hs = [amp_at(P, h * fire * fr) for h in range(1, 7)]
        if any(np.isnan(hs)): continue
        sc = np.sum(np.log10(np.array(hs) + 1e-12))
        # 반 차수 오류 방지: 점화 기본음 사이(중간)가 기본음보다 크면 감점
        mid = amp_at(P, (1.5) * fire * fr)
        sc -= 0.5 * max(0, np.log10(mid + 1e-12) - np.log10(hs[0] + 1e-12))
        if sc > best: best, bestf = sc, fr
    if bestf is None: continue
    base = amp_at(P, fire * bestf)
    prof = np.array([10 * np.log10((amp_at(P, od * bestf) + 1e-12) / (base + 1e-12)) for od in orders])
    # 뚜렷함: 점화 기본음이 주변 잡음보다 얼마나 큰지
    kb = int(fire * bestf * N / sr); noise = np.median(P[max(1, kb - 40): kb + 40])
    rows.append((bestf * 60, 10 * np.log10(base / (noise + 1e-12)), prof))
rows.sort(key=lambda r: -r[1]); good = rows[: max(5, len(rows) // 3)]
rpms = np.array([r[0] for r in good]); prof = np.nanmedian(np.array([r[2] for r in good]), axis=0)
print(f"분석 구간 {len(rows)}개 중 뚜렷한 {len(good)}개 · rpm 중앙 {np.median(rpms):.0f} (범위 {rpms.min():.0f}~{rpms.max():.0f}) · 점화음 선명도 {np.median([r[1] for r in good]):.1f}dB")
top = sorted([(o, p) for o, p in zip(orders, prof) if not np.isnan(p)], key=lambda t: -t[1])[:14]
print("세기 높은 차수(점화 기본음=0dB):", ", ".join(f"{o:g}차 {p:+.0f}" for o, p in sorted(top)))
print("JSON", [[float(o), round(float(p), 1)] for o, p in zip(orders, prof) if not np.isnan(p)])
