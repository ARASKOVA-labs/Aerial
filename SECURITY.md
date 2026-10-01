# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
**[private vulnerability reporting](https://github.com/ARASKOVA-labs/Aerial/security/advisories/new)**.
Do not open a public issue for security problems.

Include what you can: affected component (engine, desktop app, collab server,
npm package), version or commit, reproduction steps, and impact.

| Stage | Target |
|---|---|
| Acknowledgement | 3 business days |
| Triage & severity (CVSS v3.1) | 7 days |
| Fix for critical / high | 30 days |
| Fix for medium / low | next scheduled release |

We will credit reporters in the advisory unless you prefer otherwise.

## Supported versions

Security fixes are released for the latest minor version of the desktop app
and the `@araskova/aerial` npm package.

## Scope

In scope: the WASM engine (`aerial-core/`), the desktop app (`src-tauri/`,
`src/`), the collaboration relay (`araskova-labs/collab-server/`), and the
published npm package.

Out of scope: vulnerabilities in third-party services the app can call after
user consent (Google Translate, MyMemory, Google Input Tools, OpenRouter), and
issues requiring a compromised operating system.

## How the project is secured

- Threat model: [`docs/security/threat-model.md`](docs/security/threat-model.md)
- Control mapping: [`docs/compliance/SOC2.md`](docs/compliance/SOC2.md)
- Decisions: [`docs/adr/`](docs/adr/)
