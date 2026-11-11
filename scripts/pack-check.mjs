#!/usr/bin/env node
// Checks for the first-visit pack's loader and page handling (11-11 review),
// headless, against this checkout served on a local port. Each one failed
// before its fix on branch site-pack:
//   J  the TikTok handoff: a store tap in TikTok loads ?app=<ct> with the sheet; Safari on ?app= goes to the store
//   A  Android: hero Get notified tapped first, so no pack (and a waitlist
//      sheet built before the pack is never inert)
//   B  closing puts a scrolled page back at once (no smooth glide)
//   C  a ?pack=1 preview's store tap says ct=pack-preview
//   D  first visit: shown once, flag set, delay_ms real, nothing on reload
//   E  slow pictures and a dragging finger: never opens under the finger
//   G  no tap, at any moment, reaches the page or a hero clip behind the pack (11-11: a tap
//      on the pack sometimes brought up the video player on his iPhone)
//   I  the seen flag is set at the results or by X / Esc, never by a page leave mid-pack; one
//      back stays in the pack; closing drops our history entry
//   H  no video takes a tap or opens a player, pack or no pack; the reel still turns on a swipe
//   F  one tap opens the pack (11-11: TikTok's swipe took the tear); no drag is read in TikTok
//      and the Tap to open cue is gone within 200 ms of that tap, for good
//   K  the results: Get your free daily pack, and Open a new pack every day in Tracka, one line each at 375 px
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
    check('D  flag not set by showing alone', flag === null, String(flag));
    check('D  flag set by Esc', (await p.evaluate(() => localStorage.getItem('tv_pack_seen'))) === '1');
    check('D  web_pack_shown delay_ms is real', shown && shown.delay_ms >= 700 && shown.delay_ms !== 700, shown && shown.delay_ms);
    check('D  Esc sends web_pack_declined via esc', declined && declined.via === 'esc' && declined.step === 'sealed');
    await p.reload();
    await p.waitForTimeout(6000);
    check('D  nothing on reload', !(await p.$('.tp')));
    await b.close();
  }
  { // I: an accidental exit keeps the pack; the pull or the X settles it; one back stays in the pack
    const { b, p, events } = await open(chromium, IOS);
    const flag = () => p.evaluate(() => localStorage.getItem('tv_pack_seen'));
    await p.goto(BASE + 'privacy.html');
    await p.goto(BASE);
    await p.waitForSelector('.tp.on', { timeout: 12000 });
    await p.touchscreen.tap(195, 330);
    await p.waitForSelector('.tp-skip', { state: 'visible', timeout: 6000 });
    await p.goBack(); // a back swipe: our entry goes, the pack and the page stay
    await p.waitForTimeout(400);
    check('I  one back keeps the pack and the page', !!(await p.$('.tp.on')) && new URL(p.url()).pathname === '/', p.url());
    await p.reload(); // leaves mid-pack
    await p.waitForTimeout(300);
    const left = events.find(e => e.event === 'web_pack_left');
    check('I  leaving mid-pack sends web_pack_left with the step', left && left.step === 'reveal', left && left.step);
    check('I  flag unset after leaving mid-pack', (await flag()) === null);
    check('I  the pack comes back on the next visit', await p.waitForSelector('.tp.on', { timeout: 12000 }).then(() => true, () => false));
    await toResults(p);
    check('I  flag set at the results', (await flag()) === '1');
    await p.evaluate(() => localStorage.removeItem('tv_pack_seen'));
    await p.goto(BASE + 'privacy.html');
    await p.goto(BASE);
    await p.waitForSelector('.tp.on', { timeout: 12000 });
    await p.waitForTimeout(300);
    await p.click('.tp-x');
    await p.waitForFunction(() => !document.querySelector('.tp'), null, { timeout: 3000 });
    await p.waitForTimeout(500);
    check('I  flag set by the X', (await flag()) === '1');
    check('I  closing drops our history entry and stays on the page', new URL(p.url()).pathname === '/' && (await p.evaluate(() => !history.state)));
    await p.goBack();
    check('I  the next back is the page before', new URL(p.url()).pathname === '/privacy.html', p.url());
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
  { // J: the TikTok handoff. In TikTok a store tap loads ?app=<ct> with the sheet up; in Safari ?app= goes to the store, no pack
    const TT = IOS + ' musical_ly_36.0.0 BytedanceWebview/d8a21c6';
    const store = [];
    const watch = c => c.route('**/apps.apple.com/**', r => { store.push(r.request().url()); r.fulfill({ status: 204 }); }); // 204: the jump does not fire and the page stays
    {
      const { b, p, events } = await open(chromium, TT, watch);
      await p.goto(BASE, { waitUntil: 'commit' });
      await p.waitForSelector('.cta-row a.store', { state: 'attached' });
      await p.evaluate(() => document.querySelector('.cta-row a.store').click());
      await p.waitForURL(/\?app=home$/, { timeout: 5000 }).catch(() => {});
      check('J  TikTok: a store tap loads the page with ?app=', /\?app=home$/.test(p.url()), p.url());
      check('J  TikTok: the sheet is up on that load', await p.waitForSelector('.tt-sheet.on', { timeout: 4000 }).then(() => true, () => false));
      await p.waitForTimeout(2500);
      check('J  TikTok: no pack on the handoff load, nothing marked seen', !(await p.$('.tp')) && (await p.evaluate(() => localStorage.getItem('tv_pack_seen'))) === null);
      check('J  TikTok: no store navigation', !store.length, store.join(' '));
      const h = events.find(e => e.event === 'web_tiktok_handoff');
      check('J  TikTok: web_tiktok_handoff carries the ct', h && h.ct === 'home', h && h.ct);
      await b.close();
    }
    {
      const { b, p } = await open(chromium, TT, watch);
      await p.goto(BASE + '?pack=1');
      await p.waitForSelector('.tp.on', { timeout: 9000 });
      await toResults(p);
      await p.click('.tp-store');
      await p.waitForURL(/\?app=pack-preview$/, { timeout: 5000 }).catch(() => {});
      check('J  TikTok: the pack\'s store button hands off with its ct', /\?app=pack-preview$/.test(p.url()) && !store.length, p.url());
      check('J  TikTok: the sheet is up after the pack\'s handoff', await p.waitForSelector('.tt-sheet.on', { timeout: 4000 }).then(() => true, () => false));
      await b.close();
    }
    {
      const { b, p, events } = await open(chromium, IOS, watch);
      await p.goto(BASE + '?app=pack').catch(() => {});
      await p.waitForTimeout(2500);
      check('J  Safari: ?app=pack goes for the store with ct=pack', store.length >= 1 && /[?&]ct=pack(&|$)/.test(store[0]), store[0]);
      check('J  Safari: no pack, nothing marked seen', !(await p.$('.tp')) && (await p.evaluate(() => localStorage.getItem('tv_pack_seen'))) === null);
      check('J  Safari: a Get the app button stays if the jump does not fire', await p.evaluate(() => { const a = document.querySelector('.tt-sheet .tt-get'); return !!a && /ct=pack/.test(a.href) && a.getBoundingClientRect().height >= 44; }));
      const l = events.find(e => e.event === 'web_tiktok_handoff_landed');
      check('J  Safari: web_tiktok_handoff_landed carries the ct', l && l.ct === 'pack', l && l.ct);
      await b.close();
    }
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
        const cueMoves = await p.evaluate(() => { const c = document.querySelector('.tp-cue'); return !c || !c.querySelector('.tp-ring') ? ['no ring'] : c.getAnimations({ subtree: true }).flatMap(a => a.effect.getKeyframes().map(k => k.transform || '')).filter(t => /translate|matrix|skew|rotate/.test(t)); });
        check(`F  ${name}: the tap cue only pulses in place`, !cueMoves.length, cueMoves.join(' '));
        check(`F  ${name}: nothing sweeps across the sealed pack`, drift < 0.5 && !(await p.$('.tp-sheen')), drift.toFixed(2) + ' px');
      }
      // The cue goes the instant the pack is touched (a real visit, 11-11: it stayed up while the pack tore and fell)
      await p.evaluate(() => {
        window.__cueGone = new Promise(res => document.addEventListener('pointerdown', () => {
          const t0 = performance.now(), cue = document.querySelector('.tp-cue');
          (function poll() {
            const cs = getComputedStyle(cue);
            if (cs.visibility === 'hidden' || +cs.opacity < 0.02) return res(performance.now() - t0);
            if (performance.now() - t0 > 2000) return res(Infinity);
            requestAnimationFrame(poll);
          })();
        }, { capture: true, once: true }));
      });
      await p.touchscreen.tap(195, 330);
      const cueMs = await p.evaluate(() => window.__cueGone);
      check(`F  ${name}: the cue is gone within 200 ms of the tap`, cueMs <= 200, Math.round(cueMs) + ' ms');
      check(`F  ${name}: one tap opens the pack`, await p.waitForSelector('.tp-skip', { state: 'visible', timeout: 4000 }).then(() => true, () => false));
      check(`F  ${name}: the cue never comes back`, await p.evaluate(() => { const c = document.querySelector('.tp-cue'); return !c || getComputedStyle(c).visibility === 'hidden'; }));
      await b.close();
    }
  }
  { // G: while the pack is up no tap reaches the page behind, and no clip behind plays or goes full screen
    const { b, p } = await open(webkit, IOS);
    await p.addInitScript(() => {
      window.__leaks = [];
      const up = () => !!document.querySelector('.tp');
      const name = n => (n && n.tagName ? n.tagName.toLowerCase() + (n.className && n.className.baseVal === undefined ? '.' + n.className : '') : String(n));
      for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'])
        document.addEventListener(t, e => { if (up() && !(e.target.closest && e.target.closest('.tp, .tp-tick'))) window.__leaks.push(t + ' on ' + name(e.target)); }, true);
      for (const t of ['play', 'playing', 'webkitbeginfullscreen', 'webkitpresentationmodechanged'])
        document.addEventListener(t, e => { if (up() && e.target.tagName === 'VIDEO') window.__leaks.push(t + ' on video'); }, true);
      for (const t of ['fullscreenchange', 'webkitfullscreenchange'])
        document.addEventListener(t, () => { if (document.fullscreenElement || document.webkitFullscreenElement) window.__leaks.push(t); }, true);
    });
    await p.goto(BASE + '?pack=1');
    const probe = when => p.evaluate(w => {
      const t = document.elementFromPoint(195, 330);
      if (!t || !t.closest('.tp')) window.__leaks.push(w + ': the page is on top at the pack');
      for (const v of document.querySelectorAll('video')) if (!v.paused || v.webkitDisplayingFullscreen) window.__leaks.push(w + ': a clip behind is playing');
      for (const c of document.body.children) if (c.tagName !== 'SCRIPT' && !c.matches('.tp, .tt-sheet, .aw-scrim') && (!c.inert || getComputedStyle(c).pointerEvents !== 'none')) window.__leaks.push(w + ': ' + c.tagName.toLowerCase() + ' can take a tap');
    }, when);
    const tapAt = async when => { await probe(when); await p.touchscreen.tap(195, 330); };
    await p.waitForSelector('.tp', { state: 'attached', timeout: 9000 });
    await tapAt('entrance start');
    await p.waitForTimeout(300); await tapAt('0.3 s');
    await p.waitForTimeout(500); await tapAt('0.8 s');
    await p.waitForSelector('.tp-skip', { state: 'visible', timeout: 6000 });
    await p.waitForTimeout(900); await tapAt('after open');
    await p.waitForTimeout(2500); await tapAt('mid cards'); // long enough for the reel behind to want its next clip
    await p.click('.tp-skip');
    await p.waitForSelector('.tp-store', { timeout: 5000 });
    await p.waitForTimeout(400); await tapAt('results');
    await p.waitForTimeout(300);
    const leaks = await p.evaluate(() => window.__leaks);
    check('G  no tap reaches the page or a clip behind the pack', !leaks.length, leaks.slice(0, 4).join('; '));
    await p.click('.tp-x');
    await p.waitForFunction(() => !document.querySelector('.tp'), null, { timeout: 3000 });
    const back = await p.evaluate(() => Array.prototype.every.call(document.body.children, c => !c.inert && getComputedStyle(c).pointerEvents !== 'none'));
    check('G  the page takes taps again after close', back);
    await b.close();
  }
  { // H: no pack. A tap on a hero clip never reaches the video and never opens a player; a swipe over one still turns the reel
    const { b, p } = await open(webkit, IOS);
    await p.addInitScript(() => {
      window.__vid = [];
      for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click'])
        document.addEventListener(t, e => { if (e.target.tagName === 'VIDEO') window.__vid.push(t + ' on video'); }, true);
      for (const t of ['webkitbeginfullscreen', 'webkitpresentationmodechanged', 'fullscreenchange', 'webkitfullscreenchange'])
        document.addEventListener(t, e => { if (e.target.tagName === 'VIDEO' || document.fullscreenElement || document.webkitFullscreenElement) window.__vid.push(t); }, true);
    });
    await p.goto(BASE + '?nopack');
    await p.waitForTimeout(1200);
    const vids = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('video'), v => {
      const r = v.getBoundingClientRect();
      return { x: Math.min(innerWidth - 6, Math.max(6, r.left + r.width / 2)), y: Math.min(innerHeight - 6, Math.max(6, r.top + r.height / 2)), pe: getComputedStyle(v).pointerEvents, controls: v.controls, inline: v.playsInline || v.hasAttribute('playsinline') };
    }));
    check('H  every video ignores taps, has no controls, plays inline', vids.length >= 3 && vids.every(v => v.pe === 'none' && !v.controls && v.inline), JSON.stringify(vids.map(v => v.pe)));
    for (const v of vids) { await p.touchscreen.tap(v.x, v.y); await p.waitForTimeout(900); }
    const bad = await p.evaluate(() => window.__vid.concat(Array.prototype.filter.call(document.querySelectorAll('video'), v => v.webkitDisplayingFullscreen || (v.webkitPresentationMode && v.webkitPresentationMode !== 'inline')).map(() => 'a video left the page')));
    check('H  a tap on a video opens no player', !bad.length, bad.slice(0, 4).join('; '));
    // the hero is a reel turned by a sideways drag (site.js), not a scroller: a drag across the front clip still turns it
    await p.waitForFunction(() => !document.querySelector('.hero-stage .phone').getAnimations().length, null, { timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const front = () => p.evaluate(() => { let best = null, z = -1; for (const ph of document.querySelectorAll('.hero-stage .phone')) { const n = +ph.style.zIndex; if (n > z) { z = n; best = ph.querySelector('img').getAttribute('src'); } } return best; });
    const before = await front();
    const box = await p.evaluate(() => { const r = document.querySelector('.hero-stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(innerHeight - 40, r.top + r.height / 2) }; });
    await p.mouse.move(box.x + 70, box.y); await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x + 70 - i * 20, box.y); await p.waitForTimeout(16); }
    await p.mouse.up();
    await p.waitForTimeout(1200);
    const after = await front();
    check('H  a swipe over the clips still turns the reel', before && after && before !== after, before + ' -> ' + after);
    await b.close();
  }
  { // K: the results say there is a free pack every day, each line on one line at 375 px; the store link is untouched
    for (const [name, engine, ua] of [['Safari', webkit, IOS], ['Android', chromium, AND]]) {
      const { b, p } = await open(engine, ua);
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(BASE);
      await p.waitForSelector('.tp.on', { timeout: 9000 });
      await toResults(p);
      const r = await p.evaluate(() => {
        const a = document.querySelector('.tp-store'), d = document.querySelector('.tp-daily'), s = a.querySelector('span');
        const one = e => { const rs = e.getClientRects(); return rs.length === 1 && rs[0].height < 30; };
        const inside = e => { const q = e.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth; };
        return { btn: s.textContent, line: d && d.textContent, apple: !!a.querySelector('svg use[href="#i-apple"]'), href: a.getAttribute('href'),
          oneLine: one(s) && !!d && one(d), fits: inside(s) && !!d && inside(d) && s.scrollWidth <= s.clientWidth + 1 && d.scrollWidth <= d.clientWidth + 1,
          order: !!d && document.querySelector('.tp-total').getBoundingClientRect().bottom <= d.getBoundingClientRect().top && d.getBoundingClientRect().bottom <= a.getBoundingClientRect().top };
      });
      check(`K  ${name}: the button reads Get your free daily pack, Apple glyph kept`, r.btn === 'Get your free daily pack' && r.apple, r.btn);
      check(`K  ${name}: the line under Pack value reads Open a new pack every day in Tracka`, r.line === 'Open a new pack every day in Tracka' && r.order, r.line);
      check(`K  ${name}: both sit on one line each inside 375 px`, r.oneLine && r.fits);
      check(`K  ${name}: the store link still says ct=pack`, /ct=pack(&|$)/.test(r.href || ''), r.href);
      await b.close();
    }
  }
} finally {
  server.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
