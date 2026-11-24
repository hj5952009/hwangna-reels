// 글자 맞추기 (장면·자막 공용) — 상자 폭을 넘으면 글자를 줄이고, 그래도 넘으면 줄을 바꾸고, 줄 수를 넘으면 말줄임표
// 모든 fillText에 상자 폭(maxWidth)을 넘겨 브라우저가 몰래 글자를 찌그러뜨리지 않게 한다(시험이 센다).

// 띄어쓰기에서 먼저 자르고, 한 낱말이 상자보다 길면 글자 단위로 자른다
export function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text ?? '').split(/(\s+)/)) {
    if (!w) continue;
    const tryLine = line + w;
    if (ctx.measureText(tryLine.trim()).width <= maxW) { line = tryLine; continue; }
    if (line.trim()) { out.push(line.trim()); line = ''; }
    if (ctx.measureText(w.trim()).width <= maxW) { line = w.trimStart(); continue; }
    for (const ch of w) { if (ctx.measureText((line + ch).trim()).width > maxW && line) { out.push(line.trim()); line = ''; } line += ch; }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// size에서 min까지 2px씩 줄여 maxLines 안에 들어가는 크기를 찾는다. 끝내 넘치면 마지막 줄에 '…'
export function fit(ctx, text, maxW, size, min, maxLines, font) {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = font(s); const ls = wrap(ctx, text, maxW);
    if (ls.length <= maxLines) return { size: s, lines: ls };
  }
  ctx.font = font(min);
  const ls = wrap(ctx, text, maxW).slice(0, maxLines);
  let last = ls[maxLines - 1] || '';
  while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
  ls[maxLines - 1] = `${last}…`;
  return { size: min, lines: ls };
}

// 맞춘 글자를 cy를 가운데로 그린다 → { top, bottom, size, width }
export function drawFit(ctx, text, x, cy, maxW, size, min, maxLines, font, color, align = 'center', lh = 1.2) {
  const f = fit(ctx, text, maxW, size, min, maxLines, font);
  ctx.font = font(f.size); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  const step = f.size * lh, top = cy - ((f.lines.length - 1) * step) / 2;
  let width = 0;
  f.lines.forEach((l, i) => { ctx.fillText(l, x, top + i * step, maxW); width = Math.max(width, ctx.measureText(l).width); });
  return { top: top - step / 2, bottom: top + (f.lines.length - 1) * step + step / 2, size: f.size, width };
}
