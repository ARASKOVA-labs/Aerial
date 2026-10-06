#!/usr/bin/env node
// Launcher for the Aerial MCP server. The server itself is built into the
// Aerial app (`Aerial mcp`); this file finds the app and connects stdio to it.
// If Aerial is not installed it still answers the MCP handshake, so Claude can
// tell the user what to do instead of showing a failed connection.
"use strict";
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");
const readline = require("node:readline");

const candidates = [
  process.env.AERIAL_APP && join(process.env.AERIAL_APP, "Contents/MacOS/Aerial"),
  "/Applications/Aerial.app/Contents/MacOS/Aerial",
  join(homedir(), "Applications/Aerial.app/Contents/MacOS/Aerial"),
].filter(Boolean);
const binary = candidates.find((p) => existsSync(p));

if (binary) {
  const child = spawn(binary, ["mcp"], { stdio: "inherit" });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on("error", (e) => {
    process.stderr.write(`Could not start Aerial: ${e.message}\n`);
    process.exit(1);
  });
} else {
  const message =
    "Aerial is not installed on this Mac. Download it from https://github.com/ARASKOVA-labs/Aerial/releases, move it to Applications, then restart Claude.";
  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    let req;
    try { req = JSON.parse(line); } catch { return; }
    if (req.id === undefined) return;
    if (req.method === "initialize") {
      send({ id: req.id, result: {
        protocolVersion: req.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "aerial", version: "3.0.0" },
        instructions: message,
      } });
    } else if (req.method === "tools/list") {
      send({ id: req.id, result: { tools: [] } });
    } else {
      send({ id: req.id, error: { code: -32601, message } });
    }
  });
}
