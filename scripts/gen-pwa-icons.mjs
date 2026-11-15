#!/usr/bin/env node
// Draws the PWA / home-screen icons into public/icons/ from the game's own art.
// Uses ONLY committable art (public/assets/cc0/ then public/assets/placeholder/), never licensed/,
// so the generated PNGs are safe to commit. Re-run after changing the hero/pet/background art:
//   npm run pwa:icons
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ROOT, loadManifest, isCc0 } from './lib/assets.mjs';

const m = loadManifest();
const A = Object.fromEntries(m.assets.map((a) => [a.key, a]));
const OUT = path.join(ROOT, 'public/icons');
fs.mkdirSync(OUT, { recursive: true });

async function art(key) {
  const a = A[key];
  if (!a) throw new Error(`No manifest asset ${key}`);
  const roots = isCc0(m, a) ? [m.roots.cc0, m.roots.placeholder] : [m.roots.placeholder];
  for (const root of roots) {
    const f = path.join(ROOT, 'public', root, a.path);
    if (fs.existsSync(f)) return { img: await loadImage(fs.readFileSync(f)), a };
  }
  throw new Error(`No committable file for ${key}`);
}

/** Frame `n` of a sheet, fitted into (w,h), bottom-centre at (x,y). */
async function draw(c, key, n, x, y, w, h) {
  const { img, a } = await art(key);
  const fw = a.frameWidth ?? a.width, fh = a.frameHeight ?? a.height;
  const s = Math.min(w / fw, h / fh), dw = fw * s, dh = fh * s;
  c.drawImage(img, n * fw, 0, fw, fh, x - dw / 2, y - dh, dw, dh);
}

async function tile(c, key, y, w, hDraw) {
  const { img, a } = await art(key);
  const s = hDraw / a.height, tw = a.width * s;
  for (let x = 0; x < w; x += tw) c.drawImage(img, x, y, tw, hDraw);
}

/** The scene, drawn on a 512 canvas. `pad` shrinks the characters into the maskable safe zone. */
async function scene(pad) {
  const S = 512, cv = createCanvas(S, S), c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#141c3a'); g.addColorStop(1, '#3a4a8a');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.fillStyle = 'rgba(255,241,193,0.9)'; c.beginPath(); c.arc(380, 120, 56, 0, Math.PI * 2); c.fill();
  await tile(c, 'bg.far', 170, S, 250);
  await tile(c, 'bg.ground', 400, S, 112);
  const k = 1 - pad;
  await draw(c, 'hero.knight.run', 3, 270, 410, 330 * k, 330 * k);
  await draw(c, 'pet.cat', 1, 270 - 175 * k, 410, 130 * k, 98 * k);
  return cv;
}

function save(src, size, name) {
  const cv = createCanvas(size, size), c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, size, size);
  fs.writeFileSync(path.join(OUT, name), cv.toBuffer('image/png'));
}

const full = await scene(0);
const safe = await scene(0.22); // maskable: keep the hero inside the centre 80%
save(full, 512, 'icon-512.png');
save(full, 192, 'icon-192.png');
save(safe, 512, 'maskable-512.png');
save(safe, 180, 'apple-touch-icon.png');
save(full, 64, 'favicon-64.png');
console.log(`✔ PWA icons → ${path.relative(ROOT, OUT)}/: ${fs.readdirSync(OUT).join(', ')}`);
