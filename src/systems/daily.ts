// The Daily run (THEOS-40): one endless run per calendar day, with the same layout for every player
// (the pattern RNG is seeded from the date). Its best score is kept per day, apart from the Endless table.

export interface DailyRecord { v: 1; date: string; best: number; plays: number; /** Days a Daily was played (for achievements). */ days: number; }

const KEY = 'altered-run.daily.v1';

/** Today's date in the player's own time zone, e.g. "2026-11-20". */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const dailySeed = (date = todayKey()): string => `daily-${date}`;

function load(): DailyRecord {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (parsed?.v === 1 && typeof parsed.date === 'string') return { days: 0, ...parsed };
  } catch { /* storage blocked or bad JSON */ }
  return { v: 1, date: '', best: 0, plays: 0, days: 0 };
}

/** Today's record (best 0 and plays 0 if no Daily was played today). */
export function dailyToday(): DailyRecord {
  const r = load();
  return r.date === todayKey() ? r : { ...r, date: todayKey(), best: 0, plays: 0 };
}

/** Save a Daily run's score. Returns whether it beat today's best. */
export function recordDaily(score: number): { newBest: boolean; best: number; plays: number } {
  const old = load();
  const today = todayKey();
  const sameDay = old.date === today;
  const best = sameDay ? old.best : 0;
  const newBest = score > best;
  const r: DailyRecord = {
    v: 1, date: today, best: Math.max(best, score), plays: (sameDay ? old.plays : 0) + 1, days: (old.days ?? 0) + (sameDay ? 0 : 1),
  };
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked */ }
  return { newBest, best: r.best, plays: r.plays };
}
