// 1画ずつの手書き判定（お手本の字が分かっている前提）
// 座標系はすべて KanjiVG の 109x109 ボックス
// 検証結果: docs/01-research-and-feasibility.md

export type Pt = [number, number];
export type JudgeReason = 'ok' | 'direction' | 'order' | 'shape';
export interface JudgeResult { ok: boolean; reason: JudgeReason; dist: number }

export const BOX = 109;

// SVG path (KanjiVG が使う M/L/C/S/H/V とその相対版) を点列にする
export function pathToPoints(d: string, seg = 12): Pt[] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0, cmd = 'M', x = 0, y = 0;
  let lcx: number | null = null, lcy: number | null = null;
  const pts: Pt[] = [];
  const num = () => parseFloat(toks[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    for (let t = 1; t <= seg; t++) {
      const s = t / seg, a = (1 - s) ** 3, b = 3 * (1 - s) ** 2 * s, c = 3 * (1 - s) * s * s, e = s ** 3;
      pts.push([a * x + b * x1 + c * x2 + e * x3, a * y + b * y1 + c * y2 + e * y3]);
    }
    lcx = x2; lcy = y2; x = x3; y = y3;
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': x = num() + ox; y = num() + oy; pts.push([x, y]); cmd = rel ? 'l' : 'L'; break;
      case 'L': x = num() + ox; y = num() + oy; pts.push([x, y]); lcx = null; break;
      case 'H': x = num() + (rel ? x : 0); pts.push([x, y]); break;
      case 'V': y = num() + (rel ? y : 0); pts.push([x, y]); break;
      case 'C': { const a = num() + ox, b = num() + oy, c = num() + ox, d2 = num() + oy, e = num() + ox, f = num() + oy; cubic(a, b, c, d2, e, f); break; }
      case 'S': {
        const a = lcx == null ? x : 2 * x - lcx, b = lcy == null ? y : 2 * y - lcy;
        const c = num() + ox, d2 = num() + oy, e = num() + ox, f = num() + oy;
        cubic(a, b, c, d2, e, f); break;
      }
      case 'Z': break;
      default: throw new Error('unsupported path command ' + cmd);
    }
  }
  return pts;
}

export function resample(s: Pt[], n = 16): Pt[] {
  if (s.length === 1) return Array.from({ length: n }, () => s[0]);
  const L = [0];
  for (let i = 1; i < s.length; i++) L.push(L[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const T = L[L.length - 1] || 1, out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = T * k / (n - 1);
    while (j < s.length - 2 && L[j + 1] < t) j++;
    const a = L[j], b = L[j + 1] ?? a, r = b > a ? (t - a) / (b - a) : 0;
    const p = s[j], q = s[j + 1] ?? p;
    out.push([p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r]);
  }
  return out;
}

// 始点→終点の向きが手本と逆になっていないか（点のような短い画は見逃す）
function sameDirection(u: Pt[], t: Pt[]): boolean {
  const tv = [t[t.length - 1][0] - t[0][0], t[t.length - 1][1] - t[0][1]];
  const uv = [u[u.length - 1][0] - u[0][0], u[u.length - 1][1] - u[0][1]];
  if (Math.hypot(tv[0], tv[1]) < 8) return true;
  return uv[0] * tv[0] + uv[1] * tv[1] > 0;
}

const meanDist = (a: Pt[], b: Pt[]) => a.reduce((m, p, i) => m + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

// すでに合格した画（対応が分かっている）から、子どもの字の「位置ずれ・大きさ」を推定する
// 一様スケール + 平行移動の最小二乗。
// 1画だけだと大きさが大きくぶれる（途中で止めただけで倍率が上限に張り付く）ので、2画書くまでは補正しない。
function fitTransform(userDone: Pt[][], tplDone: Pt[][]) {
  if (userDone.length < 2) return { s: 1, tx: 0, ty: 0 };
  const U = userDone.flat(), T = tplDone.flat();
  const mu = [0, 0], mt = [0, 0];
  U.forEach(p => { mu[0] += p[0] / U.length; mu[1] += p[1] / U.length; });
  T.forEach(p => { mt[0] += p[0] / T.length; mt[1] += p[1] / T.length; });
  let num = 0, den = 0;
  U.forEach((p, i) => {
    const ux = p[0] - mu[0], uy = p[1] - mu[1];
    num += ux * (T[i][0] - mt[0]) + uy * (T[i][1] - mt[1]);
    den += ux * ux + uy * uy;
  });
  let s = den > 1e-6 ? num / den : 1;
  s = Math.min(1.6, Math.max(0.6, s));
  return { s, tx: mt[0] - s * mu[0], ty: mt[1] - s * mu[1] };
}

// 許容値（109ボックス単位の平均距離）
export const TOLERANCE = { easy: 20, normal: 16, strict: 12 } as const;
export type Tolerance = keyof typeof TOLERANCE;

export class StrokeJudge {
  private tpl: Pt[][];
  private done: Pt[][] = []; // 合格した画（ユーザー座標, resample済）

  constructor(pathDs: string[], public tolerance: number = TOLERANCE.normal) {
    this.tpl = pathDs.map(d => resample(pathToPoints(d)));
  }
  get index() { return this.done.length; }
  get total() { return this.tpl.length; }
  get finished() { return this.done.length >= this.tpl.length; }

  judge(stroke: Pt[]): JudgeResult {
    const i = this.index;
    const u = resample(stroke);
    const { s, tx, ty } = fitTransform(this.done, this.tpl.slice(0, i));
    const fitted = u.map(([x, y]): Pt => [x * s + tx, y * s + ty]);
    // 補正が外れていても、手本どおりに書いた画は通す（補正あり・なしの近いほうで判定）
    const uu = meanDist(u, this.tpl[i]) < meanDist(fitted, this.tpl[i]) ? u : fitted;
    // 1画目は位置の手がかりがないので少しゆるく
    const tol = this.tolerance * (i === 0 ? 1.4 : 1);
    const dist = meanDist(uu, this.tpl[i]);
    if (dist < tol) {
      if (!sameDirection(uu, this.tpl[i])) return { ok: false, reason: 'direction', dist };
      this.done.push(u);
      return { ok: true, reason: 'ok', dist };
    }
    if (meanDist(uu.slice().reverse(), this.tpl[i]) < tol) return { ok: false, reason: 'direction', dist };
    for (let k = i + 1; k < this.tpl.length; k++) if (meanDist(uu, this.tpl[k]) < tol) return { ok: false, reason: 'order', dist };
    return { ok: false, reason: 'shape', dist };
  }
}
