export type Rng = () => number;

export const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 正解と、正解とかぶらない候補から選択肢を作る。戻り値は [選択肢, 正解の位置]
export function makeChoices<T>(rng: Rng, answer: T, distractors: readonly T[], count = 3): [T[], number] {
  const others = shuffle(rng, [...new Set(distractors)].filter(d => d !== answer)).slice(0, count - 1);
  const all = shuffle(rng, [answer, ...others]);
  return [all, all.indexOf(answer)];
}
