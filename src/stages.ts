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
  // THEOS-39. Frost Peaks: falling icicles, slippery ice (longer slides), ice golems, ice walls.
  'icicle', 'icicles', 'slick', 'slickBars', 'golem', 'golem2', 'iceWall',
  // Storm Coast: lightning that marks the ground first, updrafts / downdrafts, swooping flyers.
  'zap', 'zap2', 'updraft', 'downdraft', 'swooper', 'swooper2',
  // Shadow Wilds: phantoms (solid only now and then), ledges that come and go, darkness on / off.
  'phantom', 'phantom2', 'blinkPit', 'dark', 'light',
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

export interface WorldTheme { skyTop: number; skyBottom: number; sun: number; bgTint: number; groundTint: number; weather?: 'snow' | 'rain' | 'motes'; }

export interface World {
  num: number;
  name: string;
  element: Element;
  /** The AWI element that is strongest here: +1 weapon damage and longer powers (THEOS-39). */
  strong: Element;
  theme: WorldTheme;
  /** Stars needed (over all worlds) before this world opens, on top of finishing the world before it. */
  needStars: number;
  stages: Stage[];
}

const stage = (world: number, num: number, name: string, opts: Partial<Stage> = {}): Stage => ({
  id: `${world}-${num}`, world, num, name, seed: world * 100 + num,
  speedStart: 360, speedEnd: 600, gap: 1.2, seq: [], ...opts,
});

/** Placeholder stages for worlds that are not built yet: 5 stages and a boss each. */

export const WORLDS: World[] = [
  {
    num: 1, name: 'Ember Valley', element: 'Fire', strong: 'Ice', needStars: 0,
    theme: { skyTop: 0x7fd0f2, skyBottom: 0xddf8ff, sun: 0xfff4b8, bgTint: 0xffffff, groundTint: 0xffffff },
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
  {
    num: 2, name: 'Frost Peaks', element: 'Ice', strong: 'Fire', needStars: 12,
    theme: { skyTop: 0x9fb8d8, skyBottom: 0xeef6ff, sun: 0xffffff, bgTint: 0xc8dcff, groundTint: 0xd8ecff, weather: 'snow' },
    stages: [
      stage(2, 1, 'Snowline', {
        speedStart: 400, speedEnd: 600, gap: 1.2,
        tip: 'Icicles drop as you get close: watch them land, then jump them.',
        seq: [
          'coins', 'spike', 'icicle:1.6', 'crate', 'icicle:1.5', 'slime', 'bar', 'coinsLow',
          'pit', 'icicle', 'spike2', 'rock:1.5', 'flyLow', 'icicles:1.6', 'coins',
          'rest', 'highStep', 'icicle', 'guard', 'secret', 'pit', 'icicles:1.6', 'slime', 'widePit',
          'icicle', 'crate2', 'rival:1.6', 'icicles', 'spike2', 'coinsHigh',
        ],
      }),
      stage(2, 2, 'Icicle Pass', {
        speedStart: 420, speedEnd: 620, gap: 1.15,
        tip: 'Ice is slippery: slides go much further on it. Use one slide for two bars.',
        seq: [
          'coins', 'slick:1.4', 'bar', 'icicle', 'slickBars:1.6', 'spike', 'coinsLow', 'icicles:1.5',
          'pit', 'slickBars:1.6', 'slime', 'flyLow', 'icicle', 'secret', 'widePit',
          'rest', 'slick', 'icicles', 'guardBar:1.6', 'slickBars', 'crate2', 'pit', 'icicles', 'coins',
        ],
      }),
      stage(2, 3, 'Glacier Run', {
        speedStart: 430, speedEnd: 640, gap: 1.2,
        tip: 'Ice golems shrug off light hits. Hammer them, jump them, or melt them with a Fire AWI.',
        seq: [
          'coins', 'icicle', 'golem:1.7', 'spike', 'crate', 'golem:1.6', 'coinsLow', 'slickBars',
          'pit', 'golem', 'icicles', 'secret', 'swarm', 'golem:1.5', 'widePit',
          'rest', 'golem2:1.7', 'slick', 'icicle', 'archer', 'golem', 'highStep', 'pit', 'golem2:1.6', 'coinsHigh',
        ],
      }),
      stage(2, 4, 'Frozen Falls', {
        speedStart: 440, speedEnd: 650, gap: 1.2,
        tip: 'Ice walls are too tall to jump: break them as you come in. A Blaze dash melts them at once.',
        seq: [
          'coinsLow', 'iceWall:1.6', 'spike', 'coins', 'iceWall:1.6', 'icicles', 'slime', 'pit',
          'iceWall:1.5', 'golem', 'secret', 'slickBars', 'iceWall', 'widePit',
          'rest', 'coins', 'iceWall:1.5', 'archer', 'icicles', 'golem:1.6', 'iceWall', 'pit', 'coinsHigh',
        ],
      }),
      stage(2, 5, 'Whiteout', {
        speedStart: 460, speedEnd: 670, gap: 1.2,
        tip: 'Everything the mountain has, all at once. Keep your POWER for the walls.',
        seq: [
          'coins', 'icicles', 'slickBars:1.5', 'golem:1.6', 'iceWall:1.5', 'pit', 'archer', 'icicle',
          'swarm', 'widePit', 'golem2:1.6', 'secret', 'slick', 'icicles', 'iceWall',
          'rest', 'guard2:1.6', 'archerPit:1.7', 'slickBars', 'golem', 'icicles', 'iceWall:1.5', 'widePit', 'golem2', 'coinsHigh',
        ],
      }),
      stage(2, 6, 'The Ice Golem', {
        boss: true, speedStart: 450, speedEnd: 450, gap: 1.2,
        tip: 'It throws ice, drops icicles and stamps. Hit it when it stops: OPEN! Fire hits harder.',
        seq: ['coins', 'icicle', 'slime', 'crate', 'coinsLow', 'rest', 'boss', 'coins'],
      }),
    ],
  },
  {
    num: 3, name: 'Storm Coast', element: 'Storm', strong: 'Shadow', needStars: 27,
    theme: { skyTop: 0x4a5878, skyBottom: 0xa8b4c8, sun: 0xdde4f0, bgTint: 0x9aa8c0, groundTint: 0xb8c0cc, weather: 'rain' },
    stages: [
      stage(3, 1, 'Squall', {
        speedStart: 430, speedEnd: 630, gap: 1.2,
        tip: 'Lightning marks the ground, then strikes. If it is still crackling when you get there, jump.',
        seq: [
          'coins', 'zap:1.6', 'spike', 'crate', 'zap:1.5', 'coinsLow', 'slime', 'zap',
          'pit', 'bar', 'zap2:1.6', 'flyLow', 'secret', 'rock:1.5', 'zap', 'widePit',
          'rest', 'zap2', 'guard', 'highStep', 'zap', 'spike2', 'pit', 'zap2:1.5', 'coinsHigh',
        ],
      }),
      stage(3, 2, 'Thunder Steps', {
        speedStart: 440, speedEnd: 640, gap: 1.2,
        tip: 'Swoopers dive at you as you get close: slide under them, or hit them low.',
        seq: [
          'coins', 'swooper:1.6', 'spike', 'zap', 'swooper:1.5', 'crate', 'coinsLow', 'pit',
          'swooper2:1.7', 'zap', 'highStep', 'secret', 'bar', 'swooper', 'widePit',
          'rest', 'zap2', 'swooper', 'archer', 'swooper2:1.6', 'spike2', 'zap', 'coinsHigh',
        ],
      }),
      stage(3, 3, 'Gale Cliffs', {
        speedStart: 440, speedEnd: 640, gap: 1.25,
        tip: 'Updrafts carry your jumps over gaps too wide for one jump. Downdrafts make jumps short.',
        seq: [
          'coins', 'updraft:1.4', 'spike', 'downdraft:1.4', 'coinsLow', 'updraft:1.4', 'zap',
          'pit', 'downdraft', 'swooper', 'updraft', 'secret', 'crate2', 'downdraft',
          'rest', 'updraft', 'zap2', 'downdraft', 'swooper', 'updraft:1.4', 'widePit', 'coinsHigh',
        ],
      }),
      stage(3, 4, 'Static Field', {
        speedStart: 450, speedEnd: 660, gap: 1.15,
        tip: 'Lightning on every step. A Shadow walk passes straight through it.',
        seq: [
          'coins', 'zap2:1.5', 'swooper', 'zap', 'guard', 'zap2', 'coinsLow', 'updraft',
          'zap', 'swarm', 'zap2:1.4', 'archer', 'secret', 'downdraft', 'zap', 'pit', 'zap2',
          'rest', 'swooper2', 'zap', 'golem', 'zap2', 'updraft', 'zap', 'coinsHigh',
        ],
      }),
      stage(3, 5, 'Eye of the Storm', {
        speedStart: 470, speedEnd: 680, gap: 1.2,
        tip: 'The heart of the storm. Wind, lightning and swoopers together.',
        seq: [
          'coins', 'zap2', 'updraft', 'swooper2:1.6', 'downdraft', 'zap', 'archerPit:1.7', 'swooper',
          'widePit', 'zap2', 'secret', 'guard2:1.6', 'updraft', 'zap',
          'rest', 'swooper2', 'downdraft', 'zap2', 'rival:1.6', 'updraft', 'swooper', 'zap2', 'coinsHigh',
        ],
      }),
      stage(3, 6, 'The Storm Caller', {
        boss: true, speedStart: 460, speedEnd: 460, gap: 1.2,
        tip: 'It calls lightning down at your feet and sends swoopers. Hit it when it stops: OPEN!',
        seq: ['coins', 'zap', 'crate', 'swooper', 'coinsLow', 'rest', 'boss', 'coins'],
      }),
    ],
  },
  {
    num: 4, name: 'Shadow Wilds', element: 'Shadow', strong: 'Storm', needStars: 42,
    theme: { skyTop: 0x1a1430, skyBottom: 0x4a3a6a, sun: 0xe8e0ff, bgTint: 0x6a5a90, groundTint: 0x7a6aa0, weather: 'motes' },
    stages: [
      stage(4, 1, 'Dusk', {
        speedStart: 440, speedEnd: 640, gap: 1.25,
        tip: 'Phantoms fade in and out. Faded, they can\'t hurt you, and you can\'t hit them.',
        seq: [
          'coins', 'phantom:1.7', 'spike', 'crate', 'phantom:1.6', 'coinsLow', 'pit', 'phantom',
          'bar', 'swarm', 'phantom2:1.7', 'secret', 'widePit', 'phantom',
          'rest', 'guard', 'phantom2', 'highStep', 'zap', 'phantom', 'spike2', 'coinsHigh',
        ],
      }),
      stage(4, 2, 'Lantern Path', {
        speedStart: 440, speedEnd: 640, gap: 1.3,
        tip: 'In the dark you only see what is near you. A Chain storm lights everything up.',
        seq: [
          'coins', 'spike', 'dark:1.5', 'crate', 'spike', 'coinsLow', 'slime', 'pit', 'bar',
          'light:1.5', 'coins', 'phantom', 'secret', 'dark:1.5', 'spike2', 'flyLow', 'pit', 'phantom',
          'light', 'rest', 'coins', 'dark', 'crate2', 'widePit', 'slime', 'bar', 'light', 'coinsHigh',
        ],
      }),
      stage(4, 3, 'Phantom Grove', {
        speedStart: 450, speedEnd: 650, gap: 1.25,
        tip: 'Ledges here come and go: they flicker before they vanish.',
        seq: [
          'coins', 'blinkPit:1.6', 'phantom', 'spike', 'blinkPit:1.6', 'coinsLow', 'phantom2',
          'pit', 'blinkPit', 'secret', 'archer', 'phantom', 'blinkPit:1.5',
          'rest', 'dark', 'spike', 'phantom', 'blinkPit', 'light', 'phantom2', 'coinsHigh',
        ],
      }),
      stage(4, 4, 'Blackout', {
        speedStart: 460, speedEnd: 660, gap: 1.3,
        tip: 'Long stretches of dark. Listen for the whistle of rocks and arrows.',
        seq: [
          'coins', 'dark:1.5', 'spike', 'phantom', 'crate', 'rock:1.5', 'pit', 'archer:1.6', 'phantom',
          'blinkPit', 'light:1.5', 'secret', 'coins', 'dark', 'swarm', 'phantom2', 'widePit', 'bar',
          'icicle', 'light', 'rest', 'zap2', 'golem', 'phantom', 'coinsHigh',
        ],
      }),
      stage(4, 5, 'Nightfall', {
        speedStart: 480, speedEnd: 690, gap: 1.2,
        tip: 'The last run before the King. Everything from every world.',
        seq: [
          'coins', 'phantom2', 'icicles', 'zap2', 'blinkPit:1.6', 'golem', 'swooper', 'dark',
          'spike2', 'phantom', 'pit', 'archer', 'light', 'secret', 'slickBars', 'updraft', 'iceWall:1.5',
          'rest', 'dark', 'phantom2', 'blinkPit', 'swooper2', 'light', 'rival:1.6', 'zap2', 'coinsHigh',
        ],
      }),
      stage(4, 6, 'The Shadow King', {
        boss: true, speedStart: 470, speedEnd: 470, gap: 1.2,
        tip: 'It puts out the lights and calls phantoms. Hit it when it stops: OPEN! Storm hits harder.',
        seq: ['coins', 'phantom', 'spike', 'crate', 'coinsLow', 'rest', 'boss', 'coins'],
      }),
    ],
  },
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
