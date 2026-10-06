// ── External processing consent ─────────────────────────────────────────────
// Features that send user content to a third party ask once, explicitly, and
// remember the answer per service. See docs/compliance/SOC2.md (subprocessors).

export type ExternalService = 'translation' | 'handwriting';

const KEY_PREFIX = 'aerial_consent_v1:';

const PROMPTS: Record<ExternalService, string> = {
  translation:
    'Translation sends the selected text to third-party services (Google Translate, MyMemory). Continue?',
  handwriting:
    'Magic Pen recognition sends your handwriting strokes to Google Input Tools. Continue?',
};

export function hasConsent(service: ExternalService): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + service) === 'yes';
  } catch {
    return false;
  }
}

// A "no" is remembered for the session so passive triggers (live translation
// while typing) never re-prompt on every keystroke.
const declinedThisSession = new Set<ExternalService>();

type Prompter = (service: ExternalService, message: string) => Promise<boolean>;
let prompter: Prompter | null = null;

/** The app registers its dialog here. Native window.confirm is not reliable in desktop webviews. */
export function setConsentPrompter(fn: Prompter | null): void {
  prompter = fn;
}

/**
 * Resolves true if the user has agreed, asking if they have not yet. After a
 * decline, only an explicit user action (`{ reask: true }`) asks again.
 */
export async function ensureConsent(service: ExternalService, opts: { reask?: boolean } = {}): Promise<boolean> {
  if (hasConsent(service)) return true;
  if (declinedThisSession.has(service) && !opts.reask) return false;
  const ok = prompter ? await prompter(service, PROMPTS[service]) : false;
  if (!ok) declinedThisSession.add(service);
  if (ok) {
    try {
      localStorage.setItem(KEY_PREFIX + service, 'yes');
    } catch {
      /* storage unavailable: ask again next time */
    }
  }
  return ok;
}
