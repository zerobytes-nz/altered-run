// Achievements (THEOS-40). Checked after every run (and after shop buys); each one pays a few coins into
// the shop wallet the first time. Kept on the device next to the other saves.
import type { RunResult } from '../scenes/GameOverScene';
import { WORLDS, isBuilt } from '../stages';
import { starCount, totalStars } from './progress';
import { bankCoins, lifetimeCoins, upgradeLevel, UPGRADES } from './shop';
import { dailyToday } from './daily';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** Coins paid into the shop wallet when it is earned. */
  reward: number;
  /** r is the run just played (undefined when checked from the shop). */
  test: (r: RunResult | undefined) => boolean;
}

const worldStars = (num: number): [number, number] => {
  const built = WORLDS.find((w) => w.num === num)?.stages.filter(isBuilt) ?? [];
  return [built.reduce((n, s) => n + starCount(s.id), 0), built.length * 3];
};
const isStage = (r?: RunResult) => !!r?.stageId;
const isEndless = (r?: RunResult) => !!r && !r.stageId;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_run', name: 'First steps', desc: 'Play your first run', reward: 50, test: (r) => !!r },
  { id: 'stage_clear', name: 'Flag down', desc: 'Finish a stage', reward: 50, test: (r) => isStage(r) && !!r!.finished },
  { id: 'no_hits', name: 'Untouchable', desc: 'Finish a stage without taking a hit', reward: 100, test: (r) => isStage(r) && !!r!.stars?.[2] },
  { id: 'all_coins', name: 'Coin sweeper', desc: 'Collect every coin in a stage', reward: 100, test: (r) => isStage(r) && !!r!.stars?.[1] },
  { id: 'secrets', name: 'Treasure hunter', desc: 'Find every hidden gem in a stage', reward: 100, test: (r) => !!r?.secretsTotal && (r.secrets ?? 0) >= r.secretsTotal },
  { id: 'boss1', name: 'Ember out', desc: 'Beat the Ember Rival', reward: 250, test: (r) => r?.stageId === '1-6' && !!r.finished },
  { id: 'boss2', name: 'Thaw', desc: 'Beat the Ice Golem', reward: 300, test: (r) => r?.stageId === '2-6' && !!r.finished },
  { id: 'boss3', name: 'Calm after the storm', desc: 'Beat the Storm Caller', reward: 350, test: (r) => r?.stageId === '3-6' && !!r.finished },
  { id: 'boss4', name: 'Altered no more', desc: 'Beat the Shadow King and finish the game', reward: 500, test: (r) => r?.stageId === '4-6' && !!r.finished },
  { id: 'world1_stars', name: 'Valley master', desc: 'Earn every star in Ember Valley', reward: 300, test: () => { const [n, max] = worldStars(1); return max > 0 && n >= max; } },
  { id: 'stars_30', name: 'Star collector', desc: 'Earn 30 stars in total', reward: 300, test: () => totalStars() >= 30 },
  { id: 'stars_all', name: 'Every star', desc: 'Earn all 72 stars', reward: 1000, test: () => totalStars() >= 72 },
  { id: 'endless_5k', name: 'Going strong', desc: 'Score 5,000 in an Endless or Daily run', reward: 100, test: (r) => isEndless(r) && r!.score >= 5000 },
  { id: 'endless_12k', name: "Can't stop", desc: 'Score 12,000 in an Endless or Daily run', reward: 300, test: (r) => isEndless(r) && r!.score >= 12000 },
  { id: 'marathon', name: 'Marathon', desc: 'Run 5,000 m in one run', reward: 200, test: (r) => !!r && r.distance / 10 >= 5000 },
  { id: 'brawler', name: 'Brawler', desc: 'Defeat 30 enemies and crates in one run', reward: 150, test: (r) => !!r && r.kills >= 30 },
  { id: 'pocketful', name: 'Pocketful', desc: 'Collect 150 coins in one run', reward: 150, test: (r) => !!r && r.coins >= 150 },
  { id: 'daily_1', name: 'Daily runner', desc: 'Play a Daily run', reward: 50, test: (r) => r?.mode === 'daily' },
  { id: 'daily_7', name: 'Regular', desc: 'Play the Daily run on 7 different days', reward: 300, test: () => dailyToday().days >= 7 },
  { id: 'upgraded', name: 'Upgraded', desc: 'Buy an upgrade in the Shop', reward: 50, test: () => UPGRADES.some((u) => upgradeLevel(u.id) > 0) },
  { id: 'saver', name: 'Saver', desc: 'Bank 5,000 coins in total', reward: 200, test: () => lifetimeCoins() >= 5000 },
];

interface Record_ { v: 1; got: Record<string, number>; }
const KEY = 'altered-run.achievements.v1';

function load(): Record_ {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (parsed?.v === 1 && parsed.got && typeof parsed.got === 'object') return parsed;
  } catch { /* storage blocked or bad JSON */ }
  return { v: 1, got: {} };
}

export const earnedAt = (id: string): number | undefined => load().got[id];
export const earnedCount = (): number => ACHIEVEMENTS.filter((a) => earnedAt(a.id)).length;

/**
 * Earn every achievement whose goal is now met. Pays their coin rewards and returns them (for the toasts).
 * Call it after the run's coins and stars are saved, so totals include this run.
 */
export function checkAchievements(r?: RunResult): AchievementDef[] {
  const rec = load();
  const out: AchievementDef[] = [];
  // Rewards are coins, which can meet a coin goal: go round until nothing new is earned.
  for (let pass = 0; pass < 3; pass++) {
    const fresh = ACHIEVEMENTS.filter((a) => !rec.got[a.id] && safeTest(a, r));
    if (!fresh.length) break;
    const now = Date.now();
    for (const a of fresh) rec.got[a.id] = now;
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* storage blocked */ }
    bankCoins(fresh.reduce((n, a) => n + a.reward, 0));
    out.push(...fresh);
  }
  return out;
}

function safeTest(a: AchievementDef, r?: RunResult): boolean {
  try { return a.test(r); } catch { return false; }
}

/** For ?debug: forget every achievement. */
export function resetAchievements(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
