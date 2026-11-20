// AWI (Altered World Item) slot model. Guests get the default loadout; players who connect
// TheoSwap get one built from their NFTs' AWIs (see awi.ts → loadoutFrom).
import type { AWI, Element } from './awi';
import { RUN } from './config';

export type SlotId = 'skin' | 'weapon' | 'pet' | 'trinket';

/** Hero passives (rarity strengthens them in awi.ts → loadoutFrom). */
export interface SkinDef {
  id: string; name: string; desc: string;
  extraHearts?: number;   // Knight
  jumpMul?: number;       // Ninja: higher jumps …
  attackCdMul?: number;   // … and faster attacks
  stomp?: number;         // Robot: landing shockwave radius (px)
}
export interface WeaponDef {
  id: string; name: string; desc: string;
  range: number;          // melee reach, or how far a thrown weapon flies (px)
  damage: number;         // per hit; armour has 4 HP
  cooldownMs: number;
  thrown?: boolean;       // kunai: a projectile instead of a slash
  /** Colour of the attack effect: the element of the weapon AWI. */
  tint: number;
}
export interface PetDef { id: string; name: string; radius: number; speed: number; }
export interface TrinketDef {
  id: string; name: string; desc: string;
  airJumps?: number; magnet?: number; shield?: number; shieldRechargeMs?: number; speedMul?: number; scoreMul?: number;
}

export const SKINS: Record<string, SkinDef> = {
  knight: { id: 'knight', name: 'Knight', desc: '+1 heart', extraHearts: 1 },
  ninja: { id: 'ninja', name: 'Ninja', desc: 'Higher jump · faster attacks', jumpMul: 1.08, attackCdMul: 0.75 },
  robot: { id: 'robot', name: 'Robot', desc: 'Landing stomp hurts enemies', stomp: 90 },
};

export const WEAPONS: Record<string, WeaponDef> = {
  sword: { id: 'sword', name: 'Sword', desc: '2 damage · balanced', range: 112, damage: 2, cooldownMs: 320, tint: 0xffffff },
  kunai: { id: 'kunai', name: 'Kunai', desc: 'Thrown · 1 damage · long range', range: 400, damage: 1, cooldownMs: 210, thrown: true, tint: 0x80ffdb },
  hammer: { id: 'hammer', name: 'Hammer', desc: '4 damage · slow · short', range: 92, damage: 4, cooldownMs: 560, tint: 0xffb347 },
};

export const PETS: Record<string, PetDef> = {
  cat: { id: 'cat', name: 'Cat', radius: 70, speed: 900 },
  dog: { id: 'dog', name: 'Dog', radius: 60, speed: 1100 },
  drone: { id: 'drone', name: 'Drone', radius: 90, speed: 800 },
};

export const TRINKETS: Record<string, TrinketDef> = {
  doubleJump: { id: 'doubleJump', name: 'Feather', desc: 'Double jump', airJumps: 1 },
  magnet: { id: 'magnet', name: 'Magnet', desc: 'Pulls coins: fills POWER faster', magnet: 150 },
  shield: { id: 'shield', name: 'Shield', desc: 'Blocks 1 hit, recharges', shield: 1, shieldRechargeMs: 15000 },
  speed: { id: 'speed', name: 'Boots', desc: '+10% speed, +20% score', speedMul: 1.1, scoreMul: 1.2 },
};

export interface Loadout {
  skin: SkinDef;
  weapon: WeaponDef;
  pet: PetDef;
  trinket: TrinketDef;
  hearts: number;
  /** Element of the POWER (from the weapon AWI; guests get Fire) and how strong it is (rarity). */
  element: Element;
  powerMul: number;
  /** The AWIs behind each slot; missing = guest default. */
  awis: Partial<Record<SlotId, AWI>>;
  /** Slots filled with an item unlocked by playing (THEOS-38), not an AWI. */
  earned: Partial<Record<SlotId, boolean>>;
  /** POWER meter fill speed (coin shop upgrade). */
  fillMul: number;
}

export const DEFAULTS = { skin: 'knight', weapon: 'sword', pet: 'cat', trinket: 'doubleJump' } as const;

/** Resolve attribute values to definitions, falling back to the default for unknown values. */
export function resolveLoadout(ids: Partial<Record<SlotId, string>> = {}): Loadout {
  return {
    skin: SKINS[ids.skin ?? ''] ?? SKINS[DEFAULTS.skin],
    weapon: WEAPONS[ids.weapon ?? ''] ?? WEAPONS[DEFAULTS.weapon],
    pet: PETS[ids.pet ?? ''] ?? PETS[DEFAULTS.pet],
    trinket: TRINKETS[ids.trinket ?? ''] ?? TRINKETS[DEFAULTS.trinket],
    hearts: RUN.hearts + ((SKINS[ids.skin ?? ''] ?? SKINS[DEFAULTS.skin]).extraHearts ?? 0),
    element: 'Fire',
    powerMul: 1,
    awis: {},
    earned: {},
    fillMul: 1,
  };
}

export const guestLoadout = (): Loadout => resolveLoadout();
