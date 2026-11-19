import Phaser from 'phaser';
import { GAME_W, GAME_H, DEBUG } from '../config';
import { ensureLoaded } from '../assets';
import { ELEMENT_COLOR, ELEMENT_ICON, hex } from '../awi';
import { currentLoadout } from '../theoswap';
import { WORLDS, getStage, isBuilt, type Stage, type World } from '../stages';
import { STAR_GOALS, isUnlocked, isWorldOpen, maxStars, resetProgress, stageRecord, starsOf, suggestedStage, totalStars } from '../systems/progress';
import { button, muteButton, text } from '../ui';

const NODE_R = 34;

/** The world map: pick a world (tabs), then a stage on its path. The panel at the bottom plays it. */
export class MapScene extends Phaser.Scene {
  private world!: World;
  private selected!: Stage;
  private layer!: Phaser.GameObjects.Container;

  constructor() { super('Map'); }

  /** `stageId` selects that stage (coming back from a result); otherwise the suggested next stage. */
  init(data: { stageId?: string }): void {
    this.selected = getStage(data?.stageId) ?? suggestedStage();
    this.world = WORLDS.find((w) => w.num === this.selected.world) ?? WORLDS[0];
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    // Made once, outside the redrawn layer (it keeps a mute listener until the scene shuts down).
    muteButton(this, GAME_W - 34, 34).setDepth(5);
    this.draw();
    this.input.keyboard?.on('keydown-SPACE', () => this.play());
    this.input.keyboard?.on('keydown-ENTER', () => this.play());
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Menu'));
    if (DEBUG) this.input.keyboard?.on('keydown-R', () => { resetProgress(); this.scene.restart({}); });
  }

  private draw(): void {
    this.layer.destroy();
    const L = (this.layer = this.add.container(0, 0).setDepth(0));
    const col = ELEMENT_COLOR[this.world.element];

    // Background tinted by the world's element.
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x141c3a, 0x141c3a, Phaser.Display.Color.IntegerToColor(col).darken(70).color, Phaser.Display.Color.IntegerToColor(col).darken(70).color, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    L.add(bg);

    L.add(button(this, 82, 34, '← Menu', () => this.scene.start('Menu'), 140, 44, 0x1b2550));
    L.add(text(this, GAME_W / 2, 34, 'WORLD MAP', 30, '#ffffff', '900').setOrigin(0.5));
    L.add(text(this, GAME_W - 76, 34, `★ ${totalStars()} / ${maxStars()}`, 20, '#ffd34d', '900').setOrigin(1, 0.5));

    this.drawWorldTabs(L);
    this.drawPath(L, col);
    this.drawPanel(L);
  }

  /** Four world tabs. Closed worlds show what opens them. */
  private drawWorldTabs(L: Phaser.GameObjects.Container): void {
    const w = 214, gap = 14, x0 = GAME_W / 2 - (WORLDS.length * w + (WORLDS.length - 1) * gap) / 2;
    WORLDS.forEach((wd, i) => {
      const x = x0 + i * (w + gap) + w / 2, y = 96;
      const open = isWorldOpen(wd), built = wd.stages.some(isBuilt), on = wd === this.world;
      const col = ELEMENT_COLOR[wd.element];
      const box = this.add.rectangle(x, y, w, 62, on ? 0x2a3a7a : 0x1b2550, open ? 1 : 0.7).setStrokeStyle(on ? 4 : 2, col, open ? 1 : 0.35);
      const title = text(this, x, y - 12, `${ELEMENT_ICON[wd.element]} ${wd.num}. ${wd.name}`, 16, open ? '#ffffff' : '#8f97c0', '800').setOrigin(0.5);
      const stars = wd.stages.reduce((n, s) => n + starsOf(s.id).filter(Boolean).length, 0);
      const sub = !built ? 'Coming soon' : open ? `★ ${stars} / ${wd.stages.filter(isBuilt).length * 3}` : `🔒 ${wd.needStars} ★ needed`;
      const subT = text(this, x, y + 13, sub, 13, open ? hex(col) : '#8f97c0', '700').setOrigin(0.5);
      box.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        this.world = wd;
        this.selected = wd.stages.find((s) => isUnlocked(s) && starsOf(s.id).filter(Boolean).length < 3) ?? wd.stages[0];
        this.draw();
      });
      L.add([box, title, subT]);
    });
  }

  /** The world's stages as nodes on a winding path; the boss is last and bigger. */
  private drawPath(L: Phaser.GameObjects.Container, col: number): void {
    const stages = this.world.stages, n = stages.length;
    const pts = stages.map((_, i) => ({ x: 110 + (i * (GAME_W - 220)) / Math.max(1, n - 1), y: 262 + (i % 2 ? -44 : 34) }));
    const road = this.add.graphics();
    road.lineStyle(10, 0x0b1020, 0.55);
    for (let i = 1; i < n; i++) road.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    L.add(road);

    stages.forEach((s, i) => {
      const { x, y } = pts[i];
      const r = s.boss ? NODE_R + 8 : NODE_R;
      const open = isUnlocked(s), built = isBuilt(s), on = s === this.selected;
      const stars = starsOf(s.id);
      const fill = open ? (stars[0] ? col : 0x4361ee) : 0x2b2f4a;
      const ring = this.add.circle(x, y, r + 6, 0xffffff, on ? 0.9 : 0);
      const node = this.add.circle(x, y, r, fill, open ? 1 : 0.8).setStrokeStyle(4, 0xffffff, open ? 0.7 : 0.2);
      const label = s.boss ? '☠' : `${s.num}`;
      const t = text(this, x, y, open ? label : built ? '🔒' : '…', s.boss ? 30 : 26, open ? '#ffffff' : '#8f97c0', '900').setOrigin(0.5);
      const starRow = text(this, x, y + r + 16, stars.map((g) => (g ? '★' : '☆')).join(''), 18, stars.some(Boolean) ? '#ffd34d' : '#6c7bbd', '900').setOrigin(0.5);
      node.setInteractive({ useHandCursor: true }).on('pointerup', () => { this.selected = s; this.draw(); });
      L.add([ring, node, t, starRow]);
    });
  }

  /** The selected stage: name, the three star goals (ticked when earned), best score and PLAY. */
  private drawPanel(L: Phaser.GameObjects.Container): void {
    const s = this.selected, y = 448;
    const open = isUnlocked(s), built = isBuilt(s), stars = starsOf(s.id), rec = stageRecord(s.id);
    L.add(this.add.rectangle(GAME_W / 2, y, GAME_W - 40, 140, 0x0b1020, 0.75).setStrokeStyle(2, 0x8fa3ff, 0.4));
    L.add(text(this, 44, y - 50, `${s.world}-${s.num}${s.boss ? ' · BOSS' : ''}`, 15, '#8fa3ff', '800'));
    L.add(text(this, 44, y - 30, s.name, 28, '#ffffff', '900'));

    if (!built) {
      L.add(text(this, 44, y + 14, 'Coming soon: this stage is still being built.', 17, '#c0c8ff', '600'));
      return;
    }
    STAR_GOALS.forEach((g, i) => {
      L.add(text(this, 44 + i * 190, y + 18, `${stars[i] ? '★' : '☆'} ${g}`, 16, stars[i] ? '#ffd34d' : '#c0c8ff', '700'));
    });
    if (rec?.best) L.add(text(this, 44, y + 44, `Best ${rec.best}`, 14, '#8fa3ff', '700'));

    if (open) {
      L.add(button(this, GAME_W - 140, y, '▶  PLAY', () => this.play(), 200, 64, 0xf72585));
    } else {
      const prev = this.world.stages[this.world.stages.indexOf(s) - 1];
      const why = !isWorldOpen(this.world) ? `Opens with ${this.world.needStars} ★ and World ${this.world.num - 1} finished`
        : prev ? `Finish ${prev.world}-${prev.num} first` : 'Locked';
      L.add(text(this, GAME_W - 44, y, `🔒 ${why}`, 16, '#c0c8ff', '700').setOrigin(1, 0.5));
    }
  }

  private play(): void {
    const s = this.selected;
    if (!isUnlocked(s)) return;
    // Fullscreen + landscape lock need a user gesture; both are best-effort (same as the menu's RUN).
    if (this.sys.game.device.input.touch && !this.scale.isFullscreen) {
      try { this.scale.startFullscreen(); } catch { /* not allowed */ }
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('landscape').catch(() => {});
    }
    const lo = currentLoadout();
    ensureLoaded(this, lo, () => this.scene.start('Run', { loadout: lo, stageId: s.id }));
  }
}
