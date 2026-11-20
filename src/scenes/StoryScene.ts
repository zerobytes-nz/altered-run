import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { STORY, markSeen } from '../systems/story';
import { button, muteButton, text } from '../ui';

export interface StoryData {
  cardId: string;
  /** Where to go afterwards (the run, the map...). */
  next: { scene: string; data?: object };
}

/**
 * One story card (THEOS-40): lines fade in one by one. Tap to show the rest, tap again to go on;
 * "Skip" goes straight on. Marked as seen as soon as it opens, so it never blocks play twice.
 */
export class StoryScene extends Phaser.Scene {
  private lines: Phaser.GameObjects.Text[] = [];
  private shown = 0;
  private done = false;
  private data_!: StoryData;

  constructor() { super('Story'); }

  init(data: StoryData): void {
    this.data_ = data; this.lines = []; this.shown = 0; this.done = false;
  }

  create(): void {
    const card = STORY[this.data_.cardId];
    if (!card) { this.go(); return; }
    markSeen(card.id);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b1020).setOrigin(0);
    // A slow drifting glow in the world's colour.
    const glow = this.add.circle(GAME_W / 2, GAME_H / 2, 260, card.color, 0.12);
    this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.05, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.rectangle(GAME_W / 2, 92, 520, 4, card.color, 0.8);
    const title = text(this, GAME_W / 2, 64, card.title, 34, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 6).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, y: 60, duration: 500 });

    const top = 140, step = Math.min(48, 300 / Math.max(1, card.lines.length));
    this.lines = card.lines.map((l, i) => text(this, GAME_W / 2, top + i * step, l, 21, '#e8ecff', '600').setOrigin(0.5).setAlpha(0));
    this.time.addEvent({ delay: 700, repeat: this.lines.length - 1, startAt: 0, callback: () => this.reveal() });

    const hint = text(this, GAME_W / 2, GAME_H - 40, 'Tap to continue', 16, '#8fa3ff', '700').setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    const skip = button(this, GAME_W - 90, GAME_H - 40, 'Skip  ▶▶', () => this.go(), 140, 44, 0x3a0ca3);
    (skip.list[1] as Phaser.GameObjects.Text).setFontSize(18);
    muteButton(this, GAME_W - 34, 34);

    this.input.on('pointerup', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length) return; // the Skip button handles itself
      this.advance();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.advance());
    this.input.keyboard?.on('keydown-ESC', () => this.go());
  }

  private reveal(): void {
    const t = this.lines[this.shown++];
    if (t) this.tweens.add({ targets: t, alpha: 1, duration: 450 });
  }

  /** First tap shows every line; the next goes on. */
  private advance(): void {
    if (this.shown < this.lines.length) {
      this.time.removeAllEvents();
      while (this.shown < this.lines.length) this.reveal();
      return;
    }
    this.go();
  }

  private go(): void {
    if (this.done) return;
    this.done = true;
    this.scene.start(this.data_.next.scene, this.data_.next.data);
  }
}
