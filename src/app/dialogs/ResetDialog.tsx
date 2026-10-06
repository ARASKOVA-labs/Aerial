// ── Reset the canvas (confirm) ───────────────────────────────────────────────

import { MOD } from '../../ui/primitives';

export function ResetDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 id="clear-title">Reset the canvas?</h2>
        <p>This clears the whole board. You can still undo it with {MOD}Z until you close the app.</p>
        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ae-cta ae-cta--danger" autoFocus onClick={onConfirm}>
            Reset canvas
          </button>
        </div>
      </div>
    </div>
  );
}
