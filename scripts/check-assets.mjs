// Guard rail for an open-source repo that uses licensed art it may not redistribute.
// Fails (exit 1) when:
//   • any file under public/assets/licensed/ is tracked/staged (except its README.md)
//   • any tracked/staged image or sound is not a placeholder listed in assets.manifest.json
//   • the manifest is invalid, or a placeholder is missing / the wrong size
//   • a .env file (other than .env.example) is tracked, or a secret looks hard-coded in src/
// Runs from the pre-commit hook and CI.  Usage: npm run check-assets
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, loadManifest, validateManifest, resolveAssets, MEDIA_EXT } from './lib/assets.mjs';

const errors = [], warnings = [];
const m = loadManifest();
errors.push(...validateManifest(m).map((e) => `manifest: ${e}`));

// Files in the index = committed + staged (this is what a commit would contain).
const tracked = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean);

const licensedDir = `public/${m.roots.licensed}/`;
const placeholderDir = `public/${m.roots.placeholder}/`;
const allowedPlaceholders = new Set(m.assets.map((a) => placeholderDir + a.path));

for (const f of tracked) {
  if (f.startsWith(licensedDir) && f !== `${licensedDir}README.md`) {
    errors.push(`LICENSED FILE IN GIT: ${f}\n      Remove it from the index:  git rm --cached "${f}"`);
    continue;
  }
  if (MEDIA_EXT.test(f) && !allowedPlaceholders.has(f)) {
    errors.push(`Unlisted media file in git: ${f}\n      Only placeholders listed in assets.manifest.json may be committed. Add a manifest entry (with an "own"/CC0 source) or remove it.`);
  }
  const base = path.basename(f);
  if (/^\.env(\..*)?$/.test(base) && base !== '.env.example') errors.push(`Env file in git: ${f}  (secrets belong in an untracked .env)`);
}

// Every manifest entry needs a committed-quality placeholder of the right size.
for (const r of resolveAssets(m)) {
  const a = r.asset;
  if (!r.placeholder.exists) errors.push(`Missing placeholder for ${a.key}: ${r.placeholderFile}  (run npm run assets:placeholders)`);
  else if (!r.placeholder.sizeOk) errors.push(`Placeholder ${r.placeholderFile} is ${r.placeholder.size?.width}×${r.placeholder.size?.height}, manifest says ${a.width}×${a.height}`);
  else if (!tracked.includes(r.placeholderFile)) warnings.push(`Placeholder not committed yet: ${r.placeholderFile}`);
  if (r.licensed.exists && !r.licensed.sizeOk) {
    warnings.push(`${r.licensedFile} is ${r.licensed.size?.width ?? '?'}×${r.licensed.size?.height ?? '?'}, expected ${a.width}×${a.height}: the game uses the placeholder (see ASSETS.md → npm run assets:pack)`);
  }
}

// Secrets: the TheoSwap apiKey must never reach client code. Vite inlines any VITE_* var
// into the bundle, so key-like VITE_ names are banned, as are literal apiKey values.
const SECRET_PATTERNS = [
  [/VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)\b/, 'VITE_* variables are bundled into the browser build; never put keys in them'],
  [/apiKey\s*[:=]\s*['"`][A-Za-z0-9_-]{8,}['"`]/, 'hard-coded apiKey value'],
  [/[?&]apiKey=[A-Za-z0-9_-]{8,}/, 'apiKey value in a URL'],
];
for (const f of tracked) {
  if (!/\.(m?[jt]sx?|json|html|md|ya?ml|example)$/.test(f) || f.includes('node_modules') || f === 'package-lock.json') continue;
  if (f === 'scripts/check-assets.mjs') continue; // contains the patterns themselves
  let text; try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
  for (const [re, why] of SECRET_PATTERNS) {
    const hit = text.match(re);
    if (hit) errors.push(`Possible secret in ${f}: "${hit[0]}" (${why})`);
  }
}

for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`\n✖ check-assets failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  ✖ ${e}`);
  console.error('\nLicensed art (craftpix / gameart2d) must never be committed. See ASSETS.md.\n');
  process.exit(1);
}
console.log(`✔ check-assets: ${tracked.length} tracked files OK, ${m.assets.length} manifest assets have placeholders, no licensed files or secrets in git.`);
