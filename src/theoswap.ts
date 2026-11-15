// TheoSwap connection: fetch a player's AWIs with their user code, cache the last good answer
// for bad signal, and remember the player's profile (code + chosen AWIs) between visits.
//
// The game calls GET /api/public/user-items directly (that endpoint allows any origin).
// The developer chose this over a proxy, so the API key below IS visible in the built game.
// Ship only the TEST key until a proxy is in place (see PLAN.md → milestone 2).
import { defaultSelection, loadoutFrom, parseAwis, type ApiItem, type AWI, type Selection } from './awi';
import { guestLoadout, type Loadout } from './loadout';
import { DEMO_PROFILES, type DemoId } from './demo';

const BASE = (import.meta.env.VITE_THEOSWAP_URL as string | undefined) || 'https://www.theoswap.io';
const KEY = (import.meta.env.VITE_THEOSWAP_API_KEY as string | undefined) || '';
export const hasApiKey = KEY.length > 0;

const LS_PROFILE = 'altered-run.profile.v1';
const LS_ITEMS = 'altered-run.items.v1.'; // + code

export type Source = 'live' | 'cache' | 'demo';
export interface Profile {
  code: string;          // TheoSwap user code (or a demo id)
  label: string;         // what the menu shows: "Collector (demo)", "Code AB…CD"
  source: Source;
  awis: AWI[];
  selection: Selection;
  fetchedAt: number;
}

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / full */ } },
  del(k: string): void { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const loadProfile = (): Profile | null => store.get<Profile>(LS_PROFILE);
export const saveProfile = (p: Profile): void => store.set(LS_PROFILE, p);
export const forgetProfile = (): void => store.del(LS_PROFILE);

/** User codes are 8 letters/digits on the TheoSwap profile page. */
export const normalizeCode = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').slice(0, 16);

export class ConnectError extends Error {}

async function fetchResults(code: string): Promise<ApiItem[]> {
  if (!hasApiKey) throw new ConnectError('This build has no TheoSwap API key (set VITE_THEOSWAP_API_KEY in .env).');
  const url = `${BASE}/api/public/user-items?${new URLSearchParams({ apiKey: KEY, userCode: code })}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; results?: ApiItem[] } | null;
    if (!body) throw new ConnectError(`TheoSwap answered ${res.status} with no data.`);
    if (body.status === false) throw new ConnectError(body.message || 'TheoSwap did not accept that code.');
    return Array.isArray(body.results) ? body.results : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get the AWIs for a user code. On a network failure, falls back to the last good answer for
 * that code (source "cache"). A clear "no" from TheoSwap (bad code) is not hidden by the cache.
 */
export async function connect(code: string, label = `Code ${code}`): Promise<Profile> {
  const prev = loadProfile();
  let results: ApiItem[], source: Source = 'live', fetchedAt = Date.now();
  try {
    results = await fetchResults(code);
    store.set(LS_ITEMS + code, { at: fetchedAt, results });
  } catch (e) {
    const cached = store.get<{ at: number; results: ApiItem[] }>(LS_ITEMS + code);
    if (e instanceof ConnectError || !cached) throw e instanceof ConnectError ? e : new ConnectError('Could not reach TheoSwap. Check your connection and try again.');
    results = cached.results; source = 'cache'; fetchedAt = cached.at;
  }
  const awis = parseAwis(results);
  const p: Profile = { code, label, source, awis, fetchedAt, selection: defaultSelection(awis, prev?.code === code ? prev.selection : {}) };
  saveProfile(p);
  return p;
}

/**
 * Demo profiles. With a TEST API key in the build, they load TheoSwap's test codes (set up with
 * set_test_items), so the real API path is exercised. Without one, bundled sample data is used.
 */
export async function connectDemo(id: DemoId): Promise<Profile> {
  const d = DEMO_PROFILES[id];
  if (hasApiKey) {
    try { return await connect(d.testCode, `${d.name} (demo)`); } catch { /* fall through to bundled data */ }
  }
  const awis = parseAwis(d.sample);
  const p: Profile = { code: `demo:${id}`, label: `${d.name} (demo)`, source: 'demo', awis, fetchedAt: Date.now(), selection: defaultSelection(awis) };
  saveProfile(p);
  return p;
}

/** The loadout for the next run: the connected player's chosen AWIs, or the guest defaults. */
export function currentLoadout(): Loadout {
  const p = loadProfile();
  return p ? loadoutFrom(p.awis, p.selection) : guestLoadout();
}
