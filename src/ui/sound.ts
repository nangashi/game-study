// 効果音（Web Audio）。算数練習アプリと同じ音。鳴らすかどうかは子どもの設定（sound）

let ctx: AudioContext | null = null;
let enabled = () => true;

// 鳴らしてよいかを返す関数をつなぐ（いまの子どもの設定を見る）
export const setSoundEnabled = (f: () => boolean) => { enabled = f; };

// ブラウザは、さわったあとでないと音を出せないので、タップのたびに呼ぶ
export function ensureAudio(): void {
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = AC ? new AC() : null;
    } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.16) {
  if (!ctx || !enabled()) return;
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export function sndTap() { tone(660, 0, 0.06, 'triangle', 0.05); }
export function sndCorrect(combo: number) {
  tone(880, 0, 0.12, 'sine', 0.16); tone(1318, 0.07, 0.16, 'sine', 0.16);
  if (combo >= 3) tone(1568, 0.14, 0.2, 'sine', 0.14);
  if (combo >= 5) tone(1760, 0.2, 0.24, 'triangle', 0.12);
}
export function sndWrong() { tone(196, 0, 0.18, 'square', 0.05); tone(147, 0.05, 0.2, 'square', 0.05); }
export function sndClear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.15)); }

// タップの共通処理
export const tap = () => { ensureAudio(); sndTap(); };
