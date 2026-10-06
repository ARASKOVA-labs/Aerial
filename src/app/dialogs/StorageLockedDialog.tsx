// ── The keychain refused Aerial's storage key ────────────────────────────────

export function StorageLockedDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="ae-dialog-backdrop">
      <div className="ae-dialog ae-form" role="alertdialog" aria-modal="true" aria-labelledby="locked-title">
        <h2 id="locked-title">Your boards are locked</h2>
        <p>
          Aerial encrypts your boards with a key kept in the macOS Keychain, and the Keychain did not let Aerial read it. Your boards are safe and unchanged, but Aerial
          cannot open or save them until it can.
        </p>
        <p>Quit Aerial and open it again. When macOS asks to let Aerial use its key, choose “Always Allow”.</p>
        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta ae-cta--primary" autoFocus onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
