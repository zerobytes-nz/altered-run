// "Install the game" (Add to Home Screen) and leaving full screen.
//
// • Android Chrome / Edge / Samsung: the browser fires `beforeinstallprompt` once the page qualifies
//   (manifest + service worker). We keep that event and show our own Install button; tapping it opens
//   the browser's install dialog. Installed, the game opens full screen in landscape (manifest.webmanifest).
// • iPhone / iPad: Safari has no install prompt, so the button shows how to use Share → Add to Home Screen.
// • Imported from main.ts so the listener is in place before the browser fires the event.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own button instead of the browser's mini bar
  deferred = e as InstallPromptEvent;
  changed();
});
window.addEventListener('appinstalled', () => { deferred = null; changed(); });

/** Running as the installed app (opened from the home screen icon). */
export function isInstalled(): boolean {
  const mm = (q: string) => window.matchMedia?.(q).matches ?? false;
  return mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)') || (navigator as { standalone?: boolean }).standalone === true;
}

export const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Show the Install button? */
export const canInstall = (): boolean => !isInstalled() && (deferred !== null || isIOS());

/** Called when canInstall() may have changed. Returns an unsubscribe function. */
export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Open the browser's install dialog. 'ios' = no dialog exists: show the Share → Add to Home Screen steps. */
export async function install(): Promise<'accepted' | 'dismissed' | 'ios' | 'unavailable'> {
  if (deferred) {
    const e = deferred;
    deferred = null; // a prompt event can only be used once
    await e.prompt();
    const { outcome } = await e.userChoice;
    changed();
    return outcome;
  }
  return isIOS() ? 'ios' : 'unavailable';
}

/** Try to close the installed app. Browsers often refuse; returns false if the game is still open. */
export function tryCloseApp(): Promise<boolean> {
  window.close();
  return new Promise((r) => setTimeout(() => r(window.closed), 300));
}
