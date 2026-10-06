// ── Transient status messages ────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';

const TOAST_MS = 2600;

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setMessage(msg);
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);
  return { message, show };
}

export type ShowToast = (msg: string) => void;
