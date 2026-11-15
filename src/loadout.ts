// AWI (Altered World Item) slot model. Guests get the default loadout; players who connect
// TheoSwap get one built from their NFTs' AWIs (see awi.ts → loadoutFrom).
import type { AWI } from './awi';
import { RUN } from './config';

export type SlotId = 'skin' | 'weapon' | 'pet' | 'trinket';

export interface SkinDef { id: string; name: string; }
export interface WeaponDef {
  id: string; name: string; range: number; damage: number;
  /** Colour of the attack slash, so the weapon AWI shows even when the hero art carries its own weapon. */
  tint: number;
}
export interface PetDef { id: string; name: string; radius: number; speed: number; }
export interface TrinketDef {
  id: string; name: string; desc: string;
  airJumps?: number; magnet?: number; shield?: number; speedMul?: number; scoreMul?: number;
}

export const SKINS: Record<string, SkinDef> = {
  knight: { id: 'knight', name: 'Knight' },
  ninja: { id: 'ninja', name: 'Ninja' },
  robot: { id: 'robot', name: 'Robot' },
};

export const WEAPONS: Record<string, WeaponDef> = {
  sword: { id: 'sword', name: 'Sword', range: 96, damage: 1, tint: 0xffffff },
  kunai: { id: 'kunai', name: 'Kunai', range: 150, damage: 1, tint: 0x80ffdb },
  hammer: { id: 'hammer', name: 'Hammer', range: 80, damage: 2, tint: 0xffb347 },
};

export const PETS: Record<string, PetDef> = {
  cat: { id: 'cat', name: 'Cat', radius: 70, speed: 900 },
  dog: { id: 'dog', name: 'Dog', radius: 60, speed: 1100 },
  drone: { id: 'drone', name: 'Drone', radius: 90, speed: 800 },
};

export const TRINKETS: Record<string, TrinketDef> = {
  doubleJump: { id: 'doubleJump', name: 'Feather', desc: 'Double jump', airJumps: 1 },
  magnet: { id: 'magnet', name: 'Magnet', desc: 'Pulls coins', magnet: 170 },
  shield: { id: 'shield', name: 'Shield', desc: 'Blocks 1 hit', shield: 1 },
  speed: { id: 'speed', name: 'Boots', desc: '+10% speed, +20% score', speedMul: 1.1, scoreMul: 1.2 },
};

export interface Loadout {
  skin: SkinDef;
  weapon: WeaponDef;
  pet: PetDef;
  trinket: TrinketDef;
  hearts: number;
  /** The AWIs behind each slot; missing = guest default. */
  awis: Partial<Record<SlotId, AWI>>;
}

export const DEFAULTS = { skin: 'knight', weapon: 'sword', pet: 'cat', trinket: 'doubleJump' } as const;

/** Resolve attribute values to definitions, falling back to the default for unknown values. */
export function resolveLoadout(ids: Partial<Record<SlotId, string>> = {}): Loadout {
  return {
    skin: SKINS[ids.skin ?? ''] ?? SKINS[DEFAULTS.skin],
    weapon: WEAPONS[ids.weapon ?? ''] ?? WEAPONS[DEFAULTS.weapon],
    pet: PETS[ids.pet ?? ''] ?? PETS[DEFAULTS.pet],
    trinket: TRINKETS[ids.trinket ?? ''] ?? TRINKETS[DEFAULTS.trinket],
    hearts: RUN.hearts,
    awis: {},
  };
}

export const guestLoadout = (): Loadout => resolveLoadout();
