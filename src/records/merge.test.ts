import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../learn/keisan/__original__/harness';
import type { Rng } from '../learn/random';
import { mergeFamily, mergeStamped } from './merge';
import { emptyFamily, finishKeisanStage, newChild, normalizeFamily, recordUnitResult, resetFamily, updateSettings } from './model';
import { stageByNum } from '../learn/keisan';
import type { ChildRecord, FamilyRecords, Stamped } from './types';
import { RECORDS_VERSION } from './types';

// ---- ばらばらな記録を作る（同じ時刻・同じ値がよく重なるように、小さい範囲から選ぶ） ----

const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pickOne = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const some = <T>(r: Rng, xs: readonly T[]) => xs.filter(() => r() < 0.5);

function randChild(r: Rng, id: string): ChildRecord {
  const stamped = <T>(v: T): Stamped<T> => ({ value: v, at: int(r, 0, 3) });
  return {
    id,
    createdAt: int(r, 1, 3),
    settings: stamped({
      name: pickOne(r, ['たろう', 'はなこ']), avatar: pickOne(r, ['cat', 'dog']),
      tolerance: pickOne(r, ['easy', 'normal', 'strict'] as const), sound: r() < 0.5, removed: r() < 0.2,
    }),
    units: Object.fromEntries(some(r, ['hira:1', 'hira:2', 'hira:3']).map(u => [u, { stars: int(r, 0, 3), cleared: r() < 0.5 }])),
    keisan: {
      stages: Object.fromEntries(some(r, ['s1', 's2', 's3']).map(s => [s, {
        cleared: r() < 0.5, stars: int(r, 0, 3), bestScore: int(r, 0, 10), bestTime: pickOne(r, [0, 20, 35, 50]),
      }])),
      playableThrough: int(r, 1, 48),
      testDone: r() < 0.5,
      testProgress: stamped(r() < 0.5 ? null : {
        ladderVersion: 1, able: some(r, [1, 3, 5]), asked: int(r, 0, 20), completedSystems: some(r, [0, 1]),
        tentativeS: r() < 0.5 ? null : int(r, 1, 48), nextSys: int(r, 0, 3),
      }),
      lastStage: stamped(r() < 0.3 ? null : pickOne(r, ['s1', 's2', 's5'])),
    },
  };
}

function randFamily(r: Rng): FamilyRecords {
  const ids = some(r, ['a', 'b', 'c']);
  // 全消しの印は、たいてい同じ（0）で、ときどき新しい
  const resetAt = r() < 0.7 ? 0 : int(r, 1, 2);
  return { version: RECORDS_VERSION, resetAt, children: Object.fromEntries(ids.map(id => [id, randChild(r, id)])) };
}

// m が a 以上（進み具合が減っていない、更新時刻が戻っていない）。
// ただし m の全消しの印が a より新しいときは、a は全消しより前の控えなので比べない
function expectAtLeast(m: FamilyRecords, a: FamilyRecords) {
  expect(m.resetAt).toBeGreaterThanOrEqual(a.resetAt);
  if (m.resetAt > a.resetAt) return;
  for (const [id, ca] of Object.entries(a.children)) {
    const cm = m.children[id];
    expect(cm, id).toBeDefined();
    expect(cm.createdAt).toBeLessThanOrEqual(ca.createdAt);
    expect(cm.settings.at).toBeGreaterThanOrEqual(ca.settings.at);
    for (const [u, pa] of Object.entries(ca.units)) {
      const pm = cm.units[u];
      expect(pm.stars).toBeGreaterThanOrEqual(pa.stars);
      if (pa.cleared) expect(pm.cleared).toBe(true);
    }
    const ka = ca.keisan, km = cm.keisan;
    for (const [s, sa] of Object.entries(ka.stages)) {
      const sm = km.stages[s];
      expect(sm.stars).toBeGreaterThanOrEqual(sa.stars);
      expect(sm.bestScore).toBeGreaterThanOrEqual(sa.bestScore);
      if (sa.cleared) expect(sm.cleared).toBe(true);
      if (sa.bestTime) {
        expect(sm.bestTime).toBeGreaterThan(0);
        expect(sm.bestTime).toBeLessThanOrEqual(sa.bestTime);
      }
    }
    expect(km.playableThrough).toBeGreaterThanOrEqual(ka.playableThrough);
    if (ka.testDone) expect(km.testDone).toBe(true);
    expect(km.testProgress.at).toBeGreaterThanOrEqual(ka.testProgress.at);
    expect(km.lastStage.at).toBeGreaterThanOrEqual(ka.lastStage.at);
  }
}

describe('mergeFamily の性質（ばらばらな記録 500 組）', () => {
  const cases = Array.from({ length: 500 }, (_, i) => {
    const r = mulberry32(9000 + i);
    return [randFamily(r), randFamily(r), randFamily(r)] as const;
  });

  it('交換法則: どちらから合わせても同じ', () => {
    for (const [a, b] of cases) expect(mergeFamily(a, b)).toEqual(mergeFamily(b, a));
  });

  it('冪等: 同じものを合わせても変わらない／合わせた結果にもう一度合わせても変わらない', () => {
    for (const [a, b] of cases) {
      expect(mergeFamily(a, a)).toEqual(a);
      const m = mergeFamily(a, b);
      expect(mergeFamily(m, b)).toEqual(m);
      expect(mergeFamily(m, a)).toEqual(m);
    }
  });

  it('結合法則: 3台の端末をどの順に合わせても同じ', () => {
    for (const [a, b, c] of cases) expect(mergeFamily(mergeFamily(a, b), c)).toEqual(mergeFamily(a, mergeFamily(b, c)));
  });

  it('単調: 合わせた結果は、どちらの記録よりも進み具合が減らない', () => {
    for (const [a, b] of cases) {
      const m = mergeFamily(a, b);
      expectAtLeast(m, a);
      expectAtLeast(m, b);
      expect(m.resetAt).toBe(Math.max(a.resetAt, b.resetAt));
      if (a.resetAt !== b.resetAt) continue;
      expect(Object.keys(m.children).sort()).toEqual([...new Set([...Object.keys(a.children), ...Object.keys(b.children)])].sort());
    }
  });

  it('合わせた結果は保存・読み込みしても同じ', () => {
    for (const [a, b] of cases) {
      const m = mergeFamily(a, b);
      expect(normalizeFamily(JSON.parse(JSON.stringify(m)))).toEqual(m);
    }
  });
});

describe('mergeFamily の合わせ方', () => {
  const s1 = stageByNum(1), s2 = stageByNum(2);
  const base: FamilyRecords = { version: RECORDS_VERSION, resetAt: 0, children: { a: newChild('a', { name: 'たろう' }, 100) } };

  it('古い控えから保存しても、新しい記録は消えない', () => {
    // 端末A: s1 を 10問正解 40秒でクリア。端末B（古い控え）: s1 を 8問 30秒、s2 は 5問
    let a = base.children.a;
    a = finishKeisanStage(a, s1, 10, 40, 200).child;
    let b = base.children.a;
    b = finishKeisanStage(b, s1, 8, 30, 150).child;
    b = finishKeisanStage(b, s2, 5, 60, 160).child;
    const m = mergeFamily({ ...base, children: { a } }, { ...base, children: { a: b } }).children.a;
    expect(m.keisan.stages.s1).toEqual({ cleared: true, stars: 3, bestScore: 10, bestTime: 30 });
    expect(m.keisan.stages.s2).toEqual({ cleared: false, stars: 0, bestScore: 5, bestTime: 60 });
    expect(m.keisan.playableThrough).toBe(2);
    expect(m.keisan.lastStage).toEqual({ value: 's1', at: 200 });
  });

  it('ベストタイムの 0 は「記録なし」として扱う', () => {
    const a = { ...base.children.a, keisan: { ...base.children.a.keisan, stages: { s1: { cleared: false, stars: 0, bestScore: 0, bestTime: 0 } } } };
    const b = { ...base.children.a, keisan: { ...base.children.a.keisan, stages: { s1: { cleared: true, stars: 1, bestScore: 8, bestTime: 42 } } } };
    expect(mergeFamily({ ...base, children: { a } }, { ...base, children: { a: b } }).children.a.keisan.stages.s1.bestTime).toBe(42);
  });

  it('名前などの設定は、あとから保存した方が勝つ（消した子どもは戻らない）', () => {
    const renamed = updateSettings(base.children.a, { name: 'たろちゃん', sound: false }, 300);
    const removed = updateSettings(base.children.a, { removed: true }, 400);
    const m1 = mergeFamily({ ...base, children: { a: renamed } }, base).children.a;
    expect(m1.settings.value).toMatchObject({ name: 'たろちゃん', sound: false });
    const m2 = mergeFamily({ ...base, children: { a: renamed } }, { ...base, children: { a: removed } }).children.a;
    expect(m2.settings.value).toMatchObject({ name: 'たろう', removed: true });
  });

  it('片方の端末にしかいない子どもは、そのまま残る', () => {
    const other = { ...base, children: { b: newChild('b', { name: 'はなこ' }, 120) } };
    expect(Object.keys(mergeFamily(base, other).children).sort()).toEqual(['a', 'b']);
  });

  it('mergeStamped: 同じ時刻なら中身で決まる（キーの並びによらない）', () => {
    const x = { value: { p: 1, q: 2 }, at: 5 }, y = { value: { q: 2, p: 1 }, at: 5 }, z = { value: { p: 2, q: 0 }, at: 5 };
    expect(mergeStamped(x, z).value).toEqual(mergeStamped(z, x).value);
    expect(mergeStamped(x, y).value).toEqual(mergeStamped(y, x).value);
  });
});

describe('全消し（リセット印 resetAt）', () => {
  const s1 = stageByNum(1);
  // 端末A と 端末B が同じ家族のデータを持っている（たろう が s1 をクリア、ひらがな1 も星3）
  let taro = newChild('a', { name: 'たろう' }, 100);
  taro = finishKeisanStage(taro, s1, 10, 40, 200).child;
  taro = recordUnitResult(taro, 'hira:1', 3, true);
  const shared: FamilyRecords = { version: RECORDS_VERSION, resetAt: 0, children: { a: taro } };

  it('全消しは進み具合と子どもを空にし、印を今にする', () => {
    const r = resetFamily(shared, 1000);
    expect(r).toEqual({ version: RECORDS_VERSION, resetAt: 1000, children: {} });
    // 時計が戻っていても、印は前より新しくなる
    expect(resetFamily(r, 500).resetAt).toBe(1001);
  });

  it('ほかの端末の古い控えから、消した記録が戻ってこない（どちらから合わせても）', () => {
    const reset = resetFamily(shared, 1000);
    expect(mergeFamily(reset, shared)).toEqual(reset);
    expect(mergeFamily(shared, reset)).toEqual(reset);
  });

  it('古い控えで全消しの前に進めた分も持ち込まない', () => {
    const stale = { ...shared, children: { a: finishKeisanStage(taro, stageByNum(2), 10, 30, 900).child } };
    const m = mergeFamily(stale, resetFamily(shared, 1000));
    expect(m.children).toEqual({});
  });

  it('全消しのあとに進めた記録は、ほかの端末と合わせて残る', () => {
    const reset = resetFamily(shared, 1000);
    // 端末A: 全消しのあと はなこ を登録して s1 をクリア。端末B: 全消しを受け取ってから じろう を登録
    let hana = newChild('h', { name: 'はなこ' }, 1100);
    hana = finishKeisanStage(hana, s1, 9, 50, 1200).child;
    const a = { ...reset, children: { h: hana } };
    const b = { ...reset, children: { j: newChild('j', { name: 'じろう' }, 1300) } };
    const m = mergeFamily(mergeFamily(a, shared), b); // 途中で古い控えがまざっても
    expect(m.resetAt).toBe(1000);
    expect(Object.keys(m.children).sort()).toEqual(['h', 'j']);
    expect(m.children.h.keisan.stages.s1).toMatchObject({ cleared: true, bestScore: 9 });
  });

  it('リセット印は保存・読み込みしても残る。古い形（印なし）は 0 として読む', () => {
    const reset = resetFamily(shared, 1000);
    expect(normalizeFamily(JSON.parse(JSON.stringify(reset)))).toEqual(reset);
    expect(normalizeFamily({ version: 2, children: {} })).toEqual(emptyFamily());
  });
});
