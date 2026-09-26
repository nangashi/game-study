import { BOX, StrokeJudge, TOLERANCE, pathToPoints, type JudgeReason, type Pt, type Tolerance } from '../../learn/handwriting/judge';
import { h } from '../dom';

const NS = 'http://www.w3.org/2000/svg';
const MESSAGE: Record<Exclude<JudgeReason, 'ok'>, string> = {
  direction: 'むきが ぎゃく かも？',
  order: 'かきじゅんを たしかめよう',
  shape: 'おしい！ もういちど',
};

export interface WritepadOptions {
  strokes: string[];                 // KanjiVG の path
  guide: 'trace' | 'model' | 'none';
  char: string;
  tolerance: Tolerance;
  onMessage: (text: string) => void;
  onDone: (r: { helped: boolean; fails: number }) => void;
}

// マスに1画ずつ書かせて、その場で判定する
export function writepad(o: WritepadOptions): HTMLElement {
  const judge = new StrokeJudge(o.strokes, TOLERANCE[o.tolerance]);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${BOX} ${BOX}`);
  const canvas = h('canvas');
  const pad = h('div', { class: 'writepad' }, svg, canvas);
  let showModel = o.guide === 'model';
  let showTrace = o.guide === 'trace';
  let helped = false, fails = 0, failsHere = 0, demoRunning = false;

  const model = h('div', { class: 'model', textContent: o.char });
  const demoBtn = h('button', { class: 'pill-btn', textContent: 'おてほん', onclick: () => demo() });
  const wrap = h('div', { class: 'writepad-wrap' }, pad, h('div', { class: 'col' }, model, h('div', { style: 'height:10px' }), demoBtn));

  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    svg.append(e);
    return e;
  };
  const drawBase = () => {
    svg.replaceChildren();
    const dash = { stroke: '#fca5a5', 'stroke-dasharray': '2 2', 'stroke-width': 0.5 };
    el('line', { x1: BOX / 2, y1: 0, x2: BOX / 2, y2: BOX, ...dash });
    el('line', { x1: 0, y1: BOX / 2, x2: BOX, y2: BOX / 2, ...dash });
    model.style.visibility = showModel ? 'visible' : 'hidden';
    o.strokes.forEach((d, i) => {
      const done = i < judge.index;
      if (!done && !showTrace) return;
      el('path', { d, fill: 'none', stroke: done ? '#111827' : '#e5e7eb', 'stroke-width': done ? 5 : 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    });
  };

  const hint = (i: number) => {
    const d = o.strokes[i];
    const p = el('path', { d, fill: 'none', stroke: '#f59e0b', 'stroke-width': 6, 'stroke-linecap': 'round', class: 'flash' });
    const [x, y] = pathToPoints(d)[0];
    const c = el('circle', { cx: x, cy: y, r: 4, fill: '#f59e0b', class: 'flash' });
    setTimeout(() => { p.remove(); c.remove(); }, 1900);
  };

  // 書き順アニメーション。見たら「おてつだいあり」あつかい
  async function demo() {
    if (demoRunning) return;
    demoRunning = true; helped = true;
    svg.replaceChildren();
    for (const d of o.strokes) {
      const p = el('path', { d, fill: 'none', stroke: '#111827', 'stroke-width': 5, 'stroke-linecap': 'round' }) as SVGPathElement;
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.classList.add('stroke-anim');
      await new Promise(r => setTimeout(r, 750));
    }
    await new Promise(r => setTimeout(r, 600));
    if (o.guide === 'none') showModel = true; // 思い出せないときはお手本を出したままにする
    demoRunning = false;
    drawBase();
  }

  // ---- 入力 ----
  const ctx = canvas.getContext('2d')!;
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr * r.width / BOX, 0, 0, dpr * r.height / BOX, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
  };
  const drawInk = (pts: Pt[], color: string) => {
    ctx.clearRect(0, 0, BOX, BOX);
    ctx.strokeStyle = color; ctx.lineWidth = 4.5; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const toBox = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * BOX / r.width, (e.clientY - r.top) * BOX / r.height];
  };

  let cur: { id: number; pts: Pt[] } | null = null;
  canvas.addEventListener('pointerdown', e => {
    if (judge.finished || demoRunning || cur) return;
    if (!canvas.width) resize();
    canvas.setPointerCapture(e.pointerId);
    cur = { id: e.pointerId, pts: [toBox(e)] };
  });
  canvas.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== cur.id) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) cur.pts.push(toBox(ev));
    drawInk(cur.pts, '#374151');
  });
  const end = (e: PointerEvent) => {
    if (!cur || e.pointerId !== cur.id) return;
    const pts = cur.pts; cur = null;
    if (pts.length < 2) pts.push([pts[0][0] + 0.5, pts[0][1] + 0.5]); // 点を打っただけ
    const i = judge.index;
    const r = judge.judge(pts);
    if (r.ok) {
      failsHere = 0;
      ctx.clearRect(0, 0, BOX, BOX);
      drawBase();
      if (judge.finished) {
        o.onMessage('できた！');
        o.onDone({ helped: helped || fails >= 3, fails });
      } else o.onMessage(`いいね！ ${judge.index + 1}かくめ`);
      return;
    }
    fails++; failsHere++;
    drawInk(pts, '#dc2626');
    setTimeout(() => ctx.clearRect(0, 0, BOX, BOX), 700);
    o.onMessage(MESSAGE[r.reason as Exclude<JudgeReason, 'ok'>]);
    if (failsHere >= 2 || r.reason !== 'shape' || o.guide !== 'none') hint(i);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  new ResizeObserver(resize).observe(canvas);
  drawBase();
  return wrap;
}
