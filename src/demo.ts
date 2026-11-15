// Demo profiles, so the game can be shown without real wallets.
// Each has a TheoSwap test code (filled with set_test_items for game 7) and bundled sample
// data in the same shape as user-items `results`, used when the build has no API key or no signal.
import type { ApiItem } from './awi';

export type DemoId = 'whale' | 'collector' | 'newbie';

const item = (n: number, itemId: string, Rarity: string, Element: string): ApiItem => ({
  contract: '0x0000000000000000000000000000000000000000', token_id: n, itemData: { itemId, Rarity, Element },
});

export const DEMO_PROFILES: Record<DemoId, { name: string; blurb: string; testCode: string; sample: ApiItem[] }> = {
  whale: {
    name: 'Whale', blurb: '14 NFTs: legendaries, doubles, every slot', testCode: 'AAAAAAAA',
    sample: [
      item(101, 'hero_ninja', 'Legendary', 'Storm'), item(102, 'hero_robot', 'Epic', 'Ice'), item(103, 'hero_knight', 'Rare', 'Fire'),
      item(104, 'weapon_kunai', 'Legendary', 'Fire'), item(105, 'weapon_hammer', 'Epic', 'Shadow'), item(106, 'weapon_sword', 'Common', 'Ice'),
      item(107, 'pet_dog', 'Epic', 'Storm'), item(108, 'pet_cat', 'Rare', 'Shadow'), item(109, 'pet_drone', 'Common', 'Ice'),
      item(110, 'trinket_shield', 'Legendary', 'Ice'), item(111, 'trinket_feather', 'Epic', 'Storm'), item(112, 'trinket_magnet', 'Rare', 'Fire'),
      item(113, 'pet_cat', 'Rare', 'Shadow'), item(114, 'trinket_boots', 'Common', 'Shadow'),
    ],
  },
  collector: {
    name: 'Collector', blurb: '5 NFTs: one per slot, plus a spare pet', testCode: 'BBBBBBBB',
    sample: [
      item(201, 'hero_robot', 'Rare', 'Shadow'), item(202, 'weapon_sword', 'Rare', 'Storm'),
      item(203, 'pet_cat', 'Common', 'Fire'), item(204, 'pet_dog', 'Common', 'Ice'), item(205, 'trinket_magnet', 'Common', 'Ice'),
    ],
  },
  newbie: {
    name: 'New player', blurb: '1 NFT: the rest are defaults', testCode: 'CCCCCCCC',
    sample: [item(301, 'weapon_kunai', 'Common', 'Ice')],
  },
};
