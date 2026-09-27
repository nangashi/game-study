import Phaser from 'phaser';
import { SKILLS, chestReward, emptyLevels, isWeapon, shopOffers, type Art, type Loadout, type ShopItem, type SkillId, type WeaponId } from './skills';
import { MAIN_SECONDS, ROLES, WORLDS, stageSpec, type Role, type StageEvent, type StageSpec, type Trait, type World } from './stages';
import { heroSheet, type HeroId } from '../../art';
import { assetUrl } from '../../assets/sprite';
import { loadSheet } from '../kit/phaser';
import { sfx } from '../kit/sfx';
import { IMAGES, SHEETS } from './assets.gen';

// 1回の結果
export interface RunResult {
  seconds: number; kills: number; cleared: boolean; level: number;
  bossDefeated: boolean; hp: number; maxHp: number;
  killsByKind: Record<string, number>;   // "enemies_snow:penguin" → たおした数（ずかん）
  evolved: WeaponId[];                   // しんかさせた ぶき（ずかん）
  medals: number;                        // ひろった ⭐メダル（プレイの中だけ）
}

// えらびなおし（永続強化の解放）。1回のプレイで つかえる のこりの数
export interface Reroll { left(): number; use(): boolean }

// おみせ（main.ts が画面を作る）
export interface ShopApi {
  medals(): number;
  offers(): (ShopItem & { sold?: boolean })[];
  levels(): Record<SkillId, number>;
  buy(i: number): boolean;
  reroll: Reroll;
}

export interface BattleConfig {
  avatar: HeroId;
  easy: boolean;          // 年長さん向け: 敵が少なく遅い
  stage: number;
  upgrades: { hp: number; atk: number; speed: number; magnet: number };
  startWeapon: WeaponId;  // さいしょの ぶき（解放した ぶきから えらぶ）
  loadout: Loadout;       // でてくる ぶき と、もてる ぶきの数
  rerolls: number;        // えらびなおしの かず（解放）
  onLevelUp: (level: number, levels: Record<SkillId, number>, evolved: WeaponId[], reroll: Reroll) => Promise<SkillId | null>;
  onShop: (shop: ShopApi) => Promise<void>;
  onEnd: (r: RunResult) => void;
}

interface Enemy {
  obj: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image;
  role: Role; kind: string; hp: number; maxHp: number; speed: number; r: number; base: number; phase: number;
  elite: boolean; boss: boolean; mini: boolean; mass: number;
  trait: Trait | null; faded: boolean; count: number; slowUntil: number; stunUntil: number; bornAt: number;
  kbx: number; kby: number;                  // ノックバック
  state: 'walk' | 'aim' | 'dash' | 'rest'; stateT: number; dirX: number; dirY: number; cd: number;
  straight: boolean;                         // むれ: まっすぐ よこぎる
  hitAt: Partial<Record<string, number>>;    // ぶきごとの さいごに当たった時間（つづけて当たりすぎないように）
  flashAt: number;                           // さいごに白く光った時間（光りっぱなしに ならないように）
  dead: boolean;
}
interface Bullet { obj: Phaser.GameObjects.Image; vx: number; vy: number; life: number; dmg: number; pierce: number; hit: Set<Enemy>; src: WeaponId; slow?: number }
interface Rang { obj: Phaser.GameObjects.Image; t: number; ax: number; ay: number; dmg: number; reach: number; hitR: number }
interface Tornado { obj: Phaser.GameObjects.Image; vx: number; vy: number; life: number }
interface Shot { obj: Phaser.GameObjects.Arc; vx: number; vy: number; life: number; r: number; freeze: boolean }
interface Gem { obj: Phaser.GameObjects.Image; value: number; pulled: boolean; medal: boolean }
type PickupKind = 'bomb' | 'vacuum' | 'meat' | 'chest';
interface Pickup { obj: Phaser.GameObjects.Image; kind: PickupKind; ring: Phaser.GameObjects.Arc }

const ICON_PX = SHEETS.icons.cell;
const HERO_PX = 160;
const ENEMY_PX = SHEETS.enemies.cell;
const FONT = '"Zen Maru Gothic", sans-serif';
const style = (size: number, color = '#1f2937', stroke = '#ffffff') =>
  ({ fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke, strokeThickness: Math.max(4, size / 6) });
const PICKUP_ART: Record<PickupKind, Art> = {
  bomb: { sheet: 'items', frame: 'bomb' }, vacuum: { sheet: 'items', frame: 'vacuum' },
  meat: { sheet: 'items', frame: 'meat' }, chest: { sheet: 'items', frame: 'chest' },
};
const NO_STICK = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
// ⭐メダルを おとす かくりつ（つよい敵は かならず。kill を見る）
const MEDAL_CHANCE: Record<Role, number> = { swarm: 0.025, fast: 0.03, dasher: 0.08, shooter: 0.08, tank: 1, boss: 0 };

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private spec!: StageSpec;
  private world!: World;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.TileSprite;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private rangs: Rang[] = [];
  private tornados: Tornado[] = [];
  private shots: Shot[] = [];
  private gems: Gem[] = [];
  private pickups: Pickup[] = [];
  private orbits: Phaser.GameObjects.Image[] = [];
  private cloud: Phaser.GameObjects.Image | null = null;
  private hud!: {
    hearts: Phaser.GameObjects.Image[]; time: Phaser.GameObjects.Text; stage: Phaser.GameObjects.Text; kills: Phaser.GameObjects.Text;
    icons: Phaser.GameObjects.Image[]; xp: Phaser.GameObjects.Graphics; boss: Phaser.GameObjects.Graphics; arrows: Phaser.GameObjects.Graphics;
    skills: Phaser.GameObjects.Container; medal: Phaser.GameObjects.Image; medals: Phaser.GameObjects.Text;
  };
  private stick = { ...NO_STICK };
  private stickGfx!: Phaser.GameObjects.Graphics;

  private t = 0;              // 経過秒
  private paused = false;
  private ended = false;
  private winning = false;    // ボスをたおして おわるところ
  private freezeUntil = 0;    // ヒットストップ
  private hp = 0; private maxHp = 0; private invulnUntil = 0;
  private xp = 0; private level = 1; private kills = 0; private gemStreak = 0; private gemStreakAt = 0;
  private skill: Record<SkillId, number> = emptyLevels();
  private evolved: WeaponId[] = [];
  private cd: Record<string, number> = {};
  private spawnCd = 0; private orbitAngle = 0; private rushUntil = 0;
  private timeline: StageEvent[] = [];
  private boss: Enemy | null = null;
  private bossDefeated = false;
  private killsByKind: Record<string, number> = {};
  private dealt: Record<string, number> = {}; // ぶきごとに あたえた ダメージ（自動プレイで くらべる）
  private hurtBy: Record<string, number> = {}; // なにに やられたか（自動プレイで くらべる）
  private limit = MAIN_SECONDS;  // おわる時間
  private slowUntil = 0;         // こおりで のろくなっている
  private swordDir = 0;          // つるぎを ふる むき（さいごに うごいた ほう）
  private frostAura: Phaser.GameObjects.Image | null = null;
  private medals = 0; private medalsTotal = 0;
  private rerolls = 0;
  private chestQueue = 0;

  constructor() { super('battle'); }

  init(cfg: BattleConfig) {
    this.cfg = cfg;
    this.spec = stageSpec(cfg.stage);
    this.world = WORLDS[this.spec.world];
    this.timeline = [...this.spec.events];
    this.maxHp = this.hp = 5 + cfg.upgrades.hp + (cfg.easy ? 3 : 0);
    this.rerolls = cfg.rerolls;
    this.skill[cfg.startWeapon] = 1;
  }

  private get atk() { return 1 + 0.25 * this.cfg.upgrades.atk; }
  private get moveSpeed() { return (170 + 12 * this.cfg.upgrades.speed) * (1 + 0.1 * this.skill.shoes) * (this.t < this.slowUntil ? 0.55 : 1); }
  private get magnetRange() { return 110 + 15 * this.cfg.upgrades.magnet + 45 * this.skill.magnet; }
  private get xpToNext() { const l = this.level; return Math.round(5 + 2 * l + 0.7 * l * l); } // はじめは はやく、あとは ゆっくり。1回で 15回くらい（敵を へらしたぶん 0.8 → 0.7）
  private evo(w: WeaponId) { return this.evolved.includes(w); }

  preload() {
    this.load.image('ground', assetUrl(IMAGES[this.world.ground]));
    // 主人公は子どものアバター（土台の画像）を使う
    loadSheet(this, 'hero', heroSheet(this.cfg.avatar));
    loadSheet(this, 'enemies', SHEETS[this.world.sheet]);
    loadSheet(this, 'icons', SHEETS.icons);
    loadSheet(this, 'items', SHEETS.items);
  }

  // アイコンを size(px) の大きさで置く
  private art(a: Art, x: number, y: number, size: number) {
    const frame = a.sheet === 'icons' ? SHEETS.icons.frames[a.frame] : SHEETS.items.frames[a.frame];
    return this.add.image(x, y, a.sheet, frame).setScale(size / ICON_PX);
  }
  private icon(name: keyof typeof SHEETS.icons.frames, x: number, y: number, size: number) { return this.art({ sheet: 'icons', frame: name }, x, y, size); }
  private item(name: keyof typeof SHEETS.items.frames, x: number, y: number, size: number) { return this.art({ sheet: 'items', frame: name }, x, y, size); }

  create() {
    this.cameras.main.setBackgroundColor(this.world.bg);
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'ground').setOrigin(0).setScrollFactor(0).setTint(this.world.groundTint);

    // 足元のかげ（草の上でもキャラが見やすくなる）
    const g = this.make.graphics({}, false);
    g.fillStyle(0x000000, 0.28).fillEllipse(32, 12, 64, 24);
    g.generateTexture('shadow', 64, 24); g.destroy();
    this.playerShadow = this.add.image(0, 0, 'shadow').setDepth(3).setScale(1.2);

    this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('hero', { start: 0, end: 3 }), frameRate: 9, repeat: -1 });
    this.player = this.add.sprite(0, 0, 'hero', 0).setScale(96 / HERO_PX).setDepth(10);
    this.cameras.main.startFollow(this.player, true);

    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(100);
    this.hud = {
      hearts: [],
      time: fixed(this.add.text(0, 14, '', style(28)).setOrigin(0, 0)),
      stage: fixed(this.add.text(0, 50, `${this.world.name} ${this.cfg.stage}`, style(18, '#4c1d95')).setOrigin(0.5, 0)),
      kills: fixed(this.add.text(0, 14, '', style(28)).setOrigin(1, 0)),
      icons: [fixed(this.icon('clock', 0, 32, 36)), fixed(this.icon('swords', 0, 32, 36))],
      xp: fixed(this.add.graphics()),
      boss: fixed(this.add.graphics()),
      arrows: fixed(this.add.graphics()),
      skills: fixed(this.add.container(0, 0)),
      medal: fixed(this.item('medal', 30, 0, 30)),
      medals: fixed(this.add.text(50, 0, '0', style(22, '#92400e')).setOrigin(0, 0.5)),
    };
    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.layoutHud();
    this.scale.on('resize', () => this.layoutHud());

    // バーチャルスティック: 画面のどこをさわっても、そこを中心に動かせる
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.stick.active) return;
      this.stick = { active: true, id: p.id, bx: p.x, by: p.y, dx: 0, dy: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.stick.active || p.id !== this.stick.id) return;
      const dx = p.x - this.stick.bx, dy = p.y - this.stick.by, len = Math.hypot(dx, dy), max = 60;
      const k = len > max ? max / len : 1;
      this.stick.dx = dx * k / max; this.stick.dy = dy * k / max;
    });
    const release = (p: Phaser.Input.Pointer) => { if (p.id === this.stick.id) this.stick = { ...NO_STICK }; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.refreshHud();
    this.refreshSkills();
    this.banner(`${this.world.name} ${this.cfg.stage}`, '#7c3aed');
    // 開発サーバーのときだけ、じどうプレイテスト（scripts/playtest.mjs）から さわれるようにする
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__survivor = this;
  }

  // ---------------- 画面のはしの表示 ----------------

  private layoutHud() {
    const w = this.scale.width;
    this.bg.setSize(w, this.scale.height);
    this.hud.icons[0].setX(w / 2 - 44);
    this.hud.time.setX(w / 2 - 22);
    this.hud.stage.setX(w / 2);
    this.hud.kills.setX(w - 14);
    this.hud.icons[1].setX(w - 14 - this.hud.kills.width - 24);
    this.hud.skills.setPosition(14, this.scale.height - 14);
  }

  private refreshHud() {
    // ハート: 残りは赤、減ったぶんは灰色
    while (this.hud.hearts.length < this.maxHp) {
      const i = this.hud.hearts.length;
      this.hud.hearts.push(this.icon('heart', 30 + (i % 10) * 34, 32 + Math.floor(i / 10) * 32, 34).setScrollFactor(0).setDepth(100));
    }
    this.hud.hearts.forEach((h, i) => (i < this.hp ? h.clearTint().setAlpha(1) : h.setTint(0x6b7280).setAlpha(0.45)));
    const left = Math.max(0, Math.ceil(this.limit - this.t));
    this.hud.time.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    // ⭐メダル（ハートの下）
    const my = 32 + Math.ceil(this.maxHp / 10) * 32;
    this.hud.medal.setY(my); this.hud.medals.setY(my).setText(String(this.medals));
    this.hud.kills.setText(`${this.kills}  Lv${this.level}`);
    this.hud.icons[1].setX(this.scale.width - 14 - this.hud.kills.width - 24);
    const w = this.scale.width;
    this.hud.xp.clear().fillStyle(0x1f2937, 0.25).fillRect(0, 0, w, 8)
      .fillStyle(0x3b82f6).fillRect(0, 0, w * Math.min(1, this.xp / this.xpToNext), 8);
    // ボスの体力
    this.hud.boss.clear();
    if (this.boss && !this.boss.dead) {
      const bw = Math.min(420, w * 0.6), x = (w - bw) / 2, y = 80;
      this.hud.boss.fillStyle(0x1f2937, 0.6).fillRoundedRect(x - 4, y - 4, bw + 8, 22, 8)
        .fillStyle(0xef4444).fillRoundedRect(x, y, bw * Math.max(0, this.boss.hp / this.boss.maxHp), 14, 6);
    }
    this.drawArrows();
  }

  // 持っているスキル（左下）。しんかしたぶきは しんかの絵にする
  private refreshSkills() {
    const c = this.hud.skills;
    c.removeAll(true);
    let x = 0;
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const lv = this.skill[id];
      if (!lv) continue;
      const evo = isWeapon(id) && this.evo(id);
      const s = SKILLS[id];
      c.add(this.art(evo ? s.evo!.art : s.art, x + 22, -22, 40).setScrollFactor(0));
      c.add(this.add.text(x + 40, -4, evo ? '★' : String(lv), style(16, evo ? '#f59e0b' : '#1f2937')).setOrigin(1, 1).setScrollFactor(0));
      x += 46;
    }
  }

  // 画面の外にある アイテムの方向を、はしに やじるしで出す
  private drawArrows() {
    const g = this.hud.arrows.clear();
    const cam = this.cameras.main, w = this.scale.width, hh = this.scale.height;
    for (const p of this.pickups) {
      const sx = p.obj.x - cam.scrollX, sy = p.obj.y - cam.scrollY;
      if (sx > 0 && sx < w && sy > 0 && sy < hh) continue;
      const cx = w / 2, cy = hh / 2, a = Math.atan2(sy - cy, sx - cx);
      const k = Math.min((w / 2 - 36) / Math.abs(Math.cos(a) || 1e-6), (hh / 2 - 36) / Math.abs(Math.sin(a) || 1e-6));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
      g.fillStyle(p.kind === 'chest' ? 0xf59e0b : 0xffffff, 0.95).lineStyle(4, 0x1f2937)
        .beginPath()
        .moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18)
        .lineTo(x + Math.cos(a + 2.4) * 16, y + Math.sin(a + 2.4) * 16)
        .lineTo(x + Math.cos(a - 2.4) * 16, y + Math.sin(a - 2.4) * 16)
        .closePath().fillPath().strokePath();
    }
  }

  // 画面のまんなかに大きな文字を出す
  private banner(text: string, color = '#f59e0b', size = 56) {
    const t = this.add.text(this.scale.width / 2, this.scale.height * 0.3, text, style(size, color, '#ffffff'))
      .setOrigin(0.5).setScale(0.2).setScrollFactor(0).setDepth(300);
    this.tweens.chain({
      targets: t,
      tweens: [
        { scale: 1.15, duration: 180, ease: 'Back.Out' },
        { scale: 1, duration: 100 },
        { alpha: 0, y: t.y - 40, delay: 900, duration: 300 },
      ],
      onComplete: () => t.destroy(),
    });
  }

  private popText(x: number, y: number, text: string, color = '#ffffff', size = 24) {
    const t = this.add.text(x, y, text, style(size, color, '#1f2937')).setOrigin(0.5).setDepth(200).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, y: y - size * 1.4, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 420, duration: 250, onComplete: () => t.destroy() });
  }

  private burst(x: number, y: number, n: number, spread: number, size: number, a: Art = { sheet: 'icons', frame: 'star' }) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, d = spread * (0.5 + Math.random() * 0.7);
      const s = this.art(a, x, y, size * (0.6 + Math.random() * 0.6)).setDepth(150);
      this.tweens.add({
        targets: s, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, angle: (Math.random() - 0.5) * 360,
        alpha: 0, scale: s.scale * 0.3, duration: 350 + Math.random() * 200, ease: 'Cubic.Out', onComplete: () => s.destroy(),
      });
    }
  }

  private ring(x: number, y: number, r: number, color: number, width = 8) {
    const c = this.add.circle(x, y, r, color, 0).setStrokeStyle(width, color, 0.9).setDepth(140).setScale(0.3);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => c.destroy() });
  }

  private flash(color = 0xffffff, alpha = 0.6) {
    const r = this.add.rectangle(0, 0, this.scale.width, this.scale.height, color, alpha).setOrigin(0).setScrollFactor(0).setDepth(250);
    this.tweens.add({ targets: r, alpha: 0, duration: 300, onComplete: () => r.destroy() });
  }

  private hitstop(ms: number) { this.freezeUntil = Math.max(this.freezeUntil, this.time.now + ms); }

  // ---------------- まいフレーム ----------------

  update(time: number, deltaMs: number) {
    this.drawStick();
    if (this.paused || this.ended) return;
    if (time < this.freezeUntil) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.t += dt;
    const now = this.t;

    // 移動
    const px = this.player.x + this.stick.dx * this.moveSpeed * dt;
    const py = this.player.y + this.stick.dy * this.moveSpeed * dt;
    this.player.setPosition(px, py);
    this.playerShadow.setPosition(px, py + 42);
    const moving = Math.hypot(this.stick.dx, this.stick.dy) > 0.15;
    if (moving && !this.player.anims.isPlaying) this.player.play('walk');
    if (!moving && this.player.anims.isPlaying) this.player.stop().setFrame(0);
    if (Math.abs(this.stick.dx) > 0.05) this.player.setFlipX(this.stick.dx < 0); // 画像は右向き
    this.bg.setTilePosition(this.cameras.main.scrollX, this.cameras.main.scrollY);

    if (!this.winning) {
      this.runEvents();
      this.spawn(dt);
    }
    this.moveEnemies(dt, now);
    if (this.ended) return;
    this.updateShots(dt, now);
    if (this.ended) return;
    this.fireBolts(dt, now);
    this.updateBullets(dt, now);
    this.updateOrbits(dt, now);
    this.updateBoom(dt, now);
    this.updateRang(dt, now);
    this.updateThunder(dt, now);
    this.updateFrost(dt, now);
    this.updateSword(dt, now);
    this.updateGems(dt);
    this.updatePickups(now);
    this.enemies = this.enemies.filter(e => !e.dead);

    if (this.t >= this.limit && !this.winning) return this.finish(true);
    this.refreshHud();
    // おみせ・たからばこが ひらいた フレームでは レベルアップしない（画面が かさならないように）
    if (this.xp >= this.xpToNext && !this.winning && !this.paused) void this.levelUp();
  }

  private drawStick() {
    this.stickGfx.clear();
    if (!this.stick.active || this.paused) return;
    const { bx, by, dx, dy } = this.stick;
    this.stickGfx.fillStyle(0xffffff, 0.35).fillCircle(bx, by, 60).fillStyle(0x2563eb, 0.6).fillCircle(bx + dx * 60, by + dy * 60, 26);
  }

  // ---------------- 敵を出す ----------------

  private runEvents() {
    while (this.timeline.length && this.timeline[0].at <= this.t) {
      const ev = this.timeline.shift()!;
      if (ev.kind === 'flock') this.flock();
      if (ev.kind === 'ring') this.encircle();
      if (ev.kind === 'rush') { this.rushUntil = this.t + 10; this.banner('いっぱい くるよ！', '#ef4444'); sfx.warn(); }
      if (ev.kind === 'elite') this.spawnElite();
      if (ev.kind === 'item') this.dropItem();
      if (ev.kind === 'boss') this.spawnBoss();
      if (ev.kind === 'shop') void this.openShop();
    }
  }

  private get hpScale() { return this.spec.power * (1 + this.t / 150); }

  private spawn(dt: number) {
    const easy = this.cfg.easy;
    // 一度に 出ている 敵の数の 上限。はじめの ステージは すくなめ
    // ひいて うつしている ときは、敵が とおくから くる ぶん（とちゅうの 敵で 上限が うまらないように）上限を ふやす
    const cap = Math.min(160, 60 + this.cfg.stage * 10) * (easy ? 0.6 : 1) / this.scale.zoom;
    this.spawnCd -= dt;
    if (this.spawnCd > 0 || this.enemies.length >= cap) return;
    const rush = this.t < this.rushUntil ? 3 : 1;
    this.spawnCd = Math.max(0.3, 1.0 - this.t / 220) / this.spec.density / (easy ? 0.7 : 1) / rush;
    const roles = this.spec.roles;
    const total = roles.reduce((a, r) => a + ROLES[r].weight, 0);
    let x = Math.random() * total;
    let role = roles.find(r => (x -= ROLES[r].weight) < 0) ?? roles[0];
    // うつ敵は 1たいずつ、かずに 上限（おおいと 弾だらけで 近づけない・たおせない）
    if (role === 'shooter' && this.enemies.filter(e => e.role === 'shooter' && !e.dead).length >= this.spec.shooterCap) role = 'swarm';
    // よわい敵は かたまりで出す（まとめて たおせると気持ちいい）
    const n = role === 'swarm' ? 3 + Math.floor(this.t / 60) : role === 'tank' || role === 'shooter' ? 1 : 1 + Math.floor(this.t / 80);
    const a = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) this.addEnemy(role, { angle: a + (Math.random() - 0.5) * 0.5 });
  }

  private addEnemy(role: Role, o: { angle?: number; x?: number; y?: number; elite?: boolean; boss?: boolean; hp?: number; size?: number; mini?: boolean } = {}): Enemy {
    const R = ROLES[role];
    const size = o.size ?? R.size * (o.elite ? 1.6 : o.mini ? 0.6 : 1);
    const cam = this.cameras.main;
    const a = o.angle ?? Math.random() * Math.PI * 2, dist = Math.hypot(cam.width, cam.height) / 2 + size * 0.6;
    const x = o.x ?? this.player.x + Math.cos(a) * dist, y = o.y ?? this.player.y + Math.sin(a) * dist;
    const kind = this.world.kinds[role];
    const frame = (SHEETS[this.world.sheet].frames as Record<string, number>)[kind];
    const base = size / ENEMY_PX;
    const obj = this.add.image(x, y, 'enemies', frame).setScale(base).setDepth(o.boss ? 9 : o.elite ? 7 : 5);
    const shadow = this.add.image(x, y, 'shadow').setDepth(3).setScale(size / 64);
    const hp = o.hp ?? R.hp * this.hpScale * (o.elite ? 5 : o.mini ? 0.4 : 1);
    // はやさも 推奨強化レベルで すこし上がる（すばやさ の強化で おいつける。強化しないと にげきれない）
    const speed = R.speed * this.spec.speed * (this.cfg.easy ? 0.85 : 1) * (0.9 + Math.random() * 0.2);
    const e: Enemy = {
      obj, shadow, role, kind: `${this.world.sheet}:${kind}`, hp, maxHp: hp, speed, r: size * 0.38, base, phase: Math.random() * 6,
      elite: !!o.elite, boss: !!o.boss, mini: !!o.mini, trait: o.mini ? null : this.world.traits[role], faded: false, count: 0, slowUntil: 0, stunUntil: 0, bornAt: this.t, mass: o.boss ? 12 : o.elite ? 5 : role === 'tank' ? 3 : 1,
      kbx: 0, kby: 0, state: 'walk', stateT: 0, dirX: 0, dirY: 0, cd: 1 + Math.random() * 2, straight: false, hitAt: {}, flashAt: 0, dead: false,
    };
    if (o.elite) e.obj.setTint(0xffe08a);
    this.enemies.push(e);
    return e;
  }

  // はやい敵のむれが、画面のはしから はしへ まっすぐ よこぎる
  private flock() {
    this.banner('むれが くるよ！', '#2563eb');
    sfx.warn();
    const cam = this.cameras.main;
    const a = Math.random() * Math.PI * 2, dist = Math.hypot(cam.width, cam.height) / 2 + 60;
    const dx = -Math.cos(a), dy = -Math.sin(a), nx = -dy, ny = dx;
    const n = 14 + this.spec.world * 4;
    for (let i = 0; i < n; i++) {
      const off = (i - n / 2) * 34, back = Math.random() * 120;
      const e = this.addEnemy('fast', {
        x: this.player.x - dx * (dist + back) + nx * off, y: this.player.y - dy * (dist + back) + ny * off,
      });
      e.straight = true; e.dirX = dx; e.dirY = dy; e.speed *= 1.6;
    }
  }

  // ぐるっと かこまれる
  private encircle() {
    this.banner('かこまれた！', '#ef4444');
    sfx.warn();
    const n = 22 + this.spec.world * 6, R = 380;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.addEnemy('swarm', { x: this.player.x + Math.cos(a) * R, y: this.player.y + Math.sin(a) * R });
    }
  }

  private spawnElite() {
    this.banner('つよい てき！', '#d97706');
    sfx.warn();
    const e = this.addEnemy('tank', { elite: true });
    e.speed *= 1.2;
  }

  private spawnBoss() {
    this.banner('ボスが きた！', '#dc2626', 64);
    this.cameras.main.shake(500, 0.012);
    sfx.warn();
    this.boss = this.addEnemy('boss', { boss: true, size: this.spec.bossSize, hp: this.spec.bossHp * (this.cfg.easy ? 0.5 : 1) });
  }

  // ばくだん / じしゃく / おにく を、すこし はなれたところに おとす
  private dropItem(only?: PickupKind) {
    const kinds: PickupKind[] = this.hp < this.maxHp ? ['bomb', 'vacuum', 'meat'] : ['bomb', 'vacuum'];
    const kind = only ?? kinds[Math.floor(Math.random() * kinds.length)];
    const a = Math.random() * Math.PI * 2, d = 260 + Math.random() * 120;
    this.addPickup(kind, this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d);
  }

  private addPickup(kind: PickupKind, x: number, y: number) {
    const ring = this.add.circle(x, y, 38, 0xfde68a, 0.5).setDepth(3);
    this.tweens.add({ targets: ring, scale: 1.3, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
    const obj = this.art(PICKUP_ART[kind], x, y, kind === 'chest' ? 72 : 56).setDepth(4);
    this.tweens.add({ targets: obj, y: y - 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.pickups.push({ obj, kind, ring });
  }

  // ---------------- 敵のうごき ----------------

  private moveEnemies(dt: number, now: number) {
    const cam = this.cameras.main, far = Math.hypot(cam.width, cam.height) * 0.8;
    const damp = Math.exp(-8 * dt);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = this.player.x - e.obj.x, dy = this.player.y - e.obj.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const sp = e.speed * (now < e.slowUntil ? 0.4 : 1); // こおり で のろくなる
      let vx = ux * sp, vy = uy * sp;
      e.stateT -= dt; e.cd -= dt;

      if (now < e.stunUntil) {
        // しびれて うごけない（とっしんは とまり、うつのも おくれる）
        if (e.state === 'aim' || e.state === 'dash') { e.state = 'rest'; e.stateT = 0.4; e.obj.clearTint(); }
        e.cd = Math.max(e.cd, 0.5);
        vx = 0; vy = 0;
      } else if (e.straight) {
        vx = e.dirX * sp; vy = e.dirY * sp;
        if (d > far * 1.3) { this.remove(e); continue; }
      } else if (e.boss) {
        this.bossAct(e, dt, ux, uy);
      } else {
        [vx, vy] = this.traitMove(e, now, d, ux, uy, sp, vx, vy);
      }

      // 遠くに はなれた敵は、進む先に よびもどす
      if (!e.straight && !e.boss && d > far * 1.25) {
        const a = Math.atan2(this.stick.dy || -uy, this.stick.dx || -ux) + (Math.random() - 0.5);
        e.obj.setPosition(this.player.x + Math.cos(a) * far * 0.75, this.player.y + Math.sin(a) * far * 0.75);
      }

      e.obj.x += (vx + e.kbx) * dt;
      e.obj.y += (vy + e.kby) * dt;
      e.kbx *= damp; e.kby *= damp;
      e.obj.setFlipX(Math.abs(vx) > 5 ? vx > 0 : dx > 0); // 画像は左向き
      if (e.state !== 'aim') {
        // ぷよぷよ動かす（アニメーションの代わり）
        const w = Math.sin(now * 9 + e.phase) * 0.07;
        e.obj.setScale(e.base * (1 - w), e.base * (1 + w));
      }
      e.shadow.setPosition(e.obj.x, e.obj.y + e.r * 1.05);
      if (d < e.r + 22 && !e.faded) {
        const hit = this.hurt(now, e.boss ? 'boss' : e.role);
        if (hit && e.trait === 'freeze') this.slowPlayer(now);
        if (this.ended) return;
      }
    }
  }

  // 役と とくちょう（Trait）ごとの うごき。もどり値は はやさ
  private traitMove(e: Enemy, now: number, d: number, ux: number, uy: number, sp: number, vx: number, vy: number): [number, number] {
    // とっしん: とまって ぷるぷる（赤くなる）→ まっすぐ
    const dash = (aim: number, speed: number, time: number, again = 0) => {
      if (e.state === 'walk' && d < 320 && e.cd <= 0) {
        e.state = 'aim'; e.stateT = aim; e.dirX = ux; e.dirY = uy; e.obj.setTint(0xff9999);
      }
      if (e.state === 'aim') {
        e.obj.x += (Math.random() - 0.5) * 4;
        if (e.stateT <= 0) { e.state = 'dash'; e.stateT = time; e.obj.clearTint(); }
        return [0, 0] as [number, number];
      }
      if (e.state === 'dash') {
        if (e.stateT <= 0) {
          // bounce: つづけて もう1回（3回まで）
          if (e.count < again) { e.count++; e.state = 'aim'; e.stateT = 0.25; e.dirX = ux; e.dirY = uy; e.obj.setTint(0xff9999); }
          else { e.state = 'rest'; e.stateT = 0.5; e.count = 0; }
        }
        return [e.dirX * speed, e.dirY * speed] as [number, number];
      }
      if (e.state === 'rest') {
        if (e.stateT <= 0) { e.state = 'walk'; e.cd = 2.5 + Math.random(); }
        return [0, 0] as [number, number];
      }
      return [vx, vy] as [number, number];
    };
    // うつ前に ふくらむ
    const aimShot = (every: number, range: number, fire: () => void) => {
      if (e.cd <= 0.45 && e.state === 'walk' && d < range) {
        e.state = 'aim'; this.tweens.add({ targets: e.obj, scale: e.base * 1.25, duration: 220, yoyo: true });
      }
      if (e.cd <= 0) { e.state = 'walk'; if (d < range) { fire(); e.cd = every + Math.random(); } else e.cd = 0.8; }
    };
    // 近づけば ちかい ぶきが とどくように、にげるのは 170px より 近いときだけ
    const keepAway = () => (d < 170 ? [-ux * sp * 0.6, -uy * sp * 0.6] : d < 230 ? [0, 0] : [vx, vy]) as [number, number];

    switch (e.trait) {
      case 'freeze': return [vx * 1.25, vy * 1.25]; // こおりコウモリは すこし はやい
      case 'zigzag': { // ジグザグ
        const w = Math.sin(now * 6 + e.phase) * sp * 0.9;
        return [vx - uy * w, vy + ux * w];
      }
      case 'phase': { // ときどき すきとおる（そのあいだ こうげきが きかない）→ とっしん
        const faded = (now + e.phase) % 4 < 1.3;
        if (faded !== e.faded) { e.faded = faded; e.obj.setAlpha(faded ? 0.3 : 1); }
        return dash(0.6, 400, 0.5);
      }
      case 'slide': return dash(0.35, 520, 1.1);                 // おなかで とおくまで
      case 'charge': return dash(0.9, 360, 0.8);                 // うなって とっしん（大きい）
      case 'bounce': return dash(0.5, 420, 0.45, 1);             // 2回 つづけて
      case 'spread':
        aimShot(5.5, 520, () => [-0.35, 0, 0.35].forEach(a => this.enemyShot(e.obj.x, e.obj.y, Math.atan2(uy, ux) + a, 150)));
        return keepAway();
      case 'bigball':
        aimShot(5.5, 520, () => this.enemyShot(e.obj.x, e.obj.y, Math.atan2(uy, ux), 115, { r: 26 }));
        return keepAway();
      case 'lob':
        aimShot(7, 520, () => this.lob(e.obj.x, e.obj.y, this.player.x, this.player.y));
        return keepAway();
      case 'throw': // よわいけど ときどき ゆきだまを なげる
        if (e.cd <= 0) { e.cd = 6 + Math.random() * 3; if (d < 420) this.enemyShot(e.obj.x, e.obj.y, Math.atan2(uy, ux), 130, { r: 9 }); }
        return [vx * 0.9, vy * 0.9];
      case 'hop': { // ぴょん（はやい）→ とまる
        const on = (now + e.phase) % 0.9 < 0.4;
        return on ? [vx * 2, vy * 2] : [0, 0];
      }
      case 'swoop': // まわりを まわって から とびこむ
        if (e.state === 'walk' && d < 260) { e.state = 'rest'; e.stateT = 1.8; e.count = Math.random() < 0.5 ? 1 : -1; }
        if (e.state === 'rest') {
          if (e.stateT <= 0) { e.state = 'dash'; e.stateT = 0.6; e.dirX = ux; e.dirY = uy; }
          return [-uy * sp * e.count + ux * (d - 220), ux * sp * e.count + uy * (d - 220)];
        }
        if (e.state === 'dash') { if (e.stateT <= 0) { e.state = 'walk'; e.cd = 2; } return [e.dirX * 330, e.dirY * 330]; }
        return [vx, vy];
      case 'stomp': // ちかくで ドシン！（赤い わ）
        if (e.state === 'walk' && d < 170 && e.cd <= 0) {
          e.state = 'aim'; e.cd = 3.5;
          this.warnCircle(e.obj.x, e.obj.y, 150, 0.8, (x, y, r) => {
            if (e.dead) return;
            this.cameras.main.shake(150, 0.008); sfx.boom(); this.ring(x, y, r, 0x92400e, 10);
            if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < r) this.hurt(this.t, 'stomp');
            e.state = 'walk';
          });
        }
        return e.state === 'aim' ? [0, 0] : [vx, vy];
      case 'spawner': // グミを うみだす
        if (e.cd <= 0) {
          e.cd = 7;
          if (this.enemies.length < 150) for (let i = 0; i < 2; i++) this.addEnemy('swarm', { x: e.obj.x + (i ? 40 : -40), y: e.obj.y + 30 });
        }
        return [vx, vy];
      default:
        return [vx, vy];
    }
  }

  // ボス: せかいごとに ちがう こうげき。ゆっくり ちかづき、ときどき たまを わっか に うつ / 手下を よぶ / ばくだんを ふらせる
  private bossAct(e: Enemy, _dt: number, ux: number, uy: number) {
    if (e.cd <= 0.6 && e.state === 'walk') {
      e.state = 'aim';
      e.obj.setTint(0xffb4b4);
      this.tweens.add({ targets: e.obj, scale: e.base * 1.15, duration: 300, yoyo: true });
    }
    if (e.cd > 0) return;
    e.state = 'walk';
    e.obj.clearTint();
    e.count++;
    e.cd = this.spec.bigBoss ? 2.6 : 3.4;
    const big = this.spec.bigBoss;
    if (e.count % 2 === 1) {
      if (e.trait === 'bombrain') {
        for (let i = 0; i < (big ? 6 : 4); i++) {
          const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 80 + Math.random() * 160;
          this.lob(e.obj.x, e.obj.y, this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r);
        }
      } else {
        const n = big ? 14 : 10, off = Math.random();
        for (let i = 0; i < n; i++) this.enemyShot(e.obj.x, e.obj.y, off + (i / n) * Math.PI * 2, 140, { freeze: e.trait === 'icering' });
      }
      sfx.shoot();
    } else {
      for (let i = 0; i < (big ? 8 : 5); i++) {
        const a = Math.atan2(-uy, -ux) + (i - 2) * 0.5;
        this.addEnemy('swarm', { x: e.obj.x + Math.cos(a) * 120, y: e.obj.y + Math.sin(a) * 120 });
      }
    }
  }

  private enemyShot(x: number, y: number, angle: number, speed: number, o: { r?: number; freeze?: boolean } = {}) {
    // 敵のたまは 赤（あぶない色）。こおりの たまは 水色（あたると のろくなる）
    const r = o.r ?? 13;
    const obj = this.add.circle(x, y, r, o.freeze ? 0x7dd3fc : 0xef4444).setStrokeStyle(4, o.freeze ? 0x1e3a8a : 0x7f1d1d).setDepth(12);
    this.shots.push({ obj, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 5, r, freeze: !!o.freeze });
  }

  // ばくだんを なげる: おちるところに 赤い わ（あいずを 見て にげる）→ どかん
  private lob(fx: number, fy: number, tx: number, ty: number) {
    const bomb = this.item('cherrybomb', fx, fy, 40).setDepth(30);
    this.tweens.add({ targets: bomb, x: tx, duration: 1100 });
    this.tweens.add({ targets: bomb, y: { from: fy, to: Math.min(fy, ty) - 140 }, duration: 550, ease: 'Quad.Out', yoyo: false,
      onComplete: () => this.tweens.add({ targets: bomb, y: ty, duration: 550, ease: 'Quad.In' }) });
    this.warnCircle(tx, ty, 65, 1.2, (x, y, r) => {
      bomb.destroy();
      const fx = this.icon('boom', x, y, r * 2).setDepth(29).setAlpha(0.9);
      this.tweens.add({ targets: fx, alpha: 0, duration: 300, onComplete: () => fx.destroy() });
      sfx.boom();
      this.ring(x, y, r, 0xef4444, 8);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < r) this.hurt(this.t, 'lob');
    });
  }

  // あいずの 赤い わ: だんだん うまって、うまったら onDone
  private warnCircle(x: number, y: number, r: number, sec: number, onDone: (x: number, y: number, r: number) => void) {
    const edge = this.add.circle(x, y, r, 0xef4444, 0.12).setStrokeStyle(4, 0xef4444, 0.9).setDepth(2);
    const fill = this.add.circle(x, y, r, 0xef4444, 0.35).setDepth(2).setScale(0);
    this.tweens.add({ targets: fill, scale: 1, duration: sec * 1000, onComplete: () => { edge.destroy(); fill.destroy(); if (!this.ended) onDone(x, y, r); } });
  }

  private updateShots(dt: number, now: number) {
    for (const s of this.shots) {
      s.obj.x += s.vx * dt; s.obj.y += s.vy * dt; s.life -= dt;
      if (Phaser.Math.Distance.Between(s.obj.x, s.obj.y, this.player.x, this.player.y) < 18 + s.r) {
        s.life = 0;
        if (this.hurt(now, 'shot') && s.freeze) this.slowPlayer(now);
        if (this.ended) return;
      }
    }
    this.shots = this.shots.filter(s => { if (s.life > 0) return true; s.obj.destroy(); return false; });
  }

  // のろくなる（こおりコウモリ・こおりの たま）
  private slowPlayer(now: number) {
    this.slowUntil = now + 2;
    this.player.setTint(0x93c5fd);
    this.time.delayedCall(2000, () => { if (this.t >= this.slowUntil - 0.05) this.player.clearTint(); });
  }

  // やられたら true
  private hurt(now: number, src: string): boolean {
    if (now < this.invulnUntil || this.winning || this.ended) return false;
    this.hp -= 1;
    this.hurtBy[src] = (this.hurtBy[src] ?? 0) + 1;
    this.invulnUntil = now + 1.5;
    this.tweens.add({ targets: this.player, alpha: 0.3, duration: 100, yoyo: true, repeat: 5, onComplete: () => this.player.setAlpha(1) });
    this.cameras.main.shake(180, 0.008);
    this.flash(0xef4444, 0.25);
    sfx.hurt();
    // まわりの敵を すこし おしかえす（つづけて やられないように）
    for (const e of this.enemies) this.push(e, this.player.x, this.player.y, 520, 160);
    if (this.hp <= 0) this.finish(false);
    return true;
  }

  private push(e: Enemy, fx: number, fy: number, power: number, range: number) {
    const dx = e.obj.x - fx, dy = e.obj.y - fy, d = Math.hypot(dx, dy) || 1;
    if (d > range + e.r) return;
    e.kbx += dx / d * power / e.mass; e.kby += dy / d * power / e.mass;
    if (e.state === 'dash') { e.state = 'rest'; e.stateT = 0.4; }
  }

  // ---------------- ぶき ----------------

  private nearestEnemies(n: number): Enemy[] {
    return this.enemies.filter(e => !e.dead)
      .map(e => ({ e, d: Phaser.Math.Distance.Between(e.obj.x, e.obj.y, this.player.x, this.player.y) }))
      .sort((a, b) => a.d - b.d).slice(0, n).map(x => x.e);
  }

  private onScreen(e: Enemy) {
    const cam = this.cameras.main;
    return e.obj.x > cam.scrollX && e.obj.x < cam.scrollX + cam.width && e.obj.y > cam.scrollY && e.obj.y < cam.scrollY + cam.height;
  }

  private cool(key: string, dt: number, every: number): boolean {
    this.cd[key] = (this.cd[key] ?? 0) - dt;
    if (this.cd[key] > 0) return false;
    this.cd[key] = every;
    return true;
  }

  // まほうだま → ながれぼし（つらぬく大きな ほし）
  private fireBolts(dt: number, _now: number) {
    const lv = this.skill.bolt, evo = this.evo('bolt');
    if (!lv || !this.enemies.length) return;
    if (!this.cool('bolt', dt, evo ? 0.6 : Math.max(0.6, 0.9 - lv * 0.06))) return;
    const targets = this.nearestEnemies(evo ? 5 : lv);
    targets.forEach(t => {
      const a = Math.atan2(t.obj.y - this.player.y, t.obj.x - this.player.x);
      const obj = evo
        ? this.item('comet', this.player.x, this.player.y, 60).setDepth(8).setRotation(a + Math.PI * 0.8)
        : this.item('orb', this.player.x, this.player.y, 40).setDepth(8);
      const sp = evo ? 620 : 480;
      this.bullets.push({ obj, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, dmg: this.atk * (evo ? 1.8 : 1.3), pierce: evo ? 2 : 0, hit: new Set(), src: 'bolt' });
    });
    if (evo) sfx.shoot();
  }

  private updateBullets(dt: number, now: number) {
    for (const b of this.bullets) {
      b.obj.x += b.vx * dt; b.obj.y += b.vy * dt; b.life -= dt;
      for (const e of this.enemies) {
        if (e.dead || b.hit.has(e) || b.life <= 0) continue;
        if (Phaser.Math.Distance.Between(e.obj.x, e.obj.y, b.obj.x, b.obj.y) < e.r + 12) {
          b.hit.add(e);
          this.damage(e, b.dmg, 140, this.player.x, this.player.y, b.src, b.slow);
          if (b.pierce-- <= 0) b.life = 0;
        }
      }
    }
    this.bullets = this.bullets.filter(b => { if (b.life > 0) return true; b.obj.destroy(); return false; });
  }

  // まわるほし → ぎんがリング（数がふえ、わが のびちぢみする）。ちかくを まもる。敵の たまを けす
  private updateOrbits(dt: number, now: number) {
    const lv = this.skill.orbit, evo = this.evo('orbit');
    const n = evo ? 6 : lv;
    if (!n) return;
    while (this.orbits.length < n) this.orbits.push(this.icon('orbit', 0, 0, 46).setDepth(11));
    this.orbitAngle += dt * (evo ? 4 : 3);
    const R = evo ? 130 + Math.sin(now * 2) * 50 : 80 + lv * 6;
    this.orbits.forEach((o, i) => {
      const a = this.orbitAngle + (i / n) * Math.PI * 2;
      o.setPosition(this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R).setRotation(a * 2);
      for (const e of this.enemies) {
        if (e.dead || now - (e.hitAt.orbit ?? -9) < 0.5) continue;
        if (Phaser.Math.Distance.Between(e.obj.x, e.obj.y, o.x, o.y) < e.r + (evo ? 26 : 18)) {
          e.hitAt.orbit = now;
          this.damage(e, this.atk * (evo ? 1.5 : 1), evo ? 380 : 220, o.x, o.y, 'orbit');
        }
      }
      // 敵の たまを けす（うつ敵に つよい）
      for (const sh of this.shots) {
        if (sh.life > 0 && Phaser.Math.Distance.Between(sh.obj.x, sh.obj.y, o.x, o.y) < sh.r + (evo ? 26 : 18)) {
          sh.life = 0;
          this.ring(sh.obj.x, sh.obj.y, sh.r + 8, 0xfde047, 4);
        }
      }
    });
  }

  private blast(x: number, y: number, R: number, dmg: number, fx: boolean) {
    const ring = this.add.circle(x, y, R, 0xf97316, 0.25).setDepth(7);
    const burst = fx
      ? this.item('firework', x, y, R * 1.8).setDepth(7).setAlpha(0.9)
      : this.icon('boom', x, y, R * 1.6).setDepth(7).setAlpha(0.85);
    this.tweens.add({ targets: [ring, burst], alpha: 0, scale: '*=1.15', duration: 380, onComplete: () => { ring.destroy(); burst.destroy(); } });
    for (const e of this.enemies) {
      if (!e.dead && Phaser.Math.Distance.Between(e.obj.x, e.obj.y, x, y) < R + e.r) this.damage(e, dmg, 250, x, y, 'boom');
    }
  }

  // ばくだん → はなび（とおくの かたまりに なげる。ばくはつまで すこし まつので、はやい敵には にげられる）
  private updateBoom(dt: number, _now: number) {
    const lv = this.skill.boom, evo = this.evo('boom');
    if (!lv) return;
    // レベルで: 2・4 は おおきく・はやく、3・5 は かず +1
    if (!this.cool('boom', dt, evo ? 2 : Math.max(2.2, 3 - lv * 0.2))) return;
    const n = evo ? 3 : lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
    const R = evo ? 110 : 75 + lv * 7;
    const dmg = this.atk * (evo ? 3 : 2 + lv * 0.1);
    for (const [x, y] of this.bombTargets(n, R)) this.throwBomb(x, y, R, dmg, evo);
  }

  // ねらう ところ: 120〜360px（ほぼ 画面の中）で、まわりに 敵が いちばん おおい ところ（おなじ ところには かさねない）
  private bombTargets(n: number, R: number): [number, number][] {
    const px = this.player.x, py = this.player.y;
    const alive = this.enemies.filter(e => !e.dead);
    const far = alive.filter(e => { const d = Phaser.Math.Distance.Between(e.obj.x, e.obj.y, px, py); return d > 120 && d < 360; });
    const cand = (far.length ? far : alive)
      .map(e => ({ e, n: alive.filter(o => Phaser.Math.Distance.Between(o.obj.x, o.obj.y, e.obj.x, e.obj.y) < R).length }))
      .sort((a, b) => b.n - a.n);
    const out: [number, number][] = [];
    for (const { e } of cand) {
      if (out.length >= n) break;
      if (out.some(([x, y]) => Phaser.Math.Distance.Between(x, y, e.obj.x, e.obj.y) < R)) continue;
      out.push([e.obj.x, e.obj.y]);
    }
    return out;
  }

  private throwBomb(tx: number, ty: number, R: number, dmg: number, evo: boolean) {
    const bomb = this.item('cherrybomb', this.player.x, this.player.y, 44).setDepth(30);
    const top = Math.min(this.player.y, ty) - 110;
    this.tweens.add({ targets: bomb, x: tx, angle: 360, duration: 600 });
    this.tweens.add({ targets: bomb, y: top, duration: 300, ease: 'Quad.Out',
      onComplete: () => this.tweens.add({ targets: bomb, y: ty, duration: 300, ease: 'Quad.In', onComplete: () => {
        bomb.destroy();
        if (this.ended) return;
        sfx.boom();
        this.blast(tx, ty, R, dmg, evo);
        if (!evo) return;
        // はなび: ばくはつが 4つに はじける
        this.cameras.main.shake(100, 0.003);
        for (let i = 0; i < 4; i++) {
          const a = (i + 0.5) * Math.PI / 2;
          this.time.delayedCall(150, () => { if (!this.ended) this.blast(tx + Math.cos(a) * R, ty + Math.sin(a) * R, 70, dmg * 0.5, true); });
        }
      } }) });
  }

  // ブーメラン → たつまき（てきを すいこむ）
  private updateRang(dt: number, now: number) {
    const lv = this.skill.rang, evo = this.evo('rang');
    if (lv && this.cool('rang', dt, evo ? 3 : 1.8)) {
      if (evo) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          this.tornados.push({ obj: this.item('tornado', this.player.x, this.player.y, 110).setDepth(8).setAlpha(0.9), vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 4.5 });
        }
      } else {
        // レベルで: 2・4 は かず +1、3・5 は とおく・おおきく（あたる はばも ひろがる）
        const n = 1 + Math.floor(lv / 2);
        const targets = this.nearestEnemies(n);
        for (let i = 0; i < n; i++) {
          const t = targets[i];
          const a = t ? Math.atan2(t.obj.y - this.player.y, t.obj.x - this.player.x) : Math.random() * Math.PI * 2;
          const big = Math.floor((lv - 1) / 2); // 0〜2
          this.rangs.push({ obj: this.item('rang', this.player.x, this.player.y, 48 + big * 12).setDepth(8), t: 0, ax: Math.cos(a), ay: Math.sin(a),
            dmg: this.atk * 1.2, reach: 300 + big * 50, hitR: 18 + big * 6 });
        }
      }
    }
    // いって かえってくる（とちゅうの敵に 0.4びょうに 1かい。たくさんに あたるぶん 1ぱつは よわい）
    for (const r of this.rangs) {
      r.t += dt;
      const out = r.reach * Math.sin(Math.min(r.t / 1.1, 1) * Math.PI);
      r.obj.setPosition(this.player.x + r.ax * out, this.player.y + r.ay * out).setRotation(r.t * 14);
      for (const e of this.enemies) {
        if (e.dead || now - (e.hitAt.rang ?? -9) < 0.4) continue;
        if (Phaser.Math.Distance.Between(e.obj.x, e.obj.y, r.obj.x, r.obj.y) < e.r + r.hitR) { e.hitAt.rang = now; this.damage(e, r.dmg, 140, r.obj.x, r.obj.y, 'rang'); }
      }
    }
    this.rangs = this.rangs.filter(r => { if (r.t < 1.1) return true; r.obj.destroy(); return false; });
    for (const tw of this.tornados) {
      tw.life -= dt;
      tw.obj.x += tw.vx * dt; tw.obj.y += tw.vy * dt;
      tw.obj.setScale((110 / ICON_PX) * (1 + Math.sin(now * 20) * 0.05));
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = tw.obj.x - e.obj.x, dy = tw.obj.y - e.obj.y, d = Math.hypot(dx, dy) || 1;
        if (d < 200 && !e.boss) { e.obj.x += dx / d * 150 * dt / e.mass; e.obj.y += dy / d * 150 * dt / e.mass; }
        if (d < 60 + e.r && now - (e.hitAt.tornado ?? -9) > 0.4) { e.hitAt.tornado = now; this.damage(e, this.atk, 0, tw.obj.x, tw.obj.y, 'rang'); }
      }
    }
    this.tornados = this.tornados.filter(tw => { if (tw.life > 0) return true; tw.obj.destroy(); return false; });
  }

  // かみなり → らいうん（あたまの上の くもから ふりつづく）
  // こおり → ふぶき（あたった てきが のろくなる）
  private updateFrost(dt: number, now: number) {
    const lv = this.skill.frost, evo = this.evo('frost');
    if (!lv) return;
    if (evo) {
      // ふぶき: まわりが ずっと こおる
      this.frostAura ??= this.item('blizzard', 0, 0, 340).setDepth(6).setAlpha(0.45);
      this.frostAura.setPosition(this.player.x, this.player.y).setRotation(now * 2);
      if (this.cool('blizzard', dt, 0.4)) {
        for (const e of this.enemies) {
          if (!e.dead && Phaser.Math.Distance.Between(e.obj.x, e.obj.y, this.player.x, this.player.y) < 170 + e.r) this.damage(e, this.atk * 0.8, 60, this.player.x, this.player.y, 'frost', 1.2);
        }
      }
    }
    if (!this.cool('frost', dt, Math.max(0.9, 1.5 - lv * 0.1))) return;
    const targets = this.nearestEnemies(1);
    if (!targets.length) return;
    const base = Math.atan2(targets[0].obj.y - this.player.y, targets[0].obj.x - this.player.x);
    const n = 2 + Math.floor(lv / 2);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.28;
      const obj = this.item('shard', this.player.x, this.player.y, 38).setDepth(8).setRotation(a + Math.PI / 4);
      this.bullets.push({ obj, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 0.9, dmg: this.atk * 0.9, pierce: 1, hit: new Set(), src: 'frost', slow: 1.8 + lv * 0.3 });
    }
  }

  // つるぎ → にとうりゅう（すすむ ほうを きる。ちかくて あぶないぶん、1たいに いちばん つよい）
  private updateSword(dt: number, _now: number) {
    const lv = this.skill.sword, evo = this.evo('sword');
    if (!lv) return;
    if (Math.hypot(this.stick.dx, this.stick.dy) > 0.2) this.swordDir = Math.atan2(this.stick.dy, this.stick.dx);
    if (!this.cool('sword', dt, evo ? 0.7 : Math.max(0.8, 1.3 - lv * 0.1))) return;
    const R = (evo ? 170 : 110) + lv * 10, half = evo ? Math.PI : 1.1;
    // とどく ところに 敵が いれば そちらを きる（いなければ すすむ ほう）
    const t = this.nearestEnemies(1)[0];
    const aim = t && Phaser.Math.Distance.Between(t.obj.x, t.obj.y, this.player.x, this.player.y) < R + t.r + 30
      ? Math.atan2(t.obj.y - this.player.y, t.obj.x - this.player.x) : this.swordDir;
    const dirs = evo ? [aim, aim + Math.PI] : [aim];
    for (const dir of dirs) {
      const fx = this.item('slash', this.player.x + Math.cos(dir) * R * 0.5, this.player.y + Math.sin(dir) * R * 0.5, R * 1.3)
        .setDepth(12).setRotation(dir + Math.PI * 0.75).setAlpha(0.95);
      this.tweens.add({ targets: fx, alpha: 0, scale: fx.scale * 1.2, duration: 220, onComplete: () => fx.destroy() });
    }
    sfx.shoot();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.obj.x - this.player.x, dy = e.obj.y - this.player.y;
      if (Math.hypot(dx, dy) > R + e.r) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - aim));
      if (evo || diff < half) this.damage(e, this.atk * (evo ? 5 : 4), 420, this.player.x, this.player.y, 'sword');
    }
  }

  private updateThunder(dt: number, _now: number) {
    const lv = this.skill.thunder, evo = this.evo('thunder');
    if (!lv) return;
    if (evo) {
      this.cloud ??= this.item('storm', 0, 0, 100).setDepth(20).setAlpha(0.95);
      this.cloud.setPosition(this.player.x, this.player.y - 110);
    }
    if (!this.cool('thunder', dt, evo ? 0.7 : Math.max(1, 1.6 - lv * 0.12))) return;
    const near = this.nearestEnemies(evo ? 4 : 1).filter(e => this.onScreen(e));
    if (!near.length) return;
    sfx.zap();
    const used = new Set<Enemy>();
    const hits = evo ? 10 : [3, 4, 5, 6, 8][lv - 1];
    for (let c = 0; c < (evo ? 2 : 1); c++) {
      const first = near.find(e => !used.has(e));
      if (first) this.chain(first, hits, this.atk * (evo ? 2.5 : 2.3), used, evo);
    }
  }

  // つながる かみなり: あたった 敵から、まだ あたっていない いちばん ちかい 敵（200px まで）へ とぶ。あたると しびれる
  private chain(first: Enemy, hits: number, dmg: number, used: Set<Enemy>, evo: boolean) {
    const g = this.add.graphics().setDepth(160).lineStyle(evo ? 9 : 7, 0xfde047);
    // さいしょは そらから（らいうんは くもから）
    let sx = evo ? this.player.x : first.obj.x, sy = evo ? this.player.y - 110 : first.obj.y - 500;
    let cur: Enemy | undefined = first;
    for (let i = 0; i < hits && cur; i++) {
      const x = cur.obj.x, y = cur.obj.y;
      g.beginPath().moveTo(sx, sy);
      for (let k = 1; k <= 5; k++) {
        const j = k < 5 ? 30 : 0;
        g.lineTo(sx + (x - sx) * k / 5 + (Math.random() - 0.5) * j, sy + (y - sy) * k / 5 + (Math.random() - 0.5) * j);
      }
      g.strokePath();
      this.ring(x, y, 40, 0xfde047, 5);
      used.add(cur);
      if (!cur.boss) cur.stunUntil = this.t + 0.5;
      this.damage(cur, dmg, 60, sx, sy, 'thunder');
      sx = x; sy = y;
      let next: Enemy | undefined, best = 200;
      for (const e of this.enemies) {
        if (e.dead || used.has(e)) continue;
        const d = Phaser.Math.Distance.Between(e.obj.x, e.obj.y, x, y) - e.r;
        if (d < best) { best = d; next = e; }
      }
      cur = next;
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  // ---------------- ダメージ・たおす ----------------

  private damage(e: Enemy, dmg: number, knock: number, fx: number, fy: number, src: WeaponId | 'item', slow = 0) {
    if (e.dead || e.faded) return; // すきとおっている あいだは きかない
    // わかれた ばかりの 子は すこし きかない（はんいの 1ぱつで 親と 子を まとめて たおさない）
    if (e.mini && this.t - e.bornAt < 0.25) return;
    if (slow) { e.slowUntil = this.t + slow; e.obj.setTint(0x93c5fd); }
    this.dealt[src] = (this.dealt[src] ?? 0) + Math.min(dmg, e.hp);
    e.hp -= dmg;
    if (knock) this.push(e, fx, fy, knock, 9999);
    // 当たったら 白く光る。つづけて当たっても 光りっぱなしに ならないように、ちかちかさせる
    if (this.time.now - e.flashAt > 140) {
      e.flashAt = this.time.now;
      e.obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(60, () => {
        if (!e.obj.active) return;
        e.obj.clearTint();
        if (e.elite) e.obj.setTint(0xffe08a);
        if (this.t < e.slowUntil) e.obj.setTint(0x93c5fd);
      });
    }
    sfx.hit(Math.min(20, this.kills % 20));
    if (e.hp > 0) return;
    this.kill(e);
  }

  private kill(e: Enemy, drop = true) {
    e.dead = true;
    this.kills++;
    this.killsByKind[e.kind] = (this.killsByKind[e.kind] ?? 0) + 1;
    const { x, y } = e.obj;
    if (drop) {
      const xp = ROLES[e.role].xp * (e.elite ? 6 : 1);
      if (e.elite) this.addPickup('chest', x, y);
      if (!e.boss) this.addGem(x, y, e.mini ? 1 : xp);
      // ⭐メダル（プレイの中だけの お金。おみせで つかう）
      const medal = e.elite ? 8 : e.mini ? 0 : e.role === 'tank' ? 2 : Math.random() < MEDAL_CHANCE[e.role] ? 1 : 0;
      for (let i = 0; i < medal; i++) this.addGem(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 50, 1, true);
    }
    // やられたら、くるっと回って小さくなって消える
    e.shadow.destroy();
    const dead = e.obj;
    this.tweens.add({ targets: dead, scale: 0, angle: 180, alpha: 0, duration: 250, onComplete: () => dead.destroy() });
    if (e.role === 'tank' || e.elite) {
      this.burst(x, y, 8, 90, 34);
      this.hitstop(50);
      this.cameras.main.shake(120, 0.006);
      sfx.boom();
    } else if (Math.random() < 0.35) {
      this.burst(x, y, 2, 40, 18);
    }
    // わかれる敵: ちいさい 2ひきに なる
    if (e.trait === 'split' && drop) for (const sx of [-18, 18]) this.addEnemy(e.role, { x: x + sx, y, mini: true });
    if (this.kills % 100 === 0) { this.banner(`${this.kills}たい！`, '#16a34a', 48); sfx.up(); }
    if (e.boss) this.bossDown(e);
  }

  private remove(e: Enemy) {
    e.dead = true;
    e.shadow.destroy();
    e.obj.destroy();
  }

  private bossDown(e: Enemy) {
    this.bossDefeated = true;
    this.winning = true;
    this.hitstop(250);
    this.flash(0xffffff, 0.9);
    this.cameras.main.shake(700, 0.02);
    sfx.boom();
    this.burst(e.obj.x, e.obj.y, 20, 260, 60);
    this.burst(e.obj.x, e.obj.y, 12, 220, 50, { sheet: 'items', frame: 'medal' });
    this.banner('ボスを たおした！', '#dc2626', 60);
    // のこりの敵も ぜんぶ はじける
    this.enemies.filter(x => !x.dead).forEach((x, i) => this.time.delayedCall(20 * i, () => { if (!x.dead) this.kill(x, false); }));
    this.shots.forEach(s => (s.life = 0));
    this.time.delayedCall(1800, () => this.finish(true));
  }

  // ---------------- ジェム・アイテム ----------------

  private addGem(x: number, y: number, value: number, medal = false) {
    if (medal) {
      const obj = this.item('medal', x, y, 30).setDepth(4);
      this.tweens.add({ targets: obj, y: y - 14, duration: 180, yoyo: true, ease: 'Quad.Out' });
      this.gems.push({ obj, value, pulled: false, medal: true });
      return;
    }
    // ジェムが多すぎるときは、ちかくの ジェムに まとめる
    if (this.gems.length > 220) {
      const g = this.gems.find(x => !x.medal) ?? this.gems[0];
      g.value += value;
      return;
    }
    const obj = value >= 5 ? this.item('biggem', x, y, 34).setDepth(4) : this.icon('gem', x, y, 26).setDepth(4);
    this.gems.push({ obj, value, pulled: false, medal: false });
  }

  private updateGems(dt: number) {
    const range = this.magnetRange;
    for (const g of this.gems) {
      const dx = this.player.x - g.obj.x, dy = this.player.y - g.obj.y, d = Math.hypot(dx, dy) || 1;
      if (d < range) g.pulled = true;
      if (g.pulled) { const sp = 520 * dt; g.obj.x += dx / d * Math.min(sp, d); g.obj.y += dy / d * Math.min(sp, d); }
      if (d < 26) {
        if (g.medal) {
          this.medals += g.value; this.medalsTotal += g.value; g.value = 0;
          sfx.pop(1.5);
          continue;
        }
        this.xp += g.value; g.value = 0;
        // つづけて ひろうと 音が上がっていく
        this.gemStreak = this.t - this.gemStreakAt < 0.4 ? this.gemStreak + 1 : 0;
        this.gemStreakAt = this.t;
        sfx.gem(this.gemStreak);
      }
    }
    this.gems = this.gems.filter(g => { if (g.value > 0) return true; g.obj.destroy(); return false; });
  }

  private updatePickups(now: number) {
    const got = this.pickups.filter(p => Phaser.Math.Distance.Between(p.obj.x, p.obj.y, this.player.x, this.player.y) < 50);
    if (!got.length) return;
    this.pickups = this.pickups.filter(p => !got.includes(p));
    for (const p of got) { p.obj.destroy(); p.ring.destroy(); this.usePickup(p.kind, now); }
  }

  private usePickup(kind: PickupKind, now: number) {
    if (kind === 'meat') {
      this.hp = Math.min(this.maxHp, this.hp + 2);
      this.popText(this.player.x, this.player.y - 60, '+2', '#ef4444', 32);
      sfx.up();
    }
    if (kind === 'vacuum') {
      this.gems.forEach(g => (g.pulled = true));
      this.ring(this.player.x, this.player.y, 400, 0x60a5fa, 12);
      this.banner('ぜんぶ あつめる！', '#2563eb', 44);
      sfx.up();
    }
    if (kind === 'bomb') {
      this.flash(0xffffff, 0.85);
      this.cameras.main.shake(400, 0.015);
      this.hitstop(120);
      sfx.boom();
      for (const e of this.enemies) {
        if (e.dead || !this.onScreen(e)) continue;
        if (e.boss) this.damage(e, e.maxHp * 0.15, 0, this.player.x, this.player.y, 'item');
        else { this.burst(e.obj.x, e.obj.y, 1, 40, 22); this.kill(e); }
      }
    }
    if (kind === 'chest') void this.openChest();

  }

  // たからばこ: ゆれて → ひかって → 中身（しんか / レベルアップ）
  private async openChest() {
    this.paused = true;
    this.stick = { ...NO_STICK };
    const w = this.scale.width, hh = this.scale.height;
    const layer: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => { o.setScrollFactor(0).setDepth(400); layer.push(o); return o; };
    add(this.add.rectangle(0, 0, w, hh, 0x1e1b4b, 0.7).setOrigin(0));
    const chest = add(this.item('chest', w / 2, hh / 2, 150));
    const wait = (ms: number) => new Promise<void>(r => this.time.delayedCall(ms, r));
    sfx.warn();
    await new Promise<void>(r => this.tweens.add({ targets: chest, angle: { from: -12, to: 12 }, duration: 90, yoyo: true, repeat: 5, onComplete: () => r() }));
    chest.setAngle(0);
    this.flash(0xfffbeb, 0.9);
    const res = chestReward(this.skill, this.evolved, this.cfg.loadout);
    const rays = add(this.add.star(w / 2, hh / 2, 12, 60, 220, 0xfde68a, 0.6));
    this.tweens.add({ targets: rays, angle: 360, duration: 4000, repeat: -1 });
    chest.destroy();
    if ('evolve' in res) {
      const id = res.evolve, s = SKILLS[id];
      this.evolved.push(id);
      sfx.evolve();
      const from = add(this.art(s.art, w / 2, hh / 2, 110));
      await wait(500);
      this.tweens.add({ targets: from, scale: 0, angle: 360, duration: 300 });
      await wait(300);
      const to = add(this.art(s.evo!.art, w / 2, hh / 2, 20));
      this.tweens.add({ targets: to, scale: 160 / ICON_PX, duration: 400, ease: 'Back.Out' });
      add(this.add.text(w / 2, hh / 2 - 140, 'しんか！', style(56, '#f59e0b')).setOrigin(0.5));
      add(this.add.text(w / 2, hh / 2 + 120, s.evo!.name, style(40, '#7c3aed')).setOrigin(0.5));
      add(this.add.text(w / 2, hh / 2 + 165, s.evo!.desc, style(22)).setOrigin(0.5));
      if (id === 'orbit') { this.orbits.forEach(o => o.destroy()); this.orbits = []; }
    } else if ('levelUp' in res) {
      sfx.chest();
      res.levelUp.forEach((id, i) => {
        this.applySkill(id);
        const x = w / 2 + (i - (res.levelUp.length - 1) / 2) * 140;
        const a = add(this.art(SKILLS[id].art, x, hh / 2, 20));
        this.tweens.add({ targets: a, scale: 96 / ICON_PX, delay: i * 150, duration: 300, ease: 'Back.Out' });
        add(this.add.text(x, hh / 2 + 70, `Lv${this.skill[id]}`, style(26, '#16a34a')).setOrigin(0.5));
      });
      add(this.add.text(w / 2, hh / 2 - 120, 'パワーアップ！', style(48, '#f59e0b')).setOrigin(0.5));
    } else {
      this.hp = this.maxHp;
      sfx.chest();
      add(this.item('meat', w / 2, hh / 2, 120));
      add(this.add.text(w / 2, hh / 2 - 120, 'げんき いっぱい！', style(48, '#ef4444')).setOrigin(0.5));
    }
    this.burst(this.player.x, this.player.y, 12, 200, 40);
    await wait(1700);
    layer.forEach(o => o.destroy());
    this.refreshSkills();
    this.paused = false;
  }

  // ---------------- レベルアップ ----------------

  private applySkill(id: SkillId) {
    this.skill[id] = Math.min(SKILLS[id].max, this.skill[id] + 1);
    if (id === 'heart') { this.maxHp += 1; this.hp = this.maxHp; }
  }

  private async levelUp() {
    this.paused = true;
    this.xp -= this.xpToNext;
    this.level++;
    this.stick = { ...NO_STICK };
    this.drawStick();
    this.refreshHud();
    sfx.up();
    // まわりを ふきとばして ひといき つけるようにする
    this.ring(this.player.x, this.player.y, 220, 0xfde047, 12);
    for (const e of this.enemies) this.push(e, this.player.x, this.player.y, 700, 220);
    const pick = await this.cfg.onLevelUp(this.level, { ...this.skill }, [...this.evolved], this.reroll);
    if (pick) this.applySkill(pick);
    this.refreshSkills();
    this.paused = false;
  }

  // えらびなおし（のこりの数は 1回のプレイで きょうつう）
  private reroll: Reroll = { left: () => this.rerolls, use: () => (this.rerolls > 0 ? (this.rerolls--, true) : false) };

  // おみせ: ⭐メダルで スキル・おにく・たからばこを かう。たからばこは おみせを とじてから あける
  private async openShop() {
    if (this.ended) return;
    this.paused = true;
    this.stick = { ...NO_STICK };
    this.drawStick();
    sfx.chest();
    let offers: (ShopItem & { sold?: boolean })[] = shopOffers(this.skill, this.cfg.loadout);
    const api: ShopApi = {
      medals: () => this.medals,
      offers: () => offers,
      levels: () => ({ ...this.skill }),
      reroll: { left: this.reroll.left, use: () => { if (!this.reroll.use()) return false; offers = shopOffers(this.skill, this.cfg.loadout); return true; } },
      buy: i => {
        const o = offers[i];
        if (!o || o.sold || this.medals < o.price) return false;
        if (o.kind === 'skill' && this.skill[o.id] >= SKILLS[o.id].max) return false;
        this.medals -= o.price;
        o.sold = true;
        if (o.kind === 'skill') this.applySkill(o.id);
        if (o.kind === 'heal') this.hp = Math.min(this.maxHp, this.hp + 3);
        if (o.kind === 'chest') this.chestQueue++;
        this.refreshHud();
        return true;
      },
    };
    await this.cfg.onShop(api);
    this.refreshSkills();
    while (this.chestQueue > 0) { this.chestQueue--; await this.openChest(); }
    this.paused = false;
  }

  quit() { this.finish(false); }

  private finish(cleared: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.refreshHud();
    if (cleared) sfx.fanfare();
    this.cfg.onEnd({
      seconds: Math.floor(this.t), kills: this.kills, cleared, level: this.level,
      bossDefeated: this.bossDefeated, hp: Math.max(0, this.hp), maxHp: this.maxHp,
      killsByKind: this.killsByKind, evolved: [...this.evolved],
      medals: this.medalsTotal,
    });
  }
}

// せまい 画面（タブレットなど）は すこし ひいて うつす: みじかい ほうの 辺で VIEW_MIN px ぶんは 見える。ちいさく しすぎない
export const VIEW_MIN = 900;
export const ZOOM_MIN = 0.72;
export const viewZoom = (w: number, h: number) => Math.min(1, Math.max(ZOOM_MIN, Math.min(w, h) / VIEW_MIN));

export function startBattle(parent: HTMLElement, cfg: BattleConfig): Phaser.Game {
  const w = parent.clientWidth, h = parent.clientHeight, z = viewZoom(w, h);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: WORLDS[stageSpec(cfg.stage).world].bg,
    scale: { mode: Phaser.Scale.NONE, width: w / z, height: h / z, zoom: z },
    input: { activePointers: 3 },
    banner: false,
  });
  // 画面の大きさが かわったら（タブレットを たてにした など）、ひきかたも かえる
  const fit = () => {
    const w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    const z = viewZoom(w, h);
    game.scale.zoom = z;
    game.scale.resize(w / z, h / z);
    game.canvas.style.width = `${w}px`; game.canvas.style.height = `${h}px`;
  };
  const ro = new ResizeObserver(fit);
  game.events.once(Phaser.Core.Events.READY, () => { fit(); ro.observe(parent); });
  game.events.once(Phaser.Core.Events.DESTROY, () => ro.disconnect());
  game.scene.add('battle', BattleScene, true, cfg);
  return game;
}

