#!/usr/bin/env node
// Checks for the first-visit pack's loader and page handling (11-11 review),
// headless, against this checkout served on a local port. Each one failed
// before its fix on branch site-pack:
//   J  TikTok (11-25, the hold): a store tap opens the hold sheet in place, its button the store link with the
//      tapped ct; a tap on that button shakes it and goes nowhere; Safari on an old ?app= address still goes to the store
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
//   K  the results (his pick 11-16): Tracka's row with the foil Download on the App Store button, ct=pack, inside 375 px
//      (Android: Coming to Android, Notify me, no Apple mark)
//   M  a creator page (/go/<code>/) hands off from TikTok to the store like the site (11-24)
//   L  a close at the results leaves the white bar: ct=packbar, web_pack_bar_shown once, the tap counted; Android's
//      waitlist; TikTok hands off ?app=packbar and Safari on it goes to the store with ct=packbar
//   N  tracking (11-25): every event carries entry_source and entry_path, kept for the whole tab; a TikTok hold sends
//      web_tiktok_hold, and TikTok leaving after it sends web_tiktok_hold_left + web_app_store_opened via hold; an
//      iPhone Safari tap, a /go redirect and the old handoff send web_app_store_opened; WebKit sends nothing real
//   P-V  public binder pages (11-26), /@<handle>/<slug> on 404.html with the public-binder function routed to fixtures:
//      P renders (name, stat line, 9 pockets, flipper, swipe, keys, lightbox); Q the bar's ct and creator code (Android:
//      the waitlist); R TikTok opens the hold sheet with the creator's code; S a miss is the dark state with the bar;
//      T any other unknown address is still the plain 404; U user text stays text; V values only when sent
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
  catch {
    // GitHub Pages answers a page address it doesn't have with 404.html (status 404); the binder pages live on that
    if (!extname(path) || extname(path) === '.html') { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(await readFile(join(SITE, '404.html'))); }
    else { res.writeHead(404); res.end(); }
  }
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
  // WebKit's sendBeacon skips Playwright's routing, so a WebKit check used to reach the real PostHog (host
  // 127.0.0.1 rows, found 11-25). sendBeacon says no here, track.js falls back to fetch, and the route catches
  // that in every engine: nothing from a check leaves this machine.
  await c.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'sendBeacon', { value: () => false, configurable: true }); } catch {} });
  await c.route('**/us.i.posthog.com/**', r => { try { const j = JSON.parse(r.request().postData()); events.push({ event: j.event, _id: j.distinct_id, ...j.properties }); } catch {} r.fulfill({ status: 200, body: '1', headers: { 'Access-Control-Allow-Origin': '*' } }); });
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
  await p.waitForSelector('.tp-app', { timeout: 5000 });
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
    await p.click('.tp-app');
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
    await p.evaluate(() => document.querySelector('.tp-app').addEventListener('click', e => e.preventDefault()));
    await p.click('.tp-app');
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
    let handoffUrl = '', visitId = '';
    const watch = c => c.route('**/apps.apple.com/**', r => { store.push(r.request().url()); r.fulfill({ status: 204 }); }); // 204: the jump does not fire and the page stays
    {
      const { b, p, events } = await open(chromium, TT, watch);
      await p.goto(BASE, { waitUntil: 'commit' });
      await p.waitForSelector('.cta-row a.store', { state: 'attached' });
      await p.waitForSelector('.tt-bar', { timeout: 4000 }).catch(() => {});
      check('J  TikTok: the bar says press and hold', /Press and hold/.test(await p.textContent('.tt-bar').catch(() => '')));
      const before = p.url();
      await p.evaluate(() => document.querySelector('.cta-row a.store').click());
      check('J  TikTok: a store tap opens the hold sheet', await p.waitForSelector('.tt-hold.on', { timeout: 3000 }).then(() => true, () => false));
      check('J  TikTok: no reload, no navigation', p.url() === before, p.url());
      const go = await p.evaluate(() => { const a = document.querySelector('.tt-hold .tt-go'); const r = a.getBoundingClientRect(); return { href: a.href, h: r.height, w: r.width, callout: getComputedStyle(a).webkitTouchCallout, text: a.textContent.trim() }; });
      check('J  TikTok: the held button is the store link with ct=home', /^https:\/\/apps\.apple\.com\/.*[?&]ct=home(&|$)/.test(go.href), go.href);
      check('J  TikTok: the button is big, says Tap and hold, and keeps the iOS link menu', go.h >= 56 && go.w >= 300 && go.text === 'Tap and hold to open' && go.callout !== 'none', JSON.stringify(go));
      await p.evaluate(() => document.querySelector('.tt-hold .tt-go').click());
      await p.waitForTimeout(500);
      check('J  TikTok: a tap on the held button shakes, goes nowhere', p.url() === before && !store.length && await p.$('.tt-go.tt-shake') !== null, p.url());
      const shown = events.find(e => e.event === 'web_tiktok_sheet_shown');
      check('J  TikTok: web_tiktok_sheet_shown carries the ct', shown && shown.ct === 'home', shown && shown.ct);
      check('J  TikTok: web_tiktok_hold_tapped counted', events.some(e => e.event === 'web_tiktok_hold_tapped'));
      await p.click('.tt-x');
      await p.waitForTimeout(400);
      check('J  TikTok: Close hides the sheet', await p.evaluate(() => document.querySelector('.tt-hold').hidden));
      check('J  TikTok: no store navigation', !store.length, store.join(' '));
      await b.close();
    }
    { // an old handoff address opened in TikTok: the hold sheet on load, with its ct; one visit id kept
      const { b, p, events } = await open(chromium, TT, watch);
      await p.goto(BASE + '?app=home&v=web-abc123');
      check('J  TikTok: an old ?app= address opens the hold sheet', await p.waitForSelector('.tt-hold.on', { timeout: 4000 }).then(() => true, () => false));
      check('J  TikTok: no pack on it, nothing marked seen', !(await p.$('.tp')) && (await p.evaluate(() => localStorage.getItem('tv_pack_seen'))) === null);
      handoffUrl = BASE + '?app=home&v=web-abc123';
      visitId = 'web-abc123';
      await b.close();
    }
    { // 11-17: Open in browser hands Safari the handoff address; Safari keeps the same id
      const { b, p, events } = await open(chromium, IOS, watch);
      await p.goto(handoffUrl).catch(() => {});
      await p.waitForTimeout(2500);
      const l = events.find(e => e.event === 'web_tiktok_handoff_landed');
      check('J  Safari: the handoff address keeps the TikTok visit id', l && l._id === visitId && events.every(e => e._id === visitId), l && l._id);
      store.length = 0;
      await b.close();
    }
    {
      const { b, p } = await open(chromium, TT, watch);
      await p.goto(BASE + '?pack=1');
      await p.waitForSelector('.tp.on', { timeout: 9000 });
      await toResults(p);
      const before = p.url();
      await p.click('.tp-app');
      check('J  TikTok: the pack\'s store button opens the hold sheet over the pack', await p.waitForSelector('.tt-hold.on', { timeout: 3000 }).then(() => true, () => false) && p.url() === before && !store.length, p.url());
      check('J  TikTok: the held button carries the pack\'s ct', /[?&]ct=pack-preview(&|$)/.test(await p.evaluate(() => document.querySelector('.tt-go').href)));
      check('J  TikTok: the sheet sits above the pack', await p.evaluate(() => { const r = document.querySelector('.tt-go').getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el && !!el.closest('.tt-go'); }));
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
  { // M (11-24): a creator page hands off like the site. In TikTok its badge loads ?app=<its ct> with the code
    // sheet; Safari on that address goes to the store with the creator's ct; a plain Safari visit stays on the page.
    const TT = IOS + ' musical_ly_36.0.0 BytedanceWebview/d8a21c6';
    const GO = BASE + 'go/faithlovesfish/';
    const store = [];
    const watch = c => c.route('**/apps.apple.com/**', r => { store.push(r.request().url()); r.fulfill({ status: 204 }); });
    let handoff = '';
    {
      const { b, p } = await open(chromium, TT, watch);
      await p.goto(GO);
      await p.waitForSelector('a.badge', { state: 'attached' });
      check('M  TikTok: the line under the badge says press and hold', /Press and hold/.test(await p.textContent('#hint')) && await p.isVisible('#hint'));
      await p.evaluate(() => document.querySelector('a.badge').click());
      check('M  TikTok: a badge tap opens the hold sheet with the code', await p.waitForSelector('.tt-hold.on .tt-code b', { timeout: 3000 }).then(() => true, () => false) && /\/go\/faithlovesfish\/$/.test(p.url()), p.url());
      check('M  TikTok: the code on the sheet is the creator\'s', (await p.textContent('.tt-hold .tt-code b')).trim() === 'FAITHLOVESFISH');
      check('M  TikTok: the held button carries the creator ct', /[?&]ct=c-FAITHLOVESFISH(&|$)/.test(await p.evaluate(() => document.querySelector('.tt-go').href)));
      check('M  TikTok: no store navigation', !store.length, store.join(' '));
      handoff = GO + '?app=c-FAITHLOVESFISH&v=web-abc123';
      await b.close();
    }
    {
      const { b, p } = await open(chromium, IOS, watch);
      await p.goto(handoff).catch(() => {});
      await p.waitForTimeout(2500);
      check('M  Safari: the handoff address goes to the store with the creator ct', store.length >= 1 && /[?&]ct=c-FAITHLOVESFISH(&|$)/.test(store[0]), store[0]);
      check('M  Safari: the code stays on screen with Get the app', await p.evaluate(() => { const b = document.querySelector('.tt-sheet .tt-code b'); const a = document.querySelector('.tt-sheet .tt-get'); return !!b && b.textContent.trim().length > 0 && !!a && /ct=c-FAITHLOVESFISH/.test(a.href); }));
      await b.close();
    }
    {
      store.length = 0;
      const { b, p } = await open(chromium, IOS, watch);
      await p.goto(GO).catch(() => {});
      await p.waitForTimeout(2000);
      check('M  Safari: a plain visit stays on the creator page', !store.length && new URL(p.url()).pathname === '/go/faithlovesfish/', store.join(' '));
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
    await p.waitForSelector('.tp-app', { timeout: 5000 });
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
  { // K: the results end on Tracka's row; the button is the homepage's App Store button in foil; the store link is untouched
    for (const [name, engine, ua] of [['Safari', webkit, IOS], ['Android', chromium, AND]]) {
      const { b, p } = await open(engine, ua);
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(BASE);
      await p.waitForSelector('.tp.on', { timeout: 9000 });
      await toResults(p);
      const r = await p.evaluate(() => {
        const a = document.querySelector('.tp-app'), badge = a.querySelector('.tp-badge'), get = a.querySelector('.tp-get');
        const inside = e => { const q = e.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth; };
        const btn = badge || get;
        return { title: a.querySelector('.tp-app-t b').textContent, sub: a.querySelector('.tp-app-t span').textContent,
          badge: badge && badge.querySelector('small').textContent + ' ' + badge.querySelector('b').textContent, get: get && get.textContent, apple: !!a.querySelector('svg use[href="#i-apple"]'),
          foil: badge ? getComputedStyle(badge).backgroundImage : '', href: a.getAttribute('href'), fits: inside(a) && inside(btn) && btn.getClientRects().length === 1,
          old: !!document.querySelector('.tp-store') };
      });
      if (/Android/i.test(name)) check(`K  ${name}: Tracka, Coming to Android, Notify me, no Apple mark`, r.title === 'Tracka' && r.sub === 'Coming to Android' && r.get === 'Notify me' && !r.apple && !r.badge, JSON.stringify(r));
      else {
        check(`K  ${name}: Tracka, Free on iPhone, Download on the App Store with the Apple mark`, r.title === 'Tracka' && r.sub === 'Free on iPhone' && r.badge === 'Download on the App Store' && r.apple, JSON.stringify(r));
        check(`K  ${name}: the button wears the header pill's foil`, /gradient/.test(r.foil), r.foil.slice(0, 40));
      }
      check(`K  ${name}: the row and its button sit inside 375 px`, r.fits);
      check(`K  ${name}: no old teal button`, !r.old);
      check(`K  ${name}: the store link says ct=pack`, /ct=pack(&|$)/.test(r.href || ''), r.href);
      await b.close();
    }
  }
  { // L: the bar after a close at the results (a real first visit, not a preview)
    const storeL = [];
    const watchL = c => c.route('**/apps.apple.com/**', r => { storeL.push(r.request().url()); r.fulfill({ status: 204 }); });
    const toBar = async p => {
      await p.goto(BASE);
      await p.waitForSelector('.tp.on', { timeout: 12000 });
      await toResults(p);
      await p.click('.tp-x');
      await p.waitForFunction(() => !document.querySelector('.tp') && document.querySelector('.tp-bar.on'), null, { timeout: 4000 });
      await p.waitForTimeout(600);
    };
    {
      const { b, p, events } = await open(chromium, IOS, watchL);
      await toBar(p);
      const r = await p.evaluate(() => { const a = document.querySelector('.tp-bar a'), q = a.getBoundingClientRect(); return { href: a.getAttribute('href'), badge: !!a.querySelector('.tp-badge:not(.tp-badge-foil)'), bg: getComputedStyle(a).backgroundColor, fits: q.left >= 0 && q.right <= innerWidth && q.bottom <= innerHeight }; });
      const shown = events.filter(e => e.event === 'web_pack_bar_shown');
      const finished = events.find(e => e.event === 'web_pack_finished');
      check('L  Safari: the white bar holds the black App Store button, on screen', r.badge && r.bg === 'rgb(255, 255, 255)' && r.fits, JSON.stringify(r));
      check('L  Safari: the bar link says ct=packbar', /ct=packbar(&|$)/.test(r.href || ''), r.href);
      check('L  Safari: web_pack_bar_shown once, with the card and its tier', shown.length === 1 && /^me6-/.test(shown[0].card) && shown[0].tier === (finished && finished.tier) && shown[0].os === 'ios' && shown[0].set === 'me6', JSON.stringify(shown));
      await p.click('.tp-bar a');
      await p.waitForTimeout(500);
      const taps = events.filter(e => e.event === 'web_store_tap').map(e => e.ct);
      check('L  Safari: the bar tap is counted with ct=packbar', taps.length === 1 && taps[0] === 'packbar', taps.join(','));
      check('L  Safari: the bar tap goes to the store with ct=packbar', storeL.some(u => /ct=packbar&/.test(u)), storeL.join(' '));
      check('L  Safari: still one web_pack_bar_shown', events.filter(e => e.event === 'web_pack_bar_shown').length === 1);
      await b.close();
    }
    {
      const { b, p, events } = await open(chromium, IOS);
      await p.goto(BASE);
      await p.waitForSelector('.tp.on', { timeout: 12000 });
      await p.click('.tp-x');
      await p.waitForTimeout(800);
      check('L  a close before the results leaves no bar and no web_pack_bar_shown', !(await p.$('.tp-bar')) && !events.some(e => e.event === 'web_pack_bar_shown'));
      await b.close();
    }
    {
      const { b, p } = await open(chromium, AND);
      await toBar(p);
      const r = await p.evaluate(() => { const a = document.querySelector('.tp-bar a'); return { t: a.querySelector('.tp-bar-get') && a.querySelector('.tp-bar-get').textContent, apple: !!a.querySelector('svg use[href="#i-apple"]') }; });
      check('L  Android: the bar says Get notified, no Apple mark', r.t === 'Get notified' && !r.apple, JSON.stringify(r));
      await p.click('.tp-bar a');
      check('L  Android: the bar tap opens the waitlist sheet', await p.waitForSelector('.aw-scrim.on', { timeout: 3000 }).then(() => true, () => false));
      await b.close();
    }
    {
      const TT = IOS + ' musical_ly_36.0.0 BytedanceWebview/d8a21c6';
      const before = storeL.length;
      const { b, p } = await open(chromium, TT, watchL);
      await toBar(p);
      await p.click('.tp-bar a');
      const ok = await p.waitForSelector('.tt-hold.on', { timeout: 3000 }).then(() => true, () => false);
      check('L  TikTok: the bar opens the hold sheet with ct=packbar', ok && /[?&]ct=packbar(&|$)/.test(await p.evaluate(() => document.querySelector('.tt-go').href)) && storeL.length === before);
      await b.close();
    }
    {
      const { b, p, events } = await open(chromium, IOS, watchL);
      await p.goto(BASE + '?app=packbar', { waitUntil: 'commit' });
      await p.waitForTimeout(1500);
      check('L  Safari: ?app=packbar goes for the store with ct=packbar', storeL.some(u => /ct=packbar&/.test(u)), storeL.slice(-1).join(''));
      const l = events.find(e => e.event === 'web_tiktok_handoff_landed');
      check('L  Safari: web_tiktok_handoff_landed carries ct=packbar', l && l.ct === 'packbar', l && l.ct);
      await b.close();
    }
  }
  { // N: tracking (11-25)
    const TT = IOS + ' musical_ly_36.0.0 BytedanceWebview/d8a21c6';
    const store = [];
    const watch = c => c.route('**/apps.apple.com/**', r => { store.push(r.request().url()); r.fulfill({ status: 204 }); });
    const opened = evs => evs.filter(e => e.event === 'web_app_store_opened');
    { // TikTok on the homepage: the source on every event, a real hold, then TikTok goes to the background
      const { b, c, p, events } = await open(chromium, TT, watch);
      await p.goto(BASE + '?nopack');
      await p.waitForSelector('.cta-row a.store', { state: 'attached' });
      await p.evaluate(() => document.querySelector('.cta-row a.store').click());
      await p.waitForSelector('.tt-hold.on', { timeout: 3000 });
      const cdp = await c.newCDPSession(p);
      const r = await p.evaluate(() => { const q = document.querySelector('.tt-go').getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
      await p.waitForTimeout(650);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.evaluate(() => {
        Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await p.waitForTimeout(300);
      const pv = events.find(e => e.event === 'web_pageview');
      const tap = events.find(e => e.event === 'web_store_tap');
      const hold = events.filter(e => e.event === 'web_tiktok_hold');
      const left = events.filter(e => e.event === 'web_tiktok_hold_left');
      check('N  TikTok: the pageview says entry_source tiktok, entry_path /', pv && pv.entry_source === 'tiktok' && pv.entry_path === '/', pv && pv.entry_source + ' ' + pv.entry_path);
      check('N  TikTok: every event carries the same entry_source', events.length > 3 && events.every(e => e.entry_source === 'tiktok'), [...new Set(events.map(e => e.event + ':' + e.entry_source))].join(' '));
      check('N  TikTok: the store tap sends no App Store arrival (the sheet holds it)', tap && tap.ct === 'home' && !opened(events).some(e => e.via === 'tap'));
      check('N  TikTok: a hold sends web_tiktok_hold once, with the ct', hold.length === 1 && hold[0].ct === 'home', JSON.stringify(hold.map(e => e.ct)));
      check('N  TikTok: leaving after the hold sends web_tiktok_hold_left and web_app_store_opened via hold, ct home',
        left.length === 1 && opened(events).length === 1 && opened(events)[0].via === 'hold' && opened(events)[0].ct === 'home' && opened(events)[0]._id === pv._id,
        JSON.stringify(opened(events).map(e => [e.via, e.ct])));
      check('N  TikTok: a hold opens nothing by itself', !store.length, store.join(' '));
      await b.close();
    }
    { // Safari, tagged link: the tag is the source and the ct tag, kept on the next page of the tab
      store.length = 0;
      const { b, p, events } = await open(chromium, IOS, watch);
      await p.goto(BASE + 'privacy.html?utm_source=Discord'); // the local server has no /privacy rewrite
      await p.goto(BASE + '?nopack');
      await p.waitForSelector('.cta-row a.store', { state: 'attached' });
      await p.evaluate(() => document.querySelector('.cta-row a.store').click());
      await p.waitForTimeout(600);
      const pvs = events.filter(e => e.event === 'web_pageview');
      const o = opened(events);
      check('N  Safari: ?utm_source= is the source, kept on the next page with the first path', pvs.length === 2 && pvs.every(e => e.entry_source === 'utm:discord' && e.entry_path === '/privacy.html' && e._id === pvs[0]._id), JSON.stringify(pvs.map(e => [e.path, e.entry_source, e.entry_path])));
      check('N  Safari: a tap on the next page keeps the tag in its ct and is the arrival (via tap, ct home-discord)', o.length === 1 && o[0].via === 'tap' && o[0].ct === 'home-discord' && store.some(u => /ct=home-discord&/.test(u)), JSON.stringify(o.map(e => [e.via, e.ct])) + ' ' + store.join(' '));
      await b.close();
    }
    { // a creator page in Safari: its source, and a badge tap is the arrival with the creator's ct
      const { b, p, events } = await open(chromium, IOS, watch);
      await p.goto(BASE + 'go/sampark/');
      await p.waitForSelector('a.badge', { state: 'attached' });
      await p.evaluate(() => document.querySelector('a.badge').click());
      await p.waitForTimeout(600);
      const pv = events.find(e => e.event === 'web_pageview');
      const o = opened(events);
      check('N  creator page: entry_source go/sampark', pv && pv.entry_source === 'go/sampark' && pv.entry_path === '/go/sampark/', pv && pv.entry_source);
      check('N  creator page: a badge tap sends web_app_store_opened with ct c-SAMPARK', o.length === 1 && o[0].ct === 'c-SAMPARK' && o[0].via === 'tap', JSON.stringify(o.map(e => [e.via, e.ct])));
      await b.close();
    }
    { // /go/reddit/ in Safari jumps by itself: the jump is the arrival
      store.length = 0;
      const { b, p, events } = await open(chromium, IOS, watch);
      await p.goto(BASE + 'go/reddit/').catch(() => {});
      await p.waitForTimeout(1500);
      const o = opened(events);
      check('N  /go/reddit/: the redirect sends web_app_store_opened via redirect, ct reddit, source go/reddit', o.length === 1 && o[0].via === 'redirect' && o[0].ct === 'reddit' && o[0].entry_source === 'go/reddit' && store.some(u => /ct=reddit&/.test(u)), JSON.stringify(o.map(e => [e.via, e.ct, e.entry_source])));
      await b.close();
    }
    { // a computer on /go/reddit/: the jump is Apple's web page, not an arrival; Android taps never are
      const DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
      const { b, p, events } = await open(chromium, DESK, watch);
      await p.goto(BASE + 'go/reddit/').catch(() => {});
      await p.waitForTimeout(1200);
      check('N  computer: a /go jump is not an App Store arrival', !opened(events).length);
      await b.close();
      const a = await open(chromium, AND);
      await a.p.goto(BASE + '?nopack');
      await a.p.waitForSelector('.cta-row a.store', { state: 'attached' });
      await a.p.evaluate(() => document.querySelector('.cta-row a.store').click());
      await a.p.waitForTimeout(500);
      check('N  Android: a store tap opens the waitlist, not an App Store arrival', !opened(a.events).length && a.events.some(e => e.event === 'web_android_sheet_shown' && e.entry_source === 'direct'), a.events.map(e => e.event).join(' '));
      await a.b.close();
    }
    { // the old TikTok Safari landing: the arrival via handoff, same id
      const { b, p, events } = await open(chromium, IOS, watch);
      await p.goto(BASE + '?app=home&v=web-abc123').catch(() => {});
      await p.waitForTimeout(1500);
      const o = opened(events);
      check('N  old handoff: web_app_store_opened via handoff, the passed id, source tiktok-handoff', o.length === 1 && o[0].via === 'handoff' && o[0]._id === 'web-abc123' && o[0].entry_source === 'tiktok-handoff', JSON.stringify(o.map(e => [e.via, e._id, e.entry_source])));
      await b.close();
    }
    { // WebKit: events reach the route (so none reach the real PostHog)
      const { b, p, events } = await open(webkit, IOS);
      await p.goto(BASE + '?nopack');
      await p.waitForTimeout(800);
      check('N  WebKit: the pageview is caught locally, not sent to PostHog', events.some(e => e.event === 'web_pageview' && e.host === '127.0.0.1'));
      await b.close();
    }
  }
  { // P-V: public binder pages (11-26)
    const TT = IOS + ' musical_ly_36.0.0 BytedanceWebview/d8a21c6';
    const card = (n, extra) => ({ name: 'Card ' + n, image: 'https://images.scrydex.com/pokemon/sv8pt5-' + n + '/small', set: 'Prismatic Evolutions', number: String(n), missing: false, value: null, ...extra });
    const nine = (from, holes = []) => Array.from({ length: 9 }, (_, i) => holes.includes(i) ? null : card(from + i));
    const FIX = {
      'pinkmorpeko/eevee-collection': {
        owner: { name: 'PinkMorpeko', handle: 'pinkmorpeko', avatar: null },
        binder: { name: 'Eevee Collection', slug: 'eevee-collection', kind: 'custom', color: 'bubblegum', logo: null, cards: 48, total: null, pageCount: 6, hearts: 128, value: null },
        pages: [{ index: 0, pockets: nine(1) }, { index: 2, pockets: nine(10, [7, 8]) }, { index: 5, pockets: nine(20, [1, 2, 3, 4, 5, 6, 7, 8]) }],
        creator: { code: 'PINK' },
      },
      'devpatel/151': {
        owner: { name: 'Dev Patel', handle: 'devpatel', avatar: 'https://example.com/a.png' },
        binder: { name: '151', slug: '151', kind: 'master', color: 'green', logo: null, cards: 84, total: 207, pageCount: 23, hearts: 0, value: 1234.56 },
        pages: [{ index: 0, pockets: nine(1).map((p, i) => ({ ...p, missing: i % 2 === 1, value: 12.34 })) }, { index: 1, pockets: nine(10) }],
        creator: null,
      },
      'evil_user/xss': {
        owner: { name: '<img src=x onerror="window.__xss=1">', handle: 'evil_user', avatar: 'javascript:alert(1)' },
        binder: { name: '<b>bold</b><img src=x onerror="window.__xss=2">', slug: 'xss', kind: 'custom', color: 'constructor', logo: null, cards: 1, total: null, pageCount: 1, hearts: 0, value: null },
        pages: [{ index: 0, pockets: [{ name: '<img src=x onerror="window.__xss=3">', image: '"><img src=x onerror="window.__xss=4">', set: '<i>s</i>', number: '1', missing: false, value: null }, null, null, null, null, null, null, null, null] }],
        creator: { code: '<script>' },
      },
    };
    const PNG = await readFile(join(SITE, 'go/icon.png'));
    const asked = [];
    const binder = (extra) => async c => {
      await c.route('**/functions/v1/public-binder**', r => {
        const u = new URL(r.request().url());
        asked.push(u.search);
        const key = u.searchParams.get('handle') + '/' + u.searchParams.get('slug');
        if (key === 'broken/net') return r.abort();
        const hit = FIX[key];
        r.fulfill({ status: hit ? 200 : 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(hit || { error: 'not_found' }) });
      });
      await c.route('**/images.scrydex.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
      await c.route('**/example.com/**', r => r.fulfill({ status: 404 }));
      if (extra) await extra(c);
    };
    const store = [];
    const watch = c => c.route('**/apps.apple.com/**', r => { store.push(r.request().url()); r.fulfill({ status: 204 }); });
    const swipe = (p, dx) => p.evaluate(dx => {
      const el = document.querySelector('#bp-spread'), r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const t = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(x)], changedTouches: [t(x)] }));
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(x + dx)] }));
    }, dx);
    const count = p => p.textContent('.bp-count');

    { // P: a custom binder renders, flips, swipes, keys, opens a card
      const { b, p, events } = await open(chromium, IOS, binder(watch));
      await p.goto(BASE + '@PinkMorpeko/Eevee-Collection');
      const shown = await p.waitForSelector('.bp-name', { timeout: 6000 }).then(() => true, () => false);
      check('P  binder: a capitalised address lands on the lower case one and renders', shown && /\/@pinkmorpeko\/eevee-collection$/.test(p.url()), p.url());
      check('P  binder: name, owner and title', (await p.textContent('.bp-name')) === 'Eevee Collection' && (await p.textContent('.bp-owner')) === 'PinkMorpeko' && (await p.title()) === 'Eevee Collection by PinkMorpeko · Tracka', await p.title());
      check('P  binder: the stat line', (await p.textContent('.bp-stat')) === '48 cards · 6 pages · ♥ 128', await p.textContent('.bp-stat'));
      check('P  binder: 9 pockets, 9 cards on page 1, the 404 body gone', (await p.$$('.bp-pk')).length === 9 && (await p.$$('.bp-pk img')).length === 9 && !(await p.$('main.lost')) && !(await p.$('header.nav')));
      check('P  binder: still noindex, dark', await p.evaluate(() => document.querySelector('meta[name=robots]').content === 'noindex' && getComputedStyle(document.body).backgroundColor === 'rgb(8, 8, 10)'));
      const c1 = await count(p);
      await p.click('.bp-next');
      const c2 = await count(p);
      check('P  binder: the flipper goes 1 / 3 to 2 / 3, empty pockets stay sleeves', c1 === '1 / 3' && c2 === '2 / 3' && (await p.$$('.bp-pk img')).length === 7, c1 + ' → ' + c2);
      await swipe(p, -120);
      const c3 = await count(p);
      await swipe(p, 120);
      const c4 = await count(p);
      check('P  binder: a swipe left turns on, a swipe right turns back', c3 === '3 / 3' && c4 === '2 / 3', c3 + ' ' + c4);
      await p.keyboard.press('ArrowRight');
      const c5 = await count(p);
      check('P  binder: the arrow keys turn; the last page disables ›', c5 === '3 / 3' && await p.isDisabled('.bp-next'), c5);
      await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
      check('P  binder: back on page 1, ‹ disabled', (await count(p)) === '1 / 3' && await p.isDisabled('.bp-prev'));
      await p.waitForTimeout(450); // past the swipe's guard on taps
      await p.click('.bp-pk >> nth=4');
      const lb = await p.waitForSelector('.bp-lb.on', { timeout: 2000 }).then(() => true, () => false);
      const cap = lb ? await p.textContent('.bp-lb figcaption') : '';
      check('P  binder: a pocket opens the card, name and Set · #number', lb && /Card 5/.test(cap) && /Prismatic Evolutions · #5/.test(cap) && !/\$/.test(cap), cap);
      await p.keyboard.press('Escape');
      check('P  binder: Esc closes the card and the arrows still turn', await p.evaluate(() => document.querySelector('.bp-lb').hidden) && (await p.keyboard.press('ArrowRight'), (await count(p)) === '2 / 3'));
      const v = events.filter(e => e.event === 'web_binder_view');
      check('P  binder: one web_binder_view with handle, slug, kind, creator', v.length === 1 && v[0].handle === 'pinkmorpeko' && v[0].slug === 'eevee-collection' && v[0].kind === 'custom' && v[0].creator === 'PINK', JSON.stringify(v.map(e => [e.handle, e.slug, e.kind, e.creator])));
      check('P  binder: the function is asked for handle and slug', asked.some(q => q === '?handle=pinkmorpeko&slug=eevee-collection'), asked.join(' '));
      const fit = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, bar: document.querySelector('.bp-bar').getBoundingClientRect().width }));
      check('P  binder: no sideways scroll at 390, the bar 12 px in from each side (378 at most)', fit.over <= 0 && Math.round(fit.bar) === 366, JSON.stringify(fit));
      await p.setViewportSize({ width: 1280, height: 900 });
      await p.waitForTimeout(150);
      const desk = await p.evaluate(() => { const m = document.querySelector('.bp-main').getBoundingClientRect(), s = document.querySelector('#bp-spread').getBoundingClientRect(); return { w: m.width, mid: m.x + m.width / 2, sw: s.width, over: document.documentElement.scrollWidth - window.innerWidth }; });
      check('P  binder: desktop keeps it a centred column', desk.w <= 440 && Math.abs(desk.mid - 640) < 2 && desk.sw < 440 && desk.over <= 0, JSON.stringify(desk));
      await b.close();
    }
    { // P on WebKit (Safari's engine): it renders the same
      const { b, p } = await open(webkit, IOS, binder());
      await p.goto(BASE + '@pinkmorpeko/eevee-collection');
      const ok = await p.waitForSelector('.bp-pk img', { timeout: 6000 }).then(() => true, () => false);
      check('P  WebKit: the binder renders', ok && (await count(p)) === '1 / 3');
      await b.close();
    }
    { // Q: the bar's link and code
      store.length = 0;
      const { b, p, events } = await open(chromium, IOS, binder(watch));
      await p.goto(BASE + '@pinkmorpeko/eevee-collection');
      await p.waitForSelector('.bp-bar');
      const href = await p.getAttribute('.bp-get', 'href');
      check('Q  creator: the code box says PINK, Get Tracka has ct=c-PINK', (await p.textContent('#code b')) === 'PINK' && /CREATOR CODE/.test(await p.textContent('#code small')) && /[?&]ct=c-PINK&mt=8$/.test(href) && !(await p.$('.bp-app')), href);
      await p.click('.bp-get').catch(() => {});
      await p.waitForTimeout(300);
      const tap = events.find(e => e.event === 'web_store_tap');
      check('Q  creator: the tap is counted with ct c-PINK', tap && tap.ct === 'c-PINK', tap && tap.ct);
      await b.close();
    }
    {
      const { b, p } = await open(chromium, IOS, binder());
      await p.goto(BASE + '@devpatel/151');
      await p.waitForSelector('.bp-bar');
      const href = await p.getAttribute('.bp-get', 'href');
      check('Q  no creator: Tracka / Free on iPhone, ct=binder, no code box', !(await p.$('#code')) && /Free on iPhone/.test(await p.textContent('.bp-app')) && /[?&]ct=binder&mt=8$/.test(href), href);
      await b.close();
    }
    {
      const { b, p } = await open(chromium, AND, binder());
      await p.goto(BASE + '@devpatel/151');
      await p.waitForSelector('.bp-bar');
      await p.click('.bp-get');
      const ok = await p.waitForSelector('.aw-scrim.on', { timeout: 2000 }).then(() => true, () => false);
      check('Q  Android: Get notified opens the waitlist', ok && (await p.textContent('.bp-get')) === 'Get notified' && /iPhone only/.test(await p.textContent('.bp-app')));
      await b.close();
    }
    { // R: TikTok
      store.length = 0;
      const { b, p } = await open(chromium, TT, binder(watch));
      await p.goto(BASE + '@pinkmorpeko/eevee-collection');
      await p.waitForSelector('.bp-get');
      const before = p.url();
      check('R  TikTok: no pinned bar on a binder page', !(await p.$('.tt-bar')));
      await p.evaluate(() => document.querySelector('.bp-get').click());
      const ok = await p.waitForSelector('.tt-hold.on .tt-code b', { timeout: 3000 }).then(() => true, () => false);
      check('R  TikTok: Get Tracka opens the dark hold sheet with PINK', ok && (await p.textContent('.tt-hold .tt-code b')).trim() === 'PINK' && !(await p.$('.tt-hold.tt-light')));
      check('R  TikTok: the held button carries ct=c-PINK', /[?&]ct=c-PINK(&|$)/.test(await p.evaluate(() => document.querySelector('.tt-go').href)));
      check('R  TikTok: no navigation, no store load', p.url() === before && !store.length, p.url() + ' ' + store.join(' '));
      await b.close();
    }
    {
      const { b, p, events } = await open(chromium, TT, binder(watch));
      await p.goto(BASE + '@devpatel/151');
      await p.waitForSelector('.bp-get');
      await p.evaluate(() => document.querySelector('.bp-get').click());
      const ok = await p.waitForSelector('.tt-hold.on', { timeout: 3000 }).then(() => true, () => false);
      const shown = events.find(e => e.event === 'web_tiktok_sheet_shown');
      check('R  TikTok, no creator: the plain sheet with ct=binder, page binder', ok && !(await p.$('.tt-hold .tt-code')) && /[?&]ct=binder(&|$)/.test(await p.evaluate(() => document.querySelector('.tt-go').href)) && shown && shown.page === 'binder', shown && shown.page);
      await b.close();
    }
    { // S: a miss
      for (const [label, addr] of [['not_found', '@nobody/eevee'], ['network error', '@broken/net']]) {
        const { b, p } = await open(chromium, IOS, binder());
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(BASE + addr);
        const ok = await p.waitForSelector('.bp-miss', { timeout: 6000 }).then(() => true, () => false);
        const st = await p.evaluate(() => ({ h: document.querySelector('.bp-miss h1')?.textContent, bg: getComputedStyle(document.body).backgroundColor, lost: !!document.querySelector('main.lost'), href: document.querySelector('.bp-get')?.getAttribute('href') }));
        check('S  ' + label + ': the dark miss state with the bar, ct=binder', ok && st.h === 'This binder isn’t public' && st.bg === 'rgb(8, 8, 10)' && !st.lost && /[?&]ct=binder&/.test(st.href || '') && !errs.length, JSON.stringify(st) + ' ' + errs.join(' '));
        await b.close();
      }
    }
    { // T: every other unknown address is the plain 404, no binder script
      for (const addr of ['nope', '@ab/x', '@pinkmorpeko', '@pinkmorpeko/eevee/extra', 'go/Nope-At-All']) {
        const { b, p } = await open(chromium, IOS, binder());
        const scripts = [];
        p.on('request', r => { if (/binder\.(js|css)/.test(r.url())) scripts.push(r.url()); });
        await p.goto(BASE + addr);
        await p.waitForTimeout(400);
        const st = await p.evaluate(() => ({ h: document.querySelector('main.lost h1')?.textContent, bp: document.documentElement.classList.contains('bp'), vis: !!document.querySelector('main.lost')?.offsetHeight }));
        check('T  /' + addr + ' is still the plain 404', /^Nothing here/.test(st.h || '') && !st.bp && st.vis && !scripts.length, JSON.stringify(st) + ' ' + scripts.join(' '));
        await b.close();
      }
    }
    { // U: user text stays text
      const { b, p } = await open(chromium, IOS, binder());
      await p.goto(BASE + '@evil_user/xss');
      await p.waitForSelector('.bp-name', { timeout: 6000 });
      await p.click('.bp-pk >> nth=0');
      await p.waitForTimeout(400);
      const st = await p.evaluate(() => ({ xss: window.__xss, name: document.querySelector('.bp-name').textContent, owner: document.querySelector('.bp-owner').textContent, imgs: document.querySelectorAll('.bp-head img, .bp-name *, .bp-owner *, .bp-lb figcaption img, .bp-lb figcaption i').length, code: !!document.querySelector('#code'), ct: document.querySelector('.bp-get').getAttribute('href') }));
      check('U  names and card text stay text, nothing runs', st.xss === undefined && st.name.startsWith('<b>bold</b><img') && st.owner.startsWith('<img') && st.imgs === 0, JSON.stringify(st));
      check('U  a bad creator code and a bad avatar are dropped', !st.code && /ct=binder&/.test(st.ct));
      check('U  the title is plain text', (await p.title()).startsWith('<b>bold</b>'));
      await b.close();
    }
    { // V: values only when sent; a master binder's missing cards are ghosted
      const { b, p } = await open(chromium, IOS, binder());
      await p.goto(BASE + '@devpatel/151');
      await p.waitForSelector('.bp-name', { timeout: 6000 });
      const stat = await p.textContent('.bp-stat');
      check('V  master: owned/total, pages, the value, no hearts at 0', stat === '84/207 cards · 23 pages · $1,235', stat);
      const ghost = await p.evaluate(() => { const g = document.querySelectorAll('.bp-pk.bp-gh img'); const s = g[0] && getComputedStyle(g[0]); return { n: g.length, op: s && s.opacity, f: s && s.filter, full: getComputedStyle(document.querySelector('.bp-pk:not(.bp-gh) img')).opacity }; });
      check('V  master: missing cards ghosted (grayscale, faded), owned in full', ghost.n === 4 && Math.abs(+ghost.op - 0.28) < 0.01 && /grayscale/.test(ghost.f) && ghost.full === '1', JSON.stringify(ghost));
      await p.click('.bp-pk >> nth=0');
      await p.waitForSelector('.bp-lb.on');
      check('V  master: the card shows its value', /\$12\.34/.test(await p.textContent('.bp-lb figcaption')));
      const cover = await p.evaluate(() => getComputedStyle(document.querySelector('.bp-binder > div')).backgroundColor);
      check('V  master: a legacy color key maps (green → deep teal)', cover === 'rgb(47, 111, 102)', cover);
      await b.close();
    }
    {
      const { b, p } = await open(chromium, IOS, binder());
      await p.goto(BASE + '@pinkmorpeko/eevee-collection');
      await p.waitForSelector('.bp-name', { timeout: 6000 });
      check('V  custom with values off: no $ anywhere on the page', !/\$/.test(await p.textContent('#bp-root')));
      await b.close();
    }
  }
} finally {
  server.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
