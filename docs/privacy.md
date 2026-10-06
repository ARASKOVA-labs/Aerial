# Aerial privacy

Aerial is a local-first app. Your boards live on your device, sealed with a
key held in the system keychain (see `docs/adr/2026-10-06-encryption-at-rest.md`).

- **No account, no telemetry, no analytics.** Aerial sends nothing about you
  or your boards to Araskova Labs or anyone else.
- **MCP / Claude.** When you connect Claude to Aerial, the board contents a
  tool returns (element text, a PNG snapshot) are passed to the Claude client
  you connected, under that client's own privacy terms. The connection is a
  private local socket on your Mac; Aerial opens no network port. You can turn
  access off at any time under Menu → AI agents (MCP).
- **Network use.** The diagram translator and handwriting input call external
  services only when you use them, and only with the text you typed.
- **Contact.** dev@araskova.com. Security reports: see `SECURITY.md`.
