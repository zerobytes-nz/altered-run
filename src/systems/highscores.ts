export interface ScoreEntry { score: number; skin: string; date: number; finished: boolean; }

const KEY = 'altered-run.highscores.v1';
const MAX = 10;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ScoreEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => typeof e?.score === 'number').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Insert a score; returns its rank (0-based) or -1 if it didn't make the table. */
export function submitScore(entry: ScoreEntry): number {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* storage blocked */ }
  return trimmed.indexOf(entry);
}

export const bestScore = (): number => loadScores()[0]?.score ?? 0;
