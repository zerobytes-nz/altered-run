import Phaser from 'phaser';
import { GAME_W, GAME_H, GROUND_Y, RUN } from '../config';
import { ATLAS } from '../art/placeholder';
import { guestLoadout } from '../loadout';
import { loadScores } from '../systems/highscores';
import { button, slotRow, text } from '../ui';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    const lo = guestLoadout();
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x141c3a).setOrigin(0);
    this.add.tileSprite(0, GROUND_Y - 200, GAME_W, 220, 'bg-far').setOrigin(0, 1).setScrollFactor(0).setY(GROUND_Y - 40);
    this.add.tileSprite(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y, 'ground').setOrigin(0);

    text(this, GAME_W / 2, 56, 'ALTERED RUN', 56, '#ffffff', '900').setOrigin(0.5);
    text(this, GAME_W / 2, 104, 'Your NFTs become AWIs (Altered World Items)', 18, '#8fa3ff', '600').setOrigin(0.5);

    const hero = this.add.sprite(150, GROUND_Y, ATLAS, `${lo.skin.id}/idle`).setOrigin(0.5, 1).setScale(1.4);
    hero.play(`${lo.skin.id}-run`);
    this.add.sprite(70, GROUND_Y - 6, ATLAS, `pet/${lo.pet.id}0`).setOrigin(0.5, 1).play(`${lo.pet.id}-move`);

    text(this, 320, 160, 'GUEST LOADOUT', 14, '#8fa3ff').setOrigin(0, 0.5);
    slotRow(this, 320, 190, lo, 72, 14);

    button(this, GAME_W / 2 + 40, 350, '▶  RUN', () => this.play(), 260, 68, 0xf72585);
    button(this, GAME_W / 2 + 40, 425, 'High scores', () => this.showScores(), 260, 50, 0x3a0ca3);
    text(this, GAME_W - 16, GAME_H - 12, 'Tap = jump · Swipe → attack · Swipe ↓ slide', 14, '#c0c8ff', '600').setOrigin(1, 1);
    text(this, 16, GAME_H - 12, `v0.1 · ${RUN.durationSec}s runs`, 12, '#6c7bbd', '600').setOrigin(0, 1);

    this.input.keyboard?.once('keydown-SPACE', () => this.play());
  }

  private play(): void {
    // Fullscreen + landscape lock need a user gesture; both are best-effort.
    if (this.sys.game.device.input.touch && !this.scale.isFullscreen) {
      try { this.scale.startFullscreen(); } catch { /* not allowed */ }
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('landscape').catch(() => {});
    }
    this.scene.start('Run', { loadout: guestLoadout() });
  }

  private showScores(): void {
    const layer = this.add.container(0, 0).setDepth(10);
    const shade = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(GAME_W / 2, GAME_H / 2, 520, 420, 0x1b2550).setStrokeStyle(3, 0x8fa3ff, 0.6);
    layer.add([shade, panel, text(this, GAME_W / 2, 90, 'HIGH SCORES', 30).setOrigin(0.5)]);
    const list = loadScores();
    if (!list.length) layer.add(text(this, GAME_W / 2, GAME_H / 2, 'No runs yet. Go set one!', 20, '#c0c8ff', '600').setOrigin(0.5));
    list.forEach((e, i) => {
      const y = 132 + i * 30;
      const d = new Date(e.date);
      layer.add(text(this, GAME_W / 2 - 220, y, `${i + 1}.`, 18, '#8fa3ff'));
      layer.add(text(this, GAME_W / 2 - 180, y, `${e.score}`, 18, '#ffffff'));
      layer.add(text(this, GAME_W / 2 - 40, y, `${e.skin}${e.finished ? ' 🏁' : ''}`, 16, '#c0c8ff', '600'));
      layer.add(text(this, GAME_W / 2 + 220, y, `${d.getMonth() + 1}/${d.getDate()}`, 16, '#6c7bbd', '600').setOrigin(1, 0));
    });
    shade.once('pointerup', () => layer.destroy());
  }
}
