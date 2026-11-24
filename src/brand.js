// 황금나침반 위클리 설명 릴스 — 브랜드 값 (DESIGN.md 참고)
// 운영실 앱 js/data/promo.js BRAND와 같은 노랑·갈색을 쓰고, 릴스에서만 쓰는 보조색을 더한다.
// 브라우저(render.html·preview)와 Node(make.mjs) 양쪽에서 불러 쓰는 순수 값 모음.

export const W = 1080;
export const H = 1920;
export const FPS = 30;

export const BRAND = {
  yellow: '#E7B53A', // 황금나침반 노랑 (카드 위아래 띠)
  brown: '#6B5233', // 황금나침반 갈색 (글자·테두리)
  ink: '#3A3A3A', // 본문 글자
  paper: '#FFFFFF',
  soft: '#FFF8E6', // 릴스 바탕 (따뜻한 종이색)
  deep: '#3F2F1C', // 자막 테두리·그림자 (갈색보다 진함)
  gold: '#F4CB5C', // 강조 글자 (자막 속 숫자·핵심어)
  cream: '#FFF1CC', // 카드 안쪽
  line: '#E9DCC0', // 옅은 선 (눈금·격자)
  up: '#D2553F', // 오름 (빨강 · 한국식)
  down: '#2F6DB5', // 내림 (파랑 · 한국식)
};

// 슬롯별 색: 경제 = 황금 노랑, 금융 = 짙은 옥색 (두 릴스를 한눈에 구별)
// needle: 캐릭터 바늘 끝 색 (경제는 몸이 노랑이라 나침반 북쪽 빨강)
export const SLOT = {
  econ: { label: '위클리 경제', short: '경제', accent: '#E7B53A', onAccent: '#3F2F1C', tint: '#FFF3D1', needle: '#D2553F' },
  fin: { label: '위클리 금융', short: '금융', accent: '#2F7D6B', onAccent: '#FFFFFF', tint: '#E4F2EE', needle: '#2F7D6B' },
};

export const FONTS = {
  title: '"Black Han Sans", "Noto Sans KR", sans-serif', // 큰 제목·숫자
  body: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif', // 자막·본문
  files: [
    { family: 'Black Han Sans', file: 'BlackHanSans-Regular.ttf', weight: '400' },
    { family: 'Noto Sans KR', file: 'NotoSansKR-VF.ttf', weight: '100 900' },
  ],
};

// 인스타 릴스 화면에서 글자가 가리지 않는 곳 (px, 1080×1920 기준)
// 위 220: 상태 표시줄·'릴스' 머리 / 아래 420: 계정 이름·캡션·음악 / 오른쪽 버튼 줄은 side 안쪽 + 자막 폭 제한으로 피함
export const SAFE = { top: 220, bottom: 420, side: 72 };

export const HANDLE = '@jbnu_goldencompass';

// 해설 캐릭터 A '나침이' — 회장 확정 26.11.23
// (v1 scene.js용 — Task 5에서 새 drawFrame으로 바꾸면 지움)
export const CHARACTER = { variant: 'A', name: '나침이' };

// 슬롯별 해설 캐릭터 — 엔진·시험은 이것만 본다 (설계서 v2 6-1, 회장 확정 26.11.24)
//   경제 = 형 '나침이'(시안 A) · 금융 = 동생 '콕이'(시안 1: 옥색 테 + 동그란 안경 + 노란 바늘)
//   voice·style은 Gemini TTS 목소리·말투(style은 speech_metadata로만 보냄), pitch는 반음(0 = 그대로)
export const CHARACTERS = {
  econ: {
    variant: 'A', name: '나침이', voice: 'Puck', pitch: 0,
    style: 'cute, bouncy cartoon mascot; bright and slightly high-pitched; friendly and crisp',
    tone: '질문으로 열고 호기심을 따라간다. "왜 그럴까요?" "그러니까…" 같은 말로 이어 간다',
    favor: ['question', 'steps', 'icons'], // 즐겨 쓰는 장면(권장, 설계서 6-2)
    outro: '위클리 경제였어요. 다음 주에 또 만나요!',
  },
  fin: {
    variant: 'S', name: '콕이', voice: 'Iapetus', pitch: 0,
    style: 'smart little-brother cartoon mascot with glasses; clear, tidy and composed; friendly, slightly young, crisp diction, calmly sums things up',
    tone: '핵심부터 짚고 정리한다. "포인트는 두 가지예요" "정리하면…" 같은 말로 묶는다',
    favor: ['bignum', 'compare', 'bars', 'formula'],
    outro: '위클리 금융이었어요. 다음 주에 또 만나요!',
  },
};

// v2 화면 구역 (px) — 장면 그림은 STAGE 안에만, 자막은 CAPTION_Y0 아래
export const STAGE = { x0: 72, x1: 1008, y0: 395, y1: 1150 };
export const CAPTION_Y0 = 1255;
// 줄 사이 쉼(초) · 장면 겹쳐 넘기기(초) — 회장 피드백 26.11.24
export const GAP_V2 = 0.55;
export const XFADE = 0.45;

// 화면 배치 (세로 위치, px)
export const LAYOUT = {
  header: { y: 250, h: 96 }, // 슬롯 칩·주차
  stage: { y: 380, h: 720 }, // 키워드·숫자·비교·슬라이드·사진 카드
  char: { x: 860, y: 1085, scale: 0.9 }, // 캐릭터 중심 (오른쪽 아래, 카드 모서리에 걸침 · 약 950~1220)
  caption: { y: 1270, h: 220, maxW: 1080 - 72 * 2 }, // 큰 자막 2줄 (아래 SAFE 420 위에서 끝남: 1490 < 1500)
  badge: { x: 1080 - 72, y: 300 }, // 'AI 목소리' 작은 표시 (오른쪽 위)
};
