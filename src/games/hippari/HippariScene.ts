import Phaser from 'phaser';
import { assetUrl } from '../../assets/sprite';
import { loadSheet } from '../kit/phaser';
import { IMAGES, SHEETS } from './assets.gen';
import { HSKILLS, noSkills, type HSkillId } from './skills';
import { stageSpec, type EnemySpec, type StageSpec } from './stages';

// ひっぱりアタック: 主人公のたまを ひっぱって はなし、はねかえりながら敵にぶつける
// たまが止まるたびに敵のカウントがへり、0になった敵がこうげきしてくる

export type CharaId = keyof typeof SHEETS.chars.frames;
type IconName = keyof typeof SHEETS.icons.frames;

export interface HippariConfig {
  chara: CharaId;      // このゲームのキャラ（子どものアバターとは別。タイトル画面でえらぶ）
  easy: boolean;       // 年長さん向け: ハートが多く、敵のこうげきがおそい、ねらいの線が長い
  stage: number;
  upgrades: { hp: number; atk: number; speed: number; heal: number };
  onWaveClear: (levels: Record<HSkillId, number>) => Promise<HSkillId | null>;
  onEnd: (r: HippariResult) => void;
}

export interface HippariResult { cleared: boolean; shots: number; bestCombo: number; wave: number; waves: number }

interface Enemy {
  spec: EnemySpec; obj: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Text;
  hp: number; r: number; turns: number; base: number; phase: number;
}
interface Ball {
  x: number; y: number; vx: number; vy: number; r: number; main: boolean;
  obj: Phaser.GameObjects.Image; face?: Phaser.GameObjects.Image;
  wallHits: number; hitAt: Map<Enemy, number>; boomAt: number;
}

export const W = 720, H = 1080;
const BALL_R = 46, MINI_R = 26;
const MAX_PULL = 220, MIN_PULL = 28;
const ICON_PX = SHEETS.icons.cell, CHARA_PX = SHEETS.chars.cell, ENEMY_PX = SHEETS.enemies.cell;
const STOP_SPEED = 30;
const WALL = 30;  // 床の絵のふち（ここで はねかえる）

type Phase = 'aim' | 'shot' | 'busy' | 'end';

export class HippariScene extends Phaser.Scene {
  private cfg!: HippariConfig;
  private spec!: StageSpec;
  private phase: Phase = 'busy';
  private hero!: Ball;
  private balls: Ball[] = [];
  private enemies: Enemy[] = [];
  private skill = noSkills();
  private hp = 0; private maxHp = 0;
  private wave = 0; private shots = 0; private combo = 0; private bestCombo = 0;
  private shotTime = 0; private t = 0;
  private drag: { id: number; x: number; y: number; px: number; py: number } | null = null;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private hud!: { hearts: Phaser.GameObjects.Image[]; wave: Phaser.GameObjects.Text; combo: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text; hand: Phaser.GameObjects.Image };

  constructor() { super('hippari'); }

  init(cfg: HippariConfig) {
    this.cfg = cfg;
    this.spec = stageSpec(cfg.stage, cfg.easy);
    this.maxHp = this.hp = 5 + cfg.upgrades.hp + (cfg.easy ? 3 : 0);
  }

  private get atk() { return (1 + 0.25 * this.cfg.upgrades.atk) * (1 + 0.3 * this.skill.power); }
  private get launchSpeed() { return 1900 * (1 + 0.06 * this.cfg.upgrades.speed); }

  preload() {
    this.load.image('field', assetUrl(IMAGES.field));
    loadSheet(this, 'chars', SHEETS.chars);
    loadSheet(this, 'enemies', SHEETS.enemies);
    loadSheet(this, 'icons', SHEETS.icons);
  }

  private icon(name: IconName, x: number, y: number, size: number) {
    return this.add.image(x, y, 'icons', SHEETS.icons.frames[name]).setScale(size / ICON_PX);
  }

  private text(x: number, y: number, size: number, color = '#1f2937') {
    return this.add.text(x, y, '', {
      fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: `${size}px`, fontStyle: 'bold',
      color, stroke: '#ffffff', strokeThickness: Math.round(size / 5),
    }).setOrigin(0.5).setDepth(100);
  }

  create() {
    this.add.image(0, 0, 'field').setOrigin(0).setDisplaySize(W, H);

    const g = this.make.graphics({}, false);
    g.fillStyle(0x000000, 0.28).fillEllipse(32, 12, 64, 24);
    g.generateTexture('shadow', 64, 24);
    g.clear().fillStyle(0xffffff).fillCircle(64, 64, 62).lineStyle(6, 0x2563eb).strokeCircle(64, 64, 58);
    g.generateTexture('ball', 128, 128);
    g.destroy();

    this.hero = this.makeBall(W / 2, H - 170, BALL_R, true);
    this.aimGfx = this.add.graphics().setDepth(20);

    this.hud = {
      hearts: [],
      wave: this.text(W - 90, 44, 30),
      combo: this.text(W / 2, H * 0.62, 56, '#dc2626').setAlpha(0),
      hint: this.text(W / 2, H - 60, 30).setText('ひっぱって はなそう！'),
      // 字が読めなくてもわかるように、ひっぱる手の動きを見せる
      hand: this.icon('hand', W / 2 + 30, H - 150, 80).setDepth(30).setAngle(180),
    };
    this.tweens.add({ targets: this.hud.hand, y: '+=110', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.text(W / 2, 44, 30).setText(`ステージ ${this.cfg.stage}`);
    this.refreshHud();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'aim' || this.drag) return;
      this.drag = { id: p.id, x: p.worldX, y: p.worldY, px: 0, py: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || p.id !== this.drag.id) return;
      this.drag.px = this.drag.x - p.worldX;
      this.drag.py = this.drag.y - p.worldY;
      this.drawAim();
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!this.drag || p.id !== this.drag.id) return;
      const { px, py } = this.drag;
      this.drag = null;
      this.aimGfx.clear();
      if (this.phase === 'aim' && Math.hypot(px, py) >= MIN_PULL) this.launch(px, py);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    void this.startWave();
  }

  private makeBall(x: number, y: number, r: number, main: boolean): Ball {
    const obj = this.add.image(x, y, 'ball').setScale((r * 2) / 128).setDepth(10);
    const ball: Ball = { x, y, vx: 0, vy: 0, r, main, obj, wallHits: 0, hitAt: new Map(), boomAt: 0 };
    // キャラは まるい絵なので、そのまま たまにする（下の白いまるは ふちどり）
    if (main) ball.face = this.add.image(x, y, 'chars', SHEETS.chars.frames[this.cfg.chara]).setScale((r * 2.3) / CHARA_PX).setDepth(11);
    else obj.setTint(0xfde68a);
    return ball;
  }

  private refreshHud() {
    while (this.hud.hearts.length < this.maxHp) {
      const i = this.hud.hearts.length;
      // 1れつ 7こまで（まん中の「ステージ」に重ならないように）
      this.hud.hearts.push(this.icon('heart', 30 + (i % 7) * 30, 28 + Math.floor(i / 7) * 30, 30).setDepth(100));
    }
    this.hud.hearts.forEach((h, i) => (i < this.hp ? h.clearTint().setAlpha(1) : h.setTint(0x6b7280).setAlpha(0.45)));
    this.hud.wave.setText(`なみ ${Math.min(this.wave + 1, this.spec.waves.length)}/${this.spec.waves.length}`);
  }

  // ねらいの線: たまから、ひっぱった反対むきに点をならべる
  private drawAim() {
    const d = this.drag;
    this.aimGfx.clear();
    if (!d) return;
    const len = Math.hypot(d.px, d.py);
    if (len < MIN_PULL) return;
    const k = Math.min(len, MAX_PULL) / MAX_PULL;
    const ux = d.px / len, uy = d.py / len;
    const { x, y } = this.hero;
    // ゴムひも
    this.aimGfx.lineStyle(8, 0x7c3aed, 0.7).lineBetween(x, y, x - ux * k * 120, y - uy * k * 120);
    // ねらい
    const reach = (this.cfg.easy ? 520 : 320) * (0.4 + 0.6 * k);
    for (let s = BALL_R + 20; s < reach; s += 34) {
      const px = x + ux * s, py = y + uy * s;
      if (px < WALL || px > W - WALL || py < WALL || py > H - WALL) break;
      this.aimGfx.fillStyle(0xffffff, 0.9).fillCircle(px, py, 8).lineStyle(3, 0x7c3aed).strokeCircle(px, py, 8);
    }
  }

  private launch(px: number, py: number) {
    const len = Math.hypot(px, py), k = Math.min(len, MAX_PULL) / MAX_PULL;
    const speed = this.launchSpeed * (0.35 + 0.65 * k);
    const a = Math.atan2(py, px);
    this.phase = 'shot';
    this.shots++;
    this.combo = 0;
    this.shotTime = 0;
    this.hud.hint.setVisible(false);
    this.hud.hand.setVisible(false);
    const h = this.hero;
    Object.assign(h, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, wallHits: 0, boomAt: 0 });
    h.hitAt.clear();
    this.balls = [h];
    // ぶんしん: 少しずらした向きに小さいたまを出す
    for (let i = 1; i <= this.skill.split; i++) {
      const da = (Math.ceil(i / 2) * 0.22) * (i % 2 ? 1 : -1);
      const m = this.makeBall(h.x, h.y, MINI_R, false);
      m.vx = Math.cos(a + da) * speed * 0.85; m.vy = Math.sin(a + da) * speed * 0.85;
      this.balls.push(m);
    }
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.t += dt;
    // 敵をぷよぷよ動かす
    for (const e of this.enemies) {
      const w = Math.sin(this.t * 5 + e.phase) * 0.05;
      e.obj.setScale(e.base * (1 - w), e.base * (1 + w));
    }
    if (this.phase !== 'shot') return;
    this.shotTime += dt;
    for (const b of this.balls) this.moveBall(b, dt);
    const moving = this.balls.some(b => Math.hypot(b.vx, b.vy) > STOP_SPEED);
    if (!moving || this.shotTime > 8) void this.endShot();
  }

  private moveBall(b: Ball, dt: number) {
    let sp = Math.hypot(b.vx, b.vy);
    if (sp <= STOP_SPEED) return;
    // まさつ: はやいときほど強く、さいごはすっと止まる（目いっぱい ひっぱると 約4びょう・画面2つぶん すすむ）
    const next = Math.max(0, sp - (0.6 * sp + 90) * dt);
    b.vx *= next / sp; b.vy *= next / sp; sp = next;
    // すりぬけないように、細かく分けて動かす
    const steps = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.5)));
    for (let i = 0; i < steps; i++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      this.bounceWalls(b);
      for (const e of [...this.enemies]) this.collide(b, e);
    }
    b.obj.setPosition(b.x, b.y);
    // ころがっているように、すこし回す
    b.face?.setPosition(b.x, b.y).setRotation(b.face.rotation + (b.vx / b.r) * dt * 0.15);
  }

  private bounceWalls(b: Ball) {
    let hit = false;
    const lo = WALL + b.r;
    if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx); hit = true; }
    if (b.x > W - lo) { b.x = W - lo; b.vx = -Math.abs(b.vx); hit = true; }
    if (b.y < lo) { b.y = lo; b.vy = Math.abs(b.vy); hit = true; }
    if (b.y > H - lo) { b.y = H - lo; b.vy = -Math.abs(b.vy); hit = true; }
    if (hit) b.wallHits++;
  }

  private collide(b: Ball, e: Enemy) {
    const dx = b.x - e.obj.x, dy = b.y - e.obj.y, d = Math.hypot(dx, dy) || 1;
    if (d >= b.r + e.r) return;
    const nx = dx / d, ny = dy / d;
    if (!this.skill.pierce) {
      // はねかえる
      b.x = e.obj.x + nx * (b.r + e.r);
      b.y = e.obj.y + ny * (b.r + e.r);
      const dot = b.vx * nx + b.vy * ny;
      if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
    }
    // 同じ敵には少し間をあけて当たる（つらぬくときに何回も当たらないように）
    const last = b.hitAt.get(e) ?? -1;
    if (this.shotTime - last < (this.skill.pierce ? 0.35 : 0.12)) return;
    b.hitAt.set(e, this.shotTime);
    const dmg = this.atk * (1 + 0.25 * this.skill.wall * b.wallHits) * (b.main ? 1 : 0.5);
    this.damage(e, dmg);
    if (b.main && this.skill.boom && this.shotTime - b.boomAt > 0.35) {
      b.boomAt = this.shotTime;
      this.explode(e.obj.x, e.obj.y, 110 + 25 * this.skill.boom, this.atk * 0.4 * this.skill.boom, e);
    }
  }

  private explode(x: number, y: number, R: number, dmg: number, skip: Enemy) {
    const burst = this.icon('bomb', x, y, 60).setDepth(15);
    const ring = this.add.circle(x, y, R, 0xf97316, 0.3).setDepth(14);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.15, duration: 350, onComplete: () => ring.destroy() });
    this.tweens.add({ targets: burst, alpha: 0, scale: '*=2', duration: 350, onComplete: () => burst.destroy() });
    for (const e of [...this.enemies]) {
      if (e !== skip && Phaser.Math.Distance.Between(x, y, e.obj.x, e.obj.y) < R + e.r) this.damage(e, dmg);
    }
  }

  private damage(e: Enemy, dmg: number) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (this.combo >= 2) {
      this.hud.combo.setText(`${this.combo} ヒット！`).setAlpha(1).setScale(1.25);
      this.tweens.add({ targets: this.hud.combo, scale: 1, duration: 120 });
    }
    e.obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(70, () => e.obj.active && e.obj.clearTint());
    const s = this.icon('spark', e.obj.x, e.obj.y - e.r, 34).setDepth(16);
    this.tweens.add({ targets: s, y: s.y - 30, alpha: 0, duration: 300, onComplete: () => s.destroy() });
    this.drawEnemyUi(e);
    if (e.hp > 0) return;
    this.enemies = this.enemies.filter(x => x !== e);
    e.shadow.destroy(); e.bar.destroy(); e.badge.destroy();
    const dead = e.obj;
    this.tweens.add({ targets: dead, scale: 0, angle: 180, alpha: 0, duration: 260, onComplete: () => dead.destroy() });
  }

  private drawEnemyUi(e: Enemy) {
    const w = e.spec.size * 0.8, x = e.obj.x - w / 2, y = e.obj.y + e.r + 6;
    e.bar.clear().fillStyle(0x1f2937, 0.6).fillRoundedRect(x, y, w, 12, 5)
      .fillStyle(0xef4444).fillRoundedRect(x, y, w * Math.max(0, e.hp / (e.spec.hp)), 12, 5);
    e.badge.setText(String(e.turns)).setColor(e.turns <= 1 ? '#dc2626' : '#1f2937');
  }

  private async startWave() {
    this.phase = 'busy';
    this.refreshHud();
    const waves = this.spec.waves.length;
    const title = this.text(W / 2, H * 0.45, 64).setText(this.wave === waves - 1 ? 'さいごの なみ！' : `なみ ${this.wave + 1}`);
    this.spec.waves[this.wave].forEach((s, i) => {
      const obj = this.add.image(s.x * W, s.y * H, 'enemies', SHEETS.enemies.frames[s.kind]).setDepth(5).setAlpha(0);
      const base = s.size / ENEMY_PX;
      const r = s.size * 0.4;
      const shadow = this.add.image(obj.x, obj.y + r, 'shadow').setDepth(3).setScale(s.size / 64);
      const e: Enemy = {
        spec: s, obj, shadow, hp: s.hp, r, base, phase: i * 1.7,
        // はじめは少しずつずらす（いっせいに こうげきしないように）
        turns: s.turns + (i % 2),
        bar: this.add.graphics().setDepth(6),
        badge: this.text(obj.x + r * 0.9, obj.y - r * 0.9, 34),
      };
      this.drawEnemyUi(e);
      this.tweens.add({ targets: obj, alpha: 1, duration: 300, delay: i * 80 });
      this.enemies.push(e);
    });
    await this.wait(900);
    title.destroy();
    if (this.ended) return;
    this.phase = 'aim';
  }

  private async endShot() {
    this.phase = 'busy';
    for (const b of this.balls) if (!b.main) b.obj.destroy();
    this.balls = [this.hero];
    this.hero.vx = this.hero.vy = 0;
    this.tweens.add({ targets: this.hud.combo, alpha: 0, duration: 400, delay: 300 });

    if (!this.enemies.length) return this.waveClear();
    await this.enemyTurn();
    if (this.ended) return;
    if (this.hp <= 0) return this.finish(false);
    this.phase = 'aim';
  }

  // 敵の番: カウントを1へらし、0になった敵がとびかかってくる
  private async enemyTurn() {
    for (const e of this.enemies) { e.turns--; this.drawEnemyUi(e); }
    for (const e of this.enemies.filter(x => x.turns <= 0)) {
      const { x, y } = e.obj, h = this.hero;
      const tx = x + (h.x - x) * 0.7, ty = y + (h.y - y) * 0.7;
      e.badge.setVisible(false);
      await this.tween({ targets: [e.obj, e.shadow], x: tx, y: `+=${ty - y}`, duration: 220, ease: 'Quad.easeIn' });
      this.hp = Math.max(0, this.hp - e.spec.atk);
      this.cameras.main.shake(180, 0.01);
      h.face?.setTint(0xef4444);
      this.time.delayedCall(250, () => h.face?.clearTint());
      this.refreshHud();
      await this.tween({ targets: [e.obj, e.shadow], x, y: `-=${ty - y}`, duration: 260, ease: 'Quad.easeOut' });
      e.turns = e.spec.turns;
      e.badge.setVisible(true);
      this.drawEnemyUi(e);
      if (this.hp <= 0 || this.ended) return;
    }
  }

  private async waveClear() {
    this.wave++;
    if (this.wave >= this.spec.waves.length) return this.finish(true);
    // ずっと残る強化「かいふく」: 波をたおすたびにハートがもどる
    const heal = Math.ceil(this.cfg.upgrades.heal / 2);
    if (heal) { this.hp = Math.min(this.maxHp, this.hp + heal); this.refreshHud(); }
    await this.wait(500);
    if (this.ended) return;
    const pick = await this.cfg.onWaveClear({ ...this.skill });
    if (pick) {
      this.skill[pick] = Math.min(HSKILLS[pick].max, this.skill[pick] + 1);
      if (pick === 'heal') { this.maxHp++; this.hp = this.maxHp; }
    }
    await this.startWave();
  }

  private wait(ms: number) { return new Promise<void>(r => this.time.delayedCall(ms, r)); }
  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig) {
    return new Promise<void>(r => this.tweens.add({ ...cfg, onComplete: () => r() }));
  }

  private get ended() { return this.phase === 'end'; }

  quit() { this.finish(false); }

  private finish(cleared: boolean) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.drag = null;
    this.aimGfx.clear();
    this.refreshHud();
    this.cfg.onEnd({ cleared, shots: this.shots, bestCombo: this.bestCombo, wave: Math.min(this.wave + 1, this.spec.waves.length), waves: this.spec.waves.length });
  }
}

export function startHippari(parent: HTMLElement, cfg: HippariConfig): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1e293b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    input: { activePointers: 2 },
    banner: false,
  });
  game.scene.add('hippari', HippariScene, true, cfg);
  return game;
}
