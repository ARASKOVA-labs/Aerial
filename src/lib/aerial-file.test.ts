import { describe, expect, test } from 'bun:test';
import { AerialFileError, aerialFileName, parseAerialFile, serializeAerialFile, type AerialDocument } from './aerial-file';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const doc: AerialDocument = {
  name: 'Roadmap',
  scene: { elements: [{ id: 1, kind: 'Image', asset_id: 'a1' }, { id: 2, kind: 'FreeDraw', points: [[0, 0], [5, 5]] }] },
  assets: { a1: PNG },
};

describe('.aerial files', () => {
  test('plain round trip keeps scene, assets and name', async () => {
    const back = await parseAerialFile(await serializeAerialFile(doc));
    expect(back.name).toBe('Roadmap');
    expect(back.scene.elements).toEqual(doc.scene.elements);
    expect(back.assets).toEqual({ a1: PNG });
  });

  test('encrypted file hides content and opens only with the password', async () => {
    const text = await serializeAerialFile(doc, 'correct horse');
    expect(text).not.toContain('Roadmap');
    expect(text).not.toContain('iVBORw0KGgo');
    await expect(parseAerialFile(text)).rejects.toMatchObject({ code: 'password-required' });
    await expect(parseAerialFile(text, 'wrong')).rejects.toMatchObject({ code: 'wrong-password' });
    expect((await parseAerialFile(text, 'correct horse')).scene.elements).toHaveLength(2);
  });

  test('tampering with the authenticated header is detected', async () => {
    const env = JSON.parse(await serializeAerialFile(doc, 'pw'));
    env.kdf.iterations = 100_000;
    await expect(parseAerialFile(JSON.stringify(env), 'pw')).rejects.toBeInstanceOf(AerialFileError);
  });

  test('untrusted assets are dropped, never loaded', async () => {
    const evil = JSON.stringify({
      format: 'aerial',
      version: 1,
      encrypted: false,
      scene: { elements: [] },
      assets: { ok: PNG, '../escape': PNG, html: 'data:text/html;base64,PHNjcmlwdD4=', js: 'javascript:alert(1)' },
    });
    expect(Object.keys((await parseAerialFile(evil)).assets)).toEqual(['ok']);
  });

  test('rejects non-Aerial and future files', async () => {
    await expect(parseAerialFile('{"hello":1}')).rejects.toMatchObject({ code: 'invalid' });
    await expect(parseAerialFile('not json')).rejects.toMatchObject({ code: 'invalid' });
    await expect(parseAerialFile('{"format":"aerial","version":99,"scene":{"elements":[]}}')).rejects.toMatchObject({ code: 'unsupported' });
  });

  test('file names are safe on every OS', () => {
    expect(aerialFileName('a/b:c*?')).toBe('a b c.aerial');
    expect(aerialFileName('   ')).toBe('Board.aerial');
  });
});
