import type { Tolerance } from '../../learn/handwriting/judge';
import {
  RECORDS_VERSION, activeChildren, mergeFamily, normalizeFamily, removeChild, resetFamily, updateChild, updateSettings,
  type ChildRecord, type ChildSettings,
} from '../../records';
import { app, now, pushFamily, save } from '../app';
import { h, mount } from '../dom';
import { updateAppNow } from '../pwa-update';
import { ensureAudio, sndTap, tap } from '../sound';
import { avatarPicker, showChildren, showRegister } from './children';

// 設定（子ども選択の歯車から。おうちのひと向けなので、ふつうの日本語）
// 子どもごとの 名前・アバター・書き取りの判定・音、子どもの追加と削除、記録の書き出し・読み込み・全消し

const TOLS: [Tolerance, string][] = [['easy', 'やさしい'], ['normal', 'ふつう'], ['strict', 'きびしい']];

const patch = (id: string, p: Partial<ChildSettings>) => {
  app.family = updateChild(app.family, id, c => updateSettings(c, p, now()));
  save();
};

// 2回押すと実行するボタン（4秒で元にもどる）
function confirmButton(label: string, armed: string, run: () => void): HTMLButtonElement {
  let timer = 0;
  const b = h('button', { class: 'btn btn-danger', type: 'button', textContent: label });
  b.addEventListener('click', () => {
    if (!timer) {
      b.textContent = armed;
      timer = window.setTimeout(() => { timer = 0; b.textContent = label; }, 4000);
      return;
    }
    clearTimeout(timer); timer = 0;
    b.textContent = label;
    run();
  });
  return b;
}

function childCard(c: ChildRecord): HTMLElement {
  const s = c.settings.value;
  const nameId = `name-${c.id}`;
  const name = h('input', { type: 'text', id: nameId, maxLength: 8, autocomplete: 'off', value: s.name });
  const msg = h('div', { class: 'set-msg' });
  name.addEventListener('change', () => {
    const n = name.value.trim();
    if (!n) { name.value = s.name; msg.textContent = '名前を入れてください'; msg.classList.add('err'); return; }
    patch(c.id, { name: n });
    msg.textContent = '名前を保存しました'; msg.classList.remove('err');
  });

  const tolButtons = TOLS.map(([t, label]) => h('button', {
    class: `seg-btn${s.tolerance === t ? ' on' : ''}`, type: 'button', textContent: label,
    onclick: () => {
      tolButtons.forEach(b => b.classList.toggle('on', b.textContent === label));
      patch(c.id, { tolerance: t });
    },
  }));

  const soundBtn = h('button', { class: 'btn', type: 'button' });
  const drawSound = () => {
    const on = app.family.children[c.id]?.settings.value.sound ?? true;
    soundBtn.textContent = on ? '音：オン（押すとオフ）' : '音：オフ（押すとオン）';
  };
  soundBtn.addEventListener('click', () => {
    const on = !(app.family.children[c.id]?.settings.value.sound ?? true);
    patch(c.id, { sound: on });
    drawSound();
    if (on) { ensureAudio(); sndTap(); }
  });
  drawSound();

  return h('div', { class: 'card set-card' },
    h('h2', { textContent: s.name }),
    h('label', { htmlFor: nameId, textContent: '名前' }),
    name,
    h('label', { textContent: 'アバター（色）' }),
    avatarPicker(s.avatar, id => patch(c.id, { avatar: id })),
    h('label', { textContent: '書き取りの判定' }),
    h('div', { class: 'seg' }, ...tolButtons),
    h('div', { class: 'set-row switch-row' }, h('span', { class: 'set-label', textContent: '音' }), soundBtn),
    msg,
    h('div', { class: 'set-row' },
      confirmButton('この子を削除', '本当に削除しますか？ もう一度押すと削除します', () => {
        app.family = updateChild(app.family, c.id, x => removeChild(x, now()));
        save();
        showSettings();
      })));
}

// アプリの更新。押すと新しい版を確かめ、あれば切り替える（リロード）
function updateCard(): HTMLElement {
  const msg = h('div', { class: 'set-msg', role: 'status' });
  const btn = h('button', { class: 'btn btn-teal', type: 'button', textContent: 'アプリを さいしんに する' });
  btn.addEventListener('click', () => {
    tap();
    btn.disabled = true;
    msg.classList.remove('err');
    msg.textContent = '確かめています…';
    void updateAppNow().then(r => {
      if (r === 'reloading') { msg.textContent = '新しい版に切り替えています…'; return; }
      btn.disabled = false;
      msg.textContent = r === 'latest' ? 'さいしんの じょうたいです'
        : r === 'unsupported' ? 'この画面では更新を確かめられません'
          : '更新を確かめられませんでした。つながっているか確かめてください';
      msg.classList.toggle('err', r !== 'latest');
    });
  });
  return h('div', { class: 'card set-card' },
    h('h2', { textContent: 'アプリの更新' }),
    h('p', { class: 'set-note', textContent: '新しい版が出ているのに画面が古いままのときに押してください。新しい版があれば、読み込みなおして切り替えます。' }),
    h('div', { class: 'set-row' }, btn),
    msg);
}

export function showSettings(note = ''): void {
  app.childId = null;
  const kids = activeChildren(app.family);
  const msg = h('div', { class: 'set-msg', textContent: note });
  const setMsg = (t: string, err = false) => { msg.textContent = t; msg.classList.toggle('err', err); };
  const exportArea = h('textarea', { id: 'export-area', readOnly: true });
  const importArea = h('textarea', { id: 'import-area', placeholder: '書き出した文字をここに貼り付けてください' });

  const copy = () => {
    if (!exportArea.value) return setMsg('先に「書き出す」を押してください', true);
    exportArea.select();
    const fail = () => setMsg('コピーできませんでした。文字を選んでコピーしてください', true);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(exportArea.value).then(() => setMsg('コピーしました'), fail);
    else fail();
  };

  // 読み込みは上書きではなく、いまの記録と合わせる（端末どうしを合わせるのと同じ mergeFamily）
  const doImport = () => {
    const text = importArea.value.trim();
    if (!text) return setMsg('読み込む文字がありません', true);
    try {
      const raw = JSON.parse(text) as { version?: unknown };
      if (raw?.version !== RECORDS_VERSION) throw new Error('version');
      // 書き出したあとに全消しをしていても読み込めるように、いまの全消しの印にそろえて合わせる
      app.family = mergeFamily(app.family, { ...normalizeFamily(raw), resetAt: app.family.resetAt });
      save();
      showSettings('読み込みました（いまの記録と合わせました）');
      return;
    } catch {
      setMsg('読み込めませんでした。文字が正しいか確かめてください', true);
    }
  };

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'page-head' },
      h('button', { class: 'btn btn-ghost', type: 'button', textContent: '← もどる', onclick: () => { tap(); showChildren(); } }),
      h('h1', { textContent: '設定（おうちの方へ）' })),

    ...kids.map(childCard),
    h('div', { class: 'set-row' },
      h('button', { class: 'btn btn-teal', type: 'button', textContent: '子どもを追加', onclick: () => { tap(); showRegister(); } })),

    h('div', { class: 'card set-card' },
      h('h2', { textContent: '記録の書き出し・読み込み' }),
      h('p', { class: 'set-note', textContent: '別の端末に移すときは、書き出した文字をコピーして、移す先で読み込んでください。読み込んだ記録は、いまの記録と合わせます（星やクリアは多いほうが残ります）。' }),
      h('label', { htmlFor: 'export-area', textContent: '書き出し' }),
      exportArea,
      h('div', { class: 'set-row' },
        h('button', {
          class: 'btn btn-teal', type: 'button', textContent: '書き出す',
          onclick: () => { exportArea.value = JSON.stringify(app.family); setMsg('書き出しました。コピーして大切に保管してください'); },
        }),
        h('button', { class: 'btn', type: 'button', textContent: 'コピーする', onclick: copy })),
      h('label', { htmlFor: 'import-area', textContent: '読み込み（ここに貼り付け）' }),
      importArea,
      h('div', { class: 'set-row' },
        h('button', { class: 'btn btn-orange', type: 'button', textContent: '読み込む', onclick: doImport })),
      msg),

    updateCard(),

    h('div', { class: 'card set-card' },
      h('h2', { textContent: '記録をすべて消す' }),
      h('p', { class: 'set-note', textContent: '家族の記録（子どもの登録もふくむ）をすべて消します。ほかの端末の記録も、つながったときに消えます。' }),
      // 全消しの印（resetAt）を今にして送る。ほかの端末の古い控えは、合わせるときに持ち込まれない
      h('div', { class: 'set-row' },
        confirmButton('すべて消す', '本当に消しますか？ もう一度押すとすべて消えます', () => {
          app.family = resetFamily(app.family, now());
          save();
          pushFamily();
          showChildren();
        }))),
  )));
}
