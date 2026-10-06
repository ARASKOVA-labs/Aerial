# Using Aerial from Claude (MCP)

Aerial ships a [Model Context Protocol](https://modelcontextprotocol.io) server
inside the app binary. An MCP client such as Claude Desktop or Claude Code can
read the open board, draw on it, write notes with the pen, add diagrams and
look at the result.

## Connect

The app shows these snippets under **Menu → AI agents (MCP)…**, with a Copy
button.

**Claude Code**

```bash
claude mcp add aerial -- /Applications/Aerial.app/Contents/MacOS/Aerial mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`
(Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "aerial": {
      "command": "/Applications/Aerial.app/Contents/MacOS/Aerial",
      "args": ["mcp"]
    }
  }
}
```

If Aerial is not running when a tool is called, it is started in the
background.

## Tools

| Tool | What it does |
|---|---|
| `get_board` | Elements on the open board (id, kind, position, size, text, colours, diagram source), bounds, zoom, theme |
| `get_snapshot` | A PNG of the board, so the model can see its work |
| `list_boards` · `open_board` · `create_board` | Board management |
| `draw_shapes` | Rectangles, ellipses, diamonds with labels, fills and hand-drawn sloppiness |
| `draw_connectors` | Arrows and lines between elements (`from_id`/`to_id`) or through points |
| `draw_freehand` | Pen, brush, marker or highlighter strokes through points |
| `write_handwriting` | Notes written as real pen strokes (print or cursive) |
| `add_text` | Editable typed text (hand-drawn, normal, code fonts) |
| `add_diagram` | Mermaid flowcharts, sequence, state, class and ER diagrams |
| `update_elements` · `move_elements` · `delete_elements` | Edit by id |
| `clear_board` | Clears the board (`confirm: true` required) |
| `history` | Undo / redo |
| `zoom_to_fit` | Frames everything in the user's view |

Coordinates are world units: 1 unit is 1 screen pixel at 100% zoom, and y
grows downward. Colours are given in light-theme form; Aerial adapts them in
dark mode. Each tool call is one undo step for the user.

## How it works

```
Claude ──stdio (JSON-RPC)──▶ Aerial mcp ──Unix socket──▶ Aerial app ──event──▶ canvas
                                         (~/Library/Application Support/com.araskova.aerial/mcp.sock)
```

- `src-tauri/src/mcp.rs` — the stdio MCP server and the tool catalogue.
- `src-tauri/src/agent.rs` — the app-side socket, forwarding calls to the webview.
- `src/lib/agent/tools.ts` — the tools, run against the live canvas.
- `aerial-core/aerial-engine/src/api_agent.rs` — batch add / update / move /
  delete, validated like any loaded scene.

## Security

- The socket is created with mode `0600` in the user's app data folder: only
  the user's own processes can connect. No network port is opened.
- Tools cannot read or write files, run commands or reach the network; they
  only edit boards, and every change can be undone.
- Every element an agent adds passes the engine's scene validation; request
  lines are capped at 4 MB and tool names are allow-listed.
- Tool calls are recorded in the audit log by name only.
- **Menu → AI agents (MCP)…** turns access off; calls are then refused with a
  message the model can relay.
- macOS and Linux only for now (Windows needs a named-pipe transport).
