// 렌더러 시험: 가짜 대본 + 사인파 목소리 7줄(합계 약 40초) → MP4 규격 확인
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { render } from '../render.mjs';

const ffprobe = ffprobeStatic.path;
const probe = (f) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());

test('render: 대본+목소리 → 인스타 릴스 규격 MP4와 표지', { timeout: 600000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'reel-'));
  const script = JSON.parse(readFileSync(resolve('test/fixtures/script.json'), 'utf8'));
  const texts = [script.hook, ...script.beats.map((b) => b.line), script.summary, '황금나침반 11월 4주차 위클리였어요.'];
  const SEC = 5.6;
  const lines = texts.map((text, i) => {
    const wav = join(dir, `l${i}.wav`);
    // 24kHz 모노 (Gemini TTS와 같은 꼴) 사인파
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 40}:sample_rate=24000:duration=${SEC}`, '-ac', '1', wav]);
    return { text, wav, sec: SEC, rms: Array.from({ length: Math.ceil(SEC * 30) }, (_, k) => (k % 6 < 3 ? 0.7 : 0.1)) };
  });
  const total = SEC * 7 + 0.15 * 6;
  const track = { lines, total };
  writeFileSync(join(dir, 'photo0.jpg'), readFileSync(resolve('preview/sample-photo.jpg')));
  const out = join(dir, 'reel.mp4');
  const r = await render({ script, track, assetsDir: dir, out });

  assert.equal(r.mp4, out);
  assert.ok(Math.abs(r.seconds - total) < 0.2, `seconds ${r.seconds}`);
  const p = probe(out);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.width, 1080); assert.equal(v.height, 1920);
  assert.equal(v.codec_name, 'h264'); assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.r_frame_rate, '30/1');
  assert.equal(a.codec_name, 'aac'); assert.equal(Number(a.sample_rate), 48000);
  const dur = Number(p.format.duration);
  assert.ok(Math.abs(dur - total) < 0.2, `duration ${dur} vs ${total}`);
  assert.ok(Number(p.format.bit_rate) <= 3.5e6, `bitrate ${p.format.bit_rate}`);
  // +faststart: moov가 파일 앞쪽에
  const head = readFileSync(out).subarray(0, 65536).toString('latin1');
  assert.ok(head.includes('moov'), 'moov가 앞 64KB 안에 없음');
  const c = probe(r.cover).streams[0];
  assert.equal(c.width, 1080); assert.equal(c.height, 1920);
});
