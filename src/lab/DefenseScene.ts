import Phaser from 'phaser';
import { heroSheet, type HeroId } from '../art';
import { loadSheet } from '../games/kit/phaser';
import { ENEMY_FRAME } from './assets';
import { ENEMY_PX, HERO_PX, LabScene, sfx, textStyle, type LabResult } from './common';

// モンスターまもり（モンスターサバイバル風）:
// ピンボールで なかまを しょうかん → マスに おく → じどうで こうげき。
// おなじ なかまを ドラッグで かさねると がったいして レベルアップ。さくを まもりきれば クリア。

type Kind = 'magic' | 'fire' | 'ninja';

const KINDS: Record<Kind, { hero: HeroId; name: string; color: number; cd: number; dmg: number }> = {
  magic: { hero: 'wizard', name: 'まほう',   color: 0x8b5cf6, cd: 0.65, dmg: 1 },    // ねらった敵を おいかける
  fire:  { hero: 'dino',   name: 'ほのお',   color: 0xf97316, cd: 1.5,  dmg: 2 },    // まわりも まきこむ
  ninja: { hero: 'ninja',  name: 'しゅりけん', color: 0x10b981, cd: 1.1,  dmg: 1.5 },  // よこ一列を つらぬく
};
const KIND_IDS = Object.keys(KINDS) as Kind[];
const MAX_LV = 5;
const power = (lv: number) => Math.pow(2.2, lv - 1); // 2体 あわせると 2ばいより すこし強い

const ZOMBIES = [
  { from: 0,  kind: 'slime',    hp: 3,  speed: 38, size: 60, coin: 3,  weight: 5 },
  { from: 20, kind: 'ghost',    hp: 5,  speed: 44, size: 62, coin: 3,  weight: 4 },
  { from: 40, kind: 'bat',      hp: 3,  speed: 75, size: 56, coin: 3,  weight: 3 },
  { from: 60, kind: 'mushroom', hp: 9,  speed: 34, size: 68, coin: 5,  weight: 2 },
  { from: 85, kind: 'golem',    hp: 24, speed: 26, size: 88, coin: 10, weight: 1 },
] as const;

// ピンボールの いちばん下の うけざら（はしっこは ラッキー）
const BUCKETS: ('lucky' | Kind)[] = ['lucky', 'magic', 'fire', 'ninja', 'lucky'];

const TOP = 64;
const PW = 230;       // ピンボールの はば
const COLS = 3, ROWS = 4;

interface Unit { kind: Kind; lv: number; slot: number; spr: Phaser.GameObjects.Sprite; ring: Phaser.GameObjects.Ellipse; badge: Phaser.GameObjects.Text; cd: number }
interface Zombie {
  obj: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics;
  hp: number; maxHp: number; speed: number; lane: number; r: number; boss: boolean; coin: number;
  atkCd: number; base: number; phase: number; kx: number;
}
interface Ball { obj: Phaser.GameObjects.Arc; vx: number; vy: number }
interface Shot { obj: Phaser.GameObjects.Image; kind: 'magic' | 'ninja'; vx: number; vy: number; target?: Zombie; dmg: number; hit: Set<Zombie> }

export class DefenseScene extends LabScene {
  private slot = 90; private laneH = 100; private gridX = 0; private fenceX = 0;
  private units: (Unit | null)[] = Array(COLS * ROWS).fill(null);
  private zombies: Zombie[] = [];
  private shots: Shot[] = [];
  private balls: Ball[] = [];
  private pegs: Phaser.GameObjects.Arc[] = [];
  private bucketTop = 0;
  private coinText!: Phaser.GameObjects.Text;
  private costText!: Phaser.GameObjects.Text;
  private btn!: Phaser.GameObjects.Container;
  private coins = 40; private summons = 0;
  private fence = 0; private maxFence = 0;
  private kills = 0; private wave = 0; private spawnCd = 1.5; private bossSpawned = false;
  private drag: { unit: Unit; moved: boolean; sx: number; sy: number; id: number } | null = null;

  private get cost() { return Math.min(24, 10 + this.summons); }

  preload() {
    super.preload();
    for (const k of KIND_IDS) {
      const id = KINDS[k].hero;
      loadSheet(this, `unit_${id}`, heroSheet(id));
    }
  }

  protected setup() {
    const { width: w, height: h } = this.scale;
    this.laneH = (h - TOP - 8) / ROWS;
    this.slot = Math.min(this.laneH, 96);
    this.gridX = PW + 16;
    this.fenceX = this.gridX + COLS * this.slot + 14;

    this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0);
    // じぶんの じんち（すこし あかるく）
    this.add.rectangle(PW, TOP, this.fenceX - PW, h - TOP, 0xfef3c7, 0.35).setOrigin(0);
    for (let i = 0; i < COLS * ROWS; i++) {
      const [x, y] = this.slotPos(i);
      this.add.rectangle(x, y, this.slot - 8, this.slot - 8).setStrokeStyle(3, 0xffffff, 0.6).setFillStyle(0xffffff, 0.12);
    }
    // さく
    for (let r = 0; r < ROWS; r++) {
      const y = TOP + r * this.laneH;
      this.add.rectangle(this.fenceX, y + 4, 14, this.laneH - 8, 0xa16207).setOrigin(0.5, 0).setStrokeStyle(3, 0x713f12).setDepth(4);
    }

    this.buildPinball();
    this.maxFence = this.fence = this.cfg.easy ? 15 : 10;
    this.hud.setHearts(this.fence, this.maxFence);
    this.hud.setScore('0');
    this.addUnit('magic', 1, 4);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || p.id !== this.drag.id) return;
      if (Math.hypot(p.x - this.drag.sx, p.y - this.drag.sy) > 8) this.drag.moved = true;
      this.drag.unit.spr.setPosition(p.x, p.y - 10);
      this.drag.unit.ring.setPosition(p.x, p.y + this.slot * 0.28);
      this.drag.unit.badge.setPosition(p.x, p.y - this.slot * 0.5);
    });
    const up = (p: Phaser.Input.Pointer) => { if (this.drag && p.id === this.drag.id) this.drop(p); };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  private slotPos(i: number): [number, number] {
    return [this.gridX + (i % COLS + 0.5) * this.slot, TOP + (Math.floor(i / COLS) + 0.5) * this.laneH];
  }

  private slotAt(x: number, y: number): number {
    const c = Math.floor((x - this.gridX) / this.slot), r = Math.floor((y - TOP) / this.laneH);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
  }

  // ---- ピンボール ----
  private buildPinball() {
    const h = this.scale.height;
    this.add.rectangle(0, TOP, PW, h - TOP, 0x1e1b4b, 0.82).setOrigin(0).setStrokeStyle(4, 0x7c3aed);
    this.add.image(28, TOP + 26, 'hero', 0).setScale(44 / HERO_PX);
    this.icon('coin', 64, TOP + 26, 30);
    this.coinText = this.add.text(84, TOP + 26, '', textStyle(26, '#fde047', '#1e1b4b')).setOrigin(0, 0.5);

    const pegTop = TOP + 70, btnH = 86;
    this.bucketTop = h - btnH - 70;
    const rows = Math.max(4, Math.floor((this.bucketTop - 30 - pegTop) / 46));
    const gap = PW / 5;
    for (let r = 0; r < rows; r++) {
      const n = r % 2 ? 4 : 5, off = r % 2 ? gap : gap / 2;
      for (let c = 0; c < n; c++) this.pegs.push(this.add.circle(off + c * gap, pegTop + r * 46, 6, 0xc4b5fd));
    }
    // うけざら
    BUCKETS.forEach((b, i) => {
      const x = i * gap + gap / 2, y = this.bucketTop + 30;
      this.add.rectangle(i * gap + 1, this.bucketTop, gap - 2, 60, b === 'lucky' ? 0xf59e0b : KINDS[b].color, 0.55).setOrigin(0);
      if (b === 'lucky') this.add.text(x, y, '★', textStyle(28, '#fde047', '#7c2d12')).setOrigin(0.5);
      else this.add.image(x, y, `unit_${KINDS[b].hero}`, 0).setScale(40 / HERO_PX);
    });
    // しょうかんボタン
    const bw = PW - 24, by = h - btnH / 2 - 12;
    const bg = this.add.rectangle(0, 0, bw, btnH - 8, 0x16a34a).setStrokeStyle(4, 0xffffff);
    const label = this.add.text(0, -14, 'しょうかん', textStyle(26, '#ffffff', '#14532d')).setOrigin(0.5);
    this.costText = this.add.text(10, 20, '', textStyle(22, '#fde047', '#14532d')).setOrigin(0.5);
    const ci = this.icon('coin', -24, 20, 26);
    this.btn = this.add.container(PW / 2, by, [bg, label, this.costText, ci]).setSize(bw, btnH - 8);
    this.refreshCoins();
  }

  private refreshCoins() {
    this.coinText.setText(`${this.coins}`);
    this.costText.setText(`${this.cost}`);
    this.btn.setAlpha(this.coins >= this.cost ? 1 : 0.5);
  }

  private summon() {
    if (this.coins < this.cost) {
      sfx.wall();
      this.tweens.add({ targets: this.btn, x: this.btn.x + 8, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    this.coins -= this.cost; this.summons++;
    this.refreshCoins();
    sfx.shoot();
    this.tweens.add({ targets: this.btn, scale: 0.9, duration: 60, yoyo: true });
    const obj = this.add.circle(PW / 2 + (Math.random() - 0.5) * 20, TOP + 50, 11, 0xfde047).setStrokeStyle(3, 0xffffff).setDepth(20);
    this.balls.push({ obj, vx: (Math.random() - 0.5) * 60, vy: 0 });
  }

  private updateBalls(dt: number) {
    for (const b of this.balls) {
      for (let s = 0; s < 2; s++) { // すりぬけないよう 2回に わける
        const d = dt / 2;
        b.vy += 900 * d;
        b.obj.x += b.vx * d; b.obj.y += b.vy * d;
        if (b.obj.x < 12) { b.obj.x = 12; b.vx = Math.abs(b.vx) * 0.6; }
        if (b.obj.x > PW - 12) { b.obj.x = PW - 12; b.vx = -Math.abs(b.vx) * 0.6; }
        for (const p of this.pegs) {
          const dx = b.obj.x - p.x, dy = b.obj.y - p.y, dist = Math.hypot(dx, dy);
          if (dist > 17 || dist === 0) continue;
          const nx = dx / dist, ny = dy / dist;
          b.obj.x = p.x + nx * 17; b.obj.y = p.y + ny * 17;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) { b.vx -= 1.55 * dot * nx; b.vy -= 1.55 * dot * ny; }
          b.vx += (Math.random() - 0.5) * 50;
          if (p.scale === 1) {
            p.setFillStyle(0xfde047);
            sfx.hit(Math.floor(Math.random() * 12));
            this.tweens.add({ targets: p, scale: 1.6, duration: 80, yoyo: true, onComplete: () => p.setFillStyle(0xc4b5fd) });
          }
        }
      }
      if (b.obj.y > this.bucketTop + 20) {
        const i = Phaser.Math.Clamp(Math.floor(b.obj.x / (PW / 5)), 0, 4);
        this.land(BUCKETS[i], b.obj.x, b.obj.y);
        b.obj.destroy();
      }
    }
    this.balls = this.balls.filter(b => b.obj.active);
  }

  private land(bucket: 'lucky' | Kind, x: number, y: number) {
    const lucky = bucket === 'lucky';
    const kind = lucky ? KIND_IDS[Math.floor(Math.random() * KIND_IDS.length)] : bucket;
    const lv = lucky ? 2 : 1;
    const empty = this.units.map((u, i) => (u ? -1 : i)).filter(i => i >= 0);
    if (!empty.length) {
      this.coins += this.cost; this.refreshCoins();
      this.popText(PW / 2, y - 30, 'いっぱい！', '#ffffff', 26);
      return;
    }
    if (lucky) { this.hud.big('ラッキー！', '#f59e0b'); sfx.up(); } else sfx.pop(1.2);
    this.ring(x, y, 50, lucky ? 0xfde047 : KINDS[kind].color);
    // まえの れつ（さくに ちかい ほう）から うめる
    empty.sort((a, b) => (b % COLS) - (a % COLS) || Math.random() - 0.5);
    const u = this.addUnit(kind, lv, empty[0]);
    const [tx, ty] = this.slotPos(empty[0]);
    u.spr.setPosition(x, y); u.ring.setVisible(false); u.badge.setVisible(false);
    this.tweens.add({
      targets: u.spr, x: tx, y: ty - 10, duration: 380, ease: 'Quad.Out',
      onUpdate: tw => { u.spr.y -= Math.sin(tw.progress * Math.PI) * 6; },
      onComplete: () => { this.placeUnit(u); this.ring(tx, ty, this.slot * 0.6, KINDS[kind].color); sfx.wall(); },
    });
  }

  // ---- なかま ----
  private unitScale(lv: number) { return (this.slot * (0.72 + lv * 0.07)) / HERO_PX; }

  private addUnit(kind: Kind, lv: number, slot: number): Unit {
    const k = KINDS[kind];
    const ring = this.add.ellipse(0, 0, this.slot * 0.8, this.slot * 0.3, k.color, 0.55).setDepth(6);
    const spr = this.add.sprite(0, 0, `unit_${k.hero}`, 0).setScale(this.unitScale(lv)).setDepth(7);
    const badge = this.add.text(0, 0, '', textStyle(18, '#ffffff', '#1f2937')).setOrigin(0.5).setDepth(8);
    const u: Unit = { kind, lv, slot, spr, ring, badge, cd: Math.random() * k.cd };
    this.units[slot] = u;
    this.placeUnit(u);
    return u;
  }

  private placeUnit(u: Unit) {
    const [x, y] = this.slotPos(u.slot);
    u.spr.setPosition(x, y - 10).setScale(this.unitScale(u.lv)).setDepth(7);
    u.ring.setPosition(x, y + this.slot * 0.28).setVisible(true).setFillStyle(KINDS[u.kind].color, 0.35 + u.lv * 0.12);
    u.badge.setPosition(x, y - this.slot * 0.5).setVisible(true).setText('★'.repeat(u.lv)).setColor(u.lv >= 4 ? '#fde047' : '#ffffff');
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.ended) return;
    const b = this.btn.getBounds();
    if (b.contains(p.x, p.y)) return this.summon();
    const i = this.slotAt(p.x, p.y);
    const u = i >= 0 ? this.units[i] : null;
    if (u && !this.drag && !this.tweens.isTweening(u.spr)) {
      this.drag = { unit: u, moved: false, sx: p.x, sy: p.y, id: p.id };
      u.spr.setDepth(50).setScale(this.unitScale(u.lv) * 1.15);
    }
  }

  private drop(p: Phaser.Input.Pointer) {
    const { unit } = this.drag!;
    this.drag = null;
    const to = this.slotAt(p.x, p.y);
    const other = to >= 0 ? this.units[to] : null;
    if (to < 0 || to === unit.slot) return this.placeUnit(unit);
    if (!other) {
      this.units[unit.slot] = null; unit.slot = to; this.units[to] = unit;
      return this.placeUnit(unit);
    }
    if (other.kind === unit.kind && other.lv === unit.lv && unit.lv < MAX_LV) return this.merge(unit, other);
    // ちがう なかまなら いれかえ
    const from = unit.slot;
    unit.slot = to; other.slot = from;
    this.units[to] = unit; this.units[from] = other;
    this.placeUnit(unit); this.placeUnit(other);
  }

  private merge(a: Unit, into: Unit) {
    this.units[a.slot] = null;
    a.spr.destroy(); a.ring.destroy(); a.badge.destroy();
    into.lv++;
    this.placeUnit(into);
    const [x, y] = this.slotPos(into.slot);
    sfx.up();
    this.hitstop(80);
    this.cameras.main.flash(120, 255, 255, 255);
    this.ring(x, y, this.slot, 0xfde047, 10);
    this.burst(x, y, 'star', 10, this.slot, 30);
    this.popText(x, Math.max(TOP + 40, y - this.slot * 0.6), `がったい！ Lv${into.lv}`, '#f59e0b', 28);
    const s = this.unitScale(into.lv);
    into.spr.setScale(s * 0.3);
    this.tweens.add({ targets: into.spr, scale: s, duration: 320, ease: 'Back.Out' });
  }

  // ---- てき ----
  private spawn(dt: number) {
    const newWave = Math.floor(this.t / 25) + 1;
    if (newWave !== this.wave && !this.bossSpawned) { this.wave = newWave; if (this.wave > 1) this.hud.big(`WAVE ${this.wave}`, '#7c3aed'); }
    if (!this.bossSpawned && this.t >= this.cfg.seconds - 30) {
      this.bossSpawned = true;
      this.hud.big('ボスが きた！', '#ef4444');
      this.cameras.main.shake(400, 0.01);
      this.addZombie('dragon', 140, (this.cfg.easy ? 250 : 500), 18, 30, true, Math.floor(ROWS / 2));
    }
    this.spawnCd -= dt;
    if (this.spawnCd > 0) return;
    this.spawnCd = Math.max(0.3, 1.2 - this.t / 90) * (this.cfg.easy ? 1.4 : 1);
    const types = ZOMBIES.filter(z => z.from <= this.t);
    let r = Math.random() * types.reduce((a, z) => a + z.weight, 0);
    const z = types.find(z => (r -= z.weight) < 0) ?? types[0];
    this.addZombie(z.kind, z.size, z.hp * (1 + this.t / 35), z.speed * (this.cfg.easy ? 0.8 : 1), z.coin, false, Math.floor(Math.random() * ROWS));
  }

  private addZombie(kind: keyof typeof ENEMY_FRAME, size: number, hp: number, speed: number, coin: number, boss: boolean, lane: number) {
    const x = this.scale.width + size, y = TOP + (lane + 0.5) * this.laneH + (Math.random() - 0.5) * this.laneH * 0.3;
    const base = size / ENEMY_PX;
    const obj = this.add.image(x, y, 'enemies', ENEMY_FRAME[kind]).setScale(base).setDepth(boss ? 12 : 10);
    const shadow = this.add.image(x, y, 'shadow').setScale(size / 64).setDepth(2);
    const bar = this.add.graphics().setDepth(13);
    this.zombies.push({ obj, shadow, bar, hp, maxHp: hp, speed: speed * (0.85 + Math.random() * 0.3), lane, r: size * 0.38, boss, coin, atkCd: 0, base, phase: Math.random() * 6, kx: 0 });
  }

  private moveZombies(dt: number) {
    for (const z of this.zombies) {
      const stop = this.fenceX + 10 + z.r;
      z.obj.x = Math.max(stop, z.obj.x - z.speed * dt + z.kx * dt);
      z.kx *= Math.pow(0.02, dt);
      const w = Math.sin(this.t * 9 + z.phase) * 0.07;
      if (!this.tweens.isTweening(z.obj)) z.obj.setScale(z.base * (1 - w), z.base * (1 + w));
      z.shadow.setPosition(z.obj.x, z.obj.y + z.r * 1.05);
      z.bar.setPosition(z.obj.x, z.obj.y - z.r - 14);
      if (z.obj.x <= stop + 0.5) {
        z.atkCd -= dt;
        if (z.atkCd <= 0) {
          z.atkCd = 1.4;
          this.tweens.add({ targets: z.obj, x: z.obj.x - 12, duration: 80, yoyo: true });
          this.fence -= z.boss ? 3 : 1;
          this.hud.setHearts(Math.max(0, this.fence), this.maxFence);
          sfx.hurt();
          this.cameras.main.shake(120, 0.006);
          if (this.fence <= 0) return this.finish(false);
        }
      }
    }
  }

  private drawBar(z: Zombie) {
    z.bar.clear().fillStyle(0x1f2937, 0.6).fillRect(-z.r, 0, z.r * 2, 6).fillStyle(z.boss ? 0xef4444 : 0x22c55e).fillRect(-z.r, 0, z.r * 2 * Math.max(0, z.hp / z.maxHp), 6);
  }

  private damage(z: Zombie, dmg: number, knock = 0) {
    if (z.hp <= 0) return;
    z.hp -= dmg;
    z.kx += knock;
    this.drawBar(z);
    z.obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(60, () => z.obj.active && z.obj.clearTint());
    if (dmg >= 2) this.popText(z.obj.x, z.obj.y - z.r, `${Math.round(dmg)}`, '#ffffff', 18 + Math.min(dmg, 30) * 0.6);
    if (z.hp > 0) return;
    this.kills++;
    this.hud.setScore(`${this.kills}`);
    sfx.pop(0.9);
    z.shadow.destroy(); z.bar.destroy();
    const dead = z.obj;
    this.tweens.add({ targets: dead, scale: 0, angle: -360, alpha: 0, duration: 280, onComplete: () => dead.destroy() });
    // コインが とんでくる
    const n = Math.min(z.coin, 6);
    for (let i = 0; i < n; i++) {
      const c = this.icon('coin', dead.x, dead.y, 26).setDepth(60);
      this.tweens.add({
        targets: c, x: dead.x + (Math.random() - 0.5) * 80, y: dead.y - 30 - Math.random() * 40, duration: 200, ease: 'Quad.Out',
        onComplete: () => this.tweens.add({ targets: c, x: 64, y: TOP + 26, duration: 450, delay: i * 40, ease: 'Quad.In', onComplete: () => c.destroy() }),
      });
    }
    this.time.delayedCall(650, () => { this.coins += z.coin; this.refreshCoins(); sfx.pop(1.6); });
    if (z.boss) { sfx.boom(); this.cameras.main.shake(500, 0.02); this.burst(dead.x, dead.y, 'star', 20, 200, 40); }
  }

  // ---- こうげき ----
  private front(): Zombie | undefined {
    let best: Zombie | undefined;
    for (const z of this.zombies) if (z.hp > 0 && z.obj.x < this.scale.width - 10 && (!best || z.obj.x < best.obj.x)) best = z;
    return best;
  }

  private attack(dt: number) {
    for (const u of this.units) {
      if (!u || u === this.drag?.unit || this.tweens.isTweening(u.spr)) continue;
      u.cd -= dt;
      if (u.cd > 0) continue;
      const k = KINDS[u.kind], dmg = k.dmg * power(u.lv);
      const x = u.spr.x + this.slot * 0.2, y = u.spr.y;
      if (u.kind === 'ninja') {
        const lane = Math.floor(u.slot / COLS);
        if (!this.zombies.some(z => z.lane === lane && z.hp > 0 && z.obj.x < this.scale.width)) { u.cd = 0.2; continue; }
        const obj = this.icon('star', x, y, 30 + u.lv * 5).setDepth(15);
        this.shots.push({ obj, kind: 'ninja', vx: 720, vy: 0, dmg, hit: new Set() });
      } else {
        const t = this.front();
        if (!t) { u.cd = 0.2; continue; }
        if (u.kind === 'magic') {
          const obj = this.icon('bolt', x, y, 30 + u.lv * 5).setDepth(15);
          this.shots.push({ obj, kind: 'magic', vx: 0, vy: 0, target: t, dmg, hit: new Set() });
        } else {
          this.lobFire(x, y, t, dmg, u.lv);
        }
      }
      u.cd = k.cd;
      this.tweens.add({ targets: u.spr, scaleX: u.spr.scaleX * 1.15, scaleY: u.spr.scaleY * 0.88, duration: 70, yoyo: true });
    }
  }

  private lobFire(x: number, y: number, t: Zombie, dmg: number, lv: number) {
    const tx = t.obj.x - t.speed * 0.5, ty = t.obj.y; // すこし さきを ねらう
    const obj = this.icon('flame', x, y, 34 + lv * 6).setDepth(15);
    const ctl = { p: 0 };
    this.tweens.add({
      targets: ctl, p: 1, duration: 500,
      onUpdate: () => obj.setPosition(x + (tx - x) * ctl.p, y + (ty - y) * ctl.p - Math.sin(ctl.p * Math.PI) * 90).setRotation(ctl.p * 6),
      onComplete: () => {
        obj.destroy();
        const R = 60 + lv * 12;
        sfx.boom();
        const c = this.add.circle(tx, ty, R, 0xf97316, 0.35).setDepth(14);
        this.tweens.add({ targets: c, alpha: 0, scale: 1.2, duration: 300, onComplete: () => c.destroy() });
        this.burst(tx, ty, 'flame', 5, R, 26);
        for (const z of [...this.zombies]) if (Phaser.Math.Distance.Between(z.obj.x, z.obj.y, tx, ty) < R + z.r) this.damage(z, dmg, 90);
      },
    });
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      if (s.kind === 'magic') {
        if (!s.target || s.target.hp <= 0) s.target = this.front();
        if (!s.target) { s.obj.destroy(); continue; }
        const dx = s.target.obj.x - s.obj.x, dy = s.target.obj.y - s.obj.y, d = Math.hypot(dx, dy) || 1;
        s.vx = dx / d * 650; s.vy = dy / d * 650;
        s.obj.setRotation(Math.atan2(dy, dx) + Math.PI / 4);
        if (d < s.target.r + 8) { this.damage(s.target, s.dmg, 40); sfx.hit(3); s.obj.destroy(); continue; }
      } else {
        s.obj.rotation += dt * 20;
        for (const z of this.zombies) {
          if (z.hp <= 0 || s.hit.has(z) || Math.abs(z.obj.x - s.obj.x) > z.r + 12 || Math.abs(z.obj.y - s.obj.y) > z.r + 20) continue;
          s.hit.add(z); this.damage(z, s.dmg, 60); sfx.hit(s.hit.size * 2);
        }
        if (s.obj.x > this.scale.width + 40) { s.obj.destroy(); continue; }
      }
      s.obj.x += s.vx * dt; s.obj.y += s.vy * dt;
    }
    this.shots = this.shots.filter(s => s.obj.active);
    this.zombies = this.zombies.filter(z => z.hp > 0);
  }

  protected tick(dt: number) {
    this.updateBalls(dt);
    this.spawn(dt);
    this.moveZombies(dt);
    if (this.ended) return;
    this.attack(dt);
    this.updateShots(dt);
  }

  protected timeUpCleared() { return this.fence > 0; }

  protected result(cleared: boolean): LabResult {
    const best = Math.max(0, ...this.units.map(u => u?.lv ?? 0));
    return {
      cleared,
      stats: [
        { icon: 'swords', text: `${this.kills}` },
        { icon: 'star', text: `さいこう Lv${best}` },
        { icon: 'trophy', text: `WAVE ${this.wave}` },
      ],
    };
  }
}
