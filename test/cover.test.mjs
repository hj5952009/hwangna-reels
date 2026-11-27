// 표지 장면 뽑기(렌더 서버 몫) 시험 — Worker가 맡긴 일을 받아 Gemini로 장면·근거 확인 → 결과를 Worker에 돌려준다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { runCover } from '../cover.mjs';

const JOB = {
  req: 111, slot: 'econ', pdf: { up: 'abcd1234', parts: [0, 1] },
  prompt: '장면 글', schema: { type: 'object' }, checkPrompt: '맞춰 봐 줘', checkSchema: { type: 'object', properties: { check: {} } },
};
const RAW = { title: ['가', '나'], scenes: [{ label: 'a', page: 3, quote: '말1' }, 'x', { label: 'b', page: 5, quote: '말2' }, { label: 'c', page: 1, quote: '3' }, { label: 'd', page: 2, quote: '4' }, { label: 'e', page: 9, quote: '5' }] };

function fakeClient(job = JOB) {
  const out = []; const got = [];
  return {
    out, got,
    coverJob: async (wid, slot) => { if (!job) throw new Error('Worker 409: /reels/w/coverjob'); return { ...job, slot }; },
    get: async (wid, slot, kind, n, up) => { got.push([kind, n, up]); return Buffer.from(`%PDF part${n}`); },
    coverOut: async (wid, body) => { out.push(body); },
  };
}

test('맡긴 일 받기 → PDF 조각 합쳐 올리기 → 장면·근거 확인 → 결과 돌려주기', async () => {
  const client = fakeClient();
  const asks = [];
  let uploaded = '';
  const r = await runCover({
    client, wid: 'w-2026-11-26', slot: 'econ', req: 111, key: 'K',
    upload: async (key, path) => { uploaded = path; assert.equal(key, 'K'); assert.ok(existsSync(path)); return { fileData: { fileUri: 'u' } }; },
    gen: async (key, parts, schema, o) => { asks.push({ parts, schema, o }); return asks.length === 1 ? RAW : { check: [{ scene: 1, action: 'kept' }] }; },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(client.got, [['pdf', 0, 'abcd1234'], ['pdf', 1, 'abcd1234']]);
  assert.ok(!existsSync(uploaded), '임시 PDF는 지움');
  assert.equal(asks[0].parts[1].text, '장면 글'); assert.equal(asks[0].schema, JOB.schema);
  // 근거 확인 번호는 Worker와 같게: 객체만 · 앞 4개 · 1부터
  const sent = JSON.parse(asks[1].parts[1].text.split('장면: ')[1]);
  assert.deepEqual(sent, [{ scene: 1, page: 3, quote: '말1' }, { scene: 2, page: 5, quote: '말2' }, { scene: 3, page: 1, quote: '3' }, { scene: 4, page: 2, quote: '4' }]);
  assert.ok(asks[1].parts[1].text.startsWith('맞춰 봐 줘'));
  assert.equal(asks[1].schema, JOB.checkSchema);
  assert.deepEqual(client.out, [{ slot: 'econ', req: 111, raw: RAW, check: { check: [{ scene: 1, action: 'kept' }] } }]);
});

test('근거 확인이 실패해도 장면은 돌려줌 (check: null)', async () => {
  const client = fakeClient();
  let n = 0;
  await runCover({ client, wid: 'w', slot: 'econ', req: 111, key: 'K', upload: async () => ({}), gen: async () => { n++; if (n === 2) throw Object.assign(new Error('busy'), { status: 503 }); return RAW; } });
  assert.equal(client.out[0].check, null); assert.equal(client.out[0].raw, RAW);
});

test('Gemini 실패는 상태 번호와 함께 Worker에 알림 (키는 문구에 안 넣음)', async () => {
  const client = fakeClient();
  const r = await runCover({ client, wid: 'w', slot: 'econ', req: 111, key: 'SECRET', upload: async () => { throw Object.assign(new Error('Gemini 402: SECRET depleted'), { status: 402 }); }, gen: async () => RAW });
  assert.equal(r.ok, false);
  assert.equal(client.out[0].status, 402); assert.equal(client.out[0].req, 111);
  assert.match(client.out[0].error, /402/); assert.ok(!client.out[0].error.includes('SECRET'));
  assert.ok(!('raw' in client.out[0]));
});

test('깨진 JSON은 502로 알림', async () => {
  const client = fakeClient();
  await runCover({ client, wid: 'w', slot: 'econ', req: 111, key: 'K', upload: async () => ({}), gen: async () => { throw new SyntaxError('bad'); } });
  assert.equal(client.out[0].status, 502); assert.match(client.out[0].error, /JSON/);
});

test('뒤 요청이 있거나 맡긴 일이 없으면 아무것도 안 함', async () => {
  for (const job of [{ ...JOB, req: 222 }, null]) {
    const client = fakeClient(job);
    let called = false;
    const r = await runCover({ client, wid: 'w', slot: 'econ', req: 111, key: 'K', upload: async () => { called = true; }, gen: async () => RAW });
    assert.equal(r.stale, true); assert.equal(called, false); assert.deepEqual(client.out, []);
  }
});
