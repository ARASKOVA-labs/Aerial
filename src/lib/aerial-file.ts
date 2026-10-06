// ── .aerial files ────────────────────────────────────────────────────────────
// A self-contained, portable board: the scene plus every image it uses, as
// UTF-8 JSON any Aerial build (desktop or web) can open.
//
//   { format: "aerial", version: 1, encrypted: false, name, app, created,
//     scene: { elements: [...] }, assets: { "<assetId>": "data:image/…" } }
//
// With a password the same document is sealed with AES-256-GCM:
//
//   { format: "aerial", version: 1, encrypted: true,
//     kdf: { name: "PBKDF2-SHA-256", iterations, salt },
//     cipher: { name: "AES-256-GCM", iv }, data }
//
// The key is derived with PBKDF2-SHA-256 (600 000 iterations, OWASP 2023) and
// the envelope's own header is authenticated as additional data, so its
// parameters cannot be swapped. 256-bit symmetric keys keep a 128-bit margin
// even against Grover's quantum search (the reason CNSA 2.0 mandates AES-256);
// nothing here relies on public-key crypto that Shor's algorithm would break.

export const AERIAL_EXTENSION = 'aerial';
export const AERIAL_MIME = 'application/vnd.araskova.aerial+json';

const FORMAT = 'aerial';
const VERSION = 1;
const KDF_ITERATIONS = 600_000;
/** Refuse files a single board could never legitimately reach. */
export const MAX_AERIAL_FILE_BYTES = 512 * 1024 * 1024;
const MAX_ASSETS = 10_000;
const ASSET_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif|bmp|tiff|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export interface AerialDocument {
  name: string;
  scene: { elements: unknown[] };
  /** assetId → image data URL. */
  assets: Record<string, string>;
  app?: string;
  created?: string;
}

interface PlainFile extends AerialDocument {
  format: typeof FORMAT;
  version: number;
  encrypted: false;
}

interface SealedFile {
  format: typeof FORMAT;
  version: number;
  encrypted: true;
  kdf: { name: 'PBKDF2-SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-256-GCM'; iv: string };
  data: string;
}

export class AerialFileError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'unsupported' | 'password-required' | 'wrong-password' | 'too-large',
  ) {
    super(message);
    this.name = 'AerialFileError';
  }
}

// ── base64 (chunked: data URLs can be hundreds of MB) ────────────────────────
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Crypto ───────────────────────────────────────────────────────────────────
async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** The authenticated header: everything in the envelope except the ciphertext. */
const headerAad = (f: Omit<SealedFile, 'data'>) =>
  new TextEncoder().encode(JSON.stringify([f.format, f.version, f.kdf.name, f.kdf.iterations, f.kdf.salt, f.cipher.name, f.cipher.iv]));

// ── Write ────────────────────────────────────────────────────────────────────
export async function serializeAerialFile(doc: AerialDocument, password?: string): Promise<string> {
  const plain: PlainFile = {
    format: FORMAT,
    version: VERSION,
    encrypted: false,
    name: doc.name,
    app: doc.app,
    created: doc.created ?? new Date().toISOString(),
    scene: doc.scene,
    assets: doc.assets,
  };
  const json = JSON.stringify(plain);
  if (!password) return json;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const head: Omit<SealedFile, 'data'> = {
    format: FORMAT,
    version: VERSION,
    encrypted: true,
    kdf: { name: 'PBKDF2-SHA-256', iterations: KDF_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-256-GCM', iv: toBase64(iv) },
  };
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerAad(head) }, key, new TextEncoder().encode(json));
  return JSON.stringify({ ...head, data: toBase64(new Uint8Array(sealed)) } satisfies SealedFile);
}

// ── Read ─────────────────────────────────────────────────────────────────────
function validateDocument(raw: unknown): AerialDocument {
  const f = raw as Partial<PlainFile> | null;
  if (!f || typeof f !== 'object' || f.format !== FORMAT) throw new AerialFileError('This is not an Aerial file.', 'invalid');
  if (typeof f.version !== 'number' || f.version > VERSION) {
    throw new AerialFileError('This file was made by a newer version of Aerial. Update Aerial to open it.', 'unsupported');
  }
  const elements = (f.scene as { elements?: unknown } | undefined)?.elements;
  if (!Array.isArray(elements)) throw new AerialFileError('The file has no board in it.', 'invalid');
  const assets: Record<string, string> = {};
  const rawAssets = f.assets && typeof f.assets === 'object' ? Object.entries(f.assets) : [];
  if (rawAssets.length > MAX_ASSETS) throw new AerialFileError('The file has too many images.', 'invalid');
  for (const [id, url] of rawAssets) {
    // Anything that is not a well-formed image data URL is dropped, never loaded.
    if (ASSET_ID.test(id) && typeof url === 'string' && IMAGE_DATA_URL.test(url)) assets[id] = url;
  }
  const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 80) : 'Imported board';
  return { name, scene: { elements }, assets, app: typeof f.app === 'string' ? f.app : undefined, created: typeof f.created === 'string' ? f.created : undefined };
}

export async function parseAerialFile(text: string, password?: string): Promise<AerialDocument> {
  if (text.length > MAX_AERIAL_FILE_BYTES) throw new AerialFileError('The file is too large to open.', 'too-large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AerialFileError('This is not an Aerial file.', 'invalid');
  }
  const env = raw as Partial<SealedFile>;
  if (env?.format === FORMAT && env.encrypted === true) {
    if (!password) throw new AerialFileError('This file is protected with a password.', 'password-required');
    if (env.kdf?.name !== 'PBKDF2-SHA-256' || env.cipher?.name !== 'AES-256-GCM' || typeof env.data !== 'string') {
      throw new AerialFileError('This file uses encryption this version of Aerial does not support.', 'unsupported');
    }
    const iterations = env.kdf.iterations;
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 10_000_000) throw new AerialFileError('The file is damaged.', 'invalid');
    let plain: ArrayBuffer;
    try {
      const key = await deriveKey(password, fromBase64(env.kdf.salt), iterations);
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(env.cipher.iv), additionalData: headerAad(env as SealedFile) },
        key,
        fromBase64(env.data),
      );
    } catch {
      throw new AerialFileError('That password is not right, or the file has been changed.', 'wrong-password');
    }
    try {
      raw = JSON.parse(new TextDecoder().decode(plain));
    } catch {
      throw new AerialFileError('The file is damaged.', 'invalid');
    }
  }
  return validateDocument(raw);
}

/** File name for a board: safe on every OS, with the extension. */
export function aerialFileName(boardName: string): string {
  const base = boardName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Board';
  return `${base}.${AERIAL_EXTENSION}`;
}
