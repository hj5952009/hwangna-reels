// 조립(make) 시험 — 가짜 Worker client · 가짜 AI · 가짜 렌더 (실제 API·영상 굽기 없음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { make, withDisclaimer, DISCLAIMER } from '../make.mjs';
import { CHARACTERS } from '../src/brand.js';
import { outroScene } from '../src/rules.mjs';

const WID = 'w-2026-11-24';
const FIX = JSON.parse(readFileSync(new URL('./fixtures/plan.json', import.meta.url), 'utf8'));
const planFor = (slot) => {
  const p = JSON.parse(JSON.stringify(FIX));
  p.slot = slot; p.week = '12월 1주차'; p.scenes[p.scenes.length - 1] = outroScene(slot);
  return p;
};

function fakeClient(files, { saved = {} } = {}) {
  const states = []; const puts = []; const gets = []; const savedPuts = [];
  return {
    states, puts, gets, savedPuts, saved,
    bundle: async () => ({ meta: { week: '12월 1주차', meet: '2026-12-01', econ: { presenter: '김발표', title: '금리와 환율', notes: '발표 메모: 금리 차이' }, fin: { presenter: '이나침', title: '예금보험' } }, files }),
    get: async (wid, slot, kind, n) => { gets.push(`${slot}/${kind}/${n}`); return Buffer.from(`${slot}-${kind}-${n}`); },
    putOut: async (wid, slot, kind) => { puts.push(`${slot}/${kind}`); return `https://w.example/m/${slot}-${kind}`; },
    putSaved: async (wid, slot, kind, buf) => { savedPuts.push(`${slot}/${kind}`); saved[`${slot}/${kind}`] = Buffer.from(buf); },
    getSaved: async (wid, slot, kind) => { gets.push(`saved/${slot}/${kind}`); const b = saved[`${slot}/${kind}`]; if (!b) throw new Error('Worker 404: saved'); return b; },
    state: async (wid, slot, st) => { states.push({ slot, ...st }); },
  };
}
const fakeTrack = (wav, lines) => ({ wav, rate: 24000, timing: 'exact', total: lines.length, lines: lines.map((text, i) => ({ text, from: i, to: i + 1, sec: 1, rms: [0.5] })) });
function fakeDeps(over = {}) {
  const calls = { uploadPdf: [], writePlan: [], checkPlan: [], speak: [], splitTrack: [], render: [] };
  const deps = {
    uploadPdf: async (a) => { calls.uploadPdf.push(a); return [{ fileData: { fileUri: 'u', mimeType: 'application/pdf' } }]; },
    writePlan: async (a) => { calls.writePlan.push(a); return planFor(a.meta.slot); },
    checkPlan: async (a) => { calls.checkPlan.push(a); return { ...a.plan, check: [{ scene: 2, action: 'kept', why: '2쪽에 있음' }] }; },
    speak: async (a) => { calls.speak.push(a); writeFileSync(`${a.outDir}.wav`, 'RIFFvoice'); return { wav: `${a.outDir}.wav`, pcm: Buffer.alloc(4), rate: 24000, total: 8 }; },
    splitTrack: (a) => { calls.splitTrack.push(a); return fakeTrack(a.wav, a.lines); },
    render: async (a) => { calls.render.push(a); writeFileSync(a.out, 'mp4'); writeFileSync(`${a.out}.cover.jpg`, 'jpg'); return { mp4: a.out, cover: `${a.out}.cover.jpg`, seconds: 40 }; },
    ...over,
  };
  return { deps, calls };
}
const last = (states, slot) => states.filter((s) => s.slot === slot).at(-1);

test('PDF만 있으면 ready, 상태에 character·timing·check·plan', async () => {
  const c = fakeClient({ econ: { pdf: [0, 1] }, fin: { pdf: [0] } });
  const { deps, calls } = fakeDeps();
  const before = Date.now();
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  for (const slot of ['econ', 'fin']) {
    const s = last(c.states, slot);
    assert.equal(s.state, 'ready', JSON.stringify(s));
    assert.equal(s.character, CHARACTERS[slot].name);
    assert.equal(s.timing, 'exact');
    assert.deepEqual(s.check, [{ scene: 2, action: 'kept', why: '2쪽에 있음' }]);
    assert.equal(s.plan.slot, slot);
    assert.equal(s.video, `https://w.example/m/${slot}-video`);
    assert.equal(s.cover, `https://w.example/m/${slot}-cover`);
    assert.equal(s.seconds, 40);
    assert.ok(s.renderedAt >= before);
    assert.deepEqual(s.warn, []);
  }
  assert.ok(c.gets.includes('econ/pdf/1'));
  // notes·이름이 설계도 요청에 들어가고, 이름은 근거 확인에도 넘김
  assert.equal(calls.writePlan[0].notes, '발표 메모: 금리 차이');
  assert.deepEqual(calls.writePlan[0].meta.names, ['김발표']);
  assert.equal(calls.writePlan[0].meta.week, '12월 1주차');
  assert.deepEqual(calls.checkPlan[0].names, ['김발표']);
  // 슬롯 캐릭터 목소리, 대사 줄 = 장면 say
  assert.equal(calls.speak[1].voice, CHARACTERS.fin.voice);
  assert.equal(calls.speak[1].style, CHARACTERS.fin.style);
  assert.deepEqual(calls.speak[0].lines, planFor('econ').scenes.map((x) => x.say));
  // ready 전에 다시 굽기용 저장 (설계도+줄 경계, 목소리 wav)
  assert.deepEqual(c.savedPuts, ['econ/plan', 'econ/voice', 'fin/plan', 'fin/voice']);
  const saved = JSON.parse(c.saved['econ/plan'].toString());
  assert.equal(saved.plan.slot, 'econ');
  assert.equal(saved.track.wav, undefined, '저장 track에는 wav 경로가 없음');
  assert.equal(saved.track.lines.length, 8);
  assert.equal(c.saved['econ/voice'].toString(), 'RIFFvoice');
  // making 단계 보고
  assert.ok(c.states.some((s) => s.state === 'making' && s.step === '설계도 쓰기'));
});

test('PDF가 없으면 그 칸만 failed "PDF가 없어요", 다른 칸은 계속', async () => {
  const c = fakeClient({ econ: { pdf: [] }, fin: { pdf: [0] } });
  const { deps, calls } = fakeDeps();
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  assert.equal(last(c.states, 'econ').state, 'failed');
  assert.match(last(c.states, 'econ').error, /PDF가 없어요/);
  assert.equal(last(c.states, 'fin').state, 'ready');
  assert.equal(calls.writePlan.length, 1);
});

test('설계도 쓰기가 실패해도 다른 칸은 만들어지고, 키는 오류에 안 남음', async () => {
  const c = fakeClient({ econ: { pdf: [0] }, fin: { pdf: [0] } });
  const { deps } = fakeDeps({ writePlan: async (a) => { if (a.meta.slot === 'econ') throw new Error('설계도를 만들지 못했어요: 키 sk-secret'); return planFor('fin'); } });
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'sk-secret', deps });
  assert.equal(last(c.states, 'econ').state, 'failed');
  assert.match(last(c.states, 'econ').error, /설계도를 만들지 못했어요/);
  assert.ok(!last(c.states, 'econ').error.includes('sk-secret'));
  assert.equal(last(c.states, 'fin').state, 'ready');
});

test('목소리 요청은 편당 1번', async () => {
  const c = fakeClient({ econ: { pdf: [0] }, fin: { pdf: [0] } });
  const { deps, calls } = fakeDeps();
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  assert.equal(calls.speak.length, 2);
  assert.equal(calls.splitTrack.length, 2);
  assert.deepEqual(calls.speak.map((s) => s.lines.length), [8, 8]);
});

// 한 번 만든 뒤 저장본을 가진 client로 다시 굽기
async function madeOnce() {
  const c = fakeClient({ econ: { pdf: [0] }, fin: { pdf: [] } });
  await make({ wid: WID, slots: ['econ'], client: c, key: 'k', deps: fakeDeps().deps });
  return fakeClient({ econ: { pdf: [0] }, fin: { pdf: [] } }, { saved: c.saved });
}

test('다시 굽기: 자막만 고치면 speak 0번, getSaved voice 사용', async () => {
  const c = await madeOnce();
  const { deps, calls } = fakeDeps();
  let voiceAtRender = '';
  const baseRender = deps.render;
  deps.render = async (a) => { voiceAtRender = readFileSync(a.track.wav, 'utf8'); return baseRender(a); };
  const edited = planFor('econ'); edited.scenes[1].text = '원달러 환율 **1,400원** 넘음';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: edited } }, client: c, key: 'k', deps });
  const s = last(c.states, 'econ');
  assert.equal(s.state, 'ready', JSON.stringify(s));
  assert.equal(calls.speak.length, 0);
  assert.equal(calls.writePlan.length, 0); assert.equal(calls.checkPlan.length, 0); assert.equal(calls.uploadPdf.length, 0);
  assert.ok(c.gets.includes('saved/econ/voice') && c.gets.includes('saved/econ/plan'));
  assert.ok(!c.gets.includes('econ/pdf/0'), 'PDF는 다시 받지 않음');
  const r = calls.render[0];
  assert.equal(r.plan.scenes[1].text, '원달러 환율 **1,400원** 넘음');
  assert.equal(voiceAtRender, 'RIFFvoice'); // 저장된 목소리를 파일로 풀어 씀
  assert.equal(r.track.lines.length, 8);
  assert.deepEqual(s.warn, []);
  assert.equal(s.check.length, 1, '저장된 근거 확인 결과를 유지');
  // 다시 저장
  assert.deepEqual(c.savedPuts, ['econ/plan', 'econ/voice']);
});

test('다시 굽기: 대사를 고치면 speak 1번, 새 숫자면 warn', async () => {
  const c = await madeOnce();
  const { deps, calls } = fakeDeps();
  const edited = planFor('econ'); edited.scenes[2].say = '두 나라 금리 차이가 1.5%p까지 벌어졌어요. 미국 금리가 높으면 돈이 미국으로 옮겨 가요.';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: edited } }, client: c, key: 'k', deps });
  const s = last(c.states, 'econ');
  assert.equal(s.state, 'ready', JSON.stringify(s));
  assert.equal(calls.speak.length, 1);
  assert.equal(calls.speak[0].lines[2], edited.scenes[2].say);
  assert.equal(calls.splitTrack.length, 1);
  assert.equal(calls.checkPlan.length, 0, '사람이 고친 대사는 Gemini 사실 검사를 다시 하지 않음');
  assert.equal(s.warn.length, 1);
  assert.match(s.warn[0], /근거 없는 새 숫자: 1\.5/);
});

test('다시 굽기를 두 번 해도 새 숫자 경고는 처음 근거 확인한 설계도와 비교', async () => {
  const c = await madeOnce();
  const edited = planFor('econ'); edited.scenes[2].say = '두 나라 금리 차이가 1.5%p까지 벌어졌어요. 미국 금리가 높으면 돈이 미국으로 옮겨 가요.';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: edited } }, client: c, key: 'k', deps: fakeDeps().deps });
  const c2 = fakeClient({ econ: { pdf: [0] }, fin: { pdf: [] } }, { saved: c.saved });
  const again = structuredClone(edited); again.scenes[1].text = '오타만 고침';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: again } }, client: c2, key: 'k', deps: fakeDeps().deps });
  const s = last(c2.states, 'econ');
  assert.equal(s.state, 'ready', JSON.stringify(s));
  assert.match(String(s.warn[0] || ''), /근거 없는 새 숫자: 1\.5/);
});

test('다시 굽기: 자료 목록(rm)이 7일 지나 지워져도 저장본의 발표자 이름으로 실명을 막음', async () => {
  const c = await madeOnce();
  const c2 = fakeClient({ econ: { pdf: [] }, fin: { pdf: [] } }, { saved: c.saved });
  c2.bundle = async () => ({ meta: { week: '', econ: {}, fin: {} }, files: {} });
  const bad = planFor('econ'); bad.scenes[2].text = '김발표 님 정리';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: bad } }, client: c2, key: 'k', deps: fakeDeps().deps });
  assert.equal(last(c2.states, 'econ').state, 'failed');
  assert.match(last(c2.states, 'econ').error, /실명/);
});

test('다시 굽기: 고친 설계도가 규칙을 어기면 failed (목소리 안 씀)', async () => {
  const c = await madeOnce();
  const { deps, calls } = fakeDeps();
  const bad = planFor('econ'); bad.scenes[5].say += ' 지금 사세요';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: bad } }, client: c, key: 'k', deps });
  assert.equal(last(c.states, 'econ').state, 'failed');
  assert.match(last(c.states, 'econ').error, /권유/);
  assert.equal(calls.speak.length, 0);
});

test('다시 굽기: 장면 종류·data는 저장본을 따른다 (say·text·문구만 바뀜)', async () => {
  const c = await madeOnce();
  const { deps, calls } = fakeDeps();
  const edited = planFor('econ'); edited.scenes[1].data.value = '9,999'; edited.caption = '고친 문구';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: { plan: edited } }, client: c, key: 'k', deps });
  assert.equal(calls.render[0].plan.scenes[1].data.value, '1,400');
  assert.match(last(c.states, 'econ').caption, /^고친 문구/);
});

test('문구는 고지로 끝나고 두 번 붙이지 않음', async () => {
  assert.ok(withDisclaimer('정리 #황금나침반').endsWith(DISCLAIMER));
  const once = withDisclaimer(withDisclaimer('정리'));
  assert.equal(once.split(DISCLAIMER).length - 1, 1);
  assert.match(DISCLAIMER, /투자 권유가 아니에요/);
  // ready 문구 = 설계도 caption + 해시태그 + 고지
  const c = fakeClient({ econ: { pdf: [0] }, fin: { pdf: [] } });
  await make({ wid: WID, slots: ['econ'], client: c, key: 'k', deps: fakeDeps().deps });
  const cap = last(c.states, 'econ').caption;
  assert.ok(cap.startsWith(FIX.caption));
  assert.ok(cap.includes('#황금나침반 #위클리경제 #환율 #금리'));
  assert.ok(cap.endsWith(DISCLAIMER));
});

test('fake 모드: 자료 없이 plan.json으로 끝까지', async () => {
  const c = fakeClient({ econ: { pdf: [] }, fin: { pdf: [] } });
  const renders = [];
  const render = async (a) => { renders.push(a); writeFileSync(a.out, 'mp4'); writeFileSync(`${a.out}.cover.jpg`, 'jpg'); return { mp4: a.out, cover: `${a.out}.cover.jpg`, seconds: 30 }; };
  const { fakeDeps: fake } = await import('../src/fake-ai.mjs');
  const { splitTrack } = await import('../src/split.mjs');
  await make({ wid: 'w-2000-01-01', slots: ['econ', 'fin'], client: c, key: '', fake: true, deps: fake({ render, splitTrack }) });
  for (const slot of ['econ', 'fin']) {
    const s = last(c.states, slot);
    assert.equal(s.state, 'ready', JSON.stringify(s));
    assert.equal(s.plan.slot, slot);
    assert.equal(s.plan.scenes.at(-1).say, CHARACTERS[slot].outro);
  }
  // 사인파 목소리 한 개를 글자 수 비율로 나눔
  const t = renders[0].track;
  assert.equal(t.lines.length, renders[0].plan.scenes.length);
  assert.equal(t.timing, 'estimate');
  assert.ok(t.lines.every((l) => l.sec > 0.5));
  assert.ok(!existsSync(t.wav), '작업 폴더는 끝나면 지움');
});

test('로그에 단계 이름만', async () => {
  const c = fakeClient({ econ: { pdf: [0] }, fin: { pdf: [0] } });
  const logs = []; const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const { deps } = fakeDeps({ writePlan: async (a) => { if (a.meta.slot === 'fin') throw new Error(`설계도를 만들지 못했어요: ${FIX.scenes[0].say}`); return planFor('econ'); } });
    await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  } finally { console.log = orig; }
  assert.ok(logs.length >= 6);
  const all = logs.join('\n');
  for (const s of FIX.scenes) { assert.ok(!all.includes(s.say), `로그에 대사: ${s.say}`); assert.ok(!all.includes(s.text)); }
  assert.ok(!all.includes(FIX.caption) && !all.includes('김발표') && !all.includes('발표 메모'));
  for (const l of logs) assert.match(l, /^\[(econ|fin)\] [가-힣 ]+$/);
});

test('freshBundle: 더 새 요청이 이미 있으면(앞 요청이 합쳐짐) 기다리지 않고 null', async () => {
  const { freshBundle } = await import('../make.mjs');
  const slept = [];
  const b = await freshBundle({ bundle: async () => ({ request: { at: 300, slots: ['econ', 'fin'] } }) }, WID, 200, { sleep: async (ms) => slept.push(ms) });
  assert.equal(b, null);
  assert.equal(slept.length, 0);
});

test('freshBundle: dispatch의 요청 번호와 같은 묶음을 읽을 때까지 기다림 (KV 지역 지연)', async () => {
  const { freshBundle } = await import('../make.mjs');
  let n = 0; const slept = [];
  const client = { bundle: async () => ({ request: { at: n++ < 2 ? 100 : 200 } }) };
  const b = await freshBundle(client, WID, 200, { sleep: async (ms) => slept.push(ms) });
  assert.equal(b.request.at, 200); assert.equal(slept.length, 2);
  await assert.rejects(freshBundle({ bundle: async () => ({ request: { at: 1 } }) }, WID, 2, { sleep: async () => {}, tries: 3 }), /최신 요청/);
  const any = await freshBundle({ bundle: async () => ({ request: { at: 1 } }) }, WID, 0, { sleep: async () => {} });
  assert.equal(any.request.at, 1, '번호가 없으면(손으로 실행) 그대로');
});

test('자료 조각은 묶음의 올리기 번호(ups)로 받는다', async () => {
  const c = fakeClient({ econ: { pdf: [0, 1] }, fin: { pdf: [] } });
  const ups = [];
  c.get = async (wid, slot, kind, n, up) => { ups.push(`${slot}/${kind}/${n}@${up}`); return Buffer.from('x'); };
  const base = c.bundle;
  c.bundle = async () => ({ ...(await base()), ups: { econ: { pdf: 'p1aa' }, fin: { pdf: '' } } });
  await make({ wid: WID, slots: ['econ'], client: c, key: 'k', deps: fakeDeps().deps });
  assert.deepEqual(ups.sort(), ['econ/pdf/0@p1aa', 'econ/pdf/1@p1aa']);
});
