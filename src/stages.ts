// Hand-made stages and the worlds they belong to (THEOS-36).
//
// A stage is a list of the obstacle patterns RunScene.spawn() already knows, placed in order. Each entry is
// "pattern" or "pattern:gap", where gap is the seconds of open running before the next pattern (default:
// the stage's `gap`). "rest" places nothing, for a breather. Small choices inside a pattern (coin arcs,
// pit widths) come from the stage's seed, so a stage plays the same every time.
// When the list runs out the finish flag appears. Endless/random runs keep using RunScene.spawnPattern.
import type { Element } from './awi';

/** Patterns a stage can use (see RunScene.spawn). */
export const PATTERNS = [
  'spike', 'spike2', 'crate', 'crate2', 'bar', 'slime', 'fly', 'flyLow', 'flyHigh', 'rival', 'rock',
  'pit', 'widePit', 'high', 'highStep', 'highTop', 'coins', 'coinsLow', 'coinsHigh', 'rest',
  // THEOS-37: enemies that each favour an AWI, hidden gems, and the boss.
  'guard', 'guard2', 'guardBar', 'swarm', 'swarmBig', 'archer', 'archer2', 'archerPit', 'secret', 'boss',
] as const;

/** Hidden gems placed by one "secret" pattern (high up: the Feather's extra jump or the Magnet gets them). */
export const SECRET_GEMS = 3;
export type Pattern = (typeof PATTERNS)[number];

export interface Stage {
  id: string;            // "1-1": world-number
  world: number;
  num: number;
  name: string;
  seed: number;
  speedStart: number;    // px/s at the first pattern
  speedEnd: number;      // px/s at the last pattern
  gap: number;           // default seconds between patterns
  seq: string[];         // empty = not built yet ("Coming soon" on the map)
  boss?: boolean;
  /** One line on the map and at the start of the stage: what this stage teaches (and which AWI helps). */
  tip?: string;
}

export interface World {
  num: number;
  name: string;
  element: Element;
  /** Stars needed (over all worlds) before this world opens, on top of finishing the world before it. */
  needStars: number;
  stages: Stage[];
}

const stage = (world: number, num: number, name: string, opts: Partial<Stage> = {}): Stage => ({
  id: `${world}-${num}`, world, num, name, seed: world * 100 + num,
  speedStart: 360, speedEnd: 600, gap: 1.2, seq: [], ...opts,
});

/** Placeholder stages for worlds that are not built yet: 5 stages and a boss each. */
const comingSoon = (world: number, names: string[], bossName: string): Stage[] => [
  ...names.map((n, i) => stage(world, i + 1, n)),
  stage(world, names.length + 1, bossName, { boss: true }),
];

export const WORLDS: World[] = [
  {
    num: 1, name: 'Ember Valley', element: 'Fire', needStars: 0,
    stages: [
      stage(1, 1, 'First Steps', {
        speedStart: 330, speedEnd: 520, gap: 1.25,
        tip: 'Tap to jump, swipe down to slide. ATTACK smashes crates and slimes.',
        // Teaches one thing at a time: jump, smash, slide, stomp, pits, ledges, then mixes them.
        seq: [
          'coinsLow', 'spike', 'spike', 'coins', 'crate', 'crate', 'spike2',
          'rest', 'bar', 'bar', 'coinsLow', 'slime', 'slime', 'crate:1.5',
          'pit', 'spike', 'pit', 'coins', 'bar', 'slime',
          'highStep:1.5', 'flyLow', 'flyLow', 'pit', 'crate2', 'spike2',
          'rest', 'slime', 'bar', 'pit', 'highStep', 'rock:1.6', 'spike', 'rock:1.6',
          'coins', 'rival:1.6', 'spike2', 'pit', 'widePit:1.4', 'slime', 'flyHigh', 'crate', 'bar', 'rival:1.6', 'coins',
        ],
      }),
      stage(1, 2, 'Rockfall Run', {
        speedStart: 380, speedEnd: 600, gap: 1.15,
        tip: 'Rocks land on their shadow: jump them. The giant rival is too tall for one jump: hit it.',
        // Falling rocks and the giant rival, with wide pits to finish.
        seq: [
          'coins', 'spike', 'rock:1.5', 'crate', 'rock:1.5', 'slime', 'bar',
          'pit', 'rock:1.4', 'spike2', 'flyLow', 'rival:1.5', 'coins',
          'highTop', 'pit', 'crate2', 'rock', 'slime', 'slime', 'widePit:1.4',
          'rest', 'flyHigh', 'secret', 'bar', 'rival', 'spike', 'rock', 'pit', 'highStep',
          'rock', 'crate', 'widePit', 'slime', 'flyLow', 'spike2', 'rival:1.4',
          'coins', 'rock', 'pit', 'rock', 'bar', 'widePit', 'rival', 'spike2', 'coinsHigh',
        ],
      }),
      stage(1, 3, 'Crate Canyon', {
        speedStart: 400, speedEnd: 620, gap: 1.2,
        tip: 'Shield guards block light hits. The Hammer smashes them; anyone can jump them.',
        // Guards: first alone with room to spare, then before bars (jump the guard, land, slide) and in pairs.
        seq: [
          'coins', 'crate', 'crate2', 'guard:1.6', 'spike', 'crate', 'guard:1.6', 'coinsLow',
          'bar', 'guard:1.5', 'crate2', 'pit', 'guard', 'secret', 'crate', 'spike2',
          'rest', 'guardBar:1.6', 'slime', 'crate2', 'highStep', 'guard', 'pit', 'guardBar:1.6',
          'coins', 'crate', 'guard2:1.6', 'spike', 'widePit', 'crate2', 'guard', 'rock:1.5', 'secret', 'coins',
        ],
      }),
      stage(1, 4, 'Slime Hollow', {
        speedStart: 410, speedEnd: 630, gap: 1.2,
        tip: 'Swarms: stomp them one after another. The Robot\'s landing stomp clears a whole swarm.',
        seq: [
          'coinsLow', 'slime', 'slime', 'swarm:1.6', 'spike', 'coins', 'swarm:1.6', 'bar',
          'slime', 'pit', 'swarm', 'crate', 'secret', 'flyLow', 'swarm:1.5',
          'rest', 'guard', 'swarm', 'spike2', 'pit', 'swarmBig:1.6', 'coins',
          'slime', 'crate2', 'swarm', 'flyHigh', 'widePit', 'secret', 'swarmBig:1.6', 'guard', 'coinsHigh',
        ],
      }),
      stage(1, 5, 'Cinder Bridge', {
        speedStart: 430, speedEnd: 650, gap: 1.25,
        tip: 'Archers shoot from ledges: slide or jump their arrows. The Kunai hits them from below.',
        seq: [
          'coins', 'spike', 'archer:1.8', 'pit', 'crate', 'archer:1.8', 'coinsLow', 'pit',
          'archer', 'bar', 'secret', 'widePit', 'archer:1.6', 'guard', 'swarm',
          'rest', 'archerPit:1.8', 'spike2', 'rock:1.5', 'archer', 'highStep', 'guard', 'pit',
          'archer2:1.8', 'swarm', 'widePit', 'secret', 'archer', 'crate2', 'rival:1.6', 'coins',
        ],
      }),
      stage(1, 6, 'The Ember Rival', {
        boss: true, speedStart: 440, speedEnd: 440, gap: 1.2,
        tip: 'It throws, shakes the ground and calls for help. Hit it when it stops: OPEN!',
        seq: ['coins', 'spike', 'slime', 'crate', 'coinsLow', 'rest', 'boss', 'coins'],
      }),
    ],
  },
  { num: 2, name: 'Frost Peaks', element: 'Ice', needStars: 12, stages: comingSoon(2, ['Snowline', 'Icicle Pass', 'Glacier Run', 'Frozen Falls', 'Whiteout'], 'The Ice Golem') },
  { num: 3, name: 'Storm Coast', element: 'Storm', needStars: 30, stages: comingSoon(3, ['Squall', 'Thunder Steps', 'Gale Cliffs', 'Static Field', 'Eye of the Storm'], 'The Storm Caller') },
  { num: 4, name: 'Shadow Wilds', element: 'Shadow', needStars: 48, stages: comingSoon(4, ['Dusk', 'Lantern Path', 'Phantom Grove', 'Blackout', 'Nightfall'], 'The Shadow King') },
];

export const ALL_STAGES: Stage[] = WORLDS.flatMap((w) => w.stages);
export const getStage = (id: string | undefined): Stage | undefined => (id ? ALL_STAGES.find((s) => s.id === id) : undefined);
export const isBuilt = (s: Stage): boolean => s.seq.length > 0;
/** Hidden gems in a stage (not part of the "every coin" star). */
export const secretsIn = (s: Stage): number => s.seq.filter((e) => e.split(':')[0] === 'secret').length * SECRET_GEMS;

/** The stage after this one in play order (next in the world, then the first of the next world). */
export function nextStage(s: Stage): Stage | undefined {
  const i = ALL_STAGES.indexOf(s);
  return i >= 0 ? ALL_STAGES[i + 1] : undefined;
}

/** "spike:1.5" → { pattern: 'spike', gap: 1.5 }. Unknown patterns fall back to coins (and warn once in dev). */
export function parseEntry(entry: string, defaultGap: number): { pattern: Pattern; gap: number } {
  const [name, g] = entry.split(':');
  const pattern = (PATTERNS as readonly string[]).includes(name) ? (name as Pattern) : 'coins';
  if (pattern !== name && import.meta.env.DEV) console.warn(`stages.ts: unknown pattern "${name}"`);
  const gap = g === undefined ? defaultGap : Number(g);
  return { pattern, gap: Number.isFinite(gap) ? gap : defaultGap };
}
