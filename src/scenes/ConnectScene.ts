import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { DEMO_PROFILES, type DemoId } from '../demo';
import { connect, connectDemo, hasApiKey, normalizeCode, type Profile } from '../theoswap';
import { button, text } from '../ui';

/** TheoSwap test codes that have Altered Run test items: AAAAAAAA = 13 AWIs, BBBBBBBB = 5, CCCCCCCC = 1. */
const TEST_CODES = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC'];

/** Enter a TheoSwap user code (or pick a demo profile) to turn your NFTs into AWIs. */
export class ConnectScene extends Phaser.Scene {
  private busy = false;
  private status!: Phaser.GameObjects.Text;
  private codeField!: HTMLInputElement;

  private autoCode = '';

  constructor() { super('Connect'); }

  /** `code` comes from a ?userCode= deep link: fill it in and connect right away. */
  init(data: { code?: string }): void {
    this.autoCode = data?.code ?? '';
    // Use the deep-link code once. Phaser hands a scene its last start data again when it is restarted
    // without new data, so without this, Disconnect → Connect would log straight back in.
    if (data) delete data.code;
  }

  create(): void {
    this.busy = false;
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x141c3a).setOrigin(0);
    text(this, GAME_W / 2, 50, 'CONNECT THEOSWAP', 40, '#ffffff', '900').setOrigin(0.5);
    text(this, GAME_W / 2, 92, 'Your NFTs become AWIs (Altered World Items) in this game.', 18, '#8fa3ff', '600').setOrigin(0.5);

    text(this, GAME_W / 2, 140, 'Enter the player code from your TheoSwap profile', 18, '#e8ecff', '600').setOrigin(0.5);
    const dom = this.add.dom(GAME_W / 2 - 80, 190).createFromHTML(
      '<input type="text" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16" placeholder="PLAYER CODE" ' +
      'style="width:300px;height:52px;box-sizing:border-box;padding:0 14px;font:700 24px system-ui,sans-serif;letter-spacing:3px;' +
      'text-transform:uppercase;color:#fff;background:#0b1020;border:3px solid #4361ee;border-radius:8px;outline:none;user-select:text;-webkit-user-select:text">');
    this.codeField = dom.node.querySelector('input') as HTMLInputElement;
    this.codeField.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.submit(); });
    button(this, GAME_W / 2 + 160, 190, 'Connect', () => this.submit(), 150, 52, 0xf72585);

    this.status = text(this, GAME_W / 2, 238, hasApiKey ? '' : 'This build has no API key: only the demos work.', 16, '#ffb3c6', '600')
      .setOrigin(0.5).setWordWrapWidth(820).setAlign('center');

    text(this, GAME_W / 2, 284, 'No NFTs handy? Try a demo player:', 18, '#e8ecff', '600').setOrigin(0.5);
    (Object.keys(DEMO_PROFILES) as DemoId[]).forEach((id, i) => {
      const x = GAME_W / 2 + (i - 1) * 290;
      button(this, x, 340, DEMO_PROFILES[id].name, () => this.run(() => connectDemo(id)), 250, 54, 0x3a0ca3);
      text(this, x, 376, DEMO_PROFILES[id].blurb, 14, '#c0c8ff', '600').setOrigin(0.5, 0).setWordWrapWidth(250).setAlign('center');
    });

    // Showcase: TheoSwap's test players (real API answers, easy to remember). The server maps these
    // codes to the game's TEST key; every other code goes to the live key (README → Deploy).
    if (hasApiKey) {
      text(this, GAME_W / 2 + 80, 430, 'Or try a TheoSwap test player:', 16, '#e8ecff', '600').setOrigin(0.5);
      TEST_CODES.forEach((code, i) => {
        button(this, GAME_W / 2 + 80 + (i - 1) * 180, 474, code, () => { this.codeField.value = code; this.submit(); }, 168, 44, 0x4361ee);
      });
    }

    button(this, 110, GAME_H - 44, '← Back', () => this.scene.start('Menu'), 160, 48, 0x1b2550);
    if (this.autoCode) { this.codeField.value = this.autoCode; this.submit(); }
    else this.codeField.focus({ preventScroll: true });
  }

  private submit(): void {
    const code = normalizeCode(this.codeField.value).toUpperCase();
    if (code.length < 4) { this.status.setText('Enter the code from your TheoSwap profile.'); return; }
    this.run(() => connect(code));
  }

  private run(task: () => Promise<Profile>): void {
    if (this.busy) return;
    this.busy = true;
    this.status.setColor('#c0c8ff').setText('Connecting to TheoSwap…');
    task().then(
      (profile) => { this.codeField.blur(); this.scene.start('Reveal', { profile }); },
      (e: unknown) => { this.busy = false; this.status.setColor('#ffb3c6').setText(e instanceof Error ? e.message : 'Something went wrong.'); },
    );
  }
}
