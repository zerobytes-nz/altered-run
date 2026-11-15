# Altered Run

A one-thumb endless runner for the phone browser (Phaser 3 + TypeScript + Vite), and TheoSwap
showcase game #1. Players' NFTs become **AWIs (Altered World Items)**: a hero skin, a weapon,
a pet and a trinket, each with real effects in the run. See [PLAN.md](PLAN.md) for the design and milestones.

```bash
npm install      # also installs the pre-commit hook
npm run dev      # http://localhost:5180  (add ?debug for the FPS meter)
npm run build    # static site in dist/
```

Controls: tap = jump (tap again in the air with the Feather trinket), swipe right = attack, swipe down = slide / fast-fall.
Keyboard: Space/Up jump, Right/X attack, Down slide.

## Art: read [ASSETS.md](ASSETS.md)

A fresh clone runs on the committed art: **CC0 art from GameArt2D** (`public/assets/cc0/`) plus
**original placeholder art** for everything else. Art from packs that **may not be redistributed**
(craftpix.net freebies) is never in this repo: [ASSETS.md](ASSETS.md) lists every file to supply
(size, frames, what it's for, which pack) and how to drop it into `public/assets/licensed/` (gitignored).

| Command | What it does |
|---|---|
| `npm run assets:status` | Which assets are licensed ● / cc0 ◆ / placeholder ○ / missing ✖ |
| `npm run assets:pack -- <key> <files…>` | Turn downloaded frames into the exact sheet the game expects |
| `npm run check-assets` | Fails if licensed art, non-CC0 art in `cc0/`, unlisted media or secrets are in git (runs on pre-commit and CI) |
| `npm run assets:docs` | Regenerate ASSETS.md from `assets.manifest.json` |
| `npm run assets:placeholders` | Regenerate the placeholder art from the manifest |
| `npm run pwa:icons` | Redraw the home-screen icons in `public/icons/` (from CC0 + placeholder art only) |

`assets.manifest.json` is the single source of truth for every image and sound. Game code only uses manifest keys.

## Sound and offline play
- Sound effects and music are synthesized with Web Audio in `src/systems/audio.ts`: no audio files to license.
  The speaker button (or the **M** key) mutes it, and the choice is remembered.
- `npm run build` also writes `dist/sw.js`, a service worker that caches the game (about 3.5 MB) so it plays offline
  after the first visit, and `manifest.webmanifest` lets phones add it to the home screen. Check it with `npm run preview`.

## Deploy (games.theoswap.io/altered-run)

The build is a plain static folder: `index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `assets/`.
Vite's `base` is `./`, so it works from any sub-folder. Live location: `/var/www/games.theoswap.io/altered-run`.

One-time setup on your machine (both files are gitignored):
- `.env`: `DEPLOY_TARGET=user@host:/var/www/games.theoswap.io/altered-run/`
- `.env.production`: `VITE_THEOSWAP_PROXY=./api/user-items` (live builds talk to the nginx proxy below, so they hold no key)

Then:

```bash
npm run deploy:check   # build, then list what rsync would change (uploads nothing)
npm run deploy         # build, then rsync dist/ to DEPLOY_TARGET (--delete removes files the build no longer has)
```

The folder must exist on the server and be writable by that SSH user. `npm run deploy` refuses to upload if
`VITE_THEOSWAP_PROXY` is not set or if any API key ended up in the JS.

- The build ships whichever art it finds (licensed → CC0 → placeholder), so build where `public/assets/licensed/` is filled in if you want that art.
  Shipping licensed art inside the game is fine; only putting the raw files in git is not.
- If the `games.theoswap.io` server block already has `root /var/www/games.theoswap.io;`, nginx needs no new
  `location`: the folder is served as `/altered-run/`. Add these so updates reach players straight away
  (only the hashed JS files are safe to cache forever; the art keeps its file names, and the service worker
  refetches it when a new `sw.js` arrives):

```nginx
location = /altered-run/sw.js               { add_header Cache-Control "no-cache"; }
location = /altered-run/index.html          { add_header Cache-Control "no-cache"; }
location = /altered-run/manifest.webmanifest { add_header Cache-Control "no-cache"; }
location ~ ^/altered-run/assets/.+-[\w-]{8}\.js$ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

### The API proxy (keeps the live key off players' devices)

The game asks its own server for `/altered-run/api/user-items?userCode=…`. nginx adds the API key and forwards the
request to TheoSwap, so the keys only exist in the nginx config on the server. The three showcase test codes on the
Connect screen get the **test** key (TheoSwap's test items for this game); every real player code gets the **live** key. No Node process:
it is a few lines in the `games.theoswap.io` server block.

```nginx
# Top of the site file, OUTSIDE server { }: which key each player code uses.
# The showcase test codes (shown on the Connect screen) use the game's TEST key, everyone else the LIVE key.
map $arg_userCode $altered_run_key {
    default    "LIVE_API_KEY_HERE";
    AAAAAAAA   "TEST_API_KEY_HERE";
    BBBBBBBB   "TEST_API_KEY_HERE";
    CCCCCCCC   "TEST_API_KEY_HERE";
}

# Inside server { } (the listen 443 one), e.g. after location / { }:
location = /altered-run/api/user-items {
    limit_except GET { deny all; }
    if ($arg_userCode !~ "^[A-Za-z0-9]{4,16}$") { return 400; }
    set $args "apiKey=$altered_run_key&userCode=$arg_userCode";
    proxy_pass https://www.theoswap.io/api/public/user-items;
    proxy_ssl_server_name on;
    proxy_set_header Host www.theoswap.io;
    proxy_set_header X-Forwarded-For $remote_addr;
    add_header Cache-Control "no-store" always;
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`, and check
`https://games.theoswap.io/altered-run/api/user-items?userCode=TESTCODE` answers. The `if` line rejects anything but a
plain 4–16 letter/digit code, so the URL cannot be bent into other requests. Every lookup comes from the server's
IP, so if TheoSwap rate-limits the public API per IP, allow that address.

Locally, `npm run dev` and `npm run preview` have the same `/api/user-items` route (in `vite.config.ts`), using the
**test** key from `.env` in Node, so the browser never sees it either.

- TheoSwap game website (for the "Play" link): `https://games.theoswap.io/altered-run/?userCode=$USER_CODE`.
  The game reads the code, removes it from the address bar and connects.

## TheoSwap and secrets

Players tap **Connect TheoSwap**, enter the player code from their TheoSwap profile, and their NFTs
become AWIs (reveal cards, then a loadout screen). Without a code, three demo players work offline.

Copy `.env.example` to `.env` (gitignored) and set `VITE_THEOSWAP_API_KEY` to the game's **test** key.
- With `VITE_THEOSWAP_PROXY` set (always for live builds: `.env.production`), the game calls that URL and the key is
  left out of the bundle. The **live** key is only ever in the server's nginx config (see Deploy → The API proxy).
- Without it, the game calls TheoSwap directly with the key, which Vite then puts **in the browser build**: test key only. `check-assets` allows only that one `VITE_*KEY` name and still rejects other key-like
`VITE_*` names and hard-coded `apiKey` values.

## Licence

Code and placeholder art: [MIT](LICENSE). The GameArt2D art in `public/assets/cc0/` is CC0 (public domain) by its author. Other third-party art isn't included.
