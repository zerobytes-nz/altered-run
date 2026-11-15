// Original placeholder art for Altered Run (MIT, same as the code).
// Each drawer paints ONE frame in logical units (frame size × displayScale);
// gen-placeholders.mjs scales it up to the real pixel size in the manifest.
// Keys must match assets.manifest.json.

const TAU = Math.PI * 2;

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function limb(c, x, y, ang, len, wid, col) {
  c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = col; rr(c, -wid / 2, 0, wid, len, wid / 2); c.restore();
}

const HERO_PALS = {
  knight: { body: '#8a9bb5', head: '#c9d3e3', accent: '#e0b030', limb: '#5b6a85', eye: '#1b2233' },
  ninja: { body: '#2b2d42', head: '#1b1b2a', accent: '#e63946', limb: '#202233', eye: '#f1f1f1' },
  robot: { body: '#3aa5b2', head: '#cfe8ec', accent: '#ffb703', limb: '#2a7c86', eye: '#ff4d6d' },
};

function heroStanding(c, skin, w, h, s) {
  const p = HERO_PALS[skin];
  c.save();
  c.translate(w / 2, h - 30 + s.bob);
  c.rotate(s.lean);
  limb(c, -3, 0, s.legB, 30, 10, p.limb);
  limb(c, -2, -30, s.armB, 22, 8, p.limb);
  c.fillStyle = p.body; rr(c, -12, -36, 24, 38, 7);
  c.fillStyle = p.accent; c.fillRect(-12, -8, 24, 5);
  c.fillStyle = p.head; circle(c, 1, -50, 15);
  if (skin === 'ninja') { c.fillStyle = p.accent; c.fillRect(-14, -57, 30, 5); c.fillRect(-22, -57 + (s.tail ?? 0), 10, 3); }
  if (skin === 'knight') { c.fillStyle = p.accent; c.fillRect(-4, -68, 6, 8); }
  if (skin === 'robot') { c.fillStyle = p.accent; c.fillRect(0, -72, 3, 8); circle(c, 1.5, -73, 3); }
  c.fillStyle = p.eye; c.fillRect(7, -53, 6, skin === 'robot' ? 3 : 5);
  limb(c, 3, 0, s.legA, 30, 10, p.limb);
  limb(c, 4, -30, s.armA, 22, 8, p.limb);
  c.restore();
}

function heroLying(c, skin, w, h, dead, bob = 0) {
  const p = HERO_PALS[skin];
  c.save();
  c.translate(w / 2, h - 18 + bob);
  if (dead) c.rotate(0.05);
  c.fillStyle = p.body; rr(c, -24, -14, 36, 22, 8);
  limb(c, 8, -4, -1.35, 26, 10, p.limb);
  limb(c, 8, 2, -1.75, 26, 10, p.limb);
  c.fillStyle = p.head; circle(c, -22, -12, 13);
  c.fillStyle = p.accent; c.fillRect(-34, -16, 22, 5);
  c.fillStyle = p.eye;
  if (dead) { c.fillRect(-31, -12, 6, 2); c.fillRect(-29, -14, 2, 6); } else c.fillRect(-30, -12, 5, 4);
  c.restore();
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (A, B, t) => Object.fromEntries(Object.keys(A).map((k) => [k, lerp(A[k], B[k], t)]));
const JUMP = { legA: 0.9, legB: -0.2, armA: -2.4, armB: -0.6, lean: 0.05, bob: -4 };
const FALL = { legA: 0.3, legB: -0.4, armA: -1.6, armB: 1.2, lean: 0, bob: -2 };

const heroAnims = {
  idle: (c, skin, w, h, i, n) => {
    const t = Math.sin((i / n) * TAU);
    heroStanding(c, skin, w, h, { legA: 0.05, legB: -0.05, armA: 0.15 + t * 0.08, armB: -0.15 - t * 0.08, lean: 0, bob: t * 1.5, tail: t * 2 });
  },
  run: (c, skin, w, h, i, n) => {
    const ph = (i / n) * TAU, s = Math.sin(ph);
    heroStanding(c, skin, w, h, { legA: 0.75 * s, legB: -0.75 * s, armA: -0.7 * s, armB: 0.7 * s, lean: 0.12, bob: -3 * Math.abs(Math.cos(ph)), tail: s * 3 });
  },
  jump: (c, skin, w, h, i, n) => heroStanding(c, skin, w, h, mix(JUMP, FALL, i / (n - 1))),
  slide: (c, skin, w, h, i) => heroLying(c, skin, w, h, false, i % 2 ? -1 : 0),
  attack: (c, skin, w, h, i, n) => {
    const t = i / (n - 1);
    heroStanding(c, skin, w, h, { legA: 0.5, legB: -0.4, armA: lerp(-2.6, -0.6, t), armB: 0.4, lean: lerp(-0.05, 0.25, t), bob: 0 });
  },
  dead: (c, skin, w, h, i) => {
    if (i < 3) {
      c.save(); c.translate(w / 2 + 12, h); c.rotate(-0.25 * i); c.translate(-w / 2 - 12, -h);
      heroStanding(c, skin, w, h, { legA: 0.2, legB: -0.2, armA: -1.2, armB: 0.8, lean: 0, bob: 0 });
      c.restore();
    } else heroLying(c, skin, w, h, true);
  },
};

const coin = (c, w, h, i, n) => {
  const sx = Math.max(0.15, Math.abs(Math.cos((i / n) * Math.PI)));
  c.save(); c.translate(w / 2, h / 2); c.scale(sx, 1);
  c.fillStyle = '#b8860b'; circle(c, 0, 0, 13);
  c.fillStyle = '#ffd34d'; circle(c, 0, 0, 10);
  c.fillStyle = '#fff2b3'; c.fillRect(-2, -6, 4, 12);
  c.restore();
};

function cat(c, i) {
  const up = i % 2;
  c.translate(4, 6);
  c.fillStyle = '#f4a261'; rr(c, 6, 12 - up, 26, 14, 7); circle(c, 31, 12 - up, 9);
  c.beginPath(); c.moveTo(25, 6 - up); c.lineTo(27, -1 - up); c.lineTo(31, 5 - up); c.fill();
  c.beginPath(); c.moveTo(32, 5 - up); c.lineTo(37, -1 - up); c.lineTo(38, 8 - up); c.fill();
  c.fillRect(0, up ? 6 : 10, 8, 4);
  c.fillStyle = '#222'; c.fillRect(33, 10 - up, 3, 3);
  c.fillStyle = '#d4844a';
  const legs = [[8, 24], [24, 24], [11, 23], [21, 23]];
  const [a, b] = i % 2 ? [legs[2], legs[3]] : i === 0 ? [legs[0], legs[1]] : [[10, 24], [22, 24]];
  c.fillRect(a[0], a[1], 5, 7); c.fillRect(b[0], b[1], 5, 7);
}
function dog(c, i) {
  const up = i % 2;
  c.translate(2, 4);
  c.fillStyle = '#a0785a'; rr(c, 6, 12 - up, 28, 15, 7); circle(c, 34, 12 - up, 10);
  c.fillStyle = '#6b4f3a'; rr(c, 28, 2 - up, 7, 14, 3); c.fillRect(0, up ? 5 : 9, 8, 4);
  c.fillStyle = '#222'; c.fillRect(38, 10 - up, 3, 3); c.fillRect(42, 14 - up, 2, 3);
  c.fillStyle = '#7d5c44';
  if (up) { c.fillRect(12, 24, 5, 8); c.fillRect(22, 24, 5, 8); } else { c.fillRect(8 + i, 25, 5, 8); c.fillRect(26 - i, 25, 5, 8); }
}
// Cartoon style to match the GameArt2D heroes: flat colours, a soft highlight, dark rounded outline.
const INK = '#2b2440';
function ink(c, w = 1.6) { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function grad(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }

/** Hover drone, 48×36 logical, 4 frames: rotors spin, body bobs, eye blinks on frame 3. */
function drone(c, i) {
  const bob = [0, -1, 0, 1][i];
  c.translate(0, bob);
  // rotor arms + hubs
  c.fillStyle = '#5b6375';
  for (const x of [10, 38]) { c.beginPath(); c.roundRect(x - 2, 9, 4, 7, 1); c.fill(); ink(c, 1.2); }
  c.beginPath(); c.roundRect(9, 13, 30, 4, 2); c.fill(); ink(c, 1.2);
  // spinning blades: a squashed ellipse whose width cycles
  const bw = [9, 6, 2, 6][i];
  c.fillStyle = 'rgba(210,225,255,0.85)';
  for (const x of [10, 38]) { c.beginPath(); c.ellipse(x, 8, bw, 2.2, 0, 0, TAU); c.fill(); ink(c, 1); }
  // body
  c.beginPath(); c.ellipse(24, 23, 14, 10, 0, 0, TAU);
  c.fillStyle = grad(c, 13, 33, '#d9e2ef', '#8796ad'); c.fill(); ink(c);
  // belly plate + thruster glow
  c.beginPath(); c.ellipse(24, 31, 6, 2.6, 0, 0, TAU); c.fillStyle = '#5b6375'; c.fill(); ink(c, 1.2);
  c.fillStyle = 'rgba(128,255,219,0.75)'; c.beginPath(); c.ellipse(24, 34.5, 3.5, 1.4 + (i % 2) * 0.5, 0, 0, TAU); c.fill();
  // visor + eye (looks right, the direction of travel)
  c.beginPath(); c.roundRect(22, 17, 15, 9, 4.5); c.fillStyle = '#1c2340'; c.fill(); ink(c, 1.2);
  c.fillStyle = '#4cc9f0';
  if (i === 3) c.fillRect(29, 21, 6, 1.4); else { c.beginPath(); c.arc(32, 21.5, 2.6, 0, TAU); c.fill(); c.fillStyle = '#fff'; circle(c, 33, 20.5, 0.9); }
  // highlight
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(17, 18, 4.5, 2, -0.5, 0, TAU); c.fill();
}

/** Round badge behind each trinket so the four icons read as one set (32×32 logical). */
function badge(c, a, b) {
  c.beginPath(); c.arc(16, 16, 14.5, 0, TAU); c.fillStyle = grad(c, 2, 30, a, b); c.fill(); ink(c, 1.4);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(12, 9, 7, 3.5, -0.5, 0, TAU); c.fill();
}

const trinkets = {
  feather(c) {
    badge(c, '#8be0ff', '#3a86c8');
    c.save(); c.translate(16, 16); c.rotate(0.65);
    c.beginPath(); c.moveTo(0, -12); c.bezierCurveTo(7, -7, 6, 5, 0, 10); c.bezierCurveTo(-6, 5, -7, -7, 0, -12);
    c.fillStyle = grad(c, -12, 10, '#ffffff', '#d7f2ff'); c.fill(); ink(c, 1.3);
    c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 13); ink(c, 1.3);
    c.strokeStyle = '#9cc9e6'; c.lineWidth = 0.9;
    for (const y of [-5, -1, 3]) { c.beginPath(); c.moveTo(0, y); c.lineTo(4, y - 3); c.moveTo(0, y); c.lineTo(-4, y - 3); c.stroke(); }
    c.restore();
  },
  magnet(c) {
    badge(c, '#ffd0d6', '#d65b6c');
    c.save(); c.translate(16, 17); c.rotate(-0.35);
    c.beginPath(); c.arc(0, -2, 9, Math.PI, 0); c.lineTo(9, 8); c.lineTo(4, 8); c.lineTo(4, -2); c.arc(0, -2, 4, 0, Math.PI, true); c.lineTo(-4, 8); c.lineTo(-9, 8); c.closePath();
    c.fillStyle = '#e63946'; c.fill(); ink(c, 1.4);
    c.fillStyle = '#e8edf5';
    for (const x of [-9, 4]) { c.beginPath(); c.rect(x, 4, 5, 4); c.fill(); ink(c, 1.2); }
    c.restore();
    c.strokeStyle = '#ffe14d'; c.lineWidth = 1.4; c.lineCap = 'round';
    for (const [x, y, a] of [[25, 6, 0.5], [27, 11, 0], [6, 25, 0.4]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3 * Math.cos(a), y + 3 * Math.sin(a)); c.stroke(); }
  },
  shield(c) {
    badge(c, '#b8f2e6', '#2f9e8f');
    c.beginPath(); c.moveTo(16, 5); c.quadraticCurveTo(22, 8, 26, 8); c.quadraticCurveTo(26, 21, 16, 28); c.quadraticCurveTo(6, 21, 6, 8); c.quadraticCurveTo(10, 8, 16, 5); c.closePath();
    c.fillStyle = grad(c, 5, 28, '#7ad7ff', '#2a6fd6'); c.fill(); ink(c, 1.5);
    c.beginPath(); c.moveTo(16, 8.5); c.quadraticCurveTo(20, 10.5, 22.5, 10.8); c.quadraticCurveTo(22, 19.5, 16, 24.5); c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    c.fillStyle = '#ffd34d'; c.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 2 : 4.5, a = -Math.PI / 2 + (k * Math.PI) / 5; c.lineTo(16 + r * Math.cos(a), 16 + r * Math.sin(a)); }
    c.closePath(); c.fill(); ink(c, 1);
  },
  boots(c) {
    badge(c, '#ffe7a8', '#e08e1b');
    c.beginPath(); c.moveTo(11, 7); c.lineTo(18, 7); c.lineTo(18, 18); c.quadraticCurveTo(26, 18, 26, 23); c.lineTo(26, 25); c.lineTo(9, 25); c.lineTo(9, 20); c.quadraticCurveTo(11, 14, 11, 7); c.closePath();
    c.fillStyle = grad(c, 7, 25, '#c0603a', '#8a3b22'); c.fill(); ink(c, 1.4);
    c.fillStyle = '#f1faee'; c.beginPath(); c.roundRect(10.5, 7, 8, 3, 1.4); c.fill(); ink(c, 1);
    c.fillStyle = '#3a2a2a'; c.beginPath(); c.roundRect(9, 23, 17, 2.6, 1.2); c.fill();
    // little wing = speed
    c.beginPath(); c.moveTo(18, 12); c.quadraticCurveTo(25, 8, 28, 10); c.quadraticCurveTo(24, 12, 25, 14); c.quadraticCurveTo(21, 14, 18, 15); c.closePath();
    c.fillStyle = '#ffffff'; c.fill(); ink(c, 1.1);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.2;
    for (const y of [17, 20]) { c.beginPath(); c.moveTo(2.5, y); c.lineTo(6.5, y); c.stroke(); }
  },
};

/** Flying bug, 48×36 logical, 2 frames (wings up / down), facing left. */
function fly(c, i) {
  // wings behind the body
  c.fillStyle = 'rgba(235,245,255,0.9)';
  const up = i === 0;
  for (const dx of [0, 6]) { c.beginPath(); c.ellipse(24 + dx, up ? 9 : 17, 7, up ? 9 : 4, up ? -0.4 : 0.3, 0, TAU); c.fill(); ink(c, 1.2); }
  c.beginPath(); c.ellipse(26, 22, 14, 10, 0, 0, TAU); c.fillStyle = grad(c, 12, 32, '#5e5a6e', '#2f2c3d'); c.fill(); ink(c);
  c.fillStyle = '#ffd34d'; for (const x of [27, 33]) c.fillRect(x, 13.5, 2.4, 17);
  c.beginPath(); c.ellipse(26, 22, 14, 10, 0, 0, TAU); ink(c);
  c.fillStyle = '#fff'; circle(c, 15, 19, 4.2); c.beginPath(); c.arc(15, 19, 4.2, 0, TAU); ink(c, 1);
  c.fillStyle = '#2b2440'; circle(c, 13.6, 19.5, 2);
  c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.moveTo(10, 24); c.lineTo(6, 26); c.stroke(); // stinger-ish nose
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(24, 16, 6, 2.5, -0.2, 0, TAU); c.fill();
}

/** Boulder, 48×48 logical. */
function rock(c) {
  c.beginPath(); c.moveTo(8, 40); c.quadraticCurveTo(2, 22, 14, 10); c.quadraticCurveTo(26, 2, 38, 10); c.quadraticCurveTo(48, 22, 42, 38); c.quadraticCurveTo(26, 47, 8, 40); c.closePath();
  c.fillStyle = grad(c, 4, 46, '#a39a8c', '#6b6155'); c.fill(); ink(c, 1.8);
  c.strokeStyle = 'rgba(43,36,64,0.5)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(20, 16); c.lineTo(26, 24); c.lineTo(22, 32); c.moveTo(32, 20); c.lineTo(36, 28); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(18, 14, 7, 3, -0.5, 0, TAU); c.fill();
}

/** Pit, 64×88 logical; stretched in x to the pit width. Dark hole with soil walls. */
function pit(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a1a12'); g.addColorStop(0.5, '#120a08'); g.addColorStop(1, '#050303');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(122,72,40,0.85)'; c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(4, 0, w - 8, 6);
}

/** Floating platform, 192×48 logical: grass top, soil underside. */
function ledge(c, w) {
  c.beginPath(); c.moveTo(6, 6); c.lineTo(w - 6, 6); c.quadraticCurveTo(w, 6, w - 4, 16); c.quadraticCurveTo(w / 2 + 30, 46, w / 2, 44); c.quadraticCurveTo(w / 2 - 30, 46, 4, 16); c.quadraticCurveTo(0, 6, 6, 6); c.closePath();
  c.fillStyle = grad(c, 6, 46, '#a86a3c', '#6b3f22'); c.fill(); ink(c, 1.6);
  c.beginPath(); c.roundRect(2, 2, w - 4, 12, 6); c.fillStyle = grad(c, 2, 14, '#9be15d', '#4caf50'); c.fill(); ink(c, 1.6);
}

/** @type {Record<string, (c: CanvasRenderingContext2D, w: number, h: number, i: number, n: number) => void>} */
export const drawers = {
  'weapon.sword': (c) => { c.fillStyle = '#6b4f2a'; c.fillRect(0, 5, 12, 6); c.fillStyle = '#e0b030'; c.fillRect(12, 1, 4, 14); c.fillStyle = '#dfe6f0'; c.beginPath(); c.moveTo(16, 4); c.lineTo(58, 6); c.lineTo(63, 8); c.lineTo(58, 10); c.lineTo(16, 12); c.fill(); },
  'weapon.kunai': (c) => { c.fillStyle = '#e63946'; c.fillRect(0, 6, 4, 4); c.fillStyle = '#333'; c.fillRect(4, 6, 14, 4); c.fillStyle = '#c8d0dc'; c.beginPath(); c.moveTo(18, 2); c.lineTo(47, 8); c.lineTo(18, 14); c.fill(); },
  'weapon.hammer': (c) => { c.fillStyle = '#6b4f2a'; c.fillRect(0, 13, 38, 6); c.fillStyle = '#7d8799'; rr(c, 36, 2, 18, 28, 4); },
  'pet.cat': (c, w, h, i) => cat(c, i),
  'pet.dog': (c, w, h, i) => dog(c, i),
  'pet.drone': (c, w, h, i) => drone(c, i),
  'trinket.doubleJump': (c) => trinkets.feather(c),
  'trinket.magnet': (c) => trinkets.magnet(c),
  'trinket.shield': (c) => trinkets.shield(c),
  'trinket.speed': (c) => trinkets.boots(c),
  'obj.spike': (c) => { for (let i = 0; i < 3; i++) { c.fillStyle = '#9aa0ab'; c.beginPath(); c.moveTo(i * 17, 40); c.lineTo(i * 17 + 9, 2); c.lineTo(i * 17 + 18, 40); c.fill(); c.fillStyle = '#d7dbe2'; c.beginPath(); c.moveTo(i * 17 + 9, 2); c.lineTo(i * 17 + 12, 40); c.lineTo(i * 17 + 9, 40); c.fill(); } },
  'obj.crate': (c) => { c.fillStyle = '#8b5a2b'; c.fillRect(0, 0, 56, 56); c.fillStyle = '#b07a43'; c.fillRect(4, 4, 48, 48); c.strokeStyle = '#8b5a2b'; c.lineWidth = 6; c.beginPath(); c.moveTo(6, 6); c.lineTo(50, 50); c.moveTo(50, 6); c.lineTo(6, 50); c.stroke(); },
  'obj.bar': (c, w, h) => { c.fillStyle = '#3d405b'; c.fillRect(30, 0, 12, h - 40); c.fillStyle = '#e07a5f'; rr(c, 0, h - 52, w, 44, 6); c.fillStyle = '#f2cc8f'; for (let i = 0; i < 4; i++) c.fillRect(6 + i * 17, h - 46, 9, 32); },
  'enemy.slime': (c, w, h, i, n) => {
    const sq = Math.sin((i / n) * TAU) * 4;
    c.fillStyle = '#80b918'; c.beginPath(); c.moveTo(1 - sq / 2, 44); c.quadraticCurveTo(0, 8 + sq, 28, 6 + sq); c.quadraticCurveTo(56, 8 + sq, 55 + sq / 2, 44); c.fill();
    c.fillStyle = '#fff'; c.fillRect(10, 17 + sq, 10, 10); c.fillStyle = '#111'; c.fillRect(11, 20 + sq, 5, 5);
  },
  'obj.coin': coin,
  'enemy.fly': (c, w, h, i) => fly(c, i),
  'obj.rock': (c) => rock(c),
  'obj.pit': (c, w, h) => pit(c, w, h),
  'obj.ledge': (c, w) => ledge(c, w),
  'obj.flag': (c) => { c.fillStyle = '#ddd'; c.fillRect(4, 0, 6, 160); c.fillStyle = '#fff'; c.fillRect(10, 4, 48, 34); c.fillStyle = '#111'; for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) c.fillRect(10 + x * 12, 4 + y * 11.3, 12, 11.3); },
  'bg.far': (c, w, h) => {
    const ys = [140, 60, 120, 40, 130, 70, 110, 50, 140]; // first = last → tiles seamlessly
    c.fillStyle = '#26305a'; c.beginPath(); c.moveTo(0, h);
    ys.forEach((y, i) => c.lineTo((i / 8) * w, y)); c.lineTo(w, h); c.fill();
  },
  'bg.near': (c, w, h) => {
    c.fillStyle = '#1d3b4a'; c.beginPath(); c.moveTo(0, h);
    for (let i = 0; i <= 64; i++) { const t = i / 64; c.lineTo(t * w, 70 + Math.sin(t * Math.PI * 4) * 28 + Math.sin(t * Math.PI * 10) * 8); }
    c.lineTo(w, h); c.fill();
  },
  'bg.ground': (c, w, h) => {
    c.fillStyle = '#5a3d2b'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#4caf50'; c.fillRect(0, 0, w, 14);
    c.fillStyle = '#3e8e41'; for (let i = 0; i < 8; i++) c.fillRect(i * 16 + 4, 14, 8, 4);
    c.fillStyle = '#4a3222'; for (let i = 0; i < 6; i++) c.fillRect((i * 41) % (w - 10), 30 + (i * 17) % 40, 10, 6);
  },
  'ui.heart': (c) => { c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(14, 25); c.bezierCurveTo(-6, 10, 4, -4, 14, 6); c.bezierCurveTo(24, -4, 34, 10, 14, 25); c.fill(); },
  'ui.heartEmpty': (c) => { c.strokeStyle = '#7a2a33'; c.lineWidth = 3; c.beginPath(); c.moveTo(14, 23); c.bezierCurveTo(-4, 10, 5, -2, 14, 8); c.bezierCurveTo(23, -2, 32, 10, 14, 23); c.stroke(); },
  'ui.slot': (c) => { c.fillStyle = 'rgba(10,16,40,0.65)'; rr(c, 0, 0, 64, 64, 12); c.strokeStyle = 'rgba(143,163,255,0.8)'; c.lineWidth = 3; c.beginPath(); c.roundRect(1.5, 1.5, 61, 61, 11); c.stroke(); },
  'fx.slash': (c, w, h) => { c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 8; c.beginPath(); c.arc(w * 0.25, h / 2, 40, -1.2, 1.2); c.stroke(); c.strokeStyle = 'rgba(160,200,255,0.6)'; c.lineWidth = 4; c.beginPath(); c.arc(w * 0.25, h / 2, 30, -1.0, 1.0); c.stroke(); },
  'fx.dot': (c, w) => { c.fillStyle = '#fff'; circle(c, w / 2, w / 2, w / 2); },
  'fx.px': (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); },
};
for (const skin of Object.keys(HERO_PALS)) {
  for (const [anim, fn] of Object.entries(heroAnims)) {
    drawers[`hero.${skin}.${anim}`] = (c, w, h, i, n) => fn(c, skin, w, h, i, n);
  }
}
