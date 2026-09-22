// ── Araskova Logger Utility ──────────────────────────────────────────────────
// Structured logging conforming to Araskova standards.

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;
  return {
    info: (message: string, ...args: unknown[]) => {
      const fn = (globalThis as unknown as { console?: { info?: (p: string, m: string, ...a: unknown[]) => void } }).console?.info;
      fn?.(prefix, message, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      const fn = (globalThis as unknown as { console?: { warn?: (p: string, m: string, ...a: unknown[]) => void } }).console?.warn;
      fn?.(prefix, message, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      const fn = (globalThis as unknown as { console?: { error?: (p: string, m: string, ...a: unknown[]) => void } }).console?.error;
      fn?.(prefix, message, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
      const fn = (globalThis as unknown as { console?: { debug?: (p: string, m: string, ...a: unknown[]) => void } }).console?.debug;
      fn?.(prefix, message, ...args);
    },
  };
}
