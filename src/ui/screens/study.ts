import { planSet, selectedCategories, setLength } from '../../learn/engine';
import { cardCoins } from '../../learn/srs';
import { isLowerGrade, questCoins, selectionRate, studyGivesTicket } from '../../state/economy';
import { store, today } from '../../state/store';
import { GRADES, type Grade, type Profile } from '../../state/types';
import { studyDef } from '../../studies/registry';
import type { Selection, StudyDef } from '../../studies/types';
import { chip, h, ico, mount } from '../dom';
import { showHome, topbar } from './home';
import { seconds, showQuest } from './quest';

const GRADE_NAMES: Record<Grade, string> = { k: 'ねんちょう', 1: '1ねん', 2: '2ねん', 3: '3ねん' };

// 始める前に見せる、もらえるコイン（全問正解したとき）と、問題のうちわけ
export function preview(study: StudyDef, p: Profile, sel: Selection) {
  const day = today();
  const picks = planSet(study, p, sel, setLength(study, sel, store.settings.questLength), day, store.settings.drillSlowSec * 1000);
  const answerCoins = picks.reduce((sum, x) => sum + cardCoins(p.cards[x.card], day), 0);
  return {
    coins: questCoins(answerCoins, selectionRate(p, sel)),
    review: picks.filter(x => x.review).length,
    fresh: picks.filter(x => !x.review).length,
    ticket: studyGivesTicket(p, store.settings, study.id, sel),
  };
}

// 教科をえらんだあと: 学年 → まぜこぜ / カテゴリ をえらぶ
export function showStudy(id: string, studyId: string, grade?: Grade): void {
  const p = store.profile(id);
  const study = studyDef(studyId);
  if (!p || !study) return showHome(id);
  const g = grade ?? p.grade;
  const grades = GRADES.filter(x => study.categories.some(c => c.grade === x));
  const lower = isLowerGrade(p, { study: study.id, grade: g });

  const reward = (v: ReturnType<typeof preview>) =>
    h('span', { class: 'reward-line' }, chip('coin', `さいだい ${v.coins}`), v.ticket ? chip('ticket', '+1') : null);
  const mixSel: Selection = { study: study.id, grade: g };
  const mix = preview(study, p, mixSel);
  // けいさんりょく（ドリル）は、まぜこぜの横に出す
  const drill = study.categories.find(c => c.grade === g && c.drill);
  const drillSel: Selection | undefined = drill && { study: study.id, grade: g, category: drill.id, drill: true };
  const best = drill && p.best?.[drill.id];

  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showHome(id)),
    h('h1', { class: 'title' }, ico(study.icon, 44), ` ${study.name}`),
    h('div', { class: 'grade-tabs', style: `--study:${study.color}` }, ...grades.map(x => h('button', {
      class: `grade-tab${x === g ? ' on' : ''}`,
      onclick: () => showStudy(id, studyId, x),
    }, x === p.grade ? '★ ' : '', GRADE_NAMES[x]))),
    lower ? h('p', { class: 'note bubble' }, 'したの がくねんは ', ico('coin'), ' が すくないよ') : null,
    h('div', { class: 'mix-row' },
      h('button', { class: 'big-btn mix-btn', style: `background:${study.color}`, onclick: () => showQuest(id, mixSel) },
        h('span', { class: 'mix-name' }, ico('star', 48), ' まぜこぜ'),
        h('small', {}, `ふくしゅう ${mix.review}・あたらしい ${mix.fresh}`),
        reward(mix)),
      drill && drillSel ? h('button', { class: 'big-btn mix-btn drill-btn', onclick: () => showQuest(id, drillSel) },
        h('span', { class: 'mix-name' }, ico('clock', 48), ` ${drill.name}`),
        h('small', {}, best != null ? `ベスト ${seconds(best)}` : `${drill.drill!.length}もん タイムアタック`),
        reward(preview(study, p, drillSel))) : null),
    h('div', { class: 'cat-grid' }, ...selectedCategories(study, mixSel).map(c => {
      const sel: Selection = { study: study.id, grade: g, category: c.id };
      return h('button', { class: 'cat-btn', style: `--study:${study.color}`, onclick: () => showQuest(id, sel) },
        h('span', { class: 'cat-name', textContent: c.name }), reward(preview(study, p, sel)));
    })),
  ));
}
