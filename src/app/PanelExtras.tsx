// ── Extra rows in the properties panel ───────────────────────────────────────

export type MagicLanguage = 'en' | 'ml' | 'ta' | 'te';

export const TRANSLATE_LANGS: Array<[string, string]> = [['en', 'EN'], ['ml', 'ML'], ['ta', 'TA'], ['te', 'TE'], ['hi', 'HI'], ['es', 'ES'], ['fr', 'FR']];
export const MAGIC_LANGS: Array<[MagicLanguage, string]> = [['en', 'EN'], ['ml', 'ML'], ['ta', 'TA'], ['te', 'TE']];

/** A labelled row of text options, styled like the properties panel. */
export function PanelChoice<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <fieldset className="ae-section" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="ae-section__label" style={{ padding: 0, marginBottom: 6 }}>
        {label}
      </legend>
      <div className="ae-options" style={{ flexWrap: 'wrap' }}>
        {options.map(([v, text]) => (
          <button key={v} type="button" className="ae-opt ae-opt--text" aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
