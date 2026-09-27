import './style.css';
import type { GameModule, Platform } from '../types';
import { heroHtml } from '../../art';
import { assetUrl, spriteEl } from '../../assets/sprite';
import { h, fromHtml, ico, overlay } from '../../ui/dom';
import { backButton, playButton, quitButton, resultPanel, spriteChip, upgradePanel, walletBar } from '../kit/ui';
import { BASE_SLOTS, BASE_WEAPONS, SKILLS, WEAPONS, isWeapon, levelNote, skillChoices, unlockId, type Art, type Loadout, type ShopItem, type SkillId, type WeaponId } from './skills';
import { BOSS_AT, MAIN_SECONDS, STAGES_PER_WORLD, TRAIT_DESC, SURVIVOR_STAGES, WORLDS, isBossStage, starsOf, type Role } from './stages';
import { startBattle, type BattleScene, type Reroll, type RunResult, type ShopApi } from './BattleScene';
import { IMAGES, SHEETS } from './assets.gen';
import { SURVIVOR } from './index';

// ゲームだけの保存データ（強さには関係しない。ずかんと ★）
interface SurvivorData {
  stars?: Record<number, number>;       // ステージ → ★の数（いちばん よかったとき）
  kills?: Record<string, number>;       // "enemies_snow:penguin" → たおした数
  evolved?: WeaponId[];                 // 見つけた しんか
  start?: WeaponId;                     // さいしょの ぶき（解放したものから えらぶ）
}

export const open: GameModule['open'] = (root, platform) => showTitle(root, platform, platform.maxStage());

const artEl = (a: Art, size: number | string, cls = '') =>
  a.sheet === 'icons' ? spriteEl(SHEETS.icons, a.frame, size, cls) : spriteEl(SHEETS.items, a.frame, size, cls);
const starText = (n: number, of = 3) => '★'.repeat(n) + '☆'.repeat(of - n);

// タイトル画面: せかいと ステージを えらんで あそぶ
function showTitle(root: HTMLElement, platform: Platform, stage: number) {
  const prog = platform.progress();
  const data = platform.data<SurvivorData>() ?? {};
  const stars = data.stars ?? {};
  const max = platform.maxStage();
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  root.style.setProperty('--game-bg', `url(${assetUrl(IMAGES.title_bg)})`);
  const again = (s = stage) => showTitle(root, platform, s);

  root.replaceChildren(h('div', { class: 'lobby' },
    h('div', { class: 'lobby-top' }, backButton(platform.exit), h('div', { class: 'spacer' }), walletBar(platform)),
    h('h1', { class: 'lobby-title', textContent: 'サバイバー' }),
    h('div', { class: 'lobby-row' },
      fromHtml(heroHtml(platform.player.avatar, 96, true)),
      h('span', { class: 'chip sv-stars', textContent: `★ ${total} / ${SURVIVOR_STAGES * 3}` }),
      prog.clears ? spriteChip(SHEETS.icons, 'swords', `さいこう ${prog.best}`) : null,
      h('button', { class: 'pill-btn', onclick: () => showZukan(data) }, spriteEl(SHEETS.items, 'book', 28), ' ずかん')),
    h('p', { class: 'note bubble sv-rule', textContent:
      `${MAIN_SECONDS / 60}ぷん いきのこるか、${BOSS_AT / 60}ぷんで くる ボスを たおせば クリア` }),
    // せかいごとに 5ステージ
    h('div', { class: 'sv-worlds' }, ...WORLDS.map((w, wi) => {
      const first = wi * STAGES_PER_WORLD + 1;
      const locked = first > max;
      return h('div', { class: `sv-world ${locked ? 'locked' : ''}`, style: `--ground:url(${assetUrl(IMAGES[w.ground])})` },
        h('div', { class: 'sv-world-name' },
          spriteEl(SHEETS.items, w.emblem, 40),
          h('span', { textContent: w.name })),
        h('div', { class: 'sv-stage-row' }, ...Array.from({ length: STAGES_PER_WORLD }, (_, i) => {
          const n = first + i, lock = n > max, s = stars[n] ?? 0;
          return h('button', {
            class: ['sv-stage', n === stage ? 'on' : '', isBossStage(n) ? 'boss' : ''].join(' '),
            disabled: lock, onclick: () => again(n),
          },
          lock ? spriteEl(SHEETS.items, 'lock', 28) : h('b', { textContent: String(n) }),
          isBossStage(n) ? spriteEl(SHEETS.items, 'crown', 24, 'sv-badge') : null,
          lock ? null : h('small', { class: 'sv-pip', textContent: starText(s) }));
        })));
    })),
    startPicker(platform, data, () => again()),
    h('div', { class: 'lobby-row' },
      playButton(platform, () => play(root, platform, stage, data.start), `ステージ ${stage}`),
      h('button', { class: 'pill-btn', onclick: () => upgradePanel(platform, SURVIVOR, [SHEETS.icons, SHEETS.items], () => again()) },
        spriteEl(SHEETS.icons, 'hammer', 28), ' つよくする')),
  ));
  root.querySelector('.sv-stage.on')?.scrollIntoView({ block: 'nearest' });
}

// でてくる ぶき（さいしょの3つ + 解放したもの）と、もてる ぶきの数（ぶきの わく）
function loadoutOf(platform: Platform): Loadout {
  return {
    pool: WEAPONS.filter(w => BASE_WEAPONS.includes(w) || platform.upgradeLevel(unlockId(w)) > 0),
    slots: BASE_SLOTS + platform.upgradeLevel('slot'),
  };
}

// さいしょの ぶき: でてくる ぶきから1つ えらぶ。まだの ぶきは かぎ（つよくする で 解放）
function startPicker(platform: Platform, data: SurvivorData, onChange: () => void): HTMLElement {
  const lo = loadoutOf(platform);
  const cur = data.start && lo.pool.includes(data.start) ? data.start : 'bolt';
  const pick = (start: WeaponId) => { platform.saveData<SurvivorData>({ ...data, start }); onChange(); };
  return h('div', { class: 'sv-start' },
    h('span', { class: 'sv-start-label', textContent: `さいしょの ぶき（もてるのは ${lo.slots}つ）` }),
    ...WEAPONS.map(w => lo.pool.includes(w)
      ? h('button', { class: `sv-start-btn ${cur === w ? 'on' : ''}`, 'aria-label': SKILLS[w].name, onclick: () => pick(w) }, artEl(SKILLS[w].art, 40))
      : h('span', { class: 'sv-start-btn locked', title: 'つよくする で かいほう' }, artEl(SKILLS[w].art, 40), spriteEl(SHEETS.items, 'lock', 20, 'sv-lock'))));
}

function play(root: HTMLElement, platform: Platform, stage: number, start?: WeaponId) {
  const lo = loadoutOf(platform);
  const ctx = platform.startRun(stage);
  if (!ctx) return;
  const holder = h('div', { class: 'stage' });
  root.replaceChildren(holder);
  const quit = quitButton(() => (game.scene.getScene('battle') as unknown as BattleScene | null)?.quit());
  const game = startBattle(holder, {
    avatar: ctx.avatar,
    easy: ctx.easy,
    stage,
    upgrades: ctx.upgrades as { hp: number; atk: number; speed: number; magnet: number },
    startWeapon: start && lo.pool.includes(start) ? start : 'bolt',
    loadout: lo,
    rerolls: ctx.upgrades.reroll ?? 0,
    onLevelUp: (level, levels, evolved, reroll) => chooseSkill(level, levels, evolved, reroll, lo),
    onShop: shop => openShop(shop, lo),
    onEnd: r => end(r),
  });

  function end(r: RunResult) {
    quit.remove();
    game.scene.pause('battle');
    const { coins, firstClear } = platform.endRun({ cleared: r.cleared, stage, score: r.kills });
    // ★ と ずかん を のこす（強さには関係しない）
    const data = platform.data<SurvivorData>() ?? {};
    const got = starsOf(r);
    const before = data.stars?.[stage] ?? 0;
    const kills = { ...data.kills };
    const newKinds = Object.keys(r.killsByKind).filter(k => !kills[k]);
    for (const [k, n] of Object.entries(r.killsByKind)) kills[k] = (kills[k] ?? 0) + n;
    const evolved = [...new Set([...(data.evolved ?? []), ...r.evolved])];
    const newEvo = r.evolved.filter(w => !(data.evolved ?? []).includes(w));
    platform.saveData<SurvivorData>({ ...data, stars: { ...data.stars, [stage]: Math.max(before, got) }, kills, evolved });

    const next = firstClear && stage < SURVIVOR_STAGES;
    const news = newKinds.length + newEvo.length;
    resultPanel({
      cleared: r.cleared, coins,
      title: r.bossDefeated ? 'ボスを たおした！' : r.cleared ? 'クリア！' : 'おつかれさま！',
      note: [
        r.cleared ? `${starText(got)}${got > before ? ' あたらしい ★！' : ''}` : '',
        news ? `ずかんに ${news}こ ふえた！` : '',
        next ? 'つぎの ステージに すすめるよ' : '',
      ].filter(Boolean).join(' / ') || undefined,
      stats: [
        h('span', { class: 'chip' }, ico('clock'), ` ${r.seconds}びょう`),
        spriteChip(SHEETS.icons, 'swords', r.kills),
        h('span', { class: 'chip', textContent: `Lv ${r.level}` }),
        ...r.evolved.map(w => h('span', { class: 'chip' }, artEl(SKILLS[w].evo!.art, '1.2em'), ` ${SKILLS[w].evo!.name}`)),
      ].filter((x): x is HTMLElement => !!x),
      onClose: () => { game.destroy(true); showTitle(root, platform, next ? stage + 1 : stage); },
    });
  }
}

// レベルアップ: 3つから1つ えらぶ（クイズは出さない。docs/03 8.）。えらびなおし（解放）が あれば 出しなおせる
function chooseSkill(level: number, levels: Record<SkillId, number>, evolved: WeaponId[], reroll: Reroll, lo: Loadout): Promise<SkillId | null> {
  if (!skillChoices(levels, lo).length) return Promise.resolve(null);
  return new Promise(resolve => {
    const o = overlay();
    o.el.classList.add('game-survivor');
    const card = o.el.firstElementChild as HTMLElement;
    const render = () => card.replaceChildren(
      h('h1', { class: 'title', textContent: `レベル ${level}！ スキルを えらぼう` }),
      slotBar(levels, lo),
      h('div', { class: 'skill-choices' }, ...skillChoices(levels, lo).map(id => skillCard(id, levels, evolved, () => { o.close(); resolve(id); }))),
      rerollButton(reroll, render) ?? '',
    );
    render();
  });
}

// もっている ぶき と あいている わく（わくが いっぱいだと あたらしい ぶきは でない）
function slotBar(levels: Record<SkillId, number>, lo: Loadout): HTMLElement {
  const owned = WEAPONS.filter(w => levels[w] > 0);
  return h('div', { class: 'sv-slots' },
    h('small', { textContent: 'ぶき' }),
    ...Array.from({ length: lo.slots }, (_, i) => owned[i]
      ? h('span', { class: 'sv-slot' }, artEl(SKILLS[owned[i]].art, 32), h('b', { textContent: String(levels[owned[i]]) }))
      : h('span', { class: 'sv-slot empty' })));
}

function skillCard(id: SkillId, levels: Record<SkillId, number>, evolved: WeaponId[], onClick: () => void, extra?: HTMLElement, disabled = false): HTMLElement {
  const s = SKILLS[id], lv = levels[id], next = lv + 1;
  const willMax = isWeapon(id) && next >= s.max && !evolved.includes(id);
  return h('button', { class: `skill ${lv === 0 ? 'new' : ''}`, disabled, onclick: onClick },
    artEl(s.art, 72),
    s.name,
    s.tag ? h('span', { class: 'sv-tag', textContent: s.tag }) : null,
    h('small', { textContent: lv === 0 ? 'あたらしい！' : `Lv${lv} → ${next}${next >= s.max ? ' MAX' : ''}` }),
    h('small', { class: 'muted', textContent: s.desc }),
    // レベルアップで なにが かわるか
    levelNote(id, next) ? h('small', { class: 'sv-next', textContent: `つぎ: ${levelNote(id, next)}` }) : null,
    // MAX になる ぶきは、たからばこで しんかすることを 見せる
    willMax ? h('small', { class: 'sv-evo-hint' }, spriteEl(SHEETS.items, 'chest', 20), ' で ', artEl(s.evo!.art, 20)) : null,
    extra ?? null,
  );
}

function rerollButton(reroll: Reroll, render: () => void): HTMLElement | null {
  if (reroll.left() <= 0) return null;
  return h('button', { class: 'pill-btn sv-reroll', onclick: () => { if (reroll.use()) render(); } },
    spriteEl(SHEETS.items, 'dice', 28), ` えらびなおす（のこり ${reroll.left()}）`);
}

// おみせ: ⭐メダル（プレイの中だけの お金）で かう。なんこでも かえる
function openShop(shop: ShopApi, lo: Loadout): Promise<void> {
  return new Promise(resolve => {
    const o = overlay();
    o.el.classList.add('game-survivor');
    const card = o.el.firstElementChild as HTMLElement;
    card.classList.add('sv-shop');
    const price = (n: number) => h('span', { class: 'sv-price' }, spriteEl(SHEETS.items, 'medal', 22), ` ${n}`);
    const offer = (item: ShopItem & { sold?: boolean }, i: number) => {
      const cant = item.sold || shop.medals() < item.price;
      const buy = () => { if (shop.buy(i)) render(); };
      if (item.kind === 'skill') return skillCard(item.id, shop.levels(), [], buy, item.sold ? h('b', { class: 'sv-sold', textContent: 'かった！' }) : price(item.price), cant);
      const [art, name, desc] = item.kind === 'heal'
        ? [spriteEl(SHEETS.items, 'meat', 72), 'おにく', 'ハートが 3 もどる']
        : [spriteEl(SHEETS.items, 'chest', 72), 'たからばこ', 'MAX の ぶきが しんか']; 
      return h('button', { class: 'skill sv-goods', disabled: cant, onclick: buy },
        art, name, h('small', { class: 'muted', textContent: desc }),
        item.sold ? h('b', { class: 'sv-sold', textContent: 'かった！' }) : price(item.price));
    };
    const render = () => card.replaceChildren(
      h('h1', { class: 'title' }, spriteEl(SHEETS.items, 'shop', 48), ' おみせ'),
      slotBar(shop.levels(), lo),
      h('div', { class: 'sv-wallet' }, spriteEl(SHEETS.items, 'medal', 34), h('b', { textContent: ` ${shop.medals()}` }),
        h('small', { class: 'muted', textContent: '  メダルは この ゲームの なかだけで つかえるよ' })),
      h('div', { class: 'skill-choices' }, ...shop.offers().map(offer)),
      h('div', { class: 'lobby-row' }, ...[
        rerollButton(shop.reroll, render),
        h('button', { class: 'pill-btn primary sv-shop-close', textContent: 'おわり', onclick: () => { o.close(); resolve(); } }),
      ].filter((x): x is HTMLElement => !!x)),
    );
    render();
  });
}

// ずかん: たおした敵（せかいごと）と、見つけた しんか
function showZukan(data: SurvivorData) {
  const kills = data.kills ?? {};
  const evolved = data.evolved ?? [];
  const roles: Role[] = ['swarm', 'fast', 'dasher', 'shooter', 'tank', 'boss'];
  const found = WORLDS.flatMap(w => roles.map(r => `${w.sheet}:${w.kinds[r]}`)).filter(k => kills[k]).length;
  const o = overlay(
    h('h1', { class: 'title' }, spriteEl(SHEETS.items, 'book', 44), ' ずかん'),
    h('p', { class: 'note', textContent: `てき ${found} / ${WORLDS.length * roles.length}  しんか ${evolved.length} / ${WEAPONS.length}` }),
    ...WORLDS.map(w => h('div', { class: 'sv-zukan-row' },
      h('span', { class: 'sv-zukan-world', textContent: w.name }),
      ...roles.map(r => {
        const n = kills[`${w.sheet}:${w.kinds[r]}`] ?? 0;
        return h('div', { class: `sv-zukan-cell ${n ? '' : 'unknown'}` },
          spriteEl(SHEETS[w.sheet], w.kinds[r] as never, 64),
          h('small', { textContent: n ? String(n) : '？' }),
          n ? h('small', { class: 'sv-trait', textContent: TRAIT_DESC[w.traits[r]] }) : null);
      }))),
    h('div', { class: 'sv-zukan-row' },
      h('span', { class: 'sv-zukan-world', textContent: 'しんか' }),
      ...WEAPONS.map(wp => {
        const s = SKILLS[wp], ok = evolved.includes(wp);
        return h('div', { class: `sv-zukan-cell ${ok ? '' : 'unknown'}` },
          artEl(s.evo!.art, 64),
          h('small', { textContent: ok ? s.evo!.name : '？' }));
      })),
    h('button', { class: 'pill-btn primary', textContent: 'とじる', onclick: () => o.close() }),
  );
  o.el.classList.add('game-survivor');
}

