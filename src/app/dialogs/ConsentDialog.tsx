// ── Ask before content leaves the device ─────────────────────────────────────

export function ConsentDialog({ message, onAnswer }: { message: string; onAnswer: (ok: boolean) => void }) {
  return (
    <div className="ae-dialog-backdrop">
      <div className="ae-dialog ae-form" role="alertdialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title">Send to a third party?</h2>
        <p>{message}</p>
        <p>Nothing is sent until you continue, and Aerial remembers your choice.</p>
        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta" onClick={() => onAnswer(false)}>
            Not now
          </button>
          <button type="button" className="ae-cta ae-cta--primary" autoFocus onClick={() => onAnswer(true)}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
