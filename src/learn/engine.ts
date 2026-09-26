import type { Grade, Profile, Subject, TrackId, TrackState } from '../state/types';
import type { Answer, Question } from './types';
import { LEVELS, keisan, kazu, numberToChoice, tokei } from './math';
import { hiraMatch, hiraWrite, kanjiRead, kanjiWrite, kataWrite } from './kokugo';
import { pick, type Rng } from './random';
import { updateCard } from './srs';

const MAX_LEVEL: Partial<Record<TrackId, number>> = { ...LEVELS, 'hira-match': 2 };

// 学年ごとの、はじめのレベル
const START_LEVEL: Record<Grade, Partial<Record<TrackId, number>>> = {
  k: { kazu: 1, 'hira-match': 1 },
  1: { keisan: 1, tokei: 1 },
  2: { keisan: 2, tokei: 2 },
  3: { keisan: 4, tokei: 3 },
};

// 1クエストの中身（学年×教科）。問題数が多いときはくり返す
const QUEST_PLAN: Record<Grade, Record<Subject, TrackId[]>> = {
  k: { kokugo: ['hira-write', 'hira-match', 'hira-write', 'hira-match', 'hira-write'], sansu: ['kazu'] },
  1: { kokugo: ['hira-write', 'kanji-read', 'kata-write', 'kanji-write', 'hira-write'], sansu: ['keisan', 'tokei', 'keisan'] },
  2: { kokugo: ['kanji-write', 'kanji-read', 'kata-write', 'kanji-write', 'kanji-read'], sansu: ['keisan', 'tokei', 'keisan'] },
  3: { kokugo: ['kanji-write', 'kanji-read', 'kata-write', 'kanji-write', 'kanji-read'], sansu: ['keisan', 'tokei', 'keisan'] },
};

export function track(p: Profile, id: TrackId): TrackState {
  return (p.tracks[id] ??= { level: START_LEVEL[p.grade][id] ?? 1, streak: 0, miss: 0 });
}

function make(rng: Rng, p: Profile, id: TrackId, today: string, used: Set<string>): Question {
  const lv = track(p, id).level;
  switch (id) {
    case 'kazu': return kazu(rng, lv);
    case 'keisan': return keisan(rng, lv);
    case 'tokei': return tokei(rng, lv);
    case 'hira-match': return hiraMatch(rng, lv);
    case 'hira-write': return hiraWrite(p, today, used);
    case 'kata-write': return kataWrite(p, today, used);
    case 'kanji-write': return kanjiWrite(p, today, used);
    case 'kanji-read': return kanjiRead(rng, p);
  }
}

export function buildQuest(rng: Rng, p: Profile, subject: Subject, length: number, today: string): Question[] {
  const plan = QUEST_PLAN[p.grade][subject];
  const used = new Set<string>(); // 同じクエストで同じ字を2回出さない
  return Array.from({ length }, (_, i) => {
    const q = make(rng, p, plan[i % plan.length], today, used);
    if (q.kind === 'write') used.add(q.char);
    return q;
  });
}

// バトルのレベルアップ時のクイズ（すぐ答えられる3択だけ）
export function battleQuiz(rng: Rng, p: Profile, today: string): Question {
  const tracks: TrackId[] = p.grade === 'k' ? ['kazu', 'hira-match'] : ['keisan', 'tokei', 'kanji-read'];
  const q = make(rng, p, pick(rng, tracks), today, new Set());
  return q.kind === 'number' ? numberToChoice(rng, q) : q;
}

// 3問つづけて正解でレベルアップ、2問つづけてまちがえたらレベルダウン
export function applyAnswer(p: Profile, q: Question, a: Answer, today: string): void {
  const t = track(p, q.track);
  const good = a.correct && !a.helped;
  if (good) { t.streak++; t.miss = 0; } else { t.miss++; t.streak = 0; }
  const max = MAX_LEVEL[q.track];
  if (max && t.streak >= 3 && t.level < max) { t.level++; t.streak = 0; }
  if (max && t.miss >= 2 && t.level > 1) { t.level--; t.miss = 0; }
  if (q.card) updateCard(p, q.card, good, today);
  if (a.correct) p.stats.correct++;
}

