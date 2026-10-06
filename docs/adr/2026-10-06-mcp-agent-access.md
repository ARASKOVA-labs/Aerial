# ADR 2026-10-06: AI Agent Access over MCP

## Status
Accepted

## Context

Users want Claude to work on the canvas directly: draw diagrams, write notes,
rearrange content, and see what it made. The standard way for Claude Desktop,
Claude Code and other clients to use an app is the Model Context Protocol.

## Decision

- **One binary.** `Aerial mcp` is an MCP server on stdio (JSON-RPC 2.0,
  protocol 2025-06-18). No Node or Python runtime, nothing extra to install.
- **Local bridge.** The running app listens on a Unix socket in its data
  directory (mode 0600). The MCP process relays each tool call over it and
  starts Aerial if needed. No network port, so nothing off-machine can reach it.
- **Tools run in the app** (`src/lib/agent/tools.ts`) against the live
  canvas, so agents see the same board as the user and edits are undoable.
  New engine calls (`api_agent.rs`) add, update, move and delete elements in
  batches, each batch one undo step, through the same validation as scene loads.
- **Pen-written notes.** `write_handwriting` lays text out in single-stroke
  fonts (EMS Readability / Allure, SIL OFL) and adds real freehand strokes,
  so notes look and behave like ink.
- **Feedback loop.** `get_snapshot` returns a PNG so the model can check its
  work, and `get_board` returns ids and geometry for precise follow-up edits.
- **User control.** Menu → AI agents shows connection snippets and an on/off
  switch; when off, calls are refused with an explanatory message.

## Consequences

- Any process running as the user can drive the canvas while access is on
  (the same trust boundary as the user's files). Tools cannot touch the file
  system, run commands or use the network.
- Windows needs a named-pipe transport before it gets MCP support.
