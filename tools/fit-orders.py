# 실제 녹음에서 잰 차수 세기(목표)에 맞춰 합성 배음표(ord: 중간 rpm, ordHi: 고회전)와 거친 질감(grit)을 자동 보정
# 반복: 설정으로 풀가속 합성(render-pull.mjs) → 같은 측정기(measure-orders.py, 정답 rpm 사용) → 차수별 차이만큼 세기 보정
# 사용: python3 -P tools/fit-orders.py <index.html> <엔진id> <실린더수> <목표 JSON 파일> <결과 JSON 파일>
#   목표 JSON: {"mid": {"3": -12, "9": -15, ...}, "hi": {...}}  (점화 기본음 = 0dB, 기본음 자체는 빼고)
import sys, json, subprocess, os, tempfile
html, eid, cyl, tgt_path, out_path = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5]
here = os.path.dirname(os.path.abspath(__file__)); fire = cyl / 2
tgt = json.load(open(tgt_path)); bands = {'mid': '3000-5000', 'hi': '7000-99999'}
amp = {k: {float(o): 10 ** (v / 20) for o, v in tgt[k].items()} for k in tgt}
for k in amp: amp[k][fire] = 1.0
grit = 0.35; tmp = tempfile.mkdtemp()
def measure(over):
    json.dump(over, open(f'{tmp}/over.json', 'w'))
    subprocess.run(['node', f'{here}/render-pull.mjs', html, eid, f'{tmp}/p.wav', f'{tmp}/over.json'], check=True)
    out = subprocess.run(['python3', '-P', f'{here}/measure-orders.py', f'{tmp}/p.wav', str(cyl), '900', '9500', '--json'], capture_output=True, text=True, check=True).stdout
    return json.loads(out.split('JSON ')[1])
for it in range(6):
    over = {'ord': [[o, round(a, 3)] for o, a in sorted(amp['mid'].items())], 'ordHi': [[o, round(a, 3)] for o, a in sorted(amp['hi'].items())],
            'grit': round(grit, 3), 'toneHz': 30000, 'am': 0.12}
    m = measure(over); errs = []; stuck = 0
    for k, b in bands.items():
        got = m.get(b, {}).get('차수', {})
        for o, v in tgt[k].items():
            if o not in got: continue
            d = v - got[o]; errs.append(abs(d))
            o = float(o); amp[k][o] = min(4.0, max(0.001, amp[k][o] * 10 ** (d / 20 * 0.8)))
            if d < -3 and amp[k][o] <= 0.002: stuck += 1          # 배음을 0으로 해도 너무 셈 = 거친 질감(펄스) 탓
    if stuck: grit *= 0.75
    print(f'{eid} 반복 {it + 1}: 평균 차이 {sum(errs) / len(errs):.1f}dB, 최대 {max(errs):.1f}dB, grit {grit:.2f}', flush=True)
json.dump(over, open(out_path, 'w'), ensure_ascii=False)
