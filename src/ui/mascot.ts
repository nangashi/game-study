// マスコット・星・小さなアイコン（算数練習アプリの SVG をそのまま使う）

export type Mood = 'normal' | 'happy' | 'sad' | 'proud';

// 子どものアバター = マスコットの色。id は記録（settings.avatar）に入る
export const AVATARS = [
  { id: 'teal', name: 'みどり', color: '#2a9d8f', soft: '#e8f7f4' },
  { id: 'orange', name: 'オレンジ', color: '#fb8500', soft: '#fff3e0' },
  { id: 'pink', name: 'ピンク', color: '#ef476f', soft: '#ffe9ef' },
  { id: 'blue', name: 'あお', color: '#4a90d9', soft: '#e8f1fb' },
  { id: 'purple', name: 'むらさき', color: '#9b5de5', soft: '#f2eafc' },
  { id: 'yellow', name: 'きいろ', color: '#e9a800', soft: '#fff7d6' },
] as const;
export type Avatar = typeof AVATARS[number];
export const avatarOf = (id: string): Avatar => AVATARS.find(a => a.id === id) ?? AVATARS[0];

export function mascotSVG(color: string, mood: Mood = 'normal'): string {
  let eyes: string, mouth: string;
  if (mood === 'happy') {
    eyes = '<path d="M34 58 Q42 48 50 58" fill="none" stroke="#17323e" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M70 58 Q78 48 86 58" fill="none" stroke="#17323e" stroke-width="4.5" stroke-linecap="round"/>';
    mouth = '<path d="M47 72 Q60 90 73 72 Q60 79 47 72 Z" fill="#7c3f2c"/>';
  } else if (mood === 'sad') {
    eyes = '<circle cx="42" cy="58" r="4.6" fill="#17323e"/><circle cx="78" cy="58" r="4.6" fill="#17323e"/>' +
      '<path d="M33 47 L50 52 M87 47 L70 52" stroke="#17323e" stroke-width="4" stroke-linecap="round"/>';
    mouth = '<path d="M49 84 Q60 75 71 84" fill="none" stroke="#17323e" stroke-width="4.5" stroke-linecap="round"/>';
  } else if (mood === 'proud') {
    eyes = '<circle cx="42" cy="56" r="5" fill="#17323e"/><circle cx="78" cy="56" r="5" fill="#17323e"/>' +
      '<circle cx="43.8" cy="54" r="1.7" fill="#fff"/><circle cx="79.8" cy="54" r="1.7" fill="#fff"/>';
    mouth = '<path d="M46 71 Q60 86 74 71" fill="none" stroke="#17323e" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M96 30 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5-2.4 -4.5 2.4 .9-5 -3.6-3.5 5-.7 Z" fill="#ffb703" stroke="#fb8500" stroke-width="1.4"/>';
  } else {
    eyes = '<circle cx="42" cy="56" r="5" fill="#17323e"/><circle cx="78" cy="56" r="5" fill="#17323e"/>' +
      '<circle cx="43.8" cy="54" r="1.7" fill="#fff"/><circle cx="79.8" cy="54" r="1.7" fill="#fff"/>';
    mouth = '<path d="M50 73 Q60 81 70 73" fill="none" stroke="#17323e" stroke-width="4.5" stroke-linecap="round"/>';
  }
  return '<svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M60 14 Q54 2 44 4 Q56 8 57 16 Z" fill="#57b25e"/>' +
    '<path d="M62 14 Q70 3 79 6 Q66 9 64 17 Z" fill="#7cc47f"/>' +
    `<circle cx="60" cy="66" r="48" fill="${color}"/>` +
    '<ellipse cx="60" cy="88" rx="27" ry="19" fill="rgba(255,255,255,.38)"/>' +
    '<circle cx="27" cy="72" r="7" fill="#ff9fb0" opacity=".65"/>' +
    '<circle cx="93" cy="72" r="7" fill="#ff9fb0" opacity=".65"/>' +
    eyes + mouth + '</svg>';
}

export const starSVG = (on: boolean) =>
  `<svg class="star-ic${on ? '' : ' off'}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" fill="#ffb703" stroke="#fb8500" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
export const starsHTML = (n: number) => starSVG(n >= 1) + starSVG(n >= 2) + starSVG(n >= 3);

export const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" fill="#9db8c2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#9db8c2" stroke-width="2.6"/><circle cx="12" cy="15.2" r="1.9" fill="#fff"/></svg>';
export const SOUND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4z" fill="#17323e"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6 M18 6.8a7.4 7.4 0 0 1 0 10.4" stroke="#17323e" stroke-width="2" stroke-linecap="round"/></svg>';
export const SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4z" fill="#9db8c2"/><path d="M15.5 9.8l5.2 5.2 M20.7 9.8l-5.2 5.2" stroke="#ef476f" stroke-width="2.2" stroke-linecap="round"/></svg>';
export const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2z" fill="#17323e"/><path d="M19.4 13.6l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L15 6.2h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5a7.7 7.7 0 0 0 0-2z" fill="#17323e" opacity=".28"/></svg>';
export const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="#fb8500"><path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 0 0 0-2L8.8 3.9C8 3.4 7 4 7 4.8z"/></svg>';
export const MARU_SVG = '<svg class="mark" width="120" height="120" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#2a9d8f" stroke-width="11"/></svg>';
export const BATSU_SVG = '<svg class="mark" width="120" height="120" viewBox="0 0 100 100"><path d="M26 26 L74 74 M74 26 L26 74" stroke="#ef476f" stroke-width="12" stroke-linecap="round"/></svg>';
