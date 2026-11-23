// 조립(make) 시험 — 가짜 Worker client · 가짜 AI · 가짜 렌더 (실제 API·영상 굽기 없음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { make, withDisclaimer, DISCLAIMER } from '../make.mjs';

const WID = 'w-2026-11-24';
function script(slot, presenter) {
  const s = JSON.parse(JSON.stringify({
    title: '금리와 환율', hook: '금리는 그대로인데 환율은 왜 올랐을까?', summary: '금리 차이가 벌어지면 환율이 올라요.', caption: '이번 주 위클리 정리 #황금나침반',
    beats: [
      { line: '가'.repeat(110), show: { type: 'number', value: '2.5', unit: '%', text: '기준금리' }, mood: 'explain' },
      { line: '가'.repeat(110), show: { type: 'slide', page: 2, text: '자료' }, mood: 'stress' },
      { line: '가'.repeat(110), show: { type: 'photo', photo: 0, text: '발표 현장' }, mood: 'surprise' },
    ],
  }));
  if (slot === 'fin') s.summary += ' 투자 권유가 아니에요.';
  return { ...s, slot, week: '11월 4주차', presenter };
}

function fakeClient(files) {
  const states = []; const puts = []; const gets = [];
  return {
    states, puts, gets,
    bundle: async () => ({ meta: { week: '11월 4주차', meet: '2026-11-24', econ: { presenter: '발표자', title: '금리와 환율' }, fin: { presenter: '이나침', title: '예금보험' } }, files }),
    get: async (wid, slot, kind, n) => { gets.push(`${slot}/${kind}/${n}`); return Buffer.from(`${slot}-${kind}-${n}`); },
    putOut: async (wid, slot, kind, buf) => { puts.push(`${slot}/${kind}`); return `https://w.example/m/${slot}-${kind}`; },
    state: async (wid, slot, st) => { states.push({ slot, ...st }); },
  };
}
function fakeDeps(over = {}) {
  const calls = { writeScript: [], checkScript: [], speak: [], render: [], uploadSources: [], pdfPages: [] };
  const deps = {
    uploadSources: async (a) => { calls.uploadSources.push(a); return [{ fileData: { fileUri: 'u', mimeType: 'application/pdf' } }]; },
    writeScript: async (a) => { calls.writeScript.push(a); return script(a.meta.slot, a.meta.presenter); },
    checkScript: async (a) => { calls.checkScript.push(a); return { ...a.script, check: { removed: [], ok: true } }; },
    speak: async (a) => { calls.speak.push(a); return { lines: a.lines.map((text) => ({ text, wav: 'x.wav', sec: 1, rms: [0.5] })), total: a.lines.length }; },
    pdfPages: async (pdf, pages, dir) => { calls.pdfPages.push(pages); },
    render: async (a) => { calls.render.push(a); writeFileSync(a.out, 'mp4'); writeFileSync(`${a.out}.cover.jpg`, 'jpg'); return { mp4: a.out, cover: `${a.out}.cover.jpg`, seconds: 40 }; },
    ...over,
  };
  return { deps, calls };
}
const last = (states, slot) => states.filter((s) => s.slot === slot).at(-1);

test('경제 자료만 있으면 경제는 ready, 금융은 자료 없음으로 failed', async () => {
  const c = fakeClient({ econ: { pdf: [0], audio: [0, 1] }, fin: { pdf: [], audio: [] }, photo: [0] });
  const { deps, calls } = fakeDeps();
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  assert.equal(last(c.states, 'econ').state, 'ready');
  assert.equal(last(c.states, 'fin').state, 'failed');
  assert.match(last(c.states, 'fin').error, /자료 없음/);
  assert.equal(calls.writeScript.length, 1);
  // 녹음 조각 0,1을 모두 받았고 사진도 받음
  assert.ok(c.gets.includes('econ/audio/1') && c.gets.includes('photo/jpg/0'));
  // 대본에 쓰인 슬라이드 쪽만 그림으로
  assert.deepEqual(calls.pdfPages[0], [2]);
  // 발표자·사진 수가 대본 요청에 들어감
  assert.equal(calls.writeScript[0].meta.presenter, '발표자');
  assert.equal(calls.writeScript[0].meta.photos, 1);
});

test('경제 대본 쓰기가 실패해도 금융은 만들어짐', async () => {
  const c = fakeClient({ econ: { pdf: [0], audio: [] }, fin: { pdf: [0], audio: [] }, photo: [] });
  const { deps } = fakeDeps({ writeScript: async (a) => { if (a.meta.slot === 'econ') throw new Error('대본을 만들지 못했어요: 길이 700자'); return script('fin', a.meta.presenter); } });
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  assert.equal(last(c.states, 'econ').state, 'failed');
  assert.match(last(c.states, 'econ').error, /대본을 만들지 못했어요/);
  assert.equal(last(c.states, 'fin').state, 'ready');
});

test('다시 굽기(rerender)는 대본 쓰기 없이 목소리·렌더만', async () => {
  const c = fakeClient({ econ: { pdf: [0], audio: [] }, fin: { pdf: [], audio: [] }, photo: [] });
  const { deps, calls } = fakeDeps();
  const edited = script('econ', '발표자'); edited.hook = '고친 훅이에요?';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: edited }, client: c, key: 'k', deps });
  assert.equal(calls.writeScript.length, 0);
  assert.equal(calls.checkScript.length, 0);
  assert.equal(calls.speak.length, 1);
  assert.equal(calls.speak[0].lines[0], '고친 훅이에요?');
  assert.equal(calls.render.length, 1);
  assert.equal(last(c.states, 'econ').state, 'ready');
  assert.equal(c.states.filter((s) => s.slot === 'fin').length, 0);
});

test('다시 굽기 대본이 규칙을 어기면 failed', async () => {
  const c = fakeClient({ econ: { pdf: [0], audio: [] }, fin: { pdf: [], audio: [] }, photo: [] });
  const { deps } = fakeDeps();
  const bad = script('econ', '발표자'); bad.beats[0].line += ' 지금 사세요';
  await make({ wid: WID, slots: ['econ'], rerender: { econ: bad }, client: c, key: 'k', deps });
  assert.equal(last(c.states, 'econ').state, 'failed');
  assert.match(last(c.states, 'econ').error, /권유/);
});

test('ready 상태에는 영상·표지·대본·문구·렌더 시각이 모두 있음', async () => {
  const c = fakeClient({ econ: { pdf: [0], audio: [] }, fin: { pdf: [0], audio: [] }, photo: [] });
  const { deps, calls } = fakeDeps();
  const before = Date.now();
  await make({ wid: WID, slots: ['econ', 'fin'], client: c, key: 'k', deps });
  for (const slot of ['econ', 'fin']) {
    const s = last(c.states, slot);
    assert.equal(s.state, 'ready');
    assert.equal(s.video, `https://w.example/m/${slot}-video`);
    assert.equal(s.cover, `https://w.example/m/${slot}-cover`);
    assert.equal(s.script.slot, slot);
    assert.ok(s.caption.length > 0);
    assert.ok(s.renderedAt >= before);
  }
  // 목소리 마지막 줄은 끝인사(주차·발표자)
  assert.match(calls.speak[0].lines.at(-1), /황금나침반 11월 4주차 위클리, 발표는 발표자/);
  // 중간에 making 단계 보고가 있었음
  assert.ok(c.states.some((s) => s.state === 'making' && s.step));
});

test('문구는 고지로 끝나고, 이미 있으면 두 번 붙이지 않음', () => {
  assert.ok(withDisclaimer('정리 #황금나침반').endsWith(DISCLAIMER));
  const once = withDisclaimer(withDisclaimer('정리'));
  assert.equal(once.split(DISCLAIMER).length - 1, 1);
  assert.match(DISCLAIMER, /투자 권유가 아니에요/);
});

test('가짜(fake) 모드는 자료가 없어도 시험 대본으로 끝까지 만든다 (Actions 흐름 시험)', async () => {
  const c = fakeClient({ econ: { pdf: [], audio: [] }, fin: { pdf: [], audio: [] }, photo: [] });
  const { deps } = fakeDeps();
  await make({ wid: 'w-2000-01-01', slots: ['econ', 'fin'], client: c, key: '', fake: true, deps });
  assert.equal(last(c.states, 'econ').state, 'ready');
  assert.equal(last(c.states, 'fin').state, 'ready');
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
  const c = fakeClient({ econ: { pdf: [0], audio: [0] }, fin: { pdf: [], audio: [] }, photo: [0] });
  const ups = [];
  c.get = async (wid, slot, kind, n, up) => { ups.push(`${slot}/${kind}/${n}@${up}`); return Buffer.from('x'); };
  const base = c.bundle;
  c.bundle = async () => ({ ...(await base()), ups: { econ: { pdf: 'p1aa', audio: 'a1aa' }, fin: { pdf: '', audio: '' }, photo: 'ph1a' } });
  const { deps } = fakeDeps();
  await make({ wid: WID, slots: ['econ'], client: c, key: 'k', deps });
  assert.deepEqual(ups.sort(), ['econ/audio/0@a1aa', 'econ/pdf/0@p1aa', 'photo/jpg/0@ph1a']);
});
