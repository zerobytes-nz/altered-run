import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import type { Loadout } from '../loadout';
import { loadScores, submitScore } from '../systems/highscores';
import { STAR_GOALS, isUnlocked, recordStage, stageRecord, type Stars } from '../systems/progress';
import { getStage, nextStage, isBuilt, type Stage } from '../stages';
import { sfx } from '../systems/audio';
import { button, muteButton, text } from '../ui';

export interface RunResult {
  score: number; coins: number; kills: number; distance: number; finished: boolean; timeSec: number; loadout: Loadout;
  /** Set when the run was a world-map stage. */
  stageId?: string; coinsTotal?: number; hits?: number; stars?: Stars;
}

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(r: RunResult): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b1020, 0.92).setOrigin(0);
    const stage = getStage(r.stageId);
    if (stage && r.stars) this.stageResult(r, stage, r.stars);
    else this.randomResult(r);
    muteButton(this, GAME_W - 34, 34);
  }

  /** A random run: score, the high-score table, run again. */
  private randomResult(r: RunResult): void {
    const rank = submitScore({ score: r.score, skin: r.loadout.skin.name, date: Date.now(), finished: r.finished });
    const best = loadScores()[0]?.score ?? r.score;
    this.heading(r.finished);
    text(this, GAME_W / 2, 140, `${r.score}`, 72, '#ffffff', '900').setOrigin(0.5);
    text(this, GAME_W / 2, 190, rank === 0 ? '★ NEW HIGH SCORE ★' : rank > 0 ? `#${rank + 1} on your table · best ${best}` : `Best ${best}`, 20, '#ffd34d').setOrigin(0.5);
    this.stats(r, 236);
    const again = () => this.scene.start('Run', { loadout: r.loadout });
    this.buttons([['↻  RUN AGAIN', again, 0xf72585, 240], ['Menu', () => this.scene.start('Menu'), 0x3a0ca3, 200]]);
    this.input.keyboard?.once('keydown-SPACE', again);
  }

  /** A world-map stage: the three stars (new ones pop in), best score, then next stage / retry / map. */
  private stageResult(r: RunResult, stage: Stage, earned: Stars): void {
    const { newStars, newBest } = recordStage(stage.id, earned, r.score);
    const rec = stageRecord(stage.id)!;
    text(this, GAME_W / 2, 30, `WORLD ${stage.world}-${stage.num} · ${stage.name.toUpperCase()}`, 16, '#8fa3ff', '800').setOrigin(0.5);
    this.heading(r.finished, 66);
    text(this, GAME_W / 2, 120, `${r.score}`, 48, '#ffffff', '900').setOrigin(0.5);
    text(this, GAME_W / 2, 156, newBest ? '★ NEW BEST FOR THIS STAGE ★' : rec.best ? `Stage best ${rec.best}` : '', 17, '#ffd34d').setOrigin(0.5);

    // Three stars: earned this run (bright), earned before (dim gold), not yet (grey).
    const detail = [
      r.finished ? 'Done' : 'Not this time',
      `${r.coins} / ${r.coinsTotal ?? 0} coins`,
      (r.hits ?? 0) === 0 ? (r.finished ? 'No hits!' : 'No hits so far') : `${r.hits} hit${r.hits === 1 ? '' : 's'}`,
    ];
    STAR_GOALS.forEach((goal, i) => {
      const x = GAME_W / 2 + (i - 1) * 210, y = 222;
      const now = earned[i], had = rec.stars[i];
      const star = text(this, x, y, '★', 64, now ? '#ffd34d' : had ? '#9c8640' : '#3a4166', '900').setOrigin(0.5);
      text(this, x, y + 46, goal, 15, now || had ? '#e8ecff' : '#8f97c0', '700').setOrigin(0.5);
      text(this, x, y + 68, detail[i], 14, now ? '#80ffdb' : '#8f97c0', '600').setOrigin(0.5);
      if (newStars[i]) {
        star.setScale(0);
        this.tweens.add({ targets: star, scale: 1, duration: 420, delay: 250 + i * 260, ease: 'Back.Out', onStart: () => sfx.combo(i + 2) });
      }
    });
    this.stats(r, 330, false);

    const retry = () => this.scene.start('Run', { loadout: r.loadout, stageId: stage.id });
    const next = nextStage(stage);
    const canNext = !!next && isBuilt(next) && isUnlocked(next);
    const goNext = () => this.scene.start('Run', { loadout: r.loadout, stageId: next!.id });
    const list: [string, () => void, number, number][] = [];
    if (canNext) list.push(['NEXT STAGE  ▶', goNext, 0xf72585, 230]);
    list.push(['↻  RETRY', retry, canNext ? 0x4361ee : 0xf72585, 190], ['World map', () => this.scene.start('Map', { stageId: stage.id }), 0x3a0ca3, 190]);
    this.buttons(list, 420);
    if (next && !isBuilt(next) && r.finished) {
      text(this, GAME_W / 2, 482, `Next up: ${next.name}. Coming soon!`, 16, '#8fa3ff', '600').setOrigin(0.5);
    }
    this.input.keyboard?.once('keydown-SPACE', canNext ? goNext : retry);
  }

  private heading(finished: boolean, y = 64): void {
    text(this, GAME_W / 2, y, finished ? 'FINISH!' : 'KNOCKED OUT', 48, finished ? '#80ffdb' : '#ff6b81', '900').setOrigin(0.5);
  }

  private stats(r: RunResult, y: number, withCoins = true): void {
    const parts = [`${Math.round(r.distance / 10)} m`, ...(withCoins ? [`${r.coins} coins`] : []), `${r.kills} defeated`, `${r.timeSec.toFixed(0)} s`];
    text(this, GAME_W / 2, y, parts.join('   ·   '), 18, '#c0c8ff', '600').setOrigin(0.5);
  }

  /** A row of buttons, ignored for a moment so a frantic jump tap doesn't skip this screen. */
  private buttons(list: [string, () => void, number, number][], y = 330): void {
    const gap = 20, total = list.reduce((a, [, , , w]) => a + w, 0) + gap * (list.length - 1);
    let x = GAME_W / 2 - total / 2;
    const made = list.map(([label, onTap, fill, w]) => {
      const b = button(this, x + w / 2, y, label, onTap, w, 64, fill);
      x += w + gap;
      return b.setAlpha(0.4);
    });
    this.input.enabled = false;
    this.time.delayedCall(650, () => { this.input.enabled = true; made.forEach((b) => b.setAlpha(1)); });
  }
}
