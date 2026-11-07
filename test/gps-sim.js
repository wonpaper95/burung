// GPS 주행 시나리오 시험. 앱 페이지(localhost)에서 불러와 실행:
//   const s = document.createElement('script'); s.src = 'test/gps-sim.js'; document.body.append(s);  →  await runSuite()
// 진짜 GPS 대신 테슬라 같은 가짜 신호(1km/h 단위, 초당 4회, 정차 중 침묵, 흔들림·누락)를 넣고,
// 가상 시계로 앱의 tick()을 33ms씩 직접 돌려서 결과를 잰다. 실제 앱 코드 그대로 사용.
(() => {
  const flat = (k) => () => k, ramp = (a, b, s) => (t) => a + (b - a) * Math.min(1, t/s);
  const by = (rows, tag) => rows.filter(r => r.tag === tag);
  const avgErr = (rs) => rs.reduce((s, r) => s + Math.abs(r.real - r.shown), 0) / rs.length;
  const gearSeq = (rs) => rs.map(r => r.g).filter((g, i, a) => i === 0 || g !== a[i-1]);
  const firstReact = (rs) => { const i = rs.findIndex(r => r.rpm > E.idle + 400); return i < 0 ? Infinity : rs[i].t - rs[0].t; };
  const share = (rs, f) => rs.filter(f).length / rs.length;

  function runScn(steps){
    setMode('gps'); G.last = null; G.hist = []; G.a = 0; G.aLift = 0; G.aS = 0; G.noise = 0; G.lat = 0; S.gear = 0; S.vShown = 0; S.loadS = 0; S.ovOn = false; S.revRpm = E.idle; S.lastShift = 0; S.shiftCut = 0; S.decT = 0;
    let VT = 1e6; const realNow = performance.now; performance.now = () => VT; lastT = VT;
    const t0 = 1.7e12 + Math.round(Math.random()*1e8); let simT = 0, dist = 0; const rows = [];
    try {
      for (const st of steps){
        const start = simT, end = simT + st.dur; let nextFix = simT + (st.phase || 0);
        while (simT < end - 1e-9){
          const v = st.v(simT - start); dist += (v/3.6) * 0.033;
          if (st.hz && simT >= nextFix - 1e-9){
            if (!(st.drop && Math.random() < st.drop)){
              const meas = Math.max(0, Math.floor(v + (st.jitter ? (Math.random()*2-1)*st.jitter : 0)));
              onFix({timestamp: t0 + Math.round(simT*1000), coords: {latitude: 35.87 + dist/111320, longitude: 128.6, speed: st.noSpeed ? null : meas/3.6, accuracy: 4, heading: 0}});
            }
            nextFix += 1/st.hz;
          }
          const cutBefore = S.shiftCut > 0;   // 이번 tick에 변속 팝이 쓰였는지
          VT += 33; simT += 0.033; tick();
          const rf = S.rpm / E.redline;
          rows.push({t: simT, tag: st.tag, real: v, shown: S.v*3.6, g: S.gear+1, rpm: Math.round(S.rpm), load: S.load, ov: S.overrun > 0 && !cutBefore && S.rpm < E.redline*0.97,   /* 변속 팝·리미터는 정상이라 제외 */ cue: S.v > 3 && S.load > 0.45 && rf > 0.55 && !S.overrun});
        }
      }
    } finally { performance.now = realNow; lastT = performance.now(); }
    return rows;
  }

  window.runSuite = () => {
    navigator.geolocation.watchPosition = () => 0; navigator.geolocation.getCurrentPosition = () => 0;   // 진짜 GPS 차단
    const out = [], check = (name, value, ok, note) => out.push({시험: name, 결과: value, 통과: ok ? 'O' : 'X', 기준: note});
    let rows;

    rows = runScn([{tag:'대기',dur:1.5,hz:4,v:flat(0)},{tag:'출발',dur:7.7,hz:4,v:ramp(0,50,7.7)},{tag:'정속',dur:2,hz:4,v:flat(50)},
                   {tag:'제동',dur:5.5,hz:4,v:ramp(50,0,5.5)},{tag:'신호대기',dur:4,hz:0,v:flat(0)},{tag:'재출발',dur:3,hz:4,v:ramp(0,20,3)}]);
    const wait = by(rows,'신호대기').slice(-60);
    check('A 시내: 신호대기 중 속도', Math.max(...wait.map(r => Math.round(r.shown))) + 'km/h', wait.every(r => r.shown < 0.5), '0km/h');
    check('A 시내: 제동 중 팝콘', Math.round(share(by(rows,'제동'), r => r.ov)*100) + '%', share(by(rows,'제동'), r => r.ov) > 0.5, '50% 넘게');
    check('A 시내: 재출발 때 잘못된 팝콘', by(rows,'재출발').filter(r => r.ov).length + '회', !by(rows,'재출발').some(r => r.ov), '0회');
    check('A 시내: 표시 속도 오차', avgErr(rows).toFixed(1) + 'km/h', avgErr(rows) < 1.5, '1.5km/h 미만');

    const reacts = [0, 0.05, 0.1, 0.15, 0.2].map(ph => firstReact(by(runScn([{tag:'제동',dur:1.5,hz:4,v:ramp(8,0,1.2)},{tag:'대기',dur:2,hz:0,v:flat(0)},{tag:'출발',dur:1.5,hz:4,phase:ph,v:ramp(0,20,3)}]),'출발')));
    check('출발 반응(초당 4회 신호)', reacts.map(x => x.toFixed(2)).join(', ') + '초', Math.max(...reacts) < 0.5, '모두 0.5초 미만');

    rows = runScn([{tag:'정속60',dur:2,hz:4,v:flat(60)},{tag:'합류',dur:5,hz:4,v:ramp(60,130,5)},{tag:'정속130',dur:4,hz:4,v:flat(130)}]);
    const mg = by(rows,'합류');
    check('B 고속 합류: 최고 rpm', Math.max(...mg.map(r => r.rpm)) + 'rpm', Math.max(...mg.map(r => r.rpm)) > E.redline*0.85, '레드라인 85% 넘게');
    check('B 고속 합류: 팝콘 신호 표시', Math.round(share(mg, r => r.cue)*100) + '%', share(mg, r => r.cue) > 0.3, '30% 넘게');
    check('B 고속 합류: 130 순항 기어', gearSeq(by(rows,'정속130')).join('→') + '단', gearSeq(by(rows,'정속130').slice(-30)).length === 1, '순항 중 기어 고정');

    rows = runScn([{tag:'정속',dur:3,hz:4,v:flat(90)},{tag:'터널',dur:8,hz:0,v:flat(90)},{tag:'복귀',dur:3,hz:4,v:flat(88)}]);
    const tun = by(rows,'터널'), back = by(rows,'복귀');
    check('C 터널 8초: 끊긴 동안 속도', Math.min(...tun.map(r => Math.round(r.shown))) + '~' + Math.max(...tun.map(r => Math.round(r.shown))) + 'km/h', tun.every(r => Math.abs(r.shown - 90) < 5), '90±5km/h 유지');
    check('C 터널 8초: 잘못된 팝콘', tun.concat(back).filter(r => r.ov).length + '회', !tun.concat(back).some(r => r.ov), '0회');

    rows = runScn([{tag:'정속',dur:2,hz:4,v:flat(80)},{tag:'흔들림',dur:15,hz:4,v:flat(80),jitter:2.5}]);
    const jt = by(rows,'흔들림');
    check('D 심한 흔들림 ±2.5km/h: 잘못된 팝콘', Math.round(share(jt, r => r.ov)*100) + '%', share(jt, r => r.ov) < 0.05, '5% 미만');
    check('D 심한 흔들림 ±2.5km/h: 기어 바뀜', (gearSeq(jt).length - 1) + '번', gearSeq(jt).length - 1 <= 4, '15초에 4번 이하');

    rows = runScn([{tag:'대기',dur:1,hz:4,v:flat(0),noSpeed:true},{tag:'가속',dur:6,hz:4,v:ramp(0,60,6),noSpeed:true},{tag:'정속',dur:4,hz:4,v:flat(60),noSpeed:true}]);
    check('E 속도값 없이 위치만: 정속 오차', avgErr(by(rows,'정속')).toFixed(1) + 'km/h', avgErr(by(rows,'정속')) < 2, '2km/h 미만');

    rows = runScn([{tag:'대기',dur:1,hz:4,v:flat(0)},{tag:'가속',dur:6,hz:4,drop:0.3,v:ramp(0,70,6)},{tag:'정속',dur:4,hz:4,drop:0.3,v:flat(70)}]);
    check('F 신호 30% 누락: 속도 오차', avgErr(rows).toFixed(1) + 'km/h', avgErr(rows) < 1.5, '1.5km/h 미만');
    const steady = by(rows,'정속');
    check('F 신호 30% 누락: 정속 중 잘못된 팝콘', steady.filter(r => r.ov).length + '회', !steady.some(r => r.ov), '0회(변속 팝 제외)');

    rows = runScn([{tag:'정속',dur:2,hz:4,v:flat(80)},{tag:'보통흔들림',dur:15,hz:4,v:flat(80),jitter:1}]);
    check('G 보통 흔들림 ±1km/h: 잘못된 팝콘', Math.round(share(by(rows,'보통흔들림'), r => r.ov)*100) + '%', !by(rows,'보통흔들림').some(r => r.ov), '0%');
    check('G 보통 흔들림 ±1km/h: 기어 바뀜', (gearSeq(by(rows,'보통흔들림')).length - 1) + '번', gearSeq(by(rows,'보통흔들림')).length - 1 <= 2, '15초에 2번 이하');

    // 페달 뗀 뒤 팝콘 시작까지: 4m/s² 가속 → 회생제동 -1.2m/s²
    rows = runScn([{tag:'가속',dur:4,hz:4,v:ramp(0,40,4)},{tag:'뗌',dur:2,hz:4,v:(t) => 40 - 1.2*3.6*t}]);
    const lift = by(rows,'뗌'), li = lift.findIndex(r => r.ov), liftT = li < 0 ? Infinity : lift[li].t - lift[0].t;
    check('H 페달 뗀 뒤 팝콘 시작', liftT.toFixed(2) + '초', liftT < 0.6, '0.6초 미만');

    return {엔진: E.name, 통과: out.filter(r => r.통과 === 'O').length + '/' + out.length, 상세: out};
  };
})();
