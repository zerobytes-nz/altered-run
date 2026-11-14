import Phaser from 'phaser';
import { INPUT } from '../config';

export type Gesture = 'tap' | 'swipeRight' | 'swipeLeft' | 'swipeUp' | 'swipeDown';

interface Track { x: number; y: number; t: number; done: boolean; }

/**
 * One-thumb controls: tap = jump, swipe right = attack, swipe down = slide.
 * A swipe fires as soon as the finger passes the threshold (no wait for release),
 * a tap fires on release. Keyboard fallback for desktop testing.
 */
export class GestureInput {
  private tracks = new Map<number, Track>();
  private queue: Gesture[] = [];

  constructor(private scene: Phaser.Scene) {
    const inp = scene.input;
    inp.addPointer(1);
    inp.on('pointerdown', this.onDown, this);
    inp.on('pointermove', this.onMove, this);
    inp.on('pointerup', this.onUp, this);
    inp.on('pointerupoutside', this.onUp, this);

    const kb = inp.keyboard;
    if (kb) {
      kb.on('keydown-SPACE', () => this.queue.push('tap'));
      kb.on('keydown-UP', () => this.queue.push('tap'));
      kb.on('keydown-W', () => this.queue.push('tap'));
      kb.on('keydown-RIGHT', () => this.queue.push('swipeRight'));
      kb.on('keydown-X', () => this.queue.push('swipeRight'));
      kb.on('keydown-D', () => this.queue.push('swipeRight'));
      kb.on('keydown-DOWN', () => this.queue.push('swipeDown'));
      kb.on('keydown-S', () => this.queue.push('swipeDown'));
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Drain queued gestures (call once per frame). */
  poll(out: Gesture[]): void {
    out.length = 0;
    for (let i = 0; i < this.queue.length; i++) out.push(this.queue[i]);
    this.queue.length = 0;
  }

  private screenScale(): number {
    // pointer coords are in game space; convert threshold from screen px.
    const s = this.scene.scale.displayScale.x;
    return s > 0 ? s : 1;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    this.tracks.set(p.id, { x: p.x, y: p.y, t: p.downTime, done: false });
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const tr = this.tracks.get(p.id);
    if (!tr || tr.done || !p.isDown) return;
    const g = this.classify(p.x - tr.x, p.y - tr.y);
    if (g && p.event.timeStamp - tr.t <= INPUT.swipeMaxMs + 200) {
      tr.done = true;
      this.queue.push(g);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const tr = this.tracks.get(p.id);
    if (!tr) return;
    this.tracks.delete(p.id);
    if (tr.done) return;
    const g = this.classify(p.x - tr.x, p.y - tr.y);
    this.queue.push(g ?? 'tap');
  }

  private classify(dx: number, dy: number): Gesture | null {
    const min = INPUT.swipeMinPx * this.screenScale();
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < min && ay < min) return null;
    if (ax > ay) return dx > 0 ? 'swipeRight' : 'swipeLeft';
    return dy > 0 ? 'swipeDown' : 'swipeUp';
  }

  destroy(): void {
    const inp = this.scene.input;
    inp.off('pointerdown', this.onDown, this);
    inp.off('pointermove', this.onMove, this);
    inp.off('pointerup', this.onUp, this);
    inp.off('pointerupoutside', this.onUp, this);
    this.tracks.clear();
  }
}
