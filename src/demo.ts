// Demo profiles, so the game can be shown without real wallets.
// Each has a TheoSwap test code (filled with set_test_items for game 7) and bundled sample
// data in the same shape as user-items `results`, used when the build has no API key or no signal.
import type { ApiItem } from './awi';

export type DemoId = 'whale' | 'collector' | 'newbie';

const item = (n: number, itemId: string, Rarity: string, Element: string): ApiItem => ({
  contract: '0x0000000000000000000000000000000000000000', token_id: n, itemData: { itemId, Rarity, Element },
});

// Sample data = exactly what TheoSwap returns for these test codes (saved 2026-11-15, config 15).
export const DEMO_PROFILES: Record<DemoId, { name: string; blurb: string; testCode: string; sample: ApiItem[] }> = {
  whale: {
    name: 'Whale', blurb: '14 NFTs: every AWI, epics and a double cat', testCode: 'AAAAAAAA',
    sample: [
      item(2, 'hero_ninja', 'Rare', 'Ice'), item(10, 'hero_robot', 'Common', 'Fire'), item(4, 'hero_knight', 'Common', 'Shadow'),
      item(3, 'weapon_kunai', 'Common', 'Shadow'), item(60, 'weapon_hammer', 'Rare', 'Fire'), item(17, 'weapon_sword', 'Epic', 'Fire'),
      item(5, 'pet_dog', 'Common', 'Fire'), item(6, 'pet_cat', 'Common', 'Storm'), item(28, 'pet_cat', 'Common', 'Storm'),
      item(7, 'pet_drone', 'Common', 'Shadow'), item(68, 'trinket_shield', 'Common', 'Shadow'), item(1, 'trinket_feather', 'Epic', 'Fire'),
      item(13, 'trinket_magnet', 'Common', 'Ice'), item(37, 'trinket_boots', 'Common', 'Storm'),
    ],
  },
  collector: {
    name: 'Collector', blurb: '5 NFTs: one per slot, plus a spare pet', testCode: 'BBBBBBBB',
    sample: [
      item(10, 'hero_robot', 'Common', 'Fire'), item(17, 'weapon_sword', 'Epic', 'Fire'),
      item(6, 'pet_cat', 'Common', 'Storm'), item(5, 'pet_dog', 'Common', 'Fire'), item(13, 'trinket_magnet', 'Common', 'Ice'),
    ],
  },
  newbie: {
    name: 'New player', blurb: '1 NFT: the rest are defaults', testCode: 'CCCCCCCC',
    sample: [item(3, 'weapon_kunai', 'Common', 'Shadow')],
  },
};
