// Worker 렌더 쪽 client 시험 (가짜 fetch)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, PART } from '../src/worker-client.mjs';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const RK = 'render-key-secret';

test('모든 요청에 X-Render-Key, 주소에는 키 없음', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/bundle')) return Response.json({ meta: { week: '11월 4주차' }, files: {} });
    if (String(url).includes('/file/')) return new Response(new Uint8Array([1, 2, 3]));
    return Response.json({ ok: true });
  };
  const c = createClient({ url: 'https://w.example/', renderKey: RK });
  const b = await c.bundle('w-2026-11-24');
  assert.equal(b.meta.week, '11월 4주차');
  const buf = await c.get('w-2026-11-24', 'econ', 'pdf', 0);
  assert.deepEqual([...buf], [1, 2, 3]);
  await c.state('w-2026-11-24', 'econ', { state: 'making', step: '목소리' });
  assert.equal(calls[0].url, 'https://w.example/reels/w-2026-11-24/bundle');
  assert.equal(calls[1].url, 'https://w.example/reels/w-2026-11-24/file/econ/pdf/0');
  assert.equal(calls[2].url, 'https://w.example/reels/w-2026-11-24/state');
  assert.deepEqual(JSON.parse(calls[2].init.body), { slot: 'econ', state: 'making', step: '목소리' });
  for (const k of calls) { assert.equal(new Headers(k.init.headers).get('x-render-key'), RK); assert.ok(!k.url.includes(RK)); }
});

test('putOut: 20MB 넘는 영상은 조각으로 나눠 올리고 마지막 응답의 주소를 돌려줌', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); calls.push({ path: u.pathname, part: u.searchParams.get('part'), of: u.searchParams.get('of'), size: init.body.length });
    return u.searchParams.get('part') === u.searchParams.get('of') - 1 + '' ? Response.json({ url: 'https://w.example/m/abc' }) : Response.json({ ok: true });
  };
  const c = createClient({ url: 'https://w.example', renderKey: RK });
  const big = Buffer.alloc(PART * 2 + 5);
  const url = await c.putOut('w-2026-11-24', 'econ', 'video', big);
  assert.equal(url, 'https://w.example/m/abc');
  assert.deepEqual(calls.map((x) => [x.path, x.part, x.of, x.size]), [
    ['/reels/w-2026-11-24/out/econ/video', '0', '3', PART],
    ['/reels/w-2026-11-24/out/econ/video', '1', '3', PART],
    ['/reels/w-2026-11-24/out/econ/video', '2', '3', 5],
  ]);
  assert.ok(PART <= 20 * 1024 * 1024);
});

test('5xx는 다시 시도, 4xx는 바로 실패', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return n < 3 ? new Response('x', { status: 502 }) : Response.json({ files: {} }); };
  const c = createClient({ url: 'https://w.example', renderKey: RK, sleep: async () => {} });
  await c.bundle('w-2026-11-24');
  assert.equal(n, 3);
  globalThis.fetch = async () => new Response('no', { status: 403 });
  await assert.rejects(c.bundle('w-2026-11-24'), /403/);
});
