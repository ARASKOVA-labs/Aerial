/// <reference types="vite/client" />

interface Window {
  /** Boot-screen progress hook installed by public/boot.js (absent in library use). */
  __aerialBoot?: (phase: 'engine' | 'fonts' | 'board' | 'ready' | 'error', detail?: string) => void;
}
