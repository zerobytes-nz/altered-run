import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import type { Loadout } from '../loadout';
import { loadScores, submitScore } from '../systems/highscores';
import { button, muteButton, text } from '../ui';

export interface RunResult {
  score: number; coins: number; kills: number; distance: number; finished: boolean; timeSec: number; loadout: Loadout;
}

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(r: RunResult): void {
    const rank = submitScore({ score: r.score, skin: r.loadout.skin.name, date: Date.now(), finished: r.finished });
    const best = loadScores()[0]?.score ?? r.score;

    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b1020, 0.92).setOrigin(0);
    text(this, GAME_W / 2, 64, r.finished ? 'FINISH!' : 'KNOCKED OUT', 48, r.finished ? '#80ffdb' : '#ff6b81', '900').setOrigin(0.5);
    text(this, GAME_W / 2, 140, `${r.score}`, 72, '#ffffff', '900').setOrigin(0.5);
    text(this, GAME_W / 2, 190, rank === 0 ? '★ NEW HIGH SCORE ★' : rank > 0 ? `#${rank + 1} on your table · best ${best}` : `Best ${best}`, 20, '#ffd34d').setOrigin(0.5);
    text(this, GAME_W / 2, 236,
      `${Math.round(r.distance / 10)} m   ·   ${r.coins} coins   ·   ${r.kills} defeated   ·   ${r.timeSec.toFixed(0)} s`, 18, '#c0c8ff', '600').setOrigin(0.5);

    const retry = button(this, GAME_W / 2 - 130, 330, '↻  RUN AGAIN', () => this.scene.start('Run', { loadout: r.loadout }), 240, 64, 0xf72585);
    const menu = button(this, GAME_W / 2 + 130, 330, 'Menu', () => this.scene.start('Menu'), 200, 64, 0x3a0ca3);
    // Ignore taps for a moment so a frantic jump tap doesn't skip this screen.
    retry.setAlpha(0.4); menu.setAlpha(0.4);
    this.input.enabled = false;
    this.time.delayedCall(650, () => { this.input.enabled = true; retry.setAlpha(1); menu.setAlpha(1); });
    muteButton(this, GAME_W - 34, 34);
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('Run', { loadout: r.loadout }));
  }
}
