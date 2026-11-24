// 앱(황나 운영실) 설명 릴스 칸에 쓰는 캐릭터 얼굴 그림(160px PNG)을 렌더와 같은 그리기 코드로 뜬다
//   node dev/faces.mjs [출력 폴더]   → reel_face_econ.png(나침이) · reel_face_fin.png(콕이)
// 앱 assets/app/img/로 복사해 쓴다 (캐릭터 그림을 바꾸면 다시 떠서 복사)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHarness } from '../test/browser-helper.mjs';
import { CHARACTERS } from '../src/brand.js';

const OUT = process.argv[2] || 'faces';
const SIZE = 160;
mkdirSync(OUT, { recursive: true });
const H = await openHarness();
try {
  for (const slot of ['econ', 'fin']) {
    const url = await H.page.evaluate(([variant, slot, size]) => {
      // 큰 캔버스에 그리고, 그려진 부분(투명 아닌 픽셀)만 정사각형으로 잘라 size에 맞춘다
      const W = 600; const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
      const c = cv.getContext('2d');
      window.T.drawCharacter(c, { variant, mood: 'smile', x: W / 2, y: W / 2, t: 0, blink: 0, mouth: 0, needle: slot });
      const d = c.getImageData(0, 0, W, W).data;
      let x0 = W, y0 = W, x1 = 0, y1 = 0;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const side = Math.max(x1 - x0, y1 - y0) * 1.06; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
      const out = document.createElement('canvas'); out.width = size; out.height = size;
      out.getContext('2d').drawImage(cv, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
      return out.toDataURL('image/png');
    }, [CHARACTERS[slot].variant, slot, SIZE]);
    const file = join(OUT, `reel_face_${slot}.png`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${CHARACTERS[slot].name} → ${file}`);
  }
  if (H.errors.length) throw new Error(H.errors.join('\n'));
} finally { await H.done(); }
