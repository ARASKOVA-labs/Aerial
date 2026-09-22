#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = process.argv[2] || './public/aerial-engine';

let srcDir = path.resolve(__dirname, '../dist/aerial-engine');
if (!fs.existsSync(srcDir)) {
  srcDir = path.resolve(__dirname, '../public/aerial-engine');
}

if (!fs.existsSync(srcDir)) {
  console.error('[Aerial] Error: Could not find WASM engine assets in dist/aerial-engine or public/aerial-engine.');
  process.exit(1);
}

const destDir = path.resolve(process.cwd(), targetDir);

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(srcDir, destDir, { recursive: true });
console.log(`[Aerial] Copied WASM engine assets to: ${destDir}`);
