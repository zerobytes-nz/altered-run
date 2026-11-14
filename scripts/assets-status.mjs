// Prints which assets the game will use: licensed, placeholder, or missing.
// Usage: npm run assets:status
import { loadManifest, resolveAssets } from './lib/assets.mjs';

const m = loadManifest();
const rows = resolveAssets(m);
const icon = { licensed: '●', placeholder: '○', missing: '✖' };
const pad = (s, n) => String(s).padEnd(n);
const kw = Math.max(...rows.map((r) => r.asset.key.length)) + 2;
console.log(`\n${pad('KEY', kw)}${pad('USING', 14)}FILE`);
for (const r of rows) {
  let note = '';
  if (r.licensed.exists && !r.licensed.sizeOk) note = `  ← licensed file is ${r.licensed.size?.width ?? '?'}×${r.licensed.size?.height ?? '?'}, needs ${r.asset.width}×${r.asset.height}`;
  const file = r.state === 'licensed' ? r.licensedFile : r.placeholderFile;
  console.log(`${pad(r.asset.key, kw)}${icon[r.state]} ${pad(r.state, 12)}${file}${note}`);
}
const count = (s) => rows.filter((r) => r.state === s).length;
console.log(`\n${count('licensed')} licensed · ${count('placeholder')} placeholder · ${count('missing')} missing  (of ${rows.length})\n`);
if (count('missing')) process.exitCode = 1;
