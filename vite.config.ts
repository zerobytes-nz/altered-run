import { defineConfig, type Plugin } from 'vite';
import { resolveAssets, loadManifest, PUBLIC_DIR, MANIFEST_FILE } from './scripts/lib/assets.mjs';
import path from 'node:path';

/**
 * `virtual:asset-urls` → { [manifest key]: url }. Picks licensed/ → cc0/ → placeholder/,
 * the first file that exists with the size the manifest expects (see resolveAssets). Decided at dev/build
 * time, so a fresh clone makes zero requests for missing licensed files.
 */
function assetUrls(): Plugin {
  const ID = 'virtual:asset-urls', RID = '\0' + ID;
  return {
    name: 'altered-run-asset-urls',
    resolveId: (id) => (id === ID ? RID : null),
    load(id) {
      if (id !== RID) return null;
      const m = loadManifest();
      const urls: Record<string, string> = {};
      for (const r of resolveAssets(m)) {
        for (const [f, c] of [[r.licensedFile, r.licensed], [r.cc0File, r.cc0]] as const) {
          if (c.exists && !c.sizeOk) this.warn(`${f} is ${c.size?.width}×${c.size?.height}, expected ${r.asset.width}×${r.asset.height}: skipped`);
        }
        if (r.cc0.exists && !r.cc0Allowed) this.warn(`${r.cc0File} is ignored: source "${r.asset.source}" is not marked cc0 in the manifest`);
        urls[r.asset.key] = r.url;
      }
      return `export default ${JSON.stringify(urls)};`;
    },
    configureServer(server) {
      const m = loadManifest();
      const dir = path.join(PUBLIC_DIR, m.roots.licensed);
      server.watcher.add([dir, path.join(PUBLIC_DIR, m.roots.cc0), path.join(PUBLIC_DIR, m.roots.placeholder), 'assets.manifest.json']);
      const refresh = (file: string) => {
        if (!file.startsWith(PUBLIC_DIR + path.sep + 'assets') && !file.endsWith('assets.manifest.json')) return;
        // Invalidate the virtual module AND the manifest JSON that src/assets.ts imports:
        // otherwise a manifest edit (e.g. a new frame size) can be served stale until a restart.
        const mod = server.moduleGraph.getModuleById(RID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        for (const m of server.moduleGraph.getModulesByFile(MANIFEST_FILE) ?? []) server.moduleGraph.invalidateModule(m);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
      server.watcher.on('change', refresh);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [assetUrls()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  server: { port: 5180, strictPort: true },
});
