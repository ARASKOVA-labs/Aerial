// ── Connect an AI agent (MCP) ────────────────────────────────────────────────

import { useState } from 'react';

const BINARY = '/Applications/Aerial.app/Contents/MacOS/Aerial';
const CLAUDE_CODE = `claude mcp add aerial -- ${BINARY} mcp`;
const CLAUDE_DESKTOP = JSON.stringify({ mcpServers: { aerial: { command: BINARY, args: ['mcp'] } } }, null, 2);

function Snippet({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ae-snippet">
      <div className="ae-snippet__head">
        <span>{label}</span>
        <button
          type="button"
          className="ae-cta ae-cta--small"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

export function AgentAccessDialog({ enabled, onToggle, onClose }: { enabled: boolean; onToggle: (on: boolean) => void; onClose: () => void }) {
  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog ae-form ae-agents" role="dialog" aria-modal="true" aria-labelledby="agents-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 id="agents-title">AI agents</h2>
        <p>
          Claude and other MCP clients can read this board, draw shapes, arrows and diagrams, write notes with the pen, and look at the result. Everything they do is
          one undo step, and they cannot read or write files.
        </p>

        <label className="ae-check">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span>
            Allow AI agents to use Aerial
            <small>Only programs running as you on this Mac can connect; no network port is opened.</small>
          </span>
        </label>

        <Snippet label="Claude Code" text={CLAUDE_CODE} />
        <Snippet label="Claude Desktop — claude_desktop_config.json" text={CLAUDE_DESKTOP} />

        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta ae-cta--primary" autoFocus onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
