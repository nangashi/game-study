import Phaser from 'phaser';
import { SKILLS, type SkillId, type SkillPick } from './skills';
import type { RunResult } from '../state/economy';
import { ENEMY_FRAME, SPRITE_BASE, iconFrame, type HeroId, type IconName } from '../art';

export interface BattleConfig {
  avatar: HeroId;
  easy: boolean;          // 年長さん向け: 敵が少なく遅い
  seconds: number;
  upgrades: { hp: number; atk: number; speed: number; magnet: number };
  onLevelUp: (level: number, levels: Record<SkillId, number>) => Promise<SkillPick | null>;
  onEnd: (r: RunResult) => void;
}

interface Enemy { obj: Phaser.GameObjects.Image; hp: number; speed: number; r: number; boss: boolean; hitAt: number; orbitHitAt: number; base: number; phase: number; shadow: Phaser.GameObjects.Image }
interface Bullet { obj: Phaser.GameObjects.Image; vx: number; vy: number; life: number; dmg: number }
interface Gem { obj: Phaser.GameObjects.Image; value: number; pulled: boolean }

// size は画面上の大きさ(px)
const ENEMY_TYPES = [
  { from: 0,   kind: 'slime',    hp: 1, speed: 55, size: 58 },
  { from: 25,  kind: 'ghost',    hp: 2, speed: 70, size: 60 },
  { from: 55,  kind: 'bat',      hp: 2, speed: 95, size: 58 },
  { from: 85,  kind: 'mushroom', hp: 4, speed: 60, size: 64 },
  { from: 115, kind: 'golem',    hp: 9, speed: 50, size: 80 },
] as const;

const ICON_PX = 128;  // アイコンのセルの大きさ
const HERO_PX = 160;
const ENEMY_PX = 160;

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.TileSprite;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private gems: Gem[] = [];
  private orbits: Phaser.GameObjects.Image[] = [];
  private hud!: { hearts: Phaser.GameObjects.Image[]; time: Phaser.GameObjects.Text; kills: Phaser.GameObjects.Text; icons: Phaser.GameObjects.Image[]; xp: Phaser.GameObjects.Graphics };
  private stick = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
  private stickGfx!: Phaser.GameObjects.Graphics;

  private t = 0;              // 経過秒
  private paused = false;
  private ended = false;
  private hp = 0; private maxHp = 0; private invulnUntil = 0;
  private xp = 0; private level = 1; private kills = 0;
  private skill: Record<SkillId, number> = { bolt: 1, orbit: 0, boom: 0, shoes: 0, heart: 0, magnet: 0 };
  private boltCd = 0; private boomCd = 0; private spawnCd = 0; private orbitAngle = 0;
  private bossSpawned = false;

  constructor() { super('battle'); }

  init(cfg: BattleConfig) {
    this.cfg = cfg;
    this.maxHp = this.hp = 5 + cfg.upgrades.hp + (cfg.easy ? 3 : 0);
  }

  private get atk() { return 1 + 0.25 * this.cfg.upgrades.atk; }
  private get moveSpeed() { return (170 + 12 * this.cfg.upgrades.speed) * (1 + 0.1 * this.skill.shoes); }
  private get magnetRange() { return 110 + 15 * this.cfg.upgrades.magnet + 45 * this.skill.magnet; }
  private get xpToNext() { return 3 + this.level * 3; }

  preload() {
    this.load.image('ground', `${SPRITE_BASE}ground.webp`);
    this.load.spritesheet('hero', `${SPRITE_BASE}hero_${this.cfg.avatar}.webp`, { frameWidth: HERO_PX, frameHeight: HERO_PX });
    this.load.spritesheet('enemies', `${SPRITE_BASE}enemies.webp`, { frameWidth: ENEMY_PX, frameHeight: ENEMY_PX });
    this.load.spritesheet('icons1', `${SPRITE_BASE}icons1.webp`, { frameWidth: ICON_PX, frameHeight: ICON_PX });
    this.load.spritesheet('icons2', `${SPRITE_BASE}icons2.webp`, { frameWidth: ICON_PX, frameHeight: ICON_PX });
  }

  // アイコンを size(px) の大きさで置く
  private icon(name: IconName, x: number, y: number, size: number) {
    const { sheet, frame } = iconFrame(name);
    return this.add.image(x, y, sheet, frame).setScale(size / ICON_PX);
  }

  create() {
    this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'ground').setOrigin(0).setScrollFactor(0);

    // 足元のかげ（草の上でもキャラが見やすくなる）
    const g = this.make.graphics({}, false);
    g.fillStyle(0x000000, 0.28).fillEllipse(32, 12, 64, 24);
    g.generateTexture('shadow', 64, 24); g.destroy();
    this.playerShadow = this.add.image(0, 0, 'shadow').setDepth(3).setScale(1.2);

    this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('hero', { start: 0, end: 3 }), frameRate: 9, repeat: -1 });
    this.player = this.add.sprite(0, 0, 'hero', 0).setScale(96 / HERO_PX).setDepth(10);
    this.cameras.main.startFollow(this.player, true);

    const style = { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#1f2937', stroke: '#ffffff', strokeThickness: 6 };
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(100);
    this.hud = {
      hearts: [],
      time: fixed(this.add.text(0, 14, '', style).setOrigin(0, 0)),
      kills: fixed(this.add.text(0, 14, '', style).setOrigin(1, 0)),
      icons: [fixed(this.icon('clock', 0, 32, 36)), fixed(this.icon('swords', 0, 32, 36))],
      xp: fixed(this.add.graphics()),
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
    const release = (p: Phaser.Input.Pointer) => { if (p.id === this.stick.id) this.stick = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 }; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.refreshHud();
  }

  private layoutHud() {
    const w = this.scale.width;
    this.bg.setSize(w, this.scale.height);
    this.hud.icons[0].setX(w / 2 - 44);
    this.hud.time.setX(w / 2 - 22);
    this.hud.kills.setX(w - 14);
    this.hud.icons[1].setX(w - 14 - this.hud.kills.width - 24);
  }

  private refreshHud() {
    // ハート: 残りは赤、減ったぶんは灰色
    while (this.hud.hearts.length < this.maxHp) {
      const i = this.hud.hearts.length;
      this.hud.hearts.push(this.icon('heart', 30 + (i % 10) * 34, 32 + Math.floor(i / 10) * 32, 34).setScrollFactor(0).setDepth(100));
    }
    this.hud.hearts.forEach((h, i) => (i < this.hp ? h.clearTint().setAlpha(1) : h.setTint(0x6b7280).setAlpha(0.45)));
    const left = Math.max(0, Math.ceil(this.cfg.seconds - this.t));
    this.hud.time.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this.hud.kills.setText(`${this.kills}  Lv${this.level}`);
    this.hud.icons[1].setX(this.scale.width - 14 - this.hud.kills.width - 24);
    const w = this.scale.width;
    this.hud.xp.clear().fillStyle(0x1f2937, 0.25).fillRect(0, 0, w, 8)
      .fillStyle(0x3b82f6).fillRect(0, 0, w * Math.min(1, this.xp / this.xpToNext), 8);
  }

  update(_time: number, deltaMs: number) {
    if (this.paused || this.ended) return;
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
    this.drawStick();

    this.spawn(dt);
    this.moveEnemies(dt, now);
    if (this.ended) return;
    this.fireBolts(dt);
    this.updateBullets(dt, now);
    this.updateOrbits(dt, now);
    this.updateBoom(dt, now);
    this.updateGems(dt);

    if (this.t >= this.cfg.seconds) return this.finish(true);
    this.refreshHud();
    if (this.xp >= this.xpToNext) void this.levelUp();
  }

  private drawStick() {
    this.stickGfx.clear();
    if (!this.stick.active) return;
    const { bx, by, dx, dy } = this.stick;
    this.stickGfx.fillStyle(0xffffff, 0.35).fillCircle(bx, by, 60).fillStyle(0x2563eb, 0.6).fillCircle(bx + dx * 60, by + dy * 60, 26);
  }

  private spawn(dt: number) {
    const easy = this.cfg.easy;
    const cap = easy ? 60 : 110;
    this.spawnCd -= dt;
    if (this.spawnCd <= 0 && this.enemies.length < cap) {
      this.spawnCd = Math.max(0.25, 1.1 - this.t / 200) / (easy ? 0.7 : 1);
      const n = 1 + Math.floor(this.t / 45);
      const types = ENEMY_TYPES.filter(e => e.from <= this.t);
      for (let i = 0; i < n; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        this.addEnemy(ENEMY_FRAME[type.kind], type.size, type.hp * (1 + this.t / 90), type.speed * (easy ? 0.8 : 1), false);
      }
    }
    // のこり30秒でボス
    if (!this.bossSpawned && this.t >= this.cfg.seconds - 30) {
      this.bossSpawned = true;
      this.addEnemy(ENEMY_FRAME.dragon, 170, (easy ? 60 : 120) * (1 + this.cfg.upgrades.atk * 0.2), 45, true);
      this.cameras.main.shake(400, 0.01);
    }
  }

  private addEnemy(frame: number, size: number, hp: number, speed: number, boss: boolean) {
    const cam = this.cameras.main;
    const a = Math.random() * Math.PI * 2, dist = Math.hypot(cam.width, cam.height) / 2 + size;
    const base = size / ENEMY_PX;
    const obj = this.add.image(this.player.x + Math.cos(a) * dist, this.player.y + Math.sin(a) * dist, 'enemies', frame).setScale(base).setDepth(boss ? 9 : 5);
    const shadow = this.add.image(obj.x, obj.y, 'shadow').setDepth(3).setScale(size / 64);
    this.enemies.push({ obj, hp, speed: speed * (0.85 + Math.random() * 0.3), r: size * 0.38, boss, hitAt: 0, orbitHitAt: 0, base, phase: Math.random() * 6, shadow });
  }

  private moveEnemies(dt: number, now: number) {
    for (const e of this.enemies) {
      const dx = this.player.x - e.obj.x, dy = this.player.y - e.obj.y, d = Math.hypot(dx, dy) || 1;
      e.obj.x += dx / d * e.speed * dt;
      e.obj.y += dy / d * e.speed * dt;
      e.obj.setFlipX(dx > 0); // 画像は左向き
      // ぷよぷよ動かす（アニメーションの代わり）
      const w = Math.sin(now * 9 + e.phase) * 0.07;
      e.obj.setScale(e.base * (1 - w), e.base * (1 + w));
      e.shadow.setPosition(e.obj.x, e.obj.y + e.r * 1.05);
      if (d < e.r + 22 && now > this.invulnUntil) {
        this.hp -= 1;
        this.invulnUntil = now + 1;
        this.player.setAlpha(0.4);
        this.time.delayedCall(1000, () => this.player.setAlpha(1));
        this.cameras.main.shake(150, 0.006);
        if (this.hp <= 0) return this.finish(false);
      }
    }
  }

  private nearestEnemies(n: number): Enemy[] {
    return this.enemies
      .map(e => ({ e, d: Phaser.Math.Distance.Between(e.obj.x, e.obj.y, this.player.x, this.player.y) }))
      .sort((a, b) => a.d - b.d).slice(0, n).map(x => x.e);
  }

  private fireBolts(dt: number) {
    this.boltCd -= dt;
    if (this.boltCd > 0 || !this.enemies.length) return;
    const lv = this.skill.bolt;
    this.boltCd = Math.max(0.35, 0.85 - lv * 0.07);
    const targets = this.nearestEnemies(lv);
    targets.forEach(t => {
      const a = Math.atan2(t.obj.y - this.player.y, t.obj.x - this.player.x);
      const obj = this.icon('bolt', this.player.x, this.player.y, 40).setDepth(8).setRotation(a + Math.PI / 4);
      this.bullets.push({ obj, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, life: 1.2, dmg: this.atk });
    });
  }

  private updateBullets(dt: number, now: number) {
    for (const b of this.bullets) {
      b.obj.x += b.vx * dt; b.obj.y += b.vy * dt; b.life -= dt;
      const hit = this.enemies.find(e => Phaser.Math.Distance.Between(e.obj.x, e.obj.y, b.obj.x, b.obj.y) < e.r + 10);
      if (hit) { this.damage(hit, b.dmg, now); b.life = 0; }
    }
    this.bullets = this.bullets.filter(b => { if (b.life > 0) return true; b.obj.destroy(); return false; });
  }

  private updateOrbits(dt: number, now: number) {
    const n = this.skill.orbit;
    while (this.orbits.length < n) this.orbits.push(this.icon('orbit', 0, 0, 46).setDepth(11));
    this.orbitAngle += dt * 3;
    const R = 85;
    this.orbits.forEach((o, i) => {
      const a = this.orbitAngle + (i / n) * Math.PI * 2;
      o.setPosition(this.player.x + Math.cos(a) * R, this.player.y + Math.sin(a) * R).setRotation(a * 2);
      for (const e of this.enemies) {
        if (now - e.orbitHitAt > 0.5 && Phaser.Math.Distance.Between(e.obj.x, e.obj.y, o.x, o.y) < e.r + 16) {
          e.orbitHitAt = now;
          this.damage(e, this.atk * 0.8, now);
        }
      }
    });
  }

  private updateBoom(dt: number, now: number) {
    const lv = this.skill.boom;
    if (!lv) return;
    this.boomCd -= dt;
    if (this.boomCd > 0) return;
    this.boomCd = Math.max(1.5, 3.6 - lv * 0.35);
    const R = 95 + lv * 15;
    const ring = this.add.circle(this.player.x, this.player.y, R, 0xf97316, 0.25).setDepth(7);
    const burst = this.icon('boom', this.player.x, this.player.y, R * 1.6).setDepth(7).setAlpha(0.85);
    this.tweens.add({ targets: [ring, burst], alpha: 0, scale: '*=1.15', duration: 380, onComplete: () => { ring.destroy(); burst.destroy(); } });
    for (const e of [...this.enemies]) {
      if (Phaser.Math.Distance.Between(e.obj.x, e.obj.y, this.player.x, this.player.y) < R + e.r) this.damage(e, this.atk * 1.6, now);
    }
  }

  private damage(e: Enemy, dmg: number, now: number) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.hitAt = now;
    e.obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.showHit(e.obj.x, e.obj.y - e.r);
    this.time.delayedCall(70, () => e.obj.active && e.obj.clearTint());
    if (e.hp > 0) return;
    this.kills++;
    const drops = e.boss ? 20 : 1;
    for (let i = 0; i < drops; i++) {
      const obj = this.icon('gem', e.obj.x + (Math.random() - 0.5) * (e.boss ? 140 : 0), e.obj.y + (Math.random() - 0.5) * (e.boss ? 140 : 0), 26).setDepth(4);
      this.gems.push({ obj, value: 1, pulled: false });
    }
    // やられたら、くるっと回って小さくなって消える
    e.shadow.destroy();
    const dead = e.obj;
    this.tweens.add({ targets: dead, scale: 0, angle: 180, alpha: 0, duration: 250, onComplete: () => dead.destroy() });
    this.enemies = this.enemies.filter(x => x !== e);
  }

  // ヒットしたところに小さな星を出す
  private showHit(x: number, y: number) {
    const s = this.icon('star', x, y, 20).setDepth(12);
    this.tweens.add({ targets: s, y: y - 24, alpha: 0, duration: 300, onComplete: () => s.destroy() });
  }

  private updateGems(dt: number) {
    const range = this.magnetRange;
    for (const g of this.gems) {
      const dx = this.player.x - g.obj.x, dy = this.player.y - g.obj.y, d = Math.hypot(dx, dy) || 1;
      if (d < range) g.pulled = true;
      if (g.pulled) { const sp = 420 * dt; g.obj.x += dx / d * Math.min(sp, d); g.obj.y += dy / d * Math.min(sp, d); }
      if (d < 26) { this.xp += g.value; g.value = 0; }
    }
    this.gems = this.gems.filter(g => { if (g.value > 0) return true; g.obj.destroy(); return false; });
  }

  private async levelUp() {
    this.paused = true;
    this.xp -= this.xpToNext;
    this.level++;
    this.stick = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
    this.drawStick();
    this.refreshHud();
    const pick = await this.cfg.onLevelUp(this.level, { ...this.skill });
    if (pick) {
      this.skill[pick.id] = Math.min(SKILLS[pick.id].max, this.skill[pick.id] + pick.power);
      if (pick.id === 'heart') { this.maxHp += pick.power; this.hp = this.maxHp; }
    }
    this.paused = false;
  }

  quit() { this.finish(false); }

  private finish(cleared: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.refreshHud();
    this.cfg.onEnd({ seconds: Math.floor(this.t), kills: this.kills, cleared, level: this.level });
  }
}

export function startBattle(parent: HTMLElement, cfg: BattleConfig): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#bbf7d0',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { activePointers: 3 },
    banner: false,
  });
  game.scene.add('battle', BattleScene, true, cfg);
  return game;
}
