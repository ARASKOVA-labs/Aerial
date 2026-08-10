const fs = require('fs');
const fontB64 = fs.readFileSync('rephen.base64', 'utf8').replace(/\s+/g, '');

const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <defs>
    <style>
      @font-face {
        font-family: 'Rephen';
        src: url(data:font/truetype;charset=utf-8;base64,${fontB64}) format('truetype');
      }
      .bg { fill: #ffffff; }
      .text { fill: #000000; }
      @media (prefers-color-scheme: dark) {
        .bg { fill: #0a0a0f; }
        .text { fill: #ffffff; }
      }
    </style>
  </defs>
  <rect width="32" height="32" rx="7" class="bg"/>
  <text x="16" y="24" font-family="Rephen, serif" font-size="22" text-anchor="middle" class="text">L</text>
</svg>`;

fs.writeFileSync('public/favicon.svg', svgFavicon);
console.log('Created public/favicon.svg');

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @font-face {
            font-family: 'Rephen';
            src: url(data:font/truetype;charset=utf-8;base64,${fontB64}) format('truetype');
          }
          body {
            margin: 0;
            padding: 0;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 1024px;
            height: 1024px;
          }
          .icon {
            width: 1024px;
            height: 1024px;
            background-color: #0a0a0f;
            border-radius: 224px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-family: 'Rephen', serif;
            font-size: 704px;
            line-height: 1;
            padding-top: 100px;
          }
        </style>
      </head>
      <body>
        <div class="icon">L</div>
      </body>
    </html>
  `;
  
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluateHandle('document.fonts.ready');
  
  await page.screenshot({ path: 'app_icon.png', omitBackground: true });
  await browser.close();
  console.log('Created app_icon.png');
})();
