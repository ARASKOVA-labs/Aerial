# Submitting Aerial to Claude's connector directory

Nothing here has been submitted. These are the steps for a maintainer to do.

## What Aerial is, for the directory

Aerial's MCP server is **local**: it is built into the desktop app and talks
to it over a private Unix socket (`docs/mcp.md`). That makes it a Claude
Desktop **extension** (`.mcpb` bundle), not a remote connector. Remote
(URL + OAuth) servers are a different listing type and would need a hosted
service, which Aerial deliberately does not have.

## 1. Build the bundle

```bash
scripts/pack-mcpb.sh        # validates mcpb/manifest.json, writes dist-mcpb/aerial.mcpb
```

The bundle (`mcpb/`) is a small Node launcher that finds `Aerial.app` and runs
`Aerial mcp` over stdio. If the app is missing it answers the MCP handshake
with install instructions instead of failing.

To try it: double-click `aerial.mcpb` (or drag it onto Claude Desktop →
Settings → Extensions), then ask Claude to "draw a flowchart on my Aerial board".

## 2. Before you submit

- Ship a **signed and notarised** `Aerial.app` (Developer ID); reviewers will
  install it. `scripts/build-mac.sh` signs with your certificate; notarise
  with `xcrun notarytool`.
- Publish a release on GitHub with the notarised app and `aerial.mcpb`.
- Keep `docs/privacy.md` at the URL in `mcpb/manifest.json`.
- Have 3 or more tested example prompts ready (the form asks for them):
  1. "Read my board and summarise it."
  2. "Draw a flowchart of our signup flow and label each step."
  3. "Write 'Ship Friday' in handwriting next to the diagram."
- Tool annotations are set (`readOnlyHint` on read tools); `clear_board`
  requires `confirm: true`. Reviewers check this.

## 3. Submit

Use the submission form linked from Anthropic's directory documentation
(search "Claude connectors directory submission" or "MCP Bundle submission"
in the Claude Help Center / docs; the URL changes, so it is not hard-coded
here). Submit from an Araskova Labs account, attach the `.mcpb` or its
release URL, the privacy URL, support URL (GitHub issues) and the example
prompts. Expect review feedback on tool descriptions and permissions.

Also consider listing the server in the community MCP registry
(`modelcontextprotocol/registry`) once a notarised release exists.
