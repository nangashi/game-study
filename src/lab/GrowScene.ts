import Phaser from 'phaser';
import { ENEMY_FRAME, iconFrame, type IconName } from '../art';
import { ENEMY_PX, HERO_PX, ICON_PX, LabScene, sfx, type LabResult } from './common';

// ぱくぱくビッグ: 自分より小さいものに さわると たべて 大きくなる。
// 大きいものには はじかれる。大きくなるほど カメラが ひいて、せかいが 小さく見える。

type Look = { icon: IconName } | { enemy: keyof typeof ENEMY_FRAME };
interface Thing {
  obj: Phaser.GameObjects.Image; size: number; alive: boolean;
  moves: boolean; vx: number; vy: number; turnCd: number;
}

// だいたいの大きさの じゅん
const KINDS: { look: Look; size: number; moves?: boolean }[] = [
  { look: { icon: 'gem' }, size: 20 },
  { look: { icon: 'coin' }, size: 24 },
  { look: { icon: 'ladybug' }, size: 28, moves: true },
  { look: { icon: 'apple' }, size: 34 },
  { look: { icon: 'donut' }, size: 40 },
  { look: { icon: 'tulip' }, size: 48 },
  { look: { icon: 'fish' }, size: 56, moves: true },
  { look: { icon: 'frog' }, size: 64, moves: true },
  { look: { enemy: 'slime' }, size: 76, moves: true },
  { look: { icon: 'balloon' }, size: 90 },
  { look: { enemy: 'ghost' }, size: 104, moves: true },
  { look: { enemy: 'bat' }, size: 118, moves: true },
  { look: { enemy: 'mushroom' }, size: 140, moves: true },
  { look: { icon: 'car' }, size: 170, moves: true },
  { look: { enemy: 'golem' }, size: 220, moves: true },
  { look: { icon: 'home' }, size: 300 },
  { look: { enemy: 'dragon' }, size: 400, moves: true },
  { look: { icon: 'trophy' }, size: 520 },
];

const MILESTONES = [70, 110, 170, 260, 400, 600, 900];
const EAT = 0.85;   // 自分の この わりあい より小さければ たべられる

export class GrowScene extends LabScene {
  private hero!: Phaser.GameObjects.Sprite;
  private bg!: Phaser.GameObjects.TileSprite;
  private things: Thing[] = [];
  private size = 48;
  private shown = 48;         // 見た目の大きさ（すこし おくれて ついてくる）
  private kx = 0; private ky = 0;
  private invulnUntil = 0;
  private eaten = 0; private chain = 0; private chainAt = 0; private bestChain = 0;
  private milestone = 0;
  private zoom = 1.3;

  protected setup() {
    this.bg = this.add.tileSprite(0, 0, 10, 10, 'ground').setOrigin(0).setDepth(-10);
    this.hero = this.add.sprite(0, 0, 'hero', 0).setDepth(1000);
    this.cameras.main.startFollow(this.hero, true);
    this.cameras.main.setZoom(this.zoom);
    this.enableStick();
    // はじめは まわりに いろいろ おいておく
    for (let i = 0; i < 90; i++) this.addThing(true);
    this.hud.setScore(this.sizeLabel());
  }

  private sizeLabel() { return `${(this.size / 40).toFixed(1)} m`; }

  private viewRadius() {
    const cam = this.cameras.main;
    return Math.hypot(cam.width, cam.height) / 2 / cam.zoom;
  }

  // 大きさは「いまの自分」を中心に ばらつかせる。小さいものを おおめに
  private pickSize() {
    const r = Math.random();
    const k = r < 0.6 ? 0.25 + Math.random() * 0.55 : r < 0.85 ? 0.8 + Math.random() * 0.5 : 1.3 + Math.random() * 1.4;
    return Math.max(18, this.size * k);
  }

  private addThing(initial: boolean) {
    const size = this.pickSize();
    const kind = KINDS.reduce((a, b) => (Math.abs(Math.log(b.size / size)) < Math.abs(Math.log(a.size / size)) ? b : a));
    const vr = this.viewRadius();
    const a = Math.random() * Math.PI * 2;
    const d = initial ? 120 + Math.random() * vr * 1.8 : vr * (1.05 + Math.random() * 0.8);
    const x = this.hero.x + Math.cos(a) * d, y = this.hero.y + Math.sin(a) * d;
    let obj: Phaser.GameObjects.Image;
    if ('icon' in kind.look) {
      const { sheet, frame } = iconFrame(kind.look.icon);
      obj = this.add.image(x, y, sheet, frame).setScale(size / ICON_PX * 1.15);
    } else {
      obj = this.add.image(x, y, 'enemies', ENEMY_FRAME[kind.look.enemy]).setScale(size / ENEMY_PX * 1.25);
    }
    obj.setDepth(size);
    this.things.push({ obj, size, alive: true, moves: !!kind.moves, vx: 0, vy: 0, turnCd: 0 });
  }

  protected tick(dt: number) {
    const sp = 200 + this.size * 1.1;
    const hx = this.hero.x + (this.stick.dx * sp + this.kx) * dt;
    const hy = this.hero.y + (this.stick.dy * sp + this.ky) * dt;
    this.hero.setPosition(hx, hy);
    this.kx *= Math.pow(0.02, dt); this.ky *= Math.pow(0.02, dt);
    const moving = Math.hypot(this.stick.dx, this.stick.dy) > 0.15;
    if (moving && !this.hero.anims.isPlaying) this.hero.play('walk');
    if (!moving && this.hero.anims.isPlaying) this.hero.stop().setFrame(0);
    if (Math.abs(this.stick.dx) > 0.05) this.hero.setFlipX(this.stick.dx < 0);

    // 見た目の大きさと ズームを なめらかに
    this.shown += (this.size - this.shown) * Math.min(1, dt * 8);
    this.hero.setScale(this.shown * 1.4 / HERO_PX);
    const want = Phaser.Math.Clamp(110 / this.shown, 0.08, 1.3);
    this.zoom += (want - this.zoom) * Math.min(1, dt * 2);
    this.cameras.main.setZoom(this.zoom);
    const v = this.cameras.main.worldView;
    // worldView は ズームの反映が 1フレーム おくれるので すこし大きめに しく
    const pad = 200 / this.zoom;
    this.bg.setPosition(v.x - pad, v.y - pad).setSize(v.width + pad * 2, v.height + pad * 2);
    this.bg.setTilePosition(v.x - pad, v.y - pad);

    this.moveThings(dt);
    this.eat();

    // まわりに ものを たす・遠いものは けす
    const vr = this.viewRadius();
    for (const t of this.things) {
      if (Phaser.Math.Distance.Between(t.obj.x, t.obj.y, hx, hy) > vr * 2.4 || t.size < this.size * 0.12) {
        t.alive = false; t.obj.destroy();
      }
    }
    this.things = this.things.filter(t => t.alive);
    while (this.things.length < 90) this.addThing(false);
    this.hud.setScore(this.sizeLabel());
  }

  private moveThings(dt: number) {
    for (const t of this.things) {
      if (!t.moves) continue;
      const dx = t.obj.x - this.hero.x, dy = t.obj.y - this.hero.y, d = Math.hypot(dx, dy) || 1;
      const prey = t.size < this.size * EAT;
      const near = d < this.size * 3 + 150;
      if (near && prey) {
        // にげる（すこし おそめ）
        const s = 90 + this.size * 0.55;
        t.vx = dx / d * s; t.vy = dy / d * s;
      } else if (near && t.size > this.size * 1.3) {
        // 大きいものは ゆっくり おいかけてくる
        const s = 60 + this.size * 0.3;
        t.vx = -dx / d * s; t.vy = -dy / d * s;
      } else {
        t.turnCd -= dt;
        if (t.turnCd <= 0) {
          t.turnCd = 1 + Math.random() * 2;
          const a = Math.random() * Math.PI * 2, s = 30 + t.size * 0.3;
          t.vx = Math.cos(a) * s; t.vy = Math.sin(a) * s;
        }
      }
      t.obj.x += t.vx * dt; t.obj.y += t.vy * dt;
      if (Math.abs(t.vx) > 3) t.obj.setFlipX(t.vx > 0);
    }
  }

  private eat() {
    const r = this.size * 0.5;
    for (const t of this.things) {
      if (!t.alive) continue;
      const d = Phaser.Math.Distance.Between(t.obj.x, t.obj.y, this.hero.x, this.hero.y);
      if (t.size < this.size * EAT) {
        if (d > r + t.size * 0.25) continue;
        t.alive = false;
        this.swallow(t);
      } else if (d < r + t.size * 0.35 && this.time.now > this.invulnUntil) {
        this.bump(t, d);
      }
    }
    this.things = this.things.filter(t => t.alive);
  }

  private swallow(t: Thing) {
    // 面積が たされる感じで 大きくなる
    this.size = Math.sqrt(this.size ** 2 + (t.size ** 2) * 0.22);
    this.eaten++;
    const now = this.time.now;
    this.chain = now - this.chainAt < 700 ? this.chain + 1 : 1;
    this.chainAt = now;
    this.bestChain = Math.max(this.bestChain, this.chain);
    sfx.pop(0.8 + Math.min(this.chain, 12) * 0.08);
    const obj = t.obj, hero = this.hero;
    this.tweens.add({
      targets: obj, scale: 0, angle: 200, duration: 200, ease: 'Cubic.In',
      onUpdate: tw => { obj.x += (hero.x - obj.x) * tw.progress * 0.5; obj.y += (hero.y - obj.y) * tw.progress * 0.5; },
      onComplete: () => obj.destroy(),
    });
    // もぐもぐ
    this.tweens.add({ targets: hero, scaleX: hero.scaleX * 1.15, scaleY: hero.scaleY * 0.9, duration: 60, yoyo: true });
    const z = 1 / this.zoom;
    if (this.chain >= 3) this.popText(hero.x, hero.y - this.shown * 0.6, `パクパク ×${this.chain}`, '#f59e0b', 26 * z);
    if (t.size > this.size * 0.5) { this.burst(obj.x, obj.y, 'star', 5, this.size * 0.8, this.size * 0.3); this.cameras.main.shake(80, 0.004); }

    if (this.milestone < MILESTONES.length && this.size >= MILESTONES[this.milestone]) {
      this.milestone++;
      sfx.up();
      this.hud.big('おおきく なった！', '#16a34a');
      this.ring(hero.x, hero.y, this.size * 1.4, 0x22c55e, 10 * z);
    }
  }

  private bump(t: Thing, d: number) {
    const nx = (this.hero.x - t.obj.x) / (d || 1), ny = (this.hero.y - t.obj.y) / (d || 1);
    this.kx = nx * (500 + this.size * 2); this.ky = ny * (500 + this.size * 2);
    this.invulnUntil = this.time.now + 800;
    sfx.hurt();
    this.cameras.main.shake(150, 0.008);
    this.hero.setTint(0xff6b6b);
    this.time.delayedCall(250, () => this.hero.clearTint());
    // すこし ちぢんで、かけらを おとす
    const lost = this.size * 0.08;
    this.size = Math.max(40, this.size - lost);
    for (let i = 0; i < 3; i++) {
      const { sheet, frame } = iconFrame('gem');
      const s = this.size * 0.25;
      const obj = this.add.image(this.hero.x, this.hero.y, sheet, frame).setScale(s / ICON_PX).setDepth(s);
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2;
      this.tweens.add({ targets: obj, x: obj.x + Math.cos(a) * this.size * 1.5, y: obj.y + Math.sin(a) * this.size * 1.5, duration: 300, ease: 'Cubic.Out' });
      this.things.push({ obj, size: s, alive: true, moves: false, vx: 0, vy: 0, turnCd: 0 });
    }
  }

  protected result(cleared: boolean): LabResult {
    return {
      cleared,
      stats: [
        { icon: 'trophy', text: this.sizeLabel() },
        { icon: 'apple', text: `${this.eaten}こ たべた` },
        { icon: 'flame', text: `さいこう ×${this.bestChain}` },
      ],
    };
  }
}
