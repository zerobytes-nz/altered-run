import Phaser from 'phaser';
import { GAME_W, GAME_H, DEBUG } from '../config';
import { ensureKeys, iconKey } from '../assets';
import { SLOTS, SLOT_LABEL } from '../awi';
import { DEFAULTS, type SlotId } from '../loadout';
import { totalStars } from '../systems/progress';
import {
  UNLOCKS, UPGRADES, buyUnlock, buyUpgrade, coins, equipEarned, equippedEarned, isItemUnlocked, itemName,
  nextUpgradeCost, resetShop, unlockOf, upgradeLevel,
} from '../systems/shop';
import { sfx } from '../systems/audio';
import { button, muteButton, text } from '../ui';

const TILE = 64;

/**
 * Coin shop (THEOS-38). Left: upgrades bought with coins from runs. Right: the Common version of every item,
 * unlocked by stars or bought early, and which one to use in slots without an AWI.
 */
export class ShopScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private back = 'Menu';

  constructor() { super('Shop'); }

  init(data: { back?: string }): void { this.back = data?.back ?? 'Menu'; }

  create(): void {
    muteButton(this, GAME_W - 34, 34).setDepth(5);
    const keys = SLOTS.flatMap((slot) => [iconKey(slot, DEFAULTS[slot]), ...UNLOCKS.filter((u) => u.slot === slot).map((u) => iconKey(slot, u.id))]);
    ensureKeys(this, keys, () => this.draw());
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start(this.back));
    if (DEBUG) this.input.keyboard?.on('keydown-R', () => { resetShop(); this.draw(); });
  }

  private draw(): void {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    L.add(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x141c3a).setOrigin(0));
    L.add(button(this, 82, 34, '← Back', () => this.scene.start(this.back), 140, 44, 0x1b2550));
    L.add(text(this, GAME_W / 2, 34, 'SHOP', 30, '#ffffff', '900').setOrigin(0.5));
    L.add(text(this, GAME_W - 76, 34, `● ${coins()}`, 22, '#ffd34d', '900').setOrigin(1, 0.5));
    L.add(text(this, GAME_W / 2, 66, 'Coins from every run land here. Everything is earnable by playing; AWIs from your NFTs are the better versions.', 13, '#8fa3ff', '600').setOrigin(0.5));
    this.drawUpgrades(L);
    this.drawItems(L);
  }

  private drawUpgrades(L: Phaser.GameObjects.Container): void {
    const x = 24, w = 300;
    L.add(text(this, x, 92, 'UPGRADES', 16, '#8fa3ff', '900'));
    UPGRADES.forEach((u, i) => {
      const y = 118 + i * 128;
      const level = upgradeLevel(u.id), max = u.costs.length, cost = nextUpgradeCost(u.id);
      L.add(this.add.rectangle(x, y, w, 116, 0x1b2550).setOrigin(0).setStrokeStyle(2, 0x8fa3ff, 0.35));
      L.add(text(this, x + 14, y + 12, u.name, 20, '#ffffff', '900'));
      L.add(text(this, x + 14, y + 40, u.desc, 13, '#c0c8ff', '600'));
      // Level pips.
      for (let k = 0; k < max; k++) {
        L.add(this.add.rectangle(x + 14 + k * 26, y + 76, 20, 12, k < level ? 0x80ffdb : 0x3a4166).setOrigin(0, 0.5));
      }
      if (cost == null) {
        L.add(text(this, x + w - 14, y + 84, 'MAX', 18, '#80ffdb', '900').setOrigin(1, 0.5));
      } else {
        const afford = coins() >= cost;
        const b = button(this, x + w - 72, y + 84, `● ${cost}`, () => {
          if (buyUpgrade(u.id)) { sfx.combo(level + 2); this.draw(); } else this.flash('Not enough coins yet');
        }, 120, 40, afford ? 0x2a9d8f : 0x3a4166);
        (b.list[1] as Phaser.GameObjects.Text).setFontSize(18);
        L.add(b);
      }
    });
  }

  private drawItems(L: Phaser.GameObjects.Container): void {
    const x0 = 352, stars = totalStars(), equipped = equippedEarned();
    L.add(text(this, x0, 92, `ITEMS · ★ ${stars}`, 16, '#8fa3ff', '900'));
    L.add(text(this, GAME_W - 24, 92, 'Used in slots where you have no AWI picked', 12, '#6c7bbd', '600').setOrigin(1, 0));
    SLOTS.forEach((slot, row) => {
      const y = 118 + row * 98;
      L.add(text(this, x0, y + TILE / 2, SLOT_LABEL[slot], 13, '#8fa3ff', '900').setOrigin(0, 0.5));
      const ids = [DEFAULTS[slot], ...UNLOCKS.filter((u) => u.slot === slot).map((u) => u.id)];
      ids.forEach((id, j) => {
        const x = x0 + 76 + j * 124;
        const unlocked = isItemUnlocked(slot, id, stars);
        const on = (equipped[slot] ?? DEFAULTS[slot]) === id;
        L.add(this.itemTile(slot, id, x, y, unlocked, on));
      });
    });
  }

  private itemTile(slot: SlotId, id: string, x: number, y: number, unlocked: boolean, on: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(TILE / 2, TILE / 2, TILE, TILE, on ? 0x2a3a7a : 0x1b2550).setStrokeStyle(on ? 4 : 2, on ? 0x80ffdb : 0x8fa3ff, on ? 1 : 0.4);
    const icon = this.add.image(TILE / 2, TILE / 2, iconKey(slot, id), 0);
    icon.setScale(Math.min((TILE * 0.78) / icon.frame.width, (TILE * 0.78) / icon.frame.height));
    if (!unlocked) icon.setTint(0x222842).setAlpha(0.8);
    // Name and state under the tile, so long names never run into the next one.
    const label = (y: number, s: string, size: number, color: string, weight = '800') =>
      text(this, TILE / 2, y, s, size, color, weight).setOrigin(0.5, 0);
    c.add([bg, icon, label(TILE + 2, itemName(slot, id), 13, unlocked ? '#ffffff' : '#8f97c0')]);

    const u = unlockOf(slot, id);
    if (on) c.add(label(TILE + 17, 'IN USE', 11, '#80ffdb', '900'));
    else if (unlocked) c.add(label(TILE + 17, 'Tap to use', 11, '#c0c8ff', '600'));
    else if (u) c.add(label(TILE + 17, `★ ${u.stars}  or  ● ${u.cost}`, 11, coins() >= u.cost ? '#80ffdb' : '#ffd34d', '700'));
    bg.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (unlocked) {
        if (!on && equipEarned(slot, id)) { sfx.tap(); this.draw(); }
        return;
      }
      if (u && buyUnlock(slot, id)) { equipEarned(slot, id); sfx.combo(4); this.draw(); }
      else if (u) this.flash(`Earn ★ ${u.stars} or collect ● ${u.cost} to unlock`);
    });
    return c;
  }

  private flash(msg: string): void {
    const t = text(this, GAME_W / 2, GAME_H - 26, msg, 18, '#ffd34d', '800').setOrigin(0.5).setDepth(10).setStroke('#0b1020', 4);
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 400, onComplete: () => t.destroy() });
  }
}
