import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { preloadFor } from '../assets';
import { currentLoadout } from '../theoswap';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    const w = 320, x = (GAME_W - w) / 2, y = GAME_H / 2;
    this.add.rectangle(x, y, w, 12, 0x1b2550).setOrigin(0, 0.5);
    const bar = this.add.rectangle(x, y, 1, 12, 0x8fa3ff).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => { bar.width = Math.max(1, w * p); });
    document.getElementById('loading')?.remove();
    preloadFor(this, currentLoadout());
  }

  create(): void {
    this.scene.start('Menu');
  }
}
