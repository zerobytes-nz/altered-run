import Phaser from 'phaser';

/**
 * Placeholder art, drawn at runtime into ONE canvas atlas so the whole run batches
 * into very few draw calls and nothing needs downloading. Frame names match what
 * real art packs will use later (e.g. `knight/run0`), so swapping in a TexturePacker
 * atlas only changes the texture key.
 */

export const ATLAS = 'ph';
type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
interface Item { name: string; w: number; h: number; draw: Draw; }

interface HeroPal { body: string; head: string; accent: string; limb: string; eye: string; }
const HERO_PALS: Record<string, HeroPal> = {
  knight: { body: '#8a9bb5', head: '#c9d3e3', accent: '#e0b030', limb: '#5b6a85', eye: '#1b2233' },
  ninja: { body: '#2b2d42', head: '#1b1b2a', accent: '#e63946', limb: '#202233', eye: '#f1f1f1' },
  robot: { body: '#3aa5b2', head: '#cfe8ec', accent: '#ffb703', limb: '#2a7c86', eye: '#ff4d6d' },
};

export const HERO_W = 64, HERO_H = 96;
export const HERO_FRAMES = ['idle', 'run0', 'run1', 'run2', 'run3', 'jump', 'fall', 'slide', 'attack0', 'attack1', 'dead'] as const;

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function limb(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, col: string) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.fillStyle = col;
  rr(c, -wid / 2, 0, wid, len, wid / 2);
  c.restore();
}

interface Pose { legA: number; legB: number; armA: number; armB: number; lean: number; bob: number; }

function heroDraw(skin: string, frame: string): Draw {
  const p = HERO_PALS[skin];
  return (c, w, h) => {
    if (frame === 'slide' || frame === 'dead') {
      // Lying pose in the bottom of the frame.
      c.save();
      c.translate(w / 2, h - 18);
      if (frame === 'dead') c.rotate(0.05);
      c.fillStyle = p.body; rr(c, -24, -14, 36, 22, 8);
      limb(c, 8, -4, -1.35, 26, 10, p.limb);
      limb(c, 8, 2, -1.75, 26, 10, p.limb);
      c.fillStyle = p.head; c.beginPath(); c.arc(-22, -12, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = p.accent; c.fillRect(-34, -16, 22, 5);
      c.fillStyle = p.eye;
      if (frame === 'dead') { c.font = 'bold 12px sans-serif'; c.fillText('x', -30, -8); }
      else c.fillRect(-30, -12, 5, 4);
      c.restore();
      return;
    }
    const poses: Record<string, Pose> = {
      idle: { legA: 0.05, legB: -0.05, armA: 0.15, armB: -0.15, lean: 0, bob: 0 },
      run0: { legA: 0.7, legB: -0.6, armA: -0.7, armB: 0.6, lean: 0.12, bob: 0 },
      run1: { legA: 0.2, legB: -0.1, armA: -0.2, armB: 0.2, lean: 0.12, bob: -3 },
      run2: { legA: -0.6, legB: 0.7, armA: 0.6, armB: -0.7, lean: 0.12, bob: 0 },
      run3: { legA: -0.1, legB: 0.2, armA: 0.2, armB: -0.2, lean: 0.12, bob: -3 },
      jump: { legA: 0.9, legB: -0.2, armA: -2.4, armB: -0.6, lean: 0.05, bob: -4 },
      fall: { legA: 0.3, legB: -0.4, armA: -1.6, armB: 1.2, lean: 0, bob: -2 },
      attack0: { legA: 0.5, legB: -0.4, armA: -2.6, armB: 0.4, lean: -0.05, bob: 0 },
      attack1: { legA: 0.5, legB: -0.4, armA: -0.9, armB: 0.4, lean: 0.25, bob: 0 },
    };
    const s = poses[frame];
    c.save();
    c.translate(w / 2, h - 30 + s.bob);
    c.rotate(s.lean);
    // back limbs
    limb(c, -3, 0, s.legB, 30, 10, p.limb);
    limb(c, -2, -30, s.armB, 22, 8, p.limb);
    // body
    c.fillStyle = p.body; rr(c, -12, -36, 24, 38, 7);
    c.fillStyle = p.accent; c.fillRect(-12, -8, 24, 5); // belt
    // head
    c.fillStyle = p.head; c.beginPath(); c.arc(1, -50, 15, 0, Math.PI * 2); c.fill();
    if (skin === 'ninja') { c.fillStyle = p.accent; c.fillRect(-14, -57, 30, 5); c.fillRect(-22, -57, 10, 3); }
    if (skin === 'knight') { c.fillStyle = p.accent; c.fillRect(-4, -68, 6, 8); }
    if (skin === 'robot') { c.fillStyle = p.accent; c.fillRect(0, -72, 3, 8); c.beginPath(); c.arc(1.5, -73, 3, 0, 7); c.fill(); }
    c.fillStyle = p.eye; c.fillRect(7, -53, 6, skin === 'robot' ? 3 : 5);
    // front limbs
    limb(c, 3, 0, s.legA, 30, 10, p.limb);
    limb(c, 4, -30, s.armA, 22, 8, p.limb);
    c.restore();
  };
}

const coinDraw = (sx: number): Draw => (c, w, h) => {
  c.save(); c.translate(w / 2, h / 2); c.scale(sx, 1);
  c.fillStyle = '#b8860b'; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fill();
  c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill();
  c.fillStyle = '#fff2b3'; c.fillRect(-2, -6, 4, 12);
  c.restore();
};

const items: Item[] = [];
for (const skin of Object.keys(HERO_PALS)) {
  for (const f of HERO_FRAMES) items.push({ name: `${skin}/${f}`, w: HERO_W, h: HERO_H, draw: heroDraw(skin, f) });
}
items.push(
  // weapons (handle at left-center, pointing right)
  { name: 'weapon/sword', w: 64, h: 16, draw: (c) => { c.fillStyle = '#6b4f2a'; c.fillRect(0, 5, 12, 6); c.fillStyle = '#e0b030'; c.fillRect(12, 1, 4, 14); c.fillStyle = '#dfe6f0'; c.beginPath(); c.moveTo(16, 4); c.lineTo(58, 6); c.lineTo(63, 8); c.lineTo(58, 10); c.lineTo(16, 12); c.fill(); } },
  { name: 'weapon/kunai', w: 48, h: 16, draw: (c) => { c.fillStyle = '#e63946'; c.fillRect(0, 6, 4, 4); c.fillStyle = '#333'; c.fillRect(4, 6, 14, 4); c.fillStyle = '#c8d0dc'; c.beginPath(); c.moveTo(18, 2); c.lineTo(47, 8); c.lineTo(18, 14); c.fill(); } },
  { name: 'weapon/hammer', w: 56, h: 32, draw: (c) => { c.fillStyle = '#6b4f2a'; c.fillRect(0, 13, 38, 6); c.fillStyle = '#7d8799'; rr(c, 36, 2, 18, 28, 4); } },
  { name: 'fx/slash', w: 96, h: 96, draw: (c, w, h) => { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.arc(w * 0.25, h / 2, 40, -1.2, 1.2); c.stroke(); c.strokeStyle = 'rgba(160,200,255,0.6)'; c.lineWidth = 4; c.beginPath(); c.arc(w * 0.25, h / 2, 30, -1.0, 1.0); c.stroke(); } },
  // pets
  { name: 'pet/cat0', w: 40, h: 32, draw: (c) => { c.fillStyle = '#f4a261'; rr(c, 6, 12, 26, 14, 7); c.beginPath(); c.arc(31, 12, 9, 0, 7); c.fill(); c.beginPath(); c.moveTo(25, 6); c.lineTo(27, -1); c.lineTo(31, 5); c.fill(); c.beginPath(); c.moveTo(32, 5); c.lineTo(37, -1); c.lineTo(38, 8); c.fill(); c.fillRect(0, 10, 8, 4); c.fillStyle = '#222'; c.fillRect(33, 10, 3, 3); c.fillStyle = '#d4844a'; c.fillRect(8, 24, 5, 7); c.fillRect(24, 24, 5, 7); } },
  { name: 'pet/cat1', w: 40, h: 32, draw: (c) => { c.fillStyle = '#f4a261'; rr(c, 6, 11, 26, 14, 7); c.beginPath(); c.arc(31, 11, 9, 0, 7); c.fill(); c.beginPath(); c.moveTo(25, 5); c.lineTo(27, -2); c.lineTo(31, 4); c.fill(); c.beginPath(); c.moveTo(32, 4); c.lineTo(37, -2); c.lineTo(38, 7); c.fill(); c.fillRect(0, 6, 8, 4); c.fillStyle = '#222'; c.fillRect(33, 9, 3, 3); c.fillStyle = '#d4844a'; c.fillRect(11, 23, 5, 7); c.fillRect(21, 23, 5, 7); } },
  { name: 'pet/dog0', w: 44, h: 34, draw: (c) => { c.fillStyle = '#a0785a'; rr(c, 6, 12, 28, 15, 7); c.beginPath(); c.arc(34, 12, 10, 0, 7); c.fill(); c.fillStyle = '#6b4f3a'; rr(c, 28, 2, 7, 14, 3); c.fillRect(0, 9, 8, 4); c.fillStyle = '#222'; c.fillRect(38, 10, 3, 3); c.fillRect(42, 14, 2, 3); c.fillStyle = '#7d5c44'; c.fillRect(8, 25, 5, 8); c.fillRect(26, 25, 5, 8); } },
  { name: 'pet/dog1', w: 44, h: 34, draw: (c) => { c.fillStyle = '#a0785a'; rr(c, 6, 11, 28, 15, 7); c.beginPath(); c.arc(34, 11, 10, 0, 7); c.fill(); c.fillStyle = '#6b4f3a'; rr(c, 28, 1, 7, 14, 3); c.fillRect(0, 5, 8, 4); c.fillStyle = '#222'; c.fillRect(38, 9, 3, 3); c.fillRect(42, 13, 2, 3); c.fillStyle = '#7d5c44'; c.fillRect(12, 24, 5, 8); c.fillRect(22, 24, 5, 8); } },
  { name: 'pet/drone0', w: 44, h: 30, draw: (c) => { c.fillStyle = '#9aa5b1'; rr(c, 10, 12, 24, 12, 5); c.fillStyle = '#4cc9f0'; c.fillRect(26, 15, 5, 5); c.fillStyle = '#556'; c.fillRect(4, 8, 36, 3); c.fillStyle = 'rgba(200,220,255,0.7)'; c.fillRect(0, 5, 14, 2); c.fillRect(30, 5, 14, 2); } },
  { name: 'pet/drone1', w: 44, h: 30, draw: (c) => { c.fillStyle = '#9aa5b1'; rr(c, 10, 12, 24, 12, 5); c.fillStyle = '#4cc9f0'; c.fillRect(26, 15, 5, 5); c.fillStyle = '#556'; c.fillRect(4, 8, 36, 3); c.fillStyle = 'rgba(200,220,255,0.7)'; c.fillRect(4, 5, 8, 2); c.fillRect(32, 5, 8, 2); } },
  // trinkets (HUD icons)
  { name: 'trinket/doubleJump', w: 32, h: 32, draw: (c) => { c.fillStyle = '#f1faee'; c.beginPath(); c.ellipse(16, 16, 6, 14, 0.6, 0, 7); c.fill(); c.strokeStyle = '#a8dadc'; c.lineWidth = 2; c.beginPath(); c.moveTo(7, 27); c.lineTo(24, 5); c.stroke(); } },
  { name: 'trinket/magnet', w: 32, h: 32, draw: (c) => { c.strokeStyle = '#e63946'; c.lineWidth = 7; c.beginPath(); c.arc(16, 14, 9, Math.PI, 0); c.lineTo(25, 26); c.moveTo(7, 14); c.lineTo(7, 26); c.stroke(); c.fillStyle = '#ddd'; c.fillRect(3, 24, 8, 5); c.fillRect(21, 24, 8, 5); } },
  { name: 'trinket/shield', w: 32, h: 32, draw: (c) => { c.fillStyle = '#4cc9f0'; c.beginPath(); c.moveTo(16, 2); c.lineTo(29, 7); c.lineTo(26, 21); c.lineTo(16, 30); c.lineTo(6, 21); c.lineTo(3, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(14, 8, 4, 16); } },
  { name: 'trinket/speed', w: 32, h: 32, draw: (c) => { c.fillStyle = '#ffb703'; c.beginPath(); c.moveTo(18, 1); c.lineTo(6, 18); c.lineTo(15, 18); c.lineTo(12, 31); c.lineTo(26, 12); c.lineTo(17, 12); c.fill(); } },
  // world objects
  { name: 'obj/spike', w: 52, h: 40, draw: (c) => { c.fillStyle = '#9aa0ab'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(i * 17, 40); c.lineTo(i * 17 + 9, 2); c.lineTo(i * 17 + 18, 40); c.fill(); } c.fillStyle = '#d7dbe2'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(i * 17 + 9, 2); c.lineTo(i * 17 + 12, 40); c.lineTo(i * 17 + 9, 40); c.fill(); } } },
  { name: 'obj/crate', w: 56, h: 56, draw: (c) => { c.fillStyle = '#8b5a2b'; c.fillRect(0, 0, 56, 56); c.fillStyle = '#b07a43'; c.fillRect(4, 4, 48, 48); c.strokeStyle = '#8b5a2b'; c.lineWidth = 6; c.beginPath(); c.moveTo(6, 6); c.lineTo(50, 50); c.moveTo(50, 6); c.lineTo(6, 50); c.stroke(); } },
  { name: 'obj/bar', w: 72, h: 360, draw: (c, w, h) => { c.fillStyle = '#3d405b'; c.fillRect(30, 0, 12, h - 40); c.fillStyle = '#e07a5f'; rr(c, 0, h - 52, w, 44, 6); c.fillStyle = '#f2cc8f'; for (let i = 0; i < 4; i++) c.fillRect(6 + i * 17, h - 46, 9, 32); } },
  { name: 'obj/slime0', w: 56, h: 44, draw: (c) => { c.fillStyle = '#80b918'; c.beginPath(); c.moveTo(2, 44); c.quadraticCurveTo(0, 6, 28, 4); c.quadraticCurveTo(56, 6, 54, 44); c.fill(); c.fillStyle = '#fff'; c.fillRect(12, 16, 10, 10); c.fillStyle = '#111'; c.fillRect(13, 19, 5, 5); } },
  { name: 'obj/slime1', w: 56, h: 44, draw: (c) => { c.fillStyle = '#80b918'; c.beginPath(); c.moveTo(0, 44); c.quadraticCurveTo(0, 12, 28, 10); c.quadraticCurveTo(56, 12, 56, 44); c.fill(); c.fillStyle = '#fff'; c.fillRect(12, 20, 10, 10); c.fillStyle = '#111'; c.fillRect(13, 23, 5, 5); } },
  { name: 'obj/coin0', w: 28, h: 28, draw: coinDraw(1) },
  { name: 'obj/coin1', w: 28, h: 28, draw: coinDraw(0.6) },
  { name: 'obj/coin2', w: 28, h: 28, draw: coinDraw(0.2) },
  { name: 'obj/coin3', w: 28, h: 28, draw: coinDraw(0.6) },
  { name: 'obj/flag', w: 60, h: 160, draw: (c) => { c.fillStyle = '#ddd'; c.fillRect(4, 0, 6, 160); c.fillStyle = '#fff'; c.fillRect(10, 4, 48, 34); c.fillStyle = '#111'; for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) c.fillRect(10 + x * 12, 4 + y * 11.3, 12, 11.3); } },
  { name: 'ui/heart', w: 28, h: 26, draw: (c) => { c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(14, 25); c.bezierCurveTo(-6, 10, 4, -4, 14, 6); c.bezierCurveTo(24, -4, 34, 10, 14, 25); c.fill(); } },
  { name: 'ui/heartEmpty', w: 28, h: 26, draw: (c) => { c.strokeStyle = '#7a2a33'; c.lineWidth = 3; c.beginPath(); c.moveTo(14, 23); c.bezierCurveTo(-4, 10, 5, -2, 14, 8); c.bezierCurveTo(23, -2, 32, 10, 14, 23); c.stroke(); } },
  { name: 'ui/slot', w: 64, h: 64, draw: (c) => { c.fillStyle = 'rgba(10,16,40,0.65)'; rr(c, 0, 0, 64, 64, 12); c.strokeStyle = 'rgba(143,163,255,0.8)'; c.lineWidth = 3; c.beginPath(); c.roundRect(1.5, 1.5, 61, 61, 11); c.stroke(); } },
  { name: 'fx/dot', w: 8, h: 8, draw: (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(4, 4, 4, 0, 7); c.fill(); } },
  { name: 'fx/px', w: 4, h: 4, draw: (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); } },
);

/** Shelf-pack all items into one canvas texture and register named frames. */
export function buildPlaceholderAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS)) return;
  const W = 1024, PAD = 2;
  let x = 0, y = 0, shelf = 0;
  const pos: { it: Item; x: number; y: number }[] = [];
  for (const it of items) {
    if (x + it.w > W) { x = 0; y += shelf + PAD; shelf = 0; }
    pos.push({ it, x, y });
    x += it.w + PAD;
    shelf = Math.max(shelf, it.h);
  }
  const H = Phaser.Math.Pow2.GetNext(y + shelf);
  const tex = scene.textures.createCanvas(ATLAS, W, H)!;
  const ctx = tex.getContext();
  for (const { it, x: px, y: py } of pos) {
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, it.w, it.h); ctx.clip();
    ctx.translate(px, py);
    it.draw(ctx, it.w, it.h);
    ctx.restore();
    tex.add(it.name, 0, px, py, it.w, it.h);
  }
  tex.refresh();
  buildBackgrounds(scene);
}

/** Separate small textures for the parallax TileSprites (they must repeat). */
function buildBackgrounds(scene: Phaser.Scene): void {
  const mk = (key: string, w: number, h: number, draw: Draw) => {
    const t = scene.textures.createCanvas(key, w, h)!;
    draw(t.getContext(), w, h);
    t.refresh();
  };
  mk('bg-far', 512, 220, (c, w, h) => {
    c.fillStyle = '#26305a';
    c.beginPath(); c.moveTo(0, h);
    for (let i = 0; i <= 8; i++) c.lineTo((i / 8) * w, i % 2 ? 40 + (i * 37) % 60 : 140 - (i * 23) % 50);
    c.lineTo(w, h); c.fill();
  });
  mk('bg-near', 512, 160, (c, w, h) => {
    c.fillStyle = '#1d3b4a';
    c.beginPath(); c.moveTo(0, h);
    for (let i = 0; i <= 64; i++) { const t = i / 64; c.lineTo(t * w, 70 + Math.sin(t * Math.PI * 4) * 28 + Math.sin(t * Math.PI * 10) * 8); }
    c.lineTo(w, h); c.fill();
  });
  mk('ground', 128, 80, (c, w, h) => {
    c.fillStyle = '#5a3d2b'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#4caf50'; c.fillRect(0, 0, w, 14);
    c.fillStyle = '#3e8e41'; for (let i = 0; i < 8; i++) c.fillRect(i * 16 + 4, 14, 8, 4);
    c.fillStyle = '#4a3222'; for (let i = 0; i < 6; i++) c.fillRect((i * 41) % w, 30 + (i * 17) % 40, 10, 6);
  });
}
