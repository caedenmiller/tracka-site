#!/usr/bin/env node
// Frame timing through a whole ?pack=hyper opening (site-pack-desktop, 11-11): missed frames per phase
// (entrance, idle, tear, cards, climb, results) per engine and size. Run from a folder with Playwright:
//   node ~/projects/tracka-site-pack/scripts/pack-perf.mjs ~/projects/tracka-site-pack <label> [chromium,webkit] [d1440,d1920,m390] [runs]
// Writes perf/out/<label>.json in the current folder. Headless rendering is software, so read it as before/after, not absolute.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
const { chromium, webkit } = createRequire(join(process.cwd(), 'x.js'))('playwright');
const [SITE, LABEL, ENG = 'chromium,webkit', SZ = 'd1440,d1920,m390', RUNS = '2'] = process.argv.slice(2);
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
const SIZES = {
  d1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  d1920: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
  m390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: IOS },
};
const out = {};
for (const en of ENG.split(',')) {
  const engine = en === 'webkit' ? webkit : chromium;
  for (const sz of SZ.split(',')) {
    for (let run = 0; run < +RUNS; run++) {
      const b = await engine.launch();
      const opts = { ...SIZES[sz] };
      if (en === 'chromium' && sz === 'm390') opts.isMobile = true;
      const c = await b.newContext(opts);
      await c.route('**/us.i.posthog.com/**', r => r.fulfill({ status: 200, body: '1' }));
      await c.route('**/functions/v1/**', r => r.fulfill({ status: 200, body: '{}' }));
      const p = await c.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(() => {
        window.__fr = []; window.__mk = [];
        const loop = t => { window.__fr.push(t); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      await p.goto(BASE + '?pack=hyper', { waitUntil: 'load' });
      await p.waitForSelector('.tp', { state: 'attached', timeout: 20000 });
      const mark = n => p.evaluate(n => window.__mk.push([n, performance.now()]), n);
      await mark('entrance');
      await p.waitForSelector('.tp.on', { timeout: 5000 });
      await p.waitForTimeout(1400);
      await mark('idle');
      await p.waitForTimeout(1200);
      await mark('tear');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1800);
      await mark('cards');
      for (let i = 0; i < 9; i++) {
        await p.keyboard.press('Enter');
        await p.waitForTimeout(i === 0 ? 450 : 750);
      }
      await p.keyboard.press('Enter'); // fling 9 -> card ten
      await p.waitForTimeout(700);
      await mark('climb');
      await p.keyboard.press('Enter');
      await p.waitForSelector('.tp-big', { timeout: 30000 });
      await p.waitForTimeout(2200);
      await mark('results');
      await p.keyboard.press('Enter');
      await p.waitForSelector('.tp-store', { timeout: 5000 });
      await p.waitForTimeout(1500);
      await mark('end');
      const data = await p.evaluate(() => ({ fr: window.__fr, mk: window.__mk }));
      const phases = {};
      for (let i = 0; i < data.mk.length - 1; i++) {
        const [name, t0] = data.mk[i], t1 = data.mk[i + 1][1];
        const ts = data.fr.filter(t => t >= t0 && t <= t1);
        const d = ts.slice(1).map((t, j) => t - ts[j]);
        const missed = d.reduce((s, x) => s + Math.max(0, Math.round(x / 16.667) - 1), 0);
        const sorted = [...d].sort((a, b) => a - b);
        phases[name] = { ms: Math.round(t1 - t0), frames: d.length, missed, long: d.filter(x => x > 25).length, p95: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1), max: +(sorted[sorted.length - 1] || 0).toFixed(1) };
      }
      const key = `${en}/${sz}`;
      (out[key] = out[key] || []).push(phases);
      console.log(key, 'run', run, errs.length ? 'ERRORS ' + errs.join('; ') : '', Object.entries(phases).map(([k, v]) => `${k}: ${v.frames}f missed ${v.missed} p95 ${v.p95} max ${v.max}`).join(' | '));
      await b.close();
    }
  }
}
await mkdir('perf/out', { recursive: true });
await writeFile(`perf/out/${LABEL}.json`, JSON.stringify(out, null, 1));
server.close();
