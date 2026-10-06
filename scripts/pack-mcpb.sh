#!/usr/bin/env bash
# Packs the Claude Desktop extension (.mcpb) for Aerial's MCP server.
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes @anthropic-ai/mcpb validate mcpb/manifest.json
mkdir -p dist-mcpb
npx --yes @anthropic-ai/mcpb pack mcpb dist-mcpb/aerial.mcpb
