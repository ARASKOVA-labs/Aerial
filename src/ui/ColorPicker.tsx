// ── Colour picker: quick swatches + full palette popover ─────────────────────

import { useEffect, useState } from 'react';
import { PALETTE } from './model';
import { Popover } from './primitives';

const isTransparent = (c: string) => !c || c === 'transparent';

function Swatch({ color, active, onClick, title }: { color: string; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      className={`ae-swatch${isTransparent(color) ? ' ae-swatch--transparent' : ''}`}
      aria-pressed={active}
      aria-label={title ?? color}
      title={title ?? color}
      onClick={onClick}
    >
      <span className="ae-swatch__color" style={isTransparent(color) ? undefined : { background: color }} />
    </button>
  );
}

function hueOf(color: string): number {
  const c = color.toLowerCase();
  return PALETTE.findIndex(([, shades]) => shades.includes(c));
}

export function ColorPicker({
  value,
  quick,
  onChange,
  allowTransparent,
  shadeIndex = 3,
}: {
  value: string;
  quick: string[];
  onChange: (color: string) => void;
  allowTransparent?: boolean;
  /** Which shade a hue click picks (3 = strong ink, 0 = pastel fill). */
  shadeIndex?: number;
}) {
  const [hex, setHex] = useState(value.replace('#', ''));
  useEffect(() => setHex(isTransparent(value) ? '' : value.replace('#', '')), [value]);
  const hue = hueOf(value);
  const lower = value.toLowerCase();

  return (
    <div className="ae-swatches">
      {quick.map((c) => (
        <Swatch key={c} color={c} active={lower === c.toLowerCase()} onClick={() => onChange(c)} title={isTransparent(c) ? 'Transparent' : c} />
      ))}
      <div className="ae-swatch-sep" />
      <Popover
        placement="right"
        trigger={({ toggle }) => <Swatch color={value} active={!quick.some((c) => c.toLowerCase() === lower)} onClick={toggle} title="More colours" />}
      >
        <div className="ae-palette">
          <div className="ae-section__label">Colors</div>
          <div className="ae-palette__grid">
            <Swatch color="#1e1e1e" active={lower === '#1e1e1e'} onClick={() => onChange('#1e1e1e')} title="Black" />
            <Swatch color="#ffffff" active={lower === '#ffffff'} onClick={() => onChange('#ffffff')} title="White" />
            {allowTransparent ? (
              <Swatch color="transparent" active={isTransparent(value)} onClick={() => onChange('transparent')} title="Transparent" />
            ) : (
              <Swatch color="#868e96" active={lower === '#868e96'} onClick={() => onChange('#868e96')} title="Gray" />
            )}
            {PALETTE.slice(1).map(([name, shades]) => (
              <Swatch key={name} color={shades[shadeIndex]} active={lower === shades[shadeIndex]} onClick={() => onChange(shades[shadeIndex])} title={name} />
            ))}
          </div>
          {hue >= 0 && (
            <>
              <div className="ae-section__label">Shades</div>
              <div className="ae-palette__grid">
                {PALETTE[hue][1].map((c) => (
                  <Swatch key={c} color={c} active={lower === c} onClick={() => onChange(c)} />
                ))}
              </div>
            </>
          )}
          <div className="ae-section__label">Hex code</div>
          <label className="ae-hex">
            <span>#</span>
            <input
              value={hex}
              maxLength={6}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-f]/gi, '');
                setHex(v);
                if (v.length === 6 || v.length === 3) onChange(`#${v.toLowerCase()}`);
              }}
            />
          </label>
        </div>
      </Popover>
    </div>
  );
}
