import Phaser from 'phaser';
import { heroSheet, type HeroId } from '../art';
import { assetUrl } from '../assets/sprite';
import { loadSheet } from '../games/kit/phaser';
import { sfx } from '../games/kit/sfx';
import { LAB_IMAGES, LAB_SHEETS, iconFrame, loadLabSheets, type IconName } from './assets';

// あそびラボ（ためしプレイ用のミニゲーム）で共通に使うもの

export { sfx }; // こうかおんは ゲームと共通（src/games/kit/sfx.ts）

export interface LabConfig {
  avatar: HeroId;
  easy: boolean;     // 年長さん向け
  seconds: number;
  onEnd: (r: LabResult) => void;
}

export interface LabResult {
  cleared: boolean;
  stats: { icon: IconName; text: string }[];
}

export const ICON_PX = LAB_SHEETS.icons.cell;
export const HERO_PX = 160;
export const ENEMY_PX = LAB_SHEETS.enemies.cell;
export const FONT = '"Zen Maru Gothic", sans-serif';

export const textStyle = (size: number, color = '#1f2937', stroke = '#ffffff') =>
  ({ fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke, strokeThickness: Math.max(4, size / 6) });

// ---- 画面のはしの表示（タイマー・スコア・ハート・スティック） ----
// ゲーム側のカメラをズームしても大きさが変わらないように、別のシーンに描く
export class HudScene extends Phaser.Scene {
  private timeText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private stickGfx!: Phaser.GameObjects.Graphics;

  constructor() { super('hud'); }

  create() {
    this.timeText = this.add.text(0, 12, '', textStyle(28)).setOrigin(0.5, 0);
    this.scoreText = this.add.text(0, 12, '', textStyle(28)).setOrigin(1, 0);
    this.stickGfx = this.add.graphics();
    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private layout() {
    this.timeText.setX(this.scale.width / 2);
    this.scoreText.setX(this.scale.width - 14);
  }

  setTime(left: number) {
    const s = Math.max(0, Math.ceil(left));
    this.timeText?.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  }

  setScore(text: string) { this.scoreText?.setText(text); }

  setHearts(n: number, max: number) {
    if (!this.sys.isActive()) return;
    while (this.hearts.length < max) {
      const i = this.hearts.length, { sheet, frame } = iconFrame('heart');
      this.hearts.push(this.add.image(30 + (i % 10) * 34, 32 + Math.floor(i / 10) * 32, sheet, frame).setScale(34 / ICON_PX));
    }
    this.hearts.forEach((h, i) => (i < n ? h.clearTint().setAlpha(1) : h.setTint(0x6b7280).setAlpha(0.45)));
  }

  drawStick(s: { active: boolean; bx: number; by: number; dx: number; dy: number }) {
    this.stickGfx.clear();
    if (!s.active) return;
    this.stickGfx.fillStyle(0xffffff, 0.35).fillCircle(s.bx, s.by, 60).fillStyle(0x2563eb, 0.6).fillCircle(s.bx + s.dx * 60, s.by + s.dy * 60, 26);
  }

  // 画面のまんなかに大きな文字を出す（「WAVE 2」「おおきくなった！」など）
  big(text: string, color = '#f59e0b', size = 64) {
    const t = this.add.text(this.scale.width / 2, this.scale.height * 0.38, text, textStyle(size, color, '#ffffff')).setOrigin(0.5).setScale(0.2);
    this.tweens.chain({
      targets: t,
      tweens: [
        { scale: 1.15, duration: 180, ease: 'Back.Out' },
        { scale: 1, duration: 100 },
        { alpha: 0, y: t.y - 40, delay: 650, duration: 300 },
      ],
      onComplete: () => t.destroy(),
    });
  }
}

type Stick = { active: boolean; id: number; bx: number; by: number; dx: number; dy: number };
const NO_STICK: Stick = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };

export abstract class LabScene extends Phaser.Scene {
  protected cfg!: LabConfig;
  protected t = 0;
  protected ended = false;
  protected stick: Stick = { ...NO_STICK };
  private freezeUntil = 0;

  init(cfg: LabConfig) { this.cfg = cfg; }

  protected get hud() { return this.scene.get('hud') as HudScene; }

  preload() {
    this.load.image('ground', assetUrl(LAB_IMAGES.ground));
    loadSheet(this, 'hero', heroSheet(this.cfg.avatar)); // 主人公は子どものアバター
    loadLabSheets(this);
  }

  create() {
    this.scene.bringToTop('hud');
    const g = this.make.graphics({}, false);
    g.fillStyle(0x000000, 0.28).fillEllipse(32, 12, 64, 24);
    g.generateTexture('shadow', 64, 24); g.destroy();
    this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('hero', { start: 0, end: 3 }), frameRate: 9, repeat: -1 });
    this.input.addPointer(2);
    this.setup();
    // 開発サーバーのときだけ、じどうプレイテスト（scripts/playtest.mjs）から さわれるようにする
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lab = this;
  }

  protected abstract setup(): void;
  protected abstract tick(dt: number): void;
  protected abstract result(cleared: boolean): LabResult;

  // 画面のどこをさわっても、そこを中心に動かせるスティック
  protected enableStick() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.stick.active) this.stick = { active: true, id: p.id, bx: p.x, by: p.y, dx: 0, dy: 0 };
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
  }

  update(time: number, deltaMs: number) {
    if (this.ended) return;
    this.hud.drawStick(this.stick);
    if (time < this.freezeUntil) return; // ヒットストップ
    const dt = Math.min(deltaMs, 50) / 1000;
    this.t += dt;
    this.tick(dt);
    if (this.ended) return;
    this.hud.setTime(this.cfg.seconds - this.t);
    if (this.t >= this.cfg.seconds) this.finish(this.timeUpCleared());
  }

  protected timeUpCleared() { return true; }

  // 当たった瞬間にほんの少し止める（手ごたえが出る）
  protected hitstop(ms: number) { this.freezeUntil = Math.max(this.freezeUntil, this.time.now + ms); }

  protected icon(name: IconName, x: number, y: number, size: number) {
    const { sheet, frame } = iconFrame(name);
    return this.add.image(x, y, sheet, frame).setScale(size / ICON_PX);
  }

  // ふわっと上がって消える文字
  protected popText(x: number, y: number, text: string, color = '#ffffff', size = 28, stroke = '#1f2937') {
    const t = this.add.text(x, y, text, textStyle(size, color, stroke)).setOrigin(0.5).setDepth(200).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, y: y - size * 1.4, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 420, duration: 250, onComplete: () => t.destroy() });
    return t;
  }

  // アイコンをぱっと飛びちらせる
  protected burst(x: number, y: number, name: IconName, n: number, spread: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = spread * (0.5 + Math.random() * 0.7);
      const s = this.icon(name, x, y, size * (0.6 + Math.random() * 0.6)).setDepth(150);
      this.tweens.add({
        targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, angle: (Math.random() - 0.5) * 360,
        alpha: 0, scale: s.scale * 0.3, duration: 350 + Math.random() * 200, ease: 'Cubic.Out', onComplete: () => s.destroy(),
      });
    }
  }

  protected ring(x: number, y: number, r: number, color: number, width = 8) {
    const c = this.add.circle(x, y, r, color, 0).setStrokeStyle(width, color, 0.9).setDepth(140).setScale(0.3);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => c.destroy() });
  }

  quit() { this.finish(false); }

  protected finish(cleared: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.stick = { ...NO_STICK };
    this.hud.drawStick(this.stick);
    if (cleared) sfx.fanfare();
    this.cfg.onEnd(this.result(cleared));
  }
}

export function startLab(parent: HTMLElement, scene: typeof LabScene, cfg: LabConfig): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#bbf7d0',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { activePointers: 3 },
    banner: false,
  });
  game.scene.add('hud', HudScene, true);
  game.scene.add('lab', scene as unknown as typeof Phaser.Scene, true, cfg);
  return game;
}
