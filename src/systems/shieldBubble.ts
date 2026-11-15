import Phaser from 'phaser';

/** Drawn in code (no art file to license): a glossy soap bubble and a four-point sparkle, both at 2× for crisp edges. */
function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fx.bubble')) {
    const S = 256, r = 120, t = scene.textures.createCanvas('fx.bubble', S, S)!, c = t.getContext();
    const g = c.createRadialGradient(S / 2 - 30, S / 2 - 34, 10, S / 2, S / 2, r);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.6, 'rgba(128,232,255,0.16)');
    g.addColorStop(0.86, 'rgba(110,200,255,0.45)');
    g.addColorStop(1, 'rgba(190,140,255,0.62)');
    c.fillStyle = g; c.beginPath(); c.arc(S / 2, S / 2, r, 0, Math.PI * 2); c.fill();
    // Rainbow-ish rim, like a soap film.
    const rim = c.createLinearGradient(0, 0, S, S);
    rim.addColorStop(0, '#9ff3ff'); rim.addColorStop(0.35, '#ffffff'); rim.addColorStop(0.6, '#ffb3ec'); rim.addColorStop(1, '#8a7dff');
    c.strokeStyle = rim; c.lineWidth = 9; c.beginPath(); c.arc(S / 2, S / 2, r - 5, 0, Math.PI * 2); c.stroke();
    // Big shine top-left + small dot, the "glossy" read.
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.arc(S / 2, S / 2, r - 26, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(S / 2 - 30, S / 2 - 92, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(S / 2 + 62, S / 2 + 70, 18, 8, -0.7, 0, Math.PI * 2); c.fill();
    t.refresh();
  }
  if (!scene.textures.exists('fx.sparkle')) {
    const S = 48, t = scene.textures.createCanvas('fx.sparkle', S, S)!, c = t.getContext(), m = S / 2;
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 ? 5 : 22, a = (k * Math.PI) / 4 - Math.PI / 2;
      c.lineTo(m + rr * Math.cos(a), m + rr * Math.sin(a));
    }
    c.closePath(); c.fillStyle = '#fff6b8'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#ffb703'; c.stroke();
    t.refresh();
  }
}

const RADIUS = 58;

/**
 * The Shield trinket around the hero: a wobbling bubble with sparkles orbiting it (one more per charge).
 * pop() bursts it when it blocks a hit; inflate() blows it back up when it recharges.
 */
export class ShieldBubble {
  readonly root: Phaser.GameObjects.Container;
  private bubble: Phaser.GameObjects.Image;
  private sparkles: Phaser.GameObjects.Image[] = [];
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private charges = 0;

  constructor(private scene: Phaser.Scene, depth: number) {
    makeTextures(scene);
    this.bubble = scene.add.image(0, 0, 'fx.bubble').setScale((RADIUS * 2) / 256).setAlpha(0.95);
    for (let i = 0; i < 4; i++) this.sparkles.push(scene.add.image(0, 0, 'fx.sparkle').setScale(0.38));
    this.root = scene.add.container(0, 0, [this.bubble, ...this.sparkles]).setDepth(depth);
    this.burst = scene.add.particles(0, 0, 'fx.sparkle', {
      lifespan: 520, speed: { min: 180, max: 380 }, scale: { start: 0.42, end: 0 }, rotate: { min: 0, max: 360 },
      tint: [0xffffff, 0x9ff3ff, 0xffb3ec, 0xfff6b8], emitting: false,
    }).setDepth(depth + 1);
  }

  setCharges(n: number): void {
    this.charges = n;
    this.root.setVisible(n > 0);
    this.sparkles.forEach((s, i) => s.setVisible(i < n + 1));
  }

  /** Call every frame with the hero's centre. */
  update(x: number, y: number, now: number): void {
    this.root.setPosition(x, y);
    if (!this.root.visible) return;
    // Jelly wobble: squash one way while stretching the other.
    const w = Math.sin(now / 140) * 0.045;
    const base = (RADIUS * 2) / 256;
    this.bubble.setScale(base * (1 + w), base * (1 - w)).setAngle(Math.sin(now / 900) * 8);
    const shown = this.charges + 1;
    this.sparkles.forEach((s, i) => {
      if (i >= shown) return;
      const a = now / 520 + (i * Math.PI * 2) / shown;
      s.setPosition(Math.cos(a) * (RADIUS + 4), Math.sin(a) * (RADIUS + 4) * 0.9)
        .setAngle(now / 4 + i * 40).setScale(0.5 + 0.14 * Math.sin(now / 120 + i * 2));
    });
  }

  /** Blocked a hit: burst into sparkles, then show what's left. */
  pop(chargesLeft: number): void {
    const { x, y } = this.root;
    this.burst.explode(18, x, y);
    const ghost = this.scene.add.image(x, y, 'fx.bubble').setScale((RADIUS * 2) / 256).setDepth(this.root.depth + 1);
    this.scene.tweens.add({ targets: ghost, scale: ((RADIUS * 2) / 256) * 1.7, alpha: 0, duration: 260, ease: 'Cubic.Out', onComplete: () => ghost.destroy() });
    this.setCharges(chargesLeft);
    if (chargesLeft > 0) this.inflate();
  }

  /** Recharged (or still has charges after a pop): blow back up with a springy overshoot. */
  inflate(): void {
    this.setCharges(Math.max(this.charges, 1));
    this.scene.tweens.killTweensOf(this.root);
    this.root.setScale(0.2);
    this.scene.tweens.add({ targets: this.root, scale: 1, duration: 520, ease: 'Elastic.Out', easeParams: [1.1, 0.5] });
  }
}
