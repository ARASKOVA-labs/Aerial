## Summary

<!-- What changes and why. Link the issue or ADR. -->

## Testing

<!-- Commands run and results (cargo test, tsc, build, manual checks). -->

## Security & privacy checklist

- [ ] No new IPC command, capability, CSP source, or HTTP allowlist entry — or it is justified below and validated in `src-tauri/src/security.rs`
- [ ] Untrusted input (scene JSON, diagram source, IPC args, network frames) is validated before use
- [ ] No secrets, tokens, or user content written to logs
- [ ] Any new third-party data flow is consent-gated and added to the subprocessor list in `docs/compliance/SOC2.md`
- [ ] New dependencies reviewed (licence, maintenance, advisories)
- [ ] ADR added in `docs/adr/` for significant changes
