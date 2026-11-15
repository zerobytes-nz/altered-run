// AWIs (Altered World Items): what a player's NFTs become in Altered Run.
//
// TheoSwap's user-items API returns one item per NFT, picked from the game's config tree
// (config "Altered Run AWIs", game 7). Each item has an itemId (e.g. "weapon_kunai") plus the
// rolled attributes Rarity and Element. This file turns that list into AWIs, merges exact
// duplicates, and builds a Loadout from the AWIs the player picked.
import { DEFAULTS, PETS, SKINS, TRINKETS, WEAPONS, resolveLoadout, type Loadout, type SlotId } from './loadout';

export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const ELEMENTS = ['Fire', 'Ice', 'Shadow', 'Storm'] as const;
export type Element = (typeof ELEMENTS)[number];

export const RARITY_COLOR: Record<Rarity, number> = { Common: 0xb8c2e0, Rare: 0x4cc9f0, Epic: 0xb084ff, Legendary: 0xffc94d };
export const ELEMENT_COLOR: Record<Element, number> = { Fire: 0xff7a45, Ice: 0x9fe8ff, Shadow: 0xb084ff, Storm: 0xffe066 };
export const ELEMENT_ICON: Record<Element, string> = { Fire: '🔥', Ice: '❄', Shadow: '☾', Storm: '⚡' };
export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Small stat multiplier per rarity tier (range, pet radius, magnet radius). */
export const RARITY_MULT: Record<Rarity, number> = { Common: 1, Rare: 1.1, Epic: 1.2, Legendary: 1.35 };

/** TheoSwap config itemId → AWI slot and the game's own id for it. */
const ITEMS: Record<string, { slot: SlotId; id: string }> = {
  hero_knight: { slot: 'skin', id: 'knight' }, hero_ninja: { slot: 'skin', id: 'ninja' }, hero_robot: { slot: 'skin', id: 'robot' },
  weapon_sword: { slot: 'weapon', id: 'sword' }, weapon_kunai: { slot: 'weapon', id: 'kunai' }, weapon_hammer: { slot: 'weapon', id: 'hammer' },
  pet_cat: { slot: 'pet', id: 'cat' }, pet_dog: { slot: 'pet', id: 'dog' }, pet_drone: { slot: 'pet', id: 'drone' },
  trinket_feather: { slot: 'trinket', id: 'doubleJump' }, trinket_magnet: { slot: 'trinket', id: 'magnet' },
  trinket_shield: { slot: 'trinket', id: 'shield' }, trinket_boots: { slot: 'trinket', id: 'speed' },
};

export const SLOTS: SlotId[] = ['skin', 'weapon', 'pet', 'trinket'];
export const SLOT_LABEL: Record<SlotId, string> = { skin: 'HERO', weapon: 'WEAPON', pet: 'PET', trinket: 'TRINKET' };

export interface AWI {
  key: string;            // slot:id:rarity:element, identical AWIs share it
  slot: SlotId;
  id: string;             // game id: knight, kunai, cat, doubleJump, …
  name: string;           // Kunai
  rarity: Rarity;
  element: Element;
  count: number;          // how many NFTs gave exactly this AWI
  tokens: string[];       // "contract:tokenId" of those NFTs
}

/** One entry of user-items `results`, as far as the game cares. */
export interface ApiItem {
  contract?: string;
  token_id?: string | number;
  tokenId?: string | number;
  itemData?: { itemId?: string; title?: string; Rarity?: string; Element?: string } | null;
}

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly string[]).includes(String(v)) ? (v as T) : fallback;

export const nameOf = (slot: SlotId, id: string): string =>
  ({ skin: SKINS, weapon: WEAPONS, pet: PETS, trinket: TRINKETS }[slot] as Record<string, { name: string }>)[id]?.name ?? id;

/** "Legendary Storm Kunai" */
export const awiTitle = (a: AWI) => `${a.rarity} ${a.element} ${a.name}`;

/**
 * Turn user-items results into AWIs. Items this game doesn't know (another config, a renamed
 * item) are skipped; unknown attribute values fall back to Common / the first element.
 * Exact duplicates are merged with a count. Sorted best rarity first.
 */
export function parseAwis(results: ApiItem[]): AWI[] {
  const byKey = new Map<string, AWI>();
  for (const r of results ?? []) {
    const map = ITEMS[r?.itemData?.itemId ?? ''];
    if (!map) continue;
    const rarity = pick(RARITIES, r.itemData?.Rarity, 'Common');
    const element = pick(ELEMENTS, r.itemData?.Element, 'Fire');
    const key = `${map.slot}:${map.id}:${rarity}:${element}`;
    const token = `${r.contract ?? ''}:${r.token_id ?? r.tokenId ?? '?'}`;
    const a = byKey.get(key);
    if (a) { a.count++; a.tokens.push(token); continue; }
    byKey.set(key, { key, ...map, name: nameOf(map.slot, map.id), rarity, element, count: 1, tokens: [token] });
  }
  return [...byKey.values()].sort((x, y) => RARITIES.indexOf(y.rarity) - RARITIES.indexOf(x.rarity));
}

export type Selection = Partial<Record<SlotId, string>>; // slot → AWI key

/** Best AWI per slot (list is already sorted best-first); keeps any still-valid previous pick. */
export function defaultSelection(awis: AWI[], previous: Selection = {}): Selection {
  const sel: Selection = {};
  for (const slot of SLOTS) {
    const options = awis.filter((a) => a.slot === slot);
    sel[slot] = options.find((a) => a.key === previous[slot])?.key ?? options[0]?.key;
  }
  return sel;
}

/** Build the run's Loadout from the selected AWIs. Empty slots use the guest default. */
export function loadoutFrom(awis: AWI[], sel: Selection): Loadout {
  const chosen = (slot: SlotId) => awis.find((a) => a.key === sel[slot] && a.slot === slot);
  const lo = resolveLoadout({
    skin: chosen('skin')?.id ?? DEFAULTS.skin, weapon: chosen('weapon')?.id ?? DEFAULTS.weapon,
    pet: chosen('pet')?.id ?? DEFAULTS.pet, trinket: chosen('trinket')?.id ?? DEFAULTS.trinket,
  });
  const tier = (a?: AWI) => (a ? RARITIES.indexOf(a.rarity) : 0); // 0 … 3
  const mult = (a?: AWI) => (a ? RARITY_MULT[a.rarity] : 1);

  const hero = chosen('skin'), weapon = chosen('weapon'), pet = chosen('pet'), trinket = chosen('trinket');
  lo.awis = { skin: hero, weapon, pet, trinket };
  if (hero) lo.hearts += tier(hero) >= 3 ? 1 : 0;                       // Legendary hero: +1 heart
  if (weapon) lo.weapon = { ...lo.weapon, range: Math.round(lo.weapon.range * mult(weapon)), tint: ELEMENT_COLOR[weapon.element] };
  if (pet) lo.pet = { ...lo.pet, radius: Math.round(lo.pet.radius * mult(pet)) };
  if (trinket) {
    const t = { ...lo.trinket };
    if (t.airJumps) t.airJumps += tier(trinket) >= 3 ? 1 : 0;          // Legendary feather: triple jump
    if (t.magnet) t.magnet = Math.round(t.magnet * mult(trinket));
    if (t.shield) t.shield += tier(trinket) >= 2 ? 1 : 0;              // Epic+ shield: blocks 2 hits
    if (t.scoreMul) t.scoreMul = +(t.scoreMul + 0.05 * tier(trinket)).toFixed(2);
    lo.trinket = t;
  }
  return lo;
}

/** What the rarity does for this AWI, for the reveal card and loadout screen. */
export function perkText(a: AWI): string {
  const pct = Math.round((RARITY_MULT[a.rarity] - 1) * 100);
  const t = RARITIES.indexOf(a.rarity);
  switch (a.slot) {
    case 'skin': return t >= 3 ? '+1 heart' : 'Hero skin';
    case 'weapon': return `${a.element} slash${pct ? ` · +${pct}% reach` : ''}`;
    case 'pet': return pct ? `+${pct}% coin range` : 'Collects coins';
    case 'trinket':
      if (a.id === 'doubleJump') return t >= 3 ? 'Triple jump' : 'Double jump';
      if (a.id === 'shield') return t >= 2 ? 'Blocks 2 hits' : 'Blocks 1 hit';
      if (a.id === 'magnet') return `Pulls coins${pct ? ` · +${pct}% range` : ''}`;
      return `+10% speed · +${20 + 5 * t}% score`;
  }
}
