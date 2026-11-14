import Phaser from 'phaser';
import { ATLAS, buildPlaceholderAtlas } from '../art/placeholder';
import { SKINS, PETS } from '../loadout';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    buildPlaceholderAtlas(this);
    for (const skin of Object.keys(SKINS)) {
      this.anims.create({
        key: `${skin}-run`,
        frames: [0, 1, 2, 3].map((i) => ({ key: ATLAS, frame: `${skin}/run${i}` })),
        frameRate: 12,
        repeat: -1,
      });
    }
    for (const pet of Object.keys(PETS)) {
      this.anims.create({
        key: `${pet}-move`,
        frames: [0, 1].map((i) => ({ key: ATLAS, frame: `pet/${pet}${i}` })),
        frameRate: 7,
        repeat: -1,
      });
    }
    this.anims.create({
      key: 'coin-spin',
      frames: [0, 1, 2, 3].map((i) => ({ key: ATLAS, frame: `obj/coin${i}` })),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'slime-wobble',
      frames: [0, 1].map((i) => ({ key: ATLAS, frame: `obj/slime${i}` })),
      frameRate: 5,
      repeat: -1,
    });
    document.getElementById('loading')?.remove();
    this.scene.start('Menu');
  }
}
