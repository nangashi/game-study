import { activeChildren, addChild, makeChildId, newChild } from '../../records';
import { app, now, save } from '../app';
import { h, mount, svgEl } from '../dom';
import { AVATARS, GEAR_SVG, avatarOf, mascotSVG } from '../mascot';
import { ensureAudio, tap } from '../sound';
import { showSettings } from './settings';
import { showThemes } from './themes';

// 子ども選択。まだだれもいないときは、子どもの登録から
export function showChildren(): void {
  app.childId = null;
  const kids = activeChildren(app.family);
  if (!kids.length) return showRegister();

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'prof-top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'せってい（おうちの ひと）', onclick: () => { ensureAudio(); showSettings(); } },
        svgEl(GEAR_SVG))),
    h('div', { class: 'prof-head' },
      h('h1', { textContent: 'だれが あそぶ？' }),
      h('p', { textContent: 'じぶんの カードを タップしてね' })),
    h('div', { class: 'prof-list' }, ...kids.map(c => {
      const av = avatarOf(c.settings.value.avatar);
      return h('button', {
        class: 'prof-card', type: 'button', style: `background:${av.soft}`,
        onclick: () => { app.childId = c.id; tap(); showThemes(); },
      },
      svgEl(mascotSVG(av.color), 'prof-mascot'),
      h('span', { class: 'pname', textContent: c.settings.value.name }),
      h('span', { class: 'pgo', textContent: 'タップして スタート' }));
    })),
  )));
}

// アバター（マスコットの色）をえらぶボタンの列
export function avatarPicker(value: string, onChange: (id: string) => void): HTMLElement {
  const buttons = AVATARS.map(a => h('button', {
    class: `avatar-btn${a.id === value ? ' on' : ''}`, type: 'button', 'aria-label': a.name, style: `background:${a.soft}`,
    onclick: () => {
      buttons.forEach(b => b.classList.toggle('on', b === buttons[AVATARS.indexOf(a)]));
      onChange(a.id);
    },
  }, svgEl(mascotSVG(a.color))));
  return h('div', { class: 'avatar-pick' }, ...buttons);
}

// 子どもの登録（はじめての とき・設定の「子どもを ふやす」から）
export function showRegister(): void {
  const kids = activeChildren(app.family);
  const used = new Set(kids.map(c => c.settings.value.avatar));
  let avatar: string = (AVATARS.find(a => !used.has(a.id)) ?? AVATARS[0]).id;
  const name = h('input', { type: 'text', id: 'reg-name', maxLength: 8, autocomplete: 'off', placeholder: 'なまえ' });
  const msg = h('div', { class: 'set-msg' });
  const register = () => {
    const n = name.value.trim();
    if (!n) { msg.textContent = 'なまえを いれてね'; msg.classList.add('err'); name.focus(); return; }
    const t = now();
    app.family = addChild(app.family, newChild(makeChildId(Math.random), { name: n, avatar }, t));
    save();
    tap();
    showChildren();
  };

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    kids.length ? h('div', { class: 'page-head' },
      h('button', { class: 'btn btn-ghost', type: 'button', textContent: '← もどる', onclick: () => showSettings() })) : null,
    h('div', { class: 'prof-head' },
      h('h1', { textContent: kids.length ? 'こどもを ふやす' : 'はじめまして！' }),
      h('p', { textContent: 'なまえと いろを えらんでね' })),
    h('div', { class: 'card set-card' },
      h('label', { htmlFor: 'reg-name', textContent: 'なまえ' }),
      name,
      h('label', { textContent: 'いろ' }),
      avatarPicker(avatar, id => { avatar = id; }),
      h('div', { class: 'set-row' },
        h('button', { class: 'btn btn-orange wide', type: 'button', textContent: 'とうろく する', onclick: register })),
      msg),
  )));
}
