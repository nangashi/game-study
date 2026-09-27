import { mastery } from '../../learn/engine';
import {
  achievement, claimAchievement, claimDaily, claimPending, dailyMissions, hasRoom, openAchievements, suggestedCats,
  streakMilestones, todayLeft, type Achievement, type DailyMission,
} from '../../state/missions';
import { save, store, today } from '../../state/store';
import type { Profile } from '../../state/types';
import { gradeRank } from '../../state/types';
import { STUDIES } from '../../studies/registry';
import type { IconName } from '../../art';
import { h, ico, mount } from '../dom';
import { showGames } from './games';
import { showHome, topbar } from './home';
import { showQuest } from './quest';
import { GRADE_NAMES } from './study';

const DAILY: Record<DailyMission['id'], { icon: IconName; name: string; desc: string }> = {
  hisashiburi: { icon: 'pencil', name: 'ひさしぶりの カテゴリ', desc: '3にち やっていない カテゴリで 2もん せいかい' },
  fukushu: { icon: 'maru', name: 'ふくしゅうを しよう', desc: 'ふくしゅうの もんだいで せいかい' },
};

function achievementView(a: Achievement): { icon: IconName; name: string } {
  if (a.kind === 'cat') return { icon: 'trophy', name: `${a.study.name}「${a.cat.name}」を ぜんぶ おぼえた` };
  if (a.kind === 'grade') return { icon: 'star', name: `${a.study.name} ${GRADE_NAMES[a.grade]}を ぜんぶ おぼえた` };
  return { icon: 'flame', name: `${a.days}にち つづけた` };
}

// ミッションの画面。券はここで受け取る（docs/03 ゲーム券）
export function showMissions(id: string): void {
  const p = store.profile(id);
  if (!p) return showHome(id);
  const s = store.settings;
  const day = today();
  const again = () => { save(); showMissions(id); };
  const full = !hasRoom(p, s);
  const claimBtn = (can: boolean, onclick: () => void) =>
    h('button', { class: 'pill-btn primary', disabled: !can, onclick }, ico('ticket'), full ? ' まんたん' : ' うけとる');
  const row = (icon: IconName, name: string, desc: Node | string | null, right: Node, extra?: Node | null) =>
    h('div', { class: 'mission-row' }, ico(icon, 44),
      h('div', { class: 'mission-text' }, h('b', { textContent: name }), desc ? h('small', {}, desc) : null, extra ?? null),
      right);

  const dailies = dailyMissions(p, day);
  const left = todayLeft(p, s);
  const dailyRow = (m: DailyMission) => {
    const v = DAILY[m.id];
    const right = m.claimed ? h('span', { class: 'mission-done' }, 'もらった')
      : m.done ? claimBtn(!full && left > 0, () => { claimDaily(p, s, m.id, day); again(); })
      : h('span', { class: 'mission-progress', textContent: `${m.progress} / ${m.goal}` });
    // ひさしぶりのカテゴリは3つまで出し、押すとそのカテゴリのクエストへ
    const cats = m.id === 'hisashiburi' && !m.done ? h('div', { class: 'mission-cats' }, ...suggestedCats(p, day).map(x =>
      h('button', { class: 'pill-btn', style: `--study:${x.study.color}`, onclick: () => showQuest(id, { study: x.study.id, grade: x.cat.grade, category: x.cat.id }) },
        ico(x.study.icon), ` ${x.cat.name}`))) : null;
    return row(v.icon, v.name, v.desc, right, cats);
  };

  const open = openAchievements(p).map(achievement).filter((a): a is Achievement => !!a);
  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showHome(id)),
    h('h1', { class: 'title' }, ico('trophy', 44), ' ミッション'),
    full ? h('button', { class: 'pill-btn primary', onclick: () => showGames(id) }, ico('ticket'), ' まんたん！ ゲームで あそぼう') : null,
    h('section', { class: 'mission-box' },
      h('h2', {}, 'きょうの ミッション', h('small', {}, ' （きょうの うちに うけとってね）')),
      p.daily.pending ? row('ticket', `まんたんで はいらなかった けん × ${p.daily.pending}`, null,
        claimBtn(!full, () => { claimPending(p, s, day); again(); })) : null,
      ...dailies.map(dailyRow),
      !dailies.length && !p.daily.pending ? h('p', { class: 'muted', textContent: 'きょうは ないよ' }) : null,
      !left && dailies.some(m => m.done && !m.claimed) ? h('p', { class: 'muted' }, 'きょうの ', ico('ticket'), ' は ぜんぶ もらったよ') : null,
    ),
    h('section', { class: 'mission-box' },
      h('h2', {}, 'たっせい ミッション', h('small', {}, ' （いつでも うけとれるよ）')),
      ...open.map(a => { const v = achievementView(a); return row(v.icon, v.name, null, claimBtn(!full, () => { claimAchievement(p, s, a.id); again(); })); }),
      ...nextGoals(p, day),
    ),
  ));
}

// つぎの もくひょう: 連続日数と、あと少しで ぜんぶ おぼえる カテゴリ
function nextGoals(p: Profile, day: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const next = [...streakMilestones(p.streak.count + 7), p.streak.count + 7].find(n => n > p.streak.count)!;
  out.push(h('div', { class: 'mission-row next' }, ico('flame', 36),
    h('div', { class: 'mission-text' }, h('b', { textContent: `${next}にち つづけよう` }), h('small', { textContent: `いま ${p.streak.count}にち` }))));
  const near = STUDIES.flatMap(study => study.categories
    .filter(c => !c.drill && gradeRank(c.grade) <= gradeRank(p.grade) && !p.achieved[`cat:${study.id}:${c.id}`])
    .map(cat => ({ study, cat, m: mastery(p, [cat], day) })))
    .filter(x => x.m.learned > 0 && x.m.learned < x.m.total)
    .sort((a, b) => (a.m.total - a.m.learned) - (b.m.total - b.m.learned))[0];
  if (near) out.push(h('div', { class: 'mission-row next' }, ico('trophy', 36),
    h('div', { class: 'mission-text' }, h('b', { textContent: `${near.study.name}「${near.cat.name}」を ぜんぶ おぼえよう` }),
      h('small', { textContent: `あと ${near.m.total - near.m.learned}こ` }))));
  return out;
}
