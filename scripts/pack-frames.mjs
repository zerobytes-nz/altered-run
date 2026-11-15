// Packs downloaded art into the exact file the manifest expects.
//
//   npm run assets:pack -- <manifest key> <frame files...>
//
// Examples:
//   npm run assets:pack -- hero.ninja.run ~/Downloads/ninja/png/Run__00*.png
//   npm run assets:pack -- obj.crate ~/Downloads/tileset/png/Objects/Crate.png
//   npm run assets:pack -- hero.knight.slide --rotate -70 ~/Downloads/knight/png/Run*.png
//   npm run assets:pack -- hero.ninja.attack --ref ~/Downloads/ninja/png/Run__000.png ~/Downloads/ninja/png/Attack__0*.png
//
// Frames are sorted by the number in their file name, scaled uniformly (same scale for
// every frame, so the animation doesn't wobble), centred horizontally and aligned to the
// bottom edge (single images are centred; tiling backgrounds are stretched to fit), then written as a horizontal strip.
// Output folder: public/assets/cc0/<path> (committable) when the asset's source is marked "cc0": true,
// otherwise public/assets/licensed/<path> (gitignored). Pass --licensed to force the gitignored folder.
// If you pass more frames than the manifest needs, they are sampled evenly.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadManifest, isCc0, PUBLIC_DIR, ROOT } from './lib/assets.mjs';

const args = process.argv.slice(2);
const forceLicensed = args.includes('--licensed');
// --ref <file>: size every sheet of a character from one reference frame (e.g. its first Run frame),
// so the hero keeps the same size across animations. A sheet only shrinks below that if it would not fit.
const refAt = args.indexOf('--ref');
const refFile = refAt >= 0 ? args[refAt + 1] : null;
// --rotate <deg>: rotate every frame (clockwise, degrees) and trim it. Used to make a slide from run
// frames when a pack has no slide animation, e.g. --rotate -70 leans a right-facing hero back.
const rotAt = args.indexOf('--rotate');
const rotate = rotAt >= 0 ? Number(args[rotAt + 1]) : 0;
const skip = new Set([refAt, refAt + 1, rotAt, rotAt + 1].filter((i, n) => (n < 2 ? refAt : rotAt) >= 0));
const [key, ...files] = args.filter((x, i) => x !== '--licensed' && !skip.has(i));
const m = loadManifest();
const a = m.assets.find((x) => x.key === key);
if (!a || !files.length) {
  console.error('Usage: npm run assets:pack -- <manifest key> <frame files...>');
  if (key && !a) console.error(`Unknown key "${key}". Keys: ${m.assets.map((x) => x.key).join(', ')}`);
  process.exit(1);
}
if (a.type === 'audio') { console.error('Audio files are copied as-is; just drop them into public/assets/licensed/.'); process.exit(1); }

const num = (f) => Number((path.basename(f).match(/(\d+)(?!.*\d)/) ?? [0, 0])[1]);
const sorted = [...files].sort((x, y) => num(x) - num(y) || x.localeCompare(y));
const picked = Array.from({ length: a.frameCount }, (_, i) =>
  sorted[Math.min(sorted.length - 1, Math.round((i * (sorted.length - 1)) / Math.max(1, a.frameCount - 1)))]);
if (sorted.length !== a.frameCount) console.warn(`Note: got ${sorted.length} frames, ${key} needs ${a.frameCount}; ${sorted.length > a.frameCount ? 'sampling evenly' : 'repeating frames'}.`);

/** Rotate an image about its centre and crop it to its visible (non-transparent) pixels. */
function rotateTrim(img, deg) {
  const r = (deg * Math.PI) / 180, cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
  const w = Math.ceil(img.width * cos + img.height * sin), h = Math.ceil(img.width * sin + img.height * cos);
  const cv = createCanvas(w, h), cx = cv.getContext('2d');
  cx.translate(w / 2, h / 2); cx.rotate(r); cx.drawImage(img, -img.width / 2, -img.height / 2);
  const d = cx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const out = createCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(cv, -x0, -y0);
  return out;
}

let imgs = await Promise.all(picked.map((f) => loadImage(fs.readFileSync(f))));
if (rotate) imgs = imgs.map((img) => rotateTrim(img, rotate));
const maxW = Math.max(...imgs.map((i) => i.width)), maxH = Math.max(...imgs.map((i) => i.height));
let s = Math.min(a.frameWidth / maxW, a.frameHeight / maxH);
if (refFile) {
  const ref = await loadImage(fs.readFileSync(refFile));
  s = Math.min(s, a.frameWidth / ref.width, a.frameHeight / ref.height);
}
const canvas = createCanvas(a.width, a.height);
const c = canvas.getContext('2d');
c.imageSmoothingQuality = 'high';
imgs.forEach((img, i) => {
  const x0 = i * a.frameWidth;
  if (a.tile) { c.drawImage(img, x0, 0, a.frameWidth, a.frameHeight); return; } // tiling layers fill the frame exactly
  const w = img.width * s, h = img.height * s;
  const y = a.type === 'spritesheet' ? a.frameHeight - h : (a.frameHeight - h) / 2; // characters stand on the bottom edge
  c.drawImage(img, x0 + (a.frameWidth - w) / 2, y, w, h);
});
const toCc0 = isCc0(m, a) && !forceLicensed;
const out = path.join(PUBLIC_DIR, toCc0 ? m.roots.cc0 : m.roots.licensed, a.path);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`Wrote ${path.relative(ROOT, out)} (${a.width}×${a.height}, ${a.frameCount} frame${a.frameCount > 1 ? 's' : ''}). ${toCc0 ? 'CC0 source: this file may be committed.' : 'This folder is gitignored.'}`);
