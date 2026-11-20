import Phaser from 'phaser';
import { GAME_W, GAME_H, DEBUG } from '../config';
import { ACHIEVEMENTS, earnedAt, earnedCount, resetAchievements } from '../systems/achievements';
import { STORY, hasSeen, resetStory, worldCard } from '../systems/story';
import { WORLDS } from '../stages';
import { isWorldOpen } from '../systems/progress';
import { button, muteButton, text } from '../ui';

/** Achievements list (THEOS-40), plus the story cards seen so far to watch again. */
export class AchievementsScene extends Phaser.Scene {
  constructor() { super('Achievements'); }

  create(): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x141c3a).setOrigin(0);
    button(this, 82, 34, '← Back', () => this.scene.start('Menu'), 140, 44, 0x1b2550);
    text(this, GAME_W / 2, 34, 'AWARDS', 30, '#ffffff', '900').setOrigin(0.5);
    text(this, GAME_W - 76, 34, `🏆 ${earnedCount()} / ${ACHIEVEMENTS.length}`, 20, '#ffd34d', '900').setOrigin(1, 0.5);
    muteButton(this, GAME_W - 34, 34);

    // Two columns of achievement rows.
    const cols = 2, colW = 448, rowH = 44, x0 = 24, y0 = 70;
    const perCol = Math.ceil(ACHIEVEMENTS.length / cols);
    ACHIEVEMENTS.forEach((a, i) => {
      const x = x0 + Math.floor(i / perCol) * (colW + 16), y = y0 + (i % perCol) * rowH;
      const got = !!earnedAt(a.id);
      this.add.rectangle(x, y, colW, rowH - 6, got ? 0x2a3a7a : 0x1b2550).setOrigin(0).setStrokeStyle(2, got ? 0xffd34d : 0x8fa3ff, got ? 0.8 : 0.25);
      text(this, x + 12, y + (rowH - 6) / 2, got ? '🏆' : '🔒', 18).setOrigin(0, 0.5).setAlpha(got ? 1 : 0.5);
      text(this, x + 44, y + 10, a.name, 15, got ? '#ffd34d' : '#e8ecff', '900').setOrigin(0, 0.5);
      text(this, x + 44, y + 27, a.desc, 12, got ? '#e8ecff' : '#8f97c0', '600').setOrigin(0, 0.5);
      text(this, x + colW - 12, y + (rowH - 6) / 2, got ? '✓' : `+${a.reward} ●`, 14, got ? '#80ffdb' : '#ffd34d', '800').setOrigin(1, 0.5);
    });

    // Story cards seen so far: tap to watch again.
    const cards = [STORY.intro, ...WORLDS.slice(1).filter(isWorldOpen).map((w) => worldCard(w.num)!)].filter((c) => c && hasSeen(c.id));
    if (cards.length) {
      text(this, 24, GAME_H - 40, 'STORY', 14, '#8fa3ff', '900').setOrigin(0, 0.5);
      cards.forEach((c, i) => {
        const b = button(this, 140 + i * 150, GAME_H - 40, c.id === 'intro' ? 'Intro' : `World ${c.id.slice(5)}`,
          () => this.scene.start('Story', { cardId: c.id, next: { scene: 'Achievements' } }), 136, 40, 0x3a0ca3);
        (b.list[1] as Phaser.GameObjects.Text).setFontSize(16);
      });
    }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Menu'));
    if (DEBUG) this.input.keyboard?.on('keydown-R', () => { resetAchievements(); resetStory(); this.scene.restart(); });
  }
}
