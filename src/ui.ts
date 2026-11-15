import Phaser from 'phaser';
import type { Loadout, SlotId } from './loadout';
import { RARITY_COLOR } from './awi';
import { isMuted, onMuteChange, sfx, toggleMute } from './systems/audio';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function text(scene: Phaser.Scene, x: number, y: number, s: string, size = 20, color = '#e8ecff', weight = '700') {
  return scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight });
}

export function button(scene: Phaser.Scene, x: number, y: number, label: string, onTap: () => void, w = 220, h = 60, fill = 0x4361ee) {
  const bg = scene.add.rectangle(0, 0, w, h, fill).setStrokeStyle(3, 0xffffff, 0.25);
  const t = text(scene, 0, 0, label, 24).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, t]).setSize(w, h);
  bg.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => c.setScale(0.96))
    .on('pointerout', () => c.setScale(1))
    .on('pointerup', () => { c.setScale(1); sfx.tap(); onTap(); });
  return c;
}

/** Round speaker button that toggles sound (also the M key). Stays in sync across scenes. */
export function muteButton(scene: Phaser.Scene, x: number, y: number, r = 22) {
  const bg = scene.add.circle(0, 0, r, 0x0b1020, 0.55).setStrokeStyle(2, 0xffffff, 0.35);
  const t = text(scene, 0, 1, '', Math.round(r * 0.95), '#ffffff').setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, t]).setSize(r * 2, r * 2);
  const draw = (m: boolean) => t.setText(m ? '🔇' : '🔊');
  draw(isMuted());
  const off = onMuteChange(draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  bg.setInteractive({ useHandCursor: true }).on('pointerup', () => { toggleMute(); sfx.tap(); });
  return c;
}

/** The four AWI slots (skin, weapon, pet, trinket) shown as a row. */
export function slotRow(scene: Phaser.Scene, x: number, y: number, lo: Loadout, size = 64, gap = 10, labels = true, labelSize = 13) {
  const entries: [string, string, string, SlotId][] = [
    ['HERO', `hero.${lo.skin.id}.idle`, lo.skin.name, 'skin'],
    ['WEAPON', `weapon.${lo.weapon.id}`, lo.weapon.name, 'weapon'],
    ['PET', `pet.${lo.pet.id}`, lo.pet.name, 'pet'],
    ['TRINKET', `trinket.${lo.trinket.id}`, lo.trinket.name, 'trinket'],
  ];
  const c = scene.add.container(x, y);
  entries.forEach(([slot, frame, name, slotId], i) => {
    const cx = i * (size + gap) + size / 2;
    const bg = scene.add.image(cx, size / 2, 'ui.slot').setDisplaySize(size, size);

    const icon = scene.add.image(cx, size / 2, frame, 0);
    const f = icon.frame;
    icon.setScale(Math.min((size * 0.78) / f.width, (size * 0.78) / f.height));
    c.add([bg, icon]);
    const awi = lo.awis[slotId]; // from an NFT: rarity-coloured frame
    if (awi) c.add(scene.add.rectangle(cx, size / 2, size - 2, size - 2).setStrokeStyle(3, RARITY_COLOR[awi.rarity]));
    if (labels) {
      c.add(text(scene, cx, size + 3, name, labelSize, '#e8ecff').setOrigin(0.5, 0).setStroke('#0b1020', 3));
      c.add(text(scene, cx, -3, slot, Math.max(9, labelSize - 3), '#8fa3ff').setOrigin(0.5, 1).setStroke('#0b1020', 3));
    }
  });
  return c;
}
