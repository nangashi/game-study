import { SUBJECTS, themeStars, type ThemeDef, type ThemeId } from '../../themes';
import { current } from '../app';
import { h, mount } from '../dom';
import { avatarOf } from '../mascot';
import { tap } from '../sound';
import { showChildren } from './children';
import { showHiraMap } from './hira';
import { showKeisanMap } from './keisan';

// テーマ選択（合意モックどおり。中身があるのは けいさん と ひらがな・カタカナ だけ）
const MARK_COLOR: Record<ThemeId, string> = { hira: '#e11d48', keisan: '#0891b2' };

export function showThemes(): void {
  const c = current();
  if (!c) return showChildren();
  const av = avatarOf(c.settings.value.avatar);

  const meta = (t: ThemeDef) => h('span', {},
    h('span', { class: 'tname', textContent: t.name }), h('br'),
    h('span', { class: 'tdesc', textContent: t.desc }));

  const card = (t: ThemeDef) => {
    if (!t.id) {
      return h('button', { class: 'theme-btn is-soon', type: 'button', disabled: true },
        h('span', { class: 'dot', textContent: t.mark }),
        meta(t),
        h('span', { class: 'soon', textContent: 'あとで ふえる' }));
    }
    const id = t.id;
    // 星は単元の星の合計（とれる数は うすい色で）
    const { stars, max } = themeStars(c, id);
    const starEl = h('span', { class: 'tstars', 'aria-label': `ほし ${stars} / ${max}` },
      `★${stars}`, h('span', { class: 'off', textContent: `/${max}` }));
    return h('button', {
      class: 'theme-btn', type: 'button',
      onclick: () => { tap(); if (id === 'keisan') showKeisanMap(); else showHiraMap(); },
    },
    h('span', { class: 'dot', style: `background:${MARK_COLOR[id]}`, textContent: t.mark }),
    meta(t),
    starEl);
  };

  mount(h('section', { class: 'screen', id: 'screen-theme' }, h('div', { class: 'wrap' },
    h('div', { class: 'theme-shead' },
      h('button', { class: 'theme-back-btn', type: 'button', 'aria-label': 'もどる', textContent: '‹', onclick: () => { tap(); showChildren(); } }),
      h('span', { class: 'theme-stitle', textContent: 'なにを する？' }),
      h('span', { class: 'theme-child-chip' },
        h('i', { class: 'cdot', style: `background:${av.color}` }),
        h('span', { class: 'child-name', textContent: c.settings.value.name }))),
    ...SUBJECTS.flatMap(s => [
      h('div', { class: `subject-head ${s.id}` }, s.name, h('span', { class: 'scount', textContent: `テーマ ${s.themes.length}つ` })),
      h('div', { class: 'theme-list' }, ...s.themes.map(card)),
    ]),
  )));
}
