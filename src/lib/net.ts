import { persistenceAvailable } from './board-store';
/** Third-party HTTP: via the allowlisted Tauri client on desktop, fetch on web. */
export async function externalFetch(url: string, init?: RequestInit): Promise<Response> {
  if (persistenceAvailable()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}
