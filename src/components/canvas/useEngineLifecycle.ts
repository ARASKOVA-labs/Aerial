// ── WASM engine: boot, resize, frame loop, change feed, prop sync ────────────

import { useEffect, useRef } from 'react';
import { createLogger } from '../../lib/logger';
import type { AerialCanvasProps } from '../../lib/types';
import { loadAerialEngine } from '../../lib/wasm-loader';
import type { CanvasCore } from './useCanvasCore';

const logger = createLogger('AerialCanvas');

/** Selection/undo state is re-read this often to catch host-made changes. */
const UI_SYNC_MS = 250;

type LifecycleProps = Pick<AerialCanvasProps, 'initialScene' | 'initialState' | 'wasmBasePath' | 'onChange' | 'onChanges' | 'changeInterval' | 'eraserType' | 'eraserSize'>;

export function useEngineLifecycle(core: CanvasCore, canvasId: string, isDark: boolean, background: string, props: LifecycleProps, onThemeChanged: (dark: boolean) => void) {
  const { engineRef, canvasRef, engineReady, syncUi } = core;
  const { initialScene, initialState, wasmBasePath, onChange, onChanges, changeInterval = 500, eraserType, eraserSize } = props;
  const started = useRef(false);

  // Boot once: size the canvas, load the engine, follow resizes.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let observer: ResizeObserver | null = null;
    (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement ?? canvas;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, parent.clientWidth * dpr);
        canvas.height = Math.max(1, parent.clientHeight * dpr);

        const engine = await loadAerialEngine(canvasId, { basePath: wasmBasePath });
        engine.set_dpr(dpr);
        if (initialState) engine.import_full_state(initialState);
        else if (initialScene) engine.load_scene_json(initialScene);
        engine.set_dark_mode(isDark);
        engine.set_background_color(background);
        const s = core.styleRef.current;
        engine.set_eraser_type?.(eraserType ?? s.eraserMode);
        engine.set_eraser_radius((eraserSize ?? s.eraserSize) / 2);
        engineRef.current = engine;
        core.applyTool(core.toolRef.current, false);
        engine.render();
        core.setEngineReady(true);

        observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const d = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, entry.contentRect.width * d);
            canvas.height = Math.max(1, entry.contentRect.height * d);
            engine.set_dpr(d);
            engine.render();
          }
        });
        observer.observe(canvas);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        core.setLoadError(msg);
        window.__aerialBoot?.('error', msg);
      }
    })();
    return () => {
      observer?.disconnect();
      engineRef.current?.free?.();
      engineRef.current = null;
    };
    // Boot exactly once per mount; later prop changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation frames (laser fade, eraser trail).
  useEffect(() => {
    if (!engineReady) return;
    let raf = 0;
    let logged = false;
    const loop = () => {
      try {
        engineRef.current?.tick_animations();
      } catch (err) {
        if (!logged) logger.warn('tick_animations threw:', err);
        logged = true;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engineReady, engineRef]);

  // Catches changes made outside pointer handlers (host API calls, undo via menu).
  useEffect(() => {
    if (!engineReady) return;
    const id = setInterval(() => syncUi(), UI_SYNC_MS);
    return () => clearInterval(id);
  }, [engineReady, syncUi]);

  // Change notifications for embedding hosts.
  useEffect(() => {
    if (!engineReady || (!onChange && !onChanges)) return;
    let seen = engineRef.current?.scene_version() ?? 0;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      if (onChanges && e.has_pending_changes()) onChanges(e.take_changes());
      const v = e.scene_version();
      if (onChange && v !== seen) {
        seen = v;
        onChange(e.get_scene_json());
      }
    }, changeInterval);
    return () => clearInterval(id);
  }, [engineReady, engineRef, onChange, onChanges, changeInterval]);

  // Prop → engine sync.
  useEffect(() => {
    const e = engineRef.current;
    if (!engineReady || !e) return;
    e.set_dark_mode(isDark);
    e.render();
    onThemeChanged(isDark);
  }, [isDark, engineReady, engineRef, onThemeChanged]);

  useEffect(() => {
    if (engineReady) engineRef.current?.set_background_color(background);
  }, [background, engineReady, engineRef]);

  useEffect(() => {
    if (!engineReady || !eraserType) return;
    engineRef.current?.set_eraser_type?.(eraserType);
    if (eraserType !== 'element') core.setUiStyle((s) => (s.eraserMode === eraserType ? s : { ...s, eraserMode: eraserType }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eraserType, engineReady]);

  useEffect(() => {
    if (!engineReady || !eraserSize) return;
    engineRef.current?.set_eraser_radius(eraserSize / 2);
    core.setUiStyle((s) => (s.eraserSize === eraserSize ? s : { ...s, eraserSize }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eraserSize, engineReady]);
}
