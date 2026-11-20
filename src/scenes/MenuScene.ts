import Phaser from 'phaser';
import { GAME_W, GAME_H, GROUND_Y } from '../config';
import { ensureLoaded, scaleOf } from '../assets';
import { currentLoadout, loadProfile } from '../theoswap';
import { loadScores } from '../systems/highscores';
import { maxStars, totalStars } from '../systems/progress';
import { coins } from '../systems/shop';
import { button, muteButton, slotRow, text } from '../ui';
import { canInstall, install, isInstalled, onInstallChange, openInChromeUrl, tryCloseApp } from '../systems/install';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    const lo = currentLoadout();
    const profile = loadProfile();
    this.add.graphics().fillGradientStyle(0x7fd0f2, 0x7fd0f2, 0xddf8ff, 0xddf8ff, 1).fillRect(0, 0, GAME_W, GROUND_Y);
    this.add.tileSprite(0, GROUND_Y - 30, GAME_W, 220, 'bg.far').setOrigin(0, 1).setTileScale(scaleOf('bg.far'));
    this.add.tileSprite(0, GROUND_Y + 4, GAME_W, 160, 'bg.near').setOrigin(0, 1).setTileScale(scaleOf('bg.near'));
    this.add.tileSprite(0, GROUND_Y - 6, GAME_W, GAME_H - GROUND_Y + 6, 'bg.ground').setOrigin(0).setTileScale(scaleOf('bg.ground'));

    text(this, GAME_W / 2, 56, 'ALTERED RUN', 56, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 10);
    text(this, GAME_W / 2, 104, 'Your NFTs become AWIs (Altered World Items)', 18, '#ffffff', '700').setOrigin(0.5).setStroke('#2b2440', 5);

    const heroKey = `hero.${lo.skin.id}.run`;
    this.add.sprite(150, GROUND_Y, heroKey).setOrigin(0.5, 1).setScale(scaleOf(heroKey) * 1.4).play(heroKey);
    const petKey = `pet.${lo.pet.id}`;
    this.add.sprite(70, GROUND_Y + 2, petKey).setOrigin(0.5, 1).setScale(scaleOf(petKey)).play(petKey);

    text(this, 320, 160, profile ? `YOUR AWIs · ${profile.label}` : 'GUEST LOADOUT', 14, '#ffffff').setOrigin(0, 0.5).setStroke('#2b2440', 4);
    slotRow(this, 320, 190, lo, 72, 14);

    button(this, GAME_W / 2 + 40, 330, '▶  PLAY', () => this.scene.start('Map'), 260, 64, 0xf72585);
    button(this, GAME_W / 2 + 40, 398, profile ? 'My AWIs' : 'Connect TheoSwap', () => {
      if (profile) this.scene.start('Loadout', { profile }); else this.scene.start('Connect');
    }, 260, 50, 0x4361ee);
    // A random run: today's mixed-up run with the high-score table (becomes Endless mode in THEOS-40).
    for (const [dx, label, onTap] of [[-92, 'Random run', () => this.play()], [0, `Shop ● ${coins()}`, () => this.scene.start('Shop')], [92, 'High scores', () => this.showScores()]] as const) {
      const b = button(this, GAME_W / 2 + 40 + dx, 456, label, onTap, 88, 44, dx === 0 ? 0x2a9d8f : 0x3a0ca3);
      (b.list[1] as Phaser.GameObjects.Text).setFontSize(15);
    }
    text(this, GAME_W - 16, GAME_H - 12, 'Tap = jump · ↓ slide · ATTACK and POWER buttons bottom right', 14, '#ffffff', '700').setOrigin(1, 1).setStroke('#2b2440', 4);
    text(this, 16, GAME_H - 12, `v0.2 · ★ ${totalStars()} / ${maxStars()}`, 12, '#ffffff', '700').setOrigin(0, 1).setStroke('#2b2440', 3);

    muteButton(this, GAME_W - 34, 34);
    this.appButtons();
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('Map'));
  }

  /** Top corners: "Install app" (until it is installed) and "Exit" (in full screen or the installed app). */
  private appButtons(): void {
    const inst = button(this, 104, 34, '📲 Install app', () => this.installApp(), 176, 44, 0x2a9d8f);
    (inst.list[1] as Phaser.GameObjects.Text).setFontSize(18);
    const exit = button(this, GAME_W - 132, 34, '✕ Exit', () => this.exitApp(), 110, 44, 0x6c1d45);
    (exit.list[1] as Phaser.GameObjects.Text).setFontSize(18);
    const sync = () => {
      inst.setVisible(canInstall());
      exit.setVisible(isInstalled() || this.scale.isFullscreen);
    };
    sync();
    const off = onInstallChange(sync);
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, sync).on(Phaser.Scale.Events.LEAVE_FULLSCREEN, sync);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, sync).off(Phaser.Scale.Events.LEAVE_FULLSCREEN, sync);
    });
  }

  private installApp(): void {
    install().then((r) => {
      if (r === 'ios') {
        this.notice('INSTALL ON IPHONE / IPAD', [
          '1.  Tap the Share button  ⬆  in the browser bar',
          '2.  Choose  "Add to Home Screen"',
          '3.  Open Altered Run from your home screen:',
          '     it plays full screen, even offline.',
        ]);
      } else if (r === 'use-chrome') {
        this.notice('INSTALL WITH CHROME', [
          'This browser builds an old-style app, and Android',
          'warns about it. Chrome installs it cleanly:',
          '1.  Tap  "Open in Chrome"  below',
          '2.  Tap  📲 Install app  again there',
        ], { label: 'Open in Chrome', onTap: () => { location.href = openInChromeUrl(); } });
      } else if (r === 'unavailable') {
        this.notice('INSTALL', ['Open your browser menu  ⋮  and choose', '"Install app" or "Add to Home screen".']);
      }
    });
  }

  private exitApp(): void {
    if (this.scale.isFullscreen && !isInstalled()) { this.scale.stopFullscreen(); return; }
    tryCloseApp().then((closed) => {
      if (!closed) this.notice('CLOSE THE GAME', ['Swipe up, or use your phone\'s Home or Back', 'button. Your progress is saved.']);
    });
  }

  /** A simple panel; tap outside the button to close it. */
  private notice(title: string, lines: string[], action?: { label: string; onTap: () => void }): void {
    const layer = this.add.container(0, 0).setDepth(20);
    const shade = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(GAME_W / 2, GAME_H / 2, 620, 320, 0x1b2550).setInteractive().setStrokeStyle(3, 0x8fa3ff, 0.6);
    layer.add([shade, panel, text(this, GAME_W / 2, GAME_H / 2 - 110, title, 28).setOrigin(0.5)]);
    lines.forEach((l, i) => layer.add(text(this, GAME_W / 2 - 250, GAME_H / 2 - 60 + i * 36, l, 20, '#e8ecff', '600').setOrigin(0, 0.5)));
    if (action) layer.add(button(this, GAME_W / 2, GAME_H / 2 + 92, action.label, action.onTap, 240, 48, 0x2a9d8f));
    layer.add(text(this, GAME_W / 2, GAME_H / 2 + 132, 'Tap outside to close', 15, '#8fa3ff', '600').setOrigin(0.5));
    shade.on('pointerup', () => layer.destroy());
  }

  private play(): void {
    // Fullscreen + landscape lock need a user gesture; both are best-effort.
    if (this.sys.game.device.input.touch && !this.scale.isFullscreen) {
      try { this.scale.startFullscreen(); } catch { /* not allowed */ }
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('landscape').catch(() => {});
    }
    const lo = currentLoadout();
    ensureLoaded(this, lo, () => this.scene.start('Run', { loadout: lo }));
  }

  private showScores(): void {
    const layer = this.add.container(0, 0).setDepth(10);
    const shade = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(GAME_W / 2, GAME_H / 2, 520, 420, 0x1b2550).setStrokeStyle(3, 0x8fa3ff, 0.6);
    layer.add([shade, panel, text(this, GAME_W / 2, 90, 'HIGH SCORES', 30).setOrigin(0.5)]);
    const list = loadScores();
    if (!list.length) layer.add(text(this, GAME_W / 2, GAME_H / 2, 'No runs yet. Go set one!', 20, '#c0c8ff', '600').setOrigin(0.5));
    list.forEach((e, i) => {
      const y = 132 + i * 30;
      const d = new Date(e.date);
      layer.add(text(this, GAME_W / 2 - 220, y, `${i + 1}.`, 18, '#8fa3ff'));
      layer.add(text(this, GAME_W / 2 - 180, y, `${e.score}`, 18, '#ffffff'));
      layer.add(text(this, GAME_W / 2 - 40, y, `${e.skin}${e.finished ? ' 🏁' : ''}`, 16, '#c0c8ff', '600'));
      layer.add(text(this, GAME_W / 2 + 220, y, `${d.getMonth() + 1}/${d.getDate()}`, 16, '#6c7bbd', '600').setOrigin(1, 0));
    });
    shade.once('pointerup', () => layer.destroy());
  }
}
