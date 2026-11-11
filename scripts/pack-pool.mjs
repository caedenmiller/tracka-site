#!/usr/bin/env node
// Rebuilds the first-visit pack's card pool (pack/<set>.json) and, with
// --images, its pictures (cards/pack/<set>/*.webp). Reads our own catalog
// mirror and price table in Supabase (read only, the service key from the
// app's gitignored .env.scrydex, never printed); pictures from Scrydex's image
// CDN. No Scrydex API calls, no credits. Needs cwebp (brew install webp).
//   node scripts/pack-pool.mjs me6            prices only (refresh)
//   node scripts/pack-pool.mjs me6 --images   prices and pictures
// A new set also needs pack/start.js's json path and `set` prop changed.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = '/Users/caedenmiller/projects/PokemonTCG App';
const SITE = new URL('..', import.meta.url).pathname;
const [SET, flag] = process.argv.slice(2);
if (!SET) { console.error('usage: node scripts/pack-pool.mjs <set_id> [--images]'); process.exit(1); }
function envFile(p) { const o = {}; try { for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } } catch {} return o; }
const s = envFile(`${APP}/.env.scrydex`), a = envFile(`${APP}/.env`);
const URL_ = s.SUPABASE_URL || a.EXPO_PUBLIC_SUPABASE_URL, KEY = s.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the app .env.scrydex'); process.exit(1); }
async function get(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const ex = await get(`catalog_expansions?select=expansion_id,data->>name&expansion_id=eq.${SET}`);
if (!ex.length) throw new Error('no such set ' + SET);
const rows = await get(`catalog_cards?select=scrydex_id,card_data&expansion_id=eq.${SET}&limit=1000`);
const ids = rows.map((c) => c.scrydex_id);
const prices = [];
for (let i = 0; i < ids.length; i += 80) prices.push(...(await get(`card_prices?select=scrydex_id,variant_key,prices&scrydex_id=in.(${ids.slice(i, i + 80).join(',')})`)));
// The app's pack_card_market: raw NM USD market, a standard copy.
function market(id, variant) {
  const row = prices.find((p) => p.scrydex_id === id && p.variant_key === (variant ?? ''));
  const p = row && Array.isArray(row.prices) && row.prices.find((p) => p.type === 'raw' && p.condition === 'NM' && p.currency === 'USD' && String(p.is_perfect) !== 'true' && String(p.is_signed) !== 'true' && String(p.is_error) !== 'true' && typeof p.market === 'number' && p.market > 0);
  return p ? Math.round(p.market * 100) / 100 : null;
}
const HITS = ['Common', 'Uncommon'];
const cards = rows.map((c) => {
  const d = c.card_data, variants = (d.variants || []).map((v) => v.name);
  const std = variants.includes('normal') ? 'normal' : variants.includes('holofoil') ? 'holofoil' : variants[0] ?? null;
  const printing = !HITS.includes(d.rarity) && variants.includes('holofoil') ? 'holofoil' : std;
  const o = { id: c.scrydex_id, name: d.name, rarity: d.rarity, price: market(c.scrydex_id, printing), _n: parseInt(d.number, 10) || 0 };
  const img = (d.images || []).slice().sort((x, y) => (y.type === 'front') - (x.type === 'front'))[0] || {};
  o._img = img.large || img.medium || img.small;
  if (variants.includes('reverseHolofoil')) { o.rev = true; o.priceRev = market(c.scrydex_id, 'reverseHolofoil'); }
  return o;
}).sort((x, y) => x._n - y._n);
if (flag === '--images') {
  const dir = mkdtempSync(join(tmpdir(), 'pack-img-'));
  const out = join(SITE, 'cards/pack', SET);
  mkdirSync(out, { recursive: true });
  for (const c of cards) {
    const r = await fetch(c._img);
    if (!r.ok) { console.error('image failed', c.id, r.status); continue; }
    const f = join(dir, c.id + '.png');
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    execFileSync('cwebp', ['-quiet', '-resize', '500', '0', '-q', '78', '-alpha_q', '80', f, '-o', join(out, c.id + '.webp')]);
  }
  const lr = await fetch(`https://images.scrydex.com/pokemon/${SET}-logo/logo`);
  writeFileSync(join(dir, 'logo.png'), Buffer.from(await lr.arrayBuffer()));
  execFileSync('cwebp', ['-quiet', '-q', '85', join(dir, 'logo.png'), '-o', join(SITE, 'cards/pack', SET + '-logo.webp')]);
}
const json = {
  set: SET, name: ex[0].name, logo: `/cards/pack/${SET}-logo.webp`, images: `/cards/pack/${SET}/`,
  prices_on: new Date().toISOString().slice(0, 10),
  cards: cards.map(({ _n, _img, ...c }) => c),
};
writeFileSync(join(SITE, 'pack', SET + '.json'), JSON.stringify(json));
console.log(`${SET}: ${cards.length} cards, ${cards.filter((c) => c.price !== null).length} priced`);
