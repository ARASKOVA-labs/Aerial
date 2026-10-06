// ── localStorage-backed state ────────────────────────────────────────────────
// Storage can be blocked (private windows, quota); state then lives in memory.

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; the in-memory value still applies.
  }
}

/** `useState` persisted under `key`; `parse` maps the stored string (or null) to a value. */
export function usePersistentState<T>(key: string, parse: (raw: string | null) => T, serialize: (v: T) => string = String): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => parse(readStored(key)));
  useEffect(() => writeStored(key, serialize(value)), [key, value, serialize]);
  return [value, setValue];
}
