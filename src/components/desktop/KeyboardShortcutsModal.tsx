// ── Help dialog: keyboard shortcuts (Excalidraw-style) ──────────────────────

import { CloseIcon } from '../../ui/icons';
import { MOD } from '../../ui/primitives';

type Row = [string, string[][]];

const mod = MOD.replace('+', '');
const TOOLS: Row[] = [
  ['Hand (panning tool)', [['H'], ['Space', 'drag']]],
  ['Selection', [['V'], ['1']]],
  ['Rectangle', [['R'], ['2']]],
  ['Diamond', [['D'], ['3']]],
  ['Ellipse', [['O'], ['4']]],
  ['Arrow', [['A'], ['5']]],
  ['Line', [['L'], ['6']]],
  ['Draw (last pen)', [['P'], ['X'], ['7']]],
  ['Text', [['T'], ['8']]],
  ['Insert image', [['9']]],
  ['Eraser', [['E'], ['0']]],
  ['Laser pointer', [['K']]],
  ['Magic pen', [['W']]],
  ['Keep tool active', [['Q']]],
];

const EDITOR: Row[] = [
  ['Undo', [[mod, 'Z']]],
  ['Redo', [[mod, '⇧', 'Z'], [mod, 'Y']]],
  ['Select all', [[mod, 'A']]],
  ['Duplicate', [[mod, 'D']]],
  ['Delete', [['Del'], ['⌫']]],
  ['Move selection', [['←↑→↓'], ['⇧', 'arrows']]],
  ['Bring forward / send backward', [[mod, ']'], [mod, '[']]],
  ['Bring to front / send to back', [[mod, '⇧', ']'], [mod, '⇧', '[']]],
  ['Edit selected text', [['Enter'], ['double-click']]],
  ['Constrain shape / 15° steps', [['⇧', 'drag']]],
  ['Draw from centre', [['Alt', 'drag']]],
  ['Restore while erasing', [['Alt']]],
  ['Deselect', [['Esc']]],
];

const VIEW: Row[] = [
  ['Zoom in / out', [[mod, '+'], [mod, '−']]],
  ['Reset zoom', [[mod, '0']]],
  ['Zoom to fit', [['⇧', '1']]],
  ['Zoom at cursor', [[mod, 'wheel'], ['pinch']]],
  ['Scroll horizontally', [['⇧', 'wheel']]],
  ['Toggle fullscreen', [['Ctrl', mod === 'Ctrl' ? 'F' : '⌘F']]],
];

const APP: Row[] = [
  ['Command palette', [[mod, 'K']]],
  ['New board', [[mod, 'N']]],
  ['Save as .aerial file', [[mod, 'E']]],
  ['Open .aerial file', [[mod, '⇧', 'E']]],
  ['Switch to board 1–9', [[mod, '1…9']]],
  ['Open image / PDF', [[mod, 'O'], [mod, '⇧', 'O']]],
  ['Paste screenshot', [[mod, 'V']]],
  ['Export PNG / SVG', [[mod, 'S'], [mod, '⇧', 'S']]],
  ['Reset the canvas', [[mod, '⇧', '⌫']]],
  ['This help', [['?'], [mod, '/']]],
];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="ae-help__section">
      <h3>{title}</h3>
      {rows.map(([label, combos]) => (
        <div key={label} className="ae-help__row">
          <span>{label}</span>
          <span className="ae-help__keys">
            {combos.map((combo, i) => (
              <span key={i} className="ae-help__combo">
                {i > 0 && <span className="ae-help__or">or</span>}
                {combo.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
            ))}
          </span>
        </div>
      ))}
    </section>
  );
}

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog ae-help" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="ae-help__head">
          <h2 id="help-title">Keyboard shortcuts</h2>
          <button type="button" className="ae-btn ae-btn--plain" aria-label="Close" onClick={onClose} autoFocus>
            <CloseIcon />
          </button>
        </header>
        <div className="ae-help__grid">
          <div>
            <Section title="Tools" rows={TOOLS} />
            <Section title="View" rows={VIEW} />
          </div>
          <div>
            <Section title="Editor" rows={EDITOR} />
            <Section title="App" rows={APP} />
          </div>
        </div>
      </div>
    </div>
  );
}
