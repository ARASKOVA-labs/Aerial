// ── MCP bridge (app side) ────────────────────────────────────────────────────
// The desktop shell forwards tool calls from MCP clients (Claude Desktop,
// Claude Code…) as `aerial://agent-request` events; we run them against the
// live canvas and hand the result back with `agent_respond`.

import { useEffect, useRef } from 'react';
import { usePersistentState } from './usePersistentState';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AgentError, runTool, type AgentHost } from '../lib/agent/tools';
import { persistenceAvailable } from '../lib/board-store';
import { createLogger } from '../lib/logger';

const logger = createLogger('AgentBridge');

interface AgentRequest {
  rid: string;
  tool: string;
  args?: unknown;
}

declare global {
  interface Window {
    /** Dev builds only: run an agent tool from the console or tests. */
    __aerialAgent?: (tool: string, args?: unknown) => Promise<unknown>;
  }
}

const DISABLED_MESSAGE = 'AI agent access is turned off in Aerial (main menu → AI agents). Ask the user to turn it on.';

export function useAgentBridge(host: AgentHost, canvasReady: boolean) {
  const [enabled, setEnabled] = usePersistentState('aerial_agents_enabled', (raw) => raw !== 'false');
  const hostRef = useRef(host);
  hostRef.current = host;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!canvasReady) return;
    if (import.meta.env.DEV) window.__aerialAgent = (tool, args) => runTool(hostRef.current, tool, args);
    if (!persistenceAvailable()) return;

    const unlisten = listen<AgentRequest>('aerial://agent-request', async ({ payload }) => {
      const { rid, tool, args } = payload;
      if (!enabledRef.current) {
        await invoke('agent_respond', { rid, ok: false, result: { message: DISABLED_MESSAGE } }).catch(() => undefined);
        return;
      }
      try {
        const result = await runTool(hostRef.current, tool, args);
        await invoke('agent_respond', { rid, ok: true, result });
      } catch (err) {
        const message = err instanceof AgentError ? err.message : 'The tool failed inside Aerial.';
        if (!(err instanceof AgentError)) logger.error(`Agent tool ${tool} failed`, err);
        await invoke('agent_respond', { rid, ok: false, result: { message } }).catch(() => undefined);
      }
    });
    return () => void unlisten.then((fn) => fn()).catch(() => undefined);
  }, [canvasReady]);

  return { enabled, setEnabled };
}
