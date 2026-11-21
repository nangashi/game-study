import { describe, expect, it } from 'vitest';
import {
  KAZU_UNITS, checkFields, fmtTenths, judgeScore, kazuUnitById, makeKazuSet, typeKey, typeOrder, unitTypes, yomi,
  type ChoiceQuestion, type Fig, type InputQuestion, type KazuQuestion, type KazuType, type Piece,
} from '.';

// 決まった並びの乱数（mulberry32）
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 2000; // 単元・タイプごとに作る数

// 欄を答えでうめた問題文（分数は「a/b」）
function filled(q: KazuQuestion): string {
  const ans = (i: number) => (q.mode === 'input' ? String(q.answers[i]) : '?');
  const slot = (s: number | { field: number }) => (typeof s === 'number' ? String(s) : ans(s.field));
  return q.text.map((p: Piece) => (p.t === 'text' ? p.s : p.t === 'field' ? ans(p.i) : p.t === 'frac' ? `${slot(p.num)}/${slot(p.den)}` : '')).join(' ')
    .replace(/\s+/g, ' ').trim();
}

const optNum = (p: Piece): number => {
  if (p.t === 'text') return Number(p.s);
  if (p.t === 'frac' && typeof p.num === 'number' && typeof p.den === 'number') return p.num / p.den;
  throw new Error('数でない選択肢');
};
const ratio = (p: Piece) => {
  if (p.t !== 'fig' || (p.fig.kind !== 'pie' && p.fig.kind !== 'bar')) throw new Error('絵でない選択肢');
  return p.fig.filled / p.fig.parts;
};
const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

// 読み（ひらがな）→ 数（yomi とは別に書いた逆引き）
function fromYomi(s: string): number {
  const hundreds: Record<string, number> = { ひゃく: 1, にひゃく: 2, さんびゃく: 3, よんひゃく: 4, ごひゃく: 5, ろっぴゃく: 6, ななひゃく: 7, はっぴゃく: 8, きゅうひゃく: 9 };
  const ones: Record<string, number> = { いち: 1, に: 2, さん: 3, よん: 4, ご: 5, ろく: 6, なな: 7, はち: 8, きゅう: 9 };
  let n = 0;
  for (const w of s.trim().split(' ')) {
    if (w in hundreds) n += hundreds[w] * 100;
    else if (w.endsWith('じゅう')) n += (w === 'じゅう' ? 1 : ones[w.slice(0, -3)]) * 10;
    else n += ones[w];
  }
  return n;
}

const asInput = (q: KazuQuestion) => { expect(q.mode).toBe('input'); return q as InputQuestion; };
const asChoice = (q: KazuQuestion) => { expect(q.mode).toBe('choice'); return q as ChoiceQuestion; };

// タイプごとに、答えが正しいかを問題の見た目から確かめる
const CHECK: Record<KazuType, (q: KazuQuestion) => void> = {
  compare: q => {
    const c = asChoice(q);
    const v = c.options.map(optNum);
    expect(v.length).toBe(2);
    expect(v[0]).not.toBe(v[1]);
    expect(v[c.answer]).toBe(Math.max(...v));
  },
  sequence: q => {
    const s = filled(asInput(q)).split(' ').map(Number);
    expect(s.length).toBe(4);
    s.forEach((x, i) => expect(x).toBe(s[0] + i));
    expect(q.text.filter(p => p.t === 'field').length).toBe(1);
  },
  numberLine: q => {
    const f = q.fig as Extract<Fig, { kind: 'numberLine' }>;
    expect(f.kind).toBe('numberLine');
    expect(asInput(q).answers).toEqual([f.value]);
    expect(f.value).toBeGreaterThan(0);
    expect(f.value).toBeLessThan(f.max);
    expect(f.value % (f.step / 2)).toBe(0); // 目盛りか、目盛りのまん中
  },
  placeIntro: q => {
    const m = filled(asInput(q)).match(/^(\d+)は 10が (\d) ?こ と、1が (\d) ?こ$/)!;
    expect(m).not.toBeNull();
    expect(Number(m[2]) * 10 + Number(m[3])).toBe(Number(m[1]));
  },
  decompose: q => {
    const m = filled(asInput(q)).match(/^(\d+)は (\d+)と (\d+)$/)!;
    expect(Number(m[2]) + Number(m[3])).toBe(Number(m[1]));
    expect(q.fig).toEqual({ kind: 'dots', total: Number(m[1]), on: Number(m[2]) });
    expect(Number(m[3])).toBeGreaterThan(0);
  },
  compose: q => {
    const m = filled(asInput(q)).match(/^(\d+)と (\d+)で (\d+)$/)!;
    expect(Number(m[1]) + Number(m[2])).toBe(Number(m[3]));
  },
  tenSplit: q => {
    const m = filled(asInput(q)).match(/^10は (\d+)と (\d+)$/)!;
    expect(Number(m[1]) + Number(m[2])).toBe(10);
    expect(q.fig).toEqual({ kind: 'tenFrame', on: Number(m[1]) });
  },
  place3: q => {
    const m = filled(asInput(q)).match(/^(\d+)は 100が (\d) ?こ、 ?10が (\d) ?こ、 ?1が (\d) ?こ$/)!;
    expect(m).not.toBeNull();
    expect(Number(m[2]) * 100 + Number(m[3]) * 10 + Number(m[4])).toBe(Number(m[1]));
  },
  words: q => {
    const t = (q.text[0] as { s: string }).s.replace('　→', '');
    expect(fromYomi(t)).toBe(asInput(q).answers[0]);
  },
  halfPick: q => {
    const c = asChoice(q);
    expect(c.options.length).toBe(3);
    c.options.forEach((o, i) => (i === c.answer ? expect(ratio(o)).toBe(1 / 2) : expect(ratio(o)).not.toBe(1 / 2)));
  },
  quarterPick: q => {
    const c = asChoice(q);
    expect(c.options.length).toBe(3);
    c.options.forEach((o, i) => (i === c.answer ? expect(ratio(o)).toBe(1 / 4) : expect(ratio(o)).not.toBe(1 / 4)));
  },
  partName: q => {
    const c = asChoice(q);
    const f = q.fig as Extract<Fig, { kind: 'pie' | 'bar' }>;
    expect(c.options).toEqual([{ t: 'text', s: 'はんぶん' }, { t: 'text', s: '4分の1' }]);
    expect(f.filled / f.parts).toBe(c.answer === 0 ? 1 / 2 : 1 / 4);
  },
  place5: q => {
    const m = filled(asInput(q)).match(/^(\d+)の (.)の くらいは (\d)$/)!;
    const p = ['一', '十', '百', '千', '万'].indexOf(m[2]);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(m[1].length);
    expect(Math.floor(Number(m[1]) / 10 ** p) % 10).toBe(Number(m[3]));
  },
  times10: q => {
    const m = filled(asInput(q)).match(/^(\d+)の 10ばいは (\d+)$/)!;
    expect(Number(m[1]) * 10).toBe(Number(m[2]));
  },
  tenth: q => {
    const m = filled(asInput(q)).match(/^(\d+)の 10分の1は (\d+)$/)!;
    expect(Number(m[2]) * 10).toBe(Number(m[1]));
  },
  fracRead: q => {
    const f = q.fig as Extract<Fig, { kind: 'pie' }>;
    expect(f.kind).toBe('pie');
    expect(asInput(q).answers).toEqual([f.filled, f.parts]); // 欄0 が分子、欄1 が分母
    expect(f.filled).toBeLessThan(f.parts);
  },
  fracCompare: q => {
    const c = asChoice(q);
    const dens = c.options.map(o => (o.t === 'frac' ? o.den : -1));
    expect(dens[0]).toBe(dens[1]);
    const v = c.options.map(optNum);
    expect(v[0]).not.toBe(v[1]);
    expect(v[c.answer]).toBe(Math.max(...v));
  },
  fracAdd: q => {
    const m = filled(asInput(q)).match(/^(\d+)\/(\d+) ＋ (\d+)\/(\d+) ＝ (\d+)\/(\d+)$/)!;
    const [a, d1, b, d2, s, d3] = m.slice(1).map(Number);
    expect(d1).toBe(d2);
    expect(d1).toBe(d3);
    expect(a + b).toBe(s);
    expect(s).toBeLessThanOrEqual(d1); // 和は1まで
    expect(q.text.filter(p => p.t === 'frac' && typeof p.den !== 'number').length).toBe(0); // 分母は表示
  },
  decimalCount: q => {
    const m = filled(asInput(q)).match(/^0\.1が (\d+) こで ([\d.]+)$/)!;
    expect(Number(m[1])).toBe(Math.round(Number(m[2]) * 10));
    expect(Number(m[1])).toBeLessThanOrEqual(99); // 9.9 までの小数
    expect(asInput(q).decimal).toBe(false);
  },
  decimalCompare: q => {
    const c = asChoice(q);
    const v = c.options.map(optNum);
    expect(v[0]).not.toBe(v[1]);
    expect(v[c.answer]).toBe(Math.max(...v));
    c.options.forEach(o => expect((o as { s: string }).s).toMatch(/^\d\.\d$/));
  },
  decimalCalc: q => {
    const i = asInput(q);
    expect(i.decimal).toBe(true);
    const m = filled(i).match(/^(\d\.\d) ([＋−]) (\d\.\d) ＝ ([\d.]+)$/)!;
    const a = Math.round(Number(m[1]) * 10), b = Math.round(Number(m[3]) * 10);
    const r = m[2] === '＋' ? a + b : a - b;
    expect(r).toBeGreaterThan(0);
    expect(i.answers[0]).toBe(r / 10);
    expect(fmtTenths(r)).toBe(m[4]); // 答えの表示が 10分の1の位まで
  },
};

// 問題に出てくる数（問題文・分数・図・選択肢・答え）
function allNumbers(q: KazuQuestion): number[] {
  const out: number[] = [];
  const piece = (p: Piece) => {
    if (p.t === 'text') out.push(...nums(p.s));
    else if (p.t === 'frac') {
      for (const s of [p.num, p.den]) if (typeof s === 'number') out.push(s);
    } else if (p.t === 'fig') fig(p.fig);
  };
  const fig = (f: Fig) => {
    if (f.kind === 'numberLine') out.push(f.max, f.value);
    else if (f.kind === 'dots') out.push(f.total, f.on);
    else if (f.kind === 'tenFrame') out.push(10, f.on);
    else out.push(f.parts, f.filled);
  };
  q.text.forEach(piece);
  if (q.fig) fig(q.fig);
  if (q.mode === 'choice') q.options.forEach(piece);
  else if (q.type !== 'decimalCount') out.push(...q.answers); // 0.1の こ数は 小数ではないので べつに見る
  return out;
}

const SPEC: Record<string, KazuType[]> = {
  'kazu:n100': ['compare', 'sequence', 'numberLine', 'placeIntro'],
  'kazu:ikutsu': ['decompose', 'compose', 'tenSplit'],
  'kazu:n1000': ['place3', 'words', 'compare', 'numberLine'],
  'kazu:bunkatsu': ['halfPick', 'quarterPick', 'partName'],
  'kazu:n10000': ['place5', 'times10', 'tenth', 'compare', 'numberLine'],
  'kazu:bunsu': ['fracRead', 'fracCompare', 'fracAdd'],
  'kazu:shosu': ['decimalCount', 'decimalCompare', 'decimalCalc'],
};

describe('かずの道', () => {
  it('7単元。id は決めたとおり（記録のキーなので変えない）', () => {
    expect(KAZU_UNITS.map(u => u.id)).toEqual(Object.keys(SPEC));
    expect(KAZU_UNITS.map(u => u.num)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(KAZU_UNITS.map(u => u.name)).toEqual([
      '100までの かず', 'いくつと いくつ', '1000までの かず', 'はんぶん・4とうぶん',
      '10000までの かずと おおきな かず', 'ぶんすう', 'しょうすう',
    ]);
    expect(kazuUnitById('kazu:bunsu')?.num).toBe(6);
  });

  it('各単元の問題タイプは仕様どおり', () => {
    for (const u of KAZU_UNITS) expect(unitTypes(u)).toEqual(SPEC[u.id]);
  });

  it('入力の問題と選択の問題: 単元4は選択だけ。小数点キーは しょうすうの計算だけ', () => {
    for (const u of KAZU_UNITS) {
      for (const t of unitTypes(u)) {
        const rng = seeded(7);
        for (let i = 0; i < 200; i++) {
          const q = u.gens[t]!(rng);
          expect(q.type).toBe(t);
          if (u.id === 'kazu:bunkatsu') expect(q.mode).toBe('choice');
          if (q.mode === 'input') {
            expect(q.decimal).toBe(t === 'decimalCalc');
            // 欄の番号は 0 から answers の数だけ
            const ids = q.text.flatMap(p => (p.t === 'field' ? [p.i] : p.t === 'frac'
              ? [p.num, p.den].flatMap(s => (typeof s === 'number' ? [] : [s.field])) : []));
            expect(ids.sort()).toEqual(q.answers.map((_, k) => k));
          } else {
            expect(q.answer).toBeGreaterThanOrEqual(0);
            expect(q.answer).toBeLessThan(q.options.length);
          }
        }
      }
    }
  });

  for (const u of KAZU_UNITS) {
    describe(`${u.num}. ${u.name}`, () => {
      for (const t of unitTypes(u)) {
        it(`${t}: 答えが正しく、数は 0〜${u.max} におさまる`, () => {
          const rng = seeded(u.num * 100 + t.length);
          for (let i = 0; i < N; i++) {
            const q = u.gens[t]!(rng);
            CHECK[t](q);
            for (const n of allNumbers(q)) {
              expect(n).toBeGreaterThanOrEqual(0);
              expect(n).toBeLessThanOrEqual(u.max);
              if (u.id !== 'kazu:shosu') expect(Number.isInteger(n)).toBe(true);
            }
            if (q.mode === 'input') for (const a of q.answers) expect(String(a).replace('.', '').length).toBeLessThanOrEqual(6);
          }
        });
      }

      it('10問のセット: 指定のタイプが全部入り、同じタイプが続かない', () => {
        const rng = seeded(u.num);
        for (let k = 0; k < 300; k++) {
          const set = makeKazuSet(u, rng);
          expect(set.length).toBe(10);
          expect(new Set(set.map(q => q.type))).toEqual(new Set(SPEC[u.id]));
          for (let i = 1; i < set.length; i++) expect(set[i].type).not.toBe(set[i - 1].type);
        }
      });
    });
  }

  it('10問のセット: 問題がかぶりにくい（単元4以外は かぶりなし）', () => {
    const rng = seeded(42);
    for (const u of KAZU_UNITS) {
      for (let k = 0; k < 100; k++) {
        const keys = makeKazuSet(u, rng).map(q => q.key);
        if (u.id !== 'kazu:bunkatsu') expect(new Set(keys).size).toBe(10);
        else expect(new Set(keys).size).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('typeOrder: タイプの数は なるべく同じ', () => {
    const rng = seeded(3);
    const order = typeOrder(['place5', 'times10', 'tenth', 'compare', 'numberLine'], rng);
    const c = new Map<string, number>();
    order.forEach(t => c.set(t, (c.get(t) ?? 0) + 1));
    expect([...c.values()]).toEqual([2, 2, 2, 2, 2]);
  });

  it('数の読み', () => {
    expect(yomi(315)).toBe('さんびゃく じゅう ご');
    expect(yomi(608)).toBe('ろっぴゃく はち');
    expect(yomi(840)).toBe('はっぴゃく よんじゅう');
    expect(yomi(100)).toBe('ひゃく');
    for (let n = 101; n <= 999; n++) expect(fromYomi(yomi(n))).toBe(n);
  });

  it('小数の表示', () => {
    expect([7, 13, 10, 99].map(fmtTenths)).toEqual(['0.7', '1.3', '1', '9.9']);
  });

  it('入力: 6けたまで・先頭の0・小数点は decimal のときだけ1つ', () => {
    let s = '';
    for (const k of '1234567') s = typeKey(s, k, false);
    expect(s).toBe('123456');
    expect(typeKey('0', '5', false)).toBe('5');
    expect(typeKey('', '.', false)).toBe('');
    expect(typeKey('', '.', true)).toBe('0.');
    expect(typeKey('0.', '9', true)).toBe('0.9');
    expect(typeKey('1.2', '.', true)).toBe('1.2');
  });

  it('判定: 欄ごと。小数は数として比べる', () => {
    const q = { type: 'fracRead', key: '', text: [], mode: 'input', answers: [3, 5], decimal: false } as InputQuestion;
    expect(checkFields(q, ['3', '5'])).toEqual([true, true]);
    expect(checkFields(q, ['3', ''])).toEqual([true, false]);
    expect(checkFields(q, ['5', '3'])).toEqual([false, false]);
    const d = { ...q, type: 'decimalCalc', answers: [0.9], decimal: true } as InputQuestion;
    expect(checkFields(d, ['0.9'])).toEqual([true]);
    expect(checkFields({ ...d, answers: [1] }, ['1.0'])).toEqual([true]);
  });

  it('星とクリアは けいさんと同じ（8問→★1、9問→★2、10問→★3）', () => {
    expect([7, 8, 9, 10].map(judgeScore)).toEqual([
      { cleared: false, stars: 0 }, { cleared: true, stars: 1 }, { cleared: true, stars: 2 }, { cleared: true, stars: 3 },
    ]);
  });
});
