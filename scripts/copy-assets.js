#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = process.argv[2] || './public/aerial-engine';

const srcDir = path.resolve(__dirname, '../public/aerial-engine');
const destDir = path.resolve(process.cwd(), targetDir);

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(srcDir, destDir, { recursive: true });
console.log(`[Aerial] Copied WASM engine assets to: ${destDir}`);
