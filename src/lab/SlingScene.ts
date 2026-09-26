import Phaser from 'phaser';
import { ENEMY_FRAME } from '../art';
import { ENEMY_PX, HERO_PX, LabScene, sfx, type LabResult } from './common';

// ひっぱりアタック: ひっぱって はなすと、主人公が とんでいって はねかえる。
// はやく とんでいる あいだは むてき。ふっとんだ敵が ほかの敵に ぶつかると れんさする。

interface Foe {
  obj: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image;
  hp: number; r: number; speed: number; boss: boolean; base: number; phase: number;
  kx: number; ky: number;   // ふっとびの速さ
  hitCd: number;
}

const TYPES = [
  { wave: 1, kind: 'slime',    hp: 1,  speed: 38, size: 62 },
  { wave: 2, kind: 'ghost',    hp: 2,  speed: 48, size: 64 },
  { wave: 3, kind: 'bat',      hp: 1,  speed: 70, size: 58 },
  { wave: 4, kind: 'mushroom', hp: 3,  speed: 40, size: 70 },
  { wave: 6, kind: 'golem',    hp: 7,  speed: 32, size: 92 },
] as const;

const TOP = 64;          // 上のHUDのぶん
const R = 40;            // 主人公の当たりの大きさ
const FAST = 260;        // この速さより速いと「アタック中」
const MAX_PULL = 170;

export class SlingScene extends LabScene {
  private hero!: Phaser.GameObjects.Sprite;
  private heroShadow!: Phaser.GameObjects.Image;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private foes: Foe[] = [];
  private vx = 0; private vy = 0;
  private aim = { active: false, id: -1, sx: 0, sy: 0, x: 0, y: 0 };
  private hp = 0; private maxHp = 0; private invulnUntil = 0;
  private combo = 0; private bestCombo = 0; private kills = 0;
  private wave = 0; private waveQueue = 0; private spawnCd = 0; private nextWaveAt = 1;
  private trailCd = 0;

  private get fast() { return Math.hypot(this.vx, this.vy) > FAST; }

  protected setup() {
    const { width: w, height: h } = this.scale;
    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0);
    // かべ
    this.add.rectangle(0, TOP - 6, w, 6, 0x7c3aed, 0.5).setOrigin(0);
    this.heroShadow = this.add.image(w / 2, h / 2, 'shadow').setDepth(3).setScale(1.2);
    this.hero = this.add.sprite(w / 2, h / 2, 'hero', 0).setScale(96 / HERO_PX).setDepth(10);
    this.aimGfx = this.add.graphics().setDepth(20);
    this.maxHp = this.hp = this.cfg.easy ? 8 : 5;
    this.hud.setHearts(this.hp, this.maxHp);
    this.hud.setScore('0');

    // ひっぱって はなす
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.aim.active) this.aim = { active: true, id: p.id, sx: p.x, sy: p.y, x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.aim.active && p.id === this.aim.id) { this.aim.x = p.x; this.aim.y = p.y; }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!this.aim.active || p.id !== this.aim.id) return;
      this.aim.active = false;
      this.aimGfx.clear();
      if (this.ended) return;
      const dx = this.aim.sx - this.aim.x, dy = this.aim.sy - this.aim.y, len = Math.hypot(dx, dy);
      if (len < 25) return; // ちょんと さわっただけ
      const power = Math.min(len, MAX_PULL) / MAX_PULL;
      const sp = 450 + power * 1150;
      this.vx = dx / len * sp; this.vy = dy / len * sp;
      this.combo = 0;
      sfx.shoot();
      this.tweens.add({ targets: this.hero, scaleX: this.hero.scaleX * 1.25, scaleY: this.hero.scaleY * 0.8, duration: 70, yoyo: true });
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  protected tick(dt: number) {
    this.moveHero(dt);
    this.drawAim();
    this.spawn(dt);
    this.moveFoes(dt);
    this.collide();
    this.hud.setScore(`${this.kills}  WAVE ${this.wave}`);
  }

  private moveHero(dt: number) {
    const { width: w, height: h } = this.scale;
    const wasFast = this.fast;
    this.hero.x += this.vx * dt; this.hero.y += this.vy * dt;
    // まさつ: 1びょうで 6わり くらいに へる
    const f = Math.pow(0.38, dt);
    this.vx *= f; this.vy *= f;
    if (Math.hypot(this.vx, this.vy) < 30) this.vx = this.vy = 0;
    // かべで はねかえる
    let bounced = false;
    if (this.hero.x < R) { this.hero.x = R; this.vx = Math.abs(this.vx); bounced = true; }
    if (this.hero.x > w - R) { this.hero.x = w - R; this.vx = -Math.abs(this.vx); bounced = true; }
    if (this.hero.y < TOP + R) { this.hero.y = TOP + R; this.vy = Math.abs(this.vy); bounced = true; }
    if (this.hero.y > h - R) { this.hero.y = h - R; this.vy = -Math.abs(this.vy); bounced = true; }
    if (bounced && wasFast) { sfx.wall(); this.cameras.main.shake(60, 0.004); }
    this.heroShadow.setPosition(this.hero.x, this.hero.y + 42);
    if (Math.abs(this.vx) > 5) this.hero.setFlipX(this.vx < 0);
    this.hero.setRotation(this.fast ? this.hero.rotation + dt * 14 : 0);

    // アタック中は ざんぞう
    if (this.fast) {
      this.trailCd -= dt;
      if (this.trailCd <= 0) {
        this.trailCd = 0.03;
        const ghost = this.add.sprite(this.hero.x, this.hero.y, 'hero', this.hero.frame.name).setScale(this.hero.scale).setRotation(this.hero.rotation)
          .setFlipX(this.hero.flipX).setAlpha(0.45).setTint(0x93c5fd).setDepth(9);
        this.tweens.add({ targets: ghost, alpha: 0, scale: this.hero.scale * 0.7, duration: 220, onComplete: () => ghost.destroy() });
      }
    } else if (wasFast) {
      // とまったときに コンボを しめる
      if (this.combo >= 5) {
        this.hud.big(`${this.combo} コンボ！`, this.combo >= 15 ? '#ef4444' : '#f59e0b', this.combo >= 15 ? 80 : 60);
        sfx.up();
      }
      this.combo = 0;
    }
  }

  private drawAim() {
    this.aimGfx.clear();
    if (!this.aim.active) return;
    const dx = this.aim.sx - this.aim.x, dy = this.aim.sy - this.aim.y, len = Math.hypot(dx, dy);
    this.aimGfx.fillStyle(0xffffff, 0.35).fillCircle(this.aim.sx, this.aim.sy, 18);
    if (len < 25) return;
    const power = Math.min(len, MAX_PULL) / MAX_PULL, ux = dx / len, uy = dy / len;
    const color = power > 0.85 ? 0xef4444 : power > 0.5 ? 0xf59e0b : 0x3b82f6;
    // とんでいく むきに てんてんの やじるし
    const n = 4 + Math.round(power * 8);
    for (let i = 1; i <= n; i++) {
      this.aimGfx.fillStyle(color, 1 - i / (n + 2)).fillCircle(this.hero.x + ux * i * 26, this.hero.y + uy * i * 26, 9 - i * 0.4);
    }
    // ひっぱっている ゆびの ところ
    this.aimGfx.lineStyle(6, color, 0.6).lineBetween(this.aim.sx, this.aim.sy, this.aim.sx - ux * Math.min(len, MAX_PULL), this.aim.sy - uy * Math.min(len, MAX_PULL));
  }

  private spawn(dt: number) {
    if (this.waveQueue <= 0 && this.foes.length === 0 && this.t >= this.nextWaveAt) {
      this.wave++;
      const boss = this.wave % 5 === 0;
      this.hud.big(boss ? 'ボスが きた！' : `WAVE ${this.wave}`, boss ? '#ef4444' : '#7c3aed');
      this.waveQueue = Math.round((4 + this.wave * 3) * (this.cfg.easy ? 0.7 : 1));
      if (boss) { this.addFoe('dragon', 150, 30 + this.wave * 4, 28, true); this.waveQueue = Math.round(this.waveQueue / 2); }
    }
    if (this.waveQueue > 0) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.spawnCd = 0.25;
        const types = TYPES.filter(t => t.wave <= this.wave);
        const ty = types[Math.floor(Math.random() * types.length)];
        this.addFoe(ty.kind, ty.size, ty.hp * (1 + this.wave * 0.08), ty.speed * (this.cfg.easy ? 0.75 : 1), false);
        this.waveQueue--;
        if (this.waveQueue === 0) this.nextWaveAt = this.t + 1.2;
      }
    }
  }

  private addFoe(kind: keyof typeof ENEMY_FRAME, size: number, hp: number, speed: number, boss: boolean) {
    const { width: w, height: h } = this.scale;
    // 画面のふちの どこかから あらわれる
    const side = Math.floor(Math.random() * 4), m = size / 2;
    const x = side === 0 ? m : side === 1 ? w - m : m + Math.random() * (w - 2 * m);
    const y = side === 2 ? TOP + m : side === 3 ? h - m : TOP + m + Math.random() * (h - TOP - 2 * m);
    const base = size / ENEMY_PX;
    const obj = this.add.image(x, y, 'enemies', ENEMY_FRAME[kind]).setScale(0).setDepth(boss ? 9 : 5);
    this.tweens.add({ targets: obj, scale: base, duration: 250, ease: 'Back.Out' });
    const shadow = this.add.image(x, y, 'shadow').setDepth(3).setScale(size / 64);
    this.foes.push({ obj, shadow, hp, r: size * 0.4, speed: speed * (0.85 + Math.random() * 0.3), boss, base, phase: Math.random() * 6, kx: 0, ky: 0, hitCd: 0 });
  }

  private moveFoes(dt: number) {
    const { width: w, height: h } = this.scale;
    const decay = Math.pow(0.06, dt);
    for (const e of this.foes) {
      e.hitCd -= dt;
      const dx = this.hero.x - e.obj.x, dy = this.hero.y - e.obj.y, d = Math.hypot(dx, dy) || 1;
      const flying = Math.hypot(e.kx, e.ky) > 120;
      const chase = flying ? 0 : e.speed;
      e.obj.x += (dx / d * chase + e.kx) * dt;
      e.obj.y += (dy / d * chase + e.ky) * dt;
      e.kx *= decay; e.ky *= decay;
      // ふっとんだ敵も かべで はねる
      if (e.obj.x < e.r) { e.obj.x = e.r; e.kx = Math.abs(e.kx); }
      if (e.obj.x > w - e.r) { e.obj.x = w - e.r; e.kx = -Math.abs(e.kx); }
      if (e.obj.y < TOP + e.r) { e.obj.y = TOP + e.r; e.ky = Math.abs(e.ky); }
      if (e.obj.y > h - e.r) { e.obj.y = h - e.r; e.ky = -Math.abs(e.ky); }
      if (flying) e.obj.rotation += dt * 12; else { e.obj.rotation *= 0.8; e.obj.setFlipX(dx > 0); }
      const wob = Math.sin(this.t * 9 + e.phase) * 0.07;
      if (!this.tweens.isTweening(e.obj)) e.obj.setScale(e.base * (1 - wob), e.base * (1 + wob));
      e.shadow.setPosition(e.obj.x, e.obj.y + e.r * 1.05);
    }
  }

  private collide() {
    const heroSp = Math.hypot(this.vx, this.vy);
    for (const e of [...this.foes]) {
      if (e.hp <= 0) continue;
      const dx = e.obj.x - this.hero.x, dy = e.obj.y - this.hero.y, d = Math.hypot(dx, dy) || 1;
      if (d > R + e.r) continue;
      const nx = dx / d, ny = dy / d;
      if (heroSp > FAST) {
        if (e.hitCd > 0) continue;
        e.hitCd = 0.3;
        if (e.boss) {
          // ボスには はねかえされる
          const dot = this.vx * nx + this.vy * ny;
          if (dot > 0) { this.vx -= 2 * dot * nx; this.vy -= 2 * dot * ny; }
          e.kx += nx * 250; e.ky += ny * 250;
        } else {
          const k = 600 + heroSp * 0.5;
          e.kx = nx * k; e.ky = ny * k;
        }
        this.hitFoe(e, 1 + heroSp / 700);
      } else if (this.time.now > this.invulnUntil) {
        // とまっているときに さわられると いたい
        this.hp--;
        this.hud.setHearts(this.hp, this.maxHp);
        this.invulnUntil = this.time.now + 1000;
        sfx.hurt();
        this.cameras.main.shake(180, 0.01);
        this.hero.setTint(0xff6b6b);
        this.time.delayedCall(250, () => this.hero.clearTint());
        this.vx = -nx * 500; this.vy = -ny * 500; // はじかれる（そのまま アタックになる）
        e.kx = nx * 300; e.ky = ny * 300;
        if (this.hp <= 0) return this.finish(false);
      }
    }
    // ふっとんだ敵が ほかの敵に ぶつかると、れんさで ふっとぶ
    for (const a of this.foes) {
      const sp = Math.hypot(a.kx, a.ky);
      if (sp < 280 || a.hp <= 0) continue;
      for (const b of this.foes) {
        if (a === b || b.hp <= 0 || b.hitCd > 0) continue;
        const dx = b.obj.x - a.obj.x, dy = b.obj.y - a.obj.y, d = Math.hypot(dx, dy) || 1;
        if (d > a.r + b.r) continue;
        b.hitCd = 0.3;
        const k = b.boss ? 120 : sp * 0.85;
        b.kx = dx / d * k; b.ky = dy / d * k;
        a.kx *= 0.6; a.ky *= 0.6;
        this.hitFoe(b, 1);
      }
    }
    this.foes = this.foes.filter(e => e.hp > 0);
  }

  private hitFoe(e: Foe, dmg: number) {
    e.hp -= dmg;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    sfx.hit(this.combo);
    if (this.combo <= 6) this.hitstop(40);
    e.obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(70, () => e.obj.active && e.obj.clearTint());
    this.burst(e.obj.x, e.obj.y, 'star', 4, 60, 26);
    if (this.combo >= 2) this.popText(e.obj.x, e.obj.y - e.r, `${this.combo}`, this.combo >= 10 ? '#ef4444' : '#f59e0b', 24 + Math.min(this.combo, 20) * 1.5);
    if (e.hp > 0) return;
    this.kills++;
    e.shadow.destroy();
    const dead = e.obj;
    this.ring(dead.x, dead.y, e.r * 2, 0xfbbf24);
    if (e.boss) {
      sfx.boom();
      this.cameras.main.shake(500, 0.02);
      this.burst(dead.x, dead.y, 'coin', 24, 260, 40);
      this.hud.big('ボスを たおした！', '#16a34a', 64);
    }
    this.tweens.add({ targets: dead, scale: 0, angle: 360, alpha: 0, duration: 300, onComplete: () => dead.destroy() });
  }

  protected result(cleared: boolean): LabResult {
    return {
      cleared,
      stats: [
        { icon: 'swords', text: `${this.kills}` },
        { icon: 'flame', text: `さいこう ${this.bestCombo}コンボ` },
        { icon: 'trophy', text: `WAVE ${this.wave}` },
      ],
    };
  }
}
