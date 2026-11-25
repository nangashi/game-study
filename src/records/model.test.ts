import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../learn/keisan/__original__/harness';
import { applyTestResult, mergeStageResult, stageByNum, type TestProgress } from '../learn/keisan';
import {
  activeChildren, addChild, emptyFamily, finishKeisanStage, finishTest, kanjiCards, makeChildId, newChild, normalizeFamily,
  recordKanjiResult,
  recordUnitResult, removeChild, setTestProgress, startKeisanStage, updateChild,
} from './model';
import { RECORDS_KEY, clearRecords, loadRecords, saveRecords, type KeyValueStorage } from './storage';

const child = () => newChild('a', { name: 'たろう', avatar: 'cat' }, 100);

describe('子ども', () => {
  it('新しい子どもは初期値（書き取りはやさしい・音はオン）で始まる', () => {
    expect(child()).toEqual({
      id: 'a', createdAt: 100,
      settings: { value: { name: 'たろう', avatar: 'cat', tolerance: 'easy', sound: true, removed: false }, at: 100 },
      units: {},
      keisan: { stages: {}, playableThrough: 1, testDone: false, testProgress: { value: null, at: 0 }, lastStage: { value: null, at: 0 } },
      kanji: {},
    });
  });

  it('id は乱数から作る（同じ乱数なら同じ id）', () => {
    expect(makeChildId(mulberry32(1))).toMatch(/^[a-z0-9]{8}$/);
    expect(makeChildId(mulberry32(1))).toBe(makeChildId(mulberry32(1)));
  });

  it('消した子どもは一覧に出ない。一覧は作った順', () => {
    let fam = addChild(addChild(emptyFamily(), newChild('z', { name: '2' }, 50)), child());
    fam = addChild(fam, newChild('m', { name: '3' }, 300));
    expect(activeChildren(fam).map(c => c.id)).toEqual(['z', 'a', 'm']);
    fam = updateChild(fam, 'z', c => removeChild(c, 400));
    expect(activeChildren(fam).map(c => c.id)).toEqual(['a', 'm']);
    expect(fam.children.z.settings.value.removed).toBe(true);
  });
});

describe('単元の進み具合', () => {
  it('星はベスト、クリアは一度したら残る', () => {
    let c = recordUnitResult(child(), 'hira:1', 2, true);
    c = recordUnitResult(c, 'hira:1', 1, false);
    expect(c.units['hira:1']).toEqual({ stars: 2, cleared: true });
  });
});

describe('けいさん（算数練習アプリと同じ更新）', () => {
  const s3 = stageByNum(3);

  it('ステージを始めると lastStage が入る', () => {
    expect(startKeisanStage(child(), s3, 500).keisan.lastStage).toEqual({ value: s3.id, at: 500 });
  });

  it('終えると mergeStageResult と同じ記録になり、クリアしたら playableThrough が上がる', () => {
    const r1 = finishKeisanStage(child(), s3, 7, 50, 600);
    expect(r1.child.keisan.stages[s3.id]).toEqual(mergeStageResult(undefined, s3, 7, 50).record);
    expect(r1.child.keisan.playableThrough).toBe(1);
    expect(r1.child.keisan.lastStage).toEqual({ value: s3.id, at: 600 });
    const r2 = finishKeisanStage(r1.child, s3, 9, 40, 700);
    expect(r2).toMatchObject({ cleared: true, stars: 2, faster: true });
    expect(r2.child.keisan.stages[s3.id]).toEqual({ cleared: true, stars: 2, bestScore: 9, bestTime: 40 });
    expect(r2.child.keisan.playableThrough).toBe(4);
  });

  it('ちからだめし: 途中の記録を入れる・終えたら消して applyTestResult を反映する', () => {
    const tp: TestProgress = { ladderVersion: 1, able: [1, 3], asked: 10, completedSystems: [0], tentativeS: 12, nextSys: 1 };
    let c = setTestProgress(child(), tp, 800);
    expect(c.keisan.testProgress).toEqual({ value: tp, at: 800 });
    const res = { start: 12, total: 5, able: [1, 3, 5] };
    c = finishTest(c, res, 900);
    const want = applyTestResult(1, res);
    expect(c.keisan).toMatchObject({
      playableThrough: want.playableThrough, testDone: true,
      testProgress: { value: null, at: 900 }, lastStage: { value: want.lastStage, at: 900 },
    });
  });

  it('元の記録は書きかえない', () => {
    const c = child();
    const before = JSON.stringify(c);
    finishKeisanStage(c, s3, 10, 30, 1000);
    finishTest(c, { start: 20, total: 9, able: [] }, 1000);
    recordUnitResult(c, 'hira:1', 3, true);
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe('読み込んだデータをそろえる', () => {
  it('版がちがう・こわれているときは空のデータ（旧形式は読まない）', () => {
    for (const raw of [null, 1, 'x', [], {}, { version: 1, profiles: [] }, { version: 2 }, { version: 2, children: [] }]) {
      expect(normalizeFamily(raw)).toEqual(emptyFamily());
    }
  });

  it('おかしな値は初期値にし、範囲外は丸める', () => {
    const fam = normalizeFamily({
      version: 2,
      children: {
        a: {
          createdAt: 'x', settings: { value: { name: 3, tolerance: 'hard', sound: 'yes' }, at: 5 },
          units: { u: { stars: 9, cleared: 1 }, v: null },
          keisan: { stages: { s1: { stars: -1, bestTime: null } }, playableThrough: 99, testProgress: { value: 'bad', at: 3 }, lastStage: { value: 7 } },
          coins: 100,
        },
      },
    });
    expect(fam.children.a).toEqual({
      id: 'a', createdAt: 0,
      settings: { value: { name: '', avatar: '', tolerance: 'easy', sound: true, removed: false }, at: 5 },
      units: { u: { stars: 3, cleared: false }, v: { stars: 0, cleared: false } },
      keisan: {
        stages: { s1: { cleared: false, stars: 0, bestScore: 0, bestTime: 0 } },
        playableThrough: 48, testDone: false,
        testProgress: { value: null, at: 3 }, lastStage: { value: null, at: 0 },
      },
      kanji: {},
    });
  });

  it('漢字のカード: 形のおかしいカードは捨てる（出題していない字として扱う）', () => {
    const ok = {
      一: { value: { status: 'learning', track: 'A', interval: 14, due: '2026-12-09', firstSeen: 1, asked: 1 }, at: 10 },
      二: { value: { status: 'failed', firstSeen: 2, asked: 2.7, extra: 1 }, at: 11 },
      三: { value: { status: 'graduated', interval: 365, due: '2027-11-25', firstSeen: 3, asked: 8 }, at: 12 },
    };
    const bad = {
      四: { value: { status: 'learning', track: 'A', interval: 3, due: '2026-12-09' }, at: 1 },   // A に 3日の段はない
      五: { value: { status: 'learning', track: 'C', interval: 14, due: '2026-12-09' }, at: 1 },
      六: { value: { status: 'graduated', interval: 60, due: '2026-12-09' }, at: 1 },
      七: { value: { status: 'learning', track: 'B', interval: 1, due: '2026/12/09' }, at: 1 },
      八: { value: { status: 'unknown' }, at: 1 },
      九: null,
    };
    const fam = normalizeFamily({ version: 2, children: { a: { kanji: { ...ok, ...bad } } } });
    expect(fam.children.a.kanji).toEqual({ ...ok, 二: { value: { status: 'failed', firstSeen: 2, asked: 2 }, at: 11 } });
    // 漢字の欄がない古い形は空
    expect(normalizeFamily({ version: 2, children: { a: {} } }).children.a.kanji).toEqual({});
  });
});

describe('漢字の書き取り', () => {
  it('結果を入れると、カードと更新時刻が入る。kanjiCards で buildSession に渡す形になる', () => {
    let c = recordKanjiResult(child(), '山', 'wrong', '2026-11-25', 500);
    expect(c.kanji['山']).toEqual({ value: { status: 'failed', firstSeen: 500, asked: 1 }, at: 500 });
    c = recordKanjiResult(c, '山', 'correct', '2026-11-26', 900);
    expect(c.kanji['山']).toEqual({
      value: { status: 'learning', track: 'B', interval: 3, due: '2026-11-29', firstSeen: 500, asked: 2 }, at: 900,
    });
    expect(kanjiCards(c)).toEqual({ 山: c.kanji['山'].value });
    // 保存・読み込みしても同じ
    const fam = addChild(emptyFamily(), c);
    expect(normalizeFamily(JSON.parse(JSON.stringify(fam)))).toEqual(fam);
  });
});

describe('端末への保存', () => {
  const memory = (): KeyValueStorage & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: k => void map.delete(k) };
  };

  it('保存して読み込むと同じ。キーは manabi:v2 で、旧記録のキーにはさわらない', () => {
    const st = memory();
    st.setItem('manabi-survivor:v1', '{"version":1,"profiles":[]}');
    const fam = addChild(emptyFamily(), finishKeisanStage(child(), stageByNum(1), 10, 30, 200).child);
    expect(saveRecords(fam, st)).toBe(true);
    expect(RECORDS_KEY).toBe('manabi:v2');
    expect(loadRecords(st)).toEqual(fam);
    expect(st.map.get('manabi-survivor:v1')).toBe('{"version":1,"profiles":[]}');
    clearRecords(st);
    expect(loadRecords(st)).toEqual(emptyFamily());
    expect(st.map.has('manabi-survivor:v1')).toBe(true);
  });

  it('なにもない・こわれている・保存できないときも止まらない', () => {
    const st = memory();
    expect(loadRecords(st)).toEqual(emptyFamily());
    st.setItem(RECORDS_KEY, '{oops');
    expect(loadRecords(st)).toEqual(emptyFamily());
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(loadRecords(broken)).toEqual(emptyFamily());
    expect(saveRecords(emptyFamily(), broken)).toBe(false);
    expect(() => clearRecords(broken)).not.toThrow();
    expect(saveRecords(emptyFamily(), null)).toBe(false);
    expect(loadRecords(null)).toEqual(emptyFamily());
  });
});
