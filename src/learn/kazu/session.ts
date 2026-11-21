import { judgeScore, SET_SIZE } from '../keisan';
import { pick, shuffle, type Rng } from '../random';
import type { InputQuestion, KazuQuestion, KazuType } from './questions';
import { unitTypes, type KazuUnit } from './units';

// 単元を1回やるときの決まり。10問・星・クリアは けいさんと同じ（judgeScore）。時間は記録しない

export { judgeScore, SET_SIZE };
export const MAX_INPUT_DIGITS = 6; // 入力は6けたまで（小数点は数えない）

// 10問のタイプの並び。どのタイプも1回は出し（数はなるべく同じに）、同じタイプが続かないようにする
export function typeOrder(types: readonly KazuType[], rng: Rng, n = SET_SIZE): KazuType[] {
  const count = new Map<KazuType, number>(types.map(t => [t, Math.floor(n / types.length)]));
  for (const t of shuffle(rng, types).slice(0, n % types.length)) count.set(t, count.get(t)! + 1);
  const out: KazuType[] = [];
  let prev: KazuType | null = null;
  for (let i = 0; i < n; i++) {
    let cands = types.filter(t => count.get(t)! > 0 && t !== prev);
    if (cands.length === 0) cands = types.filter(t => count.get(t)! > 0);
    // 残りが多いタイプから選ぶ（最後に同じタイプだけが残らないように）
    const most = Math.max(...cands.map(t => count.get(t)!));
    const t = pick(rng, cands.filter(c => count.get(c) === most));
    count.set(t, count.get(t)! - 1);
    out.push(t);
    prev = t;
  }
  return out;
}

// 10問のセット。中身が同じ問題は30回まで作り直す（それでもかぶるときは、かぶりを許す）
export function makeKazuSet(unit: KazuUnit, rng: Rng): KazuQuestion[] {
  const seen = new Set<string>();
  return typeOrder(unitTypes(unit), rng).map(t => {
    const gen = unit.gens[t]!;
    let q = gen(rng);
    for (let i = 0; i < 30 && seen.has(q.key); i++) q = gen(rng);
    seen.add(q.key);
    return q;
  });
}

// 数字キーの入力。先頭の0はおきかえる（「0.」はそのまま）。6けたをこえたら受けつけない。
// 「.」は decimal のときだけ、1つまで（空なら「0.」にする）
export function typeKey(input: string, key: string, decimal: boolean): string {
  if (key === '.') {
    if (!decimal || input.includes('.')) return input;
    return input === '' ? '0.' : input + '.';
  }
  if (!/^\d$/.test(key)) return input;
  if (input.replace('.', '').length >= MAX_INPUT_DIGITS) return input;
  if (input === '0') return key;
  return input + key;
}

// 欄ごとの正誤（空の欄はまちがい）
export const checkFields = (q: InputQuestion, inputs: readonly string[]): boolean[] =>
  q.answers.map((a, i) => {
    const v = inputs[i] ?? '';
    return v !== '' && Number(v) === a;
  });
