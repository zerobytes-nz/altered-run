// A light story (THEOS-40): an intro before the first stage and one card when each world opens.
// Every card is shown once and can be skipped; they can be watched again from the Awards screen.

export interface StoryCard { id: string; title: string; lines: string[]; color: number; }

export const STORY: Record<string, StoryCard> = {
  intro: {
    id: 'intro', title: 'THE ALTERING', color: 0xf72585,
    lines: [
      'A storm of strange light rolled over the four worlds.',
      'Wherever it passed, heroes turned into Altered copies of themselves:',
      'giant, purple, and set on stopping anyone who runs.',
      'But the storm left something behind. Your NFTs still hold the true',
      'shapes of the old gear: AWIs (Altered World Items).',
      'Gear up, run through Ember Valley, and find who is behind it.',
    ],
  },
  world2: {
    id: 'world2', title: 'WORLD 2 · FROST PEAKS', color: 0x4cc9f0,
    lines: [
      'The Ember Rival is down, and the valley cools at last.',
      'Up in the mountains the storm froze everything it touched.',
      'Ice slicks the paths and the snow hides the drops.',
      'Something huge is stomping around the glacier.',
    ],
  },
  world3: {
    id: 'world3', title: 'WORLD 3 · STORM COAST', color: 0xffd34d,
    lines: [
      'With the Ice Golem shattered, the trail leads down to the sea.',
      'Here the storm never left. Lightning walks the cliffs,',
      'and the wind can push even a hero off their feet.',
      'Someone is calling it down on purpose.',
    ],
  },
  world4: {
    id: 'world4', title: 'WORLD 4 · SHADOW WILDS', color: 0x9b5de5,
    lines: [
      'The Storm Caller worked for someone. The sky goes dark ahead.',
      'In the Shadow Wilds the lights go out without warning,',
      'and the ground is never quite where it looks.',
      'The Shadow King is waiting. End the Altering for good.',
    ],
  },
};

/** The card that opens a world, if it has one. */
export const worldCard = (world: number): StoryCard | undefined => (world === 1 ? STORY.intro : STORY[`world${world}`]);

const KEY = 'altered-run.story.v1';

function seen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
}

export const hasSeen = (id: string): boolean => seen().includes(id);

export function markSeen(id: string): void {
  const list = seen();
  if (list.includes(id)) return;
  try { localStorage.setItem(KEY, JSON.stringify([...list, id])); } catch { /* storage blocked: it shows again next time */ }
}

/** For ?debug: show every card again. */
export function resetStory(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
