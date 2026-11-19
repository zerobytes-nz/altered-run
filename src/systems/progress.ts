// Saved progress for the world map: stars and best score per stage. Kept on the device (localStorage),
// versioned like the high scores. Upgrades and unlocks (THEOS-38) will be added to the same record.
import { ALL_STAGES, WORLDS, isBuilt, type Stage, type World } from '../stages';

/** The three stars of a stage, in order: finished it, collected every coin, took no hits. */
export type Stars = [boolean, boolean, boolean];
export const STAR_GOALS = ['Finish the stage', 'Collect every coin', 'Take no hits'] as const;

export interface StageRecord { stars: Stars; best: number; plays: number; }
interface Progress { v: 1; stages: Record<string, StageRecord>; }

const KEY = 'altered-run.progress.v1';
let cache: Progress | null = null;

function load(): Progress {
  if (cache) return cache;
  let p: Progress = { v: 1, stages: {} };
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.v === 1 && parsed.stages && typeof parsed.stages === 'object') p = parsed;
  } catch { /* storage blocked or bad JSON: start fresh */ }
  cache = p;
  return p;
}

function save(p: Progress): void {
  cache = p;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked: keep it for this session */ }
}

export function stageRecord(id: string): StageRecord | undefined { return load().stages[id]; }
export const starsOf = (id: string): Stars => stageRecord(id)?.stars ?? [false, false, false];
export const starCount = (id: string): number => starsOf(id).filter(Boolean).length;
export const isFinished = (id: string): boolean => starsOf(id)[0];
export const totalStars = (): number => ALL_STAGES.reduce((n, s) => n + starCount(s.id), 0);
export const maxStars = (): number => ALL_STAGES.filter(isBuilt).length * 3;

/**
 * Save a finished or failed attempt. Stars are kept once earned (each one can be earned on a different try).
 * Returns which stars were newly earned this time, and whether the score is a new best for the stage.
 */
export function recordStage(id: string, earned: Stars, score: number): { newStars: Stars; newBest: boolean } {
  const p = load();
  const old = p.stages[id] ?? { stars: [false, false, false] as Stars, best: 0, plays: 0 };
  const stars = old.stars.map((s, i) => s || earned[i]) as Stars;
  const newStars = earned.map((e, i) => e && !old.stars[i]) as Stars;
  const newBest = earned[0] && score > old.best;
  p.stages[id] = { stars, best: newBest ? score : old.best, plays: old.plays + 1 };
  save(p);
  return { newStars, newBest };
}

/** A world opens once the world before it is finished (every built stage) and enough stars are collected. */
export function isWorldOpen(w: World): boolean {
  if (w.num === 1) return true;
  const prev = WORLDS.find((x) => x.num === w.num - 1);
  const prevDone = !!prev && prev.stages.filter(isBuilt).every((s) => isFinished(s.id)) && prev.stages.some(isBuilt);
  return prevDone && totalStars() >= w.needStars;
}

/** A stage can be played if it is built, its world is open, and the stage before it in that world is finished. */
export function isUnlocked(s: Stage): boolean {
  const w = WORLDS.find((x) => x.num === s.world);
  if (!w || !isBuilt(s) || !isWorldOpen(w)) return false;
  const i = w.stages.indexOf(s);
  return i === 0 || isFinished(w.stages[i - 1].id);
}

/** Where the map should open: the first unlocked stage without all three stars, else the last unlocked one. */
export function suggestedStage(): Stage {
  const open = ALL_STAGES.filter(isUnlocked);
  return open.find((s) => starCount(s.id) < 3) ?? open[open.length - 1] ?? ALL_STAGES[0];
}

/** For ?debug: wipe the saved progress. */
export function resetProgress(): void { save({ v: 1, stages: {} }); }
