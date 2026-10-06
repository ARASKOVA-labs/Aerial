#!/usr/bin/env node
// Rasterises an SVG to PNG with headless Chrome (puppeteer, a dev dependency).
//   node scripts/render-svg.mjs <in.svg> <out.png> [size=1024] [background=transparent]
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const [input, output, sizeArg = '1024', bg = 'transparent'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: render-svg.mjs <in.svg> <out.png> [size] [background]');
  process.exit(1);
}
const size = parseInt(sizeArg, 10);
const svg = readFileSync(input, 'utf8');
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:${bg}"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`,
  );
  await page.screenshot({ path: output, omitBackground: bg === 'transparent', clip: { x: 0, y: 0, width: size, height: size } });
} finally {
  await browser.close();
}
console.info(`rendered ${output} (${size}px)`);
