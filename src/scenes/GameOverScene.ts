import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import type { Loadout } from '../loadout';
import { loadScores, submitScore } from '../systems/highscores';
import { STAR_GOALS, isUnlocked, recordStage, stageRecord, totalStars, type Stars } from '../systems/progress';
import { bankCoins, coins, itemName, newlyUnlocked } from '../systems/shop';
import { getStage, nextStage, isBuilt, type Stage } from '../stages';
import { sfx } from '../systems/audio';
import { recordDaily, todayKey } from '../systems/daily';
import { checkAchievements, type AchievementDef } from '../systems/achievements';
import { button, muteButton, text } from '../ui';

export type RunMode = 'endless' | 'daily';

export interface RunResult {
  /** Set for runs without a stage (THEOS-40). */
  mode?: RunMode;
  score: number; coins: number; kills: number; distance: number; finished: boolean; timeSec: number; loadout: Loadout;
  /** Set when the run was a world-map stage. */
  stageId?: string; coinsTotal?: number; hits?: number; stars?: Stars;
  /** Hidden gems found / placed (stages with a "secret" pattern). */
  secrets?: number; secretsTotal?: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(r: RunResult): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b1020, 0.92).setOrigin(0);
    const stage = getStage(r.stageId);
    const starsBefore = totalStars();
    if (stage && r.stars) this.stageResult(r, stage, r.stars);
    else this.randomResult(r);
    this.toasts(this.bank(r, starsBefore));
    muteButton(this, GAME_W - 34, 34);
  }

  /** Newly earned achievements slide in top right, one after another. */
  private toasts(list: AchievementDef[]): void {
    list.forEach((a, i) => {
      const c = this.add.container(GAME_W + 10, 128).setDepth(30);
      const bg = this.add.rectangle(0, 0, 300, 54, 0x2a3a7a).setOrigin(0, 0.5).setStrokeStyle(2, 0xffd34d, 0.9);
      c.add([bg, text(this, 12, -12, `🏆 ${a.name}`, 17, '#ffd34d', '900').setOrigin(0, 0.5),
        text(this, 12, 12, `${a.desc} · +${a.reward} ●`, 12, '#e8ecff', '600').setOrigin(0, 0.5)]);
      // One at a time in the same spot, so they never cover the stars or the buttons.
      const at = 1500 + i * 2600;
      this.tweens.add({ targets: c, x: GAME_W - 312, duration: 380, delay: at, ease: 'Back.Out', onStart: () => sfx.combo(5) });
      this.tweens.add({ targets: c, alpha: 0, delay: at + 2200, duration: 400, onComplete: () => c.destroy() });
    });
  }

  /** Every run's coins go to the shop wallet (THEOS-38); new star goals unlock items. Shown top left. */
  private bank(r: RunResult, starsBefore: number): AchievementDef[] {
    bankCoins(r.coins);
    // After the run's coins and stars are saved, so goals count this run. Rewards are coins too.
    const awards = checkAchievements(r);
    const bonus = awards.reduce((n, a) => n + a.reward, 0);
    text(this, 20, 20, `+${r.coins} ●${bonus ? ` +${bonus} ● awards` : ''}  →  ${coins()} in the shop`, 15, '#ffd34d', '800');
    const unlocked = newlyUnlocked(starsBefore, totalStars());
    if (unlocked.length) {
      const names = unlocked.map((u) => itemName(u.slot, u.id)).join(', ');
      const t = text(this, 20, 42, `🔓 Unlocked: ${names}! Pick it in the Shop.`, 15, '#80ffdb', '800');
      t.setScale(0);
      this.tweens.add({ targets: t, scale: 1, duration: 380, delay: 1100, ease: 'Back.Out' });
    }
    return awards;
  }

  /** Endless (the high-score table) or the Daily (today's best): score, then run again. */
  private randomResult(r: RunResult): void {
    const daily = r.mode === 'daily';
    text(this, GAME_W / 2, 26, daily ? `DAILY RUN · ${todayKey()}` : 'ENDLESS', 16, '#8fa3ff', '800').setOrigin(0.5);
    this.heading(r.finished);
    text(this, GAME_W / 2, 140, `${r.score}`, 72, '#ffffff', '900').setOrigin(0.5);
    let line: string;
    if (daily) {
      const d = recordDaily(r.score);
      line = d.newBest ? (d.plays > 1 ? "★ NEW BEST FOR TODAY ★" : "Today's best so far") : `Today's best ${d.best} · try ${d.plays}`;
    } else {
      const rank = submitScore({ score: r.score, skin: r.loadout.skin.name, date: Date.now(), finished: r.finished });
      const best = loadScores()[0]?.score ?? r.score;
      line = rank === 0 ? '★ NEW HIGH SCORE ★' : rank > 0 ? `#${rank + 1} on your table · best ${best}` : `Best ${best}`;
    }
    text(this, GAME_W / 2, 190, line, 20, '#ffd34d').setOrigin(0.5);
    this.stats(r, 236);
    const again = () => this.scene.start('Run', { loadout: r.loadout, mode: r.mode });
    this.buttons([['↻  RUN AGAIN', again, 0xf72585, 240], ['Menu', () => this.scene.start('Menu'), 0x3a0ca3, 200]]);
    this.input.keyboard?.once('keydown-SPACE', again);
  }

  /** A world-map stage: the three stars (new ones pop in), best score, then next stage / retry / map. */
  private stageResult(r: RunResult, stage: Stage, earned: Stars): void {
    const { newStars, newBest } = recordStage(stage.id, earned, r.score, r.secrets ?? 0);
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
    this.stats(r, 330, false, r.secretsTotal ? `◆ ${r.secrets ?? 0} / ${r.secretsTotal} secrets` : '');

    const retry = () => this.scene.start('Run', { loadout: r.loadout, stageId: stage.id });
    const next = nextStage(stage);
    const canNext = !!next && isBuilt(next) && isUnlocked(next);
    const goNext = () => this.scene.start('Run', { loadout: r.loadout, stageId: next!.id });
    const list: [string, () => void, number, number][] = [];
    // The last boss: the ending card (shown on the first win, then from Awards).
    if (stage.id === '4-6' && r.finished) list.push(['THE END  ▶', () => this.scene.start('Story', { cardId: 'ending', next: { scene: 'Menu' } }), 0xf72585, 230]);
    if (canNext) list.push(['NEXT STAGE  ▶', goNext, 0xf72585, 230]);
    list.push(['↻  RETRY', retry, canNext ? 0x4361ee : 0xf72585, 190], ['World map', () => this.scene.start('Map', { stageId: stage.id }), 0x3a0ca3, 190]);
    this.buttons(list, 420);
    if (next && !isBuilt(next) && r.finished) {
      const msg = stage.boss ? `World ${stage.world} complete! Next: World ${next.world}, ${next.name}. Coming soon!` : `Next up: ${next.name}. Coming soon!`;
      text(this, GAME_W / 2, 482, msg, 16, '#8fa3ff', '600').setOrigin(0.5);
    }
    this.input.keyboard?.once('keydown-SPACE', canNext ? goNext : retry);
  }

  private heading(finished: boolean, y = 64): void {
    text(this, GAME_W / 2, y, finished ? 'FINISH!' : 'KNOCKED OUT', 48, finished ? '#80ffdb' : '#ff6b81', '900').setOrigin(0.5);
  }

  private stats(r: RunResult, y: number, withCoins = true, extra = ''): void {
    const parts = [`${Math.round(r.distance / 10)} m`, ...(withCoins ? [`${r.coins} coins`] : []), `${r.kills} defeated`, `${r.timeSec.toFixed(0)} s`, ...(extra ? [extra] : [])];
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
