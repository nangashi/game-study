// こうかおん（WebAudio で合成。音の素材はいらない）。どのゲームから使ってもよい
let ctx: AudioContext | null = null;
const lastPlay: Record<string, number> = {};
const noiseBufs: Record<string, AudioBuffer> = {}; // ノイズは 1回 作って つかいまわす（まいかい 作ると タブレットで おもい）

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(kind: string, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  if ((lastPlay[kind] ?? -1) > now - 0.03) return; // 同じ音が重なりすぎないように
  lastPlay[kind] = now;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(a.destination);
  o.start(now); o.stop(now + dur);
}

function noise(kind: string, dur: number, vol: number) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  if ((lastPlay[kind] ?? -1) > now - 0.05) return;
  lastPlay[kind] = now;
  let buf = noiseBufs[dur];
  if (!buf) {
    buf = noiseBufs[dur] = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  }
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; g.gain.value = vol;
  src.connect(g).connect(a.destination);
  src.start(now);
}

export const sfx = {
  hit: (combo = 0) => tone('hit', 300 + Math.min(combo, 20) * 45, 0.09, 'square', 0.06, 120),
  pop: (pitch = 1) => tone('pop', 520 * pitch, 0.08, 'sine', 0.12, 900 * pitch),
  wall: () => tone('wall', 160, 0.06, 'triangle', 0.1, 90),
  boom: () => noise('boom', 0.35, 0.25),
  hurt: () => tone('hurt', 220, 0.25, 'sawtooth', 0.08, 70),
  shoot: () => tone('shoot', 180, 0.18, 'triangle', 0.12, 700),
  up: () => { tone('up1', 523, 0.12, 'square', 0.05); setTimeout(() => tone('up2', 784, 0.2, 'square', 0.05), 90); },
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(`ff${i}`, f, 0.25, 'square', 0.05), i * 110)),
  // ここから下はサバイバーで足した音
  zap: () => noise('zap', 0.12, 0.12),
  gem: (n = 0) => tone('gem', 880 * 2 ** (Math.min(n, 12) / 12), 0.06, 'sine', 0.05),
  chest: () => [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(`ch${i}`, f, 0.18, 'triangle', 0.08), i * 70)),
  evolve: () => [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => setTimeout(() => tone(`ev${i}`, f, 0.3, 'square', 0.05), i * 90)),
  warn: () => { tone('w1', 440, 0.15, 'square', 0.05); setTimeout(() => tone('w2', 440, 0.15, 'square', 0.05), 220); },
};
