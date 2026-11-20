// Coin shop, upgrades and play-earned unlocks (THEOS-38). Kept on the device (localStorage), in its own
// versioned record next to the stage progress.
//
// Fair by design: everything here is earnable by playing. Unlocked items are always the Common version;
// AWIs from the player's NFTs stay the better versions (rarity bonuses and an element).
import { DEFAULTS, PETS, SKINS, TRINKETS, WEAPONS, type Loadout, type SlotId } from '../loadout';
import { totalStars } from './progress';

export type UpgradeId = 'heart' | 'fill' | 'shield';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** What one level does. */
  desc: string;
  /** Cost of each level, in order. Max level = costs.length. */
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'heart', name: 'Extra heart', desc: '+1 heart per level', costs: [400, 1200] },
  { id: 'fill', name: 'Quick POWER', desc: 'POWER fills 15% faster per level', costs: [150, 400, 900] },
  { id: 'shield', name: 'Fast shield', desc: 'Shield trinket recharges 15% faster per level', costs: [200, 500, 1000] },
];

export interface UnlockDef {
  slot: SlotId;
  id: string;
  /** Unlocks for free at this many stars… */
  stars: number;
  /** …or can be bought early for this many coins. */
  cost: number;
}

/** The Common version of every non-default item. Star goals fit inside World 1 (18 stars). */
export const UNLOCKS: UnlockDef[] = [
  { slot: 'weapon', id: 'kunai', stars: 2, cost: 300 },
  { slot: 'pet', id: 'dog', stars: 3, cost: 300 },
  { slot: 'trinket', id: 'magnet', stars: 5, cost: 400 },
  { slot: 'skin', id: 'ninja', stars: 7, cost: 600 },
  { slot: 'weapon', id: 'hammer', stars: 9, cost: 600 },
  { slot: 'trinket', id: 'shield', stars: 11, cost: 700 },
  { slot: 'pet', id: 'drone', stars: 13, cost: 800 },
  { slot: 'skin', id: 'robot', stars: 15, cost: 1000 },
  { slot: 'trinket', id: 'speed', stars: 17, cost: 1000 },
];

const DEFS: Record<SlotId, Record<string, { name: string }>> = { skin: SKINS, weapon: WEAPONS, pet: PETS, trinket: TRINKETS };
export const itemName = (slot: SlotId, id: string): string => DEFS[slot][id]?.name ?? id;

interface ShopRecord {
  v: 1;
  coins: number;
  /** Lifetime coins banked (for achievements and stats). */
  earned: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Items bought with coins before their star goal. */
  bought: string[];
  /** Earned items equipped in slots that have no AWI picked. */
  equipped: Partial<Record<SlotId, string>>;
}

const KEY = 'altered-run.shop.v1';
let cache: ShopRecord | null = null;
const fresh = (): ShopRecord => ({ v: 1, coins: 0, earned: 0, upgrades: {}, bought: [], equipped: {} });

function load(): ShopRecord {
  if (cache) return cache;
  let r = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.v === 1) r = { ...fresh(), ...parsed };
  } catch { /* storage blocked or bad JSON: start fresh */ }
  cache = r;
  return r;
}

function save(r: ShopRecord): void {
  cache = r;
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage blocked: keep it for this session */ }
}

/** For tests: forget the in-memory copy so the next read comes from storage. */
export function _resetShopCache(): void { cache = null; }

export const coins = (): number => load().coins;
export const lifetimeCoins = (): number => load().earned;
export const upgradeLevel = (id: UpgradeId): number => load().upgrades[id] ?? 0;

export function nextUpgradeCost(id: UpgradeId): number | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  return def.costs[upgradeLevel(id)] ?? null;
}

/** Add the coins from a run to the wallet. Returns the new balance. */
export function bankCoins(n: number): number {
  const r = load();
  const add = Math.max(0, Math.floor(n || 0));
  r.coins += add;
  r.earned += add;
  save(r);
  return r.coins;
}

export function buyUpgrade(id: UpgradeId): boolean {
  const r = load();
  const cost = nextUpgradeCost(id);
  if (cost == null || r.coins < cost) return false;
  r.coins -= cost;
  r.upgrades[id] = (r.upgrades[id] ?? 0) + 1;
  save(r);
  return true;
}

const unlockKey = (slot: SlotId, id: string) => `${slot}:${id}`;
export const unlockOf = (slot: SlotId, id: string) => UNLOCKS.find((u) => u.slot === slot && u.id === id);

/** Defaults are always yours; everything else unlocks at its star goal or when bought. */
export function isItemUnlocked(slot: SlotId, id: string, stars = totalStars()): boolean {
  if (DEFAULTS[slot] === id) return true;
  const u = unlockOf(slot, id);
  if (!u) return false;
  return stars >= u.stars || load().bought.includes(unlockKey(slot, id));
}

export function buyUnlock(slot: SlotId, id: string): boolean {
  const u = unlockOf(slot, id);
  const r = load();
  if (!u || isItemUnlocked(slot, id) || r.coins < u.cost) return false;
  r.coins -= u.cost;
  r.bought.push(unlockKey(slot, id));
  save(r);
  return true;
}

/** Items unlocked by reaching `after` stars that were still locked at `before` (for the results screen). */
export function newlyUnlocked(before: number, after: number): UnlockDef[] {
  const bought = load().bought;
  return UNLOCKS.filter((u) => u.stars > before && u.stars <= after && !bought.includes(unlockKey(u.slot, u.id)));
}

export function equippedEarned(): Partial<Record<SlotId, string>> {
  const out: Partial<Record<SlotId, string>> = {};
  for (const [slot, id] of Object.entries(load().equipped) as [SlotId, string][]) {
    if (id && isItemUnlocked(slot, id)) out[slot] = id;
  }
  return out;
}

export function equipEarned(slot: SlotId, id: string): boolean {
  if (!isItemUnlocked(slot, id)) return false;
  const r = load();
  r.equipped = { ...r.equipped, [slot]: id };
  save(r);
  return true;
}

/** Apply bought upgrades to a run's loadout (called last, after AWIs and earned items). */
export function applyUpgrades(lo: Loadout): Loadout {
  const heart = upgradeLevel('heart'), fill = upgradeLevel('fill'), shield = upgradeLevel('shield');
  const out: Loadout = { ...lo, hearts: lo.hearts + heart, fillMul: +(lo.fillMul * (1 + 0.15 * fill)).toFixed(2) };
  if (shield && lo.trinket.shield) {
    out.trinket = { ...lo.trinket, shieldRechargeMs: Math.round((lo.trinket.shieldRechargeMs ?? 15000) * (1 - 0.15 * shield)) };
  }
  return out;
}

/** For ?debug: wipe the wallet, upgrades and unlocks. */
export function resetShop(): void { save(fresh()); }
