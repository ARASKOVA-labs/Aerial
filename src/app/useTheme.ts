// ── Theme and fullscreen ─────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { usePersistentState } from './usePersistentState';

export function useTheme() {
  const [isDarkMode, setIsDarkMode] = usePersistentState('aerial_dark_mode', (raw) => raw === 'true');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    setFullscreen(next);
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setFullscreen(next))
      .catch(() => {
        if (next) void document.documentElement.requestFullscreen().catch(() => undefined);
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      });
  }, [fullscreen]);

  return { isDarkMode, setIsDarkMode, toggleFullscreen };
}
