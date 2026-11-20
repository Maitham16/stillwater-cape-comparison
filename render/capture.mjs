import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const id = process.argv[2];
const presets = {
  'sol-low': ['[data-light="1"]', '[data-light="2"]'],
  'sol-medium': ['1', '2'],
  'sol-xhigh': ['[data-light="dawn"]', '[data-light="night"]'],
  'astra-xhigh': ['[data-mode="0"]', '[data-mode="2"]'],
};
if (!Object.hasOwn(presets, id)) throw Error('Pass a scene ID');
const dir = resolve('frames', id);
await mkdir(dir, {recursive: true});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  // Advance each scene's native animation callbacks at the same elapsed times.
  // Keep async texture decoding, timeout-based startup and painting in the browser.
  await page.addInitScript(() => {
    let now = 1000;
    let handle = 0;
    const queued = new Map();
    Object.defineProperty(performance, 'now', {value: () => now});
    window.requestAnimationFrame = callback => { queued.set(++handle, callback); return handle; };
    window.cancelAnimationFrame = key => queued.delete(key);
    window.advanceCaptureFrame = delta => {
      now += delta;
      const batch = [...queued.values()];
      queued.clear();
      batch.forEach(callback => callback(now));
      return batch.length;
    };
  });
  await page.goto(pathToFileURL(resolve('scenes', id + '.html')).href);
  const ready = () => page.evaluate(id => {
    if (id === 'sol-low') return document.querySelector('#opening').hidden;
    if (id === 'sol-xhigh') return document.querySelector('#fallback').hidden &&
      document.querySelector('#scene').width === innerWidth && !!document.querySelector('#scene').getContext('webgl2');
    return document.body.classList.contains('scene-ready');
  }, id);
  for (let attempt = 0; attempt < 240; attempt++) {
    await page.evaluate(() => window.advanceCaptureFrame(0));
    if (await ready()) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!await ready()) throw Error('Rendering did not start: ' + (await page.locator('body').innerText()).slice(-400));
  const backend = await page.evaluate(() => {
    if (!document.querySelector('#cape + canvas')?.hidden && document.querySelector('#cape')) return 'Canvas 2D fallback';
    return 'WebGL';
  });
  console.log(id, await browser.version(), backend);
  await writeFile(dir + '/runtime.json', JSON.stringify({id, browser: await browser.version(), backend}));
  const fps = 15, segmentFrames = 5 * fps;
  for (let i = 0; i < segmentFrames * 3; i++) {
    if (i === segmentFrames || i === 2 * segmentFrames) {
      const preset = presets[id][i / segmentFrames - 1];
      if (id === 'sol-medium') await page.locator('select').evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }, preset);
      else await page.locator(preset).evaluate(button => button.click());
    }
    await page.evaluate(dt => window.advanceCaptureFrame(dt), 1000 / fps);
    if (errors.length || !await ready()) throw Error('Scene stopped during capture: ' + errors.join(', '));
    await page.screenshot({path: dir + '/' + String(i).padStart(4, '0') + '.jpg', type: 'jpeg', quality: 90, timeout: 60000});
    if (i % segmentFrames === 0) console.log('Frame', i);
  }
} finally {
  await browser.close();
}
