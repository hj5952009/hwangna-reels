// 렌더러 시험: 장면 설계도(plan.json) + 사인파 목소리 한 개(8줄 경계) → MP4 규격 확인
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { render, joinAudio } from '../render.mjs';
import { GAP_V2 } from '../src/brand.js';
import { timeline, HEADER_BADGE } from '../src/scene.js';

const ffprobe = ffprobeStatic.path;
const probe = (f) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());
const plan = JSON.parse(readFileSync(resolve('test/fixtures/plan.json'), 'utf8'));

// 24kHz 모노 사인파 한 개(Gemini TTS와 같은 꼴)를 줄 수만큼 같은 길이로 나눈 Track
function fakeTrack(dir, n, sec) {
  const wav = join(dir, 'voice.wav');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=320:sample_rate=24000:duration=${n * sec}`, '-ac', '1', wav]);
  const lines = Array.from({ length: n }, (_, i) => ({
    text: plan.scenes[i] ? plan.scenes[i].say : `줄 ${i + 1}`, from: i * sec, to: (i + 1) * sec, sec,
    rms: Array.from({ length: Math.round(sec * 30) }, (_, k) => (k % 6 < 3 ? 0.7 : 0.1)),
  }));
  return { wav, rate: 24000, timing: 'exact', total: n * sec, lines };
}

test('머리띠 오른쪽 표시는 황금나침반 (AI 고지는 게시 문구에)', () => {
  assert.equal(HEADER_BADGE, '황금나침반');
});

test('timeline: 줄마다 sec, 사이 GAP', () => {
  const tl = timeline({ lines: [{ sec: 2 }, { sec: 3 }, { sec: 1 }] });
  assert.deepEqual(tl.map((s) => [s.start, s.end]), [[0, 2], [2 + GAP_V2, 5 + GAP_V2], [5 + GAP_V2 * 2, 6 + GAP_V2 * 2]]);
});

test('render: plan.json + 사인파 한 개 wav(8줄 경계) → 1080×1920 30fps h264 yuv420p + aac 48k, 길이 = 줄 합 + GAP×7 ±0.2초, 표지 jpg', { timeout: 600000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'reel-'));
  const SEC = 3.5;
  const track = fakeTrack(dir, plan.scenes.length, SEC);
  const total = SEC * 8 + GAP_V2 * 7;
  const out = join(dir, 'reel.mp4');
  const r = await render({ plan, track, out });

  assert.equal(r.mp4, out);
  assert.ok(Math.abs(r.seconds - total) < 0.2, `seconds ${r.seconds} vs ${total}`);
  const p = probe(out);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.width, 1080); assert.equal(v.height, 1920);
  assert.equal(v.codec_name, 'h264'); assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.r_frame_rate, '30/1');
  assert.equal(a.codec_name, 'aac'); assert.equal(Number(a.sample_rate), 48000); assert.equal(a.channels, 2);
  const dur = Number(p.format.duration);
  assert.ok(Math.abs(dur - total) < 0.2, `duration ${dur} vs ${total}`);
  assert.ok(Number(p.format.bit_rate) <= 3.5e6, `bitrate ${p.format.bit_rate}`);
  // +faststart: moov가 파일 앞쪽에
  const head = readFileSync(out).subarray(0, 65536).toString('latin1');
  assert.ok(head.includes('moov'), 'moov가 앞 64KB 안에 없음');
  assert.match(r.cover, /\.jpg$/);
  const c = probe(r.cover).streams[0];
  assert.equal(c.width, 1080); assert.equal(c.height, 1920);
});

test('joinAudio pitch 2: 길이 변화 ±1% 안', { timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'reel-pitch-'));
  const track = fakeTrack(dir, 4, 2.5);
  const a = join(dir, 'p0.wav'); const b = join(dir, 'p2.wav');
  await joinAudio(track, a);
  await joinAudio(track, b, { pitch: 2 });
  const d0 = Number(probe(a).format.duration); const d2 = Number(probe(b).format.duration);
  const want = 2.5 * 4 + GAP_V2 * 3;
  assert.ok(Math.abs(d0 - want) < 0.05, `pitch 0 길이 ${d0} vs ${want}`);
  assert.ok(Math.abs(d2 - d0) / d0 <= 0.01, `pitch 2 길이 ${d2} vs ${d0}`);
  const s = probe(b).streams[0];
  assert.equal(Number(s.sample_rate), 48000); assert.equal(s.channels, 2);
});
