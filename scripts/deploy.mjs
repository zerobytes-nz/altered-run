#!/usr/bin/env node
// Build the game and rsync dist/ to the web server.
//   npm run deploy:check   → build, then show what would change (rsync --dry-run)
//   npm run deploy         → build, then upload for real
// The target comes from DEPLOY_TARGET (environment or .env, which is gitignored), e.g.
//   DEPLOY_TARGET=user@host:/var/www/games.example.com/altered-run/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/assets.mjs';

const dry = process.argv.includes('--dry-run');

function fromDotEnv(name) {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return '';
  const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

let target = process.env.DEPLOY_TARGET || fromDotEnv('DEPLOY_TARGET');
if (!/^[^\s:]+:\/\S+$/.test(target)) {
  console.error('✘ Set DEPLOY_TARGET in .env, e.g. DEPLOY_TARGET=user@host:/var/www/games.example.com/altered-run/');
  process.exit(1);
}
if (!target.endsWith('/')) target += '/';

const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npm', ['run', 'build']);
// dist/ with the trailing slash = upload the folder's contents. --delete removes files the new build no longer has.
run('rsync', ['-avz', '--delete', ...(dry ? ['--dry-run'] : []), 'dist/', target]);
console.log(dry ? '\n✔ Dry run only: nothing was uploaded. Run `npm run deploy` to upload.' : `\n✔ Deployed to ${target}`);
