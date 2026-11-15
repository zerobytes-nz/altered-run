import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { ensureKeys, iconKey } from '../assets';
import { ELEMENT_COLOR, ELEMENT_ICON, RARITY_COLOR, SLOT_LABEL, awiTitle, hex, perkText, type AWI } from '../awi';
import type { Profile } from '../theoswap';
import { button, text } from '../ui';

/** One card per AWI: "Your NFT became a Legendary Storm Kunai". Tap for the next card. */
export class RevealScene extends Phaser.Scene {
  private profile!: Profile;
  private i = 0;
  private card?: Phaser.GameObjects.Container;
  private counter!: Phaser.GameObjects.Text;

  constructor() { super('Reveal'); }

  init(data: { profile: Profile }): void { this.profile = data.profile; this.i = 0; this.card = undefined; }

  create(): void {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b1020).setOrigin(0);
    const p = this.profile;
    const note = p.source === 'cache' ? ' · offline: last saved items' : p.source === 'demo' ? ' · sample data' : '';
    text(this, GAME_W / 2, 30, `${p.label}${note}`, 16, '#8fa3ff', '600').setOrigin(0.5);
    this.counter = text(this, GAME_W / 2, GAME_H - 30, '', 15, '#6c7bbd', '600').setOrigin(0.5);
    button(this, GAME_W - 110, GAME_H - 44, 'Skip →', () => this.done(), 160, 48, 0x1b2550);

    if (!p.awis.length) {
      text(this, GAME_W / 2, GAME_H / 2 - 30, 'No AWIs yet', 36, '#ffffff', '900').setOrigin(0.5);
      text(this, GAME_W / 2, GAME_H / 2 + 20, 'None of this player\'s NFTs map to Altered Run items yet.\nYou\'ll run with the default loadout.', 18, '#c0c8ff', '600')
        .setOrigin(0.5).setAlign('center');
      button(this, GAME_W / 2, GAME_H / 2 + 110, 'Continue', () => this.done(), 220, 56, 0xf72585);
      return;
    }
    const keys = [...new Set(p.awis.map((a) => iconKey(a.slot, a.id)))];
    ensureKeys(this, keys, () => {
      this.show();
      this.input.on('pointerup', (_: unknown, over: unknown[]) => { if (!over.length) this.next(); });
      this.input.keyboard?.on('keydown-SPACE', () => this.next());
    });
  }

  private next(): void {
    if (this.i >= this.profile.awis.length - 1) { this.done(); return; }
    this.i++;
    this.show();
  }

  private show(): void {
    const a: AWI = this.profile.awis[this.i];
    const old = this.card;
    if (old) this.tweens.add({ targets: old, x: old.x - 140, alpha: 0, duration: 180, onComplete: () => old.destroy() });

    const rc = RARITY_COLOR[a.rarity], ec = ELEMENT_COLOR[a.element];
    const W = 420, H = 380;
    const c = this.add.container(GAME_W / 2 + 140, GAME_H / 2 - 4).setAlpha(0);
    const glow = this.add.rectangle(0, 0, W + 18, H + 18, rc, a.rarity === 'Legendary' ? 0.45 : 0.18);
    const panel = this.add.rectangle(0, 0, W, H, 0x1b2550).setStrokeStyle(4, rc);
    const band = this.add.rectangle(0, -H / 2 + 22, W, 44, rc, 0.9);
    const rarity = text(this, 0, -H / 2 + 22, `${a.rarity.toUpperCase()} ${SLOT_LABEL[a.slot]}`, 18, '#0b1020', '900').setOrigin(0.5);
    const disc = this.add.circle(0, -38, 92, ec, 0.22).setStrokeStyle(3, ec, 0.8);
    const icon = this.add.image(0, -38, iconKey(a.slot, a.id), 0);
    icon.setScale(Math.min(150 / icon.frame.width, 150 / icon.frame.height));
    const lead = text(this, 0, 74, a.count > 1 ? `${a.count} of your NFTs became` : 'Your NFT became a', 16, '#c0c8ff', '600').setOrigin(0.5);
    const title = text(this, 0, 104, `${ELEMENT_ICON[a.element]} ${awiTitle(a)}`, 28, hex(rc), '900').setOrigin(0.5);
    const perk = text(this, 0, 140, perkText(a), 17, '#e8ecff', '600').setOrigin(0.5);
    const token = text(this, 0, H / 2 - 18, a.tokens.map((t) => `#${t.split(':')[1]}`).join('  '), 13, '#6c7bbd', '600').setOrigin(0.5);
    if (title.width > W - 24) title.setScale((W - 24) / title.width);
    c.add([glow, panel, band, rarity, disc, icon, lead, title, perk, token]);
    if (a.count > 1) c.add(text(this, W / 2 - 14, -H / 2 + 60, `×${a.count}`, 26, '#ffffff', '900').setOrigin(1, 0));

    this.tweens.add({ targets: c, x: GAME_W / 2, alpha: 1, duration: 260, ease: 'Back.Out' });
    if (a.rarity === 'Legendary' || a.rarity === 'Epic') this.tweens.add({ targets: glow, alpha: 0.12, yoyo: true, repeat: -1, duration: 700 });
    this.card = c;
    this.counter.setText(`${this.i + 1} / ${this.profile.awis.length} · tap for next`);
  }

  private done(): void { this.scene.start('Loadout', { profile: this.profile }); }
}
