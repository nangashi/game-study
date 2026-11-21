import { beforeAll, describe, expect, it } from 'vitest';
import { loadOriginal, mulberry32, type Original } from './__original__/harness';
import * as g from './generators';
import { STAGES, stageByNum } from './stages';
import { makeSet, mergeStageResult, playableAfterClear } from './session';
import {
  answerTest, applyTestResult, computeStartFromAble, continueTest, nextTestQuestion, resumeTest, saveProgress, startTest,
  TEST_LADDER, type TestProgress, type TestState,
} from './ladder';

// 元の算数練習アプリ（JS）を Node で動かし、移植した TypeScript と結果を照らし合わせる

let O: Original;
beforeAll(() => { O = loadOriginal(); });

const numKeys = (o: Record<string, unknown> | null | undefined) => Object.keys(o ?? {}).map(Number).sort((a, b) => a - b);

describe('ステージと問題の作り方が元と同じ', () => {
  it('47ステージの id・名前・テーマ・例・色・まとめ・筆算', () => {
    const orig = O.run('STAGES') as any[];
    expect(orig.length).toBe(47);
    expect(STAGES.map(s => ({ id: s.id, num: s.num, name: s.name, theme: s.theme, sample: s.sample, color: s.color, matome: !!s.matome, paper: !!s.paper })))
      .toEqual(orig.map(s => ({ id: s.id, num: s.num, name: s.name, theme: s.theme, sample: s.sample, color: s.color, matome: !!s.matome, paper: !!s.paper })));
  });

  it('同じ乱数なら、全ステージで同じ問題（問題文と答え）になる', () => {
    for (const stage of STAGES) {
      const seed = 1000 + stage.num;
      O.setRandom(mulberry32(seed));
      const orig = O.run(`(function(){ var out=[]; for(var i=0;i<500;i++){ out.push(STAGES[${stage.num - 1}].gen()); } return out; })()`) as { text: string; ans: number }[];
      const rng = mulberry32(seed);
      const mine = Array.from({ length: 500 }, () => stage.gen(rng));
      expect(mine.map(q => [q.text, q.answer]), stage.id).toEqual(orig.map(q => [q.text, q.ans]));
    }
  });

  it('ステージで使っていない問題の作り方（gMul1・gMul2・gDiv1・gMul5）も同じ', () => {
    for (const [name, gen] of [['gMul1', g.gMul1], ['gMul2', g.gMul2], ['gDiv1', g.gDiv1], ['gMul5', g.gMul5]] as const) {
      O.setRandom(mulberry32(77));
      const orig = O.run(`(function(){ var out=[]; for(var i=0;i<300;i++){ out.push(${name}()); } return out; })()`) as { text: string; ans: number }[];
      const rng = mulberry32(77);
      expect(Array.from({ length: 300 }, () => gen(rng)).map(q => [q.text, q.answer]), name).toEqual(orig.map(q => [q.text, q.ans]));
    }
  });

  it('10問のセットも同じ', () => {
    for (const stage of STAGES) {
      for (let k = 0; k < 20; k++) {
        const seed = stage.num * 100 + k;
        O.setRandom(mulberry32(seed));
        const orig = O.run(`makeSet(STAGES[${stage.num - 1}].gen)`) as { text: string; ans: number }[];
        const mine = makeSet(stage.gen, mulberry32(seed));
        expect(mine.map(q => [q.text, q.answer]), stage.id).toEqual(orig.map(q => [q.text, q.ans]));
      }
    }
  });
});

describe('ステージの結果（星・クリア・記録）が元と同じ', () => {
  // 元の startStage → 10問答える → finishStage を動かし、記録と「まえより はやい！」を比べる
  function playOriginal(stageNum: number, oks: boolean[], elapsedSec: number) {
    O.setNow(0);
    O.run(`startStage(STAGES[${stageNum - 1}])`);
    oks.forEach((ok, i) => {
      if (i === oks.length - 1) O.setNow(elapsedSec * 1000);
      const s = O.ctx.session;
      const q = s.questions[s.idx];
      s.input = String(ok ? q.ans : q.ans + 1);
      O.run('submitAnswer()');
      O.flushTimers();
    });
    const r = O.run('rec()');
    return { record: { ...r.stages[`s${stageNum}`] }, pt: r.playableThrough, faster: O.el('result-faster').textContent !== '' };
  }

  it('いろいろな正解数・時間で、記録・解放・はやい表示が一致する', () => {
    O.run('currentProfile = 0; store.records[0] = emptyRecord();');
    const rnd = mulberry32(5);
    const prevs: Record<number, ReturnType<typeof mergeStageResult>['record'] | undefined> = {};
    let pt = 1;
    for (let round = 0; round < 300; round++) {
      const num = 1 + Math.floor(rnd() * 47);
      const p = [0.5, 0.8, 0.95, 1][Math.floor(rnd() * 4)];
      const oks = Array.from({ length: 10 }, () => rnd() < p);
      const elapsed = 10 + Math.floor(rnd() * 120) + 0.25;
      const orig = playOriginal(num, oks, elapsed);
      const correct = oks.filter(Boolean).length;
      const mine = mergeStageResult(prevs[num], stageByNum(num), correct, elapsed);
      if (mine.cleared) pt = playableAfterClear(pt, num);
      prevs[num] = mine.record;
      expect(mine.record).toEqual(orig.record);
      expect(mine.faster).toBe(orig.faster);
      expect(pt).toBe(orig.pt);
    }
  });
});

describe('ちからだめしが元と同じ', () => {
  interface Trace {
    questions: [number, string, string][];  // [ステージ, 問題文, 段階]
    events: (string | number)[][];
    start: number; total: number; able: number[]; asked: number; questionCount: number;
    progress: TestProgress | null;
  }

  // 元の実装。stopAtBreak 回目の休けいで「やめる」を押し、そのあと途中から再開する
  function runOriginal(oks: (i: number) => boolean, seed: number, stopAtBreak = -1): Trace {
    O.setRandom(mulberry32(seed));
    O.run('currentProfile = 0; store.records[0] = emptyRecord(); session = null;');
    const t: Trace = { questions: [], events: [], start: 0, total: 0, able: [], asked: 0, questionCount: 0, progress: null };
    const origStartSystem = O.ctx.startSystem;
    O.ctx.startSystem = function (sysIdx: number, isFirst: boolean) { t.events.push(['sys', sysIdx]); return origStartSystem(sysIdx, isFirst); };
    const origEndTest = O.ctx.endTest;
    O.ctx.endTest = function (n: number) {
      const s = O.ctx.session;
      t.able = numKeys(s.able); t.asked = s.asked;
      return origEndTest(n);
    };
    let breaks = 0, qi = 0, done = false;
    O.run('startTest()');
    for (let guard = 0; guard < 1000 && !done; guard++) {
      O.flushTimers();
      if (O.el('banner').classList.contains('show')) {
        const title = O.el('banner-title').textContent;
        const text = O.el('banner-text').textContent;
        if (title === 'ここまで登れた！') t.events.push(['done', Number(/(\d+)だん/.exec(text)![1])]);
        if (title === 'ここは これから') t.events.push(['done', 0]);
        const isEnd = title === 'すごい！';
        O.el('btn-banner-ok').onclick!.call(O.el('btn-banner-ok'));
        if (isEnd) done = true;
        continue;
      }
      if (O.el('break').classList.contains('show')) {
        const next = TEST_LADDER.findIndex(x => O.el('break-text').textContent === `つぎは ${x.name}だよ。ひと休み しよう。`);
        t.events.push(['break', next]);
        if (breaks++ === stopAtBreak) {
          O.el('btn-break-stop').onclick!.call(O.el('btn-break-stop'));
          const tp = O.run('rec().testProgress');
          t.progress = { ...tp, able: numKeys(tp.able), completedSystems: numKeys(tp.completedSystems) };
          O.run('resumeTest(validTestProgress())');
        } else {
          O.el('btn-break-continue').onclick!.call(O.el('btn-break-continue'));
        }
        continue;
      }
      const s = O.ctx.session;
      if (s && s.kind === 'test' && !s.locked && s.questions.length > 0) {
        const q = s.questions[s.idx];
        t.questions.push([s.currentStageNum, q.text, s.phase]);
        s.input = String(oks(qi++) ? q.ans : q.ans + 1);
        O.run('submitAnswer()');
        continue;
      }
      throw new Error('original: stuck');
    }
    if (!done) throw new Error('original: did not finish');
    O.ctx.startSystem = origStartSystem; O.ctx.endTest = origEndTest;
    const r = O.run('rec()');
    t.start = r.playableThrough;
    t.total = Number(/ぜんぶで (\d+)だん/.exec(O.el('test-total-line').textContent)![1]);
    t.questionCount = t.questions.length;
    expect(r.testDone).toBe(true);
    expect(r.testProgress).toBe(null);
    return t;
  }

  // 移植した純粋関数
  function runMine(oks: (i: number) => boolean, seed: number, stopAtBreak = -1): Trace {
    const rng = mulberry32(seed);
    const t: Trace = { questions: [], events: [['sys', 0]], start: 0, total: 0, able: [], asked: 0, questionCount: 0, progress: null };
    let st: TestState = startTest();
    let breaks = 0, qi = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const nq = nextTestQuestion(st, rng);
      t.questions.push([nq.state.stageNum, nq.question.text, nq.state.phase]);
      const { state, outcome } = answerTest(nq.state, oks(qi++));
      st = state;
      if (outcome.type === 'question') continue;
      const res = outcome.type === 'end' ? outcome.result : outcome.next.type === 'end' ? outcome.next.result : null;
      if (outcome.type === 'systemDone') t.events.push(['done', outcome.climbed]);
      if (res) {
        t.start = applyTestResult(1, res).playableThrough;
        t.total = res.total; t.able = res.able; t.asked = st.asked;
        t.questionCount = t.questions.length;
        return t;
      }
      if (outcome.type === 'systemDone' && outcome.next.type === 'break') {
        const next = outcome.next.nextSys;
        t.events.push(['break', next]);
        if (breaks++ === stopAtBreak) {
          t.progress = saveProgress(st, next);
          st = resumeTest(JSON.parse(JSON.stringify(t.progress)));
        } else {
          st = continueTest(st, next);
        }
        t.events.push(['sys', next]);
      }
    }
    throw new Error('mine: did not finish');
  }

  const patterns: [string, (seed: number) => (i: number) => boolean][] = [
    ['ぜんぶ正解', () => () => true],
    ['ぜんぶ不正解', () => () => false],
    ['交互', () => i => i % 2 === 0],
    ['2問正解・1問不正解', () => i => i % 3 !== 2],
    ...[0.3, 0.5, 0.7, 0.85, 0.95].map(p => [`正解率${p}`, (seed: number) => {
      const r = mulberry32(seed * 31 + 7);
      const memo: boolean[] = [];
      return (i: number) => { while (memo.length <= i) memo.push(r() < p); return memo[i]; };
    }] as [string, (seed: number) => (i: number) => boolean]),
  ];

  for (const [name, make] of patterns) {
    it(`${name}: 出す問題・系統の終わり・スタート地点・問題数が一致する`, () => {
      const seeds = name.startsWith('正解率') ? 60 : 3;
      for (let seed = 1; seed <= seeds; seed++) {
        const a = runOriginal(make(seed), seed);
        const b = runMine(make(seed), seed);
        expect(b, `${name} seed=${seed}`).toEqual(a);
      }
    });
  }

  it('休けいで やめて、途中から再開しても一致する', () => {
    let resumed = 0;
    for (const p of [0.6, 0.8, 0.9, 1]) {
      for (let seed = 1; seed <= 30; seed++) {
        const r = mulberry32(seed * 13 + Math.round(p * 100));
        const memo: boolean[] = [];
        const oks = (i: number) => { while (memo.length <= i) memo.push(r() < p); return memo[i]; };
        for (const stop of [0, 1, 2]) {
          const a = runOriginal(oks, seed, stop);
          const b = runMine(oks, seed, stop);
          expect(b, `p=${p} seed=${seed} stop=${stop}`).toEqual(a);
          if (a.progress) resumed++;
        }
      }
    }
    expect(resumed).toBeGreaterThan(50); // 再開の場面を実際に通っている
  });

  it('60問の上限で終わる場面も一致する', () => {
    // 3問目まで行くパターン（正・誤・正）を続けると、問題数が多くなる
    let capped = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = mulberry32(seed);
      const memo: boolean[] = [];
      const oks = (i: number) => { while (memo.length <= i) memo.push(i % 3 === 1 ? r() < 0.15 : r() < 0.97); return memo[i]; };
      const a = runOriginal(oks, seed);
      expect(runMine(oks, seed)).toEqual(a);
      if (a.asked >= 60) capped++;
    }
    expect(capped).toBeGreaterThan(0);
  });

  it('スタート地点の計算（computeStartFromAble）が一致する', () => {
    const r = mulberry32(99);
    const reps = TEST_LADDER.flatMap(x => x.steps);
    for (let k = 0; k < 2000; k++) {
      const able = reps.filter(() => r() < 0.7);
      const comp = [0, 1, 2, 3].filter(() => r() < 0.5);
      const assume = r() < 0.5;
      O.ctx.__args = [Object.fromEntries(able.map(n => [n, true])), Object.fromEntries(comp.map(n => [n, true])), assume];
      const orig = O.run('computeStartFromAble.apply(null, __args)');
      expect(computeStartFromAble(able, comp, assume)).toBe(orig);
    }
  });
});
