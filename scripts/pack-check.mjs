#!/usr/bin/env node
// Checks for the first-visit pack's loader and page handling (11-11 review),
// headless, against this checkout served on a local port. Each one failed
// before its fix on branch site-pack:
//   A  Android: hero Get notified tapped first, so no pack (and a waitlist
//      sheet built before the pack is never inert)
//   B  closing puts a scrolled page back at once (no smooth glide)
//   C  a ?pack=1 preview's store tap says ct=pack-preview
//   D  first visit: shown once, flag set, delay_ms real, nothing on reload
//   E  slow pictures and a dragging finger: never opens under the finger
//   F  one tap opens the pack (11-11: TikTok's swipe took the tear); no drag is read in TikTok
// Needs Playwright with Chromium and WebKit. Run it from a folder where
// `playwright` is installed (it is loaded from the current folder):
//   node ~/projects/tracka-site-pack/scripts/pack-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const { chromium, webkit } = createRequire(join(process.cwd(), 'x.js'))('playwright');
const SITE = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try { const body = await readFile(join(SITE, path)); res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

let failed = 0;
function check(name, ok, detail) { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }

async function open(engine, ua, setup) {
  const b = await engine.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, userAgent: ua });
  const events = [];
  // Chromium only: WebKit's sendBeacon skips Playwright's routing
  await c.route('**/us.i.posthog.com/**', r => { try { const j = JSON.parse(r.request().postData()); events.push({ event: j.event, ...j.properties }); } catch {} r.fulfill({ status: 200, body: '1' }); });
  await c.route('**/functions/v1/**', r => r.fulfill({ status: 200, body: '{}' }));
  if (setup) await setup(c);
  const p = await c.newPage();
  await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  p.on('pageerror', e => check('no page errors', false, e.message));
  return { b, c, p, events };
}
async function toResults(p) {
  await p.keyboard.press('Enter');
  await p.waitForSelector('.tp-skip', { state: 'visible', timeout: 8000 });
  await p.click('.tp-skip');
  await p.waitForSelector('.tp-store', { timeout: 5000 });
  await p.waitForTimeout(400);
}

try {
  { // A
    const { b, p } = await open(chromium, AND);
    await p.goto(BASE, { waitUntil: 'commit' });
    // Tap before the pack's 0.7 s (DOMContentLoaded + 700 ms): as soon as the button exists.
    await p.waitForSelector('.cta-row a.store', { state: 'attached' });
    await p.evaluate(() => document.querySelector('.cta-row a.store').click());
    await p.waitForSelector('.aw-scrim.on');
    await p.click('.aw-close');
    const opened = await p.waitForSelector('.tp', { timeout: 8000 }).then(() => true, () => false);
    check('A  Android: no pack after the hero Get notified', !opened);
    await b.close();
  }
  { // A, the sheet itself: built before the pack, then shown over it
    const { b, p } = await open(chromium, AND);
    await p.goto(BASE + '?pack=1');
    await p.evaluate(() => { document.querySelector('.nav-cta, .close-pill').click(); });
    await p.waitForSelector('.aw-scrim.on');
    await p.click('.aw-close');
    await p.waitForSelector('.tp.on', { timeout: 9000 });
    await toResults(p);
    await p.click('.tp-store');
    await p.waitForSelector('.aw-scrim.on');
    const closes = await p.click('.aw-close', { timeout: 2000 }).then(() => p.waitForFunction(() => !document.querySelector('.aw-scrim.on'), null, { timeout: 2000 })).then(() => true, () => false);
    check('A  Android: the waitlist sheet over the pack closes', closes);
    await b.close();
  }
  { // B
    const { b, p } = await open(webkit, IOS);
    await p.goto(BASE + '?pack=1');
    await p.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }));
    await p.waitForSelector('.tp.on', { timeout: 9000 });
    await p.waitForTimeout(500);
    await p.click('.tp-x');
    const trace = await p.evaluate(async () => { const out = []; const t0 = performance.now(); while (performance.now() - t0 < 700) { out.push(Math.round(window.scrollY)); await new Promise(r => requestAnimationFrame(r)); } return out; });
    const moving = trace.filter(v => v !== 0 && v !== 1400);
    check('B  close puts the page back at once', trace[trace.length - 1] === 1400 && !moving.length, trace.join(' '));
    await b.close();
  }
  { // C
    const { b, p, events } = await open(chromium, IOS);
    await p.goto(BASE + '?pack=1');
    await p.waitForSelector('.tp.on', { timeout: 9000 });
    await toResults(p);
    await p.evaluate(() => document.querySelector('.tp-store').addEventListener('click', e => e.preventDefault()));
    await p.click('.tp-store');
    await p.waitForTimeout(300);
    const taps = events.filter(e => e.event === 'web_store_tap').map(e => e.ct);
    check('C  preview store tap is ct=pack-preview', taps.length === 1 && taps[0] === 'pack-preview', taps.join(','));
    check('C  preview sends no web_pack_* events', !events.some(e => /^web_pack_/.test(e.event)));
    await b.close();
  }
  { // D
    const { b, p, events } = await open(chromium, IOS);
    await p.goto(BASE);
    await p.waitForSelector('.tp.on', { timeout: 12000 });
    const flag = await p.evaluate(() => localStorage.getItem('tv_pack_seen'));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    const shown = events.find(e => e.event === 'web_pack_shown');
    const declined = events.find(e => e.event === 'web_pack_declined');
    check('D  flag set when shown', flag === '1');
    check('D  web_pack_shown delay_ms is real', shown && shown.delay_ms >= 700 && shown.delay_ms !== 700, shown && shown.delay_ms);
    check('D  Esc sends web_pack_declined via esc', declined && declined.via === 'esc' && declined.step === 'sealed');
    await p.reload();
    await p.waitForTimeout(6000);
    check('D  nothing on reload', !(await p.$('.tp')));
    await b.close();
  }
  { // E
    const { b, c, p } = await open(chromium, IOS, c => c.route('**/cards/pack/**', async r => { await new Promise(res => setTimeout(res, 2500)); r.continue(); }));
    await p.goto(BASE);
    await p.waitForFunction(() => !!window.tvPackRun, null, { timeout: 12000 });
    const cdp = await c.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] });
    let under = false;
    for (let i = 0; i < 60; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 600 - (i % 20) * 5 }] });
      if (await p.$('.tp')) { under = true; break; }
      await p.waitForTimeout(80);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('E  never opens under a dragging finger', !under);
    check('E  opens once the finger lifts', await p.waitForSelector('.tp.on', { timeout: 6000 }).then(() => true, () => false));
    await b.close();
  }
  { // F: a tap opens it; inside TikTok a sideways drag is never read as a tear
    const TT = IOS + ' musical_ly_36.0.0 BytedanceWebview/d8a21c6';
    for (const [name, engine, ua] of [['Safari', webkit, IOS], ['TikTok', chromium, TT]]) {
      const { b, c, p } = await open(engine, ua);
      await p.goto(BASE + '?pack=1');
      await p.waitForSelector('.tp.on', { timeout: 9000 });
      check(`F  ${name}: the cue says Tap to open`, (await p.textContent('.tp-cue')) === 'Tap to open');
      if (name === 'TikTok') {
        const cdp = await c.newCDPSession(p);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 260 }] });
        for (let x = 100; x <= 300; x += 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 260 }] });
        await p.waitForTimeout(300);
        check('F  TikTok: a drag across the pack tears nothing', !(await p.$('.tp-torn')));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await p.waitForTimeout(100);
      }
      { // nothing on the sealed pack moves sideways (a sweeping shine read as "swipe right", 11-11)
        await p.waitForTimeout(1300);
        const drift = await p.evaluate(async () => {
          const seen = new Map(); let worst = 0; const t0 = performance.now();
          while (performance.now() - t0 < 4200) {
            for (const n of document.querySelectorAll('.tp-stage *')) {
              const x = new DOMMatrixReadOnly(getComputedStyle(n).transform).e;
              if (!seen.has(n)) seen.set(n, x);
              worst = Math.max(worst, Math.abs(x - seen.get(n)));
            }
            await new Promise(r => requestAnimationFrame(r));
          }
          return worst;
        });
        check(`F  ${name}: nothing sweeps across the sealed pack`, drift < 0.5 && !(await p.$('.tp-sheen')), drift.toFixed(2) + ' px');
      }
      await p.touchscreen.tap(195, 330);
      check(`F  ${name}: one tap opens the pack`, await p.waitForSelector('.tp-skip', { state: 'visible', timeout: 4000 }).then(() => true, () => false));
      await b.close();
    }
  }
} finally {
  server.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
