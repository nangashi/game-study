import { store } from '../../state/store';
import type { IconName } from '../../art';
import type { LabResult, LabScene } from '../../lab/common';
import { chip, h, ico, mount, overlay } from '../dom';
import { showHome, topbar } from './home';

// あそびラボ: バトルとは べつの ゲームを ためす ところ。
// ゲーム券は つかわない・ごほうびも でない（そうさ感を ためすための わく）

interface LabGame {
  id: string; icon: IconName; name: string; how: string; seconds: number;
  load: () => Promise<typeof LabScene>;
}

const GAMES: LabGame[] = [
  {
    id: 'defense', icon: 'swords', name: 'モンスターまもり', seconds: 180,
    how: 'ピンボールで なかまを よぶ。おなじ なかまを かさねると がったい！',
    load: async () => (await import('../../lab/DefenseScene')).DefenseScene,
  },
  {
    id: 'sling', icon: 'bolt', name: 'ひっぱりアタック', seconds: 120,
    how: 'ひっぱって はなすと とんでいく。とんでいる あいだは むてき！',
    load: async () => (await import('../../lab/SlingScene')).SlingScene,
  },
  {
    id: 'grow', icon: 'apple', name: 'ぱくぱくビッグ', seconds: 120,
    how: 'じぶんより 小さいものを たべて 大きくなろう',
    load: async () => (await import('../../lab/GrowScene')).GrowScene,
  },
];

export function showLab(id: string): void {
  const p = store.profile(id)!;
  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showHome(id)),
    h('h1', { class: 'title' }, ico('flame', 44), ' あそびラボ'),
    h('div', { class: 'lab-list' }, ...GAMES.map(g =>
      h('button', { class: 'lab-card', onclick: () => void play(id, g) },
        ico(g.icon, 64),
        h('div', {}, h('div', { class: 'name', textContent: g.name }), h('small', { textContent: g.how })),
      ))),
    h('p', { class: 'note bubble' }, ico('ticket'), ' は つかわないよ（ためしプレイ）'),
  ));
}

async function play(id: string, g: LabGame): Promise<void> {
  const p = store.profile(id)!;
  const root = h('div', { class: 'battle-root' });
  mount(root, h('div', { class: 'note', textContent: 'じゅんびちゅう…' }));
  const [{ startLab }, Scene] = await Promise.all([import('../../lab/common'), g.load()]);
  mount(root);

  const game = startLab(root, Scene, {
    avatar: p.avatar,
    easy: p.grade === 'k',
    seconds: g.seconds,
    onEnd: r => end(r),
  });
  const quit = h('button', {
    class: 'pill-btn battle-quit', textContent: 'やめる',
    onclick: () => (game.scene.getScene('lab') as LabScene | null)?.quit(),
  });
  document.body.append(quit);

  function end(r: LabResult) {
    quit.remove();
    game.scene.pause('lab');
    const leave = (next: () => void) => { o.close(); game.destroy(true); next(); };
    const o = overlay(
      h('h1', { class: 'title' }, ico(r.cleared ? 'trophy' : 'star', 64), r.cleared ? ' クリア！' : ' おつかれさま！'),
      h('div', { class: 'reward' }, ...r.stats.map(s => chip(s.icon, s.text))),
      h('div', { class: 'row' },
        h('button', { class: 'pill-btn primary', onclick: () => leave(() => void play(id, g)) }, ico('flame', 26), ' もういちど'),
        h('button', { class: 'pill-btn', onclick: () => leave(() => showLab(id)) }, ico('back', 26), ' ラボへ'),
      ),
    );
  }
}
