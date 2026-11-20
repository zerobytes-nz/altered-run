import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { ensureKeys, iconKey } from '../assets';
import { EARNED_PREFIX, ELEMENT_ICON, RARITY_COLOR, SLOTS, SLOT_LABEL, awiTitle, hex, nameOf, perkText, type AWI } from '../awi';
import { UNLOCKS, isItemUnlocked } from '../systems/shop';
import { DEFAULTS, type SlotId } from '../loadout';
import { forgetProfile, saveProfile, type Profile } from '../theoswap';
import { button, text } from '../ui';

const TILE = 70, GAP = 10, ROW_H = 96, TOP = 82, LEFT = 150;

/** Pick one AWI per slot. Doubles in a slot are all listed; identical AWIs show ×N; empty slots use the default. */
export class LoadoutScene extends Phaser.Scene {
  private profile!: Profile;
  private rows: Phaser.GameObjects.Container[] = [];

  constructor() { super('Loadout'); }

  init(data: { profile: Profile }): void { this.profile = data.profile; this.rows = []; }

  create(): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x141c3a).setOrigin(0);
    text(this, 24, 22, 'YOUR AWIs', 30, '#ffffff', '900');
    text(this, 24, 58, `${this.profile.label} · tap an AWI to equip it`, 15, '#8fa3ff', '600');

    const keys = [...new Set([
      ...this.profile.awis.map((a) => iconKey(a.slot, a.id)), ...SLOTS.map((s) => iconKey(s, DEFAULTS[s])),
      ...UNLOCKS.filter((u) => isItemUnlocked(u.slot, u.id)).map((u) => iconKey(u.slot, u.id)),
    ])];
    ensureKeys(this, keys, () => this.drawRows());

    button(this, GAME_W - 130, GAME_H - 46, '▶  PLAY', () => this.scene.start('Map'), 220, 60, 0xf72585);
    button(this, GAME_W - 330, GAME_H - 46, 'Cards', () => this.scene.start('Reveal', { profile: this.profile }), 140, 48, 0x3a0ca3);
    button(this, 100, GAME_H - 46, '← Menu', () => this.scene.start('Menu'), 150, 48, 0x1b2550);
    button(this, 270, GAME_H - 46, 'Disconnect', () => { forgetProfile(); this.scene.start('Menu'); }, 160, 48, 0x1b2550);
  }

  private drawRows(): void {
    this.rows.forEach((r) => r.destroy());
    this.rows = SLOTS.map((slot, i) => this.drawRow(slot, TOP + i * ROW_H));
  }

  private drawRow(slot: SlotId, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, y);
    c.add(text(this, 24, TILE / 2, SLOT_LABEL[slot], 15, '#8fa3ff').setOrigin(0, 0.5));
    const options = this.profile.awis.filter((a) => a.slot === slot);
    // Items unlocked by playing (THEOS-38): Common versions, offered after the AWIs.
    const earned = UNLOCKS.filter((u) => u.slot === slot && isItemUnlocked(slot, u.id)).map((u) => u.id);
    const pick = this.profile.selection[slot];
    const earnedPick = pick?.startsWith(EARNED_PREFIX) ? pick.slice(EARNED_PREFIX.length) : undefined;
    const selected = earnedPick ? undefined : options.find((a) => a.key === pick);
    const maxTiles = Math.floor((GAME_W - LEFT - 300) / (TILE + GAP));

    if (!options.length && !earned.length) {
      c.add(this.tile(LEFT, iconKey(slot, DEFAULTS[slot]), 0x4a557f, true));
      c.add(text(this, LEFT + TILE + 16, TILE / 2 - 12, `Default ${nameOf(slot, DEFAULTS[slot])}`, 18, '#c0c8ff'));
      c.add(text(this, LEFT + TILE + 16, TILE / 2 + 12, 'No NFT for this slot yet', 14, '#6c7bbd', '600'));
      return c;
    }
    const tiles: Array<{ key: string; color: number; on: boolean; a?: AWI; earnedId?: string }> = [
      ...options.map((a) => ({ key: iconKey(slot, a.id), color: RARITY_COLOR[a.rarity], on: a === selected, a })),
      ...earned.map((id) => ({ key: iconKey(slot, id), color: 0x80ffdb, on: earnedPick === id, earnedId: id })),
    ];
    tiles.slice(0, maxTiles).forEach((t, j) => {
      const x = LEFT + j * (TILE + GAP);
      const tile = this.tile(x, t.key, t.color, t.on, t.a);
      if (t.earnedId) tile.add(text(this, TILE / 2 - 3, TILE / 2 - 2, 'EARNED', 9, '#80ffdb', '900').setOrigin(1, 1).setStroke('#0b1020', 3));
      tile.list[0].setInteractive({ useHandCursor: true }).on('pointerup', () => this.select(slot, t.a ? t.a.key : EARNED_PREFIX + t.earnedId));
      c.add(tile);
    });
    if (tiles.length > maxTiles) c.add(text(this, LEFT + maxTiles * (TILE + GAP), TILE / 2, `+${tiles.length - maxTiles}`, 18, '#c0c8ff').setOrigin(0, 0.5));
    const x = GAME_W - 280;
    if (selected) {
      c.add(text(this, x, TILE / 2 - 13, `${ELEMENT_ICON[selected.element]} ${awiTitle(selected)}`, 18, hex(RARITY_COLOR[selected.rarity])).setOrigin(0, 0.5));
      c.add(text(this, x, TILE / 2 + 13, perkText(selected), 14, '#c0c8ff', '600').setOrigin(0, 0.5));
    } else if (earnedPick) {
      c.add(text(this, x, TILE / 2 - 13, `Common ${nameOf(slot, earnedPick)}`, 18, '#80ffdb').setOrigin(0, 0.5));
      c.add(text(this, x, TILE / 2 + 13, 'Earned by playing · no AWI bonus', 14, '#c0c8ff', '600').setOrigin(0, 0.5));
    }
    return c;
  }

  private tile(x: number, key: string, color: number, on: boolean, a?: AWI): Phaser.GameObjects.Container {
    const t = this.add.container(x + TILE / 2, TILE / 2);
    const bg = this.add.rectangle(0, 0, TILE, TILE, on ? 0x2a3a7a : 0x1b2550).setStrokeStyle(on ? 4 : 2, color, on ? 1 : 0.6);
    const icon = this.add.image(0, 0, key, 0);
    icon.setScale(Math.min((TILE * 0.8) / icon.frame.width, (TILE * 0.8) / icon.frame.height));
    if (!on) icon.setAlpha(0.7);
    t.add([bg, icon]);
    if (a && a.count > 1) t.add(text(this, TILE / 2 - 4, TILE / 2 - 2, `×${a.count}`, 14, '#ffffff', '900').setOrigin(1, 1).setStroke('#0b1020', 4));
    return t;
  }

  private select(slot: SlotId, key: string): void {
    this.profile.selection = { ...this.profile.selection, [slot]: key };
    saveProfile(this.profile);
    this.drawRows();
  }
}
